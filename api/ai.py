import json
import os
import time
from collections import defaultdict, deque
from flask import Flask, jsonify, request
from google import genai
from google.genai import types

app = Flask(__name__)

MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite')
MAX_FILE_BYTES = 3_500_000
MAX_SOURCE_CHARS = 300_000
MAX_PROMPT_CHARS = 2_000
RATE_WINDOW_SECONDS = 600
RATE_MAX_REQUESTS = 12
_hits = defaultdict(deque)

ALLOWED_MODES = {
    'ask', 'summarize', 'translate', 'tables', 'ocr_cleanup',
    'research', 'invoice', 'cv', 'contract', 'pii', 'filename'
}
JSON_MODES = {'tables', 'invoice', 'cv', 'pii', 'filename'}
ALLOWED_MIME = {'application/pdf', 'image/png', 'image/jpeg', 'image/webp'}


def _cors_same_origin_ok():
    origin = (request.headers.get('Origin') or '').rstrip('/')
    if not origin:
        return True
    own = f'{request.scheme}://{request.host}'.rstrip('/')
    return origin == own or origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:')


def _client_ip():
    fwd = request.headers.get('x-forwarded-for', '')
    return (fwd.split(',')[0].strip() if fwd else request.remote_addr) or 'unknown'


def _rate_limited():
    now = time.time(); q = _hits[_client_ip()]
    while q and now - q[0] > RATE_WINDOW_SECONDS: q.popleft()
    if len(q) >= RATE_MAX_REQUESTS: return True
    q.append(now); return False


def _response(payload, status=200):
    r = jsonify(payload); r.status_code = status
    r.headers['Cache-Control'] = 'no-store, max-age=0'
    r.headers['X-Content-Type-Options'] = 'nosniff'
    return r


def _health():
    return _response({'ok': True, 'configured': bool(os.getenv('GEMINI_API_KEY')), 'model': MODEL,
                      'maxUploadBytes': MAX_FILE_BYTES, 'modes': sorted(ALLOWED_MODES)})


@app.route('/', methods=['GET'])
@app.route('/api/ai', methods=['GET'])
def health(): return _health()


def _build_prompt(mode, form):
    language = (form.get('language') or 'Arabic').strip()[:60]
    if mode == 'ask':
        question = (form.get('question') or '').strip()[:MAX_PROMPT_CHARS]
        if not question: raise ValueError('اكتب السؤال أولاً.')
        return f'''You are DocMivo AI. Answer the user's question using ONLY the supplied document or extracted text.
If the answer is not supported by the source, say that clearly. Do not invent facts.
Answer in {language}. Refer to page/section only when the source makes that possible.
User question: {question}'''
    if mode == 'summarize':
        style = (form.get('style') or 'balanced').strip()
        styles = {'short':'a concise summary with 5-8 bullets','balanced':'a clear structured summary with headings, key points, and conclusions','study':'study notes with key concepts, definitions, important numbers, and a final revision checklist'}
        return f"Summarize the supplied document in {language} as {styles.get(style, styles['balanced'])}. Preserve important facts and numbers. Do not add information not present in the source."
    if mode == 'translate':
        target = (form.get('target') or 'Arabic').strip()[:60]
        return f'Translate the supplied document text into {target}. Preserve headings, bullets, numbering, names, dates and numbers. Do not summarize or add commentary.'
    if mode == 'tables':
        return '''Extract every meaningful table from the supplied document. Return STRICT JSON only:
{"tables":[{"title":"","headers":[""],"rows":[[""]],"notes":""}]}
Keep values faithful. Use empty strings for blank cells and never invent missing values.'''
    if mode == 'ocr_cleanup':
        return f'''Perform OCR/transcription on the supplied PDF/image, then conservatively clean obvious OCR errors.
Preserve names, identifiers, dates, numbers, punctuation, paragraph breaks and document order. Do not rewrite the meaning or invent missing content.
Return only the cleaned text in {language}.'''
    if mode == 'research':
        return f'''Analyze the supplied research paper in {language}. Use only the document. Structure the answer with:
1) research question/objective, 2) dataset/sample, 3) methodology, 4) main findings with numbers where available,
5) limitations stated by the authors, 6) practical/research implications, 7) key terms, 8) five verification questions.
Clearly label anything that is not explicitly stated as an inference.'''
    if mode == 'invoice':
        return '''Extract invoice/receipt information and return STRICT JSON only:
{"document_type":"invoice|receipt|other","vendor":"","invoice_number":"","date":"","currency":"","subtotal":"","tax":"","total":"","payment_method":"","items":[{"description":"","quantity":"","unit_price":"","amount":""}],"notes":""}
Use empty strings when fields are not present. Never calculate or invent a value unless the document explicitly provides enough information and label it in notes.'''
    if mode == 'cv':
        return '''Analyze the supplied CV/resume and return STRICT JSON only:
{"name":"","headline":"","contact":{"email":"","phone":"","location":""},"summary":"","skills":[],"experience":[{"company":"","role":"","start":"","end":"","highlights":[]}],"education":[{"institution":"","degree":"","start":"","end":""}],"certifications":[],"languages":[],"missing_or_unclear":[]}
Extract only what is supported by the document. Do not infer protected or sensitive traits.'''
    if mode == 'contract':
        return f'''Analyze the supplied contract in {language}. This is document analysis, not legal advice. Use only the source and list:
parties, effective/termination dates, payment terms, renewal, obligations by party, confidentiality, IP, liability/indemnity,
termination rights, governing law/jurisdiction if stated, notice requirements, deadlines, unusual/high-impact clauses, and missing/unclear items.
Quote no more than short clause fragments and always identify uncertainty.'''
    if mode == 'pii':
        return '''Detect personally identifiable or sensitive-looking strings in the supplied document. Return STRICT JSON only:
{"findings":[{"type":"name|email|phone|address|id_number|account_number|date_of_birth|other","text":"exact string","context":"short context","confidence":"high|medium|low"}],"notes":""}
Do not infer sensitive traits. Only report text actually present. This output is a review aid, not automatic redaction.'''
    if mode == 'filename':
        return '''Suggest a safe descriptive filename and title based only on the supplied document. Return STRICT JSON only:
{"filename":"lowercase-kebab-case.ext","title":"","keywords":[""],"reason":""}
Do not include personal IDs, full account numbers, or other sensitive identifiers in the suggested filename.'''
    raise ValueError('وضع AI غير معروف.')


def _infer_mime(storage):
    mt=(storage.mimetype or '').lower().strip(); name=(storage.filename or '').lower()
    if mt in ALLOWED_MIME:return mt
    if name.endswith('.pdf'):return 'application/pdf'
    if name.endswith('.png'):return 'image/png'
    if name.endswith(('.jpg','.jpeg')):return 'image/jpeg'
    if name.endswith('.webp'):return 'image/webp'
    return mt


def _signature_ok(raw, mime):
    if mime == 'application/pdf': return raw.startswith(b'%PDF')
    if mime == 'image/png': return raw.startswith(b'\x89PNG\r\n\x1a\n')
    if mime == 'image/jpeg': return raw.startswith(b'\xff\xd8\xff')
    if mime == 'image/webp': return len(raw)>12 and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'
    return False


def _upstream_error(exc):
    text=str(exc); low=text.lower()
    if '429' in text or 'quota' in low or 'resource_exhausted' in low:return 'تم الوصول إلى حد Gemini المجاني مؤقتًا. جرّب لاحقًا.',429
    if 'api key' in low or 'permission_denied' in low or '401' in text or '403' in text:return 'مفتاح Gemini غير صالح أو غير مفعّل على الخادم.',503
    if 'not found' in low and 'model' in low:return 'نموذج Gemini المحدد غير متاح لهذا المفتاح. راجع GEMINI_MODEL.',503
    return 'تعذر إكمال طلب AI الآن. جرّب مرة أخرى بعد قليل.',502


@app.route('/', methods=['POST'])
@app.route('/api/ai', methods=['POST'])
def ai():
    if not _cors_same_origin_ok():return _response({'ok':False,'error':'Origin غير مسموح.'},403)
    if _rate_limited():return _response({'ok':False,'error':'طلبات كثيرة في وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى.'},429)
    api_key=os.getenv('GEMINI_API_KEY')
    if not api_key:return _response({'ok':False,'error':'DocMivo AI لم يتم تفعيله على الخادم بعد.'},503)
    form=request.form; mode=(form.get('mode') or '').strip()
    if mode not in ALLOWED_MODES:return _response({'ok':False,'error':'أداة AI غير معروفة.'},400)
    if (form.get('consent') or '').lower() not in {'1','true','yes','on'}:return _response({'ok':False,'error':'يلزم تأكيد الموافقة على إرسال المحتوى إلى Google Gemini.'},400)
    try: prompt=_build_prompt(mode,form)
    except ValueError as exc:return _response({'ok':False,'error':str(exc)},400)

    source_text=(form.get('source_text') or '').strip(); upload=request.files.get('file'); contents=[]
    if upload and upload.filename:
        mime=_infer_mime(upload)
        if mime not in ALLOWED_MIME:return _response({'ok':False,'error':'صيغة الملف غير مدعومة في DocMivo AI.'},415)
        raw=upload.read(MAX_FILE_BYTES+1)
        if len(raw)>MAX_FILE_BYTES:return _response({'ok':False,'error':'الملف أكبر من حد AI الحالي (حوالي 3.5 MB). استخدم PDF أصغر أو استخراج النص المحلي.'},413)
        if not raw:return _response({'ok':False,'error':'الملف فارغ.'},400)
        if not _signature_ok(raw,mime):return _response({'ok':False,'error':'محتوى الملف لا يطابق الصيغة المعلنة.'},415)
        contents.append(types.Part.from_bytes(data=raw,mime_type=mime))
    elif source_text:
        contents.append('SOURCE TEXT (extracted locally in the browser):\n\n'+source_text[:MAX_SOURCE_CHARS])
    else:return _response({'ok':False,'error':'اختر ملف PDF/صورة أولًا.'},400)

    contents.append(prompt)
    config_kwargs={'temperature':0.15,'max_output_tokens':4096}
    if mode in JSON_MODES:config_kwargs['response_mime_type']='application/json'
    try:
        client=genai.Client(api_key=api_key)
        response=client.models.generate_content(model=MODEL,contents=contents,config=types.GenerateContentConfig(**config_kwargs))
        text=(response.text or '').strip()
        if not text:return _response({'ok':False,'error':'Gemini لم يُرجع نتيجة قابلة للعرض.'},502)
        if mode in JSON_MODES:
            try:data=json.loads(text)
            except Exception:data={'raw':text}
            return _response({'ok':True,'mode':mode,'model':MODEL,'format':'json','data':data})
        return _response({'ok':True,'mode':mode,'model':MODEL,'format':'text','result':text})
    except Exception as exc:
        message,code=_upstream_error(exc);return _response({'ok':False,'error':message},code)

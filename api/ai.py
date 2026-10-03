import json
import os
import time
from collections import defaultdict, deque
from flask import Flask, jsonify, request
from google import genai
from google.genai import types

app = Flask(__name__)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
MAX_FILE_BYTES = 3_500_000  # Stay below Vercel's 4.5 MB request-body ceiling incl. multipart overhead.
MAX_SOURCE_CHARS = 300_000
MAX_PROMPT_CHARS = 2_000
RATE_WINDOW_SECONDS = 600
RATE_MAX_REQUESTS = 12
_hits = defaultdict(deque)

ALLOWED_MODES = {"ask", "summarize", "translate", "tables", "ocr_cleanup"}
ALLOWED_MIME = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
}

def _cors_same_origin_ok():
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if not origin:
        return True
    own = f"{request.scheme}://{request.host}".rstrip("/")
    if origin == own:
        return True
    return origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")

def _client_ip():
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else request.remote_addr) or "unknown"

def _rate_limited():
    now = time.time()
    q = _hits[_client_ip()]
    while q and now - q[0] > RATE_WINDOW_SECONDS:
        q.popleft()
    if len(q) >= RATE_MAX_REQUESTS:
        return True
    q.append(now)
    return False

def _response(payload, status=200):
    r = jsonify(payload)
    r.status_code = status
    r.headers["Cache-Control"] = "no-store, max-age=0"
    r.headers["X-Content-Type-Options"] = "nosniff"
    return r

def _health():
    return _response({
        "ok": True,
        "configured": bool(os.getenv("GEMINI_API_KEY")),
        "model": MODEL,
        "maxUploadBytes": MAX_FILE_BYTES,
        "modes": sorted(ALLOWED_MODES),
    })

@app.route("/", methods=["GET"])
@app.route("/api/ai", methods=["GET"])
def health():
    return _health()

def _build_prompt(mode, form):
    language = (form.get("language") or "Arabic").strip()[:60]
    if mode == "ask":
        question = (form.get("question") or "").strip()[:MAX_PROMPT_CHARS]
        if not question:
            raise ValueError("اكتب السؤال أولاً.")
        return f"""You are DocMivo AI. Answer the user's question using ONLY the supplied document or extracted text.
If the answer is not supported by the source, say that clearly. Do not invent facts.
Answer in {language}. Keep citations lightweight by referring to page/section only when the source makes that possible.
User question: {question}"""
    if mode == "summarize":
        style = (form.get("style") or "balanced").strip()
        styles = {
            "short": "a concise summary with 5-8 bullets",
            "balanced": "a clear structured summary with headings, key points, and conclusions",
            "study": "study notes with key concepts, definitions, important numbers, and a final revision checklist",
        }
        return f"Summarize the supplied document in {language} as {styles.get(style, styles['balanced'])}. Preserve important facts and numbers. Do not add information not present in the source."
    if mode == "translate":
        target = (form.get("target") or "Arabic").strip()[:60]
        return f"Translate the supplied document text into {target}. Preserve headings, bullets, numbering, names, dates and numbers. Do not summarize or add commentary. If a proper noun should remain unchanged, keep it unchanged."
    if mode == "tables":
        return """Extract every meaningful table from the supplied document. Return STRICT JSON only in this shape:
{"tables":[{"title":"","headers":[""],"rows":[[""]],"notes":""}]}
Keep values faithful to the document. Do not invent missing cells. Use an empty string for genuinely blank cells."""
    if mode == "ocr_cleanup":
        return f"""Perform OCR/transcription on the supplied PDF/image, then conservatively clean obvious OCR errors.
Preserve names, identifiers, dates, numbers, punctuation, paragraph breaks and document order. Do not rewrite the meaning or invent missing content.
Return only the cleaned text in {language}."""
    raise ValueError("وضع AI غير معروف.")

def _infer_mime(storage):
    mt = (storage.mimetype or "").lower().strip()
    if mt in ALLOWED_MIME:
        return mt
    name = (storage.filename or "").lower()
    if name.endswith(".pdf"): return "application/pdf"
    if name.endswith(".png"): return "image/png"
    if name.endswith((".jpg", ".jpeg")): return "image/jpeg"
    if name.endswith(".webp"): return "image/webp"
    return mt

def _upstream_error(exc):
    text = str(exc)
    low = text.lower()
    if "429" in text or "quota" in low or "resource_exhausted" in low:
        return "تم الوصول إلى حد Gemini المجاني مؤقتًا. جرّب لاحقًا.", 429
    if "api key" in low or "permission_denied" in low or "401" in text or "403" in text:
        return "مفتاح Gemini غير صالح أو غير مفعّل على الخادم.", 503
    return "تعذر إكمال طلب AI الآن. جرّب مرة أخرى بعد قليل.", 502

@app.route("/", methods=["POST"])
@app.route("/api/ai", methods=["POST"])
def ai():
    if not _cors_same_origin_ok():
        return _response({"ok": False, "error": "Origin غير مسموح."}, 403)
    if _rate_limited():
        return _response({"ok": False, "error": "طلبات كثيرة في وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى."}, 429)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _response({"ok": False, "error": "DocMivo AI لم يتم تفعيله على الخادم بعد."}, 503)

    form = request.form
    mode = (form.get("mode") or "").strip()
    if mode not in ALLOWED_MODES:
        return _response({"ok": False, "error": "أداة AI غير معروفة."}, 400)
    if (form.get("consent") or "").lower() not in {"1", "true", "yes", "on"}:
        return _response({"ok": False, "error": "يلزم تأكيد الموافقة على إرسال المحتوى إلى Google Gemini."}, 400)

    try:
        prompt = _build_prompt(mode, form)
    except ValueError as exc:
        return _response({"ok": False, "error": str(exc)}, 400)

    source_text = (form.get("source_text") or "").strip()
    upload = request.files.get("file")
    contents = []

    if upload and upload.filename:
        mime = _infer_mime(upload)
        if mime not in ALLOWED_MIME:
            return _response({"ok": False, "error": "صيغة الملف غير مدعومة في DocMivo AI Beta."}, 415)
        raw = upload.read(MAX_FILE_BYTES + 1)
        if len(raw) > MAX_FILE_BYTES:
            return _response({"ok": False, "error": "الملف أكبر من حد AI Beta الحالي (حوالي 3.5 MB). استخدم PDF أصغر أو اسمح للأداة باستخراج النص محليًا."}, 413)
        if not raw:
            return _response({"ok": False, "error": "الملف فارغ."}, 400)
        contents.append(types.Part.from_bytes(data=raw, mime_type=mime))
    elif source_text:
        if len(source_text) > MAX_SOURCE_CHARS:
            source_text = source_text[:MAX_SOURCE_CHARS]
        contents.append("SOURCE TEXT (extracted locally in the browser):\n\n" + source_text)
    else:
        return _response({"ok": False, "error": "اختر ملف PDF/صورة أولًا."}, 400)

    contents.append(prompt)
    config_kwargs = {"temperature": 0.2, "max_output_tokens": 4096}
    if mode == "tables":
        config_kwargs["response_mime_type"] = "application/json"

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        text = (response.text or "").strip()
        if not text:
            return _response({"ok": False, "error": "Gemini لم يُرجع نتيجة قابلة للعرض."}, 502)
        if mode == "tables":
            try:
                data = json.loads(text)
            except Exception:
                data = {"tables": [], "raw": text}
            return _response({"ok": True, "mode": mode, "model": MODEL, "format": "json", "data": data})
        return _response({"ok": True, "mode": mode, "model": MODEL, "format": "text", "result": text})
    except Exception as exc:
        message, code = _upstream_error(exc)
        return _response({"ok": False, "error": message}, code)

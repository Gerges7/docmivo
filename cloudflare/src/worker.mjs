/** DocMivo Cloudflare Worker. Static HTML stays in ./dist; APIs run at the edge. */
const CONVERTER_MODES = new Set([
  'word_to_pdf','excel_to_pdf','powerpoint_to_pdf','protect_pdf','unlock_pdf',
  'repair_pdf','searchable_ocr','pdfa','extract_images'
]);
const AI_MODES = new Set([
  'ask','summarize','translate','tables','ocr_cleanup','research',
  'invoice','cv','contract','pii','filename'
]);
const JSON_MODES = new Set(['tables','invoice','cv','pii','filename']);
const MIMES = new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const encoder = new TextEncoder();
const MAX_AI_BYTES = 3500000;
const MAX_SOURCE = 300000;
const MAX_SIZE_DEFAULT = 25 * 1024 * 1024;
const TOKEN_TTL_SECONDS = 300;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: {'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store, max-age=0', 'X-Content-Type-Options':'nosniff'}
  });
}
function err(error, status=400) { return json({ok:false,error},status); }
function enabled(env, key) { return String(env[key] ?? '').toLowerCase() === 'true'; }
function originAllowed(req) {
  const origin = req.headers.get('Origin');
  if (origin && origin !== new URL(req.url).origin) return false;
  if (req.headers.get('Sec-Fetch-Site') === 'cross-site') return false;
  return true;
}
function bytesToBase64(bytes) {
  let out='';
  // Streaming chunks prevent JS argument/memory issues for large binary documents.
  for (let i=0;i<bytes.length;i+=8192) out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}
function b64url(bytes) { return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function encodeB64url(text) { return b64url(encoder.encode(text)); }
async function hmacSha256(secret, message) {
  const key=await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)));
}
function safeConverterBase(env) {
  try {
    const u=new URL(String(env.CONVERTER_API_URL||''));
    if (u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/') return '';
    return u.origin;
  } catch { return ''; }
}
function converterReady(env) {
  return enabled(env,'CONVERTER_ENABLED') && Boolean(env.CONVERTER_SHARED_SECRET) && Boolean(safeConverterBase(env));
}
function aiReady(env) { return enabled(env,'AI_ENABLED') && Boolean(env.GEMINI_API_KEY); }
function maxUpload(env) {
  const n=Number(env.CONVERTER_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(n)&&n>0&&n<=100*1024*1024?n:MAX_SIZE_DEFAULT;
}
async function converterToken(req, env) {
  if (req.method==='GET') return json({ok:true,configured:converterReady(env),maxUploadBytes:maxUpload(env),modes:[...CONVERTER_MODES]});
  if (req.method!=='POST') return err('Method not allowed.',405);
  if (!originAllowed(req)) return err('Origin غير مسموح.',403);
  if (!converterReady(env)) return err('محرك التحويل الاحترافي غير متاح بعد. تحقق من إعدادات Cloudflare.',503);
  if (!(req.headers.get('content-type')||'').includes('application/json')) return err('يجب إرسال JSON.',415);
  let input;
  try { input=await req.json(); } catch { return err('JSON غير صالح.'); }
  const mode=String(input?.mode||''), size=Number(input?.size);
  if (!CONVERTER_MODES.has(mode)) return err('وضع التحويل غير معروف.');
  if (!Number.isSafeInteger(size)||size<1||size>maxUpload(env)) return err('حجم الملف غير مسموح.',413);
  // Exact alphabetical field order matches the existing Cloud Run Python signature.
  const nonce=b64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload=JSON.stringify({exp:Math.floor(Date.now()/1000)+TOKEN_TTL_SECONDS,max_size:size,mode,nonce});
  const msg=encodeB64url(payload);
  const token=msg+'.'+b64url(await hmacSha256(env.CONVERTER_SHARED_SECRET,msg));
  return json({ok:true,configured:true,uploadUrl:'/api/convert',
    healthUrl:'/api/converter_token',token,expiresIn:TOKEN_TTL_SECONDS,
    maxUploadBytes:maxUpload(env)});
}
async function convertProxy(req, env) {
  if (req.method!=='POST') return err('Method not allowed.',405);
  if (!originAllowed(req)) return err('Origin غير مسموح.',403);
  if (!converterReady(env)) return err('محرك التحويل غير مفعّل.',503);
  const auth=req.headers.get('authorization')||'';
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(auth)) return err('Token مطلوب.',401);
  const mode=req.headers.get('x-docmivo-mode')||'';
  if (!CONVERTER_MODES.has(mode)) return err('وضع التحويل غير مدعوم.',400);
  if (!(req.headers.get('content-type')||'').startsWith('multipart/form-data;')) return err('ارفع الملف بصيغة FormData.',415);
  const length=Number(req.headers.get('content-length'));
  if (Number.isFinite(length)&&length>maxUpload(env)+65536) return err('الملف يتجاوز الحد الأقصى.',413);
  const headers=new Headers();
  for (const h of ['content-type','authorization','x-docmivo-mode']) headers.set(h,req.headers.get(h));
  let upstream;
  try {
    upstream=await fetch(safeConverterBase(env)+'/convert',{method:'POST',headers,body:req.body,redirect:'manual'});
  } catch { return err('تعذر الاتصال بمحرك التحويل. حاول مرة أخرى.',502); }
  if (upstream.status>=300&&upstream.status<400) return err('إعادة توجيه غير متوقعة من محرك التحويل.',502);
  const out=new Headers({'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'});
  for (const h of ['content-type','content-disposition']) if (upstream.headers.has(h)) out.set(h,upstream.headers.get(h));
  return new Response(upstream.body,{status:upstream.status,headers:out});
}
function inferMime(file) {
  const mime=String(file.type||'').toLowerCase();
  if (MIMES.has(mime)) return mime;
  const n=file.name.toLowerCase();
  if(n.endsWith('.pdf'))return 'application/pdf';
  if(n.endsWith('.png'))return 'image/png';
  if(n.endsWith('.jpg')||n.endsWith('.jpeg'))return 'image/jpeg';
  if(n.endsWith('.webp'))return 'image/webp';
  return '';
}
function magicOk(b,mime) {
  const at=(...a)=>a.every((x,i)=>b[i]===x);
  if(mime==='application/pdf')return at(37,80,68,70);
  if(mime==='image/png')return at(137,80,78,71,13,10,26,10);
  if(mime==='image/jpeg')return at(255,216,255);
  if(mime==='image/webp')return at(82,73,70,70)&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
  return false;
}
function aiPrompt(mode, data) {
  const language=String(data.get('language')||'Arabic').slice(0,60);
  const strict='Use ONLY the supplied source. Never invent facts, names, values, or page references. Distinguish missing data from inference.';
  const shared={
    ask:`Answer this question in ${language} with evidence from the supplied document: ${String(data.get('question')||'').trim().slice(0,2000)}`,
    summarize:`Summarize the document in ${language}. Style: ${String(data.get('style')||'balanced').slice(0,30)}. Include key facts, dates, limitations and conclusions.`,
    translate:`Translate the supplied document into ${String(data.get('target')||'Arabic').slice(0,60)}. Preserve headings, labels, numbers and paragraph order.`,
    tables:'Extract tables faithfully. Return STRICT JSON {"tables":[{"title":"","headers":[],"rows":[[]],"notes":""}]}. Use empty values for unclear cells.',
    ocr_cleanup:`Transcribe and conservatively correct OCR errors in ${language}; do not paraphrase. Return only corrected text.`,
    research:`Analyze research paper in ${language}: question, dataset, method, quantitative findings, limitations, implications and verification questions.`,
    invoice:'Extract invoice data; STRICT JSON {"document_type":"","vendor":"","invoice_number":"","date":"","currency":"","subtotal":"","tax":"","total":"","payment_method":"","items":[],"notes":""}.',
    cv:'Extract CV data; STRICT JSON {"name":"","headline":"","contact":{"email":"","phone":"","location":""},"summary":"","skills":[],"experience":[],"education":[],"certifications":[],"languages":[],"missing_or_unclear":[]}. No demographic inference.',
    contract:`Analyze contract in ${language}: parties, dates, payment, obligations, renewal, termination, liability, governing law, unusual terms and missing items. Not legal advice.`,
    pii:'Find sensitive identifiers only if present. STRICT JSON {"findings":[{"type":"","text":"","context":"","confidence":""}],"notes":""}. This does not redact.',
    filename:'Propose safe filename and title. STRICT JSON {"filename":"","title":"","keywords":[],"reason":""}. Exclude private identifiers.'
  };
  if(mode==='ask'&&!String(data.get('question')||'').trim()) throw new Error('اكتب السؤال أولًا.');
  return strict+'\n\n'+shared[mode];
}
async function ai(req, env) {
  const model=String(env.GEMINI_MODEL||'gemini-3.5-flash-lite');
  if(req.method==='GET')return json({ok:true,configured:aiReady(env),model,maxUploadBytes:MAX_AI_BYTES,modes:[...AI_MODES]});
  if(req.method!=='POST')return err('Method not allowed.',405);
  if(!originAllowed(req))return err('Origin غير مسموح.',403);
  if(!aiReady(env))return err('أدوات الذكاء الاصطناعي غير متاحة بعد على Cloudflare.',503);
  if(!(req.headers.get('content-type')||'').startsWith('multipart/form-data;'))return err('يجب إرسال FormData.',415);
  const contentLength=Number(req.headers.get('content-length'));
  if(Number.isFinite(contentLength)&&contentLength>4_500_000)return err('الملف أكبر من الحد المسموح.',413);
  let fd;
  try{fd=await req.formData();}catch{return err('لم نتمكن من قراءة البيانات.',400);}
  const mode=String(fd.get('mode')||'').trim();
  if(!AI_MODES.has(mode))return err('أداة AI غير معروفة.');
  if(!['true','yes','1','on'].includes(String(fd.get('consent')||'').toLowerCase()))return err('يلزم تأكيد الموافقة على إرسال الملف إلى Gemini.');
  let prompt;
  try{prompt=aiPrompt(mode,fd);}catch(e){return err(e.message);}
  const parts=[];
  const f=fd.get('file');
  if(f&&typeof f.arrayBuffer==='function'&&f.size>0){
    if(f.size>MAX_AI_BYTES)return err('الملف أكبر من حد AI الحالي (3.5 MB).',413);
    const mime=inferMime(f);
    if(!MIMES.has(mime))return err('صيغة الملف غير مدعومة.',415);
    const raw=new Uint8Array(await f.arrayBuffer());
    if(!magicOk(raw,mime))return err('محتوى الملف لا يطابق الصيغة.',415);
    parts.push({inlineData:{mimeType:mime,data:bytesToBase64(raw)}});
  }else{
    const source=String(fd.get('source_text')||'').trim();
    if(!source)return err('اختر ملفًا أو نصًا مستخرجًا أولًا.');
    if(source.length>MAX_SOURCE)return err('النص المدخل طويل جدًا.',413);
    parts.push({text:'SOURCE DOCUMENT TEXT:\n'+source});
  }
  parts.push({text:prompt});
  const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
  const generationConfig={temperature:0.15,maxOutputTokens:4096};
  if(JSON_MODES.has(mode))generationConfig.responseMimeType='application/json';
  let response;
  try{
    response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig}),redirect:'manual'});
  }catch{return err('تعذر الاتصال بـGemini.',502);}
  if(!response.ok){
    const status=response.status;
    if(status===429)return err('تم الوصول إلى حد الاستخدام المتاح لـGemini.',429);
    if(status===400||status===404)return err('نموذج Gemini غير متاح أو الطلب غير مدعوم. راجع إعداد GEMINI_MODEL.',503);
    if(status===401||status===403)return err('مفتاح Gemini غير صالح أو لا يملك صلاحية.',503);
    return err('تعذر إكمال طلب Gemini حاليًا.',502);
  }
  let result;
  try{result=await response.json();}catch{return err('استجابة Gemini غير صالحة.',502);}
  const output=(result.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('').trim();
  if(!output)return err('لم يرجع Gemini محتوى قابلاً للعرض.',502);
  if(JSON_MODES.has(mode)){
    let data;
    try{data=JSON.parse(output);}catch{data={raw:output};}
    return json({ok:true,mode,model,format:'json',data});
  }
  return json({ok:true,mode,model,format:'text',result:output});
}
function securityHeaders(request,response){
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Frame-Options','SAMEORIGIN');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  headers.delete('X-Powered-By');
  if(new URL(request.url).hostname.endsWith('.workers.dev')) headers.set('X-Robots-Tag','noindex, nofollow');
  if(request.url.includes('/api/'))headers.set('Cache-Control','no-store, max-age=0');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.hostname==='www.getdocmivo.com'){
      u.hostname='getdocmivo.com';return Response.redirect(u.toString(),301);
    }
    let response;
    if(u.pathname==='/api/converter_token')response=await converterToken(request,env);
    else if(u.pathname==='/api/convert')response=await convertProxy(request,env);
    else if(u.pathname==='/api/ai')response=await ai(request,env);
    else if(u.pathname==='/api/health')response=json({ok:true,service:'docmivo-cloudflare',ai:aiReady(env),converter:converterReady(env)});
    else if(request.method!=='GET'&&request.method!=='HEAD') response=err('Method not allowed.',405);
    else if(env.ASSETS?.fetch) response=await env.ASSETS.fetch(request);
    else response=err('Static assets binding is missing.',503);
    return securityHeaders(request,response);
  }
};
export {converterToken,ai,originAllowed,magicOk,aiPrompt,encodeB64url,converterReady};

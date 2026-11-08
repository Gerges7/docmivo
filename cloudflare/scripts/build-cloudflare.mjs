import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..'); // original repo root
const cf=path.join(root,'cloudflare');
const dist=path.join(cf,'dist');
const overlays=path.join(cf,'cloudflare-overrides');
const abs=p=>path.join(root,p);
function assert(ok,msg){if(!ok)throw new Error('Cloudflare build failed: '+msg);}
function copyFile(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
function copyTree(from,to){
  assert(fs.existsSync(from),'Missing website directory '+from);
  for(const e of fs.readdirSync(from,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue;
    const f=path.join(from,e.name),d=path.join(to,e.name);
    if(e.isDirectory())copyTree(f,d);
    else if(e.isFile()&&!(/\.(pyc|log|zip|map)$/i.test(e.name)))copyFile(f,d);
  }
}
function replaceOnce(s,a,b,label){assert(s.includes(a),'Source changed; cannot safely patch '+label);return s.replace(a,b);}
export function patchEngine(src){
  const oldParse="function parsePages(expr,total){const out=[];String(expr||'').split(',').forEach(part=>{part=part.trim();if(!part)return;if(part.includes('-')){let[a,b]=part.split('-').map(Number);if(!b)b=total;for(let i=Math.max(1,a);i<=Math.min(total,b);i++)out.push(i-1)}else{const n=Number(part);if(n>=1&&n<=total)out.push(n-1)}});return [...new Set(out)]}";
  const newParse=`function parsePages(expr,total){
  if(!Number.isSafeInteger(total)||total<1)throw new Error('عدد صفحات الملف غير صالح.');
  const out=[];const text=String(expr??'').trim();
  if(!text)return out;
  for(const raw of text.split(',')){
    const part=raw.trim();if(!part)throw new Error('نطاق صفحات غير صحيح: جزء فارغ.');
    const m=/^(\\d+)\\s*(?:-\\s*(\\d*)\\s*)?$/.exec(part);
    if(!m)throw new Error('نطاق صفحات غير صحيح: '+part);
    const start=Number(m[1]),end=m[2]===undefined?start:(m[2]?Number(m[2]):total);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end<start||end>total)
      throw new Error('أرقام الصفحات خارج المدى أو غير مرتبة: '+part);
    for(let i=start;i<=end;i++)out.push(i-1);
  }
  return [...new Set(out)];
}`;
  src=replaceOnce(src,oldParse,newParse,'parsePages');
  const oldAdd="function addFiles(fs){const incoming=[...fs];if(!tool.multiple)files=incoming.slice(0,1);else files=[...files,...incoming];incoming.forEach(maybePrefill);renderFiles();clearStatus()}";
  const newAdd=`function addFiles(fs){
  const accept=(tool?.accept||input?.accept||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const incoming=[...fs];
  const invalid=incoming.find(f=>!accept.some(a=>a.startsWith('.')?f.name.toLowerCase().endsWith(a):
      a.endsWith('/*')?f.type.toLowerCase().startsWith(a.slice(0,-1)):f.type.toLowerCase()===a));
  if(invalid){status('نوع الملف غير مدعوم: '+invalid.name,'err');return;}
  if(!tool.multiple)files=incoming.slice(0,1);else files=[...files,...incoming];
  incoming.forEach(maybePrefill);renderFiles();clearStatus();
}`;
  src=replaceOnce(src,oldAdd,newAdd,'drag/drop file acceptance');
  src=replaceOnce(src,"const idx=parsePages(ranges[r],total);if(!idx.length)continue;","const idx=parsePages(ranges[r],total);if(!idx.length)throw new Error('نطاق تقسيم فارغ.');",'split invalid range');
  src=replaceOnce(src,"} else if(slug==='delete-pages'){\n   const src=await loadPdf(files[0]),", "} else if(slug==='delete-pages'){\n   if(!String($('#pageRanges').value||'').trim())throw new Error('حدد الصفحات المراد حذفها أولًا.');\n   const src=await loadPdf(files[0]),",'delete empty selection');
  const oldCompress="download(new Blob([await out.save()],{type:'application/pdf'}),slug==='grayscale-pdf'?'grayscale.pdf':'compressed.pdf');";
  const newCompress="const outputBytes=await out.save();if(slug==='compress-pdf'&&outputBytes.byteLength>=files[0].size)throw new Error('لم يقل حجم PDF مع الإعدادات الحالية. احتفظ بالملف الأصلي أو جرّب جودة أقل.');download(new Blob([outputBytes],{type:'application/pdf'}),slug==='grayscale-pdf'?'grayscale.pdf':'compressed.pdf');";
  src=replaceOnce(src,oldCompress,newCompress,'compress no-benefit validation');
  return src;
}
export function addHomeTools(src){
  if(src.includes('id="v17-new-tools"'))return src;
  const marker='<section class="section ai-section" id="ai-tools">';
  assert(src.includes(marker),'Cannot place new-tools section');
  const section=`<section class="section" id="v17-new-tools"><div class="container"><div class="section-head">
  <h2>أدوات إضافية للصور ورموز QR</h2><p>أنشئ رمز QR ثابتًا أو جهّز صورك للأرشفة والمشاركة مباشرة من المتصفح، بدون تسجيل حساب.</p>
  </div><div class="guide-grid">
  <a class="guide-card" href="/tools/qr-code"><div class="guide-cover">▦</div><div class="guide-content"><small>QR Code · تجريبي</small><h3>إنشاء رمز QR</h3><p>روابط ونصوص وشبكات Wi-Fi وجهات اتصال، مع تصدير PNG وSVG وإرشادات للطباعة.</p></div></a>
  <a class="guide-card" href="/tools/image-resize"><div class="guide-cover">🖼️</div><div class="guide-content"><small>صور · تجريبي</small><h3>تغيير أبعاد الصور</h3><p>حدد العرض والارتفاع بدقة مع الحفاظ على التناسب لمختلف متطلبات الرفع والطباعة.</p></div></a>
  <a class="guide-card" href="/tools/image-compress"><div class="guide-cover">📉</div><div class="guide-content"><small>صور · تجريبي</small><h3>ضغط الصور وتحويل صيغتها</h3><p>قارن الحجم قبل وبعد التحويل بين JPG وPNG وWebP وحدد مستوى الجودة المناسب.</p></div></a>
  </div></div></section>\n`;
  src=src.replace(marker,section+marker);
  return src.replace('<title>DocMivo — أدوات PDF مجانية وسهلة</title>',
    '<title>DocMivo — أدوات PDF والصور وQR مجانية</title>');
}
function walkFiles(dir){const out=[];if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...walkFiles(p));else if(e.isFile())out.push(p);}return out;}
export function build(){
  assert(fs.existsSync(abs('index.html')),'Run from the original Gerges7/docmivo repo, not from this ZIP alone: missing index.html');
  assert(fs.existsSync(abs('assets/js/tool-engine.v14.js')),'Original v14 engine missing');
  fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist,{recursive:true});
  // Explicit allowlist: never publish Python APIs, cloudrun source, git files, docs or secrets as static assets.
  for(const name of ['assets','tools','guides','v17-preview']) if(fs.existsSync(abs(name)))copyTree(abs(name),path.join(dist,name));
  for(const name of fs.readdirSync(root)){
    if(/\.html$/i.test(name)&&fs.statSync(abs(name)).isFile())copyFile(abs(name),path.join(dist,name));
  }
  for(const name of ['favicon.svg','robots.txt','sitemap.xml','ads.txt','manifest.webmanifest'])
    if(fs.existsSync(abs(name)))copyFile(abs(name),path.join(dist,name));
  for(const src of walkFiles(overlays))copyFile(src,path.join(dist,path.relative(overlays,src)));
  const enginePath=path.join(dist,'assets/js/tool-engine.v14.js');
  fs.writeFileSync(enginePath,patchEngine(fs.readFileSync(enginePath,'utf8')));
  const homePath=path.join(dist,'index.html');
  fs.writeFileSync(homePath,addHomeTools(fs.readFileSync(homePath,'utf8')));
  const required=['index.html','404.html','robots.txt','sitemap.xml','ads.txt','tools/merge-pdf/index.html',
    'tools/qr-code/index.html','assets/js/vendor/docmivo-qr-engine.js'];
  required.forEach(f=>assert(fs.existsSync(path.join(dist,f)),'Missing output '+f));
  const qr=fs.readFileSync(path.join(dist,'tools/qr-code/index.html'),'utf8');
  assert(qr.includes('docmivo-qr-engine.js')&&!qr.includes('qrcode@1.5.4/lib/browser.min.js'),'QR local vendor was not applied');
  assert(!fs.existsSync(path.join(dist,'api'))&&!fs.existsSync(path.join(dist,'cloudrun')),'Backend source leaked into public assets');
  console.log('DocMivo Cloudflare build OK:',walkFiles(dist).length,'public static files, no backend exposed.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))build();

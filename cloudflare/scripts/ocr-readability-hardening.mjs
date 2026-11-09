/**
 * DocMivo V18.6: OCR rendering resolution and Tesseract page-layout controls.
 * Runs after V18.5 and patches only the Cloudflare-generated dist files.
 * Does not change images, QR, compress, or the original Vercel tree.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function docmivoOcrRenderScale(mode, pageArea) {
  const presets = {fast:1.7, balanced:2.8, accurate:3.5};
  if (!Object.hasOwn(presets,mode)) throw new Error('اختيار دقة OCR غير صالح.');
  if (!Number.isFinite(pageArea) || pageArea<=0) throw new Error('أبعاد صفحة PDF غير صالحة.');
  const limit = mode==='accurate' ? 16000000 : 12000000;
  const scale = Math.min(presets[mode], Math.sqrt(limit/pageArea));
  if (scale<0.5) throw new Error('أبعاد الصفحة كبيرة جدًا لعمل OCR داخل المتصفح.');
  return scale;
}

export function docmivoOcrPageSegMode(mode) {
  const layouts = {auto:'3',block:'6',line:'7'};
  if (!Object.hasOwn(layouts,mode)) throw new Error('طريقة توزيع النص غير صالحة.');
  return layouts[mode];
}

const OLD_SCALE="const ocrScale=Math.min(1.7,Math.sqrt(10000000/(base.width*base.height)));";
const NEW_SCALE="const ocrScale=docmivoOcrRenderScale($('#ocrDetail')?.value||'balanced',base.width*base.height);";
const OLD_WORKER_SUFFIX = "      });\n     }\n     status('OCR الصفحة '+i+' من '+pdf.numPages+'…');";
const NEW_WORKER_SUFFIX = "      });\n      const pageSegMode=docmivoOcrPageSegMode($('#ocrLayout')?.value||'auto');\n      if(typeof worker.setParameters==='function') await worker.setParameters({tessedit_pageseg_mode:pageSegMode});\n     }\n     status('OCR الصفحة '+i+' من '+pdf.numPages+'…');";
const OCR_PAGE_ANCHOR = '<div class="field"><label for="ocrStrategy">';

function replaceExactlyOnce(s,a,b,label){
  const count=s.split(a).length-1;
  if(count!==1)throw new Error(`V18.6: unexpected ${label} anchor count: ${count}`);
  return s.replace(a,b);
}

export function patchOcrEngine(src){
  if(src.includes('function docmivoOcrRenderScale('))throw new Error('V18.6: already patched OCR engine');
  if(!src.includes('function docmivoUseTextLayer('))throw new Error('V18.6: requires V18.4 OCR engine first');
  let next=replaceExactlyOnce(src,OLD_SCALE,NEW_SCALE,'OCR render scale');
  next=replaceExactlyOnce(next,OLD_WORKER_SUFFIX,NEW_WORKER_SUFFIX,'OCR worker layout config');
  const defs=docmivoOcrRenderScale.toString()+'\n'+docmivoOcrPageSegMode.toString()+'\n';
  next=replaceExactlyOnce(next,'function parsePages(expr,total){',defs+'function parsePages(expr,total){','engine helper');
  return next;
}

export function patchOcrLayoutHtml(src){
  if(!src.includes('id="ocrStrategy"'))throw new Error('V18.6: requires V18.4 OCR page');
  if(src.includes('id="ocrDetail"'))throw new Error('V18.6: already patched OCR page');
  const ui=`<div class="form-grid">
    <div class="field"><label for="ocrDetail">دقة قراءة النص</label><select id="ocrDetail">
      <option value="balanced" selected>متوازنة (موصى بها)</option>
      <option value="accurate">نص صغير — دقة أعلى (أبطأ)</option>
      <option value="fast">سريعة — لملف واضح</option>
    </select></div>
    <div class="field"><label for="ocrLayout">شكل النص على الصفحة</label><select id="ocrLayout">
      <option value="auto" selected>تلقائي — مستند عادي</option>
      <option value="block">كتلة نص واحدة — سطور قصيرة</option>
      <option value="line">سطر واحد فقط</option>
    </select></div>
   </div>
   <p class="notice" style="margin-top:8px">للمسح الصغير جرّب «نص صغير» و«كتلة نص واحدة». الدقة الأعلى تستخدم ذاكرة ووقتًا أكثر، ولا يمكنها استرجاع تفاصيل غير موجودة في الصورة.</p>`;
  return replaceExactlyOnce(src,OCR_PAGE_ANCHOR,ui+OCR_PAGE_ANCHOR,'OCR controls');
}

export function applyOcrReadability(dist){
  const targets=[
    ['assets/js/tool-engine.v14.js',patchOcrEngine],
    ['tools/ocr-pdf/index.html',patchOcrLayoutHtml]
  ];
  const results=targets.map(([f,fn])=>{
    const p=path.join(dist,f);
    if(!fs.existsSync(p))throw new Error('V18.6: missing dist file '+f);
    return [p,fn(fs.readFileSync(p,'utf8'))];
  });
  // Do not touch partially generated output on failed assertions.
  for(const [p,v] of results)fs.writeFileSync(p,v);
  console.log('DocMivo V18.6: OCR resolution presets and layout controls installed.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  applyOcrReadability(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
}

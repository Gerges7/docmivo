/**
 * DocMivo V18.5 — safe PDF <-> image export and honest text extraction.
 * Applies ONLY to the generated Cloudflare build dist, after V18.4.
 * No server service or new npm packages required.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function docmivoExportFormat(slug) {
  const formats = {'pdf-to-jpg':['image/jpeg','jpg'],'pdf-to-png':['image/png','png'],'pdf-to-webp':['image/webp','webp']};
  if (!Object.hasOwn(formats,slug)) throw new Error('نوع تصدير PDF غير مدعوم.');
  return formats[slug];
}

export function docmivoSafeScale(width, height, requested, maxPixels=16000000) {
  const w=Number(width),h=Number(height),s=Number(requested);
  if (![w,h,s].every(Number.isFinite)||w<=0||h<=0||s<=0||!Number.isFinite(maxPixels)||maxPixels<=0)
    throw new Error('أبعاد الصفحة أو دقة التصدير غير صالحة.');
  const adjusted=Math.min(s,Math.sqrt(maxPixels/(w*h)));
  if (adjusted < 0.3) throw new Error('أبعاد الصفحة كبيرة جدًا للمعالجة الآمنة داخل المتصفح.');
  return adjusted;
}

export function docmivoFileName(page,total,ext) {
  if (!Number.isSafeInteger(page)||!Number.isSafeInteger(total)||page<1||page>total||!/^(jpg|png|webp)$/.test(ext))
    throw new Error('رقم الصفحة أو امتداد الصورة غير صحيح.');
  return 'page-'+String(page).padStart(Math.max(3,String(total).length),'0')+'.'+ext;
}

export function docmivoTextFromItems(items) {
  let out='';
  for (const item of items||[]) {
    if (typeof item.str !== 'string') continue;
    const word=item.str.trim();
    if (word) {
      if (out && !/\s$/.test(out) && !/\s$/.test(item.str) && !/^\s/.test(item.str)) out+=' ';
      out+=item.str;
    }
    if (item.hasEOL && out && !out.endsWith('\n')) out+='\n';
  }
  return out.trim();
}

function replaceBranch(src, from, to, replacement, label) {
  const i=src.indexOf(from), next=i<0?-1:src.indexOf(from,i+from.length);
  if(i<0||next>=0)throw new Error('V18.5: cannot find unique '+label+' start');
  const j=src.indexOf(to,i+from.length);
  if(j<0)throw new Error('V18.5: cannot find '+label+' end');
  return src.slice(0,i)+replacement+'  '+src.slice(j);
}

const IMAGES_BEGIN="} else if(slug==='images-to-pdf'){";
const PDF_IMAGES_BEGIN="} else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){";
const COMPRESS_BEGIN="} else if(slug==='compress-pdf'||slug==='grayscale-pdf'){";
const TEXT_BEGIN="} else if(slug==='extract-text'){";
const OCR_BEGIN="} else if(slug==='ocr-pdf'){";

const NEW_IMAGES = `} else if(slug==='images-to-pdf'){
   if(!files.length)throw new Error('اختر صورة واحدة على الأقل.');
   if(files.length>100)throw new Error('الحد الأقصى 100 صورة في كل ملف PDF.');
   const out=await PDFDocument.create();
   const maxW=595.28,maxH=841.89;
   for(let i=0;i<files.length;i++){
    const f=files[i],mime=String(f.type||'').toLowerCase(),fileName=f.name.toLowerCase();
    const isPng=mime==='image/png'||(!mime&&fileName.endsWith('.png'));
    const isJpg=mime==='image/jpeg'||(!mime&&/\\.jpe?g$/.test(fileName));
    const isWebp=mime==='image/webp'||(!mime&&fileName.endsWith('.webp'));
    if(!(isPng||isJpg||isWebp))throw new Error('نوع صورة غير مدعوم: '+f.name);
    status('تجهيز الصورة '+(i+1)+' من '+files.length+'…');
    let img;
    if(isPng||isJpg){
     const bytes=await f.arrayBuffer();
     img=isPng?await out.embedPng(bytes):await out.embedJpg(bytes);
    }else{
     if(typeof createImageBitmap!=='function')throw new Error('هذا المتصفح لا يدعم فتح WebP للتحويل إلى PDF.');
     const bmp=await createImageBitmap(f);
     try{
      const w=bmp.width,h=bmp.height;
      if(!w||!h||w>12000||h>12000||w*h>32000000)throw new Error('أبعاد صورة WebP كبيرة جدًا: '+f.name);
      const c=document.createElement('canvas');c.width=w;c.height=h;
      try{
       const ctx=c.getContext('2d');if(!ctx)throw new Error('تعذر تجهيز Canvas.');
       ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
       ctx.drawImage(bmp,0,0);
       const b=await canvasBlob(c,'image/jpeg',.92);
       if(b.type!=='image/jpeg')throw new Error('تعذر تحويل WebP إلى JPEG داخل المتصفح.');
       img=await out.embedJpg(await b.arrayBuffer());
      }finally{c.width=0;c.height=0;}
     }finally{if(typeof bmp.close==='function')bmp.close();}
    }
    if(!img.width||!img.height||img.width>12000||img.height>12000||img.width*img.height>32000000)
     throw new Error('أبعاد الصورة كبيرة جدًا: '+f.name);
    const ratio=Math.min(maxW/img.width,maxH/img.height,1);
    const w=img.width*ratio,h=img.height*ratio;
    const page=out.addPage([maxW,maxH]);
    page.drawImage(img,{x:(maxW-w)/2,y:(maxH-h)/2,width:w,height:h});
   }
   download(new Blob([await out.save()],{type:'application/pdf'}),'images.pdf');
  `;

const NEW_PDF_TO_IMAGES = `} else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){
   const [mime,ext]=docmivoExportFormat(slug);
   const requested=Number($('#scale')?.value||1.7);
   const q=Number($('#quality')?.value||.9);
   if(!Number.isFinite(requested)||requested<0.5||requested>4||!Number.isFinite(q)||q<=0||q>1)
    throw new Error('إعدادات الدقة أو الجودة غير صالحة.');
   const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;
   try{
    if(pdf.numPages<1||pdf.numPages>500)throw new Error('الحد الأقصى 500 صفحة لكل عملية تصدير. قسّم الملف أولًا.');
    const zip=new JSZip();
    for(let i=1;i<=pdf.numPages;i++){
     status('تحويل الصفحة '+i+' من '+pdf.numPages+'…');
     const page=await pdf.getPage(i),vp=page.getViewport({scale:1});
     const safeScale=docmivoSafeScale(vp.width,vp.height,requested);
     const c=await renderCanvasFromPage(pdf,i,safeScale);
     try{
      const b=await canvasBlob(c,mime,q);
      // Browsers may silently return PNG when WebP encoding is unsupported.
      if(b.type!==mime)throw new Error('متصفحك لا يدعم تصدير '+ext.toUpperCase()+' بشكل صحيح. جرّب PNG أو JPG بدلًا منه.');
      if(!b.size)throw new Error('الصورة الناتجة من الصفحة '+i+' فارغة.');
      zip.file(docmivoFileName(i,pdf.numPages,ext),b);
     }finally{c.width=0;c.height=0;}
    }
    download(await zip.generateAsync({type:'blob'}),'pdf-pages-'+ext+'.zip');
   }finally{try{await pdf.destroy();}catch{}}
  `;

const NEW_EXTRACT_TEXT = `} else if(slug==='extract-text'){
   const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await files[0].arrayBuffer())}).promise;
   let found=false;let output='';
   try{
    for(let i=1;i<=pdf.numPages;i++){
     status('قراءة الصفحة '+i+' من '+pdf.numPages+'…');
     const page=await pdf.getPage(i),tc=await page.getTextContent();
     const content=docmivoTextFromItems(tc.items);
     if(content)found=true;
     output+='--- Page '+i+' ---\\n'+(content||'[لا يوجد نص قابل للاستخراج في هذه الصفحة]')+'\\n\\n';
    }
    if(!found)throw new Error('الملف لا يحتوي نصًا قابلًا للنسخ. استخدم OCR PDF لاستخراج النص من الصور الممسوحة.');
    download(new Blob([output.trimEnd()+'\\n'],{type:'text/plain;charset=utf-8'}),'extracted-text.txt');
   }finally{try{await pdf.destroy();}catch{}}
  `;

export function patchImageTextEngine(source){
  if(!source.includes('function parsePages(expr,total){'))throw new Error('V18.5: engine anchor missing');
  if(source.includes('function docmivoExportFormat('))throw new Error('V18.5: already applied');
  let out=replaceBranch(source,IMAGES_BEGIN,PDF_IMAGES_BEGIN,NEW_IMAGES,'images-to-pdf');
  out=replaceBranch(out,PDF_IMAGES_BEGIN,COMPRESS_BEGIN,NEW_PDF_TO_IMAGES,'PDF images');
  out=replaceBranch(out,TEXT_BEGIN,OCR_BEGIN,NEW_EXTRACT_TEXT,'extract-text');
  out=out.replace('function parsePages(expr,total){',
   [docmivoExportFormat.toString(),docmivoSafeScale.toString(),docmivoFileName.toString(),docmivoTextFromItems.toString(),
   'function parsePages(expr,total){'].join('\n'));
  return out;
}

const IMG_NOTICE='<p>يمكنك اختيار عدة صور وترتيبها بالأسهم قبل إنشاء PDF.</p>';
export function patchImagesPage(html){
  if(!html.includes(IMG_NOTICE))throw new Error('V18.5 images-to-pdf layout changed');
  return html.replace(IMG_NOTICE,IMG_NOTICE+'<p class="notice">كل صورة تصبح صفحة A4. نحافظ على PNG وJPEG الأصلية قدر الإمكان؛ صور WebP ذات الشفافية تُجهّز على خلفية بيضاء قبل التحويل. الحد الأقصى 100 صورة.</p>');
}
export function patchExportPage(html,ext){
  if(!html.includes('id="runTool"'))throw new Error('V18.5 PDF export page missing controls');
  const row='<div class="action-row"><button class="btn btn-primary" id="runTool">';
  if(!html.includes(row))throw new Error('V18.5 PDF export page structure changed');
  const note=ext==='webp'?'إذا لم يدعم متصفحك حفظ WebP الحقيقي ستظهر رسالة خطأ بدل تنزيل ملف PNG باسم WebP.':'سيُستخدم نفس ترتيب صفحات PDF، بأسماء صور مرقمة، مع ضبط دقة الصور تلقائيًا للملفات الكبيرة.';
  return html.replace(row,`<p class="notice" style="margin:12px 0">${note} الحد الأقصى 500 صفحة لكل عملية.</p>`+row);
}
export function patchExtractPage(html){
  const marker='<p>الأداة تستخرج النص الموجود فعليًا داخل PDF. إذا كان الملف عبارة عن صور ممسوحة، استخدم OCR PDF بدلًا منها.</p>';
  if(!html.includes(marker))throw new Error('V18.5 extract text layout changed');
  return html.replace(marker,marker+'<p class="notice">تحافظ الأداة على فواصل الأسطر حيث تتوفر. إذا كانت كل الصفحات ممسوحة ضوئيًا، لن تنزّل ملف TXT فارغًا؛ ستوجّهك إلى OCR.</p>');
}
export function installImageTextPatch(dist){
  const files=[
   ['assets/js/tool-engine.v14.js',patchImageTextEngine],
   ['tools/images-to-pdf/index.html',patchImagesPage],
   ['tools/pdf-to-jpg/index.html',x=>patchExportPage(x,'jpg')],
   ['tools/pdf-to-png/index.html',x=>patchExportPage(x,'png')],
   ['tools/pdf-to-webp/index.html',x=>patchExportPage(x,'webp')],
   ['tools/extract-text/index.html',patchExtractPage]
  ];
  const patches=files.map(([name,fn])=>{
   const target=path.join(dist,name);if(!fs.existsSync(target))throw new Error('V18.5 missing '+name);
   return [target,fn(fs.readFileSync(target,'utf8'))];
  });
  patches.forEach(([p,c])=>fs.writeFileSync(p,c));
  console.log('DocMivo V18.5: honest image formats, memory caps, opaque WebP backgrounds, nonempty extract text.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const base=path.dirname(fileURLToPath(import.meta.url));installImageTextPatch(path.join(base,'../dist'));
}

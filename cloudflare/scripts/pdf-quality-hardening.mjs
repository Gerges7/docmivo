/**
 * DocMivo V18.4: safe PDF compression and efficient, honest browser OCR.
 * Build-time patch of generated cloudflare/dist only. Never changes Vercel originals.
 * Run after build-cloudflare, cloudflare-only-cleanup, PDF page hardening and QR UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// These pure helpers are injected into the browser engine; keep dependency-free.
export function docmivoCompressionPolicy(mode, hasText) {
  if (mode === 'raster') return 'raster';
  if (mode === 'auto') return hasText ? 'preserve-text' : 'raster';
  throw new Error('طريقة الضغط غير معروفة.');
}
export function docmivoOcrLanguages(mode) {
  if (mode === 'ara' || mode === 'eng') return mode;
  if (mode === 'ara+eng') return ['ara', 'eng'];
  throw new Error('لغة OCR غير مدعومة.');
}
export function docmivoUseTextLayer(mode, text) {
  if (mode !== 'smart' && mode !== 'force') throw new Error('وضع OCR غير صالح.');
  return mode === 'smart' && typeof text === 'string' && text.replace(/\s/g, '').length >= 8;
}

const COMPRESS_OLD_START = "} else if(slug==='compress-pdf'||slug==='grayscale-pdf'){";
const COMPRESS_OLD_END = "} else if(slug==='extract-text'){";
const OCR_OLD_START = "} else if(slug==='ocr-pdf'){";
const OCR_OLD_END = "} else if(slug==='pdf-info'){";
const SUCCESS_OLD = "if(slug!=='word-to-pdf')status('تمت العملية بنجاح. تم تجهيز الملف للتحميل.','ok');";
const SUCCESS_NEW = "if(!['word-to-pdf','compress-pdf','ocr-pdf'].includes(slug))status('تمت العملية بنجاح. تم تجهيز الملف للتحميل.','ok');";

function replaceBetween(src,start,end,newBlock,label) {
  const from=src.indexOf(start);
  if(from<0 || src.indexOf(start,from+start.length)!==-1) throw new Error(`V18.4: ${label}: expected exactly one start`);
  const to=src.indexOf(end,from+start.length);
  if(to<0) throw new Error(`V18.4: ${label}: closing branch not found`);
  return src.slice(0,from)+newBlock+'  '+src.slice(to);
}

const COMPRESS_NEW = `} else if(slug==='compress-pdf'||slug==='grayscale-pdf'){
   const raw=new Uint8Array(await files[0].arrayBuffer());
   const pdf=await pdfjsLib.getDocument({data:raw.slice()}).promise;
   const quality=Number($('#quality').value),scale=Number($('#scale').value);
   try{
    if(slug==='compress-pdf'){
     const mode=$('#compressMode')?.value||'auto';
     if(mode!=='auto'&&mode!=='raster')throw new Error('طريقة ضغط غير صالحة.');
     let hasText=false;
     if(mode==='auto'){
      status('فحص طبقات النص للحفاظ على البحث والنسخ…');
      for(let i=1;i<=pdf.numPages;i++){
       const p=await pdf.getPage(i),content=await p.getTextContent();
       if(content.items.some(x=>typeof x.str==='string'&&x.str.trim().length>0)){hasText=true;break;}
      }
     }
     if(docmivoCompressionPolicy(mode,hasText)==='preserve-text'){
      status('الملف يحتوي نصًا قابلًا للبحث؛ نحاول تقليل الحجم دون تحويله إلى صور…');
      const doc=await PDFDocument.load(raw);
      const result=await doc.save({useObjectStreams:true});
      if(result.byteLength>=files[0].size)
       throw new Error('هذا PDF يحتوي نصًا قابلًا للنسخ ولم تنجح إعادة تعبئته في تقليل حجمه. يمكنك اختيار «ضغط بالصور» إذا كنت تقبل فقدان النص القابل للتحديد، أو الاحتفاظ بالأصل.');
      download(new Blob([result],{type:'application/pdf'}),'compressed.pdf');
      status('تم تقليل حجم PDF مع الحفاظ على طبقة النص. راجع الناتج قبل مشاركة المستند.','ok');
     }else{
      const out=await PDFDocument.create();
      for(let i=1;i<=pdf.numPages;i++){
       status('ضغط الصفحة '+i+' من '+pdf.numPages+'…');
       const page=await pdf.getPage(i),base=page.getViewport({scale:1});
       const safeScale=Math.min(scale,Math.sqrt(16000000/(base.width*base.height)));
       if(!Number.isFinite(safeScale)||safeScale<0.5)throw new Error('أبعاد الصفحة كبيرة جدًا للضغط الآمن داخل المتصفح.');
       const canvas=await renderCanvasFromPage(pdf,i,safeScale);
       try{
        const blob=await canvasBlob(canvas,'image/jpeg',quality);
        const img=await out.embedJpg(await blob.arrayBuffer());
        const p=out.addPage([base.width,base.height]);
        p.drawImage(img,{x:0,y:0,width:base.width,height:base.height});
       }finally{canvas.width=0;canvas.height=0;}
      }
      const result=await out.save();
      if(result.byteLength>=files[0].size)throw new Error('الناتج ليس أصغر من الأصل. قلّل جودة JPEG أو دقة العرض، أو احتفظ بالأصل.');
      download(new Blob([result],{type:'application/pdf'}),'compressed.pdf');
      const gain=Math.round((1-result.byteLength/files[0].size)*100);
      status('تم تقليل الحجم بنسبة '+gain+'%. تنبيه: الصفحات صارت صورًا، وقد تفقد النص القابل للبحث والنسخ.','ok');
     }
    }else{
     const out=await PDFDocument.create();
     for(let i=1;i<=pdf.numPages;i++){
      status('تحويل الصفحة '+i+' من '+pdf.numPages+'…');
      const page=await pdf.getPage(i),base=page.getViewport({scale:1});
      const safeScale=Math.min(scale,Math.sqrt(16000000/(base.width*base.height)));
      if(!Number.isFinite(safeScale)||safeScale<0.5)throw new Error('أبعاد الصفحة كبيرة جدًا للتحويل داخل المتصفح.');
      const canvas=await renderCanvasFromPage(pdf,i,safeScale);
      try{
       const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;
       for(let p=0;p<d.length;p+=4){const g=Math.round(.299*d[p]+.587*d[p+1]+.114*d[p+2]);d[p]=d[p+1]=d[p+2]=g;}
       ctx.putImageData(im,0,0);
       const blob=await canvasBlob(canvas,'image/jpeg',quality),img=await out.embedJpg(await blob.arrayBuffer()),p=out.addPage([base.width,base.height]);
       p.drawImage(img,{x:0,y:0,width:base.width,height:base.height});
      }finally{canvas.width=0;canvas.height=0;}
     }
     download(new Blob([await out.save()],{type:'application/pdf'}),'grayscale.pdf');
    }
   }finally{try{await pdf.destroy();}catch{}}
  `;

const OCR_NEW = `} else if(slug==='ocr-pdf'){
   const raw=new Uint8Array(await files[0].arrayBuffer());
   const pdf=await pdfjsLib.getDocument({data:raw}).promise;
   const lang=docmivoOcrLanguages($('#ocrLang').value),strategy=$('#ocrStrategy')?.value||'smart';
   if(strategy!=='smart'&&strategy!=='force')throw new Error('وضع OCR غير معروف.');
   let worker=null,allText='',nonempty=0,readFromPdf=0,ocrPages=0,pageInProgress=0;
   try{
    for(let i=1;i<=pdf.numPages;i++){
     pageInProgress=i;
     status('فحص الصفحة '+i+' من '+pdf.numPages+'…');
     const page=await pdf.getPage(i);
     let embedded='';
     if(strategy==='smart'){
      const content=await page.getTextContent();
      embedded=content.items.filter(x=>typeof x.str==='string').map(x=>x.str).join(' ').trim();
     }
     if(docmivoUseTextLayer(strategy,embedded)){
      allText+='\\n\\n--- Page '+i+' (embedded text) ---\\n'+embedded;
      nonempty++;readFromPdf++;continue;
     }
     const base=page.getViewport({scale:1});
     const ocrScale=Math.min(1.7,Math.sqrt(10000000/(base.width*base.height)));
     if(!Number.isFinite(ocrScale)||ocrScale<0.5)throw new Error('الصفحة '+i+' كبيرة جدًا لعمل OCR داخل المتصفح. قلّل حجم الصفحات أولًا.');
     if(!worker){
      if(!window.Tesseract?.createWorker)throw new Error('لم يتم تحميل مكتبة OCR. تأكد من الاتصال بالإنترنت ثم حدّث الصفحة.');
      status('تحميل محرك OCR وملفات اللغة… قد يستغرق ذلك عند أول استخدام.');
      worker=await window.Tesseract.createWorker(lang,1,{
       logger:m=>{if(m.status==='recognizing text'&&Number.isFinite(m.progress))status('OCR الصفحة '+pageInProgress+'/'+pdf.numPages+': '+Math.round(m.progress*100)+'%');}
      });
     }
     status('OCR الصفحة '+i+' من '+pdf.numPages+'…');
     const canvas=await renderCanvasFromPage(pdf,i,ocrScale);
     try{
      const result=await worker.recognize(canvas),value=String(result?.data?.text||'').trim();
      allText+='\\n\\n--- Page '+i+' (OCR) ---\\n'+value;
      if(value)nonempty++;
      ocrPages++;
     }finally{canvas.width=0;canvas.height=0;}
    }
    if(!nonempty)throw new Error('لم يتم التعرف على نص في الملف. جرّب لغة أخرى أو ملفًا أوضح.');
    download(new Blob([allText.trimStart()],{type:'text/plain;charset=utf-8'}),'ocr-text.txt');
    status('تم استخراج النص من '+pdf.numPages+' صفحة ('+readFromPdf+' بنص أصلي و'+ocrPages+' باستخدام OCR). الملف الناتج TXT، ويُفضّل مراجعة الأرقام والأسماء.','ok');
   }finally{
    if(worker)try{await worker.terminate();}catch{}
    try{await pdf.destroy();}catch{}
   }
  `;

export function patchPdfEngine(source) {
  if(!source.includes('function parsePages(expr,total){'))throw new Error('V18.4: missing PDF engine anchor');
  if(source.includes('function docmivoCompressionPolicy('))throw new Error('V18.4 already patched');
  let src=replaceBetween(source,COMPRESS_OLD_START,COMPRESS_OLD_END,COMPRESS_NEW,'compression');
  src=replaceBetween(src,OCR_OLD_START,OCR_OLD_END,OCR_NEW,'OCR');
  if(src.split(SUCCESS_OLD).length!==2)throw new Error('V18.4: success status patch missing/duplicate');
  src=src.replace(SUCCESS_OLD,SUCCESS_NEW);
  return src.replace('function parsePages(expr,total){',
    [docmivoCompressionPolicy.toString(),docmivoOcrLanguages.toString(),docmivoUseTextLayer.toString(),'function parsePages(expr,total){'].join('\n'));
}

const COMPRESS_NOTICE = 'هذه الطريقة تعيد بناء الصفحات كصور لتقليل الحجم، لذلك قد لا يبقى النص قابلًا للتحديد.';
export function patchCompressPage(html) {
  if(!html.includes(COMPRESS_NOTICE)||!html.includes('id="runTool"'))throw new Error('V18.4: compress page source changed');
  if(html.includes('id="compressMode"'))throw new Error('V18.4: compress page already patched');
  const ui=`<div class="field" style="margin:12px 0"><label for="compressMode">طريقة الضغط</label><select id="compressMode"><option value="auto" selected>ذكي: احمِ النص القابل للبحث والنسخ</option><option value="raster">ضغط بصري بالصور (قد يفقد النص)</option></select><small style="display:block;margin-top:7px;line-height:1.7">في الوضع الذكي: PDF النصي يُعاد حفظه دون تحويله لصور؛ الملفات الممسوحة تُضغط بصريًا. إذا لم يصغر الحجم ستظهر رسالة صريحة بدل نتيجة مضللة.</small></div>`;
  return html.replace('<div class="notice" style="margin-top:14px">'+COMPRESS_NOTICE+'</div>',ui+'<div class="notice" style="margin-top:14px">⚠️ الضغط بالصور قد يفقد النص القابل للتحديد، والعلامات والتوقيعات الرقمية قد لا تبقى صالحة بعد أي تعديل للملف. احتفظ دائمًا بالأصل.</div>');
}
export function patchOcrPage(html) {
  if(!html.includes('id="ocrLang"')||!html.includes('id="runTool"'))throw new Error('V18.4: OCR page source changed');
  if(html.includes('id="ocrStrategy"'))throw new Error('V18.4: OCR page already patched');
  const newUI='<div class="field"><label for="ocrStrategy">طريقة استخراج النص</label><select id="ocrStrategy"><option value="smart" selected>ذكي: استخدم النص الأصلي إذا وجد، وOCR للصفحات المصورة</option><option value="force">OCR بصري لكل الصفحات</option></select></div><div class="notice" style="margin-top:14px">الناتج ملف TXT نصي، وليس PDF قابلًا للبحث. المعالجة على جهازك؛ يحتاج OCR تنزيل محرك وملفات اللغة أول استخدام.</div>';
  return html.replace('<div class="notice" style="margin-top:14px">أول استخدام قد يحتاج تنزيل ملفات لغة OCR إلى المتصفح، وقد تكون العملية أبطأ على الهاتف.</div>',newUI);
}
export function installPdfQualityPatch(dist) {
  const files=[
    ['assets/js/tool-engine.v14.js',patchPdfEngine],
    ['tools/compress-pdf/index.html',patchCompressPage],
    ['tools/ocr-pdf/index.html',patchOcrPage]
  ];
  // Compute all changes first so a failing source assertion does not partially update dist.
  const changed=files.map(([f,patch])=>{
    const name=path.join(dist,f);
    if(!fs.existsSync(name))throw new Error('V18.4: missing build output '+f);
    const old=fs.readFileSync(name,'utf8');
    return [name,patch(old)];
  });
  for(const [p,c] of changed)fs.writeFileSync(p,c);
  console.log('DocMivo V18.4: OCR worker reused, text layers protected during compression, honest TXT output.');
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const here=path.dirname(fileURLToPath(import.meta.url));
  installPdfQualityPatch(path.join(here,'../dist'));
}

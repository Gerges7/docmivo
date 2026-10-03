const { PDFDocument, degrees, StandardFonts, rgb } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const slug=document.body.dataset.tool;
const tool=(window.DOCMIVO_TOOLS||[]).find(t=>t.slug===slug);
let files=[];
const $=s=>document.querySelector(s);
const input=$('#fileInput'),drop=$('#dropzone'),list=$('#fileList'),controls=$('#controls'),statusEl=$('#status'),run=$('#runTool');
const PT_PER_MM=72/25.4;
function human(bytes){if(bytes<1024)return bytes+' B';if(bytes<1048576)return(bytes/1024).toFixed(1)+' KB';return(bytes/1048576).toFixed(2)+' MB'}
function status(msg,type=''){if(!statusEl)return;statusEl.textContent=msg;statusEl.className='status show '+type}
function clearStatus(){if(!statusEl)return;statusEl.className='status';statusEl.textContent=''}
function download(blob,name){try{window.gtag?.('event','file_download',{tool:slug,file_name:name});}catch{}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
function pdfFile(){return files.find(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name))}
function imageFile(){return files.find(f=>/^image\/(png|jpeg)$/.test(f.type)||/\.(png|jpe?g)$/i.test(f.name))}
function renderFiles(){if(!list)return;list.innerHTML='';files.forEach((f,i)=>{const d=document.createElement('div');d.className='file-row';d.innerHTML=`<span>${f.type.startsWith('image/')?'🖼️':'📄'}</span><div class="grow"><div class="name"></div><small>${human(f.size)}</small></div><div class="row-actions">${files.length>1?`<button class="icon-btn" data-up="${i}">↑</button><button class="icon-btn" data-down="${i}">↓</button>`:''}<button class="icon-btn" data-remove="${i}">✕</button></div>`;d.querySelector('.name').textContent=f.name;list.appendChild(d)});if(controls)controls.classList.toggle('show',files.length>0||tool?.noFile)}
if(list)list.addEventListener('click',e=>{let i;if(e.target.dataset.remove!==undefined){i=+e.target.dataset.remove;files.splice(i,1)}else if(e.target.dataset.up!==undefined){i=+e.target.dataset.up;if(i>0)[files[i-1],files[i]]=[files[i],files[i-1]]}else if(e.target.dataset.down!==undefined){i=+e.target.dataset.down;if(i<files.length-1)[files[i+1],files[i]]=[files[i],files[i+1]]}renderFiles()});
async function maybePrefill(f){try{if(slug==='text-to-pdf'&&/\.txt$/i.test(f.name))$('#textContent').value=await f.text();if(slug==='html-to-pdf'&&/\.html?$/i.test(f.name))$('#htmlContent').value=await f.text();if(slug==='markdown-to-pdf'&&/\.(md|markdown|txt)$/i.test(f.name))$('#markdownContent').value=await f.text()}catch{}}
function addFiles(fs){const incoming=[...fs];if(!tool.multiple)files=incoming.slice(0,1);else files=[...files,...incoming];incoming.forEach(maybePrefill);renderFiles();clearStatus()}
if(input)input.addEventListener('change',e=>addFiles(e.target.files));
function openFilePicker(){if(!input)return;input.value='';input.click()}
if(drop){
 ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
 ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
 drop.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
 // The whole dropzone AND the visible button open the browser picker.
 drop.addEventListener('click',e=>{e.preventDefault();openFilePicker()});
 drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFilePicker()}});
}
if(tool?.noFile)setTimeout(renderFiles,0);

function parsePages(expr,total){const out=[];String(expr||'').split(',').forEach(part=>{part=part.trim();if(!part)return;if(part.includes('-')){let[a,b]=part.split('-').map(Number);if(!b)b=total;for(let i=Math.max(1,a);i<=Math.min(total,b);i++)out.push(i-1)}else{const n=Number(part);if(n>=1&&n<=total)out.push(n-1)}});return [...new Set(out)]}
async function loadPdf(file){return PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:true})}
async function renderCanvasFromPage(pdf,pageNum,scale=1.6){const page=await pdf.getPage(pageNum),vp=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;return canvas}
function canvasBlob(canvas,type='image/jpeg',quality=.9){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('تعذر إنشاء الصورة.')),type,quality))}
function posXY(pageW,pageH,objW,objH,pos,pad=28){switch(pos){case'top-left':return[pad,pageH-objH-pad];case'top-center':return[(pageW-objW)/2,pageH-objH-pad];case'top-right':return[pageW-objW-pad,pageH-objH-pad];case'bottom-left':return[pad,pad];case'bottom-center':return[(pageW-objW)/2,pad];case'bottom-right':return[pageW-objW-pad,pad];default:return[(pageW-objW)/2,(pageH-objH)/2]}}
function sanitizeHtml(raw){const doc=new DOMParser().parseFromString(raw,'text/html');doc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]').forEach(n=>n.remove());doc.querySelectorAll('*').forEach(el=>{[...el.attributes].forEach(a=>{if(/^on/i.test(a.name)||((a.name==='href'||a.name==='src')&&/^javascript:/i.test(a.value)))el.removeAttribute(a.name)})});return doc.body.innerHTML}
function printableHost(inner){
 const host=document.createElement('div');
 host.dir='auto';
 // Keep the source inside the viewport while html2canvas renders it. V6 placed it at -99999px,
 // which could produce a completely blank canvas/PDF in some browsers.
 host.style.cssText='position:fixed;left:0;top:0;width:794px;min-height:1123px;padding:52px;box-sizing:border-box;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif;line-height:1.6;overflow-wrap:anywhere;z-index:2147483000;pointer-events:none;';
 host.innerHTML=inner;
 document.body.appendChild(host);
 return host;
}
function conversionCover(){
 const cover=document.createElement('div');
 cover.setAttribute('aria-live','polite');
 cover.style.cssText='position:fixed;inset:0;z-index:2147483001;background:rgba(248,250,252,.98);display:grid;place-items:center;text-align:center;color:#0f172a;font:700 16px Arial,Tahoma,sans-serif;';
 cover.innerHTML='<div><div style="font-size:34px;margin-bottom:12px">📄</div><div>جاري تجهيز ملف PDF…</div><div style="font-size:12px;font-weight:400;color:#64748b;margin-top:8px">لا تغلق الصفحة أثناء التحويل</div></div>';
 document.body.appendChild(cover);return cover;
}
async function waitForHostAssets(host){
 try{if(document.fonts?.ready)await document.fonts.ready}catch{}
 const imgs=[...host.querySelectorAll('img')];
 await Promise.all(imgs.map(img=>{
   if(img.complete)return Promise.resolve();
   return new Promise(resolve=>{const done=()=>resolve();img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});setTimeout(done,3500)});
 }));
}
async function htmlHostToPdf(host,name){
 const cover=conversionCover();
 try{
  if(!host.innerText.trim()&&!host.querySelector('img,table,svg,canvas'))throw new Error('لم يتم العثور على محتوى قابل للتحويل داخل الملف.');
  await waitForHostAssets(host);
  // Avoid avoid-all here: it can create blank leading pages for complex Word/HTML layouts.
  const worker=html2pdf().set({
   margin:[10,10,10,10],filename:name,
   image:{type:'jpeg',quality:.96},
   html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',scrollX:0,scrollY:0,windowWidth:Math.max(794,host.scrollWidth),windowHeight:Math.max(1123,host.scrollHeight)},
   jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
   pagebreak:{mode:['css','legacy']}
  }).from(host).toPdf();
  const blob=await worker.outputPdf('blob');
  if(!(blob instanceof Blob)||blob.size<1200)throw new Error('تعذر إنشاء PDF صالح. جرّب الملف مرة أخرى أو استخدم مستند DOCX أبسط.');
  // Sanity-check that a readable PDF with at least one page was produced before downloading.
  try{const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;if(!pdf.numPages)throw new Error('empty')}catch{throw new Error('تم إنشاء ملف غير صالح. لم يتم تنزيله لحمايتك من نتيجة فارغة.');}
  download(blob,name);
  return blob;
 }finally{host.remove();cover.remove()}
}


function escapeText(s){return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function textImage(doc,text,fontSize=12,color='#222',bold=false){
 const c=document.createElement('canvas'),ctx=c.getContext('2d');
 const family='Arial, Tahoma, sans-serif';ctx.font=`${bold?'700':'400'} ${fontSize*2}px ${family}`;ctx.direction='rtl';
 const w=Math.max(80,Math.ceil(ctx.measureText(text).width+28)),h=Math.ceil(fontSize*3.2);c.width=w;c.height=h;
 ctx.font=`${bold?'700':'400'} ${fontSize*2}px ${family}`;ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,w/2,h/2);
 return {img:await doc.embedPng(c.toDataURL('image/png')),w:w/2,h:h/2};
}
function fieldValue(field){try{if(typeof field.getText==='function')return field.getText()||'';if(typeof field.getSelected==='function')return field.getSelected();if(typeof field.isChecked==='function')return field.isChecked();}catch{}return null}

async function processTool(){
 if(!tool)return;
 if(!tool.noFile&&!files.length){status('اختر ملفًا أولاً.','err');return}
 run?.classList.add('loading');if(run)run.disabled=true;try{window.gtag?.('event','tool_start',{tool:slug});}catch{}status('جاري المعالجة على جهازك…');
 try{
  if(slug==='merge-pdf'){
   if(files.length<2)throw new Error('اختر ملفي PDF على الأقل.');const out=await PDFDocument.create();for(const f of files){const src=await loadPdf(f);const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p))}download(new Blob([await out.save()],{type:'application/pdf'}),'merged.pdf');
  } else if(slug==='split-pdf'){
   const src=await loadPdf(files[0]),total=src.getPageCount(),expr=$('#pageRanges').value.trim(),ranges=expr?expr.split(';').map(x=>x.trim()).filter(Boolean):Array.from({length:total},(_,i)=>String(i+1)),zip=new JSZip();for(let r=0;r<ranges.length;r++){const idx=parsePages(ranges[r],total);if(!idx.length)continue;const out=await PDFDocument.create();(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));zip.file(`part-${r+1}.pdf`,await out.save())}download(await zip.generateAsync({type:'blob'}),'split-pdf.zip');
  } else if(slug==='extract-pages'){
   const src=await loadPdf(files[0]),idx=parsePages($('#pageRanges').value,src.getPageCount());if(!idx.length)throw new Error('اكتب صفحات صحيحة مثل 1-3,5');const out=await PDFDocument.create();(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));download(new Blob([await out.save()],{type:'application/pdf'}),'extracted-pages.pdf');
  } else if(slug==='delete-pages'){
   const src=await loadPdf(files[0]),del=new Set(parsePages($('#pageRanges').value,src.getPageCount())),keep=src.getPageIndices().filter(i=>!del.has(i));if(!keep.length)throw new Error('لا يمكن حذف كل الصفحات.');const out=await PDFDocument.create();(await out.copyPages(src,keep)).forEach(p=>out.addPage(p));download(new Blob([await out.save()],{type:'application/pdf'}),'cleaned.pdf');
  } else if(slug==='reorder-pages'){
   const src=await loadPdf(files[0]),idx=parsePages($('#pageOrder').value,src.getPageCount());if(idx.length!==src.getPageCount())throw new Error('أدخل ترتيبًا يشمل كل الصفحات مرة واحدة، مثل 3,1,2.');const out=await PDFDocument.create();(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));download(new Blob([await out.save()],{type:'application/pdf'}),'reordered.pdf');
  } else if(slug==='rotate-pdf'){
   const doc=await loadPdf(files[0]),angle=Number($('#rotation').value);doc.getPages().forEach(p=>p.setRotation(degrees((p.getRotation().angle+angle)%360)));download(new Blob([await doc.save()],{type:'application/pdf'}),'rotated.pdf');
  } else if(slug==='watermark-pdf'){
   const doc=await loadPdf(files[0]),text=$('#watermarkText').value||'DocMivo',opacity=Number($('#opacity').value),size=Number($('#fontSize').value),ti=await textImage(doc,text,size,'#555',true);for(const p of doc.getPages()){const{width,height}=p.getSize(),w=Math.min(ti.w,width*.72),h=ti.h*(w/ti.w);p.drawImage(ti.img,{x:(width-w)/2,y:(height-h)/2,width:w,height:h,opacity,rotate:degrees(-35)})}download(new Blob([await doc.save()],{type:'application/pdf'}),'watermarked.pdf');
  } else if(slug==='page-numbers'){
   const doc=await loadPdf(files[0]),font=await doc.embedFont(StandardFonts.Helvetica),pos=$('#position').value,start=Number($('#startNumber').value||1),size=Number($('#fontSize').value||11);doc.getPages().forEach((p,i)=>{const text=String(start+i),{width,height}=p.getSize(),tw=font.widthOfTextAtSize(text,size);const[x,y]=posXY(width,height,tw,size,pos,20);p.drawText(text,{x,y,size,font,color:rgb(.2,.2,.25)})});download(new Blob([await doc.save()],{type:'application/pdf'}),'numbered.pdf');
  } else if(slug==='images-to-pdf'){
   const out=await PDFDocument.create();for(const f of files){const bytes=await f.arrayBuffer();let img;if(f.type==='image/png')img=await out.embedPng(bytes);else if(f.type==='image/jpeg')img=await out.embedJpg(bytes);else{const bmp=await createImageBitmap(f),c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);const b=await canvasBlob(c,'image/jpeg',.92);img=await out.embedJpg(await b.arrayBuffer())}const maxW=595.28,maxH=841.89,ratio=Math.min(maxW/img.width,maxH/img.height,1),w=img.width*ratio,h=img.height*ratio,page=out.addPage([maxW,maxH]);page.drawImage(img,{x:(maxW-w)/2,y:(maxH-h)/2,width:w,height:h})}download(new Blob([await out.save()],{type:'application/pdf'}),'images.pdf');
  } else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise,zip=new JSZip(),fmt=slug.endsWith('png')?'png':slug.endsWith('webp')?'webp':'jpeg',ext=fmt==='jpeg'?'jpg':fmt,q=Number($('#quality')?.value||.9),scale=Number($('#scale')?.value||1.7);for(let i=1;i<=pdf.numPages;i++){status(`جاري تحويل الصفحة ${i} من ${pdf.numPages}…`);const canvas=await renderCanvasFromPage(pdf,i,scale),blob=await canvasBlob(canvas,`image/${fmt}`,q);zip.file(`page-${i}.${ext}`,blob)}download(await zip.generateAsync({type:'blob'}),`pdf-pages-${ext}.zip`);
  } else if(slug==='compress-pdf'||slug==='grayscale-pdf'){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise,quality=Number($('#quality').value),scale=Number($('#scale').value),out=await PDFDocument.create();for(let i=1;i<=pdf.numPages;i++){status(`${slug==='grayscale-pdf'?'تحويل':'ضغط'} الصفحة ${i} من ${pdf.numPages}…`);const page=await pdf.getPage(i),base=page.getViewport({scale:1}),canvas=await renderCanvasFromPage(pdf,i,scale),ctx=canvas.getContext('2d');if(slug==='grayscale-pdf'){const im=ctx.getImageData(0,0,canvas.width,canvas.height),d=im.data;for(let p=0;p<d.length;p+=4){const g=Math.round(.299*d[p]+.587*d[p+1]+.114*d[p+2]);d[p]=d[p+1]=d[p+2]=g}ctx.putImageData(im,0,0)}const blob=await canvasBlob(canvas,'image/jpeg',quality),img=await out.embedJpg(await blob.arrayBuffer()),p=out.addPage([base.width,base.height]);p.drawImage(img,{x:0,y:0,width:base.width,height:base.height})}download(new Blob([await out.save()],{type:'application/pdf'}),slug==='grayscale-pdf'?'grayscale.pdf':'compressed.pdf');
  } else if(slug==='extract-text'){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise;let text='';for(let i=1;i<=pdf.numPages;i++){status(`قراءة الصفحة ${i} من ${pdf.numPages}…`);const page=await pdf.getPage(i),tc=await page.getTextContent();text+=`\n\n--- Page ${i} ---\n`+tc.items.map(x=>x.str).join(' ')}download(new Blob([text],{type:'text/plain;charset=utf-8'}),'extracted-text.txt');
  } else if(slug==='ocr-pdf'){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise,lang=$('#ocrLang').value;let text='';for(let i=1;i<=pdf.numPages;i++){status(`OCR الصفحة ${i} من ${pdf.numPages} — قد يستغرق ذلك بعض الوقت…`);const canvas=await renderCanvasFromPage(pdf,i,1.5),r=await Tesseract.recognize(canvas,lang,{logger:m=>{if(m.progress)status(`OCR الصفحة ${i}/${pdf.numPages}: ${Math.round(m.progress*100)}%`)}});text+=`\n\n--- Page ${i} ---\n${r.data.text}`;}download(new Blob([text],{type:'text/plain;charset=utf-8'}),'ocr-text.txt');
  } else if(slug==='pdf-info'){
   const f=files[0],doc=await loadPdf(f),info={name:f.name,size:human(f.size),pages:doc.getPageCount(),title:doc.getTitle()||'—',author:doc.getAuthor()||'—',subject:doc.getSubject()||'—',creator:doc.getCreator()||'—',producer:doc.getProducer()||'—'};$('#infoBox').innerHTML=Object.entries(info).map(([k,v])=>`<div class="file-row"><strong style="min-width:110px">${k}</strong><span>${String(v).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</span></div>`).join('');
  } else if(slug==='remove-metadata'){
   const doc=await loadPdf(files[0]);doc.setTitle('');doc.setAuthor('');doc.setSubject('');doc.setKeywords([]);doc.setCreator('');doc.setProducer('');download(new Blob([await doc.save()],{type:'application/pdf'}),'metadata-removed.pdf');
  } else if(slug==='edit-metadata'){
   const doc=await loadPdf(files[0]);doc.setTitle($('#metaTitle').value||'');doc.setAuthor($('#metaAuthor').value||'');doc.setSubject($('#metaSubject').value||'');doc.setKeywords(($('#metaKeywords').value||'').split(',').map(x=>x.trim()).filter(Boolean));download(new Blob([await doc.save()],{type:'application/pdf'}),'metadata-updated.pdf');
  } else if(slug==='text-to-pdf'){
   const text=$('#textContent').value.trim();if(!text)throw new Error('اكتب النص أولاً.');const fontSize=Number($('#fontSize').value||13),host=printableHost('');host.style.fontSize=fontSize+'px';host.style.whiteSpace='pre-wrap';host.textContent=text;await htmlHostToPdf(host,'text.pdf');
  } else if(slug==='sign-pdf'||slug==='add-image-pdf'){
   const pf=pdfFile(),imf=imageFile();if(!pf||!imf)throw new Error('اختر ملف PDF وصورة PNG أو JPG.');const doc=await loadPdf(pf),pageNo=Math.max(1,Number($('#targetPage').value||1));if(pageNo>doc.getPageCount())throw new Error('رقم الصفحة أكبر من عدد صفحات الملف.');const bytes=await imf.arrayBuffer(),img=imf.type==='image/png'?await doc.embedPng(bytes):await doc.embedJpg(bytes),p=doc.getPage(pageNo-1),{width,height}=p.getSize(),w=Math.min(Number($('#imageWidth').value||150),width*.8),h=w*(img.height/img.width),[x,y]=posXY(width,height,w,h,$('#position').value,28);p.drawImage(img,{x,y,width:w,height:h});download(new Blob([await doc.save()],{type:'application/pdf'}),slug==='sign-pdf'?'signed.pdf':'image-added.pdf');
  } else if(slug==='add-text-pdf'){
   const text=$('#overlayText').value.trim();if(!text)throw new Error('اكتب النص أولاً.');const doc=await loadPdf(files[0]),pageNo=Math.max(1,Number($('#targetPage').value||1));if(pageNo>doc.getPageCount())throw new Error('رقم الصفحة أكبر من عدد صفحات الملف.');const p=doc.getPage(pageNo-1),size=Number($('#fontSize').value||18),ti=await textImage(doc,text,size,'#141419',false),{width,height}=p.getSize(),w=Math.min(ti.w,width*.82),h=ti.h*(w/ti.w),[x,y]=posXY(width,height,w,h,$('#position').value,28);p.drawImage(ti.img,{x,y,width:w,height:h});download(new Blob([await doc.save()],{type:'application/pdf'}),'text-added.pdf');
  } else if(slug==='crop-pdf'){
   const doc=await loadPdf(files[0]),top=Number($('#cropTop').value||0)*PT_PER_MM,bottom=Number($('#cropBottom').value||0)*PT_PER_MM,left=Number($('#cropLeft').value||0)*PT_PER_MM,right=Number($('#cropRight').value||0)*PT_PER_MM;doc.getPages().forEach(p=>{const{width,height}=p.getSize(),nw=width-left-right,nh=height-top-bottom;if(nw<50||nh<50)throw new Error('قيم القص كبيرة جدًا مقارنة بحجم الصفحة.');p.setCropBox(left,bottom,nw,nh)});download(new Blob([await doc.save()],{type:'application/pdf'}),'cropped.pdf');
  } else if(slug==='resize-pdf'){
   const src=await loadPdf(files[0]),sizes={a4:[595.28,841.89],a3:[841.89,1190.55],letter:[612,792]},[tw,th]=sizes[$('#pageSize').value],out=await PDFDocument.create();for(let i=0;i<src.getPageCount();i++){const sp=src.getPage(i),emb=await out.embedPage(sp),sw=sp.getWidth(),sh=sp.getHeight(),scale=Math.min(tw/sw,th/sh),w=sw*scale,h=sh*scale,p=out.addPage([tw,th]);p.drawPage(emb,{x:(tw-w)/2,y:(th-h)/2,width:w,height:h})}download(new Blob([await out.save()],{type:'application/pdf'}),'resized.pdf');
  } else if(slug==='flatten-pdf'){
   const doc=await loadPdf(files[0]);try{doc.getForm().flatten()}catch{}download(new Blob([await doc.save()],{type:'application/pdf'}),'flattened.pdf');
  } else if(slug==='reverse-pages'){
   const src=await loadPdf(files[0]),out=await PDFDocument.create(),idx=src.getPageIndices().reverse();(await out.copyPages(src,idx)).forEach(p=>out.addPage(p));download(new Blob([await out.save()],{type:'application/pdf'}),'reversed.pdf');
  } else if(slug==='duplicate-pages'){
   const src=await loadPdf(files[0]),dups=new Set(parsePages($('#pageRanges').value,src.getPageCount())),copies=Math.max(1,Math.min(10,Number($('#copies').value||1))),out=await PDFDocument.create();if(!dups.size)throw new Error('اكتب الصفحات المراد تكرارها.');for(let i=0;i<src.getPageCount();i++){const [p]=await out.copyPages(src,[i]);out.addPage(p);if(dups.has(i))for(let c=0;c<copies;c++){const [dup]=await out.copyPages(src,[i]);out.addPage(dup)}}download(new Blob([await out.save()],{type:'application/pdf'}),'duplicated-pages.pdf');
  } else if(slug==='mix-pdf'){
   const pdfs=files.filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');if(pdfs.length<2)throw new Error('اختر ملفي PDF على الأقل.');const a=await loadPdf(pdfs[0]),b=await loadPdf(pdfs[1]),out=await PDFDocument.create(),n=Math.max(a.getPageCount(),b.getPageCount());for(let i=0;i<n;i++){if(i<a.getPageCount()){const[p]=await out.copyPages(a,[i]);out.addPage(p)}if(i<b.getPageCount()){const[p]=await out.copyPages(b,[i]);out.addPage(p)}}download(new Blob([await out.save()],{type:'application/pdf'}),'mixed.pdf');
  } else if(slug==='pdf-to-powerpoint'){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise,scale=Number($('#scale').value||1.35),pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='DocMivo';pptx.subject='PDF converted to PowerPoint';for(let i=1;i<=pdf.numPages;i++){status(`إنشاء الشريحة ${i} من ${pdf.numPages}…`);const canvas=await renderCanvasFromPage(pdf,i,scale),dataUrl=canvas.toDataURL('image/jpeg',.9),slide=pptx.addSlide();slide.background={color:'FFFFFF'};slide.addImage({data:dataUrl,x:0,y:0,w:13.333,h:7.5,sizing:'contain'})}await pptx.writeFile({fileName:'pdf-to-powerpoint.pptx'});
  } else if(slug==='word-to-pdf'){
   const f=files[0];if(!/\.docx$/i.test(f.name))throw new Error('اختر ملف DOCX.');
   status('جاري قراءة ملف Word…');
   const r=await mammoth.convertToHtml({arrayBuffer:await f.arrayBuffer()});
   const clean=sanitizeHtml(r.value||'');
   if(!clean.trim())throw new Error('لم نتمكن من قراءة محتوى ملف Word. تأكد أن الملف DOCX سليم وغير محمي.');
   const host=printableHost(clean);
   host.querySelectorAll('img').forEach(img=>{img.style.maxWidth='100%';img.style.height='auto'});
   host.querySelectorAll('table').forEach(t=>t.style.cssText+=';border-collapse:collapse;width:100%;max-width:100%;');
   host.querySelectorAll('td,th').forEach(td=>td.style.cssText+=';border:1px solid #d1d5db;padding:6px;vertical-align:top;');
   host.querySelectorAll('p').forEach(el=>el.style.cssText+=';margin:0 0 10px;');
   host.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el=>el.style.cssText+=';page-break-after:avoid;margin:16px 0 8px;');
   status('جاري إنشاء صفحات PDF…');
   await htmlHostToPdf(host,'word-converted.pdf');
  } else if(slug==='excel-to-pdf'){
   const wb=XLSX.read(await files[0].arrayBuffer(),{type:'array'}),parts=[];for(const name of wb.SheetNames){parts.push(`<section style="page-break-after:always"><h2>${String(name).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</h2>${XLSX.utils.sheet_to_html(wb.Sheets[name])}</section>`)}const host=printableHost(parts.join(''));host.querySelectorAll('table').forEach(t=>t.style.cssText='border-collapse:collapse;width:100%;font-size:11px');host.querySelectorAll('td,th').forEach(td=>td.style.cssText='border:1px solid #bbb;padding:4px;');await htmlHostToPdf(host,'excel-converted.pdf');
  } else if(slug==='html-to-pdf'){
   const raw=$('#htmlContent').value.trim()||(files[0]?await files[0].text():'');if(!raw)throw new Error('الصق HTML أو اختر ملف HTML.');const host=printableHost(sanitizeHtml(raw));await htmlHostToPdf(host,'html-converted.pdf');
  } else if(slug==='markdown-to-pdf'){
   const raw=$('#markdownContent').value.trim()||(files[0]?await files[0].text():'');if(!raw)throw new Error('اكتب Markdown أو اختر ملف MD.');const host=printableHost(sanitizeHtml(marked.parse(raw)));host.querySelectorAll('pre').forEach(p=>p.style.cssText='background:#f3f4f6;padding:12px;overflow-wrap:anywhere;white-space:pre-wrap');await htmlHostToPdf(host,'markdown-converted.pdf');

  } else if(slug==='bates-numbering'){
   const doc=await loadPdf(files[0]),prefix=$('#prefix').value||'',suffix=$('#suffix').value||'',start=Math.max(0,Number($('#startNumber').value||1)),digits=Math.max(1,Math.min(12,Number($('#digits').value||6))),pos=$('#position').value,size=Math.max(6,Math.min(48,Number($('#fontSize').value||10))),font=await doc.embedFont(StandardFonts.Helvetica);
   doc.getPages().forEach((p,i)=>{const text=`${prefix}${String(start+i).padStart(digits,'0')}${suffix}`,{width,height}=p.getSize(),tw=font.widthOfTextAtSize(text,size),[x,y]=posXY(width,height,tw,size,pos,18);p.drawText(text,{x,y,size,font,color:rgb(.12,.12,.16)})});
   download(new Blob([await doc.save()],{type:'application/pdf'}),'bates-numbered.pdf');
  } else if(slug==='headers-footers'){
   const doc=await loadPdf(files[0]),header=$('#headerText').value.trim(),footer=$('#footerText').value.trim(),size=Math.max(7,Math.min(36,Number($('#fontSize').value||10))),pages=doc.getPages();if(!header&&!footer)throw new Error('اكتب Header أو Footer على الأقل.');
   for(let i=0;i<pages.length;i++){const p=pages[i],{width,height}=p.getSize();for(const [kind,tmpl] of [['header',header],['footer',footer]]){if(!tmpl)continue;const text=tmpl.replaceAll('{page}',String(i+1)).replaceAll('{pages}',String(pages.length)),ti=await textImage(doc,text,size,'#222',false),w=Math.min(ti.w,width-40),h=ti.h,x=(width-w)/2,y=kind==='header'?height-h-14:14;p.drawImage(ti.img,{x,y,width:w,height:h})}}
   download(new Blob([await doc.save()],{type:'application/pdf'}),'headers-footers.pdf');
  } else if(slug==='n-up-pdf'){
   const src=await loadPdf(files[0]),per=Number($('#nup').value||2),orientation=$('#orientation').value,A4=[595.28,841.89],sheet=orientation==='landscape'?[A4[1],A4[0]]:A4,out=await PDFDocument.create(),count=src.getPageCount(),cols=per===4?2:(orientation==='landscape'?2:1),rows=per/cols,cellW=sheet[0]/cols,cellH=sheet[1]/rows,pad=10;
   for(let start=0;start<count;start+=per){const page=out.addPage(sheet);for(let k=0;k<per&&start+k<count;k++){const sp=src.getPage(start+k),emb=await out.embedPage(sp),sw=sp.getWidth(),sh=sp.getHeight(),scale=Math.min((cellW-2*pad)/sw,(cellH-2*pad)/sh),w=sw*scale,h=sh*scale,col=k%cols,row=Math.floor(k/cols),x=col*cellW+(cellW-w)/2,y=sheet[1]-(row+1)*cellH+(cellH-h)/2;page.drawPage(emb,{x,y,width:w,height:h})}}
   download(new Blob([await out.save()],{type:'application/pdf'}),`n-up-${per}.pdf`);
  } else if(slug==='booklet-pdf'){
   const src=await loadPdf(files[0]),out=await PDFDocument.create(),count=src.getPageCount(),padded=Math.ceil(count/4)*4,sheet=[841.89,595.28],half=sheet[0]/2;
   async function drawPair(leftIdx,rightIdx){const page=out.addPage(sheet);for(const [idx,x0] of [[leftIdx,0],[rightIdx,half]]){if(idx<0||idx>=count)continue;const sp=src.getPage(idx),emb=await out.embedPage(sp),sw=sp.getWidth(),sh=sp.getHeight(),scale=Math.min((half-20)/sw,(sheet[1]-20)/sh),w=sw*scale,h=sh*scale;page.drawPage(emb,{x:x0+(half-w)/2,y:(sheet[1]-h)/2,width:w,height:h})}}
   for(let i=0;i<padded/4;i++){const a=padded-1-2*i,b=2*i,c=2*i+1,d=padded-2-2*i;await drawPair(a,b);await drawPair(c,d)}
   download(new Blob([await out.save()],{type:'application/pdf'}),'booklet.pdf');
  } else if(slug==='add-margins-pdf'){
   const src=await loadPdf(files[0]),top=Math.max(0,Number($('#marginTop').value||10))*PT_PER_MM,bottom=Math.max(0,Number($('#marginBottom').value||10))*PT_PER_MM,left=Math.max(0,Number($('#marginLeft').value||10))*PT_PER_MM,right=Math.max(0,Number($('#marginRight').value||10))*PT_PER_MM,out=await PDFDocument.create();
   for(let i=0;i<src.getPageCount();i++){const sp=src.getPage(i),emb=await out.embedPage(sp),sw=sp.getWidth(),sh=sp.getHeight(),p=out.addPage([sw+left+right,sh+top+bottom]);p.drawPage(emb,{x:left,y:bottom,width:sw,height:sh})}download(new Blob([await out.save()],{type:'application/pdf'}),'with-margins.pdf');
  } else if(slug==='remove-blank-pages'){
   const data=new Uint8Array(await files[0].arrayBuffer()),pdf=await pdfjsLib.getDocument({data}).promise,src=await loadPdf(files[0]),threshold=Math.max(.0001,Math.min(.1,Number($('#blankThreshold').value||0.005))),keep=[];
   for(let i=1;i<=pdf.numPages;i++){status(`تحليل الصفحة ${i} من ${pdf.numPages}…`);const canvas=await renderCanvasFromPage(pdf,i,.35),d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let dark=0,total=0;for(let p=0;p<d.length;p+=16){const lum=.299*d[p]+.587*d[p+1]+.114*d[p+2];if(lum<245)dark++;total++}if(dark/total>=threshold)keep.push(i-1)}if(!keep.length)throw new Error('تم اعتبار كل الصفحات فارغة. خفّض حساسية الكشف.');const out=await PDFDocument.create();(await out.copyPages(src,keep)).forEach(p=>out.addPage(p));download(new Blob([await out.save()],{type:'application/pdf'}),'blank-pages-removed.pdf');status(`تم الاحتفاظ بـ ${keep.length} صفحة وحذف ${src.getPageCount()-keep.length} صفحة شبه فارغة.`,'ok');
  } else if(slug==='compare-pdf'){
   const pdfs=files.filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');if(pdfs.length!==2)throw new Error('اختر ملفي PDF بالضبط.');const a=await pdfjsLib.getDocument({data:new Uint8Array(await pdfs[0].arrayBuffer())}).promise,b=await pdfjsLib.getDocument({data:new Uint8Array(await pdfs[1].arrayBuffer())}).promise,zip=new JSZip(),n=Math.max(a.numPages,b.numPages),report=[];
   for(let i=1;i<=n;i++){status(`مقارنة الصفحة ${i} من ${n}…`);if(i>a.numPages||i>b.numPages){report.push(`Page ${i}: missing from ${i>a.numPages?'first':'second'} file`);continue}const ca=await renderCanvasFromPage(a,i,1),cb=await renderCanvasFromPage(b,i,1),w=Math.max(ca.width,cb.width),h=Math.max(ca.height,cb.height),oa=document.createElement('canvas'),ob=document.createElement('canvas');oa.width=ob.width=w;oa.height=ob.height=h;oa.getContext('2d').fillStyle=ob.getContext('2d').fillStyle='#fff';oa.getContext('2d').fillRect(0,0,w,h);ob.getContext('2d').fillRect(0,0,w,h);oa.getContext('2d').drawImage(ca,0,0);ob.getContext('2d').drawImage(cb,0,0);const da=oa.getContext('2d').getImageData(0,0,w,h),db=ob.getContext('2d').getImageData(0,0,w,h),diff=document.createElement('canvas');diff.width=w;diff.height=h;const ctx=diff.getContext('2d'),im=ctx.createImageData(w,h);let changed=0;for(let p=0;p<da.data.length;p+=4){const delta=Math.abs(da.data[p]-db.data[p])+Math.abs(da.data[p+1]-db.data[p+1])+Math.abs(da.data[p+2]-db.data[p+2]);const c=delta>45;if(c)changed++;im.data[p]=c?220:255;im.data[p+1]=c?30:255;im.data[p+2]=c?30:255;im.data[p+3]=255}ctx.putImageData(im,0,0);const pct=(changed/(w*h)*100).toFixed(2);report.push(`Page ${i}: ${pct}% pixels changed`);zip.file(`diff-page-${i}.png`,await canvasBlob(diff,'image/png'))}zip.file('report.txt',report.join('\\n'));download(await zip.generateAsync({type:'blob'}),'pdf-comparison.zip');
  } else if(slug==='inspect-pdf-forms'){
   const doc=await loadPdf(files[0]),fields=doc.getForm().getFields().map(f=>({name:f.getName(),type:f.constructor?.name||'Field',value:fieldValue(f)}));const pre=$('#infoBox');if(pre)pre.innerHTML=fields.length?fields.map(x=>`<div class="file-row"><strong class="grow">${escapeText(x.name)}</strong><span>${escapeText(x.type)}</span><small>${escapeText(JSON.stringify(x.value))}</small></div>`).join(''):'<p>لا توجد حقول نماذج تفاعلية في هذا الملف.</p>';download(new Blob([JSON.stringify(fields,null,2)],{type:'application/json'}),'pdf-form-fields.json');
  } else if(slug==='fill-pdf-form'){
   const doc=await loadPdf(files[0]),raw=$('#formData').value.trim();if(!raw)throw new Error('ألصق JSON يحتوي أسماء الحقول وقيمها.');let values;try{values=JSON.parse(raw)}catch{throw new Error('صيغة JSON غير صحيحة.')}const fields=doc.getForm().getFields();let filled=0;for(const f of fields){const name=f.getName();if(!(name in values))continue;const v=values[name];try{if(typeof f.setText==='function'){f.setText(String(v));filled++}else if(typeof f.select==='function'){f.select(Array.isArray(v)?v.map(String):String(v));filled++}else if(typeof f.check==='function'){if(v)f.check();else if(typeof f.uncheck==='function')f.uncheck();filled++}}catch{}}if($('#flattenAfter')?.checked)try{doc.getForm().flatten()}catch{}if(!filled)throw new Error('لم يتم العثور على حقول مطابقة لأسماء JSON. استخدم أداة فحص حقول PDF أولًا.');download(new Blob([await doc.save()],{type:'application/pdf'}),'form-filled.pdf');status(`تمت تعبئة ${filled} حقل.`,'ok');
  } else {throw new Error('هذه الأداة غير معروفة في النسخة الحالية.')}
  status('تمت العملية بنجاح. تم تجهيز الملف للتحميل.','ok');
 }catch(err){console.error(err);status(err.message||'حدث خطأ أثناء المعالجة.','err')}
 finally{run?.classList.remove('loading');if(run)run.disabled=false}
}
if(run)run.addEventListener('click',processTool);

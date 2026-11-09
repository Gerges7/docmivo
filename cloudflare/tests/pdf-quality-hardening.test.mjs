import {test} from 'node:test';
import assert from 'node:assert/strict';
import {docmivoCompressionPolicy,docmivoOcrLanguages,docmivoUseTextLayer,patchPdfEngine,patchCompressPage,patchOcrPage,installPdfQualityPatch} from '../scripts/pdf-quality-hardening.mjs';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const header='function parsePages(expr,total){return [];}';
const comp="} else if(slug==='compress-pdf'||slug==='grayscale-pdf'){const test=0; ";
const extract="} else if(slug==='extract-text'){const test=0;";
const ocr="} else if(slug==='ocr-pdf'){const test=0; ";
const info="} else if(slug==='pdf-info'){const test=0;";
const success="if(slug!=='word-to-pdf')status('تمت العملية بنجاح. تم تجهيز الملف للتحميل.','ok');";
const demoEngine=header+comp+extract+ocr+info+success;
const compPage='<div class="notice" style="margin-top:14px">هذه الطريقة تعيد بناء الصفحات كصور لتقليل الحجم، لذلك قد لا يبقى النص قابلًا للتحديد.</div><button id="runTool">start</button>';
const ocrPage='<select id="ocrLang"></select><div class="notice" style="margin-top:14px">أول استخدام قد يحتاج تنزيل ملفات لغة OCR إلى المتصفح، وقد تكون العملية أبطأ على الهاتف.</div><button id="runTool">start</button>';

test('compression policy protects searchable text by default',()=>{
 assert.equal(docmivoCompressionPolicy('auto',true),'preserve-text');
 assert.equal(docmivoCompressionPolicy('auto',false),'raster');
 assert.equal(docmivoCompressionPolicy('raster',true),'raster');
 assert.throws(()=>docmivoCompressionPolicy('invalid',true));
});
test('OCR language selection supports Arabic, English and both',()=>{
 assert.equal(docmivoOcrLanguages('eng'),'eng');
 assert.equal(docmivoOcrLanguages('ara'),'ara');
 assert.deepEqual(docmivoOcrLanguages('ara+eng'),['ara','eng']);
 assert.throws(()=>docmivoOcrLanguages('xx'));
});
test('smart OCR prefers text layer, forced OCR overrides it',()=>{
 assert.equal(docmivoUseTextLayer('smart','Original PDF text!'),true);
 assert.equal(docmivoUseTextLayer('smart',''),false);
 assert.equal(docmivoUseTextLayer('smart','a b c'),false);
 assert.equal(docmivoUseTextLayer('force','Original PDF text!'),false);
 assert.throws(()=>docmivoUseTextLayer('bad','Original PDF text!'));
});
test('compression branch prevents silent text loss and warns when not smaller',()=>{
 const js=patchPdfEngine(demoEngine);
 assert.match(js,/docmivoCompressionPolicy\(mode,hasText\)/);
 assert.match(js,/PDFDocument\.load\(raw\)/);
 assert.match(js,/useObjectStreams:true/);
 assert.match(js,/result\.byteLength>=files\[0\]\.size/);
 assert.match(js,/hasText=true/);
 assert.match(js,/15000000|16000000/);
 assert.match(js,/canvas\.width=0;canvas\.height=0/);
 assert.doesNotMatch(js,/const test=0; \s*} else if\(slug==='extract-text'\)/);
});
test('OCR initializes one worker and terminates it, does not silently claim searchable PDF',()=>{
 const js=patchPdfEngine(demoEngine);
 assert.match(js,/if\(!worker\)/);
 assert.match(js,/Tesseract\.createWorker\(lang,1/);
 assert.match(js,/await worker\.terminate\(\)/);
 assert.match(js,/embedded text/);
 assert.match(js,/ocr-text\.txt/);
 assert.match(js,/if\(!nonempty\)throw new Error/);
 assert.match(js,/if\(!\['word-to-pdf','compress-pdf','ocr-pdf'\]\.includes\(slug\)\)/);
});
test('generated processing branches are syntactically valid',()=>{
 const js=patchPdfEngine(demoEngine);
 const start=js.indexOf("} else if(slug==='compress-pdf'");
 const end=js.indexOf("if(!['word-to-pdf','compress-pdf','ocr-pdf'].includes(slug))");
 const fragment=js.slice(start,end);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction('slug',"if(slug==='merge-pdf'){ "+fragment+' }'));
});
test('compression UI communicates mode and text loss',()=>{
 const h=patchCompressPage(compPage);
 assert.match(h,/id="compressMode"/);
 assert.match(h,/value="auto" selected/);
 assert.match(h,/value="raster"/);
 assert.match(h,/التوقيعات الرقمية/);
 assert.throws(()=>patchCompressPage(h));
});
test('OCR UI says TXT is output, not searchable PDF',()=>{
 const h=patchOcrPage(ocrPage);
 assert.match(h,/id="ocrStrategy"/);
 assert.match(h,/TXT/);
 assert.match(h,/value="force"/);
 assert.throws(()=>patchOcrPage(h));
});
test('patch refuses to mutate unknown source',()=>{
 assert.throws(()=>patchPdfEngine('broken'),/missing PDF engine anchor/);
 assert.throws(()=>patchCompressPage('<div></div>'));
 assert.throws(()=>patchOcrPage('<div></div>'));
});
test('site patch only writes expected three built files',()=>{
 const dist=mkdtempSync(path.join(tmpdir(),'docmivo-v184-'));
 try{
   for(const [f,v] of [['assets/js/tool-engine.v14.js',demoEngine],['tools/compress-pdf/index.html',compPage],['tools/ocr-pdf/index.html',ocrPage]]){
    const p=path.join(dist,f);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,v);
   }
   installPdfQualityPatch(dist);
   assert.match(readFileSync(path.join(dist,'tools/compress-pdf/index.html'),'utf8'),/compressMode/);
   assert.match(readFileSync(path.join(dist,'tools/ocr-pdf/index.html'),'utf8'),/ocrStrategy/);
   assert.match(readFileSync(path.join(dist,'assets/js/tool-engine.v14.js'),'utf8'),/docmivoCompressionPolicy/);
 }finally{rmSync(dist,{recursive:true,force:true});}
});

function simulatedProcessingEnv({hasText=false,pages=1,compressionBytes=350,ocrMode='smart'}={}) {
 const attempts={download:[],status:[],loaded:0,created:0,rendered:0,workers:0,recognized:0,terminated:0,destroyed:0};
 const page=i=>({
  getTextContent:async()=>({items:hasText===true || (Array.isArray(hasText)&&hasText[i-1]) ? [{str:'Original embedded text on page '+i}] : []}),
  getViewport:({scale})=>({width:612*scale,height:792*scale})
 });
 const pdf={numPages:pages,getPage:async i=>page(i),destroy:async()=>{attempts.destroyed++}};
 const worker={recognize:async()=>{attempts.recognized++;return {data:{text:'Recognized OCR text!'}}},terminate:async()=>{attempts.terminated++}};
 const env={
  files:[{size:1000,arrayBuffer:async()=>new Uint8Array(1000).buffer}],
  pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},
  PDFDocument:{
   load:async()=>{attempts.loaded++;return{save:async()=>new Uint8Array(compressionBytes)}},
   create:async()=>{attempts.created++;return {
    addPage:()=>({drawImage:()=>{}}),embedJpg:async()=>({}),save:async()=>new Uint8Array(compressionBytes)
   }}
  },
  window:{Tesseract:{createWorker:async()=>{attempts.workers++;return worker}}},
  $:id=>({value:({ '#quality':'0.82','#scale':'1.35','#compressMode':'auto','#ocrLang':'eng','#ocrStrategy':ocrMode})[id]}),
  status:(v)=>attempts.status.push(v),
  download:(blob,name)=>attempts.download.push({blob,name}),
  renderCanvasFromPage:async()=>{attempts.rendered++;return {width:20,height:20}},
  canvasBlob:async()=>new Blob([new Uint8Array(100)]),
  docmivoCompressionPolicy,docmivoOcrLanguages,docmivoUseTextLayer
 };
 return {env,attempts};
}
function simulateProcessing(slug,env) {
 const js=patchPdfEngine(demoEngine);
 const start=js.indexOf("} else if(slug==='compress-pdf'");
 const end=js.indexOf("if(!['word-to-pdf','compress-pdf','ocr-pdf'].includes(slug))");
 const fragment=js.slice(start,end);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const code='const {files,pdfjsLib,PDFDocument,window,$,status,download,renderCanvasFromPage,canvasBlob,docmivoCompressionPolicy,docmivoOcrLanguages,docmivoUseTextLayer}=env; if(slug===\'merge-pdf\'){ '+fragment+' }';
 return new AsyncFunction('slug','env',code)(slug,env);
}

test('simulated compressed scanned PDF uses image path and downloads smaller result',async()=>{
 const {env,attempts}=simulatedProcessingEnv({hasText:false,pages:2,compressionBytes:420});
 await simulateProcessing('compress-pdf',env);
 assert.equal(attempts.created,1);
 assert.equal(attempts.loaded,0);
 assert.equal(attempts.rendered,2);
 assert.equal(attempts.download.length,1);
 assert.equal(attempts.download[0].name,'compressed.pdf');
 assert.match(attempts.status.at(-1),/الصفحات صارت صورًا/);
 assert.equal(attempts.destroyed,1);
});
test('simulated searchable PDF stays textual by default',async()=>{
 const {env,attempts}=simulatedProcessingEnv({hasText:true,compressionBytes:600});
 await simulateProcessing('compress-pdf',env);
 assert.equal(attempts.loaded,1);
 assert.equal(attempts.created,0);
 assert.equal(attempts.rendered,0);
 assert.equal(attempts.download.length,1);
 assert.match(attempts.status.at(-1),/الحفاظ على طبقة النص/);
});
test('simulated searchable PDF that cannot shrink gives an error and no download',async()=>{
 const {env,attempts}=simulatedProcessingEnv({hasText:true,compressionBytes:1100});
 await assert.rejects(simulateProcessing('compress-pdf',env),/لم تنجح إعادة تعبئته/);
 assert.equal(attempts.download.length,0);
 assert.equal(attempts.destroyed,1);
});
test('simulated hybrid OCR reuses one worker only for scanned pages',async()=>{
 const {env,attempts}=simulatedProcessingEnv({hasText:[true,false,true],pages:3});
 await simulateProcessing('ocr-pdf',env);
 assert.equal(attempts.workers,1);
 assert.equal(attempts.recognized,1);
 assert.equal(attempts.terminated,1);
 assert.equal(attempts.download[0].name,'ocr-text.txt');
 const txt=await attempts.download[0].blob.text();
 assert.match(txt,/Original embedded text on page 1/);
 assert.match(txt,/Recognized OCR text/);
 assert.match(txt,/Original embedded text on page 3/);
 assert.match(attempts.status.at(-1),/2 بنص أصلي و1 باستخدام OCR/);
 assert.equal(attempts.destroyed,1);
});
test('simulated forced OCR scans every page with one worker',async()=>{
 const {env,attempts}=simulatedProcessingEnv({hasText:true,pages:2,ocrMode:'force'});
 await simulateProcessing('ocr-pdf',env);
 assert.equal(attempts.workers,1);
 assert.equal(attempts.recognized,2);
 assert.equal(attempts.terminated,1);
});

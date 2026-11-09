import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
 docmivoExportFormat,docmivoSafeScale,docmivoFileName,docmivoTextFromItems,
 patchImageTextEngine,patchImagesPage,patchExportPage,patchExtractPage,installImageTextPatch
} from '../scripts/pdf-images-text-quality.mjs';

const ENGINE=`function parsePages(expr,total){return [];}
async function processTool(){
 if(slug==='merge-pdf'){} else if(slug==='images-to-pdf'){const old=1;
 } else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){const old=2;
 } else if(slug==='compress-pdf'||slug==='grayscale-pdf'){const old=3;
 } else if(slug==='extract-text'){const old=4;
 } else if(slug==='ocr-pdf'){const old=5;
 } else if(slug==='pdf-info'){const old=6;}
}`;
const HTML_IMG='<html><p>يمكنك اختيار عدة صور وترتيبها بالأسهم قبل إنشاء PDF.</p></html>';
const HTML_EXPORT='<html><div class="action-row"><button class="btn btn-primary" id="runTool">ابدأ العملية</button></div></html>';
const HTML_TEXT='<p>الأداة تستخرج النص الموجود فعليًا داخل PDF. إذا كان الملف عبارة عن صور ممسوحة، استخدم OCR PDF بدلًا منها.</p>';

function snippetFor(slug,env){
 const src=patchImageTextEngine(ENGINE);
 const starts={
  'images-to-pdf':"} else if(slug==='images-to-pdf'){",
  'pdf-to-jpg':"} else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){",
  'extract-text':"} else if(slug==='extract-text'){"
 };
 const ends={
  'images-to-pdf':"} else if(['pdf-to-jpg','pdf-to-png','pdf-to-webp'].includes(slug)){",
  'pdf-to-jpg':"} else if(slug==='compress-pdf'||slug==='grayscale-pdf'){",
  'extract-text':"} else if(slug==='ocr-pdf'){"
 };
 const key=slug==='pdf-to-jpg'||slug==='pdf-to-webp'||slug==='pdf-to-png'?'pdf-to-jpg':slug;
 const start=src.indexOf(starts[key]),end=src.indexOf(ends[key],start+starts[key].length);
 assert.ok(start>=0 && end>start,'branch present');
 const branch=src.slice(start,end);
 const defs=`const {files,PDFDocument,pdfjsLib,JSZip,window,document,status,download,renderCanvasFromPage,canvasBlob,createImageBitmap,$}=env;
 const docmivoExportFormat=env.docmivoExportFormat;
 const docmivoSafeScale=env.docmivoSafeScale;
 const docmivoFileName=env.docmivoFileName;
 const docmivoTextFromItems=env.docmivoTextFromItems;
 if(slug==='merge-pdf'){} ${branch.slice(1)} }`;
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 return new AsyncFunction('slug','env',defs)(slug,env);
}
function fakeEnv({pages=3,kind='image/png',texts=[],imageType='image/png',imageCount=1,dimensions=[600,900]}={}){
 const activity={names:[],binaries:[],pixels:[],canvasDisposed:0,pdfDestroyed:0,embedded:[],draws:[],bitmapsClosed:0,workerRequests:[],logs:[],zipFiles:[]};
 const pdf={
  numPages:pages,
  getPage:async i=>({
   getViewport:({scale})=>({width:dimensions[0]*scale,height:dimensions[1]*scale}),
   getTextContent:async()=>({items:texts[i-1]??[]})
  }),
  destroy:async()=>{activity.pdfDestroyed++}
 };
 const canvas={width:200,height:250};
 const bmp={width:400,height:300,close(){activity.bitmapsClosed++}};
 const env={
  files:Array.from({length:imageCount},(_,i)=>({name:i===0?'sample.webp':'photo.png',type:i===0?imageType:'image/png',size:1000,arrayBuffer:async()=>new Uint8Array([1,2]).buffer})),
  PDFDocument:{create:async()=>({
   embedPng:async()=>{activity.embedded.push('png');return {width:1200,height:600}},
   embedJpg:async()=>{activity.embedded.push('jpeg');return {width:400,height:300}},
   addPage:()=>({drawImage:(_,args)=>activity.draws.push(args)}),
   save:async()=>new Uint8Array([1,2,3])
  })},
  pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},
  JSZip:class{file(name,b){activity.zipFiles.push({name,b})}async generateAsync(){return new Blob(['ZIP'])}},
  $:selector=>({value:{'#scale':'1.7','#quality':'0.9'}[selector]}),
  status:(message)=>activity.logs.push(message),
  download:(blob,name)=>{activity.names.push(name);activity.binaries.push(blob)},
  renderCanvasFromPage:async(_pdf,i,scale)=>{activity.pixels.push([i,scale]);return {...canvas}},
  canvasBlob:async()=>new Blob([new Uint8Array([1,2])],{type:kind}),
  createImageBitmap:async()=>bmp,
  document:{createElement:()=>({width:0,height:0,getContext:()=>({fillStyle:'',fillRect:()=>activity.logs.push('white background'),drawImage:()=>activity.logs.push('image drawn')})})},
  docmivoExportFormat,docmivoSafeScale,docmivoFileName,docmivoTextFromItems
 };
 return {env,activity};
}

test('formats return correct MIME types and do not silently accept bad slug',()=>{
 assert.deepEqual(docmivoExportFormat('pdf-to-webp'),['image/webp','webp']);
 assert.deepEqual(docmivoExportFormat('pdf-to-png'),['image/png','png']);
 assert.deepEqual(docmivoExportFormat('pdf-to-jpg'),['image/jpeg','jpg']);
 assert.throws(()=>docmivoExportFormat('other'),/غير مدعوم/);
});
test('safe renderer caps pixels and rejects unsafe page sizes',()=>{
 assert.equal(docmivoSafeScale(600,800,2),2);
 assert.ok(docmivoSafeScale(3000,3000,3)<1.34);
 assert.ok(3000*3000*docmivoSafeScale(3000,3000,3)**2<=16000000+1);
 for(const args of [[0,12,1],[15,-1,1],[500000,500000,1]]) assert.throws(()=>docmivoSafeScale(...args));
});
test('ZIP filenames remain lexically sortable beyond 10 and 100 pages',()=>{
 assert.equal(docmivoFileName(1,120,'png'),'page-001.png');
 assert.equal(docmivoFileName(99,120,'png'),'page-099.png');
 assert.equal(docmivoFileName(120,120,'webp'),'page-120.webp');
 assert.throws(()=>docmivoFileName(0,4,'png'));
});
test('text extraction retains available line breaks',()=>{
 assert.equal(docmivoTextFromItems([{str:'ALPHA',hasEOL:true},{str:'BETA',hasEOL:false}]),'ALPHA\nBETA');
 assert.equal(docmivoTextFromItems([{str:'   '}]),'');
 assert.equal(docmivoTextFromItems([{str:'مرحبا'},{str:'بالعالم',hasEOL:true}]),'مرحبا بالعالم');
});
test('patch emits legal async JS and preserves V18.4 compress and OCR branches',()=>{
 const patched=patchImageTextEngine(ENGINE);
 assert.match(patched,/docmivoSafeScale\(/);
 assert.match(patched,/slug==='compress-pdf'/);
 assert.match(patched,/slug==='ocr-pdf'/);
 assert.doesNotMatch(patched,/const old=1;|const old=2;|const old=4;/);
 assert.throws(()=>patchImageTextEngine(patched),/already applied/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction('slug','env',`const {files,PDFDocument,pdfjsLib,JSZip,window,document,status,download,renderCanvasFromPage,canvasBlob,createImageBitmap,$}=env;${patched.replace('async function processTool(){','').replace(/}\s*$/,'')}`));
});
test('PDF to PNG produces padded page names with real PNG MIME and releases canvases',async()=>{
 const {env,activity}=fakeEnv({pages:3,kind:'image/png'});
 await snippetFor('pdf-to-png',env);
 assert.deepEqual(activity.zipFiles.map(x=>x.name),['page-001.png','page-002.png','page-003.png']);
 assert.deepEqual(activity.names,['pdf-pages-png.zip']);
 assert.equal(activity.pdfDestroyed,1);
 assert.equal(activity.pixels.length,3);
});
test('PDF to WEBP refuses browser fallback PNG rather than mislabeling it',async()=>{
 const {env,activity}=fakeEnv({kind:'image/png'});
 await assert.rejects(snippetFor('pdf-to-webp',env),/لا يدعم تصدير WEBP/);
 assert.equal(activity.names.length,0);
 assert.equal(activity.pdfDestroyed,1);
});
test('PDF to WEBP succeeds only when real WebP data is returned',async()=>{
 const {env,activity}=fakeEnv({pages:2,kind:'image/webp'});
 await snippetFor('pdf-to-webp',env);
 assert.deepEqual(activity.zipFiles.map(x=>x.name),['page-001.webp','page-002.webp']);
});
test('WebP to PDF paints white background before adding transparent image',async()=>{
 const {env,activity}=fakeEnv({imageType:'image/webp',kind:'image/jpeg'});
 await snippetFor('images-to-pdf',env);
 assert.ok(activity.logs.indexOf('white background')<activity.logs.indexOf('image drawn'));
 assert.equal(activity.bitmapsClosed,1);
 assert.deepEqual(activity.names,['images.pdf']);
 assert.equal(activity.draws.length,1);
});
test('images to PDF retains original PNG embedding',async()=>{
 const {env,activity}=fakeEnv({imageType:'image/png'});
 await snippetFor('images-to-pdf',env);
 assert.deepEqual(activity.embedded,['png']);
 assert.deepEqual(activity.names,['images.pdf']);
});
test('extraction of scanned PDF refuses to export empty TXT',async()=>{
 const {env,activity}=fakeEnv({texts:[[],[],[]]});
 await assert.rejects(snippetFor('extract-text',env),/استخدم OCR PDF/);
 assert.equal(activity.names.length,0);
 assert.equal(activity.pdfDestroyed,1);
});
test('extraction of mixed PDF separates pages and reports empty image pages',async()=>{
 const {env,activity}=fakeEnv({texts:[[{str:'Text page 1'}],[],[{str:'Text page 3'}]]});
 await snippetFor('extract-text',env);
 const result=await activity.binaries[0].text();
 assert.match(result,/Text page 1/);assert.match(result,/Page 2/);assert.match(result,/لا يوجد نص/);assert.match(result,/Text page 3/);
 assert.deepEqual(activity.names,['extracted-text.txt']);
});
test('HTML changes are scoped and explain limitations',()=>{
 assert.match(patchImagesPage(HTML_IMG),/الشفافية/);
 assert.match(patchExportPage(HTML_EXPORT,'webp'),/WebP/);
 assert.match(patchExtractPage(HTML_TEXT),/TXT فارغًا/);
 assert.throws(()=>patchImagesPage('no match'));
});
test('patch installation edits exactly six expected generated files',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'docmivo-v185-'));
 try{
  const files={
   'assets/js/tool-engine.v14.js':ENGINE,
   'tools/images-to-pdf/index.html':HTML_IMG,
   'tools/pdf-to-jpg/index.html':HTML_EXPORT,
   'tools/pdf-to-png/index.html':HTML_EXPORT,
   'tools/pdf-to-webp/index.html':HTML_EXPORT,
   'tools/extract-text/index.html':HTML_TEXT
  };
  for(const [file,c]of Object.entries(files)){const p=path.join(d,file);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,c)}
  installImageTextPatch(d);
  assert.match(readFileSync(path.join(d,'assets/js/tool-engine.v14.js'),'utf8'),/docmivoExportFormat/);
  assert.match(readFileSync(path.join(d,'tools/pdf-to-webp/index.html'),'utf8'),/WebP/);
 }finally{rmSync(d,{recursive:true,force:true})}
});

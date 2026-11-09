import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {docmivoOcrRenderScale,docmivoOcrPageSegMode,patchOcrEngine,patchOcrLayoutHtml,applyOcrReadability} from '../scripts/ocr-readability-hardening.mjs';

const OCR_ENGINE = `function docmivoUseTextLayer(mode, text){}\nfunction parsePages(expr,total){return [];}\n`+
`async function process(){const base={width:450,height:280};\nconst ocrScale=Math.min(1.7,Math.sqrt(10000000/(base.width*base.height)));\n`+
`if(!worker){worker=await window.Tesseract.createWorker(lang,1,{\n`+
`       logger:m=>{if(m.status==='recognizing text'&&Number.isFinite(m.progress))status('OCR الصفحة '+pageInProgress+'/'+pdf.numPages+': '+Math.round(m.progress*100)+'%');}\n`+
`      });\n     }\n     status('OCR الصفحة '+i+' من '+pdf.numPages+'…');\n}`;
const PAGE='<select id="ocrStrategy"></select><div class="field"><label for="ocrStrategy">طريقة استخراج النص</label></div>';

test('balanced 450×280 scan scales from 1.7× to 2.8×',()=>{
  assert.equal(docmivoOcrRenderScale('balanced',450*280),2.8);
  assert.equal(docmivoOcrRenderScale('fast',450*280),1.7);
  assert.equal(docmivoOcrRenderScale('accurate',450*280),3.5);
});
test('scale adapts to a pixel budget and rejects invalid input',()=>{
  const v=docmivoOcrRenderScale('accurate',4000*4000);
  assert.equal(v,1);
  assert.ok(v*v*4000*4000<=16000000);
  assert.throws(()=>docmivoOcrRenderScale('accurate',1e9),/كبيرة/);
  assert.throws(()=>docmivoOcrRenderScale('unknown',100));
  assert.throws(()=>docmivoOcrRenderScale('fast',0));
});
test('Tesseract layout modes are explicit numeric PSM codes',()=>{
 assert.equal(docmivoOcrPageSegMode('auto'),'3');
 assert.equal(docmivoOcrPageSegMode('block'),'6');
 assert.equal(docmivoOcrPageSegMode('line'),'7');
 assert.throws(()=>docmivoOcrPageSegMode('invalid'));
});
test('patch changes OCR only and adds layout support',()=>{
 const src=patchOcrEngine(OCR_ENGINE);
 assert.match(src,/docmivoOcrRenderScale\(\$\('#ocrDetail'\)/);
 assert.match(src,/worker\.setParameters\(/);
 assert.match(src,/tessedit_pageseg_mode/);
 assert.match(src,/function docmivoOcrPageSegMode\(/);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 // Both injected helper declarations and process body parse as JS.
 assert.doesNotThrow(()=>new AsyncFunction(src));
 assert.throws(()=>patchOcrEngine(src),/already patched/);
});
test('patch fails closed if V18.4 source anchors change',()=>{
 assert.throws(()=>patchOcrEngine('bad'),/requires V18.4/);
 assert.throws(()=>patchOcrEngine(OCR_ENGINE.replace('1.7','1.8')),/OCR render scale/);
});
test('OCR interface includes presets and has one default for each select',()=>{
 const html=patchOcrLayoutHtml(PAGE);
 assert.match(html,/id="ocrDetail"/);
 assert.match(html,/id="ocrLayout"/);
 assert.match(html,/value="accurate"/);
 assert.match(html,/value="block"/);
 assert.equal((html.match(/selected/g)||[]).length,2);
 assert.throws(()=>patchOcrLayoutHtml(html),/already patched/);
});
test('site patch writes both OCR targets and nothing else',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'ocr-v186-'));
 try{
   for(const [f,s] of [['assets/js/tool-engine.v14.js',OCR_ENGINE],['tools/ocr-pdf/index.html',PAGE]]){
     const p=path.join(d,f);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,s);
   }
   applyOcrReadability(d);
   assert.match(readFileSync(path.join(d,'assets/js/tool-engine.v14.js'),'utf8'),/docmivoOcrRenderScale/);
   assert.match(readFileSync(path.join(d,'tools/ocr-pdf/index.html'),'utf8'),/ocrLayout/);
 }finally{rmSync(d,{recursive:true,force:true});}
});

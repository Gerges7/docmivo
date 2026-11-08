import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const kit=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const put=(root, name, content)=>{
 const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);
};
const parse=`function parsePages(expr,total){const out=[];String(expr||'').split(',').forEach(part=>{part=part.trim();if(!part)return;if(part.includes('-')){let[a,b]=part.split('-').map(Number);if(!b)b=total;for(let i=Math.max(1,a);i<=Math.min(total,b);i++)out.push(i-1)}else{const n=Number(part);if(n>=1&&n<=total)out.push(n-1)}});return [...new Set(out)]}`;
const add=`function addFiles(fs){const incoming=[...fs];if(!tool.multiple)files=incoming.slice(0,1);else files=[...files,...incoming];incoming.forEach(maybePrefill);renderFiles();clearStatus()}`;
const split=`const idx=parsePages(ranges[r],total);if(!idx.length)continue;`;
const del=`} else if(slug==='delete-pages'){\n   const src=await loadPdf(files[0]),`;
const compress=`download(new Blob([await out.save()],{type:'application/pdf'}),slug==='grayscale-pdf'?'grayscale.pdf':'compressed.pdf');`;
function fixture(){
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-cf-'));
 fs.cpSync(kit,path.join(repo,'cloudflare'),{recursive:true,filter:(src)=>!src.includes('/dist/')});
 put(repo,'assets/js/tool-engine.v14.js',[parse,add,split,del,compress].join('\n'));
 put(repo,'assets/js/tools-data.v14.js','window.DOCMIVO_TOOLS=[]');
 put(repo,'tools/merge-pdf/index.html','<html><body>Merge</body></html>');
 put(repo,'tools/image-compress/index.html','<html><body>Image</body></html>');
 put(repo,'index.html','<html><head><title>DocMivo — أدوات PDF مجانية وسهلة</title></head><body><section class="section ai-section" id="ai-tools"></section></body></html>');
 put(repo,'404.html','<html><body>Not Found</body></html>');
 put(repo,'favicon.svg','<svg/>');put(repo,'robots.txt','User-agent: *\nAllow: /');
 put(repo,'sitemap.xml','<urlset></urlset>');put(repo,'ads.txt','google.com, pub-test, DIRECT');
 put(repo,'api/ai.py','CONFIDENTIAL NOT FOR PUBLIC DISTRIBUTION');
 put(repo,'cloudrun/converter/app.py','SERVER SOURCE NOT STATIC');
 return repo;
}
test('Build keeps original file tree, overlays QR fix, and excludes all private backend source',()=>{
 const repo=fixture();
 try{
  const result=execFileSync(process.execPath,['scripts/build-cloudflare.mjs'],{cwd:path.join(repo,'cloudflare'),encoding:'utf8'});
  assert.match(result,/build OK/);
  const dist=path.join(repo,'cloudflare/dist');
  assert.equal(fs.existsSync(path.join(dist,'api/ai.py')),false);
  assert.equal(fs.existsSync(path.join(dist,'cloudrun/converter/app.py')),false);
  assert.equal(fs.existsSync(path.join(dist,'index.html')),true);
  assert.equal(fs.existsSync(path.join(dist,'tools/merge-pdf/index.html')),true);
  const qr=fs.readFileSync(path.join(dist,'tools/qr-code/index.html'),'utf8');
  assert.match(qr,/vendor\/docmivo-qr-engine/);
  assert.doesNotMatch(qr,/qrcode@1\.5\.4/);
  const modified=fs.readFileSync(path.join(dist,'assets/js/tool-engine.v14.js'),'utf8');
  assert.match(modified,/نطاق صفحات غير صحيح/);
  assert.match(modified,/لم يقل حجم PDF/);
  assert.match(modified,/حدد الصفحات المراد حذفها/);
  const p=modified.slice(modified.indexOf('function parsePages('),modified.indexOf('function addFiles('));
  const getFn=vm.runInNewContext(p+'\nparsePages');
  assert.deepEqual([...getFn('1-3,5',6)],[0,1,2,4]);
  assert.deepEqual([...getFn('4-',6)],[3,4,5]);
  for(const bad of ['0','abc','3-2','1,','1-100','2.5','1--3']) assert.throws(()=>getFn(bad,6),/نطاق|أرقام/);
 }finally{fs.rmSync(repo,{recursive:true,force:true});}
});

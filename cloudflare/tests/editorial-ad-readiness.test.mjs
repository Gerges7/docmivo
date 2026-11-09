import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EDITORIAL_SLUGS,improveToolPage,improveContactPage,validateAdsTxt,applyEditorialReadiness} from '../scripts/editorial-ad-readiness.mjs';
const fixture=(slug)=>`<html lang="ar"><main><div class="workspace"></div><section class="content-block v16-editorial"><h2>قبل العمل</h2></section><section class="content-block"><h2>كيفية استخدام أداة ${slug}</h2><div class="steps"><div class="step">عام</div></div></section><section class="content-block v5-seo"><h2>متى تكون أداة ${slug} مفيدة؟</h2><p>generic</p></section><section class="content-block v5-seo"><h2>نصائح للحصول على نتيجة أفضل</h2><p>generic</p></section><section class="content-block v5-seo"><h2>الخصوصية وطريقة المعالجة</h2><p>generic</p></section><section class="content-block v5-seo"><h2>أدوات مرتبطة</h2><p>untouched</p></section><h1>${({'merge-pdf':'دمج PDF','split-pdf':'تقسيم PDF','compress-pdf':'ضغط PDF','ocr-pdf':'OCR PDF','images-to-pdf':'صور إلى PDF','extract-text':'استخراج النص'})[slug]}</h1></main></html>`;
const seller='google.com, pub-1551519098591089, DIRECT, f08c47fec0942fa0\n';
for(const slug of EDITORIAL_SLUGS){
 test(`${slug} replaces 4 boilerplate sections and documents actual behavior`,()=>{
   const out=improveToolPage(fixture(slug),slug);
   assert.equal((out.match(/dm-verified-editorial/g)||[]).length,5);
   assert.doesNotMatch(out,/generic/);
   assert.match(out,/untouched/);
   assert.match(out,/من اختبارات DocMivo/);
   assert.match(out,/<h1>/);
   assert.throws(()=>improveToolPage(out,slug),/already patched/);
 });
}
test('only reviewed tools may be published',()=>{
 assert.throws(()=>improveToolPage(fixture('word-to-pdf'),'word-to-pdf'),/unreviewed/);
 assert.deepEqual(EDITORIAL_SLUGS,['merge-pdf','split-pdf','compress-pdf','ocr-pdf','images-to-pdf','extract-text']);
});
test('realistic invalid page template fails closed',()=>{
 assert.throws(()=>improveToolPage('<main><h1>دمج PDF</h1></main>','merge-pdf'),/template changed/);
 assert.throws(()=>improveToolPage(fixture('merge-pdf').replace('نصائح للحصول على نتيجة أفضل','ملاحظات أخرى'),'merge-pdf'),/expected one section/);
});
test('support page reports approval status accurately',()=>{
 const updated=improveContactPage('<p>DocMivo يستخدم Google AdSense للإعلانات.</p>');
 assert.match(updated,/لا يعني أن الموقع حصل على الموافقة/);
 assert.throws(()=>improveContactPage(updated),/claim not found/);
});
test('ads.txt seller record validated and malformed records rejected',()=>{
 assert.equal(validateAdsTxt(seller),true);
 for(const bad of ['', 'Not found', 'google.com, pub-1234, RESELLER, f08c47fec0942fa0', 'google.com, pub-1234, DIRECT, other'])assert.throws(()=>validateAdsTxt(bad));
});
test('dist patch is atomic for missing or malformed inputs',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-v19-'));
 try{
   const p=(rel,data)=>{const dest=path.join(tmp,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);};
   for(const slug of EDITORIAL_SLUGS)p(`tools/${slug}/index.html`,fixture(slug));
   p('contact.html','<p>DocMivo يستخدم Google AdSense للإعلانات.</p>');
   p('ads.txt',seller);
   p('assets/css/styles.css',':root{}');
   assert.deepEqual(applyEditorialReadiness(tmp),{editorialPages:6,adsTxtValid:true});
   assert.match(fs.readFileSync(path.join(tmp,'tools/ocr-pdf/index.html'),'utf8'),/DOCMIVOOCRQA/);
   assert.match(fs.readFileSync(path.join(tmp,'assets/css/styles.css'),'utf8'),/DocMivo V19/);
   assert.throws(()=>applyEditorialReadiness(tmp));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

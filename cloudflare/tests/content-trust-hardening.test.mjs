import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 pausedSlugFromHref,replaceUnavailableLinks,addGuideAvailability,
 improveQualityClaims,AVAILABILITY_CSS,findPausedAnchors,auditInternalDestinations,applyContentTrust
} from '../scripts/content-trust-hardening.mjs';

const root='guides/word-to-pdf-guide.html';
test('recognizes paused local and canonical links; ignores other origins',()=>{
 assert.equal(pausedSlugFromHref('/tools/word-to-pdf'), 'word-to-pdf');
 assert.equal(pausedSlugFromHref('https://getdocmivo.com/tools/pdfa-converter'), 'pdfa-converter');
 assert.equal(pausedSlugFromHref('https://other.example/tools/word-to-pdf'),null);
 assert.equal(pausedSlugFromHref('/tools/merge-pdf'),null);
 assert.equal(pausedSlugFromHref('/guides/word-to-pdf-guide'),null);
 assert.equal(pausedSlugFromHref('#tools'),null);
 assert.equal(pausedSlugFromHref('mailto:test@example.com'),null);
});
test('unavailable links become non-clickable notices, active links remain functional',()=>{
 const html='<p><a href="/tools/word-to-pdf" class="btn">Word إلى PDF</a> و<a href="/tools/merge-pdf">دمج PDF</a></p>';
 const result=replaceUnavailableLinks(html,root);
 assert.equal(result.count,1);
 assert.match(result.html,/class="dm-unavailable-link"/);
 assert.match(result.html,/متوقفة مؤقتًا/);
 assert.doesNotMatch(result.html,/href="\/tools\/word-to-pdf"/);
 assert.match(result.html,/href="\/tools\/merge-pdf"/);
 assert.deepEqual(findPausedAnchors(result.html,root),[]);
});
test('nested block card uses div not illegal span wrapper',()=>{
 const result=replaceUnavailableLinks('<a href="/tools/repair-pdf"><div>صيانة</div><h3>إصلاح PDF</h3></a>');
 assert.equal(result.count,1);
 assert.match(result.html,/^<div class="dm-unavailable-link"/);
});
test('guide status follows H1 and retains useful content and canonical',()=>{
 const page='<html><head><link rel="canonical" href="https://getdocmivo.com/guides/word-to-pdf-guide"></head><body><main><article class="prose"><h1>Word إلى PDF</h1><p>Useful content</p></article></main></body></html>';
 const updated=addGuideAvailability(page,root);
 assert.ok(updated.indexOf('Word إلى PDF</h1>')<updated.indexOf('class="dm-guide-status"'));
 assert.ok(updated.indexOf('class="dm-guide-status"')<updated.indexOf('Useful content'));
 assert.match(updated,/غير مفعّلة حاليًا/);
 assert.match(updated,/rel="canonical"/);
 assert.throws(()=>addGuideAvailability(updated,root),/already present/);
});
test('remaining guide types have specific, honest notes',()=>{
 const sample='<article class="prose"><h1>Guide</h1><p>Content</p></article>';
 for(const p of ['guides/searchable-ocr-guide.html','guides/pdfa-guide.html','guides/repair-pdf-guide.html','guides/office-fonts-pdf-guide.html']) {
  assert.match(addGuideAvailability(sample,p),/class="dm-guide-status"/);
 }
 assert.equal(addGuideAvailability(sample,'guides/ocr-guide.html'),sample);
});
test('claims about Word conversion and OCR can be corrected without touching unrelated text',()=>{
 const html='<h2>Word إلى PDF مثال واضح</h2><p>في تحويل Word لا نكتفي بأن النص ظهر. نقارن عدد الصفحات وأبعادها، حدود الجداول، التفاف الأسطر، موضع الصور، والـheaders. إذا كان الخط الأصلي غير متاح على خادم التحويل نستخدم بدائل متوافقة قدر الإمكان، ثم نرفض التعديل تلقائيًا إذا أدى إلى تغير كبير مثل زيادة عدد الصفحات أو التفاف غير طبيعي.</p>\n<h2>اختبارات PDF</h2><p>في الدمج والتقسيم نراجع عدد الصفحات وترتيبها. في الضغط نقارن الحجم مع وضوح أصغر نص. في OCR نختبر كلمات عربية وإنجليزية وأرقامًا داخل جداول. في الحماية وفتح الملفات نتحقق أن الملف الناتج يفتح أو يرفض الفتح بالطريقة المتوقعة، وليس فقط أن العملية انتهت دون خطأ.</p><p>other content</p>';
 const updated=improveQualityClaims(html);
 assert.match(updated,/خدمة متوقفة حاليًا/);
 assert.match(updated,/بعض الكلمات/);
 assert.match(updated,/other content/);
 assert.doesNotMatch(updated,/ثم نرفض التعديل تلقائيًا/);
 assert.throws(()=>improveQualityClaims(updated));
});
test('paused link counter does not count plain prose and respects attribute quotes',()=>{
 const src='<a class="btn" href=\'/tools/word-to-pdf?x=1\'>W</a> /tools/protect-pdf <a href="https://getdocmivo.com/tools/searchable-ocr-pdf">S</a>';
 assert.equal(findPausedAnchors(src,root).length,2);
 const updated=replaceUnavailableLinks(src,root);
 assert.equal(updated.count,2);
 assert.equal(findPausedAnchors(updated.html,root).length,0);
});
test('CSS includes accessible small-screen style, no invisible controls',()=>{
 assert.match(AVAILABILITY_CSS,/@media\(max-width:600px\)/);
 assert.match(AVAILABILITY_CSS,/dm-guide-status/);
});
test('integration edits only generated HTML and CSS, preserves indexability/meta tags',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-v189-'));
 try {
  const write=(f,s)=>{const p=path.join(dir,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
  write('index.html','<!doctype html><title>Site</title><a href="/tools/word-to-pdf">Word</a><a href="/tools/ocr-pdf">OCR</a>');
  write('quality.html','<html><body><h2>Word إلى PDF مثال واضح</h2><p>في تحويل Word لا نكتفي بأن النص ظهر. نقارن عدد الصفحات وأبعادها، حدود الجداول، التفاف الأسطر، موضع الصور، والـheaders. إذا كان الخط الأصلي غير متاح على خادم التحويل نستخدم بدائل متوافقة قدر الإمكان، ثم نرفض التعديل تلقائيًا إذا أدى إلى تغير كبير مثل زيادة عدد الصفحات أو التفاف غير طبيعي.</p><h2>اختبارات PDF</h2><p>في الدمج والتقسيم نراجع عدد الصفحات وترتيبها. في الضغط نقارن الحجم مع وضوح أصغر نص. في OCR نختبر كلمات عربية وإنجليزية وأرقامًا داخل جداول. في الحماية وفتح الملفات نتحقق أن الملف الناتج يفتح أو يرفض الفتح بالطريقة المتوقعة، وليس فقط أن العملية انتهت دون خطأ.</p></body></html>');
  write('assets/css/styles.css','body{font:inherit}');
  write('guides/word-to-pdf-guide.html','<meta name="robots" content="index,follow"><article class="prose"><h1>Word</h1><a href="/tools/word-to-pdf">Word</a></article>');
  write('tools/word-to-pdf/index.html','<meta name="robots" content="noindex,follow"><h1>Paused</h1>');
  write('sitemap.xml','<urlset>unchanged</urlset>');
  const r=applyContentTrust(dir);
  assert.equal(r.links,2);
  assert.match(fs.readFileSync(path.join(dir,'guides/word-to-pdf-guide.html'),'utf8'),/dm-guide-status/);
  assert.match(fs.readFileSync(path.join(dir,'tools/word-to-pdf/index.html'),'utf8'),/noindex/);
  assert.equal(fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8'),'<urlset>unchanged</urlset>');
  assert.match(fs.readFileSync(path.join(dir,'assets/css/styles.css'),'utf8'),/DocMivo V18.9/);
  assert.throws(()=>applyContentTrust(dir),/already patched|quality page text changed|guide notice already present/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('nonblocking link audit finds missing local routes and ignores API and external links',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-v189-links-'));
 try{
  fs.mkdirSync(path.join(dir,'tools/ocr-pdf'),{recursive:true});
  fs.writeFileSync(path.join(dir,'tools/ocr-pdf/index.html'),'<h1>OCR</h1>');
  fs.writeFileSync(path.join(dir,'index.html'),'<a href="/tools/ocr-pdf">Active</a><a href="/guides/missing-guide">Missing</a><a href="/api/health">API</a><a href="https://example.com">External</a>');
  const missing=auditInternalDestinations(dir);
  assert.deepEqual(missing,[{source:'index.html',url:'/guides/missing-guide'}]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

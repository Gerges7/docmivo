import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyEditorialWave3,enhanceGuide} from '../scripts/editorial-wave3.mjs';

const cases=[
 ['guides/watermark-pdf-guide.html','watermark','تطبيق العلامة المائلة على جميع صفحات الملف','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/sign-pdf-guide.html','signature','تضيف صورة إلى صفحة واحدة فقط','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/metadata-pdf-guide.html','metadata','Creator وProducer','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/n-up-booklet-guide.html','nup-booklet','يضيف صفحات فارغة','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/pdf-forms-guide.html','forms','FullName','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/compare-pdf-guide.html','compare','Anti-aliasing','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/bates-numbering-guide.html','bates','CASE-2026-','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/pdf-page-numbers-guide.html','page-numbers','لا يوجد في الواجهة الحالية خيار','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/pdf-to-jpg-guide.html','pdf-images','ملف ZIP','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/images-to-pdf-guide.html','images-to-pdf','صفحتين A4','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/repair-pdf-guide.html','repair','غير مفعّلة حاليًا','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/pdfa-guide.html','pdfa','غير مفعّل حاليًا','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/searchable-ocr-guide.html','searchable-ocr','ملف النص المستخرج','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/office-fonts-pdf-guide.html','office-fonts','غير مفعّلة حاليًا','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/word-to-pdf-guide.html','word-to-pdf','غير مفعّلة حاليًا','<h2>قائمة مراجعة سريعة</h2>',false],
 ['guides/image-optimization-guide.html','image-optimization','32 مليون بكسل','<h2>قائمة المراجعة</h2>',true],
 ['guides/qr-code-guide.html','qr-code','مستوى تصحيح الأخطاء','<a href="/tools/qr-code"',true]
];
const page=(marker,noindex=false)=>{
 const meta=noindex?'<meta name="robots" content="noindex,follow">':'';
 const inside=marker==='<a href="/tools/qr-code"'?marker+'>Open</a>':marker;
 return '<html><head><title>Guide</title>'+meta+'</head><body><main><h1>Guide</h1><p>دليل DocMivo • مراجعة وتحديث 2026-10-12</p><article>'+inside+'</article></main></body></html>';
};

test('adds distinct task-specific guidance to all 17 selected guides',()=>{
 for(const [relative,id,phrase,marker,noindex] of cases){
  const out=enhanceGuide(page(marker,noindex),relative);
  assert.match(out,new RegExp('data-editorial-wave3="'+id+'"'),relative);
  assert.ok(out.includes(phrase),relative);
  assert.match(out,/24 نوفمبر 2026/,relative);
  assert.match(out,/<h1>Guide<\/h1>/,relative);
  if(noindex)assert.doesNotMatch(out,/name="robots"[^>]*noindex/i,relative);
  assert.throws(()=>enhanceGuide(out,relative),/already applied/);
 }
});

test('does not change guides outside the curated editorial wave',()=>{
 const original=page('<h2>قائمة مراجعة سريعة</h2>');
 assert.equal(enhanceGuide(original,'guides/merge-pdf-guide.html'),original);
});

test('updates lastmod for revised guides and adds the two newly indexable guides',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-wave3-'));
 try{
  const existing=cases.filter(x=>!x[4]);
  const urls=existing.map(([rel])=>'<url><loc>https://getdocmivo.com/'+rel.replace(/^guides\//,'guides/').replace(/\.html$/,'')+'</loc><lastmod>2026-10-12</lastmod></url>').join('\n');
  fs.writeFileSync(path.join(dir,'sitemap.xml'),'<urlset>'+urls+'</urlset>');
  for(const [relative,id,phrase,marker,noindex] of cases){
   const file=path.join(dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,page(marker,noindex));
  }
  const result=applyEditorialWave3(dir);
  assert.equal(result.pages,cases.length);
  assert.equal(result.updatedSitemapEntries,cases.length);
  const sitemap=fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8');
  assert.equal((sitemap.match(/<lastmod>2026-11-24<\/lastmod>/g)||[]).length,cases.length);
  assert.equal((sitemap.match(/<lastmod>2026-10-12<\/lastmod>/g)||[]).length,0);
  for(const relative of ['guides/image-optimization-guide.html','guides/qr-code-guide.html']){
   assert.match(sitemap,new RegExp(relative.replace(/^guides\//,'guides/').replace(/\.html$/,'')));
   assert.doesNotMatch(fs.readFileSync(path.join(dir,relative),'utf8'),/noindex/i);
  }
  assert.throws(()=>applyEditorialWave3(dir),/already applied/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

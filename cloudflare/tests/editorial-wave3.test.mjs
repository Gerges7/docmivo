import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyEditorialWave3,enhanceGuide} from '../scripts/editorial-wave3.mjs';

const cases=[
 ['guides/watermark-pdf-guide.html','watermark','تطبيق العلامة المائلة على جميع صفحات الملف'],
 ['guides/sign-pdf-guide.html','signature','تضيف صورة إلى صفحة واحدة فقط'],
 ['guides/metadata-pdf-guide.html','metadata','Creator وProducer'],
 ['guides/n-up-booklet-guide.html','nup-booklet','يضيف صفحات فارغة'],
 ['guides/pdf-forms-guide.html','forms','FullName'],
 ['guides/compare-pdf-guide.html','compare','Anti-aliasing'],
 ['guides/bates-numbering-guide.html','bates','CASE-2026-'],
 ['guides/pdf-page-numbers-guide.html','page-numbers','لا يوجد في الواجهة الحالية خيار'],
 ['guides/pdf-to-jpg-guide.html','pdf-images','ملف ZIP'],
 ['guides/images-to-pdf-guide.html','images-to-pdf','صفحتين A4'],
 ['guides/repair-pdf-guide.html','repair','غير مفعّلة حاليًا'],
 ['guides/pdfa-guide.html','pdfa','غير مفعّل حاليًا'],
 ['guides/searchable-ocr-guide.html','searchable-ocr','ملف النص المستخرج'],
 ['guides/office-fonts-pdf-guide.html','office-fonts','غير مفعّلة حاليًا'],
 ['guides/word-to-pdf-guide.html','word-to-pdf','غير مفعّلة حاليًا']
];
const page='<html><head><title>Guide</title></head><body><main><h1>Guide</h1><p>دليل DocMivo • مراجعة وتحديث 2026-10-12</p><h2>قائمة مراجعة سريعة</h2><h2>أدوات مرتبطة</h2></main></body></html>';

test('adds distinct, task-specific guidance to every selected guide and refreshes review date',()=>{
 for(const [relative,id,phrase] of cases){
  const out=enhanceGuide(page,relative);
  assert.match(out,new RegExp('data-editorial-wave3="'+id+'"'),relative);
  assert.ok(out.includes(phrase),relative);
  assert.match(out,/آخر تحديث 2026-11-24/,relative);
  assert.match(out,/<h1>Guide<\/h1>/,relative);
  assert.throws(()=>enhanceGuide(out,relative),/already applied/);
 }
});

test('does not change guides outside the curated editorial wave',()=>{
 assert.equal(enhanceGuide(page,'guides/merge-pdf-guide.html'),page);
});

test('updates lastmod only for revised guide URLs and fails on missing sitemap URLs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-wave3-'));
 try{
  fs.mkdirSync(path.join(dir,'guides'),{recursive:true});
  const urls=cases.map(([rel])=>'<url><loc>https://getdocmivo.com/'+rel.replace(/^guides\//,'guides/').replace(/\.html$/,'')+'</loc><lastmod>2026-10-12</lastmod></url>').join('\n');
  fs.writeFileSync(path.join(dir,'sitemap.xml'),'<urlset>'+urls+'</urlset>');
  for(const [relative] of cases){const file=path.join(dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,page);}
  const result=applyEditorialWave3(dir);
  assert.equal(result.pages,cases.length);
  assert.equal(result.updatedSitemapEntries,cases.length);
  const sitemap=fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8');
  assert.equal((sitemap.match(/<lastmod>2026-11-24<\/lastmod>/g)||[]).length,cases.length);
  assert.equal((sitemap.match(/<lastmod>2026-10-12<\/lastmod>/g)||[]).length,0);
  assert.match(fs.readFileSync(path.join(dir,'guides/watermark-pdf-guide.html'),'utf8'),/data-editorial-wave3="watermark"/);
  assert.throws(()=>applyEditorialWave3(dir),/already applied/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EDITORIAL_WAVE2_SLUGS,improveWave2Page,applyEditorialWave2,WAVE2_CSS,enableVerifiedRotateIndexing,includeVerifiedRotateInSitemap,VERIFIED_ROTATE_URL} from '../scripts/editorial-wave2.mjs';
const names={
 'rotate-pdf':'تدوير PDF','delete-pages':'حذف صفحات','extract-pages':'استخراج صفحات',
 'reorder-pages':'ترتيب الصفحات','pdf-to-png':'PDF إلى PNG','pdf-to-jpg':'PDF إلى JPG',
 'page-numbers':'ترقيم الصفحات','pdf-to-webp':'PDF إلى WebP'
};
function fixture(slug){return `<!doctype html><html lang="ar" dir="rtl"><head><link href="https://getdocmivo.com/tools/${slug}" rel="canonical"/><meta content="noindex,follow" name="robots"/></head><main><h1>${names[slug]}</h1><div class="workspace"></div>
<section class="content-block v16-editorial"><h2>نصائح خاصة</h2><p>لا تغير هذا القسم</p></section>
<section class="content-block"><h2>كيفية استخدام أداة ${names[slug]}</h2><p>عام</p></section>
<section class="content-block v5-seo"><h2>متى تكون أداة ${names[slug]} مفيدة؟</h2><p>عام</p></section>
<section class="content-block v5-seo"><h2>نصائح للحصول على نتيجة أفضل</h2><p>عام</p></section>
<section class="content-block v5-seo"><h2>الخصوصية وطريقة المعالجة</h2><p>عام</p></section>
<section class="content-block v5-seo"><h2>أدوات مرتبطة</h2><p>يبقى القسم كما هو</p></section>
<section class="content-block faq"><h2>أسئلة شائعة</h2><details><summary>هل مجانية؟</summary><p>نعم</p></details></section>
</main></html>`;}

test('wave2 targets precisely eight real, enabled local tools',()=>{
 assert.deepEqual(EDITORIAL_WAVE2_SLUGS,[
 'rotate-pdf','delete-pages','extract-pages','reorder-pages',
 'pdf-to-png','pdf-to-jpg','page-numbers','pdf-to-webp']);
 assert.throws(()=>improveWave2Page(fixture('rotate-pdf'),'word-to-pdf'),/refuses unaudited/);
});
for(const slug of EDITORIAL_WAVE2_SLUGS){
 test(`${slug}: four generic sections and FAQ replaced without breaking workspace or related tools`,()=>{
  const out=improveWave2Page(fixture(slug),slug);
  assert.match(out,/class="workspace"/);
  assert.match(out,/لا تغير هذا القسم/);
  assert.match(out,/يبقى القسم كما هو/);
  assert.match(out,/<h1>/);
  assert.doesNotMatch(out,/<p>عام<\/p>/);
  assert.doesNotMatch(out,/هل مجانية/);
  assert.equal((out.match(/class="content-block dm-wave2 dm-wave2-/g)||[]).length,6);
  assert.equal((out.match(/<details(?: open)?>/g)||[]).length,3);
  assert.match(out,/خصوصية الملف وطريقة المعالجة/);
  assert.throws(()=>improveWave2Page(out,slug),/already applied/);
 });
}
test('QA language is faithful: no unverified JPG, WebP or numbering claims',()=>{
 for(const slug of ['pdf-to-jpg','pdf-to-webp','page-numbers']){
  const result=improveWave2Page(fixture(slug),slug);
  assert.match(result,/dm-wave2-pending/);
  assert.match(result,/لم نعتمد بعد|ما زلنا بحاجة/);
  assert.doesNotMatch(result,/dm-wave2-qa/);
 }
 for(const slug of ['rotate-pdf','delete-pages','extract-pages','reorder-pages','pdf-to-png']){
  const result=improveWave2Page(fixture(slug),slug);
  assert.match(result,/dm-wave2-qa/);
 }
});
test('real control values and sample outputs appear in the correct guidance',()=>{
 assert.match(improveWave2Page(fixture('rotate-pdf'),'rotate-pdf'),/270°/);
 assert.match(improveWave2Page(fixture('delete-pages'),'delete-pages'),/2,4-6,10/);
 assert.match(improveWave2Page(fixture('extract-pages'),'extract-pages'),/1-3,5,9/);
 assert.match(improveWave2Page(fixture('reorder-pages'),'reorder-pages'),/3,1,2/);
 assert.match(improveWave2Page(fixture('pdf-to-png'),'pdf-to-png'),/1012 × 1432/);
 assert.match(improveWave2Page(fixture('page-numbers'),'page-numbers'),/ابدأ من/);
 assert.match(improveWave2Page(fixture('pdf-to-webp'),'pdf-to-webp'),/عدم دعم WebP/);
});
test('missing or changed template fails closed',()=>{
 assert.throws(()=>improveWave2Page('<h1>تدوير PDF</h1>','rotate-pdf'),/expected exactly one/);
 assert.throws(()=>improveWave2Page(fixture('delete-pages').replace('الخصوصية وطريقة المعالجة','إعادة تصميم'),'delete-pages'),/expected exactly one/);
 assert.throws(()=>improveWave2Page(fixture('pdf-to-png').replace('content-block faq','missing-faq'),'pdf-to-png'),/FAQ/);
 assert.throws(()=>improveWave2Page(fixture('rotate-pdf').replace('<h1>تدوير PDF</h1>','<h1>Other</h1>'),'rotate-pdf'),/unexpected title/);
});
test('patch applies to dist in one pass, has no effect on source roots, and refuses repeat',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-19-1-'));
 try{
  const p=(name,s)=>{const f=path.join(dir,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)};
  for(const slug of EDITORIAL_WAVE2_SLUGS)p(`tools/${slug}/index.html`,fixture(slug));
  p('assets/css/styles.css','body{}');
  p('sitemap.xml','<urlset><url><loc>https://getdocmivo.com/</loc></url></urlset>');
  assert.deepEqual(applyEditorialWave2(dir),{pages:8,verified:5});
  assert.match(fs.readFileSync(path.join(dir,'assets/css/styles.css'),'utf8'),/DocMivo V19.1/);
  assert.match(fs.readFileSync(path.join(dir,'tools/rotate-pdf/index.html'),'utf8'),/dm-wave2/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'tools/rotate-pdf/index.html'),'utf8'),/noindex/);
  assert.match(fs.readFileSync(path.join(dir,'sitemap.xml'),'utf8'),/rotate-pdf/);
  assert.throws(()=>applyEditorialWave2(dir));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing later page must not partially patch preceding pages',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-19-1-bad-'));
 try{
  fs.mkdirSync(path.join(dir,'assets/css'),{recursive:true});
  fs.writeFileSync(path.join(dir,'assets/css/styles.css'),'x');
  fs.writeFileSync(path.join(dir,'sitemap.xml'),'<urlset></urlset>');
  const target=path.join(dir,'tools/rotate-pdf/index.html');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fixture('rotate-pdf'));
  assert.throws(()=>applyEditorialWave2(dir),/missing tool page/);
  assert.equal(fs.readFileSync(target,'utf8'),fixture('rotate-pdf'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CSS keeps new guidance readable on mobile',()=>{
 assert.match(WAVE2_CSS,/@media\(max-width:650px\)/);
 assert.match(WAVE2_CSS,/dm-wave2-faq/);
});

test('only QA-verified Rotate may lose beta noindex and join sitemap',()=>{
 const src=fixture('rotate-pdf');
 const result=enableVerifiedRotateIndexing(src);
 assert.doesNotMatch(result,/noindex/);
 assert.throws(()=>enableVerifiedRotateIndexing(result),/exactly one/);
 assert.throws(()=>enableVerifiedRotateIndexing(src.replace('getdocmivo.com','other.example')),/canonical/);
 const xml='<urlset><url><loc>https://getdocmivo.com/</loc></url></urlset>';
 const next=includeVerifiedRotateInSitemap(xml);
 assert.match(next,/rotate-pdf/);
 assert.equal(includeVerifiedRotateInSitemap(next),next);
 assert.throws(()=>includeVerifiedRotateInSitemap('<body/>'),/malformed/);
 assert.equal(VERIFIED_ROTATE_URL,'https://getdocmivo.com/tools/rotate-pdf');
});

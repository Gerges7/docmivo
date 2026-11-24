import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceHtml} from '../scripts/site-experience.mjs';
const fixture='<!doctype html><html lang="ar" dir="rtl"><head><title>Old</title></head><body><nav class="nav"><div class="nav-actions"></div></nav><main><h1>Sample</h1><div class="dropzone"><h3>اسحب الملفات هنا</h3></div><h2>Instructions</h2></main><footer><h4>Navigation</h4></footer></body></html>';
test('Site experience installs persistent theme boot, CSS and UI script without duplicating structural HTML',()=>{
  const out=enhanceHtml(fixture,'index.html');
  assert.match(out,/data-docmivo-experience/);
  assert.match(out,/assets\/css\/experience.css/);
  assert.match(out,/assets\/js\/experience.js/);
  assert.match(out,/<h2>Navigation<\/h2>/);
  assert.match(out,/<p class="dm-dropzone-title">/);
  assert.doesNotMatch(out,/<h4>/);
  assert.throws(()=>enhanceHtml(out,'index.html'),/already installed/);
});
test('Short Arabic guide titles retain DocMivo branding',()=>{
  const out=enhanceHtml(fixture,'guides/pdf-privacy-guide.html');
  assert.match(out,/<title>خصوصية PDF: إزالة البيانات المخفية \| DocMivo<\/title>/);
});

test('Verified PDF Info replaces inaccurate download instructions and removes noindex',()=>{
 const fixture='<!doctype html><html lang="ar" dir="rtl"><head><meta content="noindex,follow" name="robots"/></head><body data-tool="pdf-info"><main>'+
 '<section class="content-block"><h2>كيفية استخدام أداة معلومات PDF</h2><p>Old generic download steps</p></section>'+
 '<section class="content-block v5-seo"><h2>متى تكون أداة معلومات PDF مفيدة؟</h2><p>Use cases</p></section>'+
 '<section class="content-block v5-seo"><h2>الخصوصية وطريقة المعالجة</h2><p>Local</p></section>'+
 '</main></body></html>';
 const html=enhanceHtml(fixture,'tools/pdf-info/index.html');
 assert.doesNotMatch(html,/noindex/);
 assert.match(html,/تعرض النتائج ولا تنشئ ملفًا جديدًا للتنزيل/);
 assert.match(html,/title/);
 assert.match(html,/حدود الفحص وخصوصية الملف/);
 assert.doesNotMatch(html,/Old generic download steps/);
 assert.throws(()=>enhanceHtml(fixture.replace('noindex,follow','index,follow'),'tools/pdf-info/index.html'),/must begin in noindex QA state/);
});

test('defers local UI bootstrap and tool engine scripts without changing their order',()=>{
 const html=[
  '<script src="assets/js/config.v14.js"></script>',
  '<script src="assets/js/tools-data.v14.js"></script>',
  '<script src="assets/js/site.v14.js"></script>',
  '<script src="assets/js/tool-engine.v14.js"></script>'
 ].join('');
 const out=enhanceHtml(fixture.replace('</body>','</body>'),'index.html');
 const transformed=out.replace(/<script data-docmivo-experience>[\s\S]*?<\/script>/,'');
 const ordered=html.replace(/<script/g,'<script');
 assert.match(transformed,/<script defer src="assets\/js\/config\.v14\.js"><\/script>/);
 assert.match(transformed,/<script defer src="assets\/js\/tools-data\.v14\.js"><\/script>/);
 assert.match(transformed,/<script defer src="assets\/js\/site\.v14\.js"><\/script>/);
 assert.match(transformed,/<script defer src="assets\/js\/tool-engine\.v14\.js"><\/script>/);
});

test('leaves asynchronous Google tags, vendor libraries and inline bootstrap untouched',()=>{
 const html='<!doctype html><html><head><title>x</title><script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script><script src="assets/js/vendor/docmivo-qr-engine.js"></script><script>window.inlineBootstrap=true;</script></head><body></body></html>';
 const out=enhanceHtml(html,'index.html');
 assert.match(out,/<script async src="https:\/\/www\.googletagmanager/);
 assert.match(out,/<script async src="https:\/\/pagead2\.googlesyndication/);
 assert.match(out,/<script src="assets\/js\/vendor\/docmivo-qr-engine\.js"><\/script>/);
 assert.match(out,/<script>window\.inlineBootstrap=true;<\/script>/);
});

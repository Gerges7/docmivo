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

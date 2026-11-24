import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cases=[
 {slug:'sign-pdf',expected:['signed.pdf','رقم الصفحة','صورة إلى صفحة واحدة','شهادة توقيع إلكتروني'],prohibited:['شهادة رقمية صالحة تلقائيًا']},
 {slug:'remove-metadata',expected:['metadata-removed.pdf','Title, Author, Subject, Keywords, Creator, Producer','لا يساوي التنقيح الأمني','معلومات PDF'],prohibited:['إزالة كل المعلومات المخفية']},
 {slug:'watermark-pdf',expected:['watermarked.pdf','كل الصفحات','CONFIDENTIAL','ليست بديلًا عن التحكم في الوصول'],prohibited:['تشفير تلقائي']}
];
for(const c of cases){
 test(c.slug+' has factual, original help matching actual controls',()=>{
  const html=fs.readFileSync(path.join(root,'tools',c.slug,'index.html'),'utf8');
  assert.match(html,/<h1>/);
  assert.equal((html.match(/class="content-block dm-actual-tool-guide"/g)||[]).length,3);
  assert.doesNotMatch(html,/اختر الملف أو الملفات المطلوبة من جهازك/);
  assert.doesNotMatch(html,/بدل تنفيذ الخطوة يدويًا أو تثبيت برنامج كامل/);
  for(const needle of c.expected)assert.ok(html.includes(needle),c.slug+' missing: '+needle);
  for(const needle of c.prohibited)assert.ok(!html.includes(needle),c.slug+' false promise: '+needle);
 });
}

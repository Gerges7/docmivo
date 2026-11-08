import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const dir=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const source=p=>path.join(dir,'../cloudflare-overrides',p);
require(source('assets/js/vendor/docmivo-qr-engine.js'));
require(source('assets/js/v17-qr-core.js'));
const helper=globalThis.DocMivoQRData;
const QR=globalThis.DocMivoQRCode;
const cases=[
  ['URL','url',{url:'https://getdocmivo.com/tools/qr-code'}],
  ['Arabic','text',{text:'استبيان كلية الحاسبات'}],
  ['Wi-Fi','wifi',{ssid:'MyWifi',password:'secret123',security:'WPA',hidden:false}],
  ['vCard','vcard',{name:'Example User',phone:'123',email:'test@example.com'}],
  ['Emoji','text',{text:'Hello 🌍'}]
];
for(const [name,type,fields] of cases)test('QR matrix builds for '+name,()=>{
  const text=helper.payload(type,fields);
  const qr=new QR(-1,2);
  qr.addData(Buffer.from(text,'utf8').toString('latin1'));
  qr.make();assert.ok(qr.getModuleCount()>=21);
  assert.equal(typeof qr.isDark(0,0),'boolean');
});
test('QR rejects invalid URL and invalid Wi-Fi data',()=>{
 assert.throws(()=>helper.payload('url',{url:'javascript:alert(1)'}));
 assert.throws(()=>helper.payload('wifi',{ssid:'Network',password:'',security:'WPA'}));
});
test('QR contrast detects unreadable colors',()=>{
 assert.ok(helper.contrast('#fdfdfd','#ffffff')<4.5);
});
test('QR page is self-hosted and still noindex while unverified on real phones',()=>{
  const html=fs.readFileSync(source('tools/qr-code/index.html'),'utf8');
  assert.match(html,/vendor\/docmivo-qr-engine\.js/);
  assert.doesNotMatch(html,/qrcode@1\.5\.4\/lib\/browser\.min\.js/);
  assert.match(html,/noindex,follow/);
});

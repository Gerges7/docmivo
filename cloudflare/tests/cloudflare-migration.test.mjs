import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import app, {converterToken,originAllowed,magicOk,aiPrompt,converterReady} from '../src/worker.mjs';
import {patchEngine,addHomeTools} from '../scripts/build-cloudflare.mjs';

const BASE='https://docmivo-cloudflare.example';
const env={AI_ENABLED:'false',CONVERTER_ENABLED:'true',CONVERTER_SHARED_SECRET:'test-strong-secret',
  CONVERTER_API_URL:'https://cloudrun.example',CONVERTER_MAX_UPLOAD_BYTES:'26214400',
  ASSETS:{fetch:async()=>new Response('static!',{status:200,headers:{'Content-Type':'text/html'}})}};
const req=(path,method='GET',body=null,headers={})=>new Request(BASE+path,{method,body,headers});
const post=(path,payload,headers={})=>req(path,'POST',JSON.stringify(payload),{'Content-Type':'application/json','Origin':BASE,...headers});

test('Health is truthful: AI disabled, converter active',async()=>{
  const r=await app.fetch(req('/api/health'),env);const d=await r.json();
  assert.equal(r.status,200);assert.equal(d.ai,false);assert.equal(d.converter,true);
  assert.equal(r.headers.get('Cache-Control'),'no-store, max-age=0');
});
test('Static assets served through binding with security headers',async()=>{
  const r=await app.fetch(req('/guides'),env);
  assert.equal(await r.text(),'static!');assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');
});
test('workers.dev preview always noindex without changing canonical domain',async()=>{
  const r=await app.fetch(new Request('https://docmivo-cloudflare.test.workers.dev/'),env);
  assert.match(r.headers.get('x-robots-tag'),/noindex/);
});
test('GET converter health respects env and modes',async()=>{
  const r=await app.fetch(req('/api/converter_token'),env);
  const d=await r.json();assert.equal(d.configured,true);
  assert.ok(d.modes.includes('word_to_pdf'));assert.ok(d.modes.includes('searchable_ocr'));
});
test('Converter token bytes match existing Cloud Run HMAC signature',async()=>{
  const r=await app.fetch(post('/api/converter_token',{mode:'word_to_pdf',size:1200}),env);
  const d=await r.json();assert.equal(r.status,200);assert.equal(d.uploadUrl,'/api/convert');
  const [payload,sig]=d.token.split('.');
  assert.equal(createHmac('sha256',env.CONVERTER_SHARED_SECRET).update(payload).digest('base64url'),sig);
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(data),['exp','max_size','mode','nonce']);
  assert.equal(data.max_size,1200);assert.equal(data.mode,'word_to_pdf');
});
test('Unsafe Origin is rejected before token issuance',async()=>{
  const r=await app.fetch(post('/api/converter_token',{mode:'word_to_pdf',size:100},{Origin:'https://attacker.example'}),env);
  assert.equal(r.status,403);
  assert.equal(originAllowed(post('/api/converter_token',{}, {Origin:'https://attacker.example'})),false);
});
test('Token rejects oversized and unknown modes',async()=>{
  const tooBig=await app.fetch(post('/api/converter_token',{mode:'word_to_pdf',size:999999999}),env);
  assert.equal(tooBig.status,413);
  const unknown=await app.fetch(post('/api/converter_token',{mode:'whatever',size:100}),env);
  assert.equal(unknown.status,400);
});
test('Converter stays disabled unless all required settings present',async()=>{
  assert.equal(converterReady({...env,CONVERTER_SHARED_SECRET:''}),false);
  assert.equal(converterReady({...env,CONVERTER_API_URL:'http://unsafe.example'}),false);
  assert.equal(converterReady({...env,CONVERTER_ENABLED:'false'}),false);
});
test('AI health reports disabled; POST is blocked until explicitly enabled',async()=>{
  const r=await app.fetch(req('/api/ai'),env);assert.equal((await r.json()).configured,false);
  const bad=await app.fetch(req('/api/ai','POST',new FormData()),env);
  assert.equal(bad.status,503);
});
test('AI helpers validate magic and missing question',()=>{
  assert.equal(magicOk(new Uint8Array([37,80,68,70,45]),'application/pdf'),true);
  assert.equal(magicOk(new Uint8Array([255,216,255,200]),'application/pdf'),false);
  assert.throws(()=>aiPrompt('ask',new FormData()),/السؤال/);
});
test('Home expansion includes new tools only once',()=>{
  const html='<title>DocMivo — أدوات PDF مجانية وسهلة</title><section class="section ai-section" id="ai-tools">';
  const next=addHomeTools(html);assert.match(next,/id="v17-new-tools"/);
  assert.equal((addHomeTools(next).match(/id="v17-new-tools"/g)||[]).length,1);
});
test('Patch refuses modified baseline instead of silently doing nothing',()=>{
  assert.throws(()=>patchEngine('unrelated engine'),/Source changed/);
});

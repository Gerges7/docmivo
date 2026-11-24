import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyAdSensePageScope,scopeAdSensePage} from '../scripts/adsense-page-scope.mjs';

const publisher='1551519098591089';
const meta='<meta content="ca-pub-1551519098591089" name="google-adsense-account"/>';
const tag='<script async="" crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1551519098591089"></script>';
const loader='<script src="assets/js/ads.v14.js"></script>';
const page=(extra='')=>'<!doctype html><html><head>'+meta+tag+'<title>Test page</title></head><body><main><h1>Useful content</h1><p>Original content remains intact.</p></main>'+loader+'<script src="assets/js/site.v14.js"></script>'+extra+'</body></html>';
const make=()=>fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-adsense-scope-'));
const put=(root,rel,value)=>{const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);return file;};

test('keeps one matching AdSense verification tag on indexable content pages',()=>{
 const out=scopeAdSensePage(page(), 'tools/merge-pdf/index.html',publisher);
 assert.equal((out.match(/name="google-adsense-account"/g)||[]).length,1);
 assert.equal((out.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/g)||[]).length,1);
 assert.doesNotMatch(out,/ads\.v14\.js/);
 assert.match(out,/Original content remains intact/);
 assert.match(out,/site\.v14\.js/);
});

test('strips ads from noindex, legal, paused and unavailable-tool pages',()=>{
 for(const [rel,html] of [
  ['tools/add-text-pdf/index.html',page().replace('</head>','<meta name="robots" content="noindex,follow"></head>')],
  ['tools/word-to-pdf/index.html',page().replace('</head>','<meta name="robots" content="noindex,follow"></head>')],
  ['terms.html',page()],
  ['contact.html',page()],
  ['guides/word-to-pdf-guide.html',page()],
  ['v17-preview/index.html',page()]
 ]){
  const out=scopeAdSensePage(html,rel,publisher);
  assert.doesNotMatch(out,/google-adsense-account|pagead2\.googlesyndication\.com|ads\.v14\.js/,rel);
  assert.match(out,/site\.v14\.js/,rel);
 }
});

test('removes duplicate legacy loader from every page, even when not eligible',()=>{
 const out=scopeAdSensePage(page(), 'privacy.html',publisher);
 assert.doesNotMatch(out,/ads\.v14\.js/);
});

test('build scopes all HTML pages against robots status and a validated ads.txt seller',()=>{
 const root=make();
 try{
  put(root,'ads.txt','google.com, pub-'+publisher+', DIRECT, f08c47fec0942fa0\n');
  put(root,'index.html',page());
  put(root,'guides/index.html',page());
  put(root,'tools/merge-pdf/index.html',page());
  put(root,'tools/add-text-pdf/index.html',page().replace('</head>','<meta name="robots" content="noindex,follow"></head>'));
  put(root,'privacy.html',page());
  put(root,'cookies.html',page());
  put(root,'terms.html',page());
  put(root,'contact.html',page());
  put(root,'guides/word-to-pdf-guide.html',page());
  const result=applyAdSensePageScope(root);
  assert.equal(result.publisherId,publisher);
  assert.equal(result.eligible,5);
  assert.equal(result.excluded,3);
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/google-adsense-account/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'terms.html'),'utf8'),/pagead2\.googlesyndication/);
  assert.match(fs.readFileSync(path.join(root,'privacy.html'),'utf8'),/pagead2\.googlesyndication/);
  assert.match(fs.readFileSync(path.join(root,'cookies.html'),'utf8'),/pagead2\.googlesyndication/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'tools/add-text-pdf/index.html'),'utf8'),/google-adsense-account/);
  const second=applyAdSensePageScope(root);
  assert.equal(second.eligible,5);
  assert.equal((fs.readFileSync(path.join(root,'index.html'),'utf8').match(/name="google-adsense-account"/g)||[]).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('rejects missing, malformed or unapproved ads.txt seller records',()=>{
 const root=make();
 try{
  put(root,'index.html',page());
  assert.throws(()=>applyAdSensePageScope(root),/ads\.txt is missing/);
  put(root,'ads.txt','google.com, pub-1234567890123456, RESELLER, f08c47fec0942fa0\n');
  assert.throws(()=>applyAdSensePageScope(root),/malformed/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

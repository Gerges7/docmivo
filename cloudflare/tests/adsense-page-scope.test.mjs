import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyAdSensePageScope,scopeAdSensePage} from '../scripts/adsense-page-scope.mjs';

const publisher='1551519098591089';
const meta='<meta content="ca-pub-'+publisher+'" name="google-adsense-account"/>';
const oldTag='<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-'+publisher+'"></script>';
const oldLoader='<script src="../assets/js/ads.v14.js"></script>';
const oldAdsterra='<script async src="https://www.highperformanceformat.com/old-zone/invoke.js"></script>';
const oldInline='<script>window.adsbygoogle=window.adsbygoogle||[];window.adsbygoogle.push({});</script>';
const ga='<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","G-TEST123");</script>';
const page=(extra='')=>'<!doctype html><html><head>'+meta+ga+oldTag+'<title>Test page</title></head><body><main><h1>Useful page</h1><p class="lead">Original content remains intact.</p><h2>First section</h2><p>First useful paragraph.</p><h2>Second section</h2><p>Second useful paragraph.</p></main>'+oldLoader+oldAdsterra+oldInline+'<script src="../assets/js/site.v14.js"></script>'+extra+'</body></html>';
const make=()=>fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-monetization-scope-'));
const put=(root,rel,value)=>{const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);return file;};
const home='<!doctype html><html><head>'+meta+ga+oldTag+'</head><body><main><section class="hero"><h1>DocMivo</h1></section>\n<section class="section" id="tools"><h2>Tools</h2></section></main>'+oldLoader+oldAdsterra+'</body></html>';
const hub='<!doctype html><html><head>'+meta+ga+oldTag+'</head><body><main><div class="section-head"><h1>Guides</h1></div><h2 class="dm-guides-list-title">Choose a guide</h2><div class="guide-grid"></div></main>'+oldLoader+'</body></html>';

test('homepage retains the ownership meta but removes every active AdSense loader',()=>{
 const out=scopeAdSensePage(home,'index.html',publisher);
 assert.equal((out.match(/name="google-adsense-account"/g)||[]).length,1);
 assert.doesNotMatch(out,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
 assert.doesNotMatch(out,/ads\.v14\.js|highperformanceformat\.com|adsbygoogle\.push/);
 assert.match(out,/data-ad-placement="home"/);
 assert.match(out,/monetization\.js/);
 assert.match(out,/consent-manager\.js/);
 assert.match(out,/analytics_storage:"denied"/);
 assert.match(out,/ad_storage:"denied"/);
 assert.match(out,/send_page_view:false/);
 assert.match(out,/dm-ads-consented/);
 assert.match(out,/Original content remains intact|DocMivo/);
});

test('guides hub and original articles get one labelled placement and no active ad code',()=>{
 const hubOut=scopeAdSensePage(hub,'guides/index.html',publisher);
 assert.match(hubOut,/data-ad-placement="guidesHub"/);
 assert.match(hubOut,/monetization\.js/);
 const article=scopeAdSensePage(page(),'guides/merge-pdf-guide.html',publisher);
 assert.match(article,/data-ad-placement="guideArticle"/);
 assert.match(article,/aria-label="مساحة إعلانية"/);
 assert.match(article,/monetization\.js/);
 assert.doesNotMatch(article,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
});

test('tools, noindex, legal and support pages never receive ad slots or ad manager',()=>{
 const paths=[
  'tools/merge-pdf/index.html','tools/qr-code/index.html','tools/image-resize/index.html',
  'tools/add-text-pdf/index.html','terms.html','contact.html','privacy.html','cookies.html',
  'guides/word-to-pdf-guide.html','guides/searchable-ocr-guide.html','admin/monetization/index.html'
 ];
 for(const rel of paths){
  let html=page();
  if(rel.includes('add-text-pdf'))html=html.replace('</head>','<meta name="robots" content="noindex,follow"></head>');
  const out=scopeAdSensePage(html,rel,publisher);
  assert.doesNotMatch(out,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js|ads\.v14\.js|monetization\.js/,rel);
  assert.doesNotMatch(out,/data-ad-placement=/,rel);
  if(!rel.startsWith('admin/'))assert.match(out,/consent-manager\.js/,rel);
  else assert.doesNotMatch(out,/consent-manager\.js/,rel);
 }
});

test('scope is idempotent and never duplicates placements, scripts or publisher meta',()=>{
 let out=scopeAdSensePage(home,'index.html',publisher);
 out=scopeAdSensePage(out,'index.html',publisher);
 assert.equal((out.match(/name="google-adsense-account"/g)||[]).length,1);
 assert.equal((out.match(/data-ad-placement="home"/g)||[]).length,1);
 assert.equal((out.match(/consent-manager\.js/g)||[]).length,1);
 assert.equal((out.match(/monetization\.js/g)||[]).length,1);
});

test('build scopes every HTML page and validates the real seller record without adding fake ad units',()=>{
 const root=make();
 try{
  put(root,'ads.txt','google.com, pub-'+publisher+', DIRECT, f08c47fec0942fa0\n');
  put(root,'index.html',home);
  put(root,'guides/index.html',hub);
  put(root,'guides/merge-pdf-guide.html',page());
  put(root,'tools/merge-pdf/index.html',page());
  put(root,'tools/add-text-pdf/index.html',page().replace('</head>','<meta name="robots" content="noindex,follow"></head>'));
  put(root,'privacy.html',page());
  put(root,'cookies.html',page());
  put(root,'admin/monetization/index.html',page());
  const result=applyAdSensePageScope(root);
  assert.equal(result.publisherId,publisher);
  assert.equal(result.eligible,3);
  assert.equal(result.excluded,5);
  const h=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(h,/google-adsense-account/);
  assert.doesNotMatch(h,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'tools/merge-pdf/index.html'),'utf8'),/monetization\.js/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'admin/monetization/index.html'),'utf8'),/consent-manager\.js/);
  const second=applyAdSensePageScope(root);
  assert.equal(second.eligible,3);
  assert.equal((fs.readFileSync(path.join(root,'index.html'),'utf8').match(/data-ad-placement="home"/g)||[]).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('build refuses a missing or malformed seller record instead of inventing an ID',()=>{
 const root=make();
 try{
  put(root,'index.html',home);
  assert.throws(()=>applyAdSensePageScope(root),/ads\.txt is missing/);
  put(root,'ads.txt','google.com, pub-1234567890123456, RESELLER, f08c47fec0942fa0\n');
  assert.throws(()=>applyAdSensePageScope(root),/valid direct Google seller record/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

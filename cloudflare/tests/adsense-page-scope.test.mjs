import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {applyAdSensePageScope,isAdEligiblePath,isAdEligibleFile,stripAdLoader} from '../scripts/adsense-page-scope.mjs';
const loader='<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1551519098591089"></script>';
const meta='<meta name="google-adsense-account" content="ca-pub-1551519098591089">';
test('only homepage and editorial guide paths are eligible for Auto Ads',()=>{
 for(const p of ['/','/guides','/guides/merge-pdf-guide','/guides/pdf-workflows'])assert.equal(isAdEligiblePath(p),true,p);
 for(const p of ['/tools/merge-pdf','/tools/compress-pdf','/privacy','/terms','/cookies','/contact','/about','/quality','/api/health'])assert.equal(isAdEligiblePath(p),false,p);
});
test('file allowlist covers homepage and guides, not utilities or policy pages',()=>{
 for(const p of ['index.html','guides/index.html','guides/pdf-workflows.html'])assert.equal(isAdEligibleFile(p),true,p);
 for(const p of ['tools/merge-pdf/index.html','privacy.html','contact.html','about.html','quality.html'])assert.equal(isAdEligibleFile(p),false,p);
});
test('stripping removes only the AdSense loader and retains publisher verification metadata',()=>{
 const result=stripAdLoader('<html><head>'+meta+loader+'</head></html>');
 assert.equal(result.removed,1);assert.match(result.html,/google-adsense-account/);assert.doesNotMatch(result.html,/pagead2\.googlesyndication\.com/);
});
test('build retains loader on homepage/guides and excludes interactive/legal pages',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-ads-scope-'));
 try{
  const put=(rel,body)=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,body);};
  put('index.html','<html><head>'+meta+loader+'</head></html>');
  put('guides/index.html','<html><head>'+meta+loader+'</head></html>');
  put('guides/pdf-workflows.html','<html><head>'+meta+loader+'</head></html>');
  put('tools/merge-pdf/index.html','<html><head>'+meta+loader+'</head></html>');
  put('privacy.html','<html><head>'+meta+loader+'</head></html>');
  put('contact.html','<html><head>'+meta+loader+'</head></html>');
  put('assets/js/ads.v14.js',"const C=window.DOCMIVO_CONFIG||{};\nconst client=C.adsenseClient;");
  const result=applyAdSensePageScope(dir);
  assert.deepEqual(result,{eligiblePages:3,excludedPages:3,removedLoaders:3});
  for(const p of ['index.html','guides/index.html','guides/pdf-workflows.html']){
   const s=fs.readFileSync(path.join(dir,p),'utf8');assert.match(s,/pagead2\.googlesyndication\.com/);assert.match(s,/google-adsense-account/);
  }
  for(const p of ['tools/merge-pdf/index.html','privacy.html','contact.html']){
   const s=fs.readFileSync(path.join(dir,p),'utf8');assert.doesNotMatch(s,/pagead2\.googlesyndication\.com/);assert.match(s,/google-adsense-account/);
  }
  const js=fs.readFileSync(path.join(dir,'assets/js/ads.v14.js'),'utf8');
  assert.match(js,/DOCMIVO_AD_ELIGIBLE_PATH/);assert.match(js,/p\.startsWith\('\/guides\/'\)/);assert.doesNotThrow(()=>new vm.Script(js));
  assert.throws(()=>applyAdSensePageScope(dir),/already applied/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

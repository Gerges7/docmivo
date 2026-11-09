import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 AUDITED_TOOLS,NOT_AUDITED,improveLandingMetadata,makeAuditedToolIndexable,
 fix404Paths,enableOcrSpacing,curateSitemap,checkCrawling,runSeoReadiness
} from '../scripts/seo-readiness.mjs';

function put(dist,p,html){const f=path.join(dist,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,html);}
const meta=(name,content)=>`<meta name="${name}" content="${content}">`;
const qrPage=(slug)=>`<html lang="ar"><head>${meta('robots','noindex,follow')}<title>اختبار</title><link rel="canonical" href="https://getdocmivo.com/tools/${slug}"></head><body><main>هذه الأدوات في مرحلة V17 التجريبية، ويتم اختبارها قبل فهرستها.</main></body></html>`;
const active=(url)=>`<html><head><link rel="canonical" href="${url}"></head><body><main>محتوى حقيقي</main></body></html>`;
const paused=`<html><head>${meta('robots','noindex,follow')}</head><body>غير متاحة</body></html>`;
const siteUrls=['https://getdocmivo.com/','https://getdocmivo.com/tools/merge-pdf','https://getdocmivo.com/tools/word-to-pdf'];
const xml=(urls=siteUrls)=>'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(url=>`<url><loc>${url}</loc></url>\n`).join('')+'</urlset>';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'docmivo-seo-v188-'));
 put(root,'index.html','<html><head><title>DocMivo — أدوات PDF والصور وQR مجانية</title><meta content="old" name="description"/><meta content="old" property="og:description"/><meta content="old" property="og:title"/><meta content="old" name="twitter:title"/><meta content="old" name="twitter:description"/></head></html>');
 put(root,'404.html','<html><head><link href="assets/css/styles.css"><link href="favicon.svg"><link href="manifest.webmanifest"></head><body><script src="assets/js/site.v14.js"></script></body></html>');
 put(root,'assets/js/tool-engine.v14.js',"const ready = await worker.setParameters({tessedit_pageseg_mode:pageSegMode});");
 put(root,'tools/qr-code/index.html',qrPage('qr-code'));
 put(root,'tools/image-resize/index.html',qrPage('image-resize'));
 put(root,'tools/image-compress/index.html',qrPage('image-compress'));
 put(root,'tools/merge-pdf/index.html',active('https://getdocmivo.com/tools/merge-pdf'));
 put(root,'tools/word-to-pdf/index.html',paused);
 put(root,'robots.txt','User-agent: *\nAllow: /\nSitemap: https://getdocmivo.com/sitemap.xml');
 put(root,'sitemap.xml',xml());
 return root;
}

test('verified tools are deliberately limited to QR and image resize',()=>{
 assert.deepEqual([...AUDITED_TOOLS],['qr-code','image-resize']);
 assert.ok(NOT_AUDITED.includes('image-compress'));
 assert.throws(()=>makeAuditedToolIndexable(qrPage('image-compress'),'image-compress'),/refusing/);
});
test('QA-passed QR page can be indexed but retains canonical',()=>{
 const result=makeAuditedToolIndexable(qrPage('qr-code'),'qr-code');
 assert.doesNotMatch(result,/noindex/i);
 assert.match(result,/canonical/);
 assert.doesNotMatch(result,/مرحلة V17 التجريبية/);
 assert.match(result,/اختبر الناتج/);
});
test('noindex remains for untested image compress and paused tools',()=>{
 const dist=fixture();
 try{runSeoReadiness(dist);
  assert.match(fs.readFileSync(path.join(dist,'tools/image-compress/index.html'),'utf8'),/noindex/);
  assert.match(fs.readFileSync(path.join(dist,'tools/word-to-pdf/index.html'),'utf8'),/noindex/);
 }finally{fs.rmSync(dist,{recursive:true,force:true});}
});
test('mismatched canonical fails before indexing page',()=>{
 const bad=qrPage('qr-code').replace('getdocmivo.com/tools/qr-code','example.org/tools/qr-code');
 assert.throws(()=>makeAuditedToolIndexable(bad,'qr-code'),/canonical/);
});
test('homepage SEO description must match currently available services',()=>{
 const src='<title>DocMivo — أدوات PDF والصور وQR مجانية</title><meta content="stale AI claim" name="description"/><meta content="stale AI claim" property="og:description"/><meta content="stale AI claim" name="twitter:description"/>';
 const out=improveLandingMetadata(src);
 assert.doesNotMatch(out,/stale AI claim/);
 assert.match(out,/OCR|النصوص/);
 assert.match(out,/QR/);
});
test('404 asset paths are root-relative, including nested 404 routes',()=>{
 const a=fix404Paths('<a href="assets/css/styles.css"></a><link href="favicon.svg"><script src="assets/js/site.js"></script><link href="manifest.webmanifest">');
 assert.match(a,/href="\/assets\/css\/styles\.css"/);
 assert.match(a,/src="\/assets\/js\/site\.js"/);
 assert.match(a,/href="\/favicon\.svg"/);
 assert.match(a,/href="\/manifest\.webmanifest"/);
});
test('OCR preserves only recognized spaces using Tesseract documented parameter',()=>{
 const s=enableOcrSpacing('await worker.setParameters({tessedit_pageseg_mode:pageSegMode});');
 assert.match(s,/preserve_interword_spaces:'1'/);
 assert.doesNotMatch(s,/replace\(|split\(/);
 assert.throws(()=>enableOcrSpacing('const noOcr=true'),/expected V18\.6/);
});
test('curator excludes noindex, keeps canonical, skips nonexistent routes, adds audited tools',()=>{
 const dist=fixture();
 try {
  for(const slug of AUDITED_TOOLS)put(dist,`tools/${slug}/index.html`,makeAuditedToolIndexable(qrPage(slug),slug));
  const data=curateSitemap(xml([...siteUrls,'https://getdocmivo.com/tools/missing','https://getdocmivo.com/tools/merge-pdf']),dist);
  assert.equal((data.xml.match(/<loc>/g)||[]).length,4);
  assert.match(data.xml,/tools\/qr-code/);
  assert.match(data.xml,/tools\/image-resize/);
  assert.doesNotMatch(data.xml,/word-to-pdf|missing/);
  assert.doesNotMatch(data.xml,/image-compress/);
  assert.ok(data.excluded>=2);
 }finally{fs.rmSync(dist,{recursive:true,force:true});}
});
test('production-style release writes all assets and sitemap, and QA gate passes',()=>{
 const dist=fixture();
 try{
  const result=runSeoReadiness(dist);
  assert.equal(result.sitemapUrls,4);
  assert.equal(checkCrawling(dist).bad.length,0);
  assert.match(fs.readFileSync(path.join(dist,'assets/js/tool-engine.v14.js'),'utf8'),/preserve_interword_spaces/);
  assert.match(fs.readFileSync(path.join(dist,'404.html'),'utf8'),/href="\/assets\/css\/styles\.css"/);
  const s=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
  assert.ok(s.includes('https://getdocmivo.com/tools/image-resize'));
  assert.ok(!s.includes('word-to-pdf'));
 }finally{fs.rmSync(dist,{recursive:true,force:true});}
});
test('build aborts without partial writes on missing verified tool',()=>{
 const dist=fixture();
 try{
  fs.rmSync(path.join(dist,'tools/qr-code/index.html'));
  const before=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  assert.throws(()=>runSeoReadiness(dist),/missing dist file/);
  assert.equal(fs.readFileSync(path.join(dist,'index.html'),'utf8'),before);
 }finally{fs.rmSync(dist,{recursive:true,force:true});}
});
test('sitemap URLs never contain www, workers.dev, or noindex paused tools',()=>{
 const dist=fixture();
 try{runSeoReadiness(dist);
  const s=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
  for(const deny of ['www.getdocmivo.com','workers.dev','tools/word-to-pdf','tools/image-compress'])assert.ok(!s.includes(deny));
 }finally{fs.rmSync(dist,{recursive:true,force:true});}
});

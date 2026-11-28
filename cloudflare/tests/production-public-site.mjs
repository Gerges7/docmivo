/**
 * Read-only public production audit. Use alongside the Playwright user journeys.
 * Do not claim this establishes AdSense acceptance or actual Google indexation.
 */
import assert from 'node:assert/strict';
const BASE=(process.env.DOCMIVO_BASE||'https://getdocmivo.com').replace(/\/+$/,'');
const failures=[],measurements=[],pageBodies=new Map();
function check(name,fn){return Promise.resolve().then(fn).then(()=>console.log('PASS '+name)).catch(e=>{failures.push({name,reason:e.message});console.error('FAIL '+name+': '+e.message);});}
async function fetchText(route){
 const url=route.startsWith('https://')?route:BASE+route;
 let last;
 for(let i=0;i<2;i++){
  try{
   const start=Date.now();
   const r=await fetch(url,{headers:{'User-Agent':'DocMivo-GitHub-Production-QA/1.0','Accept':'text/html,application/json,text/plain,*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});
   const body=await r.text();measurements.push({url,status:r.status,ms:Date.now()-start,bytes:body.length});pageBodies.set(url,body);
   if(r.status>=500||r.status===429){last=new Error('HTTP '+r.status);continue;}
   assert.equal(r.status,200,'HTTP '+r.status+' '+url);
   assert.ok(body.length>15,'Empty response '+url);
   assert.ok(!/Just a moment\.\.\.|Checking your browser|Attention Required! \| Cloudflare/i.test(body.slice(0,1800)),'Cloudflare challenge '+url);
   return {body,headers:r.headers,url:r.url};
  }catch(e){last=e;if(i===0)continue;}
 }
 throw last||new Error('Unable to fetch '+url);
}
function metadata(html,url){
 assert.match(html,/<html\b/i,'Missing HTML document');
 assert.match(html,/<title>[^<]{8,}<\/title>/i,'Missing meaningful title: '+url);
 const desc=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).find(tag=>/\bname=["']description["']/i.test(tag));
 const description=desc?.match(/\bcontent=["']([^"']+)["']/i)?.[1]||'';
 assert.ok(description.length>=40,'Missing meaningful description: '+url);
 assert.match(html,/<h1\b[^>]*>/i,'Missing H1: '+url);
 assert.ok(!/<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)/i.test(html),'Listed page contains noindex: '+url);
 const canonical=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).find(x=>/\brel=["']canonical["']/i.test(x));
 assert.ok(canonical,'Missing canonical tag: '+url);
 const href=canonical.match(/\bhref=["']([^"']+)/i)?.[1];
 assert.equal(href,url,'Canonical mismatch');
 const main=html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0]||'';
 const clean=main.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 assert.ok(clean.length>=140,'No meaningful main content: '+url);
}
await check('Production health reports Cloudflare Worker',async()=>{
 const {body,headers}=await fetchText('/api/health');
 const h=JSON.parse(body);
 assert.equal(h.ok,true);assert.equal(h.service,'docmivo-cloudflare');
 assert.match(headers.get('content-type')||'',/application\/json/i);
 console.log('INFO: converter='+h.converter+'; AI='+h.ai);
});
await check('Ad networks stay disabled until approval and explicit consent',async()=>{
 const ads=(await fetchText('/ads.txt')).body;
 assert.match(ads,/^google\.com,\s*pub-\d{10,24},\s*DIRECT,\s*f08c47fec0942fa0\s*$/im,'Existing Google seller record must remain valid');
 const home=(await fetchText('/')).body;
 assert.match(home,/name=["']google-adsense-account["']/i,'AdSense ownership meta should remain on homepage');
 assert.doesNotMatch(home,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/,'AdSense loader must not run before approval');
 assert.match(home,/consent-manager\.js/,'First-party consent manager missing');
 assert.match(home,/monetization\.js/,'Eligible homepage ad manager missing');
 assert.match(home,/data-ad-placement=["']home["']/,'Homepage banner placeholder missing');
 const hub=(await fetchText('/guides')).body;
 assert.match(hub,/data-ad-placement=["']guidesHub["']/,'Guides hub placement missing');
 assert.match(hub,/monetization\.js/,'Guides hub manager missing');
 const article=(await fetchText('/guides/merge-pdf-guide')).body;
 assert.match(article,/data-ad-placement=["']guideArticle["']/,'Editorial article placement missing');
 assert.match(article,/monetization\.js/,'Article manager missing');
 for(const route of ['/tools/merge-pdf','/tools/qr-code','/tools/image-resize','/tools/compress-pdf']){
  const page=(await fetchText(route)).body;
  assert.doesNotMatch(page,/monetization\.js|adsbygoogle\.js|highperformanceformat\.com/i,'Interactive tool must remain ad-free: '+route);
 }
 for(const route of ['/privacy','/cookies','/terms','/contact','/about']){
  const page=(await fetchText(route)).body;
  assert.doesNotMatch(page,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js|highperformanceformat\.com/i,'Legal/support page must not load ad network code: '+route);
 }
 const admin=(await fetchText('/admin/monetization')).body;
 assert.match(admin,/name=["']robots["'][^>]*noindex/i,'Monetization admin must be noindex');
 const robots=(await fetchText('/robots.txt')).body;
 assert.match(robots,/User-agent:\s*Mediapartners-Google\s*\nAllow:\s*\//i);
 assert.match(robots,/https:\/\/getdocmivo\.com\/sitemap\.xml/i);
 assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots),'robots.txt blocks entire site');
 const config=JSON.parse((await fetchText('/api/monetization/config?path=%2Fguides%2Fmerge-pdf-guide')).body);
 assert.equal(config.enabled,false,'Public ad config must remain OFF until publisher approval');
 assert.equal(config.requireConsent,true);
});
const sitemap=await fetchText('/sitemap.xml').then(r=>r.body).catch(e=>{failures.push({name:'Sitemap fetch',reason:e.message});return '';});
const urls=[...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(x=>x[1].replace(/&amp;/g,'&'));
await check('Sitemap is canonical, nonempty and excludes paused tools',async()=>{
 assert.match(sitemap,/<urlset\b/i);
 assert.ok(urls.length>=50,'Too few curated indexable entries: '+urls.length);
 assert.equal(new Set(urls).size,urls.length,'Sitemap duplicate URL');
 for(const url of urls)assert.ok(url.startsWith(BASE+'/'),'Noncanonical sitemap host '+url);
 for(const paused of ['word-to-pdf','excel-to-pdf','protect-pdf','repair-pdf','searchable-ocr-pdf','pdfa-converter'])assert.ok(!urls.includes(BASE+'/tools/'+paused),'Paused tool indexed: '+paused);
 for(const required of ['/','/guides','/guides/pdf-workflows','/guides/qr-code-guide','/guides/image-optimization-guide','/tools/qr-code','/tools/image-resize'])assert.ok(urls.includes(BASE+required),'Missing important sitemap URL: '+required);
 for(const required of ['/guides/qr-code-guide','/guides/image-optimization-guide','/guides/pdf-workflows','/about','/privacy','/cookies','/quality']){
  const loc='<loc>'+BASE+required+'</loc>',at=sitemap.indexOf(loc);
  assert.ok(at>=0,'Missing lastmod target '+required);
  const a=sitemap.lastIndexOf('<url>',at),b=sitemap.indexOf('</url>',at)+6;
  assert.match(sitemap.slice(a,b),/<lastmod>2026-11-24<\/lastmod>/,'Stale lastmod for '+required);
 }
});
const targets=urls.filter(u=>u.startsWith(BASE+'/'));
let cursor=0;const workers=Array.from({length:3},async()=>{
 while(cursor<targets.length){
  const url=targets[cursor++];
  await check('Sitemap route '+new URL(url).pathname,async()=>{
   const {body,headers}=await fetchText(url);
   assert.match(headers.get('content-type')||'',/text\/html/i,'Sitemap page not HTML');
   metadata(body,url);
  });
 }
});
await Promise.all(workers);
await check('every indexed page is free of active third-party ad scripts by default',async()=>{
 for(const url of targets){
  const body=pageBodies.get(url)|| (await fetchText(url)).body;
  assert.doesNotMatch(body,/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js|highperformanceformat\.com|resources\.infolinks\.com|contextual\.media\.net/i,'Unexpected active ad script: '+url);
 }
 console.log('INFO: ad network scripts are absent from all '+targets.length+' sitemap pages until explicit activation.');
});
await check('interactive tools remain indexable where approved but never request ad scripts',async()=>{
 const monetizationExcluded=['/tools/qr-code','/tools/image-resize','/tools/merge-pdf','/tools/compress-pdf','/tools/sign-pdf','/tools/watermark-pdf','/tools/ocr-pdf','/tools/rotate-pdf'];
 for(const route of monetizationExcluded){
  const page=(await fetchText(route)).body;
  assert.doesNotMatch(page,/monetization\.js|adsbygoogle\.js|highperformanceformat\.com/i,'Tool must not load ads: '+route);
  assert.ok(!page.includes('data-ad-placement='),'Tool must not contain ad slot: '+route);
 }
 for(const route of ['/tools/image-compress','/tools/add-text-pdf','/tools/pdf-to-powerpoint']){
  const page=(await fetchText(route)).body;
  assert.match(page,/noindex/i,'Untested beta tool should remain noindex: '+route);
  assert.doesNotMatch(page,/monetization\.js|adsbygoogle\.js/i,'Untested beta tool must not load ads: '+route);
  assert.ok(!urls.includes(BASE+route),'Untested beta tool must not be in sitemap: '+route);
 }
});
await check('Paused converter accurately warns users and remains noindex',async()=>{
 const {body}=await fetchText('/tools/word-to-pdf');
 assert.match(body,/noindex/i);
 assert.match(body,/غير متاحة|متوقفة|غير مفعّل/i);
});
await check('Critical static frontend assets are available',async()=>{
 for(const p of ['/assets/css/styles.css','/assets/css/experience.css','/assets/js/experience.js','/assets/js/tool-engine.v14.js','/favicon.svg']){
  const {body}=await fetchText(p);
  assert.ok(body.length>100,'Static asset unexpectedly small: '+p);
 }
});
await check('New original PDF workflow guide and theme are deployed',async()=>{
 const home=(await fetchText('/')).body;
 assert.match(home,/href=["']\/guides\/pdf-workflows["']/,'Homepage does not promote workflow guide');
 assert.match(home,/data-docmivo-experience/,'Global dark-mode boot missing');
 const guide=(await fetchText('/guides/pdf-workflows')).body;
 for(const id of ['too-large','wrong-order','scanned','privacy','format','office'])assert.ok(guide.includes('id="'+id+'"'),'Missing scenario '+id);
 const hub=(await fetchText('/guides')).body;
 assert.ok(hub.includes('href="/guides/qr-code-guide"'),'QR guide is missing from guide hub');
 assert.ok(hub.includes('href="/guides/image-optimization-guide"'),'Image optimization guide is missing from guide hub');
 for(const [route,marker] of [['/guides/qr-code-guide','data-editorial-wave3="qr-code"'],['/guides/image-optimization-guide','data-editorial-wave3="image-optimization"']]){
  const page=(await fetchText(route)).body;
  assert.ok(page.includes(marker),'Missing original content section: '+route);
  assert.ok(!/name=["']robots["'][^>]*noindex/i.test(page),'New guide remains noindex: '+route);
 }
});
const oks=measurements.filter(x=>x.status===200),sorted=oks.map(x=>x.ms).sort((a,b)=>a-b);
console.log('PRODUCTION HTTP SUMMARY: '+JSON.stringify({pages:urls.length,requests:measurements.length,status200:oks.length,medianMs:sorted[Math.floor(sorted.length/2)]||0,p95Ms:sorted[Math.floor(sorted.length*.95)]||0,failures:failures.length}));
if(failures.length){console.error('FAILURE DETAILS: '+JSON.stringify(failures));process.exitCode=1;}

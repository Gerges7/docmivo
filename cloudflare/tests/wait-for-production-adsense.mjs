/**
 * Wait for the Cloudflare Git integration to publish the AdSense readiness commit.
 * This polls the same public HTTP path used by production QA; it does not bypass Cloudflare.
 */
const BASE=(process.env.DOCMIVO_BASE||'https://getdocmivo.com').replace(/\/+$/,'');
const publisher='1551519098591089';
const seller='google.com, pub-'+publisher+', DIRECT, f08c47fec0942fa0';
const checks=[
 ['/robots.txt',s=>/User-agent:\s*Mediapartners-Google\s*\nAllow:\s*\//i.test(s)&&/User-agent:\s*Google-Display-Ads-Bot\s*\nAllow:\s*\//i.test(s)],
 ['/ads.txt',s=>s.split(/\r?\n/).some(row=>row.trim()===seller)],
 ['/',s=>/name=["']google-adsense-account["']/.test(s)&&s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-'+publisher)],
 ['/contact',s=>!s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')],
 ['/tools/add-text-pdf',s=>/noindex/i.test(s)&&!s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')],
 ['/sitemap.xml',s=>(s.match(/<loc>/g)||[]).length>=46&&s.includes('<loc>https://getdocmivo.com/guides/qr-code-guide</loc>')&&s.includes('<loc>https://getdocmivo.com/guides/image-optimization-guide</loc>')&&s.includes('<loc>https://getdocmivo.com/tools/rotate-pdf</loc>')],
 ['/guides',s=>s.includes('href="/guides/qr-code-guide"')&&s.includes('href="/guides/image-optimization-guide"')],
 ['/guides/qr-code-guide',s=>s.includes('data-editorial-wave3="qr-code"')&&!/name=["']robots["'][^>]*noindex/i.test(s)],
 ['/guides/image-optimization-guide',s=>s.includes('data-editorial-wave3="image-optimization"')&&!/name=["']robots["'][^>]*noindex/i.test(s)],
 ['/tools/rotate-pdf',s=>!/<meta\b[^>]*name=["']robots["'][^>]*noindex/i.test(s)]
];
async function get(route){
 const r=await fetch(BASE+route,{redirect:'follow',headers:{'User-Agent':'DocMivo-GitHub-Production-QA/1.0','Accept':'text/html,text/plain,*/*'},signal:AbortSignal.timeout(20000)});
 if(r.status!==200)throw new Error(route+' returned HTTP '+r.status);
 return r.text();
}
for(let attempt=1;attempt<=18;attempt++){
 const failures=[];
 for(const [route,validate] of checks){
  try{const body=await get(route);if(!validate(body))failures.push(route+' does not contain the expected deployed configuration');}
  catch(e){failures.push(route+': '+e.message);}
 }
 if(!failures.length){console.log('PASS production AdSense configuration is deployed and publicly readable');process.exit(0);}
 console.log('Waiting for Cloudflare deployment ('+attempt+'/18): '+failures.join(' | '));
 if(attempt<18)await new Promise(resolve=>setTimeout(resolve,10000));
}
console.error('Production deployment did not publish the expected AdSense configuration within 3 minutes.');
process.exit(1);

/**
 * Wait for the Cloudflare Git integration to publish the AdSense readiness commit.
 * This polls the same public HTTP path used by production QA; it does not bypass Cloudflare.
 */
const BASE=(process.env.DOCMIVO_BASE||'https://getdocmivo.com').replace(/\/+$/,'');
const publisher='1551519098591089';
const checks=[
 ['/robots.txt',s=>/User-agent:\s*Mediapartners-Google\s*\nAllow:\s*\//i.test(s)&&/User-agent:\s*Google-Display-Ads-Bot\s*\nAllow:\s*\//i.test(s)],
 ['/ads.txt',s=>new RegExp('^google\\\\.com,\\\\s*pub-'+publisher+',\\\\s*DIRECT,\\\\s*f08c47fec0942fa0\\\\s*$','im').test(s)],
 ['/',s=>/name=["']google-adsense-account["']/.test(s)&&s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-'+publisher)],
 ['/privacy',s=>!s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')],
 ['/tools/add-text-pdf',s=>/noindex/i.test(s)&&!s.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')]
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

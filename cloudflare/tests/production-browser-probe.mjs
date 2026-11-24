/**
 * Diagnose Cloudflare's treatment of an ordinary, non-stealth Chromium run.
 * This is not a bypass. 403 means production browser QA is *unverified*.
 */
import {chromium} from 'playwright';
import fs from 'node:fs';
const BASE=process.env.DOCMIVO_BASE||'https://getdocmivo.com';
let code='unavailable';
const browser=await chromium.launch({headless:true,...(process.env.DOCMIVO_BROWSER_CHANNEL?{channel:process.env.DOCMIVO_BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>{console.error('Browser probe navigation error: '+e.message);return null;});
 if(response){
  code=String(response.status());
  const headers=response.headers();
  console.log('Production Chromium HTTP status '+code+'; cf-mitigated='+(headers['cf-mitigated']||'none')+'; server='+(headers.server||'unspecified'));
 }
 if(code!=='200')console.log('::warning::Production Chromium is not allowed (HTTP '+code+'). Full browser testing remains unverified; local functional QA is NOT a substitute for real production interaction.');
 await page.close();
}finally{await browser.close();}
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'http_status='+code+'\n');

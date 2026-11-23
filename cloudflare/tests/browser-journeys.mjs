import {chromium} from 'playwright';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const BASE=process.env.DOCMIVO_BASE||'http://127.0.0.1:8787';
const DIST=path.resolve('dist');
const OUT=path.resolve('qa-artifacts');
fs.mkdirSync(OUT,{recursive:true});
let passed=0,failed=0;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:800}});
await context.route(/google-analytics\.com|googletagmanager\.com|googlesyndication\.com|doubleclick\.net/,r=>r.abort());
async function check(name,fn){
 try{await fn();passed++;console.log('PASS '+name);}
 catch(error){failed++;console.error('FAIL '+name+': '+(error.stack||error));}
}
async function pageAt(route,width=1280){
 const page=await context.newPage();
 await page.setViewportSize({width,height:800});
 const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(response?.status(),200,'HTTP status for '+route);
 return page;
}
async function makePdf(widths){
 const doc=await PDFDocument.create();
 const font=await doc.embedFont(StandardFonts.Helvetica);
 widths.forEach((width,i)=>{
  const p=doc.addPage([width,420]);
  p.drawText('DOCMIVO PAGE '+(i+1),{x:30,y:350,size:24,font});
 });
 return Buffer.from(await doc.save());
}
async function toolDownload(route,files,field,value){
 const p=await pageAt(route);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.waitForFunction(()=>!!window.PDFLib && !!window.pdfjsLib && !!window.JSZip,{timeout:30000});
  await p.locator('#fileInput').setInputFiles(files);
  if(field)await p.locator(field).fill(value);
  const [download]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('#runTool').click()]);
  const data=fs.readFileSync(await download.path());
  assert.ok(data.byteLength>200,'Downloaded file unexpectedly empty');
  assert.deepEqual(errors,[]);
  return {data,name:download.suggestedFilename()};
 }finally{await p.close();}
}
await check('Worker health and publicly advertised service',async()=>{
 const response=await context.request.get(BASE+'/api/health');
 assert.equal(response.status(),200);
 const j=await response.json();
 assert.equal(j.service,'docmivo-cloudflare');
 assert.equal(j.ok,true);
});
await check('Homepage, search, and mobile navigation without horizontal overflow',async()=>{
 const p=await pageAt('/',390);
 try{
  await p.locator('#toolSearch').fill('QR');
  await p.locator('#dmResults').waitFor({state:'visible'});
  assert.ok((await p.locator('.tool-card:visible').count())>=0);
  await p.locator('#toolSearch').fill('no-result-zzzzz');
  await p.locator('#dmNoResults').waitFor({state:'visible'});
  await p.locator('.menu-btn').click();
  assert.equal(await p.locator('.menu-btn').getAttribute('aria-expanded'),'true');
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.menu-btn').getAttribute('aria-expanded'),'false');
  const dims=await p.evaluate(()=>({vw:window.innerWidth,sw:document.documentElement.scrollWidth}));
  assert.ok(dims.sw<=dims.vw+2,'Horizontal overflow '+JSON.stringify(dims));
  await p.locator('#toolSearch').fill('');
  await p.screenshot({path:path.join(OUT,'home-mobile.png'),fullPage:true});
 }finally{await p.close();}
});
await check('QR generates a nonblank image and downloadable PNG/SVG',async()=>{
 const p=await pageAt('/tools/qr-code');
 try{
  await p.locator('#qrUrl').fill('https://getdocmivo.com/');
  await p.locator('#qrGenerate').click();
  await p.waitForFunction(()=>!document.getElementById('qrDownloadPng').disabled,{timeout:12000});
  const hasInk=await p.locator('#qrCanvas').evaluate(c=>{
    const ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;
    let dark=0;for(let i=0;i<data.length;i+=4)if(data[i]<100&&data[i+1]<100&&data[i+2]<100)dark++;
    return dark>100;
  });
  assert.ok(hasInk,'QR canvas empty');
  const [png]=await Promise.all([p.waitForEvent('download'),p.locator('#qrDownloadPng').click()]);
  const b=fs.readFileSync(await png.path());
  assert.equal(b.subarray(1,4).toString(),'PNG');
  const [svg]=await Promise.all([p.waitForEvent('download'),p.locator('#qrDownloadSvg').click()]);
  assert.match(fs.readFileSync(await svg.path(),'utf8'),/<svg\b/);
  await p.screenshot({path:path.join(OUT,'qr-desktop.png'),fullPage:true});
 }finally{await p.close();}
});
await check('Merge PDF preserves page order, count and dimensions',async()=>{
 const a=await makePdf([330]),b=await makePdf([510]);
 const {data}=await toolDownload('/tools/merge-pdf',[
  {name:'alpha.pdf',mimeType:'application/pdf',buffer:a},
  {name:'beta.pdf',mimeType:'application/pdf',buffer:b}]);
 const doc=await PDFDocument.load(data);
 assert.equal(doc.getPageCount(),2);
 assert.equal(Math.round(doc.getPage(0).getWidth()),330);
 assert.equal(Math.round(doc.getPage(1).getWidth()),510);
});
await check('Split PDF produces two correct PDF entries in ZIP',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/split-pdf',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#pageRanges','1;2');
 const zip=await JSZip.loadAsync(data);
 const names=Object.keys(zip.files).filter(n=>n.endsWith('.pdf')).sort();
 assert.deepEqual(names,['part-1.pdf','part-2.pdf']);
 const a=await PDFDocument.load(await zip.file('part-1.pdf').async('uint8array'));
 const b=await PDFDocument.load(await zip.file('part-2.pdf').async('uint8array'));
 assert.equal(a.getPageCount(),1);assert.equal(b.getPageCount(),1);
 assert.equal(Math.round(a.getPage(0).getWidth()),330);
 assert.equal(Math.round(b.getPage(0).getWidth()),510);
});
await check('Reorder PDF changes page sequence without losing pages',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/reorder-pages',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#pageOrder','2,1');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),2);
 assert.equal(Math.round(d.getPage(0).getWidth()),510);
 assert.equal(Math.round(d.getPage(1).getWidth()),330);
});
await check('Paused converter page is explicitly unavailable and noindex',async()=>{
 const p=await pageAt('/tools/word-to-pdf');
 try{
  assert.match(await p.locator('h1').innerText(),/غير متاحة/);
  assert.equal(await p.locator('input[type=file]').count(),0);
  assert.match(await p.locator('meta[name=robots]').getAttribute('content'),/noindex/);
 }finally{await p.close();}
});
await check('All published tool routes render usable or intentionally paused pages',async()=>{
 const dir=path.join(DIST,'tools');
 const slugs=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(path.join(dir,x.name,'index.html'))).map(x=>x.name);
 assert.ok(slugs.length>=60,'Expected complete tool inventory');
 const p=await context.newPage();const failures=[];
 try{
  for(const slug of slugs){
   try{
    const response=await p.goto(BASE+'/tools/'+slug,{waitUntil:'domcontentloaded',timeout:25000});
    if(response.status()!==200)throw Error('HTTP '+response.status());
    const h=await p.locator('h1').count();
    if(h!==1)throw Error('H1 count '+h);
   }catch(error){failures.push(slug+': '+error.message);}
  }
  assert.deepEqual(failures,[]);
  console.log('QA inspected '+slugs.length+' tool routes');
 }finally{await p.close();}
});
await browser.close();
console.log('BROWSER QA RESULT '+passed+' passed, '+failed+' failed');
if(failed)process.exit(1);

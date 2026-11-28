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
const browser=await chromium.launch({headless:true,...(process.env.DOCMIVO_BROWSER_CHANNEL?{channel:process.env.DOCMIVO_BROWSER_CHANNEL}:{})});
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
  if(field){const e=p.locator(field);if(await e.evaluate(n=>n.tagName)==='SELECT')await e.selectOption(value);else await e.fill(value);}
  const [download]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('#runTool').click()]);
  const data=fs.readFileSync(await download.path());
  assert.ok(data.byteLength>20,'Downloaded file unexpectedly empty');
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
await check('Consent defaults to denied and can be reopened without blocking PDF tools',async()=>{
 const p=await pageAt('/',390);
 try{
  const banner=p.locator('.dm-consent-banner');
  await banner.waitFor({state:'visible'});
  const defaults=await p.evaluate(()=>window.dataLayer.map(x=>Array.from(x)));
  assert.ok(defaults.some(x=>x[0]==='consent'&&x[1]==='default'&&x[2]?.analytics_storage==='denied'&&x[2]?.ad_storage==='denied'));
  await p.locator('[data-consent-reject]').click();
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('docmivo:consent:v1')||'null')?.ads===false);
  await p.goto(BASE+'/tools/merge-pdf',{waitUntil:'domcontentloaded'});
  assert.equal(await p.locator('.dm-consent-banner').count(),0,'Consent banner should not cover interactive tool pages');
  assert.equal(await p.locator('script[src*="adsbygoogle.js"]').count(),0);
  assert.equal(await p.locator('script[src*="highperformanceformat.com"]').count(),0);
  await p.locator('#privacy-settings-link').click();
  await p.locator('.dm-consent-banner').waitFor({state:'visible'});
 }finally{await p.close();}
});
await check('PDF workflow guide offers useful interactive checklists on mobile',async()=>{
 const p=await pageAt('/guides/pdf-workflows',390);
 try{
  assert.match(await p.title(),/اختيار أداة PDF/);
  assert.equal(await p.locator('.wf-item').count(),6);
  assert.equal(await p.locator('.wf-steps input[type="checkbox"]').count(),24);
  assert.equal(await p.locator('input[type="file"]').count(),0);
  const first=p.locator('#too-large .wf-steps input[type="checkbox"]').first();
  await first.check();
  assert.match(await p.locator('#too-large .wf-progress').innerText(),/1 من 4/);
  assert.match((await p.locator('#wrong-order .wf-progress').textContent())||'',/0 من 4/);
  assert.equal(await p.locator('link[rel="canonical"]').getAttribute('href'), 'https://getdocmivo.com/guides/pdf-workflows');
  const size=await p.evaluate(()=>({viewport:window.innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.viewport+2,'Workflows mobile overflow '+JSON.stringify(size));
  await p.locator('.wf-item#privacy summary').click();
  assert.ok(await p.locator('#privacy .wf-body').isVisible());
 } finally {await p.close();}
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

await check('Rotate all PDF pages 90 degrees',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/rotate-pdf',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#rotation','90');
 const d=await PDFDocument.load(data);assert.equal(d.getPageCount(),2);
 assert.equal(d.getPage(0).getRotation().angle,90);
 assert.equal(d.getPage(1).getRotation().angle,90);
});
await check('Delete page 2 preserves original page 1',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/delete-pages',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#pageRanges','2');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),1);assert.equal(Math.round(d.getPage(0).getWidth()),330);
});
await check('Extract page 2 preserves correct source page',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/extract-pages',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#pageRanges','2');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),1);assert.equal(Math.round(d.getPage(0).getWidth()),510);
});
await check('PDF to PNG returns actual PNGs in a ZIP',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/pdf-to-png',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#scale','1');
 const zip=await JSZip.loadAsync(data);
 const names=Object.keys(zip.files).filter(n=>n.endsWith('.png'));
 assert.equal(names.length,2);
 for(const n of names){
  const b=Buffer.from(await zip.file(n).async('uint8array'));
  assert.equal(b.subarray(1,4).toString(),'PNG');
 }
});
await check('PDF to JPG returns genuine JPEGs in a ZIP',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/pdf-to-jpg',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#scale','1');
 const zip=await JSZip.loadAsync(data);
 const names=Object.keys(zip.files).filter(n=>/\.jpe?g$/i.test(n));
 assert.equal(names.length,2);
 for(const n of names){
  const b=Buffer.from(await zip.file(n).async('uint8array'));
  assert.equal(b[0],255);assert.equal(b[1],216);assert.equal(b[2],255);
 }
});
await check('Image Resize preserves aspect ratio and PNG dimensions',async()=>{
 const p=await pageAt('/tools/image-resize');
 try{
  const base64=await p.evaluate(()=>{
   const c=document.createElement('canvas');c.width=120;c.height=60;
   const g=c.getContext('2d');g.fillStyle='#29415c';g.fillRect(0,0,120,60);
   return c.toDataURL('image/png').split(',')[1];
  });
  await p.locator('#imageInput').setInputFiles([{name:'qa.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')}]);
  await p.waitForFunction(()=>document.getElementById('imgWidth').value==='120');
  await p.locator('#imgWidth').fill('600');
  await p.waitForFunction(()=>document.getElementById('imgHeight').value==='300');
  await p.locator('#imgFormat').selectOption('image/png');
  const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#imageRun').click()]);
  const b=fs.readFileSync(await download.path());
  assert.equal(b.subarray(1,4).toString(),'PNG');
  assert.equal(b.readUInt32BE(16),600);assert.equal(b.readUInt32BE(20),300);
 }finally{await p.close();}
});


await check('Images to PDF generates A4 pages from two input PNG images',async()=>{
 const p=await pageAt('/tools/images-to-pdf');
 try{
  const png=await p.evaluate(()=>{
   const c=document.createElement('canvas');c.width=80;c.height=40;
   const g=c.getContext('2d');g.fillStyle='#4455aa';g.fillRect(0,0,80,40);
   return c.toDataURL('image/png').split(',')[1];
  });
  const bytes=Buffer.from(png,'base64');
  await p.locator('#fileInput').setInputFiles([
   {name:'one.png',mimeType:'image/png',buffer:bytes},
   {name:'two.png',mimeType:'image/png',buffer:bytes}
  ]);
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:25000}),p.locator('#runTool').click()]);
  const doc=await PDFDocument.load(fs.readFileSync(await dl.path()));
  assert.equal(doc.getPageCount(),2);
  assert.ok(Math.abs(doc.getPage(0).getWidth()-595.28)<2);
  assert.ok(Math.abs(doc.getPage(0).getHeight()-841.89)<2);
 }finally{await p.close();}
});
await check('PDF to WebP ZIP contains genuine WebP bitstreams',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/pdf-to-webp',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}],'#scale','1');
 const zip=await JSZip.loadAsync(data);
 const names=Object.keys(zip.files).filter(n=>n.endsWith('.webp'));
 assert.equal(names.length,2);
 for(const name of names){
  const bytes=Buffer.from(await zip.file(name).async('uint8array'));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 }
});
await check('Extract Text outputs text from all source pages',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/extract-text',[{name:'two.pdf',mimeType:'application/pdf',buffer:input}]);
 const txt=data.toString('utf8');
 assert.match(txt,/DOCMIVO\s+PAGE\s+1/);
 assert.match(txt,/DOCMIVO\s+PAGE\s+2/);
});
await check('Page Numbers puts sequential labels in source PDF',async()=>{
 const input=await makePdf([330,510]);
 const p=await pageAt('/tools/page-numbers');
 try{
  await p.locator('#fileInput').setInputFiles([{name:'two.pdf',mimeType:'application/pdf',buffer:input}]);
  await p.locator('#startNumber').fill('7');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:25000}),p.locator('#runTool').click()]);
  const output=fs.readFileSync(await dl.path());
  assert.equal((await PDFDocument.load(output)).getPageCount(),2);
  const text=await p.evaluate(async(src)=>{
    const bytes=Uint8Array.from(src);
    const doc=await pdfjsLib.getDocument({data:bytes}).promise;
    const out=[];for(let i=1;i<=doc.numPages;i++){
      const pg=await doc.getPage(i);
      const words=(await pg.getTextContent()).items.map(x=>x.str);
      out.push(words);
    }
    return out;
  },Array.from(output));
  assert.ok(text[0].some(x=>x.trim()==='7'),'Missing page number 7');
  assert.ok(text[1].some(x=>x.trim()==='8'),'Missing page number 8');
 }finally{await p.close();}
});
await check('Image Compress produces correctly labelled actual JPEG',async()=>{
 const p=await pageAt('/tools/image-compress');
 try{
  const source=await p.evaluate(()=>{
   const c=document.createElement('canvas');c.width=120;c.height=60;
   c.getContext('2d').fillRect(0,0,120,60);
   return c.toDataURL('image/png').split(',')[1];
  });
  await p.locator('#imageInput').setInputFiles([{name:'input.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')}]);
  await p.locator('#imgFormat').selectOption('image/jpeg');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:25000}),p.locator('#imageRun').click()]);
  const data=fs.readFileSync(await dl.path());
  assert.equal(data[0],255);assert.equal(data[1],216);assert.equal(data[2],255);
  assert.match(dl.suggestedFilename(),/\.jpe?g$/i);
 }finally{await p.close();}
});

await check('Paused converter page is explicitly unavailable and noindex',async()=>{
 const p=await pageAt('/tools/word-to-pdf');
 try{
  assert.match(await p.locator('h1').innerText(),/غير متاحة|نعمل على تجهيز/);
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

await check('Reverse Pages preserves all source pages in reverse order',async()=>{
 const input=await makePdf([330,510,650]);
 const {data}=await toolDownload('/tools/reverse-pages',[{name:'three.pdf',mimeType:'application/pdf',buffer:input}]);
 const doc=await PDFDocument.load(data);
 assert.equal(doc.getPageCount(),3);
 assert.deepEqual(doc.getPages().map(p=>Math.round(p.getWidth())),[650,510,330]);
});
await check('Duplicate Pages repeats only the selected page',async()=>{
 const input=await makePdf([330,510,650]);
 const {data}=await toolDownload('/tools/duplicate-pages',[{name:'three.pdf',mimeType:'application/pdf',buffer:input}],'#pageRanges','2');
 const doc=await PDFDocument.load(data);
 assert.equal(doc.getPageCount(),4);
 assert.deepEqual(doc.getPages().map(p=>Math.round(p.getWidth())),[330,510,510,650]);
});
await check('Edit Metadata saves title, author and subject',async()=>{
 const input=await makePdf([330,510]);
 const p=await pageAt('/tools/edit-metadata');
 try {
  await p.waitForFunction(()=>!!window.PDFLib && !!window.pdfjsLib,{timeout:30000});
  await p.locator('#fileInput').setInputFiles([{name:'meta.pdf',mimeType:'application/pdf',buffer:input}]);
  await p.locator('#metaTitle').fill('DocMivo QA Metadata');
  await p.locator('#metaAuthor').fill('DocMivo Test');
  await p.locator('#metaSubject').fill('Browser regression');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('#runTool').click()]);
  const result=await PDFDocument.load(fs.readFileSync(await dl.path()));
  assert.equal(result.getPageCount(),2);
  assert.equal(result.getTitle(),'DocMivo QA Metadata');
  assert.equal(result.getAuthor(),'DocMivo Test');
  assert.equal(result.getSubject(),'Browser regression');
 } finally {await p.close();}
});


await check('PDF Info displays page count and uploaded document name',async()=>{
 const input=await makePdf([330,510,650]);
 const p=await pageAt('/tools/pdf-info');
 try {
  await p.waitForFunction(()=>!!window.PDFLib && !!window.pdfjsLib,{timeout:30000});
  await p.locator('#fileInput').setInputFiles([{name:'docmivo-info-check.pdf',mimeType:'application/pdf',buffer:input}]);
  assert.equal(await p.locator('meta[name="robots"]').count(),0);
  assert.match(await p.locator('main').innerText(),/لا تنشئ ملفًا جديدًا للتنزيل/);
  await p.locator('#runTool').click();
  await p.locator('#infoBox .file-row').first().waitFor({state:'visible',timeout:30000});
  const info=await p.locator('#infoBox').innerText();
  assert.match(info,/docmivo-info-check\.pdf/);
  assert.match(info,/pages\s*3/i);
 } finally {await p.close();}
});
await check('Remove Metadata clears document info fields but preserves pages',async()=>{
 const source=await PDFDocument.load(await makePdf([330,510]));
 source.setTitle('Private QA title');
 source.setAuthor('Private QA author');
 source.setSubject('Private QA subject');
 const data=Buffer.from(await source.save());
 const {data:output}=await toolDownload('/tools/remove-metadata',[{name:'private.pdf',mimeType:'application/pdf',buffer:data}]);
 const result=await PDFDocument.load(output);
 assert.equal(result.getPageCount(),2);
 assert.equal(result.getTitle()||'','');
 assert.equal(result.getAuthor()||'','');
 assert.equal(result.getSubject()||'','');
});

await check('Theme preferences persist and EN FR ES navigation stays usable',async()=>{
 const p=await pageAt('/');
 try{
  const select=p.locator('.dm-language'),theme=p.locator('.dm-theme-button');
  await select.waitFor({state:'visible',timeout:15000});
  await select.selectOption('en');
  assert.equal(await p.locator('html').getAttribute('lang'),'en');
  assert.equal(await p.locator('main').getAttribute('lang'),'ar');
  assert.equal(await p.locator('main').getAttribute('dir'),'rtl');
  assert.equal(await p.locator('.nav').getAttribute('dir'),'ltr');
  assert.match(await p.locator('.nav-links a[href="/#tools"]').first().innerText(),/Tools/);
  await theme.click();
  assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
  await p.reload();
  await p.locator('.dm-language').waitFor({state:'visible',timeout:15000});
  assert.equal(await p.locator('.dm-language').inputValue(),'en');
  assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
  await p.locator('.dm-language').selectOption('fr');
  assert.match(await p.locator('.nav-links a[href="/#tools"]').first().innerText(),/Outils/);
  await p.locator('.dm-language').selectOption('es');
  assert.match(await p.locator('.nav-links a[href="/#tools"]').first().innerText(),/Herramientas/);
 } finally{await p.close();}
});


// Additional document integrity checks: high-value tools previously only received route smoke tests.
await check('Smart compression refuses to destroy text when size cannot be reduced',async()=>{
 const input=await makePdf([330,510]);
 const p=await pageAt('/tools/compress-pdf');
 try{
  await p.waitForFunction(()=>!!window.PDFLib&&!!window.pdfjsLib,{timeout:30000});
  await p.locator('#fileInput').setInputFiles([{name:'searchable.pdf',mimeType:'application/pdf',buffer:input}]);
  await p.locator('#compressMode').selectOption('auto');
  let downloads=0;p.on('download',()=>downloads++);
  await p.locator('#runTool').click();
  await p.waitForFunction(()=>document.getElementById('status')?.classList.contains('err'),{timeout:20000});
  const message=await p.locator('#status').innerText();
  assert.match(message,/يحتوي نصًا قابلًا للنسخ|لم تنجح إعادة تعبئته/);
  assert.equal(downloads,0,'Must not invent an improvement or silently rasterize searchable PDF');
 }finally{await p.close();}
});
await check('Visual compression genuinely reduces image-only PDF while preserving page dimensions',async()=>{
 const p=await pageAt('/tools/compress-pdf');
 let png;
 try{
  png=Buffer.from(await p.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=400;canvas.height=500;
   const ctx=canvas.getContext('2d'),image=ctx.createImageData(400,500);
   let seed=20261124;
   for(let i=0;i<image.data.length;i+=4){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    image.data[i]=seed&255;image.data[i+1]=(seed>>>8)&255;image.data[i+2]=(seed>>>16)&255;image.data[i+3]=255;
   }
   ctx.putImageData(image,0,0);
   return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
 }finally{await p.close();}
 const doc=await PDFDocument.create(),image=await doc.embedPng(png);
 const page=doc.addPage([400,500]);page.drawImage(image,{x:0,y:0,width:400,height:500});
 const input=Buffer.from(await doc.save());
 const {data,name}=await toolDownload('/tools/compress-pdf',[{name:'scan.pdf',mimeType:'application/pdf',buffer:input}],'#scale','1');
 assert.equal(name,'compressed.pdf');
 assert.ok(data.length<input.length,'Compressed output must be smaller for noisy scan');
 const output=await PDFDocument.load(data);
 assert.equal(output.getPageCount(),1);
 assert.ok(Math.abs(output.getPage(0).getWidth()-400)<2);
});
await check('Grayscale PDF returns valid pages instead of an empty or renamed image',async()=>{
 const input=await makePdf([330,510]);
 const {data,name}=await toolDownload('/tools/grayscale-pdf',[{name:'source.pdf',mimeType:'application/pdf',buffer:input}],'#scale','1');
 assert.equal(name,'grayscale.pdf');
 assert.equal((await PDFDocument.load(data)).getPageCount(),2);
});
await check('Crop PDF sets crop boxes without deleting any pages',async()=>{
 const input=await makePdf([330,510]);
 const {data,name}=await toolDownload('/tools/crop-pdf',[{name:'source.pdf',mimeType:'application/pdf',buffer:input}]);
 assert.equal(name,'cropped.pdf');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),2);
 const box=d.getPage(0).getCropBox();
 assert.ok(box.x>0&&box.y>0&&box.width<330&&box.height<420);
});
await check('Resize PDF produces genuine A4 pages',async()=>{
 const input=await makePdf([330,510]);
 const {data}=await toolDownload('/tools/resize-pdf',[{name:'source.pdf',mimeType:'application/pdf',buffer:input}],'#pageSize','a4');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),2);
 assert.ok(Math.abs(d.getPage(0).getWidth()-595.28)<2);
 assert.ok(Math.abs(d.getPage(0).getHeight()-841.89)<2);
});
await check('Watermark PDF saves modified, openable multi-page document',async()=>{
 const input=await makePdf([330,510]);
 const {data,name}=await toolDownload('/tools/watermark-pdf',[{name:'source.pdf',mimeType:'application/pdf',buffer:input}],'#watermarkText','QA DRAFT');
 assert.equal(name,'watermarked.pdf');
 const d=await PDFDocument.load(data);
 assert.equal(d.getPageCount(),2);
 assert.ok(data.length>input.length,'No additional watermark graphic embedded');
});
await check('N-up and booklet build printable PDF page layouts',async()=>{
 const input=await makePdf([330,510,380,580]);
 for(const [route,field,value,expectedName] of [
  ['/tools/n-up-pdf','#nup','2','n-up-2.pdf'],
  ['/tools/booklet-pdf',null,null,'booklet.pdf']
 ]){
  const {data,name}=await toolDownload(route,[{name:'four.pdf',mimeType:'application/pdf',buffer:input}],field,value);
  assert.equal(name,expectedName);
  const doc=await PDFDocument.load(data);
  assert.equal(doc.getPageCount(),2,'Two sheets expected from '+route);
 }
});
await check('Mix PDF interleaves source page sequences correctly',async()=>{
 const a=await makePdf([330,380]),b=await makePdf([510,570]);
 const {data}=await toolDownload('/tools/mix-pdf',[
  {name:'alpha.pdf',mimeType:'application/pdf',buffer:a},
  {name:'beta.pdf',mimeType:'application/pdf',buffer:b}]);
 const d=await PDFDocument.load(data);
 assert.deepEqual(d.getPages().map(p=>Math.round(p.getWidth())),[330,510,380,570]);
});
await check('Bates numbering and headers/footers preserve input page counts',async()=>{
 const input=await makePdf([330,510]);
 const b=await toolDownload('/tools/bates-numbering',[{name:'sample.pdf',mimeType:'application/pdf',buffer:input}],'#prefix','QA-');
 assert.equal(b.name,'bates-numbered.pdf');
 assert.equal((await PDFDocument.load(b.data)).getPageCount(),2);
 const h=await toolDownload('/tools/headers-footers',[{name:'sample.pdf',mimeType:'application/pdf',buffer:input}],'#headerText','Page {page} of {pages}');
 assert.equal(h.name,'headers-footers.pdf');
 assert.equal((await PDFDocument.load(h.data)).getPageCount(),2);
});
await check('Form inspector exports JSON and form filler preserves a text field value',async()=>{
 const source=await PDFDocument.create();
 const page=source.addPage([380,460]);
 const field=source.getForm().createTextField('FullName');
 field.addToPage(page,{x:35,y:310,width:200,height:32});
 const input=Buffer.from(await source.save());
 const files=[{name:'form.pdf',mimeType:'application/pdf',buffer:input}];
 const inspected=await toolDownload('/tools/inspect-pdf-forms',files);
 assert.equal(inspected.name,'pdf-form-fields.json');
 const parsed=JSON.parse(inspected.data.toString('utf8'));
 assert.ok(parsed.some(x=>x.name==='FullName'));
 const filled=await toolDownload('/tools/fill-pdf-form',files,'#formData',JSON.stringify({FullName:'DocMivo QA'}));
 assert.equal(filled.name,'form-filled.pdf');
 const output=await PDFDocument.load(filled.data);
 assert.equal(output.getForm().getTextField('FullName').getText(),'DocMivo QA');
});
await check('Image signature writes an actual embedded PNG into a PDF',async()=>{
 const input=await makePdf([330,510]);
 const p=await pageAt('/tools/sign-pdf');
 try{
  const image=Buffer.from(await p.evaluate(()=>{
   const c=document.createElement('canvas');c.width=70;c.height=35;
   const g=c.getContext('2d');g.fillStyle='#154ca7';g.fillRect(0,0,70,35);
   return c.toDataURL('image/png').split(',')[1];
  }),'base64');
  await p.locator('#fileInput').setInputFiles([
   {name:'form.pdf',mimeType:'application/pdf',buffer:input},
   {name:'signature.png',mimeType:'image/png',buffer:image}
  ]);
  await p.locator('#targetPage').fill('2');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('#runTool').click()]);
  assert.equal(dl.suggestedFilename(),'signed.pdf');
  const data=fs.readFileSync(await dl.path());
  assert.equal((await PDFDocument.load(data)).getPageCount(),2);
  assert.ok(data.length>input.length,'Signature image not embedded');
 } finally {await p.close();}
});
await check('PDF to PowerPoint produces a valid PPTX ZIP with one image slide per page',async()=>{
 const input=await makePdf([330,510]);
 const p=await pageAt('/tools/pdf-to-powerpoint');
 try{
  await p.waitForFunction(()=>!!window.PptxGenJS&&!!window.pdfjsLib,{timeout:30000});
  await p.locator('#fileInput').setInputFiles([{name:'slides.pdf',mimeType:'application/pdf',buffer:input}]);
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:45000}),p.locator('#runTool').click()]);
  assert.match(dl.suggestedFilename(),/\.pptx$/);
  const zip=await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const slides=Object.keys(zip.files).filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x));
  assert.equal(slides.length,2);
 }finally{await p.close();}
});

await check('QR and image optimization guides are linked, indexable and usable on mobile',async()=>{
 const hub=await pageAt('/guides',390);
 try{
  assert.ok(await hub.locator('a[href="/guides/qr-code-guide"]').count());
  assert.ok(await hub.locator('a[href="/guides/image-optimization-guide"]').count());
 }finally{await hub.close();}
 for(const [route,marker] of [['/guides/qr-code-guide','data-editorial-wave3="qr-code"'],['/guides/image-optimization-guide','data-editorial-wave3="image-optimization"']]){
  const p=await pageAt(route,390);
  try{
   assert.ok((await p.locator('h1').innerText()).length>12);
   assert.ok(await p.locator('[data-editorial-wave3]').count());
   assert.equal(await p.locator('meta[name="robots"][content*="noindex"]').count(),0);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Horizontal overflow on '+route);
  }finally{await p.close();}
 }
});

await check('OCR smart mode extracts embedded text from every PDF page to TXT',async()=>{
 const input=await makePdf([330,510]);
 const {data,name}=await toolDownload('/tools/ocr-pdf',[{name:'text-layer.pdf',mimeType:'application/pdf',buffer:input}],'#ocrStrategy','smart');
 assert.equal(name,'ocr-text.txt');
 const output=data.toString('utf8');
 assert.match(output,/Page 1 \(embedded text\)/);
 assert.match(output,/DOCMIVO PAGE 1/);
 assert.match(output,/Page 2 \(embedded text\)/);
 assert.match(output,/DOCMIVO PAGE 2/);
});
await check('OCR force mode recognizes a clear English scan and exports TXT',async()=>{
 const p=await pageAt('/tools/ocr-pdf');
 try{
  await p.waitForFunction(()=>!!window.PDFLib&&!!window.pdfjsLib&&!!window.Tesseract?.createWorker,{timeout:45000});
  const png=Buffer.from(await p.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=250;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1000,250);
   ctx.fillStyle='#000000';ctx.font='bold 64px Arial';ctx.fillText('DOCMIVO OCR TEST 12345',30,150);
   return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
  const doc=await PDFDocument.create(),page=doc.addPage([595,842]),image=await doc.embedPng(png);
  page.drawImage(image,{x:40,y:600,width:515,height:129});
  const input=Buffer.from(await doc.save());
  await p.locator('#fileInput').setInputFiles([{name:'scanned.pdf',mimeType:'application/pdf',buffer:input}]);
  await p.locator('#ocrLang').selectOption('eng');
  await p.locator('#ocrStrategy').selectOption('force');
  await p.locator('#ocrDetail').selectOption('fast');
  await p.locator('#ocrLayout').selectOption('line');
  const [download]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.locator('#runTool').click()]);
  assert.equal(download.suggestedFilename(),'ocr-text.txt');
  const output=fs.readFileSync(await download.path()).toString('utf8').toUpperCase();
  assert.match(output,/DOCMIVO/);
  assert.match(output,/12345/);
 }finally{await p.close();}
});

await browser.close();
console.log('BROWSER QA RESULT '+passed+' passed, '+failed+' failed');
if(failed)process.exit(1);

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {improveHome,improveSiteScript,improveFooter,improveAccessibility,improveStandaloneNav,nicePausedPage,LAYOUT_CSS,buildLayout} from '../scripts/layout-quality.mjs';

const mainSection = `<section class="section" id="tools"><div class="container"><div class="section-head"><h2>أدوات PDF</h2><p>اختر الأداة وابدأ مباشرة.</p><div class="searchbar"><input id="toolSearch" /></div></div><div class="categories"><button class="chip active" data-cat="all">الكل</button></div><div class="tools-grid"><a class="tool-card" data-cat="organize" href="/tools/merge-pdf">دمج</a></div></div></section>`;
const home = `<!doctype html><html lang="ar"><head></head><body><nav></nav><main><section class="hero"><h1>كل أدوات PDF التي تحتاجها <span style="color:#635bff">في مكان واحد</span></h1><p>ادمج، اضغط، حوّل، رتّب، وقّع واستخرج المحتوى بخطوات بسيطة ونتائج واضحة.</p></section>${mainSection}<section class="section" id="v17-new-tools"></section><section class="section"><h2>دروس مفيدة بدل صفحات أدوات فارغة</h2><a href="/guides">more</a></section><section class="section" id="editorial-guides"><h2>مش بس أداة — افهم النتيجة</h2></section></main><footer><a href="/tools/word-to-pdf">Word إلى PDF</a><a href="/tools/searchable-ocr-pdf">Searchable OCR</a></footer></body></html>`;
const baseSite = `(function(){
 const C=window.DOCMIVO_CONFIG||{};
 const mb=document.querySelector('.menu-btn'), mn=document.querySelector('.mobile-nav');
 if(mb&&mn) mb.addEventListener('click',()=>mn.classList.toggle('open'));
 const search=document.querySelector('#toolSearch');
 const cards=[...document.querySelectorAll('.tool-card')];
 const chips=[...document.querySelectorAll('.chip')];
 let cat='all';
 function filter(){
  const q=(search?.value||'').toLowerCase().trim();
  cards.forEach(card=>{card.style.display=cat==='all'||card.dataset.cat===cat?'flex':'none';});
 }
 if(search) search.addEventListener('input',filter);
 chips.forEach(ch=>ch.addEventListener('click',()=>{chips.forEach(x=>x.classList.remove('active'));ch.classList.add('active');cat=ch.dataset.cat;filter();}));

 // Hide tools that require the processing service until it is actually available.
 const backendCards=cards.filter(c=>c.dataset.requiresServer==='1');
})();`;

test('home adds early actions, honest H1, result count and progressive grid',()=>{
 const out=improveHome(home);
 assert.match(out,/أدوات PDF والصور وQR/);
 assert.match(out,/dm-quick-start/);
 assert.match(out,/id="dmToolGrid"/);
 assert.match(out,/id="dmShowAll"/);
 assert.match(out,/id="dmResults"/);
 assert.match(out,/id="dmNoResults"/);
 assert.equal((out.match(/id="editorial-guides"/g)||[]).length,1);
 assert.doesNotMatch(out,/دروس مفيدة بدل صفحات أدوات فارغة/);
 assert.equal((out.match(/class="dm-quick-grid"/g)||[]).length,1);
 for(const slug of ['merge-pdf','compress-pdf','split-pdf','ocr-pdf','images-to-pdf','qr-code']) assert.match(out,new RegExp(`href="/tools/${slug}"`));
});
test('home refuses unexpected or already modified markup',()=>{
 assert.throws(()=>improveHome('<html/>'),/homepage tools/);
 assert.throws(()=>improveHome(improveHome(home)),/already updated/);
});
test('site script patch is syntax-valid and includes accessible responsive filtering',()=>{
 const js=improveSiteScript(baseSite);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/aria-expanded/);
 assert.match(js,/const PAGE_SIZE=12/);
 assert.match(js,/toLocaleLowerCase/);
 assert.match(js,/dmShowAll/);
 assert.match(js,/Escape/);
 assert.throws(()=>improveSiteScript(js),/source changed/);
});
test('browser-like filtering shows 12 initial, all when clicked, search and no-results',()=>{
 const cards=Array.from({length:22},(_,i)=>({style:{},dataset:{cat:i<16?'organize':'optimize',backendHidden:'0'},textContent:i<16?`ملف دمج ${i}`:`ضغط ملفات ${i}`}));
 const eventTarget=({value='',dataset={},classList={},textContent='' }={})=>({value,dataset,textContent,hidden:false,style:{},attrs:{},handlers:{},
   classList:{contains:()=>true,add(){},remove(){},toggle:()=>true},
   setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.handlers[k]=fn},
 });
 const search=eventTarget();
 const results=eventTarget(),showAll=eventTarget(),empty=eventTarget();
 const all=eventTarget({dataset:{cat:'all'}}),org=eventTarget({dataset:{cat:'organize'}});
 const doc={querySelector:s=>s==='#toolSearch'?search:null,
  querySelectorAll:s=>s==='.tool-card'?cards:s==='.chip'?[all,org]:[],
  getElementById:id=>({dmResults:results,dmShowAll:showAll,dmNoResults:empty})[id],
  addEventListener(){}
 };
 const script=improveSiteScript(baseSite);
 const sandbox={document:doc,window:{DOCMIVO_CONFIG:{}},console};
 vm.runInNewContext(script,sandbox);
 assert.equal(cards.filter(c=>c.style.display==='flex').length,12);
 assert.equal(showAll.hidden,false);
 assert.match(results.textContent,/عرض 12 من 22/);
 showAll.handlers.click();
 assert.equal(cards.filter(c=>c.style.display==='flex').length,22);
 search.value='ضغط';search.handlers.input();
 assert.equal(cards.filter(c=>c.style.display==='flex').length,6);
 assert.equal(showAll.hidden,true);
 search.value='not-present';search.handlers.input();
 assert.equal(cards.filter(c=>c.style.display==='flex').length,0);
 assert.equal(empty.hidden,false);
});
test('footer replaces only paused service links and keeps unrelated text',()=>{
 const out=improveFooter(home);
 assert.match(out,/href="\/tools\/images-to-pdf">صور إلى PDF/);
 assert.match(out,/href="\/tools\/ocr-pdf">OCR PDF/);
 assert.doesNotMatch(out,/href="\/tools\/word-to-pdf"/);
});
test('accessibility adds keyboard skip link and removes broken AI nav',()=>{
 const input='<html><body><nav><a href="/#ai-tools">ذكاء</a><a href="/#tools">الأدوات</a></nav><main class="page">test</main></body></html>';
 const out=improveAccessibility(input);
 assert.match(out,/class="dm-skip"/);
 assert.match(out,/id="main-content"/);
 assert.doesNotMatch(out,/#ai-tools/);
 assert.equal((improveAccessibility(out).match(/class="dm-skip"/g)||[]).length,1);
});
test('standalone QR/image pages keep the mobile nav accessible',()=>{
 const page='<html><body data-image-mode="resize"><nav class="nav"><div class="nav-links"><a href="/">الرئيسية</a></div></nav><main class="v17-wrap">Image</main></body></html>';
 const out=improveStandaloneNav(page);
 assert.match(out,/class="dm-standalone-page"/);
 assert.match(out,/data-image-mode="resize"/);
 assert.equal(improveStandaloneNav('<html><body><main>regular</main></body></html>'),'<html><body><main>regular</main></body></html>');
 assert.match(LAYOUT_CSS,/body\.dm-standalone-page \.nav-links\{display:flex/);
});
test('paused pages share site layout and remain noindex',()=>{
 const html=nicePausedPage('word-to-pdf');
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/assets\/css\/styles.css/);
 assert.match(html,/class="nav"/);
 assert.match(html,/dm-paused-options/);
 assert.match(html,/aria-hidden="true"/);
 assert.doesNotMatch(html,/href="\/tools\/word-to-pdf"/);
 assert.throws(()=>nicePausedPage('../'),/Invalid/);
});
test('mobile CSS provides accessible tap targets, focus and reduced motion',()=>{
 for(const token of ['@media(max-width:720px)','focus-visible','prefers-reduced-motion','scroll-margin-top','min-height:44px','dm-quick-grid','.dm-paused-page'])assert.ok(LAYOUT_CSS.includes(token),token);
});
test('dist-only build patches pages without changing its source inputs',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'docmivo-layout-'));
 const save=(n,s)=>{const file=path.join(dir,n);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,s);};
 try{
  save('index.html',home);
  save('assets/js/site.v14.js',baseSite);
  save('assets/css/styles.css','.tool-card{display:flex}');
  save('tools/word-to-pdf/index.html','<html><head>'+PAUSED_TITLE+'</head><body><main>paused</main></body></html>');
  save('tools/merge-pdf/index.html','<html><body><main class="tool-page">Merge</main><footer><a href="/tools/word-to-pdf">Word إلى PDF</a></footer></body></html>');
  buildLayout(dir);
  assert.match(readFileSync(path.join(dir,'index.html'),'utf8'),/dm-quick-start/);
  assert.match(readFileSync(path.join(dir,'tools/word-to-pdf/index.html'),'utf8'),/dm-paused-card/);
  assert.match(readFileSync(path.join(dir,'tools/merge-pdf/index.html'),'utf8'),/href="\/tools\/images-to-pdf"/);
  assert.match(readFileSync(path.join(dir,'assets/css/styles.css'),'utf8'),/DocMivo V18.7/);
  assert.doesNotThrow(()=>new vm.Script(readFileSync(path.join(dir,'assets/js/site.v14.js'),'utf8')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
const PAUSED_TITLE='<title>الأداة غير متاحة مؤقتًا | DocMivo</title>';

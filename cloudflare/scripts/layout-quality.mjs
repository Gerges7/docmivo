/**
 * DocMivo V18.7: Cloudflare-only layout and navigation improvements.
 * Runs AFTER all other Cloudflare build-time patches. Does not alter source files
 * at the repository root; changes generated dist only.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PAUSED_TITLE = '<title>الأداة غير متاحة مؤقتًا | DocMivo</title>';
const HOME_TOOLS = '<section class="section" id="tools">';
const HOME_HEADING = '<h1>كل أدوات PDF التي تحتاجها <span style="color:#635bff">في مكان واحد</span></h1>';
const HOME_HERO = '<p>ادمج، اضغط، حوّل، رتّب، وقّع واستخرج المحتوى بخطوات بسيطة ونتائج واضحة.</p>';
const UNIQUE_GUIDE = 'دروس مفيدة بدل صفحات أدوات فارغة';
const UI_START = " const mb=document.querySelector('.menu-btn'), mn=document.querySelector('.mobile-nav');";
const UI_END = ' // Hide tools that require the processing service until it is actually available.';
const LIST_UI = `
 // Keyboard-friendly mobile menu. It closes on Escape, navigation and outside clicks.
 const mb=document.querySelector('.menu-btn'), mn=document.querySelector('.mobile-nav');
 if(mb && mn){
   const id=mn.id||'dm-mobile-nav'; mn.id=id;
   mb.setAttribute('aria-controls',id); mb.setAttribute('aria-expanded','false');
   const close=()=>{mn.classList.remove('open');mb.setAttribute('aria-expanded','false');};
   mb.addEventListener('click',()=>{
     const opened=mn.classList.toggle('open');
     mb.setAttribute('aria-expanded',String(opened));
   });
   mn.addEventListener('click',e=>{if(e.target.closest('a'))close();});
   document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
   document.addEventListener('click',e=>{if(!mn.contains(e.target)&&!mb.contains(e.target))close();});
 }
 const search=document.querySelector('#toolSearch');
 const cards=[...document.querySelectorAll('.tool-card')];
 const chips=[...document.querySelectorAll('.chip')];
 const results=document.getElementById('dmResults');
 const showAll=document.getElementById('dmShowAll');
 const noResults=document.getElementById('dmNoResults');
 const PAGE_SIZE=12;
 let cat='all', expanded=false;
 function filter(){
   const q=(search?.value||'').toLocaleLowerCase().trim();
   const matching=cards.filter(card=>card.dataset.backendHidden!=='1' &&
     (cat==='all'||card.dataset.cat===cat) &&
     (!q||card.textContent.toLocaleLowerCase().includes(q)));
   const limited=!expanded && cat==='all' && !q;
   const visible=limited?matching.slice(0,PAGE_SIZE):matching;
   const shown=new Set(visible);
   cards.forEach(card=>{card.style.display=shown.has(card)?'flex':'none';});
   if(results) results.textContent=matching.length ?
     'عرض '+visible.length+' من '+matching.length+' أداة' : 'لا توجد أدوات تطابق بحثك.';
   if(noResults) noResults.hidden=matching.length!==0;
   if(showAll){
     showAll.hidden=cat!=='all'||Boolean(q)||matching.length<=PAGE_SIZE;
     showAll.textContent=expanded?'عرض أدوات أقل':'عرض كل الأدوات ('+matching.length+')';
     showAll.setAttribute('aria-expanded',String(expanded));
   }
 }
 if(search)search.addEventListener('input',filter);
 chips.forEach(ch=>ch.addEventListener('click',()=>{
   chips.forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false');});
   ch.classList.add('active');ch.setAttribute('aria-pressed','true');
   cat=ch.dataset.cat;expanded=false;filter();
 }));
 chips.forEach(ch=>ch.setAttribute('aria-pressed',String(ch.classList.contains('active'))));
 if(showAll)showAll.addEventListener('click',()=>{expanded=!expanded;filter();});
 filter();

`;

const QUICK_START = `<section class="dm-quick-start" aria-label="اختصارات الأدوات الشائعة">
 <div class="container"><div class="dm-quick-title"><strong>ابدأ من هنا</strong><span>اختار المهمة اللي محتاجها وابدأ فورًا</span></div>
 <div class="dm-quick-grid">
  <a href="/tools/merge-pdf"><span aria-hidden="true">🔗</span>دمج PDF</a>
  <a href="/tools/compress-pdf"><span aria-hidden="true">🗜️</span>ضغط PDF</a>
  <a href="/tools/split-pdf"><span aria-hidden="true">✂️</span>تقسيم PDF</a>
  <a href="/tools/ocr-pdf"><span aria-hidden="true">👁️</span>OCR PDF</a>
  <a href="/tools/images-to-pdf"><span aria-hidden="true">🖼️</span>صور إلى PDF</a>
  <a href="/tools/qr-code"><span aria-hidden="true">▦</span>QR Code</a>
 </div></div></section>\n`;

export function improveHome(html){
 if(!html.includes(HOME_TOOLS))throw new Error('V18.7: homepage tools section missing');
 if(html.includes('id="dmShowAll"'))throw new Error('V18.7: homepage already updated');
 let h=html;
 if(!h.includes(HOME_HEADING)||!h.includes(HOME_HERO))throw new Error('V18.7: homepage hero changed; review required');
 h=h.replace(HOME_HEADING,'<h1>أدوات PDF والصور وQR <span style="color:#635bff">في مكان واحد</span></h1>');
 h=h.replace(HOME_HERO,'<p>ادمج ملفات PDF واضغطها ونظّم صفحاتها، أو جهّز الصور ورموز QR بسهولة من المتصفح.</p>');
 h=h.replace(HOME_TOOLS,QUICK_START+HOME_TOOLS);
 const start=h.indexOf(HOME_TOOLS);
 const end=h.indexOf('</section>',start);
 if(end<0)throw new Error('V18.7: unterminated tools section');
 let sec=h.slice(start,end+'</section>'.length);
 if(!sec.includes('id="toolSearch"')||!sec.includes('class="tools-grid"')||!sec.includes('class="categories"'))
   throw new Error('V18.7: tool search/grid markup changed');
 const cat='<div class="categories">';
 sec=sec.replace(cat,`<p id="dmResults" class="dm-results" role="status" aria-live="polite">تصفح الأدوات أو ابحث عن المهمة المطلوبة.</p>${cat}`);
 const tail='</div></div></section>';
 if(!sec.endsWith(tail))throw new Error('V18.7: tools section closing markup changed');
 sec=sec.slice(0,-tail.length)+'</div><div class="dm-tools-actions"><button id="dmShowAll" type="button" class="btn btn-ghost" aria-controls="dmToolGrid" aria-expanded="false">عرض كل الأدوات</button><p id="dmNoResults" hidden>لا توجد نتائج. جرّب كلمة أقصر أو اختار تصنيفًا آخر.</p></div></div></section>';
 sec=sec.replace('<div class="tools-grid">','<div class="tools-grid" id="dmToolGrid">');
 h=h.slice(0,start)+sec+h.slice(end+'</section>'.length);
 // The two adjacent editorial sections had overlapping guides and occupied
 // considerable space before the footer. Keep the more useful editorial-guides.
 const marker=h.indexOf(UNIQUE_GUIDE);
 if(marker>=0){
   const a=h.lastIndexOf('<section',marker),b=h.indexOf('</section>',marker);
   if(a<0||b<0||h.slice(a,marker).includes('</section>'))throw new Error('V18.7: duplicate guides boundaries changed');
   h=h.slice(0,a)+h.slice(b+'</section>'.length);
 }
 return h;
}

export function improveSiteScript(src){
 const a=src.indexOf(UI_START),b=src.indexOf(UI_END);
 if(a<0||b<=a||src.includes('const PAGE_SIZE=12;'))throw new Error('V18.7: site.js filter source changed');
 if(src.slice(a,b).split('function filter()').length!==2)throw new Error('V18.7: cannot find previous filters');
 return src.slice(0,a)+LIST_UI+src.slice(b);
}

export function improveFooter(html){
 return html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,footer=>footer
   .replace(/href="\/tools\/word-to-pdf"\s*>Word إلى PDF/g,'href="/tools/images-to-pdf">صور إلى PDF')
   .replace(/href="\/tools\/searchable-ocr-pdf"\s*>Searchable OCR/g,'href="/tools/ocr-pdf">OCR PDF'));
}

export function improveStandaloneNav(html){
 // QR and image tools use a standalone V17 template without the shared JS menu.
 // Keep their navigation links available on phones instead of hiding all links.
 if(!html.includes('class="v17-wrap"'))return html;
 return html.replace(/<body([^>]*)>/i,(full,attrs)=>{
   if(/\bclass=/.test(attrs))return full.replace(/class=(['"])(.*?)\1/i,(m,q,v)=>'class='+q+v+' dm-standalone-page'+q);
   return '<body'+attrs+' class="dm-standalone-page">';
 });
}

export function improveAccessibility(html){
 let h=html;
 // Old menu links to removed AI catalog; remove only the exact dead link.
 h=h.replace(/<a\b[^>]*\bhref=(['"])(?:\/#ai-tools|#ai-tools)\1[^>]*>[\s\S]*?<\/a>/gi,'');
 if(!/<main(?:\s|>)/i.test(h))return h;
 if(!/id="main-content"/.test(h))h=h.replace(/<main(\s[^>]*)?>/i,(m,a='')=>'<main'+a+' id="main-content">');
 if(!/class="dm-skip"/.test(h))h=h.replace(/<body([^>]*)>/i,'<body$1><a class="dm-skip" href="#main-content">تخطي إلى المحتوى</a>');
 return h;
}

const PAUSED_LINKS = [
  ['دمج PDF','/tools/merge-pdf'],['ضغط PDF','/tools/compress-pdf'],
  ['تقسيم PDF','/tools/split-pdf'],['استخراج النص من الصور (OCR)','/tools/ocr-pdf'],
  ['إنشاء QR Code','/tools/qr-code'],['تغيير حجم الصور','/tools/image-resize']
];
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function nicePausedPage(slug){
 if(!/^[a-z0-9-]+$/.test(slug))throw new Error('Invalid tool slug');
 const name=slug.replace(/-/g,' ');
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>الأداة غير متاحة مؤقتًا | DocMivo</title><link rel="stylesheet" href="/assets/css/styles.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head><body><a class="dm-skip" href="#main-content">تخطي إلى المحتوى</a><div class="topbar"><div class="container">أدوات مجانية • معالجة محلية قدر الإمكان</div></div><nav class="nav"><div class="container nav-inner"><a class="brand" href="/"><span class="brand-mark">D</span><span>DocMivo</span></a><div class="nav-links"><a href="/#tools">الأدوات</a><a href="/guides">الأدلة</a><a href="/privacy">الخصوصية</a></div></div></nav><main id="main-content" class="dm-paused-page"><div class="container"><div class="crumbs"><a href="/">الرئيسية</a> ← الأدوات غير المتاحة</div><section class="dm-paused-card"><div class="dm-paused-icon" aria-hidden="true">🛠️</div><p class="dm-paused-tag">هذه الأداة متوقفة مؤقتًا</p><h1>نعمل على تجهيز هذه الأداة</h1><p>أداة <strong dir="ltr">${esc(name)}</strong> تحتاج خدمة معالجة لم يتم تفعيلها بعد. لن نطلب منك رفع ملفات أو بدء عملية غير متاحة.</p><h2>جرّب أدوات جاهزة بدلًا منها</h2><div class="dm-paused-options">${PAUSED_LINKS.map(([title,url])=>`<a href="${url}">${title}</a>`).join('')}</div><a class="btn btn-primary" href="/">العودة إلى الرئيسية</a></section></div></main><footer class="footer"><div class="container"><p><a href="/">DocMivo</a> · <a href="/guides">الأدلة</a> · <a href="/contact">تواصل معنا</a> · <a href="/privacy">الخصوصية</a></p></div></footer></body></html>`;
}

export const LAYOUT_CSS = `
/* DocMivo V18.7 — visual refinement, navigation & mobile usability. */
html{scroll-padding-top:90px}
section[id],main[id]{scroll-margin-top:90px}
:where(a,button,input,select,textarea):focus-visible{outline:3px solid #7c3aed;outline-offset:3px}
.dm-skip{position:fixed;top:-90px;right:16px;z-index:9999;background:#111827;color:#fff;border-radius:10px;padding:10px 16px;font-weight:700}
.dm-skip:focus{top:10px;color:#fff}
.dm-quick-start{padding:14px 0 12px}
.dm-quick-start .container{background:linear-gradient(135deg,#fff,#f8f7ff);border:1px solid #e3e5f1;border-radius:20px;padding:20px 24px;box-shadow:0 6px 24px rgba(15,23,42,.035)}
.dm-quick-title{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.dm-quick-title strong{font-size:19px;color:#111827}.dm-quick-title span{color:#64748b;font-size:13px}
.dm-quick-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}
.dm-quick-grid a{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 8px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;color:#334155;font-size:13px;font-weight:750;text-align:center;min-height:54px;transition:background .16s,border-color .16s}
.dm-quick-grid a:hover{background:#f4f2ff;border-color:#a5b4fc;color:#4338ca}
.dm-quick-grid a span{font-size:20px;line-height:1}
.dm-results{margin:10px 0 0;font-size:13px;color:#64748b;min-height:20px}
.dm-tools-actions{display:flex;align-items:center;flex-direction:column;gap:12px;margin:24px auto 0}
.dm-tools-actions #dmShowAll{min-width:190px;border-color:#c7d2fe;color:#4338ca;background:#f5f3ff}
.dm-tools-actions #dmShowAll:hover{background:#eae5ff}
.dm-tools-actions #dmShowAll[hidden]{display:none}
.dm-tools-actions #dmNoResults{font-size:14px;color:#475569;text-align:center;margin:0}
.tool-card{min-height:172px}
.tool-card p{line-height:1.7}
.tool-card:focus-visible,.guide-card:focus-visible{outline:3px solid #7c3aed;outline-offset:3px}
.tool-page .workspace{box-shadow:0 10px 32px rgba(15,23,42,.06)}
.tool-page .dropzone{padding:28px 18px}
.tool-page .dropzone:focus-visible{outline:3px solid #7c3aed;outline-offset:4px}
.tool-page .controls .action-row{margin-top:14px}
.tool-page .content-block{max-width:960px;margin-left:auto;margin-right:auto}
.tool-page .status{overflow-wrap:anywhere}
.tool-page .file-row .name{overflow-wrap:anywhere}
.mobile-nav.open{box-shadow:0 12px 24px rgba(15,23,42,.10)}
.dm-paused-page{padding:28px 0 70px}
.dm-paused-page .container{max-width:910px}
.dm-paused-card{background:#fff;border:1px solid #e2e8f0;border-radius:22px;padding:clamp(20px,4vw,44px);box-shadow:0 16px 44px rgba(15,23,42,.06)}
.dm-paused-card h1{font-size:clamp(1.6rem,3.4vw,2.3rem);margin:6px 0 10px}
.dm-paused-card h2{font-size:1.1rem;margin:24px 0 12px}
.dm-paused-card p{color:#475569;line-height:1.9}
.dm-paused-tag{font-weight:700;color:#6d28d9!important;font-size:13px}
.dm-paused-icon{font-size:34px}
.dm-paused-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:24px}
.dm-paused-options a{padding:12px;border:1px solid #e0e7ff;border-radius:12px;background:#f8faff;color:#3730a3;font-weight:700;text-align:center;font-size:13px}
.dm-paused-options a:hover{background:#eef2ff;border-color:#a5b4fc}
@media(max-width:1060px){.dm-quick-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){
 body.dm-standalone-page .nav-inner{height:auto;min-height:74px;flex-wrap:wrap;padding:11px 0;gap:5px}
 body.dm-standalone-page .nav-links{display:flex;width:100%;flex-wrap:wrap;gap:4px 14px;font-size:12px;padding-bottom:5px}
 body.dm-standalone-page .nav-links a{padding:5px 0}
 .hero{padding:28px 0 18px}.hero h1{font-size:clamp(2rem,8vw,2.65rem);line-height:1.25}
 .hero p{font-size:16px}.hero-card{display:none}
 .dm-quick-start{padding:8px 0}
 .dm-quick-start .container{padding:15px}
 .dm-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .dm-quick-grid a{justify-content:flex-start;padding:10px 12px;min-height:48px}
 .categories{flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:10px;scrollbar-width:thin}
 .categories .chip{white-space:nowrap;flex-shrink:0;min-height:44px}
 .section-head h2{font-size:clamp(1.55rem,5vw,2rem)}
 .tool-page .workspace{margin-top:20px;padding:16px;border-radius:17px}
 .tool-page .dropzone{padding:20px 14px}
 .tool-page .dropzone .big{font-size:30px}
 .tool-page .action-row .btn{min-height:44px}
 .dm-paused-options{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:420px){.dm-quick-grid a{font-size:12px;gap:5px}.dm-quick-grid a span{font-size:17px}.dm-paused-options{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.tool-card,.dm-quick-grid a,.btn{transition:none!important;transform:none!important}}
`;

function filesUnder(dir){const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
 const full=path.join(dir,ent.name);
 if(ent.isDirectory())out.push(...filesUnder(full));else if(ent.isFile())out.push(full);
}return out;}
export function buildLayout(dist){
 const home=path.join(dist,'index.html'),site=path.join(dist,'assets/js/site.v14.js'),css=path.join(dist,'assets/css/styles.css');
 for(const f of [home,site,css])if(!fs.existsSync(f))throw new Error('V18.7: missing build file '+f);
 const originals=filesUnder(dist).filter(x=>x.endsWith('.html'));
 // Read and compute all changes before writing, so unexpected source changes fail safely.
 const mutations=new Map();
 const homeOrig=fs.readFileSync(home,'utf8');
 const improved=improveHome(homeOrig);
 for(const file of originals){
   const rel=path.relative(dist,file).replace(/\\/g,'/');
   const content=rel==='index.html'?improved:fs.readFileSync(file,'utf8');
   let next=content;
   if(rel.startsWith('tools/') && content.includes(PAUSED_TITLE))next=nicePausedPage(rel.split('/')[1]);
   next=improveAccessibility(improveFooter(improveStandaloneNav(next)));
   if(next!==content)mutations.set(file,next);
 }
 mutations.set(site,improveSiteScript(fs.readFileSync(site,'utf8')));
 const stylesheet=fs.readFileSync(css,'utf8');
 if(stylesheet.includes('DocMivo V18.7'))throw new Error('V18.7 CSS already present');
 mutations.set(css,stylesheet+'\n'+LAYOUT_CSS);
 for(const [file,content] of mutations)fs.writeFileSync(file,content);
 console.log('DocMivo V18.7 layout: updated home, filters, mobile menu, disabled pages and links across '+originals.length+' HTML pages.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const here=path.dirname(fileURLToPath(import.meta.url));
 buildLayout(path.resolve(here,'../dist'));
}

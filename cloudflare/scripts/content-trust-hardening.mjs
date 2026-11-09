/** DocMivo V18.9 — disabled-link hygiene and honest quality documentation.
 * Apply ONLY to generated cloudflare/dist, after V18.8. Root Vercel files stay untouched.
 * The source of truth for unavailable tools is V18.1's pausedTools set.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pausedTools} from './cloudflare-only-cleanup.mjs';

const PAUSED=new Set(pausedTools);
const ORIGIN='https://getdocmivo.com';
const STATUS_TAG='متوقفة مؤقتًا';

export function pausedSlugFromHref(href, page='index.html'){
  if(typeof href!=='string'||/^(?:#|javascript:|mailto:|tel:)/i.test(href))return null;
  try {
    // URLs on /guides/slug are virtually extensionless; normalize relative links correctly.
    const virtual=page==='index.html'?'/':('/'+page).replace(/\/index\.html$/,'/').replace(/\.html$/, '');
    const base=new URL(virtual,ORIGIN);
    const url=new URL(href,base);
    if(url.origin!==ORIGIN)return null;
    const match=url.pathname.match(/^\/tools\/([a-z0-9-]+)\/?$/i);
    return match&&PAUSED.has(match[1])?match[1]:null;
  }catch{return null;}
}

export function replaceUnavailableLinks(html,page='index.html'){
  let count=0;const changed=new Set();
  const result=String(html).replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,fragment=>{
    const start=fragment.match(/^<a\b[^>]*>/i)?.[0];
    if(!start)return fragment;
    const href=start.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const slug=pausedSlugFromHref(href,page);
    if(!slug)return fragment;
    count++;changed.add(slug);
    const inner=fragment.slice(start.length, -4);
    // A large card might contain block content. Never wrap a heading or div in a span.
    const block=/<(?:div|h[1-6]|p|article|section)\b/i.test(inner);
    const tag=block?'div':'span';
    return `<${tag} class="dm-unavailable-link" role="note" aria-label="${slug} — غير متاحة مؤقتًا">${inner}<small class="dm-unavailable-label">${STATUS_TAG}</small></${tag}>`;
  });
  return {html:result,count,targets:[...changed]};
}

const GUIDE_NOTICES={
 'guides/word-to-pdf-guide.html':{
   label:'خدمة Word إلى PDF غير مفعّلة حاليًا',
   info:'الدليل هنا يشرح مشكلات الخطوط والجداول وRTL وكيفية التحقق من التحويل، لكنه لا يعني أن خدمة التحويل متاحة الآن على DocMivo. لتحويل DOCX حاليًا استخدم وظيفة تصدير PDF في Word أو LibreOffice على جهازك.',
   link:'/guides/office-fonts-pdf-guide',linkText:'فهم اختلاف الخطوط'
 },
 'guides/searchable-ocr-guide.html':{
   label:'إنشاء PDF قابل للبحث غير متاح حاليًا',
   info:'المتاح على DocMivo هو استخراج نص OCR إلى ملف TXT، وليس إنشاء طبقة نص داخل PDF. الدليل يوضح الفرق التقني بينهما حتى تختار النتيجة الصحيحة.',
   link:'/tools/ocr-pdf',linkText:'استخراج النص إلى TXT'
 },
 'guides/pdfa-guide.html':{
   label:'محول PDF/A غير مفعّل حاليًا',
   info:'هذا المقال دليل لفهم الأرشفة ومعيار PDF/A، وليس خدمة تحقق أو تحويل جاهزة. تأكد من التوافق باستخدام برنامج تدقيق PDF/A متخصص قبل حفظ ملفات أرشيفية مهمة.',
   link:'/guides',linkText:'تصفح أدلة PDF الأخرى'
 },
 'guides/repair-pdf-guide.html':{
   label:'إصلاح PDF التالف غير متاح حاليًا',
   info:'المقال يشرح حدود الإصلاح ومخاطر الملفات التالفة. يمكنك تجربة فحص معلومات PDF أو استخراج الصفحات إن كان الملف ما زال قابلًا للقراءة، لكن ذلك لا يعادل إصلاح بنية ملف تالف.',
   link:'/tools/pdf-info',linkText:'فحص معلومات PDF'
 },
 'guides/office-fonts-pdf-guide.html':{
   label:'تحويلات Office الخادمية متوقفة مؤقتًا',
   info:'التوضيحات هنا عن اختلاف الخطوط في تحويل Word وExcel إلى PDF. محرك التحويل الخادمي غير مفعل على DocMivo حاليًا، والمقال لا يقدم خدمة تحويل مباشرة.',
   link:'/guides/word-to-pdf-guide',linkText:'قراءة دليل Word وPDF'
 }
};
export function addGuideAvailability(html,page){
  const entry=GUIDE_NOTICES[page];
  if(!entry)return html;
  if(String(html).includes('dm-guide-status'))throw new Error('V18.9 guide notice already present: '+page);
  const notice=`<aside class="dm-guide-status" role="note"><strong>${entry.label}</strong><p>${entry.info}</p><a href="${entry.link}">${entry.linkText}</a></aside>`;
  // Keep heading first in article; add status directly after H1, not before it.
  const anchor=/(<article\b[^>]*>[\s\S]{0,1100}?<h1\b[^>]*>[\s\S]*?<\/h1>)/i;
  if(!anchor.test(html))throw new Error('V18.9 article H1 missing: '+page);
  return html.replace(anchor, '$1'+notice);
}

const WORD_OLD='<h2>Word إلى PDF مثال واضح</h2><p>في تحويل Word لا نكتفي بأن النص ظهر. نقارن عدد الصفحات وأبعادها، حدود الجداول، التفاف الأسطر، موضع الصور، والـheaders. إذا كان الخط الأصلي غير متاح على خادم التحويل نستخدم بدائل متوافقة قدر الإمكان، ثم نرفض التعديل تلقائيًا إذا أدى إلى تغير كبير مثل زيادة عدد الصفحات أو التفاف غير طبيعي.</p>';
const WORD_NEW='<h2>تحويل Word وExcel — خدمة متوقفة حاليًا</h2><p>خدمة تحويل Office الاحترافية غير مفعلة حاليًا على DocMivo، لذلك لا ندّعي اختبار نواتجها أو إمكانية استخدامها الآن. الدلائل المنشورة تشرح ما يجب التحقق منه عند استخدام محرك تحويل آخر، مثل الخطوط وتوزيع الصفحات والجداول وRTL.</p>';
const PDF_OLD='<h2>اختبارات PDF</h2><p>في الدمج والتقسيم نراجع عدد الصفحات وترتيبها. في الضغط نقارن الحجم مع وضوح أصغر نص. في OCR نختبر كلمات عربية وإنجليزية وأرقامًا داخل جداول. في الحماية وفتح الملفات نتحقق أن الملف الناتج يفتح أو يرفض الفتح بالطريقة المتوقعة، وليس فقط أن العملية انتهت دون خطأ.</p>';
const PDF_NEW='<h2>ما الذي اختبرناه على ملفات فعلية؟</h2><p>في اختبار الدمج جمعنا 17 صفحة من ملفين وتحققنا من عدد الصفحات وترتيبها. واختبرنا التقسيم إلى جزأين (صفحة واحدة و16 صفحة)، وكذلك التدوير وحذف الصفحات واستخراجها وترتيبها. في ملف PDF ممسوح من صفحة واحدة انخفض الحجم من نحو 6.81 MB إلى 0.89 MB بعد الضغط، مع مقارنة بصرية للوضوح؛ النتيجة تختلف بحسب الملف. واختبرنا تحويل PDF إلى صور والصور إلى PDF واستخراج النص. تعرف OCR على الأسطر الخمسة في عينة إنجليزية واضحة، لكنه دمج بعض الكلمات في عينة صغيرة؛ ولذلك ما زالت النصوص الصغيرة والعربية والجداول تحتاج مراجعة بشرية. أدوات الحماية وPDF/A وخدمات Office غير مفعّلة حاليًا، ولا نعتبرها مختبرة على الموقع المباشر.</p>';

export function improveQualityClaims(html){
  let next=String(html);
  if(!next.includes(WORD_OLD)||!next.includes(PDF_OLD))throw new Error('V18.9 quality page text changed; review instead of overwriting');
  next=next.replace(WORD_OLD,WORD_NEW).replace(PDF_OLD,PDF_NEW);
  return next;
}

export const AVAILABILITY_CSS=`\n/* DocMivo V18.9 — honest status and safe inline links */\n.dm-unavailable-link{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;color:#64748b;border-bottom:1px dashed #a1a1aa;cursor:default;font-weight:600}\n.dm-unavailable-label{font-size:11px;line-height:1.5;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:999px;padding:2px 7px;white-space:nowrap}\ndiv.dm-unavailable-link{display:flex;flex-direction:column;align-items:flex-start;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:6px 0;background:#fafafa}\n.dm-guide-status{background:#f8fafc;border:1px solid #cbd5e1;border-inline-start:4px solid #64748b;padding:16px 18px;border-radius:12px;margin:16px 0 22px;line-height:1.8}\n.dm-guide-status strong{display:block;font-size:1rem;color:#1e293b}\n.dm-guide-status p{margin:7px 0 8px;color:#475569;font-size:.95rem}\n.dm-guide-status a{color:#4338ca;text-decoration:underline;text-underline-offset:3px;font-weight:700}\n@media(max-width:600px){.dm-guide-status{padding:13px}.dm-unavailable-link{font-size:.9rem}}\n`;

function htmlFiles(root){
 const out=[];
 for(const d of fs.readdirSync(root,{withFileTypes:true})){
  const full=path.join(root,d.name);
  if(d.isDirectory())out.push(...htmlFiles(full));
  else if(d.isFile()&&d.name.endsWith('.html'))out.push(full);
 }
 return out;
}

/** Count targets that would lead to disabled tools. Keep this an invariant after patching. */
export function findPausedAnchors(html,page){
 const matches=[];
 for(const a of String(html).matchAll(/<a\b[^>]*>/gi)){
  const href=a[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
  const slug=pausedSlugFromHref(href,page);
  if(slug)matches.push({href,slug});
 }
 return matches;
}

/** Report suspicious local links without blocking otherwise healthy production deploys.
 * A missing route is a warning pending manual review (some Worker routes are dynamic).
 */
export function auditInternalDestinations(dist){
 const missing=[];
 for(const file of htmlFiles(dist)){
  const page=path.relative(dist,file).split(path.sep).join('/');
  const html=fs.readFileSync(file,'utf8');
  for(const anchor of html.matchAll(/<a\b[^>]*>/gi)){
   const href=anchor[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
   if(!href||/^(?:#|javascript:|mailto:|tel:|data:)/i.test(href))continue;
   const pageBase=page==='index.html'?'/':('/'+page).replace(/\/index\.html$/,'/').replace(/\.html$/,'');
   let url;
   try{url=new URL(href,new URL(pageBase,ORIGIN));}catch{continue;}
   if(url.origin!==ORIGIN||url.pathname.startsWith('/api/'))continue;
   let normalized;
   try{normalized=decodeURIComponent(url.pathname).replace(/\/+$/,'')||'/';}catch{continue;}
   if(normalized.includes('\\')||normalized.split('/').includes('..'))continue;
   const route=normalized==='/'?'index':normalized.slice(1);
   const candidates=route==='index'?['index.html']:[route,route+'.html',route+'/index.html'];
   if(!candidates.some(x=>fs.existsSync(path.join(dist,x))))missing.push({source:page,url:normalized});
  }
 }
 return missing;
}

export function applyContentTrust(dist){
 const home=path.join(dist,'index.html'),quality=path.join(dist,'quality.html');
 const css=path.join(dist,'assets/css/styles.css');
 for(const f of [home,quality,css])if(!fs.existsSync(f))throw new Error('V18.9 missing dist file: '+f);
 const changes=[];let replaced=0,affected=0;
 for(const file of htmlFiles(dist)){
  const rel=path.relative(dist,file).split(path.sep).join('/');
  const previous=fs.readFileSync(file,'utf8');
  let updated=previous;
  if(rel==='quality.html')updated=improveQualityClaims(updated);
  updated=addGuideAvailability(updated,rel);
  const fix=replaceUnavailableLinks(updated,rel);
  updated=fix.html;replaced+=fix.count;
  if(updated!==previous){changes.push([file,updated]);affected++;}
  if(findPausedAnchors(updated,rel).length)throw new Error('V18.9 paused link still exists in '+rel);
 }
 const stylesheet=fs.readFileSync(css,'utf8');
 if(stylesheet.includes('DocMivo V18.9'))throw new Error('V18.9 stylesheet already patched');
 changes.push([css,stylesheet+AVAILABILITY_CSS]);
 for(const [file,contents] of changes)fs.writeFileSync(file,contents);
 const unresolved=auditInternalDestinations(dist);
 console.log(`DocMivo V18.9: neutralized ${replaced} links to paused tools in ${affected} HTML pages; updated guides and QA claims; ${unresolved.length} potentially unresolved internal links.`);
 if(unresolved.length)console.warn('V18.9 internal link review (first 12): '+JSON.stringify(unresolved.slice(0,12)));
 return {links:replaced,pages:affected,unresolved:unresolved.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 applyContentTrust(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
}

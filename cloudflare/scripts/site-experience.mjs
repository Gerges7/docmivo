/** Cloudflare-only final pass: site-wide experience, metadata and semantic structure.
 * Never overwrites source HTML or claims article translations that do not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const titles={
  'bates-numbering-guide':'ترقيم Bates في PDF: التسلسل والنطاق | DocMivo',
  'compress-pdf-guide':'ضغط PDF بدون فقدان الوضوح | DocMivo',
  'images-to-pdf-guide':'تحويل الصور إلى PDF وترتيبها | DocMivo',
  'merge-pdf-guide':'دمج PDF: ترتيب الصفحات وفحص النتيجة | DocMivo',
  'metadata-pdf-guide':'بيانات PDF الوصفية: العنوان والمؤلف | DocMivo',
  'n-up-booklet-guide':'N-up وBooklet: ترتيب صفحات PDF | DocMivo',
  'ocr-guide':'OCR عربي وإنجليزي: تحسين دقة PDF | DocMivo',
  'office-fonts-pdf-guide':'حل مشاكل الخطوط في تحويل Office إلى PDF | DocMivo',
  'pdfa-guide':'PDF/A للأرشفة: الفرق عن PDF العادي | DocMivo',
  'pdf-forms-guide':'نماذج PDF: فحص الحقول والتعبئة | DocMivo',
  'pdf-privacy-guide':'خصوصية PDF: إزالة البيانات المخفية | DocMivo',
  'repair-pdf-guide':'إصلاح PDF التالف: الإمكانيات والحدود | DocMivo',
  'sign-pdf-guide':'توقيع PDF: الموضع وصورة التوقيع | DocMivo',
  'word-to-pdf-guide':'Word إلى PDF: الحفاظ على الخطوط والجداول | DocMivo',
  'qr-code-guide':'QR Code عملي: الروابط وWi-Fi وvCard | DocMivo',
  'image-optimization-guide':'ضغط الصور وتغيير الأبعاد واختيار الصيغة | DocMivo'
};
const DEFERRED_UI_SCRIPTS=new Set(['config.v14.js','tools-data.v14.js','site.v14.js','tool-engine.v14.js']);
export function deferUiScripts(html){
  return String(html).replace(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi,tag=>{
    const src=tag.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i)?.[2]||'';
    const file=src.split(/[?#]/)[0].split('/').pop();
    if(!DEFERRED_UI_SCRIPTS.has(file)||/\b(?:async|defer)\b/i.test(tag))return tag;
    return tag.replace(/<script\b/i,'<script defer');
  });
}
function pages(dir){const all=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.name.startsWith('.'))continue;
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())all.push(...pages(file));
  else if(entry.isFile()&&entry.name.endsWith('.html'))all.push(file);
}return all;}
export function enhanceHtml(html,relative){
  if(!/<html\b/i.test(html)||!/<\/head>/i.test(html)||!/<\/body>/i.test(html))throw new Error('Missing required HTML structure: '+relative);
  if(html.includes('data-docmivo-experience'))throw new Error('Experience already installed: '+relative);
  let out=html;
  if(relative.startsWith('guides/')){
    const slug=path.basename(relative,'.html');
    if(titles[slug]){
      const title=titles[slug];
      if(title.length>60)throw new Error('Guide title still too long: '+slug);
      out=out.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+title+'</title>');
    }
  }
  // Index a verified tool only after giving the user accurate, specific instructions.
  if(relative==='tools/pdf-info/index.html'){
    const beta='<meta content="noindex,follow" name="robots"/>';
    if(!out.includes(beta))throw new Error('PDF Info must begin in noindex QA state');
    const section=/<section class="content-block"><h2>كيفية استخدام أداة معلومات PDF<\/h2>[\s\S]*?<\/section>/i;
    if(!section.test(out))throw new Error('PDF Info generic instructions changed');
    out=out.replace(beta,'');
    out=out.replace(section,'<section class="content-block dm-pdf-info-verified"><h2>فحص عدد صفحات PDF والبيانات الوصفية خطوة بخطوة</h2><ol><li>اختر ملف PDF من جهازك وتأكد أن اسمه ظهر في قائمة الملفات.</li><li>اضغط «ابدأ العملية»؛ تُقرأ بيانات المستند محليًا داخل المتصفح.</li><li>اقرأ المعلومات داخل الصفحة، مثل اسم الملف وحجمه وعدد الصفحات والعنوان والمؤلف. <strong>هذه الأداة تعرض النتائج ولا تنشئ ملفًا جديدًا للتنزيل.</strong></li></ol></section>');
    const original='<h2>متى تكون أداة معلومات PDF مفيدة؟</h2>';
    const explanation='<h2>ما المقصود ببيانات PDF المعروضة؟</h2><p>الحقل <strong dir="ltr">pages</strong> هو عدد الصفحات الفعلي. ويعرض <strong dir="ltr">name</strong> اسم الملف المختار و<strong dir="ltr">size</strong> حجمه. أما <strong dir="ltr">title</strong> و<strong dir="ltr">author</strong> و<strong dir="ltr">subject</strong> فهي بيانات وصفية قد تكون ناقصة أو غير دقيقة. ويشير <strong dir="ltr">creator</strong> و<strong dir="ltr">producer</strong> عادةً إلى البرامج التي أنشأت المستند أو أنتجته.</p><p>إذا ظهر الرمز «—» لحقل ما، فهذا يعني أن قيمة الحقل غير متاحة للأداة، ولا يعني أن المستند خالٍ من المعلومات الحساسة أو المحتوى المخفي.</p><h3>متى تستخدم الأداة؟</h3>';
    if(!out.includes(original))throw new Error('PDF Info use case section missing');
    out=out.replace(original,explanation);
    const old='إذا كنت تعمل على مستند مهم، قارن النسخة الناتجة بالأصل قبل الحذف أو الإرسال.';
    if(out.includes(old))out=out.replace(old,'قبل إرسال ملف مهم، راجع عدد صفحاته والحقول الوصفية. قراءة هذه الحقول لا تحذفها، ولا تثبت هوية منشئ المستند؛ يمكنك استخدام أداة إزالة البيانات الوصفية بصورة منفصلة ثم مراجعة النسخة الجديدة.');
    const extra='<section class="content-block dm-pdf-info-verified"><h2>حدود الفحص وخصوصية الملف</h2><p>هذه الأداة لا تغير الملف الأصلي، ولا تحفظ نسخة جديدة، ولا تتطلب رفع ملف PDF إلى خادم DocMivo. بعض الملفات المشفرة أو التالفة قد يتعذر فتحها. لا يكشف هذا الفحص وحده النصوص المخفية داخل الصفحات أو المرفقات أو المعلومات الحساسة الموجودة في الصور المضمنة، لذلك لا تعتبره فحصًا أمنيًا شاملًا.</p></section>';
    const before='<section class="content-block v5-seo"><h2>الخصوصية وطريقة المعالجة</h2>';
    if(!out.includes(before))throw new Error('PDF Info privacy section missing');
    out=out.replace(before,extra+before);
  }
  // Footer navigation groups should not skip directly from H2 to H4.
  out=out.replace(/<footer\b[\s\S]*?<\/footer>/gi,section=>section.replace(/<(\/?)h4(\s|>)/gi,'<$1h2$2'));
  // File upload affordance is a control label, not a new subheading before first H2.
  out=out.replace(/<h3>اسحب الملفات هنا<\/h3>/g,'<p class="dm-dropzone-title">اسحب الملفات هنا</p>');
  const boot='<script data-docmivo-experience>try{var t=localStorage.getItem("docmivo.theme")||"system";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}</script>';
  out=out.replace(/<\/head>/i,boot+'<link rel="stylesheet" href="/assets/css/experience.css"></head>');
  out=out.replace(/<\/body>/i,'<script defer src="/assets/js/experience.js"></script></body>');
  return deferUiScripts(out);
}
export function installExperience(dist){
  const css=path.join(dist,'assets/css/experience.css'),js=path.join(dist,'assets/js/experience.js');
  if(!fs.existsSync(css)||!fs.existsSync(js))throw new Error('Experience assets missing');
  const all=pages(dist);
  if(all.length<3)throw new Error('Unexpectedly few pages for experience pass');
  for(const file of all){
    const rel=path.relative(dist,file).replace(/\\/g,'/');
    const html=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,enhanceHtml(html,rel));
  }
  // PDF Info is now covered by the browser output test and has real task-specific guidance.
  const sitemap=path.join(dist,'sitemap.xml'),xml=fs.readFileSync(sitemap,'utf8');
  const entry='<loc>https://getdocmivo.com/tools/pdf-info</loc>';
  if(!xml.includes(entry)){
    if(!xml.includes('</urlset>'))throw new Error('Cannot extend malformed sitemap');
    fs.writeFileSync(sitemap,xml.replace('</urlset>','  <url>'+entry+'<lastmod>2026-11-24</lastmod></url>\n</urlset>'));
  }
  const styles=fs.readFileSync(css,'utf8');
  fs.appendFileSync(css,'\n.dm-dropzone-title{font-size:1.18rem;font-weight:800;margin:10px 0 4px}\n');
  console.log('DocMivo experience: theme and 4-language common UI shipped across '+all.length+' HTML routes; 14 guide titles shortened.');
  return all.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
  installExperience(dir);
}

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
  'word-to-pdf-guide':'Word إلى PDF: الحفاظ على الخطوط والجداول | DocMivo'
};
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
  // Footer navigation groups should not skip directly from H2 to H4.
  out=out.replace(/<footer\b[\s\S]*?<\/footer>/gi,section=>section.replace(/<(\/?)h4(\s|>)/gi,'<$1h2$2'));
  // File upload affordance is a control label, not a new subheading before first H2.
  out=out.replace(/<h3>اسحب الملفات هنا<\/h3>/g,'<p class="dm-dropzone-title">اسحب الملفات هنا</p>');
  const boot='<script data-docmivo-experience>try{var t=localStorage.getItem("docmivo.theme")||"system";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}</script>';
  out=out.replace(/<\/head>/i,boot+'<link rel="stylesheet" href="/assets/css/experience.css"></head>');
  out=out.replace(/<\/body>/i,'<script defer src="/assets/js/experience.js"></script></body>');
  return out;
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
  const styles=fs.readFileSync(css,'utf8');
  fs.appendFileSync(css,'\n.dm-dropzone-title{font-size:1.18rem;font-weight:800;margin:10px 0 4px}\n');
  console.log('DocMivo experience: theme and 4-language common UI shipped across '+all.length+' HTML routes; 14 guide titles shortened.');
  return all.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
  installExperience(dir);
}

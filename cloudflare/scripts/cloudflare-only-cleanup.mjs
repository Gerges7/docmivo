/**
 * DocMivo V18.1 -- Public static-site hygiene while Cloud Run / Gemini are offline.
 * This runs AFTER build-cloudflare.mjs and edits only cloudflare/dist.
 * Reversible: remove this post-build step once production backends pass QA.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DIST=path.resolve(__dirname,'../dist');
export const pausedTools=Object.freeze([
  'word-to-pdf','excel-to-pdf','powerpoint-to-pdf',
  'protect-pdf','unlock-pdf','repair-pdf','searchable-ocr-pdf',
  'pdfa-converter','extract-images-pdf',
  'ask-pdf-ai','summarize-pdf-ai','translate-pdf-ai',
  'extract-tables-ai','ocr-cleanup-ai','research-paper-ai',
  'invoice-extractor-ai','cv-analyzer-ai','contract-analyzer-ai',
  'pii-detector-ai','smart-filename-ai'
]);
const PAUSED=new Set(pausedTools);
const pageUrl=slug=>'/tools/'+slug;
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function isPausedHref(href){
  const match=String(href).match(/^\/?tools\/([^/?#]+)\/?(?:[?#].*)?$/);
  return !!match && PAUSED.has(match[1]);
}
export function cleanupHome(html){
  let updated=html;
  // Each card is a single anchor, not an enclosing section; preserve its siblings.
  updated=updated.replace(/<a\b([^>]*?)\bhref=(['"])([^'"]+)\2([^>]*)>[\s\S]*?<\/a>/gi,(full,before,q,url)=>isPausedHref(url)?'':full);
  // Replace disabled AI section with useful explanatory navigation, not a broken catalog.
  updated=updated.replace(/<section\b[^>]*\bid=(['"])ai-tools\1[^>]*>[\s\S]*?<\/section>/i,'');
  // Remove links to the deleted AI anchor. (Works for desktop and mobile nav.)
  updated=updated.replace(/<a\b[^>]*\bhref=(['"])(?:\/#ai-tools|#ai-tools)\1[^>]*>[\s\S]*?<\/a>/gi,'');
  // Do not advertise a numerical inventory that no longer matches published tools.
  updated=updated.replace(/43\s*\+\s*5/g,'أدوات');
  if(!updated.includes('id="v17-new-tools"'))throw new Error('Expected QR/images section missing');
  if(updated.includes('id="ai-tools"'))throw new Error('AI section unexpectedly remains');
  return updated;
}
export function cleanupSitemap(xml){
  return xml.replace(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>\s*/gi,(full,loc)=>{
    let slug;
    try{slug=new URL(loc).pathname.match(/^\/tools\/([^/]+)\/?$/)?.[1]}catch{return full}
    return slug && PAUSED.has(slug)?'':full;
  });
}
const htmlEscape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pausedPage(slug){
  if(!PAUSED.has(slug))throw new Error('Not a paused tool');
  const name=slug.replace(/-/g,' ');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="googlebot" content="noindex,follow"><title>الأداة غير متاحة مؤقتًا | DocMivo</title><style>body{font-family:system-ui,Tahoma,Arial,sans-serif;background:#f8fafc;color:#1d2739;margin:0;line-height:1.8}main{max-width:640px;margin:9vh auto;background:white;border-radius:20px;padding:32px;box-shadow:0 10px 40px #17253a13}h1{margin:0;font-size:1.7rem}p{color:#41526a}a{color:#1961ac}ul{padding-right:26px}@media(max-width:700px){main{margin:20px;padding:24px}}</style></head><body><main><p>DocMivo</p><h1>الأداة غير متاحة مؤقتًا</h1><p>الأداة <strong>${htmlEscape(name)}</strong> تحتاج محرك معالجة لم يتم تفعيله بعد. لن نطلب منك رفع ملفات أو بدء عملية لا يمكن إكمالها.</p><p>بدائل تعمل محليًا داخل المتصفح:</p><ul><li><a href="/tools/merge-pdf">دمج PDF</a></li><li><a href="/tools/split-pdf">تقسيم PDF</a></li><li><a href="/tools/rotate-pdf">تدوير PDF</a></li><li><a href="/tools/qr-code">إنشاء QR Code</a></li><li><a href="/tools/image-resize">تغيير أبعاد الصور</a></li></ul><p><a href="/">العودة إلى الصفحة الرئيسية</a></p></main></body></html>`;
}
export function cleanupPublicSite(dist=DIST){
  const home=path.join(dist,'index.html'),sitemap=path.join(dist,'sitemap.xml');
  if(!fs.existsSync(home)||!fs.existsSync(sitemap))throw new Error('Cloudflare dist missing; run build-cloudflare.mjs first');
  fs.writeFileSync(home,cleanupHome(fs.readFileSync(home,'utf8')));
  fs.writeFileSync(sitemap,cleanupSitemap(fs.readFileSync(sitemap,'utf8')));
  let count=0;
  for(const slug of pausedTools){
    const target=path.join(dist,'tools',slug,'index.html');
    if(!fs.existsSync(target))throw new Error('Missing original tool page '+slug);
    fs.writeFileSync(target,pausedPage(slug));count++;
  }
  const output=fs.readFileSync(home,'utf8');
  for(const slug of pausedTools){
    if(new RegExp('href=["\\\']/?tools/'+escapeRegExp(slug)+'(["\\\'?/#])','i').test(output))throw new Error('Paused tool still linked from homepage: '+slug);
  }
  console.log(`Cloudflare-only QA cleanup: paused ${count} server/AI tools; homepage and sitemap cleaned.`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cleanupPublicSite();

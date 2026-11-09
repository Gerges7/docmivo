/**
 * DocMivo V18.8: truthful, build-time SEO & indexability checks on Cloudflare dist.
 * - KEEP paused tools noindex; the script never re-enables their indexing.
 * - Mark only previously QA-tested QR and Resize tools indexable.
 * - Keep sitemap restricted to existing indexable pages on getdocmivo.com.
 * - Enable a documented OCR Tesseract parameter without fabricating missing spaces.
 * This executes AFTER V18.7's layout patch and does not modify original site files.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ORIGIN='https://getdocmivo.com';
export const AUDITED_TOOLS = Object.freeze(['qr-code','image-resize']);
export const NOT_AUDITED = Object.freeze(['image-compress']); // Keep noindex until production QA.
const TITLE_NEW='DocMivo — أدوات PDF والصور وQR مجانية';
const META_NEW='استخدم أدوات DocMivo المجانية لدمج وضغط وتقسيم PDF واستخراج النصوص وتحويل الصور وإنشاء QR، مع شرح واضح للخصوصية وجودة النتائج.';

function must(cond,msg){if(!cond)throw new Error('V18.8: '+msg);}
function hasNoindex(html){
  return [...String(html).matchAll(/<meta\b[^>]*>/gi)].some(m=>
    /\bname\s*=\s*["'](?:robots|googlebot)["']/i.test(m[0]) &&
    /\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(m[0]));
}
function xmlEscape(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sitemapPaths(url){
 const u=new URL(url, ORIGIN);
 if(u.origin!==ORIGIN || u.search || u.hash) return [];
 const p=decodeURIComponent(u.pathname).replace(/\/+$/,'')||'/';
 if(p==='/')return ['index.html'];
 const route=p.replace(/^\//,'');
 if(route.includes('..') || route.includes('\\'))return [];
 return [route+'.html',path.posix.join(route,'index.html')];
}
function findUrlPage(dist,url){
 for(const relative of sitemapPaths(url)){
  const file=path.join(dist,relative);
  if(fs.existsSync(file)&&fs.statSync(file).isFile())return file;
 }
 return null;
}
function canonicalMatches(html,url){
 const links=[...String(html).matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
 const tag=links.find(tag=>/\brel\s*=\s*["']canonical["']/i.test(tag));
 if(!tag)return true; // An absent canonical is an audit warning, not a guessed redirect.
 const href=tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
 if(!href)return false;
 try{
  const expected=new URL(url);
  const got=new URL(href,ORIGIN);
  return got.origin===expected.origin && got.pathname.replace(/\/+$/,'')===expected.pathname.replace(/\/+$/,'');
 }catch{return false;}
}

export function improveLandingMetadata(html){
 let out=String(html);
 // Generated title is set by the existing V18 builder. Do not rewrite arbitrary pages.
 if(out.includes('<title>DocMivo — أدوات PDF والصور وQR مجانية</title>')){
  out=out.replace(/<meta\s+content="[^"]*"\s+name="description"\s*\/>/i,`<meta content="${META_NEW}" name="description"/>`);
  out=out.replace(/<meta\s+content="[^"]*"\s+property="og:description"\s*\/>/i,`<meta content="${META_NEW}" property="og:description"/>`);
  out=out.replace(/<meta\s+content="[^"]*"\s+name="twitter:description"\s*\/>/i,`<meta content="${META_NEW}" name="twitter:description"/>`);
  out=out.replace(/<meta\s+content="[^"]*"\s+property="og:title"\s*\/>/i,`<meta content="${TITLE_NEW}" property="og:title"/>`);
  out=out.replace(/<meta\s+content="[^"]*"\s+name="twitter:title"\s*\/>/i,`<meta content="${TITLE_NEW}" name="twitter:title"/>`);
 }
 return out;
}
export function makeAuditedToolIndexable(html,slug){
 must(AUDITED_TOOLS.includes(slug),'refusing to index unverified tool '+slug);
 let out=String(html);
 const expected=`${ORIGIN}/tools/${slug}`;
 must(canonicalMatches(out,expected),'canonical mismatches verified tool '+slug);
 // These standalone V17 tool pages were deliberately noindexed during beta.
 must(hasNoindex(out),'expected original noindex tag on '+slug);
 out=out.replace(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["']noindex\s*,\s*follow["'])[^>]*>\s*/i,'');
 must(!hasNoindex(out),'a noindex directive still remains on '+slug);
 // Remove the beta-status footer on only the two verified tools.
 out=out.replace(/هذه الأدوات في مرحلة V17 التجريبية، ويتم اختبارها قبل فهرستها\./g,
  'التحويل يتم داخل متصفحك. اختبر الناتج قبل استخدامه في الطباعة أو المشاركة.');
 return out;
}
export function fix404Paths(html){
 return String(html).replace(/\b(href|src)=(['"])(?!\/?\/|https?:|data:|#)(assets\/|favicon\.svg|manifest\.webmanifest)/gi,
  (m,attr,q,p)=>`${attr}=${q}/${p}`);
}
export function enableOcrSpacing(source){
 const old="await worker.setParameters({tessedit_pageseg_mode:pageSegMode});";
 const updated="await worker.setParameters({tessedit_pageseg_mode:pageSegMode,preserve_interword_spaces:'1'});";
 const count=String(source).split(old).length-1;
 must(count===1,'expected V18.6 OCR page-segmentation setting (found '+count+')');
 return source.replace(old,updated);
}
export function curateSitemap(xml,dist){
 must(/<urlset\b/.test(xml)&&/<\/urlset>/.test(xml),'malformed sitemap');
 let kept=0,excluded=0;const seen=new Set();
 let out=String(xml).replace(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>\s*/gi,(block,url)=>{
  const valid=url.startsWith(ORIGIN+'/') && !seen.has(url);
  const file=valid?findUrlPage(dist,url):null;
  const html=file?fs.readFileSync(file,'utf8'):'';
  if(!file||hasNoindex(html)||!canonicalMatches(html,url)) {excluded++;return '';}
  seen.add(url);kept++;return block;
 });
 for(const slug of AUDITED_TOOLS){
  const url=`${ORIGIN}/tools/${slug}`;
  const file=findUrlPage(dist,url);
  must(file&&(!hasNoindex(fs.readFileSync(file,'utf8'))),'audited tool is absent/noindex: '+slug);
  if(!seen.has(url)){out=out.replace('</urlset>',`  <url><loc>${xmlEscape(url)}</loc></url>\n</urlset>`);seen.add(url);kept++;}
 }
 return {xml:out,kept,excluded};
}
export function checkCrawling(dist){
 const base=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
 const urls=[...base.matchAll(/<loc>([^<]+)<\/loc>/g)].map(z=>z[1]);
 const bad=[];
 for(const url of urls){
  const file=findUrlPage(dist,url),html=file?fs.readFileSync(file,'utf8'):'';
  if(!file||hasNoindex(html)||!canonicalMatches(html,url))bad.push(url);
 }
 const robots=fs.readFileSync(path.join(dist,'robots.txt'),'utf8');
 must(/Sitemap:\s*https:\/\/getdocmivo\.com\/sitemap\.xml/i.test(robots),'robots missing canonical sitemap');
 must(!bad.length,'sitemap has missing/noindex/noncanonical URLs: '+bad.join(', '));
 return {sitemapUrls:urls.length,bad};
}
function patchFile(file,func){
 must(fs.existsSync(file),'missing dist file '+file);
 return [file,func(fs.readFileSync(file,'utf8'))];
}
export function runSeoReadiness(dist){
 must(fs.existsSync(path.join(dist,'index.html')),'build output missing');
 const mutations=[
  patchFile(path.join(dist,'index.html'),improveLandingMetadata),
  patchFile(path.join(dist,'404.html'),fix404Paths),
  patchFile(path.join(dist,'assets/js/tool-engine.v14.js'),enableOcrSpacing)
 ];
 for(const slug of AUDITED_TOOLS){
  const file=path.join(dist,'tools',slug,'index.html');
  mutations.push(patchFile(file,h=>makeAuditedToolIndexable(h,slug)));
 }
 // Atomic with respect to source inspection: do not overwrite output until checks pass.
 const original=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
 let sitemap;
 // The sitemap is curated against new versions, not old noindex pages.
 // Perform a temporary filesystem swap to verify, then restore on failure.
 const backup=mutations.map(([p])=>[p,fs.readFileSync(p,'utf8')]);
 try{
  for(const [p,v] of mutations)fs.writeFileSync(p,v);
  sitemap=curateSitemap(original,dist);
  fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap.xml);
  const stats=checkCrawling(dist);
  console.log(`DocMivo V18.8: indexable sitemap ${stats.sitemapUrls} pages; excluded ${sitemap.excluded} absent/noindex URLs; QR/Resize verified; OCR spacing setting enabled.`);
  return {sitemapUrls:stats.sitemapUrls,excluded:sitemap.excluded};
 }catch(error){
  for(const [p,v] of backup)fs.writeFileSync(p,v);
  fs.writeFileSync(path.join(dist,'sitemap.xml'),original);
  throw error;
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runSeoReadiness(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
}

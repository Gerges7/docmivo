/**
 * DocMivo AdSense scope policy.
 * Keep publisher verification/Auto Ads only on indexable, publisher-value pages.
 * Contact/terms pages, noindex tools and unavailable-tool guides are not ad inventory. Privacy/cookie pages retain the Google consent interface.
 * Google Analytics is intentionally left untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const LEGAL_PAGES=new Set(['contact.html','terms.html','404.html']);
const NON_MONETIZED_PREFIXES=['v17-preview/','tools/'];
const NON_MONETIZED_GUIDES=new Set([
 'guides/word-to-pdf-guide.html',
 'guides/searchable-ocr-guide.html',
 'guides/pdfa-guide.html',
 'guides/repair-pdf-guide.html',
 'guides/office-fonts-pdf-guide.html'
]);
const META_RE=/<meta\b[^>]*\bname\s*=\s*["']google-adsense-account["'][^>]*\/?>/gi;
const SCRIPT_RE=/<script\b(?=[^>]*\bsrc\s*=\s*["'][^"']*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"']*["'])[^>]*>\s*<\/script>/gi;
const LOADER_RE=/<script\b(?=[^>]*\bsrc\s*=\s*["'][^"']*assets\/js\/ads(?:\.v\d+)?\.js["'])[^>]*>\s*<\/script>/gi;

function walk(dir){
 const out=[];
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,e.name);
  if(e.isDirectory())out.push(...walk(full));
  else if(e.isFile()&&e.name.toLowerCase().endsWith('.html'))out.push(full);
 }
 return out;
}
function hasNoindex(html){
 return [...String(html).matchAll(/<meta\b[^>]*>/gi)].some(m=>
  /\bname\s*=\s*["'](?:robots|googlebot)["']/i.test(m[0])&&
  /\bcontent\s*=\s*["'][^"']*\bnoindex\b/i.test(m[0]));
}
function adsTxtPublisher(dist){
 const file=path.join(dist,'ads.txt');
 if(!fs.existsSync(file))throw new Error('AdSense scope: ads.txt is missing');
 const value=fs.readFileSync(file,'utf8').replace(/\r/g,'').trim();
 const m=value.match(/^google\.com,\s*pub-(\d{10,24}),\s*DIRECT,\s*f08c47fec0942fa0$/i);
 if(!m)throw new Error('AdSense scope: ads.txt is malformed or contains an unverified seller');
 return m[1];
}
function isExcluded(rel,html){
 return LEGAL_PAGES.has(rel)||NON_MONETIZED_GUIDES.has(rel)||NON_MONETIZED_PREFIXES.some(prefix=>rel.startsWith(prefix))||hasNoindex(html);
}
export function scopeAdSensePage(html,rel,publisherId){
 let out=String(html).replace(META_RE,'').replace(SCRIPT_RE,'').replace(LOADER_RE,'');
 if(isExcluded(rel,String(html)))return out;
 if(!/<head\b[^>]*>/i.test(out))throw new Error('AdSense scope: missing head in '+rel);
 const meta='<meta name="google-adsense-account" content="ca-pub-'+publisherId+'"/>';
 const script='<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-'+publisherId+'"></script>';
 out=out.replace(/<\/head>/i,meta+script+'</head>');
 return out;
}
export function applyAdSensePageScope(dist){
 if(!fs.existsSync(path.join(dist,'index.html')))throw new Error('AdSense scope: dist/index.html missing');
 const publisherId=adsTxtPublisher(dist),files=walk(dist),changes=[];
 let eligible=0,excluded=0,removedLoaders=0;
 for(const file of files){
  const rel=path.relative(dist,file).split(path.sep).join('/');
  const before=fs.readFileSync(file,'utf8');
  const after=scopeAdSensePage(before,rel,publisherId);
  if(isExcluded(rel,before))excluded++;else eligible++;
  removedLoaders+=(before.match(LOADER_RE)||[]).length;
  if(after!==before)changes.push([file,after]);
 }
 const home=changes.find(x=>x[0]===path.join(dist,'index.html'))?.[1]||fs.readFileSync(path.join(dist,'index.html'),'utf8');
 if(!home.includes('ca-pub-'+publisherId)||!home.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'))
  throw new Error('AdSense scope: homepage verification tag was not installed');
 for(const [file,content] of changes)fs.writeFileSync(file,content);
 console.log('DocMivo AdSense scope: '+eligible+' indexable content pages enabled; '+excluded+' legal/noindex/unavailable pages excluded; '+removedLoaders+' duplicate loaders removed.');
 return {eligible,excluded,removedLoaders,publisherId};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 applyAdSensePageScope(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
}

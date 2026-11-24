import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function isAdEligiblePath(pathname){
 const p=String(pathname||'/').replace(/\/+$/,'')||'/';
 return p==='/'||p==='/guides'||p.startsWith('/guides/');
}
export function isAdEligibleFile(rel){
 const p=String(rel).replace(/\\/g,'/');
 return p==='index.html'||p==='guides/index.html'||(/^guides\/[a-z0-9-]+\.html$/i.test(p));
}
export function stripAdLoader(html){
 const re=/<script\b[^>]*src=["'][^"']*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"']*["'][^>]*>\s*<\/script>/gi;
 const source=String(html),removed=(source.match(re)||[]).length;
 return {html:source.replace(re,''),removed};
}
function walk(dir,root=dir){
 const out=[];
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const f=path.join(dir,e.name);
  if(e.isDirectory())out.push(...walk(f,root));
  else if(e.isFile()&&e.name.endsWith('.html'))out.push({file:f,rel:path.relative(root,f).replace(/\\/g,'/')});
 }
 return out;
}
export function applyAdSensePageScope(dist){
 const home=path.join(dist,'index.html'),loader=path.join(dist,'assets/js/ads.v14.js');
 if(!fs.existsSync(home)||!fs.existsSync(loader))throw new Error('AdSense page scope: missing homepage or ads loader');
 const changes=[];let retained=0,excluded=0,removed=0;
 for(const {file,rel} of walk(dist)){
  const original=fs.readFileSync(file,'utf8');
  if(isAdEligibleFile(rel)){
   if(!original.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'))throw new Error('Eligible page lacks AdSense loader: '+rel);
   retained++;continue;
  }
  const result=stripAdLoader(original);
  if(result.removed){changes.push([file,result.html]);removed+=result.removed;excluded++;}
  if(result.html.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'))throw new Error('Excluded page still has AdSense loader: '+rel);
 }
 const js=fs.readFileSync(loader,'utf8');
 if(js.includes('DOCMIVO_AD_ELIGIBLE_PATH'))throw new Error('AdSense page scope already applied');
 const anchor="const client=C.adsenseClient;";
 if(!js.includes(anchor))throw new Error('AdSense loader source changed');
 const guard="\n // DOCMIVO_AD_ELIGIBLE_PATH: keep Auto Ads away from tools, forms and legal pages.\n const p=window.location.pathname.replace(/\\\\/+$/,'')||'/';\n const eligible=p==='/'||p==='/guides'||p.startsWith('/guides/');\n if(!eligible)return;";
 changes.push([loader,js.replace(anchor,anchor+guard)]);
 for(const [file,content] of changes)fs.writeFileSync(file,content);
 console.log('DocMivo AdSense page scope:',JSON.stringify({eligiblePages:retained,excludedPages:excluded,removedLoaders:removed}));
 return {eligiblePages:retained,excludedPages:excluded,removedLoaders:removed};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))applyAdSensePageScope(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));

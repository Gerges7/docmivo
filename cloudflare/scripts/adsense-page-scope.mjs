import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_GUIDES=new Set([
  'guides/word-to-pdf-guide.html','guides/searchable-ocr-guide.html',
  'guides/pdfa-guide.html','guides/repair-pdf-guide.html','guides/office-fonts-pdf-guide.html'
]);
const GOOGLE_SELLER=/^google\.com,\s*pub-(\d{10,24}),\s*DIRECT,\s*f08c47fec0942fa0\s*$/im;
const ADSENSE_META_RE=/<meta\b[^>]*\bname=["']google-adsense-account["'][^>]*>/gi;
const ADSENSE_SCRIPT_RE=/<script\b(?=[^>]*\bsrc=["'][^"']*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"']*["'])[^>]*>\s*<\/script>/gi;
const ADSENSE_INLINE_RE=/<script\b[^>]*>[\s\S]*?adsbygoogle[\s\S]*?<\/script>/gi;
const LEGACY_AD_LOADER_RE=/<script\b(?=[^>]*\bsrc=["'][^"']*\/assets\/js\/ads(?:\.v\d+)?\.js(?:\?[^"']*)?["'])[^>]*>\s*<\/script>/gi;
const THIRD_PARTY_AD_SCRIPT_RE=/<script\b(?=[^>]*\bsrc=["'](?:https?:)?\/\/[^"']*(?:highperformanceformat\.com|topcreativeformat\.com|resources\.infolinks\.com|contextual\.media\.net|monetag\.com)[^"']*["'])[^>]*>\s*<\/script>/gi;
const CONSENT_SCRIPT='<script defer src="/assets/js/consent-manager.js?v=1"></script>';
const MONETIZATION_SCRIPT='<script defer src="/assets/js/monetization.js?v=1"></script>';
const CONSENT_BOOT='<script>(function(){try{var c=JSON.parse(localStorage.getItem("docmivo:consent:v1")||"null");var p=navigator.globalPrivacyControl===true||navigator.doNotTrack==="1"||window.doNotTrack==="1";if(!p&&c&&c.ads===true)document.documentElement.classList.add("dm-ads-consented")}catch(e){}})();</script>';

function assert(ok,message){if(!ok)throw new Error('Monetization build failed: '+message);}
function walkHtml(root){
  const out=[];
  function walk(dir){
    if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name),rel=path.relative(root,full).split(path.sep).join('/');
      if(entry.isDirectory())walk(full);
      else if(entry.isFile()&&/\.html?$/i.test(entry.name))out.push({full,rel});
    }
  }
  walk(root);return out;
}
function hasNoindex(html){
  const tags=html.match(/<meta\b[^>]*>/gi)||[];
  return tags.some(tag=>/\bname=["']robots["']/i.test(tag)&&/\bcontent=["'][^"']*noindex/i.test(tag));
}
function eligible(rel,html){
  if(hasNoindex(html)||rel.startsWith('tools/')||rel.startsWith('admin/')||rel.startsWith('v17-preview/'))return false;
  if(rel==='index.html'||rel==='guides/index.html')return true;
  if(rel.startsWith('guides/')&&rel.endsWith('.html')&&!EXCLUDED_GUIDES.has(rel))return true;
  return false;
}
function addHomeSlot(html){
  if(html.includes('data-ad-placement="home"'))return html;
  const marker='</section>\n<section class="section" id="tools">';
  assert(html.includes(marker),'Homepage hero-to-tools insertion point is missing');
  return html.replace(marker,'</section>\n<div class="dm-ad-slot" data-ad-placement="home" aria-label="مساحة إعلانية"></div>\n<section class="section" id="tools">');
}
function addGuidesHubSlot(html){
  if(html.includes('data-ad-placement="guidesHub"'))return html;
  const marker='</div><h2 class="dm-guides-list-title">';
  assert(html.includes(marker),'Guides hub insertion point is missing');
  return html.replace(marker,'</div><div class="dm-ad-slot" data-ad-placement="guidesHub" aria-label="مساحة إعلانية"></div><h2 class="dm-guides-list-title">');
}
function addArticleSlot(html,rel){
  if(html.includes('data-ad-placement="guideArticle"'))return html;
  const start=html.indexOf('<article class="prose">');
  const marker='<div class="dm-ad-slot" data-ad-placement="guideArticle" aria-label="مساحة إعلانية"></div>';
  if(start<0){const mainEnd=html.indexOf('</main>');if(mainEnd>=0)return html.slice(0,mainEnd)+marker+html.slice(mainEnd);const bodyEnd=html.lastIndexOf('</body>');if(bodyEnd>=0)return html.slice(0,bodyEnd)+marker+html.slice(bodyEnd);return html+marker;}
  const headings=[...html.slice(start).matchAll(/<h2\b[^>]*>/gi)];
  const chosen=headings[1]||headings[0];
  if(!chosen){const articleEnd=html.indexOf('</article>',start);return articleEnd>=0?html.slice(0,articleEnd)+marker+html.slice(articleEnd):html;}
  const heading=start+chosen.index;
  const paragraphEnd=html.indexOf('</p>',heading);
  const insertAt=paragraphEnd>=0?paragraphEnd+4:heading+chosen[0].length;
  return html.slice(0,insertAt)+marker+html.slice(insertAt);
}
function gateAnalytics(html){
  const src=html.match(/<script\b[^>]*\bsrc=["']https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=([^"'&]+)[^"']*["'][^>]*>\s*<\/script>/i);
  const config=html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/i);
  const id=(config&&config[1])||(src&&src[1])||'';
  html=html.replace(/<script\b[^>]*\bsrc=["']https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[^"']+["'][^>]*>\s*<\/script>/gi,'');
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,function(block){
    return /gtag\s*\(\s*['"](?:config|js|consent)['"]/.test(block)?'':block;
  });
  if(id){
    const init='<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("consent","default",{analytics_storage:"denied",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",wait_for_update:500});gtag("js",new Date());gtag("config","'+id+'",{send_page_view:false});</script>';
    const loader='<script async src="https://www.googletagmanager.com/gtag/js?id='+id+'"></script>';
    assert(html.includes('</head>'),'HTML head close missing while applying consent defaults');
    html=html.replace('</head>',init+loader+'</head>');
  }
  return html;
}
export function scopeAdSensePage(html,rel,publisherId){
  html=html.replace(ADSENSE_SCRIPT_RE,'').replace(ADSENSE_INLINE_RE,'').replace(LEGACY_AD_LOADER_RE,'').replace(THIRD_PARTY_AD_SCRIPT_RE,'').replace(ADSENSE_META_RE,'').replaceAll(CONSENT_BOOT,'');
  html=gateAnalytics(html);
  const isHome=rel==='index.html';
  if(isHome){
    html=html.replace('</head>','<meta name="google-adsense-account" content="ca-pub-'+publisherId+'">'+CONSENT_BOOT+'</head>');
  }else if(!rel.startsWith('admin/')){
    html=html.replace('</head>',CONSENT_BOOT+'</head>');
  }
  const canMonetize=eligible(rel,html);
  if(canMonetize){
    if(rel==='index.html')html=addHomeSlot(html);
    else if(rel==='guides/index.html')html=addGuidesHubSlot(html);
    else html=addArticleSlot(html,rel);
  }
  html=html.replace(/<script\b[^>]*src=["'][^"']*\/assets\/js\/consent-manager\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,'');
  html=html.replace(/<script\b[^>]*src=["'][^"']*\/assets\/js\/monetization\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,'');
  if(!rel.startsWith('admin/')){
    assert(html.includes('</body>'),'HTML body close missing: '+rel);
    html=html.replace('</body>',CONSENT_SCRIPT+(canMonetize?MONETIZATION_SCRIPT:'')+'</body>');
  }
  return html;
}
export function applyAdSensePageScope(dist){
  const adsTxtPath=path.join(dist,'ads.txt');
  assert(fs.existsSync(adsTxtPath),'ads.txt is missing from the production build');
  const adsTxt=fs.readFileSync(adsTxtPath,'utf8');
  const match=adsTxt.match(GOOGLE_SELLER);
  assert(match,'ads.txt has no valid direct Google seller record; do not invent a publisher ID');
  const publisherId=match[1];
  const files=walkHtml(dist);
  let eligibleCount=0,excludedCount=0,consentCount=0;
  for(const file of files){
    const original=fs.readFileSync(file.full,'utf8');
    const canMonetize=eligible(file.rel,original);
    const updated=scopeAdSensePage(original,file.rel,publisherId);
    if(canMonetize)eligibleCount++;else excludedCount++;
    if(!file.rel.startsWith('admin/'))consentCount++;
    fs.writeFileSync(file.full,updated);
  }
  const home=fs.readFileSync(path.join(dist,'index.html'),'utf8');
  assert((home.match(/name="google-adsense-account"/g)||[]).length===1,'Homepage must retain exactly one AdSense ownership meta tag');
  assert(!/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/.test(files.map(f=>fs.readFileSync(f.full,'utf8')).join('\n')),'Production HTML must not load AdSense before approval');
  for(const file of walkHtml(dist)){
    const html=fs.readFileSync(file.full,'utf8');
    assert(!ADSENSE_SCRIPT_RE.test(html),'Legacy AdSense loader remains: '+file.rel);
    assert(!LEGACY_AD_LOADER_RE.test(html),'Legacy ads.v14 loader remains: '+file.rel);
    assert(!THIRD_PARTY_AD_SCRIPT_RE.test(html),'Direct third-party ad script bypasses the manager: '+file.rel);
    if(file.rel.startsWith('tools/'))assert(!html.includes('monetization.js'),'Interactive tool must not load ad manager: '+file.rel);
    if(eligible(file.rel,html))assert(html.includes('data-ad-placement='),'Eligible page has no reserved ad placement: '+file.rel);
  }
  const result={publisherId,eligible:eligibleCount,excluded:excludedCount,consentPages:consentCount};
  console.log('DocMivo monetization scope:',JSON.stringify(result),'(all ad providers remain OFF until approved and configured).');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))applyAdSensePageScope(path.resolve('dist'));

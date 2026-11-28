const CONFIG_KEY = 'docmivo:monetization:v1';
const PROVIDERS = ['adsterra','adsense','infolinks','monetag','mediaNet'];
const PLACEMENTS = {
  home: {path:'/', label:'Homepage banner'},
  guidesHub: {path:'/guides', label:'Guides hub banner'},
  guideArticle: {path:'/guides/*', label:'Guide article banner'}
};
const ADSTERRA_HOSTS = ['highperformanceformat.com','topcreativeformat.com'];
const ALLOWED_BANNER_SIZES = ['728x90','320x50','468x60','300x250','160x300','160x600','350x200'];
const TCF_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','UK','CH']);
function requiresTcfForCountry(country){const code=typeof country==='string'?country.toUpperCase():'';return !code||TCF_COUNTRIES.has(code);}

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff'
  }});
}
function error(message,status=400){return json({ok:false,error:message},status);}
function defaultConfig(){
  return {
    version:1, enabled:false, activeProvider:'adsterra', requireConsent:true,
    updatedAt:null,
    providers:{
      adsterra:{enabled:false,approved:false,domainId:''},
      adsense:{enabled:false,approved:false,clientId:'ca-pub-1551519098591089'},
      infolinks:{enabled:false,approved:false,format:'inframe',pid:'',wsid:'0'},
      monetag:{enabled:false,approved:false,format:'banner',zoneTag:''},
      mediaNet:{enabled:false,approved:false,cid:''}
    },
    placements:{
      home:{enabled:false,path:'/',desktop:true,mobile:true,desktopCode:'',mobileCode:'',placementId:'',adSenseSlotId:'',mediaNetTagId:''},
      guidesHub:{enabled:false,path:'/guides',desktop:true,mobile:true,desktopCode:'',mobileCode:'',placementId:'',adSenseSlotId:'',mediaNetTagId:''},
      guideArticle:{enabled:false,path:'/guides/*',desktop:true,mobile:true,desktopCode:'',mobileCode:'',placementId:'',adSenseSlotId:'',mediaNetTagId:''}
    }
  };
}
function cleanText(value,max=500){
  return typeof value==='string'?value.trim().slice(0,max):'';
}
function normalizeConfig(input){
  const out=defaultConfig();
  if(!input||typeof input!=='object'||Array.isArray(input))return out;
  out.enabled=input.enabled===true;
  out.activeProvider=PROVIDERS.includes(input.activeProvider)?input.activeProvider:'adsterra';
  out.requireConsent=true;
  out.updatedAt=cleanText(input.updatedAt,40)||null;
  for(const provider of PROVIDERS){
    const src=input.providers&&input.providers[provider]&&typeof input.providers[provider]==='object'?input.providers[provider]:{};
    out.providers[provider].enabled=src.enabled===true;
    out.providers[provider].approved=src.approved===true;
    if(provider==='adsterra')out.providers.adsterra.domainId=cleanText(src.domainId,40).replace(/[^0-9]/g,'');
    if(provider==='adsense')out.providers.adsense.clientId=/^ca-pub-\d{10,24}$/.test(cleanText(src.clientId,40))?cleanText(src.clientId,40):'';
    if(provider==='infolinks'){
      out.providers.infolinks.format='inframe';
      out.providers.infolinks.pid=cleanText(src.pid,30).replace(/[^0-9]/g,'');
      out.providers.infolinks.wsid=cleanText(src.wsid,30).replace(/[^0-9]/g,'');
    }
    if(provider==='monetag'){
      out.providers.monetag.format=cleanText(src.format,30);
      out.providers.monetag.zoneTag=cleanText(src.zoneTag,2000);
    }
    if(provider==='mediaNet')out.providers.mediaNet.cid=cleanText(src.cid,100).replace(/[^A-Za-z0-9_-]/g,'');
  }
  for(const key of Object.keys(PLACEMENTS)){
    const src=input.placements&&input.placements[key]&&typeof input.placements[key]==='object'?input.placements[key]:{};
    const dst=out.placements[key];
    dst.enabled=src.enabled===true;
    dst.desktop=src.desktop!==false;
    dst.mobile=src.mobile!==false;
    dst.desktopCode=cleanText(src.desktopCode,12000);
    dst.mobileCode=cleanText(src.mobileCode,12000);
    dst.placementId=cleanText(src.placementId,40).replace(/[^0-9]/g,'');
    dst.adSenseSlotId=cleanText(src.adSenseSlotId,40).replace(/[^0-9]/g,'');
    dst.mediaNetTagId=cleanText(src.mediaNetTagId,100).replace(/[^A-Za-z0-9_-]/g,'');
  }
  const seenPlacementIds=new Set();
  for(const key of Object.keys(PLACEMENTS)){
    const id=out.placements[key].placementId;
    if(id&&seenPlacementIds.has(id))out.placements[key].placementId='';
    else if(id)seenPlacementIds.add(id);
  }
  return out;
}
function parseAdsterraBannerCode(code){
  if(typeof code!=='string'||!code.trim()||code.length>12000)return null;
  const srcMatch=code.match(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/i);
  const keyMatch=code.match(/(?:['"]key['"])\s*:\s*['"]([A-Za-z0-9_-]{8,100})['"]/i);
  const formatMatch=code.match(/(?:['"]format['"])\s*:\s*['"]([A-Za-z0-9_-]{1,30})['"]/i);
  const widthMatch=code.match(/(?:['"]width['"])\s*:\s*(\d{2,4})/i);
  const heightMatch=code.match(/(?:['"]height['"])\s*:\s*(\d{2,4})/i);
  if(!srcMatch||!keyMatch||!formatMatch||!widthMatch||!heightMatch)return null;
  let src=srcMatch[2].trim();
  if(src.startsWith('//'))src='https:'+src;
  let url;
  try{url=new URL(src);}catch{return null;}
  const host=url.hostname.toLowerCase();
  const trusted=ADSTERRA_HOSTS.some(root=>host===root||host.endsWith('.'+root));
  if(!trusted||url.protocol!=='https:'||url.username||url.password)return null;
  if(!/\/invoke\.js$/i.test(url.pathname))return null;
  const width=Number(widthMatch[1]),height=Number(heightMatch[1]);
  if(!ALLOWED_BANNER_SIZES.includes(width+'x'+height)||formatMatch[1].toLowerCase()!=='iframe')return null;
  return {key:keyMatch[1],format:'iframe',width,height,scriptUrl:url.toString(),params:{}};
}
function isEligibleMonetizationPath(path){
  if(path==='/')return true;
  if(path==='/guides')return true;
  if(!path.startsWith('/guides/'))return false;
  const excluded=['/guides/word-to-pdf-guide','/guides/searchable-ocr-guide','/guides/pdfa-guide','/guides/repair-pdf-guide','/guides/office-fonts-pdf-guide'];
  return !excluded.some(x=>path===x||path===x+'/');
}
function pathMatches(pattern,path){
  if(pattern.endsWith('*'))return path.startsWith(pattern.slice(0,-1));
  return pattern===path||pattern===path+'/';
}
function getActivePlacements(config,path){
  const cfg=normalizeConfig(config);
  if(!cfg.enabled||!isEligibleMonetizationPath(path))return [];
  const provider=cfg.activeProvider,settings=cfg.providers[provider];
  if(!settings||!settings.enabled||!settings.approved)return [];
  if(provider==='monetag')return [];
  const output=[];
  for(const key of Object.keys(PLACEMENTS)){
    const p=cfg.placements[key];
    if(!p.enabled||!pathMatches(p.path,path))continue;
    const base={id:key,label:PLACEMENTS[key].label,provider,desktop:p.desktop,mobile:(provider==='adsterra'||provider==='adsense')?p.mobile:false,placementId:p.placementId};
    if(provider==='adsterra'){
      let desktopZone=p.desktop?parseAdsterraBannerCode(p.desktopCode):null;
      let mobileZone=p.mobile?parseAdsterraBannerCode(p.mobileCode):null;
      const usedElsewhere=(zone)=>zone&&Object.keys(PLACEMENTS).some(otherKey=>otherKey!==key&&
        [cfg.placements[otherKey].desktopCode,cfg.placements[otherKey].mobileCode].some(code=>parseAdsterraBannerCode(code)?.key===zone.key));
      if(usedElsewhere(desktopZone))desktopZone=null;
      if(usedElsewhere(mobileZone))mobileZone=null;
      if(desktopZone||mobileZone)output.push({...base,desktopZone,mobileZone});
    }else if(provider==='adsense'){
      const clientId=settings.clientId,slotId=p.adSenseSlotId;
      if(/^ca-pub-\d{10,24}$/.test(clientId)&&/^\d{4,30}$/.test(slotId))output.push({...base,clientId,slotId});
    }else if(provider==='infolinks'){
      if(settings.format==='inframe'&&/^\d{4,30}$/.test(settings.pid)&&/^\d{1,10}$/.test(settings.wsid))output.push({...base,format:'inframe',pid:settings.pid,wsid:settings.wsid});
    }else if(provider==='mediaNet'){
      if(/^[A-Za-z0-9_-]{4,100}$/.test(settings.cid)&&/^[A-Za-z0-9_-]{1,100}$/.test(p.mediaNetTagId))output.push({...base,cid:settings.cid,tagId:p.mediaNetTagId});
    }
  }
  return output.slice(0,1);
}
function hasActivePlacementForPath(config,path){return getActivePlacements(config,path).length>0;}
function publicConfigForPath(config,path){
  const cfg=normalizeConfig(config);
  return {ok:true,enabled:hasActivePlacementForPath(cfg,path),requireConsent:true,activeProvider:cfg.activeProvider,
    placements:getActivePlacements(cfg,path)};
}
async function readMonetizationConfig(env){
  try{
    if(env&&env.ADS_CONFIG_KV&&typeof env.ADS_CONFIG_KV.get==='function'){
      const value=await env.ADS_CONFIG_KV.get(CONFIG_KEY,{type:'json'});
      if(value)return normalizeConfig(value);
    }
  }catch{}
  try{
    if(env&&typeof env.ADS_CONFIG_JSON==='string'&&env.ADS_CONFIG_JSON.trim())
      return normalizeConfig(JSON.parse(env.ADS_CONFIG_JSON));
  }catch{}
  return defaultConfig();
}
function sameOrigin(req){
  const origin=req.headers.get('Origin');
  if(origin&&origin!==new URL(req.url).origin)return false;
  return req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function equalSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function isAdmin(req,env){
  const expected=cleanText(env&&env.ADS_ADMIN_TOKEN,500);
  const header=req.headers.get('Authorization')||'';
  const supplied=header.startsWith('Bearer ')?header.slice(7):'';
  return equalSecret(expected,supplied);
}
function validDate(value){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
}
function rowsFromPayload(payload){
  if(Array.isArray(payload))return payload;
  for(const key of ['items','data','stats','results','rows'])if(Array.isArray(payload&&payload[key]))return payload[key];
  return [];
}
function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function normalizeReportRow(row,config){
  const p=normalizeConfig(config).placements;
  const placementId=String(row.placement_id??row.placementId??row.placement??row.zone_id??'');
  const mapped=Object.keys(p).find(k=>p[k].placementId&&p[k].placementId===placementId);
  const impressions=numberOrNull(row.impressions??row.views??row.impression);
  const clicks=numberOrNull(row.clicks??row.click);
  const revenue=numberOrNull(row.revenue??row.earnings??row.amount);
  const cpm=numberOrNull(row.cpm??row.ecpm);
  return {date:cleanText(String(row.date??row.day??''),30),placementId:placementId||null,page:mapped?PLACEMENTS[mapped].path:null,
    impressions,clicks,ctr:numberOrNull(row.ctr),cpm,revenue,
    rpm:revenue!==null&&impressions!==null&&impressions>0?revenue/impressions*1000:null};
}
async function adsterraReports(request,env,config){
  if(!isAdmin(request,env))return error('غير مصرح بالوصول.',401);
  const token=cleanText(env&&env.ADSTERRA_API_TOKEN,1000);
  const domainId=config.providers.adsterra.domainId;
  if(!config.providers.adsterra.approved)return json({ok:true,configured:false,source:'Adsterra Publisher API',rows:[],message:'أكد اعتماد الموقع لدى Adsterra أولًا.'});
  if(!token||!domainId)return json({ok:true,configured:false,source:'Adsterra Publisher API',rows:[],message:'أضف API token كـ Secret وDomain ID بعد الموافقة.'});
  const placementEntries=Object.keys(config.placements).filter(k=>config.placements[k].placementId);
  if(!placementEntries.length)return json({ok:true,configured:false,source:'Adsterra Publisher API',rows:[],message:'أضف Placement ID مستقلًا لكل موضع تريد قياسه.'});
  const url=new URL(request.url);
  const end=url.searchParams.get('end')||new Date().toISOString().slice(0,10);
  const start=url.searchParams.get('start')||new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  if(!validDate(start)||!validDate(end)||start>end)return error('نطاق التاريخ غير صالح.');
  const span=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000;
  if(span>92)return error('الحد الأقصى لفترة التقرير 93 يومًا.');
  const results=await Promise.all(placementEntries.map(async key=>{
    const placement=config.placements[key];
    const params=new URLSearchParams({domain:domainId,placement:placement.placementId,start_date:start,finish_date:end,group_by:'placement'});
    let response;
    try{
      response=await fetch('https://api3.adsterratools.com/publisher/stats.json?'+params.toString(),{
        method:'GET',headers:{Accept:'application/json','X-API-Key':token},redirect:'manual'
      });
    }catch{return {key,ok:false};}
    if(response.status!==200)return {key,ok:false,status:response.status};
    let payload;
    try{payload=await response.json();}catch{return {key,ok:false,status:502};}
    const sourceRows=rowsFromPayload(payload);
    return {key,ok:true,rows:sourceRows.map(row=>normalizeReportRow({...row,placement_id:row.placement_id??row.placementId??placement.placementId},config))};
  }));
  const failed=results.filter(x=>!x.ok);
  const rows=results.filter(x=>x.ok).flatMap(x=>x.rows);
  const sum=(key)=>rows.length&&rows.every(x=>x[key]!==null)?rows.reduce((n,x)=>n+x[key],0):null;
  const impressions=sum('impressions'),clicks=sum('clicks'),revenue=sum('revenue');
  return json({ok:true,configured:results.some(x=>x.ok),source:'Adsterra Publisher API',period:{start,end},rows,
    message:failed.length&&!rows.length?'تعذر جلب تقارير كل المواضع؛ راجع Placement IDs وحالة API.':null,
    warnings:failed.length?failed.map(x=>({placement:x.key,status:x.status||'network error'})):[],
    totals:{impressions,clicks,revenue,rpm:revenue!==null&&impressions>0?revenue/impressions*1000:null,
      ctr:impressions!==null&&impressions>0&&clicks!==null?clicks/impressions*100:null}});
}
export async function handleMonetizationRequest(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/monetization/config'){
    if(request.method!=='GET')return error('Method not allowed.',405);
    const config=await readMonetizationConfig(env);
    const page=new URL(request.url).searchParams.get('path')||'/';
    return json(publicConfigForPath(config,page));
  }
  if(path==='/api/monetization/health'){
    if(request.method!=='GET')return error('Method not allowed.',405);
    const config=await readMonetizationConfig(env);
    return json({ok:true,enabled:config.enabled,activeProvider:config.activeProvider,
      storageConfigured:!!(env&&env.ADS_CONFIG_KV),adminConfigured:!!(env&&env.ADS_ADMIN_TOKEN),
      adsterraApiConfigured:!!(env&&env.ADSTERRA_API_TOKEN)});
  }
  if(path==='/api/monetization/admin/config'||path==='/api/monetization/admin/status'){
    if(!isAdmin(request,env))return error('غير مصرح بالوصول.',401);
    if(path.endsWith('/status')){
      const config=await readMonetizationConfig(env);
      return json({ok:true,storageConfigured:!!(env&&env.ADS_CONFIG_KV),
        adminConfigured:!!(env&&env.ADS_ADMIN_TOKEN),adsterraApiConfigured:!!(env&&env.ADSTERRA_API_TOKEN),
        enabled:config.enabled,activeProvider:config.activeProvider,updatedAt:config.updatedAt});
    }
    if(request.method==='GET'){
      const config=await readMonetizationConfig(env);
      return json({ok:true,storageConfigured:!!(env&&env.ADS_CONFIG_KV),config});
    }
    if(request.method!=='POST')return error('Method not allowed.',405);
    if(!sameOrigin(request))return error('Origin غير مسموح.',403);
    if(!env||!env.ADS_CONFIG_KV||typeof env.ADS_CONFIG_KV.put!=='function')
      return error('إعداد التخزين غير مكتمل: اربط KV Namespace باسم ADS_CONFIG_KV أولًا.',503);
    let input;
    try{input=await request.json();}catch{return error('JSON غير صالح.');}
    if(JSON.stringify(input).length>50000)return error('الإعدادات أكبر من الحد المسموح.',413);
    const config=normalizeConfig(input);
    config.updatedAt=new Date().toISOString();
    try{await env.ADS_CONFIG_KV.put(CONFIG_KEY,JSON.stringify(config));}
    catch{return error('تعذر حفظ إعدادات الإعلانات في KV.',503);}
    return json({ok:true,saved:true,config});
  }
  if(path==='/api/monetization/reports'){
    if(request.method!=='GET')return error('Method not allowed.',405);
    const config=await readMonetizationConfig(env);
    return adsterraReports(request,env,config);
  }
  return error('Not found.',404);
}
export {defaultConfig,normalizeConfig,parseAdsterraBannerCode,isEligibleMonetizationPath,getActivePlacements,
  hasActivePlacementForPath,publicConfigForPath,readMonetizationConfig,rowsFromPayload,normalizeReportRow,requiresTcfForCountry};

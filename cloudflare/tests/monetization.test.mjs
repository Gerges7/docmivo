import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultConfig,normalizeConfig,parseAdsterraBannerCode,isEligibleMonetizationPath,
  getActivePlacements,publicConfigForPath,normalizeReportRow,handleMonetizationRequest,requiresTcfForCountry
} from '../src/monetization.mjs';

const banner=(width,height,host='www.highperformanceformat.com')=>
  "<script type='text/javascript'>atOptions = {'key':'Abcdefghijklmnopqrstuvwxyz123456','format':'iframe','height':"+height+",'width':"+width+",'params':{}};</script>"+
  "<script type='text/javascript' src='https://"+host+"/Abcdefghijklmnopqrstuvwxyz123456/invoke.js'></script>";

function activeConfig(){
  const cfg=defaultConfig();
  cfg.enabled=true;
  cfg.activeProvider='adsterra';
  cfg.providers.adsterra.enabled=true;
  cfg.providers.adsterra.approved=true;
  cfg.providers.adsterra.domainId='123456';
  cfg.placements.guideArticle.enabled=true;
  cfg.placements.guideArticle.desktopCode=banner(728,90);
  cfg.placements.guideArticle.mobileCode=banner(320,50);
  cfg.placements.guideArticle.placementId='998877';
  return cfg;
}

test('monetization is globally disabled by default and exposes no ad slots',()=>{
  const cfg=defaultConfig();
  assert.equal(cfg.enabled,false);
  assert.equal(cfg.requireConsent,true);
  assert.deepEqual(getActivePlacements(cfg,'/'),[]);
  assert.deepEqual(getActivePlacements(cfg,'/guides/merge-pdf-guide'),[]);
});

test('Adsterra banner parser accepts a valid generated banner snippet only',()=>{
  const zone=parseAdsterraBannerCode(banner(728,90));
  assert.ok(zone);
  assert.equal(zone.width,728);
  assert.equal(zone.height,90);
  assert.equal(zone.format,'iframe');
  assert.equal(zone.scriptUrl,'https://www.highperformanceformat.com/Abcdefghijklmnopqrstuvwxyz123456/invoke.js');
  assert.equal(parseAdsterraBannerCode(banner(728,90,'evil.example')),null);
  assert.equal(parseAdsterraBannerCode(banner(728,90).replace("'format':'iframe'","'format':'popunder'")),null);
  assert.equal(parseAdsterraBannerCode(banner(900,90)),null);
  assert.equal(parseAdsterraBannerCode("<script src='javascript:alert(1)'></script>"),null);
});

test('only approved Adsterra banners render on editorial routes and never on tools or legal pages',()=>{
  const cfg=activeConfig();
  const article=getActivePlacements(cfg,'/guides/merge-pdf-guide');
  assert.equal(article.length,1);
  assert.equal(article[0].id,'guideArticle');
  assert.equal(article[0].desktopZone.width,728);
  assert.equal(article[0].mobileZone.width,320);
  for(const path of ['/tools/merge-pdf','/tools/qr-code','/privacy','/cookies','/terms','/contact','/admin/monetization'])
    assert.deepEqual(getActivePlacements(cfg,path),[],path);
  assert.equal(isEligibleMonetizationPath('/'),true);
  assert.equal(isEligibleMonetizationPath('/guides'),true);
  assert.equal(isEligibleMonetizationPath('/guides/merge-pdf-guide'),true);
  assert.equal(isEligibleMonetizationPath('/guides/word-to-pdf-guide'),false);
});

test('provider approval and global feature flag are mandatory',()=>{
  const cfg=activeConfig();
  cfg.providers.adsterra.approved=false;
  assert.deepEqual(getActivePlacements(cfg,'/guides/merge-pdf-guide'),[]);
  cfg.providers.adsterra.approved=true;
  cfg.enabled=false;
  assert.deepEqual(getActivePlacements(cfg,'/guides/merge-pdf-guide'),[]);
});

test('Monetag formats are not activated because the requested policy excludes push, pop and vignette formats',()=>{
  const cfg=defaultConfig();
  cfg.enabled=true;cfg.activeProvider='monetag';
  cfg.providers.monetag.enabled=true;cfg.providers.monetag.approved=true;
  cfg.placements.guideArticle.enabled=true;
  cfg.providers.monetag.zoneTag='not-used';
  assert.deepEqual(getActivePlacements(cfg,'/guides/merge-pdf-guide'),[]);
});

test('public config exposes only parsed ad-unit data, never raw snippets or credentials',()=>{
  const cfg=activeConfig();
  const out=publicConfigForPath(cfg,'/guides/merge-pdf-guide');
  assert.equal(out.enabled,true);
  assert.equal(out.requireConsent,true);
  assert.equal(out.placements.length,1);
  assert.ok(out.placements[0].desktopZone.scriptUrl);
  assert.equal('desktopCode' in out.placements[0],false);
  assert.equal('apiToken' in out,false);
});

test('Adsterra report rows use actual network values and calculate RPM only from reported revenue',()=>{
  const cfg=activeConfig();
  const row=normalizeReportRow({date:'2026-11-28',placement_id:'998877',impressions:'2000',clicks:'24',revenue:'1.50',cpm:'0.75'},cfg);
  assert.equal(row.page,'/guides/*');
  assert.equal(row.impressions,2000);
  assert.equal(row.clicks,24);
  assert.equal(row.revenue,1.5);
  assert.equal(row.rpm,0.75);
  const noRevenue=normalizeReportRow({impressions:100,clicks:2},cfg);
  assert.equal(noRevenue.revenue,null);
  assert.equal(noRevenue.rpm,null);
});

test('admin configuration API requires a token and KV persistence before enabling settings',async()=>{
  const url='https://getdocmivo.com/api/monetization/admin/config';
  const denied=await handleMonetizationRequest(new Request(url),{});
  assert.equal(denied.status,401);
  const env={ADS_ADMIN_TOKEN:'test-secret'};
  const get=await handleMonetizationRequest(new Request(url,{headers:{Authorization:'Bearer test-secret'}}),env);
  assert.equal(get.status,200);
  assert.equal((await get.json()).storageConfigured,false);
  const post=await handleMonetizationRequest(new Request(url,{
    method:'POST',headers:{Authorization:'Bearer test-secret',Origin:'https://getdocmivo.com','Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
    body:JSON.stringify(defaultConfig())
  }),env);
  assert.equal(post.status,503);
});

test('reports endpoint rejects unauthenticated requests before any network call',async()=>{
  const response=await handleMonetizationRequest(new Request('https://getdocmivo.com/api/monetization/reports'),{});
  assert.equal(response.status,401);
});


test('Adsterra reports are fetched server-side with the secret header and per-placement filters',async()=>{
  const cfg=activeConfig();
  const env={ADS_ADMIN_TOKEN:'admin-secret',ADSTERRA_API_TOKEN:'publisher-api-secret',ADS_CONFIG_KV:{get:async()=>cfg}};
  const originalFetch=globalThis.fetch;let seen=null;
  globalThis.fetch=async(url,options)=>{
    seen={url:String(url),headers:options.headers};
    return new Response(JSON.stringify({items:[{date:'2026-11-28',impressions:'1200',clicks:'18',revenue:'0.90',cpm:'0.75'}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try{
    const request=new Request('https://getdocmivo.com/api/monetization/reports?start=2026-11-28&end=2026-11-28',{headers:{Authorization:'Bearer admin-secret'}});
    const response=await handleMonetizationRequest(request,env);
    assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.configured,true);assert.equal(data.rows.length,1);assert.equal(data.rows[0].page,'/guides/*');
    assert.equal(data.totals.impressions,1200);assert.equal(data.totals.clicks,18);assert.equal(data.totals.revenue,0.9);assert.equal(data.totals.rpm,0.75);
    const parsed=new URL(seen.url);assert.equal(parsed.searchParams.get('domain'),'123456');assert.equal(parsed.searchParams.get('placement'),'998877');assert.equal(parsed.searchParams.get('group_by'),'placement');
    assert.equal(seen.headers['X-API-Key'],'publisher-api-secret');assert.doesNotMatch(JSON.stringify(data),/publisher-api-secret|admin-secret/);
  }finally{globalThis.fetch=originalFetch;}
});

test('admin config saves to KV only after same-origin authorization',async()=>{
  let stored=null;
  const env={ADS_ADMIN_TOKEN:'admin-secret',ADS_CONFIG_KV:{get:async()=>stored,put:async(key,value)=>{stored=JSON.parse(value);}}};
  const request=new Request('https://getdocmivo.com/api/monetization/admin/config',{
    method:'POST',headers:{Authorization:'Bearer admin-secret',Origin:'https://getdocmivo.com','Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(activeConfig())
  });
  const response=await handleMonetizationRequest(request,env);
  assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
  assert.equal(stored.enabled,true);assert.equal(stored.providers.adsterra.approved,true);assert.equal(stored.placements.guideArticle.placementId,'998877');
});

test('duplicate Adsterra zone keys are rejected across page placements and duplicate report IDs are de-duplicated',()=>{
  const cfg=activeConfig();cfg.placements.home.enabled=true;cfg.placements.home.desktopCode=banner(728,90);cfg.placements.home.placementId='998877';
  const normalized=normalizeConfig(cfg);
  assert.equal(normalized.placements.home.placementId,'998877');assert.equal(normalized.placements.guideArticle.placementId,'');
  assert.deepEqual(getActivePlacements(normalized,'/'),[]);
  assert.deepEqual(getActivePlacements(normalized,'/guides/merge-pdf-guide'),[]);
});

test('Google TCF is mandatory in EEA, UK and Switzerland but not assumed for Egypt',()=>{
  for(const country of ['DE','FR','IE','NO','GB','UK','CH'])assert.equal(requiresTcfForCountry(country),true,country);
  assert.equal(requiresTcfForCountry('EG'),false);
  assert.equal(requiresTcfForCountry('US'),false);
  assert.equal(requiresTcfForCountry(''),true);
  assert.equal(requiresTcfForCountry(null),true);
});


test('Infolinks adapter is restricted to the non-overlay InFrame format and desktop editorial placements',()=>{
  const cfg=defaultConfig();cfg.enabled=true;cfg.activeProvider='infolinks';
  cfg.providers.infolinks.enabled=true;cfg.providers.infolinks.approved=true;
  cfg.providers.infolinks.pid='1234567';cfg.providers.infolinks.wsid='12';
  cfg.placements.guideArticle.enabled=true;
  const placement=getActivePlacements(cfg,'/guides/merge-pdf-guide')[0];
  assert.equal(placement.format,'inframe');assert.equal(placement.mobile,false);assert.equal(placement.desktop,true);
  assert.deepEqual(getActivePlacements(cfg,'/tools/merge-pdf'),[]);
});


test('Media.net adapter is restricted to desktop banners and requires a real tag ID',()=>{
  const cfg=defaultConfig();cfg.enabled=true;cfg.activeProvider='mediaNet';
  cfg.providers.mediaNet.enabled=true;cfg.providers.mediaNet.approved=true;cfg.providers.mediaNet.cid='customer_123';
  cfg.placements.guideArticle.enabled=true;cfg.placements.guideArticle.mediaNetTagId='tag_123';
  const placement=getActivePlacements(cfg,'/guides/merge-pdf-guide')[0];
  assert.equal(placement.desktop,true);assert.equal(placement.mobile,false);
  assert.equal(placement.tagId,'tag_123');assert.equal(placement.cid,'customer_123');
});

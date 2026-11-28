(function(){
  'use strict';
  if(!document.body||document.body.getAttribute('data-ads-enabled')!=='true')return;
  var path=location.pathname;
  function consentGranted(){
    try{var prefs=window.DocMivoConsent&&window.DocMivoConsent.get();return !!(prefs&&prefs.ads===true);}
    catch(e){return false;}
  }
  function labelFor(slot){
    var label=document.createElement('span');
    label.className='dm-ad-label';
    label.textContent=document.documentElement.lang==='ar'?'إعلان':'Advertisement';
    slot.appendChild(label);
  }
  var observers=new Map();
  function clearSlot(slot,state){
    var observer=observers.get(slot);if(observer){observer.disconnect();observers.delete(slot);}
    slot.replaceChildren();slot.hidden=false;slot.style.removeProperty('display');slot.dataset.adState=state||'denied';slot.style.minHeight='0';slot.removeAttribute('data-ad-visible');
    slot.hidden=['denied','failed','unavailable','device-disabled','unsupported','tcf-required'].includes(slot.dataset.adState);
  }
  function loadScript(key,src,done,failed){
    var existing=document.querySelector('script[data-docmivo-provider="'+key+'"]');
    if(existing){
      if(existing.dataset.loaded==='true'){if(done)done();return;}
      existing.addEventListener('load',function(){if(done)done();},{once:true});
      existing.addEventListener('error',function(){if(failed)failed();},{once:true});return;
    }
    var script=document.createElement('script');script.async=true;script.dataset.docmivoProvider=key;script.src=src;
    script.onload=function(){script.dataset.loaded='true';if(done)done();};
    script.onerror=function(){if(failed)failed();};document.head.appendChild(script);
  }
  function renderAdsterra(slot,zone){
    if(!zone||!zone.scriptUrl||!zone.key){clearSlot(slot,'unavailable');return;}
    slot.hidden=false;slot.style.minHeight=Number(zone.height)+'px';slot.dataset.adVisible='true';labelFor(slot);
    var creative=document.createElement('div');creative.className='dm-ad-creative';
    creative.style.width=Number(zone.width)+'px';creative.style.height=Number(zone.height)+'px';
    creative.id='dm-ad-'+Math.random().toString(36).slice(2,10);slot.appendChild(creative);
    window.atOptions={key:zone.key,format:'iframe',height:Number(zone.height),width:Number(zone.width),params:{}};
    var script=document.createElement('script');script.async=true;script.src=zone.scriptUrl;
    script.dataset.docmivoPlacement=slot.dataset.adPlacement||'';
    script.onload=function(){slot.dataset.adState='loaded';};script.onerror=function(){clearSlot(slot,'failed');};
    creative.appendChild(script);
  }
  function hasTcfConsent(){
    return new Promise(function(resolve){
      if(typeof window.__tcfapi!=='function'){resolve(false);return;}
      try{window.__tcfapi('getTCData',2,function(data,success){
        if(!success||!data){resolve(false);return;}
        if(data.gdprApplies===false){resolve(true);return;}
        if(!data.tcString){resolve(false);return;}
        var purposes=data.purpose&&data.purpose.consents||{};
        resolve((data.eventStatus==='tcloaded'||data.eventStatus==='useractioncomplete')&&purposes[1]===true);
      });}catch(e){resolve(false);}
    });
  }
  async function renderAdSense(slot,placement){
    if(!placement.clientId||!placement.slotId){clearSlot(slot,'unavailable');return;}
    if(document.body.getAttribute('data-ads-requires-tcf')!=='false'&&!await hasTcfConsent()){clearSlot(slot,'tcf-required');return;}
    slot.hidden=false;slot.dataset.adVisible='true';slot.style.minHeight='90px';labelFor(slot);
    var ins=document.createElement('ins');ins.className='adsbygoogle';ins.style.display='block';ins.style.minHeight='90px';
    ins.dataset.adClient=placement.clientId;ins.dataset.adSlot=placement.slotId;ins.dataset.adFormat='auto';ins.dataset.fullWidthResponsive='true';slot.appendChild(ins);
    loadScript('adsense','https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(placement.clientId),function(){
      try{(window.adsbygoogle=window.adsbygoogle||[]).push({});slot.dataset.adState='loaded';}catch(e){clearSlot(slot,'failed');}
    },function(){clearSlot(slot,'failed');});
  }
  function renderInfolinks(slot,placement){
    if(!placement.pid||!placement.wsid){clearSlot(slot,'unavailable');return;}
    window.infolinks_pid=Number(placement.pid);window.infolinks_wsid=Number(placement.wsid);
    slot.hidden=true;slot.style.display='none';
    loadScript('infolinks','https://resources.infolinks.com/js/infolinks_main.js',function(){slot.dataset.adState='loaded';},function(){clearSlot(slot,'failed');});
  }
  function renderMediaNet(slot,placement){
    if(!placement.cid||!placement.tagId){clearSlot(slot,'unavailable');return;}
    slot.hidden=false;slot.dataset.adVisible='true';slot.style.minHeight='90px';labelFor(slot);
    var creative=document.createElement('div');creative.id='dm-medianet-'+Math.random().toString(36).slice(2,10);creative.className='dm-ad-creative';slot.appendChild(creative);
    window._mNHandle=window._mNHandle||{};window._mNHandle.queue=window._mNHandle.queue||[];
    window._mNHandle.queue.push(function(){try{window._mNDetails.loadTag(placement.tagId,'728x90',creative.id);slot.dataset.adState='loaded';}catch(e){clearSlot(slot,'failed');}});
    loadScript('medianet','https://contextual.media.net/dmedianet.js?cid='+encodeURIComponent(placement.cid),null,function(){clearSlot(slot,'failed');});
  }
  function render(config){
    if(!config||!config.enabled||!consentGranted())return;
    (config.placements||[]).forEach(function(placement){
      var slot=document.querySelector('.dm-ad-slot[data-ad-placement="'+placement.id+'"]');
      if(!slot||['loaded','loading','observing'].includes(slot.dataset.adState))return;
      var mobile=window.matchMedia&&window.matchMedia('(max-width: 600px)').matches;
      if((mobile&&!placement.mobile)||(!mobile&&!placement.desktop)){clearSlot(slot,'device-disabled');return;}
      var load=function(){
        if(!consentGranted()){clearSlot(slot,'denied');return;}
        slot.dataset.adState='loading';
        if(placement.provider==='adsterra'){var zone=mobile?placement.mobileZone:placement.desktopZone;if(zone)renderAdsterra(slot,zone);else clearSlot(slot,'unavailable');}
        else if(placement.provider==='adsense'){renderAdSense(slot,placement).catch(function(){clearSlot(slot,'failed');});}
        else if(placement.provider==='infolinks')renderInfolinks(slot,placement);
        else if(placement.provider==='mediaNet')renderMediaNet(slot,placement);
        else clearSlot(slot,'unsupported');
      };
      if('IntersectionObserver' in window){
        slot.dataset.adState='observing';
        var observer=new IntersectionObserver(function(entries){
          if(entries.some(function(entry){return entry.isIntersecting;})){
            observer.disconnect();observers.delete(slot);load();
          }
        },{rootMargin:'300px 0px'});
        observers.set(slot,observer);observer.observe(slot);
      }else load();
    });
  }
  function revoke(){document.querySelectorAll('.dm-ad-slot').forEach(function(slot){clearSlot(slot,'denied');});document.documentElement.classList.remove('dm-ads-consented');}
  fetch('/api/monetization/config?path='+encodeURIComponent(path),{cache:'no-store',credentials:'same-origin'})
    .then(function(response){if(!response.ok)throw new Error('config');return response.json();})
    .then(function(config){
      if(!config.enabled)return;
      document.addEventListener('docmivo:consent-updated',function(event){
        if(event.detail&&event.detail.ads===true){document.documentElement.classList.add('dm-ads-consented');render(config);}else revoke();
      });
      if(consentGranted()){document.documentElement.classList.add('dm-ads-consented');render(config);}
    }).catch(function(){});
})();
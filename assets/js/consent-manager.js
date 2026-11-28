(function(){
  'use strict';
  var KEY='docmivo:consent:v1';
  var pageViewSent=false;
  function read(){
    try{
      var value=JSON.parse(localStorage.getItem(KEY)||'null');
      if(value&&typeof value==='object')return {analytics:value.analytics===true,ads:value.ads===true,updatedAt:value.updatedAt||null};
    }catch(e){}
    return null;
  }
  function privacySignal(){
    try{return navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';}
    catch(e){return false;}
  }
  function updateTags(prefs){
    var analytics=prefs.analytics===true&&!privacySignal();
    var ads=prefs.ads===true&&!privacySignal();
    if(typeof window.gtag==='function'){
      window.gtag('consent','update',{
        analytics_storage:analytics?'granted':'denied',
        ad_storage:ads?'granted':'denied',
        ad_user_data:ads?'granted':'denied',
        ad_personalization:ads?'granted':'denied'
      });
      if(analytics&&!pageViewSent){window.gtag('event','page_view');pageViewSent=true;}
    }
    document.documentElement.classList.toggle('dm-ads-consented',ads);
    document.dispatchEvent(new CustomEvent('docmivo:consent-updated',{detail:{analytics:analytics,ads:ads}}));
  }
  function banner(){
    var existing=document.querySelector('.dm-consent-banner');
    if(existing)return existing;
    var box=document.createElement('aside');
    box.className='dm-consent-banner';
    box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','false');
    box.setAttribute('aria-labelledby','dm-consent-title');
    var english=document.documentElement.lang==='en';
    box.innerHTML=english?
      '<h2 id="dm-consent-title">Privacy choices</h2>'+
      '<p>We use optional visit analytics and may display ads from an approved network when enabled. Advertising scripts will not load before you choose. You can change your choice later in cookie settings.</p>'+
      '<div class="dm-consent-options">'+
        '<label class="dm-consent-option"><input type="checkbox" id="dm-consent-analytics"> Visit analytics</label>'+
        '<label class="dm-consent-option"><input type="checkbox" id="dm-consent-ads"> Advertising storage</label>'+
      '</div>'+
      '<div class="dm-consent-actions">'+
        '<button type="button" class="primary" data-consent-save>Save choices</button>'+
        '<button type="button" data-consent-all>Allow optional</button>'+
        '<button type="button" data-consent-reject>Essential only</button>'+
      '</div>'+
      '<a href="/cookies">Cookie details</a>':
      '<h2 id="dm-consent-title">إعدادات الخصوصية</h2>'+
      '<p>نستخدم قياسًا اختياريًا للزيارات، وقد نعرض إعلانات من شبكة معتمدة عند تفعيلها. لن نحمّل أكواد الإعلانات قبل اختيارك. يمكنك تغيير اختيارك لاحقًا من إعدادات ملفات الارتباط.</p>'+
      '<div class="dm-consent-options">'+
        '<label class="dm-consent-option"><input type="checkbox" id="dm-consent-analytics"> قياس الزيارات</label>'+
        '<label class="dm-consent-option"><input type="checkbox" id="dm-consent-ads"> الإعلانات وملفاتها</label>'+
      '</div>'+
      '<div class="dm-consent-actions">'+
        '<button type="button" class="primary" data-consent-save>حفظ اختياراتي</button>'+
        '<button type="button" data-consent-all>السماح بالاختياري</button>'+
        '<button type="button" data-consent-reject>الأساسية فقط</button>'+
      '</div>'+
      '<a href="/cookies">تفاصيل ملفات الارتباط</a>';
    box.querySelector('[data-consent-save]').addEventListener('click',function(){
      save({analytics:box.querySelector('#dm-consent-analytics').checked,ads:box.querySelector('#dm-consent-ads').checked});
    });
    box.querySelector('[data-consent-all]').addEventListener('click',function(){save({analytics:true,ads:true});});
    box.querySelector('[data-consent-reject]').addEventListener('click',function(){save({analytics:false,ads:false});});
    document.body.appendChild(box);
    return box;
  }
  function show(){
    var box=banner(),prefs=read()||{analytics:false,ads:false};
    box.querySelector('#dm-consent-analytics').checked=prefs.analytics;
    box.querySelector('#dm-consent-ads').checked=prefs.ads;
    box.hidden=false;
    box.querySelector('[data-consent-save]').focus({preventScroll:true});
  }
  function save(value){
    var prefs={analytics:value.analytics===true,ads:value.ads===true,updatedAt:new Date().toISOString()};
    try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}
    var box=document.querySelector('.dm-consent-banner');
    if(box)box.hidden=true;
    updateTags(prefs);
  }
  function shouldPrompt(){
    var path=location.pathname;
    return document.body.getAttribute('data-ads-enabled')==='true'||path==='/'||path==='/guides'||path.startsWith('/guides/')||path==='/cookies';
  }
  function init(){
    var link=document.getElementById('privacy-settings-link');
    if(link){
      link.style.display='inline';
      link.addEventListener('click',function(event){event.preventDefault();show();});
    }
    window.DocMivoConsent={get:read,openSettings:show};
    var saved=read();
    if(privacySignal()){
      updateTags({analytics:false,ads:false});
      return;
    }
    if(saved)updateTags(saved);
    else{
      updateTags({analytics:false,ads:false});
      if(shouldPrompt())show();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
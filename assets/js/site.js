(function(){
 const C=window.DOCMIVO_CONFIG||{};
 document.querySelectorAll('[data-brand]').forEach(e=>e.textContent=C.brand||'DocMivo');
 document.querySelectorAll('[data-year]').forEach(e=>e.textContent=new Date().getFullYear());
 const mb=document.querySelector('.menu-btn'), mn=document.querySelector('.mobile-nav');
 if(mb&&mn) mb.addEventListener('click',()=>mn.classList.toggle('open'));
 const search=document.querySelector('#toolSearch');
 const cards=[...document.querySelectorAll('.tool-card')];
 const chips=[...document.querySelectorAll('.chip')];
 let cat='all';
 function filter(){ const q=(search?.value||'').toLowerCase().trim(); cards.forEach(card=>{ const okCat=cat==='all'||card.dataset.cat===cat; const okQ=!q||card.textContent.toLowerCase().includes(q); card.style.display=okCat&&okQ?'flex':'none'; }); }
 if(search) search.addEventListener('input',filter);
 function focusToolSearch(){if(search&&location.hash==='#toolSearch'){setTimeout(()=>{search.scrollIntoView({behavior:'smooth',block:'center'});search.focus({preventScroll:true})},80)}}
 focusToolSearch();window.addEventListener('hashchange',focusToolSearch);
 chips.forEach(ch=>ch.addEventListener('click',()=>{chips.forEach(x=>x.classList.remove('active'));ch.classList.add('active');cat=ch.dataset.cat;filter();}));
 // Google CMP consent-revocation link: reveal only when the consent API is ready and GDPR applies.
 const privacyLink=document.getElementById('privacy-settings-link');
 if(privacyLink){
   window.googlefc=window.googlefc||{};
   window.googlefc.callbackQueue=window.googlefc.callbackQueue||[];
   privacyLink.addEventListener('click',(e)=>{e.preventDefault();try{window.googlefc?.showRevocationMessage?.();}catch{}});
   window.googlefc.callbackQueue.push({'CONSENT_API_READY':()=>{
     try{
       if(typeof window.__tcfapi!=='function') return;
       window.__tcfapi('addEventListener',2,(tcdata,success)=>{
         if(success&&tcdata&&tcdata.gdprApplies) privacyLink.style.display='block';
       });
     }catch{}
   }});
 }

})();

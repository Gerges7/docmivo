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
 function focusToolSearch(){
  if(!search||location.hash!=='#toolSearch') return;
  setTimeout(()=>{
    const nav=document.querySelector('.nav');
    const navH=nav?nav.getBoundingClientRect().height:80;
    const y=Math.max(0,search.getBoundingClientRect().top+window.scrollY-navH-24);
    window.scrollTo({top:y,behavior:'smooth'});
    setTimeout(()=>search.focus({preventScroll:true}),220);
  },60);
 }
 document.addEventListener('click',e=>{
   const a=e.target.closest('a[href="/#toolSearch"],a[href="#toolSearch"]');
   if(!a) return;
   const onHome=location.pathname==='/'||location.pathname.endsWith('/index.html');
   if(onHome){
     e.preventDefault();
     if(location.hash!=='#toolSearch') history.replaceState(null,'','#toolSearch');
     focusToolSearch();
   }
 });
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

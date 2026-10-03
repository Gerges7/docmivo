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
 function filter(){
   const q=(search?.value||'').toLowerCase().trim();
   cards.forEach(card=>{
     const okCat=cat==='all'||card.dataset.cat===cat;
     const okQ=!q||card.textContent.toLowerCase().includes(q);
     card.style.display=okCat&&okQ?'flex':'none';
   });
 }
 if(search) search.addEventListener('input',filter);
 chips.forEach(ch=>ch.addEventListener('click',()=>{
   chips.forEach(x=>x.classList.remove('active'));ch.classList.add('active');cat=ch.dataset.cat;filter();
 }));

 // Quick search is a modal, not scroll/hash navigation. This works from any tool page.
 const tools=Array.isArray(window.DOCMIVO_TOOLS)?window.DOCMIVO_TOOLS:[];
 let qsModal=null,qsInput=null,qsResults=null,lastFocus=null;
 function ensureQuickSearch(){
   if(qsModal||!tools.length)return;
   qsModal=document.createElement('div');
   qsModal.className='quick-search-modal';
   qsModal.setAttribute('aria-hidden','true');
   qsModal.innerHTML=`<div class="quick-search-backdrop" data-qs-close></div>
     <section class="quick-search-panel" role="dialog" aria-modal="true" aria-label="البحث عن أداة">
       <div class="quick-search-head"><div><strong>ابحث عن أداة</strong><small>اكتب اسم المهمة: ضغط، دمج، Word، OCR...</small></div><button class="quick-search-close" type="button" aria-label="إغلاق" data-qs-close>✕</button></div>
       <div class="quick-search-box"><span>🔎</span><input id="quickSearchInput" type="search" autocomplete="off" placeholder="ابحث عن أداة..."/></div>
       <div class="quick-search-results" id="quickSearchResults"></div>
     </section>`;
   document.body.appendChild(qsModal);
   qsInput=qsModal.querySelector('#quickSearchInput');
   qsResults=qsModal.querySelector('#quickSearchResults');
   qsInput.addEventListener('input',()=>renderQuickResults(qsInput.value));
   qsModal.addEventListener('click',e=>{if(e.target.closest('[data-qs-close]'))closeQuickSearch();});
 }
 function renderQuickResults(value=''){
   if(!qsResults)return;
   const q=value.trim().toLowerCase();
   const matches=tools.filter(t=>!q||`${t.title} ${t.desc} ${t.cat} ${t.slug}`.toLowerCase().includes(q)).slice(0,12);
   qsResults.innerHTML=matches.length?matches.map(t=>`<a class="quick-search-item" href="/tools/${t.slug}"><span class="quick-search-icon">${t.icon||'📄'}</span><span><b>${t.title}</b><small>${t.desc||''}</small></span><span class="quick-search-arrow">←</span></a>`).join(''):`<div class="quick-search-empty">لا توجد أداة مطابقة. جرّب كلمة أبسط.</div>`;
 }
 function openQuickSearch(){
   if(!tools.length){location.href='/?quickSearch=1';return;}
   ensureQuickSearch();lastFocus=document.activeElement;renderQuickResults('');qsModal.classList.add('open');qsModal.setAttribute('aria-hidden','false');document.body.classList.add('quick-search-open');qsInput.value='';setTimeout(()=>qsInput.focus(),20);
 }
 function closeQuickSearch(){
   if(!qsModal)return;qsModal.classList.remove('open');qsModal.setAttribute('aria-hidden','true');document.body.classList.remove('quick-search-open');try{lastFocus?.focus()}catch{}
 }
 document.addEventListener('click',e=>{
   const trigger=e.target.closest('[data-quick-search]');
   if(!trigger)return;e.preventDefault();openQuickSearch();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&qsModal?.classList.contains('open'))closeQuickSearch();});
 if(new URLSearchParams(location.search).get('quickSearch')==='1'){
   setTimeout(()=>{openQuickSearch();if(history.replaceState)history.replaceState(null,'',location.pathname+location.hash)},80);
 }

 // Google CMP consent-revocation link.
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

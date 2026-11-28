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
     if(card.dataset.backendHidden==='1'){card.style.display='none';return;}
     const okCat=cat==='all'||card.dataset.cat===cat;
     const okQ=!q||card.textContent.toLowerCase().includes(q);
     card.style.display=okCat&&okQ?'flex':'none';
   });
 }
 if(search) search.addEventListener('input',filter);
 chips.forEach(ch=>ch.addEventListener('click',()=>{chips.forEach(x=>x.classList.remove('active'));ch.classList.add('active');cat=ch.dataset.cat;filter();}));

 // Hide tools that require the processing service until it is actually available.
 const backendCards=cards.filter(c=>c.dataset.requiresServer==='1');
 if(backendCards.length){
   fetch('/api/converter_token',{cache:'no-store'}).then(r=>r.json()).then(j=>{
     const ready=!!j.configured;
     backendCards.forEach(c=>c.dataset.backendHidden=ready?'0':'1');
     filter();
   }).catch(()=>{backendCards.forEach(c=>c.dataset.backendHidden='1');filter();});
 }

 // Consent preferences are managed by the first-party DocMivo consent manager.
})();

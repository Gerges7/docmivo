(function(){
  const body=document.body;
  const mode=body.dataset.serverMode;
  if(!mode)return;
  const input=document.getElementById(body.dataset.serverInput||'serverFile');
  const run=document.getElementById('serverRun');
  const status=document.getElementById('serverStatus');
  const picked=document.getElementById('serverPicked');
  const pick=document.getElementById('serverPick');
  let configured=false,maxUpload=25*1024*1024;

  function show(msg,type=''){
    if(!status)return;
    status.textContent=msg;status.className='status show '+type;
  }
  function setPicked(){
    const f=input?.files?.[0];
    if(picked)picked.textContent=f?`${f.name} — ${(f.size/1024/1024).toFixed(2)} MB`:'لم يتم اختيار ملف';
  }
  pick?.addEventListener('click',()=>input?.click());
  input?.addEventListener('change',setPicked);

  async function health(){
    try{
      const r=await fetch('/api/converter_token',{cache:'no-store'}),j=await r.json();
      configured=!!(r.ok&&j.configured);maxUpload=Number(j.maxUploadBytes||maxUpload);
      if(run)run.disabled=false;
    }catch{configured=false;if(run)run.disabled=false;}
  }
  health();

  function collectFields(fd){
    document.querySelectorAll('[data-server-field]').forEach(el=>{
      const key=el.dataset.serverField;if(!key)return;
      fd.append(key,el.type==='checkbox'?(el.checked?'true':'false'):(el.value||''));
    });
  }
  function filenameFromDisposition(value,fallback){
    if(!value)return fallback;
    const utf=value.match(/filename\*=UTF-8''([^;]+)/i);if(utf){try{return decodeURIComponent(utf[1])}catch{}}
    const m=value.match(/filename="?([^";]+)"?/i);return m?.[1]||fallback;
  }
  function defaultName(file){
    const stem=(file.name||'document').replace(/\.[^.]+$/,'');
    const map={word_to_pdf:`${stem}.pdf`,excel_to_pdf:`${stem}.pdf`,powerpoint_to_pdf:`${stem}.pdf`,protect_pdf:'protected.pdf',unlock_pdf:'unlocked.pdf',repair_pdf:'repaired.pdf',searchable_ocr:'searchable-ocr.pdf',pdfa:'pdfa.pdf',extract_images:'embedded-images.zip'};
    return map[mode]||'docmivo-result.bin';
  }
  function downloadBlob(blob,name){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  }

  run?.addEventListener('click',async()=>{
    const file=input?.files?.[0];
    if(!file){show('اختر ملفًا أولًا.','err');return;}
    if(!configured){show('هذه الأداة غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.','err');return;}
    if(file.size>maxUpload){show(`الملف أكبر من الحد الحالي (${Math.floor(maxUpload/1024/1024)} MB).`,'err');return;}
    run.disabled=true;run.classList.add('loading');
    try{
      show('جاري تجهيز الملف…');
      const tr=await fetch('/api/converter_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,size:file.size})});
      const tj=await tr.json();if(!tr.ok||!tj.ok)throw new Error(tj.error||'تعذر بدء العملية.');
      const fd=new FormData();fd.append('mode',mode);fd.append('file',file,file.name);collectFields(fd);
      show('جاري المعالجة… لا تغلق الصفحة.');
      const r=await fetch(tj.uploadUrl,{method:'POST',headers:{Authorization:'Bearer '+tj.token,'X-DocMivo-Mode':mode},body:fd});
      if(!r.ok){let msg=`تعذر إكمال العملية (${r.status}).`;try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg)}
      const blob=await r.blob();if(blob.size<100)throw new Error('تعذر إنشاء ملف صالح.');
      const name=filenameFromDisposition(r.headers.get('Content-Disposition'),defaultName(file));
      downloadBlob(blob,name);show('تمت العملية بنجاح وبدأ تنزيل الملف.','ok');
      try{window.gtag?.('event','server_tool_complete',{tool:mode,file_size:file.size})}catch{}
    }catch(e){show(e.message||'حدث خطأ أثناء المعالجة.','err')}
    finally{run.disabled=false;run.classList.remove('loading')}
  });
})();

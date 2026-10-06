(function(){
  const body=document.body;
  const mode=body.dataset.bestMode;
  if(!mode)return;
  const input=document.getElementById('fileInput');
  const run=document.getElementById('runTool');
  const status=document.getElementById('status');
  let serverReady=false,maxUpload=25*1024*1024;

  function show(msg,type=''){
    if(!status)return;
    status.textContent=msg;status.className='status show '+type;
  }
  function filenameFromDisposition(value,fallback){
    if(!value)return fallback;
    const utf=value.match(/filename\*=UTF-8''([^;]+)/i);if(utf){try{return decodeURIComponent(utf[1])}catch{}}
    const m=value.match(/filename="?([^";]+)"?/i);return m?.[1]||fallback;
  }
  function downloadBlob(blob,name){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  }
  async function health(){
    try{
      const r=await fetch('/api/converter_token',{cache:'no-store'}),j=await r.json();
      serverReady=!!(r.ok&&j.configured);maxUpload=Number(j.maxUploadBytes||maxUpload);
    }catch{serverReady=false;}
  }
  health();

  // Capture phase: when the enhanced engine is available, use it transparently.
  run?.addEventListener('click',async(e)=>{
    if(!serverReady)return; // let the browser implementation handle it as a fallback
    const file=input?.files?.[0];
    if(!file)return; // local handler will show the normal validation message
    if(file.size>maxUpload){e.preventDefault();e.stopImmediatePropagation();show(`الملف أكبر من الحد الحالي (${Math.floor(maxUpload/1024/1024)} MB).`,'err');return;}
    e.preventDefault();e.stopImmediatePropagation();
    run.disabled=true;run.classList.add('loading');
    try{
      show('جاري التحويل…');
      const tr=await fetch('/api/converter_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,size:file.size})});
      const tj=await tr.json();if(!tr.ok||!tj.ok)throw new Error(tj.error||'تعذر بدء التحويل.');
      const fd=new FormData();fd.append('mode',mode);fd.append('file',file,file.name);
      const r=await fetch(tj.uploadUrl,{method:'POST',headers:{Authorization:'Bearer '+tj.token,'X-DocMivo-Mode':mode},body:fd});
      if(!r.ok){let msg=`تعذر إكمال التحويل (${r.status}).`;try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg)}
      const blob=await r.blob();if(blob.size<100)throw new Error('تعذر إنشاء PDF صالح.');
      const fallback=(file.name||'document').replace(/\.[^.]+$/,'')+'.pdf';
      downloadBlob(blob,filenameFromDisposition(r.headers.get('Content-Disposition'),fallback));
      show('تم التحويل بنجاح وبدأ تنزيل الملف.','ok');
      try{window.gtag?.('event','best_engine_complete',{tool:mode,file_size:file.size})}catch{}
    }catch(err){
      // Do not silently run a second conversion after a server failure; give a clear message.
      show(err.message||'تعذر إكمال التحويل. حاول مرة أخرى.','err');
    }finally{run.disabled=false;run.classList.remove('loading')}
  },true);
})();

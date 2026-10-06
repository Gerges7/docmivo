(function(){
  const mode=document.body.dataset.aiMode;
  if(!mode)return;
  const fileInput=document.getElementById('aiFile');
  const pick=document.getElementById('aiPick');
  const picked=document.getElementById('aiPicked');
  const run=document.getElementById('aiRun');
  const status=document.getElementById('aiStatus');
  const output=document.getElementById('aiOutput');
  const outText=document.getElementById('aiOutText');
  const outTitle=document.getElementById('aiOutTitle');
  const downloadBtn=document.getElementById('aiDownload');
  const apiDot=document.getElementById('aiApiDot');
  const apiText=document.getElementById('aiApiText');
  let lastPayload=null;
  const RAW_LIMIT=3_350_000;
  const TEXT_LIMIT=300000;

  function showStatus(msg,type=''){
    status.textContent=msg;status.className='status show '+type;
  }
  function setPicked(){
    const f=fileInput.files?.[0];
    picked.textContent=f?`${f.name} — ${(f.size/1024/1024).toFixed(2)} MB`:'لم يتم اختيار ملف';
  }
  pick?.addEventListener('click',()=>fileInput.click());
  fileInput?.addEventListener('change',setPicked);

  async function health(){
    try{
      const r=await fetch('/api/ai',{cache:'no-store'}),j=await r.json();
      if(r.ok&&j.configured){apiDot.classList.add('ready');apiText.textContent='الأداة جاهزة';}
      else{apiDot.classList.add('offline');apiText.textContent='الأداة غير متاحة مؤقتًا';}
    }catch{apiDot.classList.add('offline');apiText.textContent='تعذر الوصول إلى AI backend';}
  }
  health();

  async function extractPdfText(file){
    if(!window.pdfjsLib)throw new Error('تعذر تحميل قارئ PDF لاستخراج النص محليًا.');
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    let chunks=[];let chars=0;const maxPages=Math.min(pdf.numPages,180);
    for(let i=1;i<=maxPages;i++){
      showStatus(`الملف كبير؛ استخراج النص محليًا من الصفحة ${i}/${maxPages}…`);
      const page=await pdf.getPage(i),tc=await page.getTextContent();
      const t=tc.items.map(x=>x.str).join(' ').trim();
      if(t){const block=`\n\n--- Page ${i} ---\n${t}`;chunks.push(block);chars+=block.length;}
      if(chars>=TEXT_LIMIT)break;
    }
    return chunks.join('').slice(0,TEXT_LIMIT).trim();
  }

  function addCommon(fd){
    fd.append('mode',mode);fd.append('consent',document.getElementById('aiConsent').checked?'true':'false');
    const lang=document.getElementById('aiLanguage');if(lang)fd.append('language',lang.value);
    const q=document.getElementById('aiQuestion');if(q)fd.append('question',q.value.trim());
    const st=document.getElementById('aiStyle');if(st)fd.append('style',st.value);
    const tg=document.getElementById('aiTarget');if(tg)fd.append('target',tg.value);
  }

  async function buildFormData(file){
    const fd=new FormData();addCommon(fd);
    if(file.size<=RAW_LIMIT){fd.append('file',file,file.name);return fd;}
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      const text=await extractPdfText(file);
      if(text.length<80)throw new Error('الملف كبير ولا يحتوي نصًا قابلًا للاستخراج. استخدم ملفًا أصغر أو أداة OCR المحلية أولًا.');
      fd.append('source_text',text);
      return fd;
    }
    throw new Error('الملف أكبر من حد AI Beta الحالي. استخدم صورة/ملف أصغر من 3.5 MB.');
  }

  function csvFromTables(data){
    const tables=Array.isArray(data?.tables)?data.tables:[];let out=[];
    const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
    tables.forEach((t,idx)=>{
      out.push(`# Table ${idx+1}${t.title?' - '+t.title:''}`);
      if(Array.isArray(t.headers))out.push(t.headers.map(esc).join(','));
      if(Array.isArray(t.rows))t.rows.forEach(r=>out.push((Array.isArray(r)?r:[r]).map(esc).join(',')));
      out.push('');
    });
    return out.join('\n');
  }
  function download(name,text,type){
    const a=document.createElement('a'),blob=new Blob([text],{type});a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  }

  run?.addEventListener('click',async()=>{
    const f=fileInput.files?.[0];
    if(!f){showStatus('اختر ملفًا أولًا.','err');return;}
    if(!document.getElementById('aiConsent').checked){showStatus('أكد موافقتك على إرسال المحتوى لخدمة الذكاء الاصطناعي.','err');return;}
    if(mode==='ask'&&!document.getElementById('aiQuestion').value.trim()){showStatus('اكتب سؤالك أولًا.','err');return;}
    run.disabled=true;run.classList.add('loading');output.classList.remove('show');lastPayload=null;
    try{
      showStatus('جاري تجهيز الطلب…');
      const fd=await buildFormData(f);
      const r=await fetch('/api/ai',{method:'POST',body:fd,headers:{'X-DocMivo-AI':'1'}});
      let j;try{j=await r.json()}catch{throw new Error(`الخادم أعاد استجابة غير متوقعة (${r.status}).`)}
      if(!r.ok||!j.ok)throw new Error(j.error||`تعذر تنفيذ الطلب (${r.status}).`);
      lastPayload=j;
      outTitle.textContent=mode==='tables'?'الجداول المستخرجة':'النتيجة';
      if(j.format==='json'){
        outText.textContent=JSON.stringify(j.data,null,2);outText.classList.add('ai-json');
        downloadBtn.textContent='تنزيل JSON';
      }else{
        outText.textContent=j.result||'';outText.classList.remove('ai-json');downloadBtn.textContent='تنزيل TXT';
      }
      output.classList.add('show');showStatus('تمت المعالجة بنجاح.','ok');
      try{window.gtag?.('event','ai_tool_complete',{tool:mode,model:j.model||''});}catch{}
    }catch(e){showStatus(e.message||'حدث خطأ أثناء المعالجة.','err');}
    finally{run.disabled=false;run.classList.remove('loading');}
  });

  downloadBtn?.addEventListener('click',()=>{
    if(!lastPayload)return;
    if(lastPayload.format==='json')download(`docmivo-${mode}.json`,JSON.stringify(lastPayload.data,null,2),'application/json;charset=utf-8');
    else download(`docmivo-${mode}.txt`,lastPayload.result||'','text/plain;charset=utf-8');
  });
  document.getElementById('aiCsv')?.addEventListener('click',()=>{
    if(lastPayload?.format==='json')download('docmivo-tables.csv',csvFromTables(lastPayload.data),'text/csv;charset=utf-8');
  });
})();

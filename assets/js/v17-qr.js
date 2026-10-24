(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { payload, contrast } = window.DocMivoQRData || {};
  const form = $('qrForm'), preview = $('qrCanvas'), status = $('qrStatus');
  if (!form || !preview || !payload) return;
  let rendered = false, current = '', busy = false;
  function say(message, bad=false) { status.textContent=message; status.className='v17-status '+(bad?'v17-error':''); }
  function fields() {
    const data = Object.fromEntries(new FormData(form).entries());
    data.hidden = $('wifiHidden').checked;
    return data;
  }
  function showMode() {
    const mode = $('qrMode').value;
    document.querySelectorAll('[data-qr-fields]').forEach(el => { el.hidden=el.dataset.qrFields!==mode; });
    rendered=false; $('qrDownloadPng').disabled=true; $('qrDownloadSvg').disabled=true;
    say('أدخل البيانات ثم اضغط توليد الرمز.');
  }
  function optionValues() {
    const dark=$('qrDark').value, light=$('qrLight').value;
    if (contrast(dark,light) < 4.5) throw new Error('تباين الألوان منخفض؛ استخدم لونًا داكنًا على خلفية فاتحة.');
    return { margin:4, width:Number($('qrSize').value), errorCorrectionLevel:$('qrError').value, color:{ dark:dark+'FF', light:light+'FF' } };
  }
  async function generate() {
    if (busy) return;
    busy=true; rendered=false; $('qrGenerate').disabled=true;
    $('qrDownloadPng').disabled=true; $('qrDownloadSvg').disabled=true;
    try {
      if (!window.QRCode?.toCanvas) throw new Error('تعذر تحميل مكتبة QR. افحص اتصال الإنترنت ثم أعد فتح الصفحة.');
      current=payload($('qrMode').value,fields());
      await window.QRCode.toCanvas(preview,current,optionValues());
      rendered=true; $('qrDownloadPng').disabled=false; $('qrDownloadSvg').disabled=false;
      say('الرمز جاهز. جرّبه بكاميرا الهاتف قبل مشاركته أو طباعته.');
    } catch (error) { say(error.message || 'تعذر إنشاء الرمز.',true); }
    finally { busy=false; $('qrGenerate').disabled=false; }
  }
  function download(blob,name) {
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  $('qrDownloadPng').addEventListener('click',()=>{
    if (!rendered) return;
    preview.toBlob(b=>b ? download(b,'docmivo-qr.png') : say('فشل تصدير PNG.',true),'image/png');
  });
  $('qrDownloadSvg').addEventListener('click',async()=>{
    if (!rendered) return;
    try {
      const svg=await window.QRCode.toString(current,{...optionValues(),type:'svg'});
      download(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),'docmivo-qr.svg');
    } catch (error) { say(error.message || 'فشل تصدير SVG.',true); }
  });
  $('qrMode').addEventListener('change',showMode);
  form.addEventListener('submit',e=>{e.preventDefault();generate();});
  form.addEventListener('input',()=>{if(rendered){rendered=false;$('qrDownloadPng').disabled=true;$('qrDownloadSvg').disabled=true;say('تغيّرت البيانات. ولّد رمزًا جديدًا قبل التنزيل.');}});
  showMode();
})();

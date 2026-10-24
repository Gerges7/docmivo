(function(){
  'use strict';
  const $=id=>document.getElementById(id), mode=document.body.dataset.imageMode;
  const math=window.DocMivoImageMath, accepted=['image/jpeg','image/png','image/webp'];
  if(!math || !['resize','compress'].includes(mode))return;
  let source=null,objectUrl=null,originalWidth=0,originalHeight=0,busy=false;
  function say(s,bad=false){$('imageStatus').textContent=s;$('imageStatus').className='v17-status '+(bad?'v17-error':'');}
  function human(s){return s>1024*1024?(s/1048576).toFixed(2)+' MB':(s/1024).toFixed(1)+' KB';}
  function cleanup(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
  function allowed(file){return accepted.includes(file.type) && file.size <= 20*1048576;}
  function download(blob,filename){const link=URL.createObjectURL(blob),a=document.createElement('a');a.href=link;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(link),3000);}
  async function load(file){
    if(!allowed(file))throw new Error('اختر JPG أو PNG أو WebP بحجم لا يتجاوز 20MB.');
    cleanup();objectUrl=URL.createObjectURL(file);
    const img=new Image();img.decoding='async';img.src=objectUrl;await img.decode();
    math.assertPixels(img.naturalWidth,img.naturalHeight);
    source=img;originalWidth=img.naturalWidth;originalHeight=img.naturalHeight;
    $('imagePreview').src=objectUrl;$('imagePreview').hidden=false;
    $('originalStats').textContent=`الأصل: ${originalWidth} × ${originalHeight} • ${human(file.size)}`;
    if(mode==='resize'){$('imgWidth').value=originalWidth;$('imgHeight').value=originalHeight;}
    say('تم تحميل الصورة محليًا. يمكنك ضبط الخيارات ثم تنزيل الناتج.');
  }
  $('imageInput').addEventListener('change',async e=>{source=null;$('imagePreview').hidden=true;try{if(e.target.files[0])await load(e.target.files[0]);}catch(ex){say(ex.message,true);}});
  if(mode==='resize'){
    $('imgWidth').addEventListener('input',()=>{if(source && $('lockAspect').checked){try{$('imgHeight').value=math.lockedHeight(originalWidth,originalHeight,$('imgWidth').value);}catch{}}});
    $('imgHeight').addEventListener('input',()=>{if(source && $('lockAspect').checked){try{$('imgWidth').value=math.lockedWidth(originalWidth,originalHeight,$('imgHeight').value);}catch{}}});
  }
  $('imageForm').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;
    if(!source){say('اختر صورة أولًا.',true);return;}
    busy=true;$('imageRun').disabled=true;
    try{
      const mime=$('imgFormat').value;
      if(!accepted.includes(mime))throw new Error('الصيغة المطلوبة غير مدعومة.');
      const dims=mode==='resize'?math.assertPixels($('imgWidth').value,$('imgHeight').value):math.assertPixels(originalWidth,originalHeight);
      const canvas=document.createElement('canvas');canvas.width=dims.width;canvas.height=dims.height;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('المتصفح لا يدعم Canvas.');
      if(mime==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,dims.width,dims.height);}
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,dims.width,dims.height);
      const quality=Number($('imgQuality').value)/100;
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('تعذر تصدير الصورة.')),mime,quality));
      if(blob.type!==mime)throw new Error('المتصفح لا يدعم تصدير الصيغة المختارة. اختر JPG أو PNG.');
      const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
      download(blob,`docmivo-${mode}-${dims.width}x${dims.height}.${extension}`);
      const previous=$('imageInput').files[0].size,pct=Math.round((1-blob.size/previous)*100);
      say(`النتيجة: ${dims.width} × ${dims.height} • ${human(blob.size)}. ${pct>=0?`توفير ${pct}% من حجم الملف`:`الملف أكبر بنسبة ${-pct}%؛ جرّب جودة أقل أو صيغة مختلفة`}.`);
    }catch(err){say(err.message||'تعذر معالجة الصورة.',true);}
    finally{busy=false;$('imageRun').disabled=false;}
  });
  $('imgFormat').addEventListener('change',()=>{const png=$('imgFormat').value==='image/png';$('imgQuality').disabled=png;$('qualityHint').textContent=png?'PNG يحفظ الصورة دون فقد؛ شريط الجودة لا يؤثر عليه.':'جودة أقل تعني غالبًا حجمًا أصغر ولكن تفاصيل أقل.';});
  window.addEventListener('pagehide',cleanup);
})();

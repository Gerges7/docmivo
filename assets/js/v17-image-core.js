/* Dimension planning with no DOM dependency. */
(function (root, factory) {
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.DocMivoImageMath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_SIDE=12000, MAX_PIXELS=32000000;
  function positive(value) { const n=Number(value); if(!Number.isInteger(n)||n<1||n>MAX_SIDE) throw new Error('الأبعاد يجب أن تكون أرقامًا صحيحة بين 1 و12000.'); return n; }
  function assertPixels(width,height) { const w=positive(width),h=positive(height); if(w*h>MAX_PIXELS) throw new Error('الصورة كبيرة جدًا (الحد 32 مليون بكسل).'); return {width:w,height:h}; }
  function fit(width,height,maxWidth,maxHeight) {
    const orig=assertPixels(width,height);const maxW=positive(maxWidth), maxH=positive(maxHeight);
    const ratio=Math.min(1,maxW/orig.width,maxH/orig.height);
    return assertPixels(Math.max(1,Math.round(orig.width*ratio)),Math.max(1,Math.round(orig.height*ratio)));
  }
  function lockedHeight(origW,origH,newW) { assertPixels(origW,origH);return positive(Math.max(1,Math.round(origH*positive(newW)/origW))); }
  function lockedWidth(origW,origH,newH) { assertPixels(origW,origH);return positive(Math.max(1,Math.round(origW*positive(newH)/origH))); }
  return {assertPixels,fit,lockedHeight,lockedWidth,MAX_PIXELS};
});

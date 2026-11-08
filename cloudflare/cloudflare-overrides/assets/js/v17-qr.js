/* DocMivo V17.1 QR: self-hosted QR encoder, local Canvas and SVG exports. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('qrForm');
  const canvas = $('qrCanvas');
  const status = $('qrStatus');
  const dataLib = window.DocMivoQRData;
  const QR = window.DocMivoQRCode;
  if (!form || !canvas || !status) return;
  const pngButton = $('qrDownloadPng');
  const svgButton = $('qrDownloadSvg');
  const submitButton = $('qrGenerate');
  let lastMatrix = null;
  let lastOptions = null;
  let generating = false;
  const LEVELS = { L: 1, M: 0, Q: 3, H: 2 };
  const MARGIN = 4;

  function say(message, isError = false) {
    status.textContent = message;
    status.className = 'v17-status' + (isError ? ' v17-error' : '');
  }
  function invalidate() {
    lastMatrix = null;
    lastOptions = null;
    pngButton.disabled = true;
    svgButton.disabled = true;
  }
  function currentFields() {
    const obj = Object.fromEntries(new FormData(form).entries());
    obj.hidden = $('wifiHidden').checked;
    return obj;
  }
  function modeChanged() {
    const mode = $('qrMode').value;
    document.querySelectorAll('[data-qr-fields]').forEach(el => {
      el.hidden = el.dataset.qrFields !== mode;
    });
    invalidate();
    say('أدخل البيانات ثم اضغط «توليد رمز QR».');
  }
  function getOptions() {
    const dark = $('qrDark').value;
    const light = $('qrLight').value;
    if (dataLib.contrast(dark, light) < 4.5) {
      throw new Error('تباين اللونين ضعيف؛ اختَر لونًا أغمق للرمز وخلفية فاتحة.');
    }
    const width = Number($('qrSize').value);
    const level = $('qrError').value;
    if (![256, 512, 1024].includes(width) || !Object.hasOwn(LEVELS, level)) {
      throw new Error('حجم الرمز أو مستوى مقاومة الأخطاء غير صالح.');
    }
    return {dark, light, width, level};
  }
  function encodeMatrix(text, level) {
    if (typeof QR !== 'function') throw new Error('ملف محرك QR المحلي لم يُحمّل. حاول تحديث الصفحة.');
    // QR8bitByte in the vendored engine handles one byte per JS character.
    // Supply actual UTF-8 bytes as Latin-1 code units to support Arabic/emoji.
    const utf8 = new TextEncoder().encode(text);
    let bytes = '';
    for (const byte of utf8) bytes += String.fromCharCode(byte);
    const qr = new QR(-1, LEVELS[level]);
    qr.addData(bytes);
    try { qr.make(); }
    catch (error) {
      if (/code length overflow|bad rs block|typeNumber/i.test(String(error))) {
        throw new Error('البيانات طويلة بالنسبة لمقاومة الأخطاء. قلّل النص أو اختَر المستوى M.');
      }
      throw error;
    }
    const n = qr.getModuleCount();
    if (n < 21 || n > 177) throw new Error('تعذر تكوين شبكة QR صالحة.');
    return Array.from({length:n}, (_, r) => Array.from({length:n}, (_, c) => qr.isDark(r,c)));
  }
  function drawCanvas(matrix, options) {
    const n = matrix.length;
    const size = options.width;
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('متصفحك لا يدعم الرسم على Canvas.');
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = options.light;
    ctx.fillRect(0,0,size,size);
    const cell = Math.floor(size / (n + MARGIN * 2));
    if (cell < 1) throw new Error('الرمز أكبر من مقاس الصورة المختار.');
    const total = (n + MARGIN * 2) * cell;
    const pad = Math.floor((size - total) / 2);
    ctx.fillStyle = options.dark;
    for (let y=0;y<n;y++) for (let x=0;x<n;x++) {
      if (matrix[y][x]) ctx.fillRect(pad + (x+MARGIN)*cell, pad + (y+MARGIN)*cell, cell, cell);
    }
  }
  function svgFromMatrix(matrix, options) {
    const n = matrix.length;
    const side = n + MARGIN * 2;
    const pieces = [];
    for (let y=0;y<n;y++) {
      for (let x=0;x<n;x++) {
        if (matrix[y][x]) pieces.push(`M${x+MARGIN} ${y+MARGIN}h1v1h-1z`);
      }
    }
    const path = pieces.join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.width}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges">` +
      `<rect width="100%" height="100%" fill="${options.light}"/>` +
      `<path d="${path}" fill="${options.dark}"/></svg>`;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function generate(event) {
    event.preventDefault();
    if (generating) return;
    generating = true;
    invalidate();
    submitButton.disabled = true;
    try {
      if (!dataLib || typeof dataLib.payload !== 'function') throw new Error('تعذر تحميل قواعد بيانات QR المحلية. أعد تحديث الصفحة.');
      const value = dataLib.payload($('qrMode').value,currentFields());
      const options = getOptions();
      const matrix = encodeMatrix(value,options.level);
      drawCanvas(matrix,options);
      lastMatrix = matrix;
      lastOptions = options;
      pngButton.disabled = false;
      svgButton.disabled = false;
      say('تم إنشاء الرمز بنجاح. جرّبه بكاميرا هاتفك قبل نشره أو طباعته.');
    } catch (error) {
      console.error('DocMivo QR:',error);
      say(error.message || 'تعذر توليد الرمز، راجع البيانات ثم حاول مجددًا.',true);
    } finally {
      generating = false;
      submitButton.disabled = false;
    }
  }
  pngButton.addEventListener('click',()=>{
    if (!lastMatrix) return;
    canvas.toBlob(blob => blob ? download(blob,'docmivo-qr.png') : say('تعذر تجهيز صورة PNG.',true), 'image/png');
  });
  svgButton.addEventListener('click',()=>{
    if (!lastMatrix) return;
    const xml = svgFromMatrix(lastMatrix,lastOptions);
    download(new Blob([xml],{type:'image/svg+xml;charset=utf-8'}),'docmivo-qr.svg');
  });
  $('qrMode').addEventListener('change',modeChanged);
  form.addEventListener('submit',generate);
  form.addEventListener('input',()=>{ if(lastMatrix) { invalidate(); say('تغيّرت البيانات، ولّد رمزًا جديدًا قبل التنزيل.'); } });
  modeChanged();
  // Optional hooks for local smoke testing; no mutable data exposed.
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    window.__DocMivoQRTest = Object.freeze({encodeMatrix,svgFromMatrix});
  }
})();

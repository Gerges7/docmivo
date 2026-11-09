/* DocMivo V18.3: visual color wells, HEX labels and accessible presets. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const dark = byId('qrDark');
  const light = byId('qrLight');
  if (!dark || !light) return;
  const buttons = [...document.querySelectorAll('[data-qr-preset]')];
  const hint = byId('qrContrastHint');
  const presets = Object.freeze({
    classic: {dark:'#111827', light:'#ffffff'},
    violet: {dark:'#4c1d95', light:'#f5f3ff'},
    blue: {dark:'#1e3a8a', light:'#eff6ff'}
  });
  const hex = val => /^#[0-9a-f]{6}$/i.test(String(val)) ? String(val).toUpperCase() : '#000000';
  function update() {
    for (const [name,input] of [['Dark',dark],['Light',light]]) {
      const output = byId('qr'+name+'Hex');
      const well = input.closest('.v17-color-picker');
      if (output) output.textContent = hex(input.value);
      if (well) well.style.setProperty('--swatch-color', input.value);
    }
    const currentDark = dark.value.toLowerCase();
    const currentLight = light.value.toLowerCase();
    for (const button of buttons) {
      const palette = presets[button.dataset.qrPreset];
      button.setAttribute('aria-pressed', String(Boolean(palette && palette.dark===currentDark && palette.light===currentLight)));
    }
    if (hint && typeof window.DocMivoQRData?.contrast === 'function') {
      const low = window.DocMivoQRData.contrast(currentDark,currentLight) < 4.5;
      hint.dataset.lowContrast = String(low);
      hint.textContent = low
        ? 'التباين ضعيف؛ الأفضل رمز داكن وخلفية فاتحة عشان الكاميرا تقرأه.'
        : 'اللونان واضحان. اختبر QR بكاميرا الهاتف قبل طباعته.';
    }
  }
  dark.addEventListener('input',update);
  dark.addEventListener('change',update);
  light.addEventListener('input',update);
  light.addEventListener('change',update);
  for (const button of buttons) {
    button.addEventListener('click',() => {
      const palette = presets[button.dataset.qrPreset];
      if (!palette) return;
      dark.value = palette.dark;
      light.value = palette.light;
      // Existing QR controller listens for form input events to invalidate old downloads.
      dark.dispatchEvent(new Event('input',{bubbles:true}));
      light.dispatchEvent(new Event('input',{bubbles:true}));
      update();
    });
  }
  update();
})();

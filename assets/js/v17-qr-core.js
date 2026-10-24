/* DocMivo V17 — pure payload helpers, shared with node --test. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DocMivoQRData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const input = value => String(value ?? '').trim();
  const textMax = 900;
  function wifiEscape(value) { return input(value).replace(/\\/g, '\\\\').replace(/([;,:\"])/g, '\\$1'); }
  function vcardEscape(value) { return input(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1'); }
  function payload(type, data) {
    if (!data || typeof data !== 'object') throw new Error('أدخل البيانات أولًا.');
    let value = '';
    if (type === 'text') value = input(data.text);
    else if (type === 'url') {
      value = input(data.url);
      try { const parsed = new URL(value); if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('protocol'); }
      catch { throw new Error('أدخل رابطًا صحيحًا يبدأ بـ https:// أو http://.'); }
    } else if (type === 'wifi') {
      const ssid = wifiEscape(data.ssid), password = wifiEscape(data.password);
      if (!ssid) throw new Error('اسم شبكة Wi-Fi مطلوب.');
      const security = ['WPA','WEP','nopass'].includes(data.security) ? data.security : 'WPA';
      if (security !== 'nopass' && !password) throw new Error('أدخل كلمة مرور الشبكة أو اختر شبكة مفتوحة.');
      value = `WIFI:T:${security};S:${ssid};P:${security === 'nopass' ? '' : password};H:${data.hidden ? 'true' : 'false'};;`;
    } else if (type === 'vcard') {
      const name = vcardEscape(data.name), phone = vcardEscape(data.phone), email = vcardEscape(data.email);
      if (!name) throw new Error('اسم جهة الاتصال مطلوب.');
      value = ['BEGIN:VCARD','VERSION:3.0','FN:' + name,phone ? 'TEL:' + phone : '',email ? 'EMAIL:' + email : '', 'END:VCARD'].filter(Boolean).join('\r\n');
    } else throw new Error('نوع QR غير مدعوم.');
    if (!value) throw new Error('اكتب محتوى الرمز أولًا.');
    if (new TextEncoder().encode(value).length > textMax) throw new Error('البيانات طويلة جدًا. حاول تقليل النص لتسهيل مسح الرمز.');
    return value;
  }
  function contrast(hexA, hexB) {
    const lum = hex => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('لون غير صالح.');
      const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
      return rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055)/1.055)**2.4).reduce((a,v,i) => a + v * [.2126,.7152,.0722][i], 0);
    };
    const a = lum(hexA), b = lum(hexB);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }
  return { payload, contrast, wifiEscape, vcardEscape };
});

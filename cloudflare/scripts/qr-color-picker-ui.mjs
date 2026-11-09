/* V18.3: patch generated QR HTML only; original Vercel assets remain untouched. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const OLD = '<div class="v17-inline"><div class="v17-field"><label for="qrDark">لون الرمز</label><input id="qrDark" type="color" value="#111827"></div><div class="v17-field"><label for="qrLight">لون الخلفية</label><input id="qrLight" type="color" value="#ffffff"></div></div>';

const NEW = `<div class="v17-inline v17-color-fields">
  <div class="v17-field"><label for="qrDark">لون الرمز</label>
    <div class="v17-color-picker" style="--swatch-color:#111827"><span aria-hidden="true" class="v17-color-swatch"></span>
      <output id="qrDarkHex" class="v17-color-hex" for="qrDark">#111827</output>
      <span aria-hidden="true" class="v17-color-trigger">تغيير اللون</span>
      <input id="qrDark" type="color" value="#111827" aria-label="اختيار لون رمز QR">
    </div>
  </div>
  <div class="v17-field"><label for="qrLight">لون الخلفية</label>
    <div class="v17-color-picker" style="--swatch-color:#ffffff"><span aria-hidden="true" class="v17-color-swatch"></span>
      <output id="qrLightHex" class="v17-color-hex" for="qrLight">#FFFFFF</output>
      <span aria-hidden="true" class="v17-color-trigger">تغيير اللون</span>
      <input id="qrLight" type="color" value="#ffffff" aria-label="اختيار لون خلفية QR">
    </div>
  </div>
</div>
<div class="v17-quick-colors" role="group" aria-label="ألوان جاهزة لرمز QR">
  <button type="button" class="v17-color-preset" data-qr-preset="classic" aria-pressed="true"><span aria-hidden="true" class="v17-preset-dot" style="--preset-dark:#111827;--preset-light:#fff"></span>كلاسيكي</button>
  <button type="button" class="v17-color-preset" data-qr-preset="violet" aria-pressed="false"><span aria-hidden="true" class="v17-preset-dot" style="--preset-dark:#4c1d95;--preset-light:#f5f3ff"></span>بنفسجي</button>
  <button type="button" class="v17-color-preset" data-qr-preset="blue" aria-pressed="false"><span aria-hidden="true" class="v17-preset-dot" style="--preset-dark:#1e3a8a;--preset-light:#eff6ff"></span>أزرق</button>
</div>
<p id="qrContrastHint" class="v17-color-help" aria-live="polite">اللونان واضحان. اختبر QR بكاميرا الهاتف قبل طباعته.</p>`;

function replaceExactlyOnce(source, oldText, updated, description) {
  const count = source.split(oldText).length-1;
  if (count!==1) throw new Error(`DocMivo QR color picker: ${description}: expected 1 anchor, got ${count}`);
  return source.replace(oldText,updated);
}

export function updateQrPage(html) {
  if (html.includes('id="qrDarkHex"')) throw new Error('QR color picker already installed');
  let result=replaceExactlyOnce(html,OLD,NEW,'original palette');
  result=replaceExactlyOnce(result,'</head>','<link rel="stylesheet" href="../../assets/css/qr-color-picker.css?v=18.3"></head>','style import');
  result=replaceExactlyOnce(result,'</body>','<script src="../../assets/js/qr-color-picker.js?v=18.3"></script></body>','controller import');
  return result;
}
export function applyQrColorPicker(dist) {
  const page=path.join(dist,'tools/qr-code/index.html');
  for (const item of [page,path.join(dist,'assets/css/qr-color-picker.css'),path.join(dist,'assets/js/qr-color-picker.js')]) {
    if (!fs.existsSync(item)) throw new Error('QR color picker: missing file '+item);
  }
  fs.writeFileSync(page,updateQrPage(fs.readFileSync(page,'utf8')));
  console.log('DocMivo V18.3: compact QR color picker installed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyQrColorPicker(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist'));
}

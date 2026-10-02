# DocMivo — static PDF toolbox

نسخة إطلاق أولى جاهزة للنشر كموقع Static.

## تشغيل محلي
لا تفتح index.html مباشرة فقط؛ شغّل HTTP server حتى تعمل بعض المكتبات بشكل سليم:

```bash
python -m http.server 8000
```
ثم افتح http://localhost:8000

## قبل النشر
1. افتح `assets/js/config.js` وغيّر اسم الموقع والدومين والبريد.
2. استبدل `https://docmivo.vercel.app` بالدومين الحقيقي في ملفات HTML و robots.txt و sitemap.xml.
3. لا تضف AdSense Publisher ID قبل تجهيز الدومين وصفحات المحتوى والموافقة.
4. بعد قبول AdSense ضع `ca-pub-...` في `adsenseClient` داخل `config.js`.
5. استبدل `ads.txt` بالسطر الذي يقدمه Google.

## الأدوات الحالية
Merge, Split, Compress (raster), Rotate, Delete pages, Extract pages, Reorder pages, PDF→JPG, PDF→PNG, Images→PDF, Watermark, Page numbers, Extract text, OCR, PDF info, Remove metadata, Text→PDF.

## ملاحظات تقنية
- الأدوات تعمل Client-side باستخدام PDF-Lib وPDF.js وJSZip وTesseract.js وjsPDF عبر CDN.
- ضغط PDF الحالي يعيد رسم الصفحات كصور، وقد يفقد النص القابل للتحديد.
- OCR قد يكون بطيئًا على الهواتف القديمة.
- تحويلات Office/PDF عالية الدقة تحتاج backend متخصص أو WebAssembly إضافي، وهي المرحلة التالية بعد إطلاق النسخة الأولى.

## Vercel
المشروع Static بالكامل. في Vercel استخدم Project Name: `docmivo` وFramework Preset: `Other` واترك Build Command فارغًا وOutput Directory = `.`.

## رابط الإطلاق المستهدف
https://docmivo.vercel.app


## V2 status

DocMivo V2 contains 34 browser-based document/PDF tools. See `ROADMAP.md` for the high-fidelity conversion, security, batch, and AI roadmap.

DocMivo V18.4 — تحسين Compress PDF وOCR PDF (Cloudflare Only)
===========================================================

التحديث تراكمي: يحتاج أن تكون نسخة V18.3 مرفوعة بالفعل، كما هي حاليا في GitHub.

خطوات الرفع:
1) فك ضغط DocMivo_V18_4_Compress_OCR_Quality_Fix.zip.
2) افتح https://github.com/Gerges7/docmivo على فرع main.
3) Add file → Upload files.
4) ارفع مجلد cloudflare بالكامل مع الحفاظ على المسارات. يجب أن تظهر:
   cloudflare/package.json
   cloudflare/scripts/pdf-quality-hardening.mjs
   cloudflare/tests/pdf-quality-hardening.test.mjs
5) Commit changes. Cloudflare تعيد النشر تلقائيا إن الربط مفعل.
6) تأكد أن البناء نجح: Build = npm run test && npm run build ، Deploy = npx wrangler deploy.

ما يصلحه V18.4:
- Compress PDF: الوضع الذكي يبحث عن نص قابل للنسخ. إن وجد، يحاول إعادة حفظ PDF دون تحويله لصور. إذا لم يقل الحجم يعرض رسالة صريحة. إذا كان Scanned، يضغط الصفحات بصريا.
- خيار آخر «ضغط بصري بالصور» باختيار المستخدم صراحة (وقد يفقد النص).
- لا يتم تنزيل PDF أكبر على أنه «ضغط ناجح»، مع عرض نسبة توفير تقريبية.
- ذاكرة: تكييف دقة الرسم حسب حجم الصفحة وتحرير الذاكرة بعد كل صفحة.
- OCR: وضع ذكي يتخطى OCR للصفحات التي تحتوي طبقة نصية ويستخدم Tesseract لصفحات الصور فقط.
- OCR: عامل Tesseract واحد لكل ملف بدل إعادة التهيئة في كل صفحة ثم تحريره في النهاية.
- نتيجة OCR توضح بصدق أنها TXT وليس Searchable PDF.

اختبارات سريعة بعد Deploy:
A) https://getdocmivo.com/tools/compress-pdf
   - ارفع Operating V1.pdf (صفحة ممسوحة، ~6.81MiB): «ذكي»، جودة موصى بها، دقة متوازنة.
   - المتوقع: compressed.pdf أصغر، صفحة واحدة، مع بقاء النص كما كان (الأصل صورة بلا نص أصلا).
   - ارفع OS deff(1).pdf (16 صفحة نصية): «ذكي»؛ لا يجب تحويلها لصور. لو لم ينخفض الحجم، تظهر رسالة، وهذا سلوك صحيح.
B) https://getdocmivo.com/tools/ocr-pdf
   - Operating V1.pdf، اختر English ووضع «ذكي».
   - المتوقع: ملف ocr-text.txt يذكر Operating Systems و Questions for the Midterm Examination. راجع الأرقام والجداول يدويا.
   - merged.pdf (17 صفحة مختلطة) في الوضع الذكي: OCR للصفحة المصورة، واستخراج نص مباشر من 16 صفحة نصية.

تحذيرات:
* لم يتم تشغيل الاختبارات داخل متصفح Cloudflare حي من هذه البيئة. اختبارات البرمجيات 15/15 ناجحة (تتضمن محاكاة سلوك OCR/Compress).
* المحرك يعمل داخل المتصفح ويحمّل حزم Tesseract/اللغة عند أول استخدام؛ لا يرفع الملف إلى خادم DocMivo.
* إعادة الحفظ قد تؤثر على التوقيع الرقمي. احتفظ بالأصل.
* هذا التحديث لا يفعّل أدوات Word/Excel/PowerPoint أو Gemini ولا يحتاج Vercel أو Cloud Run.

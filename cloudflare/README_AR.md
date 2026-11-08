# DocMivo V18 — النقل التدريجي من Vercel إلى Cloudflare Workers

**تاريخ الحزمة: 9 نوفمبر 2026** | **حالة الإصدار: جاهز للرفع والاختبار، غير منشور على Cloudflare بعد.**

## ما الذي تنفّذه الحزمة؟

- تحويل استضافة HTML/CSS/JS والأدلة والأدوات إلى Cloudflare Workers Static Assets، مع الحفاظ على الروابط القديمة بدون trailing slash.
- الحفاظ على بقية المستودع كما هي: **كل التغييرات داخل مجلد واحد اسمه `cloudflare`**؛ وبالتالي لا نستبدل ملفات Vercel الأصلية أثناء الاختبار.
- إنشاء `/api/converter_token` في Worker بتوقيع HMAC مطابق لنسخة Python، ثم إعادة توجيه طلب التحويل عبر `/api/convert` إلى خدمة Cloud Run الموجودة (بدون مطالبة المتصفح بالاتصال مباشرة بمضيف مختلف).
- إنشاء `/api/ai` باستخدام Gemini REST API مع نفس نمط إجابة الواجهة الحالية. **الـAPI معطلة افتراضيًا** حتى تضيف المفاتيح وتختبر الحماية وتفعّلها.
- إصلاح مولّد QR بملفات محلية بدلاً من CDN مع دعم نص/رابط/Wi-Fi/vCard/PNG/SVG وإظهار روابط QR والصور في الرئيسية كتجربة Beta.
- منع نطاقات PDF غير الصحيحة، ومنع تنزيل ZIP فارغ ناتج عن نطاق خاطئ، ورفض الادعاء بأن ضغط PDF نجح لو الناتج أكبر من الأصل، والتحقق من نوع الملفات عند السحب.
- منع عرض الملفات المصدرية للخادم (`api/`, `cloudrun/`) ضمن مجلد ملفات الموقع العامة.
- إضافة 21 اختبارًا محليًا للـWorker والبناء وQR. **هذه لا تثبت أن كل الأدوات تعمل بجودة صحيحة على Production.**

## 1. ارفع ملفًا واحدًا بالطريقة المعتادة

1. فك ضغط `DocMivo_Cloudflare_V18_Upload_Folder_2026-11-09.zip`.
2. افتح `https://github.com/Gerges7/docmivo` على فرع `main`.
3. اختَر **Add file → Upload files** واسحب مجلد **`cloudflare`** بالكامل بمحتوياته (لا ترفع الـ ZIP نفسه).
4. راجع المسارات قبل Commit؛ لابد أن تظهر `cloudflare/wrangler.jsonc` و `cloudflare/src/worker.mjs` و `cloudflare/scripts/build-cloudflare.mjs`، **وليس** `cloudflare/cloudflare/...`.
5. اضغط **Commit changes**. هذه الملفات لا تغيّر `index.html` الأصلي أو `api/*.py` الأصلي، وتحافظ على Vercel كنقطة رجوع أثناء الترحيل.

## 2. اربط Cloudflare Git (بدون ربط الدومين الآن)

1. Cloudflare Dashboard → **Workers & Pages → Create application → Import Git repository** (المسميات قد تختلف قليلًا).
2. اختر GitHub repo `Gerges7/docmivo` وBranch = `main`.
3. **Worker name:** `docmivo-cloudflare`؛ الاسم لازم يطابق `wrangler.jsonc`.
4. **Root Directory:** `cloudflare` (مهم جدًا).
5. **Build Command:** `npm run test && npm run build`.
6. **Deploy Command:** `npx wrangler deploy`.
7. انشر أولًا على `docmivo-cloudflare.<account>.workers.dev`، **بدون ربط** `getdocmivo.com`.
8. افتح `/api/health` على رابط workers.dev: ستحصل على `ai:false` و`converter:false` حتى يتم تفعيل الخدمات؛ هذه حالة مقصودة وليست نجاحًا زائفًا.

**تنبيه مهم:** إذا تم تغيير اسم Worker في لوحة Cloudflare، غيّر `name` داخل `cloudflare/wrangler.jsonc` إلى الاسم نفسه أو استخدم الاسم المقترح أعلاه.

## 3. فعّل خدمات الـAPI بعد اختبار الواجهة

من Cloudflare Worker → Settings → Variables and Secrets:

| الاسم | النوع | القيمة | الملاحظات |
|---|---|---|---|
| `CONVERTER_API_URL` | Secret | عنوان HTTPS الحالي لخدمة Cloud Run (بدون `/convert`) | لا تُرسل الرابط السري في المحادثة إذا كان خاصًا |
| `CONVERTER_SHARED_SECRET` | Secret | **نفس القيمة الحالية** في Cloud Run / Vercel | لا تنشئ سرًا مختلفًا، وإلا سيفشل التوقيع |
| `CONVERTER_ENABLED` | Secret | `true` | فعّله بعد التأكد من إعداد السرين |
| `GEMINI_API_KEY` | Secret | مفتاح Gemini الحالي | لا تضعه في GitHub أو في HTML |
| `AI_ENABLED` | Secret | `true` | فعّله بعد ضبط حمايات المعدل والتكاليف |
| `GEMINI_MODEL` | Variable (اختياري) | نموذج تدعمه API ومتاح لمفتاحك | قيمة مبدئية موجودة في wrangler.jsonc |

**ملاحظة أمنية:** قبل تشغيل `AI_ENABLED=true`، أضف Cloudflare WAF/Rate Limiting rule تحمي `/api/ai` و`/api/converter_token` (أو Turnstile مدمج مع السيرفر)؛ الـWorker لا يحتوي على Rate Limiter موزع لأن ذلك يحتاج إعداد Cloudflare إضافيًا. لا تُفعّل الأدوات المكلفة للعامة بلا حماية.

**مهم:** هذه الحزمة لا تنقل Linux/LibreOffice/Tesseract/ocrmypdf إلى Worker؛ هذه الأدوات تظل في Google Cloud Run. نقلها يتطلب لاحقًا خدمة حاوية منفصلة أو Cloudflare Containers مع تدقيق للتكلفة والصلاحيات.

## 4. اختبارات إلزامية قبل لمس الدومين

- افتح صفحة رئيسية وأداة PDF وأداة QR وأداة صورة ودليلًا و`/ads.txt` و`/robots.txt` و`/sitemap.xml`، وتحقق أن كل ملف له HTTP 200.
- QR: اختبر PNG وSVG على الهاتف، عربي + رموز خاصة + Wi-Fi وvCard.
- PDF: دمج صفحتين، تقسيم، استخراج، حذف، إعادة ترتيب، إدخال نطاق خاطئ؛ قارن عدد الصفحات والملفات الناتجة.
- Compress: اختبر PDF نصيًا وآخر ممسوحًا؛ إذا زاد الحجم يجب أن تظهر رسالة خطأ بدل تنزيل نسخة أكبر، ولاحظ أن الضغط الحالي يعيد رسم الصفحات ويمكن أن يفقد قابلية تحديد النص.
- Word/Excel/PowerPoint: تحقق من نتيجة **مستندات حقيقية** بخطوط عربية وجداول وصور وصفحات أفقية وHeaders/Footers؛ لا تعتبر ملفًا مفتوحًا فقط دليلًا على صحة النتيجة.
- Cloud Run: اختبر وضع word_to_pdf وsearchable_ocr وpdfa من خلال `/api/converter_token` بعد تفعيله. انتبه أن الخدمات على Cloud Run قد تحتاج تعديل سياسة الوصول/السماح من Cloudflare.
- AI: GET `/api/ai` يجب أن يعلن `configured:true` بعد التفعيل؛ جرّب ملفًا غير حساس وسؤالًا، ولا تستخدم مستندات خاصة في الاختبار.
- افتح رابطًا **غير موجود** وتحقق من 404 حقيقي، وافحص عدم ظهور `/cloudrun/` و`/api/ai.py` كملفات عامة.
- تأكد أن `workers.dev` يعيد `X-Robots-Tag: noindex` لمنع الفهرسة المكررة أثناء الاختبار.

## 5. نقل الدومين فقط بعد نجاح الاختبارات

1. احتفظ بـVercel يعمل دون تغيير حتى الآن.
2. من Cloudflare أضف custom domain `getdocmivo.com` إلى Worker المستقر. تحقق من DNS قبل تغيير أي record؛ إذا DNS غير مُدار من Cloudflare، اتبع خطوات تفعيل Cloudflare DNS المناسبة للـdomain.
3. أضف `www.getdocmivo.com` أيضًا إن كان مُستخدَمًا؛ الـWorker يعيد توجيهه إلى الدومين الرئيسي برمز 301.
4. افحص 301/200 وcanonical على عينة من 20 URL، راقب Google Search Console والـAnalytics، واختبر Search Console URL Inspection.
5. لا تزل إعداد Vercel إلا بعد تأكيد عمل الدومين والأدوات والـAPI لمدة مستقرة، واحتفظ بنسخة رجوع.

## 6. Google AdSense

لا تطلب مراجعة جديدة لمجرد الانتقال من Vercel إلى Cloudflare. اقرأ `ADSENSE_QA_GATE_AR.md` وأكمل اختبارات الأدوات والمحتوى وSEO. لا يوجد ضمان للموافقة أو موعد انتظار ثابت. صفحات QR والصور التجريبية تحتوي `noindex` إلى أن تنجح الاختبارات الفعلية، وعندها يتم تجهيزها للفهرسة يدويًا.

## أوامر محلية (اختيارية)

من داخل مجلد `cloudflare` بعد وضعه في المستودع الأصلي:

```bash
npm install
npm test
npm run build
npx wrangler dev
```

**حالة التسليم:** 21/21 اختبار محلي ناجح + بناء Fixture آمن؛ لم ننشر على Cloudflare، ولم نختبر End-to-End على الدومين الحي، ولم نتحقق من جودة جميع تحويلات PDF/Office بعد. GitHub connector يرفض الكتابة (`403`) في هذا السياق، لذلك الرفع يجب أن يتم من GitHub UI أو بعد إصلاح صلاحيات الاتصال.

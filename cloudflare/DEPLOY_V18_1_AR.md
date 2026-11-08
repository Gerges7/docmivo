# DocMivo V18.1 — Cloudflare-only readiness patch

## الهدف
بما أن Google Cloud Run و Gemini AI غير مفعّلين، لا نعرض الأدوات التي تحتاجهما للمستخدمين كأنها جاهزة. نترك أدوات PDF المحلية والصور وQR ظاهرة، ونحافظ على موقع Vercel الحالي إلى أن يعمل الدومين على Cloudflare.

## الرفع
1. فكّ ضغط الحزمة وارفع مجلد `cloudflare/` إلى جذر `Gerges7/docmivo` على `main` باستخدام GitHub → Add file → Upload files.
2. تأكد أن الملفات تظهر كـ `cloudflare/package.json`, `cloudflare/scripts/cloudflare-only-cleanup.mjs`, `cloudflare/tests/cloudflare-only-cleanup.test.mjs`، وليست في `cloudflare/cloudflare/`.
3. سيشغّل Cloudflare بناء الموقع والاختبارات آليًا من نفس المستودع.
4. جرّب `/`، `/tools/merge-pdf`، `/tools/qr-code`، `/tools/image-resize`، `/tools/word-to-pdf`، `/tools/ask-pdf-ai` و`/sitemap.xml` من نطاق workers.dev. يجب أن تعرض الأدوات الموقوفة رسالة توقف بدل واجهة رفع ملفات، وأن يغيب رابطها من الرئيسية.

## نقل الدومين
1. في Cloudflare Websites/Domains تأكد من أن `getdocmivo.com` موجود في Zone بحالة Active؛ إن لم يكن أضفه واتبع تغيير Nameservers عند شركة تسجيل الدومين. راجع سجلات البريد MX/TXT قبل تغيير Nameservers.
2. في DNS تأكد أنه لا توجد سجلات CNAME قديمة تربط `getdocmivo.com` أو `www` بـ Vercel؛ احذف فقط السجلات المتعارضة بعد التأكد من جاهزية Zone، واحتفظ بسجلات البريد.
3. Workers & Pages → worker **docmivo** (اسمه كما يظهر بحسابك) → Settings → Domains & Routes → Add → Custom Domain → `getdocmivo.com`. أضف `www.getdocmivo.com` كذلك لتوجيهه تلقائيًا إلى الدومين الأساسي بواسطة worker.
4. افحص `https://getdocmivo.com/api/health` و`https://getdocmivo.com/robots.txt` و`https://getdocmivo.com/sitemap.xml` و`https://getdocmivo.com/ads.txt` وعينات من صفحات وأدوات الموقع.
5. **بعد التأكد من عمل الدومين والنتائج**: احذف دومين DocMivo من مشروع Vercel ثم احذف المشروع، وبعد مراجعة أن لديك نسخة من أي مشاريع Vercel أخرى، احذف الحساب من Vercel Account Settings.

## ملاحظات
- هذه ليست شهادة جودة لجميع أدوات PDF. لا تقدّم طلب AdSense قبل تدقيق الأدوات الباقية فعليًا.
- التحديث لا يحذف `api/` أو `cloudrun/` من GitHub، وإنما يمنع أدواتها المتوقفة من الظهور بوصفها خدمات جاهزة على موقع Cloudflare.
- لا تحذف الدومين من Registrar ولا تحذف حسابات Google أو AdSense أو Search Console عند حذف Vercel.
- هذه نسخة نشر مؤقتة قابلة للعكس: لإعادة تفعيل الخدمات لاحقًا، احذف خطوة `cloudflare-only-cleanup.mjs` من build script بعد نجاح الاختبار والتشغيل.

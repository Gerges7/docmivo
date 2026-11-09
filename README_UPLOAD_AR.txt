DocMivo V18.5 - Cloudflare-only quality patch
==============================================

1) فك الضغط.
2) في GitHub افتح Gerges7/docmivo على فرع main.
3) اضغط Add file > Upload files وارفع مجلد cloudflare بمحتوياته، مع الاحتفاظ بالمسارات.
4) التحديث يضيف/يحدث الملفات فقط:
   cloudflare/package.json
   cloudflare/scripts/pdf-images-text-quality.mjs
   cloudflare/tests/pdf-images-text-quality.test.mjs
5) Commit changes. بعد ذلك Cloudflare سيشغّل Build وDeploy إن بقيت الإعدادات الحالية مفعلة.
6) راجع Deployments وتأكد أن أحدث Commit يظهر Ready.
7) استخدم حزمة QA المنفصلة لاختبار الصور وExtract Text ثم أرسل النواتج للمقارنة.

هام: لا ترفع محتويات QA input إلى GitHub؛ هي عينات تجريبية وليست ضمن مصدر الموقع.
لا يتطلب التحديث تحديث wrangler.jsonc أو تغيير الدومين.

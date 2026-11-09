DocMivo V19.1 — Tool Content & SEO QA
====================================

الرفع على GitHub:
1. افتح ملف ZIP وفك الضغط.
2. افتح GitHub → Gerges7/docmivo → الفرع main → Add file → Upload files.
3. ارفع محتويات مجلد cloudflare بنفس ترتيب المجلدات، ولا تنقل الملفات إلى جذر المشروع.
4. وافق على استبدال cloudflare/package.json الحالي وأضف ملفات scripts وtests وQA report.
5. Commit changes، ثم راجع Cloudflare → docmivo → Deployments وتأكد من Ready.

الملفات التي يتم إضافتها/تحديثها:
- cloudflare/package.json
- cloudflare/scripts/editorial-wave2.mjs
- cloudflare/tests/editorial-wave2.test.mjs
- cloudflare/QA_REPORT_V19_1_AR.md

التحديث لا يغير DNS أو Email Routing أو رمز AdSense أو ملفات Vercel.
الأدوات التي تحتاج اختبارًا بعد النشر: PDF to JPG، PDF to WebP، Page Numbers.
مهم: لا تضغط Request review في AdSense حتى نفحص نواتج الأدوات والصفحات الباقية.

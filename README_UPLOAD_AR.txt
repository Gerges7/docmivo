DocMivo V18.9 — روابط الأدوات المتوقفة وشفافية المحتوى

1) افتح ملف ZIP وفك ضغطه.
2) ارفع مجلد cloudflare بمساراته إلى GitHub: Gerges7/docmivo > main > Add file > Upload files.
3) لا ترفع ZIP نفسه، ولا تضع ملفات scripts في جذر المستودع. المسار الصحيح: cloudflare/scripts/content-trust-hardening.mjs
4) حافظ على ملفات V18.8 الحالية؛ V18.9 إضافة فوقها وليس استبدالًا للمشروع كله.
5) انتظر Cloudflare Auto Deploy وراجع Build Logs وحالة Ready.
6) اختبر /guides/word-to-pdf-guide و/quality؛ اقرأ التقرير داخل cloudflare/QA_REPORT_V18_9_AR.md.

ملفات التحديث:
- cloudflare/package.json
- cloudflare/scripts/content-trust-hardening.mjs
- cloudflare/tests/content-trust-hardening.test.mjs
- cloudflare/QA_REPORT_V18_9_AR.md

مهم: 108/108 اختبارات بيئة تكامل محلية؛ لم يتم نشر التحديث أو إجراء اختبار Live بعد الرفع.

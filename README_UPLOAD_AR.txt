DocMivo V18.8 — تحديث مجمّع V18.7 Layout + V18.8 SEO/OCR

1) فك الضغط.
2) ارفع مجلد cloudflare بمحتوياته كما هو إلى:
   https://github.com/Gerges7/docmivo
   GitHub → Add file → Upload files → Commit changes on main.
3) ليس مطلوبًا نقل ملفات خارج cloudflare؛ Root Directory في Cloudflare مضبوط على cloudflare.
4) Cloudflare سيشغّل: npm run test && npm run build ثم npx wrangler deploy.
5) لو فشل Build، افتح Logs قبل محاولة تعديل أي إعدادات. هذا التحديث يتوقع بنية مشروع V18.6 الحالية.
6) افحص الرئيسية والـSitemap والـQR وResize وOCR بعد ظهور Ready.

مهم: الحزمة تحتوي V18.7 كذلك، لأن آخر نسخة رُصدت على GitHub كانت V18.6.
لا تغيّر سجلات DNS أو Vercel/Cloudflare Workers ولا تضع أي مفاتيح خاصة في GitHub.
اقرأ cloudflare/READINESS_AUDIT_V18_8_AR.md للمخاطر ونتائج الاختبارات.

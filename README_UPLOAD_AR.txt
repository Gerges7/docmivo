DocMivo V19.0 — GitHub Upload

1) فك ضغط ZIP.
2) افتح https://github.com/Gerges7/docmivo على branch: main.
3) اختر Add file > Upload files.
4) ارفع مجلد cloudflare بمحتوياته، محافظًا على المسارات الأصلية.
   لا تضع مجلدًا اسمه cloudflare داخل cloudflare الحالي.
5) Commit changes. Cloudflare سيبني النسخة تلقائيًا إذا بقي Git integration مفعلًا.
6) تأكد أن النشر Ready، ثم افتح:
   https://getdocmivo.com/tools/merge-pdf
   https://getdocmivo.com/tools/ocr-pdf
   https://getdocmivo.com/ads.txt

مهم: رفع ZIP كما هو مباشرة في المستودع لا يحدّث الملفات؛ فك الضغط أولًا.
ليس في الحزمة تغيير DNS أو Worker runtime أو أسرار أو حساب Vercel.

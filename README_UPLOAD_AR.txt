DocMivo V18.7 — تحسين الـLayout والموبايل، 9 نوفمبر 2026

الرفع على GitHub:
1) فك ضغط DocMivo_V18_7_Layout_UX_Upgrade.zip
2) افتح https://github.com/Gerges7/docmivo ثم main > Add file > Upload files.
3) ارفع المجلد cloudflare كاملًا مع الاحتفاظ بالمسارات كما هي.
4) وافق على استبدال cloudflare/package.json، وأضف الملفات الجديدة.
5) Commit changes على main ثم راجع Cloudflare Deployments.

ما بداخل ZIP:
- cloudflare/package.json (يضيف layout-quality.mjs آخر خطوة في البناء)
- cloudflare/scripts/layout-quality.mjs
- cloudflare/tests/layout-quality.test.mjs
- cloudflare/LAYOUT_AUDIT_V18_7_AR.md

لا ترفع ZIP نفسه كملف وحيد إلى GitHub؛ ارفع الملفات بعد فك الضغط.

التحقق بعد النشر:
- افتح getdocmivo.com: ستجد بداية سريعة و12 كارت وزر «عرض كل الأدوات».
- جرب البحث والتصنيف، وتأكد من إظهار جميع النتائج عند البحث.
- من الموبايل جرّب زر القائمة، ثم QR/image-resize وتأكّد من ظهور روابط التنقل.
- افتح /tools/word-to-pdf: الشكل موحّد مع DocMivo ورسالة واضحة.
- راجع أن دمج PDF وOCR لا يزالان ينفّذان العمل المعتاد.

تمت 87/87 اختبارات محلية وبناء تجريبي. لم نرفع إلى GitHub ولم ننشر إلى Cloudflare.
أي تغير غير متوقع في قوالب الموقع سيوقف البناء مع رسالة صريحة بدل تطبيق تعديل ناقص.

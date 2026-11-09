DocMivo V18.3 — QR Color Picker UI
================================
تحديث لواجهة اختيار الألوان في أداة QR على Cloudflare فقط.

1) فك الضغط.
2) افتح https://github.com/Gerges7/docmivo ثم Add file -> Upload files.
3) ارفع مجلد cloudflare بمحتوياته إلى جذر المستودع على main.
4) راجع أن الملفات ظهرت تحت cloudflare/ بالمسارات الصحيحة.
5) Commit changes. Cloudflare Git deployment يعيد النشر تلقائيًا.
6) امسح cache / Ctrl+F5 وافتح https://getdocmivo.com/tools/qr-code

بدلاً من الدوائر الملونة الكبيرة، ستظهر بطاقة لكل لون بها مربع عينة وكود HEX،
وثلاثة ألوان جاهزة (كلاسيكي، بنفسجي، أزرق). اللوحة الأصلية ما زالت تفتح
بالضغط على البطاقة، ويمكن الوصول لها بلوحة المفاتيح.

التغيير يعمل فقط على نسخة Cloudflare، ولا يغيّر QR encoder ولا Vercel.
يُضاف بعد مراحل البناء الحالية. الأدوات الأخرى لا تتغير.

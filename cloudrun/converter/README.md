# DocMivo Processing Service

خدمة خلفية واحدة للأدوات التي تحتاج معالجة أقوى من المتصفح. واجهة الموقع لا تعرض للمستخدم تفاصيل المحرك أو أكثر من وضع لنفس الأداة.

## ما الذي تنفذه الخدمة؟
- Word / Excel / PowerPoint → PDF عبر LibreOffice
- حماية / فتح / إصلاح PDF عبر pikepdf مع أدوات احتياطية
- Searchable OCR عبر OCRmyPDF + Tesseract
- PDF/A
- استخراج الصور المضمنة عبر PyMuPDF

الملفات تحفظ داخل مجلد مؤقت لكل طلب وتحذف بعد تجهيز النتيجة.
## V15.1 - DOCX font fidelity

Word-to-PDF now preprocesses a temporary DOCX copy before LibreOffice conversion. Western Office theme fonts are resolved to installed metric-compatible substitutes (for example Arial -> Arimo and Aptos/Calibri -> Carlito), while Arabic/complex-script theme selection is left intact to avoid breaking RTL shaping. Latin-only runs inside RTL paragraphs also receive the western font explicitly, which prevents digits and IDs from silently falling back to an unrelated complex-script font.

The original upload is never modified. The converter also creates a baseline PDF and automatically falls back to it if the font-fidelity candidate changes page count, page size, or line wrapping materially.


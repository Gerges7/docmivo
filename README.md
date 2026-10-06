# DocMivo V14 — Simplified Pro

V14 focuses on one clear experience per task:

- One visible tool per job — no Standard vs High Quality choices.
- The site chooses the best available processing path automatically.
- Technical implementation details are removed from the normal user interface.
- Advanced tools appear on the homepage only when the processing service is configured.
- AI tools use short, user-facing privacy language while provider details remain in the privacy policy.
- The processing service now uses Python libraries where they improve reliability:
  - `pikepdf` for encryption/decryption/repair when available.
  - `PyMuPDF` for embedded image extraction.
  - LibreOffice for Office → PDF fidelity.
  - OCRmyPDF + Tesseract for searchable OCR.

## Deployment

Upload the whole project to the existing GitHub repository and let Vercel redeploy.

The main website works without the external processing service. Word/Excel keep a browser fallback and automatically use the stronger service once it is configured. Advanced server-only tools stay hidden from the homepage until that service is available.

See `DEPLOY_PROCESSING_SERVICE.md` when you are ready to enable the advanced processing service.

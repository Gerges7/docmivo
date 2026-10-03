# DocMivo Conversion Engine

Containerized Python/LibreOffice service used by DocMivo for high-fidelity document conversion and heavier PDF operations.

## Capabilities

- Word / Excel / PowerPoint → PDF via LibreOffice headless
- Protect / unlock PDF via qpdf
- Repair PDF via qpdf with Ghostscript fallback
- Searchable OCR PDF via OCRmyPDF + Tesseract (Arabic + English)
- PDF/A via OCRmyPDF
- Extract embedded PDF images via `pdfimages`

All request files are written only to a per-request temporary directory and removed automatically when the request finishes.

## Deploy

Google Cloud Run requires a Google Cloud project and a valid billing account even when usage stays within the free tier. From this folder:

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
./deploy.sh
```

The script prints two values to add to Vercel:

- `CONVERTER_API_URL`
- `CONVERTER_SHARED_SECRET`

Redeploy DocMivo after adding them.

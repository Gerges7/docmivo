# DocMivo V13

V13 combines three processing layers in one product:

1. **Local browser tools** — 43 PDF utilities.
2. **DocMivo Conversion Engine** — Python/Cloud Run container using LibreOffice, qpdf, Ghostscript, OCRmyPDF, Tesseract and Poppler.
3. **DocMivo AI** — 11 Gemini-powered document tools through the Vercel Python API.

## Vercel environment variables

Required for AI:
- `GEMINI_API_KEY`
- optional `GEMINI_MODEL=gemini-3.5-flash-lite`

Required for the High Quality conversion engine after Cloud Run deployment:
- `CONVERTER_API_URL`
- `CONVERTER_SHARED_SECRET`

See `cloudrun/converter/README.md`.

## Privacy model

Local tools keep document processing in the browser where stated. High Quality/server tools upload temporarily to the DocMivo conversion service. AI tools send content to Google Gemini only after explicit user consent.

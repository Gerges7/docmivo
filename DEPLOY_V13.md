# Deploy DocMivo V13

## 1) Upload the website to GitHub / Vercel
Upload all V13 files over the existing `Gerges7/docmivo` repository and deploy as usual.

Existing AI environment variables stay the same:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
```

## 2) Deploy the High Quality conversion engine once
The high-quality tools require a container because LibreOffice/qpdf/OCRmyPDF cannot run inside the normal static browser site.

Open Google Cloud Shell, enter the converter folder, then run:

```bash
export PROJECT_ID="YOUR_GOOGLE_CLOUD_PROJECT_ID"
cd cloudrun/converter
./deploy.sh
```

Cloud Run requires a valid Google Cloud billing account even if usage remains within its free tier.

The script prints:

```text
CONVERTER_API_URL=https://....run.app
CONVERTER_SHARED_SECRET=...
```

Add both to **Vercel → Project → Settings → Environment Variables** for Production, then redeploy DocMivo.

Optional upload limit:

```text
CONVERTER_MAX_UPLOAD_BYTES=26214400
```

## 3) Verify after deploy
Open these endpoints/pages:

- `/api/ai` → should return `configured: true`
- `/api/converter_token` → should return `configured: true`
- `/tools/word-to-pdf` → High Quality status should show ready
- `/tools/searchable-ocr-pdf` → engine should show ready

## Important privacy distinction
- **Local**: file remains in browser where stated.
- **High Quality / Server**: file is uploaded temporarily to the DocMivo conversion engine, processed inside a request-scoped temporary directory, then deleted after the response is built.
- **AI**: file/text is sent to Google Gemini after explicit consent.

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-docmivo-converter}"
SECRET="${CONVERTER_SHARED_SECRET:-}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set PROJECT_ID first, e.g. export PROJECT_ID=my-gcp-project" >&2
  exit 1
fi
if [[ -z "$SECRET" ]]; then
  if command -v openssl >/dev/null 2>&1; then SECRET="$(openssl rand -hex 32)"; else SECRET="$(python - <<'PY'
import secrets; print(secrets.token_hex(32))
PY
)"; fi
  echo "Generated CONVERTER_SHARED_SECRET=$SECRET"
  echo "Save the same value in Vercel Environment Variables."
fi

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 2 \
  --max-instances 2 \
  --timeout 120 \
  --set-env-vars "CONVERTER_SHARED_SECRET=$SECRET,ALLOWED_ORIGINS=https://getdocmivo.com,MAX_UPLOAD_BYTES=26214400,CONVERT_TIMEOUT_SECONDS=110"

echo
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $URL"
echo "Add these Vercel environment variables:"
echo "CONVERTER_API_URL=$URL"
echo "CONVERTER_SHARED_SECRET=$SECRET"

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    HOME=/tmp/home

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    qpdf ghostscript poppler-utils \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara \
    ocrmypdf \
    fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

RUN mkdir -p /tmp/home /tmp/docmivo && chmod 1777 /tmp /tmp/home /tmp/docmivo
USER 65532:65532

ENV PORT=8080
CMD exec gunicorn --bind :${PORT} --workers 1 --threads 4 --timeout 125 app:app

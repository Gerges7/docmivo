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
    fontconfig \
    fonts-dejavu-core fonts-liberation \
    fonts-noto-core fonts-noto-extra \
    fonts-croscore fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*

# Metric-compatible substitutions for common Microsoft Office fonts.
# The second choice preserves Arabic shaping if the metric-compatible font
# does not contain the requested Arabic glyph.
RUN printf '%s\n' \
'<?xml version="1.0"?>' \
'<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">' \
'<fontconfig>' \
'  <alias><family>Aptos</family><prefer><family>Carlito</family><family>Arimo</family><family>DejaVu Sans</family></prefer></alias>' \
'  <alias><family>Aptos Display</family><prefer><family>Carlito</family><family>Arimo</family><family>DejaVu Sans</family></prefer></alias>' \
'  <alias><family>Arial</family><prefer><family>Arimo</family><family>DejaVu Sans</family></prefer></alias>' \
'  <alias><family>Arial Narrow</family><prefer><family>Arimo</family><family>DejaVu Sans Condensed</family></prefer></alias>' \
'  <alias><family>Calibri</family><prefer><family>Carlito</family><family>Arimo</family><family>DejaVu Sans</family></prefer></alias>' \
'  <alias><family>Cambria</family><prefer><family>Caladea</family><family>DejaVu Serif</family></prefer></alias>' \
'  <alias><family>Times New Roman</family><prefer><family>Tinos</family><family>Liberation Serif</family></prefer></alias>' \
'  <alias><family>Courier New</family><prefer><family>Cousine</family><family>Liberation Mono</family></prefer></alias>' \
'  <alias><family>Segoe UI</family><prefer><family>Carlito</family><family>DejaVu Sans</family></prefer></alias>' \
'</fontconfig>' > /etc/fonts/local.conf \
    && fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

RUN mkdir -p /tmp/home /tmp/docmivo && chmod 1777 /tmp /tmp/home /tmp/docmivo
USER 65532:65532

ENV PORT=8080
CMD ["sh", "-c", "exec gunicorn --bind :${PORT} --workers 1 --threads 4 --timeout 125 app:app"]

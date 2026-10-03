import base64
import hashlib
import hmac
import io
import json
import mimetypes
import os
import secrets
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from flask import Flask, Response, jsonify, make_response, request
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_BYTES', str(25 * 1024 * 1024)))

SHARED_SECRET = os.getenv('CONVERTER_SHARED_SECRET', '')
ALLOWED_ORIGINS = {
    x.strip().rstrip('/') for x in os.getenv(
        'ALLOWED_ORIGINS',
        'https://getdocmivo.com,http://localhost:3000,http://127.0.0.1:3000'
    ).split(',') if x.strip()
}
MAX_UPLOAD_BYTES = app.config['MAX_CONTENT_LENGTH']
TIMEOUT_SECONDS = int(os.getenv('CONVERT_TIMEOUT_SECONDS', '110'))

MODE_EXTENSIONS = {
    'word_to_pdf': {'.docx', '.doc', '.odt', '.rtf'},
    'excel_to_pdf': {'.xlsx', '.xls', '.ods', '.csv'},
    'powerpoint_to_pdf': {'.pptx', '.ppt', '.odp'},
    'protect_pdf': {'.pdf'},
    'unlock_pdf': {'.pdf'},
    'repair_pdf': {'.pdf'},
    'searchable_ocr': {'.pdf'},
    'pdfa': {'.pdf'},
    'extract_images': {'.pdf'},
}


def _b64url_decode(value: str) -> bytes:
    value += '=' * (-len(value) % 4)
    return base64.urlsafe_b64decode(value.encode())


def _verify_token(token: str, mode: str, size: int):
    if not SHARED_SECRET:
        raise PermissionError('converter secret missing')
    try:
        payload_b64, sig_b64 = token.split('.', 1)
        expected = hmac.new(SHARED_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
        actual = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected, actual):
            raise PermissionError('bad signature')
        payload = json.loads(_b64url_decode(payload_b64).decode('utf-8'))
    except Exception as exc:
        raise PermissionError('invalid token') from exc
    if int(payload.get('exp', 0)) < int(time.time()):
        raise PermissionError('expired token')
    if payload.get('mode') != mode:
        raise PermissionError('mode mismatch')
    if size > int(payload.get('max_size', MAX_UPLOAD_BYTES)):
        raise PermissionError('size mismatch')
    return payload


def _origin_ok():
    origin = (request.headers.get('Origin') or '').rstrip('/')
    return not origin or origin in ALLOWED_ORIGINS


def _cors(resp):
    origin = (request.headers.get('Origin') or '').rstrip('/')
    if origin in ALLOWED_ORIGINS:
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Vary'] = 'Origin'
    resp.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-DocMivo-Mode'
    resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    resp.headers['Access-Control-Expose-Headers'] = 'Content-Disposition, X-DocMivo-Temporary-Files'
    resp.headers['Cache-Control'] = 'no-store, max-age=0'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


@app.after_request
def after_request(resp):
    return _cors(resp)


@app.route('/health', methods=['GET', 'OPTIONS'])
def health():
    if request.method == 'OPTIONS':
        return ('', 204)
    bins = {name: bool(shutil.which(name)) for name in ['libreoffice', 'qpdf', 'gs', 'ocrmypdf', 'pdfimages']}
    return jsonify({'ok': True, 'service': 'docmivo-converter', 'binaries': bins, 'maxUploadBytes': MAX_UPLOAD_BYTES})


def _run(cmd, timeout=TIMEOUT_SECONDS, env=None):
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout).decode('utf-8', errors='replace')[-2500:]
        raise RuntimeError(msg or f'command failed: {cmd[0]}')
    return proc


def _office_to_pdf(src: Path, outdir: Path) -> Path:
    profile = outdir / ('lo-profile-' + secrets.token_hex(6))
    profile.mkdir(parents=True, exist_ok=True)
    cmd = [
        'libreoffice', '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
        f'-env:UserInstallation=file://{profile}', '--convert-to', 'pdf', '--outdir', str(outdir), str(src)
    ]
    _run(cmd)
    out = outdir / f'{src.stem}.pdf'
    if not out.exists() or out.stat().st_size < 500:
        candidates = sorted(outdir.glob('*.pdf'), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise RuntimeError('LibreOffice did not produce a PDF')
        out = candidates[0]
    return out


def _protect(src: Path, out: Path, user_password: str, owner_password: str):
    if not user_password:
        raise ValueError('password_required')
    owner_password = owner_password or secrets.token_urlsafe(18)
    _run(['qpdf', '--encrypt', user_password, owner_password, '256', '--', str(src), str(out)])


def _unlock(src: Path, out: Path, password: str):
    _run(['qpdf', f'--password={password}', '--decrypt', str(src), str(out)])


def _repair(src: Path, out: Path):
    try:
        _run(['qpdf', '--object-streams=generate', '--stream-data=compress', str(src), str(out)], timeout=70)
    except Exception:
        _run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
              f'-sOutputFile={out}', str(src)], timeout=100)


def _searchable_ocr(src: Path, out: Path, language: str):
    lang = language if language in {'eng', 'ara', 'ara+eng', 'eng+ara'} else 'ara+eng'
    _run(['ocrmypdf', '--skip-text', '--deskew', '--rotate-pages', '--optimize', '1', '-l', lang,
          str(src), str(out)], timeout=TIMEOUT_SECONDS)


def _pdfa(src: Path, out: Path):
    # OCRmyPDF creates standards-compliant PDF/A-2b by default when output-type is pdfa.
    _run(['ocrmypdf', '--skip-text', '--output-type', 'pdfa', '--optimize', '1', str(src), str(out)], timeout=TIMEOUT_SECONDS)


def _extract_images(src: Path, out_zip: Path):
    folder = out_zip.parent / 'images'
    folder.mkdir(exist_ok=True)
    prefix = folder / 'image'
    _run(['pdfimages', '-all', str(src), str(prefix)], timeout=70)
    files = [p for p in folder.iterdir() if p.is_file()]
    if not files:
        raise RuntimeError('No embedded images found')
    with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for p in files:
            zf.write(p, p.name)


def _download(path: Path, name: str, mimetype: str):
    # Read the finished result before the temporary directory is removed.
    # This avoids streaming from a path that disappears when the request exits.
    data = path.read_bytes()
    resp = make_response(data)
    resp.headers['Content-Type'] = mimetype
    safe_name = secure_filename(name) or 'docmivo-result'
    resp.headers['Content-Disposition'] = f'attachment; filename="{safe_name}"'
    resp.headers['Content-Length'] = str(len(data))
    resp.headers['X-DocMivo-Temporary-Files'] = 'deleted-after-response'
    return resp


@app.route('/convert', methods=['OPTIONS'])
def convert_options():
    return ('', 204)


@app.route('/convert', methods=['POST'])
def convert():
    if not _origin_ok():
        return jsonify({'ok': False, 'error': 'Origin غير مسموح.'}), 403
    mode = (request.form.get('mode') or request.headers.get('X-DocMivo-Mode') or '').strip()
    if mode not in MODE_EXTENSIONS:
        return jsonify({'ok': False, 'error': 'وضع المعالجة غير معروف.'}), 400
    upload = request.files.get('file')
    if not upload or not upload.filename:
        return jsonify({'ok': False, 'error': 'اختر ملفًا أولًا.'}), 400

    raw = upload.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        return jsonify({'ok': False, 'error': 'الملف أكبر من الحد الحالي.'}), 413
    token = (request.headers.get('Authorization') or '').replace('Bearer ', '', 1).strip()
    try:
        _verify_token(token, mode, len(raw))
    except PermissionError:
        return jsonify({'ok': False, 'error': 'جلسة التحويل غير صالحة أو انتهت.'}), 401

    filename = secure_filename(upload.filename) or 'document'
    ext = Path(filename).suffix.lower()
    if ext not in MODE_EXTENSIONS[mode]:
        return jsonify({'ok': False, 'error': 'امتداد الملف غير مدعوم لهذه الأداة.'}), 415

    with tempfile.TemporaryDirectory(prefix='docmivo-') as td:
        td_path = Path(td)
        src = td_path / ('input' + ext)
        src.write_bytes(raw)
        try:
            if mode in {'word_to_pdf', 'excel_to_pdf', 'powerpoint_to_pdf'}:
                out = _office_to_pdf(src, td_path)
                return _download(out, f'{Path(filename).stem}.pdf', 'application/pdf')
            if mode == 'protect_pdf':
                out = td_path / 'protected.pdf'
                _protect(src, out, request.form.get('password', ''), request.form.get('owner_password', ''))
                return _download(out, 'protected.pdf', 'application/pdf')
            if mode == 'unlock_pdf':
                out = td_path / 'unlocked.pdf'
                _unlock(src, out, request.form.get('password', ''))
                return _download(out, 'unlocked.pdf', 'application/pdf')
            if mode == 'repair_pdf':
                out = td_path / 'repaired.pdf'
                _repair(src, out)
                return _download(out, 'repaired.pdf', 'application/pdf')
            if mode == 'searchable_ocr':
                out = td_path / 'searchable-ocr.pdf'
                _searchable_ocr(src, out, request.form.get('language', 'ara+eng'))
                return _download(out, 'searchable-ocr.pdf', 'application/pdf')
            if mode == 'pdfa':
                out = td_path / 'pdfa.pdf'
                _pdfa(src, out)
                return _download(out, 'pdfa.pdf', 'application/pdf')
            if mode == 'extract_images':
                out = td_path / 'embedded-images.zip'
                _extract_images(src, out)
                return _download(out, 'embedded-images.zip', 'application/zip')
        except subprocess.TimeoutExpired:
            return jsonify({'ok': False, 'error': 'استغرقت العملية وقتًا أطول من المسموح. جرّب ملفًا أصغر.'}), 504
        except ValueError as exc:
            if str(exc) == 'password_required':
                return jsonify({'ok': False, 'error': 'اكتب كلمة المرور أولًا.'}), 400
            return jsonify({'ok': False, 'error': 'إعدادات غير صحيحة.'}), 400
        except Exception as exc:
            app.logger.exception('conversion failed')
            return jsonify({'ok': False, 'error': 'تعذر معالجة الملف. قد يكون تالفًا أو غير مدعوم.'}), 422

    return jsonify({'ok': False, 'error': 'تعذر إكمال العملية.'}), 500


@app.errorhandler(413)
def too_large(_):
    return _cors(make_response(jsonify({'ok': False, 'error': 'الملف أكبر من الحد الحالي.'}), 413))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '8080')))

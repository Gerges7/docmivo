import base64
import hashlib
import hmac
import html
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from flask import Flask, Response, jsonify, make_response, request
from werkzeug.utils import secure_filename

try:
    import pikepdf
except Exception:
    pikepdf = None
try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

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
    return jsonify({'ok': True, 'service': 'docmivo-converter', 'fontFidelity': 'v15.1-docx-theme-override', 'binaries': bins, 'maxUploadBytes': MAX_UPLOAD_BYTES})


def _run(cmd, timeout=TIMEOUT_SECONDS, env=None):
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout).decode('utf-8', errors='replace')[-2500:]
        raise RuntimeError(msg or f'command failed: {cmd[0]}')
    return proc


# Word theme fonts often name Microsoft-only families (Aptos, Arial, Calibri, ...).
# LibreOffice can substitute them differently from one Linux build to another.
# For DOCX only, V15.1 resolves the western/theme references to metric-compatible
# fonts that are installed in the container. Complex-script/Arabic font selection
# is deliberately left untouched so we do not disturb RTL shaping that is already
# close to the source document. The uploaded file itself is never modified.
_DOCX_LATIN_FONT_MAP = {
    'Arial': 'Arimo',
    'Arial Narrow': 'Arimo',
    'Aptos': 'Carlito',
    'Aptos Display': 'Carlito',
    'Calibri': 'Carlito',
    'Cambria': 'Caladea',
    'Times New Roman': 'Tinos',
    'Courier New': 'Cousine',
    'Segoe UI': 'Carlito',
}
_DOCX_THEME_WESTERN_MAP = {
    'minorBidi': 'Arimo',
    'majorBidi': 'Tinos',
    'minorHAnsi': 'Carlito',
    'majorHAnsi': 'Carlito',
    'minorAscii': 'Carlito',
    'majorAscii': 'Carlito',
}
_R_FONTS_TAG_RE = re.compile(r'<w:rFonts\b[^>]*>', re.IGNORECASE)
_A_LATIN_TAG_RE = re.compile(r'<a:latin\b[^>]*>', re.IGNORECASE)
_RUN_TAG_RE = re.compile(r'<w:r\b[^>]*>.*?</w:r>', re.IGNORECASE | re.DOTALL)
_TEXT_TAG_RE = re.compile(r'<w:t\b[^>]*>(.*?)</w:t>', re.IGNORECASE | re.DOTALL)
_ARABIC_CHAR_RE = re.compile(r'[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]')
_ASCII_ALNUM_RE = re.compile(r'[A-Za-z0-9]')


def _xml_attr(tag: str, attr: str):
    match = re.search(rf'\s+w:{re.escape(attr)}=([\"\'])(.*?)\1', tag, re.IGNORECASE)
    return match.group(2) if match else None


def _set_w_attr(tag: str, attr: str, value: str) -> str:
    pattern = re.compile(rf'(\s+w:{re.escape(attr)}=)([\"\']).*?\2', re.IGNORECASE)
    if pattern.search(tag):
        return pattern.sub(lambda m: f'{m.group(1)}{m.group(2)}{value}{m.group(2)}', tag, count=1)
    pos = tag.rfind('/>')
    if pos < 0:
        pos = tag.rfind('>')
    return tag[:pos] + f' w:{attr}="{value}"' + tag[pos:]


def _remove_w_attr(tag: str, attr: str) -> str:
    return re.sub(rf'\s+w:{re.escape(attr)}=([\"\']).*?\1', '', tag, flags=re.IGNORECASE)


def _patch_rfonts_tag(tag: str):
    original = tag
    for direct_attr in ('ascii', 'hAnsi'):
        current = _xml_attr(tag, direct_attr)
        mapped = _DOCX_LATIN_FONT_MAP.get(current or '')
        if mapped:
            tag = _set_w_attr(tag, direct_attr, mapped)

    for theme_attr, direct_attr in (('asciiTheme', 'ascii'), ('hAnsiTheme', 'hAnsi')):
        theme = _xml_attr(tag, theme_attr)
        mapped = _DOCX_THEME_WESTERN_MAP.get(theme or '')
        if mapped:
            tag = _set_w_attr(tag, direct_attr, mapped)
            tag = _remove_w_attr(tag, theme_attr)
    return tag, tag != original


def _patch_theme_latin_tag(tag: str):
    original = tag
    match = re.search(r'\s+typeface=([\"\'])(.*?)\1', tag, re.IGNORECASE)
    if not match:
        return tag, False
    current = match.group(2)
    mapped = _DOCX_LATIN_FONT_MAP.get(current)
    if not mapped:
        return tag, False
    tag = re.sub(
        r'(\s+typeface=)([\"\']).*?\2',
        lambda m: f'{m.group(1)}{m.group(2)}{mapped}{m.group(2)}',
        tag,
        count=1,
        flags=re.IGNORECASE,
    )
    return tag, tag != original


def _patch_latin_only_run(run_xml: str):
    # In RTL Word runs, LibreOffice may render even pure Latin text/digits using
    # the complex-script font. Resolve only those Latin-only runs. Arabic runs
    # keep their original complex-script/theme font to preserve shaping.
    text_parts = _TEXT_TAG_RE.findall(run_xml)
    if not text_parts:
        return run_xml, False
    text = html.unescape(''.join(re.sub(r'<[^>]+>', '', part) for part in text_parts))
    if _ARABIC_CHAR_RE.search(text) or not _ASCII_ALNUM_RE.search(text):
        return run_xml, False

    rfonts = _R_FONTS_TAG_RE.search(run_xml)
    if not rfonts:
        return run_xml, False
    tag = rfonts.group(0)
    western = _xml_attr(tag, 'ascii') or _xml_attr(tag, 'hAnsi')
    if not western:
        theme = _xml_attr(tag, 'asciiTheme') or _xml_attr(tag, 'hAnsiTheme')
        western = _DOCX_THEME_WESTERN_MAP.get(theme or '')
    if not western:
        return run_xml, False

    patched = _set_w_attr(tag, 'cs', western)
    patched = _remove_w_attr(patched, 'cstheme')
    patched = _remove_w_attr(patched, 'csTheme')
    if patched == tag:
        return run_xml, False
    return run_xml[:rfonts.start()] + patched + run_xml[rfonts.end():], True


def _prepare_docx_font_fidelity(src: Path, dest: Path):
    changed_tags = 0
    with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dest, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename.startswith('word/') and info.filename.endswith('.xml'):
                try:
                    text = data.decode('utf-8')
                except UnicodeDecodeError:
                    text = None
                if text is not None:
                    def rfonts_repl(match):
                        nonlocal changed_tags
                        patched, changed = _patch_rfonts_tag(match.group(0))
                        changed_tags += int(changed)
                        return patched

                    text = _R_FONTS_TAG_RE.sub(rfonts_repl, text)

                    # After western theme references are resolved, make sure
                    # Latin-only/digit runs inside RTL paragraphs do not fall
                    # back to the Arabic/complex-script substitute.
                    if info.filename.startswith('word/') and info.filename != 'word/theme/theme1.xml':
                        def run_repl(match):
                            nonlocal changed_tags
                            patched, changed = _patch_latin_only_run(match.group(0))
                            changed_tags += int(changed)
                            return patched
                        text = _RUN_TAG_RE.sub(run_repl, text)

                    if info.filename == 'word/theme/theme1.xml':
                        def latin_repl(match):
                            nonlocal changed_tags
                            patched, changed = _patch_theme_latin_tag(match.group(0))
                            changed_tags += int(changed)
                            return patched
                        text = _A_LATIN_TAG_RE.sub(latin_repl, text)
                    data = text.encode('utf-8')
            zout.writestr(info, data)

    # Validate the generated package before passing it to LibreOffice.
    with zipfile.ZipFile(dest, 'r') as check:
        if check.testzip() is not None or 'word/document.xml' not in check.namelist():
            raise RuntimeError('DOCX font-fidelity package validation failed')
    return changed_tags


def _libreoffice_convert(src: Path, workdir: Path) -> Path:
    workdir.mkdir(parents=True, exist_ok=True)
    profile = workdir / ('lo-profile-' + secrets.token_hex(6))
    profile.mkdir(parents=True, exist_ok=True)
    cmd = [
        'libreoffice', '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--norestore',
        f'-env:UserInstallation=file://{profile}', '--convert-to', 'pdf', '--outdir', str(workdir), str(src)
    ]
    _run(cmd)
    out = workdir / f'{src.stem}.pdf'
    if not out.exists() or out.stat().st_size < 500:
        candidates = sorted(workdir.glob('*.pdf'), key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            raise RuntimeError('LibreOffice did not produce a PDF')
        out = candidates[0]
    return out


def _pdf_layout_signature(path: Path):
    if fitz is None:
        return None
    doc = fitz.open(path)
    try:
        pages = []
        for page in doc:
            rect = page.rect
            text_dict = page.get_text('dict')
            line_count = 0
            for block in text_dict.get('blocks', []):
                if block.get('type') == 0:
                    line_count += len(block.get('lines', []))
            pages.append((round(rect.width, 1), round(rect.height, 1), line_count))
        return pages
    finally:
        doc.close()


def _font_fidelity_layout_safe(baseline: Path, candidate: Path) -> bool:
    base_sig = _pdf_layout_signature(baseline)
    cand_sig = _pdf_layout_signature(candidate)
    if base_sig is None or cand_sig is None:
        return True
    if len(base_sig) != len(cand_sig):
        return False
    for (bw, bh, blines), (cw, ch, clines) in zip(base_sig, cand_sig):
        if abs(bw - cw) > 1.0 or abs(bh - ch) > 1.0:
            return False
        # A font substitution that materially changes wrapping is more likely to
        # hurt fidelity than help it. Small changes are allowed.
        if abs(blines - clines) > max(2, int(max(blines, 1) * 0.08)):
            return False
    return True


def _office_to_pdf(src: Path, outdir: Path) -> Path:
    if src.suffix.lower() != '.docx':
        return _libreoffice_convert(src, outdir)

    # Keep a baseline conversion as an automatic safety net. This costs one
    # extra LibreOffice pass for DOCX, but prevents a font override from turning
    # a one-page document into two pages or changing the page geometry.
    baseline = _libreoffice_convert(src, outdir / 'baseline')
    try:
        patched_src = outdir / 'input-font-fidelity.docx'
        changed = _prepare_docx_font_fidelity(src, patched_src)
        if changed == 0:
            return baseline
        candidate = _libreoffice_convert(patched_src, outdir / 'font-fidelity')
        if _font_fidelity_layout_safe(baseline, candidate):
            app.logger.info('DOCX font fidelity applied (%s font tags)', changed)
            return candidate
        app.logger.warning('DOCX font fidelity rejected by layout guard; using baseline')
    except Exception:
        app.logger.exception('DOCX font fidelity preprocessing failed; using baseline')
    return baseline


def _protect(src: Path, out: Path, user_password: str, owner_password: str):
    if not user_password:
        raise ValueError('password_required')
    owner_password = owner_password or secrets.token_urlsafe(18)
    if pikepdf is not None:
        with pikepdf.open(src) as pdf:
            enc = pikepdf.Encryption(owner=owner_password, user=user_password, R=6, aes=True, metadata=True)
            pdf.save(out, encryption=enc, linearize=True)
        return
    _run(['qpdf', '--encrypt', user_password, owner_password, '256', '--', str(src), str(out)])


def _unlock(src: Path, out: Path, password: str):
    if pikepdf is not None:
        with pikepdf.open(src, password=password or '') as pdf:
            pdf.save(out, linearize=True)
        return
    _run(['qpdf', f'--password={password}', '--decrypt', str(src), str(out)])


def _repair(src: Path, out: Path):
    # pikepdf repairs many broken cross-reference tables automatically while opening.
    if pikepdf is not None:
        try:
            with pikepdf.open(src, attempt_recovery=True) as pdf:
                pdf.save(out, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate, linearize=True)
            if out.exists() and out.stat().st_size > 500:
                return
        except Exception:
            pass
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
    files = []
    if fitz is not None:
        seen = set()
        doc = fitz.open(src)
        try:
            for page_index in range(doc.page_count):
                page = doc.load_page(page_index)
                for img_index, info in enumerate(page.get_images(full=True), start=1):
                    xref = info[0]
                    if xref in seen:
                        continue
                    seen.add(xref)
                    data = doc.extract_image(xref)
                    ext = data.get('ext') or 'bin'
                    path = folder / f'page-{page_index+1}-image-{img_index}.{ext}'
                    path.write_bytes(data['image'])
                    files.append(path)
        finally:
            doc.close()
    if not files:
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

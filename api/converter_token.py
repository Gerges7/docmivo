import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque
from flask import Flask, jsonify, request

app = Flask(__name__)

API_URL = (os.getenv('CONVERTER_API_URL') or '').rstrip('/')
SHARED_SECRET = os.getenv('CONVERTER_SHARED_SECRET') or ''
MAX_SIZE = int(os.getenv('CONVERTER_MAX_UPLOAD_BYTES', str(25 * 1024 * 1024)))
TOKEN_TTL = 300
RATE_WINDOW = 600
RATE_MAX = 10
_hits = defaultdict(deque)
ALLOWED_MODES = {
    'word_to_pdf', 'excel_to_pdf', 'powerpoint_to_pdf', 'protect_pdf', 'unlock_pdf',
    'repair_pdf', 'searchable_ocr', 'pdfa', 'extract_images'
}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def _response(payload, status=200):
    r = jsonify(payload)
    r.status_code = status
    r.headers['Cache-Control'] = 'no-store, max-age=0'
    r.headers['X-Content-Type-Options'] = 'nosniff'
    return r


def _client_ip():
    fwd = request.headers.get('x-forwarded-for', '')
    return (fwd.split(',')[0].strip() if fwd else request.remote_addr) or 'unknown'


def _rate_limited():
    now = time.time()
    q = _hits[_client_ip()]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_MAX:
        return True
    q.append(now)
    return False


def _same_origin():
    origin = (request.headers.get('Origin') or '').rstrip('/')
    if not origin:
        return True
    own = f'{request.scheme}://{request.host}'.rstrip('/')
    return origin == own or origin.startswith('http://localhost:') or origin.startswith('http://127.0.0.1:')


def _configured():
    return bool(API_URL and SHARED_SECRET)


@app.route('/', methods=['GET'])
@app.route('/api/converter_token', methods=['GET'])
def health():
    return _response({'ok': True, 'configured': _configured(), 'maxUploadBytes': MAX_SIZE, 'modes': sorted(ALLOWED_MODES)})


@app.route('/', methods=['POST'])
@app.route('/api/converter_token', methods=['POST'])
def token():
    if not _same_origin():
        return _response({'ok': False, 'error': 'Origin غير مسموح.'}, 403)
    if _rate_limited():
        return _response({'ok': False, 'error': 'طلبات كثيرة في وقت قصير. انتظر قليلًا ثم جرّب مرة أخرى.'}, 429)
    if not _configured():
        return _response({'ok': False, 'configured': False, 'error': 'محرك التحويل عالي الجودة لم يتم تفعيله بعد.'}, 503)
    data = request.get_json(silent=True) or {}
    mode = str(data.get('mode') or '').strip()
    size = int(data.get('size') or 0)
    if mode not in ALLOWED_MODES:
        return _response({'ok': False, 'error': 'وضع التحويل غير معروف.'}, 400)
    if size <= 0 or size > MAX_SIZE:
        return _response({'ok': False, 'error': f'حجم الملف غير مسموح. الحد الحالي {MAX_SIZE // (1024*1024)} MB.'}, 413)

    payload = {
        'exp': int(time.time()) + TOKEN_TTL,
        'mode': mode,
        'max_size': size,
        'nonce': secrets.token_urlsafe(12),
    }
    payload_b64 = _b64url(json.dumps(payload, separators=(',', ':'), sort_keys=True).encode())
    signature = hmac.new(SHARED_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
    signed = payload_b64 + '.' + _b64url(signature)
    return _response({
        'ok': True,
        'configured': True,
        'uploadUrl': API_URL + '/convert',
        'healthUrl': API_URL + '/health',
        'token': signed,
        'expiresIn': TOKEN_TTL,
        'maxUploadBytes': MAX_SIZE,
    })

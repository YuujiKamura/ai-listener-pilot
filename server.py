"""
AI Listener Pilot - sidecar only.

Serves:
  - /save       POST webm → saves to chunks/, returns absolute path
  - /listener-dock.js (+ /listener-dock.css)  the dock widget for injection
                into photo-ai-lisp or any other host page
  - /           standalone test page (REC/STOP → shows what would be sent)

No PTY, no Gemini subprocess, no WebSocket. The actual terminal lives in
photo-ai-lisp (ghostty-web + ConPTY + /api/inject). This sidecar just stores
the audio and serves the dock.

Why separated: photo-ai-lisp already has a production-grade embedded terminal.
Rather than ship a second-rate xterm.js next to it, dock onto its /api/inject
endpoint (same pattern as its existing chat bar).

Prereq:
  pip install -r requirements.txt
Run:
  python server.py         # default port 8173
"""
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent
CHUNKS = ROOT / 'chunks'
CHUNKS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='')
# Allow any origin — the dock is loaded into photo-ai-lisp (:8090) and
# needs to POST back to us (:8173). Restrict in production if needed.
CORS(app)


@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


@app.route('/health')
def health():
    return jsonify({'ok': True, 'chunks_dir': str(CHUNKS)})


@app.route('/save', methods=['POST'])
def save():
    if 'audio' not in request.files:
        return jsonify({'error': 'no audio field'}), 400
    audio = request.files['audio']
    ext = request.form.get('ext', 'webm')
    rec_id = datetime.now().strftime('%H%M%S') + '_' + uuid.uuid4().hex[:4]
    rec_path = CHUNKS / f'rec_{rec_id}.{ext}'
    audio.save(str(rec_path))
    abs_path = str(rec_path.resolve()).replace('\\', '/')
    size_kb = rec_path.stat().st_size / 1024
    print(f'[{datetime.now():%H:%M:%S}] saved rec_{rec_id} ({size_kb:.1f} KB) → {abs_path}', flush=True)
    return jsonify({
        'ok': True,
        'id': rec_id,
        'abs_path': abs_path,
        'size_kb': round(size_kb, 1),
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8173))
    print(f'AI Listener sidecar on http://localhost:{port}', flush=True)
    print(f'  POST /save          → saves webm, returns abs_path', flush=True)
    print(f'  GET  /listener-dock.js  → self-installing dock widget', flush=True)
    print(f'  GET  /               → standalone test page', flush=True)
    print(f'Chunks dir: {CHUNKS}', flush=True)
    app.run(host='127.0.0.1', port=port, threaded=True)

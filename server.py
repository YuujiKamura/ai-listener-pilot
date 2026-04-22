"""
AI Listener Pilot - Flask server.

Receives 5-sec audio chunks from browser (webm/opus), invokes Gemini CLI
for musical analysis, returns JSON back. Non-realtime (~10-15s lag per chunk).

Prereq:
  - pip install flask
  - gemini CLI authenticated (`gemini` once manually to OAuth)

Run:
  python server.py
Browser: http://localhost:5173
"""
import json
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent
CHUNKS = ROOT / 'chunks'
CHUNKS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='')

# In-memory analysis history (pilot only — not persisted across restarts)
analyses: list[dict] = []
lock = threading.Lock()

PROMPT_TEMPLATE = (
    '@{rel_path} '
    'この音声を音楽的に解析して下記 JSON を一つだけ返せ. 解説テキストは書くな.\n'
    '{{\n'
    '  "key": "調性 (例: A minor / unknown)",\n'
    '  "bpm": 推定BPM整数 (不明は null),\n'
    '  "instruments": ["検出楽器"],\n'
    '  "melody": "旋律の概要 or 音名列 (例: E5-D5-C5-A4)",\n'
    '  "mood": "雰囲気 一言"\n'
    '}}'
)


def analyze_chunk(chunk_path: Path) -> str:
    """Invoke Gemini CLI on the chunk. Blocking. Returns raw stdout text."""
    rel_path = chunk_path.relative_to(ROOT).as_posix()
    prompt = PROMPT_TEMPLATE.format(rel_path=rel_path)
    cmd = ['gemini', '--yolo', '-p', prompt]
    try:
        result = subprocess.run(
            cmd,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=90,
            encoding='utf-8',
            errors='replace',
        )
        out = (result.stdout or '').strip()
        if not out:
            out = (result.stderr or '').strip() or '(empty response)'
        return out
    except subprocess.TimeoutExpired:
        return '(timeout after 90s)'
    except FileNotFoundError:
        return '(gemini CLI not found in PATH)'
    except Exception as e:
        return f'(error: {e})'


@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


@app.route('/chunk', methods=['POST'])
def upload_chunk():
    if 'audio' not in request.files:
        return jsonify({'error': 'no audio field'}), 400
    audio = request.files['audio']
    chunk_id = datetime.now().strftime('%H%M%S') + '_' + uuid.uuid4().hex[:4]
    ext = '.webm'
    chunk_path = CHUNKS / f'chunk_{chunk_id}{ext}'
    audio.save(str(chunk_path))
    size_kb = chunk_path.stat().st_size / 1024
    print(f'[{datetime.now():%H:%M:%S}] recv chunk_{chunk_id} ({size_kb:.1f} KB) → gemini...', flush=True)

    analysis_text = analyze_chunk(chunk_path)
    print(f'[{datetime.now():%H:%M:%S}] ← chunk_{chunk_id} done ({len(analysis_text)} chars)', flush=True)

    entry = {
        'id': chunk_id,
        'timestamp': datetime.now().isoformat(),
        'chunk_path': str(chunk_path.relative_to(ROOT)),
        'size_kb': round(size_kb, 1),
        'analysis': analysis_text,
    }
    with lock:
        analyses.append(entry)
    return jsonify(entry)


@app.route('/analyses')
def list_analyses():
    with lock:
        return jsonify(analyses[-50:])


@app.route('/health')
def health():
    return jsonify({'ok': True, 'count': len(analyses)})


if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 8173))
    print(f'AI Listener Pilot starting on http://localhost:{port}', flush=True)
    print(f'Chunks dir: {CHUNKS}', flush=True)
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

"""
AI Listener Pilot - Flask server.

User records a whole session in the browser. On STOP, the full webm/opus
blob is POSTed to /analyze. Server saves, then streams `gemini --yolo -p`
stdout back to the browser line-by-line (Transfer-Encoding: chunked) so
the response appears as a live terminal in the UI.

Prereq:
  - pip install flask
  - gemini CLI authenticated (`gemini` once manually to OAuth)

Run:
  python server.py                # default port 8173
  PORT=9000 python server.py      # custom port
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent
CHUNKS = ROOT / 'chunks'
CHUNKS.mkdir(exist_ok=True)

# Windows: `gemini` is usually gemini.cmd; shutil.which respects PATHEXT.
GEMINI_EXE = shutil.which('gemini') or shutil.which('gemini.cmd') or 'gemini'

app = Flask(__name__, static_folder='static', static_url_path='')

# In-memory history
history: list[dict] = []
lock = threading.Lock()

PROMPT_TEMPLATE = (
    '@{rel_path} '
    'この録音を音楽的に解析しろ. まず下記 JSON を一つ返し, その後に自由記述の解説を 3-5 行足せ.\n'
    '```json\n'
    '{{\n'
    '  "duration_sec": 実測秒,\n'
    '  "key": "調性 (例: A minor)",\n'
    '  "bpm": 推定BPM整数 or null,\n'
    '  "instruments": ["検出楽器"],\n'
    '  "melody": "旋律の概要 or 主な音名列",\n'
    '  "mood": "雰囲気一言",\n'
    '  "genre": "ジャンル推定"\n'
    '}}\n'
    '```\n'
    '解説は「構成」「聴きどころ」「気になった点」等を自由に.'
)


@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


@app.route('/health')
def health():
    with lock:
        n = len(history)
    return jsonify({'ok': True, 'gemini_exe': GEMINI_EXE, 'history_count': n})


@app.route('/analyze', methods=['POST'])
def analyze_stream():
    """Save uploaded audio, invoke gemini --yolo -p, stream stdout back."""
    if 'audio' not in request.files:
        return jsonify({'error': 'no audio field'}), 400

    audio = request.files['audio']
    rec_id = datetime.now().strftime('%H%M%S') + '_' + uuid.uuid4().hex[:4]
    rec_path = CHUNKS / f'rec_{rec_id}.webm'
    audio.save(str(rec_path))
    size_kb = rec_path.stat().st_size / 1024
    print(f'[{datetime.now():%H:%M:%S}] recv rec_{rec_id} ({size_kb:.1f} KB) → gemini streaming...', flush=True)

    rel_path = rec_path.relative_to(ROOT).as_posix()
    prompt = PROMPT_TEMPLATE.format(rel_path=rel_path)

    def generate():
        # Header lines (rendered as if CLI banner)
        yield f'$ gemini --yolo -p "@{rel_path} ..."\n'
        yield f'# rec_{rec_id} · {size_kb:.1f} KB\n'
        yield '# streaming Gemini stdout below:\n'
        yield '─' * 60 + '\n'

        try:
            proc = subprocess.Popen(
                [GEMINI_EXE, '--yolo', '-p', prompt],
                cwd=str(ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                bufsize=1,  # line-buffered
            )
        except FileNotFoundError:
            yield f'\n[ERROR] gemini CLI not found. PATH={os.environ.get("PATH","")[:200]}...\n'
            return
        except Exception as e:
            yield f'\n[ERROR] failed to spawn gemini: {e}\n'
            return

        collected = []
        assert proc.stdout is not None
        for line in proc.stdout:
            collected.append(line)
            yield line

        proc.wait()
        yield '\n' + '─' * 60 + '\n'
        yield f'# gemini exited with code {proc.returncode}\n'

        entry = {
            'id': rec_id,
            'timestamp': datetime.now().isoformat(),
            'rec_path': str(rec_path.relative_to(ROOT)),
            'size_kb': round(size_kb, 1),
            'gemini_output': ''.join(collected),
            'exit_code': proc.returncode,
        }
        with lock:
            history.append(entry)

    return Response(generate(), mimetype='text/plain; charset=utf-8', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',  # disable nginx buffering if behind proxy
    })


@app.route('/history')
def list_history():
    with lock:
        return jsonify(history[-20:])


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8173))
    print(f'AI Listener Pilot on http://localhost:{port}', flush=True)
    print(f'gemini exe: {GEMINI_EXE}', flush=True)
    print(f'Chunks dir: {CHUNKS}', flush=True)
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

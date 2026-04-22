"""
AI Listener Pilot - Flask server with persistent Gemini session via deckpilot.

Why persistent: Gemini CLI `--yolo` non-interactive mode is disabled by org
policy (`disableYolo`), so `gemini -p` spawned each request fails with exit
52. Instead we reuse an existing interactive Gemini session kept alive in a
Ghostty window, driven via the deckpilot CLI.

Flow:
  Browser records audio (any length) → on STOP, POSTs webm to /analyze →
  Flask saves to chunks/ → sends "@abs/path/to/chunk.webm ...prompt..." to
  the persistent Gemini session via `deckpilot send` → polls
  `deckpilot show` every 500ms for buffer growth → streams the diff back to
  the browser as plain-text chunked response. Idle detection via `[idle]`
  marker at top of buffer.

Prereq:
  - pip install flask
  - deckpilot daemon running
  - One ghostty-* session with `gemini` already started + authenticated
  - That session ID passed via GEMINI_SESSION env var (default: auto-detect
    first idle ghostty or fall back to ghostty-119148)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent
CHUNKS = ROOT / 'chunks'
CHUNKS.mkdir(exist_ok=True)

DECKPILOT_EXE = shutil.which('deckpilot') or shutil.which('deckpilot.cmd') or 'deckpilot'

# Poll interval (sec) for deckpilot show. Shorter = more responsive streaming.
POLL_SEC = 0.5
# Max wait for Gemini response (sec)
MAX_WAIT_SEC = 180
# Min time after send before we check for [idle] (Gemini may flash idle briefly before
# actually processing). Wait at least this many seconds before accepting idle.
MIN_ACTIVE_SEC = 3


def _run(args: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    """Run subprocess, return (code, stdout, stderr).

    deckpilot prints the session status marker ([idle]/[active]/[stalled])
    to stderr, buffer content to stdout — keep them separate.
    """
    try:
        r = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout,
            encoding='utf-8', errors='replace',
        )
        return r.returncode, r.stdout or '', r.stderr or ''
    except subprocess.TimeoutExpired:
        return -1, '', '(timeout)'
    except FileNotFoundError:
        return -2, '', f'(not found: {args[0]})'


def deck_list() -> str:
    _, out, _ = _run([DECKPILOT_EXE, 'list'])
    return out


def deck_show(session: str) -> tuple[str, str]:
    """Return (buffer_text, status_line). status is e.g. '[idle]' or '[active]'."""
    _, buf, status = _run([DECKPILOT_EXE, 'show', session])
    return buf, status.strip()


def deck_send(session: str, msg: str) -> tuple[int, str]:
    code, out, err = _run([DECKPILOT_EXE, 'send', session, msg], timeout=15)
    return code, out + err


def detect_gemini_session() -> str | None:
    """Find an idle/stalled ghostty session that appears to be running Gemini."""
    env_sess = os.environ.get('GEMINI_SESSION', '').strip()
    if env_sess:
        return env_sess
    listing = deck_list()
    # Prefer idle > stalled; skip dead
    idle_candidates = []
    stalled_candidates = []
    for line in listing.splitlines():
        parts = line.split()
        if len(parts) < 5 or not parts[0].startswith('ghostty-'):
            continue
        status = parts[-1].lower()
        if status == 'idle':
            idle_candidates.append(parts[0])
        elif status == 'stalled':
            stalled_candidates.append(parts[0])
    for cand in idle_candidates + stalled_candidates:
        # Heuristic: check that the buffer contains "Gemini" banner
        buf, _status = deck_show(cand)
        if 'gemini' in buf.lower() or 'GEMINI_OK' in buf:
            return cand
    return None


GEMINI_SESSION = detect_gemini_session()

app = Flask(__name__, static_folder='static', static_url_path='')

history: list[dict] = []
lock = threading.Lock()

PROMPT_TEMPLATE = (
    '@{abs_path} '
    'この録音を音楽的に解析して以下の形式で返せ (他のテキストは書かない). 完了したら最後に ===DONE=== と書け.\n'
    '```json\n'
    '{{\n'
    '  "duration_sec": 実測秒,\n'
    '  "key": "調性 (例: A minor)",\n'
    '  "bpm": 推定BPM整数 or null,\n'
    '  "instruments": ["検出楽器"],\n'
    '  "melody": "旋律の音名列 or 概要",\n'
    '  "mood": "雰囲気",\n'
    '  "genre": "ジャンル推定"\n'
    '}}\n'
    '```\n'
    '構成・聴きどころ・気になった点を 3-5 行で自由記述. 最後に ===DONE===.'
)


@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


@app.route('/health')
def health():
    sess = GEMINI_SESSION
    sess_ok = False
    sess_status = ''
    if sess:
        _buf, sess_status = deck_show(sess)
        sess_ok = sess_status in ('[idle]', '[active]', '[stalled]')
    with lock:
        n = len(history)
    return jsonify({
        'ok': True,
        'deckpilot': DECKPILOT_EXE,
        'gemini_session': sess,
        'session_status': sess_status,
        'session_responsive': sess_ok,
        'history_count': n,
    })


def stream_gemini(rec_path: Path, rec_id: str, size_kb: float):
    """Generator: yields text chunks as Gemini processes the audio."""
    yield f'# rec_{rec_id} · {size_kb:.1f} KB · session={GEMINI_SESSION}\n'

    if not GEMINI_SESSION:
        yield '\n[ERROR] no gemini session detected. Start one via:\n'
        yield '  1. Launch ghostty → gemini inside it\n'
        yield '  2. Re-run server with GEMINI_SESSION=ghostty-NNNNN python server.py\n'
        return

    abs_path = str(rec_path.resolve()).replace('\\', '/')
    prompt = PROMPT_TEMPLATE.format(abs_path=abs_path)

    # Snapshot buffer length before sending
    before_buf, _ = deck_show(GEMINI_SESSION)
    baseline_len = len(before_buf)

    yield f'$ deckpilot send {GEMINI_SESSION} "@{abs_path} ..."\n'
    yield '─' * 60 + '\n'

    code, resp = deck_send(GEMINI_SESSION, prompt)
    if code != 0:
        yield f'\n[ERROR send] code={code} out={resp}\n'
        return

    # Poll deckpilot show, stream the diff
    start = time.time()
    yielded_len = baseline_len
    saw_done = False
    last_buf = ''

    while time.time() - start < MAX_WAIT_SEC:
        time.sleep(POLL_SEC)
        buf, status = deck_show(GEMINI_SESSION)
        if len(buf) > yielded_len:
            new_text = buf[yielded_len:]
            # Remove trailing partial lines to avoid fragmented yields
            last_nl = new_text.rfind('\n')
            if last_nl > 0:
                yield new_text[:last_nl + 1]
                yielded_len += last_nl + 1
        last_buf = buf

        elapsed = time.time() - start
        if elapsed < MIN_ACTIVE_SEC:
            continue

        # Completion signals:
        # 1. buffer has ===DONE=== marker (we asked Gemini to emit it)
        # 2. OR status is [idle] (session returned to prompt — Gemini finished)
        if '===DONE===' in buf:
            saw_done = True
        if status == '[idle]' and (saw_done or elapsed > 15):
            break

    # Final flush of any remaining bytes
    if len(last_buf) > yielded_len:
        yield last_buf[yielded_len:]

    yield '\n' + '─' * 60 + '\n'
    yield f'# elapsed {time.time() - start:.1f}s · {"DONE" if saw_done else "TIMEOUT"}\n'

    entry = {
        'id': rec_id,
        'timestamp': datetime.now().isoformat(),
        'rec_path': str(rec_path.relative_to(ROOT)),
        'size_kb': round(size_kb, 1),
        'session': GEMINI_SESSION,
        'elapsed_sec': round(time.time() - start, 1),
        'completed': saw_done,
    }
    with lock:
        history.append(entry)


@app.route('/analyze', methods=['POST'])
def analyze_stream():
    if 'audio' not in request.files:
        return jsonify({'error': 'no audio field'}), 400
    audio = request.files['audio']
    rec_id = datetime.now().strftime('%H%M%S') + '_' + uuid.uuid4().hex[:4]
    rec_path = CHUNKS / f'rec_{rec_id}.webm'
    audio.save(str(rec_path))
    size_kb = rec_path.stat().st_size / 1024
    print(f'[{datetime.now():%H:%M:%S}] /analyze rec_{rec_id} ({size_kb:.1f} KB) → {GEMINI_SESSION}', flush=True)

    return Response(
        stream_gemini(rec_path, rec_id, size_kb),
        mimetype='text/plain; charset=utf-8',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@app.route('/history')
def list_history():
    with lock:
        return jsonify(history[-20:])


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8173))
    print(f'AI Listener Pilot on http://localhost:{port}', flush=True)
    print(f'deckpilot: {DECKPILOT_EXE}', flush=True)
    print(f'Gemini session: {GEMINI_SESSION or "(none detected)"}', flush=True)
    print(f'Chunks dir: {CHUNKS}', flush=True)
    if not GEMINI_SESSION:
        print('WARN: no Gemini session detected. /analyze will return an error.', flush=True)
        print('      Start one with `ghostty` then `gemini`, and set GEMINI_SESSION env var.', flush=True)
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

"""
AI Listener Pilot - Flask server owning a persistent Gemini PTY.

Design:
  - Server spawns one `gemini` process in a ConPTY (pywinpty) at startup.
  - A WebSocket endpoint (/pty) bridges the PTY master to xterm.js in the
    browser so the user can SEE Gemini running live.
  - POST /analyze receives a webm recording, saves it, then writes the
    prompt (with absolute @path) directly into the PTY stdin. The response
    renders in the embedded terminal automatically (via the PTY broadcast).

No deckpilot, no ghostty, no --yolo. Just one long-lived Gemini process
under Flask's control.

Prereq:
  - pip install -r requirements.txt
  - gemini CLI installed + authenticated (`gemini` manually once for OAuth)
"""
import json
import os
import shutil
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_sock import Sock

import winpty  # pywinpty 2.x / 3.x, Windows only

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).parent
CHUNKS = ROOT / 'chunks'
CHUNKS.mkdir(exist_ok=True)

GEMINI_EXE = shutil.which('gemini') or shutil.which('gemini.cmd') or 'gemini'

app = Flask(__name__, static_folder='static', static_url_path='')
sock = Sock(app)

# ---- PTY lifecycle ----
pty_proc: 'winpty.PtyProcess | None' = None
pty_lock = threading.Lock()
ws_clients: set = set()  # connected browser WebSockets
clients_lock = threading.Lock()
pty_buffer: bytes = b''          # last N bytes, to replay on new WS connect
BUFFER_CAP = 64 * 1024           # 64 KB scrollback replay
buffer_lock = threading.Lock()


def spawn_pty() -> 'winpty.PtyProcess':
    """Spawn gemini inside a ConPTY."""
    print(f'[pty] spawning {GEMINI_EXE} …', flush=True)
    proc = winpty.PtyProcess.spawn(
        [GEMINI_EXE],
        dimensions=(30, 120),  # rows, cols
    )
    print(f'[pty] spawned pid={proc.pid}', flush=True)
    return proc


def pty_reader_thread():
    """Read PTY output forever; broadcast to all WebSocket clients."""
    global pty_buffer
    while True:
        try:
            data = pty_proc.read(4096)
        except Exception as e:
            print(f'[pty] reader EOF: {e}', flush=True)
            break
        if not data:
            time.sleep(0.02)
            continue
        # data is str on pywinpty 3.x; coerce to bytes
        if isinstance(data, str):
            data_bytes = data.encode('utf-8', errors='replace')
        else:
            data_bytes = data
        with buffer_lock:
            pty_buffer = (pty_buffer + data_bytes)[-BUFFER_CAP:]
        with clients_lock:
            dead = []
            for ws in ws_clients:
                try:
                    ws.send(data_bytes)
                except Exception:
                    dead.append(ws)
            for d in dead:
                ws_clients.discard(d)


def pty_write(text: str):
    """Write to Gemini stdin. Accepts str, encodes to bytes."""
    if pty_proc is None:
        return
    with pty_lock:
        pty_proc.write(text)


# ---- Routes ----
@app.route('/')
def root():
    return send_from_directory('static', 'index.html')


@app.route('/health')
def health():
    alive = pty_proc is not None and pty_proc.isalive()
    return jsonify({
        'ok': True,
        'gemini_exe': GEMINI_EXE,
        'pty_alive': alive,
        'pty_pid': pty_proc.pid if pty_proc else None,
        'ws_clients': len(ws_clients),
        'buffer_bytes': len(pty_buffer),
    })


@sock.route('/pty')
def pty_ws(ws):
    """Bidirectional bridge: PTY output ↔ browser keystrokes."""
    # Replay buffered scrollback so new viewers see current Gemini state
    with buffer_lock:
        if pty_buffer:
            ws.send(pty_buffer)
    with clients_lock:
        ws_clients.add(ws)
    try:
        while True:
            msg = ws.receive()
            if msg is None:
                break
            # Browser → Gemini stdin
            if isinstance(msg, (bytes, bytearray)):
                msg = msg.decode('utf-8', errors='replace')
            pty_write(msg)
    except Exception as e:
        print(f'[ws] client gone: {e}', flush=True)
    finally:
        with clients_lock:
            ws_clients.discard(ws)


@app.route('/analyze', methods=['POST'])
def analyze():
    """Save audio, inject the analysis prompt into the live Gemini PTY."""
    if 'audio' not in request.files:
        return jsonify({'error': 'no audio field'}), 400
    audio = request.files['audio']
    rec_id = datetime.now().strftime('%H%M%S') + '_' + uuid.uuid4().hex[:4]
    rec_path = CHUNKS / f'rec_{rec_id}.webm'
    audio.save(str(rec_path))
    size_kb = rec_path.stat().st_size / 1024
    abs_path = str(rec_path.resolve()).replace('\\', '/')

    prompt = (
        f'@{abs_path} この録音を音楽的に解析しろ. '
        f'JSON (key/bpm/instruments/melody/mood/genre) を返して, '
        f'構成・聴きどころ・気になった点を 3-5 行で自由記述. 最後に ===DONE===.'
    )
    print(f'[{datetime.now():%H:%M:%S}] /analyze rec_{rec_id} ({size_kb:.1f} KB) → PTY write', flush=True)

    if pty_proc is None or not pty_proc.isalive():
        return jsonify({'error': 'PTY not alive — check server logs'}), 500

    # Write prompt + Enter. All output goes through the PTY broadcast to WS.
    pty_write(prompt + '\r')
    return jsonify({
        'ok': True,
        'id': rec_id,
        'size_kb': round(size_kb, 1),
        'abs_path': abs_path,
    })


@app.route('/pty/key', methods=['POST'])
def send_key():
    """Send a raw key sequence (used by UI buttons like Enter / Ctrl-C)."""
    data = request.get_json(silent=True) or {}
    k = data.get('key', '')
    if not k:
        return jsonify({'error': 'no key'}), 400
    pty_write(k)
    return jsonify({'ok': True})


# ---- Boot ----
def boot_pty():
    global pty_proc
    pty_proc = spawn_pty()
    t = threading.Thread(target=pty_reader_thread, daemon=True)
    t.start()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8173))
    print(f'AI Listener Pilot on http://localhost:{port}', flush=True)
    print(f'gemini exe: {GEMINI_EXE}', flush=True)
    print(f'chunks dir: {CHUNKS}', flush=True)
    boot_pty()
    # threaded=False → Flask-Sock works best single-threaded for WS; Werkzeug handles concurrency
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

// ============================================================
// xterm.js + WebSocket to Flask PTY
// ============================================================
const term = new Terminal({
  cols: 120,
  rows: 30,
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 13,
  theme: {
    background: '#000',
    foreground: '#9f9',
    cursor: '#ffcc44',
  },
  cursorBlink: true,
  convertEol: true,
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
setTimeout(() => fitAddon.fit(), 100);
window.addEventListener('resize', () => fitAddon.fit());

const termStats = document.getElementById('term-stats');
let ws = null;
let wsBytes = 0;

function connectPtyWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/pty`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { termStats.textContent = 'connected'; };
  ws.onclose = () => { termStats.textContent = 'disconnected — reconnecting…'; setTimeout(connectPtyWs, 2000); };
  ws.onerror = (e) => console.warn('ws error', e);
  ws.onmessage = (ev) => {
    const data = ev.data;
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      wsBytes += bytes.length;
      term.write(bytes);
    } else {
      wsBytes += data.length;
      term.write(data);
    }
    termStats.textContent = `${wsBytes} bytes recv`;
  };
}
connectPtyWs();

// Browser keystrokes → server → PTY stdin
term.onData((data) => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
});

// Helper buttons
document.getElementById('btn-esc').onclick = () => ws && ws.send('\x1b');
document.getElementById('btn-ctrlc').onclick = () => ws && ws.send('\x03');
document.getElementById('btn-clear').onclick = () => term.clear();

// ============================================================
// Recording: getDisplayMedia → MediaRecorder → POST /analyze
// ============================================================
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const statusEl = document.getElementById('status');
const meterBar = document.getElementById('meter-bar');
const durationEl = document.getElementById('duration');

let stream = null;
let recorder = null;
let audioCtx = null;
let analyser = null;
let meterRAF = null;
let durationTimer = null;
let recordStartTime = 0;
let recordedChunks = [];

async function start() {
  statusEl.textContent = '音声共有の許可ダイアログを開きます…';
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (e) {
    statusEl.textContent = `許可失敗: ${e.message}`;
    return;
  }
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    statusEl.textContent = '⚠ 音声トラックなし. 「音声も共有」チェック入れた?';
    stream.getTracks().forEach(t => t.stop());
    return;
  }
  stream.getVideoTracks().forEach(t => t.stop());
  const audioOnly = new MediaStream(audioTracks);

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(audioOnly);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  runMeter();

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  recorder = new MediaRecorder(audioOnly, { mimeType: mime });
  recordedChunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: mime });
    await uploadAnalyze(blob);
  };

  recorder.start();
  recordStartTime = Date.now();
  startDurationTimer();
  startBtn.disabled = true;
  startBtn.classList.add('rec');
  stopBtn.disabled = false;
  statusEl.textContent = '● REC 中. 音を鳴らして. STOP で Gemini にプロンプト送信.';
}

function stop() {
  if (!recorder || recorder.state === 'inactive') return;
  recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (meterRAF) { cancelAnimationFrame(meterRAF); meterRAF = null; }
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  meterBar.style.width = '0%';
  stream = null;
  startBtn.disabled = false;
  startBtn.classList.remove('rec');
  stopBtn.disabled = true;
  statusEl.textContent = '⏫ アップロード中…';
}

async function uploadAnalyze(blob) {
  const sizeKb = (blob.size / 1024).toFixed(1);
  const fd = new FormData();
  fd.append('audio', blob, `rec_${Date.now()}.webm`);
  try {
    const resp = await fetch('/analyze', { method: 'POST', body: fd });
    const json = await resp.json();
    if (json.ok) {
      statusEl.textContent = `✓ ${sizeKb} KB → Gemini PTY に投入 (id=${json.id}). ターミナルで応答を確認.`;
    } else {
      statusEl.textContent = `⚠ /analyze エラー: ${json.error || JSON.stringify(json)}`;
    }
  } catch (err) {
    statusEl.textContent = `⚠ アップロード失敗: ${err.message}`;
  }
}

function runMeter() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const loop = () => {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128);
      if (v > peak) peak = v;
    }
    meterBar.style.width = Math.min(100, peak / 128 * 200).toFixed(1) + '%';
    meterRAF = requestAnimationFrame(loop);
  };
  loop();
}

function startDurationTimer() {
  const tick = () => {
    const sec = Math.floor((Date.now() - recordStartTime) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    durationEl.textContent = `${mm}:${ss}`;
  };
  tick();
  durationTimer = setInterval(tick, 500);
}

startBtn.onclick = start;
stopBtn.onclick = stop;

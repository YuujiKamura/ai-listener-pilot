const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const statusEl = document.getElementById('status');
const meterBar = document.getElementById('meter-bar');
const durationEl = document.getElementById('duration');
const terminalEl = document.getElementById('terminal');
const termStatsEl = document.getElementById('term-stats');

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
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
  } catch (e) {
    statusEl.textContent = `許可失敗: ${e.message}`;
    return;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    statusEl.textContent = '⚠ 音声トラックなし. 共有ダイアログで「音声も共有」チェックを入れた?';
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  stream.getVideoTracks().forEach(t => t.stop());
  const audioOnly = new MediaStream(audioTracks);

  // Meter
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(audioOnly);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  runMeter();

  // Recorder — no timeslice, so ondataavailable fires once on stop with full blob
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
    await uploadAndStream(blob);
  };

  recorder.start();
  recordStartTime = Date.now();
  startDurationTimer();
  startBtn.disabled = true;
  startBtn.classList.add('rec');
  stopBtn.disabled = false;
  statusEl.textContent = '● REC 中. 音を鳴らして. STOP で解析開始.';
  terminalEl.classList.remove('empty');
  terminalEl.textContent = '';
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
  statusEl.textContent = '⏫ Gemini にアップロード → ストリーミング解析中...';
}

async function uploadAndStream(blob) {
  const sizeKb = (blob.size / 1024).toFixed(1);
  termStatsEl.textContent = `${sizeKb} KB uploaded · waiting for gemini...`;
  terminalEl.textContent = '';
  terminalEl.classList.remove('empty');

  const fd = new FormData();
  fd.append('audio', blob, `rec_${Date.now()}.webm`);

  let resp;
  try {
    resp = await fetch('/analyze', { method: 'POST', body: fd });
  } catch (err) {
    statusEl.textContent = `upload 失敗: ${err.message}`;
    appendTerminal(`\n[NETWORK ERROR] ${err.message}\n`, 'err');
    return;
  }

  if (!resp.ok || !resp.body) {
    statusEl.textContent = `HTTP ${resp.status}`;
    appendTerminal(`\n[HTTP ${resp.status}] ${await resp.text()}\n`, 'err');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const startTime = Date.now();
  let totalBytes = 0;

  showCursor();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    const text = decoder.decode(value, { stream: true });
    appendTerminal(text);
    termStatsEl.textContent = `${sizeKb} KB uploaded · ${totalBytes} B received · ${((Date.now()-startTime)/1000).toFixed(1)}s elapsed`;
  }
  const flush = decoder.decode();
  if (flush) appendTerminal(flush);
  hideCursor();
  statusEl.textContent = `解析完了 (${((Date.now()-startTime)/1000).toFixed(1)}s)`;
}

function appendTerminal(text, cls) {
  // Strip trailing cursor before appending
  const cursor = terminalEl.querySelector('.cursor');
  if (cursor) cursor.remove();
  if (cls) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    terminalEl.appendChild(span);
  } else {
    terminalEl.appendChild(document.createTextNode(text));
  }
  terminalEl.scrollTop = terminalEl.scrollHeight;
  showCursor();
}

function showCursor() {
  if (terminalEl.querySelector('.cursor')) return;
  const c = document.createElement('span');
  c.className = 'cursor';
  terminalEl.appendChild(c);
}

function hideCursor() {
  const c = terminalEl.querySelector('.cursor');
  if (c) c.remove();
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

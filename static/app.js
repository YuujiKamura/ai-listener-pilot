const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const statusEl = document.getElementById('status');
const feed = document.getElementById('feed');
const meterBar = document.getElementById('meter-bar');

let stream = null;
let recorder = null;
let audioCtx = null;
let analyser = null;
let meterRAF = null;
let pendingUploads = 0;

const CHUNK_MS = 5000; // 5-second chunks

async function start() {
  statusEl.textContent = '音声共有の許可ダイアログを開きます…';
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Chrome requires video:true, we discard it after
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

  // Discard video track — we only want audio
  stream.getVideoTracks().forEach(t => t.stop());

  const audioOnly = new MediaStream(audioTracks);

  // Meter (immediate visual feedback that audio is flowing)
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(audioOnly);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  runMeter();

  // MediaRecorder → 5秒チャンクを /chunk へ POST
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  recorder = new MediaRecorder(audioOnly, { mimeType: mime });

  recorder.ondataavailable = async (e) => {
    if (!e.data || e.data.size === 0) return;
    const fd = new FormData();
    fd.append('audio', e.data, `chunk_${Date.now()}.webm`);
    pendingUploads++;
    updateStatus();
    try {
      const resp = await fetch('/chunk', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      appendEntry(json);
    } catch (err) {
      appendError(err.message);
    } finally {
      pendingUploads--;
      updateStatus();
    }
  };

  recorder.start(CHUNK_MS);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  updateStatus('🎧 録音中. 5秒毎に Gemini に送信.');
}

function stop() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (meterRAF) { cancelAnimationFrame(meterRAF); meterRAF = null; }
  meterBar.style.width = '0%';
  stream = null;
  recorder = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus('stopped');
}

function updateStatus(override) {
  if (override) {
    statusEl.textContent = pendingUploads > 0
      ? `${override} (解析中 ×${pendingUploads})`
      : override;
    return;
  }
  statusEl.textContent = pendingUploads > 0
    ? `🎧 録音中 · Gemini 解析中 (キュー ${pendingUploads})`
    : '🎧 録音中. 次チャンク待ち…';
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

function appendEntry(entry) {
  const div = document.createElement('div');
  div.className = 'entry';
  const ts = new Date(entry.timestamp).toLocaleTimeString('ja-JP');
  const raw = entry.analysis || '';
  // Try to pretty-print JSON if Gemini returned valid JSON
  let body = raw;
  let bodyClass = '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      body = JSON.stringify(parsed, null, 2);
      bodyClass = 'json-ok';
    } catch { /* not valid json, show raw */ }
  }
  if (raw.startsWith('(')) bodyClass = 'err';
  div.innerHTML = `
    <div class="entry-head">
      <span class="ts">${escapeHtml(ts)}</span>
      <span class="id">chunk ${escapeHtml(entry.id)}</span>
      <span class="size">${entry.size_kb} KB</span>
    </div>
    <pre class="${bodyClass}">${escapeHtml(body)}</pre>
  `;
  feed.insertBefore(div, feed.firstChild);
}

function appendError(msg) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.innerHTML = `<div class="entry-head"><span class="ts">${new Date().toLocaleTimeString('ja-JP')}</span></div><pre class="err">upload error: ${escapeHtml(msg)}</pre>`;
  feed.insertBefore(div, feed.firstChild);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

startBtn.onclick = start;
stopBtn.onclick = stop;

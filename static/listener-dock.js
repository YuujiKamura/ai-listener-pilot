// listener-dock.js — Self-installing floating audio listener dock.
//
// Loaded into a host page (photo-ai-lisp or similar) via:
//   <script src="http://localhost:8173/listener-dock.js"></script>
//
// Creates a floating widget (top-right) with REC/STOP + meter. On STOP:
//   1. Uploads the webm recording to the sidecar (this script's origin) /save
//   2. Gets back an absolute file path
//   3. Calls the host page's /api/inject endpoint (relative URL — same-origin
//      with the host) to feed "@<abs_path> ..." into the host's PTY.
//   4. A 400ms gap later, injects "\n" to submit — this 2-phase pattern
//      matches photo-ai-lisp's chat bar send() and avoids the Gemini CLI
//      quirk where "text\r" is treated as newline, not submit.

(function () {
  if (window.__listenerDockInstalled) return;
  window.__listenerDockInstalled = true;

  // Derive sidecar origin from this <script>'s src — supports being loaded
  // from any port while the host page may be on a different port.
  const thisScript = document.currentScript
    || document.querySelector('script[src*="listener-dock.js"]');
  const SIDECAR = thisScript
    ? new URL(thisScript.src).origin
    : 'http://localhost:8173';

  const AGENT_SUBMIT_GAP_MS = 400;  // matches photo-ai-lisp chat-bar delay

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    #ear-dock {
      position: fixed; top: 12px; right: 12px; z-index: 9999;
      background: rgba(26,26,30,0.96);
      border: 1px solid #7c6fe0; border-radius: 8px;
      padding: 10px 12px; width: 260px;
      font-family: -apple-system, 'Segoe UI', sans-serif;
      font-size: 12px; color: #e6e6ea;
      box-shadow: 0 6px 24px rgba(0,0,0,0.6);
    }
    #ear-dock .title {
      font-weight: 700; color: #7c6fe0; font-size: 10px;
      text-transform: uppercase; letter-spacing: 1px;
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px;
    }
    #ear-dock .title .close { cursor: pointer; color: #8a8a94; font-size: 14px; }
    #ear-dock .title .close:hover { color: #e6e6ea; }
    #ear-dock .row { display: flex; align-items: center; gap: 4px; }
    #ear-dock button {
      background: #15151a; color: #e6e6ea;
      border: 1px solid #33333a; border-radius: 4px;
      padding: 4px 10px; font-size: 11px; cursor: pointer;
      font-family: inherit;
    }
    #ear-dock button:hover:not(:disabled) { border-color: #7c6fe0; }
    #ear-dock button:disabled { opacity: 0.4; cursor: not-allowed; }
    #ear-dock button.rec { color: #f77; border-color: #743; }
    #ear-dock button.rec.active {
      background: #400; animation: ear-pulse 1s infinite;
    }
    @keyframes ear-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.4); }
      50% { box-shadow: 0 0 0 6px rgba(255,68,68,0); }
    }
    #ear-dock .duration {
      color: #ffcc44; font-variant-numeric: tabular-nums;
      margin-left: auto; font-size: 11px;
    }
    #ear-dock .meter {
      height: 8px; background: #0a0a0f;
      border: 1px solid #33333a; border-radius: 2px;
      margin-top: 8px; overflow: hidden;
    }
    #ear-dock .meter-bar {
      height: 100%; background: linear-gradient(90deg, #4fd, #ffcc44, #f44);
      width: 0%; transition: width 50ms;
    }
    #ear-dock .status {
      color: #8a8a94; margin-top: 8px; font-size: 10px;
      line-height: 1.4; min-height: 2.4em;
      border-top: 1px solid #2a2a33; padding-top: 6px;
    }
    #ear-dock .status.ok { color: #73daca; }
    #ear-dock .status.err { color: #f7768e; }
    #ear-toggle {
      position: fixed; top: 12px; right: 12px; z-index: 10000;
      background: #1a1a1f; color: #7c6fe0;
      border: 1px solid #7c6fe0; border-radius: 50%;
      width: 32px; height: 32px; cursor: pointer;
      display: none; align-items: center; justify-content: center;
      font-size: 16px; padding: 0;
    }
    #ear-toggle:hover { background: #7c6fe0; color: #1a1a1f; }
  `;
  document.head.appendChild(style);

  // ---- DOM ----
  const dock = document.createElement('div');
  dock.id = 'ear-dock';
  dock.innerHTML = `
    <div class="title">
      <span>🎧 EAR · LISTENER</span>
      <span class="close" id="ear-close" title="hide">×</span>
    </div>
    <div class="row">
      <button class="rec" id="ear-rec">● REC</button>
      <button id="ear-stop" disabled>■ STOP</button>
      <span class="duration" id="ear-dur">00:00</span>
    </div>
    <div class="meter"><div class="meter-bar" id="ear-meter"></div></div>
    <div class="status" id="ear-status">REC → share tab with audio → STOP to send to terminal</div>
  `;
  document.body.appendChild(dock);

  const toggle = document.createElement('button');
  toggle.id = 'ear-toggle'; toggle.textContent = '🎧';
  toggle.title = 'show listener';
  document.body.appendChild(toggle);

  const recBtn = dock.querySelector('#ear-rec');
  const stopBtn = dock.querySelector('#ear-stop');
  const statusEl = dock.querySelector('#ear-status');
  const meterEl = dock.querySelector('#ear-meter');
  const durEl = dock.querySelector('#ear-dur');
  dock.querySelector('#ear-close').onclick = () => {
    dock.style.display = 'none'; toggle.style.display = 'flex';
  };
  toggle.onclick = () => {
    dock.style.display = 'block'; toggle.style.display = 'none';
  };

  // ---- State ----
  let stream = null, recorder = null, audioCtx = null, analyser = null;
  let meterRAF = null, durTimer = null, recordStartTime = 0;
  let recordedChunks = [];

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.classList.remove('ok', 'err');
    if (cls) statusEl.classList.add(cls);
  }

  // ---- Injection to host page's /api/inject ----
  async function injectToHost(text) {
    const url = '/api/inject?text=' + encodeURIComponent(text);
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
  }

  async function injectTwoPhase(textBody) {
    // Phase 1: paste text (no line terminator)
    await injectToHost(textBody);
    // Phase 2: submit (bare LF; server normalises to CR for PTY)
    await new Promise(r => setTimeout(r, AGENT_SUBMIT_GAP_MS));
    await injectToHost('\n');
  }

  // ---- Recording lifecycle ----
  async function startRec() {
    setStatus('requesting screen share with audio...');
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, audio: true,
      });
    } catch (e) {
      setStatus('denied: ' + e.message, 'err'); return;
    }
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      setStatus('⚠ no audio track — did you check "Share audio"?', 'err');
      stream.getTracks().forEach(t => t.stop()); return;
    }
    stream.getVideoTracks().forEach(t => t.stop());
    const audioOnly = new MediaStream(audioTracks);

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(audioOnly);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 512;
    src.connect(analyser); runMeter();

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    recorder = new MediaRecorder(audioOnly, { mimeType: mime });
    recordedChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: mime });
      await uploadAndInject(blob);
    };
    recorder.start();

    recordStartTime = Date.now();
    durTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - recordStartTime) / 1000);
      durEl.textContent =
        `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    }, 500);

    recBtn.classList.add('active'); recBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('● recording — play music');
  }

  function stopRec() {
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    if (meterRAF) { cancelAnimationFrame(meterRAF); meterRAF = null; }
    if (durTimer) { clearInterval(durTimer); durTimer = null; }
    meterEl.style.width = '0%';
    stream = null;
    recBtn.classList.remove('active'); recBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus('⏫ uploading...');
  }

  async function uploadAndInject(blob) {
    const sizeKb = (blob.size / 1024).toFixed(1);
    const fd = new FormData();
    fd.append('audio', blob, 'rec.webm');

    let saved;
    try {
      const resp = await fetch(SIDECAR + '/save', { method: 'POST', body: fd });
      saved = await resp.json();
    } catch (e) {
      setStatus('⚠ upload failed: ' + e.message + ' (is sidecar running on ' + SIDECAR + '?)', 'err');
      return;
    }
    if (!saved.ok) {
      setStatus('⚠ save error: ' + (saved.error || 'unknown'), 'err');
      return;
    }

    const cmd = `@${saved.abs_path} この録音を音楽解析しろ. JSON (key/bpm/instruments/melody/mood/genre) を返して, 構成と聴きどころを 3-5 行で自由記述.`;

    setStatus(`✓ ${saved.size_kb} KB saved · injecting to terminal...`);
    try {
      await injectTwoPhase(cmd);
      setStatus(`→ prompt sent (${saved.size_kb} KB, id=${saved.id}). watch terminal for response.`, 'ok');
    } catch (e) {
      setStatus('⚠ /api/inject failed: ' + e.message + '. is the host page (photo-ai-lisp) running?', 'err');
    }
  }

  function runMeter() {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128);
        if (v > peak) peak = v;
      }
      meterEl.style.width = Math.min(100, peak / 128 * 200).toFixed(1) + '%';
      meterRAF = requestAnimationFrame(loop);
    };
    loop();
  }

  recBtn.onclick = startRec;
  stopBtn.onclick = stopRec;

  console.log('[ear-dock] installed. sidecar=' + SIDECAR);
})();

import { WarningGate } from './detection.js';
import { AudioWindowBuffer } from './audio-window.js';

// V1.1 configuration: paste the real Google Forms responder URL between the quotes.
// Leave empty until the form is ready. No audio or scores are appended to this URL.
const FEEDBACK_FORM_URL = '';
const EN = Object.freeze({
  "検知を停止しました": "Detection stopped",
  "停止中": "Stopped",
  "開始すると、周囲の交通警告音を\nこの端末で識別します。": "Start to identify nearby traffic warning\nsounds on this device.",
  "AIモデルを読み込み中...": "Loading AI model...",
  "準備中": "Preparing",
  "初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。": "The first load may take a moment.\nPlease allow microphone access.",
  "マイクの音を確認中...": "Checking microphone audio...",
  "最初の音声をAIで解析しています。": "AI is analysing the first audio window.",
  "周囲の音を検知中...": "Listening to your surroundings...",
  "検知中": "Listening",
  "交通警告音を検知すると、\n画面が赤く変わります。": "The screen turns red when a\ntraffic warning sound is detected.",
  "警告音を検知しました": "Warning sound detected",
  "周囲を確認してください": "Check your surroundings",
  "検知を開始": "Start detection",
  "検知を停止": "Stop detection",
  "読み込みを中止": "Cancel loading",
  "識別スコア：": "Classification score: ",
  "自転車のベル": "Bicycle bell",
  "車のクラクション": "Car horn",
  "サイレン": "Siren",
  "サイレン（パトカー）": "Police siren",
  "サイレン（救急車）": "Ambulance siren",
  "サイレン（消防車）": "Fire engine siren",
  "マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。": "Microphone access is not allowed. In Safari’s page menu → Website Settings, allow the microphone, then start again.",
  "マイクが見つかりません。接続を確認して、もう一度開始してください。": "No microphone was found. Check the connection, then start again.",
  "マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。": "The microphone is unavailable. End any calls or other recording apps, then start again.",
  "マイクを使用できるHTTPSのページをSafariで直接開いてください。": "Open the HTTPS page directly in Safari to use the microphone.",
  "音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。": "Audio analysis could not start. Reload the page, then try again.",
  "AIの解析が中断しました。もう一度開始してください。": "AI analysis was interrupted. Please start again.",
  "音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "Audio analysis is falling behind. Close other apps, then start again.",
  "音声の取得が遅れています。もう一度開始してください。": "Audio capture is falling behind. Please start again.",
  "AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "AI analysis is falling behind. Close other apps, then start again.",
  "マイクの音声処理が停止しました。もう一度開始してください。": "Microphone audio processing stopped. Please start again.",
  "このSafariでは音声を取得できません。iOSを更新してください。": "This version of Safari cannot capture audio. Please update iOS.",
  "マイクまたは音声処理が中断しました。もう一度開始してください。": "The microphone or audio processing was interrupted. Please start again.",
  "音声またはAIの解析が途切れました。もう一度開始してください。": "Audio capture or AI analysis stalled. Please start again.",
  "マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。": "To use the microphone, open the HTTPS website directly in Safari.",
  "このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。": "This browser does not support the required audio features. Open the page in Safari on iOS.",
  "マイクとの接続が切れました。もう一度開始してください。": "The microphone was disconnected. Please start again.",
  "マイクが一時停止しました。もう一度開始してください。": "The microphone was paused. Please start again.",
  "AIの解析に失敗しました。もう一度開始してください。": "AI analysis failed. Please start again.",
  "AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。": "The AI model could not load. Check your connection and uploaded files, then reload the page.",
  "AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。": "AI could not run. Upload all required files, then reopen the page in Safari.",
  "音声処理が中断しました。もう一度開始してください。": "Audio processing was interrupted. Please start again.",
  "準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。": "Setup is taking too long. Check microphone permission and your connection, then start again.",
  "Safariで音声を開始するには、下の「検知を開始」をタップしてください。": "Tap “Start detection” below to enable audio in Safari.",
  "画面が非表示になったため停止しました。再開するには「検知を開始」をタップしてください。": "Detection stopped because the page was hidden. Tap “Start detection” to resume.",
  "言語": "Language",
  "音声は保存・送信されません": "Audio is not saved or transmitted",
  "研究用プロトタイプ · 安全を保証するものではありません": "Research prototype · Does not guarantee safety",
  "ご意見・ご感想 ↗": "Send feedback ↗",
  "ご意見・ご感想（準備中）": "Feedback (coming soon)",
  "Googleフォームを新しいタブで開く": "Open Google Forms in a new tab",
  "フィードバックフォームは準備中です。": "The feedback form is coming soon.",
  "イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。": "A research prototype for real-time traffic warning sound recognition, studying headphone use and traffic safety."
});
let language = 'ja'; // Default Japanese on each page load; no new storage dependency.
let viewDescription = '';
const t = text => language === 'en' ? (EN[text] ?? text) : text;

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['heading', 'description', 'status-label', 'warning-details', 'sound-type',
  'score', 'action', 'button-label', 'button-icon', 'cancel', 'theme-color', 'visual', 'waveform',
  'language-switch', 'language-ja', 'language-en', 'score-label', 'privacy', 'research', 'feedback', 'page-description'].map(id => [id, $(id)]));
let session = null;
let nextSession = 0;
let view = 'stopped';

function render(state, description = '') {
  view = state;
  viewDescription = description;
  document.body.dataset.state = state;
  const warning = state === 'warning';
  ui['theme-color'].setAttribute('content', warning ? '#c7263a' : '#101a2c');
  ui['warning-details'].hidden = !warning;
  ui.description.hidden = warning;
  const texts = {
    stopped: ['検知を停止しました', '停止中', description || '開始すると、周囲の交通警告音を\nこの端末で識別します。'],
    loading: ['AIモデルを読み込み中...', '準備中', description || '初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。'],
    priming: ['マイクの音を確認中...', '準備中', '最初の音声をAIで解析しています。'],
    listening: ['周囲の音を検知中...', '検知中', '交通警告音を検知すると、\n画面が赤く変わります。'],
    warning: ['警告音を検知しました', '周囲を確認してください', '']
  }[state];
  ui.heading.textContent = t(texts[0]);
  ui['status-label'].textContent = t(texts[1]);
  ui.description.textContent = t(texts[2]);
  if (warning && session?.gate.target) {
    ui['sound-type'].textContent = t(session.gate.target.label);
    ui.score.textContent = session.gate.target.score.toFixed(2);
  }
  updateButtons();
}

function updateButtons() {
  const needsTap = session && !session.connected && session.context?.state !== 'running';
  const start = !session || needsTap;
  ui['button-label'].textContent = t(start ? '検知を開始' : '検知を停止');
  ui['button-icon'].textContent = start ? '▶' : '■';
  ui.cancel.hidden = !(session && needsTap);
}

// A blank or invalid form URL leaves a visible, inactive feedback entry.
function feedbackURL(value) {
  try {
    const url = new URL(value);
    const googleForm = (url.hostname === 'forms.gle' && url.pathname.length > 1) ||
      (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'));
    return url.protocol === 'https:' && !url.username && !url.password && googleForm ? url.href : '';
  } catch { return ''; }
}
function setLanguage(next) {
  language = next === 'en' ? 'en' : 'ja';
  document.documentElement.lang = language;
  ui['language-switch'].setAttribute('aria-label', t('言語'));
  ui['language-ja'].setAttribute('aria-pressed', String(language === 'ja'));
  ui['language-en'].setAttribute('aria-pressed', String(language === 'en'));
  for (const [id, text] of Object.entries({
    cancel: '読み込みを中止', 'score-label': '識別スコア：',
    privacy: '音声は保存・送信されません', research: '研究用プロトタイプ · 安全を保証するものではありません'
  })) ui[id].textContent = t(text);
  ui['page-description'].setAttribute('content', t('イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。'));
  const url = feedbackURL(FEEDBACK_FORM_URL);
  if (url) ui.feedback.setAttribute('href', url);
  else ui.feedback.removeAttribute('href');
  ui.feedback.setAttribute('aria-disabled', String(!url));
  ui.feedback.setAttribute('title', t(url ? 'Googleフォームを新しいタブで開く' : 'フィードバックフォームは準備中です。'));
  ui.feedback.textContent = t(url ? 'ご意見・ご感想 ↗' : 'ご意見・ご感想（準備中）');
  render(view, viewDescription); // Keep the existing session, score, streak and warning deadline.
}

function drawWaveform(samples) {
  const canvas = ui.waveform;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 48;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = view === 'warning' ? '#ffffff' : '#98dacc';
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (!samples) { ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); }
  else for (let i = 0; i < samples.length; i++) {
    // Fixed display gain only. The waveform follows actual PCM; AI input is untouched.
    const sample = Math.max(-1, Math.min(1, samples[i] * 4));
    const x = i * width / (samples.length - 1);
    const y = height / 2 - sample * height * 0.44;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function resetVisuals() {
  ui.visual.style.setProperty('--audio-level', '0');
  drawWaveform(null);
}
function startVisuals(s) {
  // Observe the SAME microphone stream in a parallel, read-only branch. The
  // original source -> capture -> silent output path is deliberately unchanged.
  s.analyser = s.context.createAnalyser();
  s.analyser.fftSize = 2048;
  s.source.connect(s.analyser); // AnalyserNode output may remain unconnected.
  const samples = new Float32Array(s.analyser.fftSize);
  let lastDraw = -Infinity, level = 0;
  const draw = now => {
    if (!isCurrent(s) || !s.connected || s.context.state !== 'running') return;
    // At most 30 actual PCM reads/draws per second; one reusable sample buffer.
    if (now - lastDraw >= 1000 / 30) {
      const elapsed = Math.min(100, now - lastDraw);
      lastDraw = now;
      s.analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      const target = Math.min(1, Math.sqrt(rms) * 2.4);
      level += (target - level) * (1 - Math.exp(-elapsed / (target > level ? 55 : 160)));
      if (level < 0.001) level = 0;
      drawWaveform(samples);
      ui.visual.style.setProperty('--audio-level', level.toFixed(4));
    }
    s.visualFrame = requestAnimationFrame(draw);
  };
  s.visualFrame = requestAnimationFrame(draw);
}

function stop(message = '') {
  const old = session;
  session = null; // Invalidate all pending permissions, frames and model results first.
  if (old) {
    clearTimeout(old.startTimeout);
    clearTimeout(old.warningTimeout);
    clearInterval(old.watchdog);
    if (old.visualFrame != null) cancelAnimationFrame(old.visualFrame);
    old.worker?.terminate(); // Releases the classifier and its WASM heap.
    old.pending = null;
    old.flight = null;
    if (old.node) {
      old.node.onaudioprocess = null;
      if (old.node.port) { old.node.port.onmessage = null; old.node.port.close(); }
      try { old.node.disconnect(); } catch { /* Already disconnected. */ }
    }
    for (const node of [old.source, old.silent, old.analyser]) { try { node?.disconnect(); } catch {} }
    for (const track of old.stream?.getTracks() || []) {
      track.onended = null;
      track.onmute = null;
      track.stop();
    }
    if (old.context) {
      old.context.onstatechange = null;
      if (old.context.state !== 'closed') old.context.close().catch(() => {});
    }
    // Release any pending async initialization wait as well as native resources.
    old.rejectReady?.(new DOMException('Stopped', 'AbortError'));
    old.gate.reset();
  }
  resetVisuals();
  render('stopped', message);
}

function errorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError':
      return 'マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。';
    case 'NotFoundError': case 'DevicesNotFoundError':
      return 'マイクが見つかりません。接続を確認して、もう一度開始してください。';
    case 'NotReadableError': case 'TrackStartError':
      return 'マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。';
    case 'SecurityError':
      return 'マイクを使用できるHTTPSのページをSafariで直接開いてください。';
    default:
      return error?.publicMessage || '音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。';
  }
}
function fail(s, error) {
  if (session !== s) return;
  console.error('[Traffic Sound Guardian]', error);
  stop(errorMessage(error));
}
function publicError(message) { return Object.assign(new Error(message), { publicMessage: message }); }
function isCurrent(s) { return session === s; }

function scheduleWarningEnd(s) {
  clearTimeout(s.warningTimeout);
  if (!s.gate.active) return;
  const delay = Math.max(0, 3000 - (performance.now() - s.gate.lastPositive));
  s.warningTimeout = setTimeout(() => {
    if (!isCurrent(s)) return;
    if (performance.now() - s.lastResult >= 3000) {
      stop('AIの解析が中断しました。もう一度開始してください。');
      return;
    }
    s.gate.expire(performance.now());
    if (s.gate.active) scheduleWarningEnd(s);
    else render('listening');
  }, Math.ceil(delay));
}

function sendFrame(s, frame) {
  if (!isCurrent(s)) return;
  if (performance.now() - frame.receivedAt > 1500) {
    stop('音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。');
    return;
  }
  s.flight = frame;
  s.worker.postMessage({ type: 'classify', sequence: frame.sequence, samples: frame.samples,
    sampleRate: s.context.sampleRate }, [frame.samples.buffer]);
}
function receiveFrame(s, frame) {
  if (!isCurrent(s) || !s.connected) return;
  const ageMs = Math.max(0, (s.context.currentTime - (frame.endTime ?? s.context.currentTime)) * 1000);
  if (ageMs > 1500) {
    stop('音声の取得が遅れています。もう一度開始してください。');
    return;
  }
  s.lastCapture = performance.now();
  frame.receivedAt = s.lastCapture - ageMs;
  if (s.flight) s.pending = frame; // At most one outstanding + one latest window.
  else sendFrame(s, frame);
}
function receiveResult(s, data) {
  if (!isCurrent(s) || !s.connected || !s.flight || s.flight.sequence !== data.sequence) return;
  const now = performance.now();
  if (now - s.flight.receivedAt > 2500) {
    stop('AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。');
    return;
  }
  if (s.lastSequence && data.sequence !== s.lastSequence + 1) s.gate.breakSequence();
  s.lastSequence = data.sequence;
  s.flight = null;
  s.lastResult = now;
  s.hasResult = true;
  clearTimeout(s.startTimeout);
  s.gate.observe(data.target, now);
  const state = s.gate.active ? 'warning' : 'listening';
  if (view !== state || s.gate.active) render(state);
  scheduleWarningEnd(s);
  if (s.pending) {
    const pending = s.pending;
    s.pending = null;
    sendFrame(s, pending);
  }
}

async function connectCapture(s) {
  const context = s.context;
  s.source = context.createMediaStreamSource(s.stream);
  s.silent = context.createGain();
  s.silent.gain.value = 0;
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      if (!isCurrent(s)) return;
      s.node = new AudioWorkletNode(context, 'guardian-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]
      });
      s.node.port.onmessage = ({ data }) => {
        s.node.port.postMessage('ack');
        receiveFrame(s, data);
      };
      s.node.onprocessorerror = () => fail(s, publicError('マイクの音声処理が停止しました。もう一度開始してください。'));
    } catch (error) {
      console.warn('[Traffic Sound Guardian] AudioWorklet unavailable; using ScriptProcessor fallback.', error);
    }
  }
  if (!isCurrent(s)) return;
  if (!s.node) {
    // Real audio fallback; deprecated but still usable in Safari. No fake input.
    if (!context.createScriptProcessor) throw publicError('このSafariでは音声を取得できません。iOSを更新してください。');
    let blockStart = 0;
    let blockFirstSample = 0;
    const buffer = new AudioWindowBuffer(context.sampleRate, frame => {
      const endTime = blockStart + (frame.endSample - blockFirstSample) / context.sampleRate;
      receiveFrame(s, { ...frame, endTime });
    });
    s.node = context.createScriptProcessor(4096, 1, 1);
    s.node.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0);
      blockFirstSample = buffer.total;
      blockStart = event.playbackTime - input.length / context.sampleRate;
      buffer.push([input]);
      event.outputBuffer.getChannelData(0).fill(0);
    };
  }
  // Keep the capture graph scheduled without playing microphone audio.
  s.source.connect(s.node);
  s.node.connect(s.silent);
  s.silent.connect(context.destination);
  s.connected = true;
  s.lastCapture = s.lastResult = performance.now();
  render('priming');
  startVisuals(s);
  s.watchdog = setInterval(() => {
    if (!isCurrent(s)) return;
    const now = performance.now();
    const limit = s.hasResult ? 3000 : 8000;
    if (context.state !== 'running' || s.stream.getAudioTracks().some(t => t.readyState !== 'live' || t.muted)) {
      stop('マイクまたは音声処理が中断しました。もう一度開始してください。');
    } else if (now - s.lastCapture > limit || now - s.lastResult > limit) {
      stop('音声またはAIの解析が途切れました。もう一度開始してください。');
    }
  }, 250);
}

async function start() {
  if (session) {
    // A tap during automatic startup unlocks the SAME context, never a second loop.
    const current = session;
    current.context?.resume().then(() => { if (isCurrent(current)) updateButtons(); }).catch(error => fail(current, error));
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    stop('マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。');
    return;
  }
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType || typeof Worker === 'undefined') {
    stop('このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。');
    return;
  }
  const s = { id: ++nextSession, gate: new WarningGate(), connected: false, hasResult: false,
    lastSequence: 0, pending: null, flight: null };
  session = s;
  try {
    s.context = new AudioContextType({ latencyHint: 'interactive' });
    // Run resume and getUserMedia before any await, preserving a button's activation.
    const initialResume = s.context.resume().catch(() => {});
    const microphone = navigator.mediaDevices.getUserMedia({ video: false, audio: {
      channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false
    } }).then(stream => {
      if (!isCurrent(s)) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('Stopped', 'AbortError'); }
      s.stream = stream;
      for (const track of stream.getAudioTracks()) {
        track.onended = () => { if (isCurrent(s)) stop('マイクとの接続が切れました。もう一度開始してください。'); };
        track.onmute = () => { if (isCurrent(s) && s.connected) stop('マイクが一時停止しました。もう一度開始してください。'); };
      }
      return stream;
    });
    // Attach rejection handler immediately even if Worker construction fails.
    microphone.catch(error => fail(s, error));
    s.worker = new Worker(new URL('./classifier-worker.js', import.meta.url));
    const ready = new Promise((resolve, reject) => {
      s.rejectReady = reject;
      s.worker.onmessage = ({ data }) => {
        if (!isCurrent(s)) return;
        if (data.type === 'ready') resolve();
        else if (data.type === 'result') receiveResult(s, data);
        else if (data.type === 'error') {
          const error = publicError(s.connected
            ? 'AIの解析に失敗しました。もう一度開始してください。'
            : 'AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。');
          console.error('[Traffic Sound Guardian] Worker:', data.message);
          reject(error);
          fail(s, error);
        }
      };
      s.worker.onerror = event => {
        const error = publicError('AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。');
        console.error('[Traffic Sound Guardian] Worker load:', event.message);
        reject(error);
        fail(s, error);
      };
    });
    s.context.onstatechange = () => {
      if (!isCurrent(s)) return;
      if (s.connected && s.context.state !== 'running') stop('音声処理が中断しました。もう一度開始してください。');
      else updateButtons();
    };
    render('loading');
    s.startTimeout = setTimeout(() => {
      if (isCurrent(s)) stop('準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。');
    }, 60000);
    s.worker.postMessage({ type: 'init' });
    await Promise.all([microphone, ready]);
    if (!isCurrent(s)) return;
    // Safari may suspend the context while the permission prompt is visible.
    s.context.resume().catch(() => {});
    if (s.context.state !== 'running') {
      await Promise.race([initialResume, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (!isCurrent(s)) return;
      if (s.context.state !== 'running') {
        stop('Safariで音声を開始するには、下の「検知を開始」をタップしてください。');
        return;
      }
    }
    await connectCapture(s);
  } catch (error) { fail(s, error); }
}

ui['language-ja'].addEventListener('click', () => setLanguage('ja'));
ui['language-en'].addEventListener('click', () => setLanguage('en'));
ui.feedback.addEventListener('click', event => {
  if (!feedbackURL(FEEDBACK_FORM_URL)) event.preventDefault();
});
setLanguage('ja');
resetVisuals();

ui.action.addEventListener('click', () => {
  if (!session || (!session.connected && session.context?.state !== 'running')) start();
  else stop();
});
ui.cancel.addEventListener('click', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) stop('画面が非表示になったため停止しました。再開するには「検知を開始」をタップしてください。');
});
window.addEventListener('pagehide', () => stop());
// No background or lock-screen operation. Autostart is attempted only in front.
if (!document.hidden) start();

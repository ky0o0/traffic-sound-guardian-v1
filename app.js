import { WarningGate } from './detection.js';
import { AudioWindowBuffer } from './audio-window.js';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['heading', 'description', 'status-label', 'warning-details', 'sound-type',
  'score', 'action', 'button-label', 'button-icon', 'cancel', 'theme-color'].map(id => [id, $(id)]));
let session = null;
let nextSession = 0;
let view = 'stopped';

function render(state, description = '') {
  view = state;
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
  ui.heading.textContent = texts[0];
  ui['status-label'].textContent = texts[1];
  ui.description.textContent = texts[2];
  if (warning && session?.gate.target) {
    ui['sound-type'].textContent = session.gate.target.label;
    ui.score.textContent = session.gate.target.score.toFixed(2);
  }
  updateButtons();
}

function updateButtons() {
  const needsTap = session && !session.connected && session.context?.state !== 'running';
  const start = !session || needsTap;
  ui['button-label'].textContent = start ? '検知を開始' : '検知を停止';
  ui['button-icon'].textContent = start ? '▶' : '■';
  ui.cancel.hidden = !(session && needsTap);
}

function stop(message = '') {
  const old = session;
  session = null; // Invalidate all pending permissions, frames and model results first.
  if (old) {
    clearTimeout(old.startTimeout);
    clearTimeout(old.warningTimeout);
    clearInterval(old.watchdog);
    old.worker?.terminate(); // Releases the classifier and its WASM heap.
    old.pending = null;
    old.flight = null;
    if (old.node) {
      old.node.onaudioprocess = null;
      if (old.node.port) { old.node.port.onmessage = null; old.node.port.close(); }
      try { old.node.disconnect(); } catch { /* Already disconnected. */ }
    }
    for (const node of [old.source, old.silent]) { try { node?.disconnect(); } catch {} }
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

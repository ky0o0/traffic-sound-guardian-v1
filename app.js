import { bindApplicationElements } from './page-elements.js?v=1.7.5';
import { allowedLanguage, initialLanguage, translateApp } from './app-i18n.js?v=1.7.5';
import {
  createThresholdSettings,
  thresholdsForMode,
  THRESHOLD_STORAGE_KEY,
  STANDARD_THRESHOLD_STORAGE_KEY,
  THRESHOLD_STOPS,
  nearestThreshold,
} from './threshold-settings.js?v=1.7.5';
import { createMicrophoneView } from './microphone-view.js?v=1.7.5';
import { createDebugView } from './debug-view.js?v=1.7.5';
import { createApplicationView } from './application-view.js?v=1.7.5';
import { createMicrophoneVisualizer } from './microphone-visualizer.js?v=1.7.5';
import {
  WarningGate,
  WARNING_TARGETS,
  chooseTarget,
  effectiveThreshold,
  DEFAULT_THRESHOLD,
  WARNING_HOLD_MS,
} from './detection.js?v=1.7.5';
import { AudioWindowBuffer } from './audio-window.js';
import { microphoneSourceEvidence, safeTrackSettings } from './mic-source.js?v=1.7.5';
import { debugCategoryName } from './debug.js?v=1.7.5';

// Confirmed Japanese and English Google Forms short links, supplied directly by the form owner.
// Navigation sends neither microphone samples nor recognition scores.
const FEEDBACK_FORM_URLS = Object.freeze({
  ja: 'https://forms.gle/vRzgiJxNCfJeb5K1A',
  en: 'https://forms.gle/AkXuRHWwi9Kp95GfA',
});

let language = initialLanguage(window); // Japanese by default; language preference only, never audio.
let viewDescription = '';
const t = (text) => translateApp(text, language);
// Names are always translated from the same original YAMNet class ID.
const localizedSoundNames = (categoryName) =>
  categoryName
    ? {
        ja: debugCategoryName({ categoryName }, 'ja'),
        en: debugCategoryName({ categoryName }, 'en'),
        'zh-CN': debugCategoryName({ categoryName }, 'zh-CN'),
      }
    : null;

const $ = (id) => document.getElementById(id);
const ui = bindApplicationElements(document);
let session = null;
let nextSession = 0;
let view = 'stopped';
// The UI reports browser metadata only; it never guesses from Bluetooth connection.
let micSource = { state: 'stopped', evidence: null };
function renderMicSource() {
  microphoneView.renderSource(micSource);
}
function showMicSource(s) {
  if (session !== s || !s.stream) return;
  const track = s.stream.getAudioTracks()[0];
  micSource = { state: 'active', evidence: microphoneSourceEvidence(track, s.reportedAudioInputs || []) };
  renderMicSource();
}

let preferredMicId = ''; // Never stored: browser-origin device IDs can change.
let knownMicrophoneInputs = [];
let microphoneListReady = false;
function renderMicChoices() {
  preferredMicId = microphoneView.renderChoices({
    session,
    knownMicrophoneInputs,
    preferredMicId,
    microphoneListReady,
  });
}
function chooseMicrophone(id) {
  const available = id === '' || knownMicrophoneInputs.some((item) => item.deviceId === id && !!id);
  if (!available) {
    renderMicChoices();
    return;
  }
  preferredMicId = id;
  if (session) {
    // This change event is a user gesture; stop the old capture BEFORE starting
    // the newly requested device, and let the normal permission/error path run.
    stop('マイクを切り替えています…');
    start();
  } else renderMicChoices();
}
async function refreshMicSource(s) {
  if (session !== s || !s.stream) return;
  const token = ++s.micSourceQuery;
  let inputs = [];
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (Array.isArray(devices)) inputs = devices.filter((d) => d.kind === 'audioinput');
  } catch {
    /* The track label may be all that Safari exposes. */
  }
  if (session !== s || token !== s.micSourceQuery) return;
  s.reportedAudioInputs = inputs;
  knownMicrophoneInputs = inputs;
  microphoneListReady = true;
  renderMicChoices();
  showMicSource(s);
}
// Preferences only; no PCM, AI results, or inference history are persisted.
const ALERT_TONE_STORAGE_KEY = 'trafficSoundGuardian.alertToneEnabled';
const ALERT_VOLUME_STORAGE_KEY = 'trafficSoundGuardian.alertVolume';
// Browser gain is not dB SPL. The levels stay conservatively below digital full scale.
const ALERT_VOLUME_GAINS = Object.freeze({ soft: 0.045, normal: 0.09, clear: 0.15 });
function loadAlertVolume() {
  try {
    const saved = window.localStorage?.getItem(ALERT_VOLUME_STORAGE_KEY);
    return Object.prototype.hasOwnProperty.call(ALERT_VOLUME_GAINS, saved) ? saved : 'normal';
  } catch {
    return 'normal';
  }
}
let alertVolume = loadAlertVolume();
function setAlertVolume(value) {
  if (!Object.prototype.hasOwnProperty.call(ALERT_VOLUME_GAINS, value)) return;
  alertVolume = value;
  ui['alert-volume-select'].value = value;
  try {
    window.localStorage?.setItem(ALERT_VOLUME_STORAGE_KEY, value);
  } catch {}
  window.dispatchEvent?.(new CustomEvent('tsg:alert-volume', { detail: { level: value } }));
}

// Default ON even if localStorage is unavailable. Only an explicit 'false' disables it.
function loadAlertToneEnabled() {
  try {
    return window.localStorage?.getItem(ALERT_TONE_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}
let alertToneEnabled = loadAlertToneEnabled();
function setAlertToneEnabled(next) {
  alertToneEnabled = !!next;
  ui['alert-tone-toggle'].checked = alertToneEnabled;
  // Muting also silences a two-beep sequence already in progress.
  if (!alertToneEnabled && session) stopAlertTones(session);
  try {
    window.localStorage?.setItem(ALERT_TONE_STORAGE_KEY, String(alertToneEnabled));
  } catch {}
}

const thresholdRows = Object.entries(WARNING_TARGETS)
  .map(([name, info], i) => ({
    name,
    info,
    label: $('threshold-label-' + i),
    input: $('threshold-input-' + i),
    output: $('threshold-value-' + i),
  }))
  .filter((row) => row.input && row.label && row.output);
const thresholdSettings = createThresholdSettings(() => window.localStorage);
const loadThresholds = thresholdSettings.loadTest;
let soundThresholds = loadThresholds();
// Standard uses one direct threshold; Test retains eleven stored category thresholds.

const loadStandardThreshold = thresholdSettings.loadStandard;
let standardThreshold = loadStandardThreshold();
function activeThresholds() {
  return thresholdsForMode(document.body.dataset.mode, soundThresholds, standardThreshold);
}
function renderStandardThreshold() {
  const input = $('standard-threshold');
  if (!input) return;
  input.value = standardThreshold.toFixed(2);
  input.setAttribute('aria-valuetext', standardThreshold.toFixed(2));
  $('standard-threshold-value').textContent = standardThreshold.toFixed(2);
  $('standard-threshold-label').textContent = {
    ja: '警告音の共通しきい値',
    en: 'Warning score threshold',
    'zh-CN': '统一警告阈值',
  }[language];
}
function setStandardThreshold(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.01 || parsed > 0.5) return;
  standardThreshold = Math.round(parsed * 100) / 100;
  thresholdSettings.saveStandard(standardThreshold);
  renderStandardThreshold();
}

// A separate 0.01 minimum followed by 0.05-spaced choices. Using native
// range step=0.05 with min=0.01 would incorrectly yield 0.01, 0.06, 0.11...

function renderThresholds() {
  renderStandardThreshold();
  for (const row of thresholdRows) {
    const value = soundThresholds[row.name].toFixed(2);
    row.label.textContent = t(row.info.label);
    // step='any' permits the special 0.01 stop. We snap user input
    // manually, preserving legacy stored 0.01-step values exactly.
    row.input.min = '0.01';
    row.input.max = '0.50';
    row.input.step = 'any';
    row.input.value = value;
    row.input.setAttribute('aria-valuetext', value);
    row.output.textContent = value;
    const reset = $('threshold-default-' + Object.keys(WARNING_TARGETS).indexOf(row.name));
    if (reset)
      reset.setAttribute(
        'aria-label',
        { ja: '初期値に戻す: ', en: 'Reset: ', 'zh-CN': '恢复默认：' }[language] + t(row.info.label),
      );
  }
}
function saveThresholds() {
  thresholdSettings.saveTest(soundThresholds);
}
function changeThreshold(name, inputValue) {
  const parsed = Number(inputValue);
  if (!Object.prototype.hasOwnProperty.call(WARNING_TARGETS, name) || !Number.isFinite(parsed)) return;
  const next = nearestThreshold(parsed);
  soundThresholds[name] = next;
  renderThresholds();
  saveThresholds();
  renderDebug();
}
function resetThresholds() {
  for (const name of Object.keys(WARNING_TARGETS)) soundThresholds[name] = DEFAULT_THRESHOLD;
  renderThresholds();
  saveThresholds();
  renderDebug();
}

let debugEnabled = false;
// One current status/snapshot only; no collection, storage, audio or result history.
let diagnostics = {
  model: '未読み込み',
  microphone: '停止中',
  inference: '未実行',
  inferenceMs: null,
  updatedAt: null,
  scores: null,
};

function renderDebug() {
  debugView.render(diagnostics, debugEnabled);
}
function setDebug(enabled) {
  debugEnabled = !!enabled && !!ui['debug-panel'];
  if (!ui['debug-panel']) return;
  ui['debug-toggle'].checked = debugEnabled;
  diagnostics.scores = null;
  ui['debug-top'].replaceChildren();
  ui['debug-target'].replaceChildren();
  ui['debug-panel'].open = debugEnabled;
  renderDebug(); // No initialization, new microphone, worker or inference loop.
  document.body.dataset.debug = debugEnabled ? 'on' : 'off';
  // Keep the current scroll position. The panel peeks below the main UI
  // and the user can scroll down naturally to see full diagnostics.
}
function stopDebug(s) {
  diagnostics.scores = null;
  if (s) {
    if (diagnostics.model === '読み込み成功') diagnostics.model = '読み込み成功・解放済み';
    else if (diagnostics.model === '読み込み中') diagnostics.model = '読み込み中止';
    if (!['マイクの許可なし', '入力エラー', '音声入力が中断'].includes(diagnostics.microphone)) {
      const interrupted =
        s.connected &&
        (s.context?.state !== 'running' ||
          s.stream?.getAudioTracks().some((track) => track.readyState !== 'live' || track.muted));
      diagnostics.microphone = interrupted ? '音声入力が中断' : '停止中';
    }
    if (!['失敗', '更新が停止'].includes(diagnostics.inference)) {
      diagnostics.inference = '停止中';
      diagnostics.inferenceMs = null;
      diagnostics.updatedAt = null;
    }
  }
}

// Beeps use the same user-activated AudioContext as the real-time microphone,
// but a SEPARATE output-only node chain. The microphone source stays read-only.
// Audio is routed by the OS/browser (we cannot force Bluetooth headphone output).
function stopAlertTones(s) {
  for (const entry of s?.alertToneNodes ?? []) {
    try {
      entry.osc.onended = null;
      entry.osc.stop();
    } catch {}
    try {
      entry.osc.disconnect();
    } catch {}
    try {
      entry.gain.disconnect();
    } catch {}
  }
  s?.alertToneNodes?.clear();
}
function playAlertTone(s) {
  const context = s?.context;
  if (
    !alertToneEnabled ||
    !context ||
    context.state !== 'running' ||
    !context.createOscillator ||
    !context.createGain
  )
    return false;
  try {
    // A gentle two-tone sequence (two 110 ms sine beeps, 85 ms gap).
    // User-selected gain is not a dB SPL guarantee; never force system volume.
    const peak = ALERT_VOLUME_GAINS[alertVolume];
    const start = context.currentTime + 0.02;
    for (let i = 0; i < 2; i++) {
      const at = start + i * 0.195;
      const end = at + 0.11;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const entry = { osc, gain };
      s.alertToneNodes.add(entry);
      osc.type = 'sine';
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.015);
      gain.gain.setValueAtTime(peak, end - 0.03);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.onended = () => {
        s.alertToneNodes.delete(entry);
        try {
          osc.disconnect();
        } catch {}
        try {
          gain.disconnect();
        } catch {}
      };
      osc.start(at);
      osc.stop(end);
    }
    return true;
  } catch (error) {
    stopAlertTones(s);
    console.warn('[Traffic Sound Guardian] Alert audio unavailable:', error);
    return false; // Visual warning must still work when audio output is blocked.
  }
}

function render(state, description = '') {
  view = state;
  viewDescription = description;
  applicationView.renderStatus(state, description, session);
  updateButtons();
  renderMicSource();
  renderDebug();
}

function updateButtons() {
  applicationView.updateButtons(session);
}

// A blank or invalid form URL leaves a visible, inactive feedback entry.
function feedbackURL(value) {
  try {
    const url = new URL(value);
    const googleForm =
      (url.hostname === 'forms.gle' && url.pathname.length > 1) ||
      (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'));
    return url.protocol === 'https:' && !url.username && !url.password && googleForm ? url.href : '';
  } catch {
    return '';
  }
}
function setLanguage(next) {
  language = allowedLanguage(next);
  document.documentElement.lang = language;
  window.dispatchEvent?.(new CustomEvent('tsg:language', { detail: { language } }));
  applicationView.translateSettings({ language, alertToneEnabled, alertVolume });
  renderThresholds();
  render(view, viewDescription);
}

function cleanupOperation(operation, action) {
  try {
    return action();
  } catch (error) {
    console.warn('[Traffic Sound Guardian] Cleanup failed: ' + operation, error);
  }
}

function stop(message = '') {
  const old = session;
  stopDebug(old);
  session = null; // Invalidate all pending permissions, frames and model results first.
  if (old) {
    old.micSourceQuery = (old.micSourceQuery ?? 0) + 1;
    try {
      navigator.mediaDevices?.removeEventListener?.('devicechange', old.onMicDevicesChange);
    } catch {}
    clearTimeout(old.startTimeout);
    clearTimeout(old.warningTimeout);
    clearInterval(old.watchdog);
    if (old.visualFrame != null) cancelAnimationFrame(old.visualFrame);
    cleanupOperation('Worker termination', () => old.worker?.terminate()); // Releases the classifier and its WASM heap.
    old.pending = null;
    old.flight = null;
    if (old.node) {
      old.node.onaudioprocess = null;
      if (old.node.port) {
        old.node.port.onmessage = null;
        cleanupOperation('Worklet port close', () => old.node.port.close());
      }
      try {
        old.node.disconnect();
      } catch {
        /* Already disconnected. */
      }
    }
    for (const node of [old.source, old.silent, old.analyser]) {
      try {
        node?.disconnect();
      } catch {}
    }
    for (const track of old.stream?.getTracks() || []) {
      track.onended = null;
      track.onmute = null;
      cleanupOperation('Microphone track stop', () => track.stop());
    }
    if (old.context) {
      old.context.onstatechange = null;
      if (old.context.state !== 'closed')
        cleanupOperation('AudioContext close', () =>
          Promise.resolve(old.context.close()).catch((error) =>
            console.warn('[Traffic Sound Guardian] AudioContext close failed', error),
          ),
        );
    }
    // Release any pending async initialization wait as well as native resources.
    old.rejectReady?.(new DOMException('Stopped', 'AbortError'));
    stopAlertTones(old); // Discard any scheduled beeps when microphone session ends.
    old.gate.reset();
  }
  window.dispatchEvent?.(new CustomEvent('tsg:capture', { detail: { active: false } }));
  micSource = { state: 'stopped', evidence: null };
  renderMicChoices();
  resetVisuals();
  window.dispatchEvent?.(new Event('tsg:reset'));
  render('stopped', message);
}

function errorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'マイクが見つかりません。接続を確認して、もう一度開始してください。';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。';
    case 'SecurityError':
      return 'マイクを使用できるHTTPSのページをSafariで直接開いてください。';
    case 'OverconstrainedError':
      return '選択したマイクを使用できません。標準に戻すか別のマイクを選択してください。';
    default:
      return (
        error?.publicMessage ||
        '音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。'
      );
  }
}
function fail(s, error) {
  if (session !== s) return;
  console.error('[Traffic Sound Guardian]', error);
  stop(errorMessage(error));
}
function publicError(message) {
  return Object.assign(new Error(message), { publicMessage: message });
}
function isCurrent(s) {
  return session === s;
}

function scheduleWarningEnd(s) {
  clearTimeout(s.warningTimeout);
  if (!s.gate.active) return;
  const delay = Math.max(0, WARNING_HOLD_MS - (performance.now() - s.gate.lastPositive));
  s.warningTimeout = setTimeout(() => {
    if (!isCurrent(s)) return;
    if (performance.now() - s.lastResult >= 3000) {
      diagnostics.inference = '更新が停止';
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
  try {
    s.worker.postMessage(
      {
        type: 'classify',
        sequence: frame.sequence,
        samples: frame.samples,
        sampleRate: s.context.sampleRate,
        debug: debugEnabled,
      },
      [frame.samples.buffer],
    );
  } catch (error) {
    fail(s, error);
  }
}
function receiveFrame(s, frame) {
  if (!isCurrent(s) || !s.connected) return;
  const ageMs = Math.max(0, (s.context.currentTime - (frame.endTime ?? s.context.currentTime)) * 1000);
  if (ageMs > 1500) {
    stop('音声の取得が遅れています。もう一度開始してください。');
    return;
  }
  s.lastCapture = performance.now();
  if (diagnostics.microphone !== '音声データ受信中') {
    diagnostics.microphone = '音声データ受信中';
    renderDebug();
  }
  frame.receivedAt = s.lastCapture - ageMs;
  if (s.flight)
    s.pending = frame; // At most one outstanding + one latest window.
  else sendFrame(s, frame);
}
function receiveResult(s, data) {
  if (!isCurrent(s) || !s.connected || !s.flight || s.flight.sequence !== data.sequence) return;
  const now = performance.now();
  if (now - s.flight.receivedAt > 2500) {
    diagnostics.inference = '更新が停止';
    stop('AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。');
    return;
  }
  const completedFrame = s.flight;
  s.flight = null;
  s.lastResult = now;
  s.hasResult = true;
  diagnostics.inference = '成功';
  diagnostics.inferenceMs = Number.isFinite(data.inferenceMs) ? data.inferenceMs : null;
  diagnostics.updatedAt = Date.now();
  diagnostics.scores = debugEnabled ? (data.debug ?? null) : null;
  clearTimeout(s.startTimeout);
  // Check eleven unchanged raw scores against effective per-category thresholds.
  // Legacy test fixtures without trafficScores keep the prior default behaviour.
  const target = data.trafficScores ? chooseTarget(data.trafficScores, activeThresholds()) : data.target;
  const threshold = target?.name
    ? effectiveThreshold(activeThresholds()[target.name] ?? DEFAULT_THRESHOLD)
    : DEFAULT_THRESHOLD;
  // Only the inactive -> active transition counts as a NEW warning.
  // A late JavaScript timer must not make an expired warning look continuous.
  const wasActive = s.gate.active && now - s.gate.lastPositive < WARNING_HOLD_MS;
  s.gate.observe(target, now, threshold);
  const newWarning = !wasActive && s.gate.active;
  if (newWarning) playAlertTone(s);
  // Research receives only real scalar results and browser-reported metadata. No PCM.
  if (ui['debug-panel'])
    window.dispatchEvent?.(
      new CustomEvent('tsg:research', {
        detail: {
          at: Date.now(),
          monotonicMs: now,
          inferenceMs: diagnostics.inferenceMs,
          topCategory: data.topCategory ?? null,
          top5: data.debug?.top5 ?? null,
          scores: data.trafficScores ?? null,
          thresholds: { ...activeThresholds() },
          warning: newWarning ? target?.name : null,
          inputSampleRate: safeTrackSettings(s.stream?.getAudioTracks()[0]).sampleRate ?? null,
          contextSampleRate: s.context.sampleRate,
          microphone: microphoneSourceEvidence(s.stream?.getAudioTracks()[0], s.reportedAudioInputs),
        },
      }),
    );
  // The red interval represents a positive YAMNet analysis window, not exact event boundaries.
  // Use capture timestamps rather than delayed Worker response time.
  if (target && Number.isFinite(completedFrame?.endTime)) {
    window.dispatchEvent?.(
      new CustomEvent('tsg:warning', {
        detail: {
          start: completedFrame.endTime - 0.975,
          end: completedFrame.endTime,
          label: target.name,
          labels: localizedSoundNames(target.name),
        },
      }),
    );
  }
  // One tiny read-only category snapshot per real inference. No PCM, new AI
  // inference, storage, or Debug dependency. The UI alone handles 2s stability.
  if (data.topCategory?.categoryName) {
    window.dispatchEvent?.(
      new CustomEvent('tsg:classification', {
        detail: {
          categoryName: data.topCategory.categoryName,
          labels: localizedSoundNames(data.topCategory.categoryName),
          timeMs: now,
          warningName: target?.name ?? null,
          warningLabels: target?.name ? localizedSoundNames(target.name) : null,
        },
      }),
    );
  }
  const state = s.gate.active ? 'warning' : 'listening';
  if (view !== state || s.gate.active) render(state);
  else renderDebug(); // render() already refreshed diagnostics on state/warning updates.
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
      await context.audioWorklet.addModule(new URL('./capture-worklet.js?v=1.7.5', import.meta.url));
      if (!isCurrent(s)) return;
      s.node = new AudioWorkletNode(context, 'guardian-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      s.node.port.onmessage = ({ data }) => {
        if (!isCurrent(s) || !s.connected) return;
        try {
          s.node.port.postMessage('ack');
          receiveFrame(s, data);
        } catch (error) {
          fail(s, error);
        }
      };
      s.node.onprocessorerror = () =>
        fail(s, publicError('マイクの音声処理が停止しました。もう一度開始してください。'));
    } catch (error) {
      console.warn(
        '[Traffic Sound Guardian] AudioWorklet unavailable; using ScriptProcessor fallback.',
        error,
      );
    }
  }
  if (!isCurrent(s)) return;
  if (!s.node) {
    // Real audio fallback; deprecated but still usable in Safari. No fake input.
    if (!context.createScriptProcessor)
      throw publicError('このSafariでは音声を取得できません。iOSを更新してください。');
    let blockStart = 0;
    let blockFirstSample = 0;
    const buffer = new AudioWindowBuffer(context.sampleRate, (frame) => {
      const endTime = blockStart + (frame.endSample - blockFirstSample) / context.sampleRate;
      receiveFrame(s, { ...frame, endTime });
    });
    s.node = context.createScriptProcessor(4096, 1, 1);
    s.node.onaudioprocess = (event) => {
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
    if (
      context.state !== 'running' ||
      s.stream.getAudioTracks().some((t) => t.readyState !== 'live' || t.muted)
    ) {
      diagnostics.microphone = '音声入力が中断';
      stop('マイクまたは音声処理が中断しました。もう一度開始してください。');
    } else if (now - s.lastCapture > limit || now - s.lastResult > limit) {
      if (now - s.lastCapture > limit) diagnostics.microphone = '音声入力が中断';
      if (now - s.lastResult > limit) diagnostics.inference = '更新が停止';
      stop('音声またはAIの解析が途切れました。もう一度開始してください。');
    } else if (now - (s.lastMicSourceCheck ?? -Infinity) >= 2000) {
      s.lastMicSourceCheck = now;
      showMicSource(s); // Detect changes to browser-reported track label/settings.
    }
  }, 250);
}

async function start() {
  if (session) {
    // A tap during automatic startup unlocks the SAME context, never a second loop.
    const current = session;
    current.context
      ?.resume()
      .then(() => {
        if (isCurrent(current)) updateButtons();
      })
      .catch((error) => fail(current, error));
    return;
  }
  diagnostics = {
    model: '未読み込み',
    microphone: '停止中',
    inference: '未実行',
    inferenceMs: null,
    updatedAt: null,
    scores: null,
  };
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    diagnostics.microphone = '利用不可（HTTPSが必要）';
    stop('マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。');
    return;
  }
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType || typeof Worker === 'undefined') {
    stop('このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。');
    return;
  }
  const s = {
    id: ++nextSession,
    gate: new WarningGate(),
    connected: false,
    hasResult: false,
    pending: null,
    flight: null,
    alertToneNodes: new Set(),
    micSourceQuery: 0,
    reportedAudioInputs: [],
    requestedMicId: preferredMicId,
  };
  session = s;
  // Preview releases its ambient policy before the capture Context is created.
  window.dispatchEvent?.(new CustomEvent('tsg:capture', { detail: { active: true } }));
  micSource = { state: 'loading', evidence: null };
  renderMicSource();
  diagnostics.model = '読み込み中';
  diagnostics.microphone = '許可を確認中';
  renderDebug();
  try {
    s.context = new AudioContextType({ latencyHint: 'interactive' });
    // Run resume and getUserMedia before any await, preserving a button's activation.
    const initialResume = s.context.resume().catch(() => {});
    const audioConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (s.requestedMicId) audioConstraints.deviceId = { exact: s.requestedMicId };
    const microphone = navigator.mediaDevices
      .getUserMedia({ video: false, audio: audioConstraints })
      .then((stream) => {
        if (!isCurrent(s)) {
          stream.getTracks().forEach((t) => t.stop());
          throw new DOMException('Stopped', 'AbortError');
        }
        const actualId = safeTrackSettings(stream.getAudioTracks()[0]).deviceId ?? '';
        if (s.requestedMicId && actualId && actualId !== 'default' && actualId !== s.requestedMicId) {
          stream.getTracks().forEach((track) => track.stop());
          throw publicError('ブラウザは選択したマイクと異なる入力を返しました。別の入力を選んでください。');
        }
        s.stream = stream;
        // The very same track that feeds classifier audio supplies the label.
        // Device enumeration never asks for microphone access a second time.
        showMicSource(s);
        s.onMicDevicesChange = () => {
          if (isCurrent(s)) refreshMicSource(s);
        };
        try {
          navigator.mediaDevices?.addEventListener?.('devicechange', s.onMicDevicesChange);
        } catch {}
        void refreshMicSource(s);
        diagnostics.microphone = '許可済み・音声データ待ち';
        renderDebug();
        for (const track of stream.getAudioTracks()) {
          track.onended = () => {
            if (isCurrent(s)) stop('マイクとの接続が切れました。もう一度開始してください。');
          };
          track.onmute = () => {
            if (isCurrent(s) && s.connected) stop('マイクが一時停止しました。もう一度開始してください。');
          };
        }
        return stream;
      });
    // Attach rejection handler immediately even if Worker construction fails.
    microphone.catch((error) => {
      if (isCurrent(s))
        diagnostics.microphone = ['NotAllowedError', 'PermissionDeniedError'].includes(error?.name)
          ? 'マイクの許可なし'
          : '入力エラー';
      fail(s, error);
    });
    s.worker = new Worker(new URL('./classifier-worker.js?v=1.7.5', import.meta.url));
    const ready = new Promise((resolve, reject) => {
      s.rejectReady = reject;
      s.worker.onmessage = ({ data }) => {
        if (!isCurrent(s)) return;
        if (data.type === 'ready') {
          diagnostics.model = '読み込み成功';
          renderDebug();
          resolve();
        } else if (data.type === 'result') receiveResult(s, data);
        else if (data.type === 'error') {
          if (data.operation === 'init' || !s.connected) diagnostics.model = '失敗';
          else {
            diagnostics.inference = '失敗';
            diagnostics.inferenceMs = Number.isFinite(data.inferenceMs) ? data.inferenceMs : null;
            diagnostics.updatedAt = Date.now();
          }
          const error = publicError(
            s.connected
              ? 'AIの解析に失敗しました。もう一度開始してください。'
              : 'AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。',
          );
          console.error('[Traffic Sound Guardian] Worker:', data.message);
          reject(error);
          fail(s, error);
        }
      };
      s.worker.onerror = (event) => {
        if (!isCurrent(s)) return;
        if (s.connected) {
          diagnostics.inference = '失敗';
          diagnostics.inferenceMs = null;
          diagnostics.updatedAt = Date.now();
        } else diagnostics.model = '失敗';
        const error = publicError(
          'AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。',
        );
        console.error('[Traffic Sound Guardian] Worker load:', event.message);
        reject(error);
        fail(s, error);
      };
    });
    // postMessage(init) can throw before Promise.all attaches its handlers.
    // stop() rejects ready as well, so consume that rejection immediately.
    ready.catch(() => {});
    s.worker.addEventListener('messageerror', s.worker.onerror);
    s.context.onstatechange = () => {
      if (!isCurrent(s)) return;
      if (s.connected && s.context.state !== 'running')
        stop('音声処理が中断しました。もう一度開始してください。');
      else updateButtons();
    };
    render('loading');
    s.startTimeout = setTimeout(() => {
      if (isCurrent(s))
        stop('準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。');
    }, 60000);
    s.worker.postMessage({ type: 'init' });
    await Promise.all([microphone, ready]);
    if (!isCurrent(s)) return;
    // Safari may suspend the context while the permission prompt is visible.
    s.context.resume().catch(() => {});
    if (s.context.state !== 'running') {
      await Promise.race([initialResume, new Promise((resolve) => setTimeout(resolve, 1500))]);
      if (!isCurrent(s)) return;
      if (s.context.state !== 'running') {
        stop('Safariで音声を開始するには、中央のマイクをタップしてください。');
        return;
      }
    }
    await connectCapture(s);
  } catch (error) {
    fail(s, error);
  }
}

const microphoneView = createMicrophoneView({ ui, document, translate: t });
const debugView = createDebugView({
  ui,
  document,
  translate: t,
  getLanguage: () => language,
  getSession: () => session,
  getThresholds: () => soundThresholds,
});
const applicationView = createApplicationView({
  ui,
  document,
  window,
  translate: t,
  feedbackForms: FEEDBACK_FORM_URLS,
  feedbackURL,
  renderMicChoices,
});
const { drawWaveform, resetVisuals, startVisuals } = createMicrophoneVisualizer({
  ui,
  window,
  requestAnimationFrame,
  getView: () => view,
  isCurrent,
});

// Standard-only display preference. This changes presentation, never the audio or AI pipeline.
const VISUAL_MODE_STORAGE_KEY = 'trafficSoundGuardian.standardVisualMode';
function loadVisualMode() {
  try {
    const saved = window.localStorage?.getItem(VISUAL_MODE_STORAGE_KEY);
    return saved === 'waveform' ? 'waveform' : 'circle';
  } catch {
    return 'circle';
  }
}
function setVisualMode(next, save = true) {
  const select = ui['visual-mode-select'];
  if (!select) return; // Do not alter iPad Test.
  const mode = next === 'waveform' ? 'waveform' : 'circle';
  select.value = mode;
  document.body.dataset.visualization = mode;
  if (mode === 'waveform' && !session) drawWaveform(null);
  if (save) {
    try {
      window.localStorage?.setItem(VISUAL_MODE_STORAGE_KEY, mode);
    } catch {}
  }
}
setVisualMode(loadVisualMode(), false);
ui['visual-mode-select']?.addEventListener('change', () => setVisualMode(ui['visual-mode-select'].value));

$('standard-threshold')?.addEventListener('input', () => setStandardThreshold($('standard-threshold').value));
for (const [i, name] of Object.keys(WARNING_TARGETS).entries()) {
  $('threshold-default-' + i)?.addEventListener('click', () => {
    soundThresholds[name] = DEFAULT_THRESHOLD;
    renderThresholds();
    saveThresholds();
    renderDebug();
  });
}
window.addEventListener('storage', (event) => {
  if (!event.key || [THRESHOLD_STORAGE_KEY, STANDARD_THRESHOLD_STORAGE_KEY].includes(event.key)) {
    soundThresholds = loadThresholds();
    standardThreshold = loadStandardThreshold();
    renderThresholds();
    renderDebug();
  }
  if (!event.key || event.key === VISUAL_MODE_STORAGE_KEY) setVisualMode(loadVisualMode(), false);
  if (!event.key || event.key === ALERT_VOLUME_STORAGE_KEY) {
    alertVolume = loadAlertVolume();
    ui['alert-volume-select'].value = alertVolume;
    window.dispatchEvent?.(new CustomEvent('tsg:alert-volume', { detail: { level: alertVolume } }));
  }
  if (!event.key || event.key === ALERT_TONE_STORAGE_KEY) {
    alertToneEnabled = loadAlertToneEnabled();
    ui['alert-tone-toggle'].checked = alertToneEnabled;
    if (!alertToneEnabled && session) stopAlertTones(session);
  }
});
for (const row of thresholdRows) {
  row.input.addEventListener('input', () => changeThreshold(row.name, row.input.value));
  // Native range inputs with step='any' have browser-dependent keyboard
  // increments. Force the documented discrete stops for accessibility.
  row.input.addEventListener('keydown', (event) => {
    const old = soundThresholds[row.name];
    let next;
    if (event.key === 'Home') next = THRESHOLD_STOPS[0];
    else if (event.key === 'End') next = THRESHOLD_STOPS.at(-1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
      next = THRESHOLD_STOPS.find((value) => value > old + 1e-8) ?? THRESHOLD_STOPS.at(-1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      next = [...THRESHOLD_STOPS].reverse().find((value) => value < old - 1e-8) ?? THRESHOLD_STOPS[0];
    else return;
    event.preventDefault();
    changeThreshold(row.name, next);
  });
}
ui['threshold-reset']?.addEventListener('click', resetThresholds);
ui['alert-tone-toggle'].addEventListener('change', () =>
  setAlertToneEnabled(ui['alert-tone-toggle'].checked),
);
ui['alert-volume-select'].addEventListener('change', () => setAlertVolume(ui['alert-volume-select'].value));
ui['mic-select'].addEventListener('change', () => chooseMicrophone(ui['mic-select'].value));
ui['debug-toggle']?.addEventListener('change', () => setDebug(ui['debug-toggle'].checked));

ui['language-select'].addEventListener('change', () => setLanguage(ui['language-select'].value));
ui.feedback.addEventListener('click', (event) => {
  if (!feedbackURL(FEEDBACK_FORM_URLS[language === 'ja' ? 'ja' : 'en'])) event.preventDefault();
});
setLanguage(language);
ui['alert-tone-toggle'].checked = alertToneEnabled;
ui['alert-volume-select'].value = alertVolume;
renderThresholds();
resetVisuals();
setDebug(!!ui['debug-panel']); // Research data only on Test; never starts capture.

ui['mic-control'].addEventListener('click', () => {
  // Same callback as the original footer button, moved without changing its logic.
  if (!session || (!session.connected && session.context?.state !== 'running')) start();
  else stop();
});
ui.cancel.addEventListener('click', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session)
    stop('画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。');
});
window.addEventListener('pagehide', () => stop());
// No background or lock-screen operation. Start only on a deliberate microphone tap.

const settingsPanel = $('settings-panel');
document.addEventListener('click', (event) => {
  if (settingsPanel?.open && !settingsPanel.contains(event.target)) settingsPanel.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsPanel?.open) {
    settingsPanel.open = false;
    ui['settings-toggle'].focus();
    event.preventDefault();
  }
});

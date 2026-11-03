// Output-only settings preview on both pages. Never starts microphone or AI.
// Matches app.js' two 740Hz / 110ms beeps and the user-selected gain preset.
const button = document.getElementById('alert-preview-button');
const note = document.getElementById('alert-preview-note');
const status = document.getElementById('alert-preview-status');
const labels = {
  ja: ['通知音を試聴', '選択した音量の通知音を再生します。マイクとAIは起動しません。', '再生中…', '再生完了', 'この端末では再生できません。'],
  en: ['Play alert sound', 'Plays the alert at the selected level. Does not start microphone or AI.', 'Playing…', 'Played', 'Audio unavailable on this device.'],
  'zh-CN': ['试听提示音', '按所选音量试听提示音，不启动麦克风或 AI。', '播放中…', '播放完成', '此设备无法播放提示音。']
};
const words = () => labels[document.documentElement.lang] ?? labels.ja;
const gains = Object.freeze({soft:0.045, normal:0.09, clear:0.15});
let volumeLevel = 'normal';
try {
  const value = window.localStorage?.getItem('trafficSoundGuardian.alertVolume');
  if (Object.prototype.hasOwnProperty.call(gains,value)) volumeLevel = value;
} catch {}

// Apple platforms without a confirmed mixable policy must stay silent.
// navigator.audioSession is optional and Safari only implements a subset.
let captureActive = false;
let closing = false;
let closingPreview = null;
const compatibility = {
  ja: ['混音API未対応：Apple端末の試聴を停止しました。', '検知を停止してから試聴してください。', '他の音楽との同時再生は端末で確認が必要です。'],
  en: ['Mixing API unavailable: preview blocked on this Apple device.', 'Stop detection before previewing.', 'Music mixing requires verification on your device.'],
  'zh-CN': ['混音 API 不可用：已阻止此 Apple 设备试听。', '请先停止检测再试听。', '与音乐同时播放仍需在您的设备上验证。']
};
const compatibilityWords = () => compatibility[document.documentElement.lang] ?? compatibility.ja;
function ambientPolicy() {
  const nav = window.navigator ?? {};
  const apple = /iPad|iPhone|iPod|Mac/.test((nav.userAgent ?? '') + (nav.platform ?? ''));
  let audioSession, previous;
  try {
    audioSession = nav.audioSession;
    if (audioSession && typeof audioSession.type === 'string') {
      previous = audioSession.type;
      // Never overwrite a capture / exclusive session owned by another feature.
      if (!['auto', 'ambient'].includes(previous)) return null;
      audioSession.type = 'ambient'; // Must precede AudioContext construction/resume.
      if (audioSession.type !== 'ambient') { try { audioSession.type = previous; } catch {} return null; }
      let owned = true;
      return () => {
        if (!owned) return;
        owned = false;
        try { if (audioSession.type === 'ambient') audioSession.type = previous; } catch {}
      };
    }
  } catch {
    try { if (audioSession && previous !== undefined) audioSession.type = previous; } catch {}
    return null;
  }
  return apple ? null : () => {}; // Other engines: ordinary Web Audio, no mixing guarantee.
}
let active = null;
let statusIndex = null;
function showStatus(index) {
  statusIndex = index;
  status.textContent = index === null ? '' : index >= 5 ? compatibilityWords()[index - 5] : words()[index];
}
function announcePreview() {
  if (!button) return;
  button.textContent = words()[0];
  note.textContent = compatibilityWords()[2];
  button.closest?.('section')?.setAttribute('aria-label', words()[0]);
  if (status) showStatus(statusIndex);
}
function endPreview(handoff = false) {
  const current = active;
  if (!current) { if (handoff) closingPreview?.releasePolicy(); return; }
  active = null;
  closingPreview = current;
  closing = true;
  clearTimeout(current.timer);
  for (const {osc, gain} of current.nodes) {
    try { osc.onended = null; osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  }
  // close() is asynchronous in Web Audio; consume rejection on interrupted Safari sessions.
  // A capture handoff restores the policy synchronously, before its Context exists.
  if (handoff) current.releasePolicy();
  const done = () => { current.releasePolicy(); closingPreview = null; closing = false; button.disabled = false; };
  try { Promise.resolve(current.context.close()).catch(() => {}).then(done); } catch { done(); }
}
function playPreview() {
  if (active || closing || !button) return;
  if (captureActive) { statusIndex = 6; status.textContent = compatibilityWords()[1]; return; }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) { showStatus(4); return; }
  const releasePolicy = ambientPolicy();
  if (!releasePolicy) { statusIndex = 5; status.textContent = compatibilityWords()[0]; return; }
  let context;
  try {
    // Creating and resuming inside the click gesture is essential on iPad Safari.
    context = new AudioContextCtor();
    const current = {context, nodes:[], timer:null, releasePolicy};
    active = current;
    button.disabled = true;
    showStatus(2);
    // Browser may begin suspended; schedule immediately within the same gesture.
    const resume = context.resume();
    const peak = gains[volumeLevel];
    const start = context.currentTime + 0.02;
    const finalEnd = start + 0.195 + 0.11;
    for(let i=0; i<2; i++){
      const at = start + i * 0.195, end = at + 0.11;
      const osc = context.createOscillator(), gain = context.createGain();
      current.nodes.push({osc,gain});
      osc.type = 'sine';
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0,at);
      gain.gain.linearRampToValueAtTime(peak,at+0.015);
      gain.gain.setValueAtTime(peak,end-0.03);
      gain.gain.linearRampToValueAtTime(0,end);
      osc.connect(gain);
      gain.connect(context.destination);
      // The final oscillator ending is evidence that the scheduled beeps completed.
      // A fixed wall-clock timer alone can falsely report success (or cut sound off)
      // while Safari's AudioContext is suspended by an OS audio interruption.
      if (i === 1) osc.onended = () => {
        if (active !== current) return;
        const played = context.state === 'running' && context.currentTime >= finalEnd;
        endPreview();
        showStatus(played ? 3 : 4);
      };
      osc.start(at);
      osc.stop(end);
    }
    Promise.resolve(resume).catch(() => {
      if (active === current) {
        endPreview(); showStatus(4);
      }
    });
    // Safety timeout only: wait for the real audio graph to finish. If the
    // onended callback is missing, require AudioContext time to have advanced.
    current.timer = setTimeout(() => {
      if (active === current) {
        const played = context.state === 'running' && context.currentTime >= finalEnd;
        endPreview();
        showStatus(played ? 3 : 4);
      }
    }, 3000);
  } catch (error) {
    if (active) endPreview();
    else { releasePolicy(); try { Promise.resolve(context?.close()).catch(() => {}); } catch {} }
    showStatus(4);
    console.warn('[Traffic Sound Guardian] Manual alert preview unavailable:',error);
  }
}
if (button && note && status) {
  button.addEventListener('click',playPreview);
  window.addEventListener('tsg:language',announcePreview);
  window.addEventListener('tsg:capture',event => {
    captureActive = !!event.detail?.active;
    if (captureActive) { endPreview(true); showStatus(null); }
  });
  window.addEventListener('tsg:alert-volume',event => {
    const value = event?.detail?.level;
    if (Object.prototype.hasOwnProperty.call(gains,value)) volumeLevel = value;
  });
  window.addEventListener('pagehide',() => { endPreview(); showStatus(null); });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) { endPreview(); showStatus(null); }
  });
  announcePreview();
}

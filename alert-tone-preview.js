// iPad-only output test. No microphone, classifier, alarm state, or user data.
// Matches the production two-beep pattern in app.js: 740 Hz sine, two 110 ms
// beeps with an 85 ms gap, and 0.045 peak gain. No automatic audio playback.
const button = document.getElementById('alert-preview-button');
const note = document.getElementById('alert-preview-note');
const status = document.getElementById('alert-preview-status');
const labels = {
  ja: ['通知音を試聴', '実際の通知音を再生します。マイクとAIは起動しません。', '再生中…', '再生完了', 'この端末では再生できません。'],
  en: ['Play alert sound', 'Play the real alert beeps. Does not start microphone or AI.', 'Playing…', 'Played', 'Audio unavailable on this device.'],
  'zh-CN': ['试听提示音', '播放实际提示音，不启动麦克风或 AI。', '播放中…', '播放完成', '此设备无法播放提示音。']
};
const words = () => labels[document.documentElement.lang] ?? labels.ja;
let active = null;
function announcePreview() {
  if (!button) return;
  button.textContent = words()[0];
  note.textContent = words()[1];
}
function endPreview() {
  const current = active;
  if (!current) return;
  active = null;
  clearTimeout(current.timer);
  for (const {osc, gain} of current.nodes) {
    try { osc.onended = null; osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  }
  try { current.context.close(); } catch {}
  button.disabled = false;
}
function playPreview() {
  if (active || !button) return;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) { status.textContent = words()[4]; return; }
  let context;
  try {
    // Creating and resuming inside the click gesture is essential on iPad Safari.
    context = new AudioContextCtor();
    const current = {context, nodes:[], timer:null};
    active = current;
    button.disabled = true;
    status.textContent = words()[2];
    // Browser may begin suspended; schedule immediately within the same gesture.
    const resume = context.resume();
    const start = context.currentTime + 0.02;
    for(let i=0; i<2; i++){
      const at = start + i * 0.195, end = at + 0.11;
      const osc = context.createOscillator(), gain = context.createGain();
      current.nodes.push({osc,gain});
      osc.type = 'sine';
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0,at);
      gain.gain.linearRampToValueAtTime(0.045,at+0.015);
      gain.gain.setValueAtTime(0.045,end-0.03);
      gain.gain.linearRampToValueAtTime(0,end);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(at);
      osc.stop(end);
    }
    Promise.resolve(resume).catch(() => {
      if (active === current) {
        endPreview(); status.textContent = words()[4];
      }
    });
    current.timer = setTimeout(() => {
      if (active === current) {
        endPreview(); status.textContent = words()[3];
      }
    }, 700);
  } catch (error) {
    if (active) endPreview();
    else try { context?.close(); } catch {}
    status.textContent = words()[4];
    console.warn('[Traffic Sound Guardian] Manual alert preview unavailable:',error);
  }
}
if (button && note && status) {
  button.addEventListener('click',playPreview);
  window.addEventListener('tsg:language',announcePreview);
  window.addEventListener('pagehide',endPreview);
  document.addEventListener('visibilitychange',() => { if (document.hidden) endPreview(); });
  announcePreview();
}

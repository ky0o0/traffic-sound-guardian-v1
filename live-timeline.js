// Ten-second visual amplitude history; never retains PCM or writes audio to storage.
// The real YAMNet controller emits read-only scalar data and time-aligned predictions.
const canvas = document.getElementById('rolling-waveform');
const list = document.getElementById('rolling-events');
const heading = document.getElementById('rolling-heading');
const foot = document.getElementById('rolling-note');
const currentLabel = document.getElementById('rolling-current-label');
const currentValue = document.getElementById('rolling-current-value');
const canvasContext = canvas?.getContext('2d');
const spanSeconds = 10;
// Only the iPad test layout shows a mirrored *visual* amplitude percentage axis.
// This is the existing soft-limited RMS animation scale, not a calibrated sound
// pressure level, true microphone gain, or numerical accuracy percentage.
const ipadPercentMode = document.body?.classList?.contains?.('ipad-test') === true;
const visualAmplitude = rms => Math.max(0, Math.min(1,
  Math.tanh(Math.pow(Math.max(0, rms), 0.65) * 11.5)));
const percentNotes = {
  ja: '縦軸：相対表示振幅（上下とも0～100%、音量の実測値ではありません）。赤：AIの警告判定区間。音声は保存しません。',
  en: 'Y-axis: relative display amplitude (0–100% mirrored, not measured loudness). Red: AI warning windows. Audio is not saved.',
  'zh-CN': '纵轴：相对显示振幅（上下镜像0～100%，不代表实际音量）。红色：AI 警告区间。不保存音频。'
};
let levels = [], marks = [], currentTime = 0;
// Ordinary top-category text is refreshed at most once every 2s from real
// inference results. Traffic warnings always bypass this visual-only interval.
const NORMAL_UPDATE_MS = 2000;
let currentSound = null, changedAtMs = -Infinity, hasAudio = false;
const dictionary = {
  ja: ['直近10秒の音声', '赤色：AIが警告音と判定した窓。音声は保存しません。', '最近の警告なし'],
  en: ['Last 10 seconds', 'Red: AI-positive analysis windows. Audio is not saved.', 'No recent detections'],
  'zh-CN': ['最近10秒声音', '红色：AI判断含警告音的分析窗口。不保存音频。', '最近没有警告音']
};
const currentText = {
  ja: ['現在のAI識別結果', '検知開始前', '解析中…'],
  en: ['Current AI prediction', 'Not started', 'Analyzing…'],
  'zh-CN': ['当前AI识别结果', '尚未开始检测', '分析中…']
};
function lang() { return dictionary[document.documentElement.lang] ?? dictionary.ja; }
function announce() {
  if (!heading) return;
  heading.textContent = lang()[0];
  foot.textContent = ipadPercentMode ? (percentNotes[document.documentElement.lang] ?? percentNotes.ja) : lang()[1];
  canvas?.setAttribute('aria-label',lang()[0] + (ipadPercentMode ? ' · mirrored relative display amplitude, 0–100% on each side' : ''));
  recentEvents(); // Refresh Japanese/English/Chinese warning labels immediately.
  renderCurrent();
}
function expire(t) {
  const cutoff = t - spanSeconds;
  while (levels.length && levels[0].time < cutoff - .2) levels.shift();
  while (marks.length && marks[0].end < cutoff) marks.shift();
}
// Restore the original symmetric waveform style on iPad with a legible, mirrored
// relative visual-amplitude scale: labels are 0/50/100% on BOTH halves, never
// negative percentages. The nonlinear visual gain remains explicitly uncalibrated.
function drawIpadPercent(c, w, h, light) {
  const left = 51, right = Math.max(left + 22, w - 12);
  const top = 22, bottom = Math.max(top + 20, h - 26);
  const plotWidth = right - left, plotHeight = bottom - top;
  const center = (top + bottom) / 2;
  const half = plotHeight / 2;
  const grid = light ? '#d8e2e9' : '#304258';
  const text = light ? '#56697d' : '#b7cadc';
  const base = light ? '#6887a0' : '#91bad0';
  const warning = light ? '#c5223b' : '#ff596b';
  c.font = '10px system-ui,sans-serif';
  c.textAlign = 'left';
  c.fillStyle = text;
  c.fillText('%', 7, 12);
  // Top and bottom both indicate magnitude away from the central zero line.
  const axisTicks = [
    {label:'100',y:top}, {label:'50',y:top + half/2},
    {label:'0',y:center}, {label:'50',y:center + half/2},
    {label:'100',y:bottom}
  ];
  for (const tick of axisTicks) {
    c.strokeStyle = grid;
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(left,tick.y); c.lineTo(right,tick.y); c.stroke();
    c.fillStyle = text;
    c.fillText(tick.label, 7, Math.min(bottom-2, Math.max(top+9, tick.y+3)));
  }
  const start = currentTime - spanSeconds;
  const xOf = t => left + (t-start) * plotWidth/spanSeconds;
  c.save();
  c.beginPath(); c.rect(left,top,plotWidth,plotHeight); c.clip();
  for (const p of levels) {
    const x=xOf(p.time);
    if (x < left || x > right || !Number.isFinite(p.rms)) continue;
    const amp = visualAmplitude(p.rms) * Math.max(0, half-2);
    const flagged=marks.some(m => p.time>=m.start && p.time<=m.end);
    c.strokeStyle=flagged ? warning : base;
    c.lineWidth=Math.max(1.5,Math.min(2.4,plotWidth/180));
    c.beginPath();
    c.moveTo(x,center-amp);
    c.lineTo(x,center+amp);
    c.stroke();
  }
  c.restore();
  c.fillStyle=text;
  c.font='10px system-ui,sans-serif';
  c.fillText('-10s',left,h-5);
  c.fillText('-5s',left+plotWidth/2-9,h-5);
  c.fillText('Now',right-23,h-5);
}
function draw() {
  if (!canvasContext) return;
  const w = Math.max(100, canvas.clientWidth || 320), h = Math.max(65, canvas.clientHeight || 108);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  }
  const c = canvasContext;
  c.setTransform(ratio,0,0,ratio,0,0);
  c.clearRect(0,0,w,h);
  const light = document.documentElement.dataset.theme === 'light';
  const base = light ? '#6887a0' : '#91bad0';
  const red = light ? '#c5223b' : '#ff596b';
  if (ipadPercentMode) { drawIpadPercent(c, w, h, light); return; }
  const center = h * .48;
  const start = currentTime - spanSeconds;
  const xOf = t => (t-start) * w / spanSeconds;
  c.strokeStyle = light ? '#d8e2e9' : '#304258';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0,center); c.lineTo(w,center); c.stroke();
  // Warning windows color ONLY the matching audio waveform samples red.
  // Never draw full-height shaded warning intervals behind the waveform.
  for (const p of levels) {
    const x = xOf(p.time);
    if (x < 0 || x > w) continue;
    const flagged = marks.some(m => p.time >= m.start && p.time <= m.end);
    // Visual-only soft-limited gain: quiet audio is easier to see; PCM, RMS and AI scores remain unchanged.
    // A lower near-silence floor makes soft sounds visible without making the baseline look loud.
    const amp = Math.tanh(Math.pow(p.rms, 0.65) * 11.5) * h * .45;
    c.strokeStyle = flagged ? red : base;
    c.lineWidth = Math.max(1.5,w/260);
    c.beginPath(); c.moveTo(x,center-amp); c.lineTo(x,center+amp); c.stroke();
  }
  c.fillStyle = light ? '#56697d' : '#b7cadc';
  c.font = '11px system-ui,sans-serif';
  c.fillText('-10s',5,h-5);
  c.fillText('-5s',w/2-8,h-5);
  c.fillText('Now',w-29,h-5);
}
function recentEvents() {
  if (!list) return;
  const visible = marks.filter(x => x.end >= currentTime - spanSeconds);
  const message = visible.length ? visible.slice(-3).reverse().map(x => localized(x)).join(' · ') : lang()[2];
  if (list.textContent !== message) list.textContent = message; // Avoid needless 60fps DOM writes.
}
// Labels originate from the same model category and are pretranslated by app.js.
// Unsupported Chinese categories intentionally fall back to their official English name.
function localized(item) {
  return item.labels?.[document.documentElement.lang] ?? item.label ?? item.categoryName ?? '';
}
function renderCurrent() {
  const locale = document.documentElement.lang;
  const words = currentText[locale] ?? currentText.ja;
  if (currentLabel && currentLabel.textContent !== words[0]) currentLabel.textContent = words[0];
  const value = currentSound ? localized(currentSound) : hasAudio ? words[2] : words[1];
  if (currentValue && currentValue.textContent !== value) currentValue.textContent = value;
  if (currentValue) currentValue.dataset.warning = currentSound?.warning ? 'true' : 'false';
}
function onClassification(event) {
  const {categoryName,labels,timeMs,warningName,warningLabels} = event.detail ?? {};
  if (typeof categoryName !== 'string' || !categoryName || !Number.isFinite(timeMs)) return;
  if (typeof warningName === 'string' && warningName) {
    // Every valid traffic-warning prediction is displayed immediately, even
    // inside an ordinary 2-second slot. Preserve warning priority.
    if (currentSound?.categoryName !== warningName || !currentSound.warning) {
      currentSound = {categoryName:warningName,labels:warningLabels,warning:true};
      changedAtMs = timeMs;
    }
    renderCurrent();
    return;
  }
  // First genuine prediction appears without delay. Thereafter take the most
  // recent top category from the first real inference at/after each 2s boundary.
  // No consecutive-identical-result gate and no extra model inference/timer.
  if (timeMs - changedAtMs < NORMAL_UPDATE_MS) return;
  currentSound = {categoryName,labels,warning:false};
  changedAtMs = timeMs; // Advance the interval even when the category is unchanged.
  renderCurrent();
}
function onVisual(event) {
  const {time,rms} = event.detail ?? {};
  if (!Number.isFinite(time) || !Number.isFinite(rms)) return;
  if (time < currentTime) { levels = []; marks = []; } // New AudioContext timebase.
  currentTime = time;
  if (!hasAudio) { hasAudio = true; renderCurrent(); }
  levels.push({time,rms:Math.max(0,rms)});
  if (levels.length>720) levels.shift();
  expire(time);
  draw();
  recentEvents();
}
function onWarning(event) {
  const {start,end,label} = event.detail ?? {};
  if (![start,end].every(Number.isFinite) || start >= end) return;
  const name = String(label||'Warning').slice(0,64);
  const prev = marks[marks.length-1];
  if (prev && prev.label === name && start <= prev.end + .12) prev.end = Math.max(prev.end,end);
  else marks.push({start,end,label:name,labels:event.detail?.labels ?? null});
  if (marks.length > 80) marks.shift();
  expire(currentTime);
  draw();
  recentEvents();
}
function reset() {
  levels = []; marks = []; currentTime = 0;
  currentSound = null; changedAtMs = -Infinity; hasAudio = false;
  draw(); recentEvents(); renderCurrent();
}
if (canvasContext) {
  window.addEventListener('tsg:visual',onVisual);
  window.addEventListener('tsg:warning',onWarning);
  window.addEventListener('tsg:classification',onClassification);
  window.addEventListener('tsg:language',announce);
  window.addEventListener('tsg:reset',reset);
  new MutationObserver(announce).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  announce();reset();
}

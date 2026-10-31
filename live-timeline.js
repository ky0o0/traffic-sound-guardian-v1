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
// The iPad test layout alone displays unamplified RMS as dBFS rather than
// the normal page's amplified symmetric amplitude. Never treat dBFS as dB SPL.
const ipadDbfsMode = document.body?.classList?.contains?.('ipad-test') === true;
const DBFS_FLOOR = -90;
const dbfsFromRms = rms => Math.max(DBFS_FLOOR, Math.min(0,
  20 * Math.log10(Math.max(1e-9, rms))));
const dbfsNotes = {
  ja: '縦軸：dBFS（デジタル音声の相対レベル。実際の騒音dB SPLではありません）。赤：AIの警告判定区間。音声は保存しません。',
  en: 'Y-axis: dBFS (digital audio level, not calibrated environmental dB SPL). Red: AI warning windows. Audio is not saved.',
  'zh-CN': '纵轴：dBFS（数字音频相对声级，不是经过校准的环境声压 dB SPL）。红色：AI 警告区间。不保存音频。'
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
  foot.textContent = ipadDbfsMode ? (dbfsNotes[document.documentElement.lang] ?? dbfsNotes.ja) : lang()[1];
  canvas?.setAttribute('aria-label',lang()[0] + (ipadDbfsMode ? ' · dBFS, -90 to 0' : ''));
  recentEvents(); // Refresh Japanese/English/Chinese warning labels immediately.
  renderCurrent();
}
function expire(t) {
  const cutoff = t - spanSeconds;
  while (levels.length && levels[0].time < cutoff - .2) levels.shift();
  while (marks.length && marks[0].end < cutoff) marks.shift();
}
// A true digital dBFS timeline for iPad: 0 dBFS = full-scale RMS, and
// -90 dBFS is a visualization floor for silence. All sample coordinates are
// constrained to the plot, with time and dBFS labels in reserved margins.
// This is NOT a calibrated sound-pressure-level meter.
function drawIpadDbfs(c, w, h, light) {
  const left = 56, right = Math.max(left + 22, w - 12);
  const top = 21, bottom = Math.max(top + 20, h - 27);
  const plotWidth = right - left, plotHeight = bottom - top;
  const grid = light ? '#d8e2e9' : '#304258';
  const text = light ? '#56697d' : '#b7cadc';
  const base = light ? '#6887a0' : '#91bad0';
  const warning = light ? '#c5223b' : '#ff596b';
  c.lineWidth = 1;
  c.font = '10px system-ui,sans-serif';
  c.textAlign = 'left';
  c.fillStyle = text;
  c.fillText('dBFS', 6, 12);
  const yOf = db => top + (-db / -DBFS_FLOOR) * plotHeight;
  for (const db of [0, -30, -60, -90]) {
    const y = yOf(db);
    c.strokeStyle = grid;
    c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.stroke();
    c.fillStyle = text;
    c.fillText(String(db), 7, y + (db === 0 ? 9 : db === DBFS_FLOOR ? -3 : 3));
  }
  const start = currentTime - spanSeconds;
  const xOf = t => left + (t - start) * plotWidth / spanSeconds;
  // Trim every waveform segment to the chart box; never draw over legends.
  c.save();
  c.beginPath(); c.rect(left, top, plotWidth, plotHeight); c.clip();
  let prev = null;
  for (const p of levels) {
    const x = xOf(p.time);
    if (x < left || x > right || !Number.isFinite(p.rms)) {
      prev = null;
      continue;
    }
    const y = yOf(dbfsFromRms(p.rms));
    const flagged = marks.some(m => p.time >= m.start && p.time <= m.end);
    c.strokeStyle = flagged ? warning : base;
    c.lineWidth = Math.max(1.5, Math.min(2.4, plotWidth / 180));
    c.beginPath();
    if (prev && p.time - prev.time <= .25) c.moveTo(prev.x, prev.y);
    else c.moveTo(x, y);
    c.lineTo(x, y);
    c.stroke();
    prev = {time:p.time, x, y};
  }
  c.restore();
  c.fillStyle = text;
  c.font = '10px system-ui,sans-serif';
  c.fillText('-10s',left,h-6);
  c.fillText('-5s',left+plotWidth/2-9,h-6);
  c.fillText('Now',right-23,h-6);
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
  if (ipadDbfsMode) { drawIpadDbfs(c, w, h, light); return; }
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

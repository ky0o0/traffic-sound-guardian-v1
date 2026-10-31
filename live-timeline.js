// Ten-second visual amplitude history; never retains PCM or writes audio to storage.
// The real YAMNet controller emits read-only scalar data and time-aligned predictions.
const canvas = document.getElementById('rolling-waveform');
const list = document.getElementById('rolling-events');
const heading = document.getElementById('rolling-heading');
const foot = document.getElementById('rolling-note');
const canvasContext = canvas?.getContext('2d');
const spanSeconds = 10;
let levels = [], marks = [], currentTime = 0;
const dictionary = {
  ja: ['直近10秒の音声', '赤色：AIが警告音と判定した窓。音声は保存しません。', '最近の警告なし'],
  en: ['Last 10 seconds', 'Red: AI-positive analysis windows. Audio is not saved.', 'No recent detections'],
  'zh-CN': ['最近10秒声音', '红色：AI判断含警告音的分析窗口。不保存音频。', '最近没有警告音']
};
function lang() { return dictionary[document.documentElement.lang] ?? dictionary.ja; }
function announce() {
  if (!heading) return;
  heading.textContent = lang()[0];
  foot.textContent = lang()[1];
  canvas?.setAttribute('aria-label',lang()[0]);
}
function expire(t) {
  const cutoff = t - spanSeconds;
  while (levels.length && levels[0].time < cutoff - .2) levels.shift();
  while (marks.length && marks[0].end < cutoff) marks.shift();
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
  const center = h * .48;
  const start = currentTime - spanSeconds;
  const xOf = t => (t-start) * w / spanSeconds;
  c.strokeStyle = light ? '#d8e2e9' : '#304258';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(0,center); c.lineTo(w,center); c.stroke();
  for (const m of marks) {
    const left = Math.max(0,xOf(m.start)), right = Math.min(w,xOf(m.end));
    if (right <= left) continue;
    c.fillStyle = light ? '#fae3e6' : '#70253380';
    c.fillRect(left,4,right-left,h-8);
  }
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
  list.textContent = visible.length ? visible.slice(-3).reverse().map(x => x.label).join(' · ') : lang()[2];
}
function onVisual(event) {
  const {time,rms} = event.detail ?? {};
  if (!Number.isFinite(time) || !Number.isFinite(rms)) return;
  if (time < currentTime) { levels = []; marks = []; } // New AudioContext timebase.
  currentTime = time;
  levels.push({time,rms:Math.max(0,rms)});
  if (levels.length>450) levels.shift();
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
  else marks.push({start,end,label:name});
  if (marks.length > 80) marks.shift();
  expire(currentTime);
  draw();
  recentEvents();
}
function reset() {
  levels = []; marks = []; currentTime = 0;
  draw(); recentEvents();
}
if (canvasContext) {
  window.addEventListener('tsg:visual',onVisual);
  window.addEventListener('tsg:warning',onWarning);
  window.addEventListener('tsg:reset',reset);
  new MutationObserver(announce).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  announce();reset();
}

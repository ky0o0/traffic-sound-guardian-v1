// V1.6 site-wide theme preference; the only persisted value is 'system'|'light'|'dark'.
const KEY = 'trafficSoundGuardian.theme';
const OPTIONS = ['system', 'light', 'dark'];
const dictionaries = {
  ja: {label:'表示テーマ',system:'端末に合わせる',light:'ライト',dark:'ダーク'},
  en: {label:'Appearance',system:'System',light:'Light',dark:'Dark'},
  'zh-CN': {label:'外观主题',system:'跟随系统',light:'浅色',dark:'深色'}
};
const media = window.matchMedia?.('(prefers-color-scheme: dark)');
function preference() {
  try { const p = localStorage.getItem(KEY); return OPTIONS.includes(p) ? p : 'system'; }
  catch { return 'system'; }
}
let selected = preference();
function apply() {
  const active = selected === 'system' ? (media?.matches ? 'dark' : 'light') : selected;
  document.documentElement.dataset.theme = active;
  document.documentElement.style.colorScheme = active;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor && document.body?.dataset.state !== 'warning') {
    themeColor.setAttribute('content', active === 'light' ? '#f5f7fb' : '#101a2c');
  }
  const select = document.getElementById('theme-select');
  if (select && select.value !== selected) select.value = selected;
}
function display() {
  const select = document.getElementById('theme-select');
  if (!select) return;
  const lang = ['ja','en','zh-CN'].includes(document.documentElement.lang) ? document.documentElement.lang : 'ja';
  const t = dictionaries[lang];
  select.setAttribute('aria-label', t.label);
  const visibleLabel = select.parentElement?.querySelector('.theme-picker-label');
  if (visibleLabel) visibleLabel.textContent = t.label;
  for (const option of select.options) option.textContent = t[option.value];
}
function initialize() {
  const host = document.getElementById('settings-content') || document.querySelector('.toolbar') || document.body;
  const standalone = host === document.body;
  if (!host || document.getElementById('theme-select')) return;
  const label = document.createElement('label');
  label.className = standalone ? 'theme-picker standalone' : 'theme-picker';
  const text = document.createElement('span');
  text.className = host.id === 'settings-content' ? 'theme-picker-label' : 'sr-only';
  const select = document.createElement('select');
  select.id = 'theme-select';
  for (const key of OPTIONS) {
    const option = document.createElement('option');
    option.value = key; option.textContent = key;
    select.append(option);
  }
  select.value = selected;
  select.addEventListener('change', () => {
    selected = OPTIONS.includes(select.value) ? select.value : 'system';
    try { localStorage.setItem(KEY, selected); } catch {}
    apply(); display();
  });
  label.append(text, select);
  if (standalone) host.insertBefore(label,host.firstChild);
  else host.append(label);
  display();
  // Other pages may update lang after initialization.
  new MutationObserver(display).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
}
apply();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
else initialize();
media?.addEventListener?.('change', () => { if (selected === 'system') apply(); });

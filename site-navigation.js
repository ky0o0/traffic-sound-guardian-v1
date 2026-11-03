// Shared presentation only. Page controllers retain language, audio and model ownership.
const pages = [
  ['index.html', { en: 'Standard', ja: 'Standard（標準）', 'zh-CN': 'Standard（标准）' }],
  ['ipad-test.html', { en: 'Test', ja: 'Test（研究）', 'zh-CN': 'Test（研究）' }],
  ['ai-test.html', { en: 'AI Test', ja: 'AIテスト', 'zh-CN': 'AI 测试' }],
  ['microphone-test.html', { en: 'Microphone Test', ja: 'マイクテスト', 'zh-CN': '麦克风测试' }],
];
const current = location.pathname.split('/').pop() || 'index.html';
const brand = document.querySelector('.brand');
const nav = document.createElement('nav');
nav.className = 'site-navigation';
const links = pages.map(([path]) => {
  const link = document.createElement('a');
  if (path === current) link.setAttribute('aria-current', 'page');
  nav.append(link);
  return link;
});
brand.append(nav);
// Keep the offline page's theme control outside its rerendered application root.
const standaloneTheme = document.querySelector('.theme-picker.standalone');
if (standaloneTheme) {
  standaloneTheme.classList.remove('standalone');
  brand.append(standaloneTheme);
}
let panelLinks = [];
if (document.body.dataset.mode === 'test') {
  const panelNavigation = document.createElement('nav');
  panelNavigation.className = 'panel-navigation';
  panelLinks = ['left', 'center', 'right'].map((name) => {
    const panel = document.querySelector('.ipad-' + name);
    panel.id = 'workspace-' + name;
    const link = document.createElement('a');
    link.href = '#workspace-' + name;
    panelNavigation.append(link);
    return link;
  });
  brand.after(panelNavigation);
}
function translateNavigation() {
  const lang = ['en', 'ja', 'zh-CN'].includes(document.documentElement.lang)
    ? document.documentElement.lang
    : 'ja';
  nav.setAttribute('aria-label', { en: 'Workspace', ja: 'ページ切替', 'zh-CN': '工作区导航' }[lang]);
  if (panelLinks.length) {
    const names = {
      en: ['Controls', 'Live research', 'Thresholds'],
      ja: ['操作', '研究データ', 'しきい値'],
      'zh-CN': ['操作控制', '实时研究', '阈值设置'],
    }[lang];
    panelLinks.forEach((link, index) => {
      link.textContent = names[index];
    });
    panelLinks[0].parentElement.setAttribute(
      'aria-label',
      {
        en: 'Research sections',
        ja: '研究セクション',
        'zh-CN': '研究页面分区',
      }[lang],
    );
  }
  pages.forEach(([path, names], index) => {
    links[index].textContent = names[lang];
    links[index].href = './' + path + '?lang=' + lang;
  });
}
translateNavigation();
new MutationObserver(translateNavigation).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['lang'],
});

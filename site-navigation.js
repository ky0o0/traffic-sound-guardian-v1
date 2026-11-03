// Narrow-screen section shortcuts for the three-panel Test workspace.
const brand = document.querySelector('.brand');
const panelNavigation = document.createElement('nav');
panelNavigation.className = 'panel-navigation';
const panelLinks = ['left', 'center', 'right'].map((name) => {
  const panel = document.querySelector('.ipad-' + name);
  panel.id = 'workspace-' + name;
  const link = document.createElement('a');
  link.href = '#workspace-' + name;
  panelNavigation.append(link);
  return link;
});
brand.after(panelNavigation);

function translatePanelNavigation() {
  const lang = ['en', 'ja', 'zh-CN'].includes(document.documentElement.lang)
    ? document.documentElement.lang
    : 'ja';
  const names = {
    en: ['Controls', 'Live research', 'Thresholds'],
    ja: ['操作', '研究データ', 'しきい値'],
    'zh-CN': ['操作控制', '实时研究', '阈值设置'],
  }[lang];
  panelLinks.forEach((link, index) => {
    link.textContent = names[index];
  });
  panelNavigation.setAttribute(
    'aria-label',
    {
      en: 'Research sections',
      ja: '研究セクション',
      'zh-CN': '研究页面分区',
    }[lang],
  );
}
translatePanelNavigation();
new MutationObserver(translatePanelNavigation).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['lang'],
});

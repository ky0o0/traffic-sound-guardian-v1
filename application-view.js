import { LANGUAGE_STORAGE_KEY } from './app-i18n.js?v=1.7.5';
export function createApplicationView({
  ui,
  document,
  window,
  translate: t,
  feedbackForms,
  feedbackURL,
  renderMicChoices,
}) {
  const $ = (id) => document.getElementById(id);
  function renderStatus(state, description = '', currentSession) {
    document.body.dataset.state = state;
    const session = currentSession;
    const warning = state === 'warning';
    ui['theme-color'].setAttribute(
      'content',
      warning ? '#c7263a' : document.documentElement.dataset?.theme === 'light' ? '#f5f7fb' : '#101a2c',
    );
    ui['warning-details'].hidden = !warning;
    ui.description.hidden = warning || (!!ui['debug-panel'] && state === 'stopped' && !description);
    const texts = {
      stopped: [
        '検知を停止しました',
        '停止中',
        description || '開始すると、周囲の交通警告音を\nこの端末で識別します。',
      ],
      loading: [
        'AIモデルを読み込み中...',
        '準備中',
        description || '初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。',
      ],
      priming: ['マイクの音を確認中...', '準備中', '最初の音声をAIで解析しています。'],
      listening: ['周囲の音を検知中...', '検知中', '交通警告音を検知すると、\n警告を表示します。'],
      warning: ['警告音を検知しました', '周囲を確認してください', ''],
    }[state];
    // Repeated raw-score updates must not reannounce an identical live heading.
    for (const [node, value] of [
      [ui.heading, t(texts[0])],
      [ui['status-label'], t(texts[1])],
      [ui.description, t(texts[2])],
    ]) {
      if (node.textContent !== value) node.textContent = value;
    }
    if (warning && session?.gate.target) {
      const name = t(session.gate.target.label);
      if (ui['sound-type'].textContent !== name) ui['sound-type'].textContent = name;
      ui.score.textContent = session.gate.target.score.toFixed(2);
    }
  }
  function updateButtons(session) {
    // The circle uses the exact control path formerly assigned to the footer.
    const needsTap = session && !session.connected && session.context?.state !== 'running';
    const start = !session || needsTap;
    const label = start ? '検知を開始' : '検知を停止';
    ui['mic-control'].disabled = false;
    ui['mic-control'].setAttribute('aria-label', t(label));
    ui['mic-control'].setAttribute('title', t(label));
    if ($('action-label')) $('action-label').textContent = t(label);
    ui['mic-control'].setAttribute('aria-pressed', String(!!session && session.connected));
    ui.cancel.hidden = !(session && needsTap);
  }
  function translateSettings({ language, alertToneEnabled, alertVolume }) {
    ui['language-select'].value = language;
    if (ui['settings-title']) ui['settings-title'].textContent = t('設定');
    $('settings-links').setAttribute('aria-label', t('補助メニュー'));
    const back = document.querySelector?.('.ipad-back');
    if (back) {
      back.textContent = '← ' + t('通常版');
      back.setAttribute('aria-label', t('通常版'));
    }
    document.querySelector?.('.ipad-center')?.setAttribute('aria-label', t('音声とAI識別'));
    ui['settings-toggle']?.setAttribute('aria-label', t('設定'));
    ui['language-select-label'].textContent = t('言語');
    const visualSelect = $('visual-mode-select');
    if (visualSelect) {
      $('visual-mode-label').textContent = t('中央の表示');
      $('visual-mode-note').textContent = t(
        'マイク入力の波形をリアルタイムで表示します。音声は保存されません。',
      );
      for (const option of visualSelect.options ?? []) {
        const key = { circle: '円形アニメーション', bars: 'スクロール波形', waveform: 'リアルタイム波形' }[option.value];
        option.textContent = t(key);
      }
      ui.waveform.setAttribute('aria-label', t(visualSelect.value === 'bars' ? 'スクロール波形' : 'リアルタイムのマイク波形'));
    }
    ui['alert-tone-label'].textContent = t('通知音を鳴らす');
    ui['alert-tone-note'].textContent = t(
      '新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。',
    );
    ui['alert-tone-toggle'].setAttribute('aria-label', t('通知音を鳴らす'));
    ui['alert-tone-toggle'].checked = alertToneEnabled;
    ui['alert-volume-label'].textContent = t('通知音の音量');
    ui['alert-volume-note'].textContent = t(
      '実際の音圧は端末やイヤホンによって異なります。低い設定から試してください。',
    );
    for (const option of ui['alert-volume-select'].options ?? []) {
      const names = { soft: '小', normal: '標準', clear: 'はっきり' };
      option.textContent = t(names[option.value]);
    }
    ui['alert-volume-select'].value = alertVolume;
    ui['mic-select-label'].textContent = t('使用するマイク');
    ui['mic-select-note'].textContent = t(
      '利用できる機器はマイクの許可後に表示されます。変更すると検知を再起動します。',
    );
    renderMicChoices();
    ui['language-select'].setAttribute('aria-label', t('言語'));
    // Both pages share the same controller and language preference. The
    // selected page is marked in HTML; navigating stops capture via pagehide.
    ui['version-switch-title'].textContent = t('表示バージョン');
    ui['version-standard'].textContent = {
      ja: 'Standard（標準版）',
      en: 'Standard',
      'zh-CN': 'Standard（标准版）',
    }[language];
    ui['version-ipad'].textContent = { ja: 'Test（テスト版）', en: 'Test', 'zh-CN': 'Test（测试版）' }[
      language
    ];
    ui['version-standard'].setAttribute('href', './index.html?lang=' + language);
    ui['version-ipad'].setAttribute('href', './ipad-test.html?lang=' + language);
    try {
      window.sessionStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {}
    ui['ai-test-link'].setAttribute('href', './ai-test.html?v=1.7.5&lang=' + language);
    ui['microphone-test-link'].setAttribute('href', './microphone-test.html?v=1.7.5&lang=' + language);
    for (const [id, text] of Object.entries({
      'ai-test-link': 'AIテストモード（オフライン研究） ↗',
      'microphone-test-link': 'マイク接続テスト（イヤホン入力） ↗',
      cancel: '読み込みを中止',
      'score-label': '識別スコア：',
      'sensitivity-heading': '交通警告音の感度設定',
      'sensitivity-note':
        '1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。',
      'threshold-reset': 'すべて標準に戻す',
      privacy: '音声は保存・送信されません',
      research: '研究用プロトタイプ · 安全を保証するものではありません',
    })) {
      if (ui[id]) ui[id].textContent = t(text);
    }
    ui['page-description'].setAttribute(
      'content',
      t('イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。'),
    );
    const url = feedbackURL(feedbackForms[language === 'ja' ? 'ja' : 'en']);
    if (url) ui.feedback.setAttribute('href', url);
    else ui.feedback.removeAttribute('href');
    ui.feedback.setAttribute('aria-disabled', String(!url));
    ui.feedback.setAttribute(
      'title',
      t(url ? 'Googleフォームを新しいタブで開く' : 'フィードバックフォームは準備中です。'),
    );
    ui.feedback.textContent = t(url ? 'ご意見・ご感想 ↗' : 'ご意見・ご感想（準備中）');
  }
  return { renderStatus, updateButtons, translateSettings };
}

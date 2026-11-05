import { WARNING_TARGETS, effectiveThreshold } from './detection.js?v=1.7.6';
import { debugCategoryName } from './debug.js?v=1.7.6';
export function createDebugView({ ui, document, translate: t, getLanguage, getSession, getThresholds }) {
  function renderDebugRows(container, rows) {
    const language = getLanguage();
    const fragment = document.createDocumentFragment();
    for (const category of rows) {
      const row = document.createElement('tr');
      const label = document.createElement('td');
      const name = document.createElement('span');
      name.textContent = debugCategoryName(category, language);
      label.append(name);
      if (language === 'ja') {
        const original = document.createElement('small');
        original.textContent = category.categoryName; // Official label for cross-checking.
        original.lang = 'en';
        label.append(original);
      }
      const score = document.createElement('td');
      score.className = 'debug-score';
      // No percent conversion, normalization, rounding or invented zero.
      score.textContent = Number.isFinite(category.score) ? String(category.score) : 'N/A';
      row.append(label, score);
      if (container === ui['debug-target']) {
        const threshold = document.createElement('td');
        threshold.textContent = effectiveThreshold(getThresholds()[category.categoryName]).toFixed(3);
        row.append(threshold);
      }
      fragment.append(row);
    }
    container.replaceChildren(fragment);
  }
  function renderDebug(diagnostics, debugEnabled) {
    if (!ui['debug-panel']) return;
    const language = getLanguage(),
      session = getSession();
    for (const [id, text] of Object.entries({
      'debug-toggle-label': 'AIデバッグモード',
      'debug-summary': '識別の詳細を表示',
      'debug-model-label': 'AIモデル',
      'debug-mic-label': 'マイク入力',
      'debug-inference-label': '直近の推論',
      'debug-time-label': '推論時間',
      'debug-updated-label': '最終更新',
      'debug-top-heading': '上位5種類の音',
      'debug-target-heading': '警告対象の音（11種類）',
      'debug-top-name': '音の種類',
      'debug-target-name': '音の種類',
      'debug-top-score': '生の識別スコア',
      'debug-target-score': '生の識別スコア',
      'debug-note': 'スコアは正答率や確率ではありません。研究ログはメモリ内にのみ保持します。',
      'debug-timing-note': '推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。',
    })) {
      if (ui[id]) ui[id].textContent = t(text);
    }
    ui['debug-panel'].hidden = !debugEnabled;
    if (!debugEnabled) return;
    ui['debug-model'].textContent = t(diagnostics.model);
    ui['debug-mic'].textContent = t(diagnostics.microphone);
    ui['debug-inference'].textContent = t(diagnostics.inference);
    ui['debug-time'].textContent = Number.isFinite(diagnostics.inferenceMs)
      ? diagnostics.inferenceMs.toFixed(2) + ' ms'
      : 'N/A';
    ui['debug-updated'].textContent =
      diagnostics.updatedAt == null
        ? 'N/A'
        : new Date(diagnostics.updatedAt).toLocaleTimeString(language === 'ja' ? 'ja-JP' : 'en-GB', {
            hour12: false,
          });
    ui['debug-empty'].hidden = !!diagnostics.scores;
    ui['debug-empty'].textContent = t(session ? '詳細結果を待っています。' : '結果はまだありません。');
    renderDebugRows(ui['debug-top'], diagnostics.scores?.top5 ?? []);
    renderDebugRows(
      ui['debug-target'],
      diagnostics.scores?.targets ??
        Object.entries(WARNING_TARGETS).map(([categoryName, info]) => ({
          categoryName,
          index: info.index,
          score: null,
        })),
    );
  }
  return { render: renderDebug };
}

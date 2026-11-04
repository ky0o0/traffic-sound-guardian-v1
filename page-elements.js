// Required and optional DOM capabilities are explicit for each realtime page.
export function requireElements(document, ids, component) {
  const elements = {};
  for (const id of ids) {
    const node = document.getElementById(id);
    if (!node) throw new Error(component + ': missing required DOM element #' + id);
    elements[id] = node;
  }
  return elements;
}
export const COMMON_IDS = Object.freeze([
  'heading',
  'description',
  'status-label',
  'warning-details',
  'sound-type',
  'score',
  'cancel',
  'mic-control',
  'theme-color',
  'visual',
  'waveform',
  'language-switch',
  'language-select',
  'language-select-label',
  'version-switch-title',
  'version-standard',
  'version-ipad',
  'mic-source-label',
  'mic-source-value',
  'mic-source-evidence',
  'mic-select',
  'mic-select-label',
  'mic-select-note',
  'mic-select-status',
  'alert-tone-toggle',
  'alert-tone-label',
  'alert-tone-note',
  'alert-volume-label',
  'alert-volume-select',
  'alert-volume-note',
  'score-label',
  'privacy',
  'research',
  'feedback',
  'ai-test-link',
  'microphone-test-link',
  'page-description',
]);
export const STANDARD_IDS = Object.freeze([
  'settings-toggle',
  'settings-title',
  'visual-mode-label',
  'visual-mode-select',
  'visual-mode-note',
]);
export const TEST_IDS = Object.freeze([
  'sensitivity-heading',
  'sensitivity-note',
  'threshold-reset',
  'debug-toggle',
  'debug-toggle-label',
  'debug-panel',
  'debug-summary',
  'debug-note',
  'debug-model-label',
  'debug-mic-label',
  'debug-inference-label',
  'debug-time-label',
  'debug-updated-label',
  'debug-model',
  'debug-mic',
  'debug-inference',
  'debug-time',
  'debug-updated',
  'debug-timing-note',
  'debug-top-heading',
  'debug-target-heading',
  'debug-top-name',
  'debug-top-score',
  'debug-target-name',
  'debug-target-score',
  'debug-top',
  'debug-target',
  'debug-empty',
]);
export function bindApplicationElements(document) {
  const mode = document.body.dataset.mode;
  if (!['standard', 'test'].includes(mode)) throw new Error('Unknown realtime page mode: ' + mode);
  const required = [...COMMON_IDS, ...(mode === 'standard' ? STANDARD_IDS : TEST_IDS)];
  requireElements(document, required, 'Application (' + mode + ')');
  return Object.fromEntries(
    [...COMMON_IDS, ...STANDARD_IDS, ...TEST_IDS].map((id) => [id, document.getElementById(id)]),
  );
}
export const RESEARCH_IDS = Object.freeze([
  'research-dashboard',
  'research-title',
  'research-counts-title',
  'research-log-title',
  'research-log-note',
  'export-csv',
  'log-time',
  'log-kind',
  'log-value',
  'research-metrics',
  'research-counts',
  'log-filter',
  'research-log',
  'debug-target-effective',
]);

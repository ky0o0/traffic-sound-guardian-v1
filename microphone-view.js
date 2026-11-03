import { safeTrackSettings } from './mic-source.js?v=1.6.2';
export function createMicrophoneView({ui,document,translate:t}) {
 const $ = id => document.getElementById(id);
 function renderMicSource(micSource) {
  // Show only the name of the browser-reported LIVE input track. Never
  // substitute the connected playback/output device as a microphone.
  const name = micSource.state === 'stopped' ? t('マイクを使用していません') :
    micSource.state === 'loading' ? t('マイク情報を取得中…') :
    micSource.evidence?.label || t('マイクの種類を確認できません');
  const label = t('使用中のマイク');
  if (ui['mic-source-label'].textContent !== label) ui['mic-source-label'].textContent = label;
  if (ui['mic-source-value'].textContent !== name) ui['mic-source-value'].textContent = name;
  ui['mic-source-value'].setAttribute('title', t('マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。'));
  const evidence = t('マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。');
  if (ui['mic-source-evidence'].textContent !== evidence) ui['mic-source-evidence'].textContent = evidence;
}
 function renderMicChoices({session,knownMicrophoneInputs,preferredMicId,microphoneListReady}) {
  const select = ui['mic-select'];
  const list = document.createDocumentFragment();
  const add = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    list.append(option);
  };
  add('', t('ブラウザ標準'));
  const seen = new Set(['', 'default']);
  for (const item of knownMicrophoneInputs) {
    if (!item.deviceId || seen.has(item.deviceId)) continue;
    seen.add(item.deviceId);
    add(item.deviceId, item.label || t('使用するマイク') + ' ' + seen.size);
  }
  // Do not silently pretend that a selected device still exists.
  if (microphoneListReady && preferredMicId && !seen.has(preferredMicId)) preferredMicId = '';
  select.replaceChildren(list);
  select.value = preferredMicId;
  const selectedName = knownMicrophoneInputs.find(item => item.deviceId === preferredMicId)?.label ?? '';
  const fullName = $('mic-selection-name');
  if (fullName) {
    fullName.textContent = selectedName;
    fullName.hidden = !selectedName;
  }
  select.setAttribute('title', selectedName || t('ブラウザ標準'));
  const activeTrack = session?.stream?.getAudioTracks()[0];
  const reportedId = safeTrackSettings(activeTrack).deviceId ?? '';
  const selected = !!preferredMicId;
  const status = !microphoneListReady ? 'マイクの許可後に機器一覧を取得します。' :
    selected && session?.stream && (!reportedId || reportedId === 'default') ?
      '選択を要求しましたが、実際のマイクはブラウザから確認できません。' :
    selected && reportedId === preferredMicId ?
      'ブラウザは選択したマイクを使用中と報告しています。' :
    seen.size <= 2 ? 'ブラウザは個別のマイクを表示していません。' :
      'ブラウザが報告したマイクを選択できます。';
  ui['mic-select-status'].textContent = t(status);
  return preferredMicId;
}
 return {renderSource:renderMicSource,renderChoices:renderMicChoices};
}

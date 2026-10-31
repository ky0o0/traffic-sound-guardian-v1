import { WarningGate, TARGETS, WARNING_TARGETS, chooseTarget, DEFAULT_THRESHOLD, WARNING_HOLD_MS } from './detection.js?v=1.6.15';
import { AudioWindowBuffer } from './audio-window.js';
import { microphoneSourceEvidence } from './mic-source.js?v=1.6.2';
import { debugCategoryName } from './debug.js?v=1.6.15';

// Confirmed Japanese and English Google Forms short links, supplied directly by the form owner.
// Navigation sends neither microphone samples nor recognition scores.
const FEEDBACK_FORM_URLS = Object.freeze({
  ja: 'https://forms.gle/vRzgiJxNCfJeb5K1A',
  en: 'https://forms.gle/AkXuRHWwi9Kp95GfA'
});
const EN = Object.freeze({
  "設定": "Settings",
  "マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。": "Device type and name are reported by the browser, not proof of the physical microphone.",
  "ブラウザの機器名：": "Browser device name: ",
  "マイクの種類を確認できません": "Microphone type unknown",
  "端末内蔵マイク（ブラウザ報告）": "Built-in microphone (browser-reported)",
  "イヤホン／ヘッドホンのマイク（ブラウザ報告）": "Headset microphone (browser-reported)",
  "マイク情報を取得中…": "Reading microphone information…",
  "マイクを使用していません": "Microphone not in use",
  "使用中のマイク": "Current microphone",
  "新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。": "Two short beeps on each new warning. Your device controls where sound plays.",
  "通知音を鳴らす": "Play alert beeps",
  "警告音の通知": "Alert sound",
  "AIデバッグモード": "AI Debug Mode",
  "マイク接続テスト（イヤホン入力） ↗": "Microphone Test Mode (headset input) ↗",
  "交通警告音の感度設定": "Traffic warning sound sensitivity",
  "1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。": "A single AI result at or above the set threshold triggers an alert immediately. Lower thresholds can increase false alarms.",
  "0.01：最高感度 ／ 0.10：初期値 ／ 0.50：低感度": "0.01: highest sensitivity / 0.10: default / 0.50: low sensitivity",
  "すべて標準に戻す": "Reset all to default",
  "識別の詳細を表示": "Show recognition details",
  "AIモデル": "AI model",
  "マイク入力": "Microphone input",
  "直近の推論": "Latest inference",
  "推論時間": "Inference time",
  "最終更新": "Last update",
  "上位5種類の音": "Top 5 sounds",
  "警告対象の音（11種類）": "Alert sound categories (11)",
  "音の種類": "Sound category",
  "生の識別スコア": "Raw score",
  "最新の結果のみを表示します。録音や履歴は保存しません。スコアは正答率ではありません。": "Only the latest result is shown. No recordings or history are saved. A score is not accuracy.",
  "結果はまだありません。": "No results yet.",
  "未読み込み": "Not loaded",
  "読み込み中": "Loading",
  "読み込み成功": "Loaded successfully",
  "読み込み成功・解放済み": "Loaded successfully; now released",
  "読み込み中止": "Loading cancelled",
  "失敗": "Failed",
  "許可を確認中": "Requesting permission",
  "許可済み・音声データ待ち": "Permission granted; waiting for audio",
  "音声データ受信中": "Receiving audio data",
  "マイクの許可なし": "Microphone permission denied",
  "入力エラー": "Input error",
  "音声入力が中断": "Audio input interrupted",
  "未実行": "Not run yet",
  "成功": "Successful",
  "更新が停止": "Updates stalled",
  "利用不可（HTTPSが必要）": "Unavailable (HTTPS required)",
  "詳細結果を待っています。": "Waiting for detailed results.",
  "推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。": "Inference time measures the model call only. It excludes capture, resampling and queue time.",
  "検知を停止しました": "Detection stopped",
  "停止中": "Stopped",
  "開始すると、周囲の交通警告音を\nこの端末で識別します。": "Start to identify nearby traffic warning\nsounds on this device.",
  "AIモデルを読み込み中...": "Loading AI model...",
  "準備中": "Preparing",
  "初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。": "The first load may take a moment.\nPlease allow microphone access.",
  "マイクの音を確認中...": "Checking microphone audio...",
  "最初の音声をAIで解析しています。": "AI is analysing the first audio window.",
  "周囲の音を検知中...": "Listening to your surroundings...",
  "検知中": "Listening",
  "交通警告音を検知すると、\n画面が赤く変わります。": "The screen turns red when a\ntraffic warning sound is detected.",
  "警告音を検知しました": "Warning sound detected",
  "周囲を確認してください": "Check your surroundings",
  "検知を開始": "Start detection",
  "検知を停止": "Stop detection",
  "読み込みを中止": "Cancel loading",
  "識別スコア：": "Classification score: ",
  "自転車のベル": "Bicycle bell",
  "車のクラクション": "Car horn",
  "サイレン": "Siren",
  "サイレン（パトカー）": "Police siren",
  "サイレン（救急車）": "Ambulance siren",
  "サイレン（消防車）": "Fire engine siren",
  "マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。": "Microphone access is not allowed. In Safari’s page menu → Website Settings, allow the microphone, then start again.",
  "マイクが見つかりません。接続を確認して、もう一度開始してください。": "No microphone was found. Check the connection, then start again.",
  "マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。": "The microphone is unavailable. End any calls or other recording apps, then start again.",
  "マイクを使用できるHTTPSのページをSafariで直接開いてください。": "Open the HTTPS page directly in Safari to use the microphone.",
  "音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。": "Audio analysis could not start. Reload the page, then try again.",
  "AIの解析が中断しました。もう一度開始してください。": "AI analysis was interrupted. Please start again.",
  "音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "Audio analysis is falling behind. Close other apps, then start again.",
  "音声の取得が遅れています。もう一度開始してください。": "Audio capture is falling behind. Please start again.",
  "AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "AI analysis is falling behind. Close other apps, then start again.",
  "マイクの音声処理が停止しました。もう一度開始してください。": "Microphone audio processing stopped. Please start again.",
  "このSafariでは音声を取得できません。iOSを更新してください。": "This version of Safari cannot capture audio. Please update iOS.",
  "マイクまたは音声処理が中断しました。もう一度開始してください。": "The microphone or audio processing was interrupted. Please start again.",
  "音声またはAIの解析が途切れました。もう一度開始してください。": "Audio capture or AI analysis stalled. Please start again.",
  "マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。": "To use the microphone, open the HTTPS website directly in Safari.",
  "このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。": "This browser does not support the required audio features. Open the page in Safari on iOS.",
  "マイクとの接続が切れました。もう一度開始してください。": "The microphone was disconnected. Please start again.",
  "マイクが一時停止しました。もう一度開始してください。": "The microphone was paused. Please start again.",
  "AIの解析に失敗しました。もう一度開始してください。": "AI analysis failed. Please start again.",
  "AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。": "The AI model could not load. Check your connection and uploaded files, then reload the page.",
  "AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。": "AI could not run. Upload all required files, then reopen the page in Safari.",
  "音声処理が中断しました。もう一度開始してください。": "Audio processing was interrupted. Please start again.",
  "準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。": "Setup is taking too long. Check microphone permission and your connection, then start again.",
  "Safariで音声を開始するには、中央のマイクをタップしてください。": "Tap the microphone circle to enable audio in Safari.",
  "画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。": "Detection stopped because the page was hidden. Tap the microphone circle to resume.",
  "言語": "Language",
  "表示バージョン": "Page layout",
  "通常版": "Standard",
  "iPad横画面（テスト）": "iPad landscape (test)",
  "音声は保存・送信されません": "Audio is not saved or transmitted",
  "研究用プロトタイプ · 安全を保証するものではありません": "Research prototype · Does not guarantee safety",
  "AIテストモード（オフライン研究） ↗": "AI Test Mode (offline research) ↗",
  "ご意見・ご感想 ↗": "Send feedback ↗",
  "ご意見・ご感想（準備中）": "Feedback (coming soon)",
  "Googleフォームを新しいタブで開く": "Open Google Forms in a new tab",
  "フィードバックフォームは準備中です。": "The feedback form is coming soon.",
  "イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。": "A research prototype for real-time traffic warning sound recognition, studying headphone use and traffic safety."
});
const ZH = Object.freeze({
  "設定": "设置",
  "マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。": "麦克风类型及名称来自浏览器报告，无法保证实际使用的物理麦克风位置。",
  "ブラウザの機器名：": "浏览器设备名称：",
  "マイクの種類を確認できません": "无法确定麦克风类型",
  "端末内蔵マイク（ブラウザ報告）": "设备内置麦克风（浏览器报告）",
  "イヤホン／ヘッドホンのマイク（ブラウザ報告）": "耳机麦克风（浏览器报告）",
  "マイク情報を取得中…": "正在读取麦克风信息…",
  "マイクを使用していません": "未开始使用麦克风",
  "使用中のマイク": "当前麦克风",
  "新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。": "每次新的警告播放两声短促提示音；实际从哪里播放由设备决定。",
  "通知音を鳴らす": "播放提示音",
  "警告音の通知": "提示音提醒",
  "AIデバッグモード": "AI 调试模式",
  "マイク接続テスト（イヤホン入力） ↗": "麦克风测试模式（耳机输入） ↗",
  "交通警告音の感度設定": "交通警告音灵敏度设置",
  "1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。": "任意一次 AI 识别分数达到设定阈值，就会立即发出警告。阈值越低，误报可能越多。",
  "0.01：最高感度 ／ 0.10：初期値 ／ 0.50：低感度": "0.01：最高灵敏度 / 0.10：默认 / 0.50：低灵敏度",
  "すべて標準に戻す": "全部恢复默认",
  "識別の詳細を表示": "显示识别详情",
  "AIモデル": "AI 模型",
  "マイク入力": "麦克风输入",
  "直近の推論": "最近一次识别",
  "推論時間": "推理耗时",
  "最終更新": "最后更新",
  "上位5種類の音": "分数最高的 5 种声音",
  "警告対象の音（11種類）": "警告声音类别（11 类）",
  "音の種類": "声音类别",
  "生の識別スコア": "原始识别分数",
  "最新の結果のみを表示します。録音や履歴は保存しません。スコアは正答率ではありません。": "只显示最新识别结果，不保存录音或历史记录。分数不代表准确率。",
  "結果はまだありません。": "暂无结果。",
  "未読み込み": "尚未加载",
  "読み込み中": "加载中",
  "読み込み成功": "加载成功",
  "読み込み成功・解放済み": "已加载，现已释放",
  "読み込み中止": "已取消加载",
  "失敗": "失败",
  "許可を確認中": "正在请求权限",
  "許可済み・音声データ待ち": "已获麦克风权限，等待音频",
  "音声データ受信中": "正在接收音频数据",
  "マイクの許可なし": "未获得麦克风权限",
  "入力エラー": "输入错误",
  "音声入力が中断": "音频输入中断",
  "未実行": "尚未运行",
  "成功": "成功",
  "更新が停止": "更新已停止",
  "利用不可（HTTPSが必要）": "不可用（需要 HTTPS）",
  "詳細結果を待っています。": "正在等待详细结果。",
  "推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。": "推理耗时仅指模型计算时间，不包括录音采集、重采样和排队时间。",
  "検知を停止しました": "检测已停止",
  "停止中": "已停止",
  "開始すると、周囲の交通警告音を\nこの端末で識別します。": "点击开始后，将在本设备上\n识别周围的交通警告音。",
  "AIモデルを読み込み中...": "正在加载 AI 模型...",
  "準備中": "准备中",
  "初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。": "首次加载可能需要一些时间。\n请允许使用麦克风。",
  "マイクの音を確認中...": "正在检查麦克风音频...",
  "最初の音声をAIで解析しています。": "AI 正在分析第一段音频。",
  "周囲の音を検知中...": "正在检测周围的声音...",
  "検知中": "检测中",
  "交通警告音を検知すると、\n画面が赤く変わります。": "检测到交通警告音时，\n屏幕会变成红色。",
  "警告音を検知しました": "检测到警告音",
  "周囲を確認してください": "请注意周围环境",
  "検知を開始": "开始检测",
  "検知を停止": "停止检测",
  "読み込みを中止": "取消加载",
  "識別スコア：": "识别分数：",
  "自転車のベル": "自行车铃",
  "車のクラクション": "汽车喇叭",
  "サイレン": "警笛",
  "サイレン（パトカー）": "警车警笛",
  "サイレン（救急車）": "救护车警笛",
  "サイレン（消防車）": "消防车警笛",
  "マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。": "麦克风权限未开启。请在 Safari 的页面菜单 → 网站设置中允许麦克风，然后重新开始。",
  "マイクが見つかりません。接続を確認して、もう一度開始してください。": "未找到麦克风，请检查连接后重试。",
  "マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。": "无法使用麦克风。请结束通话或其他录音应用后重试。",
  "マイクを使用できるHTTPSのページをSafariで直接開いてください。": "请在 Safari 中直接打开 HTTPS 网页，以便使用麦克风。",
  "音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。": "无法开始音频分析，请刷新页面后重试。",
  "AIの解析が中断しました。もう一度開始してください。": "AI 分析已中断，请重新开始。",
  "音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "音频分析速度跟不上，请关闭其他应用后重试。",
  "音声の取得が遅れています。もう一度開始してください。": "音频采集出现延迟，请重新开始。",
  "AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。": "AI 分析速度跟不上，请关闭其他应用后重试。",
  "マイクの音声処理が停止しました。もう一度開始してください。": "麦克风音频处理已停止，请重新开始。",
  "このSafariでは音声を取得できません。iOSを更新してください。": "当前 Safari 无法获取音频，请更新 iOS。",
  "マイクまたは音声処理が中断しました。もう一度開始してください。": "麦克风或音频处理被中断，请重新开始。",
  "音声またはAIの解析が途切れました。もう一度開始してください。": "音频或 AI 分析中断，请重新开始。",
  "マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。": "请在 Safari 中直接打开 HTTPS 网站以使用麦克风。",
  "このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。": "该浏览器不支持所需的音频功能，请使用 iOS Safari。",
  "マイクとの接続が切れました。もう一度開始してください。": "麦克风连接已断开，请重新开始。",
  "マイクが一時停止しました。もう一度開始してください。": "麦克风已暂停，请重新开始。",
  "AIの解析に失敗しました。もう一度開始してください。": "AI 分析失败，请重新开始。",
  "AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。": "AI 模型加载失败，请检查网络和所需文件，然后刷新重试。",
  "AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。": "AI 运行失败，请确认所有必要文件已上传，并用 Safari 重新打开。",
  "音声処理が中断しました。もう一度開始してください。": "音频处理已中断，请重新开始。",
  "準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。": "准备时间过长，请检查麦克风权限和网络后重试。",
  "Safariで音声を開始するには、中央のマイクをタップしてください。": "请点击中央麦克风按钮，在 Safari 中启动音频。",
  "画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。": "页面进入后台，检测已停止。点击中央麦克风可重新开始。",
  "言語": "语言",
  "表示バージョン": "页面版本",
  "通常版": "标准版",
  "iPad横画面（テスト）": "iPad 横屏测试版",
  "音声は保存・送信されません": "音频不会被保存或上传",
  "研究用プロトタイプ · 安全を保証するものではありません": "研究原型 · 不保证安全",
  "AIテストモード（オフライン研究） ↗": "AI 测试模式（离线研究） ↗",
  "ご意見・ご感想 ↗": "意见与反馈 ↗",
  "ご意見・ご感想（準備中）": "意见与反馈（准备中）",
  "Googleフォームを新しいタブで開く": "在新标签页打开 Google 问卷",
  "フィードバックフォームは準備中です。": "反馈问卷尚未开放。",
  "イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。": "本研究原型围绕耳机使用与交通安全，在本设备上实时识别交通警告音。"
});
const LANGUAGE_STORAGE_KEY = 'trafficSoundGuardian.language';
const allowedLanguage = code => ['ja', 'en', 'zh-CN'].includes(code) ? code : 'ja';
function initialLanguage() {
  const query = /(?:^|[?&])lang=(ja|en|zh-CN)(?:&|$)/.exec(window.location?.search || '')?.[1];
  if (query) return query;
  try { return allowedLanguage(window.sessionStorage?.getItem(LANGUAGE_STORAGE_KEY)); }
  catch { return 'ja'; }
}
let language = initialLanguage(); // Japanese by default; language preference only, never audio.
let viewDescription = '';
const t = text => language === 'en' ? (EN[text] ?? text) : language === 'zh-CN' ? (ZH[text] ?? text) : text;
// Names are always translated from the same original YAMNet class ID.
const localizedSoundNames = categoryName => categoryName ? {
  ja: debugCategoryName({categoryName}, 'ja'),
  en: debugCategoryName({categoryName}, 'en'),
  'zh-CN': debugCategoryName({categoryName}, 'zh-CN')
} : null;

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['heading', 'description', 'status-label', 'warning-details', 'sound-type',
  'score', 'cancel', 'mic-control', 'theme-color', 'visual', 'waveform',
  'sensitivity-heading', 'sensitivity-note', 'sensitivity-scale', 'threshold-reset',
  'language-switch', 'language-select', 'language-select-label', 'settings-toggle', 'settings-title', 'version-switch-title', 'version-standard', 'version-ipad', 'mic-source-label', 'mic-source-value', 'alert-tone-toggle', 'alert-tone-label', 'alert-tone-note', 'score-label', 'privacy', 'research', 'feedback', 'ai-test-link', 'microphone-test-link', 'page-description',
  'debug-toggle', 'debug-toggle-label', 'debug-panel', 'debug-summary', 'debug-note',
  'debug-model-label', 'debug-mic-label', 'debug-inference-label', 'debug-time-label', 'debug-updated-label',
  'debug-model', 'debug-mic', 'debug-inference', 'debug-time', 'debug-updated', 'debug-timing-note',
  'debug-top-heading', 'debug-target-heading', 'debug-top-name', 'debug-top-score', 'debug-target-name',
  'debug-target-score', 'debug-top', 'debug-target', 'debug-empty'].map(id => [id, $(id)]));
let session = null;
let nextSession = 0;
let view = 'stopped';
// The UI reports browser metadata only; it never guesses from Bluetooth connection.
let micSource = { state: 'stopped', evidence: null };
function renderMicSource() {
  // Show only the name of the browser-reported LIVE input track. Never
  // substitute the connected playback/output device as a microphone.
  const name = micSource.state === 'stopped' ? t('マイクを使用していません') :
    micSource.state === 'loading' ? t('マイク情報を取得中…') :
    micSource.evidence?.label || t('マイクの種類を確認できません');
  ui['mic-source-label'].textContent = t('使用中のマイク');
  ui['mic-source-value'].textContent = name;
}
function showMicSource(s) {
  if (session !== s || !s.stream) return;
  const track = s.stream.getAudioTracks()[0];
  micSource = {state: 'active', evidence: microphoneSourceEvidence(track, s.reportedAudioInputs || [])};
  renderMicSource();
}
async function refreshMicSource(s) {
  if (session !== s || !s.stream) return;
  const token = ++s.micSourceQuery;
  let inputs = [];
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (Array.isArray(devices)) inputs = devices.filter(d => d.kind === 'audioinput');
  } catch { /* The track label may be all that Safari exposes. */ }
  if (session !== s || token !== s.micSourceQuery) return;
  s.reportedAudioInputs = inputs;
  showMicSource(s);
}
// Preferences only; no PCM, AI results, or inference history are persisted.
const ALERT_TONE_STORAGE_KEY = 'trafficSoundGuardian.alertToneEnabled';
const THRESHOLD_STORAGE_KEY = 'trafficSoundGuardian.soundThresholds';
const LEGACY_BELL_STORAGE_KEY = 'trafficSoundGuardian.bicycleBellThreshold';
// Default ON even if localStorage is unavailable. Only an explicit 'false' disables it.
function loadAlertToneEnabled() {
  try { return window.localStorage?.getItem(ALERT_TONE_STORAGE_KEY) !== 'false'; }
  catch { return true; }
}
let alertToneEnabled = loadAlertToneEnabled();
function setAlertToneEnabled(next) {
  alertToneEnabled = !!next;
  ui['alert-tone-toggle'].checked = alertToneEnabled;
  // Muting also silences a two-beep sequence already in progress.
  if (!alertToneEnabled && session) stopAlertTones(session);
  try { window.localStorage?.setItem(ALERT_TONE_STORAGE_KEY, String(alertToneEnabled)); } catch {}
}

const thresholdRows = Object.entries(TARGETS).map(([name, info], i) => ({
  name, info, label: $('threshold-label-' + i),
  input: $('threshold-input-' + i), output: $('threshold-value-' + i)
}));
function loadThresholds() {
  const initial = Object.fromEntries(Object.keys(TARGETS).map(name => [name, DEFAULT_THRESHOLD]));
  try {
    const raw = window.localStorage?.getItem(THRESHOLD_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const name of Object.keys(TARGETS)) {
          const value = saved[name];
          if (typeof value === 'number' && Number.isFinite(value) &&
              value >= 0.01 && value <= 0.50) initial[name] = Math.round(value * 100) / 100;
        }
      }
    } else {
      // Preserve any previously configured V1.4 bicycle-bell preference.
      const previous = window.localStorage?.getItem(LEGACY_BELL_STORAGE_KEY);
      if (previous !== null && previous !== undefined && previous !== '') {
        const value = Number(previous);
        if (Number.isFinite(value) && value >= 0.01 && value <= 0.50) {
          initial['Bicycle bell'] = Math.round(value * 100) / 100;
        }
      }
    }
  } catch { /* Blocked storage: use the safe defaults. */ }
  return initial;
}
let soundThresholds = loadThresholds();
// A separate 0.01 minimum followed by 0.05-spaced choices. Using native
// range step=0.05 with min=0.01 would incorrectly yield 0.01, 0.06, 0.11...
const THRESHOLD_STOPS = Object.freeze([0.01, ...Array.from({length: 10}, (_, i) => (i + 1) / 20)]);
function nearestThreshold(value) {
  return THRESHOLD_STOPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best, THRESHOLD_STOPS[0]);
}
function renderThresholds() {
  for (const row of thresholdRows) {
    const value = soundThresholds[row.name].toFixed(2);
    row.label.textContent = t(row.info.label);
    // step='any' permits the special 0.01 stop. We snap user input
    // manually, preserving legacy stored 0.01-step values exactly.
    row.input.min = '0.01';
    row.input.max = '0.50';
    row.input.step = 'any';
    row.input.value = value;
    row.input.setAttribute('aria-valuetext', value);
    row.output.textContent = value;
  }
}
function saveThresholds() {
  try { window.localStorage?.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(soundThresholds)); } catch {}
}
function changeThreshold(name, inputValue) {
  const parsed = Number(inputValue);
  if (!Object.prototype.hasOwnProperty.call(TARGETS, name) || !Number.isFinite(parsed)) return;
  const next = nearestThreshold(parsed);
  soundThresholds[name] = next;
  renderThresholds();
  saveThresholds();
}
function resetThresholds() {
  for (const name of Object.keys(TARGETS)) soundThresholds[name] = DEFAULT_THRESHOLD;
  renderThresholds();
  saveThresholds();
}

let debugEnabled = false;
// One current status/snapshot only; no collection, storage, audio or result history.
let diagnostics = { model: '未読み込み', microphone: '停止中', inference: '未実行',
  inferenceMs: null, updatedAt: null, scores: null };

function renderDebugRows(container, rows) {
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
    score.textContent = Number.isFinite(category.score) ? String(category.score) : '—';
    row.append(label, score);
    fragment.append(row);
  }
  container.replaceChildren(fragment);
}
function renderDebug() {
  for (const [id, text] of Object.entries({
    'debug-toggle-label': 'AIデバッグモード', 'debug-summary': '識別の詳細を表示',
    'debug-model-label': 'AIモデル', 'debug-mic-label': 'マイク入力', 'debug-inference-label': '直近の推論',
    'debug-time-label': '推論時間', 'debug-updated-label': '最終更新',
    'debug-top-heading': '上位5種類の音', 'debug-target-heading': '警告対象の音（11種類）',
    'debug-top-name': '音の種類', 'debug-target-name': '音の種類',
    'debug-top-score': '生の識別スコア', 'debug-target-score': '生の識別スコア',
    'debug-note': '最新の結果のみを表示します。録音や履歴は保存しません。スコアは正答率ではありません。',
    'debug-timing-note': '推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。'
  })) ui[id].textContent = t(text);
  ui['debug-panel'].hidden = !debugEnabled;
  if (!debugEnabled) return;
  ui['debug-model'].textContent = t(diagnostics.model);
  ui['debug-mic'].textContent = t(diagnostics.microphone);
  ui['debug-inference'].textContent = t(diagnostics.inference);
  ui['debug-time'].textContent = Number.isFinite(diagnostics.inferenceMs) ? diagnostics.inferenceMs.toFixed(2) + ' ms' : '—';
  ui['debug-updated'].textContent = diagnostics.updatedAt == null ? '—' :
    new Date(diagnostics.updatedAt).toLocaleTimeString(language === 'ja' ? 'ja-JP' : 'en-GB', { hour12: false });
  ui['debug-empty'].hidden = !!diagnostics.scores;
  ui['debug-empty'].textContent = t(session ? '詳細結果を待っています。' : '結果はまだありません。');
  renderDebugRows(ui['debug-top'], diagnostics.scores?.top5 ?? []);
  renderDebugRows(ui['debug-target'], diagnostics.scores?.targets ??
    Object.entries(WARNING_TARGETS).map(([categoryName, info]) => ({ categoryName, index: info.index, score: null })));
}
function setDebug(enabled) {
  debugEnabled = !!enabled;
  ui['debug-toggle'].checked = debugEnabled;
  diagnostics.scores = null;
  ui['debug-top'].replaceChildren();
  ui['debug-target'].replaceChildren();
  ui['debug-panel'].open = debugEnabled;
  renderDebug(); // No initialization, new microphone, worker or inference loop.
  document.body.dataset.debug = debugEnabled ? 'on' : 'off';
  // Keep the current scroll position. The panel peeks below the main UI
  // and the user can scroll down naturally to see full diagnostics.
}
function stopDebug(s) {
  diagnostics.scores = null;
  if (s) {
    if (diagnostics.model === '読み込み成功') diagnostics.model = '読み込み成功・解放済み';
    else if (diagnostics.model === '読み込み中') diagnostics.model = '読み込み中止';
    if (!['マイクの許可なし', '入力エラー', '音声入力が中断'].includes(diagnostics.microphone)) {
      const interrupted = s.connected && (s.context?.state !== 'running' ||
        s.stream?.getAudioTracks().some(track => track.readyState !== 'live' || track.muted));
      diagnostics.microphone = interrupted ? '音声入力が中断' : '停止中';
    }
    if (!['失敗', '更新が停止'].includes(diagnostics.inference)) {
      diagnostics.inference = '停止中';
      diagnostics.inferenceMs = null;
      diagnostics.updatedAt = null;
    }
  }
}


// Beeps use the same user-activated AudioContext as the real-time microphone,
// but a SEPARATE output-only node chain. The microphone source stays read-only.
// Audio is routed by the OS/browser (we cannot force Bluetooth headphone output).
function stopAlertTones(s) {
  for (const entry of s?.alertToneNodes ?? []) {
    try { entry.osc.onended = null; entry.osc.stop(); } catch {}
    try { entry.osc.disconnect(); } catch {}
    try { entry.gain.disconnect(); } catch {}
  }
  s?.alertToneNodes?.clear();
}
function playAlertTone(s) {
  const context = s?.context;
  if (!alertToneEnabled || !context || context.state !== 'running' ||
      !context.createOscillator || !context.createGain) return false;
  try {
    // A gentle two-tone sequence (two 110 ms sine beeps, 85 ms gap).
    // Peak WebAudio gain is deliberately capped at 0.045 (not a dB SPL guarantee).
    const start = context.currentTime + 0.02;
    for (let i = 0; i < 2; i++) {
      const at = start + i * 0.195;
      const end = at + 0.11;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const entry = { osc, gain };
      s.alertToneNodes.add(entry);
      osc.type = 'sine';
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.045, at + 0.015);
      gain.gain.setValueAtTime(0.045, end - 0.03);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.onended = () => {
        s.alertToneNodes.delete(entry);
        try { osc.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
      osc.start(at);
      osc.stop(end);
    }
    return true;
  } catch (error) {
    stopAlertTones(s);
    console.warn('[Traffic Sound Guardian] Alert audio unavailable:', error);
    return false; // Visual warning must still work when audio output is blocked.
  }
}

function render(state, description = '') {
  view = state;
  viewDescription = description;
  document.body.dataset.state = state;
  const warning = state === 'warning';
  ui['theme-color'].setAttribute('content', warning ? '#c7263a' : document.documentElement.dataset?.theme === 'light' ? '#f5f7fb' : '#101a2c');
  ui['warning-details'].hidden = !warning;
  ui.description.hidden = warning;
  const texts = {
    stopped: ['検知を停止しました', '停止中', description || '開始すると、周囲の交通警告音を\nこの端末で識別します。'],
    loading: ['AIモデルを読み込み中...', '準備中', description || '初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。'],
    priming: ['マイクの音を確認中...', '準備中', '最初の音声をAIで解析しています。'],
    listening: ['周囲の音を検知中...', '検知中', '交通警告音を検知すると、\n画面が赤く変わります。'],
    warning: ['警告音を検知しました', '周囲を確認してください', '']
  }[state];
  ui.heading.textContent = t(texts[0]);
  ui['status-label'].textContent = t(texts[1]);
  ui.description.textContent = t(texts[2]);
  if (warning && session?.gate.target) {
    ui['sound-type'].textContent = t(session.gate.target.label);
    ui.score.textContent = session.gate.target.score.toFixed(2);
  }
  updateButtons();
  renderMicSource();
  renderDebug();
}

function updateButtons() {
  // The circle uses the exact control path formerly assigned to the footer.
  const needsTap = session && !session.connected && session.context?.state !== 'running';
  const start = !session || needsTap;
  const label = start ? '検知を開始' : '検知を停止';
  ui['mic-control'].disabled = false;
  ui['mic-control'].setAttribute('aria-label', t(label));
  ui['mic-control'].setAttribute('title', t(label));
  ui['mic-control'].setAttribute('aria-pressed', String(!!session && session.connected));
  ui.cancel.hidden = !(session && needsTap);
}

// A blank or invalid form URL leaves a visible, inactive feedback entry.
function feedbackURL(value) {
  try {
    const url = new URL(value);
    const googleForm = (url.hostname === 'forms.gle' && url.pathname.length > 1) ||
      (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'));
    return url.protocol === 'https:' && !url.username && !url.password && googleForm ? url.href : '';
  } catch { return ''; }
}
function setLanguage(next) {
  language = allowedLanguage(next);
  document.documentElement.lang = language;
  window.dispatchEvent?.(new CustomEvent('tsg:language', { detail: { language } }));
  ui['language-select'].value = language;
  ui['settings-title'].textContent = t('設定');
  ui['settings-toggle'].setAttribute('aria-label', t('設定'));
  ui['language-select-label'].textContent = t('言語');
  ui['alert-tone-label'].textContent = t('通知音を鳴らす');
  ui['alert-tone-note'].textContent = t('新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。');
  ui['alert-tone-toggle'].setAttribute('aria-label', t('通知音を鳴らす'));
  ui['alert-tone-toggle'].checked = alertToneEnabled;
  ui['language-select'].setAttribute('aria-label', t('言語'));
  // Both pages share the same controller and language preference. The
  // selected page is marked in HTML; navigating stops capture via pagehide.
  ui['version-switch-title'].textContent = t('表示バージョン');
  ui['version-standard'].textContent = t('通常版');
  ui['version-ipad'].textContent = t('iPad横画面（テスト）');
  ui['version-standard'].setAttribute('href', './index.html?lang=' + language);
  ui['version-ipad'].setAttribute('href', './ipad-test.html?lang=' + language);
  try { window.sessionStorage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch {}
  ui['ai-test-link'].setAttribute('href', './ai-test.html?v=1.6.0&lang=' + language);
  ui['microphone-test-link'].setAttribute('href', './microphone-test.html?v=1.6.0&lang=' + language);
  for (const [id, text] of Object.entries({
    'ai-test-link': 'AIテストモード（オフライン研究） ↗',
    'microphone-test-link': 'マイク接続テスト（イヤホン入力） ↗',
    cancel: '読み込みを中止', 'score-label': '識別スコア：',
    'sensitivity-heading': '交通警告音の感度設定',
    'sensitivity-note': '1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。',
    'sensitivity-scale': '0.01：最高感度 ／ 0.10：初期値 ／ 0.50：低感度',
    'threshold-reset': 'すべて標準に戻す',
    privacy: '音声は保存・送信されません', research: '研究用プロトタイプ · 安全を保証するものではありません'
  })) ui[id].textContent = t(text);
  ui['page-description'].setAttribute('content', t('イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。'));
  const url = feedbackURL(FEEDBACK_FORM_URLS[language === 'ja' ? 'ja' : 'en']);
  if (url) ui.feedback.setAttribute('href', url);
  else ui.feedback.removeAttribute('href');
  ui.feedback.setAttribute('aria-disabled', String(!url));
  ui.feedback.setAttribute('title', t(url ? 'Googleフォームを新しいタブで開く' : 'フィードバックフォームは準備中です。'));
  ui.feedback.textContent = t(url ? 'ご意見・ご感想 ↗' : 'ご意見・ご感想（準備中）');
  renderThresholds();
  render(view, viewDescription); // Keep the existing session, score, streak and warning deadline.
}

function drawWaveform(samples) {
  const canvas = ui.waveform;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth || 300;
  const height = canvas.clientHeight || 48;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = view === 'warning' ? '#ffffff' : '#98dacc';
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (!samples) { ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); }
  else for (let i = 0; i < samples.length; i++) {
    // V1.3.1: visual-only soft-knee amplification. True PCM controls the
    // waveform; tanh makes quiet sounds visible without harsh clipping.
    // Never modify PCM, capture buffers, YAMNet inputs or detection scores.
    const displaySample = Math.tanh(samples[i] * 18);
    const x = i * width / (samples.length - 1);
    const y = height / 2 - displaySample * height * 0.46;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
function resetVisuals() {
  ui.visual.style.setProperty('--audio-level', '0');
  drawWaveform(null);
}
function startVisuals(s) {
  // Observe the SAME microphone stream in a parallel, read-only branch. The
  // original source -> capture -> silent output path is deliberately unchanged.
  s.analyser = s.context.createAnalyser();
  s.analyser.fftSize = 2048;
  s.source.connect(s.analyser); // AnalyserNode output may remain unconnected.
  const samples = new Float32Array(s.analyser.fftSize);
  // The rolling ten-second timeline can refresh up to 60 times/sec, independently
  // of the older full-PCM visual and microphone glow (kept at <=30fps).
  // The same read-only AnalyserNode is used; YAMNet's audio path is untouched.
  const TIMELINE_INTERVAL_MS = 1000 / 60;
  const LEGACY_INTERVAL_MS = 1000 / 30;
  let lastVisual = -Infinity, lastDraw = -Infinity, level = 0;
  const draw = now => {
    if (!isCurrent(s) || !s.connected || s.context.state !== 'running') return;
    // 1ms tolerance prevents a 60Hz screen's frame-clock rounding from halving the rate.
    if (now - lastVisual >= TIMELINE_INTERVAL_MS - 1) {
      lastVisual = now;
      s.analyser.getFloatTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      // Visual-only 60fps RMS events; no PCM or AI results are forwarded/stored.
      window.dispatchEvent?.(new CustomEvent('tsg:visual', { detail: { time: s.context.currentTime, rms } }));
      if (now - lastDraw >= LEGACY_INTERVAL_MS - 1) {
        const elapsed = Math.min(100, now - lastDraw);
        lastDraw = now;
        const target = Math.min(1, Math.sqrt(rms) * 2.4);
        level += (target - level) * (1 - Math.exp(-elapsed / (target > level ? 55 : 160)));
        if (level < 0.001) level = 0;
        drawWaveform(samples);
        ui.visual.style.setProperty('--audio-level', level.toFixed(4));
      }
    }
    s.visualFrame = requestAnimationFrame(draw);
  };
  s.visualFrame = requestAnimationFrame(draw);
}

function stop(message = '') {
  const old = session;
  stopDebug(old);
  session = null; // Invalidate all pending permissions, frames and model results first.
  if (old) {
    old.micSourceQuery = (old.micSourceQuery ?? 0) + 1;
    try { navigator.mediaDevices?.removeEventListener?.('devicechange', old.onMicDevicesChange); } catch {}
    clearTimeout(old.startTimeout);
    clearTimeout(old.warningTimeout);
    clearInterval(old.watchdog);
    if (old.visualFrame != null) cancelAnimationFrame(old.visualFrame);
    old.worker?.terminate(); // Releases the classifier and its WASM heap.
    old.pending = null;
    old.flight = null;
    if (old.node) {
      old.node.onaudioprocess = null;
      if (old.node.port) { old.node.port.onmessage = null; old.node.port.close(); }
      try { old.node.disconnect(); } catch { /* Already disconnected. */ }
    }
    for (const node of [old.source, old.silent, old.analyser]) { try { node?.disconnect(); } catch {} }
    for (const track of old.stream?.getTracks() || []) {
      track.onended = null;
      track.onmute = null;
      track.stop();
    }
    if (old.context) {
      old.context.onstatechange = null;
      if (old.context.state !== 'closed') old.context.close().catch(() => {});
    }
    // Release any pending async initialization wait as well as native resources.
    old.rejectReady?.(new DOMException('Stopped', 'AbortError'));
    stopAlertTones(old); // Discard any scheduled beeps when microphone session ends.
    old.gate.reset();
  }
  micSource = {state: 'stopped', evidence: null};
  resetVisuals();
  window.dispatchEvent?.(new Event('tsg:reset'));
  render('stopped', message);
}

function errorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': case 'PermissionDeniedError':
      return 'マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。';
    case 'NotFoundError': case 'DevicesNotFoundError':
      return 'マイクが見つかりません。接続を確認して、もう一度開始してください。';
    case 'NotReadableError': case 'TrackStartError':
      return 'マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。';
    case 'SecurityError':
      return 'マイクを使用できるHTTPSのページをSafariで直接開いてください。';
    default:
      return error?.publicMessage || '音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。';
  }
}
function fail(s, error) {
  if (session !== s) return;
  console.error('[Traffic Sound Guardian]', error);
  stop(errorMessage(error));
}
function publicError(message) { return Object.assign(new Error(message), { publicMessage: message }); }
function isCurrent(s) { return session === s; }

function scheduleWarningEnd(s) {
  clearTimeout(s.warningTimeout);
  if (!s.gate.active) return;
  const delay = Math.max(0, WARNING_HOLD_MS - (performance.now() - s.gate.lastPositive));
  s.warningTimeout = setTimeout(() => {
    if (!isCurrent(s)) return;
    if (performance.now() - s.lastResult >= 3000) {
      diagnostics.inference = '更新が停止';
      stop('AIの解析が中断しました。もう一度開始してください。');
      return;
    }
    s.gate.expire(performance.now());
    if (s.gate.active) scheduleWarningEnd(s);
    else render('listening');
  }, Math.ceil(delay));
}

function sendFrame(s, frame) {
  if (!isCurrent(s)) return;
  if (performance.now() - frame.receivedAt > 1500) {
    stop('音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。');
    return;
  }
  s.flight = frame;
  s.worker.postMessage({ type: 'classify', sequence: frame.sequence, samples: frame.samples,
    sampleRate: s.context.sampleRate, debug: debugEnabled }, [frame.samples.buffer]);
}
function receiveFrame(s, frame) {
  if (!isCurrent(s) || !s.connected) return;
  const ageMs = Math.max(0, (s.context.currentTime - (frame.endTime ?? s.context.currentTime)) * 1000);
  if (ageMs > 1500) {
    stop('音声の取得が遅れています。もう一度開始してください。');
    return;
  }
  s.lastCapture = performance.now();
  if (diagnostics.microphone !== '音声データ受信中') {
    diagnostics.microphone = '音声データ受信中';
    renderDebug();
  }
  frame.receivedAt = s.lastCapture - ageMs;
  if (s.flight) s.pending = frame; // At most one outstanding + one latest window.
  else sendFrame(s, frame);
}
function receiveResult(s, data) {
  if (!isCurrent(s) || !s.connected || !s.flight || s.flight.sequence !== data.sequence) return;
  const now = performance.now();
  if (now - s.flight.receivedAt > 2500) {
    diagnostics.inference = '更新が停止';
    stop('AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。');
    return;
  }
  const completedFrame = s.flight;
  s.flight = null;
  s.lastResult = now;
  s.hasResult = true;
  diagnostics.inference = '成功';
  diagnostics.inferenceMs = Number.isFinite(data.inferenceMs) ? data.inferenceMs : null;
  diagnostics.updatedAt = Date.now();
  diagnostics.scores = debugEnabled ? (data.debug ?? null) : null;
  clearTimeout(s.startTimeout);
  // Check all six raw sound scores separately against their own thresholds.
  // Legacy test fixtures without trafficScores keep the prior default behaviour.
  const target = data.trafficScores ? chooseTarget(data.trafficScores, soundThresholds) : data.target;
  const threshold = target?.name ? (soundThresholds[target.name] ?? DEFAULT_THRESHOLD) : DEFAULT_THRESHOLD;
  // Only the inactive -> active transition counts as a NEW warning.
  // A late JavaScript timer must not make an expired warning look continuous.
  const wasActive = s.gate.active && now - s.gate.lastPositive < WARNING_HOLD_MS;
  s.gate.observe(target, now, threshold);
  if (!wasActive && s.gate.active) playAlertTone(s);
  // The red interval represents a positive YAMNet analysis window, not exact event boundaries.
  // Use capture timestamps rather than delayed Worker response time.
  if (target && Number.isFinite(completedFrame?.endTime)) {
    window.dispatchEvent?.(new CustomEvent('tsg:warning', { detail: {
      start: completedFrame.endTime - 0.975, end: completedFrame.endTime, label: target.name,
      labels: localizedSoundNames(target.name)
    } }));
  }
  // One tiny read-only category snapshot per real inference. No PCM, new AI
  // inference, storage, or Debug dependency. The UI alone handles 2s stability.
  if (data.topCategory?.categoryName) {
    window.dispatchEvent?.(new CustomEvent('tsg:classification', { detail: {
      categoryName: data.topCategory.categoryName,
      labels: localizedSoundNames(data.topCategory.categoryName),
      timeMs: now,
      warningName: target?.name ?? null,
      warningLabels: target?.name ? localizedSoundNames(target.name) : null
    } }));
  }
  const state = s.gate.active ? 'warning' : 'listening';
  if (view !== state || s.gate.active) render(state);
  scheduleWarningEnd(s);
  renderDebug();
  if (s.pending) {
    const pending = s.pending;
    s.pending = null;
    sendFrame(s, pending);
  }
}

async function connectCapture(s) {
  const context = s.context;
  s.source = context.createMediaStreamSource(s.stream);
  s.silent = context.createGain();
  s.silent.gain.value = 0;
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      await context.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      if (!isCurrent(s)) return;
      s.node = new AudioWorkletNode(context, 'guardian-capture', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1]
      });
      s.node.port.onmessage = ({ data }) => {
        s.node.port.postMessage('ack');
        receiveFrame(s, data);
      };
      s.node.onprocessorerror = () => fail(s, publicError('マイクの音声処理が停止しました。もう一度開始してください。'));
    } catch (error) {
      console.warn('[Traffic Sound Guardian] AudioWorklet unavailable; using ScriptProcessor fallback.', error);
    }
  }
  if (!isCurrent(s)) return;
  if (!s.node) {
    // Real audio fallback; deprecated but still usable in Safari. No fake input.
    if (!context.createScriptProcessor) throw publicError('このSafariでは音声を取得できません。iOSを更新してください。');
    let blockStart = 0;
    let blockFirstSample = 0;
    const buffer = new AudioWindowBuffer(context.sampleRate, frame => {
      const endTime = blockStart + (frame.endSample - blockFirstSample) / context.sampleRate;
      receiveFrame(s, { ...frame, endTime });
    });
    s.node = context.createScriptProcessor(4096, 1, 1);
    s.node.onaudioprocess = event => {
      const input = event.inputBuffer.getChannelData(0);
      blockFirstSample = buffer.total;
      blockStart = event.playbackTime - input.length / context.sampleRate;
      buffer.push([input]);
      event.outputBuffer.getChannelData(0).fill(0);
    };
  }
  // Keep the capture graph scheduled without playing microphone audio.
  s.source.connect(s.node);
  s.node.connect(s.silent);
  s.silent.connect(context.destination);
  s.connected = true;
  s.lastCapture = s.lastResult = performance.now();
  render('priming');
  startVisuals(s);
  s.watchdog = setInterval(() => {
    if (!isCurrent(s)) return;
    const now = performance.now();
    const limit = s.hasResult ? 3000 : 8000;
    if (context.state !== 'running' || s.stream.getAudioTracks().some(t => t.readyState !== 'live' || t.muted)) {
      diagnostics.microphone = '音声入力が中断';
      stop('マイクまたは音声処理が中断しました。もう一度開始してください。');
    } else if (now - s.lastCapture > limit || now - s.lastResult > limit) {
      if (now - s.lastCapture > limit) diagnostics.microphone = '音声入力が中断';
      if (now - s.lastResult > limit) diagnostics.inference = '更新が停止';
      stop('音声またはAIの解析が途切れました。もう一度開始してください。');
    } else if (now - (s.lastMicSourceCheck ?? -Infinity) >= 2000) {
      s.lastMicSourceCheck = now;
      showMicSource(s); // Detect changes to browser-reported track label/settings.
    }
  }, 250);
}

async function start() {
  if (session) {
    // A tap during automatic startup unlocks the SAME context, never a second loop.
    const current = session;
    current.context?.resume().then(() => { if (isCurrent(current)) updateButtons(); }).catch(error => fail(current, error));
    return;
  }
  diagnostics = { model: '未読み込み', microphone: '停止中', inference: '未実行',
    inferenceMs: null, updatedAt: null, scores: null };
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    diagnostics.microphone = '利用不可（HTTPSが必要）';
    stop('マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。');
    return;
  }
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType || typeof Worker === 'undefined') {
    stop('このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。');
    return;
  }
  const s = { id: ++nextSession, gate: new WarningGate(), connected: false, hasResult: false,
    pending: null, flight: null, alertToneNodes: new Set(), micSourceQuery: 0, reportedAudioInputs: [] };
  session = s;
  micSource = {state: 'loading', evidence: null};
  renderMicSource();
  diagnostics.model = '読み込み中';
  diagnostics.microphone = '許可を確認中';
  renderDebug();
  try {
    s.context = new AudioContextType({ latencyHint: 'interactive' });
    // Run resume and getUserMedia before any await, preserving a button's activation.
    const initialResume = s.context.resume().catch(() => {});
    const microphone = navigator.mediaDevices.getUserMedia({ video: false, audio: {
      channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false
    } }).then(stream => {
      if (!isCurrent(s)) { stream.getTracks().forEach(t => t.stop()); throw new DOMException('Stopped', 'AbortError'); }
      s.stream = stream;
      // The very same track that feeds classifier audio supplies the label.
      // Device enumeration never asks for microphone access a second time.
      showMicSource(s);
      s.onMicDevicesChange = () => { if (isCurrent(s)) refreshMicSource(s); };
      try { navigator.mediaDevices?.addEventListener?.('devicechange', s.onMicDevicesChange); } catch {}
      void refreshMicSource(s);
      diagnostics.microphone = '許可済み・音声データ待ち';
      renderDebug();
      for (const track of stream.getAudioTracks()) {
        track.onended = () => { if (isCurrent(s)) stop('マイクとの接続が切れました。もう一度開始してください。'); };
        track.onmute = () => { if (isCurrent(s) && s.connected) stop('マイクが一時停止しました。もう一度開始してください。'); };
      }
      return stream;
    });
    // Attach rejection handler immediately even if Worker construction fails.
    microphone.catch(error => {
      if (isCurrent(s)) diagnostics.microphone = ['NotAllowedError', 'PermissionDeniedError'].includes(error?.name) ? 'マイクの許可なし' : '入力エラー';
      fail(s, error);
    });
    s.worker = new Worker(new URL('./classifier-worker.js?v=1.6.15', import.meta.url));
    const ready = new Promise((resolve, reject) => {
      s.rejectReady = reject;
      s.worker.onmessage = ({ data }) => {
        if (!isCurrent(s)) return;
        if (data.type === 'ready') { diagnostics.model = '読み込み成功'; renderDebug(); resolve(); }
        else if (data.type === 'result') receiveResult(s, data);
        else if (data.type === 'error') {
          if (data.operation === 'init' || !s.connected) diagnostics.model = '失敗';
          else {
            diagnostics.inference = '失敗';
            diagnostics.inferenceMs = Number.isFinite(data.inferenceMs) ? data.inferenceMs : null;
            diagnostics.updatedAt = Date.now();
          }
          const error = publicError(s.connected
            ? 'AIの解析に失敗しました。もう一度開始してください。'
            : 'AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。');
          console.error('[Traffic Sound Guardian] Worker:', data.message);
          reject(error);
          fail(s, error);
        }
      };
      s.worker.onerror = event => {
        if (!isCurrent(s)) return;
        if (s.connected) { diagnostics.inference = '失敗'; diagnostics.inferenceMs = null; diagnostics.updatedAt = Date.now(); }
        else diagnostics.model = '失敗';
        const error = publicError('AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。');
        console.error('[Traffic Sound Guardian] Worker load:', event.message);
        reject(error);
        fail(s, error);
      };
    });
    s.context.onstatechange = () => {
      if (!isCurrent(s)) return;
      if (s.connected && s.context.state !== 'running') stop('音声処理が中断しました。もう一度開始してください。');
      else updateButtons();
    };
    render('loading');
    s.startTimeout = setTimeout(() => {
      if (isCurrent(s)) stop('準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。');
    }, 60000);
    s.worker.postMessage({ type: 'init' });
    await Promise.all([microphone, ready]);
    if (!isCurrent(s)) return;
    // Safari may suspend the context while the permission prompt is visible.
    s.context.resume().catch(() => {});
    if (s.context.state !== 'running') {
      await Promise.race([initialResume, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (!isCurrent(s)) return;
      if (s.context.state !== 'running') {
        stop('Safariで音声を開始するには、中央のマイクをタップしてください。');
        return;
      }
    }
    await connectCapture(s);
  } catch (error) { fail(s, error); }
}

for (const row of thresholdRows) {
  row.input.addEventListener('input', () => changeThreshold(row.name, row.input.value));
  // Native range inputs with step='any' have browser-dependent keyboard
  // increments. Force the documented discrete stops for accessibility.
  row.input.addEventListener('keydown', event => {
    const old = soundThresholds[row.name];
    let next;
    if (event.key === 'Home') next = THRESHOLD_STOPS[0];
    else if (event.key === 'End') next = THRESHOLD_STOPS.at(-1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
      next = THRESHOLD_STOPS.find(value => value > old + 1e-8) ?? THRESHOLD_STOPS.at(-1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      next = [...THRESHOLD_STOPS].reverse().find(value => value < old - 1e-8) ?? THRESHOLD_STOPS[0];
    else return;
    event.preventDefault();
    changeThreshold(row.name, next);
  });
}
ui['threshold-reset'].addEventListener('click', resetThresholds);
ui['alert-tone-toggle'].addEventListener('change', () => setAlertToneEnabled(ui['alert-tone-toggle'].checked));
ui['debug-toggle'].addEventListener('change', () => setDebug(ui['debug-toggle'].checked));

ui['language-select'].addEventListener('change', () => setLanguage(ui['language-select'].value));
ui.feedback.addEventListener('click', event => {
  if (!feedbackURL(FEEDBACK_FORM_URLS[language === 'ja' ? 'ja' : 'en'])) event.preventDefault();
});
setLanguage(language);
ui['alert-tone-toggle'].checked = alertToneEnabled;
renderThresholds();
resetVisuals();
setDebug(true); // Default ON; changes the diagnostics view only, never starts the microphone.

ui['mic-control'].addEventListener('click', () => {
  // Same callback as the original footer button, moved without changing its logic.
  if (!session || (!session.connected && session.context?.state !== 'running')) start();
  else stop();
});
ui.cancel.addEventListener('click', () => stop());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) stop('画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。');
});
window.addEventListener('pagehide', () => stop());
// No background or lock-screen operation. Start only on a deliberate microphone tap.

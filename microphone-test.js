import { microphoneMatch, browserTrackInfo, meterReading, micErrorCode } from './microphone-test-core.js?v=1.6.0';

const WORDS = Object.freeze({
  ja: {
    home:'← リアルタイム検知', language:'言語', title:'マイク接続テスト',
    intro:'iPhoneのSafariから見える入力機器を確認します。接続しているイヤホンのマイクが使用されているとは限りません。',
    capture:'音声入力', selection:'ブラウザーに表示されたマイク', automatic:'自動選択（既定の入力）',
    start:'マイクをテスト', stop:'停止', refresh:'機器一覧を更新', level:'入力レベル（デジタル相対値）',
    meterNote:'dBFSは録音信号の相対レベルで、実際の騒音のdB値や安全距離ではありません。',
    diagnostics:'実際の入力情報（ブラウザーの報告）',trackLabel:'利用中の音声トラック',
    deviceMatch:'選択した機器との一致',sampleRate:'入力のサンプルレート',
    channels:'チャンネル数',contextRate:'音声処理レート',trackState:'音声トラックの状態',
    available:'一覧に表示された入力',
    routeWarning:'ブラウザーが示す名前やdeviceIdが一致しても、物理的にイヤホンのどのマイクが録音されているか、ANC用マイクを使っているかは確認できません。',
    instructions:'実験手順',instruction1:'イヤホンをiPhoneに接続し、Safariでこのページを開きます。',
    instruction2:'「マイクをテスト」を押して権限を許可します。取得後に機器名が表示される場合があります。',
    instruction3:'機器が複数表示されたら選択して、再び「マイクをテスト」を押します。',
    instruction4:'室内で軽く話してレベルが変わるか確認します。AirPodsとSonyを別々に試してください。',
    ai:'AIテストモード（オフライン） ↗',
    privacy:'音声の録音・保存・送信は行いません。音声はこのページでレベル計測のみに使用します。',
    disclaimer:'研究用診断機能です。交通安全を保証するものではありません。',
    idle:'停止中。テストボタンを押すまでマイクは起動しません。',
    requesting:'マイク権限を確認中…',listening:'マイク入力を受信中。これはAI識別ではありません。',
    stopped:'停止しました。マイク入力は解放されました。',
    changed:'機器の選択を変更しました。新しい機器でテストするには開始を押してください。',
    background:'ページが非表示になったため、マイクを停止しました。',
    ended:'音声トラックが終了しました。接続を確認してください。',
    denied:'マイクが許可されていません。SafariのWebサイト設定を確認してください。',
    noDevice:'音声入力機器が見つかりません。接続を確認してください。',
    busy:'マイクが使用できません。通話や録音アプリを終了して再度お試しください。',
    unsupportedSelection:'選択したマイクをブラウザーが使用できません。自動選択を試してください。',
    otherError:'マイクを開始できません。再接続するかページを開き直してください。',
    insecure:'マイクにはHTTPSで開く必要があります。',
    unavailable:'このブラウザーはマイク入力APIに対応していません。',
    refreshError:'機器一覧を取得できません。',
    noVisible:'表示できる入力機器はありません。許可した後、もう一度更新してください。',
    visible:'入力機器 {count} 件。名前や選択肢はSafariに制限される場合があります。',
    deviceUnknown:'マイク {index}（名前は非公開）',
    browserUnknown:'ブラウザーから名前が公開されていません',
    autoMatch:'自動選択。物理的なマイクは確認できません。',
    reportedMatch:'選択したdeviceIdと一致（ブラウザーの報告）',
    mismatch:'選択したdeviceIdと不一致',
    unknownMatch:'deviceIdが取得できず、一致を確認できません。',
    live:'動作中',muted:'音声がミュート',endedState:'終了',
    none:'—',dbfs:'{value} dBFS',deviceUnsupported:'このブラウザーでは機器の明示選択ができません。',
    selectHint:'選択した機器は、次回「マイクをテスト」を押した時に要求します。'
  },
  en: {
    home:'← Live Detection',language:'Language',title:'Microphone Test Mode',
    intro:'Inspect microphone inputs visible to iPhone Safari. A connected headset is not necessarily the active microphone.',
    capture:'Audio input',selection:'Microphones reported by the browser',automatic:'Automatic (default input)',
    start:'Test microphone',stop:'Stop',refresh:'Refresh devices',level:'Input level (relative digital signal)',
    meterNote:'dBFS is a relative digital signal level, not calibrated environmental dB or an indicator of safe distance.',
    diagnostics:'Actual input information (browser-reported)',trackLabel:'Current audio track',
    deviceMatch:'Match to requested input',sampleRate:'Track sample rate',channels:'Channel count',
    contextRate:'Processing sample rate',trackState:'Audio track state',available:'Visible audio inputs',
    routeWarning:'A matching browser label or deviceId does not verify which physical headset microphone is active or grant access to ANC microphones.',
    instructions:'How to test',instruction1:'Connect your headset to iPhone and open this page in Safari.',
    instruction2:'Tap Test microphone and grant permission. More device names may appear afterward.',
    instruction3:'If multiple inputs appear, select one and press Test microphone again.',
    instruction4:'Speak softly indoors and check the meter. Test AirPods and Sony separately.',
    ai:'AI Test Mode (offline) ↗',privacy:'No audio is recorded, stored, or sent. Audio is used only for a local level meter.',
    disclaimer:'Research diagnostic only. It does not guarantee traffic safety.',
    idle:'Stopped. The microphone will not start until you tap Test microphone.',
    requesting:'Requesting microphone permission…',listening:'Receiving microphone audio. No AI detection runs here.',
    stopped:'Stopped. Microphone stream released.',changed:'Input selection changed. Tap Test microphone to start with the new selection.',
    background:'Microphone stopped because the page became hidden.',
    ended:'The audio track ended. Check the connection.',denied:'Microphone access denied. Review Safari website microphone settings.',
    noDevice:'No microphone found. Check the connection.',
    busy:'Microphone unavailable. End calls or recording apps and retry.',
    unsupportedSelection:'The browser cannot use this selected input. Try automatic selection.',
    otherError:'Unable to start microphone. Reconnect or reload and try again.',
    insecure:'Microphone access requires HTTPS.',
    unavailable:'This browser does not provide microphone capture APIs.',
    refreshError:'Could not enumerate audio input devices.',
    noVisible:'No input devices are shown. Grant microphone access and refresh the list.',
    visible:'{count} audio input(s) listed. Safari may restrict names and selections.',
    deviceUnknown:'Microphone {index} (label withheld)',
    browserUnknown:'Browser did not disclose a track label',
    autoMatch:'Automatic routing. Physical microphone not verified.',
    reportedMatch:'Requested deviceId matches (browser report only)',
    mismatch:'Requested deviceId does not match',
    unknownMatch:'Browser did not expose deviceId; match unverified.',
    live:'Live',muted:'Muted',endedState:'Ended',none:'—',
    dbfs:'{value} dBFS',deviceUnsupported:'This browser does not allow explicit input selection.',
    selectHint:'Your selection will be requested on the next Test microphone tap.'
  },
  'zh-CN': {
    home:'← 实时检测',language:'语言',title:'麦克风测试模式',
    intro:'查看 iPhone Safari 能访问的麦克风。蓝牙耳机已经连接，不代表网页正在使用耳机麦克风。',
    capture:'音频输入',selection:'浏览器显示的麦克风',automatic:'自动选择（默认输入）',
    start:'测试麦克风',stop:'停止',refresh:'刷新设备',level:'输入音量（相对数字信号）',
    meterNote:'dBFS 仅表示数字音频的相对强度，不是真实环境分贝，也不能判断安全距离。',
    diagnostics:'实际输入信息（浏览器报告）',trackLabel:'当前音频轨道',
    deviceMatch:'与所选设备是否匹配',sampleRate:'输入采样率',channels:'通道数',
    contextRate:'处理采样率',trackState:'音频轨道状态',available:'可见输入设备',
    routeWarning:'即使设备名称或 deviceId 匹配，也不能证明实际使用了耳机的哪颗物理麦克风，更不代表可以读取 ANC 麦克风。',
    instructions:'测试步骤',instruction1:'把耳机连接到 iPhone，然后使用 Safari 打开本页面。',
    instruction2:'点击测试麦克风并允许授权，授权后可能出现更多设备名称。',
    instruction3:'如果显示多个输入设备，选择一个后重新点击测试麦克风。',
    instruction4:'在室内轻声说话，观察音量条是否变化。分别测试 AirPods 和 Sony。',
    ai:'AI 测试模式（离线） ↗',privacy:'不录音、不存储、不上传音频；只在本地测量音量。',
    disclaimer:'仅供研究诊断，不保证交通安全。',
    idle:'已停止。只有点击测试按钮才会启动麦克风。',
    requesting:'正在申请麦克风权限…',listening:'正在接收麦克风音频；本页面不运行 AI 识别。',
    stopped:'已停止，麦克风输入已释放。',
    changed:'已更改输入设备。点击测试按钮，才会使用新的选择重新申请输入。',
    background:'网页切换到后台，已停止麦克风。',
    ended:'音频轨道已结束，请检查耳机连接。',
    denied:'麦克风未获授权，请检查 Safari 的网站麦克风设置。',
    noDevice:'没有找到麦克风，请检查连接。',
    busy:'麦克风不可用，请结束通话或其他录音 App 后重试。',
    unsupportedSelection:'浏览器无法使用所选麦克风，请尝试自动选择。',
    otherError:'麦克风启动失败，请重新连接耳机或刷新页面。',
    insecure:'需要通过 HTTPS 打开网页才能使用麦克风。',
    unavailable:'当前浏览器不支持所需的麦克风 API。',
    refreshError:'无法读取麦克风设备列表。',
    noVisible:'暂时没有可显示的输入设备。请授权后再次刷新。',
    visible:'浏览器显示 {count} 个输入设备。Safari 可能限制设备名称或选择。',
    deviceUnknown:'麦克风 {index}（名称未公开）',
    browserUnknown:'浏览器未公开当前音频轨道名称',
    autoMatch:'自动选择，无法验证实际物理麦克风。',
    reportedMatch:'所选 deviceId 与实际报告一致（仅浏览器信息）',
    mismatch:'所选 deviceId 与实际报告不一致',
    unknownMatch:'浏览器未公开 deviceId，无法确认。',
    live:'运行中',muted:'已静音',endedState:'已结束',none:'—',
    dbfs:'{value} dBFS',deviceUnsupported:'浏览器不支持指定麦克风。',
    selectHint:'设备选择只会在下次点击「测试麦克风」时生效。'
  }
});

const el = id => document.getElementById(id);
const LANGS = ['ja','en','zh-CN'];
const query = new URL(location.href).searchParams;
let lang = LANGS.includes(query.get('lang')) ? query.get('lang') : 'ja';
let audioInputs = [], active = null, generation = 0, enumerationGeneration = 0;
const t = (key, params={}) => (WORDS[lang][key] || WORDS.ja[key] || key)
  .replace(/\{(\w+)\}/g, (_,k)=>String(params[k] ?? ''));
const state = key => { el('status').textContent = t(key); el('status').dataset.status = key; };

function translate() {
  document.documentElement.lang=lang;
  el('language').value=lang;
  el('language').setAttribute('aria-label',t('language'));
  el('meter').setAttribute('aria-label',t('level'));
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent=t(node.dataset.i18n); });
  const suffix='?v=1.6.0&lang='+encodeURIComponent(lang);
  el('home-link').setAttribute('href','./index.html'+suffix);
  el('ai-link').setAttribute('href','./ai-test.html'+suffix);
  const key=el('status').dataset.status||'idle';
  state(key);
  renderDevices();
  if(active?.stream) showTrack(active);
}
function controls() {
  el('start').disabled=!!active;
  el('stop').disabled=!active;
}
function resetMeter() {
  el('level').textContent='—';
  el('meter-fill').style.width='0%';
  el('meter').setAttribute('aria-valuenow','0');
}
function clearInfo() {
  for(const id of ['track-label','device-match','sample-rate','channels','context-rate','track-state'])
    el(id).textContent='—';
  resetMeter();
}
function closeSession(s) {
  if (!s) return;
  if (s.raf!=null) cancelAnimationFrame(s.raf);
  for (const track of s.stream?.getTracks() || []) {
    track.onended=null;track.onmute=null;track.onunmute=null;track.stop();
  }
  try {s.source?.disconnect();}catch {}
  try {s.analyser?.disconnect();}catch {}
  try {s.silent?.disconnect();}catch {}
  if(s.context) Promise.resolve(s.context.close()).catch(()=>{});
}
function stop(reason='stopped') {
  generation++;
  const old=active; active=null;
  closeSession(old);
  controls();
  clearInfo();
  state(reason);
}
function showTrack(s) {
  if(active!==s||!s.stream)return;
  const track=s.stream.getAudioTracks()[0];
  if(!track)return;
  const info=browserTrackInfo(track,audioInputs,s.requestedId);
  el('track-label').textContent=info.label || t('browserUnknown');
  el('device-match').textContent=t({
    automatic:'autoMatch','reported-match':'reportedMatch',
    mismatch:'mismatch',unknown:'unknownMatch'
  }[info.match]);
  el('sample-rate').textContent=info.sampleRate ? info.sampleRate+' Hz' : t('none');
  el('channels').textContent=info.channels ?? t('none');
  el('context-rate').textContent=s.context?.sampleRate ? s.context.sampleRate+' Hz' : t('none');
  el('track-state').textContent=t(info.state==='live'?'live':info.state==='muted'?'muted':'endedState');
}
function renderDevices(preserve=true) {
  const select=el('device-select');
  const prior=preserve?select.value:'';
  const choose=prior && audioInputs.some(d=>d.deviceId===prior);
  select.replaceChildren();
  const automatic=document.createElement('option');
  automatic.value=''; automatic.textContent=t('automatic'); select.append(automatic);
  const supported=navigator.mediaDevices?.getSupportedConstraints?.()?.deviceId !== false;
  audioInputs.forEach((device,i)=>{
    if(!device.deviceId||!supported)return;
    const option=document.createElement('option');
    option.value=device.deviceId;
    option.textContent=device.label || t('deviceUnknown',{index:i+1});
    select.append(option);
  });
  select.value=choose?prior:'';
  el('device-count').textContent=String(audioInputs.length);
  const exposed=audioInputs.some(d=>!!d.deviceId);
  el('device-hint').textContent=active?.stream
    ? t('selectHint')
    : !supported ? t('deviceUnsupported')
    : !exposed ? t('noVisible')
    : t('visible',{count:audioInputs.length});
}
async function refreshDevices() {
  const token=++enumerationGeneration;
  try {
    if(!navigator.mediaDevices?.enumerateDevices) {
      if(token!==enumerationGeneration)return;
      audioInputs=[];renderDevices();el('device-hint').textContent=t('deviceUnsupported');return;
    }
    const list=await navigator.mediaDevices.enumerateDevices();
    if(token!==enumerationGeneration)return;
    audioInputs=list.filter(d=>d.kind==='audioinput');
    renderDevices();
    if(active?.stream) showTrack(active);
  }catch {
    if(token!==enumerationGeneration)return;
    el('device-hint').textContent=t('refreshError');
  }
}
function draw(s) {
  if(active!==s||!s.stream)return;
  const track=s.stream.getAudioTracks()[0];
  if(!track||track.readyState==='ended') {stop('ended');return;}
  s.analyser.getFloatTimeDomainData(s.samples);
  const reading=meterReading(s.samples);
  el('level').textContent=reading.dbfs===null?'-∞ dBFS':t('dbfs',{value:reading.dbfs.toFixed(1)});
  el('meter-fill').style.width=reading.level.toFixed(1)+'%';
  el('meter').setAttribute('aria-valuenow',String(Math.round(reading.level)));
  if(s.ticks++ % 30 === 0)showTrack(s);
  s.raf=requestAnimationFrame(()=>draw(s));
}
async function start() {
  if(active)return;
  const media=navigator.mediaDevices;
  if(!window.isSecureContext) {state('insecure');return;}
  if(!media?.getUserMedia) {state('unavailable');return;}
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass) {state('unavailable');return;}
  const requestedId=el('device-select').value;
  const token=++generation;
  const s={requestedId,stream:null,context:null,source:null,analyser:null,silent:null,raf:null,ticks:0};
  active=s;controls();state('requesting');clearInfo();
  try {
    s.context=new AudioContextClass();
    // Call both before the first await to retain the iOS user-gesture context.
    const resumed=Promise.resolve(s.context.resume()).then(()=>null,error=>error);
    const streamPromise=media.getUserMedia({
      audio:requestedId?{deviceId:{exact:requestedId}}:true,video:false
    });
    const stream=await streamPromise;
    if(token!==generation||active!==s) {
      stream.getTracks().forEach(track=>track.stop());return;
    }
    s.stream=stream;
    const resumeError=await resumed;
    if(resumeError)throw resumeError;
    if(token!==generation||active!==s)return;
    const track=stream.getAudioTracks()[0];
    if(!track)throw {name:'NotFoundError'};
    s.source=s.context.createMediaStreamSource(stream);
    s.analyser=s.context.createAnalyser();
    s.analyser.fftSize=2048;
    s.samples=new Float32Array(s.analyser.fftSize);
    s.silent=s.context.createGain();
    s.silent.gain.value=0;
    s.source.connect(s.analyser);
    // Keep the Web Audio graph running, but never play microphone audio.
    s.analyser.connect(s.silent);
    s.silent.connect(s.context.destination);
    track.onended=()=>{if(active===s)stop('ended');};
    track.onmute=()=>{if(active===s)showTrack(s);};
    track.onunmute=()=>{if(active===s)showTrack(s);};
    state('listening');showTrack(s);
    s.raf=requestAnimationFrame(()=>draw(s));
    void refreshDevices();
  }catch(error) {
    if(token!==generation||active!==s)return;
    stop(micErrorCode(error));
  }
}
el('language').addEventListener('change',()=>{
  lang=LANGS.includes(el('language').value)?el('language').value:'ja';
  translate();
});
el('start').addEventListener('click',()=>{void start();});
el('stop').addEventListener('click',()=>stop());
el('refresh').addEventListener('click',()=>{void refreshDevices();});
el('device-select').addEventListener('change',()=>{
  if(active)stop('changed');
  else state('changed');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop('background');});
window.addEventListener('pagehide',()=>{if(active)stop('background');});
navigator.mediaDevices?.addEventListener?.('devicechange',()=>{void refreshDevices();});
translate();controls();clearInfo();
void refreshDevices(); // Does not request microphone permission or start capture.

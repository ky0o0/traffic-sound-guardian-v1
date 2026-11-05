import { requireElements, RESEARCH_IDS } from './page-elements.js?v=1.7.6';
import { ResearchSession } from './research.js?v=1.7.6';
import { WARNING_TARGETS } from './detection.js?v=1.7.6';
import { debugCategoryName } from './debug.js?v=1.7.6';
const $ = id => document.getElementById(id);
const state = new ResearchSession(Object.keys(WARNING_TARGETS));
const dictionaries = {
 ja:{title:'セッションの研究データ',counts:'警告回数 · 新規イベント',log:'最近100件の記録',note:'メモリ内のみ。CSVは手動保存。音声なし。次の検知開始で消去します。',export:'CSVを書き出す',time:'時刻',kind:'種別',value:'識別 / 警告',inference:'推論',warning:'警告',elapsed:'実行時間',total:'総推論回数',top:'Top 1 · 生スコア',mean:'平均モデル推論 · 直近20回',hz:'実測更新頻度 · 直近20回',valid:'最終有効識別',lastWarning:'最終警告',input:'入力サンプルレート · track settings',context:'AudioContext サンプルレート',window:'解析窓 / 更新ステップ',mic:'入力名 / ブラウザの証拠',base:'基準 → 有効しきい値',effective:'有効しきい値'},
 en:{title:'Session research data',counts:'Warnings · new events',log:'Last 100 records',note:'Memory only. Manual CSV export, no audio. Cleared on next detection start.',export:'Export CSV',time:'Time',kind:'Type',value:'Prediction / warning',inference:'Inference',warning:'Warning',elapsed:'Session duration',total:'Total inferences',top:'Top 1 · raw score',mean:'Mean model inference · last 20',hz:'Measured update rate · last 20',valid:'Last valid prediction',lastWarning:'Last warning',input:'Input sample rate · track settings',context:'AudioContext sample rate',window:'Analysis window / update hop',mic:'Input label / browser evidence',base:'Base → Effective threshold',effective:'Effective threshold'},
 'zh-CN':{title:'会话研究数据',counts:'警告次数 · 新事件',log:'最近100条记录',note:'仅保留在内存中；手动导出 CSV，不含音频。下次启动检测时清空。',export:'导出 CSV',time:'时间',kind:'类型',value:'识别 / 警告',inference:'推理',warning:'警告',elapsed:'本次检测运行时间',total:'总推理次数',top:'Top 1 · 原始分数',mean:'平均模型推理耗时 · 最近20次',hz:'实际更新频率 · 最近20次',valid:'最近有效识别时间',lastWarning:'最近警告时间',input:'输入采样率 · track settings',context:'AudioContext 采样率',window:'分析窗口 / 更新步长',mic:'输入名称 / 浏览器证据',base:'基础阈值 → 有效阈值',effective:'有效阈值'}
};
const language = () => document.documentElement.lang;
const words = () => dictionaries[language()] ?? dictionaries.ja;
const sound = categoryName => categoryName ? debugCategoryName({categoryName},language()) : 'N/A';
const timestamp = at => at == null ? 'N/A' : new Date(at).toLocaleTimeString(language(),{hour12:false});
const number = (value,digits=2,suffix='') => Number.isFinite(value) ? value.toFixed(digits)+suffix : 'N/A';
let timer = null;
let logFilter = 'all';
function metric(label,value){const group=document.createElement('div');group.className='metric';const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;group.append(dt,dd);return group;}
function renderMetrics(){
 const t=words(),r=state.last;
 $('research-metrics').replaceChildren(...[
 [t.elapsed,number(state.elapsed(performance.now()) === null ? null : state.elapsed(performance.now())/1000,1,' s')],
 [t.total,String(state.total)],[t.top,r ? sound(r.category)+' · '+(r.score??'N/A') : 'N/A'],
 [t.mean,number(state.meanMs,2,' ms')],[t.hz,number(state.hz,2,' Hz')],
 [t.valid,timestamp(state.lastValidAt)],[t.lastWarning,timestamp(state.lastWarningAt)],
 [t.input,number(r?.inputSampleRate,0,' Hz')],[t.context,number(r?.contextSampleRate,0,' Hz')],
 [t.window,'0.975 s / 0.480 s'],[t.mic,r?.microphone ? (r.microphone.label || 'N/A')+' / '+r.microphone.basis : 'N/A']
 ].map(([label,value]) => metric(label,value)));
}
function render(){
 const t=words();
 for(const [id,key] of Object.entries({'research-title':'title','research-counts-title':'counts','research-log-title':'log','research-log-note':'note','export-csv':'export','log-time':'time','log-kind':'kind','log-value':'value'}))$(id).textContent=t[key];
 $('debug-target-effective').textContent=t.effective;
 renderMetrics();
 $('research-counts').replaceChildren(...Object.entries(state.counts).map(([name,count]) => {
  const row=document.createElement('span'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=sound(name);value.textContent=String(count);row.append(label,value);return row;
 }));
 const filterWords = {ja:['すべて','推論','警告'],en:['All records','Inference','Warning'],'zh-CN':['全部记录','推理','警告']}[language()] ?? ['All records','Inference','Warning'];
 $('log-filter').setAttribute('aria-label',t.kind);
 for(const [i,option] of [...$('log-filter').options].entries())option.textContent=filterWords[i];
 $('research-log').replaceChildren(...state.records.filter(r => logFilter === 'all' || r.kind === logFilter).slice().reverse().map(r => {
  const tr=document.createElement('tr');
  for(const value of [timestamp(r.at),t[r.kind],sound(r.category)+' · '+(r.score??'N/A')+(r.kind==='inference' ? ' / '+number(r.inferenceMs,2,' ms') : ' / ≥ '+number(r.thresholds[r.category],3))]){const td=document.createElement('td');td.textContent=value;tr.append(td);}return tr;
 }));
 $('export-csv').disabled = !state.records.length;
}
if($('research-dashboard')){
 requireElements(document, RESEARCH_IDS, 'Research dashboard');
 window.addEventListener('tsg:capture',event => {
  clearInterval(timer);timer=null;
  if(event.detail?.active){state.start(Date.now(),performance.now());timer=setInterval(renderMetrics,1000);}
  else state.stop(performance.now());render();
 });
 window.addEventListener('tsg:research',event => {state.observe(event.detail);render();});
 window.addEventListener('tsg:language',render);
 window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;state.stop(performance.now());});
 $('log-filter').addEventListener('change',()=>{logFilter=$('log-filter').value;render();});
 $('export-csv').addEventListener('click',()=>{
  if(!state.records.length)return;
  const url=URL.createObjectURL(new Blob([state.csv()],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='sound-guardian-session.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),0);
 });
 render();
}

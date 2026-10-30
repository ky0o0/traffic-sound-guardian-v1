import fs from 'node:fs/promises';
import {NAMES} from '../../../ai-test-analysis.js';
const root=new URL('./',import.meta.url);
const r=JSON.parse(await fs.readFile(new URL('.working/raw-results.json',root),'utf8'));
const {rows,manifest}=r;
const ids=['police','ambulance','fire'];
const mapping={
  siren:'Siren',police:'Police car (siren)',
  ambulance:'Ambulance (siren)',fire:'Fire engine, fire truck (siren)'};
const files=rows.map(x=>{
  let peak=Object.fromEntries(NAMES.map(n=>[n,Math.max(0,...x.windows.map(w=>w.scores[n]))]));
  const dominant=Object.entries(peak).sort((a,b)=>b[1]-a[1])[0];
  const src=manifest.clips.find(z=>z.id===x.id);
  return {id:x.id,sourcePage:src.source_page,audioUrl:src.download_url,
    fileSha256:src.sha256,originalSourceGroup:src.original_source_group,
    label:x.label,tier:x.tier,windows:x.windows.length,
    durationSeconds:x.durationSeconds,peak,dominantClass:dominant[0],
    dominantRawScore:dominant[1],
    intendedScore:peak[mapping[x.label]],
    intendedThreshold01Reached:peak[mapping[x.label]]>=0.10,
    genericSirenScore:peak[mapping.siren],
    genericSirenThreshold01Reached:peak[mapping.siren]>=0.10};
});
let csv=['clip_id,source_group,source_type,label,start_seconds,end_seconds,'+
         NAMES.map((n,i)=>'score_'+['bell','horn','siren','police','ambulance','fire'][i]).join(',')+
         ',inference_ms,worker_roundtrip_ms'];
for(const x of rows){
 const src=manifest.clips.find(y=>y.id===x.id);
 for(const w of x.windows)csv.push([
   x.id,src.original_source_group,x.tier,x.label,w.start,w.end,
   ...NAMES.map(n=>w.scores[n]),w.inferenceMs,w.roundTripMs].join(','));
}
await fs.writeFile(new URL('SIX_SCORES.csv',root),csv.join('\n')+'\n');
const groups=Object.fromEntries(ids.map(k=>[k,files.filter(x=>x.label===k).length]));
const realPolice=files.filter(x=>x.label==='police'&&x.tier!=='japan_style_SYNTH_control_ONLY').length;
const result={kind:'Japan-sirens controlled-reference pilot',status:'exploratory_not_real_world_road_recognition',
  sourceFileCount:files.length,groupCounts:groups,realJapanPoliceRecordedCases:realPolice,
  sampleWindows:rows.reduce((s,x)=>s+x.windows.length,0),
  sourceTierCounts:Object.fromEntries([...new Set(files.map(f=>f.tier))].map(k=>[k,files.filter(x=>x.tier===k).length])),
  model:'TSG V1.6 exact website YAMNet MediaPipe 0.10.21',
  noAuditedRoadsideEventOnsets:true,
  noIndependentRealPoliceRecording:realPolice===0,
  classTypeTruth:'publisher-supplied class of demo or a modeled control; no field truth guarantee',
  notes:['DO NOT report threshold accuracy on these as natural field recordings',
    'Municipality samples may be electronically generated demos, not real street scenes',
    'OtoLogic Japanese police is explicitly synthesizer-generated and its variations are correlated',
    'Fire siren may use identical tonal pattern to Japanese police: class confusion expected',
    'Only file-level maxima tested; no event timing or vehicle real-world detection metrics'],
  files};
await fs.writeFile(new URL('RESULTS.json',root),JSON.stringify(result,null,2)+'\n');
const f=n=>Number.isFinite(n)?Number(n).toFixed(3):'N/A';
const l=[
'# 日本の緊急車両サイレン：日本向け六类别 Score 試験',
'',
'**实际执行了 TSG V1.6 的原版 YAMNet；这是日本车辆警笛参考音的探索性结果，不是道路现场分类准确率。**',
'',
'- 下载成功 '+files.length+' 段，声音窗口 '+result.sampleWindows+' 个；所有窗口的6类原始 YAMNet Score 已保存。',
'- 标签来源：日本地方消防机构的警笛示例、日本音效网站的救护车/消防车素材，以及日本警车风格的**合成器参考音**。',
'- 日本警车真实街道录音数量：'+realPolice+'。不把警车模拟音当成现实录音。',
'- 同一来源的多个效果音变体不是独立样本，不用于证明精确率。',
'',
'| 来源 / 声音 | 类型 | 正确车型的YAMNet原始分数峰值 | 通用Siren峰值 | 正确车型≥0.10 |',
'|---|---|---:|---:|---|',
...files.map(x=>'| '+x.id+' | '+x.tier+' | '+f(x.intendedScore)+' | '+f(x.genericSirenScore)+' | '+(x.intendedThreshold01Reached?'是':'否')+' |'),
'',
'## 不应误读',
'',
'- 原始分数不是音量dB、校准概率或经过标注的准确率；特别是不能根据少数录音选出最优阈值。',
'- 日本消防车在某些任务中使用不带钟的“ウーウー”警笛，容易与日本警车混淆，因此交通安全项目应优先保证“紧急车辆警报”总体检出。',
'- 以上音频包含官方示范、音效和合成参考，并未全部确认为街头实录。仍需找真实日文场景的警车、救护车、消防车、路噪/远近变化录音与人工事件标注。',
'- 该分支只做实验，不更改正式网站阈值与SH研究内容。',
'',
'## Source pages',
'- 木更津市消防本部 https://www.city.kisarazu.lg.jp/soshiki/shobo/keibo/1/4056.html',
'- 旭川市消防本部 https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335.html',
'- 小森平（日本環境効果音） https://taira-komori.net/enviroment01.html',
'- OtoLogic（日本警车风格为合成器，不是实录） https://otologic.jp/free/se/transportation02.html',
'',
'具体录音来源 URL、SHA256、声音类别、每个窗口六类Score及完整归档在 RESULTS.json、SIX_SCORES.csv 和 GitHub Actions Artifact。'
];
await fs.writeFile(new URL('REPORT.zh-CN.md',root),l.join('\n')+'\n');
console.log('REPORT',files.length,'source clips',result.sampleWindows,'windows',JSON.stringify(groups));

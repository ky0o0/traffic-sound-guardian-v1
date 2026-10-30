/* Actual TSG 1.6 six-class time-resolved YAMNet score analysis.

A sound's "size" here is the YAMNet raw model score [0,1], NOT acoustic
dB, sound amplitude, posterior probability or recognized-onset confidence.
Human annotation missing => only exploratory weak-label clip metrics.
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NAMES,MODEL,CONFIG} from '../../../ai-test-analysis.js';
import {TARGETS} from '../../../detection.js';

const ROOT=new URL('./',import.meta.url);
const WORK=new URL('.working/',ROOT);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',WORK),'utf8'));
const raw=JSON.parse(await fs.readFile(new URL('raw-results.json',WORK),'utf8'));
const clips=raw.clips;
if(clips.length!==manifest.successful||clips.length<60) throw Error('A real WAV missing from completed corpus');
const byId=new Map(manifest.clips.map(x=>[x.id,x]));
if(clips.some(c=>!byId.has(c.id)||!c.result?.windows?.length||
   c.result.windows.some(w=>NAMES.some(n=>!Number.isFinite(w.scores[n])||w.scores[n]<0||w.scores[n]>1))))
  throw Error('Missing or invalid six-class genuine inference evidence');
if(new Set(clips.map(c=>c.sourceGroup)).size!==clips.length)
  throw Error('Possible duplicate original-source groups: these must not be treated as independent');

const ids=['bell','horn','siren','police','ambulance','fire'];
const labelsByID={
  bell:"Bicycle bell",horn:"Vehicle horn, car horn, honking",siren:"Siren",
  police:"Police car (siren)",ambulance:"Ambulance (siren)",
  fire:"Fire engine, fire truck (siren)"
};
if(ids.some((id,i)=>labelsByID[id]!==NAMES[i]||!(NAMES[i] in TARGETS)))
  throw Error('Production model target labels changed; must revalidate');

function hash(x){return createHash('sha256').update(x).digest('hex')}
const byCat=new Map();
for(const c of clips){
  const src=byId.get(c.id);
  const key=src.dataset+'|'+src.label;
  if(!byCat.has(key))byCat.set(key,[]);
  byCat.get(key).push(c);
}
const validationIDs=new Set();
for(const [category,group] of byCat){
  group.sort((a,b)=>hash('TSG-R2-20261030-valid:'+a.sourceGroup).localeCompare(
                         hash('TSG-R2-20261030-valid:'+b.sourceGroup)));
  for(const c of group.slice(0,Math.floor(group.length*0.70)))validationIDs.add(c.id);
}
const role=c=>validationIDs.has(c.id)?'validation':'test';
const samples=clips.map(c=>{
  const source=byId.get(c.id);
  const peak=Object.fromEntries(NAMES.map(n=>[n,Math.max(...c.result.windows.map(w=>w.scores[n]))]));
  return {id:c.id,sourceGroup:c.sourceGroup,dataset:source.dataset,
          sourceTagAudit:source.source_exhaustively_labeled?'FSD50K eval curated':'dataset source label',
          originalRecordingID:source.original_id,
          originalCategory:source.source_label_all,label:source.label,
          salience:source.salience??'unclassified',durationSeconds:c.duration,paddedSilenceSeconds:c.paddedSilenceSeconds??0,
          validFrames:c.result.windows.length,peakScores:peak,
          partition:role(c),sha256:source.sha256};
});
const valid=samples.filter(s=>s.partition==='validation');
const test=samples.filter(s=>s.partition==='test');
const choices=Array.from({length:100},(_,i)=>Number(((i+1)/100).toFixed(2)));

function counts(rows,label,threshold){
  const c={tp:0,fp:0,fn:0,tn:0};
  // Only bell, horn, generic siren have source-label positives.
  for(const row of rows){
    const truth=row.label===label;
    const pred=row.peakScores[labelsByID[label]]>=threshold;
    c[truth?(pred?'tp':'fn'):(pred?'fp':'tn')]++;
  }
  let div=(a,b)=>b?a/b:null;
  return {...c,precision:div(c.tp,c.tp+c.fp),recall:div(c.tp,c.tp+c.fn),
          specificity:div(c.tn,c.tn+c.fp),
          f1:div(2*c.tp,2*c.tp+c.fp+c.fn),
          fpr:div(c.fp,c.fp+c.tn),
          n:rows.length,support:c.tp+c.fn};
}

const recommendation={};
for(const label of ids){
  if(!['bell','horn','siren'].includes(label)){
    recommendation[label]={threshold:0.10,decision:"UNVERIFIED: no specific police/ambulance/fire-engine positive labels",
      validationPositiveSupport:0,selectedBy:"no optimization possible; retained V1.6 0.10"};
    continue;
  }
  const cand=choices.map(t=>({threshold:t,...counts(valid,label,t)}));
  // Baseline and tuning always on SAME validated cohort, not on heldout cases.
  // Critical: no undefined precision/recall compare. Ties favor recall then
  // precision then higher threshold for less nuisance triggers.
  const list=[...cand].sort((a,b)=>{
    const va=[a.f1??-1,a.recall??-1,a.precision??-1,a.threshold];
    const vb=[b.f1??-1,b.recall??-1,b.precision??-1,b.threshold];
    for(let i=0;i<va.length;i++)if(va[i]!==vb[i])return vb[i]-va[i];
    return 0;
  });
  let winner=list[0];
  if(winner.support<3 || winner.tn+winner.fp<3){
    recommendation[label]={threshold:0.10,decision:"insufficient validation support",
      validationPositiveSupport:winner.support,selectedBy:"no optimization"};
  }else{
    recommendation[label]={threshold:winner.threshold,
      decision:"exploratory-f1-on-weak-dataset-tags",selectedBy:"validation only, F1 then recall then precision then higher threshold",
      validationPositiveSupport:winner.support,validationConfusion:counts(valid,label,winner.threshold),
      baselineValidationConfusion:counts(valid,label,0.10),curve:cand};
  }
}
const comparison={};
for(const label of ids){
  const cand=recommendation[label];
  comparison[label]=['bell','horn','siren'].includes(label)?
     {default01:{validation:counts(valid,label,0.10),heldout:counts(test,label,0.10)},
      candidate:{threshold:cand.threshold,validation:counts(valid,label,cand.threshold),
        heldout:counts(test,label,cand.threshold)},
      selectedUsing:'validation scores only',
      important:'Dataset primary labels have not been manually checked. Counts provisional.'}:
     {defaultThreshold:0.10,reviewStatus:"NO CLASS-SPECIFIC VALIDATION DATA. All sample scores available, but class recall/precision not measurable."};
}
// Raw score peaks, distributions and every real 0.975s window, including
// values far below default 0.10, are preserved.
const scoreRows=[];
for(const c of clips){
  const source=byId.get(c.id);
  for(const w of c.result.windows){
    const item={id:c.id,group_id:c.sourceGroup,dataset:source.dataset,
                original_label:source.label,salience:source.salience,
                partition:role(c),start:w.start,end:w.end,
                inference_ms:w.inferenceMs,worker_round_trip_ms:w.roundTripMs};
    for(const n of NAMES)item['score_'+n]=w.scores[n];
    scoreRows.push(item);
  }
}
const columns=Object.keys(scoreRows[0]);
const csvValue=v=>{
  const s=String(v??'');
  if(/^[=+\-@\t\r]/.test(s)) return '"\x27'+s.replaceAll('"','""')+'"';
  return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
};
await fs.writeFile(new URL('WINDOW_SCORES.csv',WORK),
    [columns.join(','),...scoreRows.map(r=>columns.map(k=>csvValue(r[k])).join(','))].join('\n')+'\n');
const times={
  meanInferenceMs:scoreRows.reduce((s,r)=>s+r.inference_ms,0)/scoreRows.length,
  meanWorkerRoundtripMs:scoreRows.reduce((s,r)=>s+r.worker_round_trip_ms,0)/scoreRows.length,
  maxWorkerRoundtripMs:Math.max(...scoreRows.map(r=>r.worker_round_trip_ms)),
  under480msRatio:scoreRows.filter(r=>r.worker_round_trip_ms<=480).length/scoreRows.length,
  sampleCount:scoreRows.length};
const result={
  status:"EXPLORATORY_UNAUDITED_SOURCE_LABELS",runtime:"TSG V1.6 browser MediaPipe actual classifier",
  baselineThreshold:0.10,sourceRecordings:samples.length,workerWindows:scoreRows.length,
  paddedClipCount:samples.filter(s=>s.paddedSilenceSeconds>0).length,
  uniqueFreesoundGroups:new Set(samples.map(s=>s.sourceGroup)).size,
  sourceDatasetCounts:Object.fromEntries([...new Set(samples.map(s=>s.dataset))].map(k=>[k,samples.filter(s=>s.dataset===k).length])),
  sourceLabelCounts:Object.fromEntries(["bell","horn","siren","none"].map(k=>[k,samples.filter(s=>s.label===k).length])),
  rawSixClasses:Object.fromEntries(ids.map((k,i)=>[k,NAMES[i]])),
  timeResolution:{windowSeconds:CONFIG.windowSeconds,hopSeconds:CONFIG.hopSeconds,
      windowsOverlap:true,scoreIsNotSoundLevel:true},
  partition:{strategy:"deterministic SHA256 within dataset*source_label strata, grouped by original Freesound ID",
    validationGroupCount:valid.length,finalTestGroupCount:test.length,leakageCheck:"unique exact original recording ID",splitFrozenBeforeScoring:true},
  trainingPolicy:"NO model retraining and NO change to website. No event-onset labels.",
  limitations:["Original primary class labels are weak; absence of other warnings in negative clips not audited.",
    "Background noisiness not independently human reviewed; clean field recordings and noisy recordings both included.",
    "Separate police/ambulance/fire subtype source labels absent: these 3 output score streams cannot be used to claim subtype accuracy.",
    "Scoring per file captures presence anywhere, NOT event onsets, short-bell miss rate or microphone latency.",
    "No validated deployment claims; browser on GitHub runner is not mobile hardware."],
  comparison,recommendation,times,sourceRows:samples,
  fullScoreCSV:"WINDOW_SCORES.csv in CI Artifact; permanent gzip in this research branch",
  fullRawInference:"SCORES.json.gz in research branch / raw-results.json in CI Artifact"
};
await fs.writeFile(new URL('RESULTS.json',ROOT),JSON.stringify(result,null,2)+'\n');
const pct=n=>n==null?'N/A':(100*n).toFixed(1)+'%';
function stats(rows,k){
  const vals=rows.filter(r=>r.label===k).map(r=>r.peakScores[labelsByID[k]]);
  const found=vals.filter(v=>v>=.10);
  const mean=x=>x.length?x.reduce((a,b)=>a+b,0)/x.length:null;
  return {total:vals.length,detected:found.length,
    all:{min:vals.length?Math.min(...vals):null,max:vals.length?Math.max(...vals):null,mean:mean(vals)},
    above01:{min:found.length?Math.min(...found):null,max:found.length?Math.max(...found):null,mean:mean(found)}};
}
result.scoreSummary=Object.fromEntries(["bell","horn","siren"].map(k=>[k,stats(samples,k)]));
result.metadataWarnings={
  source_exclusivity:"All samples grouped by original Freesound ID across FSD50K and UrbanSound8K",
  dataset_source_mix:true,
  source_metadata_sha256:manifest.source_metadata_sha256,
  source_human_audit_complete:false,
  japanese_specific_vehicle_siren_data:false
};
// ensure scoreSummary is also present in the committed machine-readable file
await fs.writeFile(new URL('RESULTS.json',ROOT),JSON.stringify(result,null,2)+'\n');
const fmt=v=>v==null?"N/A":v.toFixed(3);
const text=[
"# YAMNet 大样本基准测试（真实录音，每类目标100份独立来源）",
"",
"**数据是实际运行的网站YAMNet模型输出，但音频事件起止时间、原始标签是否完整仍需人工复核，不能把下表当作道路安全准确率。**",
"",
"## 样本来源",
"- 实际处理录音："+samples.length+"，互不重复的 Freesound 原始来源："+result.uniqueFreesoundGroups+"。",
"- 其中 "+Object.entries(result.sourceLabelCounts).map(([k,v])=>k+" "+v+"份").join("，")+"；其他声音用来识别疑似误报。",
"- 来自："+Object.entries(result.sourceDatasetCounts).map(([k,v])=>k+" "+v+"份").join("；")+"。",
"- 六个类别每个音频窗的完整原始Score都保存了，但本轮有正确标签的只有自行车铃、汽车喇叭和通用警笛。日本警车、救护车、消防车的声音需要另行获取真正标注其车型的日本音源。",
"- 识别窗口："+scoreRows.length+"；不足0.975秒而**仅补数字静音**以适配网站窗口的音频："+result.paddedClipCount+"段。没有生成新的警告音或将同一录音变速复制凑数。",
"",
"## 0.10时每段录音的类别最高分统计",
"| 声音 | 独立录音 | ≥0.10的录音 | 所有录音最低 | 所有录音最高 | 所有录音平均 | ≥0.10部分最低 | ≥0.10部分平均 |",
"|---|---:|---:|---:|---:|---:|---:|---:|"
];
for(const [k,name] of [["bell","自行车铃"],["horn","汽车喇叭"],["siren","通用警笛"]]){
 const x=result.scoreSummary[k];
 text.push("| "+name+" | "+x.total+" | "+x.detected+" | "+fmt(x.all.min)+" | "+fmt(x.all.max)+" | "+fmt(x.all.mean)+" | "+fmt(x.above01.min)+" | "+fmt(x.above01.mean)+" |");
}
text.push("","**注意**：Score不是分贝或校准概率。每段的最高分并不等于警告声开始时的得分，也不一定是UI最终选定的类别。",
"",
"## 基准0.10与验证集选择阈值的留出测试集对比（只供探索）",
"| 类别 | 暂选阈值 | 0.10测试集Recall | 暂选阈值测试集Recall | 0.10测试集F1 | 暂选阈值测试集F1 |",
"|---|---:|---:|---:|---:|---:|"
);
for(const [k,name] of [["bell","自行车铃"],["horn","汽车喇叭"],["siren","通用警笛"]]){
 const a=comparison[k];text.push("| "+name+" | "+a.candidate.threshold.toFixed(2)+" | "+
 pct(a.default01.heldout.recall)+" | "+pct(a.candidate.heldout.recall)+" | "+
 pct(a.default01.heldout.f1)+" | "+pct(a.candidate.heldout.f1)+" |");
}
text.push("","本轮的类别比例是有意人为均衡的，且部分音源只有主标签：基于这些数据得到的Precision/F1**不能直接代表长期道路使用的误报概率**。全部阈值只是研究候选，不修改正式网站。",
"",
"## 类别特异警笛的待补缺口",
"",
"- Police car (siren)、Ambulance (siren)、Fire engine (siren) 的 **六类真实Score已随其他样本完整记录**，但 FSD50K 与 UrbanSound8K 没有这些车辆的可靠具体车型标签。",
"- 不能把通用 Siren 的100份测试案例直接重复算作警车100份、救护车100份和消防车100份。",
"- 日本车辆特定音源与此前实验见 research/yamnet/japan 和 research/yamnet/japan/field；应另外收集更多独立实录后单独做车型测试。",
"",
"## 原始数据、复现和局限",
"- WINDOW_SCORES.csv.gz：**每段每窗口六类 Score**（包含小于0.10的分数）以及起止时间。",
"- SCORES.json.gz：完整模型计算记录及原始录音来源 SHA256。",
"- MANIFEST.json.gz：每个原始 Freesound ID / 数据集标签、来源、许可说明与下载结果。",
"- 只用 V1.6 正式网站同一套 MediaPipe TFLite/Worker，不修改它的推理参数。SH研究资料不改动。",
"- 未人工复核所有事件起止时间；零音频事件片段未必100%没有警告声。原声音频版权归各原始作者，实验只保存分数，不在GitHub提交音频。",
"",
"**主要来源**：[FSD50K 官方数据集](https://fsannotator.upf.edu/fsd/release/FSD50K/) / [Fhrozen原音频托管](https://huggingface.co/datasets/Fhrozen/FSD50k)；[UrbanSound8K](https://urbansounddataset.weebly.com/urbansound8k.html) / [MahiA音频镜像](https://huggingface.co/datasets/MahiA/UrbanSound8K)。",
""
];

await fs.writeFile(new URL('REPORT.zh-CN.md',ROOT),text.join('\n')+'\n');
console.log('ANALYSIS',samples.length,'clips',scoreRows.length,'frames',JSON.stringify(result.sourceDatasetCounts),JSON.stringify(
  Object.fromEntries(['bell','horn','siren'].map(x=>[x,{default:comparison[x].default01.heldout.recall, new:comparison[x].candidate.heldout.recall,threshold:comparison[x].candidate.threshold}]))));

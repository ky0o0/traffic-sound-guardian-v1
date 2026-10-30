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
          originalRecordingID:source.original_audio_id,
          originalCategory:source.source_category,label:source.label,
          salience:source.salience,durationSeconds:c.duration,
          validFrames:c.result.windows.length,peakScores:peak,
          partition:role(c),sha256:source.sha256};
});
const valid=samples.filter(s=>s.partition==='validation');
const test=samples.filter(s=>s.partition==='test');
const choices=Array.from({length:50},(_,i)=>Number(((i+1)/100).toFixed(2)));

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
  sourceDatasetCounts:Object.fromEntries([...new Set(samples.map(s=>s.dataset))].map(k=>[k,samples.filter(s=>s.dataset===k).length])),
  sourceLabelCounts:Object.fromEntries(["bell","horn","siren","none"].map(k=>[k,samples.filter(s=>s.label===k).length])),
  rawSixClasses:Object.fromEntries(ids.map((k,i)=>[k,NAMES[i]])),
  timeResolution:{windowSeconds:CONFIG.windowSeconds,hopSeconds:CONFIG.hopSeconds,
      windowsOverlap:true,scoreIsNotSoundLevel:true},
  partition:{strategy:"deterministic SHA256 within dataset*source_label strata, grouped by original Freesound ID",
    validationGroupCount:valid.length,finalTestGroupCount:test.length,leakageCheck:"unique exact original recording ID",splitFrozenBeforeScoring:true},
  trainingPolicy:"NO model retraining and NO change to website. No event-onset labels.",
  limitations:["Original primary class labels are weak; absence of other warnings in negative clips not audited.",
    "Mixed real backgrounds not manually confirmed, ESC-50 may be clean foreground recordings.",
    "Specific police/ambulance/fire subtype identity unsupported by these sources.",
    "Scoring per file captures presence anywhere, NOT event onsets, short-bell miss rate or microphone latency.",
    "No validated deployment claims; browser on GitHub runner is not mobile hardware."],
  comparison,recommendation,times,sourceRows:samples,
  fullScoreCSV:"WINDOW_SCORES.csv in CI Artifact; permanent gzip in this research branch",
  fullRawInference:"SCORES.json.gz in research branch / raw-results.json in CI Artifact"
};
await fs.writeFile(new URL('RESULTS.json',ROOT),JSON.stringify(result,null,2)+'\n');
const pct=n=>n==null?'N/A':(100*n).toFixed(1)+'%';
const text=[
"# YAMNet 扩展真实环境录音试验：六类原始分数完整保存",
"",
"**这是实际网站模型推理结果，不是已验证的道路安全识别准确率。公开数据集的主要类别标签尚未逐段人工复核；“无目标”不一定真的没有任何其他警告声音。**",
"",
"## 已实际运行",
"",
"- 不同原始来源录音组："+samples.length+"；总识别窗口："+scoreRows.length+"；每窗口记录六个YAMNet原始分数（即使低于0.01或0.10）。",
"- 使用网站相同的MediaPipe YAMNet TFLite、JS AudioWindowBuffer、resample.js与classifier-worker.js；没有换Python分类器。",
"- 数据集（网站/镜像）："+Object.entries(result.sourceDatasetCounts).map(([k,v])=>k+" "+v+"条").join("，")+"。",
"- 类别主要标签："+Object.entries(result.sourceLabelCounts).map(([k,v])=>k+" "+v+"条").join("，")+"。",
"- UrbanSound8K原始meta中foreground/background salience原样保留，**不把未审核的噪声程度称为事实**。",
"",
"## 为什么不再只用0.10",
"",
"每段每个0.975秒窗口，六类分别保存原始Score。这不是环境分贝，也不是校准过的概率。例如喇叭0.04表示模型对该类别的原始分数0.04。以后对阈值0.01、0.02……0.50可以重新评估，不必重复运行YAMNet。",
"",
"## 基准0.10与验证集建议阈值的对照",
"",
"**阈值只从原始录音分组的70%验证部分选择；另一部分保持未参与调参，专用于本轮最终评估。** 仍然只是未经人工复核的暂定结果。",
"",
"| 有对应源标签的声音 | 建议阈值（探索性） | 验证集默认召回 | 验证集新阈值召回 | 独立测试默认召回 | 独立测试新阈值召回 | 独立测试默认精确率 | 独立测试新精确率 |",
"|---|---:|---:|---:|---:|---:|---:|---:|"
];
for(const [k,label] of [["bell","自行车铃"],["horn","汽车喇叭"],["siren","通用警笛"]]){
  const x=comparison[k];
  text.push("| "+label+" | "+x.candidate.threshold.toFixed(2)+" | "+
    [pct(x.default01.validation.recall),pct(x.candidate.validation.recall),
     pct(x.default01.heldout.recall),pct(x.candidate.heldout.recall),
     pct(x.default01.heldout.precision),pct(x.candidate.heldout.precision)].join(" | ")+" |");
}
const heldoutF1=Object.fromEntries(["bell","horn","siren"].map(k=>[k,{
  defaultF1:comparison[k].default01.heldout.f1,
  selectedF1:comparison[k].candidate.heldout.f1
}]));
const suspectNegatives=samples.filter(s=>s.label==='none' && NAMES.some(n=>s.peakScores[n]>=0.10)).length;
text.push("","## 重要：探索性调参没有在留出测试集上改善整体F1","",
"测试集F1（默认0.10 → 验证集建议阈值）：",
...([["bell","自行车铃"],["horn","汽车喇叭"],["siren","通用警笛"]].map(([k,title])=>
"- "+title+"："+pct(heldoutF1[k].defaultF1)+" → "+pct(heldoutF1[k].selectedF1))),
"**因此没有足够证据建议更改网站默认阈值0.10。** 这些F1并非人工审核过的最终准确率。",
"在"+samples.filter(s=>s.label==='none').length+"段被数据集主标签标为非目标的录音中，有"+suspectNegatives+
"段在默认0.10下至少一个YAMNet类别达到阈值。它们是待人工核查的疑似误报候选，不是已证实的错误报警。",
"");

text.push("","## 警车、救护车、消防车警笛：已运行模型，但不能虚报准确率","",
  "三个独立类别同样逐窗口输出了真实Score，并记录在WINDOW_SCORES.csv / SCORES.json.gz中；但当前ESC-50和UrbanSound8K只标明笼统siren，没有可核实的三种车型细分标签。",
  "因此这三类的单独Precision、Recall和“最佳阈值”必须显示**N/A**；其阈值仍为0.10，不能仅凭泛指警笛的正确率决定删除或调整。",
  "下一批应补入可合法复现且没有数据泄漏的警车、救护车和消防车标注音频。",
"",
"## CI浏览器环境计算开销","",
"- 每次分类调用内平均计算耗时："+times.meanInferenceMs.toFixed(2)+"ms；平均Worker往返："+times.meanWorkerRoundtripMs.toFixed(2)+"ms。",
"- 480ms内完成窗口的比例："+pct(times.under480msRatio)+"。不包括麦克风、浏览器采集、蓝牙或提示音播放延迟。",
"",
"## 保存方式与下一步","",
"- WINDOW_SCORES.csv.gz：每段每个窗口每类真实Score与起止时间；无需重新跑模型即可分析更多阈值。",
"- SCORES.json.gz：原始模型结果与来源 SHA-256 / 录音分组；RESULTS.json：本轮计算指标和每文件六类分数峰值。",
"- 以上都在**独立研究分支**，不会修改正式网站阈值，旧版SH资料继续保留。",
"- 下一阶段必须补充人工核对的起止时间和声音类型，优先选择有真实路噪、风噪、人声、以及远处或短促警告声的录音；然后做事件级回放和设备级延迟测试。",
"",
"## 数据来源",
"",
"- ESC-50（GitHub 原版、Freesound录音；CC BY-NC 3.0）：https://github.com/karolpiczak/ESC-50",
"- UrbanSound8K（Hugging Face镜像，原始数据具有salience元信息；原版CC BY-NC 3.0）：https://huggingface.co/datasets/MahiA/UrbanSound8K",
"- 自行车铃（GitHub镜像，源自Wikimedia Commons，每文件必须核对原始许可）：https://github.com/Jmxxp/Agenda_Otica/tree/main/assets/sounds",
"- 一个额外自行车铃录音（大学教学代码库，原始音频许可未核验，仅做研究）：https://github.com/R6500/Python-bits/tree/master/Colaboratory/Sounds",
"",
"样本具体来源、下载URL、哈希和真实分数以RESULTS.json及实验归档为准。"
);
await fs.writeFile(new URL('REPORT.zh-CN.md',ROOT),text.join('\n')+'\n');
console.log('ANALYSIS',samples.length,'clips',scoreRows.length,'frames',JSON.stringify(result.sourceDatasetCounts),JSON.stringify(
  Object.fromEntries(['bell','horn','siren'].map(x=>[x,{default:comparison[x].default01.heldout.recall, new:comparison[x].candidate.heldout.recall,threshold:comparison[x].candidate.threshold}]))));

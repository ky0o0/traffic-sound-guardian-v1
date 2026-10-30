import fs from 'node:fs/promises';
import {NAMES} from '../../../../ai-test-analysis.js';
import {chooseTarget} from '../../../../detection.js';
const root=new URL('./',import.meta.url);
const r=JSON.parse(await fs.readFile(new URL('.working/raw-results.json',root),'utf8'));
const {rows,manifest}=r;
const ids=['police','ambulance','fire'];
const mapping={
  siren:'Siren',police:'Police car (siren)',
  ambulance:'Ambulance (siren)',fire:'Fire engine, fire truck (siren)'};
const thresholds=Object.fromEntries(NAMES.map(n=>[n,0.10]));
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
    genericSirenThreshold01Reached:peak[mapping.siren]>=0.10,
    actualChosenWindowLabels: x.windows.reduce((acc,w)=>{
      const label=chooseTarget(w.scores,thresholds)?.name??"none";
      acc[label]=(acc[label]??0)+1;
      return acc;
    },{}),
    actualChosenCorrectSubtypeWindowCount:x.windows.filter(w=>chooseTarget(w.scores,thresholds)?.name===mapping[x.label]).length,
    actualAnySubtypeChosenWindowCount:x.windows.filter(w=>["Police car (siren)","Ambulance (siren)","Fire engine, fire truck (siren)"].includes(chooseTarget(w.scores,thresholds)?.name)).length};
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
const fieldSlices=files.filter(x=>x.tier==='REAL_JAPAN_FIELD_WITH_WEAK_VEHICLE_LABEL');
const independentFieldGroups=new Set(fieldSlices.map(x=>x.originalSourceGroup)).size;
const realPolice=independentFieldGroups;
const totalFieldWindows=fieldSlices.reduce((s,x)=>s+x.windows,0);
const fieldChosenCorrectWindows=fieldSlices.reduce((s,x)=>s+x.actualChosenCorrectSubtypeWindowCount,0);
const fieldChosenAnySirenWindows=fieldSlices.reduce((s,x)=>s+Object.entries(x.actualChosenWindowLabels).filter(([k])=>['Siren','Police car (siren)','Ambulance (siren)','Fire engine, fire truck (siren)'].includes(k)).reduce((n,[k,v])=>n+v,0),0);
const result={kind:'Japan-sirens controlled-reference pilot',status:'exploratory_not_real_world_road_recognition',
  sourceFileCount:files.length,groupCounts:groups,
  uniqueFieldRecordingGroups:independentFieldGroups,
  fieldRecordingSlices:fieldSlices.length,
  fieldRecordingWindows:totalFieldWindows,
  fieldChosenAnySirenWindows,
  fieldChosenCorrectSubtypeWindows:fieldChosenCorrectWindows,
  realJapanPoliceRecordedCases:realPolice,
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
'# 东京日本警车实录候选：TSG V1.6 六类别 Score 实测',
'',
'**实际执行了 TSG V1.6 原版 YAMNet。这一轮只有日本东京警车候选录音与警车音效；不是救护车、消防车重新测试，也不是经人工验证的道路现场识别准确率。**',
'',
'- 实际处理音频文件 '+files.length+' 个、窗口 '+result.sampleWindows+' 个，每窗六类原始 Score 全部保存。',
'- **真正的东京街道原始录音只有 '+independentFieldGroups+' 份**：来自 Freesound #34952 / UrbanSound8K 的 '+fieldSlices.length+' 个片段，共 '+totalFieldWindows+' 个分析窗口，全部属于相同 source group，不能计为 '+fieldSlices.length+' 个独立样本。',
'- 源作者声称是远处日本警车警笛，但 Freesound 评论有人提出也可能是消防车。**具体车辆真实性存在争议，尚未人工听辨确认**。',
'- 剩余 '+(files.length-fieldSlices.length)+' 段是两个日本网站的警车音效，是否来自真实实录尚未确认。不是能计入警车真值评价的独立道路现场标注。',
'- 东京来源的 '+totalFieldWindows+' 个窗口中，网站规则实际选择广义警笛类别 '+fieldChosenAnySirenWindows+' 个窗口，具体选择 Police car '+fieldChosenCorrectWindows+' 个窗口。没有人工事件起止时间，不能从这些值推断漏报率。',
'',
'| 来源 / 声音 | 类型 | 正确车型原始分数峰值 | 通用Siren峰值 | 正确车型≥0.10 | UI真正选中正确车型的窗口数 |',
'|---|---|---:|---:|---|---:|',
...files.map(x=>'| '+x.id+' | '+x.tier+' | '+f(x.intendedScore)+' | '+f(x.genericSirenScore)+' | '+(x.intendedThreshold01Reached?'是':'否')+' | '+x.actualChosenCorrectSubtypeWindowCount+' / '+x.windows+' |'),
'',
'## 不应误读',
'',
'- 原始分数不是音量dB、校准概率或经过标注的准确率；特别是不能根据少数录音选出最优阈值。',
'- 高峰值只是该类别在某一窗口的最高分，**不意味着网站一定显示这个车型**。因为正式网站每个窗口会从全部六类里选择分数最高且达标的类别；增加了真实 UI 选中该车型的窗口数统计。',
'- 本次东京候选录音仅能说明：远处真实场景的原始 Score 可能很低；与已有参考音效检测分数差别明显。需要人工时间标注才能分析实际警笛段。',
'- 此次只有 1 份实录源（多片段）及 2 份来源性质未确认的音效。此前日本消防机构和救护车试验结果应查看 research/yamnet/japan/REPORT.zh-CN.md，不能与本轮相加当成独立同类样本。',
'- 不应将这一组特定东京素材用于确认最佳警车阈值，更不能推断东京/日本街道整体性能。',
'- 该分支只做实验，不更改正式网站阈值与SH研究内容。',
'',
'## Source pages',
'- [Freesound #34952 东京远处警车实录原始上传页](https://freesound.org/people/eyecandyuk/sounds/34952/)，CC BY-NC 4.0，具体车辆身份仍需人工核实。',
'- [UrbanSound8K 原始标签和片段镜像](https://huggingface.co/datasets/MahiA/UrbanSound8K)，截取8段共一个来源组。',
'- [エスフェクツ：パトカーのサイレン](https://esffects.net/124.html)，现场录音属性未确认。',
'- [ポケットサウンド：遠くのパトカーのサイレン](https://pocket-se.info/archives/708/)，现场录音属性未确认。',
'',
'具体录音来源、SHA256、声音类别、每个窗口六类 Score 和完整归档均保存在 RESULTS.json、SIX_SCORES.csv 和 GitHub Actions Artifact。'
];
await fs.writeFile(new URL('REPORT.zh-CN.md',root),l.join('\n')+'\n');
console.log('REPORT',files.length,'source clips',result.sampleWindows,'windows',JSON.stringify(groups));

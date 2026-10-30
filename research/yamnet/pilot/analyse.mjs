import fs from 'node:fs/promises';
import {analyse, NAMES, MODEL, CONFIG, timing} from '../../../ai-test-analysis.js';
const root=new URL('./.working/',import.meta.url);
const raw=JSON.parse(await fs.readFile(new URL('raw-results.json',root),'utf8'));
const clips=raw.clips, thresholds=Object.fromEntries(NAMES.map(n=>[n,0.10]));
const clipResults=analyse(clips,thresholds,'clip',true);
const sixResults=analyse(clips,thresholds,'clip',false);
const times=timing(clips);
if(clips.length!==30||raw.provenance.all_files_sha256.length!==30)throw Error('Incomplete 30 files');
if(clips.some(c=>c.result.windows.length===0))throw Error('Missing real inference');
const sweep=[];
for(const t of [0.01,0.05,0.10,0.15,0.20,0.30,0.40,0.50]){
  const trial=Object.fromEntries(NAMES.map(n=>[n,t]));
  const analysis=analyse(clips,trial,'clip',true);
  sweep.push({threshold:t,by_group:analysis.byClass});
}
const output={state:'exploratory-unreviewed-clip-level-only',model:MODEL,
  config:CONFIG,browser:raw.browser,total_files:clips.length,
  unique_source_groups:new Set(clips.map(c=>c.sourceGroup)).size,
  classification_windows:clips.reduce((s,c)=>s+c.result.windows.length,0),
  labels_from_dataset_not_independently_audited:true,
  no_proof_of_no_hidden_targets_in_negative_clips:true,
  no_onset_annotations:true,no_actual_mic_or_headset_latency:true,
  original_audio_noise_levels_not_reviewed:true, original_audio_not_modified:true,
  default_threshold:0.10,group_results:clipResults,six_class_results:sixResults,
  cpu_timing:times, exploratory_same_set_threshold_sweep:sweep,
  provenance:raw.provenance};
await fs.writeFile(new URL('RESULTS.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
const percent=x=>x===null||x===undefined?'N/A':(x*100).toFixed(1)+'%';
const lines=[
 '# YAMNet 第一轮基准试运行（30条真实录音候选集）',
 '',
 '**数据状态：探索性，未完成人工听辨和事件时间标注。以下是按公开数据集已有类别标签计算的暂定结果，不能视为验证过的真实交通识别准确率。**',
 '',
 '## 运行状态',
 '',
 '- 运行实际 TSG V1.6 的 MediaPipe 0.10.21 YAMNet TFLite 模型、classifier-worker、重采样、0.975秒窗口与0.480秒步进；Chromium浏览器离线文件推理。',
 '- 实际完整录音数：'+clips.length+'；独立原始来源组（按元数据去重，尚未复核跨数据集相同来源）：'+output.unique_source_groups+'；实际推理窗口：'+output.classification_windows+'。',
 '- 目标录音来源：ESC-50 原版真实录音及 Wikimedia Commons 自行车铃录音。部分音频可能背景干净，尚未人工确认环境复杂程度。',
 '- 预先固定选择录音，不根据模型输出挑选样本；没有拼接人工交通音、没有合成测试声。',
 '- 采集来源和 SHA-256：见 RESULTS.json / 原始运行JSON的 provenance。',
 '',
 '## 默认阈值 0.10（暂定文件级指标）',
 '',
 '| 目标类别分组 | 真正检出 TP | 错报 FP | 漏报 FN | 真负 TN | Precision | Recall |',
 '|---|---:|---:|---:|---:|---:|---:|'
];
for(const [key,name] of [['bell','自行车铃'],['horn','汽车喇叭'],['sirenGroup','警笛（四类取或）']]){
  const m=clipResults.byClass[key];
  lines.push('| '+name+' | '+[m.tp,m.fp,m.fn,m.tn,percent(m.precision),percent(m.recall)].join(' | ')+' |');
}
lines.push('','**请勿将文件级 Recall 当作事件级召回率**：一段5秒录音里只要一窗达标，即计文件“检出”。短促铃声可能在某一时刻漏报，此处无法体现。');
lines.push('','## 运行时间（本次浏览器/服务器环境）','');
lines.push('| 指标 | 值 |','|---|---:|',
 '| 浏览器Worker内平均推理耗时 | '+(times.inference.mean?.toFixed(2)??'N/A')+' ms |',
 '| 平均Worker往返耗时（包括重采样） | '+(times.roundTrip.mean?.toFixed(2)??'N/A')+' ms |',
 '| 往返耗时≤480ms的窗口比例 | '+percent(times.withinHop)+' |',
 '','这些是本次CI电脑上的运行耗时，不是警告声出现后的真实检测延迟，更不是iPhone + 蓝牙耳机端到端延迟。',
 '','## 阈值探索（相同的30条录音，**不得当作最终测试结果**）','','| 阈值 | 自行车铃召回率 | 喇叭召回率 | 警笛召回率 |','|---|---:|---:|---:|');
for(const r of sweep)lines.push('| '+r.threshold.toFixed(2)+' | '+['bell','horn','sirenGroup'].map(k=>percent(r.by_group[k].recall)).join(' | ')+' |');
lines.push('','## 缺口与下一步','','1. **优先人工听辨**每条录音、确认背景噪声及真实目标声音，并标注目标声的起止时间。ESC-50是一类主标签，不能证明录音内没有其他警告音，尤其负例。','2. 加入更多真实复杂道路现场录音，不能把不同剪辑当作新的独立原始录音。','3. 在人工复核的数据上按来源分组，分开调整阈值的验证集与最终测试集，最后只查看一次测试成绩。','4. 用事件级真值测真实漏报、误报次数和模拟检测延迟；在手机设备上另测端到端提示音延迟。','5. 在第二轮以前**不修改正式网站的默认阈值**。','','## 原始来源和可复现性','','- [ESC-50 官方GitHub](https://github.com/karolpiczak/ESC-50)，CC BY-NC 3.0，Freesound field recordings（详情参阅原始署名文件）。','- [Wikimedia Commons 自行车铃类别](https://commons.wikimedia.org/wiki/Category:Audio_files_of_bicycle_bells)，各录音分别适用源文件页面标注的 Creative Commons 许可。','- 所有30条实际下载地址、文件哈希、人工复核状态和每窗6类原始分数保存在实验归档中；仅报告和结果统计保留在独立研究分支。','- 这是实际跑了模型的基准试运行，不是已经完成的最终验证。','');
await fs.writeFile(new URL('REPORT.zh-CN.md',import.meta.url),lines.join('\n'));
console.log('REPORT_WRITTEN clip_count='+clips.length+' windows='+output.classification_windows,
            'scores='+JSON.stringify(clipResults.byClass));

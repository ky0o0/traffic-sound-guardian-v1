# 阈值研究决定备忘 · 2026-10-31

## 决策状态

这是**研究备忘**，不是已验证的道路安全最佳阈值，也不是本版本正式设置的改动。用户决定**先记下来**，然后优先开发耳机内两声提示音。V1.6.1 六类出厂阈值暂时保持 **0.10**。

| 类别 | 研究性建议 | 正式 V1.6.1 默认值 | 证据与局限 |
|---|---:|---:|---|
| Bicycle bell | 0.05（继续验证） | 0.10 | 100个原始来源，0.05的留出测试集检出30/30，0.10为29/30；样本标签未逐段人工核实 |
| Vehicle horn, car horn, honking | 0.10（暂保留） | 0.10 | 100个原始来源；0.05将留出测试中喇叭检出20/30→21/30，但其他声音上错误触发4→8次；F1下降 |
| Siren | 0.10（交通安全目标下暂保留） | 0.10 | 100个原始来源；0.14相对0.10让留出测试警笛检出26/31→25/31、疑似误报7→4；需对漏报代价与音频标注复核 |
| Police car (siren) | 0.10（仅基准，未优化） | 0.10 | 独立日本警车实录太少；东京1个原始录音被切成8段，不能视为8个独立样本 |
| Ambulance (siren) | 0.10（仅基准，未优化） | 0.10 | 日本救护车参考音样本极少，非经独立人工审计的车型准确率 |
| Fire engine, fire truck (siren) | 0.10（仅基准，未优化） | 0.10 | 日本消防车参考音样本极少，容易与通用 Siren / 警车类别竞争 |

## 复现实验与数据出处

- [420个独立源录音，8,302窗口原始分数以及留出测试结果](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-six-targets-scale-20261030/research/yamnet/scale/RESULTS.json)
- [大样本中文研究报告](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-six-targets-scale-20261030/research/yamnet/scale/REPORT.zh-CN.md)
- [日本警笛参考音结果](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-jp-emergency-types-pilot-20261030/research/yamnet/japan/RESULTS.json)
- [日本东京远处警笛实录候选结果](https://github.com/ky0o0/traffic-sound-guardian-v1/blob/research/yamnet-jp-emergency-types-pilot-20261030/research/yamnet/japan/field/RESULTS.json)

## 为什么暂时不下调

将 Score 阈值降低并不等于安全性一定提高。该研究的声音主标签尚未逐段人工校验，也未验证各类实际警告事件的起止时间、远近距离与混合噪声，不能根据每段录音最高分直接估计实时触发后的误报和漏报。具体车型若没有独立真值标注，单独寻找「最佳阈值」没有依据。

以后优先安排更多不同来源的日本警车、救护车和消防车原始录音、人工事件时间标注、iPhone/耳机上的提醒音真实输出及延迟测试。所有候选阈值仅作为未来实验对照，不自动部署到用户设备。

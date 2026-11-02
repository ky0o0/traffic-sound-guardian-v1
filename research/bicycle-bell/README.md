> 2026-11-02 后续：第二、三轮真实训练已完成，**尚未通过新独立测试，不部署**。见 [完整后续报告](ROUND2-3-REPORT.zh-CN.md)。

# 自行车铃迁移学习实验（独立研究，不部署）

基线固定为网站 V1.6.15：`3a3e96b16bb78fa4d5ed006b44c18701e414fb40`。不修改正式页面、阈值或根目录的 `yamnet.tflite`，不自动合并 PR。

## 执行方式

```sh
python -m pip install -r research/bicycle-bell/requirements.txt
python -m unittest discover -s research/bicycle-bell -p test_experiment.py -v
python research/bicycle-bell/experiment.py --out bell-results --cache /tmp/bell-cache
python research/bicycle-bell/infer.py bell-results /path/to/real-recording.wav
```

本地云环境能安装 TensorFlow CPU，但 Zenodo 和 Hugging Face 被网络策略以 403 拦截。替代方案是在此仓库独立研究分支上，用 GitHub Actions 标准 CPU runner 实际下载和训练；预检已在运行 `41401652277` 成功取得 FSD50K 元数据和真实自行车铃 WAV。工作流只响应指定研究分支的实验代码／协议变更，不部署网站。

`protocol.json` 在训练和测试前固定数据选择、随机种子、模型候选、阈值约束、步长和停止条件。程序保存选择清单后才下载数据；通过组隔离检查后才训练；选择结果落盘后才计算测试集指标。禁止根据测试结果继续调参。

## 数据与独立性

- FSD50K 原始发布：https://zenodo.org/records/4060432 ，论文：https://doi.org/10.1109/TASLP.2021.3133208 。镜像固定到 `Fhrozen/FSD50k` 的 `ccf1acaff12f3f4a4c10052dddafbb6d22152c9b`。
- 只使用逐录音许可为 CC0 或 CC BY 的条目，排除 CC BY-NC、Sampling+ 及无法确认上传者的记录。数据集整体为 CC BY，单段录音以原许可为准。manifest 保留作者、标题、许可、源页面、下载 URL 和 SHA-256；不提交原始录音。
- 正例采用人工 `Bicycle_bell` 标签；负例优先门铃、Chime、Ding、Beep、其他 Bell、音乐和其他环境声。类别不足时如实保留，不生成虚假音频补足。
- 开发集和官方评估集汇总后建立**自定义**分割，不能称为官方 FSD50K benchmark。上传者、字节重复和响度归一后的 PCM 重复关系进行传递合并，再做分层分组的训练／验证／测试隔离。同一上传者全部留在同一分割，切窗在分割后逻辑上继承原组。
- 上传者分组比单文件分组更严格，但仍不能证明跨上传者转录／混音完全不存在。FSD50K 是人工片段级弱标签，未标 Bicycle 不保证实际绝无自行车铃；错误分析需保留此限制。预训练 YAMNet 的上游数据独立性也未认证。

## 模型、比较与指标

- 冻结仓库现有 YAMNet 权重，提取量化网络 `layer28/reduce_mean` 的 1,024 维反量化特征。另存 `yamnet_features.tflite`，仅增加可见输出；先与未修改模型比较分数一致性。
- 训练 3 个正则强度的线性头和 3 个小型 MLP，以录音为 bag 的最大池化多实例学习处理片段弱标签。缩放参数只拟合训练集；最多 160 epoch，每 4 epoch 检查验证集，连续 6 次没有改善停止。
- 验证集上先满足 Precision≥0.90 和 FPR≤0.02，再最大化 Recall。比较 480ms 和 240ms 步长，检查点和阈值都不使用测试集。不可满足时明确标为失败约束，不能宣称可部署。
- 原版比较包括 Bicycle bell 原始分数≥0.10、实际 `chooseTarget` 显示为 Bicycle bell 的规则，以及完整 11 类警告输出。完整警告会正确地对非自行车危险声音报警，因此它作为自行车二分类指标仅供上下文参考，不应误称为所有报警都是误报。
- 两模型共用原生率 0.975 秒窗口、网站等价重采样和实际录音；短于一窗口的录音仅补尾部零，较长录音不补不完整尾窗。没有用合成音频冒充数据。
- 保存 TP/FP/FN/TN、Precision、Recall、F1、FPR、混淆矩阵、每类错误、窗口预测、训练轨迹及 CPU 耗时。没有精确事件起点，文件开始到首次检出的时间不能当成事件响应延迟，也没有测量实际麦克风／耳机延迟。

## 输出

Actions artifact 包含实际执行产生的头模型 `.tflite` / `.keras` / `.npz`、冻结特征模型、协议、manifest、测试指标、混淆矩阵、错误分析、依赖版本和校验和。特征缓存和原录音不打包。模型头依赖所记录的 YAMNet 特征接口，不是可直接覆盖原站 `yamnet.tflite` 的文件。

实际训练及一次锁定测试已完成，详见 [中文实验报告](EXPERIMENT-REPORT.zh-CN.md)。测试集 216 段：原版 Recall 87.80%、Precision 70.59%、F1 78.26%；训练头 Recall 63.41%、Precision 83.87%、F1 72.22%。误报 15→5，漏报 5→15，**综合优化目标未达成，不建议部署**。模型和真实结果已保存在 `results/20261102-v1`；运行 `python research/bicycle-bell/verify_results.py` 可独立核验校验和、数据隔离和 CSV 指标。

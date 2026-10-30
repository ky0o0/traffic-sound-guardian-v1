# SH 第二轮：受控真实音频实验

完整中文报告见 [REPORT.zh-CN.md](REPORT.zh-CN.md)。本目录独立于第一轮结果；不包含网站或分类器集成。

## 固定协议

起点：PR #15 的 `90ccda5ed84b9c5f8d23add5802d9b84e716c698`。模型源码：`07e9786c7a741f0a7c722dcde66a2679ca068c50`；权重哈希沿用 `../extract.py`，严格加载官方 `39.pt`。冻结配置 `config.json`：23 个不同原文件、238 个条件；文件不等于独立录制场次。两段单声道警笛是明确标记的适配诊断，没有伪装成真实立体声或双耳音频。

## 直接复现（不依赖未过期的 Actions 缓存）

Python 3.10.22，CPU 两线程。下载和运行需要能够合法访问源网站与官方权重站点。源站拒绝、限流或哈希改变时停止并记录，不绕过访问限制。

```sh
python -m venv work/sh-r2-venv
work/sh-r2-venv/bin/python -m pip install -r research/semantic_hearing/round2/dependency-lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
git clone https://github.com/vb000/SemanticHearing.git work/SemanticHearing
git -C work/SemanticHearing checkout 07e9786c7a741f0a7c722dcde66a2679ca068c50
work/sh-r2-venv/bin/python -m unittest discover -s research/semantic_hearing -p 'test_*.py' -v
work/sh-r2-venv/bin/python -m unittest discover -s research/semantic_hearing/round2 -p 'test_*.py' -v
work/sh-r2-venv/bin/python -u research/semantic_hearing/round2/experiment.py --semantic-repo work/SemanticHearing --checkpoint work/39.pt --output work/sh-r2-full
work/sh-r2-venv/bin/python research/semantic_hearing/round2/analyze.py work/sh-r2-full --output work/sh-r2-full/analysis
```

每次使用新的输出目录，存在 `results.json` 时拒绝覆盖。`--prepare-only` 只制作输入并进行来源检查，不执行模型；不能算推理完成。`--key-only` 执行 75 个关键条件，不能算 238 条件完整实验；它仍保留完整预定计划和预制输入，另存实际执行列表。IUSB 普通公开 ZIP 支持合法范围读取，逐成员 SHA-256 在读取后严格检查；不要求整包下载。官方权重绝不提交入库。

## 程序与结果

- `probe.py`、`audit_extra.py`、`finalize_sources.py`：已运行的素材发现审计。候选清单保留未纳入、近似单声道和其他不合适的候选，不代表全部用于推理。Commons 返回限流时停止，不自动换方法继续下载。
- `config.json`：全部来源、许可、哈希、声道来源、参考质量、裁剪、增益、随机种子和处理设计。
- `experiment.py`：复用第一轮的混音/SI-SDR 工具，新增受控干预、活跃区间指标、源检查、逐次日志及 WAV/PCM 哈希清单。
- `infer.py`：调用未改动的第一轮 `extract.run()`；只固定种子、线程和明确输入来源，不改变网络及权重。
- `analyze.py`：按源/实验族/参考质量/通道类型组织 CSV、JSON 和图；不把设置比例当识别准确率。
- `verify_and_pack.py`：在新的 Actions 作业下载 full/key 音频 artifacts 后，逐 WAV 验哈希、格式、有限性，重算指标，对比独立输出，并与第一轮 12 个喇叭条件比较；保存原始幅度的试听选择。
- `evidence/full`、`evidence/key`：真实执行结果、环境、实际计划、WAV/PCM 清单、来源检查、CSV、图表；`evidence/verification.json` 是独立核验结果。
- `evidence/listening-selection.zip`：5 个预先指定条件，各含输入、输出、录音参考 FLOAT WAV；不归一化、不削波、不改变幅度，内含来源与许可。

完整运行通过 `.github/workflows/research-sh-round2.yml`，两台新虚拟机分别执行 full/key，再由第三个新作业核对下载回来的 artifacts。冻结原素材缓存来自三次已保存的素材审计，目的是避免对网站反复下载；缓存到期后应使用上面的直接复现命令，不把过期缓存误认为源文件不存在。完整音频 artifact 到期时间以报告和 `artifact_registry.json` 为准；永久保存的来源/哈希不能保证外部站点永久提供原文件。

## 解释边界

无参考背景条件不发布 SI-SDR；没有独立人类标注，不报告误报率或听觉质量分数。所有已知参考均为叠加前的录音成分，可能含固有底噪或其他声源。SI-SDR 必须配合投影增益、重建 SNR 和试听检查；输出变安静不证明提取成功。没有证明原始训练数据独立、真实双耳优越性或任何耳机安全效果。

## 启动边界追加实验

观察主实验位置效应后，另设计并实际完成 42 个探索性对照，见 `followup/boundary.py` 与 `evidence/boundary/`。原五秒混音/增益完全保留；前置静音是 416 采样块的整数倍，配同长度尾部补零、噪声前导和固定输出裁剪。该追加配置不冒充原先冻结的协议。

```sh
work/sh-r2-venv/bin/python -u research/semantic_hearing/round2/followup/boundary.py --baseline work/sh-r2-full --semantic-repo work/SemanticHearing --checkpoint work/39.pt --output work/sh-r2-boundary
```

追加处理保持目标原录音和背景不变，没有训练或参数调整。前置上下文不等于已经实现连续流式耳机处理；详细结果和限制以报告为准。

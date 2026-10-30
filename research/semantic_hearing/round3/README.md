# SH 第三轮：有状态连续处理与实时可行性

已执行结果和限制见 [完整中文报告](REPORT.zh-CN.md)。官方状态API与本项目PCM适配分开说明；没有耳机、手机、蓝牙、网站、YAMNet、PAWS或训练集成。

## 固定起点

- 基于PR #16最新提交 `97e51d7d51ac1128ff097753161fa538f2790b95`，新分支 `research/sh-round3-stateful-20261030`，不改前两轮。
- 官方源码 `07e9786c7a741f0a7c722dcde66a2679ca068c50`；39.pt哈希严格校验，沿用 `../extract.py` 中固定SHA。
- Linux / Python3.10.22；完整依赖沿用 `../round2/dependency-lock.txt`；torch两线程、seed=20261030。
- 仅复用仓库内第二轮两个已提交小型ZIP及其清单；不下载新的原始声音或此前1GB实验包。[来源和许可](ATTRIBUTION.md)。

## 正确性的门槛

`streaming.py` 每步处理416新采样、前后各32个卷积边缘，调用官方 `Net.forward(..., init_enc_buf=..., init_dec_buf=..., init_out_buf=..., pad=False)` 并保存返回值。不是重复处理重叠五秒窗口。输出样本时间坐标与官方整段forward等价，计算可用时间另行记录。

先执行8项结构测试，再用真实39.pt完成小规模等价/状态干预门槛。只有门槛实际通过且实现哈希不变后，Actions才扩展到6段约30秒信号。两条workflows只在对应触发文件改变时运行，防止报告/证据自动提交引起昂贵重复推理。

```sh
python3.10 -m venv work/sh-r3-venv
work/sh-r3-venv/bin/python -m pip install -r research/semantic_hearing/round2/dependency-lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
git clone https://github.com/vb000/SemanticHearing.git work/SemanticHearing
git -C work/SemanticHearing checkout 07e9786c7a741f0a7c722dcde66a2679ca068c50
SH_REPO="$PWD/work/SemanticHearing" work/sh-r3-venv/bin/python -m unittest discover -s research/semantic_hearing/round3 -p 'test_*.py' -v
```

门槛结构测试使用同官方架构的未训练初始化，**不是质量证据**；后续实验严格加载39.pt。

仅当权重文件不可访问时才从官方站点下载。当前Codex环境的受限网络不能访问该站点，所以本次真实权重推理使用Actions；没有绕过限制。Actions首次取得后以哈希命名缓存，之后复用并再次校验。若在另一个允许访问的Linux环境直接复现：

```sh
work/sh-r3-venv/bin/python - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0,'research/semantic_hearing')
from real_audio import fetch_verified
from extract import OFFICIAL_CHECKPOINT_SHA256
fetch_verified('https://semantichearing.cs.washington.edu/39.pt',Path('work/39.pt'),OFFICIAL_CHECKPOINT_SHA256)
PY
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 work/sh-r3-venv/bin/python -u research/semantic_hearing/round3/study.py --mode pilot --semantic-repo work/SemanticHearing --checkpoint work/39.pt --output work/sh-r3-pilot
work/sh-r3-venv/bin/python -c 'import json; assert json.load(open("work/sh-r3-pilot/gate.json"))["passed"]'
```

使用全新输出目录，不能覆盖已有 `results.json`。门槛失败时保留失败日志，停止扩展。官方代码、适配器、输入构造程序、配置和权重不变时才运行完整实验；直接CLI的门槛检查由上面命令完成，workflow另外强制检查哈希。

```sh
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 work/sh-r3-venv/bin/python -u research/semantic_hearing/round3/study.py --mode full --semantic-repo work/SemanticHearing --checkpoint work/39.pt --output work/sh-r3-full
work/sh-r3-venv/bin/python research/semantic_hearing/round3/analyze.py --full work/sh-r3-full --pilot work/sh-r3-pilot --output work/sh-r3-full/analysis
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 work/sh-r3-venv/bin/python research/semantic_hearing/round3/verify.py --full work/sh-r3-full --pilot work/sh-r3-pilot --semantic-repo work/SemanticHearing --checkpoint work/39.pt --output work/sh-r3-evidence --rerun-output work/sh-r3-independent
work/sh-r3-venv/bin/python research/semantic_hearing/round3/analyze.py --evidence work/sh-r3-evidence
```

`verify.py` 还会真实重跑一条30秒关键流，不只是静态检查；本次在独立新worker执行。每次复现耗时取决于CPU。节拍文件回放约7秒有真实等待，用于测软件时钟响应；它不是物理音频I/O。

## 文件与执行单位

- `config.json`、`frozen_inputs.json`：模型/时序/SNR/事件计划、来源关系、模型输出前冻结的PCM哈希。34次事件插入来自3个目标文件；背景2个，总计5个原始录音，独立场次未确认。
- `model_io.py`：严格加载官方模型；只隔离未调用的ITD/ILD评估依赖，保留fail-closed行为，未改神经网络。
- `streaming.py`：FIFO、卷积边缘、三组官方缓存、顺序/EOF、快照恢复和明确重置。研究模式保留trace，不能把它当无限长、总内存有界的成品。
- `study.py`：门槛7个方法运行及4次整段校验；6长输入×3状态策略、6个整段参照、1次真实节拍回放。
- `verify.py`：WAV/PCM哈希、事件指标复算、输入/时间边界和重置前一致性，独立一条carry复跑和参数哈希检查，制作试听ZIP。
- `analyze.py`：逐事件CSV、逐块CSV、资源与延迟统计、图表；`--evidence` 仅重算展示汇总，不执行模型。
- `evidence/pilot`、`evidence/full`、`evidence/independent_replay.json`：实际结果及运行环境。
- `evidence/analysis`：136行长流逐事件指标、57,983行主实验块trace、性能/延迟/内存统计与图。另有3,180块独立重跑日志保存在对应artifact。
- `evidence/listening.zip`：原幅度FLOAT WAV。四个短流对照的输入相同；三组r1_*保留同一原五秒混音。没有单独归一化输出。
- `evidence/artifact_registry.json`：实际归档id、大小、digest和到期时间。核心证据和精选音频永久提交，完整WAV用90天artifact。

运行单位不能混淆：33个质量/性能运行＋4次整段门槛校验，共65,850次39.pt forward，其中绝大多数是416新采样的小块；不等于65,850个独立录音或准确率。32项验证测试中的未训练结构forward不计为提取质量实验。

## 解释限制

当前块和右侧采样会产生有界等待；保持原时间坐标评分不代表输出零延迟。软件文件回放的对应采样计算完成时间不等于警告可听、被识别或已经送达耳机。

本轮观察到的冷启动第一声、主动重置、部分稳态起始音削弱，以及较大进程RSS都需要保留。IUSB参考可能包含其他声音；没有盲听/误报率、真正双耳、标签切换、多类同时出现、长时内存或手机/蓝牙验证。

# 第三轮声音素材归属和处理

本轮未取得新原始音频。使用第二轮已保存的两个归档，ZIP及成员WAV哈希在 `config.json`、`frozen_inputs.json` 与第二轮WAV清单核对；原始来源/格式/作者/许可证仍见 [第二轮来源清单](../round2/config.json)。不同事件或处理不是新独立录音。

| 原录音 | 作者/发布者 | 许可 | 来源 |
|---|---|---|---|
| BigSoundBank 0257 Recent car horn #1 | DenisChardonnet | CC0 1.0 | https://bigsoundbank.com/recent-car-horn-1-s0257.html |
| BigSoundBank 0260 Car horn #4 | DenisChardonnet | CC0 1.0 | https://bigsoundbank.com/car-horn-4-s0260.html |
| BigSoundBank 0124 Rain and Thunder #1 | Joseph SARDIN | CC0 1.0 | https://bigsoundbank.com/rain-and-storm-s0124.html |
| IUSB event/siren01.wav | IUSB语料作者 Jean-Rémy Gloaguen, Mathieu Lagrange, Arnaud Can, Jean-François Petiot | CC BY 4.0（语料库发布许可） | https://zenodo.org/records/1213793 |
| IUSB background/traffic_bg01.wav | 同上 | CC BY 4.0（语料库发布许可） | https://zenodo.org/records/1213793 |

- BigSoundBank许可：https://bigsoundbank.com/licenses.html ；CC0：https://creativecommons.org/publicdomain/zero/1.0/
- IUSB：https://doi.org/10.5281/zenodo.1213793 ；CC BY 4.0：https://creativecommons.org/licenses/by/4.0/
- IUSB原采集场次、每项最初录制链及SH训练文件级重叠未独立完全确认。没有把语料库文件名当作无噪参考或已确认的原始录制场次。

编辑和派生处理包括：从第二轮同步参考截取目标、混音减去参考恢复背景成分（含既有浮点舍入）、警笛两秒前缀及5ms渐变、周期背景拼接、重复放置真实声音、共同增益、官方SH提取和固定采样裁片。IUSB成分的混音和提取输出作为CC BY 4.0派生成果提供；归属、许可和修改说明随项目保留。没有把模型代码或权重的许可改成音频许可。

永久精选 `evidence/listening.zip` 仅含0260与0124的CC0成分，包内另有相应归属和方法说明。完整339.94MB连续实验artifact还包含IUSB派生信号，应同时保存本说明与研究报告。

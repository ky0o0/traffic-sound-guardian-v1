# 日本の緊急車両サイレン：日本向け六类别 Score 試験

**实际执行了 TSG V1.6 的原版 YAMNet；这是日本车辆警笛参考音的探索性结果，不是道路现场分类准确率。**

- 下载成功 11 段，声音窗口 550 个；所有窗口的6类原始 YAMNet Score 已保存。
- 标签来源：日本地方消防机构的警笛示例、日本音效网站的救护车/消防车素材，以及日本警车风格的**合成器参考音**。
- 日本警车真实街道录音数量：0。不把警车模拟音当成现实录音。
- 同一来源的多个效果音变体不是独立样本，不用于证明精确率。

| 来源 / 声音 | 类型 | 正确车型的YAMNet原始分数峰值 | 通用Siren峰值 | 正确车型≥0.10 |
|---|---|---:|---:|---|
| kisarazu_fire_alarm | municipality_demonstration | 0.199 | 0.891 | 是 |
| kisarazu_fire_rescue | municipality_demonstration | 0.332 | 0.668 | 是 |
| kisarazu_ambulance | municipality_demonstration | 0.414 | 0.262 | 是 |
| komori_ambulance_pass | field_effect_provenance_unverified | 0.668 | 0.586 | 是 |
| komori_ambulance_loop | field_effect_provenance_unverified | 0.586 | 0.414 | 是 |
| komori_fire_pass | field_effect_provenance_unverified | 0.586 | 0.969 | 是 |
| komori_fire_start | field_effect_provenance_unverified | 0.332 | 0.969 | 是 |
| komori_fire_engines | field_effect_provenance_unverified | 0.004 | 0.414 | 否 |
| otologic_japan_police_close | japan_style_SYNTH_control_ONLY | 0.668 | 0.980 | 是 |
| otologic_japan_police_close_b | japan_style_SYNTH_control_ONLY | 0.586 | 0.996 | 是 |
| otologic_japan_police_far | japan_style_SYNTH_control_ONLY | 0.332 | 0.992 | 是 |

## 不应误读

- 原始分数不是音量dB、校准概率或经过标注的准确率；特别是不能根据少数录音选出最优阈值。
- 日本消防车在某些任务中使用不带钟的“ウーウー”警笛，容易与日本警车混淆，因此交通安全项目应优先保证“紧急车辆警报”总体检出。
- 以上音频包含官方示范、音效和合成参考，并未全部确认为街头实录。仍需找真实日文场景的警车、救护车、消防车、路噪/远近变化录音与人工事件标注。
- 该分支只做实验，不更改正式网站阈值与SH研究内容。

## Source pages
- 木更津市消防本部 https://www.city.kisarazu.lg.jp/soshiki/shobo/keibo/1/4056.html
- 旭川市消防本部 https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335.html
- 小森平（日本環境効果音） https://taira-komori.net/enviroment01.html
- OtoLogic（日本警车风格为合成器，不是实录） https://otologic.jp/free/se/transportation02.html

具体录音来源 URL、SHA256、声音类别、每个窗口六类Score及完整归档在 RESULTS.json、SIX_SCORES.csv 和 GitHub Actions Artifact。

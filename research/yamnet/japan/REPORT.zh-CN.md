# 日本紧急车辆警笛：YAMNet 三个细分类别试运行

**已经用 TSG V1.6 原版 YAMNet 进行真实推理，但作者标注并非人工审核过的交通现场真值。OtoLogic 警笛为合成音效，不能称为真实道路录音。**

实际分析音频：16段，完整六类窗口分数：901个。

| 来源标注类别 | 完成音频 | 明确合成音效 | 独立原始素材组 | 对应类别达到0.10 | 任意四个警笛标签达到0.10 |
|---|---:|---:|---:|---:|---:|
| police | 3 | 3 | 1 | 3 | 3 |
| ambulance | 5 | 3 | 3 | 2 | 3 |
| fire | 6 | 3 | 4 | 2 | 6 |
| none | 2 | 0 | 2 | 0 | 1 |

这一表只表示来源作者标签对应的**文件级检出**，不是经过独立核查的准确率。特别是警车类别在本次素材中为合成音效。

## 每段录音的六类原始峰值

| 文件 | 性质 | 来源类别 | 通用Siren | Police | Ambulance | Fire |
|---|---|---|---:|---:|---:|---:|
| otologic_ambulance_1 | 合成 | ambulance | 0.148 | 0.043 | 0.016 | 0.000 |
| otologic_ambulance_3 | 合成 | ambulance | 0.008 | 0.004 | 0.000 | 0.000 |
| otologic_ambulance_5 | 合成 | ambulance | 0.043 | 0.020 | 0.016 | 0.000 |
| otologic_fire_01 | 合成 | fire | 0.984 | 0.082 | 0.020 | 0.031 |
| otologic_fire_06 | 合成 | fire | 0.852 | 0.414 | 0.020 | 0.012 |
| otologic_fire_11 | 合成 | fire | 0.980 | 0.262 | 0.043 | 0.031 |
| otologic_police_01 | 合成 | police | 0.980 | 0.668 | 0.059 | 0.082 |
| otologic_police_05 | 合成 | police | 0.992 | 0.332 | 0.031 | 0.016 |
| otologic_police_09 | 合成 | police | 0.984 | 0.332 | 0.031 | 0.031 |
| taira_ambulance_pass | 音效素材 | ambulance | 0.586 | 0.082 | 0.668 | 0.020 |
| taira_ambulance_siren | 音效素材 | ambulance | 0.414 | 0.082 | 0.586 | 0.043 |
| taira_city_traffic | 音效素材 | none | 0.031 | 0.031 | 0.082 | 0.109 |
| taira_daytime_traffic | 音效素材 | none | 0.008 | 0.004 | 0.004 | 0.004 |
| taira_fire_engine_pass | 音效素材 | fire | 0.969 | 0.738 | 0.500 | 0.586 |
| taira_fire_engine_start | 音效素材 | fire | 0.969 | 0.738 | 0.262 | 0.332 |
| taira_fire_engines | 音效素材 | fire | 0.414 | 0.059 | 0.008 | 0.004 |

## 阈值与实验限制

每个0.975秒窗口的完整六类Score已保存到 WINDOW_SCORES.csv.gz；0.01到0.50的逐类检出数保存到RESULTS.json。
一段近处/远处/干声是同一原始音效的不同处理，不能用于夸大独立样本数。
要测真正日本街头的准确率，还需独立采集日本街道真实警车、救护车和消防车录音，并且核对事件起止时间和是否存在背景声。
**此阶段不改变正式网站的六个阈值。**

## 来源

- 日本 Taira Komori：[环境音效和车辆经过录音](https://taira-komori.net/enviroment01.html)，允许教育研究，禁止素材本身再分发。
- 日本 OtoLogic：[警车、救护车、消防车合成音效](https://otologic.jp/free/se/transportation02.html)，作者明确说明使用合成器。

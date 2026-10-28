# Traffic Sound Guardian V1

这是“耳机使用与交通安全”高中个人研究用的静态网站原型。网站界面是日语，使用真实麦克风音频、Google MediaPipe Audio Classifier 和预训练 YAMNet，在浏览器本地执行推理。无需 npm build、后端、API Key、数据库或网站用户账号。

**先解压，上传所有文件，再用 GitHub Pages 的 HTTPS 网址运行。不要上传 ZIP 后期待 GitHub 自动解压，也不要直接在“文件”App 中打开 index.html 测试麦克风。**

此项目不是经过验证的交通安全保护系统。请在安全的室内或静止环境进行研究测试，不要依赖它过马路。0.50 / 0.75 是本项目指定的初始参数，不是安全标准。识别分数不是准确率，也不能直接当作发生概率。[1][3]

## 1. 项目结构

为了便于 iPad Safari 批量上传，文件全部放在同一级目录。所有运行时引用均为相对路径，支持 `https://用户名.github.io/仓库名/`。

| 文件 | 用途 |
| --- | --- |
| `index.html` | 日语主界面、Safari / Safe Area 配置 |
| `style.css` | 监听、红色警告、停止三种主状态 |
| `app.js` | 权限、启动/停止、音频连接、状态机与故障处理 |
| `capture-worklet.js` | AudioWorklet 实时音频采集 |
| `audio-window.js` | 单声道混合、固定大小环形缓冲、重叠窗口 |
| `resample.js` | Worker 内的抗混叠重采样，输出 16 kHz / 15,600 样本 |
| `classifier-worker.js` | 独立 Worker 中加载、执行真实模型 |
| `detection.js` | 六个目标标签、固定阈值、连续判断与 3 秒保持逻辑 |
| `audio_bundle.mjs` | 原版 `@mediapipe/tasks-audio@0.10.21` |
| `audio_wasm_internal.js` / `.wasm` | 同版本 SIMD WASM 引擎 |
| `audio_wasm_nosimd_internal.js` / `.wasm` | 同版本非 SIMD 备用引擎 |
| `yamnet.tflite` | Google 官方版本 1 的 YAMNet 模型，含 521 类标签元数据 |
| `yamnet_class_map.csv` | YAMNet 官方类别表，供核对和测试 |
| `icon.svg`、`apple-touch-icon.png`、`manifest.webmanifest` | 网站与主屏幕图标、独立窗口配置 |
| `test-*.js`、`package.json` | 开发测试；网站运行不依赖 Node.js，也不会加载测试数据 |
| `dependency-lock.json` | 第三方资源版本、来源 URL、大小、SHA-256 |
| `THIRD_PARTY_NOTICES.md`、`APACHE-2.0.txt` | 第三方来源与许可 |
| `TEST_REPORT.md` | 已测试项目、实际结果及真机待验证清单 |
| `README.md` | 本说明 |

模型和两套 WASM 已随项目交付，无需另外下载。整个项目约 16 MiB，最大单个文件约 5.73 MiB，低于 GitHub 网页上传的每个文件 25 MiB 限制。[4] 运行时从你自己的 GitHub Pages 同源加载这些文件，不依赖 CDN CORS，不需要跨源隔离响应头。网络仅用于加载网站/模型资源；音频不上传、不录制到文件、不保存识别历史。

## 2. 用 iPad Safari 上传到 GitHub

网站访问者不需要账号。**部署者需要一个免费 GitHub 账号**，因为文件要放进你的 GitHub 仓库。

1. 在 iPad 下载交付的 `Traffic-Sound-Guardian-V1.zip`，保存到“文件”App。
2. 在“文件”App 点一下 ZIP 解压，进入 `traffic-sound-guardian-v1` 文件夹。
3. 用 Safari 打开 [GitHub](https://github.com/)，登录自己的账号。若按钮布局不完整，在 Safari 的页面菜单选择“请求桌面网站”。
4. 新建仓库，建议名称 `traffic-sound-guardian-v1`，选择 **Public**，勾选添加 README，点击 **Create repository**。GitHub Free 的 Pages 使用公开仓库。[5]
5. 在仓库的 **Code** 页面，点 **Add file → Upload files → choose your files**。[4]
6. 在 iPad 文件选择器进入解压后的文件夹，使用“选择”多选里面的全部文件，然后确认上传。**选择文件夹里面的文件，不要选 ZIP，也不要再套一层目录。** 若系统一次只允许选部分，可分批上传；大小写与扩展名不得改变。
7. 上传完成后，确认列表里有 `index.html`、`app.js`、`yamnet.tflite`、两份 `.wasm`，以及表格中的其他文件。
8. 在提交区域填写如 `Add Traffic Sound Guardian V1`，选择直接提交到 `main`，点击 **Commit changes**。
9. 回到仓库首页，确认能直接看到 `index.html`。如果只看见一个 ZIP 或一个外层文件夹，需重新上传内部文件到仓库根目录。

可把测试和文档文件一起上传。它们不参与网站运行。GitHub 的网页上传入口及限制依据官方文档；iPad 文件选择器的文字可能随 iPadOS 版本变化，**此上传流程未在实体 iPad 上实测**。[4]

## 3. 开启 GitHub Pages

1. 仓库 → **Settings → Pages**。
2. **Build and deployment → Source** 选择 **Deploy from a branch**。
3. **Branch** 选择 **main**，文件夹选择 **/(root)**，点击 **Save**。[6]
4. 等待发布。GitHub 官方说明更新可能需要约 10 分钟。[5]
5. 页面出现站点地址后点 **Visit site**。常见形式为 `https://你的用户名.github.io/traffic-sound-guardian-v1/`。
6. 使用 `https://`；如果 Pages 设置中显示 **Enforce HTTPS**，保持开启。请使用 Pages 站点网址，不是 `github.com/.../blob/.../index.html`。

不需要设置 npm、安装依赖或自己执行构建。GitHub 可能显示一个 Pages 部署工作流，这是其平台发布过程。不要把 package.json 当作要求你在 iPad 运行 Node 的说明。

## 4. 在 iPhone 15 Safari 中运行

1. 保持联网，用 **Safari 直接打开 Pages 的 HTTPS 网址**，竖屏使用。不要放在其他网页的 iframe 或聊天 App 内置浏览器里。
2. 页面会自动尝试加载 AI 模型、申请麦克风并启动 AudioContext。模型加载时显示 `AIモデルを読み込み中...`。
3. 权限弹窗出现时选择“允许”。如果出现 `検知を開始`，点它解锁 Safari 的音频启动限制。
4. `マイクの音を確認中...` 表示还在等待首段真实音频及推理。只有成功完成首次推理后才显示 `周囲の音を検知中...`。
5. 在安静、安全的室内，用另一台设备或真实自行车铃提供声音。播放设备与 iPhone 留出距离，避免过大音量和削波。先分别测试铃、喇叭、警笛，再测试普通人声和环境声。
6. 达到规则时，网页整体变红，显示类别及模型返回的 `識別スコア`。目标分数最后一次达到 0.50 后约 3 秒、且没有新的达标结果，恢复正常监听。
7. 点 `検知を停止`，程序停止所有麦克风轨道、断开音频节点、关闭 AudioContext、终止 Worker。再点 `検知を開始` 可重新加载并监听。

正常 Safari 标签页无法保证隐藏系统地址栏。“全屏红色”指填满网页可用区域；添加到主屏幕以独立窗口打开时，视觉上更接近全屏。没有调用不可靠的强制全屏 API。

程序不支持后台或锁屏监听；离开页面、锁屏或收到音频中断时会停止，并在回来后提示重新开始。保持前台并保持屏幕亮着；如研究要求连续观察，可在系统中暂时调整自动锁定，测试后恢复。电池、温度、Safari 资源回收仍可能影响持续运行，尚未做 iPhone 长时间实测。[7]

如果连接蓝牙耳机，iOS 可能把输入路由到耳机麦克风。网页无法保证强制选中 iPhone 内置麦克风。**需要测 iPhone 15 内置麦克风时，请先断开蓝牙耳机，再启动。** 不要把这一原型描述成已能一边播放音乐一边稳定运行；本版不实现音乐控制，也未验证所有耳机音频路由。

## 5. 允许麦克风权限

- 初次弹窗选择“允许”。
- 如果拒绝过：Safari 地址栏的页面菜单 → 网站设置（Webサイトの設定）→ 麦克风（マイク）→ 允许（許可），然后重新载入或点开始。
- 若系统版本没有相同入口，在“设置 → App → Safari”（旧版可能直接是“设置 → Safari”）中检查麦克风网站权限。优先只允许本项目网站。
- 如果还有屏幕使用时间、学校设备管理或浏览器策略限制，需要由设备管理者解除；网页不能绕过系统限制。
- 系统版本不同，菜单位置可能变化；以 Apple 对网站权限的说明为准。[8]

## 6. 添加到 iPhone 主屏幕

1. Safari 打开已发布的 Pages 网站。
2. 点分享按钮；部分 Safari 布局需要先点页面菜单再点“分享”。
3. 选择“添加到主屏幕 / ホーム画面に追加”。如果显示“作为 Web App 打开 / Open as Web App”，启用它。
4. 确认名称，点“添加”。以后可从主屏幕图标打开。[9]

主屏幕模式的麦克风授权可能与 Safari 标签页分开处理；再次询问时仍需允许。添加图标不等于支持离线、后台或锁屏监听。本版没有 Service Worker，更新后不会有应用自己保留的旧离线缓存。

## 7. 实际音频与判断方式

以下为本项目实现，可直接查看相应源文件。

- `getUserMedia` 请求音频，尽量关闭回声消除、降噪和自动增益；它们是浏览器约束，不能保证所有设备都完全遵循。
- 使用实际 `AudioContext.sampleRate`，不会把 48 kHz 的 PCM 错当成 16 kHz。优先 AudioWorklet；加载失败时退回真实音频的 ScriptProcessor。后者已弃用，作为兼容备用路径，不代表在所有 Safari 版本都已验证。[10]
- 原始窗口长度约 **0.975 秒**，每 **0.480 秒**移动一次。Worker 用 96 抽头、1024 相位的 Blackman 窗 sinc 低通重采样为 **16 kHz 单声道 Float32、恰好 15,600 样本**，然后显式调用 `classify(audio, 16000)`。模型的输入规格来自官方资料。[2][3]
- 不做自动音量归一化，不把很小的声音人为放大成危险信号。
- Worker 加载原版 ESM 包。Worker 本身为 classic 类型，以兼容此版本 MediaPipe 使用的 `importScripts()` WASM 加载方式。
- 模型返回全部 **521 个类别**（`maxResults: -1, scoreThreshold: 0`），扫描全部类别，再从下表六类中取最高的原始分数。没有读取第一名就结束，也没有把总分相加。[1]
- 单次推理在途时最多保留一个最新待处理窗口，不无限积压；如果丢了窗口，会打断连续计数。推理/采集长时间停滞时退出监听，避免把旧结果当成现场声音。
- 两次连续检测指**两个相邻分析窗口**，不是两个独立声音事件。窗口互相重叠，因此同一声音可出现在两次判断中；研究报告应写明这一点。
- 首次推理至少需要收集约 0.975 秒音频，另外还有模型加载和运算时间。分数“立即触发”是指结果达到阈值后立即显示，不是对声音零延迟响应。

| YAMNet 英文原标签 | 官方索引 | 日语显示 |
| --- | ---: | --- |
| Bicycle bell | 198 | 自転車のベル |
| Vehicle horn, car horn, honking | 302 | 車のクラクション |
| Siren | 390 | サイレン |
| Police car (siren) | 317 | サイレン（パトカー） |
| Ambulance (siren) | 318 | サイレン（救急車） |
| Fire engine, fire truck (siren) | 319 | サイレン（消防車） |

来源：随包官方 `yamnet_class_map.csv`，并已与模型内部 `yamnet_label_list.txt` 逐项核对。[11] 不把 `Car`、`Bicycle`、`Traffic noise`、一般 `Bell` 或 `Civil defense siren` 加入警告集合。通用 `Siren` 本身仍可能覆盖非交通警报，YAMNet 不能仅凭声音可靠判断真实交通危险。

| 当前目标最高原始分数 | 非警告状态下的行为 |
| --- | --- |
| ≥ 0.75 | 本次立即触发 |
| ≥ 0.50 且 < 0.75 | 连续第二次触发，前后类别可以不同 |
| < 0.50 或没有目标 | 不触发，连续次数归零 |

红屏后任何目标分数 ≥ 0.50 都维持红屏并更新类别/分数；以最近一次达标结果为起点延长 3 秒。保持期间没有新的达标声音时，仍显示最后一次达标的类别与分数，不捏造一个“当前”分数。若同期多个类别达标，显示该次最高者。

界面分数四舍五入到两位小数，判定使用未四舍五入的原始值。例如原始 0.7499 不会按 0.75 单次触发。阈值没有在真实交通数据上校准，不能据此报告“准确率 75%”。[3]

## 8. 常见错误

| 现象 | 检查和解决 |
| --- | --- |
| 看见源代码或下载提示 | 打开的不是 Pages 地址；用 Settings → Pages → Visit site |
| 提示需要 HTTPS | 用 HTTPS Pages 网站，不用 file://、普通 HTTP 或本地文件预览 |
| 一直显示 AI 模型加载 | 检查网络；首次需加载模型和一套 WASM。60 秒未完成会退出，可重新开始 |
| 提示 AI 模型无法加载 / Worker 错误 | 确认 `.mjs`、两个 `.js` 引擎、两个 `.wasm`、`yamnet.tflite`、所有自编 JS 都在同一级目录；不能只上传 HTML/CSS/JS 主文件 |
| 404、样式丢失、按钮不工作 | 根目录应直接有 index.html，路径区分大小写；等待 Pages 发布完成后重新载入 |
| 拒绝麦克风 | 按第 5 节允许本网站权限，再重新开始 |
| 模型已加载但要求再点开始 | Safari 自动音频启动被限制；点 `検知を開始`，不代表已经在监听 |
| 提示麦克风不可用 | 结束通话/其他录音应用，确认音频输入设备，重开 Safari |
| 放到后台后停止 | 这是设计行为；回到前台后手动重新开始 |
| 声音明显但没红屏 | 模型可能分错或分数未达固定门槛。检查距离、音量、背景噪声、蓝牙输入路由，不要把“未报警”解释为安全 |
| 误报为警笛 | 模型可能混淆相似音色；记录为研究局限，勿当成安全保证 |
| 红屏消失比实际声音结束晚 | 本来就是“最后一次达标识别结果后 3 秒”，还包含音频窗口和推理延迟 |
| 刚红屏又变停止 | 采集、音频上下文或推理中断；程序选择显示真实停止状态而不是继续显示运行 |
| 更新后仍旧版本 | 等待发布，关闭后重开页面或刷新；本项目未安装 Service Worker |

## 9. 测试与验证范围

具体已执行结果见 `TEST_REPORT.md`。没有访问实体 iPhone 15，**不能宣称已完成 iPhone Safari 实测、GitHub Pages 线上验收或长期稳定性验证**。开发环境中的单元测试、浏览器真实 WASM 推理，与实际手机麦克风端到端测试是不同层级的证据。

开发者如有电脑，可进入本目录执行 `node --test test-*.js` 或 `npm test`；不需要 npm install。这只是复查测试，不是部署步骤，iPad 用户无需执行。测试文件包含明确标注的假设备/分数夹具，只用于状态机断言；生产入口 `index.html` 不加载这些文件，不提供模拟检测开关。

## 10. 来源

资料核对日期：2026-10-28。源文件实现与 `TEST_REPORT.md` 是本项目行为和测试结论的直接依据。

1. [Google MediaPipe：Web Audio Classifier 指南](https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier/web_js) — API、完整分类结果、Worker 建议。
2. [Google MediaPipe：模型与输入规格](https://developers.google.com/edge/mediapipe/solutions/audio/audio_classifier) — YAMNet `1 × 15600`。
3. [TensorFlow 官方源码文档：YAMNet classification](https://android.googlesource.com/platform/external/tensorflow/+/main/tensorflow/lite/g3doc/examples/audio_classification/overview.md) — 16 kHz、0.975 秒、521 类、分数未校准等局限。
4. [GitHub：上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) — 上传入口、25 MiB/文件、100 文件/批。
5. [GitHub：创建 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) — 免费公开仓库、入口文件、发布时间。
6. [GitHub：设置 Pages 发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — 分支和根目录发布。
7. [MDN：AudioContext state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) — Safari 音频中断及状态。
8. [Apple：Safari 网站权限](https://support.apple.com/guide/iphone/browse-the-web-privately-iphb01fc3c85/ios) — 麦克风与网站设置。
9. [Apple：添加网站到主屏幕](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)。
10. [MDN：AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) / [ScriptProcessorNode](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode)。
11. [TensorFlow：YAMNet 官方完整类别表](https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/yamnet_class_map.csv)。
12. [Google MediaPipe 官方 JS 示例 Worker](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/audio-classifier.worker.ts)。

依赖下载的精确 URL 和哈希另见 `dependency-lock.json`。

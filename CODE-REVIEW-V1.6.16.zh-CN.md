# V1.6.16 全面代码审查与修复报告

2026-11-03。结论：**代码候选已完成本次审查、实际修复和自动化验证；实体 Safari／iPhone／iPad／AirPods 验收前不建议直接发布。** 没有发现已确认的 Critical 隐私问题。下列已确认、可低风险修复的问题均已处理；没有把未验证的设备假设算成已修复缺陷，也不保证穷尽全部潜在 Bug。

## 1. 实际基线、范围与边界

- main：`3a3e96b16bb78fa4d5ed006b44c18701e414fb40`，V1.6.15。
- 起点：[PR #48](https://github.com/ky0o0/traffic-sound-guardian-v1/pull/48)，未合并草稿，`695d3985fb8fb3f1779af7ad3ff0fadf21d45c3d`，V1.6.16；原测试 **201/201 通过**，见 [日志](audit/20261103/node-baseline.log)。继承其脚本闭合与试听完成事件修复，不重复丢弃既有成果。
- 本次在 `fix/v1616-comprehensive-audit` 独立分支完成；新 PR 链接在本报告末尾。未修改 main、未部署／合并，未合并 PR #47、未加入研究模型。
- 审查两个入口、`style.css` / `theme.css` / `v1.6.css` / `ipad-test.css`，共用 `app.js`、`audio-window.js`、`capture-worklet.js`、`classifier-worker.js`、`resample.js`、`detection.js`、`debug.js`、`mic-source.js`、`alert-tone-preview.js`、`live-timeline.js`、`theme.js`。检查可达的 `microphone-test.*`、`microphone-test-core.js`、`ai-test.*`、`ai-test-runner.js`、`ai-test-analysis.js`、`ai-test-i18n.js`、`annotation-editor.js` 的生命周期、文件限制、输出及安全路径，以及现有测试、CI、版本脚本、manifest、依赖锁和许可文档。
- 第三方压缩库／WASM 不作逐行安全认证，核对 8 项锁定资产的字节数及 SHA-256。保留 MediaPipe 0.10.21、原始 YAMNet、类别表及 Apache 2.0 许可。
- 没有训练、调整阈值、替换模型、减少窗口、减少分析频率、增加丢帧或改变六类优先于五类铃声的选择策略。窗口／步长仍为 0.975 秒／480ms；修正的是 Worklet 的窗口结束时间戳。

## 2. 问题、原因、证据与修复

行号指本次候选源码；测试名可用 `node --test --test-name-pattern=...` 单独复现。旧代码失败证据见 [Worker 回归复现](audit/20261103/worker-faults-before.log) 和 [标注取消复现](audit/20261103/annotation-abort-before.log)。故障注入证明异常路径行为，**不代表某个实体 Safari 已发生同样故障**。

| ID／等级 | 文件与位置 | 原因、复现及影响 | 修复与验证 |
|---|---|---|---|
| H01 High | `app.js:782` sendFrame | Worker `postMessage(classify)` 抛异常时逃出采集回调，flight 残留、音频继续运行直到监控超时。旧回归直接抛 DataCloneError | 捕获异常并走 fail/stop；Node 回归及两页真实浏览器发送失败注入验证轨道、Worker、Context 释放 |
| H02 High | `app.js:1022` startup | init 发送失败发生在 await Promise.all 前；stop 拒绝 ready，但 ready 尚无拒绝处理器，产生未处理 AbortError | ready 创建后立即附加拒绝处理；旧测试为 unhandled rejection，新 Node／浏览器均停止且无 pageerror |
| H03 High | `app.js:1023` Worker 事件 | 未监听 `messageerror`，反序列化失败不能立即停止。真实浏览器还揭示把 `onmessageerror` 当普通属性设置并未可靠注册监听 | 使用标准 addEventListener；两页浏览器派发 messageerror 验证立即清理，非仅模拟对象通过 |
| M01 Medium | `capture-worklet.js:9,15` | currentTime 是 render quantum 起点，窗终点可能在块内。原时间戳提前不到一块，影响图表标红和采集龄计算，非 YAMNet 分类错误 | 按 endSample 与块首样本精确偏移；16k／44.1k／48k／96kHz 回归，样本、窗口及步长不变。16kHz 最多原偏移约8ms，不宣称设备端延迟改善 |
| M02 Medium | `ipad-test.css` 试听区规则前 | 使用 JS 风格 `//` 注释，浏览器将其和下一选择器视为无效规则，试听容器 flex 布局失效 | 改成 CSS 注释；干净 PR48 浏览器 computed display=block，候选=flex，布局矩阵通过 |
| M03 Medium | `app.js:624` drawWaveform | 两页旧 waveform 都被 CSS 隐藏，仍每秒约30次计算2048点并绘制 | 不可见时直接返回；只跳过隐藏绘图，RMS、可见时间轴、输入与推理不变；真实 A/B 测量见下节 |
| M04 Medium | `app.js` EN/ZH 字典 | 五种额外铃声用日文 label，而字典仅含六类主要警告；英／中文红屏会混入日文 | 补齐 Bell／Chime／Ding／Ping／Doorbell 翻译；两语言各完整五类、阈值恰好0.10的真实控制器回归 |
| M05 Medium | `alert-tone-preview.js:15,73` | 切换语言不更新已显示的播放状态；缺失独立状态源。完成回调也应核对音频时钟 | 保存状态索引，语言变化重译，最终事件需 running 且时钟走过第二声；单元回归及真实浏览器音频时钟测试，保留两声模式 |
| M06 Medium | 两页 message／heading，`app.js:529,277` | aria-live atomic 包含不断变动的 score；同值标题和麦克风 output 每次都重写，产生过度播报的 DOM 触发条件 | live 区缩至标题，同值不写入；分数仍实时更新；回归证明三次警告分数更新只写一次相同标题。VoiceOver 实际播报尚未验证 |
| M07 Medium | `style.css` / `ipad-test.css` range | 滑杆输入区域仅29px／36px，触控目标过小 | 两页44px，保留数值范围、步进和保存规则；浏览器核验六滑杆高度及键盘边界／重置，窄屏与三栏均可滚动 |
| M08 Medium | `microphone-test.js:284,301,179` | 独立诊断页 Context 暂停后 meter 停画，但界面和轨道仍保持“正在接收”；resume resolve 不代表 running | 检查实际状态并在中断后关闭，清理监听；2项回归和真实 Chromium suspend 测试验证停止／释放 |
| M09 Medium | `annotation-editor.js:15,25,37`；`ai-test.js:421,832,889` | 标注工具在 await 读文件／解码时尚未返回 close，切页／另开编辑器无法释放这个尚未登记的 Context | 提前登记 AbortSignal，切换／重绘／pagehide abort，旧异步完成不能登记为当前编辑器；取消 RAF；原代码回归中 Context 仍 suspended，候选和浏览器取消期间均 closed |
| L01 Low | `app.js:878` Worklet 旧回调 | 旧消息在 receiveFrame 的会话检查前先 ack 端口。端口操作异常可逃出回调；浏览器关闭端口也可能仅静默忽略 | ack 前检查当前会话，捕获异常；故障注入回归通过。这是防御性修复，不宣称已观察到 Safari 原生 closed-port 异常 |
| L02 Low | `app.js:1094` 设置面板 | 原生 details 没有实现 Escape 关闭／焦点返回与外部点击关闭 | 保留非模态 details，新增关闭交互，不锁焦点；Node 与两页真实键盘测试 |
| L03 Low | `live-timeline.js` / 两页标签 | 时间轴 Now、部分 iPad 导航／区域辅助名称及试听区域名称语言混用；停止时仍显示 LIVE | 本地化轴、区域／导航／播放状态；停止状态单独标明；三语言、深浅色、主题／语言重绘测试 |
| L04 Low | `app.js:857` | receiveResult 调用 render 后再次 renderDebug，警告期间同一次推理重复构建表格 | 每次推理只刷新一次；计数回归覆盖普通结果、首次和持续警告，不宣称完整页面快一倍 |
| L06 Low | `ai-test.html` / `ai-test.js` / `microphone-test.html` | 诊断／离线工具标题仍显示1.6.0，与入口候选1.6.16不一致 | 同步用户可见版本，扩展原版本一致性测试到四个页面；资源缓存键仍独立 |
| L05 Low | 两页 mic-source-evidence / `app.js:277` | 只展示设备名，没有关联“浏览器报告并非物理麦克风证明”的现有说明 | 添加本地化 title 与 aria-describedby 说明；不猜蓝牙路由、不修改设备；三语言回归与浏览器检查 |

没有删除核心功能、UI 输入或整个警告类别；没有为修复视觉问题引入新的识别策略。

## 3. 采集、推理、警告与资源检查

- getUserMedia 与 resume 在用户手势中发起；拒绝后可重试，取消／背景先使 session 失效。迟到授权所得轨道立即 stop。浏览器额外验证旧授权在新会话启动后返回，旧轨道结束，新轨道保持 live。
- AudioContext 源采样率传入窗口与 Worker。ring 固定大小，main 只持有一个 flight 和一个最新 pending，Worklet 有 ack 门禁。保留原忙时替换最新 pending 的设计，未增加丢帧。停止释放轨道、节点、端口、Worker、Context、RAF、watchdog 与警告定时器。
- Worker ready、init/error、messageerror、发送错误、推理超时、旧／乱序 sequence 由会话与 flight 检查及监控处理。真实 Chromium 阻断模型文件会停止并释放；阻断 Worklet 会运行 ScriptProcessor 后备并得到真实521类；故意不给推理结果会被原8秒首帧监控停止。
- `resample.js` 及 `audio-window.js` 未改动；仍用96 tap／1024相位低通转换到15600点、16kHz；原重采样测试通过。没有给原44.1／48kHz数据错误标记16kHz，没有新增归一化。Web Audio 的实际设备采样率／蓝牙路由仍需实机核查。
- 警告11类标签与官方521类表逐项校验；六滑杆独立，五铃声固定0.10；0.01–0.50校验、默认0.10和本地偏好恢复测试通过；六主要类优先于五通用铃声是现有设计，保留。
- 单次符合条件结果即可红屏；最后阳性后1秒到期，低分不会延期。仅 inactive→active 播两声；静音立即停止已排程音符；播放异常不取消视觉警告；stop／pagehide 清理输出。
- 当前识别名称保留原2秒普通结果显示节奏，警告立即优先；显示稳定节奏不是增加模型推理延迟。十秒图是 RMS 包络和阳性分析窗口，不是音频录音、精确事件边界或准确率证明。
- 这里修的是程序异常／时间戳／显示问题；没有足够新证据评估 YAMNet 自身误分类、真实漏报率或误报率，未把这些故障注入结果写成识别能力提升。

## 4. 性能证据与限制

在干净 PR48 worktree 和候选分别用同一 Chromium 虚拟麦克风、真实 YAMNet，等待2次推理后测3秒。见 [完整记录](audit/20261103/browser-stability.json)。

| 页面／版本 | 隐藏旧 Canvas moveTo/lineTo 调用 | 同期真实推理结果 |
|---|---:|---:|
| index.html / baseline | 184320 | 6 |
| ipad-test.html / baseline | 186368 | 6 |
| index.html / candidate | 0 | 6 |
| ipad-test.html / candidate | 0 | 6 |

这证明消除了隐藏绘图工作；不能从3秒样本推导整机 CPU、耗电、温度、推理 P95 或电池寿命的改善。另有回归证明单次推理 Debug render 次数从重复调用变为1。十秒 levels≤720、marks≤80，持续密集事件流的时域淘汰及 reset 通过；没有把这种模拟边界检查称作数小时真实内存泄漏剖析。

## 5. 界面、兼容性、语言与安全

真实 Chromium 对两个入口分别覆盖 1194×834、1024×768、1366×1024、820×500、390×844、320×568、834×1194、507×768；日英简中、深浅色共96组合。检查布局不横向溢出，设置可达，三栏不重叠，滑杆／重置可用；再测5种 Canvas 高度、idle 重绘／系统主题和6次真实模型启停，共114项。截图是测试视口，不是实体 iPad／iPhone 截图。安全区域 CSS 保留 env(safe-area-inset-*)，动态高度和短屏回退未被重写。

- 全部11个警告标签和主要交互、错误、设置文本有三语言支持；额外521类 Debug 的中文仍对未收录名称显示官方英文标签，这是现有回退而非新的准确翻译承诺。已记录该剩余本地化范围，未匆忙机器翻译全部专业声音标签。
- 检查原生控件 label／for、键盘和焦点、减少动画规则；live score 不再触发整个 atomic 信息区。代表性静态颜色对比：白色／#c7263a 为5.58:1，#52677d／白色5.84:1；不是全页面所有状态的正式 WCAG 认证。VoiceOver、系统文本缩放和真实刘海 inset 需实机验收。
- 运行时标签／设备名／文件名通过 textContent 或白名单属性，不发现业务代码 innerHTML/eval 注入；反馈 URL 限定 HTTPS Google Forms，外链 noopener/noreferrer 保留。离线 CSV 已有公式前缀转义。
- 当前数据流没有录音、上传、遥测或数据库；音频只通过本地 Worker transferable 推理。新浏览器记录490个页面请求，全部本机子路径 GET、无远程请求／POST；这是所测路径证据，不是第三方库的形式化安全证明。主动点击外链会导航到用户指定 Google Forms，不附带麦克风音频。
- localStorage 只保留主题、提示音开关和阈值；sessionStorage 为语言。音频／模型结果不持久化；离线研究导出是用户手动下载。未增加私人凭据、第三方依赖运行时请求或追踪。
- 真正 Safari/WebKit、实体设备、AirPods、系统来电／Siri／锁屏、实际输出路由及长时能耗均**尚未验证**。WebKit 浏览器未安装，没有把 Chromium Safari UA／iPad viewport 冒充 Safari。现有 manifest portrait 约束在 iPad 主屏幕模式的行为也尚未验证，不在缺少设备证据时擅改方向策略。

## 6. 实际验证、失败记录与发布管理

- Node 基线201项；候选225项，新增24项；**225通过／0失败／0跳过**，见 [完整日志](audit/20261103/node-final.log)。既有测试只为真实缓存键、完整 DOM 和语言变化更新断言，没有删除失败断言或降低阈值。
- 真实 Chromium `154.0.8037.57`、Python Playwright `1.62.0`、Linux，详见 [环境](audit/20261103/environment.json)。[布局114通过](audit/20261103/browser-layout.json)；[稳定性24通过](audit/20261103/browser-stability.json)，其中2项为旧版本对照，其余为候选。无未处理 pageerror；虚拟输入非准确率数据，headless 声音不证明人耳实际听到。
- 修复前4项 Worker 回归失败、标注取消回归失败均保存；开发中真实浏览器发现 onmessageerror 属性监听无效，已改 addEventListener 并通过真实事件验证。新增断言首次暴露的缓存／模拟器缺失随后修正，最终没有遗留已知的新回归。
- 全部顶层 JS 和 scripts/*.mjs 的 node --check、git diff --check、版本门禁、依赖／标签／入口完整性脚本通过。保护资产哈希见 [记录](audit/20261103/protected-assets.json)：模型、Worker、检测规则、重采样、窗口算法和原 debug 标签文件字节均与起点一致。
- GitHub CI 扩展为单元＋真实浏览器两任务，保留版本门禁，增加 SHA 核查与浏览器证据 artifact。失败不自动合并／发布。候选保持1.6.16，因为相对 main 只允许一次递增；已变资源更新独立缓存键，未变资源保留原键。

复现（仓库目录）:

```sh
npm test
node scripts/check-site-integrity.mjs
node scripts/check-release-version.mjs 3a3e96b16bb78fa4d5ed006b44c18701e414fb40
python -m http.server 8000 --bind 127.0.0.1 --directory /workspace
python tests/ui-canvas-browser.py --base-url http://127.0.0.1:8000/traffic-sound-guardian-v1/ --output /tmp/layout-evidence
python tests/stability-browser.py --base-url http://127.0.0.1:8000/traffic-sound-guardian-v1/ --output /tmp/stability-evidence
```

最后两个命令需要 Playwright 和 Chromium；安装依赖详见 CI。若需要原版本性能对照，另建立 PR48 的695d398 worktree 并传 --baseline-url，输出会多2项旧版本对照。不能在没有运行浏览器或跳过实机时声称完成其验收。

## 7. 剩余事项及合并建议

当前没有已确认而未处理的代码级 Critical/High 问题；主要剩余风险是未经验证的实体 Safari/Web Audio／蓝牙／无障碍行为、模型识别性能和长时设备资源表现。原模型自身漏报／误报不是这次稳定性修复能够解决的事项。未做架构性更换或未经独立数据验证的优化。

建议：先审查本 PR 并执行 [实体设备验收清单](DEVICE-ACCEPTANCE-V1.6.16.zh-CN.md) 的核心采集、试听、红屏、打断、后台、连续启停和资源释放项；通过后再由维护者决定合并及发布。**本次没有自动合并或部署。** 原 PR48 的修复已包含于此分支，应避免分别重复发布两个1.6.16候选；PR47研究仍独立。


最终审查 PR：[**#49**](https://github.com/ky0o0/traffic-sound-guardian-v1/pull/49)，源提交 `6f3792b42c53db00dd9f038f2622b2eac6ea34f0`。保持草稿，由维护者按实体设备清单决定发布。

公开 Pages 域名在本执行环境的直接请求被网络代理403拒绝，因此没有把线上端点可用性列为本次通过项；这不是网站故障证据。本次浏览器服务使用同样的 `/traffic-sound-guardian-v1/` 子路径，候选未部署。


GitHub 独立 runner [41564229663](https://github.com/ky0o0/traffic-sound-guardian-v1/actions/runs/41564229663) 两任务全部成功：Node225／225、版本门禁、8资产校验通过；Chromium **156.0.8078.0** 的114项布局和22项候选稳定性通过，0 pageerror、448次请求全为本机GET。CI不运行本地额外2项旧版本对照。可下载该 run 的 `browser-evidence` artifact（ID13197423867），摘要已永久保存 [github-ci.json](audit/20261103/github-ci.json)。最后跟进提交还同步了离线工具／诊断页的1.6.16版本标记并补充报告，未更改声音处理算法；最新检查以 PR #49 Checks 为准。

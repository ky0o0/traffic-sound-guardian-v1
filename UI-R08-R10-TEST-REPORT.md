# R08 / R09 / R10 UI 修复验证

日期：2026-10-31（Asia/Tokyo）。基线：`c50acf089878c4f3eceab9d850d05bee32a345e1`。
范围仅为声纹坐标、空闲重绘、iPad 恢复默认按钮和设置弹层边界。不是重新设计或模型准确率评估。

## 根因与修复

- **R08**：波形最大振幅和底部时间文字占用了同一区域。预留 20 CSS px 的时间文字区，波形在其余区域上下对称并使用 Canvas clip；保留 `tanh(rms^0.65 × 11.5)`、蓝／红颜色、十秒窗口和警告时间标记。半振幅上限仍不超过原来的 `0.45 × 高度`，仅在必要时缩至可用空间，没有 Y 轴或整块警告背景。
- **R09**：仅音频事件重绘，空闲时缺少尺寸和主题入口。复用有效主题 `data-theme`，用一个 MutationObserver 和一个 ResizeObserver 配合窗口事件，经单次 requestAnimationFrame 合并绘制；pagehide 取消待绘制帧并阻止迟到通知，pageshow 恢复。没有持续动画循环或新音频会话，无需修改 `theme.js`。
- **R10**：右栏 footer 的说明文字挤压 flex 按钮；手机弹层按视口计算宽度，却锚定在左右各留白 26px 的内容区。按钮独占一行，弹层扣除内容留白和安全区域；三栏 grid、DOM、控件和其余视觉规则不变。

缓存：两页加载 `live-timeline.js?v=1.6.17`、`v1.6.css?v=1.6.14`；iPad 加载 `ipad-test.css?v=6`。应用版本维持 1.6.13，音频与模型脚本版本不变。

## 自动化

环境：Debian 13 x86_64；Node 24.19.0；npm 11.9.0；Python Playwright；Chromium 154.0.8037.57。

- `npm test`：**189 通过、0 失败、0 跳过**。在原 179 项基础上新增 10 项；旧测试只适配绘图区、Canvas clip API 和相关资源版本断言。
- 新的 `test-timeline-ui-fixes.js` 覆盖 65/84/104/150/260px 高度、静音／低／高 RMS、上下对称、文字隔离、仅对应警告样本变红、原始 RMS 不变、十秒过期、尺寸与主题合并重绘、停止／pagehide／pageshow、迟到回调、ResizeObserver 缺失回退和资源引用。
- 全部根目录 JS/MJS 的 `node --check`、Python 浏览器测试脚本编译、`git diff --check` 通过。
- 两个 HTML 的相对资源引用由新增 Node 测试检查存在性。

## 浏览器与前后截图

运行：

```sh
python -m http.server 8000
python tests/ui-canvas-browser.py --base-url http://127.0.0.1:8000/ --output ../ui-evidence
```

该脚本需要 Python Playwright 和浏览器；自动使用系统 Chromium（如存在），否则使用 Playwright Chromium。已安装 WebKit 时可传 `--engine webkit --skip-live`。输出目录保存截图和逐项 JSON，禁止把截图当成识别准确率数据。

**114 项浏览器检查通过、0 失败，无页面异常或 ResizeObserver 循环错误：**

- 96 项布局组合：正式／iPad 两页 × 八视口 × 日／英／简中 × 浅／深主题。
- 八视口：1194×834、1024×768、1366×1024、820×500、390×844、320×568、834×1194、507×768。
- 10 项真实 Canvas 高度检查：两页 × 五高度；检查实际文字测量、绘图区、上下对称与红蓝色。
- 2 项空闲布局／系统主题检查：旋转尺寸、跟随系统浅深切换、iPad Debug 布局变化，停止后绘制计数稳定，麦克风／Context／Worker 数量仍为零。
- 6 项真实模型启停检查：每页三次，Worker 每次实际返回 521 类；检测中主题与尺寸变化不增加 Worker，停止后音轨 ended、Context closed、Worker terminated，结果和绘制计数不继续增长。
- 每个布局组合实际操作六个滑杆和恢复默认，并检查语言、主题、通知音及版本链接位于可见弹层内且未被遮挡。页面无新增横向滚动；横屏保留左／中／右三栏。

基线保存了 16 张截图；修复后保存了 32 张截图，使用相同声纹绘图夹具对照两页在 1194×834、1024×768、390×844、320×568 下的波形与设置；修复后另覆盖深色。

| 实测项目 | 修复前 | 修复后 |
| --- | --- | --- |
| 1024×768 简中 iPad 恢复按钮 | 约 40.5×112px，逐字竖排 | 约 262.6×44px，正常横排 |
| 390px 正式／iPad 弹层左边界 | −2px | 26px |
| 320px 正式／iPad 弹层左边界 | −2px | 26px |
| 高振幅与时间文字 | 可重叠 | 实际波形边界在文字上方，且有 clip 保护 |

绘图夹具只发送 scalar RMS 和警告窗口事件，不模拟模型输出，不用于性能或准确率结论。

另外用 ESC-50 `1-17124-A-43.wav` 作为 Chromium 虚拟麦克风输入，通过真实生产 Worker 验证两页 × 浅深主题的 **4 项红屏检查通过**：识别为汽车喇叭，页面背景保持 `rgb(199, 38, 58)`，每页只运行一个 Worker，停止后资源均释放。录音不提交进仓库，来源为 https://github.com/karolpiczak/ESC-50 。

## 未改动与验证边界

`app.js`、`theme.js`、`detection.js`、`classifier-worker.js`、`capture-worklet.js`、`audio-window.js`、`resample.js`、YAMNet 模型、六类默认阈值及离线研究代码均与基线相同。没有修改采集、重采样、推理、红屏状态机或通知音；现有相关单元测试全部通过。

WebKit 安装尝试被环境网络策略以 403 `Domain forbidden` 拒绝，因此没有执行 WebKit，也没有实体 iPad Safari 验证。Chromium 触控模拟、CSS 视口及虚拟麦克风不等于 iPad 硬件实测；真实 Safari 工具栏、安全区域、Split View、旋转、耳机路由及通知音听感仍需设备验收。

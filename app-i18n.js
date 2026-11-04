// Application copy and language preference policy; no audio or DOM ownership.
export const EN = Object.freeze({
  'スコアは正答率や確率ではありません。研究ログはメモリ内にのみ保持します。':
    'Raw YAMNet Score is not accuracy or probability. Research logs stay in memory only.',
  設定: 'Settings',
  中央の表示: 'Center display',
  円形アニメーション: 'Circular animation',
  リアルタイム波形: 'Live waveform',
  'マイク入力の波形をリアルタイムで表示します。音声は保存されません。':
    'Show the live microphone waveform. Audio is not saved.',
  リアルタイムのマイク波形: 'Live microphone waveform',
  '鐘・ベル': 'Bell',
  チャイム: 'Chime',
  チンという音: 'Ding',
  ピーンという音: 'Ping',
  ドアベル: 'Doorbell',
  補助メニュー: 'Additional pages',
  音声とAI識別: 'Audio and AI classification',
  'マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。':
    'Device type and name are reported by the browser, not proof of the physical microphone.',
  'ブラウザの機器名：': 'Browser device name: ',
  マイクの種類を確認できません: 'Microphone type unknown',
  '端末内蔵マイク（ブラウザ報告）': 'Built-in microphone (browser-reported)',
  'イヤホン／ヘッドホンのマイク（ブラウザ報告）': 'Headset microphone (browser-reported)',
  'マイク情報を取得中…': 'Reading microphone information…',
  マイクを使用していません: 'Microphone not in use',
  使用中のマイク: 'Current microphone',
  '新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。':
    'Two short beeps on each new warning. Your device controls where sound plays.',
  通知音を鳴らす: 'Play alert beeps',
  警告音の通知: 'Alert sound',
  AIデバッグモード: 'AI Debug Mode',
  'マイク接続テスト（イヤホン入力） ↗': 'Microphone Test Mode (headset input) ↗',
  交通警告音の感度設定: 'Traffic warning sound sensitivity',
  '1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。':
    'A single AI result at or above the set threshold triggers an alert immediately. Lower thresholds can increase false alarms.',
  '0.01：最高感度 ／ 0.10：初期値 ／ 0.50：低感度':
    '0.01: highest sensitivity / 0.10: default / 0.50: low sensitivity',
  すべて標準に戻す: 'Reset all to default',
  識別の詳細を表示: 'Show recognition details',
  AIモデル: 'AI model',
  マイク入力: 'Microphone input',
  直近の推論: 'Latest inference',
  推論時間: 'Inference time',
  最終更新: 'Last update',
  上位5種類の音: 'Top 5 sounds',
  '警告対象の音（11種類）': 'Alert sound categories (11)',
  音の種類: 'Sound category',
  生の識別スコア: 'Raw score',
  '最新の結果のみを表示します。録音や履歴は保存しません。スコアは正答率ではありません。':
    'Only the latest result is shown. No recordings or history are saved. A score is not accuracy.',
  '結果はまだありません。': 'No results yet.',
  未読み込み: 'Not loaded',
  読み込み中: 'Loading',
  読み込み成功: 'Loaded successfully',
  '読み込み成功・解放済み': 'Loaded successfully; now released',
  読み込み中止: 'Loading cancelled',
  失敗: 'Failed',
  許可を確認中: 'Requesting permission',
  '許可済み・音声データ待ち': 'Permission granted; waiting for audio',
  音声データ受信中: 'Receiving audio data',
  マイクの許可なし: 'Microphone permission denied',
  入力エラー: 'Input error',
  音声入力が中断: 'Audio input interrupted',
  未実行: 'Not run yet',
  成功: 'Successful',
  更新が停止: 'Updates stalled',
  '利用不可（HTTPSが必要）': 'Unavailable (HTTPS required)',
  '詳細結果を待っています。': 'Waiting for detailed results.',
  '推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。':
    'Inference time measures the model call only. It excludes capture, resampling and queue time.',
  検知を停止しました: 'Detection stopped',
  停止中: 'Stopped',
  '開始すると、周囲の交通警告音を\nこの端末で識別します。':
    'Start to identify nearby traffic warning\nsounds on this device.',
  'AIモデルを読み込み中...': 'Loading AI model...',
  準備中: 'Preparing',
  '初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。':
    'The first load may take a moment.\nPlease allow microphone access.',
  'マイクの音を確認中...': 'Checking microphone audio...',
  '最初の音声をAIで解析しています。': 'AI is analysing the first audio window.',
  '周囲の音を検知中...': 'Listening to your surroundings...',
  検知中: 'Listening',
  '交通警告音を検知すると、\n警告を表示します。':
    'A warning appears when a\ntraffic warning sound is detected.',
  警告音を検知しました: 'Warning sound detected',
  周囲を確認してください: 'Check your surroundings',
  検知を開始: 'Start detection',
  検知を停止: 'Stop detection',
  読み込みを中止: 'Cancel loading',
  '識別スコア：': 'Classification score: ',
  自転車のベル: 'Bicycle bell',
  車のクラクション: 'Car horn',
  サイレン: 'Siren',
  'サイレン（パトカー）': 'Police siren',
  'サイレン（救急車）': 'Ambulance siren',
  'サイレン（消防車）': 'Fire engine siren',
  'マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。':
    'Microphone access is not allowed. In Safari’s page menu → Website Settings, allow the microphone, then start again.',
  'マイクが見つかりません。接続を確認して、もう一度開始してください。':
    'No microphone was found. Check the connection, then start again.',
  'マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。':
    'The microphone is unavailable. End any calls or other recording apps, then start again.',
  'マイクを使用できるHTTPSのページをSafariで直接開いてください。':
    'Open the HTTPS page directly in Safari to use the microphone.',
  '音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。':
    'Audio analysis could not start. Reload the page, then try again.',
  'AIの解析が中断しました。もう一度開始してください。': 'AI analysis was interrupted. Please start again.',
  '音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。':
    'Audio analysis is falling behind. Close other apps, then start again.',
  '音声の取得が遅れています。もう一度開始してください。':
    'Audio capture is falling behind. Please start again.',
  'AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。':
    'AI analysis is falling behind. Close other apps, then start again.',
  'マイクの音声処理が停止しました。もう一度開始してください。':
    'Microphone audio processing stopped. Please start again.',
  'このSafariでは音声を取得できません。iOSを更新してください。':
    'This version of Safari cannot capture audio. Please update iOS.',
  'マイクまたは音声処理が中断しました。もう一度開始してください。':
    'The microphone or audio processing was interrupted. Please start again.',
  '音声またはAIの解析が途切れました。もう一度開始してください。':
    'Audio capture or AI analysis stalled. Please start again.',
  'マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。':
    'To use the microphone, open the HTTPS website directly in Safari.',
  'このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。':
    'This browser does not support the required audio features. Open the page in Safari on iOS.',
  'マイクとの接続が切れました。もう一度開始してください。':
    'The microphone was disconnected. Please start again.',
  'マイクが一時停止しました。もう一度開始してください。': 'The microphone was paused. Please start again.',
  'AIの解析に失敗しました。もう一度開始してください。': 'AI analysis failed. Please start again.',
  'AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。':
    'The AI model could not load. Check your connection and uploaded files, then reload the page.',
  'AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。':
    'AI could not run. Upload all required files, then reopen the page in Safari.',
  '音声処理が中断しました。もう一度開始してください。':
    'Audio processing was interrupted. Please start again.',
  '準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。':
    'Setup is taking too long. Check microphone permission and your connection, then start again.',
  'Safariで音声を開始するには、中央のマイクをタップしてください。':
    'Tap the microphone circle to enable audio in Safari.',
  '画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。':
    'Detection stopped because the page was hidden. Tap the microphone circle to resume.',
  言語: 'Language',
  表示バージョン: 'Page layout',
  通常版: 'Standard',
  'iPad横画面（テスト）': 'iPad landscape (test)',
  '音声は保存・送信されません': 'Audio is not saved or transmitted',
  '研究用プロトタイプ · 安全を保証するものではありません': 'Research prototype · Does not guarantee safety',
  'AIテストモード（オフライン研究） ↗': 'AI Test Mode (offline research) ↗',
  'ご意見・ご感想 ↗': 'Send feedback ↗',
  'ご意見・ご感想（準備中）': 'Feedback (coming soon)',
  Googleフォームを新しいタブで開く: 'Open Google Forms in a new tab',
  'フィードバックフォームは準備中です。': 'The feedback form is coming soon.',
  'イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。':
    'A research prototype for real-time traffic warning sound recognition, studying headphone use and traffic safety.',
  通知音の音量: 'Alert volume',
  小: 'Soft',
  標準: 'Normal',
  はっきり: 'Clear',
  '実際の音圧は端末やイヤホンによって異なります。低い設定から試してください。':
    'Actual sound level depends on the device and headphones. Start with the softer setting.',
  使用するマイク: 'Microphone to use',
  ブラウザ標準: 'Browser default',
  '利用できる機器はマイクの許可後に表示されます。変更すると検知を再起動します。':
    'Available inputs appear after microphone permission. Changing inputs restarts detection.',
  'マイクの許可後に機器一覧を取得します。': 'Input devices will appear after microphone permission.',
  'ブラウザは個別のマイクを表示していません。':
    'The browser does not expose separately selectable microphones.',
  'ブラウザが報告したマイクを選択できます。': 'You can select microphones reported by the browser.',
  '選択を要求しましたが、実際のマイクはブラウザから確認できません。':
    'Input requested; the browser cannot verify the actual microphone.',
  'ブラウザは選択したマイクを使用中と報告しています。':
    'The browser reports that the selected microphone is in use.',
  'マイクを切り替えています…': 'Switching microphone…',
  '選択したマイクを使用できません。標準に戻すか別のマイクを選択してください。':
    'The chosen microphone is unavailable. Select Browser default or another input.',
  'ブラウザは選択したマイクと異なる入力を返しました。別の入力を選んでください。':
    'The browser returned a different input from the one selected. Choose another input.',
  '音量を変更すると次の通知から反映されます。': 'The new level applies to the next alert.',
});
export const ZH = Object.freeze({
  'スコアは正答率や確率ではありません。研究ログはメモリ内にのみ保持します。':
    'YAMNet 原始分数不是准确率或概率。研究日志仅保留在内存中。',
  設定: '设置',
  中央の表示: '中央显示',
  円形アニメーション: '圆形动画',
  リアルタイム波形: '实时音频波形',
  'マイク入力の波形をリアルタイムで表示します。音声は保存されません。':
    '实时显示麦克风输入波形，不会保存音频。',
  リアルタイムのマイク波形: '实时麦克风波形',
  '鐘・ベル': '钟／铃声',
  チャイム: '提示铃声',
  チンという音: '叮声',
  ピーンという音: '清脆提示声',
  ドアベル: '门铃',
  補助メニュー: '辅助页面',
  音声とAI識別: '声音与 AI 识别',
  'マイクの種類と機器名はブラウザの申告です。実際の集音位置は保証されません。':
    '麦克风类型及名称来自浏览器报告，无法保证实际使用的物理麦克风位置。',
  'ブラウザの機器名：': '浏览器设备名称：',
  マイクの種類を確認できません: '无法确定麦克风类型',
  '端末内蔵マイク（ブラウザ報告）': '设备内置麦克风（浏览器报告）',
  'イヤホン／ヘッドホンのマイク（ブラウザ報告）': '耳机麦克风（浏览器报告）',
  'マイク情報を取得中…': '正在读取麦克风信息…',
  マイクを使用していません: '未开始使用麦克风',
  使用中のマイク: '当前麦克风',
  '新しい警告時に短い音を2回再生します。出力先は端末の設定によって異なります。':
    '每次新的警告播放两声短促提示音；实际从哪里播放由设备决定。',
  通知音を鳴らす: '播放提示音',
  警告音の通知: '提示音提醒',
  AIデバッグモード: 'AI 调试模式',
  'マイク接続テスト（イヤホン入力） ↗': '麦克风测试模式（耳机输入） ↗',
  交通警告音の感度設定: '交通警告音灵敏度设置',
  '1回のAI識別でスコアが設定値以上なら、すぐに警告します。スコアを下げると誤警告が増える可能性があります。':
    '任意一次 AI 识别分数达到设定阈值，就会立即发出警告。阈值越低，误报可能越多。',
  '0.01：最高感度 ／ 0.10：初期値 ／ 0.50：低感度': '0.01：最高灵敏度 / 0.10：默认 / 0.50：低灵敏度',
  すべて標準に戻す: '全部恢复默认',
  識別の詳細を表示: '显示识别详情',
  AIモデル: 'AI 模型',
  マイク入力: '麦克风输入',
  直近の推論: '最近一次识别',
  推論時間: '推理耗时',
  最終更新: '最后更新',
  上位5種類の音: '分数最高的 5 种声音',
  '警告対象の音（11種類）': '警告声音类别（11 类）',
  音の種類: '声音类别',
  生の識別スコア: '原始识别分数',
  '最新の結果のみを表示します。録音や履歴は保存しません。スコアは正答率ではありません。':
    '只显示最新识别结果，不保存录音或历史记录。分数不代表准确率。',
  '結果はまだありません。': '暂无结果。',
  未読み込み: '尚未加载',
  読み込み中: '加载中',
  読み込み成功: '加载成功',
  '読み込み成功・解放済み': '已加载，现已释放',
  読み込み中止: '已取消加载',
  失敗: '失败',
  許可を確認中: '正在请求权限',
  '許可済み・音声データ待ち': '已获麦克风权限，等待音频',
  音声データ受信中: '正在接收音频数据',
  マイクの許可なし: '未获得麦克风权限',
  入力エラー: '输入错误',
  音声入力が中断: '音频输入中断',
  未実行: '尚未运行',
  成功: '成功',
  更新が停止: '更新已停止',
  '利用不可（HTTPSが必要）': '不可用（需要 HTTPS）',
  '詳細結果を待っています。': '正在等待详细结果。',
  '推論時間はモデルの実行時間です。音声収集・再サンプリング・待ち時間は含みません。':
    '推理耗时仅指模型计算时间，不包括录音采集、重采样和排队时间。',
  検知を停止しました: '检测已停止',
  停止中: '已停止',
  '開始すると、周囲の交通警告音を\nこの端末で識別します。':
    '点击开始后，将在本设备上\n识别周围的交通警告音。',
  'AIモデルを読み込み中...': '正在加载 AI 模型...',
  準備中: '准备中',
  '初回は読み込みに時間がかかることがあります。\nマイクの使用を許可してください。':
    '首次加载可能需要一些时间。\n请允许使用麦克风。',
  'マイクの音を確認中...': '正在检查麦克风音频...',
  '最初の音声をAIで解析しています。': 'AI 正在分析第一段音频。',
  '周囲の音を検知中...': '正在检测周围的声音...',
  検知中: '检测中',
  '交通警告音を検知すると、\n警告を表示します。': '检测到交通警告音时，\n将显示警告。',
  警告音を検知しました: '检测到警告音',
  周囲を確認してください: '请注意周围环境',
  検知を開始: '开始检测',
  検知を停止: '停止检测',
  読み込みを中止: '取消加载',
  '識別スコア：': '识别分数：',
  自転車のベル: '自行车铃',
  車のクラクション: '汽车喇叭',
  サイレン: '警笛',
  'サイレン（パトカー）': '警车警笛',
  'サイレン（救急車）': '救护车警笛',
  'サイレン（消防車）': '消防车警笛',
  'マイクの使用が許可されていません。Safariのページメニュー → Webサイトの設定で「マイク」を許可し、もう一度開始してください。':
    '麦克风权限未开启。请在 Safari 的页面菜单 → 网站设置中允许麦克风，然后重新开始。',
  'マイクが見つかりません。接続を確認して、もう一度開始してください。': '未找到麦克风，请检查连接后重试。',
  'マイクを使用できません。通話や他の録音アプリを終了し、もう一度開始してください。':
    '无法使用麦克风。请结束通话或其他录音应用后重试。',
  'マイクを使用できるHTTPSのページをSafariで直接開いてください。':
    '请在 Safari 中直接打开 HTTPS 网页，以便使用麦克风。',
  '音声の解析を開始できませんでした。ページを再読み込みして、もう一度開始してください。':
    '无法开始音频分析，请刷新页面后重试。',
  'AIの解析が中断しました。もう一度開始してください。': 'AI 分析已中断，请重新开始。',
  '音声の解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。':
    '音频分析速度跟不上，请关闭其他应用后重试。',
  '音声の取得が遅れています。もう一度開始してください。': '音频采集出现延迟，请重新开始。',
  'AIの解析が遅れています。ほかのアプリを閉じて、もう一度開始してください。':
    'AI 分析速度跟不上，请关闭其他应用后重试。',
  'マイクの音声処理が停止しました。もう一度開始してください。': '麦克风音频处理已停止，请重新开始。',
  'このSafariでは音声を取得できません。iOSを更新してください。': '当前 Safari 无法获取音频，请更新 iOS。',
  'マイクまたは音声処理が中断しました。もう一度開始してください。': '麦克风或音频处理被中断，请重新开始。',
  '音声またはAIの解析が途切れました。もう一度開始してください。': '音频或 AI 分析中断，请重新开始。',
  'マイクを使用するには、HTTPSのサイトをSafariで直接開いてください。':
    '请在 Safari 中直接打开 HTTPS 网站以使用麦克风。',
  'このブラウザは必要な音声機能に対応していません。iOSのSafariで開いてください。':
    '该浏览器不支持所需的音频功能，请使用 iOS Safari。',
  'マイクとの接続が切れました。もう一度開始してください。': '麦克风连接已断开，请重新开始。',
  'マイクが一時停止しました。もう一度開始してください。': '麦克风已暂停，请重新开始。',
  'AIの解析に失敗しました。もう一度開始してください。': 'AI 分析失败，请重新开始。',
  'AIモデルを読み込めませんでした。通信とアップロードしたファイルを確認して、再読み込みしてください。':
    'AI 模型加载失败，请检查网络和所需文件，然后刷新重试。',
  'AIの実行に失敗しました。必要なファイルをすべてアップロードして、Safariで開き直してください。':
    'AI 运行失败，请确认所有必要文件已上传，并用 Safari 重新打开。',
  '音声処理が中断しました。もう一度開始してください。': '音频处理已中断，请重新开始。',
  '準備に時間がかかっています。マイクの許可と通信を確認して、もう一度開始してください。':
    '准备时间过长，请检查麦克风权限和网络后重试。',
  'Safariで音声を開始するには、中央のマイクをタップしてください。':
    '请点击中央麦克风按钮，在 Safari 中启动音频。',
  '画面が非表示になったため停止しました。再開するには中央のマイクをタップしてください。':
    '页面进入后台，检测已停止。点击中央麦克风可重新开始。',
  言語: '语言',
  表示バージョン: '页面版本',
  通常版: '标准版',
  'iPad横画面（テスト）': 'iPad 横屏测试版',
  '音声は保存・送信されません': '音频不会被保存或上传',
  '研究用プロトタイプ · 安全を保証するものではありません': '研究原型 · 不保证安全',
  'AIテストモード（オフライン研究） ↗': 'AI 测试模式（离线研究） ↗',
  'ご意見・ご感想 ↗': '意见与反馈 ↗',
  'ご意見・ご感想（準備中）': '意见与反馈（准备中）',
  Googleフォームを新しいタブで開く: '在新标签页打开 Google 问卷',
  'フィードバックフォームは準備中です。': '反馈问卷尚未开放。',
  'イヤホンの使用と交通安全をテーマにした、交通警告音のリアルタイム識別研究プロトタイプ。':
    '本研究原型围绕耳机使用与交通安全，在本设备上实时识别交通警告音。',
  通知音の音量: '提示音音量',
  小: '低',
  標準: '标准',
  はっきり: '明显',
  '実際の音圧は端末やイヤホンによって異なります。低い設定から試してください。':
    '实际声压取决于设备和耳机，请从较低音量开始试听。',
  使用するマイク: '选择麦克风',
  ブラウザ標準: '浏览器默认',
  '利用できる機器はマイクの許可後に表示されます。変更すると検知を再起動します。':
    '授权麦克风后显示可用设备；切换设备会重新启动检测。',
  'マイクの許可後に機器一覧を取得します。': '授权麦克风后获取输入设备列表。',
  'ブラウザは個別のマイクを表示していません。': '浏览器未提供可单独选择的麦克风。',
  'ブラウザが報告したマイクを選択できます。': '可以选择浏览器报告的麦克风。',
  '選択を要求しましたが、実際のマイクはブラウザから確認できません。':
    '已请求所选输入，但浏览器无法确认实际麦克风。',
  'ブラウザは選択したマイクを使用中と報告しています。': '浏览器报告正在使用所选麦克风。',
  'マイクを切り替えています…': '正在切换麦克风…',
  '選択したマイクを使用できません。標準に戻すか別のマイクを選択してください。':
    '所选麦克风不可用，请选择浏览器默认或其他输入。',
  'ブラウザは選択したマイクと異なる入力を返しました。別の入力を選んでください。':
    '浏览器返回的输入与所选麦克风不同，请选择其他输入。',
  '音量を変更すると次の通知から反映されます。': '音量修改将在下一次提示时生效。',
});
export const LANGUAGE_STORAGE_KEY = 'trafficSoundGuardian.language';
export const allowedLanguage = (code) => (['ja', 'en', 'zh-CN'].includes(code) ? code : 'ja');
export function initialLanguage(window) {
  const query = /(?:^|[?&])lang=(ja|en|zh-CN)(?:&|$)/.exec(window.location?.search || '')?.[1];
  if (query) return query;
  try {
    return allowedLanguage(window.sessionStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'ja';
  }
}
export function translateApp(text, language) {
  return language === 'en' ? (EN[text] ?? text) : language === 'zh-CN' ? (ZH[text] ?? text) : text;
}

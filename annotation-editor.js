// V1.6 manual audio annotations. No uploads; no AI-generated ground truth.
// Only one file is decoded for preview at once. The caller controls the verified clip.
const dict = {
 ja:{title:'波形で時間を標注',loading:'音声を読み込み中…',play:'再生して範囲をドラッグしてください',start:'開始 (秒)',end:'終了 (秒)',label:'音の種類',add:'区間を追加',complete:'すべての対象音を標注済み',save:'保存',cancel:'閉じる',remove:'削除',zoom:'拡大',pan:'表示位置',empty:'まだ区間がありません',error:'音声を読み込めません。ブラウザーの形式対応を確認してください。',bad:'区間と種類を確認してください。',help:'波形を指やマウスでドラッグして区間を選択できます。時間欄で微調整できます。',unknown:'その他・未確認'},
 en:{title:'Visual time annotations',loading:'Decoding audio…',play:'Play and drag to select a region',start:'Start (s)',end:'End (s)',label:'Sound type',add:'Add interval',complete:'All target sounds exhaustively annotated',save:'Save',cancel:'Close',remove:'Delete',zoom:'Zoom',pan:'Timeline position',empty:'No marked intervals yet',error:'Cannot decode audio in this browser.',bad:'Check the selected range and label.',help:'Drag on the waveform with a finger or mouse; adjust exact times below.',unknown:'Other / unknown'},
 'zh-CN':{title:'波形时间标注',loading:'正在解码音频…',play:'播放并拖动选择声音区间',start:'开始（秒）',end:'结束（秒）',label:'声音类别',add:'添加区间',complete:'已标注全部目标声音',save:'保存',cancel:'关闭',remove:'删除',zoom:'放大',pan:'时间轴位置',empty:'暂无标注',error:'浏览器无法解码该音频。',bad:'请检查时间范围和标签。',help:'用手指或鼠标拖动波形选区，也可以精确调整下方的时间。',unknown:'其他／不确定'}
};
const categories = ['bell','horn','siren','police','ambulance','fire'];
const names = {
 ja:['自転車のベル','車のクラクション','サイレン','パトカー','救急車','消防車'],
 en:['Bicycle Bell','Car Horn','Siren','Police Siren','Ambulance Siren','Fire Siren'],
 'zh-CN':['自行车铃','汽车喇叭','警笛','警车警笛','救护车警笛','消防车警笛']
};
const create = (tag,cls='',text='') => {const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
export async function mountAnnotationEditor(host, clip, {lang='ja',onSave}) {
  const t = dict[lang]||dict.ja, name = names[lang]||names.ja;
  const pane = create('section','annotation-editor');
  const heading = create('h3','',t.title);
  const status = create('p','annotation-status',t.loading);
  pane.append(heading,status);
  host.replaceChildren(pane);
  let audioContext=null, url=null, disposed=false, audio=null, peaks=null, canvas=null;
  let events=(clip.events||[]).map(e=>({...e})), duration=clip.duration||0;
  let a=0,b=Math.min(1,duration), zoom=1, offset=0;
  function close() {
    disposed=true;
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();}
    if(url) URL.revokeObjectURL(url);
    if(audioContext && audioContext.state!=='closed') audioContext.close().catch(()=>{});
    pane.remove();
  }
  const bar=create('div','annotation-controls');
  const xButton=(label,fn)=>{const x=create('button','',label);x.type='button';x.onclick=fn;return x;};
  const showError=s=>{status.textContent=s;status.setAttribute('role','alert');};
  try {
    if(clip.file?.size>20*1024*1024) throw Error('size');
    audioContext = new (window.AudioContext||window.webkitAudioContext)();
    const data = await clip.file.arrayBuffer();
    if(disposed) return;
    const decoded=await audioContext.decodeAudioData(data);
    if(disposed) return;
    if(decoded.length*decoded.numberOfChannels*4>96*1024*1024||decoded.duration>120) throw Error('length');
    duration=decoded.duration;
    b=Math.min(duration,Math.max(.1,b||.5));
    // A compact mono visual envelope, not a retained PCM recording.
    const bins=1600, mono=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
    peaks=new Float32Array(bins);
    for(let i=0;i<bins;i++){
      let peak=0;
      const start=Math.floor(i*decoded.length/bins),end=Math.max(start+1,Math.floor((i+1)*decoded.length/bins));
      for(let s=start;s<end;s+=Math.max(1,Math.floor((end-start)/12))) {
        let value=0;for(const ch of mono)value+=ch[s]||0;value/=mono.length;
        peak=Math.max(peak,Math.abs(value));
      }
      peaks[i]=peak;
    }
    url=URL.createObjectURL(clip.file);
    audio=create('audio','annotation-audio');
    audio.controls=true;audio.preload='metadata';audio.src=url;
    pane.append(audio);
    status.textContent=t.help;
    canvas=create('canvas','annotation-canvas');
    canvas.width=800;canvas.height=150;
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',t.title);
    pane.append(canvas);
    const context=canvas.getContext('2d');
    const segment=()=>duration/zoom;
    const localTime=x=>Math.max(offset,Math.min(offset+segment(),offset+x*segment()));
    const pos=(time)=>((time-offset)/segment())*canvas.width;
    function draw(){
      if(!context||disposed)return;
      const width=canvas.width,height=canvas.height;
      const light=document.documentElement.dataset.theme==='light';
      context.clearRect(0,0,width,height);
      context.fillStyle=light?'#edf3f8':'#101a2c';context.fillRect(0,0,width,height);
      context.strokeStyle=light?'#52748a':'#90b8cb';context.lineWidth=2;
      for(let i=0;i<width;i+=2){
        const time=localTime(i/width),bin=Math.min(peaks.length-1,Math.floor(time/duration*peaks.length));
        const amp=Math.max(1,Math.tanh(peaks[bin]*3)*height*.42);
        context.beginPath();context.moveTo(i,height/2-amp);context.lineTo(i,height/2+amp);context.stroke();
      }
      const paint=(start,end,color)=>{
        const left=Math.max(0,pos(start)),right=Math.min(width,pos(end));
        if(right<=left)return;
        context.fillStyle=color;context.fillRect(left,0,right-left,height);
      };
      for(const item of events)paint(item.start,item.end,light?'#14a69a44':'#2dd4bf44');
      paint(a,b,light?'#ffa72644':'#ffb45c44');
      if(audio){
        const px=pos(audio.currentTime);
        if(px>=0&&px<=width){context.strokeStyle=light?'#b52339':'#ff7788';context.lineWidth=2;context.beginPath();context.moveTo(px,0);context.lineTo(px,height);context.stroke();}
      }
    }
    let raf=0;
    const tick=()=>{if(disposed)return;draw();if(audio&&!audio.paused)raf=requestAnimationFrame(tick);};
    audio.addEventListener('play',()=>{cancelAnimationFrame(raf);tick();});
    audio.addEventListener('pause',()=>{cancelAnimationFrame(raf);draw();});
    const zoomRow=create('div','annotation-controls');
    const zoomLabel=create('label','',t.zoom+' ');
    const zoomRange=create('input');zoomRange.type='range';zoomRange.min='1';zoomRange.max='8';zoomRange.step='1';zoomRange.value='1';
    zoomRange.oninput=()=>{zoom=Number(zoomRange.value);offset=Math.max(0,Math.min(offset,duration-segment()));pan.max=String(Math.max(0,duration-segment()));pan.value=String(offset);draw();};
    zoomLabel.append(zoomRange);
    const panLabel=create('label','',t.pan+' ');
    const pan=create('input');pan.type='range';pan.min='0';pan.max='0';pan.step='.05';pan.value='0';
    pan.oninput=()=>{offset=Number(pan.value);draw();};
    panLabel.append(pan);
    zoomRow.append(zoomLabel,panLabel);pane.append(zoomRow);
    const inputs=create('div','annotation-controls');
    function numberInput(label,value){
      const wrapper=create('label','',label+' ');
      const input=create('input');input.type='number';input.min='0';input.max=String(duration);input.step='.01';input.value=value.toFixed(2);
      wrapper.append(input);inputs.append(wrapper);return input;
    }
    const startInput=numberInput(t.start,a),endInput=numberInput(t.end,b);
    const select=create('select');select.setAttribute('aria-label',t.label);
    categories.forEach((id,i)=>{const o=create('option','',name[i]);o.value=id;select.append(o);});
    inputs.append(select);
    function syncInputs(){startInput.value=a.toFixed(2);endInput.value=b.toFixed(2);}
    const syncFromInputs=()=>{a=Number(startInput.value);b=Number(endInput.value);draw();};
    startInput.onchange=syncFromInputs;endInput.onchange=syncFromInputs;
    let down=null;
    const pointerTime=e=>localTime(Math.max(0,Math.min(1,(e.clientX-canvas.getBoundingClientRect().left)/Math.max(1,canvas.getBoundingClientRect().width))));
    canvas.addEventListener('pointerdown',e=>{down=pointerTime(e);canvas.setPointerCapture?.(e.pointerId);a=down;b=down;syncInputs();draw();});
    canvas.addEventListener('pointermove',e=>{if(down===null)return;const x=pointerTime(e);a=Math.min(down,x);b=Math.max(down,x);syncInputs();draw();});
    canvas.addEventListener('pointerup',e=>{if(down===null)return;const x=pointerTime(e);a=Math.min(down,x);b=Math.max(down,x);down=null;syncInputs();draw();});
    canvas.addEventListener('pointercancel',()=>{down=null;});
    pane.append(inputs);
    const rows=create('div','annotation-rows');
    const completed=create('label','annotation-check');
    const box=create('input');box.type='checkbox';box.checked=!!clip.complete;
    completed.append(box,document.createTextNode(' '+t.complete));
    function refreshRows(){
      rows.replaceChildren();
      if(!events.length)rows.append(create('p','annotation-status',t.empty));
      events.forEach((e,i)=>{
        const row=create('div','annotation-row');
        row.append(create('span','',name[categories.indexOf(e.label)]+' · '+e.start.toFixed(2)+'–'+e.end.toFixed(2)+'s'));
        row.append(xButton(t.remove,()=>{events.splice(i,1);refreshRows();draw();}));
        rows.append(row);
      });
    }
    bar.append(xButton(t.add,()=>{
      syncFromInputs();
      if(!categories.includes(select.value)||!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>=b||b>duration){showError(t.bad);return;}
      events.push({label:select.value,start:Math.round(a*100)/100,end:Math.round(b*100)/100});
      events.sort((u,v)=>u.start-v.start||u.end-v.end);
      status.textContent=t.help;refreshRows();draw();
    }));
    bar.append(xButton(t.save,()=>{
      if(events.some(e=>e.start<0||e.start>=e.end||e.end>duration)) {showError(t.bad);return;}
      onSave({events,complete:box.checked,duration});
      close();
    }));
    bar.append(xButton(t.cancel,close));
    pane.append(bar,rows,completed);
    refreshRows();draw();
  } catch(e){ if(!disposed){showError(t.error);pane.append(xButton(t.cancel,close));} }
  return {close};
}

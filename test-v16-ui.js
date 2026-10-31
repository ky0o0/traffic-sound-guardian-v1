import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
test('V1.6 keeps a single microphone/classifier pipeline and adds read-only 10s visualization',()=>{
 const html=file('./index.html'),app=file('./app.js'),timeline=file('./live-timeline.js');
 assert.match(html,/id="rolling-waveform"/);
 assert.match(html,/live-timeline\.js\?v=1\.6\.9/);
 assert.match(app,/tsg:visual/);
 assert.match(app,/tsg:warning/);
 assert.match(app,/completedFrame\.endTime - 0\.975/);
 assert.match(timeline,/spanSeconds = 10/);
 assert.match(timeline,/levels\.length>720/);
 assert.doesNotMatch(timeline,/\bgetUserMedia\s*\(|\bnew\s+AudioContext\s*\(|\bMediaRecorder\s*\(|\bcreateObjectURL\s*\(|\bfetch\s*\(/i);
 assert.doesNotMatch(timeline,/localStorage|sessionStorage|indexedDB|sendBeacon/i);
});
test('V1.6 theme selector is shared by all three pages, with system preference',()=>{
 const theme=file('./theme.js');
 for(const page of ['index.html','ai-test.html','microphone-test.html']){
   assert.match(file('./'+page),/theme\.js\?v=1\.6\.0/);
   assert.match(file('./'+page),page === 'index.html' ? /theme\.css\?v=1\.6\.9/ : /theme\.css\?v=1\.6\.0/);
 }
 assert.match(theme,/trafficSoundGuardian\.theme/);
 assert.match(theme,/prefers-color-scheme: dark/);
 assert.match(theme,/selected === 'system'/);
 assert.match(file('./theme.css'),/body\[data-state=warning\]/);
});
test('real YAMNet and manual labels remain different sources',()=>{
 const ui=file('./ai-test.js'),annot=file('./annotation-editor.js');
 assert.match(ui,/mountAnnotationEditor/);
 assert.match(ui,/selectionClips\(clips, split, revealed \? 'test' : 'validation'\)/);
 assert.match(ui,/c\.labels = events\.length/);
 assert.match(annot,/predictions=\[\]/);
 assert.match(annot,/for\(const item of predictions\)/);
 assert.match(annot,/for\(const item of events\)/);
 assert.ok(annot.indexOf('for(const item of predictions)') < annot.indexOf('for(const item of events)'));
});
test('rolling timeline marks only actual positive results and clears after 10 seconds',()=>{
 const events={},drawn=[],ctx={
   clearRect(){},setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){drawn.push(this.strokeStyle)},fillText(){}
 };
 const canvas={width:0,height:0,clientWidth:340,clientHeight:100,
   getContext(){return ctx},setAttribute(){}};
 const labels={textContent:''};
 const nodes={'rolling-waveform':canvas,'rolling-events':labels,'rolling-heading':{textContent:''},'rolling-note':{textContent:''}};
 const document={documentElement:{lang:'en',dataset:{theme:'dark'}},getElementById:id=>nodes[id]||null};
 const window={devicePixelRatio:1,addEventListener(name,cb){events[name]=cb}};
 class Observer{observe(){}}
 vm.runInNewContext(file('./live-timeline.js'),{document,window,MutationObserver:Observer,Math,Float32Array,Number,String});
 events['tsg:visual']({detail:{time:10,rms:0.09}});
 assert.equal(labels.textContent,'No recent detections');
 drawn.length=0;
 events['tsg:warning']({detail:{start:9.5,end:10,label:'Car horn'}});
 events['tsg:visual']({detail:{time:10.1,rms:0.09}});
 assert.match(labels.textContent,/Car horn/);
 assert.ok(drawn.includes('#ff596b'), 'actual positive audio point painted red');
 events['tsg:visual']({detail:{time:22,rms:0.09}});
 assert.equal(labels.textContent,'No recent detections');
 events['tsg:reset']();
 assert.equal(labels.textContent,'No recent detections');
});

test('V1.6.10 stable sound label, safety priority and three languages stay synchronized',()=>{
 const events={},ctx={clearRect(){},setTransform(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const elements=Object.fromEntries(['rolling-events','rolling-heading','rolling-note','rolling-current-label'].map(id=>[id,{textContent:''}]));
 elements['rolling-current-value']={textContent:'',dataset:{}};
 const canvas={width:0,height:0,clientWidth:340,clientHeight:104,getContext(){return ctx},setAttribute(){}};
 elements['rolling-waveform']=canvas;
 const document={documentElement:{lang:'ja',dataset:{theme:'light'}},getElementById:id=>elements[id]??null};
 const window={devicePixelRatio:1,addEventListener(name,callback){events[name]=callback;}};
 class Observer{observe(){}}
 vm.runInNewContext(file('./live-timeline.js'),{document,window,MutationObserver:Observer,Math,Number,String});
 const send=(categoryName,timeMs,labels,warningName=null,warningLabels=null)=>
  events['tsg:classification']({detail:{categoryName,labels,timeMs,warningName,warningLabels}});
 const speech={ja:'話し声',en:'Speech','zh-CN':'人声'};
 const music={ja:'音楽',en:'Music','zh-CN':'音乐'};
 const horn={ja:'車のクラクション',en:'Vehicle horn, car horn, honking','zh-CN':'汽车喇叭'};
 assert.equal(elements['rolling-current-value'].textContent,'検知開始前');
 events['tsg:visual']({detail:{time:1,rms:.01}});
 assert.equal(elements['rolling-current-value'].textContent,'解析中…');
 send('Speech',1000,speech);assert.equal(elements['rolling-current-value'].textContent,'解析中…');
 send('Speech',1100,speech);assert.equal(elements['rolling-current-value'].textContent,'話し声');
 send('Music',1300,music);send('Music',1900,music);
 assert.equal(elements['rolling-current-value'].textContent,'話し声','normal label locked for 2s');
 send('Speech',2000,speech);send('Music',2500,music);send('Music',3050,music);
 assert.equal(elements['rolling-current-value'].textContent,'話し声','not before previous label is 2s old');
 send('Music',3200,music);assert.equal(elements['rolling-current-value'].textContent,'音楽');
 send('Speech',3300,speech,horn.en,horn);
 assert.equal(elements['rolling-current-value'].textContent,'車のクラクション','traffic warning takes priority instantly');
 assert.equal(elements['rolling-current-value'].dataset.warning,'true');
 events['tsg:warning']({detail:{start:3,end:3.5,label:horn.en,labels:horn}});
 events['tsg:visual']({detail:{time:3.6,rms:.02}});
 assert.equal(elements['rolling-events'].textContent,'車のクラクション');
 document.documentElement.lang='zh-CN';events['tsg:language']();
 assert.equal(elements['rolling-current-value'].textContent,'汽车喇叭');
 assert.equal(elements['rolling-events'].textContent,'汽车喇叭');
 assert.equal(elements['rolling-heading'].textContent,'最近10秒声音');
 assert.match(elements['rolling-note'].textContent,/不保存音频/);
 document.documentElement.lang='en';events['tsg:language']();
 assert.equal(elements['rolling-current-value'].textContent,horn.en);
 assert.equal(elements['rolling-events'].textContent,horn.en);
 send('Speech',4000,speech);send('Speech',5000,speech);
 assert.equal(elements['rolling-current-value'].textContent,horn.en);
 send('Speech',5400,speech);
 assert.equal(elements['rolling-current-value'].textContent,'Speech','normal prediction resumes after warning display hold');
 events['tsg:reset']();
 assert.equal(elements['rolling-current-value'].textContent,'Not started');
 assert.equal(elements['rolling-events'].textContent,'No recent detections');
 assert.equal(elements['rolling-current-value'].dataset.warning,'false');
});

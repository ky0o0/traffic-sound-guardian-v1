import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
test('V1.6 keeps a single microphone/classifier pipeline and adds read-only 10s visualization',()=>{
 const html=file('./index.html'),app=file('./app.js'),timeline=file('./live-timeline.js');
 assert.match(html,/id="rolling-waveform"/);
 assert.match(html,/live-timeline\.js\?v=1\.6\.7/);
 assert.match(app,/tsg:visual/);
 assert.match(app,/tsg:warning/);
 assert.match(app,/completedFrame\.endTime - 0\.975/);
 assert.match(timeline,/spanSeconds = 10/);
 assert.match(timeline,/levels\.length>450/);
 assert.doesNotMatch(timeline,/\bgetUserMedia\s*\(|\bnew\s+AudioContext\s*\(|\bMediaRecorder\s*\(|\bcreateObjectURL\s*\(|\bfetch\s*\(/i);
 assert.doesNotMatch(timeline,/localStorage|sessionStorage|indexedDB|sendBeacon/i);
});
test('V1.6 theme selector is shared by all three pages, with system preference',()=>{
 const theme=file('./theme.js');
 for(const page of ['index.html','ai-test.html','microphone-test.html']){
   assert.match(file('./'+page),/theme\.js\?v=1\.6\.0/);
   assert.match(file('./'+page),/theme\.css\?v=1\.6\.0/);
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

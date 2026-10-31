// iPad V3: true RMS-based dBFS axis, plot bounds, warning-only red strokes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('./live-timeline.js',import.meta.url),'utf8');
const html = name => fs.readFileSync(new URL(name,import.meta.url),'utf8');
function boot(isIpad=true) {
 const events={},strokes=[],labels=[],fills=[],clips=[];
 let clipped=false;
 const ctx={
   beginPath(){this.path=[];},moveTo(x,y){this.path.push([x,y]);},
   lineTo(x,y){this.path.push([x,y]);},
   rect(x,y,w,h){clips.push([x,y,w,h]);},
   save(){},clip(){clipped=true;},restore(){clipped=false;},
   setTransform(){},clearRect(){},
   stroke(){strokes.push({color:this.strokeStyle,points:[...this.path],clipped});},
   fillText(t,x,y){labels.push({text:String(t),x,y});},
   fillRect(...args){fills.push(args);}
 };
 const nodes={
  'rolling-waveform':{clientWidth:360,clientHeight:170,width:0,height:0,getContext(){return ctx;},setAttribute(k,v){this[k]=v;}},
  'rolling-events':{textContent:''},'rolling-heading':{textContent:''},
  'rolling-note':{textContent:''},'rolling-current-label':{textContent:''},
  'rolling-current-value':{textContent:'',dataset:{}}
 };
 const document={body:{classList:{contains(name){return isIpad&&name==='ipad-test';}}},
  documentElement:{lang:'ja',dataset:{theme:'light'}},getElementById:key=>nodes[key]||null};
 const window={devicePixelRatio:2,addEventListener(name,fn){events[name]=fn;}};
 class Observer{observe(){}}
 const context=vm.createContext({document,window,Math,Number,String,MutationObserver:Observer});
 vm.runInContext(source,context);
 return {context,events,strokes,labels,fills,clips,nodes,document};
}
test('iPad uses exact digital RMS-to-dBFS relationship with safe silence floor',()=>{
 const a=boot();
 const db=x=>vm.runInContext('dbfsFromRms('+x+')',a.context);
 assert.equal(db(1),0,'full-scale RMS is 0 dBFS');
 assert.ok(Math.abs(db(.1)+20)<1e-9,'.1 RMS is -20 dBFS');
 assert.ok(Math.abs(db(.01)+40)<1e-9,'.01 RMS is -40 dBFS');
 assert.equal(db(0),-90,'silence is pinned to floor and never negative infinity');
 assert.equal(db(1e-9),-90,'below-display floor remains finite');
 assert.equal(db(2),0,'unexpected >1 value is clipped rather than exceeding 0 dBFS');
 assert.ok(a.labels.some(x=>x.text==='dBFS'));
 assert.ok(a.labels.some(x=>x.text==='-90'));
 assert.ok(a.nodes['rolling-waveform']['aria-label'].includes('dBFS'));
 assert.match(a.nodes['rolling-note'].textContent,/dB SPL/,'label avoids implying calibrated environmental dB');
});
test('the iPad graph is clipped inside axis margins; warning only recolors measured line',()=>{
 const a=boot();
 const add=(time,rms)=>a.events['tsg:visual']({detail:{time,rms}});
 for(const [t,r] of [[9.45,0],[9.5,.01],[9.6,.5],[9.7,1],[9.8,.02],[10.1,.000001]])
   add(t,r);
 a.events['tsg:warning']({detail:{start:9.55,end:9.75,label:'Bicycle bell'}});
 const audible=a.strokes.filter(x=>x.clipped&&['#6887a0','#c5223b'].includes(x.color));
 assert.ok(audible.some(x=>x.color==='#c5223b'),'warning segment is red');
 assert.ok(audible.some(x=>x.color==='#6887a0'),'normal segment stays blue');
 assert.equal(a.fills.length,0,'never fills a warning time rectangle');
 assert.ok(a.clips.length>0,'actual Canvas2D clip protects labels');
 const [left,top,width,height]=a.clips.at(-1);
 assert.ok(left>=45&&top>=15&&width>100&&height>50);
 for(const segment of audible)
   for(const [x,y] of segment.points) {
     assert.ok(Number.isFinite(x)&&Number.isFinite(y));
     assert.ok(x>=left-0.01&&x<=left+width+0.01,'sound is within horizontal plot');
     assert.ok(y>=top-0.01&&y<=top+height+0.01,'peaks do not intrude into footer or x ticks');
   }
 assert.ok(a.labels.some(x=>x.text==='-10s'));
 assert.ok(a.labels.some(x=>x.text==='-5s'));
 assert.ok(a.labels.some(x=>x.text==='Now'));
 a.document.documentElement.dataset.theme='dark';
 add(10.2,.05);
 assert.ok(a.strokes.some(x=>x.color==='#ff596b'),'dark mode flagged curve becomes red');
 assert.ok(a.strokes.some(x=>x.color==='#91bad0'),'dark mode normal curve stays blue');
 a.document.documentElement.lang='zh-CN';a.events['tsg:language']();
 assert.match(a.nodes['rolling-note'].textContent,/dBFS/);
 assert.match(a.nodes['rolling-note'].textContent,/不是经过校准/);
 a.document.documentElement.lang='en';a.events['tsg:language']();
 assert.match(a.nodes['rolling-note'].textContent,/not calibrated environmental dB SPL/);
 a.events['tsg:reset']();
 assert.equal(a.nodes['rolling-events'].textContent,'No recent detections');
});
test('formal site stays in original symmetrical RMS waveform mode; only iPad opts into dBFS',()=>{
 const regular=boot(false);
 const ipad=boot(true);
 assert.ok(!regular.labels.some(x=>x.text==='dBFS'));
 assert.ok(ipad.labels.some(x=>x.text==='dBFS'));
 assert.match(regular.nodes['rolling-note'].textContent,/音声は保存しません/);
 const a=html('./ipad-test.html'),b=html('./index.html'),css=html('./ipad-test.css');
 assert.match(a,/live-timeline\.js\?v=1\.6\.14/);
 assert.match(b,/live-timeline\.js\?v=1\.6\.13/);
 assert.match(a,/ipad-test\.css\?v=4/);
 assert.match(css,/\.ipad-center \.rolling-panel\{/);
 assert.match(css,/height:clamp\(260px,40dvh,350px\)/);
 assert.match(css,/minmax\(110px,1fr\)/);
});

// iPad V3: restored symmetric visually amplified waveform, mirrored positive % axis.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./live-timeline.js',import.meta.url),'utf8');
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
function boot(ipad=true){
 const events={},strokes=[],labels=[],rects=[],fills=[];let clipped=false;
 const ctx={
  beginPath(){this.path=[];},moveTo(x,y){this.path.push([x,y]);},
  lineTo(x,y){this.path.push([x,y]);},
  rect(...r){rects.push(r);},
  save(){},clip(){clipped=true;},restore(){clipped=false;},
  setTransform(){},clearRect(){},
  stroke(){strokes.push({color:this.strokeStyle,points:[...this.path],clipped});},
  fillText(value,x,y){labels.push({text:String(value),x,y});},
  fillRect(...args){fills.push(args);}
 };
 const nodes={
  'rolling-waveform':{clientWidth:360,clientHeight:170,width:0,height:0,getContext(){return ctx;},setAttribute(name,v){this[name]=v;}},
  'rolling-events':{textContent:''},'rolling-heading':{textContent:''},'rolling-note':{textContent:''},
  'rolling-current-label':{textContent:''},'rolling-current-value':{textContent:'',dataset:{}}
 };
 const document={body:{classList:{contains(name){return ipad&&name==='ipad-test';}}},
  documentElement:{lang:'ja',dataset:{theme:'light'}},getElementById:name=>nodes[name]||null};
 const window={devicePixelRatio:2,addEventListener(type,fn){events[type]=fn;}};
 class Observer{observe(){}}
 const context=vm.createContext({document,window,Math,Number,String,MutationObserver:Observer});
 vm.runInContext(source,context);
 return {context,events,strokes,labels,rects,fills,nodes,document};
}
test('relative visual amplitude is 0-100%, never negative and matches the original soft-limited waveform gain',()=>{
 const a=boot();
 const visual=rms=>vm.runInContext('visualAmplitude('+rms+')',a.context);
 assert.equal(visual(0),0);
 assert.ok(visual(.005)>0&&visual(.005)<visual(.08));
 assert.ok(Math.abs(visual(.08)-Math.tanh(Math.pow(.08,.65)*11.5))<1e-12);
 assert.equal(visual(-3),0);
 assert.ok(visual(100)<=1);
 const ticks=a.labels.map(x=>x.text);
 for(const tick of ['100%','50%','0%'])assert.ok(ticks.includes(tick),tick+' displayed');
 assert.equal(ticks.filter(x=>x==='100%').length,2,'upper and lower axis both positive 100%');
 assert.equal(ticks.filter(x=>x==='50%').length,2);
 assert.equal(ticks.filter(x=>x==='0%').length,1);
 assert.ok(!ticks.includes('-100%')&&!ticks.includes('-50%'));
 assert.ok(!ticks.includes('dBFS'));
 assert.match(a.nodes['rolling-note'].textContent,/音量の実測値ではありません/);
 assert.match(a.nodes['rolling-waveform']['aria-label'],/0–100%/);
});
test('iPad mirrored waveform is clipped; only actual warning waveform strokes red',()=>{
 const a=boot();
 const add=(time,rms)=>a.events['tsg:visual']({detail:{time,rms}});
 for(const [t,r] of [[9.45,0],[9.5,.01],[9.6,.5],[9.7,1],[9.8,.02],[10.1,.000001]])add(t,r);
 a.events['tsg:warning']({detail:{start:9.55,end:9.75,label:'Bicycle bell'}});
 const samples=a.strokes.filter(x=>x.clipped&&['#6887a0','#c5223b'].includes(x.color));
 assert.ok(samples.some(x=>x.color==='#c5223b'),'warning stroke red');
 assert.ok(samples.some(x=>x.color==='#6887a0'),'normal stroke blue');
 assert.equal(a.fills.length,0,'never fill warning area');
 const [left,top,width,height]=a.rects.at(-1);
 assert.ok(left>=45&&top>=15&&width>100&&height>50);
 const center=top+height/2;
 for(const segment of samples){
   assert.equal(segment.points.length,2,'each sample is a symmetric vertical stroke');
   const [[x1,y1],[x2,y2]]=segment.points;
   assert.equal(x1,x2,'same X for two halves');
   assert.ok(Math.abs((y1+y2)/2-center)<1e-7,'symmetrically mirrored about zero');
   for(const [x,y] of segment.points){
     assert.ok(Number.isFinite(x)&&Number.isFinite(y));
     assert.ok(x>=left&&x<=left+width,'X within axes');
     assert.ok(y>=top&&y<=top+height,'Y cannot obscure legends');
   }
 }
 for(const text of ['-10s','-5s','Now'])assert.ok(a.labels.some(x=>x.text===text));
 a.document.documentElement.dataset.theme='dark';
 add(10.2,.05);
 assert.ok(a.strokes.some(x=>x.color==='#ff596b'),'red warning in dark mode');
 assert.ok(a.strokes.some(x=>x.color==='#91bad0'),'normal in dark mode');
 a.document.documentElement.lang='zh-CN';a.events['tsg:language']();
 assert.match(a.nodes['rolling-note'].textContent,/上下镜像0～100%/);
 assert.match(a.nodes['rolling-note'].textContent,/不代表实际音量/);
 a.document.documentElement.lang='en';a.events['tsg:language']();
 assert.match(a.nodes['rolling-note'].textContent,/not measured loudness/);
 a.events['tsg:reset']();
 assert.equal(a.nodes['rolling-events'].textContent,'No recent detections');
});
test('formal page keeps its old waveform without a percent axis; only iPad adds it',()=>{
 const ordinary=boot(false),ipad=boot(true);
 assert.ok(!ordinary.labels.some(x=>x.text==='100%'));
 assert.ok(ipad.labels.some(x=>x.text==='100%'));
 assert.match(ordinary.nodes['rolling-note'].textContent,/音声は保存しません/);
 const main=read('./index.html'),page=read('./ipad-test.html'),css=read('./ipad-test.css');
 assert.match(main,/live-timeline\.js\?v=1\.6\.13/);
 assert.match(page,/live-timeline\.js\?v=1\.6\.15/);
 assert.match(page,/ipad-test\.css\?v=4/);
 assert.match(css,/height:clamp\(260px,40dvh,350px\)/);
 assert.doesNotMatch(source,/dbfsFromRms|drawIpadDbfs|DBFS_FLOOR/);
});

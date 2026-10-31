// Preserve the V3 symmetric waveform and gain curve, with reserved X-axis space.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const src=read('./live-timeline.js');
const ipad=read('./ipad-test.html');
const main=read('./index.html');
function init(){
 const events={},lines=[],texts=[],fills=[];
 const c={path:[],beginPath(){this.path=[];},moveTo(x,y){this.path.push([x,y]);},
   lineTo(x,y){this.path.push([x,y]);},stroke(){lines.push({color:this.strokeStyle,points:[...this.path]});},
   save(){},restore(){},rect(){},clip(){},setTransform(){},clearRect(){},fillRect(...xs){fills.push(xs);},fillText(t){texts.push(t);}};
 const nodes={
  'rolling-waveform':{clientWidth:380,clientHeight:150,width:0,height:0,getContext(){return c;},setAttribute(){}},
  'rolling-events':{textContent:''},'rolling-heading':{textContent:''},'rolling-note':{textContent:''},
  'rolling-current-label':{textContent:''},'rolling-current-value':{textContent:'',dataset:{}}
 };
 const document={documentElement:{lang:'ja',dataset:{theme:'light'}},body:{classList:{contains:x=>x==='ipad-test'}},getElementById:id=>nodes[id]||null};
 const window={devicePixelRatio:2,addEventListener(t,fn){events[t]=fn;}};
 class Observer{observe(){}}
 vm.runInNewContext(src,{document,window,MutationObserver:Observer,Math,Number,String});
 return {events,lines,texts,fills,nodes,document};
}
test('iPad and production retain the symmetric waveform without either experimental Y-axis',()=>{
 assert.doesNotMatch(src,/ipadDbfsMode|ipadPercentMode|drawIpadDbfs|drawIpadPercent|dbfsFromRms|visualAmplitude/);
 assert.match(src,/const center = \(plotTop \+ plotBottom\) \/ 2;/);
 assert.match(src,/const amp = Math\.tanh\(Math\.pow\(p\.rms, 0\.65\) \* 11\.5\) \* maxAmplitude;/);
 assert.match(src,/c\.moveTo\(x,center-amp\); c\.lineTo\(x,center\+amp\)/);
 assert.match(ipad,/live-timeline\.js\?v=1\.6\.17/);
 assert.match(main,/live-timeline\.js\?v=1\.6\.17/);
 assert.match(ipad,/ipad-test\.css\?v=6/);
 assert.match(ipad,/V1\.6\.13 · iPad TEST/);
 const css=read('./ipad-test.css');
 assert.match(css,/height:clamp\(205px,36dvh,315px\)/);
 assert.match(css,/minmax\(85px,1fr\)/);
 const a=init();
 assert.equal(a.texts.filter(x=>x==='dBFS'||x==='100%'||x==='50%'||x==='0%').length,0);
 assert.ok(a.texts.includes('-10s')&&a.texts.includes('-5s')&&a.texts.includes('Now'));
 assert.match(a.nodes['rolling-note'].textContent,/音声は保存しません/);
});
test('restored waveform draws the real symmetric amplitude with warning-only red strokes and no filled bands',()=>{
 const a=init();
 for(const [time,rms] of [[9.4,.03],[9.6,.05],[9.8,.15],[10.0,.07],[10.2,.02]])
   a.events['tsg:visual']({detail:{time,rms}});
 a.events['tsg:warning']({detail:{start:9.55,end:9.95,label:'Bicycle bell'}});
 const samples=a.lines.filter(x=>x.color==='#6887a0'||x.color==='#c5223b');
 assert.ok(samples.some(x=>x.color==='#c5223b'));
 assert.ok(samples.some(x=>x.color==='#6887a0'));
 assert.equal(a.fills.length,0,'warning only colors the waveform, not the chart background');
 for(const sample of samples){
   assert.equal(sample.points.length,2);
   const [[x1,y1],[x2,y2]]=sample.points;
   assert.equal(x1,x2);
   assert.ok(Math.abs((y1+y2)/2-66)<1e-8,'symmetric inside the plot above the time labels');
   assert.ok(y1>=0&&y2<=150,'peaks stay within the canvas');
 }
 a.document.documentElement.dataset.theme='dark';
 a.events['tsg:visual']({detail:{time:10.3,rms:.04}});
 assert.ok(a.lines.some(x=>x.color==='#ff596b'));
 assert.ok(a.lines.some(x=>x.color==='#91bad0'));
});

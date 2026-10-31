// iPad-only manual alert preview lifecycle, with a fake Web Audio output graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./alert-tone-preview.js',import.meta.url),'utf8');
const html=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
function boot({audio=true}={}){
 const events={},docEvents={},buttonListeners={},timers=[],oscillators=[],contexts=[];
 const nodes={
  'alert-preview-button':{disabled:false,textContent:'',addEventListener(type,fn){buttonListeners[type]=fn;}},
  'alert-preview-note':{textContent:''},
  'alert-preview-status':{textContent:''}
 };
 class Context{
  constructor(){this.currentTime=10;this.destination={};this.state='running';this.closed=false;contexts.push(this);}
  resume(){this.resumed=true;return Promise.resolve();}
  close(){this.closed=true;return Promise.resolve();}
  createOscillator(){
   const o={type:null,frequency:{value:null},started:[],stopped:[],
     connect(dest){this.output=dest;},disconnect(){this.disconnected=true;},
     start(time){this.started.push(time);},stop(time){this.stopped.push(time);}};
   oscillators.push(o);return o;
  }
  createGain(){
   return {gain:{events:[],setValueAtTime(v,t){this.events.push(['set',v,t]);},
     linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);}},
     connect(dest){this.output=dest;},disconnect(){this.disconnected=true;}};
  }
 }
 const document={documentElement:{lang:'ja'},hidden:false,
  getElementById(id){return nodes[id]??null;},
  addEventListener(type,fn){docEvents[type]=fn;}};
 const window={addEventListener(type,fn){events[type]=fn;}};
 if(audio)window.AudioContext=Context;
 const context=vm.createContext({document,window,console:{warn(){}},
  setTimeout(fn,time){const id={fn,time};timers.push(id);return id;},
  clearTimeout(id){id.cleared=true;},Promise});
 vm.runInContext(source,context);
 return {document,events,docEvents,buttonListeners,nodes,timers,oscillators,contexts};
}
test('preview exists exclusively on iPad and never starts mic, real warning, or inference',()=>{
 const main=html('./index.html'),ipad=html('./ipad-test.html'),css=html('./ipad-test.css');
 assert.match(ipad,/id="alert-preview-button"/);
 assert.match(ipad,/alert-tone-preview\.js\?v=1\.6\.15/);
 assert.doesNotMatch(main,/alert-preview-button|alert-tone-preview\.js/);
 assert.match(css,/#alert-preview-button\{[^}]*min-height:44px/);
 assert.doesNotMatch(source,/getUserMedia|AudioWorklet|classifier|tsg:warning|data-state|localStorage/);
});
test('manual user click plays exactly the normal two quiet sine beeps through output only',()=>{
 const a=boot();
 assert.equal(a.contexts.length,0,'must not autoplay');
 assert.equal(a.nodes['alert-preview-button'].textContent,'通知音を試聴');
 a.buttonListeners.click();
 assert.equal(a.contexts.length,1);
 assert.equal(a.contexts[0].resumed,true);
 assert.equal(a.oscillators.length,2);
 assert.ok(a.nodes['alert-preview-button'].disabled);
 for(let i=0;i<2;i++){
  const osc=a.oscillators[i];
  assert.equal(osc.type,'sine');
  assert.equal(osc.frequency.value,740);
  assert.equal(osc.started[0],10+.02+i*.195);
  assert.ok(Math.abs((osc.stopped[0]-osc.started[0])-.11)<1e-10);
  assert.equal(osc.output.gain.events[1][1],.045);
 }
 assert.ok(Math.abs((a.oscillators[1].started[0]-a.oscillators[0].stopped[0])-.085)<1e-10);
 a.buttonListeners.click();assert.equal(a.contexts.length,1,'second click while playing is ignored');
 a.timers[0].fn();
 assert.equal(a.contexts[0].closed,true,'close temporary output Context after sound');
 assert.equal(a.nodes['alert-preview-button'].disabled,false);
 assert.equal(a.nodes['alert-preview-status'].textContent,'再生完了');
});
test('pagehide and background visibility always release preview audio and multilingual labels update',()=>{
 const a=boot();
 a.document.documentElement.lang='zh-CN';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-button'].textContent,'试听提示音');
 a.buttonListeners.click();
 a.events.pagehide();
 assert.equal(a.contexts[0].closed,true);
 assert.equal(a.nodes['alert-preview-button'].disabled,false);
 a.document.documentElement.lang='en';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-button'].textContent,'Play alert sound');
 a.buttonListeners.click();
 a.document.hidden=true;a.docEvents.visibilitychange();
 assert.equal(a.contexts[1].closed,true);
});
test('missing Web Audio supports graceful failure without permissions or fake playback',()=>{
 const a=boot({audio:false});
 a.buttonListeners.click();
 assert.equal(a.contexts.length,0);
 assert.equal(a.nodes['alert-preview-status'].textContent,'この端末では再生できません。');
});

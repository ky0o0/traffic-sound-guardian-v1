// Shared Settings manual alert preview lifecycle, with a fake Web Audio output graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./alert-tone-preview.js',import.meta.url),'utf8');
const html=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
function boot({audio=true,nav={}}={}){
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
 const window={navigator:nav,addEventListener(type,fn){events[type]=fn;}};
 if(audio)window.AudioContext=Context;
 const context=vm.createContext({document,window,console:{warn(){}},
  setTimeout(fn,time){const id={fn,time};timers.push(id);return id;},
  clearTimeout(id){id.cleared=true;},Promise});
 vm.runInContext(source,context);
 return {document,events,docEvents,buttonListeners,nodes,timers,oscillators,contexts};
}
test('preview exists only inside Settings on both pages and never starts microphone or inference',async()=>{
 const main=html('./index.html'),ipad=html('./ipad-test.html'),css=html('./guardian.css');
 for(const markup of [main,ipad]) {
  assert.match(markup,/id="alert-preview-button"/);
  assert.match(markup,/<script (?=[^>]*type="module")(?=[^>]*src="\.\/alert-tone-preview\.js\?v=1\.8\.0")[^>]*><\/script>/);
  assert.ok(markup.indexOf('id="alert-preview-button"')>markup.indexOf('id="settings-content"'));
  if (markup === main) assert.ok(markup.indexOf('id="alert-preview-button"')<markup.indexOf('</details>',markup.indexOf('id="settings-content"')));
  else assert.ok(!markup.includes('id="settings-panel"'));
  assert.equal([...markup.matchAll(/id="alert-preview-button"/g)].length,1);
 }
 for(const [name,markup] of [['standard',main],['iPad',ipad]]) {
  const opened=[...markup.matchAll(/<script\b/gi)].length;
  const closed=[...markup.matchAll(/<\/script>/gi)].length;
  assert.equal(opened,closed,name+' must close every script tag with a complete </script>');
 }
 assert.match(css,/button,select\{min-height:44px/);
 assert.match(css,/\.alert-preview button\{width:100%/);
 assert.doesNotMatch(source,/getUserMedia|AudioWorklet|classifier|tsg:warning|data-state/);
});
test('manual user click plays exactly the normal two quiet sine beeps through output only',async()=>{
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
  assert.equal(osc.output.gain.events[1][1],.09);
 }
 assert.ok(Math.abs((a.oscillators[1].started[0]-a.oscillators[0].stopped[0])-.085)<1e-10);
 a.buttonListeners.click();assert.equal(a.contexts.length,1,'second click while playing is ignored');
 assert.equal(a.timers[0].time,3000,'watchdog must not stop still-playing Safari audio at a fixed 700ms');
 a.contexts[0].currentTime=10+.02+.195+.11;
 a.oscillators[1].onended(); await new Promise(r=>setImmediate(r));
 assert.equal(a.contexts[0].closed,true,'close temporary output Context after the second oscillator ends');
 assert.equal(a.timers[0].cleared,true,'completion cancels the fallback watchdog');
 assert.equal(a.nodes['alert-preview-button'].disabled,false);
 assert.equal(a.nodes['alert-preview-status'].textContent,'再生完了');
});
test('pagehide and background visibility always release preview audio and multilingual labels update',async()=>{
 const a=boot();
 a.document.documentElement.lang='zh-CN';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-button'].textContent,'试听提示音');
 a.buttonListeners.click();
 a.events.pagehide(); await new Promise(r=>setImmediate(r));
 assert.equal(a.contexts[0].closed,true);
 assert.equal(a.nodes['alert-preview-button'].disabled,false);
 assert.equal(a.nodes['alert-preview-status'].textContent,'','a hidden page cannot claim to be playing');
 a.document.documentElement.lang='en';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-button'].textContent,'Play alert sound');
 a.buttonListeners.click();
 a.document.hidden=true;a.docEvents.visibilitychange(); await new Promise(r=>setImmediate(r));
 assert.equal(a.contexts[1].closed,true);
 assert.equal(a.nodes['alert-preview-status'].textContent,'');
});
test('missing Web Audio supports graceful failure without permissions or fake playback',async()=>{
 const a=boot({audio:false});
 a.buttonListeners.click();
 assert.equal(a.contexts.length,0);
 assert.equal(a.nodes['alert-preview-status'].textContent,'この端末では再生できません。');
});

test('Safari suspended AudioContext cannot claim successful beep playback',async()=>{
 const a=boot();
 a.buttonListeners.click();
 a.contexts[0].state='suspended';
 a.timers[0].fn(); await new Promise(r=>setImmediate(r));
 assert.equal(a.contexts[0].closed,true);
 assert.equal(a.nodes['alert-preview-button'].disabled,false);
 assert.equal(a.nodes['alert-preview-status'].textContent,'この端末では再生できません。');
 assert.equal(a.oscillators[1].onended,null,'cleanup removes stale onended callback');
});

test('fallback accepts actual elapsed AudioContext time when onended is missing',async()=>{
 const a=boot();
 a.buttonListeners.click();
 a.contexts[0].currentTime=10+.02+.195+.11+0.01;
 a.timers[0].fn(); await new Promise(r=>setImmediate(r));
 assert.equal(a.contexts[0].closed,true);
 assert.equal(a.nodes['alert-preview-status'].textContent,'再生完了');
});


test('preview status translates during playback and after completion without replaying',async()=>{
 const a=boot();a.buttonListeners.click();a.document.documentElement.lang='en';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-status'].textContent,'Playing…');
 a.contexts[0].currentTime=11;a.oscillators[1].onended(); await new Promise(r=>setImmediate(r));
 a.document.documentElement.lang='zh-CN';a.events['tsg:language']();
 assert.equal(a.nodes['alert-preview-status'].textContent,'播放完成');assert.equal(a.contexts.length,1);
});
test('early final callback cannot report success without advancing the audio clock',async()=>{
 const a=boot();a.buttonListeners.click();a.oscillators[1].onended(); await new Promise(r=>setImmediate(r));
 assert.equal(a.nodes['alert-preview-status'].textContent,'この端末では再生できません。');
 assert.equal(a.contexts[0].closed,true);
});
test('preview cleanup consumes rejected asynchronous context close',async()=>{
 const a=boot();a.buttonListeners.click();a.contexts[0].close=()=>Promise.reject(new Error('interrupted close'));
 a.events.pagehide(); await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(a.nodes['alert-preview-button'].disabled,false);assert.equal(a.nodes['alert-preview-status'].textContent,'');
});

test('manual preview uses the exact selected gain level without accessing mic',async()=>{
 const a=boot();
 a.events['tsg:alert-volume']({detail:{level:'clear'}});
 a.buttonListeners.click();
 assert.equal(a.oscillators[0].output.gain.events[1][1],.15);
 assert.equal(a.oscillators[1].output.gain.events[1][1],.15);
 a.contexts[0].currentTime=11;a.oscillators[1].onended(); await new Promise(r=>setImmediate(r));
 a.events['tsg:alert-volume']({detail:{level:'soft'}});
 a.buttonListeners.click();
 assert.equal(a.oscillators[2].output.gain.events[1][1],.045);
 assert.equal(a.contexts.length,2);
 a.events.pagehide(); await new Promise(r=>setImmediate(r));
});


test('ambient policy precedes output Context, restores after close, and never selects transient-solo',async()=>{
 const audioSession={type:'auto'};const a=boot({nav:{audioSession,userAgent:'iPad'}});
 a.buttonListeners.click();assert.equal(audioSession.type,'ambient');assert.equal(a.contexts.length,1);
 a.events.pagehide();assert.equal(a.nodes['alert-preview-button'].disabled,true);
 a.buttonListeners.click();assert.equal(a.contexts.length,1,'no new Context while native close is pending');
 await new Promise(r=>setImmediate(r));assert.equal(audioSession.type,'auto');
});
test('unsupported or rejected AudioSession on Apple stays silent before Context construction',()=>{
 for(const nav of [{userAgent:'iPad'},{platform:'MacIntel',maxTouchPoints:5},{userAgent:'iPhone',audioSession:{get type(){return 'auto'},set type(v){throw Error('unsupported')}}}]){
  const a=boot({nav});a.buttonListeners.click();assert.equal(a.contexts.length,0);assert.match(a.nodes['alert-preview-status'].textContent,/API/);
 }
});
test('capture handoff cancels preview, restores policy and blocks preview during detection',async()=>{
 const audioSession={type:'auto'};const a=boot({nav:{audioSession}});a.buttonListeners.click();
 a.events['tsg:capture']({detail:{active:true}});assert.equal(audioSession.type,'auto');
 await new Promise(r=>setImmediate(r));a.buttonListeners.click();assert.equal(a.contexts.length,1);
 a.events['tsg:capture']({detail:{active:false}});a.buttonListeners.click();assert.equal(a.contexts.length,2);a.events.pagehide();
});

test('ignored ambient setter and exclusive sessions stay silent before Context construction',()=>{
 for(const audioSession of [{get type(){return 'auto'},set type(value){}},{type:'play-and-record'},{type:'playback'}]){
  const a=boot({nav:{audioSession,userAgent:'iPad'}});a.buttonListeners.click();assert.equal(a.contexts.length,0);
 }
});
test('capture during pending close restores policy immediately and a late close cannot overwrite capture',async()=>{
 const audioSession={type:'auto'};const a=boot({nav:{audioSession}});a.buttonListeners.click();let resolveClose;
 a.contexts[0].close=()=>new Promise(resolve=>resolveClose=resolve);
 a.events.pagehide();assert.equal(audioSession.type,'ambient');
 a.events['tsg:capture']({detail:{active:true}});assert.equal(audioSession.type,'auto');
 audioSession.type='play-and-record';resolveClose();await new Promise(r=>setImmediate(r));
 assert.equal(audioSession.type,'play-and-record');assert.equal(a.contexts.length,1);
});

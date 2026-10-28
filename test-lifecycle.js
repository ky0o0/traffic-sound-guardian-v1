// Isolated controller tests with fake browser devices. This file is never imported
// by index.html; these fixtures do not replace real audio/model code in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { WarningGate } from './detection.js';
import { AudioWindowBuffer } from './audio-window.js';
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/project/app.js'");
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({deny=false,deferMic=false,suspended=false,worklet=false}={}) {
 const elements=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',setAttribute(){},addEventListener(name,fn){this[name]=fn;}});
  return elements.get(id);
 };
 const tracks=[],workers=[],contexts=[],nodes=[],timers=new Map(),events={};
 let now=0,nextTimer=0,micCalls=0,resolveMic,denied=deny;
 const makeStream=()=>{
  const track={readyState:'live',muted:false,stop(){this.readyState='ended';this.stopped=true;}};tracks.push(track);
  return {getTracks:()=>[track],getAudioTracks:()=>[track]};
 };
 const baseNode=()=>({connect(){},disconnect(){this.disconnected=true;}});
 class Context {
  constructor(){this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination={};contexts.push(this);if(worklet)this.audioWorklet={addModule:async()=>{}};}
  resume(){if(!suspended)this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createMediaStreamSource(){return baseNode();}
  createGain(){return {...baseNode(),gain:{value:1}};}
  createScriptProcessor(){const node=baseNode();nodes.push(node);return node;}
 }
 class WorkletNode {
  constructor(){Object.assign(this,baseNode());this.port={postMessage(){},close(){this.closed=true}};nodes.push(this);}
 }
 class ModelWorker {
  constructor(){workers.push(this);this.sent=[];}
  postMessage(data){this.sent.push(data);if(data.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
  terminate(){this.terminated=true;}
  emit(data){this.onmessage?.({data});}
 }
 const document={hidden:false,body:{dataset:{}},getElementById:element,addEventListener(name,fn){events[name]=fn;}};
 const context=vm.createContext({WarningGate,AudioWindowBuffer,Float32Array,URL,DOMException,console:{error(){},warn(){}},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms,interval:true});return id;},clearInterval:id=>timers.delete(id),
  performance:{now:()=>now},document,Worker:ModelWorker,...(worklet?{AudioWorkletNode:WorkletNode}:{}),
  window:{isSecureContext:true,AudioContext:Context,addEventListener(name,fn){events[name]=fn;}},
  navigator:{mediaDevices:{getUserMedia(){micCalls++;if(denied)return Promise.reject(new DOMException('denied','NotAllowedError'));
    if(deferMic)return new Promise(resolve=>{resolveMic=()=>resolve(makeStream());});return Promise.resolve(makeStream());}}}
 });
 vm.runInContext(source,context);await flush();await flush();
 return {document,elements,tracks,workers,contexts,nodes,timers,events,context,
  calls:()=>micCalls,allow:()=>denied=false,resolveMic:()=>resolveMic(),now:n=>now=n,
  run:code=>vm.runInContext(code,context),click:()=>element('action').click(),stop:()=>vm.runInContext('stop()',context),
  emit:(sequence,target=null)=>workers.at(-1).emit({type:'result',sequence,target}),
  frame(sequence=1){context.frameData={sequence,samples:new Float32Array(46800),endTime:contexts.at(-1).currentTime};vm.runInContext('receiveFrame(session, frameData)',context);}
 };
}

test('listening appears only after both live capture and a model result',async()=>{
 const h=await harness();assert.equal(h.document.body.dataset.state,'priming');
 h.frame();assert.equal(h.document.body.dataset.state,'priming');
 h.emit(1);assert.equal(h.document.body.dataset.state,'listening');h.stop();
});
test('stop releases microphone, context, worker, timers; restart creates one session',async()=>{
 const h=await harness();h.stop();
 assert.ok(h.tracks[0].stopped);assert.equal(h.contexts[0].state,'closed');assert.ok(h.workers[0].terminated);assert.equal(h.timers.size,0);
 h.click();await flush();assert.equal(h.calls(),2);assert.equal(h.document.body.dataset.state,'priming');h.stop();
});
test('permission denial is Japanese stopped state and can be retried',async()=>{
 const h=await harness({deny:true});assert.equal(h.document.body.dataset.state,'stopped');
 assert.match(h.elements.get('description').textContent,/マイクの使用が許可/);
 h.allow();h.click();await flush();assert.equal(h.document.body.dataset.state,'priming');h.stop();
});
test('late microphone permission after cancel immediately stops its track',async()=>{
 const h=await harness({deferMic:true});h.stop();h.resolveMic();await flush();
 assert.equal(h.tracks[0].stopped,true);assert.equal(h.document.body.dataset.state,'stopped');
});
test('repeated taps during pending auto startup resume one context and one worker',async()=>{
 const h=await harness({deferMic:true,suspended:true});
 h.click();h.click();assert.equal(h.calls(),1);assert.equal(h.workers.length,1);assert.equal(h.contexts.length,1);
 h.stop();h.resolveMic();await flush();
});
test('backgrounding and track end stop rather than falsely stay listening',async()=>{
 const h=await harness();h.frame();h.emit(1);h.document.hidden=true;h.events.visibilitychange();
 assert.equal(h.document.body.dataset.state,'stopped');assert.ok(h.tracks[0].stopped);
 h.document.hidden=false;h.click();await flush();h.tracks.at(-1).onended();assert.equal(h.document.body.dataset.state,'stopped');
});
test('an audio interruption releases the running session',async()=>{
 const h=await harness();h.frame();h.emit(1);h.contexts[0].state='interrupted';h.contexts[0].onstatechange();
 assert.equal(h.document.body.dataset.state,'stopped');assert.ok(h.tracks[0].stopped);
});
test('inference watchdog stops when there is no new result',async()=>{
 const h=await harness();h.frame();h.emit(1);h.now(3100);
 [...h.timers.values()].find(t=>t.interval).fn();assert.equal(h.document.body.dataset.state,'stopped');
});
test('late worker results cannot restore a stopped UI',async()=>{
 const h=await harness();h.frame();h.stop();h.emit(1,{score:.99,label:'サイレン'});
 assert.equal(h.document.body.dataset.state,'stopped');
});
test('one pending frame only; dropped sequence breaks medium-score streak',async()=>{
 const h=await harness();h.frame(1);h.frame(2);h.frame(3);
 assert.equal(h.workers[0].sent.filter(x=>x.type==='classify').length,1);
 h.emit(1,{score:.6,label:'自転車のベル'});
 assert.equal(h.workers[0].sent.at(-1).sequence,3);
 h.emit(3,{score:.6,label:'サイレン'});assert.equal(h.document.body.dataset.state,'listening');h.stop();
});
test('worklet branch closes its port on stop',async()=>{
 const h=await harness({worklet:true});assert.equal(h.document.body.dataset.state,'priming');
 h.stop();assert.ok(h.nodes[0].port.closed);assert.ok(h.nodes[0].disconnected);
});
test('real controller warning timer returns to listening 3 seconds after last qualifying result',async()=>{
 const h=await harness();h.frame(1);h.emit(1,{score:.87,label:'車のクラクション'});
 assert.equal(h.document.body.dataset.state,'warning');assert.equal(h.elements.get('score').textContent,'0.87');
 h.now(2000);h.frame(2);h.emit(2);
 h.now(3000);[...h.timers.values()].find(t=>!t.interval).fn();
 assert.equal(h.document.body.dataset.state,'listening');h.stop();
});

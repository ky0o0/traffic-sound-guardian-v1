import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {microphoneMatch,browserTrackInfo,meterReading,micErrorCode} from './microphone-test-core.js';

const html=fs.readFileSync(new URL('./microphone-test.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./microphone-test.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'');
const requiredIds=['home-link','ai-link','language','device-select','device-hint','start',
  'stop','refresh','status','level','meter','meter-fill','track-label','device-match',
  'sample-rate','channels','context-rate','track-state','device-count'];
const allIds=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const tick=()=>new Promise(r=>setImmediate(r));

function harness({devices=[{kind:'audioinput',deviceId:'mic1',label:'iPhone Microphone'}],
  denied=false,deferred=false,secure=true,unavailable=false,settingsId='mic1',
  exposeSettings=true,trackLabel='iPhone Microphone'}={}){
  const elements=new Map(),events={},windowEvents={},calls=[],streams=[],contexts=[],frames=new Map();
  let pendingResolve=null,frameId=0;
  const makeElement=()=>{
    const x={value:'',textContent:'',dataset:{},style:{},attributes:{},children:[],
      disabled:false,setAttribute(k,v){this.attributes[k]=String(v)},
      addEventListener(type,fn){this[type]=fn},
      append(...items){this.children.push(...items)},
      replaceChildren(...items){this.children=[...items]}};
    return x;
  };
  const get=id=>{
    if(!allIds.has(id))throw new Error('Missing HTML id: '+id);
    if(!elements.has(id))elements.set(id,makeElement());
    return elements.get(id);
  };
  const document={hidden:false,documentElement:{lang:'ja'},getElementById:get,
    querySelectorAll(){return []},createElement:()=>makeElement(),
    addEventListener(type,fn){events[type]=fn}};
  const mediaDevices={
    getSupportedConstraints:()=>({deviceId:true}),
    enumerateDevices:async()=>devices,
    addEventListener(type,fn){this[type]=fn},
    getUserMedia(constraints){
      calls.push(constraints);
      if(denied)return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
      const makeStream=()=>{
        const track={readyState:'live',muted:false,label:trackLabel,
          getSettings:()=>exposeSettings?{deviceId:settingsId,sampleRate:16000,channelCount:1}:{},
          stop(){this.readyState='ended';this.stopped=true}};
        const stream={getTracks:()=>[track],getAudioTracks:()=>[track]}; streams.push(stream);return stream;
      };
      return deferred?new Promise(resolve=>{pendingResolve=()=>resolve(makeStream())}):Promise.resolve(makeStream());
    }
  };
  const node=()=>({connections:[],connect(n){this.connections.push(n)},
    disconnect(){this.disconnected=true}});
  class Context {
    constructor(){this.sampleRate=48000;this.destination={};this.state='suspended';contexts.push(this)}
    resume(){this.state='running';return Promise.resolve()}
    close(){this.state='closed';return Promise.resolve()}
    createMediaStreamSource(){return node()}
    createAnalyser(){return {...node(),fftSize:2048,getFloatTimeDomainData(out){out.fill(.1)}}}
    createGain(){return {...node(),gain:{value:1}}}
  }
  const window={isSecureContext:secure,AudioContext:Context,addEventListener(type,fn){windowEvents[type]=fn}};
  const context=vm.createContext({window,document,navigator:{mediaDevices:unavailable?null:mediaDevices},
    location:{href:'https://example.test/microphone-test.html?lang=zh-CN'},URL,
    Float32Array,microphoneMatch,browserTrackInfo,meterReading,micErrorCode,
    requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id},
    cancelAnimationFrame:id=>frames.delete(id),console});
  vm.runInContext(app,context);
  const flush=async()=>{await tick();await tick()};
  return {elements,events,windowEvents,calls,streams,contexts,frames,mediaDevices,document,context,
    get,flush,start:()=>get('start').click(),stop:()=>get('stop').click(),
    setChoice(id){get('device-select').value=id;get('device-select').change()},
    lang(id){get('language').value=id;get('language').change()},
    tickFrame(){const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn())},
    resolve:()=>pendingResolve?.()};
}
test('V1.6.0 diagnostic is independent and all DOM IDs are present',()=>{
  for(const id of requiredIds)assert.ok(allIds.has(id),id);
  assert.ok(html.includes('microphone-test.js?v=1.6.0'));
  assert.ok(html.includes('microphone-test.css?v=1.6.0'));
  assert.ok(!app.includes('yamnet.tflite'));
  assert.ok(!app.includes('MediaRecorder'));
  assert.ok(!app.includes('localStorage'));
  assert.ok(!app.includes('fetch('));
});
test('meter is digital relative level not dB SPL',()=>{
  assert.deepEqual(meterReading(new Float32Array(0)),{rms:0,dbfs:null,level:0});
  const result=meterReading(Float32Array.of(.1,.1,-.1,-.1));
  assert.ok(Math.abs(result.dbfs+20)<.00001);
  assert.ok(result.level>0 && result.level<100);
  assert.equal(meterReading(Float32Array.of(NaN,0)).rms,0);
});
test('request device identity is never assumed without track settings',()=>{
  const track={label:'AirPods',readyState:'live',muted:false,getSettings(){return {sampleRate:48000,channelCount:1}}};
  assert.equal(microphoneMatch('a',track), 'unknown');
  assert.equal(microphoneMatch('',track), 'automatic');
  assert.equal(browserTrackInfo(track,[],'a').sampleRate,48000);
  const selected={...track,getSettings(){return {deviceId:'b'}}};
  assert.equal(microphoneMatch('a',selected),'mismatch');
  assert.equal(microphoneMatch('b',selected),'reported-match');
  assert.equal(browserTrackInfo({...track,label:'',getSettings(){return {deviceId:'a'}}},
    [{kind:'audioinput',deviceId:'a',label:'Sony WH-1000XM6'}],'a').label,'Sony WH-1000XM6');
});
test('permission and microphone errors are categorized without exposing raw names',()=>{
  assert.equal(micErrorCode({name:'NotAllowedError'}),'denied');
  assert.equal(micErrorCode({name:'OverconstrainedError'}),'unsupportedSelection');
  assert.equal(micErrorCode({name:'NotReadableError'}),'busy');
  assert.equal(micErrorCode({name:'NotFoundError'}),'noDevice');
  assert.equal(micErrorCode({name:'SomethingElse'}),'otherError');
});
test('first load enumerates but never starts microphone without a gesture',async()=>{
 const h=harness();await h.flush();
 assert.equal(h.calls.length,0);
 assert.equal(h.contexts.length,0);
 assert.equal(h.get('device-count').textContent,'1');
 assert.equal(h.get('status').dataset.status,'idle');
 assert.equal(h.get('language').value,'zh-CN');
});
test('the user gesture starts local audio monitoring without playing audio back',async()=>{
 const h=harness();await h.flush();h.start();await h.flush();
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].video,false);
 assert.equal(h.calls[0].audio,true);
 assert.equal(h.get('status').dataset.status,'listening');
 assert.equal(h.get('track-label').textContent,'iPhone Microphone');
 assert.equal(h.get('device-match').textContent.includes('自动选择'),true);
 assert.equal(h.get('sample-rate').textContent,'16000 Hz');
 assert.equal(h.get('context-rate').textContent,'48000 Hz');
 assert.equal(h.get('channels').textContent,1);
 assert.equal(h.contexts[0].state,'running');
 h.tickFrame();
 assert.equal(h.get('level').textContent,'-20.0 dBFS');
 assert.ok(h.get('meter-fill').style.width.endsWith('%'));
 h.stop();
 assert.equal(h.streams[0].getAudioTracks()[0].stopped,true);
 assert.equal(h.contexts[0].state,'closed');
 assert.equal(h.get('status').dataset.status,'stopped');
 assert.equal(h.get('track-label').textContent,'—');
 assert.equal(h.frames.size,0);
});
test('explicitly selected AirPods input is requested with exact constraint and shown as browser-only match',async()=>{
 const h=harness({devices:[{kind:'audioinput',deviceId:'air',label:'AirPods Pro 3'}],
  settingsId:'air',trackLabel:'AirPods Pro 3'});await h.flush();
 h.setChoice('air');h.start();await h.flush();
 assert.equal(h.calls[0].audio.deviceId.exact,'air');
 assert.equal(h.get('device-match').textContent.includes('deviceId'),true);
 assert.equal(h.get('track-label').textContent,'AirPods Pro 3');
 h.stop();
});
test('a requested mic whose actual deviceId differs is not falsely verified',async()=>{
 const h=harness({devices:[{kind:'audioinput',deviceId:'sony',label:'Sony WH-1000XM6'}],
  settingsId:'internal',trackLabel:'iPhone Microphone'});await h.flush();
 h.setChoice('sony');h.start();await h.flush();
 assert.equal(h.get('device-match').textContent.includes('不一致'),true);
 h.stop();
});
test('changing selected input while active stops capture and requires another tap',async()=>{
 const h=harness();await h.flush();h.start();await h.flush();
 h.setChoice('mic1');
 assert.equal(h.calls.length,1);
 assert.equal(h.streams[0].getAudioTracks()[0].stopped,true);
 assert.equal(h.get('status').dataset.status,'changed');
 h.start();await h.flush();
 assert.equal(h.calls.length,2);
 h.stop();
});
test('changing language does not restart audio or erase a selected input',async()=>{
 const h=harness();await h.flush();h.setChoice('mic1');h.start();await h.flush();
 h.lang('en');assert.equal(h.get('device-select').value,'mic1');
 assert.equal(h.get('status').textContent.includes('Receiving microphone'),true);
 assert.equal(h.calls.length,1);
 assert.equal(h.get('home-link').attributes.href,'./index.html?v=1.6.0&lang=en');
 h.lang('ja');assert.equal(h.get('language').value,'ja');
 h.stop();
});
test('stopping during a pending iOS permission dialog closes context and discards late stream',async()=>{
 const h=harness({deferred:true});await h.flush();
 h.start();await h.flush();assert.equal(h.get('status').dataset.status,'requesting');
 h.stop();assert.equal(h.contexts[0].state,'closed');
 h.resolve();await h.flush();
 assert.equal(h.streams[0].getAudioTracks()[0].stopped,true);
 assert.equal(h.get('status').dataset.status,'stopped');
 assert.equal(h.get('track-label').textContent,'—');
});
test('a denied microphone request releases the audio context',async()=>{
 const h=harness({denied:true});await h.flush();h.start();await h.flush();
 assert.equal(h.get('status').dataset.status,'denied');
 assert.equal(h.contexts[0].state,'closed');
 assert.equal(h.get('stop').disabled,true);
});
test('insecure pages do not try to request microphone input',async()=>{
 const h=harness({secure:false});await h.flush();h.start();await h.flush();
 assert.equal(h.calls.length,0);
 assert.equal(h.get('status').dataset.status,'insecure');
});
test('backgrounding and disconnecting the track stop the stream',async()=>{
 const h=harness();await h.flush();h.start();await h.flush();
 h.document.hidden=true;h.events.visibilitychange();
 assert.equal(h.get('status').dataset.status,'background');
 assert.equal(h.streams[0].getAudioTracks()[0].stopped,true);
 h.document.hidden=false;h.start();await h.flush();
 h.streams[1].getAudioTracks()[0].onended();
 assert.equal(h.get('status').dataset.status,'ended');
 assert.equal(h.streams[1].getAudioTracks()[0].stopped,true);
});

// Isolated controller tests with fake browser devices. This file is never imported
// by index.html; these fixtures do not replace real audio/model code in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { WarningGate, TARGETS, WARNING_TARGETS, chooseTarget, DEFAULT_THRESHOLD, WARNING_HOLD_MS } from './detection.js';
import { debugCategoryName } from './debug.js';
import { AudioWindowBuffer } from './audio-window.js';
import { microphoneSourceEvidence } from './mic-source.js';
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/project/app.js'");
const page=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pageIds=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({autoStart=true,deny=false,deferMic=false,suspended=false,worklet=false,formURL=null,deferModel=false,storedThreshold=null,storedSettings=null,storedAlert=null,trackLabel='',deviceId='',devices=[],enumerationFails=false}={}) {
 const elements=new Map(),drawing=[];
 const canvas={setTransform(){},clearRect(){drawing.length=0;},beginPath(){},moveTo(x,y){drawing.push([x,y]);},lineTo(x,y){drawing.push([x,y]);},stroke(){}};
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',attributes:{},children:[],clientWidth:300,clientHeight:48,
   append(...nodes){for(const node of nodes)this.children.push(...(node.fragment ? node.children : [node]));},
   replaceChildren(...nodes){this.children=[];this.append(...nodes);},
   scrolls:[],scrollIntoView(options){this.scrolls.push(options);},
   style:{values:{},calls:[],setProperty(key,value){this.values[key]=value;this.calls.push([key,value]);}},
   setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
   getContext:()=>canvas,addEventListener(name,fn){this[name]=fn;}});
  return elements.get(id);
 };
 const tracks=[],workers=[],contexts=[],nodes=[],sources=[],analysers=[],gains=[],oscillators=[],timers=new Map(),frames=new Map(),events={},dispatched=[],storageWrites=[];
 let now=0,nextTimer=0,micCalls=0,resolveMic,denied=deny;
 const makeStream=()=>{
  const track={readyState:'live',muted:false,label:trackLabel,reportedDeviceId:deviceId,
    getSettings(){return this.reportedDeviceId ? {deviceId:this.reportedDeviceId} : {};},
    stop(){this.readyState='ended';this.stopped=true;}};tracks.push(track);
  return {getTracks:()=>[track],getAudioTracks:()=>[track]};
 };
 const baseNode=()=>({connections:[],connect(node){this.connections.push(node);},disconnect(){this.disconnected=true;}});
 class Context {
  constructor(){this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination={};contexts.push(this);if(worklet)this.audioWorklet={addModule:async()=>{}};}
  resume(){if(!suspended)this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createMediaStreamSource(){const node=baseNode();sources.push(node);return node;}
  createAnalyser(){const node={...baseNode(),fftSize:2048,pcm:new Float32Array(2048),getFloatTimeDomainData(out){out.set(this.pcm);}};analysers.push(node);return node;}
  createGain(){const gain={...baseNode(),gain:{value:1,ramps:[],setValueAtTime(v,t){this.value=v;this.ramps.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.ramps.push(['ramp',v,t]);}}};gains.push(gain);return gain;}
  createOscillator(){const node={...baseNode(),frequency:{value:0},type:'sine',onended:null,start(t){this.startedAt=t;},stop(t){this.stopped=true;this.stoppedAt=t;}};oscillators.push(node);return node;}
  createScriptProcessor(){const node=baseNode();nodes.push(node);return node;}
 }
 class WorkletNode {
  constructor(){Object.assign(this,baseNode());this.port={postMessage(){},close(){this.closed=true}};nodes.push(this);}
 }
 class ModelWorker {
  constructor(){workers.push(this);this.sent=[];}
  postMessage(data){this.sent.push(data);if(data.type==='init'&&!deferModel)queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
  terminate(){this.terminated=true;}
  emit(data){this.onmessage?.({data});}
 }
 // Match the real page: missing HTML IDs must fail instead of being fabricated.
 const document={hidden:false,documentElement:{lang:'ja'},body:{dataset:{}},getElementById:id=>pageIds.has(id)?element(id):null,addEventListener(name,fn){events[name]=fn;}};
 let nextElement=0;
 document.createElement=()=>element('created-'+(++nextElement));
 document.createDocumentFragment=()=>Object.assign(document.createElement(),{fragment:true});
 const context=vm.createContext({WarningGate,TARGETS,WARNING_TARGETS,chooseTarget,DEFAULT_THRESHOLD,WARNING_HOLD_MS,debugCategoryName,AudioWindowBuffer,microphoneSourceEvidence,Float32Array,URL,DOMException,Event:class Event{constructor(type){this.type=type;}},CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},console:{error(){},warn(){}},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms,interval:true});return id;},clearInterval:id=>timers.delete(id),
  requestAnimationFrame(fn){const id=++nextTimer;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  performance:{now:()=>now},document,Worker:ModelWorker,...(worklet?{AudioWorkletNode:WorkletNode}:{}),
  window:{isSecureContext:true,AudioContext:Context,localStorage:{getItem(k){return k==='trafficSoundGuardian.bicycleBellThreshold' ? storedThreshold : (k==='trafficSoundGuardian.soundThresholds' ? storedSettings : (k==='trafficSoundGuardian.alertToneEnabled' ? storedAlert : null));},setItem(k,v){storageWrites.push([k,v]);}},addEventListener(name,fn){events[name]=fn;},dispatchEvent(event){dispatched.push(event);return true;}},
  navigator:{mediaDevices:{
    enumerateDevices(){if(enumerationFails)return Promise.reject(new Error('unsupported'));return Promise.resolve(devices);},
    addEventListener(name,fn){events['media-'+name]=fn;},
    removeEventListener(name,fn){if(events['media-'+name]===fn)delete events['media-'+name];},
    getUserMedia(){micCalls++;if(denied)return Promise.reject(new DOMException('denied','NotAllowedError'));
    if(deferMic)return new Promise(resolve=>{resolveMic=()=>resolve(makeStream());});return Promise.resolve(makeStream());}}}
 });
 // Production links are tested by default; fixtures can replace both for validation.
 const controllerSource=formURL===null?source:source.replace(
   /const FEEDBACK_FORM_URLS = Object.freeze\(\{[\s\S]*?\}\);/,
   "const FEEDBACK_FORM_URLS = Object.freeze("+JSON.stringify({ja:formURL,en:formURL})+");");
 vm.runInContext(controllerSource,context);
 // The test harness simulates the user's tap; production never starts itself.
 if(autoStart)element('mic-control').click();
 await flush();await flush();
 return {document,elements,tracks,workers,contexts,nodes,sources,analysers,gains,oscillators,drawing,frames,timers,events,dispatched,context,storageWrites,
  animate(time){const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn(time));},
  language:lang=>{const picker=element('language-select');picker.value=lang;picker.change();},
  debug(enabled){element('debug-toggle').checked=enabled;element('debug-toggle').change();},
  calls:()=>micCalls,allow:()=>denied=false,resolveMic:()=>resolveMic(),now:n=>now=n,
  run:code=>vm.runInContext(code,context),click:()=>element('mic-control').click(),stop:()=>vm.runInContext('stop()',context),
  emit:(sequence,target=null,extra={})=>workers.at(-1).emit({type:'result',sequence,target,...extra}),
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
test('repeated taps during pending manual startup resume one context and one worker',async()=>{
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
test('one pending frame only; a qualifying single result warns despite dropped intermediate frames',async()=>{
 const h=await harness();h.frame(1);h.frame(2);h.frame(3);
 assert.equal(h.workers[0].sent.filter(x=>x.type==='classify').length,1);
 h.emit(1,{score:.6,label:'自転車のベル'});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.workers[0].sent.at(-1).sequence,3);
 h.emit(3,{score:.6,label:'サイレン'});
 assert.equal(h.document.body.dataset.state,'warning');h.stop();
});
test('worklet branch closes its port on stop',async()=>{
 const h=await harness({worklet:true});assert.equal(h.document.body.dataset.state,'priming');
 h.stop();assert.ok(h.nodes[0].port.closed);assert.ok(h.nodes[0].disconnected);
});
test('real controller warning timer returns to listening one second after last qualifying result',async()=>{
 const h=await harness();h.frame(1);h.emit(1,{score:.87,label:'車のクラクション'});
 assert.equal(h.document.body.dataset.state,'warning');assert.equal(h.elements.get('score').textContent,'0.87');
 h.now(800);h.frame(2);h.emit(2,{score:.11,label:'車のクラクション'});
 assert.equal(h.document.body.dataset.state,'warning');
 h.now(1799);assert.equal(h.document.body.dataset.state,'warning');
 h.now(1800);[...h.timers.values()].find(t=>!t.interval).fn();
 assert.equal(h.document.body.dataset.state,'listening');h.stop();
});

// V1.1 regressions. Controlled PCM/device fixtures only; not loaded by the website.
test('V1.6.9 rolling waveform samples at 60fps while legacy glow remains at 30fps',async()=>{
 const h=await harness();
 const visualEvents=()=>h.dispatched.filter(e=>e.type==='tsg:visual');
 const initialGlowWrites=h.elements.get('visual').style.calls.filter(x=>x[0]==='--audio-level').length;
 for(const t of [0,16.7,33.4,50.1,66.8])h.animate(t);
 assert.equal(visualEvents().length,5,'60Hz display receives each frame, not every second frame');
 const glowWrites=h.elements.get('visual').style.calls.filter(x=>x[0]==='--audio-level');
 assert.equal(glowWrites.length-initialGlowWrites,3,'older full PCM/glow visual remains 30fps');
 assert.ok(visualEvents().every(x=>Number.isFinite(x.detail.rms)),'only scalar RMS is emitted');
 assert.ok(visualEvents().every(x=>!('samples' in x.detail)),'no PCM in timeline event');
 assert.equal(h.workers.length,1,'no new classifier workers');
 h.frame(1);assert.equal(h.workers[0].sent.at(-1).samples.length,46800);
 h.stop();
 assert.equal(h.frames.size,0,'stop cancels visual frame request');
});
test('visualizer observes the original source without changing the AI capture route',async()=>{
 const h=await harness();
 assert.equal(h.sources.length,1);assert.equal(h.analysers.length,1);
 assert.deepEqual(h.sources[0].connections,[h.nodes[0],h.analysers[0]]);
 assert.equal(h.analysers[0].connections.length,0);
 h.frame();assert.equal(h.workers[0].sent.at(-1).samples.length,46800);
 assert.equal(h.workers[0].sent.at(-1).sampleRate,48000);h.stop();
});
test('zero PCM gives a flat waveform and zero glow; louder PCM gives larger response',async()=>{
 const h=await harness();h.animate(0);
 assert.equal(h.drawing.length,2048);assert.ok(h.drawing.every(([,y])=>y===24));
 assert.equal(Number(h.elements.get('visual').style.values['--audio-level']),0);
 const pcm=h.analysers[0].pcm;
 for(let i=0;i<pcm.length;i++)pcm[i]=i%2 ? .01 : -.01;
 h.animate(100);const quiet=Number(h.elements.get('visual').style.values['--audio-level']);
 const smallRange=Math.max(...h.drawing.map(p=>p[1]))-Math.min(...h.drawing.map(p=>p[1]));
 for(let i=0;i<pcm.length;i++)pcm[i]=i%2 ? .2 : -.2;
 const original=pcm.slice();h.animate(200);
 assert.ok(Number(h.elements.get('visual').style.values['--audio-level'])>quiet);
 assert.ok(Math.max(...h.drawing.map(p=>p[1]))-Math.min(...h.drawing.map(p=>p[1]))>smallRange);
 assert.deepEqual(pcm,original,'display scaling never mutates source samples');h.stop();
});
test('stop cancels visual frames, disconnects analyser, clears waveform; restart adds one loop',async()=>{
 const h=await harness();h.analysers[0].pcm.fill(.3);h.animate(0);
 assert.equal(h.frames.size,1);const late=[...h.frames.values()][0];h.stop();
 assert.equal(h.frames.size,0);assert.ok(h.analysers[0].disconnected);
 assert.equal(h.elements.get('visual').style.values['--audio-level'],'0');assert.equal(h.drawing.length,2);
 late(100);assert.equal(h.frames.size,0);
 h.click();await flush();assert.equal(h.frames.size,1);h.stop();
});
test('switching languages preserves immediate warning and expiry without restarting microphone',async()=>{
 const h=await harness();assert.equal(h.document.documentElement.lang,'ja');
 h.frame(1);h.emit(1,{score:.6,label:'自転車のベル'});
 assert.equal(h.document.body.dataset.state,'warning');
 h.language('en');assert.equal(h.document.documentElement.lang,'en');
 assert.equal(h.elements.get('heading').textContent,'Warning sound detected');
 assert.equal(h.calls(),1);assert.equal(h.workers.length,1);assert.equal(h.frames.size,1);
 h.now(500);h.frame(2);h.emit(2,{score:.6,label:'車のクラクション'});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.elements.get('sound-type').textContent,'Car horn');assert.equal(h.elements.get('score').textContent,'0.60');
 const deadline=h.run('session.warningTimeout');h.language('ja');
 assert.equal(h.run('session.warningTimeout'),deadline);assert.equal(h.elements.get('sound-type').textContent,'車のクラクション');
 assert.equal(h.elements.get('heading').textContent,'警告音を検知しました');h.stop();
});
test('language switch translates an existing permission error without starting a session',async()=>{
 const h=await harness({deny:true});h.language('en');
 assert.match(h.elements.get('description').textContent,/Microphone access is not allowed/);
 assert.equal(h.elements.get('mic-control').attributes['aria-label'],'Start detection');assert.equal(h.calls(),1);
 h.language('ja');assert.match(h.elements.get('description').textContent,/マイクの使用が許可/);h.stop();
});
test('English covers every Japanese UI string in the controller including errors and six labels',async()=>{
 const h=await harness();h.language('en');
 // Catalog keys use double quotes; these single-quoted literals are all UI callers.
 const literals=[...source.matchAll(/'([^'\n]*[\u3040-\u30ff\u4e00-\u9fff][^'\n]*)'/g)].map(match=>match[0]);
 for(const literal of literals)assert.doesNotMatch(h.run('t('+literal+')'),/[\u3040-\u30ff\u4e00-\u9fff]/,literal);
 for(const label of ['自転車のベル','車のクラクション','サイレン','サイレン（パトカー）','サイレン（救急車）','サイレン（消防車）'])
  assert.doesNotMatch(h.run('t('+JSON.stringify(label)+')'),/[\u3040-\u30ff\u4e00-\u9fff]/);
 for(const id of ['privacy','research','score-label','cancel','feedback'])
  assert.doesNotMatch(h.elements.get(id).textContent,/[\u3040-\u30ff\u4e00-\u9fff]/);
 assert.equal(h.elements.get('language-select').value,'en');h.stop();
});
test('empty or invalid feedback config has no destination and cannot open a tab',async()=>{
 for(const url of ['', 'javascript:alert(1)', 'https://example.test/form', 'https://docs.google.com.evil.test/forms/test']){
  const h=await harness({formURL:url});let prevented=false;
  assert.equal(h.elements.get('feedback').attributes.href,undefined);
  h.elements.get('feedback').click({preventDefault(){prevented=true;}});assert.ok(prevented);
  h.language('en');assert.equal(h.elements.get('feedback').textContent,'Feedback (coming soon)');h.stop();
 }
});
test('configured Google Forms link is exact, opens a new tab and adds no microphone data',async()=>{
 // This is a non-production URL fixture, never shipped as a configured form.
 const url='https://docs.google.com/forms/d/e/test-fixture/viewform';
 const h=await harness({formURL:url});h.language('en');
 assert.equal(h.elements.get('feedback').attributes.href,url);
 assert.equal(h.elements.get('feedback').attributes['aria-disabled'],'false');
 let prevented=false;h.elements.get('feedback').click({preventDefault(){prevented=true;}});assert.equal(prevented,false);
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/<a id="feedback"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
 assert.ok(!html.includes('id="targets"'));assert.ok(!html.includes('<i></i>'));h.stop();
});

const diagnosticFixture=()=>({
 top5:[{categoryName:'Speech',index:0,score:.931234567890123},{categoryName:'Music',index:132,score:.3},{categoryName:'Bell',index:195,score:.2},{categoryName:'Bicycle bell',index:198,score:.123456789012345},{categoryName:'Car',index:301,score:.1}],
 targets:Object.entries(TARGETS).map(([categoryName,target])=>({categoryName,index:target.index,score:target.index===198?.123456789012345:0}))
});
test('Debug Mode is checked by default and never auto-scrolls when switched',async()=>{
 assert.equal([...page.matchAll(/id="debug-toggle"/g)].length,1);
 assert.ok(page.indexOf('id="debug-toggle"')>page.indexOf('class="toolbar"'));
 assert.ok(page.indexOf('id="debug-toggle"')<page.indexOf('<main>'));
 assert.match(page,/id="debug-toggle"[^>]*aria-controls="debug-panel" checked/);
 assert.match(page,/id="debug-panel" class="debug-panel" open/);
 const h=await harness({autoStart:false}),panel=h.elements.get('debug-panel');
 assert.equal(h.calls(),0,'Debug Mode must never request microphone permission');
 assert.equal(h.run('debugEnabled'),true);
 assert.equal(h.elements.get('debug-toggle').checked,true);
 assert.equal(h.document.body.dataset.debug,'on');
 assert.equal(panel.scrolls.length,0);
 assert.equal(panel.hidden,false);assert.equal(panel.open,true);
 h.debug(false);
 assert.equal(panel.scrolls.length,0);assert.equal(panel.hidden,true);
 assert.equal(h.document.body.dataset.debug,'off');
 h.debug(true);
 assert.equal(panel.scrolls.length,0);assert.equal(panel.hidden,false);assert.equal(panel.open,true);
 h.language('en');
 assert.equal(panel.scrolls.length,0);
 assert.equal(h.elements.get('debug-toggle-label').textContent,'AI Debug Mode');
 h.stop();
});
test('V1.6.14 page, release assets and refreshed classifier cache agree',()=>{
 assert.match(page, /<title>Traffic Sound Guardian V1\.6\.14<\/title>/);
 assert.match(page, /class="version">V1\.6\.14<\/span>/);
 assert.match(page, /src="\.\/app\.js\?v=1\.6\.13"/); // Unchanged app bytes retain asset cache tag.
 assert.match(page, /href="\.\/v1\.6\.css\?v=1\.6\.14"/);
 assert.match(page, /href="\.\/manifest\.webmanifest\?v=1\.6\.14"/);
 assert.match(source, /classifier-worker\.js\?v=1\.6\.10/); // Worker bytecode is unchanged.
 assert.equal(JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest',import.meta.url))).name,'Traffic Sound Guardian V1.6.14');
 assert.equal(JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url))).version,'1.6.14');
});
test('V1.6.13 Settings switch links both layouts and localizes all choices without extra capture',async()=>{
 const main=page;
 const ipad=fs.readFileSync(new URL('./ipad-test.html',import.meta.url),'utf8');
 for(const [html,selected,other] of [[main,'version-standard','version-ipad'],[ipad,'version-ipad','version-standard']]){
   const start=html.indexOf('id="settings-content"'),end=html.indexOf('</details>',start);
   assert.ok(start>0&&end>start,'Settings exists');
   const menu=html.slice(start,end);
   for(const id of ['version-switch-title','version-standard','version-ipad'])
     assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' appears once');
   assert.ok(menu.includes('id="version-standard" href="./index.html"'));
   assert.ok(menu.includes('id="version-ipad" href="./ipad-test.html"'));
   assert.ok(menu.includes('id="'+selected+'" href='));
   const selectedLink=menu.match(new RegExp('<a id="'+selected+'"[^>]*>'))?.[0]||'';
   const otherLink=menu.match(new RegExp('<a id="'+other+'"[^>]*>'))?.[0]||'';
   assert.match(selectedLink,/aria-current="page"/);
   assert.doesNotMatch(otherLink,/aria-current="page"/);
 }
 const css=fs.readFileSync(new URL('./v1.6.css',import.meta.url),'utf8');
 assert.match(css,/\.version-options a\[aria-current=page\]/);
 assert.match(css,/\.version-options a:focus-visible/);
 const h=await harness({autoStart:false});
 assert.equal(h.calls(),0,'navigation is passive and does not use microphone');
 const regular=h.elements.get('version-standard'),ipadLink=h.elements.get('version-ipad');
 assert.equal(regular.textContent,'通常版');
 assert.equal(ipadLink.textContent,'iPad横画面（テスト）');
 assert.equal(regular.attributes.href,'./index.html?lang=ja');
 assert.equal(ipadLink.attributes.href,'./ipad-test.html?lang=ja');
 h.language('en');
 assert.equal(h.elements.get('version-switch-title').textContent,'Page layout');
 assert.equal(regular.textContent,'Standard');
 assert.equal(ipadLink.textContent,'iPad landscape (test)');
 assert.equal(regular.attributes.href,'./index.html?lang=en');
 assert.equal(ipadLink.attributes.href,'./ipad-test.html?lang=en');
 h.language('zh-CN');
 assert.equal(h.elements.get('version-switch-title').textContent,'页面版本');
 assert.equal(regular.textContent,'标准版');
 assert.equal(ipadLink.textContent,'iPad 横屏测试版');
 assert.equal(regular.attributes.href,'./index.html?lang=zh-CN');
 assert.equal(ipadLink.attributes.href,'./ipad-test.html?lang=zh-CN');
 assert.equal(h.calls(),0,'language and version selection never start audio');
 h.stop();
});
test('V1.6.10 real result emits trilingual top class independently of Debug and warns immediately',async()=>{
 const h=await harness();
 h.debug(false);
 h.frame(1);
 h.now(1000);
 h.emit(1,null,{topCategory:{categoryName:'Speech',score:.74,index:0}});
 const soundEvents=()=>h.dispatched.filter(e=>e.type==='tsg:classification');
 assert.equal(soundEvents().length,1);
 assert.equal(soundEvents()[0].detail.categoryName,'Speech');
 assert.equal(soundEvents()[0].detail.labels.ja,'話し声');
 assert.equal(soundEvents()[0].detail.labels.en,'Speech');
 assert.equal(soundEvents()[0].detail.labels['zh-CN'],'人声');
 assert.equal(soundEvents()[0].detail.warningName,null);
 assert.ok(!('pcm' in soundEvents()[0].detail));
 assert.equal(h.document.body.dataset.state,'listening');
 h.frame(2);h.now(2100);
 h.emit(2,{score:.65,label:'車のクラクション',name:'Vehicle horn, car horn, honking'},{topCategory:{categoryName:'Speech',score:.5,index:0}});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(soundEvents().at(-1).detail.warningName,'Vehicle horn, car horn, honking');
 assert.equal(soundEvents().at(-1).detail.warningLabels['zh-CN'],'汽车喇叭');
 const warnings=h.dispatched.filter(e=>e.type==='tsg:warning');
 assert.equal(warnings.at(-1).detail.labels.en,'Vehicle horn, car horn, honking');
 h.language('zh-CN');
 assert.ok(h.dispatched.some(e=>e.type==='tsg:language'&&e.detail.language==='zh-CN'));
 assert.equal(h.workers.length,1,'language switch and public sound status create no new worker');
 h.stop();
 assert.equal(h.dispatched.at(-1).type,'tsg:reset');
});
test('V1.6.8 status label has no background and its dot replaces microphone-corner recording dot',async()=>{
 const css=fs.readFileSync(new URL('./v1.6.css',import.meta.url),'utf8');
 const base=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
 const theme=fs.readFileSync(new URL('./theme.css',import.meta.url),'utf8');
 assert.match(page, /id="status" class="status"><span class="status-dot"><\/span><span id="status-label"/);
 assert.ok(!page.includes('listening-indicator'),'microphone button no longer contains a decorative red dot');
 assert.doesNotMatch(base,/\.listening-indicator|@keyframes listening-blink/);
 assert.doesNotMatch(theme,/\.icon-disc \.listening-indicator/);
 assert.doesNotMatch(theme,/\.debug-content \.sensitivity,\.status,\.notice,\.meter/,'light mode status must not inherit a colored box');
 assert.match(css,/main \.status\{background:transparent;border:0;box-shadow:none;padding:0;border-radius:0\}/);
 assert.match(css,/html\[data-theme=light\] main \.status\{background:transparent;border:0;box-shadow:none;color:#53677e\}/);
 assert.match(css,/body\[data-state=listening\] main \.status-dot\{background:#f43f5e;/);
 assert.match(css,/body\[data-state=warning\] main \.status-dot\{background:#fff;/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{body\[data-state=listening\] main \.status-dot\{animation:none;opacity:1\}\}/);
 assert.match(page, /href="\.\/style\.css\?v=1\.6\.13"/);
 assert.match(page, /href="\.\/theme\.css\?v=1\.6\.13"/);
 const h=await harness();
 h.frame(1);h.emit(1);assert.equal(h.document.body.dataset.state,'listening');
 assert.equal(h.elements.get('status-label').textContent,'検知中');
 h.stop();assert.equal(h.document.body.dataset.state,'stopped');
});
test('V1.6.7 new page load starts at top, back-forward cache preserves scroll and normal scrolling remains untouched',()=>{
 const head=page.slice(0,page.indexOf('</head>'));
 const script=head.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'early inline scroll-reset script exists');
 assert.ok(head.indexOf('scrollRestoration')<head.indexOf('stylesheet'),'scroll policy set before stylesheet loading');
 const history={scrollRestoration:'auto'},listeners=new Map(),scrolls=[],frames=[];
 const window={addEventListener(name,fn){listeners.set(name,fn);},
   scrollTo(x,y){scrolls.push([x,y]);}};
 vm.runInNewContext(script,{history,window,requestAnimationFrame:fn=>frames.push(fn)});
 assert.equal(history.scrollRestoration,'manual');
 assert.deepEqual([...listeners.keys()],['pageshow'],'do not force-scroll on taps, warning or scrolling');
 assert.equal(scrolls.length,0,'loading does not scroll prematurely');
 listeners.get('pageshow')({persisted:false});
 assert.deepEqual(scrolls,[[0,0]],'full reload resets vertical and horizontal position');
 assert.equal(frames.length,1);
 frames.shift()();
 assert.deepEqual(scrolls,[[0,0],[0,0]],'next animation frame counters late browser restoration');
 scrolls.length=0;
 listeners.get('pageshow')({persisted:true});
 assert.deepEqual(scrolls,[],'returning from browser back-forward cache preserves existing position');
 assert.equal(frames.length,0);
});
test('Debug Mode defaults open below the app and never changes the active session or warning deadline',async()=>{
 const h=await harness();assert.equal(h.run('debugEnabled'),true);assert.equal(h.elements.get('debug-panel').hidden,false);
 h.frame(1);h.emit(1,{score:.8,label:'車のクラクション'});const timer=h.run('session.warningTimeout');
 h.debug(true);assert.equal(h.elements.get('debug-panel').open,true);assert.equal(h.elements.get('debug-panel').hidden,false);
 assert.equal(h.run('session.warningTimeout'),timer);assert.equal(h.calls(),1);assert.equal(h.workers.length,1);assert.equal(h.frames.size,1);
 h.elements.get('debug-panel').open=false;
 assert.equal(h.run('debugEnabled'),true);h.debug(false);assert.equal(h.run('session.warningTimeout'),timer);
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');assert.ok(html.indexOf('class="debug-section"')>html.indexOf('</footer>'));h.stop();
});
test('debug shows unrounded model scores while the new 0.10 default triggers an alert',async()=>{
 const h=await harness();h.debug(true);h.frame(1);
 assert.equal(h.workers[0].sent.at(-1).debug,true);
 h.workers[0].emit({type:'result',sequence:1,target:{score:.123456789012345,label:'自転車のベル'},inferenceMs:12.3456,debug:diagnosticFixture()});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.elements.get('debug-top').children.length,5);assert.equal(h.elements.get('debug-target').children.length,6);
 assert.equal(h.elements.get('debug-top').children[0].children[1].textContent,'0.931234567890123');
 assert.equal(h.elements.get('debug-target').children[0].children[1].textContent,'0.123456789012345');
 assert.equal(h.elements.get('debug-target').children[1].children[1].textContent,'0');
 assert.equal(h.elements.get('debug-time').textContent,'12.35 ms');h.stop();
});
test('debug separates loaded model, microphone permission, captured audio and completed inference',async()=>{
 const h=await harness();h.debug(true);
 assert.equal(h.elements.get('debug-model').textContent,'読み込み成功');
 assert.equal(h.elements.get('debug-mic').textContent,'許可済み・音声データ待ち');
 assert.equal(h.elements.get('debug-inference').textContent,'未実行');
 h.frame();assert.equal(h.elements.get('debug-mic').textContent,'音声データ受信中');
 h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:15,debug:diagnosticFixture()});
 assert.equal(h.elements.get('debug-inference').textContent,'成功');h.stop();
 assert.equal(h.elements.get('debug-model').textContent,'読み込み成功・解放済み');
 assert.equal(h.run('diagnostics.scores'),null);
});
test('debug replaces a single snapshot and disabling clears it even with an in-flight result',async()=>{
 const h=await harness();h.debug(true);h.frame(1);
 h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:1,debug:diagnosticFixture()});
 h.frame(2);h.debug(false);
 h.workers[0].emit({type:'result',sequence:2,target:null,inferenceMs:2,debug:diagnosticFixture()});
 assert.equal(h.run('diagnostics.scores'),null);assert.equal(h.elements.get('debug-top').children.length,0);
 h.frame(3);assert.equal(h.workers[0].sent.at(-1).debug,false);h.debug(true);
 h.workers[0].emit({type:'result',sequence:3,target:null,inferenceMs:3});
 assert.equal(h.run('diagnostics.scores'),null);
 h.frame(4);const fresh=diagnosticFixture();fresh.top5[0].score=.99;
 h.workers[0].emit({type:'result',sequence:4,target:null,inferenceMs:4,debug:fresh});
 assert.equal(h.elements.get('debug-top').children.length,5);assert.equal(h.elements.get('debug-top').children[0].children[1].textContent,'0.99');h.stop();
});
test('debug Japanese and English include statuses, category names and original unrounded scores',async()=>{
 const h=await harness();h.debug(true);h.frame();h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:2,debug:diagnosticFixture()});
 assert.equal(h.elements.get('debug-top').children[0].children[0].children[0].textContent,'話し声');
 h.language('en');assert.equal(h.elements.get('debug-inference').textContent,'Successful');
 assert.equal(h.elements.get('debug-top').children[0].children[0].children[0].textContent,'Speech');
 assert.equal(h.elements.get('debug-top').children[0].children[1].textContent,'0.931234567890123');
 for(const [id,el] of h.elements)if(id.startsWith('debug-'))assert.doesNotMatch(el.textContent,/[\u3040-\u30ff\u4e00-\u9fff]/,id);
 assert.equal(h.calls(),1);h.stop();
});
test('debug retains explicit model or microphone failure status after cleanup',async()=>{
 const denied=await harness({deny:true});denied.debug(true);assert.equal(denied.elements.get('debug-mic').textContent,'マイクの許可なし');denied.stop();
 const h=await harness({deferModel:true});h.debug(true);
 h.workers[0].emit({type:'error',operation:'init',inferenceMs:null,message:'test model failure'});
 assert.equal(h.document.body.dataset.state,'stopped');assert.equal(h.elements.get('debug-model').textContent,'失敗');assert.equal(h.elements.get('debug-inference').textContent,'停止中');
 assert.equal(h.run('diagnostics.scores'),null);
});
test('debug shows inference failure and elapsed time, and ignores late results/errors after stop',async()=>{
 const h=await harness();h.debug(true);h.frame();
 h.workers[0].emit({type:'error',operation:'classify',sequence:1,inferenceMs:7.5,message:'test inference failure'});
 assert.equal(h.elements.get('debug-inference').textContent,'失敗');assert.equal(h.elements.get('debug-time').textContent,'7.50 ms');
 h.click();await flush();const before=h.run('JSON.stringify(diagnostics)');
 h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:1,debug:diagnosticFixture()});
 h.workers[0].onerror({message:'late worker error'});
 assert.equal(h.run('JSON.stringify(diagnostics)'),before);h.stop();
});
test('debug marks stalled inference and clears old scores when the unchanged watchdog stops it',async()=>{
 const h=await harness();h.debug(true);h.frame();h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:2,debug:diagnosticFixture()});
 h.now(3100);[...h.timers.values()].find(t=>t.interval).fn();
 assert.equal(h.document.body.dataset.state,'stopped');assert.equal(h.elements.get('debug-inference').textContent,'更新が停止');assert.equal(h.run('diagnostics.scores'),null);
});

// V1.3: live microphone button and visual-only gain regression checks.
test('microphone button starts and stops a single session, regular footer stays hidden',async()=>{
 const h=await harness();
 assert.ok(page.includes('id="mic-control"'));
 assert.ok(!page.includes('id="visual" class="visual" aria-hidden="true"'));
 assert.ok(!page.includes('id="action"'));
 h.frame(1);h.emit(1);
 assert.equal(h.elements.get('mic-control').attributes['aria-pressed'],'true');
 assert.equal(h.elements.get('mic-control').attributes['aria-label'],'検知を停止');
 h.elements.get('mic-control').click();
 assert.equal(h.document.body.dataset.state,'stopped');
 assert.ok(!page.includes('id="action"'));
 assert.ok(h.tracks[0].stopped);
 h.elements.get('mic-control').click();await flush();
 assert.equal(h.calls(),2);assert.equal(h.workers.length,2);h.stop();
});
test('suspended Safari context stays stopped and the microphone circle can retry',async()=>{
 const h=await harness({suspended:true});
 assert.equal(h.document.body.dataset.state,'stopped');
 assert.equal(h.elements.get('mic-control').attributes['aria-label'],'検知を開始');
 assert.ok(!page.includes('id="action"'));
 h.click();await flush();
 assert.equal(h.calls(),2);
 h.stop();
});
test('warning still allows stopping by tapping the circular control',async()=>{
 const h=await harness();h.frame(1);h.emit(1,{score:.8,label:'サイレン'});
 assert.equal(h.document.body.dataset.state,'warning');
 h.elements.get('mic-control').click();
 assert.equal(h.document.body.dataset.state,'stopped');h.stop();
});
test('waveform uses soft-limited display amplification without mutating captured frames',async()=>{
 assert.match(source,/Math\.tanh\(samples\[i\] \* 18\)/);
 const h=await harness();h.analysers[0].pcm.fill(.08);h.animate(0);
 assert.ok(h.drawing.some(([,y])=>y!==24));
 h.frame(1);assert.equal(h.workers[0].sent.at(-1).sampleRate,48000);
 assert.equal(h.workers[0].sent.at(-1).samples.length,46800);h.stop();
});

test('V1.3.1 never requests mic on page load; circle directly starts and stops',async()=>{
 const h=await harness({autoStart:false});
 assert.equal(h.document.body.dataset.state,'stopped');
 assert.equal(h.calls(),0);
 assert.equal(h.contexts.length,0);
 assert.equal(h.workers.length,0);
 assert.equal(h.elements.get('mic-control').attributes['aria-label'],'検知を開始');
 h.click();await flush();
 assert.equal(h.calls(),1);
 assert.equal(h.document.body.dataset.state,'priming');
 h.frame(1);h.emit(1);
 assert.equal(h.document.body.dataset.state,'listening');
 h.click();
 assert.equal(h.document.body.dataset.state,'stopped');
 assert.ok(h.tracks[0].stopped);
});
test('V1.3.1 denied permission after manual click can be retried',async()=>{
 const h=await harness({autoStart:false,deny:true});
 assert.equal(h.calls(),0);
 h.click();await flush();
 assert.equal(h.document.body.dataset.state,'stopped');
 assert.match(h.elements.get('description').textContent,/マイクの使用が許可/);
 h.allow();h.click();await flush();
 assert.equal(h.calls(),2);
 assert.equal(h.document.body.dataset.state,'priming');h.stop();
});

test('V1.3.1 larger waveform displays real quiet sounds and soft-limits louder sounds',async()=>{
 const css=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
 assert.match(css,/\.wave\{max-width:360px;height:76px/);
 const h=await harness();
 const pcm=h.analysers[0].pcm;
 pcm.fill(0);h.animate(0);
 assert.ok(h.drawing.every(([,y])=>y===24),'true silence remains flat');
 for(let i=0;i<pcm.length;i++)pcm[i]=i%2 ? .01 : -.01;
 h.animate(100);
 const smallSpan=Math.max(...h.drawing.map(p=>p[1]))-Math.min(...h.drawing.map(p=>p[1]));
 assert.ok(smallSpan>7,'quiet nonzero signal becomes clearly visible');
 for(let i=0;i<pcm.length;i++)pcm[i]=i%2 ? .4 : -.4;
 const original=pcm.slice();
 h.animate(200);
 const loudSpan=Math.max(...h.drawing.map(p=>p[1]))-Math.min(...h.drawing.map(p=>p[1]));
 assert.ok(loudSpan>smallSpan,'louder real input causes larger visible waveform');
 assert.ok(h.drawing.every(([,y])=>y>=0&&y<=48),'limiter keeps waveform within canvas');
 assert.deepEqual(pcm,original,'visual display never changes microphone PCM');
 h.stop();
});


test('V1.6.6 six independent sensitivity sliders stay in Debug, tone switch moves to Settings',async()=>{
 const panelStart=page.indexOf('id="debug-panel"'),panelEnd=page.indexOf('</details>',panelStart);
 const settingStart=page.indexOf('id="settings-content"'),settingEnd=page.indexOf('</details>',settingStart);
 const sensitivityPos=page.indexOf('id="sensitivity-panel"');
 const tonePos=page.indexOf('id="alert-tone-toggle"');
 assert.ok(panelStart>0&&panelEnd>panelStart);
 assert.ok(sensitivityPos>panelStart&&sensitivityPos<panelEnd);
 assert.ok(tonePos>settingStart&&tonePos<settingEnd);
 assert.ok(!(tonePos>panelStart&&tonePos<panelEnd),'notification sound is no longer in Debug');
 assert.equal((page.match(/id="threshold-input-[0-5]"/g)||[]).length,6);
 assert.ok(!page.includes('id="bell-threshold"'));
 const h=await harness({autoStart:false});
 assert.equal(h.calls(),0);
 assert.equal(h.elements.get('debug-panel').hidden,false);
 for(let i=0;i<6;i++)assert.equal(h.elements.get('threshold-value-'+i).textContent,'0.10');
 assert.equal(h.elements.get('alert-tone-toggle').checked,true);
 h.debug(false);assert.equal(h.elements.get('debug-panel').hidden,true);
 h.debug(true);assert.equal(h.elements.get('debug-panel').hidden,false);h.stop();
});
test('V1.4.1 siren threshold changes live without recreating microphone or worker',async()=>{
 const h=await harness();const siren=Object.keys(TARGETS)[2];
 const slider=h.elements.get('threshold-input-2');
 slider.value='.05';slider.input();
 assert.equal(h.run('soundThresholds')[siren],.05);
 assert.equal(h.elements.get('threshold-value-2').textContent,'0.05');
 assert.equal(h.storageWrites.at(-1)[0],'trafficSoundGuardian.soundThresholds');
 assert.equal(JSON.parse(h.storageWrites.at(-1)[1])[siren],.05);
 const scores={[siren]:.10,'Vehicle horn, car horn, honking':.09};
 h.frame(1);h.workers[0].emit({type:'result',sequence:1,target:null,trafficScores:scores});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.elements.get('sound-type').textContent,'サイレン');
 assert.equal(h.elements.get('score').textContent,'0.10');
 assert.equal(h.calls(),1);assert.equal(h.workers.length,1);h.stop();
});
test('V1.4.1 six independent sliders reset together to original thresholds',async()=>{
 const h=await harness({autoStart:false}),names=Object.keys(TARGETS);
 for(let i=0;i<6;i++){
  const slider=h.elements.get('threshold-input-'+i);
  slider.value=(.05+i*.05).toFixed(2);slider.input();
  assert.equal(h.elements.get('threshold-value-'+i).textContent,(.05+i*.05).toFixed(2));
 }
 for(let i=0;i<6;i++)assert.equal(h.run('soundThresholds')[names[i]],Math.round((.05+i*.05)*100)/100);
 h.elements.get('threshold-reset').click();
 for(let i=0;i<6;i++)assert.equal(h.elements.get('threshold-value-'+i).textContent,'0.10');
 assert.ok(Object.values(JSON.parse(h.storageWrites.at(-1)[1])).every(x=>x===.10));
 assert.equal(h.calls(),0);h.stop();
});
test('V1.4.1 language switch translates labels but keeps thresholds',async()=>{
 const h=await harness({autoStart:false,storedThreshold:'0.12'});
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.12');
 h.language('en');
 assert.equal(h.elements.get('sensitivity-heading').textContent,'Traffic warning sound sensitivity');
 assert.equal(h.elements.get('threshold-label-0').textContent,'Bicycle bell');
 assert.equal(h.elements.get('threshold-label-1').textContent,'Car horn');
 assert.equal(h.elements.get('threshold-reset').textContent,'Reset all to default');
 assert.match(h.elements.get('sensitivity-note').textContent,/false alarms/);
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.12');
 h.language('ja');
 assert.equal(h.elements.get('threshold-label-0').textContent,'自転車のベル');h.stop();
});
test('V1.4.1 saved per-category values override legacy bell preference',async()=>{
 const storedSettings=JSON.stringify({'Bicycle bell':.23,'Police car (siren)':.07});
 const h=await harness({autoStart:false,storedThreshold:'0.10',storedSettings});
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.23');
 assert.equal(h.elements.get('threshold-value-3').textContent,'0.07');
 assert.equal(h.elements.get('threshold-value-5').textContent,'0.10');h.stop();
});
test('V1.4.2 live threshold changes apply on the very next single inference',async()=>{
 const h=await harness();
 const siren=Object.keys(TARGETS)[2];
 h.frame(1);
 h.workers[0].emit({type:'result',sequence:1,trafficScores:{[siren]:.08},target:null});
 assert.equal(h.document.body.dataset.state,'listening');
 const slider=h.elements.get('threshold-input-2');slider.value='.05';slider.input();
 h.frame(2);
 h.workers[0].emit({type:'result',sequence:2,trafficScores:{[siren]:.08},target:null});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.elements.get('sound-type').textContent,'サイレン');
 assert.equal(h.calls(),1);assert.equal(h.workers.length,1);h.stop();
});

test('V1.4.2 first eligible low-score result triggers immediate red warning for all six categories',async()=>{
 for(let index=0;index<6;index++){
  const h=await harness();
  const input=h.elements.get('threshold-input-'+index);input.value='0.10';input.input();
  const name=Object.keys(TARGETS)[index];
  h.frame(1);
  h.workers[0].emit({type:'result',sequence:1,target:null,trafficScores:{[name]:.10}});
  assert.equal(h.document.body.dataset.state,'warning',name);
  assert.equal(h.elements.get('score').textContent,'0.10');
  h.stop();
 }
});
test('V1.4.2 Debug Mode explains a single result is enough in Japanese and English',async()=>{
 const h=await harness({autoStart:false});
 const note=h.elements.get('sensitivity-note');
 assert.match(note.textContent,/1回のAI識別/);
 h.language('en');
 assert.match(note.textContent,/single AI result/);
 h.stop();
});

test('V1.4.4 website routes feedback to the two owner-confirmed short links',async()=>{
 const h=await harness({autoStart:false});
 const ja=h.elements.get('feedback').attributes.href;
 assert.equal(ja,'https://forms.gle/vRzgiJxNCfJeb5K1A');
 assert.equal(h.elements.get('feedback').textContent,'ご意見・ご感想 ↗');
 assert.equal(h.elements.get('feedback').attributes['aria-disabled'],'false');
 h.language('en');
 const en=h.elements.get('feedback').attributes.href;
 assert.equal(en,'https://forms.gle/AkXuRHWwi9Kp95GfA');
 assert.notEqual(en,ja);
 assert.equal(h.elements.get('feedback').textContent,'Send feedback ↗');
 assert.equal(h.elements.get('feedback').attributes['aria-disabled'],'false');
 let prevented=false;
 h.elements.get('feedback').click({preventDefault(){prevented=true;}});
 assert.equal(prevented,false);
 h.language('ja');
 assert.equal(h.elements.get('feedback').attributes.href,ja);
 assert.equal(h.calls(),0);
 h.stop();
});
test('V1.4.3 first viewport previews Debug panel without scrolling or hiding microphone controls',async()=>{
 const css=fs.readFileSync(new URL('./style.css',import.meta.url),'utf8');
 assert.match(css,/body\[data-debug="on"\] \.app\{min-height:calc\(100vh - 84px\)/);
 assert.doesNotMatch(source,/scrollIntoView\(/);
 const h=await harness({autoStart:false});
 assert.equal(h.elements.get('debug-panel').scrolls.length,0);
 assert.equal(h.elements.get('debug-panel').hidden,false);
 assert.equal(h.elements.get('mic-control').disabled,false);
 assert.equal(h.calls(),0);
 h.click();await flush();
 assert.equal(h.calls(),1);
 assert.equal(h.elements.get('debug-panel').scrolls.length,0);
 h.stop();
});

test('V1.6.0 single native selector routes simplified Chinese to English Google Form',async()=>{
 assert.equal((page.match(/id="language-select"/g)||[]).length,1);
 assert.ok(page.includes('<option value="ja">日本語</option>'));
 assert.ok(page.includes('<option value="en">English</option>'));
 assert.ok(page.includes('<option value="zh-CN">简体中文</option>'));
 assert.ok(!page.includes('id="language-ja"')&&!page.includes('id="language-en"'));
 const h=await harness({autoStart:false});
 const picker=h.elements.get('language-select');
 assert.equal(picker.value,'ja');
 picker.value='zh-CN';picker.change();
 assert.equal(h.document.documentElement.lang,'zh-CN');
 assert.equal(h.elements.get('heading').textContent,'检测已停止');
 assert.equal(h.elements.get('feedback').attributes.href,'https://forms.gle/AkXuRHWwi9Kp95GfA');
 assert.equal(h.elements.get('ai-test-link').attributes.href,'./ai-test.html?v=1.6.0&lang=zh-CN');
 assert.equal(h.elements.get('debug-toggle-label').textContent,'AI 调试模式');
 assert.equal(h.elements.get('sensitivity-heading').textContent,'交通警告音灵敏度设置');
 assert.equal(h.elements.get('threshold-label-0').textContent,'自行车铃');
 assert.equal(h.elements.get('threshold-label-5').textContent,'消防车警笛');
 assert.equal(h.calls(),0);
 picker.value='en';picker.change();
 assert.equal(h.elements.get('heading').textContent,'Detection stopped');
 assert.equal(h.elements.get('feedback').attributes.href,'https://forms.gle/AkXuRHWwi9Kp95GfA');
 picker.value='ja';picker.change();
 assert.equal(h.elements.get('feedback').attributes.href,'https://forms.gle/vRzgiJxNCfJeb5K1A');
 h.stop();
});
test('V1.6.0 Chinese switch preserves ongoing warning and score',async()=>{
 const h=await harness();h.frame(1);h.emit(1,{score:.83,label:'自転車のベル'});
 const warningTimer=h.run('session.warningTimeout');
 h.language('zh-CN');
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.run('session.warningTimeout'),warningTimer);
 assert.equal(h.elements.get('heading').textContent,'检测到警告音');
 assert.equal(h.elements.get('sound-type').textContent,'自行车铃');
 assert.equal(h.elements.get('score').textContent,'0.83');
 assert.equal(h.calls(),1);
 assert.equal(h.workers.length,1);
 h.stop();
});
test('V1.6.0 Chinese debug labels preserve original raw model scores',async()=>{
 const h=await harness();h.language('zh-CN');h.frame(1);
 h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:5,debug:diagnosticFixture()});
 assert.equal(h.elements.get('debug-top').children[0].children[0].children[0].textContent,'人声');
 assert.equal(h.elements.get('debug-target').children[0].children[0].children[0].textContent,'自行车铃');
 assert.equal(h.elements.get('debug-top').children[0].children[1].textContent,'0.931234567890123');
 h.stop();
});

test('V1.6.0 includes a special .01 minimum plus .05 step choices with default .10',async()=>{
 const html=page;
 assert.equal((html.match(/min="0.01" max="0.50" step="any" value="0.10"/g)||[]).length,6);
 const h=await harness({autoStart:false});
 for (const [i,name] of Object.keys(TARGETS).entries()){
  assert.equal(h.run('soundThresholds')[name],.10);
  assert.equal(h.elements.get('threshold-input-'+i).step,'any');
  assert.equal(h.elements.get('threshold-input-'+i).min,'0.01');
  assert.equal(h.elements.get('threshold-value-'+i).textContent,'0.10');
 }
 const slider=h.elements.get('threshold-input-0');slider.value='.23';slider.input();
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.25');
 assert.equal(h.run('soundThresholds')['Bicycle bell'],.25);
 assert.equal(h.storageWrites.at(-1)[0],'trafficSoundGuardian.soundThresholds');
 // The user must be able to select .01, not just keep a legacy .01 value.
 slider.value='.01';slider.input();
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.01');
 assert.equal(h.run('soundThresholds')['Bicycle bell'],.01);
 let prevented=0;
 const arrow=key=>slider.keydown({key,preventDefault(){prevented++}});
 arrow('ArrowRight');assert.equal(h.elements.get('threshold-value-0').textContent,'0.05');
 arrow('ArrowRight');assert.equal(h.elements.get('threshold-value-0').textContent,'0.10');
 arrow('ArrowLeft');assert.equal(h.elements.get('threshold-value-0').textContent,'0.05');
 arrow('Home');assert.equal(h.elements.get('threshold-value-0').textContent,'0.01');
 arrow('End');assert.equal(h.elements.get('threshold-value-0').textContent,'0.50');
 assert.equal(prevented,5);
 h.stop();
});
test('V1.6.0 legacy 0.01-step values are preserved until user adjusts a slider',async()=>{
 const h=await harness({autoStart:false,storedSettings:JSON.stringify({
  'Bicycle bell':.03,'Siren':.12
 })});
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.03');
 assert.equal(h.elements.get('threshold-input-0').value,'0.03');
 assert.equal(h.elements.get('threshold-input-0').step,'any');
 assert.equal(h.elements.get('threshold-input-0').min,'0.01');
 assert.equal(h.elements.get('threshold-value-2').textContent,'0.12');
 assert.equal(h.elements.get('threshold-input-2').step,'any');
 assert.equal(h.storageWrites.length,0);
 h.language('zh-CN');assert.equal(h.elements.get('threshold-value-2').textContent,'0.12');
 const slider=h.elements.get('threshold-input-0');slider.value='.04';slider.input();
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.05');
 assert.equal(h.elements.get('threshold-input-0').step,'any');
 assert.equal(h.run('soundThresholds').Siren,.12);
 h.stop();
});

// V1.6.1 independent audible-warning regression tests (mocked audio nodes, no sound playback).
test('beep setting defaults ON, is multilingual and never plays before a real warning',async()=>{
 const h=await harness();
 assert.equal(h.elements.get('alert-tone-toggle').checked,true);
 assert.equal(h.oscillators.length,0,'no beep on page load / manual detection start');
 h.language('en');
 assert.equal(h.elements.get('alert-tone-label').textContent,'Play alert beeps');
 h.language('zh-CN');
 assert.equal(h.elements.get('alert-tone-label').textContent,'播放提示音');
 assert.equal(h.oscillators.length,0,'changing language does not beep');
 h.stop();
});
test('each INACTIVE-to-ACTIVE warning plays exactly two soft, short output-only beeps',async()=>{
 const h=await harness();
 h.frame(1);h.emit(1,{score:.8,label:'車のクラクション'});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.oscillators.length,2);
 assert.deepEqual(h.oscillators.map(x=>x.frequency.value),[740,740]);
 assert.ok(h.oscillators.every(x=>x.type==='sine' && x.startedAt>=.02));
 assert.equal(h.oscillators[1].startedAt-h.oscillators[0].startedAt,.195);
 assert.ok(h.gains.slice(-2).every(g=>g.connections.includes(h.contexts[0].destination)),
   'output only; no tones are routed into microphone acquisition');
 assert.ok(h.gains.slice(-2).every(g=>g.gain.ramps.some(([,v])=>v===.045)),
   'each beep has a conservative gain envelope');
 h.now(500);h.frame(2);h.emit(2,{score:.9,label:'サイレン'});
 assert.equal(h.oscillators.length,2,'continued warning or type changes never replay');
 h.now(1600);h.frame(3);h.emit(3,{score:.6,label:'自転車のベル'});
 assert.equal(h.oscillators.length,4,'new trigger after 1 second warning hold plays two new beeps');
 h.stop();
});
test('toggle OFF mutes pending beeps and still shows the original red warning',async()=>{
 const h=await harness();
 h.frame(1);h.emit(1,{score:.7,label:'サイレン'});
 assert.equal(h.oscillators.length,2);
 h.elements.get('alert-tone-toggle').checked=false;
 h.elements.get('alert-tone-toggle').change();
 assert.ok(h.oscillators.every(x=>x.stopped && x.disconnected));
 assert.equal(h.document.body.dataset.state,'warning','audio settings never suppress the red visual warning');
 assert.equal(h.storageWrites.at(-1)[0],'trafficSoundGuardian.alertToneEnabled');
 assert.equal(h.storageWrites.at(-1)[1],'false');
 h.now(1500);h.frame(2);h.emit(2,{score:.6,label:'サイレン'});
 assert.equal(h.oscillators.length,2,'new warnings do not beep while muted');
 h.elements.get('alert-tone-toggle').checked=true;
 h.elements.get('alert-tone-toggle').change();
 h.now(1750);h.frame(3);h.emit(3,{score:.8,label:'サイレン'});
 assert.equal(h.oscillators.length,2,'toggling back ON mid-warning does not replay');
 h.now(3000);h.frame(4);h.emit(4,{score:.8,label:'サイレン'});
 assert.equal(h.oscillators.length,4,'beeps resume at the NEXT warning onset');
 h.stop();
});
test('persisted OFF is honored on reload, while absent or blocked preference defaults ON',async()=>{
 const h=await harness({storedAlert:'false'});
 assert.equal(h.elements.get('alert-tone-toggle').checked,false);
 h.frame(1);h.emit(1,{score:.9,label:'車のクラクション'});
 assert.equal(h.oscillators.length,0);
 h.stop();
});
test('stop, backgrounding and new session cancel scheduled sounds; audio errors never cancel visual warning',async()=>{
 const h=await harness();
 h.frame(1);h.emit(1,{score:.9,label:'サイレン'});
 assert.equal(h.oscillators.length,2);
 h.stop();
 assert.ok(h.oscillators.every(x=>x.stopped && x.disconnected));
 assert.equal(h.contexts[0].state,'closed');
 h.click();await flush();
 h.contexts[1].createOscillator=()=>{throw Error('Output blocked by OS')};
 h.frame(2);h.emit(2,{score:.8,label:'サイレン'});
 assert.equal(h.document.body.dataset.state,'warning','blocked output must not affect visual or microphone detection');
 assert.equal(h.oscillators.length,2);
 h.stop();
});


test('V1.6.3: microphone pill displays the actual browser track NAME, without commentary',async()=>{
 const h=await harness({trackLabel:'Microphone',devices:[{kind:'audiooutput',label:'AirPods Pro',deviceId:'headphones'}]});
 assert.equal(h.elements.get('mic-source-value').textContent,'Microphone');
 assert.equal(h.calls(),1,'no additional getUserMedia() request');
 h.language('en');
 assert.equal(h.elements.get('mic-source-value').textContent,'Microphone');
 assert.equal(h.elements.get('settings-title').textContent,'Settings');
 assert.equal(h.elements.get('settings-toggle').attributes['aria-label'],'Settings');
 h.language('zh-CN');
 assert.equal(h.elements.get('mic-source-value').textContent,'Microphone');
 assert.equal(h.elements.get('settings-title').textContent,'设置');
 assert.equal(h.calls(),1,'no new microphone request on language change');
 h.frame(1);h.emit(1,{score:.5,label:'サイレン'});
 assert.equal(h.document.body.dataset.state,'warning');
 assert.equal(h.elements.get('mic-source-value').textContent,'Microphone');
 h.stop();
 assert.equal(h.elements.get('mic-source-value').textContent,'未开始使用麦克风');
 assert.ok(!page.includes('id="mic-source-note"')&&!page.includes('id="mic-source-name"'),
   'no extra technical explanation or duplicate label on page');
});
test('V1.6.3: genuine labeled track name changes without affecting the detection pipeline',async()=>{
 const h=await harness({trackLabel:'iPhone Microphone',deviceId:'phone-input'});
 assert.equal(h.elements.get('mic-source-value').textContent,'iPhone Microphone');
 h.tracks[0].label='AirPods Pro Microphone';
 h.events['media-devicechange']();
 await flush();await flush();
 assert.equal(h.elements.get('mic-source-value').textContent,'AirPods Pro Microphone');
 assert.equal(h.calls(),1,'devicechange should not request another microphone');
 assert.equal(h.sources.length,1,'original classification stream remains unchanged');
 h.stop();
 assert.equal(h.events['media-devicechange'],undefined,'removed devicechange listener');
});
test('V1.6.3: matching audioinput device name is shown, never infer from audiooutput',async()=>{
 const h=await harness({trackLabel:'Microphone',deviceId:'source-id',
   devices:[{kind:'audioinput',deviceId:'source-id',label:'WH-1000XM6 Headset Microphone'},
            {kind:'audiooutput',deviceId:'another',label:'iPhone Speaker'}]});
 assert.equal(h.elements.get('mic-source-value').textContent,'WH-1000XM6 Headset Microphone');
 h.stop();
 const noMatch=await harness({trackLabel:'Microphone',deviceId:'headphone-output',
   devices:[{kind:'audiooutput',deviceId:'headphone-output',label:'AirPods Pro'}]});
 assert.equal(noMatch.elements.get('mic-source-value').textContent,'Microphone');
 noMatch.stop();
});
test('V1.6.3: no label, permission denial and restricted enumeration remain truthful',async()=>{
 const unavailable=await harness({trackLabel:'',deviceId:'',enumerationFails:true});
 assert.equal(unavailable.elements.get('mic-source-value').textContent,'マイクの種類を確認できません');
 unavailable.stop();
 const denied=await harness({deny:true,trackLabel:'AirPods Pro'});
 assert.equal(denied.elements.get('mic-source-value').textContent,'マイクを使用していません');
 denied.stop();
});
test('V1.6.6 Settings includes tone, language, theme, feedback and two tests; Debug outside',async()=>{
 const start=page.indexOf('id="settings-content"'),end=page.indexOf('</details>',start);
 assert.ok(start>0&&end>start);
 const menu=page.slice(start,end);
 for(const id of ['language-select','alert-tone-toggle','feedback','ai-test-link','microphone-test-link'])
   assert.ok(menu.includes('id="'+id+'"'),id);
 for(const id of ['debug-toggle','sensitivity-panel','threshold-input-0','threshold-input-5'])
   assert.ok(!menu.includes('id="'+id+'"'),id+' must remain outside Settings');
 assert.equal((page.match(/id="settings-toggle"/g)||[]).length,1);
 assert.ok(page.indexOf('id="debug-toggle"')<start&&page.indexOf('id="debug-toggle"')>page.indexOf('class="toolbar"'));
 assert.ok(page.indexOf('id="debug-panel"')>end);
 assert.ok(page.indexOf('id="ai-test-link"')<end,'AI Test Mode only inside settings');
 assert.ok(!page.slice(page.indexOf('<footer>'),page.indexOf('</footer>')).includes('id="ai-test-link"'));
 const css=fs.readFileSync(new URL('./v1.6.css',import.meta.url),'utf8');
 assert.match(css,/main \.rolling-panel\{width:100%;max-width:420px/);
 assert.match(css,/main #rolling-waveform\{width:100%;height:104px\}/);
 assert.match(css,/#rolling-waveform\{height:84px\}/);
 assert.doesNotMatch(css,/920px|100vw - 18px|100vw - 12px/);
 assert.match(css,/\.toolbar\{justify-content:space-between/);
 assert.match(css,/\.settings-content\{box-sizing:border-box;position:absolute/);
 const theme=fs.readFileSync(new URL('./theme.js',import.meta.url),'utf8');
 assert.match(theme,/getElementById\('settings-content'\)/);
 const h=await harness({autoStart:false});
 assert.equal(h.calls(),0);
 const bell=h.elements.get('threshold-input-0');bell.value='.05';bell.input();
 assert.equal(h.elements.get('threshold-value-0').textContent,'0.05');
 h.debug(false);h.debug(true);
 assert.equal(h.calls(),0);
 h.stop();
});
// V1.6.6: quiet waveform baseline regression; no capture or AI changes.
test('V1.6.6 quiet waveform has lower near-silence baseline, larger levels remain visible',()=>{
 const js=fs.readFileSync(new URL('./live-timeline.js',import.meta.url),'utf8');
 assert.match(js,/Math\.tanh\(Math\.pow\(p\.rms, 0\.65\) \* 11\.5\) \* maxAmplitude/);
 assert.match(js,/Math\.max\(1\.5,w\/260\)/);
 const gain=(rms,h)=>Math.tanh(Math.pow(rms,.65)*11.5)*Math.min(h*.45,(h-22)/2);
 const oldGain=(rms,h)=>Math.max(1.5,Math.tanh(Math.sqrt(rms)*14.4)*h*.45);
 assert.equal(gain(0,104),0,'true silence stays visually flat');
 for(const rms of [.000001,.0001,.001])assert.ok(gain(rms,104)<oldGain(rms,104),'near silence no longer looks loud');
 assert.ok(gain(.001,104)>1,'subtle real sound stays visible');
 assert.ok(gain(.01,104)>gain(.001,104),'stronger real sound increases height');
 for(const rms of [0,.0001,.01,.25,1,100])assert.ok(gain(rms,104)<=104*.45);
 assert.match(page,/live-timeline\.js\?v=1\.6\.17/);
});
test('V1.6.6 larger mic circle works for normal, warning and compact layouts',()=>{
 const css=fs.readFileSync(new URL('./v1.6.css',import.meta.url),'utf8');
 assert.match(css,/\.visual \.icon-disc\{width:132px;height:132px\}/);
 assert.match(css,/body\[data-state=warning\] \.visual \.icon-disc\{width:136px;height:136px\}/);
 assert.match(css,/@media\(max-height:740px\)\{\.visual \.icon-disc\{width:114px;height:114px\}body\[data-state=warning\] \.visual \.icon-disc\{width:116px;height:116px\}\}/);
 assert.match(css,/\.visual \.mic-icon\{width:48px;height:52px\}/);
 assert.match(page,/id="mic-control" class="icon-disc"/);
});

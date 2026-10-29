// Isolated controller tests with fake browser devices. This file is never imported
// by index.html; these fixtures do not replace real audio/model code in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { WarningGate, TARGETS } from './detection.js';
import { debugCategoryName } from './debug.js';
import { AudioWindowBuffer } from './audio-window.js';
const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/project/app.js'");
const page=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const pageIds=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({autoStart=true,deny=false,deferMic=false,suspended=false,worklet=false,formURL='',deferModel=false}={}) {
 const elements=new Map(),drawing=[];
 const canvas={setTransform(){},clearRect(){drawing.length=0;},beginPath(){},moveTo(x,y){drawing.push([x,y]);},lineTo(x,y){drawing.push([x,y]);},stroke(){}};
 const element=id=>{
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',attributes:{},children:[],clientWidth:300,clientHeight:48,
   append(...nodes){for(const node of nodes)this.children.push(...(node.fragment ? node.children : [node]));},
   replaceChildren(...nodes){this.children=[];this.append(...nodes);},
   scrolls:[],scrollIntoView(options){this.scrolls.push(options);},
   style:{values:{},setProperty(key,value){this.values[key]=value;}},
   setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
   getContext:()=>canvas,addEventListener(name,fn){this[name]=fn;}});
  return elements.get(id);
 };
 const tracks=[],workers=[],contexts=[],nodes=[],sources=[],analysers=[],timers=new Map(),frames=new Map(),events={};
 let now=0,nextTimer=0,micCalls=0,resolveMic,denied=deny;
 const makeStream=()=>{
  const track={readyState:'live',muted:false,stop(){this.readyState='ended';this.stopped=true;}};tracks.push(track);
  return {getTracks:()=>[track],getAudioTracks:()=>[track]};
 };
 const baseNode=()=>({connections:[],connect(node){this.connections.push(node);},disconnect(){this.disconnected=true;}});
 class Context {
  constructor(){this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination={};contexts.push(this);if(worklet)this.audioWorklet={addModule:async()=>{}};}
  resume(){if(!suspended)this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createMediaStreamSource(){const node=baseNode();sources.push(node);return node;}
  createAnalyser(){const node={...baseNode(),fftSize:2048,pcm:new Float32Array(2048),getFloatTimeDomainData(out){out.set(this.pcm);}};analysers.push(node);return node;}
  createGain(){return {...baseNode(),gain:{value:1}};}
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
 const context=vm.createContext({WarningGate,TARGETS,debugCategoryName,AudioWindowBuffer,Float32Array,URL,DOMException,console:{error(){},warn(){}},
  setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms,interval:true});return id;},clearInterval:id=>timers.delete(id),
  requestAnimationFrame(fn){const id=++nextTimer;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  performance:{now:()=>now},document,Worker:ModelWorker,...(worklet?{AudioWorkletNode:WorkletNode}:{}),
  window:{isSecureContext:true,AudioContext:Context,addEventListener(name,fn){events[name]=fn;}},
  navigator:{mediaDevices:{getUserMedia(){micCalls++;if(denied)return Promise.reject(new DOMException('denied','NotAllowedError'));
    if(deferMic)return new Promise(resolve=>{resolveMic=()=>resolve(makeStream());});return Promise.resolve(makeStream());}}}
 });
 vm.runInContext(source.replace("const FEEDBACK_FORM_URL = '';", "const FEEDBACK_FORM_URL = "+JSON.stringify(formURL)+";"),context);
 // The test harness simulates the user's tap; production never starts itself.
 if(autoStart)element('mic-control').click();
 await flush();await flush();
 return {document,elements,tracks,workers,contexts,nodes,sources,analysers,drawing,frames,timers,events,context,
  animate(time){const tasks=[...frames.values()];frames.clear();tasks.forEach(fn=>fn(time));},
  language:lang=>element('language-'+lang).click(),
  debug(enabled){element('debug-toggle').checked=enabled;element('debug-toggle').change();},
  calls:()=>micCalls,allow:()=>denied=false,resolveMic:()=>resolveMic(),now:n=>now=n,
  run:code=>vm.runInContext(code,context),click:()=>element('mic-control').click(),stop:()=>vm.runInContext('stop()',context),
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

// V1.1 regressions. Controlled PCM/device fixtures only; not loaded by the website.
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
test('switching languages keeps the active microphone, worker, score streak and warning expiry',async()=>{
 const h=await harness();assert.equal(h.document.documentElement.lang,'ja');
 h.frame(1);h.emit(1,{score:.6,label:'自転車のベル'});
 h.language('en');assert.equal(h.document.documentElement.lang,'en');
 assert.equal(h.elements.get('heading').textContent,'Listening to your surroundings...');
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
 assert.equal(h.elements.get('language-en').attributes['aria-pressed'],'true');h.stop();
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
test('debug switch is discoverable before the main visualization and reveals its connected panel only on enable',async()=>{
 assert.equal([...page.matchAll(/id="debug-toggle"/g)].length,1);
 assert.ok(page.indexOf('id="debug-toggle"')>page.indexOf('class="toolbar"'));
 assert.ok(page.indexOf('id="debug-toggle"')<page.indexOf('<main>'));
 assert.match(page, /id="debug-toggle"[^>]*aria-controls="debug-panel"/);
 const h=await harness();const panel=h.elements.get('debug-panel');
 assert.equal(panel.scrolls.length,0);h.debug(true);
 assert.equal(panel.scrolls.length,1);assert.equal(panel.scrolls[0].block,'start');
 assert.equal(panel.hidden,false);assert.equal(panel.open,true);
 h.frame(1);h.workers[0].emit({type:'result',sequence:1,target:null,inferenceMs:4,debug:diagnosticFixture()});
 h.language('en');assert.equal(panel.scrolls.length,1);assert.equal(panel.hidden,false);
 assert.equal(h.elements.get('debug-toggle-label').textContent,'AI Debug Mode');
 h.debug(false);assert.equal(panel.scrolls.length,1);assert.equal(panel.hidden,true);
 assert.equal(h.calls(),1);assert.equal(h.workers.length,1);h.stop();
});
test('V1.3.1 page, manifest and cache URLs agree',()=>{
 assert.match(page, /<title>Traffic Sound Guardian V1\.3\.1<\/title>/);
 assert.match(page, /class="version">V1\.3\.1<\/span>/);
 assert.match(page, /src="\.\/app\.js\?v=1\.3\.1"/);
 assert.match(page, /href="\.\/style\.css\?v=1\.3\.1"/);
 assert.match(source, /classifier-worker\.js\?v=1\.3\.1/);
 assert.equal(JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest',import.meta.url))).name,'Traffic Sound Guardian V1.3.1');
 assert.equal(JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url))).version,'1.3.1');
});
test('debug mode is opt-in, expands below the app, and changes neither session nor warning deadline',async()=>{
 const h=await harness();assert.equal(h.run('debugEnabled'),false);assert.ok(h.elements.get('debug-panel').hidden);
 h.frame(1);h.emit(1,{score:.8,label:'車のクラクション'});const timer=h.run('session.warningTimeout');
 h.debug(true);assert.equal(h.elements.get('debug-panel').open,true);assert.equal(h.elements.get('debug-panel').hidden,false);
 assert.equal(h.run('session.warningTimeout'),timer);assert.equal(h.calls(),1);assert.equal(h.workers.length,1);assert.equal(h.frames.size,1);
 h.elements.get('debug-panel').open=false;
 assert.equal(h.run('debugEnabled'),true);h.debug(false);assert.equal(h.run('session.warningTimeout'),timer);
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');assert.ok(html.indexOf('class="debug-section"')>html.indexOf('</footer>'));h.stop();
});
test('debug displays real-result low and zero raw scores while original rules do not warn',async()=>{
 const h=await harness();h.debug(true);h.frame(1);
 assert.equal(h.workers[0].sent.at(-1).debug,true);
 h.workers[0].emit({type:'result',sequence:1,target:{score:.123456789012345,label:'自転車のベル'},inferenceMs:12.3456,debug:diagnosticFixture()});
 assert.equal(h.document.body.dataset.state,'listening');
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
test('waveform uses a 50 percent higher display gain without mutating captured frames',async()=>{
 assert.match(source,/samples\[i\] \* 6/);
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

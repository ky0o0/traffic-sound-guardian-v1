// Test fixtures only: production Debug Mode always reads real model results.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { summarizeDebug, JAPANESE_LABELS, debugCategoryName, topCategory } from './debug.js';
import { TARGETS, WARNING_TARGETS, bestTarget, targetScores } from './detection.js';
const names=fs.readFileSync(new URL('./yamnet_class_map.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(line=>{
 const value=line.slice(line.indexOf(',',line.indexOf(',')+1)+1);return value.startsWith('"')?JSON.parse(value):value;
});
function results(){return [{classifications:[{categories:names.map((categoryName,index)=>({categoryName,index,score:index===0?.931234567890123:index===1?.71:index===2?.69:index===3?.62:index===4?.51:index===198?.123456789012345:0}))}]}];}

test('debug sorts all 521 categories into top five and includes all eleven alertable raw scores',()=>{
 const data=results();data[0].classifications[0].categories.reverse();
 const result=summarizeDebug(data);
 assert.deepEqual(result.top5.map(c=>c.index),[0,1,2,3,4]);
 assert.equal(result.targets.length,11);
 assert.equal(result.targets.find(c=>c.index===198).score,.123456789012345);
 assert.equal(result.targets.find(c=>c.index===302).score,0);
});
test('debug preserves raw values, original category order and warning target selection',()=>{
 const data=results(),before=JSON.stringify(data),target=bestTarget(data);
 const debug=summarizeDebug(data);
 assert.equal(String(debug.top5[0].score),'0.931234567890123');
 assert.equal(JSON.stringify(data),before);assert.deepEqual(bestTarget(data),target);
 assert.notEqual(debug.top5[0],data[0].classifications[0].categories[0]);
});
test('unavailable target scores are null rather than invented zeros; invalid values excluded',()=>{
 const data=[{classifications:[{categories:[{categoryName:'Speech',index:0,score:NaN},{categoryName:'Siren',index:390,score:Infinity}]}]}];
 const debug=summarizeDebug(data);assert.equal(debug.top5.length,0);
 assert.ok(debug.targets.every(c=>c.score===null));
});
test('all 521 official categories have Japanese display names and unchanged English labels',()=>{
 assert.equal(Object.keys(JAPANESE_LABELS).length,521);
 for(const categoryName of names){
  assert.ok(JAPANESE_LABELS[categoryName],categoryName);
  assert.match(debugCategoryName({categoryName},'ja'),/[\u3040-\u30ff\u4e00-\u9fff]/);
  assert.equal(debugCategoryName({categoryName},'en'),categoryName);
 }
 for(const [categoryName,target] of Object.entries(TARGETS))assert.equal(JAPANESE_LABELS[categoryName],target.label);
});
async function workerHarness({failInit=false,failInference=false}={}){
 let calls=0,creates=0,now=100,options;
 const sent=[],data=results();
 const classifier={classify(audio,rate){calls++;assert.equal(rate,16000);assert.equal(audio.length,15600);now+=12.3456789;if(failInference)throw Error('test inference failure');return data;}};
 const modules={
  './audio_bundle.mjs':{FilesetResolver:{forAudioTasks:async()=>({})},AudioClassifier:{createFromOptions:async(files,value)=>{creates++;options=value;if(failInit)throw Error('test model failure');return classifier;}}},
  './detection.js':{bestTarget,targetScores},'./resample.js':{toModelAudio:samples=>{now+=40;return samples;}},'./debug.js':{summarizeDebug,topCategory}
 };
 const self={location:{href:'https://example.test/project/classifier-worker.js'},postMessage:value=>sent.push(value)};
 const code=fs.readFileSync(new URL('./classifier-worker.js',import.meta.url),'utf8').replaceAll('import(', 'load(');
 vm.runInNewContext(code,{self,URL,performance:{now:()=>now},load:async path=>modules[path.split('?')[0]]});
 const send=async message=>{await self.onmessage({data:message});return sent.at(-1);};
 return {send,sent,calls:()=>calls,creates:()=>creates,options:()=>options,data};
}
test('worker reuses exactly one classify call with debug on or off and measures only model time',async()=>{
 const h=await workerHarness();await h.send({type:'init'});await h.send({type:'init'});
 assert.equal(h.creates(),1);assert.equal(h.options().maxResults,-1);assert.equal(h.options().scoreThreshold,0);
 const audio=new Float32Array(15600);
 const off=await h.send({type:'classify',sequence:1,samples:audio,sampleRate:16000,debug:false});
 const on=await h.send({type:'classify',sequence:2,samples:audio,sampleRate:16000,debug:true});
 assert.equal(h.calls(),2);assert.equal(off.debug,undefined);assert.deepEqual(on.target,off.target);
 assert.equal(on.debug.top5.length,5);assert.equal(on.debug.targets.length,11);
 assert.ok(Math.abs(on.inferenceMs-12.3456789)<1e-9,'resampling time is excluded');
 assert.ok(!('samples' in on));assert.ok(!('audio' in on.debug));
});
test('current-sound top category is real, raw, stable on ties and independent of Debug Mode',async()=>{
 const data=results(),previous=JSON.stringify(data);
 const top=topCategory(data);
 assert.equal(top.categoryName,names[0]);assert.equal(top.score,.931234567890123);
 assert.equal(JSON.stringify(data),previous,'do not modify raw model output');
 assert.equal(topCategory([{classifications:[{categories:[{categoryName:'Music',index:2,score:NaN}]}]}]),null);
 const tie=topCategory([{classifications:[{categories:[{categoryName:'Music',index:12,score:.6},{categoryName:'Speech',index:0,score:.6}]}]}]);
 assert.equal(tie.categoryName,'Speech');
 const h=await workerHarness();await h.send({type:'init'});
 const off=await h.send({type:'classify',sequence:1,samples:new Float32Array(15600),sampleRate:16000,debug:false});
 assert.equal(off.debug,undefined);assert.equal(off.topCategory.categoryName,names[0]);
 assert.equal(off.topCategory.score,.931234567890123);
 assert.ok(!('samples' in off)&&!('audio' in off));
});
test('worker reports actual initialization failure without pretending inference ran',async()=>{
 const h=await workerHarness({failInit:true});const result=await h.send({type:'init'});
 assert.equal(result.type,'error');assert.equal(result.operation,'init');assert.equal(result.inferenceMs,null);assert.equal(h.calls(),0);
});
test('worker reports failed inference operation and measured elapsed time',async()=>{
 const h=await workerHarness({failInference:true});await h.send({type:'init'});
 const result=await h.send({type:'classify',sequence:3,samples:new Float32Array(15600),sampleRate:16000,debug:true});
 assert.equal(result.type,'error');assert.equal(result.operation,'classify');assert.equal(result.sequence,3);
 assert.ok(Math.abs(result.inferenceMs-12.3456789)<1e-9);assert.equal(result.debug,undefined);
});

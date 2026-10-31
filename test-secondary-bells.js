// V1.6.15: every allowed bell is evaluated by its raw YAMNet score, with no
// Top-1 gating, no score sums, no new model or altered six-slider settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TARGETS, SECONDARY_BELLS, WARNING_TARGETS, TRAFFIC_ENVIRONMENT, DEFAULT_THRESHOLD,
  bestTarget, targetScores, chooseTarget, WarningGate} from './detection.js';
const frame = categories => [{classifications:[{categories}]}];
const csv=fs.readFileSync(new URL('./yamnet_class_map.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
test('eleven alertable classes use exact official YAMNet label indices, with six adjustable traffic classes',()=>{
 assert.equal(Object.keys(TARGETS).length,6);
 assert.equal(Object.keys(SECONDARY_BELLS).length,5);
 assert.equal(Object.keys(WARNING_TARGETS).length,11);
 assert.equal(DEFAULT_THRESHOLD,.10);
 for(const [name,{index}] of Object.entries(WARNING_TARGETS)){
  const v=csv[index].split(',').slice(2).join(',').replace(/^"|"$/g,'');
  assert.equal(v,name,'exact official name/index for '+name);
 }
});
test('every secondary bell warns immediately at exactly .10 even when Music ranks Top 1',()=>{
 for(const name of Object.keys(SECONDARY_BELLS)){
  const data=frame([{categoryName:'Music',score:.98},{categoryName:name,score:.10}]);
  const scores=targetScores(data);
  assert.equal(scores[name],.10);
  const chosen=chooseTarget(scores);
  assert.equal(chosen?.name,name);
  assert.equal(chosen?.score,.10);
  const gate=new WarningGate();
  assert.equal(gate.observe(chosen,480),true);
  assert.equal(gate.expire(1479),true);
  assert.equal(gate.expire(1480),false);
 }
});
test('secondary bells below .10 do not warn; invalid and unrelated scores never warn',()=>{
 for(const name of Object.keys(SECONDARY_BELLS)){
  for(const value of [.099999,0])assert.equal(chooseTarget({[name]:value}),null);
  for(const value of [NaN,-.2,Infinity,1.5])assert.equal(chooseTarget({[name]:value}),null);
 }
 for(const name of TRAFFIC_ENVIRONMENT){
  assert.equal(chooseTarget({[name]:1}),null,name+' is visible but not an alert');
  assert.equal(bestTarget(frame([{categoryName:name,score:1}])),null);
 }
 assert.equal(chooseTarget({'Music':1,'Speech':1}),null);
});
test('generic bell thresholds stay fixed at .10 while six traffic sliders remain independently adjustable',()=>{
 const [original]=Object.keys(TARGETS);
 assert.equal(chooseTarget({[original]:.06},{[original]:.05})?.name,original);
 assert.equal(chooseTarget({[original]:.06},{[original]:.10}),null);
 for(const name of Object.keys(SECONDARY_BELLS)){
   assert.equal(chooseTarget({[name]:.06},{[name]:.01}),null,'user thresholds cannot silently lower generic bell cutoff');
   assert.equal(chooseTarget({[name]:.10},{[name]:.50})?.name,name);
 }
});
test('traffic-specific labels always take display priority over more highly scored generic bell labels',()=>{
 const scores={'Bicycle bell':.12,'Chime':.93,'Ding':.96};
 assert.equal(chooseTarget(scores)?.name,'Bicycle bell');
 assert.equal(chooseTarget({'Bicycle bell':.09,'Chime':.93})?.name,'Chime');
 assert.equal(chooseTarget({'Bell':.15,'Chime':.3})?.name,'Chime');
 assert.equal(targetScores(frame([{categoryName:'Music',score:1},{categoryName:'Ding',score:.21}]))['Ding'],.21);
});

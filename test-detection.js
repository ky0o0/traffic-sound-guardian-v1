import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TARGETS, bestTarget, targetScores, chooseTarget, WarningGate } from './detection.js';
const t = (score, name = 'Bicycle bell') => ({ score, name, label: TARGETS[name].label });
const result = categories => [{ classifications: [{ categories }] }];

test('a single result at the default 0.50 threshold warns immediately', () => {
 const gate = new WarningGate();
 assert.equal(gate.observe(t(.50), 0), true);
 assert.equal(gate.target.name, 'Bicycle bell');
 gate.reset();
 assert.equal(gate.observe(t(.499999), 0), false);
 assert.equal(gate.observe(t(.75), 480), true);
});
test('a single result at any of six category-specific thresholds warns immediately', () => {
 for(const name of Object.keys(TARGETS)) {
  const gate = new WarningGate();
  assert.equal(gate.observe(t(.08,name), 0, .08), true);
  assert.equal(gate.target.name, name);
 }
});
test('a single result below its configured threshold never triggers warning', () => {
 for(const score of [0, .001, .049999]) {
  const gate=new WarningGate();
  assert.equal(gate.observe(t(score), 0, .05), false);
 }
});
test('a frame gap never postpones a valid new alert', () => {
 const gate=new WarningGate();
 gate.observe(null,0);gate.breakSequence();
 assert.equal(gate.observe(t(.50,'Siren'),480),true);
});
test('warning persists three seconds after last qualifying inference', () => {
 const gate=new WarningGate();
 assert.equal(gate.observe(t(.50),0),true);
 assert.equal(gate.observe(t(.50,'Siren'),1000),true);
 assert.equal(gate.observe(t(.49),1480),true);
 assert.equal(gate.expire(3999),true);
 assert.equal(gate.expire(4000),false);
 assert.equal(gate.target,null);
 assert.equal(gate.observe(t(.60),4001),true);
});
test('below-threshold scores do not prolong an active warning', () => {
 const gate=new WarningGate();
 gate.observe(t(.50),0);
 gate.observe(t(.499),2900);
 assert.equal(gate.expire(3000),false);
});
test('null/invalid output cannot trigger a fresh alert', () => {
 for(const target of [null,{score:NaN},{score:Infinity},{score:-1}]) {
  const gate=new WarningGate();
  assert.equal(gate.observe(target,0,.01),false);
 }
});
test('all categories and heads are scanned, not just top one', () => {
 const results = result([{ categoryName:'Speech', score:.99 },{ categoryName:'Bicycle bell',score:.81 },{ categoryName:'Siren',score:.91 }]);
 assert.equal(bestTarget(results).name, 'Siren');
 results.push(...result([{ categoryName:'Ambulance (siren)',score:.93 }]));
 assert.equal(bestTarget(results).label, 'サイレン（救急車）');
});
test('ordinary traffic, generic bells and misleading partial label matches are ignored', () => {
 assert.equal(bestTarget(result(['Traffic noise, roadway noise','Car','Bicycle','Bell','French horn','Civil defense siren'].map(categoryName => ({ categoryName,score:1 })))), null);
});
test('invalid numbers are never used as warning scores', () => {
 for (const score of [NaN, Infinity,-.1,1.1]) assert.equal(bestTarget(result([{ categoryName:'Siren',score }])),null);
});
test('target names and indices agree with bundled official CSV', () => {
 const rows=fs.readFileSync(new URL('./yamnet_class_map.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
 assert.equal(rows.length,521);
 for (const [name,{index}] of Object.entries(TARGETS)) {
  assert.equal(rows[index].split(',').slice(2).join(',').replace(/^"|"$/g,''),name);
 }
});


test('six target sounds each have an independently adjustable detection threshold',()=>{
 const names=Object.keys(TARGETS);
 for(let j=0;j<names.length;j++){
  const scores=Object.fromEntries(names.map((n,i)=>[n,i===j?.08:.002]));
  const limits=Object.fromEntries(names.map((n,i)=>[n,i===j?.07:.50]));
  const chosen=chooseTarget(scores,limits);
  assert.equal(chosen.name,names[j]);
  const gate=new WarningGate();
  assert.equal(gate.observe(chosen,0,limits[names[j]]),true);
 }
});
test('target extraction preserves real scores for all six, not just the highest',()=>{
 const names=Object.keys(TARGETS);
 const categories=names.map((categoryName,i)=>({categoryName,score:(i+1)/100}));
 const scores=targetScores(result(categories));
 assert.equal(Object.keys(scores).length,6);
 names.forEach((n,i)=>assert.equal(scores[n],(i+1)/100));
});
test('higher ineligible score never hides another eligible class',()=>{
 const [bell,horn,siren]=Object.keys(TARGETS);
 const chosen=chooseTarget({[bell]:.10,[horn]:.25,[siren]:.09},{[bell]:.11,[horn]:.30,[siren]:.08});
 assert.equal(chosen.name,siren);
});
test('default 0.50 settings retain sensitivity and three-second expiry',()=>{
 const names=Object.keys(TARGETS),limits=Object.fromEntries(names.map(n=>[n,.50]));
 assert.equal(chooseTarget(Object.fromEntries(names.map(n=>[n,.12])),limits),null);
 const selected=chooseTarget({[names[0]]:.6,[names[1]]:.7},limits);
 assert.equal(selected.name,names[1]);
 const gate=new WarningGate();
 assert.equal(gate.observe(selected,0,.5),true);
 assert.equal(gate.expire(2999),true);
 assert.equal(gate.expire(3000),false);
 gate.reset();
 assert.equal(gate.observe(chooseTarget({[names[2]]:.75},limits),0,.5),true);
});
test('invalid scores and unrelated sound classes cannot trigger alerts',()=>{
 assert.equal(Object.keys(targetScores(result([{categoryName:'Bell',score:.95}]))).length,0);
 for(const score of [NaN,Infinity,-.2,1.2]){
  assert.equal(Object.keys(targetScores(result([{categoryName:'Bicycle bell',score}]))).length,0);
 }
 assert.equal(chooseTarget({'Bicycle bell':0},{'Bicycle bell':.01}),null);
 assert.equal(chooseTarget({'Bicycle bell':.8},{'Bicycle bell':0}),null);
});

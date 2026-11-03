import test from 'node:test';
import assert from 'node:assert/strict';
import {WARNING_TARGETS,chooseTarget,effectiveThreshold} from './detection.js';
for(const name of Object.keys(WARNING_TARGETS)){
 test(`${name}: default, overall and independent thresholds compose without changing raw scores`,()=>{
  const scores={[name]:.08},before=JSON.stringify(scores);
  assert.equal(chooseTarget(scores),null);
  assert.equal(chooseTarget(scores,{[name]:.10},1.5)?.name,name);
  assert.equal(chooseTarget(scores,{[name]:.20},1.5),null);
  assert.equal(chooseTarget(scores,{[name]:.05},.5),null);
  assert.equal(chooseTarget(scores,{[name]:.05},1)?.score,.08);
  assert.equal(JSON.stringify(scores),before);
 });
}
test('threshold scaling is monotonic, bounded and identity by default including legacy values',()=>{
 for(const base of [.01,.03,.07,.10,.23,.50]){
  assert.equal(effectiveThreshold(base,1),base);
  assert.ok(effectiveThreshold(base,.5)>=effectiveThreshold(base,1));
  assert.ok(effectiveThreshold(base,1)>=effectiveThreshold(base,1.5));
  for(const global of [.5,1,1.5])assert.ok(effectiveThreshold(base,global)>=.01&&effectiveThreshold(base,global)<=.50);
 }
 assert.equal(effectiveThreshold(.5,.5),.5);assert.equal(effectiveThreshold(.01,1.5),.01);
 for(const invalid of [NaN,Infinity,-1,0,2])assert.equal(effectiveThreshold(.1,invalid),.1);
});

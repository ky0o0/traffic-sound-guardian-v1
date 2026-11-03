import test from 'node:test';
import assert from 'node:assert/strict';
import {WARNING_TARGETS,chooseTarget,effectiveThreshold} from './detection.js';
for (const name of Object.keys(WARNING_TARGETS)) {
 test(`${name}: direct threshold determines warning without changing raw score`,()=>{
  const scores={[name]:.08},before=JSON.stringify(scores);
  assert.equal(chooseTarget(scores),null);
  assert.equal(chooseTarget(scores,{[name]:.05})?.name,name);
  assert.equal(chooseTarget(scores,{[name]:.10}),null);
  assert.equal(chooseTarget(scores,{[name]:.05})?.score,.08);
  assert.equal(JSON.stringify(scores),before);
 });
}
test('direct thresholds preserve valid values and reject invalid ones',()=>{
 for(const base of [.01,.03,.07,.10,.23,.50])assert.equal(effectiveThreshold(base),base);
 for(const invalid of [NaN,Infinity,-1,0,2])assert.equal(effectiveThreshold(invalid),.10);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TARGETS, bestTarget, WarningGate } from './detection.js';
const t = (score, name = 'Bicycle bell') => ({ score, name, label: TARGETS[name].label });
const result = categories => [{ classifications: [{ categories }] }];

test('0.75 triggers immediately; 0.749999 requires a second result', () => {
 const gate = new WarningGate();
 assert.equal(gate.observe(t(.75), 0), true);
 gate.reset();
 assert.equal(gate.observe(t(.749999), 0), false);
 assert.equal(gate.observe(t(.749999), 480), true);
});
test('0.50 boundary and two different traffic sounds qualify', () => {
 const gate = new WarningGate();
 assert.equal(gate.observe(t(.5), 0), false);
 assert.equal(gate.observe(t(.5, 'Siren'), 480), true);
 assert.equal(gate.target.name, 'Siren');
});
test('a below-threshold result resets consecutive count', () => {
 const gate = new WarningGate();
 for (const score of [.7,.49999,.7,0,.7]) assert.equal(gate.observe(t(score), 0), false);
 assert.equal(gate.observe(t(.5), 480), true);
});
test('missing target and dropped audio break consecutive count', () => {
 const gate = new WarningGate();
 gate.observe(t(.6), 0); gate.observe(null, 480);
 assert.equal(gate.observe(t(.6), 960), false);
 gate.breakSequence();
 assert.equal(gate.observe(t(.6), 1920), false);
});
test('active warning persists at 0.50 and expires at exactly 3000 ms', () => {
 const gate = new WarningGate();
 gate.observe(t(.9), 0); gate.observe(t(.5, 'Siren'), 1000); gate.observe(t(.49), 1480);
 assert.equal(gate.expire(3999), true);
 assert.equal(gate.expire(4000), false);
 assert.equal(gate.target, null);
 assert.equal(gate.observe(t(.6), 4001), false);
});
test('below-threshold sounds do not extend the red warning', () => {
 const gate = new WarningGate(); gate.observe(t(.9), 0);
 gate.observe(t(.499), 2900);
 assert.equal(gate.expire(3000), false);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL('./' + path, import.meta.url), 'utf8');
const standard = read('index.html');
const research = read('ipad-test.html');
const controller = read('app.js') + '\n' + read('threshold-settings.js');
const detection = read('detection.js');

test('Standard sets a direct threshold between 0.01 and 0.50', () => {
  assert.match(standard, /id="standard-threshold"[^>]*max="0.50"[^>]*min="0.01"[^>]*step="0.01"/);
  assert.match(controller, /trafficSoundGuardian\.standardThreshold/);
  assert.match(controller, /\[name, standardThreshold\]/);
  assert.doesNotMatch(standard, /overall-sensitivity|1.00×/);
});

test('Test provides eleven independent direct thresholds and no overall control', () => {
  assert.equal((research.match(/id="threshold-input-\d+"/g) || []).length, 11);
  assert.equal((research.match(/id="threshold-effective-\d+"/g) || []).length, 0);
  assert.doesNotMatch(research, /overall-sensitivity|standard-threshold|sensitivity-scale|Base → Effective/);
  assert.match(controller, /mode === 'standard'/);
  assert.match(controller, /: soundThresholds/);
  assert.doesNotMatch(controller, /overallSensitivity|OVERALL_STORAGE_KEY/);
  assert.doesNotMatch(detection, /validSensitivity|base\s*\/\s*validSensitivity/);
});

test('Test preserves individual preferences while Standard has a separate key', () => {
  assert.match(controller, /trafficSoundGuardian\.soundThresholds/);
  assert.match(controller, /trafficSoundGuardian\.standardThreshold/);
  assert.match(controller, /function resetThresholds\(\)/);
  assert.match(controller, /chooseTarget\(data\.trafficScores, activeThresholds\(\)\)/);
});

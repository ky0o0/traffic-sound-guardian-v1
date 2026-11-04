import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translateApp } from './app-i18n.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Standard has one optional live waveform, preserving the circular default and microphone action', () => {
  const html = read('./index.html');
  assert.match(html, /data-visualization="circle"/);
  assert.match(html, /id="visual-mode-select"/);
  assert.match(html, /<option value="circle">円形アニメーション<\/option>/);
  assert.match(html, /<option value="waveform">リアルタイム波形<\/option>/);
  assert.equal((html.match(/id="waveform"/g) ?? []).length, 1);
  assert.match(html, /<div id="visual" class="visual">\s*<canvas id="waveform"[\s\S]*?<button id="mic-control"/);
  assert.match(html, /id="rolling-waveform"/);
  assert.doesNotMatch(read('./ipad-test.html'), /id="visual-mode-select"/);
});

test('Standard waveform mode has CSS-only display changes and a usable start/stop action', () => {
  const css = read('./guardian.css');
  assert.match(css, /body\[data-mode=standard\]\[data-visualization=waveform\] #waveform/);
  assert.match(css, /body\[data-mode=standard\]\[data-visualization=waveform\] #action-label/);
  assert.match(css, /body\[data-mode=standard\] \.visual \.icon-disc\{[^}]*border-radius:50%/);
  const controller = read('./app.js');
  assert.match(controller, /trafficSoundGuardian\.standardVisualMode/);
  assert.match(controller, /setVisualMode\(loadVisualMode\(\), false\)/);
  assert.match(controller, /ui\['visual-mode-select'\]\?\.addEventListener\('change'/);
  assert.match(controller, /if \(!select\) return;/);
  assert.match(controller, /if \(mode === 'waveform' && !session\) drawWaveform\(null\)/);
  assert.match(read('./microphone-visualizer.js'), /s\.analyser\.getFloatTimeDomainData\(samples\)/);
});

test('Standard waveform settings have localized English and Chinese labels', () => {
  assert.equal(translateApp('リアルタイム波形', 'en'), 'Live waveform');
  assert.equal(translateApp('リアルタイム波形', 'zh-CN'), '实时音频波形');
  assert.equal(translateApp('円形アニメーション', 'en'), 'Circular animation');
  assert.equal(translateApp('円形アニメーション', 'zh-CN'), '圆形动画');
});

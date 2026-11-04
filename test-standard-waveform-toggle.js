import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMicrophoneVisualizer } from './microphone-visualizer.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Standard keeps its circle as default and exposes an accessible waveform switch', () => {
  const html = source('./index.html');
  const css = source('./guardian.css');
  const app = source('./app.js');
  assert.match(html, /id="waveform-toggle" type="checkbox" role="switch"/);
  assert.match(html, /id="waveform-toggle-label" for="waveform-toggle"/);
  assert.match(html, /<div id="visual" class="visual">\s*<canvas id="waveform"/);
  assert.match(html, /id="mic-control" class="icon-disc"/);
  assert.match(css, /body\[data-mode=standard\]\[data-visualization=waveform\] #waveform\{display:block!important/);
  assert.match(css, /body\[data-mode=standard\] \.visual \.icon-disc\{[^}]*border-radius:50%/);
  assert.match(app, /return window\.localStorage\?\.getItem\(VISUAL_STYLE_STORAGE_KEY\) === 'waveform'/);
  assert.match(app, /ui\['waveform-toggle'\]\?\.addEventListener\('change'/);
});

test('The iPad Test page remains independent', () => {
  assert.doesNotMatch(source('./ipad-test.html'), /id="waveform-toggle"/);
});

test('Microphone visualizer draws actual samples only when canvas is visible', () => {
  let visible = true;
  const colors = [];
  const ctx = {
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { colors.push(this.strokeStyle); },
  };
  const canvas = {
    width: 0, height: 0, clientWidth: 250, clientHeight: 80,
    getClientRects: () => visible ? [{}] : [],
    getContext: () => ctx,
  };
  const view = createMicrophoneVisualizer({
    ui: { waveform: canvas, visual: { style: { setProperty() {} } } },
    window: { devicePixelRatio: 1, document: { documentElement: { dataset: { theme: 'light' } } } },
    requestAnimationFrame: () => 1,
    getView: () => 'listening',
    isCurrent: () => true,
  });
  view.drawWaveform(new Float32Array([0, 0.4, -0.4, 0]));
  assert.deepEqual(colors, ['#177e75']);
  visible = false;
  view.drawWaveform(new Float32Array([0.4, -0.4]));
  assert.equal(colors.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('./'+path, import.meta.url), 'utf8');
const standard = read('index.html');
const experimental = read('ipad-test.html');
const css = read('guardian.css');
const app = read('app.js');

test('V1.7.1 Standard keeps the mic as a sound-responsive circular control', () => {
  assert.match(standard, /data-mode="standard"/);
  assert.match(standard, /id="mic-control" class="icon-disc"/);
  assert.match(css, /body\[data-mode=standard\] \.visual \.icon-disc\{[^}]*border-radius:50%/);
  assert.match(css, /body\[data-mode=standard\] \.visual::before/);
  assert.match(css, /body\[data-mode=standard\] \.visual::after/);
  assert.match(css, /--audio-level/);
  assert.match(app, /ui\.visual\.style\.setProperty\('--audio-level', level\.toFixed\(4\)\)/);
});

test('V1.7.1 Test retains the existing rectangular control and visible label', () => {
  assert.match(experimental, /data-mode="test"/);
  assert.match(experimental, /id="mic-control" class="icon-disc"/);
  assert.match(css, /\.icon-disc\{[^}]*border-radius:14px/);
  assert.doesNotMatch(css, /body\[data-mode=test\] \.visual \.icon-disc/);
  assert.match(experimental, /id="action-label"/);
});

test('V1.7.1 listening pulse exists on both page modes and respects reduced motion', () => {
  for (const page of [standard, experimental]) {
    assert.match(page, /class="status-dot"/);
    assert.match(page, /id="status-label"/);
  }
  assert.match(css, /body\[data-state=listening\] \.status-dot\{[^}]*animation:tsg-status-pulse/);
  assert.match(css, /body\[data-state=warning\] \.status-dot\{[^}]*animation:none/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*body\[data-state=listening\] \.status-dot\{animation:none/);
});

test('animated Standard rings do not continuously move the clickable microphone hit target', () => {
  const css = read('guardian.css');
  const buttonRule = css.split('body[data-mode=standard] .visual .icon-disc{')[1]?.split('}')[0];
  assert.ok(buttonRule);
  assert.doesNotMatch(buttonRule, /transform:/);
  assert.ok(css.includes('body[data-mode=standard] .visual::before{inset:0;opacity:.20;transform:scale'));
  assert.ok(css.includes('body[data-mode=standard] .visual::after{inset:25px;opacity:.38;transform:scale'));
});

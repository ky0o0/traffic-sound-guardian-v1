import { requireElements, RESEARCH_IDS } from './page-elements.js';
// Execute the actual dashboard against IDs from each actual entrypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ResearchSession } from './research.js';
import { WARNING_TARGETS } from './detection.js';
import { debugCategoryName } from './debug.js';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('./research-dashboard.js').replace(/^import .*;\n/gm, '');
function harness(page = 'ipad-test.html', missing = []) {
  const ids = new Set([...read('./' + page).matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const id of missing) ids.delete(id);
  class Node {
    constructor() { this.children = []; this.textContent = ''; this.value = 'all'; this.events = {}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, listener) { this.events[name] = listener; }
    get options() { return this.children; }
    click() { this.events.click?.(); }
  }
  const nodes = new Map([...ids].map(id => [id, new Node()]));
  if (nodes.has('log-filter')) nodes.get('log-filter').children = [new Node(), new Node(), new Node()];
  const events = {}, timers = new Map(); let next = 0;
  const document = {documentElement: {lang: 'en'}, getElementById: id => nodes.get(id) ?? null, createElement: () => new Node()};
  vm.runInNewContext(source, {requireElements, RESEARCH_IDS, ResearchSession, WARNING_TARGETS, debugCategoryName, document,
    window: {addEventListener(name, fn) { (events[name] ??= []).push(fn); }}, performance: {now: () => 2000}, Date,
    setInterval(fn) { const id = ++next; timers.set(id, fn); return id; }, clearInterval(id) { timers.delete(id); },
    setTimeout(fn) { fn(); }, Blob, URL: {createObjectURL: () => 'blob:fixture', revokeObjectURL() {}}
  });
  return {nodes, document, timers, send(name, detail) { for (const fn of events[name] ?? []) fn({detail}); }};
}
test('Test initializes without obsolete multiplier DOM and renders actual session events in three languages', () => {
  const h = harness();
  assert.equal(h.nodes.has('sensitivity-scale'), false);
  assert.equal(h.nodes.has('debug-target-effective'), true);
  h.send('tsg:capture', {active: true});
  for (let i = 0; i < 3; i++) h.send('tsg:research', {at: 1700000000000 + i * 500, monotonicMs: i * 500,
    inferenceMs: 12, topCategory: {categoryName: 'Bell', score: .2}, scores: {Bell: .2}, thresholds: {Bell: .1}, warning: i === 0 ? 'Bell' : null});
  assert.equal(h.nodes.get('research-log').children.length, 4);
  for (const lang of ['ja', 'en', 'zh-CN']) {
    h.document.documentElement.lang = lang;
    assert.doesNotThrow(() => h.send('tsg:language'));
    assert.equal(h.nodes.get('research-log').children.length, 4);
  }
  const filter = h.nodes.get('log-filter'); filter.value = 'warning'; filter.events.change();
  assert.equal(h.nodes.get('research-log').children.length, 1);
  assert.equal(h.nodes.get('export-csv').disabled, false);
  assert.doesNotThrow(() => h.nodes.get('export-csv').click());
  h.send('tsg:capture', {active: false}); assert.equal(h.timers.size, 0);
  h.send('pagehide'); assert.equal(h.timers.size, 0);
});
test('loading dashboard on Standard installs no dashboard timers or UI', () => {
  const h = harness('index.html');
  h.send('tsg:language'); h.send('tsg:capture', {active: true});
  assert.equal(h.timers.size, 0); assert.equal(h.nodes.has('research-dashboard'), false);
});

test('a missing required dashboard element reports its contract instead of hiding the error',()=>{
 assert.throws(()=>harness('ipad-test.html',['research-log']),/Research dashboard: missing required DOM element #research-log/);
});

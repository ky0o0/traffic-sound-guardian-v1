// Minimal DOM harness: runs the real UI controller without a browser or AI simulation in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as analysis from './ai-test-analysis.js';
import {
  TEXT,
  translate
} from './ai-test-i18n.js';
import {
  LIMITS,
  checkFile
} from './ai-test-runner.js';
const source = fs.readFileSync(new URL('./ai-test.js', import.meta.url), 'utf8').replace(/^import [\s\S]*?;\n/gm,
  '');

function harness() {
  class Node {
    constructor(tag, text = '') {
      this.tagName = tag;
      this._text = text;
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.files = [];
      this.type = '';
      this.value = '';
      this.disabled = false;
      this.checked = false;
      this.id = '';
      this.open = false;
      this.className = '';
    }
    get textContent() {
      return this._text + this.children.map(n => n.textContent).join('');
    }
    set textContent(v) {
      this._text = v ?? '';
      this.children = [];
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this._text = '';
      this.children = [...nodes];
    }
    setAttribute(k, v) {
      this.attributes[k] = v;
    }
    querySelectorAll(q) {
      return q === 'details[open][id]' ? all(this).filter(n => n.tagName === 'details' && n.open && n.id) :
        [];
    }
    remove() {}
    click() {
      this.onclick?.();
    }
  }
  const events = {};
  const root = new Node('div');
  root.id = 'test-app';
  const all = n => [n, ...n.children.flatMap(all)],
    writes = [];
  let confirmed = false;
  const document = {
    documentElement: {},
    body: new Node('body'),
    createElement: t => new Node(t),
    createElementNS: (_, t) => new Node(t),
    createTextNode: t => new Node('#text', t),
    getElementById: id => id === 'test-app' ? root : all(root).find(n => n.id === id)
  };
  class Runner {
    running = false;
    cancel() {}
    async run() {
      throw Error('UI harness must not run inference');
    }
  }
  const ctx = vm.createContext({
    ...analysis,
    LIMITS,
    checkFile,
    translate,
    document,
    BatchRunner: Runner,
    localStorage: {
      getItem: () => null,
      setItem: (k, v) => writes.push([k, v])
    },
    window: {
      addEventListener(name, handler) { events[name] = handler; }
    },
    queueMicrotask: () => {},
    confirm: () => confirmed,
    URL,
    Blob,
    setTimeout
  });
  vm.runInContext(source, ctx);
  return {
    ctx,
    events,
    document,
    root,
    writes,
    all: () => all(root),
    run: s => vm.runInContext(s, ctx),
    confirm: v => confirmed = v,
    click: text => {
      const b = all(root).find(n => n.tagName === 'button' && n.textContent === text);
      assert.ok(b, text);
      if (!b.disabled) b.click();
    }
  };
}
test('Japanese default, all five tabs and English switch cover actual UI text without losing state', () => {
  const h = harness();
  assert.equal(h.document.documentElement.lang, 'ja');
  assert.match(h.root.textContent, /AIテストモード/);
  const english = h.all().find(n => n.id === 'language-select');
  assert.ok(english);
  english.value = 'en';
  english.onchange();
  assert.equal(h.document.documentElement.lang, 'en');
  assert.match(h.root.textContent, /AI Test Mode/);
  for (const key of ['results', 'analysis', 'optimize', 'exports', 'upload']) {
    h.click(translate(key, 'en'));
    assert.ok(h.root.textContent.includes(translate(key, 'en')));
  }
  h.run("thresholds[NAMES[0]]=.07");
  const japanese = h.all().find(n => n.id === 'language-select');
  japanese.value = 'ja';
  japanese.onchange();
  assert.equal(h.run('thresholds[NAMES[0]]'), .07);
  assert.equal(h.writes.length, 0);
  for (const [k, pair] of Object.entries(TEXT)) {
    assert.equal(pair.length, 2, k);
    assert.ok(pair.every(x => typeof x === 'string' && x.length), k);
    assert.ok(!/[\u3040-\u30ff\u4e00-\u9fff]/.test(pair[1]), k);
  }
});
test('actual UI label mutations, exclusive none, file removal and failed-file upload', () => {
  const h = harness();
  const input = h.all().find(n => n.type === 'file');
  input.files = [{
    name: 'bad.wav',
    size: 0
  }, {
    name: 'ok.wav',
    size: 10
  }];
  input.onchange();
  assert.equal(h.run('clips.length'), 2);
  assert.equal(h.run('clips[0].status'), 'failed');
  let checks = h.all().filter(n => n.type === 'checkbox');
  checks[0].checked = true;
  checks[0].onchange();
  assert.equal(h.run("clips[0].labels.join(',')"), 'bell');
  checks = h.all().filter(n => n.type === 'checkbox');
  checks[6].checked = true;
  checks[6].onchange();
  assert.equal(h.run("clips[0].labels.join(',')"), 'none');
  h.click('削除');
  assert.equal(h.run('clips.length'), 1);
  assert.equal(h.writes.length, 0);
});
test('live thresholds require explicit confirm; language and test-setting changes do not write preferences',
() => {
  const h = harness();
  const english = h.all().find(n => n.id === 'language-select');
  assert.ok(english);
  english.value = 'en';
  english.onchange();
  h.click('Charts & Export');
  h.run('thresholds[NAMES[0]]=.09');
  h.click(translate('applyLive', 'en'));
  assert.equal(h.writes.length, 0);
  h.confirm(true);
  h.click(translate('applyLive', 'en'));
  assert.equal(h.writes.length, 1);
  assert.equal(JSON.parse(h.writes[0][1])[analysis.NAMES[0]], .09);
});
test('final holdout reveal freezes controls; clear releases the dataset', () => {
  const h = harness();
  h.run("revealed=true; render()");
  assert.ok(h.all().filter(n => n.type === 'file' || n.type === 'number').every(n => n.disabled));
  h.confirm(true);
  h.click('全データを消去');
  assert.equal(h.run('revealed'), false);
  assert.equal(h.run('clips.length'), 0);
});
test(
  'all statically referenced translation keys exist and relative static assets resolve beneath repository path',
  () => {
    for (const match of source.matchAll(/(?:t|note|button)\('([\w]+)'/g)) assert.ok(TEXT[match[1]], match[
      1]);
    for (const file of ['index.html', 'ai-test.html', 'ai-test.js', 'ai-test-runner.js',
        'ai-test-analysis.js', 'app.js', 'classifier-worker.js'
      ]) {
      const s = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
      for (const match of s.matchAll(/['"]\.\/([^'"?]+)(?:\?[^'"]*)?['"]/g)) {
        if (!match[1] || match[1] === '/') continue;
        assert.ok(fs.existsSync(new URL(match[1], import.meta.url)), file + ': ' + match[1]);
      }
    }
  });

test('upload list enforces the 50-file cap and batch lock disables further file selection', () => {
  const h=harness(), input=h.all().find(n=>n.type==='file');
  input.files=Array.from({length:55},(_,i)=>({name:i+'.wav',size:10}));input.onchange();
  assert.equal(h.run('clips.length'),50);assert.ok(h.root.textContent.includes(translate('maxFiles')));
  h.run('runner.running=true; render()');assert.equal(h.all().find(n=>n.type==='file').disabled,true);
});


test('leaving the page clears File references and bfcache restore shows an empty dataset', () => {
  const h=harness();
  const input=h.all().find(n=>n.type==='file');
  input.files=[{name:'private.wav',size:10}];input.onchange();
  h.events.pagehide();assert.equal(h.run('clips.length'),0);assert.equal(h.root.children.length,0);
  h.events.pageshow();assert.ok(h.root.textContent.includes(translate('empty')));
});

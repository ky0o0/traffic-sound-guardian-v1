import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./live-timeline.js', import.meta.url), 'utf8');
function harness(height = 104, resizeObserver = true) {
  const events = {}, frames = new Map(), observers = [], strokes = [], texts = [], clips = [];
  let nextFrame = 0, paints = 0;
  const context = {
    path: [], save() {}, restore() {}, setTransform() {}, clip() {},
    rect(...box) { clips.push(box); },
    clearRect() { paints++; strokes.length = 0; texts.length = 0; clips.length = 0; },
    beginPath() { this.path = []; },
    moveTo(x,y) { this.path.push([x,y]); }, lineTo(x,y) { this.path.push([x,y]); },
    stroke() { strokes.push({color:this.strokeStyle, points:[...this.path]}); },
    fillText(text,x,y) { texts.push({text,x,y,color:this.fillStyle}); },
    fillRect() { throw new Error('Warning backgrounds must never be filled'); }
  };
  const canvas = {width:0,height:0,clientWidth:380,clientHeight:height,
    getContext:()=>context,setAttribute() {}};
  const nodes = Object.fromEntries(['rolling-events','rolling-heading','rolling-note',
    'rolling-current-label','rolling-current-value'].map(id=>[id,{textContent:'',dataset:{}}]));
  nodes['rolling-waveform'] = canvas;
  const document = {documentElement:{lang:'en',dataset:{theme:'light'}},getElementById:id=>nodes[id]};
  const window = {
    devicePixelRatio:2,
    addEventListener(name,fn) { (events[name] ??= []).push(fn); },
    requestAnimationFrame(fn) { const id=++nextFrame; frames.set(id,fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  class Observer {
    constructor(callback) { this.callback=callback; observers.push(this); }
    observe(target,options) { this.target=target; this.options=options; }
  }
  const scope = vm.createContext({document,window,MutationObserver:Observer,
    ...(resizeObserver ? {ResizeObserver:Observer} : {})});
  vm.runInContext(source,scope);
  return {
    canvas,document,events,frames,observers,strokes,texts,clips,window,
    get paints() { return paints; },
    send(name,detail) { for (const fn of events[name] ?? []) fn({detail}); },
    flush() { const pending=[...frames.values()]; frames.clear(); pending.forEach(fn=>fn()); },
    snapshot() { return vm.runInContext('JSON.stringify({levels,marks,currentTime})',scope); }
  };
}

for (const height of [65,84,104,150,260]) {
  test(`R08: ${height}px canvas keeps silence/low/high RMS symmetric above the time labels`,()=>{
    const h=harness(height);
    const values=[0,.0001,.001,.05,1];
    values.forEach((rms,i)=>h.send('tsg:visual',{time:9+i*.1,rms}));
    const samples=h.strokes.filter(s=>s.color==='#6887a0');
    assert.equal(samples.length,values.length);
    const [left,top,width,plotHeight]=h.clips[0], bottom=top+plotHeight;
    assert.equal(left,0); assert.equal(width,380);
    const center=(top+bottom)/2;
    const amplitudes=samples.map(s=>{
      const [[x,y1],[x2,y2]]=s.points;
      assert.equal(x,x2);
      assert.ok(Math.abs((y1+y2)/2-center)<1e-9);
      assert.ok(y1>=top && y2<=bottom);
      return (y2-y1)/2;
    });
    assert.equal(amplitudes[0],0);
    for(let i=1;i<amplitudes.length;i++) assert.ok(amplitudes[i]>amplitudes[i-1]);
    assert.ok(amplitudes.at(-1)>=height*.45*.7,'retain most of the original amplitude');
    assert.ok(h.texts.every(t=>bottom<t.y-11),'entire 11px text band stays outside the plot');
    assert.deepEqual(h.texts.map(t=>t.text),['-10s','-5s','Now']);
    const state=JSON.parse(h.snapshot());
    assert.deepEqual(state.levels.map(p=>p.rms),values,'display never modifies actual RMS values');
  });
}

test('R08: only time-matching samples turn red; theme redraw retains ten-second history',()=>{
  const h=harness();
  [9,9.2,9.4,9.6].forEach(time=>h.send('tsg:visual',{time,rms:.05}));
  h.send('tsg:warning',{start:9.1,end:9.5,label:'Siren'});
  assert.deepEqual(h.strokes.slice(1).map(s=>s.color),['#6887a0','#c5223b','#c5223b','#6887a0']);
  const before=h.snapshot();
  h.document.documentElement.dataset.theme='dark';
  h.observers[0].callback([{attributeName:'data-theme'}]); h.flush();
  assert.equal(h.snapshot(),before);
  assert.deepEqual(h.strokes.slice(1).map(s=>s.color),['#91bad0','#ff596b','#ff596b','#91bad0']);
  h.send('tsg:visual',{time:20,rms:0});
  assert.equal(JSON.parse(h.snapshot()).marks.length,0);
});

test('R09: stopped resize, orientation and theme notifications coalesce into one paint, then go idle',()=>{
  const h=harness(), before=h.paints;
  h.canvas.clientWidth=420; h.canvas.clientHeight=150; h.window.devicePixelRatio=1.5;
  h.observers[1].callback();
  h.send('resize'); h.send('orientationchange');
  h.document.documentElement.dataset.theme='dark';
  h.observers[0].callback([{attributeName:'data-theme'}]);
  assert.equal(h.frames.size,1);
  h.flush();
  assert.equal(h.paints,before+1); assert.equal(h.frames.size,0);
  assert.equal(h.canvas.width,630); assert.equal(h.canvas.height,225);
  assert.equal(h.strokes[0].color,'#304258');
  assert.equal(JSON.parse(h.snapshot()).levels.length,0);
  assert.equal(h.observers[1].target,h.canvas);
});

test('R09: repeated reset, pagehide/pageshow and active layout changes never add persistent loops',()=>{
  const h=harness(), counts=Object.fromEntries(Object.entries(h.events).map(([k,v])=>[k,v.length]));
  for(let i=0;i<6;i++) {
    h.send('tsg:visual',{time:1,rms:.1});
    const before=h.snapshot();
    h.observers[1].callback(); h.flush();
    assert.equal(h.snapshot(),before);
    h.send('tsg:reset');
    assert.equal(JSON.parse(h.snapshot()).levels.length,0);
  }
  h.send('resize'); h.send('pagehide');
  assert.equal(h.frames.size,0,'pending frame cancelled on pagehide');
  h.observers[1].callback(); h.send('resize');
  assert.equal(h.frames.size,0,'late layout notifications stay idle until pageshow');
  h.canvas.clientHeight=84;
  h.send('pageshow'); h.flush();
  assert.equal(h.canvas.height,168);
  assert.equal(h.frames.size,0);
  assert.deepEqual(Object.fromEntries(Object.entries(h.events).map(([k,v])=>[k,v.length])),counts);
});

test('R09: resize fallback works without ResizeObserver',()=>{
  const h=harness(104,false);
  h.canvas.clientWidth=310; h.send('resize'); h.flush();
  assert.equal(h.canvas.width,620); assert.equal(h.frames.size,0);
});

test('R08–R10: both entrypoints load the revised relative UI assets',()=>{
  for(const name of ['index.html','ipad-test.html']) {
    const html=fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');
    assert.ok(html.includes('live-timeline.js?v=1.6.17'));
    assert.ok(html.includes('v1.6.css?v=1.6.14'));
    if(name==='ipad-test.html') assert.ok(html.includes('ipad-test.css?v=7'));
    for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) {
      assert.ok(fs.existsSync(new URL('./'+path,import.meta.url)),`${name}: ${path}`);
    }
  }
});

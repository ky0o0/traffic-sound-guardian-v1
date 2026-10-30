import { mountAnnotationEditor } from './annotation-editor.js?v=1.6.0';
import {
  IDS,
  NAMES,
  GROUPS,
  defaults,
  validThresholds,
  snapThreshold,
  setTruth,
  known,
  validateEvents,
  replay,
  analyse,
  timing,
  splitDataset,
  selectionClips,
  optimize,
  exportData,
  csv
} from './ai-test-analysis.js?v=1.5.4';
import {
  BatchRunner,
  LIMITS,
  checkFile
} from './ai-test-runner.js?v=1.5.4';
import {
  translate
} from './ai-test-i18n.js?v=1.5.4';

const root = document.getElementById('test-app'),
  runner = new BatchRunner();
const LANGUAGE_STORAGE_KEY = 'trafficSoundGuardian.language';
const allowedLanguage = code => ['ja', 'en', 'zh-CN'].includes(code) ? code : 'ja';
function initialLanguage() {
  const query = /(?:^|[?&])lang=(ja|en|zh-CN)(?:&|$)/.exec(window.location?.search || '')?.[1];
  if (query) return query;
  try { return allowedLanguage(window.sessionStorage?.getItem(LANGUAGE_STORAGE_KEY)); }
  catch { return 'ja'; }
}
let language = initialLanguage(),
  tab = 'upload',
  clips = [],
  nextId = 0,
  thresholds = defaults(),
  split = null,
  revealed = false,
  recommendations = null,
  goal = 'balanced',
  selected = null,
  windowIndex = 0,
  level = 'clip',
  groups = false,
  message = '',
  progress = [0, 0],
  activeAnnotationEditor = null;
try {
  const saved = localStorage.getItem('trafficSoundGuardian.soundThresholds');
  if (saved) thresholds = validThresholds(JSON.parse(saved));
  else {
    const bell = Number(localStorage.getItem('trafficSoundGuardian.bicycleBellThreshold'));
    if (bell >= .01 && bell <= .5) thresholds[NAMES[0]] = bell;
  }
} catch {}
const t = key => translate(key, language),
  fmt = (x, d = 3) => x == null ? 'N/A' : typeof x === 'number' ? x.toFixed(d) : String(x),
  pct = x => x == null ? 'N/A' : (x * 100).toFixed(1) + '%';
const locked = () => runner.running || revealed;

function el(tag, text = '', attrs = {}) {
  const n = document.createElement(tag);
  if (text !== null) n.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k in n) n[k] = v;
    else n.setAttribute(k, String(v));
  }
  return n;
}

function button(key, action, disabled = false, primary = false) {
  const b = el('button', t(key), {
    type: 'button',
    disabled,
    class: primary ? 'primary' : ''
  });
  b.onclick = action;
  return b;
}

function note(key) {
  return el('p', t(key), {
    class: 'note'
  });
}

function table(headers, rows) {
  const wrap = el('div', null, {
      class: 'table-wrap'
    }),
    table = el('table'),
    head = el('tr');
  headers.forEach(x => head.append(el('th', x, {
    scope: 'col'
  })));
  const th = el('thead');
  th.append(head);
  table.append(th);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    row.forEach(x => tr.append(el('td', x)));
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  return wrap;
}

function select(label, options, value, change) {
  const wrap = el('label', t(label) + ' '),
    s = el('select');
  for (const [v, name] of options) s.append(el('option', name, {
    value: v,
    selected: v === String(value)
  }));
  if (label === 'goal') s.disabled = locked();
  s.onchange = () => change(s.value);
  wrap.append(s);
  return wrap;
}

function invalidate() {
  split = null;
  recommendations = null;
  message = '';
}
const colors = ['#9ce0d3', '#85b9ff', '#f3c780', '#ed9ba7', '#c8acff', '#ffae7e'];

function chart(series, {
  max = 1,
  xLabel = '',
  height = 230
} = {}) {
  if (!series.some(s => s.values.length)) return note('empty');
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 600 ${height}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', series.map(s => s.name).join(' / '));
  const line = (tag, attrs, text) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  const w = 530,
    h = height - 55,
    scale = max || 1;
  for (let i = 0; i <= 4; i++) {
    const y = 15 + h * i / 4;
    line('line', {
      x1: 50,
      x2: 580,
      y1: y,
      y2: y,
      stroke: '#34465c'
    });
    line('text', {
      x: 3,
      y: y + 4
    }, fmt(scale * (1 - i / 4), 2));
  }
  series.forEach((s, i) => {
    const points = s.values.map((v, j) => v === null ? null :
      `${50+j*w/Math.max(1,s.values.length-1)},${15+h*(1-v/scale)}`);
    let segment = [];
    const draw = () => {
      if (segment.length === 1) {
        const [cx, cy] = segment[0].split(',');
        line('circle', {
          cx,
          cy,
          r: 3,
          fill: colors[i % colors.length]
        });
      }
      if (segment.length) {
        const p = line('polyline', {
          points: segment.join(' '),
          fill: 'none',
          stroke: colors[i % colors.length],
          'stroke-width': 2
        });
        const title = document.createElementNS(ns, 'title');
        title.textContent = s.name;
        p.append(title);
      }
      segment = [];
    };
    for (const p of points) {
      if (p === null) draw();
      else segment.push(p);
    }
    draw();
  });
  line('text', {
    x: 50,
    y: height - 7
  }, xLabel);
  const wrap = el('div');
  wrap.append(svg);
  const legend = el('div', null, {
    class: 'legend'
  });
  series.forEach((s, i) => {
    const span = el('span'),
      dot = el('i', null, {
        class: 'key'
      });
    dot.style.background = colors[i % colors.length];
    span.append(dot, document.createTextNode(s.name));
    legend.append(span);
  });
  wrap.append(legend);
  return wrap;
}

function bars(labels, series, max = 1) {
  const wrap = el('div');
  if (!series.some(s => s.values.some(x => x !== null))) return note('noData');
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 600 ${labels.length*60+20}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', labels.join(' / '));
  labels.forEach((label, i) => {
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', '8');
    txt.setAttribute('y', String(i * 60 + 18));
    txt.textContent = label;
    svg.append(txt);
    series.forEach((s, j) => {
      const v = s.values[i];
      if (v == null) return;
      const rect = document.createElementNS(ns, 'rect');
      for (const [k, x] of Object.entries({
          x: 210,
          y: i * 60 + 5 + j * 15,
          width: Math.max(0, 360 * v / (max || 1)),
          height: 11,
          fill: colors[j]
        })) rect.setAttribute(k, x);
      const title = document.createElementNS(ns, 'title');
      title.textContent = `${label} / ${s.name}: ${v}`;
      rect.append(title);
      svg.append(rect);
    });
  });
  wrap.append(svg);
  const legend = el('div', null, {
    class: 'legend'
  });
  series.forEach((s, i) => {
    const item = el('span'),
      dot = el('i', null, {
        class: 'key'
      });
    dot.style.background = colors[i];
    item.append(dot, document.createTextNode(s.name));
    legend.append(item);
  });
  wrap.append(legend);
  return wrap;
}

function thresholdPanel() {
  const panel = el('details', null, {
    class: 'card'
  });
  panel.append(el('summary', t('thresholds')), note('thresholdsNote'));
  const grid = el('div', null, {
    class: 'thresholds'
  });
  IDS.forEach((id, i) => {
    const label = el('label', t(id)),
      input = el('input', null, {
        type: 'number',
        min: '.01',
        max: '.50',
        // A special .01 stop alongside .05, .10 ... .50 cannot be
        // represented by a single native number-input step.
        step: 'any',
        value: thresholds[NAMES[i]].toFixed(2),
        disabled: locked()
      });
    input.onchange = () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v >= .01 && v <= .5) {
        thresholds[NAMES[i]] = snapThreshold(v);
        recommendations = null;
        render();
      } else input.value = thresholds[NAMES[i]].toFixed(2);
    };
    label.append(input);
    grid.append(label);
  });
  panel.append(grid);
  return panel;
}

function fileStatus(c) {
  return `${t(c.status)} · ${c.duration==null?t('durationPending'):fmt(c.duration,2)+' s'}${c.error?' · '+t(c.error):''}`;
}

function fileCard(c, openIds) {
  const card = el('details', null, {
      class: 'card file-card',
      id: 'clip-' + c.id,
      open: openIds.has('clip-' + c.id)
    }),
    summary = el('summary', c.name, {
      class: 'file-title'
    }),
    status = el('p', fileStatus(c), {
      id: 'status-' + c.id,
      class: c.status === 'failed' ? 'error' : 'status'
    }),
    p = el('progress', null, {
      max: 1,
      value: c.progress || 0,
      id: 'progress-' + c.id
    });
  p.setAttribute('aria-label', t('fileProgress') + ' ' + c.name);
  summary.append(status, p);
  card.append(summary);
  const field = el('fieldset', null, {
      disabled: locked()
    }),
    legend = el('legend', t('labels')),
    labels = el('div', null, {
      class: 'labels'
    });
  field.append(legend);
  for (const key of [...IDS, 'none', 'unknown']) {
    const label = el('label'),
      input = el('input', null, {
        type: 'checkbox',
        checked: c.labels.includes(key)
      });
    input.onchange = () => {
      c.labels = setTruth(c.labels, key, input.checked);
      invalidate();
      render();
    };
    label.append(input, document.createTextNode(t(key)));
    labels.append(label);
  }
  field.append(labels);
  const groupLabel = el('label', t('source')),
    group = el('input', null, {
      type: 'text',
      value: c.sourceGroup,
      maxLength: 120
    });
  group.onchange = () => {
    c.sourceGroup = group.value.trim();
    invalidate();
  };
  groupLabel.append(group);
  field.append(groupLabel, note('sourceHelp'));
  const advanced = el('details'),
    text = el('textarea', null, {
      value: c.eventText || '',
      placeholder: 'bell,0.5,2.0'
    });
  text.setAttribute('aria-label', t('events'));
  const complete = el('label'),
    check = el('input', null, {
      type: 'checkbox',
      checked: c.complete
    });
  complete.append(check, document.createTextNode(t('complete')));
  advanced.append(el('summary', t('events')), note('eventHelp'), text, complete);
  advanced.append(button('saveEvents', () => {
    try {
      const events = text.value.trim() ? text.value.trim().split(/\n+/).map(line => {
        const parts = line.split(',').map(x => x.trim());
        if (parts.length !== 3 || !parts[1] || !parts[2]) throw Error();
        const [label, a, b] = parts, start = Number(a), end = Number(b);
        if (!IDS.includes(label) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 ||
          start >= end || !c.labels.includes(label) || (c.duration != null && end > c.duration))
          throw Error();
        return {
          label,
          start,
          end
        };
      }) : [];
      if (check.checked && (!known(c) || c.labels.filter(x => IDS.includes(x)).some(x => !events.some(
          e => e.label === x)))) throw Error();
      c.events = events;
      c.eventText = text.value;
      c.complete = check.checked;
      invalidate();
      render();
    } catch {
      message = 'invalidEvents';
      render();
    }
  }, locked()));
  field.append(advanced);
  // The human-ground-truth editor reuses the existing events model.
  const editorMount = el('div', null, { class: 'annotation-mount' });
  const editorLabel = ({ ja: '波形で標注', en: 'Visual waveform annotations', 'zh-CN': '波形标注' })[language];
  const editorOpen = el('button', editorLabel, { type: 'button', disabled: locked() });
  editorOpen.onclick = async () => {
    if (activeAnnotationEditor) {
      activeAnnotationEditor.close();
      activeAnnotationEditor = null;
    }
    const allowed = !split || split.mode !== 'heldout' ||
      selectionClips(clips, split, revealed ? 'test' : 'validation').some(x => x.id === c.id);
    const predictions = allowed && c.result?.windows ?
      replay(c.result.windows, thresholds).flatMap(w => w.labels.map(label => ({
        label, start: w.start, end: w.end
      }))) : [];
    const instance = await mountAnnotationEditor(editorMount, c, {
      lang: language, predictions,
      onSave: ({ events, complete, duration }) => {
        c.events = events;
        c.eventText = events.map(e => [e.label, e.start, e.end].join(',')).join('\n');
        c.complete = complete;
        c.duration = duration;
        c.labels = events.length ? [...new Set(events.map(e => e.label))] : complete ? ['none'] : ['unknown'];
        invalidate();
        render();
      }
    });
    if (editorMount.isConnected) activeAnnotationEditor = instance;
    else instance?.close();
  };
  field.append(editorOpen, editorMount);
  card.append(field);
  if (c.complete && c.duration != null && !validateEvents(c)) card.append(note('annotationPending'));
  card.append(button('remove', () => {
    clips = clips.filter(x => x !== c);
    if (selected === c.id) selected = null;
    invalidate();
    render();
  }, locked()));
  return card;
}

function uploadView(openIds) {
  const panel = el('section');
  panel.append(el('h2', t('upload')), note('limits'));
  const label = el('label', t('choose')),
    input = el('input', null, {
      type: 'file',
      multiple: true,
      accept: 'audio/*,.wav,.mp3,.m4a',
      disabled: locked()
    });
  input.onchange = () => {
    for (const file of input.files) {
      if (clips.length >= LIMITS.files) {
        message = 'maxFiles';
        break;
      }
      let error = null;
      try {
        checkFile(file);
      } catch (e) {
        error = e.code;
      }
      clips.push({
        id: String(++nextId),
        name: file.name,
        file,
        duration: null,
        sourceGroup: '',
        labels: ['unknown'],
        events: [],
        eventText: '',
        complete: false,
        status: error ? 'failed' : 'queued',
        error,
        result: null,
        progress: 0
      });
    }
    invalidate();
    if (clips.length >= LIMITS.files) message = 'maxFiles';
    render();
  };
  label.append(input);
  panel.append(label);
  const actions = el('div', null, {
    class: 'actions'
  });
  actions.append(button('run', () => run(false), locked() || !clips.length, true), button('retry', () => run(
    true), locked() || !clips.some(c => ['failed', 'cancelled'].includes(c.status))), button('cancel',
  () => {
      message = 'cancelling';
      runner.cancel();
      render();
    }, !runner.running), button('clear', () => {
    if (confirm(t('clearConfirm'))) {
      clips = [];
      split = null;
      revealed = false;
      recommendations = null;
      selected = null;
      message = '';
      progress = [0, 0];
      render();
    }
  }, runner.running));
  panel.append(actions, el('p', `${t('progress')}: ${progress[0]} / ${progress[1]}`, {
    id: 'overall-text'
  }));
  const all = el('progress', null, {
    id: 'overall-progress',
    max: 1,
    value: progress[1] ? progress[0] / progress[1] : 0
  });
  all.setAttribute('aria-label', t('progress'));
  panel.append(all);
  if (!clips.length) panel.append(note('empty'));
  for (const c of clips) panel.append(fileCard(c, openIds));
  return panel;
}
async function run(retry) {
  if (runner.running || revealed) return;
  const todo = clips.filter(c => !retry || ['failed', 'cancelled'].includes(c.status));
  if (!todo.length) return;
  invalidate();
  todo.forEach(c => {
    c.status = 'queued';
    c.result = null;
    c.error = null;
    c.progress = 0;
  });
  progress = [0, todo.length];
  message = 'loading';
  const promise = runner.run(todo, thresholds, (completed, total, c) => {
    progress = [completed, total];
    if (c) {
      message = '';
      const s = document.getElementById('status-' + c.id),
        p = document.getElementById('progress-' + c.id);
      if (s) {
        s.textContent = fileStatus(c);
        s.className = c.status === 'failed' ? 'error' : 'status';
      }
      if (p) p.value = c.progress;
    }
    const all = document.getElementById('overall-progress'),
      text = document.getElementById('overall-text');
    if (all) all.value = (completed + (c && ['decoding', 'testing'].includes(c.status) ? c.progress :
      0)) / total;
    if (text) text.textContent = `${t('progress')}: ${completed} / ${total}`;
  });
  render();
  await promise;
  split = splitDataset(clips);
  message = '';
  render();
}

function resultsView() {
  const panel = el('section');
  panel.append(el('h2', t('results')), scopeNote(), note('scoreNote'));
  const done = selectionClips(clips, split, revealed ? 'test' : 'validation').filter(c => c.status ===
  'done');
  if (!done.length) {
    panel.append(note('empty'));
    return panel;
  }
  if (!done.some(c => c.id === selected)) selected = done[0].id;
  const c = done.find(x => x.id === selected),
    rows = replay(c.result.windows, thresholds);
  windowIndex = Math.min(windowIndex, rows.length - 1);
  panel.append(select('selectClip', done.map(c => [c.id, c.name]), selected, v => {
    selected = v;
    windowIndex = 0;
    render();
  }));
  const detected = [...new Set(rows.flatMap(w => w.labels))];
  panel.append(el('p', t('clipWarning') + ': ' + t(rows.some(w => w.triggered) ? 'yes' : 'no') + ' · ' + (
    detected.length ? detected.map(t).join(' / ') : t('none'))));
  panel.append(table([t('duration'), t('coverage'), t('tail'), t('offline')], [
    [fmt(c.duration), fmt(c.result.coveredUntil), fmt(c.result.tailSeconds), fmt(c.result.offlineMs)]
  ]));
  panel.append(el('h3', t('peak')), bars(IDS.map(t), [{
    name: t('raw'),
    values: NAMES.map(n => Math.max(...rows.map(w => w.scores[n])))
  }]));
  panel.append(el('h3', t('timeline')), chart(IDS.map((id, i) => ({
    name: t(id),
    values: rows.map(w => w.scores[NAMES[i]])
  })), {
    xLabel: `${fmt(rows[0].end)} → ${fmt(rows.at(-1).end)} s`
  }));
  const label = el('label', t('window') + ' '),
    slider = el('input', null, {
      class: 'slider',
      type: 'range',
      min: 0,
      max: rows.length - 1,
      step: 1,
      value: windowIndex
    });
  slider.oninput = () => {
    windowIndex = Number(slider.value);
    renderWindow();
  };
  label.append(slider);
  panel.append(label, el('div', null, {
    id: 'window-detail'
  }), note('allWindows'));
  queueMicrotask(renderWindow);
  return panel;
}

function renderWindow() {
  const target = document.getElementById('window-detail'),
    c = clips.find(c => c.id === selected);
  if (!target || !c?.result) return;
  const w = replay(c.result.windows, thresholds)[windowIndex];
  target.replaceChildren(el('h3', `${t('window')} ${windowIndex+1}: ${fmt(w.start)}–${fmt(w.end)} s`), table([
    t('category'), t('raw'), t('threshold'), t('detected')
  ], IDS.map((id, i) => [t(id), String(w.scores[NAMES[i]]), thresholds[NAMES[i]].toFixed(2), t(w.labels
    .includes(id) ? 'yes' : 'no')])), table([t('trigger'), t('active'), t('inference'), t('roundTrip')], [
    [t(w.triggered ? 'yes' : 'no'), t(w.warningActive ? 'yes' : 'no'), fmt(w.inferenceMs), fmt(w
      .roundTripMs)]
  ]));
}

function scopeNote() {
  return el('p', t(revealed ? 'locked' : split?.mode === 'heldout' ? 'heldout' : 'exploratory'), {
    class: 'notice'
  });
}

function metricsView() {
  const panel = el('section'),
    data = selectionClips(clips, split, revealed ? 'test' : 'validation'),
    m = analyse(data, thresholds, level, groups),
    keys = groups ? GROUPS : IDS;
  panel.append(el('h2', t('analysis')), scopeNote(), select('level', [
    ['clip', t('clip')],
    ['window', t('windowLevel')],
    ['event', t('event')]
  ], level, v => {
    level = v;
    render();
  }), select('category', [
    ['raw', t('rawClasses')],
    ['groups', t('groups')]
  ], groups ? 'groups' : 'raw', v => {
    groups = v === 'groups';
    render();
  }), note('definitions'), note('sirenRule'));
  panel.append(table([t('total'), t('processed'), t('labelled'), t('eligible'), t('units')], [
    [m.totalFiles, m.processedFiles, m.labelledFiles, m.eligibleFiles, m.units]
  ]));
  if (m.clipCounts) panel.append(table([t('exact'), t('missed'), t('falseAlarm')], [
    [m.clipCounts.exact, m.clipCounts.missed, m.clipCounts.falseAlarm]
  ]));
  panel.append(bars(keys.map(t), ['precision', 'recall', 'f1'].map(k => ({
    name: t(k + 'Metric'),
    values: keys.map(id => m.byClass[id][k])
  }))));
  panel.append(table([t('category'), 'TP', 'FP', 'FN', 'TN', t('precisionMetric'), t('recallMetric'), t(
    'f1Metric'), t('fprMetric'), t('support')], keys.map(id => {
    const v = m.byClass[id];
    return [t(id), v.tp, v.fp, v.fn, v.tn ?? 'N/A', pct(v.precision), pct(v.recall), pct(v.f1), pct(v
      .fpr), v.support];
  })));
  if (level === 'event') {
    panel.append(el('h3', t('latency')), note('latencyNote'), table([t('category'), t('count'), t('average'),
      t('timely')
    ], keys.map(id => {
      const a = m.byClass[id].latencies;
      return [t(id), a.length, a.length ? fmt(a.reduce((s, v) => s + v.seconds, 0) / a.length) :
        'N/A', a.length ? pct(a.filter(v => v.timely).length / a.length) : 'N/A'
      ];
    })));
  }
  const time = timing(data);
  panel.append(el('h3', t('timing')), table(['', t('count'), t('average'), t('minimum'), t('maximum')], [
    'inference', 'roundTrip'
  ].map(k => [t(k), time[k].n, fmt(time[k].mean), fmt(time[k].min), fmt(time[k].max)])), el('p',
    `${t('offline')}: ${fmt(time.offlineMs)} · ${t('withinHop')}: ${pct(time.withinHop)}`), note(time
    .sustainedEstimate === null ? 'noData' : time.sustainedEstimate ? 'fast' : 'slow'), note(
    'latencyNote'));
  const times = data.filter(c => c.status === 'done').flatMap(c => c.result.windows.map(w => w.inferenceMs));
  const buckets = [10, 30, 100, 480, Infinity],
    counts = buckets.map((end, i) => times.filter(x => x > (i ? buckets[i - 1] : -Infinity) && x <= end)
      .length);
  panel.append(el('h3', t('histogram')), bars(['≤10', '10–30', '30–100', '100–480', '>480'], [{
    name: t('count'),
    values: times.length ? counts : counts.map(() => null)
  }], Math.max(1, ...counts)));
  return panel;
}

function optimizeView() {
  const panel = el('section');
  panel.append(el('h2', t('optimize')), scopeNote(), note('splitNote'), note('optimizationRule'));
  panel.append(button('prepareSplit', () => {
    split = splitDataset(clips);
    recommendations = null;
    message = split.reason || '';
    render();
  }, locked() || !clips.some(c => c.status === 'done')));
  if (split?.mode === 'heldout') panel.append(table([t('name'), t('source'), t('status')], clips.filter(c =>
    split.roles[c.id]).map(c => [c.name, c.sourceGroup, t(split.roles[c.id])])));
  panel.append(select('goal', ['balanced', 'recall', 'precision'].map(x => [x, t(x)]), goal, v => {
    if (!locked()) {
      goal = v;
      recommendations = null;
      render();
    }
  }), button('compare', () => {
    if (!split) split = splitDataset(clips);
    recommendations = optimize(selectionClips(clips, split), thresholds, goal);
    render();
  }, locked() || !clips.some(c => c.status === 'done')));
  if (recommendations) {
    panel.append(table([t('category'), t('recommendation'), t('support'), t('negative')], IDS.map(id => [t(
      id), recommendations[id].recommended ?? 'N/A', recommendations[id].support, recommendations[id]
      .negative
    ])));
    panel.append(button('adopt', () => {
      for (let i = 0; i < IDS.length; i++) {
        const v = recommendations[IDS[i]].recommended;
        if (v != null) thresholds[NAMES[i]] = v;
      }
      render();
    }, locked() || !IDS.some(id => recommendations[id].recommended !== null)));
    for (const id of IDS) {
      const r = recommendations[id],
        details = el('details', null, {
          class: 'card'
        });
      details.append(el('summary', t(id)));
      if (r.recommended === null) details.append(note('fewClassExamples'));
      details.append(chart(['precision', 'recall', 'f1'].map(k => ({
          name: t(k + 'Metric'),
          values: r.curve.map(v => v[k])
        })), {
          xLabel: t('threshold') + ' 0.01 / 0.05 → 0.50'
        }), table([t('threshold'), t('precisionMetric'), t('recallMetric'), t('f1Metric'), 'FN', 'FP'], r
          .curve.map(v => [v.threshold.toFixed(2), pct(v.precision), pct(v.recall), pct(v.f1), v.fn, v.fp])
          ));
      panel.append(details);
    }
  }
  panel.append(button('finalTest', () => {
    if (confirm(t('finalConfirm'))) {
      revealed = true;
      tab = 'analysis';
      render();
    }
  }, locked() || split?.mode !== 'heldout' || !recommendations));
  return panel;
}

function download(name, type, text) {
  const blob = new Blob([text], {
      type
    }),
    url = URL.createObjectURL(blob),
    a = el('a', '', {
      href: url,
      download: name
    });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportView() {
  const panel = el('section');
  panel.append(el('h2', t('exports')), note('exportNote'), scopeNote());
  const data = () => exportData(clips, thresholds, split, revealed, recommendations, goal);
  const actions = el('div', null, {
    class: 'actions'
  });
  for (const kind of ['CSV', 'JSON']) {
    const b = el('button', kind, {
      type: 'button',
      disabled: runner.running || !clips.some(c => c.result)
    });
    b.onclick = () => download('traffic-guardian-test.' + kind.toLowerCase(), kind === 'CSV' ?
      'text/csv;charset=utf-8' : 'application/json', kind === 'CSV' ? csv(data()) : JSON.stringify(data(),
        null, 2));
    actions.append(b);
  }
  panel.append(actions, el('h3', t('summary')));
  const m = analyse(selectionClips(clips, split, revealed ? 'test' : 'validation'), thresholds);
  panel.append(table([t('processed'), t('labelled'), 'TP', 'FP', 'FN', 'TN', t('precisionMetric'), t(
    'recallMetric'), t('f1Metric')], [
    [m.processedFiles, m.labelledFiles, m.micro.tp, m.micro.fp, m.micro.fn, m.micro.tn, pct(m.micro
      .precision), pct(m.micro.recall), pct(m.micro.f1)]
  ]));
  panel.append(button('applyLive', () => {
    if (confirm(t('applyConfirm'))) {
      try {
        localStorage.setItem('trafficSoundGuardian.soundThresholds', JSON.stringify(thresholds));
        message = 'applied';
      } catch {
        message = 'storageError';
      }
      render();
    }
  }, runner.running));
  return panel;
}

function render() {
  activeAnnotationEditor?.close();
  activeAnnotationEditor = null;
  const openIds = new Set([...root.querySelectorAll('details[open][id]')].map(x => x.id));
  document.documentElement.lang = language;
  document.title = t('title') + ' · Traffic Sound Guardian V1.6.0';
  root.replaceChildren();
  const top = el('div', null, {
    class: 'top'
  });
  top.append(el('a', t('back'), {
    href: './index.html?v=1.5.4&lang=' + language
  }));
  const langs = el('div', null, { class: 'language-switch' });
  const picker = el('select', null, { id: 'language-select' });
  picker.setAttribute('aria-label', t('language'));
  for (const [code, name] of [
    ['ja', '日本語'],
    ['en', 'English'],
    ['zh-CN', '简体中文']
  ]) picker.append(el('option', name, { value: code, selected: language === code }));
  picker.onchange = () => {
    language = allowedLanguage(picker.value);
    try { window.sessionStorage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch {}
    render();
  };
  langs.append(picker);
  top.append(langs);
  root.append(top, el('h1', t('title') + ' · V1.6.0'), el('p', t('subtitle'), {
    class: 'notice'
  }), note('privacy'));
  const tabs = el('nav', null, {
    class: 'tabs'
  });
  tabs.setAttribute('aria-label', t('title'));
  for (const key of ['upload', 'results', 'analysis', 'optimize', 'exports']) {
    const b = button(key, () => {
      tab = key;
      message = '';
      render();
    });
    b.setAttribute('aria-current', tab === key ? 'page' : 'false');
    if (tab === key) b.className = 'primary';
    tabs.append(b);
  }
  root.append(tabs);
  if (message) root.append(el('p', t(message), {
    class: 'notice',
    role: 'status'
  }));
  root.append(thresholdPanel());
  root.append(tab === 'upload' ? uploadView(openIds) : tab === 'results' ? resultsView() : tab ===
    'analysis' ? metricsView() : tab === 'optimize' ? optimizeView() : exportView());
  root.append(el('footer', 'Traffic Sound Guardian V1.6.0 · YAMNet / MediaPipe · ' + t('scoreNote')));
}
window.addEventListener('pagehide', () => {
  activeAnnotationEditor?.close();
  activeAnnotationEditor = null;
  runner.cancel();
  clips = [];
  split = recommendations = selected = null;
  revealed = false;
  message = '';
  progress = [0, 0];
  root.replaceChildren(); // Also release File references captured by DOM handlers in the back/forward cache.
});
window.addEventListener('pageshow', () => render());
render();

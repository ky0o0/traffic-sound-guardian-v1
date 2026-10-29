import {
  TARGETS,
  chooseTarget,
  WarningGate
} from './detection.js?v=1.5.3';

export const IDS = ['bell', 'horn', 'siren', 'police', 'ambulance', 'fire'];
export const NAMES = Object.keys(TARGETS);
export const GROUPS = ['bell', 'horn', 'sirenGroup'];
export const MODEL = {
  name: 'YAMNet',
  file: 'yamnet.tflite',
  gitBlob: '4d46551d9f07b0971b7e9e04ed25568a703c8dbf',
  runtime: 'MediaPipe 0.10.21'
};
export const CONFIG = {
  version: '1.5.3',
  warningHoldMs: 1000,
  defaultThreshold: 0.10,
  uiThresholdMin: 0.01,
  uiThresholdMax: 0.50,
  uiThresholdStep: 0.05,
  specialMinThreshold: 0.01,
  firstStep: 0.04, // 0.01 -> 0.05, then increments of 0.05
  windowSeconds: .975,
  hopSeconds: .480,
  modelRate: 16000,
  scoreMeaning: 'Raw uncalibrated model score, not accuracy or probability',
  mono: 'arithmetic channel mean',
  tail: 'incomplete final window omitted; no padding'
};
export const THRESHOLD_CHOICES = Object.freeze([0.01, ...Array.from({length: 10}, (_, i) => (i + 1) / 20)]);
export function snapThreshold(value) {
  return THRESHOLD_CHOICES.reduce((best, choice) =>
    Math.abs(choice - value) < Math.abs(best - value) ? choice : best, THRESHOLD_CHOICES[0]);
}
export const defaults = () => Object.fromEntries(NAMES.map(n => [n, .1]));
export function validThresholds(values) {
  return Object.fromEntries(NAMES.map(n => [n, typeof values?.[n] === 'number' && Number.isFinite(values[
    n]) && values[n] >= .01 && values[n] <= .5 ? Math.round(values[n] * 100) / 100 : .1
  ]));
}
export function setTruth(labels, value, checked) {
  const next = new Set(labels);
  if (!checked) next.delete(value);
  else if (['none', 'unknown'].includes(value)) {
    next.clear();
    next.add(value);
  } else {
    next.delete('none');
    next.delete('unknown');
    next.add(value);
  }
  return [...next].filter(x => [...IDS, 'none', 'unknown'].includes(x));
}
export const known = clip => clip.labels.length > 0 && !clip.labels.includes('unknown') &&
  !(clip.labels.includes('none') && clip.labels.length > 1) && clip.labels.every(x => [...IDS, 'none']
    .includes(x));
export const grouped = labels => [...new Set(labels.filter(x => IDS.includes(x)).map(x => IDS.indexOf(x) >=
  2 ? 'sirenGroup' : x))];
export function validateEvents(clip) {
  if (!known(clip) || !clip.complete) return false;
  const events = clip.events ?? [];
  if (!events.every(e => IDS.includes(e.label) && clip.labels.includes(e.label) && Number.isFinite(e.start) &&
      Number.isFinite(e.end) && e.start >= 0 && e.start < e.end && e.end <= clip.duration)) return false;
  return clip.labels.filter(x => IDS.includes(x)).every(x => events.some(e => e.label === x));
}
export function predict(window, thresholds) {
  return IDS.filter((id, i) => chooseTarget({
    [NAMES[i]]: window.scores[NAMES[i]]
  }, thresholds));
}
export function replay(windows, thresholds) {
  const gate = new WarningGate();
  let ready = 0;
  return windows.map(w => {
    const target = chooseTarget(w.scores, thresholds);
    // Sequential virtual real-time scheduling, using measured worker round trips.
    ready = Math.max(ready, w.end) + w.roundTripMs / 1000;
    const active = gate.observe(target, ready * 1000, target ? thresholds[target.name] : .1);
    return {
      ...w,
      labels: predict(w, thresholds),
      triggered: !!target,
      warningActive: active,
      simulatedReady: ready
    };
  });
}
const divide = (a, b) => b === 0 ? null : a / b;
export function metrics({
  tp = 0,
  fp = 0,
  fn = 0,
  tn = 0
}, event = false) {
  return {
    tp,
    fp,
    fn,
    tn: event ? null : tn,
    precision: divide(tp, tp + fp),
    recall: divide(tp, tp + fn),
    f1: divide(2 * tp, 2 * tp + fp + fn),
    fpr: event ? null : divide(fp, fp + tn),
    support: tp + fn
  };
}

function count(items, keys) {
  return Object.fromEntries(keys.map(key => {
    const c = {
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0
    };
    for (const item of items) c[item.truth.includes(key) ? item.pred.includes(key) ? 'tp' : 'fn' : item
      .pred.includes(key) ? 'fp' : 'tn']++;
    return [key, metrics(c)];
  }));
}
export function mergedEvents(events, groups = false) {
  const merged = [];
  for (const key of groups ? GROUPS : IDS) {
    const sorted = events.filter(e => (groups ? grouped([e.label])[0] : e.label) === key).sort((a, b) => a
      .start - b.start);
    for (const e of sorted) {
      const last = merged.at(-1);
      if (last?.label === key && e.start <= last.end) last.end = Math.max(last.end, e.end);
      else merged.push({
        label: key,
        start: e.start,
        end: e.end
      });
    }
  }
  return merged;
}

function eventMetrics(clips, thresholds, groups) {
  const keys = groups ? GROUPS : IDS,
    counts = Object.fromEntries(keys.map(k => [k, {
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
      latencies: []
    }]));
  for (const clip of clips) {
    const truth = mergedEvents(clip.events, groups),
      windows = replay(clip.result.windows, thresholds);
    for (const key of keys) {
      const actual = truth.filter(e => e.label === key),
        bursts = [];
      let burst = null;
      for (const w of windows) {
        if ((groups ? grouped(w.labels) : w.labels).includes(key)) {
          if (!burst) {
            burst = {
              start: w.start,
              end: w.end,
              ready: w.simulatedReady
            };
            bursts.push(burst);
          } else burst.end = w.end;
        } else burst = null;
      }
      const used = new Set(),
        c = counts[key];
      for (const b of bursts) {
        const index = actual.findIndex((e, i) => !used.has(i) && b.start < e.end && b.end > e.start);
        if (index < 0) c.fp++;
        else {
          c.tp++;
          used.add(index);
          const e = actual[index];
          // An already-active burst cannot measure onset response latency.
          if (b.ready >= e.start) c.latencies.push({
            seconds: b.ready - e.start,
            timely: b.ready <= e.end
          });
        }
      }
      c.fn += actual.length - used.size;
    }
  }
  return Object.fromEntries(keys.map(k => [k, {
    ...metrics(counts[k], true),
    latencies: counts[k].latencies
  }]));
}
export function analyse(clips, thresholds, level = 'clip', groups = false) {
  const successful = clips.filter(c => c.status === 'done' && c.result),
    labelled = successful.filter(known);
  const eligible = level === 'clip' ? labelled : labelled.filter(validateEvents);
  const keys = groups ? GROUPS : IDS,
    items = [];
  for (const c of eligible) {
    const rows = replay(c.result.windows, thresholds),
      convert = x => groups ? grouped(x) : x.filter(k => IDS.includes(k));
    if (level === 'clip') items.push({
      truth: convert(c.labels),
      pred: convert([...new Set(rows.flatMap(w => w.labels))])
    });
    else if (level === 'window')
      for (const w of rows) items.push({
        truth: convert(c.events.filter(e => e.start < w.end && e.end > w.start).map(e => e.label)),
        pred: convert(w.labels)
      });
  }
  const byClass = level === 'event' ? eventMetrics(eligible, thresholds, groups) : count(items, keys);
  const totals = Object.values(byClass).reduce((s, m) => ({
    tp: s.tp + m.tp,
    fp: s.fp + m.fp,
    fn: s.fn + m.fn,
    tn: s.tn + (m.tn ?? 0)
  }), {
    tp: 0,
    fp: 0,
    fn: 0,
    tn: 0
  });
  return {
    level,
    groups,
    totalFiles: clips.length,
    processedFiles: successful.length,
    labelledFiles: labelled.length,
    eligibleFiles: eligible.length,
    units: level === 'event' ? eligible.reduce((n, c) => n + mergedEvents(c.events, groups).length, 0) : items
      .length,
    byClass,
    micro: metrics(totals, level === 'event'),
    clipCounts: level === 'clip' ? {
      exact: items.filter(i => i.truth.length === i.pred.length && i.truth.every(x => i.pred.includes(x)))
        .length,
      missed: items.filter(i => i.truth.some(x => !i.pred.includes(x))).length,
      falseAlarm: items.filter(i => i.pred.some(x => !i.truth.includes(x))).length
    } : null
  };
}
export function timing(clips) {
  const done = clips.filter(c => c.status === 'done' && c.result),
    rows = done.flatMap(c => c.result.windows);
  const stats = key => {
    const a = rows.map(w => w[key]);
    return {
      n: a.length,
      mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null,
      min: a.length ? Math.min(...a) : null,
      max: a.length ? Math.max(...a) : null
    };
  };
  const roundTrip = stats('roundTripMs');
  return {
    inference: stats('inferenceMs'),
    roundTrip,
    offlineMs: done.reduce((n, c) => n + c.result.offlineMs, 0),
    withinHop: rows.length ? rows.filter(w => w.roundTripMs <= 480).length / rows.length : null,
    sustainedEstimate: roundTrip.mean === null ? null : roundTrip.mean <= 480,
    actualMicrophoneLatency: null
  };
}
// Group IDs must be supplied by the researcher. File names alone cannot establish independence.
export function splitDataset(clips) {
  const eligible = clips.filter(c => c.status === 'done' && known(c));
  if (eligible.some(c => !c.sourceGroup.trim())) return {
    mode: 'exploratory',
    reason: 'missingGroup',
    roles: {}
  };
  const groups = [...new Set(eligible.map(c => c.sourceGroup.trim()))];
  if (groups.length < 10) return {
    mode: 'exploratory',
    reason: 'fewGroups',
    roles: {}
  };
  const hash = s => {
    let h = 2166136261;
    for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  groups.sort((a, b) => hash(a) - hash(b) || a.localeCompare(b));
  const validation = new Set(groups.slice(0, Math.floor(groups.length * .7)));
  return {
    mode: 'heldout',
    reason: null,
    roles: Object.fromEntries(eligible.map(c => [c.id, validation.has(c.sourceGroup.trim()) ? 'validation' :
      'test'
    ]))
  };
}
export function selectionClips(clips, split, role = 'validation') {
  return split?.mode === 'heldout' ? clips.filter(c => split.roles[c.id] === role) : clips;
}
export function optimize(clips, thresholds, goal = 'balanced') {
  return Object.fromEntries(IDS.map((id, i) => {
    const peaks = clips.filter(c => c.status === 'done' && known(c)).map(c => ({
      truth: c.labels.includes(id),
      score: Math.max(...c.result.windows.map(w => w.scores[NAMES[i]]))
    }));
    const curve = THRESHOLD_CHOICES.map(threshold => {
      const c = {
          tp: 0,
          fp: 0,
          fn: 0,
          tn: 0
        };
      for (const p of peaks) c[p.truth ? p.score >= threshold ? 'tp' : 'fn' : p.score >= threshold ?
        'fp' : 'tn']++;
      return {
        threshold,
        ...metrics(c)
      };
    });
    const support = curve[0].tp + curve[0].fn,
      negative = curve[0].fp + curve[0].tn;
    if (support < 2 || negative < 2) return [id, {
      curve,
      recommended: null,
      reason: 'fewClassExamples',
      support,
      negative,
      current: thresholds[NAMES[i]]
    }];
    const score = m => goal === 'recall' ? [m.recall ?? -1, m.precision ?? -1, m.f1 ?? -1, m
      .threshold] : goal === 'precision' ? [m.precision ?? -1, m.recall ?? -1, m.f1 ?? -1, m
      .threshold] : [m.f1 ?? -1, m.recall ?? -1, m.precision ?? -1, m.threshold];
    const best = [...curve].sort((a, b) => {
      const x = score(a),
        y = score(b);
      for (let j = 0; j < x.length; j++)
        if (x[j] !== y[j]) return y[j] - x[j];
      return 0;
    })[0];
    return [id, {
      curve,
      recommended: best.threshold,
      reason: goal,
      support,
      negative,
      current: thresholds[NAMES[i]]
    }];
  }));
}
export function exportData(clips, thresholds, split, revealed, recommendations, goal) {
  const clean = clips.map(({
    file,
    ...c
  }) => {
    const withheld = split?.mode === 'heldout' && !revealed && split.roles[c.id] === 'test';
    return {
      ...c,
      withheld,
      result: c.result && !withheld ? {
        ...c.result,
        evaluated: replay(c.result.windows, thresholds)
      } : null
    };
  });
  const selected = selectionClips(clips, split, revealed ? 'test' : 'validation');
  return {
    schema: 'traffic-sound-guardian-test/1',
    exportedAt: new Date().toISOString(),
    conditions: {
      browser: typeof navigator === 'undefined' ? 'not recorded' : navigator.userAgent,
      microphone: 'not used',
      measurement: 'browser-local offline inference'
    },
    model: MODEL,
    config: CONFIG,
    thresholds: {
      ...thresholds
    },
    split,
    heldoutRevealed: revealed,
    optimizationGoal: goal,
    recommendations,
    clips: clean,
    analysis: Object.fromEntries(['clip', 'window', 'event'].map(level => [level, {
      raw: analyse(selected, thresholds, level),
      grouped: analyse(selected, thresholds, level, true)
    }])),
    timing: timing(selected),
    limitations: ['Scores are not calibrated probabilities.', 'Overlapping windows are correlated.',
      'Complete time annotation is required for window/event metrics.',
      'Grouped siren prediction is OR across four independently thresholded classes; raw scores are retained separately.',
      'Simulated latency includes window collection and measured worker round trips, not hardware microphone latency.',
      'Exploratory results cannot be reported as held-out generalization.',
      'Source group IDs are user supplied; the app cannot detect shared recordings.'
    ]
  };
}
export function csv(data) {
  const columns = ['record', 'file', 'duration', 'sourceGroup', 'split', 'events', 'annotationComplete',
    'truth', 'predicted', 'correctExact', 'start', 'end', 'triggered', 'warningActive', 'inferenceMs',
    'roundTripMs', 'offlineMs', ...NAMES.map(n => 'score:' + n), ...NAMES.map(n => 'threshold:' + n),
    'metric', 'value', 'model', 'config'
  ];
  const rows = [columns];
  const add = o => rows.push(columns.map(k => o[k] ?? ''));
  for (const c of data.clips) {
    const windows = c.result?.evaluated ?? [],
      pred = [...new Set(windows.flatMap(w => w.labels))];
    const base = {
      file: c.name,
      duration: c.duration,
      sourceGroup: c.sourceGroup,
      split: data.split?.roles[c.id] ?? 'exploratory',
      truth: c.labels.join('|'),
      events: JSON.stringify(c.events),
      annotationComplete: c.complete,
      model: JSON.stringify(data.model),
      config: JSON.stringify(data.config),
      ...Object.fromEntries(NAMES.map(n => ['threshold:' + n, data.thresholds[n]]))
    };
    add({
      ...base,
      record: 'clip',
      predicted: pred.join('|'),
      triggered: c.result ? windows.some(w => w.triggered) : 'N/A',
      correctExact: c.status === 'done' && c.result && known(c) ? (pred.length === c.labels.filter(x =>
        IDS.includes(x)).length && pred.every(x => c.labels.includes(x))) : 'N/A',
      offlineMs: c.result?.offlineMs,
      metric: 'status',
      value: c.status,
      ...Object.fromEntries(NAMES.map(n => ['score:' + n, windows.length ? Math.max(...windows.map(w => w
        .scores[n])) : 'N/A']))
    });
    for (const w of windows) add({
      ...base,
      record: 'window',
      start: w.start,
      end: w.end,
      predicted: w.labels.join('|'),
      triggered: w.triggered,
      warningActive: w.warningActive,
      inferenceMs: w.inferenceMs,
      roundTripMs: w.roundTripMs,
      ...Object.fromEntries(NAMES.map(n => ['score:' + n, w.scores[n]]))
    });
  }
  const flatten = (v, path) => {
    if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) flatten(x, path + '.' + k);
    else add({
      record: 'summary',
      metric: path,
      value: v === null ? 'N/A' : v
    });
  };
  flatten(data.conditions, 'conditions');
  flatten(data.analysis, 'analysis');
  flatten(data.timing, 'timing');
  flatten(data.recommendations, 'optimization');
  flatten(data.limitations, 'limitations');
  // Prevent spreadsheet formula execution from user-supplied filenames/group IDs.
  const quote = v => {
    let s = String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
}

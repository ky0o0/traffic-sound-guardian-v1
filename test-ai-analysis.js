// Deterministic fixtures for mathematical assertions only; never loaded by the website.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDS,
  NAMES,
  defaults,
  setTruth,
  known,
  grouped,
  validateEvents,
  predict,
  replay,
  metrics,
  analyse,
  timing,
  splitDataset,
  selectionClips,
  optimize,
  exportData,
  csv
} from './ai-test-analysis.js';
const scores = (values = {}) => Object.fromEntries(NAMES.map((n, i) => [n, values[IDS[i]] ?? 0]));
const window = (values = {}, start = 0, ms = 20) => ({
  start,
  end: start + .975,
  scores: scores(values),
  inferenceMs: 10,
  roundTripMs: ms
});
const clip = (id, labels, values = {}, extra = {}) => ({
  id,
  name: id + '.wav',
  labels,
  sourceGroup: id,
  status: 'done',
  duration: 2,
  complete: false,
  events: [],
  result: {
    windows: [window(values)],
    offlineMs: 50,
    thresholds: defaults()
  },
  ...extra
});
const cfg = defaults();
test('multi-label selection and exclusive none/unknown', () => {
  assert.deepEqual(setTruth(['unknown'], 'bell', true), ['bell']);
  assert.deepEqual(setTruth(['bell'], 'horn', true), ['bell', 'horn']);
  assert.deepEqual(setTruth(['bell', 'horn'], 'none', true), ['none']);
  assert.deepEqual(setTruth(['none'], 'police', true), ['police']);
  assert.deepEqual(setTruth(['bell'], 'unknown', true), ['unknown']);
  assert.equal(known({
    labels: []
  }), false);
  assert.equal(known({
    labels: ['none', 'bell']
  }), false);
});
test('known clip confusion matrix with exact denominators; unknown and failed excluded', () => {
  const clips = [clip('tp', ['bell'], {
    bell: .5
  }), clip('fn', ['bell']), clip('fp', ['none'], {
    bell: .7
  }), clip('tn', ['none']), clip('unknown', ['unknown'], {
    bell: 1
  }), clip('failed', ['bell'], {}, {
    status: 'failed',
    result: null
  })];
  const m = analyse(clips, cfg);
  assert.equal(m.totalFiles, 6);
  assert.equal(m.processedFiles, 5);
  assert.equal(m.labelledFiles, 4);
  assert.deepEqual(m.byClass.bell, {
    tp: 1,
    fp: 1,
    fn: 1,
    tn: 1,
    precision: .5,
    recall: .5,
    f1: .5,
    fpr: .5,
    support: 2
  });
  assert.deepEqual(m.clipCounts, {
    exact: 2,
    missed: 1,
    falseAlarm: 1
  });
});
test('zero denominators are N/A; zero recall with a missed positive is valid zero', () => {
  const none = metrics({});
  for (const key of ['precision', 'recall', 'f1', 'fpr']) assert.equal(none[key], null);
  const missed = metrics({
    fn: 1
  });
  assert.equal(missed.precision, null);
  assert.equal(missed.recall, 0);
  assert.equal(missed.f1, 0);
  const event = metrics({
    tp: 1
  }, true);
  assert.equal(event.tn, null);
  assert.equal(event.fpr, null);
});
test('siren group OR counts overlapping subtype predictions once, without hiding raw classes', () => {
  const c = clip('siren', ['police'], {
    siren: .8,
    police: .9,
    ambulance: .7
  });
  assert.deepEqual(grouped(['siren', 'police', 'ambulance', 'fire']), ['sirenGroup']);
  const groupedMetrics = analyse([c], cfg, 'clip', true);
  assert.equal(groupedMetrics.byClass.sirenGroup.tp, 1);
  assert.equal(groupedMetrics.micro.fp, 0);
  assert.equal(analyse([c], cfg).micro.fp, 2);
});
test('threshold equality inclusive and each class independent from highest ineligible score', () => {
  const t = {
    ...cfg,
    [NAMES[0]]: .01,
    [NAMES[1]]: .3
  };
  assert.deepEqual(predict(window({
    bell: .01,
    horn: .299999,
    siren: .49
  }), t), ['bell']);
  assert.deepEqual(predict(window({
    bell: .009999,
    horn: .3
  }), t), ['horn']);
  assert.deepEqual(predict(window({
    bell: NaN,
    horn: Infinity
  }), t), []);
});
test('one threshold crossing triggers immediately; warning hold never becomes a false positive score', () => {
  const rows = replay([window({
    bell: .5
  }), window({}, .48), window({}, 3)], cfg);
  assert.equal(rows[0].triggered, true);
  assert.equal(rows[1].warningActive, true);
  assert.deepEqual(rows[1].labels, []);
  assert.equal(rows[2].warningActive, false);
});
test('timestamps required for window/event units and bounded by clip duration', () => {
  const c = clip('bell', ['bell'], {
    bell: .5
  });
  assert.equal(validateEvents(c), false);
  c.complete = true;
  c.events = [{
    label: 'bell',
    start: .5,
    end: 1
  }];
  assert.equal(validateEvents(c), true);
  c.events[0].end = 3;
  assert.equal(validateEvents(c), false);
  assert.equal(analyse([c], cfg, 'event').eligibleFiles, 0);
  c.events[0].end = 1;
  c.labels.push('horn');
  assert.equal(validateEvents(c), false);
  assert.equal(validateEvents(clip('none', ['none'], {}, {
    complete: true
  })), true);
});
test('window labels use strict overlap, not whole-clip labels or boundary-touching events', () => {
  const c = clip('bell', ['bell'], {}, {
    duration: 3,
    complete: true,
    events: [{
      label: 'bell',
      start: .975,
      end: 1.1
    }]
  });
  c.result.windows = [window({}, 0), window({
    bell: .5
  }, .48), window({}, 1.44)];
  const m = analyse([c], cfg, 'window');
  assert.equal(m.units, 3);
  assert.deepEqual([m.byClass.bell.tp, m.byClass.bell.tn, m.byClass.bell.fn], [1, 2, 0]);
});
test('event bursts match one-to-one; siren truth intervals merge; latency includes collection and backlog',
() => {
    const c = clip('bell', ['bell'], {}, {
      duration: 3,
      complete: true,
      events: [{
        label: 'bell',
        start: .3,
        end: 1.1
      }, {
        label: 'bell',
        start: 1.6,
        end: 1.8
      }]
    });
    c.result.windows = [window({
      bell: .8
    }, 0, 600), window({
      bell: .8
    }, .48, 600), window({}, .96)];
    const m = analyse([c], cfg, 'event').byClass.bell;
    assert.equal(m.tp, 1);
    assert.equal(m.fn, 1);
    assert.equal(m.fp, 0);
    assert.equal(m.tn, null);
    assert.ok(Math.abs(m.latencies[0].seconds - 1.275) < 1e-9);
    assert.equal(m.latencies[0].timely, false);
    const rows = replay(c.result.windows, cfg);
    assert.equal(rows[1].simulatedReady, 2.175);
    const s = clip('s', ['siren', 'police'], {
      siren: .8,
      police: .8
    }, {
      complete: true,
      events: [{
        label: 'siren',
        start: 0,
        end: 1
      }, {
        label: 'police',
        start: .2,
        end: 1.2
      }]
    });
    assert.equal(analyse([s], cfg, 'event', true).byClass.sirenGroup.tp, 1);
  });
test('pre-onset active burst does not invent response latency; unobserved final tail can be a missed event',
() => {
  const c = clip('bell', ['bell'], {}, {
    duration: 3,
    complete: true,
    events: [{
      label: 'bell',
      start: 2.5,
      end: 3
    }]
  });
  c.result.windows = [window({
    bell: .8
  }, 0), window({
    bell: .8
  }, .48), window({
    bell: .8
  }, .96), window({
    bell: .8
  }, 1.44)];
  assert.equal(analyse([c], cfg, 'event').byClass.bell.fn, 1);
  c.events = [{
    label: 'bell',
    start: 1.5,
    end: 2
  }];
  assert.equal(analyse([c], cfg, 'event').byClass.bell.latencies.length, 0);
});
test('timing is measured inference and worker time, never actual microphone latency', () => {
  const c = clip('a', ['none']);
  c.result.windows = [window({}, 0, 100), window({}, .48, 600)];
  const t = timing([c]);
  assert.equal(t.inference.mean, 10);
  assert.equal(t.roundTrip.mean, 350);
  assert.equal(t.withinHop, .5);
  assert.equal(t.actualMicrophoneLatency, null);
  assert.equal(timing([]).sustainedEstimate, null);
});
test('recording groups never cross validation/test and split is reproducible independently of file order',
() => {
    const clips = Array.from({
      length: 12
    }, (_, i) => clip(String(i), ['none']));
    clips.push(clip('duplicate', ['none'], {}, {
      sourceGroup: '0'
    }));
    const s = splitDataset(clips);
    assert.equal(s.mode, 'heldout');
    assert.equal(s.roles['0'], s.roles.duplicate);
    assert.deepEqual(s.roles, splitDataset([...clips].reverse()).roles);
    const validation = selectionClips(clips, s),
      held = selectionClips(clips, s, 'test');
    assert.ok(validation.length && held.length);
    assert.ok(!validation.some(a => held.some(b => a.sourceGroup === b.sourceGroup)));
    assert.equal(splitDataset(clips.slice(0, 9)).mode, 'exploratory');
    clips[0].sourceGroup = '';
    assert.equal(splitDataset(clips).reason, 'missingGroup');
  });
test(
  'threshold sweep uses known clip-level validation scores and requires both positive and negative support',
  () => {
    const data = [clip('p1', ['bell'], {
      bell: .15
    }), clip('p2', ['bell'], {
      bell: .2
    }), clip('n1', ['none'], {
      bell: .1
    }), clip('n2', ['none'], {
      bell: .05
    }), clip('u', ['unknown'], {
      bell: 1
    })];
    const r = optimize(data, cfg);
    assert.equal(r.bell.curve.length, 50);
    assert.equal(r.bell.curve[0].threshold, .01);
    assert.equal(r.bell.curve.at(-1).threshold, .5);
    assert.equal(r.bell.recommended, .15);
    assert.equal(r.bell.support, 2);
    assert.equal(r.horn.recommended, null);
    const split = {
      mode: 'heldout',
      roles: {
        p1: 'validation',
        p2: 'validation',
        n1: 'validation',
        n2: 'validation',
        u: 'test'
      }
    };
    const baseline = optimize(selectionClips(data, split), cfg);
    data[4].labels = ['bell'];
    assert.deepEqual(optimize(selectionClips(data, split), cfg), baseline);
  });
test('recommendation goals trade off recall and precision without modifying the input settings', () => {
  const data = [clip('p1', ['bell'], {
      bell: .05
    }), clip('p2', ['bell'], {
      bell: .4
    }), clip('n1', ['none'], {
      bell: .1
    }), clip('n2', ['none'], {
      bell: .2
    })],
    before = JSON.stringify(cfg);
  assert.equal(optimize(data, cfg, 'recall').bell.recommended, .05);
  assert.equal(optimize(data, cfg, 'precision').bell.recommended, .4);
  assert.equal(JSON.stringify(cfg), before);
});
test(
  'exports include raw precision, config, labels and metrics, exclude audio and withhold final scores until frozen',
  () => {
    const a = clip('a', ['bell'], {
        bell: .123456789
      }),
      b = clip('b', ['none']);
    a.file = {
      secretAudio: 'must not export'
    };
    a.name = '=HYPERLINK("bad")';
    const split = {
      mode: 'heldout',
      roles: {
        a: 'validation',
        b: 'test'
      }
    };
    const d = exportData([a, b], cfg, split, false, null, 'balanced');
    assert.ok(!JSON.stringify(d).includes('secretAudio'));
    assert.equal(d.clips[1].result, null);
    assert.equal(d.clips[1].withheld, true);
    assert.equal(d.analysis.clip.raw.totalFiles, 1);
    const output = csv(d);
    assert.ok(output.startsWith('\uFEFF'));
    assert.ok(output.includes('0.123456789'));
    assert.ok(output.includes("'=HYPERLINK"));
    assert.ok(output.includes('threshold:Bicycle bell'));
    assert.ok(output.includes('analysis.clip.raw.byClass.bell.precision'));
    const final = exportData([a, b], cfg, split, true, null, 'balanced');
    assert.ok(final.clips[1].result);
    assert.equal(final.analysis.clip.raw.totalFiles, 1);
  });

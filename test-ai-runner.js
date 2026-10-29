// Fake decoded PCM / worker results test orchestration only, not model accuracy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BatchRunner,
  checkAudio,
  checkFile,
  windowsOf,
  LIMITS,
  TestError,
  ModelClient
} from './ai-test-runner.js';
import {
  defaults,
  NAMES
} from './ai-test-analysis.js';
const pcm = (rate = 16000, seconds = 2, channels = 1) => {
  const data = Array.from({
    length: channels
  }, (_, i) => new Float32Array(Math.floor(rate * seconds)).fill(i ? -.1 : .3));
  return {
    sampleRate: rate,
    length: data[0].length,
    duration: data[0].length / rate,
    numberOfChannels: channels,
    getChannelData: i => data[i]
  };
};
const makeClip = id => ({
  id,
  name: id,
  file: {
    size: 20,
    id
  },
  status: 'queued',
  progress: 0
});

function harness(overrides = {}) {
  let alive = 0,
    max = 0,
    created = 0,
    closed = 0,
    calls = 0;
  const runner = new BatchRunner({
    decode: async () => pcm(),
    clientFactory: () => {
      created++;
      let open = true;
      return {
        async init() {
          alive++;
          max = Math.max(max, alive);
        },
        async classify(frame) {
          calls++;
          return {
            scores: Object.fromEntries(NAMES.map(n => [n, 0])),
            inferenceMs: 4,
            roundTripMs: 5
          };
        },
        close() {
          if (open) {
            open = false;
            closed++;
            alive--;
          }
        }
      };
    },
    yieldFrame: async () => {},
    ...overrides
  });
  return {
    runner,
    stats: () => ({
      alive,
      max,
      created,
      closed,
      calls
    })
  };
}
for (const rate of [8000, 16000, 44100, 48000, 96000]) test(
  `offline windows retain ${rate} Hz PCM, duration and mono averaging`, () => {
    const audio = pcm(rate, 2, 2),
      rows = [...windowsOf(audio)];
    checkAudio(audio);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].samples.length, Math.floor(rate * .975));
    assert.ok(Math.abs(rows[0].samples[0] - .1) < 1e-7);
    assert.equal(rows[1].endSample - rows[0].endSample, Math.round(rate * .48));
    assert.ok(Math.abs(rows[0].end - .975) < 1 / rate);
    assert.ok(Math.abs(audio.getChannelData(0)[0] - .3) < 1e-7);
  });
test('length boundary: short clips fail; exact first window succeeds and partial tails are not padded',
() => {
  assert.throws(() => checkAudio(pcm(16000, .974)), /tooShort/);
  assert.equal([...windowsOf(pcm(16000, .975))].length, 1);
  assert.equal([...windowsOf(pcm(16000, 1.454))].length, 1);
  assert.equal([...windowsOf(pcm(16000, 1.455))].length, 2);
});
test('file, decoded duration/memory and unsupported sample-rate limits are checked', () => {
  assert.throws(() => checkFile({
    size: LIMITS.fileBytes + 1
  }), /fileLarge/);
  assert.throws(() => checkFile({
    size: 0
  }), /decodeError/);
  checkFile({
    size: LIMITS.fileBytes
  });
  assert.throws(() => checkAudio({
    ...pcm(),
    duration: 121
  }), /audioLarge/);
  assert.throws(() => checkAudio({
    ...pcm(),
    length: LIMITS.decodedBytes,
    numberOfChannels: 2
  }), /audioLarge/);
  assert.throws(() => checkAudio({
    ...pcm(),
    sampleRate: 4000
  }), /sampleRate/);
});
test('batch uses one worker and sequential decode; per-file decode failure does not stop later files',
async () => {
  let decodeActive = 0;
  const h = harness({
    decode: async file => {
      decodeActive++;
      assert.equal(decodeActive, 1);
      await Promise.resolve();
      decodeActive--;
      if (file.id === 'bad') throw new TestError('decodeError');
      return pcm();
    }
  });
  const clips = ['ok', 'bad', 'later'].map(makeClip),
    updates = [];
  await h.runner.run(clips, defaults(), (n, total, c) => updates.push([n, total, c?.progress]));
  assert.deepEqual(clips.map(c => c.status), ['done', 'failed', 'done']);
  assert.equal(clips[1].error, 'decodeError');
  assert.equal(clips[0].result.windows.length, 3);
  assert.ok(clips[0].result.tailSeconds > 0);
  assert.equal(h.stats().created, 1);
  assert.equal(h.stats().max, 1);
  assert.equal(h.stats().alive, 0);
  assert.equal(h.stats().calls, 6);
  assert.equal(updates.at(-1)[0], 3);
});
test('cancel during non-abortable decode keeps batch locked until decode resolves and does not infer',
async () => {
  let resolve, started;
  const entered = new Promise(r => started = r);
  const h = harness({
      decode: () => {
        started();
        return new Promise(r => resolve = r);
      }
    }),
    clips = ['a', 'b'].map(makeClip);
  const p = h.runner.run(clips, defaults());
  await entered;
  h.runner.cancel();
  assert.equal(h.runner.running, true);
  await assert.rejects(h.runner.run(clips, defaults()), /busy/);
  resolve(pcm());
  await p;
  assert.deepEqual(clips.map(c => c.status), ['cancelled', 'cancelled']);
  assert.equal(h.stats().calls, 0);
  assert.equal(h.runner.running, false);
  assert.equal(clips[0].result, null);
});
test('cancel between windows discards partial scores and retry/repeated run never appends old windows',
async () => {
    const h = harness(),
      clips = ['a', 'b'].map(makeClip);
    await h.runner.run(clips, defaults(), (n, total, c) => {
      if (c?.progress > 0 && c.status === 'testing') h.runner.cancel();
    });
    assert.deepEqual(clips.map(c => c.status), ['cancelled', 'cancelled']);
    assert.equal(clips[0].result, null);
    for (let i = 0; i < 2; i++) {
      clips.forEach(c => c.status = 'queued');
      await h.runner.run(clips, defaults());
      assert.equal(clips[0].result.windows.length, 3);
      assert.equal(clips[1].status, 'done');
    }
    assert.equal(h.stats().alive, 0);
    assert.equal(h.stats().max, 1);
  });
test('model initialization failure marks all files failed and releases worker', async () => {
  let closed = 0;
  const h = harness({
      clientFactory: () => ({
        init: async () => {
          throw new TestError('modelError');
        },
        close() {
          closed++;
        }
      })
    }),
    clips = ['a', 'b'].map(makeClip);
  await h.runner.run(clips, defaults());
  assert.ok(clips.every(c => c.status === 'failed' && c.error === 'modelError'));
  assert.equal(h.runner.running, false);
  assert.equal(closed, 1);
});
test('model inference failure recovers a fresh worker for the next file', async () => {
  let id = 0,
    closed = 0;
  const h = harness({
      clientFactory: () => {
        const current = ++id;
        return {
          init: async () => {},
          classify: async () => {
            if (current === 1) throw new TestError('modelError');
            return {
              scores: Object.fromEntries(NAMES.map(n => [n, 0])),
              inferenceMs: 1,
              roundTripMs: 2
            };
          },
          close() {
            closed++;
          }
        };
      }
    }),
    clips = ['a', 'b'].map(makeClip);
  await h.runner.run(clips, defaults());
  assert.deepEqual(clips.map(c => c.status), ['failed', 'done']);
  assert.equal(id, 2);
  assert.equal(closed, 2);
});
test('model client rejects mismatched, incomplete and invalid raw inference results', async () => {
  const client = new ModelClient(),
    frame = {
      sequence: 1,
      samples: new Float32Array(15600)
    };
  for (const data of [{
      type: 'result',
      sequence: 2,
      inferenceMs: 1,
      trafficScores: {}
    }, {
      type: 'result',
      sequence: 1,
      inferenceMs: 1,
      trafficScores: {}
    }, {
      type: 'error'
    }]) {
    client.request = async () => data;
    await assert.rejects(client.classify(frame, 16000), /modelError/);
  }
});

test('invalid decoded metadata is rejected instead of producing empty or infinite progress', () => {
  for(const patch of [{duration:NaN},{sampleRate:Infinity},{numberOfChannels:0},{length:0}])
    assert.throws(()=>checkAudio({...pcm(),...patch}),/decodeError/);
});

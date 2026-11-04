# Traffic Sound Guardian V1.7.5

A local, browser-based research prototype for recognizing surrounding traffic
warning sounds. The website is published on GitHub Pages. Standard supports the original circular
microphone and an optional live PCM waveform, selectable under Settings.

Raw YAMNet scores are not accuracy or calibrated probability. This prototype does
not guarantee road safety. Physical Safari/iPad/AirPods and Apple Music mixing
have not been verified in this environment.

## Pages and behavior

- **Standard — `index.html`:** stable circular microphone button with two rings
  responding to real input RMS, reduced-motion support, a red listening indicator,
  current classification, ten-second symmetric waveform and last warning.
  Settings include language, theme, microphone selection, alert toggle/level and
  output-only preview. One direct threshold from **0.01 to 0.50**, default **0.10**,
  applies to all eleven warning categories.
- **Test — `ipad-test.html`:** rectangular microphone control, eleven independent
  direct thresholds, per-category/all reset, genuine Top 1/Top 5/eleven-category
  scores, model/microphone/sample-rate diagnostics, inference timing and warning
  statistics. The last 100 metadata records stay in memory and can be filtered
  and manually exported as CSV. Starting the next session clears those records.
- **AI Test — `ai-test.html`:** local, labelled-file evaluation, waveform annotation,
  dataset splits/holdout controls, threshold analysis and CSV/JSON exports. Its
  explicit six-category apply action updates only the corresponding Test values,
  preserves the other five, and never overwrites Standard's threshold.
- **Microphone Test — `microphone-test.html`:** browser-reported input selection,
  track/context metadata and actual live input level. It does not run the model.

All pages retain Japanese, English and Simplified Chinese plus system/light/dark
themes. Standard and Test use different threshold preference keys. The legacy
`overallSensitivity` multiplier is never read or applied.

## Architecture

`app.js` coordinates the realtime lifecycle, user-gesture microphone startup,
one in-flight/one pending Worker window, warning timing and automatic tone output.
It delegates presentation without handing audio ownership to a view:

| Module | Responsibility |
| --- | --- |
| `app-i18n.js` | Immutable application catalogs, language selection and translation |
| `threshold-settings.js` | Independent Standard/Test threshold persistence and legacy migration |
| `page-elements.js` | Explicit required DOM capabilities per page; useful errors for missing elements |
| `application-view.js` | Status, button and translated settings rendering |
| `microphone-view.js` / `mic-source.js` | Browser metadata and source evidence; optional metadata failures stay unavailable |
| `debug-view.js` | Current Test diagnostic and raw-score tables |
| `microphone-visualizer.js` / `live-timeline.js` | Read-only real-input visualization and ten-second history |
| `research.js` / `research-dashboard.js` | Bounded metadata statistics, logs and manual CSV |
| `classifier-worker.js`, `audio-window.js`, `capture-worklet.js`, `resample.js`, `detection.js` | Protected model/input/window/decision pipeline |
| `alert-tone-preview.js` | Separate, unchanged output-only preview and existing Safari policy |

The YAMNet model, 521-class output, eleven labels, 0.975-second window, 480ms hop,
warning priority/hold behavior, capture graph and output waveforms/levels are
preserved. Tests lock eight coordinator function ASTs, eight protected modules,
and the eight pinned model/runtime assets. No raw audio is automatically uploaded
or persisted. Downloaded CSV contains scalar metadata, not PCM or recordings.

## Development and verification

The website is static and has no runtime npm dependencies or build step.
Node development dependencies are exactly pinned in `package-lock.json`:
Acorn parses verification inputs; Prettier formats the extracted authored modules.

```sh
npm ci --ignore-scripts
npm run check
npm run format:check
# Run after fetching the target branch:
node scripts/check-release-version.mjs "$(git rev-parse origin/main)"
python -m pip install playwright==1.62.0
python -m playwright install chromium
python -m http.server 8000 --bind 127.0.0.1
```

In another terminal, run the browser suites against the served directory:

```sh
python tests/ui-canvas-browser.py --base-url http://127.0.0.1:8000/ --output work/layout
python tests/v17-browser.py --base-url http://127.0.0.1:8000/ --output work/integration
python tests/audio-policy-browser.py --base-url http://127.0.0.1:8000/ --output work/audio-policy
python tests/stability-browser.py --base-url http://127.0.0.1:8000/ --output work/stability
python tests/comprehensive-browser.py --base-url http://127.0.0.1:8000/ --output work/comprehensive
```

CI also serves the actual GitHub Pages repository subpath. It runs on pull
requests, manual dispatch, main and `refactor/**` pushes; the refactor branch can
be tested remotely without opening a PR or publishing a release. Version and
cache checks cover all four public pages and the authored module graph.

## Audit, history and known limits

The audit plan, baseline failures, risk classification and protected boundaries
are in [docs/COMPREHENSIVE-AUDIT.md](docs/COMPREHENSIVE-AUDIT.md). The final evidence
and merge assessment are in [docs/REFACTOR-RESULTS.md](docs/REFACTOR-RESULTS.md).

[README-HISTORY.md](README-HISTORY.md) preserves the exact previous README and its
relative references. Statements about six-only controls, global multipliers or
old candidate deployment status describe those historical releases. Existing
reports, research data, Semantic Hearing and other remote research branches remain
preserved; they are not dead resources merely because the website does not import
them. `style.css` is legacy history, while `v1.6.css` is still used by the offline
annotation tools. Neither is deleted in this maintenance change.

The previously reported occasional headphone startup noise is a separate open
investigation. This refactor does **not** alter audio-session strategy, routing,
tone waveform or volume parameters to address it. API fault injection and virtual
microphone tests cannot establish physical Bluetooth routing, acoustic audibility,
Safari compatibility, road accuracy, energy use or end-to-end acoustic latency.

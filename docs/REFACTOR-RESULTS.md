# V1.7.4 comprehensive refactor results

Scope: maintenance candidate on `refactor/comprehensive-audit`, based on main
`202356db77c1565f9916742dfeec632ce7c80f1d` (V1.7.3). No PR, merge, deployment,
branch deletion, model training or research-data migration is authorized by this
task. Main and the published release are unchanged.

## Decision and evidence boundary

**READY WITH DISCLOSED GAPS for code review, subject to independent branch CI and
owner approval.** Local required checks below pass. The final Chinese handoff
identifies the independently observed branch CI run and exact candidate head;
[branch Actions](https://github.com/ky0o0/traffic-sound-guardian-v1/actions?query=branch%3Arefactor%2Fcomprehensive-audit)
are the authoritative remote status. This is not physical-device certification or
permission to merge/deploy.

## Findings fixed

- **A01 / high:** actual Test startup and stop stacks identify
  `research-dashboard.js:33`, assigning textContent to removed
  `sensitivity-scale`. Baseline CI 41591921176 also fails its browser job. Removing
  that obsolete write restores initialization/language/session/log rendering.
  Required element contracts now name the component and missing ID explicitly.
  The adjacent, still-used direct-threshold table column is preserved; early audit
  notes confused that column with the removed footer and were corrected after
  checking the live row renderer. No replacement multiplier UI is introduced.
- **A02 / high:** injected native Worklet port failure formerly abandoned stop
  cleanup with a live track and running Context. Teardown now logs the failing
  operation and continues releasing other resources, invalidating pending work
  and rendering stopped state. A native API that itself refuses to close cannot
  be guaranteed released; the tests distinguish that case rather than claiming
  success. No valid-path startup/output order was changed.
- **A03 / medium:** optional getSettings failures previously propagated through
  device rendering and research telemetry. A shared safe metadata reader keeps
  them unavailable, including in Microphone Test, without inventing device IDs or
  sample rates or changing actual capture constraints.
- **A04 / medium:** app.js originally combined 44 functions and 1,319 lines across
  catalogs, preferences, views, visualization and realtime coordination. Six
  cohesive modules plus a DOM contract now separate those concerns. The formatted
  coordinator is 1,000 lines; line count is not a performance claim. Keeping the
  asynchronous capture/Worker/warning coordinator together deliberately avoids
  introducing extra scheduling boundaries into protected behavior.
- **A05 / medium:** existing lifecycle assertions now execute actual extracted
  factories, not substitute implementations. New dashboard tests use IDs from
  real HTML and cover initialize/capture/results/language/filter/export/stop.
  Browser errors include stacks; correlated Worker/research snapshots are read
  atomically. Tests that inspected unused legacy CSS now inspect active CSS while
  retaining their signal/geometry/clickability assertions. No existing test file
  or valid behavior assertion was deleted.
- **A06 / medium:** integrity now covers all four public pages, their local module
  graph, required DOM IDs, pinned assets, labels and release/cache metadata.
  Active explicit cache tags are 1.7.4. The offline research CONFIG.version stays
  1.6.0 because it is a data-schema identifier, not the application release.
- **A07 / low:** the current README is English and documents direct, independent
  thresholds. The original README is preserved byte-for-byte as README-HISTORY.md.
  History is labelled as history, without translating or overwriting evidence.
- **A08 / medium:** AI Test's explicit six-value apply action previously replaced
  the full Test preference object, losing customized Bell/Chime/Ding/Ping/Doorbell
  values. It now merges the six requested values into the existing validated Test
  preferences, keeps confirmation and write-error feedback, and never writes the
  Standard key. All three languages explain this scope.

## Architecture and protection matrix

| Responsibility | Before | After |
| --- | --- | --- |
| Application translations | Embedded EN/ZH in app.js | app-i18n.js, immutable catalogs and language policy |
| Threshold persistence/migration | Mixed with rendering | threshold-settings.js, independently testable direct preferences |
| Required/optional page UI | Implicit nullable lookups | page-elements.js, per-mode contracts |
| Status/settings/button rendering | app.js | application-view.js |
| Browser microphone evidence | app.js plus helper | microphone-view.js plus safe mic-source.js reader |
| Debug/raw score tables | app.js | debug-view.js, optional Test capability |
| Read-only RMS visualization | app.js | microphone-visualizer.js, unchanged sampling/smoothing |
| Audio/Worker/warning lifecycle | app.js | app.js, protected coordinator and bounded cleanup fixes |
| Offline study/annotation/metrics | Existing dedicated modules | Retained; only explicit preference application and cache references fixed |

Standard retains the stable circular hit target, real-RMS dual rings, red listening
pulse, reduced-motion fallback, one 0.01–0.50 direct threshold across eleven classes,
current prediction, ten-second symmetric waveform, last warning, input selection,
alert toggle/levels/preview and three languages/themes. Test retains its rectangular
button, pulse, eleven direct thresholds, individual/all reset, Top 1/Top 5/eleven
raw scores, direct threshold column, diagnostics, timings, counts, filters and CSV.

The Standard and Test storage keys remain independent. Legacy six-class and bicycle
preferences load without destructive writes. The retired overall multiplier is not
read or applied. The explicit AI Test operation updates Test only.

Thirteen files, including the model/runtime bytes, resampling, input windows,
Worklet, ten-second timeline and alert preview, are byte-identical to V1.7.3.
Eight coordinator function ASTs and eight protected module ASTs are locked; only
cache tags and spelling-only formatting are normalized. The coordinator reference
is the bounded-fix checkpoint, so the separately disclosed optional-metadata fix
is not misrepresented as byte-identical baseline code. Classifier Worker and other
unchanged algorithm modules only receive cache-reference changes where necessary.

## Repository cleanup and preservation

No existing tracked file, remote branch, research sample, experiment result,
Semantic Hearing artifact, model or historical report was deleted or moved.
Uncertain or historical resources remain with a recorded purpose. The complete
added/modified manifest and reasons are in
[`change-manifest.json`](../audit/comprehensive-audit/final/change-manifest.json).

- `README-HISTORY.md` is an added exact historical copy, not a rewritten result. Its existing trailing whitespace is preserved using a Git attribute scoped only to this immutable snapshot; source and runtime checks remain strict.
- `style.css` has no active HTML consumer but historical/test/report references;
  retained as legacy history. Active assertions now check guardian.css/ipad-test.css.
- `v1.6.css` and theme.css are still used by AI/Microphone Test and annotation UI;
  they are not deleted as apparently old assets.
- Existing audit/ and research/ data remain unchanged. The remote branch inventory
  records Semantic Hearing, bicycle-bell and other YAMNet research branches; these
  were not merged or pruned.
- New .gitignore excludes node_modules, work scratch, browser output and Python
  caches. No pre-existing tracked temporary artifact was proven safe to delete.
- Acorn 8.15.0 and Prettier 3.6.2 are pinned development-only dependencies, with
  lockfile and reproducible npm ci. The website still has zero npm runtime dependencies.
- Duplicate tone construction and six-class offline analysis helpers are retained
  intentionally: this task freezes output mechanisms and research algorithms.

## Executed local verification

| Check | Observed result |
| --- | --- |
| Baseline Node | 260 passed; baseline browser fails (recorded, not hidden) |
| Final Node / actual extracted modules | **290 passed, 0 failed, 0 skipped** |
| Syntax | All root authored JS and scripts/*.mjs; Python browser files compile |
| Integrity | 8 pinned assets, 521 official labels, 11 warning labels, 4 pages, 28 authored modules |
| Release increment | 1.7.3 -> 1.7.4, one maintenance increment |
| Formatting | All nine configured extracted/coordinator/parser files pass |
| Workflow lint | Official actionlint 1.7.7, verified release SHA-256, exit 0, no diagnostics |
| Dependency audit | npm audit reports 0 findings for runtime and development packages; not a vendor-model security certification |
| Existing layout/waveform browser | **114 scenarios**, three languages/themes, 8 viewports and real-model lifecycle |
| Existing stability browser | **22 scenarios**, genuine model, API errors, fallback, timeout, permission and cleanup paths |
| Existing V1.7 integration browser | **5 scenarios**, independent thresholds, real raw values, CSV and preview isolation |
| Existing audio-policy browser | **6 scenarios**, explicitly injected API support/rejection; policy itself unchanged |
| New comprehensive browser | **10 scenarios**, four entrypoints, denied-then-retry, real warning/clear, reduced motion, navigation cleanup, auxiliary layouts, offline UI/CSV and microphone diagnostic |
| Source preservation | 13 byte-identical protected files; 8 function and 8 module semantic guards |

Total local Chromium scenarios: **157**, using Chromium 154. The eight primary
viewports are 1194x834, 1024x768, 1366x1024, 820x500, 390x844, 320x568, 834x1194 and
507x768. Auxiliary pages additionally run three-language, light/dark, desktop/mobile
checks. Realtime input is Chromium's virtual microphone. The offline UI test uses
an explicitly synthetic 740Hz WAV fixture and the **actual production YAMNet**
Worker; its three 521-class windows are not simulated model scores. Low/high direct
thresholds exercise genuine warning enter/clear behavior without injecting AI results.

Development harness corrections are not product passes: the first new browser
attempt used a noncanonical range fill value; keyboard End now exercises the real
control. Unload console messages were not reliably delivered; the test now takes
a synchronous, test-only sessionStorage resource snapshot after application
pagehide handlers and reads it on the destination page. No product upload or
persistent audio collection was added. Full JSON, logs, CSV and labelled screenshots
are under [`audit/comprehensive-audit/final`](../audit/comprehensive-audit/final/).

## Remaining gates and deliberate non-changes

The reported intermittent headphone startup noise remains open and **out of scope**.
Preview AudioSession policy, routing, two 740Hz sine beeps, durations/gaps and
soft/normal/clear gain values were not changed. No physical iPad, Safari, AirPods,
Apple Music mixing, VoiceOver, acoustic latency, road accuracy, long-duration
battery/thermal or Bluetooth route validation was performed. Headless output,
virtual input and API injections cannot establish these properties.

Direct live-site HTTP validation is unavailable under the attached environment's
network policy; repository/deployment evidence is distinct from live-page access.
The published V1.7.3 Pages deployment is not a deployment of this candidate.
Independent branch CI is required before the final merge assessment. Only the owner
can approve merging; this task does not publish or delete previous branches.

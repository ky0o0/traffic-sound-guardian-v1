# Comprehensive audit and refactoring plan

Baseline: `202356db77c1565f9916742dfeec632ce7c80f1d` (V1.7.3).
Working branch: `refactor/comprehensive-audit`. Do not merge, deploy, delete branches,
or open a PR during this task. Target maintenance version: **1.7.4**; behavior-preserving
refactoring and verified bug fixes do not require a minor-version increment.

## Review scope and evidence

The tracked-tree inventory covers 128 files: 43 application/configuration files,
29 test files, 6 vendor/model binaries or generated runtimes, 37 historical evidence
files, 12 documentation files, and one research memorandum. See
[`baseline/inventory.json`](../audit/comprehensive-audit/baseline/inventory.json)
for imports, function boundaries, I/O sites, sizes, and hashes. Generated vendor
runtimes are checked against dependency-lock.json rather than edited.

All four entrypoints were opened in Chromium. Baseline Node: **260 passed, zero
failed/skipped**; baseline integrity: eight pinned assets, 521 classes, eleven
warning labels. The current main CI [41591921176](https://github.com/ky0o0/traffic-sound-guardian-v1/actions/runs/41591921176)
has a successful regression job and a failed browser job. This is not a passing baseline.

The remote branch snapshot records separate Semantic Hearing, YAMNet evaluation,
and bicycle-bell training branches. Their research artifacts are not runtime dead
code, are not merged into this refactor, and must not be deleted. Existing evidence
and historical reports remain immutable except for explicitly identified current
navigation/documentation updates.

## Findings (severity / remediation risk)

| ID | Evidence and impact | Severity | Risk / bounded remediation |
| --- | --- | --- | --- |
| A01 | `research-dashboard.js:33` writes `sensitivity-scale`, removed by V1.7.2. `debug-target-effective` on the next line remains as a redundant header without matching data cells; it belongs to the removed effective-threshold UI. Actual Test initialization, language events and stop produce TypeError; logs never render. `baseline/page-errors.json` records full stacks; integration fails its existing `>=3` log assertion. | High, merge blocker | Low: remove obsolete multiplier UI writes, retain actual direct thresholds and CSV fields; test real page DOM and all dashboard events. |
| A02 | A throwing Worklet port close aborts `app.js` stop cleanup. Fault probe leaves the microphone track live and Context running after session invalidation. | High | Medium: isolate teardown operations without changing valid-path order, input graph, scheduling, or audio output. Add native-failure and stale-session regressions. |
| A03 | `mic-source.js` handles unavailable track settings, but app device rendering and research telemetry call getSettings directly. A throwing getter turns optional diagnostics into an application error. | Medium | Low: one safe read helper, unknown metadata stays unavailable; preserve device-selection semantics. |
| A04 | `app.js` has 1,319 lines and combines 44 functions, two translation catalogs, settings, DOM rendering, visualization, audio output, and lifecycle/inference coordination. | Medium, maintainability | Medium: extract translation, threshold persistence, diagnostics/view and visualization boundaries. Keep user-gesture startup, capture graph, Worker protocol and warning coordinator together. |
| A05 | Existing lifecycle tests execute app.js with imports removed; they do not load the separate dashboard module. Thus 260 passing tests missed A01. Some assertions inspect unused style.css instead of the active design system. Browser probes store messages without module/stack context and read correlated Worker/research state in separate evaluations. | Medium | Low/medium: execute real extracted modules in fixtures, add page-contract tests, inspect active CSS, preserve behavioral assertions, record stacks and take atomic snapshots. |
| A06 | Integrity checks cover HTML assets on two pages but do not traverse module imports, validate all four entrypoints, or enforce cache-version agreement. Several active imports still use 1.5/1.6/1.7.0 cache keys. | Medium | Low: extend the same integrity gate to local module edges, page IDs/contracts and release cache keys. Preserve pinned runtime bytes. |
| A07 | README mixes current 1.7.3 instructions with historical global-multiplier and unmerged-candidate claims. style.css has no production HTML consumer but is referenced by historical tests/reports; v1.6.css remains live for offline annotation styles. | Low | Low: publish a current English README, retain the previous README as an immutable root-level history document so its relative links continue to resolve. Preserve legacy CSS with explicit usage classification rather than deleting uncertain history. |

## Staged implementation and verification

1. **Audit checkpoint (this document):** inventory, baseline failures, protected
   artifacts, severity/risk and plan committed before modifying application code.
2. **Bounded defect fixes:** reproduce A01/A02/A03 with regression tests, fix them,
   and run the narrow checks plus the full Node suite. Do not touch preview session
   policy, alert waveform/gain parameters, model, window, hop, or WarningGate.
3. **Architecture:** extract cohesive modules with explicit dependencies. Retain
   lifecycle coordination in app.js and all existing feature assertions. Verify
   the protected algorithm/output bodies and run real-model browser tests.
4. **Repository/verification:** clarify current versus historical files, format
   authored code for readability, align version/cache metadata, extend integrity
   and CI to the independent refactor branch without creating a PR.
5. **Final evidence:** run syntax, Node, integrity, branch CI and browser suites;
   preserve failures as well as passing results, screenshots, source invariants,
   commit links and a feature matrix. Give an evidence-backed merge verdict.

## Protected behavior and external gates

Standard retains its stable circular button, real-RMS dual rings, red listening
pulse/reduced-motion behavior and one direct 0.01–0.50 threshold. Test retains its
rectangular button, eleven independently stored direct thresholds, per-class/all
reset, diagnostics and bounded research logs/CSV. The old overall multiplier must
remain inert and the two modes must not overwrite each other's thresholds.

Model inference, official label mappings, resampling, audio windows/hop, warning
priority/hold timing, actual capture and Worker backpressure are protected. Alert
preview and automatic tone session/routing/waveform/volume behavior are frozen.
The reported occasional headphone startup noise is **out of scope** and remains
an investigation item. No physical Safari/iPad/AirPods validation is available;
virtual input, API fault injection and headless audio cannot establish it.

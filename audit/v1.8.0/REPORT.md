# V1.8.0 interface redesign and validation

Baseline: remote `main`, V1.7.4, commit `ff301fd` (PR #52). The pre-existing local checkout was V1.7.3; implementation uses a separate worktree and branch created from remote main. No changes were made to main and no deployment was requested or performed.

## Direction and audit

- **Product:** browser-local traffic warning sound monitoring and research, including offline evaluation and microphone routing diagnostics.
- **Character:** attentive, precise, readable.
- **World:** an acoustic monitoring instrument: restrained graphite surfaces, measured signal traces, legible readouts and explicit warnings.
- **Moments:** the live microphone rings and real ten-second waveform. No generated decoration or replacement images.
- **Signature:** a signal accent shared by the shield, active controls and readouts. Red remains reserved for warning information.

Unslop by [Damir Sokolovsky (@heydamir)](https://x.com/heydamir), [source](https://github.com/heydamir/unslop), CC BY 4.0, informed the spacing, color, icon, copy, type, layout, detail, visual and motion passes. This is an application of the workflow, not a copy of its example dashboard.

Audit findings and resulting changes:

| Finding in V1.7.4 | V1.8.0 treatment |
| --- | --- |
| Blue radial surfaces on auxiliary pages, separate palettes and extensive light-theme overrides | Shared graphite/light-neutral tokens; remove obsolete global theme color overrides |
| Standard's microphone glow and a narrow desktop column | Flat microphone surface with the original amplitude-driven dual rings; a two-zone desktop workspace |
| Uppercase tracked branding and 9–11px research text | Consistent shield/wordmark; normal tracking; 12px metadata, 13–14px controls/data and larger result readouts |
| Test reset buttons each consume a separate row | One label/value row and one slider/reset row per sound; every range and reset retains a 44px target |
| Separate theme, upload, diagnostic and table styling | One shared presentation layer and consistent semantic colors, borders, radii and states |
| Auxiliary pages require indirect navigation | Four localized navigation links with active-page state and language-preserving URLs |
| Long mobile research page puts thresholds far below data | Sticky section links to controls, live research and thresholds; no datasets or rows removed |
| Fixed landscape header assumptions and short-screen popover overflow | Content-sized localized headers; bounded scrollable Standard settings |

The prior review text was not present in the available conversation or repository context. The implementation therefore follows the explicit requested scope and a fresh audit of the actual baseline. The main design decisions are a split Standard desktop layout, compact but complete Test thresholds, a two-column diagnostic workspace and mobile section navigation. These choices improve access without changing the product's purpose or hiding research data.

## Page changes

**Standard:** shared navigation and branding; responsive two-zone desktop layout; circular microphone centered in its control zone; no microphone glow; unchanged input-driven ring transforms and fixed hit target; clearer status, warning, current result, waveform and last-warning hierarchy; bounded settings with readable native controls. On narrow screens the original reading order remains.

**Test:** retain controls / research / independent thresholds in three landscape columns. The center gets more space; table rows and metrics are larger. All classification rows, top-five results, counters, logs and debug controls remain. Independent column scrolling is intentional for a large research dataset; the threshold list scrolls independently with its reset-all action retained. Mobile stacks the same content and adds section anchors. No columns or records are suppressed.

**AI Test:** shared shell and navigation, persistent theme picker outside the rerendered root, quiet tab states, native multi-file input with a clear upload surface, consistent controls, thresholds, annotations, tables, charts and export surfaces. Offline evaluation retains its existing six-class scope; the real-time monitor retains all eleven warning targets. The evaluation taxonomy was not expanded or simplified by a visual task.

**Microphone Test:** shared shield and navigation; side-by-side capture and device diagnostics on desktop; stacked panels on mobile; clearer controls, input meter, status, device key/value rows and numbered instructions. Actual device names and routing caveats remain.

## Design system and implementation boundary

`design-system.css` is the shared presentation layer, loaded after the existing page styles. `site-navigation.js` owns only localized links, active-page state and mobile section anchors. `theme.js` still owns theme preference and the original page controllers still own language, audio and lifecycle behavior. `theme.css` now supplies minimal picker geometry; color rules are centralized rather than competing with the new tokens.

| Area | Rules |
| --- | --- |
| Dark surfaces | Page `#141617`, surface `#1b1e20`, raised `#25292c` |
| Light surfaces | Page `#f4f6f5`, surface `#ffffff`, raised `#e9eeec` |
| Text | Primary, secondary, muted tokens for both themes |
| Accent / warnings | Dark accent `#91dbcd`, light accent `#166b5a`; red warning text with a localized warning surface |
| Typography | Native system sans with Japanese/Chinese fallbacks; tabular numerals; no external font dependency |
| Spacing | 4px-based spacing with 16/20/24/32px panel and page spacing |
| Controls / panels | 44px minimum control targets; 8px control radii; 12–16px panel radii; visible keyboard focus |
| Tables | 12px headers, 13px data, restrained row dividers; sticky headers inside existing scroll containers |
| Responsive behavior | Three Test columns at landscape ≥820×500; Standard/diagnostic desktop arrangement ≥900px; mobile adjustments below 900/480px |
| Motion | Explicit color/border transitions; amplitude-driven rings retained; recording pulse retained without glow; reduced-motion support |

No runtime dependencies were added. Changes to audio, classifier, research and view modules other than `ai-test.js` are release/cache identifiers only. The sole non-version change to `ai-test.js` adds an upload presentation class. The model, WASM, class map, resampler, detection logic, audio windows and microphone pipeline remain unchanged; the artifact integrity check verifies all eight pinned assets and eleven exact warning labels.

The repository's release gate requires an increment for published changes. V1.8.0 is the next minor release identifier; it does not imply a deployment or algorithm update.

## Validation

All commands run against the actual static site served locally under a repository subpath, using Chromium 154.0.8037.57 where browser execution is required.

| Check | Result |
| --- | --- |
| `npm run check` | Artifact graph, all eight pinned assets, 521 model labels, eleven warning labels, four entrypoints; all 290 Node tests pass |
| `npm run format:check` | Pass, including the new shared CSS and navigation module |
| `node --check` on authored root JS and script modules | Pass |
| `scripts/check-release-version.mjs` against remote main | Pass: 1.7.4 → 1.8.0 |
| Existing `ui-canvas-browser.py` | 114 cases pass: responsive layouts, waveform drawing/labels and live smoke tests |
| Existing `v17-browser.py` | 5 cases pass: eleven thresholds/reset/persistence, real research values, CSV and preview isolation |
| Existing `audio-policy-browser.py` | 6 cases pass |
| Existing `stability-browser.py` | 22 cases pass: injected faults, lifecycle, late permissions, fallback capture, keyboard and target sizing |
| Existing `comprehensive-browser.py` | 10 cases pass: real model on virtual input, warning/clear, denial/retry, language/theme, offline synthetic WAV/CSV and microphone diagnostics |
| New `design-system-browser.py` | 144 layout combinations, localized navigation, mobile section jump, and two real-model session cleanup checks through the new navigation |

The new matrix covers all four pages, English/Japanese/Simplified Chinese, light/dark, and 1440×900, 1194×834, 1024×768, 820×500, 390×844 and 320×568. It checks viewport overflow, popover bounds, three-column separation, localized header collisions, active navigation and retained threshold controls. It is included in the existing browser CI job. The wider existing waveform matrix also covers portrait tablets and split views.

During validation, the short-screen settings bound was corrected. Legacy tests with V1.7.4 literals were updated for V1.8.0, and the theme-state assertion now reads the shared stylesheet. Functional assertions were retained. Browser fixtures use explicitly synthetic input or injected faults where described; they do not establish road accuracy.

Machine-readable browser results are in [results](results/). CI uploads the complete screenshot matrix. Selected local evidence is included below.

## Before / after evidence

Same 1194×834 Chromium viewport, English, dark theme, stopped/idle state. Images show the real interface; idle waveforms are intentionally flat.

| Page | V1.7.4 before | V1.8.0 after | Mobile light theme |
| --- | --- | --- | --- |
| Standard | [Before](before/index.html.png) | [After](after/index.html-1194-dark.png) | [390px](after/index.html-390-light.png) |
| Test | [Before](before/ipad-test.html.png) | [After](after/ipad-test.html-1194-dark.png) | [390px](after/ipad-test.html-390-light.png) |
| AI Test | [Before](before/ai-test.html.png) | [After](after/ai-test.html-1194-dark.png) | [390px](after/ai-test.html-390-light.png) |
| Microphone Test | [Before](before/microphone-test.html.png) | [After](after/microphone-test.html-1194-dark.png) | [390px](after/microphone-test.html-390-light.png) |

## Remaining manual acceptance and recommendation

- Real iPad landscape and iPhone portrait Safari/WebKit, including native menus, safe-area insets, browser chrome and split view.
- Physical microphone and headphone routes, Bluetooth switching, permissions and interruption/resume on target devices.
- Audible beep level and music coexistence; headless audio execution does not prove audibility or safe playback level.
- Representative road recordings, recognition quality, timing and safe-use evaluation; synthetic/virtual input does not validate these.
- Final human visual review in all three languages, both themes and with representative long filenames and populated research sessions.

The executable checks support a code review of this presentation change. Merge should wait for the owner's visual review and physical-device acceptance. No automated merge or production deployment is authorized by this PR.

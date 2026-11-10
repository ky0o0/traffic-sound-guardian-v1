# V1.6.16 Pre-release Physical Device Acceptance Checklist

**Status: Not performed.** This is a manual acceptance checklist, not a record of successful automated testing. Test only indoors in a quiet, safe setting; do not rely on this research prototype in traffic. Record device model, complete iOS/iPadOS/Safari version, webpage versus home-screen mode, input/output devices, and build SHA. Playing known test sounds from another device can validate the workflow but does not establish model accuracy.

| Required scenario | Procedure and acceptance criteria | Record |
|---|---|---|
| iPhone small/standard displays | Standard page in Japanese, English, and Chinese; light/dark mode; portrait/landscape; large system fonts; scrolling and controls remain accessible with no horizontal content loss | Not verified |
| iPad landscape/portrait/Split View | iPad page on 11- and 13-inch devices; expanded/collapsed address bar, rotation, and Split View; three-column or stacked layout accessible; Debug panel and right-side sliders scroll independently | Not verified |
| Permission denial and retry | Stop with a clear error after denial; allow successful manual restart after Safari permissions change; do not repeatedly prompt | Not verified |
| Delayed permissions | Cancel startup while a permission prompt is pending, then grant permission; release the stale request's track without resuming the old session | Not verified |
| Repeated start/stop | Perform 20 start/stop cycles and rapid taps; only one active capture chain per session, no microphone indicator or alert tones after stop | Not verified |
| Genuine inference path | During real audio input, Debug shows model load/inference success and updates; never substitute player output or fabricated values for YAMNet; record raw classes and scores | Not verified |
| Six sliders and five bells | Each of six thresholds adjusts independently, survives refresh, and resets; compare raw scores/labels with thresholds; do not change detection algorithms merely to pass acceptance | Not verified |
| Red warning and alert sound | One qualifying result triggers red state immediately; clears approximately one second after the last positive result; lower scores do not extend it; consecutive positives do not replay the same alert sequence | Not verified |
| Automatic alert muting | Switching off during playback stops scheduled tones; visual alert remains if audio cannot play; no leftover sound after detection stops | Not verified |
| Manual preview | Hear two complete short tones (110 ms each, separated by 85 ms) on iPad; rapid taps produce only one pair; preview does not start microphone/model or create fake warnings in charts | Not verified |
| Safari audio interruption | Incoming call, Siri, or other audio interruption that suspends/interrupts audio reliably stops monitoring; manual retry works | Not verified |
| Background and lock screen | App switch, lock, navigation, refresh, and browser back release microphone and audio; return in stopped state without automatic restart | Not verified |
| AirPods/wired headphones | Connect/disconnect each; browser input label alone cannot identify a specific physical microphone; interruptions stop safely and permit retry | Not verified |
| System output route | The two tones come from the intended device; record actual route, since a webpage cannot force AirPods output; evaluate interaction between environmental and alert sounds | Not verified |
| Languages and accessibility | VoiceOver, keyboard, reduced motion, text zoom; warning title is announced without raw-score refreshes interrupting continually; Escape closes settings and restores focus | Not verified |
| Extended operation | Run both pages for 30–60 minutes each; watch for capture/inference interruption or UI slowdown; confirm resource cleanup; record memory/temperature/battery rather than assuming efficiency | Not verified |
| Local diagnostics/annotation | Diagnostic mode releases resources on interruption; tab switching/exit during annotation loading leaves no audio context; files stay local | Not verified |
| Caching and home-screen mode | Refresh/reopen after V1.6.15 and confirm V1.6.16; both entrypoints load correct resources; separately test the manifest's portrait constraint in iPad home-screen mode | Not verified |

If any core capture, warning, or cleanup requirement fails, preserve device logs and reproduction steps and delay release. Passing this checklist would **not** constitute road-safety certification or replace independent detection accuracy and event-level evaluation.

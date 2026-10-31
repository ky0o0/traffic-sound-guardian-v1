// iPad test page is a CSS-only alternate layout of the normal, real classifier UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL(file,import.meta.url),'utf8');
const main = read('./index.html');
const ipad = read('./ipad-test.html');
const css = read('./ipad-test.css');
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
test('iPad test reuses the complete real control DOM and exact production audio scripts',()=>{
 assert.deepEqual(ids(ipad),ids(main),'iPad page has all original controls, debug tables and six thresholds');
 assert.equal(new Set(ids(ipad)).size,ids(ipad).length,'no duplicate element IDs');
 assert.match(ipad, /<body class="ipad-test" data-state="stopped">/);
 assert.match(ipad, /href="\.\/ipad-test\.css\?v=1"/);
 for(const script of ['live-timeline.js','app.js','theme.js']){
   const re=new RegExp(script.replaceAll('.','\\.')+'\\?v=1\\.6\\.(?:12|0)');
   assert.match(main,re);assert.match(ipad,re,'exact same model/controller module');
 }
 for(const name of ['mic-control','rolling-waveform','rolling-current-value','status-label','debug-panel','settings-panel','alert-tone-toggle','language-select','threshold-input-0','threshold-input-5']){
   assert.match(ipad,new RegExp('id="'+name+'"'));
 }
 assert.match(ipad,/href="\.\/index\.html"/,'one-tap return to main site');
 assert.doesNotMatch(ipad,/getUserMedia\(|AudioContext\(|MediaRecorder\(/,'no duplicate capture pipeline');
});
test('iPad landscape fits three principal regions into viewport while retaining readable overflow',()=>{
 assert.match(css, /@media \(orientation:landscape\) and \(min-width:820px\) and \(min-height:500px\)/);
 assert.match(css,/height:100dvh;min-height:0;max-height:100dvh/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) clamp\(270px,32vw,390px\)/);
 assert.match(css,/body\.ipad-test main\{/);
 assert.match(css,/grid-template-columns:minmax\(190px,37%\) minmax\(0,1fr\)/);
 assert.match(css,/body\.ipad-test main \.rolling-panel\{/);
 assert.match(css,/grid-column:2;grid-row:1 \/ 5/);
 assert.match(css,/body\.ipad-test \.debug-section\{/);
 assert.match(css,/body\.ipad-test \.debug-content\{/);
 assert.match(css,/overflow-y:auto/,'long debug tables and six sliders scroll inside sidebar');
 assert.match(css, /body\.ipad-test\[data-debug=off\]/,'full width when Debug hidden');
 assert.match(css, /@media \(orientation:portrait\),\(max-width:819px\),\(max-height:499px\)/);
 assert.doesNotMatch(css,/#debug-panel\{display:none/,'must not hide detailed testing controls');
 assert.doesNotMatch(css,/#sensitivity-panel\{display:none/);
});

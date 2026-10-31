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
 assert.match(ipad, /href="\.\/ipad-test\.css\?v=2"/);
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
test('iPad landscape V2 keeps primary controls on screen and never hard-clips the page',()=>{
 assert.match(css, /@media \(orientation:landscape\) and \(min-width:820px\) and \(min-height:500px\)/);
 assert.match(css, /height:100dvh;min-height:560px;max-height:none/);
 assert.match(css, /overflow-x:hidden;overflow-y:auto/,'short or zoomed Safari window scrolls safely');
 assert.match(css, /grid-template-columns:minmax\(0,1fr\) clamp\(275px,30vw,365px\)/);
 assert.match(css, /grid-template-rows:auto auto minmax\(0,1fr\) auto/,'single compact top toolbar instead of stacked blank rows');
 assert.match(css, /body\.ipad-test \.brand\{/);
 assert.match(css, /grid-column:1;grid-row:1;min-width:0/);
 assert.match(css, /body\.ipad-test \.toolbar\{/);
 assert.match(css, /grid-column:2;grid-row:1/);
 assert.match(css, /body\.ipad-test main\{/);
 assert.match(css, /grid-template-columns:minmax\(190px,39%\) minmax\(0,1fr\)/);
 assert.match(css, /body\.ipad-test main \.rolling-panel\{/);
 assert.match(css, /grid-column:2;grid-row:1 \/ 5/);
 assert.match(css, /main #rolling-waveform\{/);
 assert.match(css, /main \.message\{/);
 assert.match(css, /main \.status\{/);
 assert.match(css, /body\.ipad-test\[data-debug=off\]/);
});
test('iPad Debug detail including sensitivity is reachable with sticky heading and native panel scroll',()=>{
 assert.match(css, /body\.ipad-test \.debug-panel\{/);
 assert.match(css, /display:block;width:100%;height:100%;min-height:0/);
 assert.match(css, /overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain/);
 assert.match(css, /body\.ipad-test \.debug-panel>summary\{/);
 assert.match(css, /position:sticky;top:0;z-index:2/);
 assert.match(css, /body\.ipad-test \.debug-content\{/);
 assert.match(css, /max-height:none;min-height:0;overflow:visible/);
 assert.match(css, /\.debug-content \.sensitivity\{/);
 assert.match(css, /@media \(orientation:portrait\),\(max-width:819px\),\(max-height:499px\)/);
 assert.doesNotMatch(css, /#debug-panel\{display:none/,'full debug content remains in the page');
 assert.doesNotMatch(css, /#sensitivity-panel\{display:none/);
 const sourcePage=read('./index.html');
 assert.equal(ids(ipad).length,ids(sourcePage).length,'do not remove settings, controls or alert details');
 for(const key of ['version-standard','version-ipad','threshold-input-0','threshold-input-5','debug-target','debug-top','mic-control','rolling-current-value']){
   assert.match(ipad,new RegExp('id="'+key+'"'));
 }
});

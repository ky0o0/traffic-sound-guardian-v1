// V3 iPad dashboard: same real microphone / YAMNet pipeline, three readable columns.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
const main = read('./index.html'), ipad = read('./ipad-test.html'), css = read('./ipad-test.css');
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const between = (a,b) => ipad.slice(ipad.indexOf(a),ipad.indexOf(b,ipad.indexOf(a)));

test('iPad V3 preserves all original IDs and exact real AI/audio scripts',()=>{
 assert.deepEqual([...ids(ipad)].sort(),[...ids(main)].sort(),'same ID set despite moving elements into columns');
 assert.equal(new Set(ids(ipad)).size,ids(ipad).length,'no duplicated microphone, threshold or debug IDs');
 assert.match(ipad,/<body class="ipad-test" data-state="stopped">/);
 assert.match(ipad,/href="\.\/ipad-test\.css\?v=3"/);
 for(const file of ['app.js','live-timeline.js','theme.js']){
   const pattern=new RegExp(file.replaceAll('.','\\.')+'\\?v=1\\.6\\.(?:13|0)');
   assert.match(main,pattern);
   assert.match(ipad,pattern,'same live classifier, theme and 10-second waveform as formal site');
 }
 assert.doesNotMatch(ipad,/getUserMedia\(|AudioContext\(|MediaRecorder\(/,'no alternative input chain');
 assert.match(ipad,/href="\.\/index\.html"/);
});

test('left control, center live chart plus BOTH detailed classification tables, right all six thresholds',()=>{
 const left=between('<main class="ipad-left">','<section class="ipad-center"');
 const center=between('<section class="ipad-center"','<aside class="ipad-right"');
 const right=between('<aside class="ipad-right"','</aside>');
 for(const id of ['mic-source-value','status-label','mic-control','heading','description','warning-details','sound-type','score'])
   assert.ok(left.includes('id="'+id+'"'),id+' is in left operations');
 for(const id of ['rolling-current-value','rolling-waveform','rolling-events','debug-panel','debug-model','debug-mic','debug-inference','debug-time','debug-updated','debug-top','debug-target'])
   assert.ok(center.includes('id="'+id+'"'),id+' is in center live/research data');
 for(const id of ['sensitivity-panel','sensitivity-heading','sensitivity-note','sensitivity-scale','threshold-reset'])
   assert.ok(right.includes('id="'+id+'"'),id+' is in right threshold settings');
 for(let i=0;i<6;i++){
   assert.ok(right.includes('id="threshold-input-'+i+'"'),'slider '+i);
   assert.ok(right.includes('id="threshold-label-'+i+'"'),'localized label '+i);
   assert.ok(right.includes('id="threshold-value-'+i+'"'),'current threshold value '+i);
 }
 assert.ok(!center.includes('id="sensitivity-panel"'),'six sliders are no longer mixed with raw Debug output');
 assert.ok(!right.includes('id="debug-top"'),'no duplicated AI top score table on right');
 assert.ok(center.indexOf('id="rolling-waveform"')<center.indexOf('class="debug-status"'));
});

test('landscape grid shows left / middle / right and preserves mobile, Safari short viewport fallback',()=>{
 assert.match(css,/@media \(orientation:landscape\) and \(min-width:820px\) and \(min-height:500px\)/);
 assert.match(css,/grid-template-columns:minmax\(185px,23%\) minmax\(290px,1fr\) minmax\(245px,29%\)/);
 assert.match(css,/body\.ipad-test \.ipad-left\{/);
 assert.match(css,/body\.ipad-test \.ipad-center\{/);
 assert.match(css,/body\.ipad-test \.ipad-right\{/);
 assert.match(css,/grid-column:1;/);
 assert.match(css,/grid-column:2;/);
 assert.match(css,/grid-column:3;/);
 assert.match(css,/body\.ipad-test \.ipad-center \.debug-section\{/);
 assert.match(css,/overflow-y:auto;overflow-x:hidden/,'detailed AI results remain independently scrollable');
 assert.match(css,/body\.ipad-test \.ipad-right\{/);
 assert.match(css,/body\.ipad-test\[data-debug=off\]/);
 assert.match(css,/@media \(orientation:portrait\),\(max-width:819px\),\(max-height:499px\)/);
 assert.match(css,/@media \(orientation:landscape\) and \(min-width:820px\) and \(min-height:500px\) and \(max-height:630px\)/);
 assert.match(css,/grid-template-rows:46px minmax\(530px,1fr\)/);
 assert.doesNotMatch(css,/#(?:debug-target|debug-top|threshold-input-[0-5])\{display:none/,'all real values and sliders accessible');
});

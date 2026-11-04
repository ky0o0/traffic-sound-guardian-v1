// V3 iPad dashboard: same real microphone / YAMNet pipeline, three readable columns.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
const main = read('./index.html'), ipad = read('./ipad-test.html'), css = read('./ipad-test.css');
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const between = (a,b) => ipad.slice(ipad.indexOf(a),ipad.indexOf(b,ipad.indexOf(a)));

test('iPad V3 preserves all original IDs and exact real AI/audio scripts',()=>{
 for(const id of ['mic-control','language-select','alert-tone-toggle','alert-volume-select','alert-preview-button','mic-select','rolling-waveform'])assert.ok(ids(main).includes(id)&&ids(ipad).includes(id),id);
 assert.ok(ids(main).includes('standard-threshold'));
 assert.ok(!ids(ipad).includes('standard-threshold')&&!ids(ipad).includes('overall-sensitivity'));
 for(const markup of [main,ipad])assert.equal(new Set(ids(markup)).size,ids(markup).length);
 for(const id of ['debug-panel','debug-toggle','threshold-input-0'])assert.ok(!ids(main).includes(id)&&ids(ipad).includes(id));
 for(const file of ['app.js?v=1.7.5','live-timeline.js?v=1.7.5','theme.js?v=1.7.5']){assert.ok(main.includes(file));assert.ok(ipad.includes(file));}
 assert.ok(!ipad.includes('id="settings-panel"'));assert.match(main,/id="settings-panel"/);
 assert.doesNotMatch(ipad,/getUserMedia\(|AudioContext\(|MediaRecorder\(/);

});

test('left control, center live chart plus BOTH detailed classification tables, right all six thresholds',()=>{
 const left=between('<main class="ipad-left">','<section class="ipad-center"');
 const center=between('<section class="ipad-center"','<aside class="ipad-right"');
 const right=between('<aside class="ipad-right"','</aside>');
 for(const id of ['mic-source-value','status-label','mic-control','heading','description','warning-details','sound-type','score'])
   assert.ok(left.includes('id="'+id+'"'),id+' is in left operations');
 for(const id of ['rolling-current-value','rolling-waveform','rolling-events','debug-panel','debug-model','debug-mic','debug-inference','debug-time','debug-updated','debug-top','debug-target'])
   assert.ok(center.includes('id="'+id+'"'),id+' is in center live/research data');
 for(const id of ['sensitivity-panel','sensitivity-heading','sensitivity-note','threshold-reset'])
   assert.ok(right.includes('id="'+id+'"'),id+' is in right threshold settings');
 for(let i=0;i<6;i++){
   assert.ok(right.includes('id="threshold-input-'+i+'"'),'slider '+i);
   assert.ok(right.includes('id="threshold-label-'+i+'"'),'localized label '+i);
   assert.ok(right.includes('id="threshold-value-'+i+'"'),'current threshold value '+i);
 }
 assert.ok(!center.includes('id="sensitivity-panel"'),'six sliders are no longer mixed with raw Debug output');
 assert.ok(!right.includes('id="threshold-effective-0"'));
 assert.ok(!right.includes('id="debug-top"'),'no duplicated AI top score table on right');
 assert.ok(center.indexOf('id="rolling-waveform"')<center.indexOf('class="debug-status"'));
});

test('landscape grid shows left / middle / right and preserves mobile, Safari short viewport fallback',()=>{
 assert.match(css,/@media \(orientation:landscape\) and \(min-width:820px\) and \(min-height:500px\)/);
 assert.match(css,/grid-template-columns:minmax\(230px,25%\) minmax\(290px,1fr\) minmax\(245px,27%\)/);
 for(const n of [1,2,3])assert.ok(css.includes('grid-column:'+n+';'));
 assert.match(css,/overflow-y:auto;overflow-x:hidden/);
 assert.match(css,/@media \(orientation:portrait\),\(max-width:819px\),\(max-height:499px\)/);
 assert.doesNotMatch(css,/#(?:debug-target|debug-top|threshold-input-[0-9]+)\{display:none/);

});

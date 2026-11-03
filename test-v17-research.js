import test from 'node:test';
import assert from 'node:assert/strict';
import {ResearchSession} from './research.js';
const data=(i,extra={})=>({at:1700000000000+i*500,monotonicMs:100+i*500,inferenceMs:i,topCategory:{categoryName:'Speech',score:.123456789},scores:{Bell:.2},thresholds:{Bell:.1},...extra});
test('research records only while running, retains last 100 and counts new warning events',()=>{
 const r=new ResearchSession(['Bell']);r.observe(data(0));assert.equal(r.total,0);
 r.start(1700000000000,100);
 for(let i=0;i<200;i++)r.observe(data(i,{warning:i%10===0?'Bell':null}));
 assert.equal(r.total,200);assert.equal(r.records.length,100);assert.equal(r.counts.Bell,20);assert.equal(r.records.filter(x=>x.kind==='warning').length,9);
 r.stop(100100);r.observe(data(201));assert.equal(r.total,200);assert.equal(r.elapsed(900000),100000);
 r.start(1800000000000,500);assert.equal(r.total,0);assert.equal(r.records.length,0);assert.equal(r.counts.Bell,0);
});
test('real last-20 timing mean and result frequency remain distinct; unavailable metrics are null',()=>{
 const r=new ResearchSession(['Bell']);assert.equal(r.hz,null);assert.equal(r.meanMs,null);assert.equal(r.elapsed(100),null);
 r.start(1700000000000,100);r.observe(data(0,{inferenceMs:null,topCategory:null}));assert.equal(r.meanMs,null);assert.equal(r.hz,null);assert.equal(r.lastValidAt,null);
 for(let i=1;i<=25;i++)r.observe(data(i));assert.equal(r.meanMs,15.5);assert.equal(r.hz,2);
 assert.equal(r.lastValidAt,data(25).at);assert.equal(r.last.inputSampleRate,null);assert.equal(r.last.contextSampleRate,null);
});
test('CSV preserves raw scores, thresholds and timings, handles quotes and neutralizes formulas',()=>{
 const r=new ResearchSession(['Bell']);r.start(1700000000000,100);r.observe(data(1,{warning:'Bell',microphone:{label:'=SUM(1,2)"\ninput',basis:'track-label'}}));
 const csv=r.csv();assert.ok(csv.startsWith('\uFEFF"time_iso"'));assert.match(csv,/"raw_score"/);assert.match(csv,/"model_inference_ms"/);assert.match(csv,/"score:Bell","effective_threshold:Bell"/);assert.match(csv,/0.123456789/);assert.ok(csv.includes("'=SUM(1,2)\"\"\ninput"));
 assert.equal(r.records.length,2);assert.equal(r.records[1].kind,'warning');assert.equal(r.records[1].score,.2);
});
test('research whitelists metadata and does not retain audio or microphone device identifiers',()=>{
 const r=new ResearchSession(['Bell']);r.start(1700000000000,100);r.observe(data(1,{pcm:new Float32Array(100),samples:[1],microphone:{label:'Input',basis:'track-label',deviceId:'private-id'}}));
 const saved=JSON.stringify(r);assert.doesNotMatch(saved,/pcm|samples|private-id|deviceId/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { toModelAudio } from './resample.js';
const sine=(rate,hz)=>Float32Array.from({length:Math.floor(rate*.975)},(_,i)=>.5*Math.sin(2*Math.PI*hz*i/rate));
const rms=x=>Math.sqrt(x.slice(150,-150).reduce((s,v)=>s+v*v,0)/(x.length-300));
for(const rate of [8000,16000,44100,48000,96000]) {
 test(`${rate} -> 16000 Hz: exact 15,600 samples and DC amplitude preserved`,()=>{
  const samples=toModelAudio(new Float32Array(Math.floor(rate*.975)).fill(.25),rate);
  assert.equal(samples.length,15600);
  assert.ok(samples.every(x=>Math.abs(x-.25)<1e-5));
 });
}
test('1 kHz stays 1 kHz after conversion, not pitched down',()=>{
 const output=toModelAudio(sine(48000,1000),48000);
 let crossings=0;
 for(let i=1;i<output.length;i++)if(output[i-1]<0 && output[i]>=0)crossings++;
 assert.ok(Math.abs(crossings-975)<=1);
 assert.ok(Math.abs(rms(output)-.5/Math.sqrt(2))<.003);
});
test('12 kHz above target Nyquist is attenuated, not aliased to 4 kHz',()=>{
 assert.ok(rms(toModelAudio(sine(48000,12000),48000))<.001);
});
test('wrong input duration is rejected instead of inventing a sample rate',()=>{
 assert.throws(()=>toModelAudio(new Float32Array(48000),16000));
});

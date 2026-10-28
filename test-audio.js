import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioWindowBuffer } from './audio-window.js';
for (const rate of [16000,44100,48000]) {
 test(`${rate} Hz: chunk boundaries preserve every overlapping sample`,()=>{
  const frames=[]; const buffer=new AudioWindowBuffer(rate,x=>frames.push(x));
  const audio=Float32Array.from({length:rate*3},(_,i)=>i);
  let pos=0;
  for (const chunk of [1,127,256,4096,16384,13,257,1000000]) {
   const end=Math.min(pos+chunk,audio.length);
   buffer.push([audio.subarray(pos,end)]);pos=end;
  }
  assert.equal(frames.length,Math.floor((audio.length-buffer.size)/buffer.hop)+1);
  frames.forEach((frame,i)=>{
   assert.equal(frame.sequence,i+1);
   assert.equal(frame.endSample,buffer.size+i*buffer.hop);
   assert.deepEqual(frame.samples,audio.slice(i*buffer.hop,i*buffer.hop+buffer.size));
  });
 });
}
test('stereo input is averaged to mono without amplitude doubling',()=>{
 let result; const buffer=new AudioWindowBuffer(16000,x=>result=x);
 buffer.push([new Float32Array(15600).fill(.8),new Float32Array(15600).fill(-.2)]);
 assert.ok(Math.abs(result.samples[100]-.3)<1e-6);
});
test('silence is actual zero PCM, with no invented activity or score',()=>{
 let result; const buffer=new AudioWindowBuffer(16000,x=>result=x);
 buffer.push([new Float32Array(15600)]);
 assert.equal(result.samples.some(x=>x!==0),false);
});
test('10 minutes of frame assembly retains a constant-size ring buffer',()=>{
 let count=0; const buffer=new AudioWindowBuffer(48000,()=>count++);
 const input=new Float32Array(4800);
 for(let i=0;i<6000;i++) buffer.push([input]);
 assert.equal(buffer.ring.length,46800);
 assert.equal(count,Math.floor((48000*600-46800)/23040)+1);
});

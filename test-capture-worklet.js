import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {AudioWindowBuffer} from './audio-window.js';
const source=fs.readFileSync(new URL('./capture-worklet.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
for (const rate of [16000,44100,48000,96000]) {
 test(`worklet ${rate}Hz timestamps match exact window end within render quantum`,()=>{
  let Capture;const messages=[];
  class Processor {constructor(){this.port={postMessage(x){messages.push(x);}};}}
  const scope=vm.createContext({AudioWorkletProcessor:Processor,AudioWindowBuffer,sampleRate:rate,currentTime:0,
   registerProcessor(name,ctor){Capture=ctor;}});
  vm.runInContext(source,scope);const capture=new Capture();
  for(let first=0;first<rate*3;first+=128){
   scope.currentTime=first/rate;
   capture.process([[new Float32Array(128)]],[[new Float32Array(128)]]);
   capture.port.onmessage();
  }
  assert.equal(messages.length,5);
  for(const frame of messages)assert.ok(Math.abs(frame.endTime-frame.endSample/rate)<1e-12);
  assert.equal(messages[0].samples.length,Math.floor(rate*.975));
  assert.equal(messages[1].endSample-messages[0].endSample,Math.round(rate*.480));
 });
}

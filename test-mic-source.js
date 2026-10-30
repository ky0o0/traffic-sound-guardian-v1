import test from 'node:test';
import assert from 'node:assert/strict';
import { microphoneSourceEvidence } from './mic-source.js';
const track=(label,deviceId)=>({label,getSettings(){return deviceId?{deviceId}:{};}});
test('audioinput track label classification is conservative',()=>{
 assert.equal(microphoneSourceEvidence(track('AirPods Pro Microphone')).kind,'headset');
 assert.equal(microphoneSourceEvidence(track('Sony WH-1000XM6 Headset')).kind,'headset');
 assert.equal(microphoneSourceEvidence(track('iPhone Microphone')).kind,'built-in');
 assert.equal(microphoneSourceEvidence(track('Built-in Microphone')).kind,'built-in');
 assert.equal(microphoneSourceEvidence(track('Internal Mic')).kind,'built-in');
 for(const label of ['Microphone','Default','', 'External microphone','AirPods Speaker', 'iPhone']) {
   const kind=microphoneSourceEvidence(track(label)).kind;
   if(label==='AirPods Speaker') assert.equal(kind,'headset', 'named device suggests earbuds, still browser-reported');
   else assert.equal(kind,'unknown',label);
 }
});
test('identifies headset from matching audioinput deviceId only when track is generic',()=>{
 const reported=[
 {kind:'audiooutput',deviceId:'headset-out',label:'AirPods Pro'},
 {kind:'audioinput',deviceId:'headset-in',label:'AirPods Pro Microphone'}
 ];
 const x=microphoneSourceEvidence(track('Microphone','headset-in'),reported);
 assert.deepEqual(x,{kind:'headset',label:'AirPods Pro Microphone',basis:'device-list',hasReportedDeviceId:true});
 assert.equal(microphoneSourceEvidence(track('Microphone','headset-out'),reported).kind,'unknown',
   'a Bluetooth audio output is not evidence of microphone input');
 assert.equal(microphoneSourceEvidence(track('Built-in Microphone','headset-in'),reported).kind,'built-in',
   'explicit track label takes precedence over device-list fallback');
});
test('browser restrictions and errors never cause invented classification',()=>{
 for(const t of [null,undefined,{label:'',getSettings(){throw Error('privacy');}},track('')]){
   const x=microphoneSourceEvidence(t,[{kind:'audioinput',label:'AirPods Pro'}]);
   assert.equal(x.kind,'unknown');
   assert.equal(x.label,'');
 }
 assert.equal(microphoneSourceEvidence(track('Generic USB Input')).kind,'unknown');
});

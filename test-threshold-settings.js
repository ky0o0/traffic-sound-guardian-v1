import test from 'node:test';
import assert from 'node:assert/strict';
import { createThresholdSettings, thresholdsForMode, THRESHOLD_STORAGE_KEY, STANDARD_THRESHOLD_STORAGE_KEY } from './threshold-settings.js';
import { WARNING_TARGETS } from './detection.js';
function store(values={}) { const data=new Map(Object.entries(values)),reads=[];return {data,reads,getItem(key){reads.push(key);return data.get(key)??null;},setItem(key,value){data.set(key,value);}}; }
test('independent direct preferences round-trip without reading or applying the old multiplier',()=>{
 const storage=store({'trafficSoundGuardian.overallSensitivity':'1.5'}),settings=createThresholdSettings(()=>storage);
 const perClass=settings.loadTest();perClass.Bell=.23;settings.saveTest(perClass);settings.saveStandard(.07);
 assert.equal(settings.loadTest().Bell,.23);assert.equal(settings.loadStandard(),.07);
 assert.equal(JSON.parse(storage.data.get(THRESHOLD_STORAGE_KEY)).Bell,.23);
 assert.equal(storage.data.get(STANDARD_THRESHOLD_STORAGE_KEY),'0.07');
 assert.ok(!storage.reads.includes('trafficSoundGuardian.overallSensitivity'));
 const standard=thresholdsForMode('standard',perClass,.07);assert.equal(Object.keys(standard).length,11);
 assert.ok(Object.values(standard).every(v=>v===.07));standard.Bell=.5;assert.equal(perClass.Bell,.23);
 assert.equal(thresholdsForMode('test',perClass,.07),perClass);
});
test('legacy six-category and earlier bicycle preferences survive without writing on load',()=>{
 const storage=store({[THRESHOLD_STORAGE_KEY]:JSON.stringify({'Bicycle bell':.03,Siren:.12})});
 const settings=createThresholdSettings(()=>storage),values=settings.loadTest();assert.equal(values['Bicycle bell'],.03);assert.equal(values.Siren,.12);
 for(const name of ['Bell','Chime','Ding','Ping','Doorbell'])assert.equal(values[name],.1);
 assert.equal(storage.data.size,1);
 const legacy=createThresholdSettings(()=>store({'trafficSoundGuardian.bicycleBellThreshold':'.07'}));assert.equal(legacy.loadTest()['Bicycle bell'],.07);
});
test('corrupt or blocked storage falls back to genuine defaults without erasing stored preferences',()=>{
 for(const raw of ['{bad','null','[]',JSON.stringify({Bell:.001,Siren:.51,Chime:'0.2'})]){
  const storage=store({[THRESHOLD_STORAGE_KEY]:raw}),settings=createThresholdSettings(()=>storage);
  assert.ok(Object.values(settings.loadTest()).every(v=>v===.1));assert.equal(storage.data.get(THRESHOLD_STORAGE_KEY),raw);
 }
 const settings=createThresholdSettings(()=>{throw Error('storage blocked')});
 assert.equal(settings.loadStandard(),.1);assert.equal(Object.keys(settings.loadTest()).length,Object.keys(WARNING_TARGETS).length);
 assert.doesNotThrow(()=>{settings.saveStandard(.1);settings.saveTest({});});
});

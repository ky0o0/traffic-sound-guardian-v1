import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TEXT, ZH, translate } from './ai-test-i18n.js';
import { debugCategoryName } from './debug.js';

test('all AI Test Mode labels, help text and errors have simplified Chinese',()=>{
 const keys=Object.keys(TEXT);
 assert.ok(keys.length >= 150);
 assert.deepEqual(Object.keys(ZH).sort(),keys.sort());
 for(const key of keys) {
   assert.ok(ZH[key].trim(),key);
   assert.equal(translate(key,'zh-CN'),ZH[key],key);
   assert.doesNotMatch(translate(key,'zh-CN'),/[\u3040-\u30ff]/,key);
 }
 assert.equal(translate('upload','ja'),'音声と正解ラベル');
 assert.equal(translate('upload','en'),'Audio & Ground Truth');
});
test('AI Test Mode offers one dropdown for Japanese, English and Chinese',()=>{
 const src=fs.readFileSync(new URL('./ai-test.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('./ai-test.html',import.meta.url),'utf8');
 assert.match(src,/\\['zh-CN', '简体中文'\\]/);
 assert.match(src,/const picker = el\\('select'/);
 assert.doesNotMatch(src,/aria-pressed/);
 assert.match(src,/index\\.html\\?v=1\\.5\\.1&lang=/);
 assert.match(src,/sessionStorage/);
 assert.match(html,/ai-test\\.js\\?v=1\\.5\\.1/);
});
test('Chinese model debug names cover all six safety targets',()=>{
 const names=['Bicycle bell','Vehicle horn, car horn, honking','Siren',
 'Police car (siren)','Ambulance (siren)','Fire engine, fire truck (siren)'];
 for(const name of names){
   const label=debugCategoryName({categoryName:name},'zh-CN');
   assert.notEqual(label,name);
   assert.doesNotMatch(label,/[\u3040-\u30ff]/);
 }
 assert.equal(debugCategoryName({categoryName:'Speech'},'zh-CN'),'人声');
 assert.equal(debugCategoryName({categoryName:'Speech'},'ja'),'話し声');
 assert.equal(debugCategoryName({categoryName:'Speech'},'en'),'Speech');
 assert.equal(debugCategoryName({categoryName:'Unknown official class'},'zh-CN'),'Unknown official class');
});

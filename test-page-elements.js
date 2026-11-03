import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindApplicationElements, requireElements, RESEARCH_IDS} from './page-elements.js';
for(const [page,mode] of [['index.html','standard'],['ipad-test.html','test']]){
 test(`${page}: actual DOM satisfies its required capabilities`,()=>{
  const ids=new Set([...fs.readFileSync(new URL(page,import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const document={body:{dataset:{mode}},getElementById:id=>ids.has(id)?{id}:null};
  const ui=bindApplicationElements(document);assert.ok(ui['mic-control']);assert.equal(!!ui['debug-panel'],mode==='test');
  if(mode==='test')assert.doesNotThrow(()=>requireElements(document,RESEARCH_IDS,'Research dashboard'));
  ids.delete('mic-control');assert.throws(()=>bindApplicationElements(document),/missing required DOM element #mic-control/);
 });
}
test('unknown modes fail explicitly before initializing any audio',()=>{
 assert.throws(()=>bindApplicationElements({body:{dataset:{mode:'unknown'}}}),/Unknown realtime page mode/);
});

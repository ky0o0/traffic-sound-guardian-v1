import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {astHash,parseModule} from './scripts/source-invariants.mjs';
const read = name => fs.readFileSync(new URL(name,import.meta.url),'utf8');
const expected=JSON.parse(read('./audit/comprehensive-audit/protected-algorithms.json'));
const coordinator=parseModule(read('./app.js'));
for(const [name,hash] of Object.entries(expected.functions)) {
 test(`protected coordinator function ${name} retains its pre-extraction semantics`,()=>{
  const node=coordinator.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  assert.ok(node,name);assert.equal(astHash(node),hash);
 });
}
for(const [file,hash] of Object.entries(expected.files)) {
 test(`protected module ${file} retains V1.7.3 algorithm and output semantics`,()=>{
  assert.equal(astHash(parseModule(read('./'+file))),hash);
 });
}

// Read-only release integrity: pinned third-party bytes and exact warning labels.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { WARNING_TARGETS } from '../detection.js';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const lock = JSON.parse(read('dependency-lock.json'));
for (const [name, entry] of Object.entries(lock.assets)) {
  const data = read(name);
  assert.equal(data.length, entry.size, name+' size');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256, name+' SHA-256');
}
const labels = read('yamnet_class_map.csv').toString().trim().split(/\r?\n/).slice(1).map(line => {
  const value = line.slice(line.indexOf(',',line.indexOf(',')+1)+1);
  return value.startsWith('"') ? value.slice(1,-1).replaceAll('""','"') : value;
});
assert.equal(labels.length,521);
for(const [name,{index}] of Object.entries(WARNING_TARGETS)) assert.equal(labels[index],name);
for(const page of ['index.html','ipad-test.html']) {
  const html=read(page).toString();
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,page+' duplicate IDs');
  for(const [,path] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[^\"]*)"/g)) assert.ok(fs.existsSync(new URL(path,root)),page+': '+path);
  assert.equal([...html.matchAll(/<script\b/gi)].length,[...html.matchAll(/<\/script>/gi)].length,page+' script tags');
}
console.log(JSON.stringify({pinned_assets:Object.keys(lock.assets).length,yamnet_classes:labels.length,exact_warning_labels:Object.keys(WARNING_TARGETS).length,entrypoints:2}));

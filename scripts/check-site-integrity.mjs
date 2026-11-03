// Check the actual artifact graph, not descriptions in README or old reports.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parseModule } from './source-invariants.mjs';
import { WARNING_TARGETS } from '../detection.js';
import { bindApplicationElements, requireElements, RESEARCH_IDS } from '../page-elements.js';
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const release = JSON.parse(read('package.json')).version;
const lock = JSON.parse(read('dependency-lock.json'));
for (const [name, entry] of Object.entries(lock.assets)) {
  const data = read(name);
  assert.equal(data.length, entry.size, name + ' size');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), entry.sha256, name + ' SHA-256');
}
const labels = read('yamnet_class_map.csv').toString().trim().split(/\r?\n/).slice(1).map(line => {
  const value = line.slice(line.indexOf(',',line.indexOf(',')+1)+1);
  return value.startsWith('"') ? value.slice(1,-1).replaceAll('""','"') : value;
});
assert.equal(labels.length,521);
for (const [name,{index}] of Object.entries(WARNING_TARGETS)) assert.equal(labels[index],name);
const seen = new Set(), edges = [];
function reference(specifier, parent) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return;
  const url = new URL(specifier, new URL(parent,root));
  const path = decodeURIComponent(url.pathname.slice(root.pathname.length));
  assert.ok(url.pathname.startsWith(root.pathname), parent + ': asset escapes site root');
  assert.ok(fs.existsSync(new URL(path,root)), parent + ': missing resource ' + specifier);
  if (url.searchParams.has('v')) assert.equal(url.searchParams.get('v'),release,parent + ': stale cache key ' + specifier);
  edges.push({from:parent,to:path});
  if (/\.(?:m?js)$/.test(path) && !lock.assets[path]) module(path);
}
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(item=>walk(item,visit));
    else if (child && typeof child === 'object') walk(child,visit);
  }
}
function module(path) {
  if (seen.has(path)) return;
  seen.add(path);
  walk(parseModule(read(path).toString()),node=>{
    if (node.type === 'Literal' && typeof node.value === 'string' && /\.(?:m?js|css|html|webmanifest|tflite)(?:[?#]|$)/.test(node.value)) reference(node.value,path);
  });
}
const pages = ['index.html','ipad-test.html','ai-test.html','microphone-test.html'];
for (const page of pages) {
  const html = read(page).toString();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,page + ': duplicate IDs');
  assert.ok(html.includes('V'+release),page + ': release label');
  for (const [,path] of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) reference(path,page);
  assert.equal([...html.matchAll(/<script\b/gi)].length,[...html.matchAll(/<\/script>/gi)].length,page + ': script tags');
  if (page === 'index.html' || page === 'ipad-test.html') {
    const document = {body:{dataset:{mode:page === 'index.html' ? 'standard' : 'test'}},getElementById:id=>ids.includes(id)?{id}:null};
    bindApplicationElements(document);
    if (page === 'ipad-test.html') requireElements(document,RESEARCH_IDS,'Research dashboard');
  }
}
for (const css of new Set(edges.map(x=>x.to).filter(x=>x.endsWith('.css')))) {
  for (const [,path] of read(css).toString().matchAll(/url\(['"]?(\.\.?\/[^'"\)]+)['"]?\)/g)) reference(path,css);
}
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'Traffic Sound Guardian V'+release);
assert.ok(read('README.md').toString().startsWith('# Traffic Sound Guardian V'+release+'\n'));
assert.equal(JSON.parse(read('package-lock.json')).packages[''].version,release);
console.log(JSON.stringify({release,pinned_assets:Object.keys(lock.assets).length,yamnet_classes:labels.length,exact_warning_labels:Object.keys(WARNING_TARGETS).length,entrypoints:pages.length,authored_modules:seen.size,resource_edges:edges.length}));

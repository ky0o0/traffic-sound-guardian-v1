// CI release gate: every PR that changes published site files must increment
// the app version from the target branch. Assets may keep independent cache tags.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const baseSha = process.argv[2];
if (!/^[0-9a-f]{40}$/i.test(baseSha || '')) {
  console.error('Expected a 40-character pull-request base commit SHA');
  process.exit(2);
}
const current = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url),'utf8')).version;
let previous;
try {
  const basePackage = execFileSync('git',['show',baseSha+':package.json'],{encoding:'utf8'});
  previous = JSON.parse(basePackage).version;
} catch (error) {
  console.error('Cannot read package.json at PR base:',error.message);
  process.exit(2);
}
const parts = value => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
};
const a = parts(previous), b = parts(current);
if (!a || !b) {
  console.error('Both versions must be numeric major.minor.patch values');
  process.exit(1);
}
const isNextPatch = b[0]===a[0] && b[1]===a[1] && b[2]===a[2]+1;
const isNextMinor = b[0]===a[0] && b[1]===a[1]+1 && b[2]===0;
const isNextMajor = b[0]===a[0]+1 && b[1]===0 && b[2]===0;
if (!(isNextPatch || isNextMinor || isNextMajor)) {
  console.error('Every published update needs one version increment: '+previous+' -> '+current+'.');
  console.error('Expected the next patch, minor, or major release, not an unchanged/skipped version.');
  process.exit(1);
}
console.log('Version increment verified: '+previous+' -> '+current);

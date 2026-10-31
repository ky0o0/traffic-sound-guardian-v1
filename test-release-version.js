import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const pkg = JSON.parse(read('./package.json'));
const manifest = JSON.parse(read('./manifest.webmanifest'));
const version = pkg.version;
const name = 'Traffic Sound Guardian V' + version;

test('published release version is consistent across package, manifest, both pages and README',()=>{
  assert.match(version, /^\d+\.\d+\.\d+$/, 'semantic release version');
  assert.equal(manifest.name, name);
  for (const filename of ['index.html','ipad-test.html']) {
    const html = read('./'+filename);
    assert.ok(html.includes('V'+version), filename+' displays release version');
    assert.ok(html.includes('manifest.webmanifest?v='+version), filename+' refreshes manifest cache');
    if (filename === 'index.html') {
      assert.ok(html.includes('<title>'+name+'</title>'));
      assert.ok(html.includes('<span class="version">V'+version+'</span>'));
    } else {
      assert.ok(html.includes('iPad Landscape Test (V'+version+')'));
      assert.ok(html.includes('V'+version+' · iPad TEST'));
    }
  }
  assert.ok(read('./README.md').startsWith('# '+name+'\n'));
  // Individual JS/CSS query strings are independent cache identifiers, not app releases.
});

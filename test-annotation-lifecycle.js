import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./annotation-editor.js',import.meta.url),'utf8').replace('export async function','async function');
function harness() {
 const contexts=[],nodes=[];let resolveBytes;
 const node=()=>{const e={children:[],append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=xs;},setAttribute(){},remove(){this.removed=true;}};nodes.push(e);return e;};
 class Context {constructor(){this.state='suspended';contexts.push(this);}close(){this.state='closed';return Promise.resolve();}}
 const scope=vm.createContext({document:{createElement:node},window:{AudioContext:Context},cancelAnimationFrame(){},Promise});
 vm.runInContext(source,scope);
 const file={size:10,arrayBuffer:()=>new Promise(r=>resolveBytes=r)};
 return {scope,contexts,nodes,file,host:node(),resolve:()=>resolveBytes(new ArrayBuffer(10))};
}
test('aborting a pending annotation open immediately closes its audio context and removes its pane',async()=>{
 const h=harness(),controller=new AbortController();h.scope.host=h.host;h.scope.clip={file:h.file};h.scope.options={signal:controller.signal};
 const pending=vm.runInContext('mountAnnotationEditor(host,clip,options)',h.scope);
 assert.equal(h.contexts.length,1);controller.abort();
 assert.equal(h.contexts[0].state,'closed');assert.ok(h.host.children[0].removed);
 h.resolve();await pending;
 assert.equal(h.contexts.length,1,'late read cannot create new preview resources');
});
test('already aborted annotation request allocates no audio context',async()=>{
 const h=harness(),controller=new AbortController();controller.abort();h.scope.host=h.host;h.scope.clip={file:h.file};h.scope.options={signal:controller.signal};
 const editor=await vm.runInContext('mountAnnotationEditor(host,clip,options)',h.scope);
 assert.equal(h.contexts.length,0);editor.close();assert.ok(h.host.children[0].removed);
});

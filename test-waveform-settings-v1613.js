// V1.6.13: visual regressions for warning-only wave strokes and adjacent Settings selectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const file = name => fs.readFileSync(new URL(name,import.meta.url),'utf8');

test('warning intervals recolor waveform strokes only, never shade the full canvas',()=>{
 const src=file('./live-timeline.js');
 assert.doesNotMatch(src,/\.fillRect\(/,'no warning-window background rectangles');
 const events={}, strokes=[],rects=[];
 const ctx={
   setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},
   stroke(){strokes.push(this.strokeStyle);},fillRect(...args){rects.push(args);},fillText(){}
 };
 const canvas={width:0,height:0,clientWidth:340,clientHeight:104,getContext(){return ctx},setAttribute(){}};
 const nodes={
   'rolling-waveform':canvas,'rolling-events':{textContent:''},
   'rolling-heading':{textContent:''},'rolling-note':{textContent:''},
   'rolling-current-label':{textContent:''},'rolling-current-value':{textContent:'',dataset:{}}
 };
 const document={documentElement:{lang:'ja',dataset:{theme:'light'}},getElementById:id=>nodes[id]||null};
 const window={devicePixelRatio:1,addEventListener(name,fn){events[name]=fn;}};
 class Observer{observe(){}}
 vm.runInNewContext(src,{document,window,MutationObserver:Observer,Math,Number,String});
 events['tsg:visual']({detail:{time:9.4,rms:.05}});
 events['tsg:visual']({detail:{time:9.6,rms:.08}});
 events['tsg:visual']({detail:{time:9.8,rms:.07}});
 events['tsg:visual']({detail:{time:10.2,rms:.03}});
 strokes.length=0;
 events['tsg:warning']({detail:{start:9.5,end:10,label:'Bicycle bell'}});
 assert.equal(rects.length,0,'no full-height red or pink rectangles at warning intervals');
 assert.ok(strokes.includes('#c5223b'),'positive waveform strokes turn red in light theme');
 assert.ok(strokes.includes('#6887a0'),'unflagged waveform stays blue-gray');
 strokes.length=0;
 document.documentElement.dataset.theme='dark';
 events['tsg:visual']({detail:{time:10.3,rms:.04}});
 assert.equal(rects.length,0);
 assert.ok(strokes.includes('#ff596b'),'positive waveform turns red in dark theme');
 assert.ok(strokes.includes('#91bad0'),'other sound remains the original dark-theme blue');
 assert.match(nodes['rolling-events'].textContent,/Bicycle bell/);
});

test('main and iPad Settings put appearance next to language, keeping shared theme preference',()=>{
 const theme=file('./theme.js');
 const css=file('./v1.6.css');
 for(const pageName of ['index.html','ipad-test.html']){
   const html=file('./'+pageName);
   assert.match(html,/theme\.js\?v=1\.6\.13/);
   assert.match(html,/href="\.\/v1\.6\.css\?v=1\.6\.13"/);
   assert.match(html,/id="settings-content"/);
   assert.match(html,/<div class="settings-group">\s*<div id="language-switch"/);
 }
 assert.match(css,/\.settings-content \.settings-group\{\s*display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/\.settings-content \.settings-group > \.theme-picker\{/);
 assert.match(css,/\.settings-content \.settings-group \.theme-picker select\{/);
 assert.match(theme,/if \(settingsRow\) settingsRow\.append\(label\)/);
 assert.match(theme,/else if \(standalone\) host\.insertBefore\(label,host\.firstChild\)/);
 assert.match(theme,/trafficSoundGuardian\.theme/);
 const listeners={},saved=[];
 const settingsRow={children:[],append(n){this.children.push(n);n.parentElement=this;}};
 const host={id:'settings-content',children:[],querySelector:q=>q==='.settings-group'?settingsRow:null,append(n){this.children.push(n);n.parentElement=this;}};
 function element(tag){
   return {tagName:tag,children:[],className:'',value:'',id:'',
     append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}},
     addEventListener(type,fn){this[type]=fn;},
     setAttribute(name,value){this[name]=value;},
     querySelector:()=>null,
     get options(){return this.children.filter(n=>n.tagName==='option');}};
 }
 const document={
   readyState:'loading',body:{dataset:{state:'stopped'}},
   documentElement:{lang:'ja',dataset:{},style:{}},
   getElementById:id=>id==='settings-content'?host:
     id==='theme-select'?settingsRow.children.flatMap(x=>x.children).find(x=>x.id===id):null,
   createElement:element,
   querySelector:()=>({setAttribute(){}}),
   addEventListener(type,fn){listeners[type]=fn;}
 };
 const window={matchMedia:()=>({matches:false,addEventListener(){}})};
 const storage={getItem:()=>null,setItem(k,v){saved.push([k,v]);}};
 class Observer{observe(){}}
 vm.runInNewContext(theme,{document,window,localStorage:storage,MutationObserver:Observer});
 listeners.DOMContentLoaded();
 assert.equal(settingsRow.children.length,1,'theme dropdown inserted in the language row');
 assert.equal(host.children.length,0,'no separate theme dropdown at the bottom of Settings');
 const picker=settingsRow.children[0];
 const select=picker.children.find(n=>n.id==='theme-select');
 assert.ok(select,'native theme picker remains accessible');
 assert.equal(picker.children[0].className,'sr-only','theme has an accessible label without adding another line');
 assert.equal(select.options.length,3);
 select.value='dark'; select.change();
 assert.equal(document.documentElement.dataset.theme,'dark');
 assert.deepEqual(saved,[['trafficSoundGuardian.theme','dark']]);
});

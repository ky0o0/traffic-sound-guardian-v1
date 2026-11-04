"""Real Chromium regressions with explicit fault injection; no device/accuracy claims."""
import argparse,json,pathlib,shutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);p.add_argument('--baseline-url');p.add_argument('--output',required=True);a=p.parse_args()
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True);cases=[];errors=[];requests=[]
(out/'results.json').unlink(missing_ok=True)
PROBE=r'''window.audit={workers:[],contexts:[],streams:[],oscillators:[],legacyPoints:0,mode:MODE};
const nativeGet=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(...args){const c=nativeGet.apply(this,args);if(c&&this.id==='waveform'&&!c.wrapped){c.wrapped=true;for(const name of ['moveTo','lineTo']){const fn=c[name].bind(c);c[name]=(...a)=>{audit.legacyPoints++;return fn(...a)}}}return c};
const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);audit.contexts.push(this)}createOscillator(){const o=super.createOscillator(),entry={start:[],stop:[]};audit.oscillators.push(entry);for(const n of ['start','stop']){const fn=o[n].bind(o);o[n]=(...a)=>{entry[n].push(a[0]??null);return fn(...a)}}return o}};
const NW=window.Worker;window.Worker=class extends NW{constructor(...args){super(...args);this.entry={worker:this,results:0,counts:[],sent:[],terminated:false};audit.workers.push(this.entry);this.addEventListener('message',e=>{if(e.data.type==='result'){this.entry.results++;this.entry.counts.push(e.data.categoryCount)}})}postMessage(data,...args){if(audit.mode===data.type+'-throw')throw new DOMException('Injected send failure','DataCloneError');this.entry.sent.push({type:data.type,sequence:data.sequence});if(audit.mode==='hold-classify'&&data.type==='classify')return;return super.postMessage(data,...args)}terminate(){this.entry.terminated=true;super.terminate()}};
const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{if(audit.mode==='denied')throw new DOMException('Injected denial','NotAllowedError');const stream=await gum(...args);audit.streams.push(stream);if(audit.mode==='delay'&&audit.streams.length===1)await new Promise(r=>window.releaseMic=r);return stream};
window.resources=()=>({workers:audit.workers.map(w=>({results:w.results,counts:w.counts,sent:w.sent,terminated:w.terminated})),contexts:audit.contexts.map(c=>c.state),tracks:audit.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),legacyPoints:audit.legacyPoints});'''
with sync_playwright() as pw:
 options={'headless':True,'args':['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}
 exe=shutil.which('chromium') or shutil.which('google-chrome')
 if exe:options['executable_path']=exe
 browser=pw.chromium.launch(**options)
 def open_page(entry,mode='',base=None):
  context=browser.new_context(permissions=['microphone'],viewport={'width':1024,'height':768})
  context.add_init_script(PROBE.replace('MODE',json.dumps(mode)))
  page=context.new_page();page.on('pageerror',lambda e:errors.append({'message':e.message,'stack':e.stack}));page.on('request',lambda r:requests.append({'url':r.url,'method':r.method}))
  page.goto((base or a.base_url).rstrip('/')+'/'+entry+'?lang=en');
  if entry in ['index.html','ipad-test.html']:page.wait_for_function("document.getElementById('heading').textContent==='Detection stopped'")
  else:page.wait_for_function("document.title.includes('V1.7.5')")
  return context,page
 def stopped(page):
  page.wait_for_function("document.body.dataset.state==='stopped'")
  page.wait_for_function("audit.contexts.every(c=>c.state==='closed') && audit.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))")
  r=page.evaluate('resources()');assert all(w['terminated'] for w in r['workers']);return r
 # Compare real work over a fixed wall-clock interval, without inferring battery or latency improvements.
 for label,base in ([('baseline',a.baseline_url)] if a.baseline_url else [])+[('candidate',a.base_url)]:
  for entry in ['index.html','ipad-test.html']:
   context,page=open_page(entry,base=base)
   preview_display=page.locator('.alert-preview').evaluate('(e)=>getComputedStyle(e).display') if entry=='ipad-test.html' else None
   page.locator('#mic-control').click();page.wait_for_function('audit.workers[0]?.results>=2',timeout=60000)
   before=page.evaluate('resources()');page.wait_for_timeout(3000);after=page.evaluate('resources()')
   delta=after['legacyPoints']-before['legacyPoints'];assert all(n==521 for n in after['workers'][0]['counts'])
   if label=='candidate':assert delta==0;assert preview_display in (None,'flex')
   page.locator('#mic-control').click();final=stopped(page)
   cases.append({'case':'real-model-and-hidden-canvas','revision':label,'page':entry,'duration_ms':3000,'hidden_canvas_points':delta,'real_results_during_interval':after['workers'][0]['results']-before['workers'][0]['results'],'category_count':521,'preview_display':preview_display,'cleanup':final})
   context.close()
 for entry in ['index.html','ipad-test.html']:
  for mode in ['init-throw','classify-throw','denied']:
   context,page=open_page(entry,mode);page.locator('#mic-control').click()
   if mode=='classify-throw':page.wait_for_function('audit.workers.length===1')
   r=stopped(page);cases.append({'case':'injected-'+mode,'page':entry,'cleanup':r});context.close()
  context,page=open_page(entry)
  page.locator('#mic-control').click();page.wait_for_function('audit.workers[0]?.results>=1',timeout=60000)
  page.evaluate("audit.workers[0].worker.dispatchEvent(new MessageEvent('messageerror'))")
  r=stopped(page);cases.append({'case':'worker-deserialization-error','page':entry,'cleanup':r});context.close()
  context,page=open_page(entry,'delay');page.locator('#mic-control').click();page.wait_for_function('typeof releaseMic===\'function\'')
  page.locator('#mic-control').click();page.wait_for_function("document.body.dataset.state==='stopped'")
  page.locator('#mic-control').click();page.wait_for_function('audit.workers[1]?.results>=1',timeout=60000)
  page.evaluate('releaseMic()');page.wait_for_function("audit.streams[0].getTracks().every(t=>t.readyState==='ended')")
  assert page.evaluate("audit.streams[1].getTracks().every(t=>t.readyState==='live')")
  page.locator('#mic-control').click();r=stopped(page);cases.append({'case':'late-permission-during-new-session','page':entry,'cleanup':r});context.close()
 for entry in ['index.html','ipad-test.html']:
  for path in ['capture-worklet.js*','yamnet.tflite']:
   context,page=open_page(entry);page.route('**/'+path,lambda route:route.abort())
   page.locator('#mic-control').click()
   if path.startswith('capture'):
    page.wait_for_function('audit.workers[0]?.results>=2',timeout=60000);page.locator('#mic-control').click()
   r=stopped(page);cases.append({'case':'blocked-'+path,'page':entry,'cleanup':r});context.close()
 context,page=open_page('index.html','hold-classify');page.locator('#mic-control').click();page.wait_for_function('audit.workers.length===1')
 r=stopped(page);assert len([x for x in r['workers'][0]['sent'] if x['type']=='classify'])==1
 cases.append({'case':'real-watchdog-timeout','page':'index.html','cleanup':r});context.close()
 context,page=open_page('microphone-test.html');page.locator('#start').click();page.wait_for_function("document.getElementById('status').dataset.status==='listening'")
 page.evaluate("audit.contexts[0].suspend().catch(()=>{})");page.wait_for_function("document.getElementById('status').dataset.status==='otherError'")
 page.wait_for_function("audit.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))")
 cases.append({'case':'diagnostic-audio-interruption','resources':page.evaluate('resources()')});context.close()
 context,page=open_page('ai-test.html');page.evaluate("""async()=>{
 const {mountAnnotationEditor}=await import('./annotation-editor.js?v=1.7.5');const host=document.createElement('div');document.body.append(host);
 const controller=new AbortController();let release;const clip={file:{size:16,arrayBuffer:()=>new Promise(r=>release=r)}};
 const pending=mountAnnotationEditor(host,clip,{signal:controller.signal});controller.abort();release(new ArrayBuffer(16));await pending;
 if(host.childElementCount)throw Error('Aborted editor remained attached');
 }""")
 page.wait_for_function("audit.contexts.length===1 && audit.contexts[0].state==='closed'")
 cases.append({'case':'abort-pending-annotation-open','resources':page.evaluate('resources()')});context.close()
 # Output-only playback uses the real browser audio clock; headless output is not an audibility check.
 context,page=open_page('ipad-test.html');page.locator('#alert-preview-button').click()
 page.wait_for_function('!document.getElementById("alert-preview-button").disabled',timeout=5000)
 r=page.evaluate('resources()');osc=page.evaluate('audit.oscillators');assert len(osc)==2 and not r['workers'] and not r['tracks'];assert all(s=='closed' for s in r['contexts'])
 assert abs(osc[1]['start'][0]-osc[0]['start'][0]-.195)<1e-8
 assert page.locator('#alert-preview-status').inner_text()=='Played'
 cases.append({'case':'real-audio-clock-preview','resources':r,'oscillators':osc});context.close()
 # Actual browser events, keyboard focus and accessibility metadata.
 for entry in ['index.html','ipad-test.html']:
  context,page=open_page(entry)
  if entry=='index.html':
   page.locator('#settings-toggle').click();page.locator('#language-select').focus();page.keyboard.press('Escape')
   assert not page.locator('#settings-panel').evaluate('(e)=>e.open');assert page.locator('#settings-toggle').evaluate('(e)=>e===document.activeElement')
  else:assert page.locator('#settings-panel').count()==0
  for lang in ['ja','en','zh-CN']:
   if entry=='index.html':page.locator('#settings-toggle').click()
   page.locator('#language-select').select_option(lang);page.keyboard.press('Escape')
   assert page.locator('#mic-source-evidence').inner_text();assert page.locator('#mic-source-value').get_attribute('aria-describedby')=='mic-source-evidence'
   if entry=='ipad-test.html':
    for i in range(11):assert page.locator(f'#threshold-input-{i}').bounding_box()['height']>=44
  page.screenshot(path=str(out/(entry+'-zh.png')),full_page=True)
  cases.append({'case':'keyboard-language-slider-targets','page':entry});context.close()
 assert not errors,errors
 assert all(r['method']=='GET' and r['url'].startswith('http://127.0.0.1:') for r in requests),requests
 result={'browser':'Chromium','version':browser.version,'passed':len(cases),'failed':0,'cases':cases,'page_errors':errors,'network':{'requests':len(requests),'nonlocal_requests':0,'non_get_requests':0},'limitations':'Virtual microphone and headless output, no physical Safari/iPhone/iPad/AirPods or recognition accuracy validation. Injected errors are deliberate browser API fault tests.'}
 (out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='cases'},ensure_ascii=False));browser.close()

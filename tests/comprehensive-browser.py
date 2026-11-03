"""Four-entrypoint regression: real YAMNet with virtual/synthetic input, not hardware validation."""
import argparse, array, io, json, math, pathlib, shutil, wave
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);p.add_argument('--output',required=True);a=p.parse_args()
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
base=a.base_url.rstrip('/')+'/';cases=[];errors=[];requests=[];navigation=[]
probe=r'''window.audit={contexts:[],workers:[],streams:[],results:[],denyNext:false};
const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);audit.contexts.push(this)}};
const W=Worker;window.Worker=class extends W{constructor(...a){super(...a);this.entry={terminated:false};audit.workers.push(this.entry);this.addEventListener('message',e=>{if(e.data.type==='result')audit.results.push(e.data)})}terminate(){this.entry.terminated=true;super.terminate()}};
const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...a)=>{if(audit.denyNext){audit.denyNext=false;throw new DOMException('Injected denial','NotAllowedError')}const s=await gum(...a);audit.streams.push(s);return s};
window.resourceState=()=>({contexts:audit.contexts.map(c=>c.state),tracks:audit.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),workers:audit.workers.map(w=>w.terminated)});'''
def stopped(page):
 page.wait_for_function("audit.contexts.every(c=>c.state==='closed')&&audit.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))")
 assert page.evaluate('audit.workers.every(w=>w.terminated)')
def open_page(context,entry,lang='en'):
 page=context.new_page();page.on('pageerror',lambda e:errors.append({'page':entry,'message':e.message,'stack':e.stack}))
 page.on('request',lambda r:requests.append({'method':r.method,'url':r.url}))
 page.on('console',lambda m:navigation.append(json.loads(m.text[len('NAV_CLEANUP:'):])) if m.text.startswith('NAV_CLEANUP:') else None)
 page.goto(base+entry+'?lang='+lang);page.wait_for_function("document.documentElement.lang===new URL(location).searchParams.get('lang')")
 page.wait_for_timeout(100);return page
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 context=browser.new_context(permissions=['microphone'],accept_downloads=True,viewport={'width':1194,'height':834});context.add_init_script(probe)
 try:
  for entry in ['index.html','ipad-test.html']:
   page=open_page(context,entry)
   if entry=='index.html':page.locator('#settings-toggle').click();page.locator('#standard-threshold').fill('0.01');page.locator('#standard-threshold').dispatch_event('input');page.keyboard.press('Escape')
   else:
    for i in range(11):page.locator(f'#threshold-input-{i}').press('Home')
   page.evaluate('audit.denyNext=true');page.locator('#mic-control').click();page.wait_for_function("document.body.dataset.state==='stopped'");stopped(page)
   assert 'not allowed' in page.locator('#description').inner_text()
   page.locator('#mic-control').click();page.wait_for_function('audit.results.length>=3',timeout=60000)
   page.wait_for_function("document.body.dataset.state==='warning'",timeout=15000)
   real=page.evaluate('audit.results.find(r=>Object.values(r.trafficScores).some(s=>s>=.01))');assert real['categoryCount']==521
   assert page.locator('#sound-type').inner_text()
   before=page.locator('#mic-control').bounding_box()
   page.wait_for_function("parseFloat(document.getElementById('visual').style.getPropertyValue('--audio-level'))>0")
   after=page.locator('#mic-control').bounding_box();assert before['width']==after['width'] and before['height']==after['height']
   if entry=='index.html':
    assert page.locator('#mic-control').evaluate('(e)=>getComputedStyle(e).borderTopLeftRadius')=='50%'
    rings=page.locator('#visual').evaluate("e=>['::before','::after'].map(p=>getComputedStyle(e,p).transform)");assert all(r!='none' for r in rings)
    page.locator('#settings-toggle').click();page.locator('#standard-threshold').press('End');page.keyboard.press('Escape')
   else:
    assert page.locator('#mic-control').evaluate('(e)=>getComputedStyle(e).borderTopLeftRadius')=='14px'
    for i in range(11):page.locator(f'#threshold-input-{i}').press('End')
   page.wait_for_function("document.body.dataset.state==='listening'",timeout=15000)
   assert page.locator('.status-dot').evaluate('(e)=>getComputedStyle(e).animationName')=='tsg-status-pulse'
   page.emulate_media(reduced_motion='reduce');assert page.locator('.status-dot').evaluate('(e)=>getComputedStyle(e).animationName')=='none';page.emulate_media(reduced_motion='no-preference')
   for lang in ['ja','en','zh-CN']:
    page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=true)');page.locator('#language-select').select_option(lang);page.locator('#theme-select').select_option('dark' if lang=='en' else 'light');page.keyboard.press('Escape')
   assert page.evaluate('audit.workers.length')==2 # rejected permission session + successful session
   page.screenshot(path=str(out/(entry+'-real-model.png')),full_page=True)
   page.locator('#mic-control').click();stopped(page);page.locator('#mic-control').click();page.wait_for_function('audit.results.length>=5',timeout=60000)
   # Register after application handlers so the snapshot observes real pagehide cleanup.
   page.evaluate("sessionStorage.removeItem('__auditNavigationCleanup');window.addEventListener('pagehide',()=>sessionStorage.setItem('__auditNavigationCleanup',JSON.stringify(resourceState())))")
   target='#version-ipad' if entry=='index.html' else '#version-standard'
   page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=true)');page.locator(target).click();page.wait_for_load_state();page.wait_for_function("document.body.dataset.state==='stopped'")
   assert page.locator('html').get_attribute('lang')=='zh-CN';assert page.evaluate('audit.contexts.length')==0
   navigation.append(page.evaluate("JSON.parse(sessionStorage.getItem('__auditNavigationCleanup'))"))
   assert navigation[-1] and all(x=='closed' for x in navigation[-1]['contexts']) and all(x=='ended' for x in navigation[-1]['tracks']) and all(navigation[-1]['workers']),navigation
   cases.append({'case':'denial-retry-real-warning-clear-reduced-motion-navigation','entry':entry,'real_warning_scores':real['trafficScores'],'cleanup':navigation[-1]});page.close()
  for entry in ['ai-test.html','microphone-test.html']:
   for lang in ['ja','en','zh-CN']:
    page=open_page(context,entry,lang)
    for size in [{'width':1194,'height':834},{'width':390,'height':844}]:
     page.set_viewport_size(size)
     for theme in ['light','dark']:page.locator('#theme-select').select_option(theme);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.evaluate('audit.contexts.length')==0
    cases.append({'case':'auxiliary-language-theme-layout-no-autostart','entry':entry,'language':lang});page.close()
  # Exercise the production offline file UI and actual Worker on explicitly synthetic PCM.
  pcm=array.array('h',(int(8000*math.sin(2*math.pi*740*i/16000)) for i in range(32000)))
  buf=io.BytesIO()
  with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(pcm.tobytes())
  page=open_page(context,'ai-test.html');page.locator('input[type=file]').set_input_files({'name':'synthetic-sine-fixture.wav','mimeType':'audio/wav','buffer':buf.getvalue()})
  page.get_by_role('button',name='Run batch',exact=True).click();page.wait_for_function('audit.results.length>=3&&audit.workers.every(w=>w.terminated)',timeout=60000)
  assert all(n==521 for n in page.evaluate('audit.results.map(r=>r.categoryCount)'));assert page.evaluate('audit.streams.length')==0;stopped(page)
  page.get_by_role('button',name='Charts & Export',exact=True).click()
  with page.expect_download() as download:page.get_by_role('button',name='CSV',exact=True).click()
  download.value.save_as(out/'offline-synthetic-results.csv')
  cases.append({'case':'actual-offline-UI-real-YAMNet-synthetic-PCM-export','windows':page.evaluate('audit.results.length'),'category_count':521});page.close()
  page=open_page(context,'microphone-test.html');page.locator('#start').click();page.wait_for_function("document.getElementById('status').dataset.status==='listening'")
  assert page.evaluate('audit.workers.length')==0;assert page.locator('#sample-rate').inner_text()!='—';page.locator('#stop').click();stopped(page)
  cases.append({'case':'actual-diagnostic-microphone-without-model'});page.close()
  assert not errors,errors
  assert all(r['method']=='GET' and (r['url'].startswith(base) or r['url'].startswith('blob:')) for r in requests),requests
 finally:
  report={'browser':browser.version,'passed':len(cases),'cases':cases,'page_errors':errors,'navigation_cleanup':navigation,'request_count':len(requests),'limits':'Virtual microphone for realtime capture and explicitly synthetic WAV for offline inference. Actual production YAMNet, not simulated model scores. No physical Safari/iPad/AirPods or road-accuracy validation.'}
  (out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True);browser.close()

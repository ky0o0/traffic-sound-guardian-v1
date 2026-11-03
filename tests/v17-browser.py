"""V1.7 integration: real production Worker; virtual microphone, no hardware claims."""
import argparse,csv,io,json,pathlib,shutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);p.add_argument('--output',required=True);a=p.parse_args()
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True);cases=[];errors=[]
PROBE=r'''window.probe={workers:[],contexts:[],streams:[],oscillators:[],research:[]};
const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);probe.contexts.push(this)}createOscillator(){const o=super.createOscillator();probe.oscillators.push(o);return o}};
const W=Worker;window.Worker=class extends W{constructor(...a){super(...a);const e={results:[],terminated:false};probe.workers.push(e);this.addEventListener('message',v=>{if(v.data.type==='result')e.results.push(v.data)})}terminate(){probe.workers.at(-1).terminated=true;super.terminate()}};
const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...a)=>{const s=await gum(...a);probe.streams.push(s);return s};
window.addEventListener('tsg:research',e=>probe.research.push(e.detail));'''
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 c=b.new_context(permissions=['microphone'],viewport={'width':1194,'height':834},accept_downloads=True);c.add_init_script(PROBE)
 def open_page(entry):
  page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.base_url.rstrip('/')+'/'+entry+'?lang=en');page.wait_for_function("document.getElementById('heading').textContent==='Detection stopped'");return page
 standard=open_page('index.html')
 standard.evaluate("localStorage.setItem('trafficSoundGuardian.soundThresholds',JSON.stringify({'Bicycle bell':.03,Siren:.23}));localStorage.removeItem('trafficSoundGuardian.standardThreshold')")
 standard.reload();standard.locator('#settings-toggle').click()
 assert standard.locator('#debug-panel,#debug-toggle,[id^=threshold-input-]').count()==0
 assert standard.locator('#standard-threshold-value').inner_text()=='0.10'
 standard.locator('#standard-threshold').fill('0.05');standard.locator('#standard-threshold').dispatch_event('input')
 assert standard.locator('#standard-threshold-value').inner_text()=='0.05'
 test=open_page('ipad-test.html')
 assert test.locator('#standard-threshold,#overall-sensitivity,#overall-value').count()==0
 assert test.locator('[id^=threshold-input-]').count()==11
 assert test.locator('#threshold-value-0').inner_text()=='0.03'
 assert test.locator('#threshold-value-2').inner_text()=='0.23'
 for i in range(6,11):assert test.locator(f'#threshold-value-{i}').inner_text()=='0.10'
 test.locator('#threshold-input-6').fill('0.2');test.locator('#threshold-input-6').dispatch_event('input')
 assert test.locator('#threshold-value-6').inner_text()=='0.20'
 assert standard.locator('#standard-threshold-value').inner_text()=='0.05'
 test.locator('#threshold-default-6').click();assert test.locator('#threshold-value-6').inner_text()=='0.10'
 standard.locator('#theme-select').select_option('dark');test.wait_for_function("document.documentElement.dataset.theme==='dark'")
 test.locator('#threshold-reset').click()
 assert test.locator('[id^=threshold-value-]').all_text_contents()==['0.10']*11
 assert standard.locator('#standard-threshold-value').inner_text()=='0.05'
 cases.append({'case':'independent-standard-and-test-direct-thresholds-eleven-controls-and-reset','passed':True})
 for page,entry in [(standard,'index.html'),(test,'ipad-test.html')]:
  page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=false)')
  page.locator('#mic-control').click();page.wait_for_function('probe.workers[0]?.results.length>=3',timeout=60000)
  raw=page.evaluate('probe.workers[0].results.at(-1)');assert raw['categoryCount']==521
  assert page.evaluate('probe.contexts.length')==1
  page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=true)')
  before=page.evaluate('({contexts:probe.contexts.length,workers:probe.workers.length,streams:probe.streams.length,oscillators:probe.oscillators.length})')
  page.locator('#alert-preview-button').click();assert page.locator('#alert-preview-status').inner_text()=='Stop detection before previewing.'
  after=page.evaluate('({contexts:probe.contexts.length,workers:probe.workers.length,streams:probe.streams.length,oscillators:probe.oscillators.length})');assert all(before[k]==after[k] for k in ['contexts','workers','streams'])
  if entry=='ipad-test.html':
   data=page.evaluate('probe.research.at(-1)');raw=page.evaluate('probe.workers[0].results.at(-1)')
   assert data['topCategory']==raw['topCategory'];assert data['top5']==raw['debug']['top5'];assert data['scores']==raw['trafficScores']
   assert len(page.locator('#debug-target tr').all())==11
   assert page.locator('#debug-top tr').count()==5
   metrics=page.locator('#research-metrics').inner_text();assert 'Total inferences' in metrics and 'Hz' in metrics
   assert page.locator('#research-log tr').count()>=3
   with page.expect_download() as dl:page.locator('#export-csv').click()
   download=dl.value;download.save_as(out/'real-session.csv')
   records=list(csv.DictReader(io.StringIO((out/'real-session.csv').read_text(encoding='utf-8-sig'))))
   assert len(records)>=3 and len(records)<=100
   assert 'score:Bell' in records[0] and 'effective_threshold:Doorbell' in records[0]
   assert all(r['model_inference_ms'] for r in records if r['kind']=='inference')
   assert all(r['kind'] in ['inference','warning'] for r in records)
   assert any(r['category']==data['topCategory']['categoryName'] for r in records)
   page.screenshot(path=str(out/'test-live-1194-dark.png'),full_page=True)
  else:assert page.evaluate('probe.research.length')==0
  page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=false)');page.locator('#mic-control').click()
  page.wait_for_function("probe.contexts.every(c=>c.state==='closed')&&probe.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))")
  assert page.evaluate('probe.workers.every(w=>w.terminated)')
  # Output-only preview after stopping must not reacquire input or create a Worker.
  page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=true)')
  old=page.evaluate('({workers:probe.workers.length,streams:probe.streams.length,oscillators:probe.oscillators.length})')
  page.locator('#alert-volume-select').select_option('soft');page.locator('#alert-preview-button').click();page.wait_for_function("document.getElementById('alert-preview-status').textContent==='Played'")
  assert page.evaluate('probe.workers.length')==old['workers'];assert page.evaluate('probe.streams.length')==old['streams'];assert page.evaluate('probe.oscillators.length')==old['oscillators']+2
  assert page.evaluate("probe.contexts.every(c=>c.state==='closed')")
  cases.append({'case':'real-521-class-data-preview-isolation-csv-and-cleanup','page':entry,'categoryCount':raw['categoryCount'],'topCategory':raw['topCategory']})
  # Hide during an active preview: no stale audio graph survives.
  page.locator('#alert-preview-button').click();page.evaluate("window.dispatchEvent(new Event('pagehide'))")
  page.wait_for_function("probe.contexts.every(c=>c.state==='closed')")
  cases.append({'case':'preview-pagehide-cleanup','page':entry})
 assert not errors,errors
 result={'browser':b.version,'passed':len(cases),'cases':cases,'errors':errors,'limits':'Real production model on a virtual microphone. No physical Safari, Apple Music, AirPods, accuracy or acoustic latency validation.'}
 (out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));b.close()

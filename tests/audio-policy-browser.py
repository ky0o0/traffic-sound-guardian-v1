import argparse,json,pathlib,shutil
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);p.add_argument('--output',required=True);a=p.parse_args()
from playwright.sync_api import sync_playwright
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
cases=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
 for entry in ['index.html','ipad-test.html']:
  for mode in ['ambient','unsupported','rejected']:
   c=b.new_context(user_agent='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
   c.add_init_script('''window.probe={contexts:[],workers:0,mic:0,types:[]};
const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){probe.types.push(navigator.audioSession?.type??null);super(...a);probe.contexts.push(this)}};
const W=Worker;window.Worker=class extends W{constructor(...a){super(...a);probe.workers++}};
navigator.mediaDevices.getUserMedia=()=>{probe.mic++;throw Error('preview requested microphone')};''')
   if mode=='ambient':c.add_init_script("Object.defineProperty(navigator,'audioSession',{value:{type:'auto'}})")
   if mode=='rejected':c.add_init_script("Object.defineProperty(navigator,'audioSession',{value:{get type(){return 'auto'},set type(v){throw Error('unsupported')}}})")
   page=c.new_page();page.goto(a.base_url.rstrip('/')+'/'+entry+'?lang=en')
   page.locator('#settings-panel').evaluate_all('(nodes)=>nodes.forEach(e=>e.open=true)');page.locator('#alert-preview-button').click()
   if mode=='ambient':page.wait_for_function("document.getElementById('alert-preview-status').textContent==='Played'")
   r=page.evaluate('({contexts:probe.contexts.map(c=>c.state),workers:probe.workers,mic:probe.mic,types:probe.types,session:navigator.audioSession?.type??null,status:document.getElementById("alert-preview-status").textContent})')
   assert r['mic']==r['workers']==0
   if mode=='ambient':assert r['contexts']==['closed'] and r['types']==['ambient'] and r['session']=='auto'
   else:assert r['contexts']==[] and 'blocked' in r['status']
   cases.append({'entry':entry,'mode':mode,**r});c.close()
 b.close()
(out/'results.json').write_text(json.dumps({'passed':len(cases),'cases':cases,'limitation':'Chromium policy injection; no physical Safari or Apple Music'},indent=2))
print('passed',len(cases))

"""R08/R09/R10 browser regressions. Requires Python Playwright and a browser.

Serve the repository, then run:
  python tests/ui-canvas-browser.py --base-url http://127.0.0.1:8000/ --output ../ui-evidence
Use --engine webkit if installed. Screenshots/JSON are written outside the source tree.
Visual fixtures exercise drawing only; live smoke tests run the genuine YAMNet Worker
with Chromium's virtual microphone. Neither is an accuracy or physical-device test.
"""
import argparse
import json
import pathlib
import shutil
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--engine', choices=['chromium','webkit'], default='chromium')
parser.add_argument('--skip-live', action='store_true')
args = parser.parse_args()
out = pathlib.Path(args.output); out.mkdir(parents=True, exist_ok=True)
base = args.base_url.rstrip('/')+'/'
results = []

PROBE = r'''window.uiProbe={paints:0,strokes:[],texts:[],clips:[],fills:0,workers:[],contexts:[],streams:[]};
const nativeGet=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(...a){const c=nativeGet.apply(this,a);if(this.id!=='rolling-waveform'||!c||c.uiWrapped)return c;c.uiWrapped=true;let points=[];
for(const name of ['clearRect','beginPath','moveTo','lineTo','stroke','fillText','rect','fillRect']){const fn=c[name].bind(c);c[name]=(...a)=>{if(name==='clearRect'){uiProbe.paints++;uiProbe.strokes=[];uiProbe.texts=[];uiProbe.clips=[];uiProbe.fills=0}if(name==='beginPath')points=[];if(name==='moveTo'||name==='lineTo')points.push(a);if(name==='stroke')uiProbe.strokes.push({color:c.strokeStyle,points:[...points]});if(name==='rect')uiProbe.clips.push(a);if(name==='fillRect')uiProbe.fills++;if(name==='fillText'){const m=c.measureText(a[0]);uiProbe.texts.push({text:a[0],y:a[2],ascent:m.actualBoundingBoxAscent,color:c.fillStyle})}return fn(...a)}}return c};
const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...a){super(...a);this.entry={terminated:false,results:0,last:null};uiProbe.workers.push(this.entry);this.addEventListener('message',e=>{if(e.data.type==='result'){this.entry.results++;this.entry.last={categoryCount:e.data.categoryCount,inferenceMs:e.data.inferenceMs}}})}terminate(){this.entry.terminated=true;super.terminate()}};
const NativeContext=window.AudioContext;window.AudioContext=class extends NativeContext{constructor(...a){super(...a);uiProbe.contexts.push(this)}};
const gum=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);if(gum)navigator.mediaDevices.getUserMedia=async(...a)=>{const s=await gum(...a);uiProbe.streams.push(s);return s};
window.uiResources=()=>({workers:uiProbe.workers,contexts:uiProbe.contexts.map(c=>c.state),tracks:uiProbe.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),paints:uiProbe.paints});
'''

def settle(page):
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))')

def fixture(page, dense=False):
    page.evaluate('''dense=>{window.dispatchEvent(new Event('tsg:reset'));if(dense){for(let i=0;i<=600;i++)window.dispatchEvent(new CustomEvent('tsg:visual',{detail:{time:i/60,rms:i<180?0:i<360?.001:.5}}));window.dispatchEvent(new CustomEvent('tsg:warning',{detail:{start:7,end:8,label:'Siren'}}))}else{[0,.0001,.001,.05,1,.5].forEach((rms,i)=>window.dispatchEvent(new CustomEvent('tsg:visual',{detail:{time:9+i*.15,rms}})));window.dispatchEvent(new CustomEvent('tsg:warning',{detail:{start:9.4,end:9.7,label:'Siren'}}))}}''',dense)

def check_wave(page):
    data = page.evaluate('''()=>({strokes:uiProbe.strokes,texts:uiProbe.texts,clips:uiProbe.clips,fills:uiProbe.fills,theme:document.documentElement.dataset.theme,height:document.querySelector('#rolling-waveform').clientHeight})''')
    assert data['fills']==0, 'warning background unexpectedly filled'
    assert [t['text'] for t in data['texts']]==['-10s','-5s','Now']
    x,top,w,ph=data['clips'][0]; bottom=top+ph; center=(top+bottom)/2
    assert all(bottom<t['y']-t['ascent'] for t in data['texts']),data
    colors={'light':{'#6887a0','#c5223b'},'dark':{'#91bad0','#ff596b'}}[data['theme']]
    samples=[s for s in data['strokes'] if s['color'] in colors]
    assert {s['color'] for s in samples}==colors
    for s in samples:
        (x,y1),(x2,y2)=s['points']
        assert x==x2 and top-1e-6<=y1<=y2<=bottom+1e-6
        assert abs((y1+y2)/2-center)<1e-6
    return data

with sync_playwright() as p:
    launch={'headless':True}
    if args.engine=='chromium':
        path=shutil.which('chromium') or shutil.which('google-chrome')
        if path: launch['executable_path']=path
        launch['args']=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']
    browser=getattr(p,args.engine).launch(**launch)
    context=browser.new_context(device_scale_factor=2,permissions=['microphone'] if args.engine=='chromium' else [],has_touch=True)
    context.add_init_script(PROBE)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda e:errors.append(e.text) if e.type=='error' and 'ResizeObserver' in e.text else None)
    views=[(1194,834),(1024,768),(1366,1024),(820,500),(390,844),(320,568),(834,1194),(507,768)]
    for entry in ['index.html','ipad-test.html']:
        for width,height in views:
            page.set_viewport_size({'width':width,'height':height})
            for lang in ['ja','en','zh-CN']:
                page.goto(base+entry+'?lang='+lang);settle(page)
                fixture(page)
                for theme in ['light','dark']:
                    page.locator('#settings-panel').evaluate('(e)=>e.open=true')
                    page.locator('#theme-select').select_option(theme);settle(page)
                    wave=check_wave(page)
                    box=page.locator('#settings-content').bounding_box()
                    assert box['x']>=0 and box['x']+box['width']<=width+.5,(entry,width,lang,box)
                    assert box['y']>=0 and box['y']+box['height']<=height+.5,(entry,height,lang,box)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(entry,width,lang)
                    if entry=='ipad-test.html' and width>=820 and width>height and height>=500:
                        boxes=[page.locator('.ipad-'+name).bounding_box() for name in ['left','center','right']]
                        assert boxes[0]['x']+boxes[0]['width']<=boxes[1]['x']+.5
                        assert boxes[1]['x']+boxes[1]['width']<=boxes[2]['x']+.5
                    # Each language/theme keeps all settings controls reachable in the popover.
                    for selector in ['#language-select','#theme-select','#alert-tone-toggle','#version-standard','#version-ipad']:
                        node=page.locator(selector);node.scroll_into_view_if_needed()
                        assert node.evaluate('(e)=>{let r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'),selector
                    page.locator('#settings-content').evaluate('(e)=>e.scrollTop=0')
                    if lang=='zh-CN' and (width,height) in [(1194,834),(1024,768),(390,844),(320,568)]:
                        page.screenshot(path=str(out/f'{entry}-{width}x{height}-{theme}-settings.png'),full_page=True)
                        page.locator('#settings-panel').evaluate('(e)=>e.open=false')
                        fixture(page,True)
                        page.screenshot(path=str(out/f'{entry}-{width}x{height}-{theme}-wave.png'),full_page=True)
                        fixture(page)
                    else: page.locator('#settings-panel').evaluate('(e)=>e.open=false')
                    button=page.locator('#threshold-reset').bounding_box()
                    if entry=='ipad-test.html':
                        assert button['width']>=140 and button['height']<=66,(width,lang,button)
                    for i in range(6):
                        slider=page.locator(f'#threshold-input-{i}')
                        slider.press('End');assert page.locator(f'#threshold-value-{i}').inner_text()=='0.50'
                    page.locator('#threshold-reset').tap()
                    assert page.locator('[id^=threshold-value-]').all_text_contents()==['0.10']*6
                    # Return to the top without changing microphone/session state.
                    page.evaluate('scrollTo(0,0)')
                    assert not page.evaluate('uiProbe.workers.length || uiProbe.contexts.length || uiProbe.streams.length')
                    results.append({'kind':'layout','page':entry,'viewport':[width,height],'language':lang,'theme':theme,'settings':box,'reset':button})
        # Explicit idle resize, orientation and system-theme changes on both entrypoints.
        page.set_viewport_size({'width':1194,'height':834});page.goto(base+entry+'?lang=en');settle(page)
        for h in [65,84,104,150,260]:
            page.locator('#rolling-waveform').evaluate('(e,h)=>e.style.height=h+"px"',h)
            fixture(page);settle(page);check_wave(page)
            canvas=page.locator('#rolling-waveform').evaluate('(e)=>({w:e.width,h:e.height,cw:e.clientWidth,ch:e.clientHeight})')
            assert canvas['h']==2*canvas['ch'] and canvas['w']==2*canvas['cw']
            results.append({'kind':'height','page':entry,'height':h})
        page.locator('#settings-panel').evaluate('(e)=>e.open=true');page.locator('#theme-select').select_option('system')
        for color in ['light','dark','light']:
            page.emulate_media(color_scheme=color);settle(page)
            assert page.locator('html').get_attribute('data-theme')==color
            check_wave(page)
        page.locator('#settings-panel').evaluate('(e)=>e.open=false')
        page.set_viewport_size({'width':834,'height':1194});settle(page)
        page.set_viewport_size({'width':1024,'height':768});settle(page)
        if entry=='ipad-test.html':
            page.locator('#rolling-waveform').evaluate('(e)=>e.style.height=""')
            page.locator('#debug-toggle').uncheck();settle(page)
            canvas=page.locator('#rolling-waveform').evaluate('(e)=>({h:e.height,ch:e.clientHeight})')
            assert canvas['h']==2*canvas['ch']
            page.locator('#debug-toggle').check();settle(page)
        page.evaluate('window.dispatchEvent(new Event("tsg:reset"))');settle(page)
        paints=page.evaluate('uiProbe.paints');page.wait_for_timeout(200)
        assert page.evaluate('uiProbe.paints')==paints,'idle canvas has a persistent animation loop'
        assert not page.evaluate('uiProbe.workers.length || uiProbe.contexts.length || uiProbe.streams.length')
        results.append({'kind':'idle-resize-system-theme','page':entry})
        if args.engine=='chromium' and not args.skip_live:
            page.goto(base+entry+'?lang=en');settle(page)
            for cycle in range(3):
                page.locator('#mic-control').click()
                page.wait_for_function('(i)=>uiProbe.workers[i]?.results>=2',arg=cycle,timeout=60000)
                assert page.evaluate('(i)=>uiProbe.workers[i].last.categoryCount',cycle)==521
                page.locator('#settings-panel').evaluate('(e)=>e.open=true')
                page.locator('#theme-select').select_option('dark' if cycle%2==0 else 'light');settle(page)
                page.set_viewport_size({'width':1194 if cycle%2==0 else 1024,'height':834 if cycle%2==0 else 768});settle(page)
                assert page.evaluate('uiProbe.workers.length')==cycle+1
                page.locator('#settings-panel').evaluate('(e)=>e.open=false')
                page.locator('#mic-control').click();settle(page)
                a=page.evaluate('uiResources()');page.wait_for_timeout(250);z=page.evaluate('uiResources()')
                assert all(w['terminated'] for w in z['workers'])
                assert all(s=='closed' for s in z['contexts']) and all(s=='ended' for s in z['tracks'])
                assert a==z,'stopped resources or canvas kept updating'
                results.append({'kind':'real-model-start-stop','page':entry,'cycle':cycle+1,'resources':z})
    assert errors==[],errors
    report={'browser':args.engine,'version':browser.version,'passed':len(results),'failed':0,'cases':results,'errors':errors,
        'limits':'Chromium microphone uses virtual input; drawing fixtures are not accuracy data. No physical iPad Safari validation.'}
    (out/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},ensure_ascii=False),flush=True)
    context.close();browser.close()

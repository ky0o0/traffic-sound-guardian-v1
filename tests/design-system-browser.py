"""Presentation regression matrix; no physical-device or acoustic accuracy claims."""
import argparse, json, pathlib, shutil
from playwright.sync_api import sync_playwright
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
out = pathlib.Path(args.output); out.mkdir(parents=True, exist_ok=True)
results, errors = [], []
entries = ['index.html', 'ipad-test.html', 'ai-test.html', 'microphone-test.html']
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    context = browser.new_context()
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(error.message))
    for entry in entries:
        for width, height in [(1440, 900), (1194, 834), (1024, 768), (820, 500), (390, 844), (320, 568)]:
            page.set_viewport_size({'width': width, 'height': height})
            for lang in ['en', 'ja', 'zh-CN']:
                page.goto(args.base_url.rstrip('/') + '/' + entry + '?lang=' + lang)
                page.wait_for_function('document.documentElement.lang === ' + json.dumps(lang))
                page.locator('.site-navigation a').first.wait_for()
                for theme in ['dark', 'light']:
                    if entry == 'index.html': page.locator('#settings-panel').evaluate('(e) => e.open = true')
                    page.locator('#theme-select').select_option(theme)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (entry, width, lang, theme, 'overflow')
                    links = page.locator('.site-navigation a')
                    assert links.count() == 4
                    assert page.locator('.site-navigation [aria-current=page]').count() == 1
                    assert all(('lang=' + lang) in href for href in links.evaluate_all('(nodes) => nodes.map(e=>e.href)'))
                    if entry == 'index.html':
                        bounds = page.locator('.settings-content').bounding_box()
                        assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= height + 1, (entry, width, height, bounds)
                        page.keyboard.press('Escape')
                    if entry == 'ipad-test.html':
                        assert page.locator('[id^=threshold-input-]').count() == 11
                        if width >= 820 and width > height and height >= 500:
                            header = page.locator('.brand').bounding_box()
                            panels = [page.locator('.ipad-' + name).bounding_box() for name in ['left','center','right']]
                            assert header['y'] + header['height'] <= panels[0]['y'] + 1, (width, lang, 'header collision', header, panels[0])
                            assert all(box['y'] + box['height'] <= height + 1 for box in panels)
                            assert panels[0]['x'] + panels[0]['width'] <= panels[1]['x'] + 1
                            assert panels[1]['x'] + panels[1]['width'] <= panels[2]['x'] + 1
                    colors = page.evaluate('''() => {const style=getComputedStyle(document.body);return {background:style.backgroundColor, text:style.color}}''')
                    assert colors['background'] == ('rgb(20, 22, 23)' if theme == 'dark' else 'rgb(244, 246, 245)'), colors
                    results.append({'entry':entry,'width':width,'height':height,'language':lang,'theme':theme})
                    if width in [1194, 390] and lang == 'en':
                        page.screenshot(path=str(out / f'{entry}-{width}-{theme}.png'), full_page=True)
    # Keyboard navigation and live translation on the new shared navigation.
    page.goto(args.base_url.rstrip('/') + '/index.html?lang=en')
    page.locator('#settings-toggle').click()
    page.locator('#language-select').select_option('ja')
    page.keyboard.press('Escape')
    page.locator('.site-navigation a[href*="ipad-test"]').click()
    assert page.locator('html').get_attribute('lang') == 'ja'
    page.locator('.site-navigation a[href*="ai-test"]').click()
    page.locator('#language-select').select_option('zh-CN')
    page.locator('.site-navigation a[href*="microphone-test"]').click()
    assert page.locator('html').get_attribute('lang') == 'zh-CN'
    page.set_viewport_size({'width':390,'height':844})
    page.goto(args.base_url.rstrip('/') + '/ipad-test.html?lang=zh-CN')
    page.locator('.panel-navigation a[href="#workspace-right"]').click()
    page.wait_for_timeout(100)
    bounds = page.locator('#workspace-right').bounding_box()
    assert 60 <= bounds['y'] < 120, bounds
    assert page.locator('.panel-navigation').is_visible()
    # New cross-page navigation must release a real model session, not only update URLs.
    live = browser.new_context(permissions=['microphone'], viewport={'width':1194,'height':834})
    live.add_init_script("""window.resources={contexts:[],streams:[],workers:[]};
const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);resources.contexts.push(this)}};
const W=Worker;window.Worker=class extends W{constructor(...a){super(...a);this.probe={terminated:false,results:0};resources.workers.push(this.probe);this.addEventListener('message',e=>{if(e.data.type==='result')this.probe.results++})}terminate(){this.probe.terminated=true;super.terminate()}};
const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...a)=>{const stream=await gum(...a);resources.streams.push(stream);return stream};""")
    for entry in ['index.html', 'ipad-test.html']:
        capture = live.new_page()
        capture.goto(args.base_url.rstrip('/') + '/' + entry + '?lang=en')
        capture.locator('#mic-control').click()
        capture.wait_for_function('resources.workers.some(w=>w.results>0)', timeout=60000)
        capture.evaluate("window.addEventListener('pagehide',()=>sessionStorage.setItem('navigationCleanup',JSON.stringify({contexts:resources.contexts.map(c=>c.state),tracks:resources.streams.flatMap(s=>s.getTracks().map(t=>t.readyState)),workers:resources.workers.map(w=>w.terminated)})))")
        capture.locator('.site-navigation a[href*="ai-test"]').click()
        capture.wait_for_url('**/ai-test.html?lang=en')
        state = capture.evaluate("JSON.parse(sessionStorage.getItem('navigationCleanup'))")
        assert all(value=='closed' for value in state['contexts']), state
        assert all(value=='ended' for value in state['tracks']), state
        assert all(state['workers']), state
        capture.close()
    live.close()
    assert not errors, errors
    report = {'passed_layout_cases':len(results),'live_navigation_cleanup_cases':2,'cases':results,'page_errors':errors,'limits':'Chromium viewport emulation. Physical iPad/Safari, headset routing and road accuracy require manual acceptance.'}
    (out/'results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'passed_layout_cases':len(results),'page_errors':errors}))
    browser.close()

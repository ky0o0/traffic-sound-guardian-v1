import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const root=new URL('./.working/',import.meta.url);
const m=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
if(m.success<3)throw Error('Fewer than 3 audio clips');
const browser=await chromium.launch({headless:true,
  ...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage();
  page.setDefaultTimeout(120000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
  page.on('console',c=>{if(c.type()==='error' &&
    !c.text().includes('Created TensorFlow Lite XNNPACK delegate for CPU'))
    errors.push(c.text())});
  await page.goto('http://127.0.0.1:8765/research/yamnet/japan/field/harness.html');
  const result=await page.evaluate(async sources=>{
    const {ModelClient,windowsOf}=await import('/ai-test-runner.js');
    const {NAMES}=await import('/ai-test-analysis.js');
    const classifier=new ModelClient(),ctx=new AudioContext({sampleRate:44100});
    const rows=[];
    try{
      await classifier.init();
      for(const [i,source] of sources.entries()){
        const resp=await fetch('/research/yamnet/japan/field/.working/'+source.file_local);
        if(!resp.ok)throw Error('Clip fetch failed '+source.id);
        const decoded=await ctx.decodeAudioData(await resp.arrayBuffer());
        const windows=[];
        for(const f of windowsOf(decoded)){
          const r=await classifier.classify(f,decoded.sampleRate);
          if(NAMES.some(n=>!Number.isFinite(r.scores[n])))throw Error('Incomplete scores: '+source.id);
          windows.push({start:f.start,end:f.end,scores:r.scores,
                        inferenceMs:r.inferenceMs,roundTripMs:r.roundTripMs});
        }
        rows.push({id:source.id,label:source.label,tier:source.tier,
                   durationSeconds:decoded.duration,
                   sampleRate:decoded.sampleRate,
                   windows});
        console.log('COMPLETE '+(i+1)+'/'+sources.length+' '+source.id);
      }
    }finally{classifier.close();await ctx.close()}
    return {rows,browser:navigator.userAgent,names:NAMES};
  },m.clips);
  const final={...result,manifest:m,tool:'TSG v1.6 actual MediaPipe YAMNet in Chromium',
    warning:'Siren-subtype scores are uncalibrated; municipality demos and synthesized controls are NOT independent field captures.',
    errors};
  await fs.writeFile(new URL('raw-results.json',root),JSON.stringify(final,null,2)+'\n');
  if(errors.length)throw Error(errors.join('; '));
  console.log('JAPAN_SIRENS_DONE',result.rows.length,'recordings',
    result.rows.reduce((s,x)=>s+x.windows.length,0),'windows');
}finally{await browser.close()}

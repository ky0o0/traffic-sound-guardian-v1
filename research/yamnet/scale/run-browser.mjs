/* Run the website's actual classifier-worker.js via ai-test-runner.js in Chromium.
   Inputs must have been downloaded from verifiable real-world public recordings.
   DO NOT infer sound-onset latency from offline 5s clip classification. */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const ROOT = new URL('./', import.meta.url);
const work = new URL('.working/', ROOT);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',work),'utf8'));
if(manifest.state!=='downloaded_research_candidates_unreviewed'||manifest.clips.length<250)throw Error('Requires at least 250 real correctly downloaded candidate recordings');
for(const clip of manifest.clips){
  const bytes=await fs.readFile(new URL(clip.file_local,work));
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==clip.sha256)throw Error('Downloaded source SHA changed: '+clip.id);
}
const browser=await chromium.launch({headless:true,
  ...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
let page;
try{
  page=await browser.newPage();
  page.setDefaultTimeout(180000);
  const issues=[];
  page.on('pageerror',e=>issues.push('page error: '+e.message));
  page.on('response',r=>{if(r.status()>=400)issues.push('HTTP '+r.status()+' '+r.url())});
  // MediaPipe logs TensorFlow Lite's normal XNNPACK initialization through
  // console.error even when all inferences succeed. Do not treat that as a failure.
  page.on('console',m=>{if(m.type()==='error' && !m.text().includes('Created TensorFlow Lite XNNPACK delegate for CPU'))
    issues.push('console: '+m.text())});
  await page.goto('http://127.0.0.1:8765/research/yamnet/scale/harness.html',{waitUntil:'load'});
  const results=await page.evaluate(async clips=>{
    const {ModelClient,windowsOf}=await import('/ai-test-runner.js');
    const {NAMES,CONFIG}=await import('/ai-test-analysis.js');
    const client=new ModelClient();
    const ctx=new AudioContext({sampleRate:44100});
    const outputs=[];
    try{
      await client.init();
      for(let i=0;i<clips.length;i++){
        const c=clips[i];
        const url='/research/yamnet/scale/.working/'+c.file_local;
        const resp=await fetch(url,{cache:'no-store'});
        if(!resp.ok)throw Error('Audio fetch HTTP '+resp.status+' '+c.id);
        const bytes=await resp.arrayBuffer();
        const original=await ctx.decodeAudioData(bytes);
        const minFrames=Math.ceil(original.sampleRate*.975);
        // Short sound events must be tested too. For sub-window originals, pad
        // with DIGITAL ZERO ONLY (not a generated test sound). Document this
        // separately because it changes context around the real recording.
        let audio=original,paddedSeconds=0;
        if(original.length<minFrames){
          audio=ctx.createBuffer(original.numberOfChannels,minFrames,original.sampleRate);
          for(let ch=0;ch<original.numberOfChannels;ch++)
            audio.copyToChannel(original.getChannelData(ch),ch);
          paddedSeconds=(minFrames-original.length)/original.sampleRate;
        }
        const windows=[];
        for(const frame of windowsOf(audio)){
          const r=await client.classify(frame,audio.sampleRate);
          if(Object.keys(r.scores).length!==6||NAMES.some(n=>!Number.isFinite(r.scores[n])))
            throw Error('Missing actual YAMNet scores for '+c.id);
          windows.push({start:frame.start,end:frame.end,
                        scores:r.scores, inferenceMs:r.inferenceMs,
                        roundTripMs:r.roundTripMs});
        }
        outputs.push({id:c.id,filename:c.filename,labels:c.label==='none'?['none']:[c.label],
                      sourceGroup:c.group_id,status:'done',events:[],complete:false,
                      duration:original.duration, paddedSilenceSeconds:paddedSeconds,
                      result:{sampleRate:audio.sampleRate,channels:audio.numberOfChannels,
                              windows,coveredUntil:windows.at(-1).end,
                              tailSeconds:Math.max(0,original.duration-windows.at(-1).end)}});
        console.log('TESTED '+(i+1)+'/'+clips.length+' '+c.id+' windows='+windows.length);
      }
    } finally {client.close();await ctx.close()}
    return {clips:outputs,config:CONFIG,browser:navigator.userAgent,
            architecture:'Actual TSG V1.6 ai-test-runner.js + classifier-worker.js + yamnet.tflite + original resample.js (no Python classifier)'};
  },manifest.clips);
  const run={...results,provenance:{ESC50_commit:manifest.ESC50_pin,
    ESC50_metadata_sha256:manifest.ESC50_metadata_sha256,
    selected_before_classification:true,
    human_listening_audit:false,
    onset_times_audited:false,
    all_files_sha256:manifest.clips.map(({id,sha256,size_bytes,source_url,license,original_category,group_id,attribution,background_noise_human_audited})=>({id,sha256,size_bytes,source_url,license,original_category,group_id,attribution,background_noise_human_audited}))},
    pageIssues:issues,ranAt:new Date().toISOString()};
  await fs.writeFile(new URL('raw-results.json',work),JSON.stringify(run,null,2)+'\n');
  if(issues.length)throw Error('Real asset/page runtime failures: '+issues.join('; '));
  console.log('ACTUAL_BROWSER_CLASSIFIER_SUCCESS',results.clips.length,'clips',
              results.clips.reduce((s,c)=>s+c.result.windows.length,0),'windows');
}finally{await browser.close()}

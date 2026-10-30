#!/usr/bin/env python3
"""Fresh-worker checks, ONE bounded pretrained rerun, and permanent compact evidence."""
import argparse,csv,hashlib,json,shutil,sys,time,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from data import write_json,pcm_hash
from model_io import load_model,label_tensor
from streaming import run_stream
from study import event_results,quality,stream_run
sys.path.insert(0,str(HERE.parent/'round2'));from experiment import sha256

def verify_wavs(root):
    rows=json.loads((root/'wav_manifest.json').read_text());count=0
    for m in rows:
        p=root/m['path'];assert sha256(p)==m['sha256'];x,sr=sf.read(p,dtype='float32',always_2d=True);assert sr==44100 and x.shape[1]==2 and np.isfinite(x).all();assert pcm_hash(x)==m['pcm_sha256'];count+=1
    return count

def state_hash(model):
    h=hashlib.sha256()
    for name,tensor in model.state_dict().items():h.update(name.encode());h.update(tensor.detach().cpu().numpy().tobytes())
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--full',type=Path,required=True);p.add_argument('--pilot',type=Path,required=True);p.add_argument('--semantic-repo',type=Path,required=True);p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rerun-output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    cfg=json.loads((a.full/'config.json').read_text());assert cfg==json.loads((HERE/'config.json').read_text());assert json.loads((a.pilot/'gate.json').read_text())['passed']
    counts=dict(full=verify_wavs(a.full),pilot=verify_wavs(a.pilot));rows=json.loads((a.full/'results.json').read_text());plans=json.loads((a.full/'inputs/streams.json').read_text());assert len(rows)==25 and all(r['status']=='processed' for r in rows)
    frozen={s['id']:s for s in json.loads((HERE/'frozen_inputs.json').read_text())['streams']};metric_diffs=[];pre_reset_diffs=[]
    for plan in plans:
        f=a.full/'inputs/streams'/plan['id'];x=sf.read(f/'input.wav',dtype='float32',always_2d=True)[0];ref=sf.read(f/'reference.wav',dtype='float32',always_2d=True)[0];noise=sf.read(f/'noise.wav',dtype='float32',always_2d=True)[0];mask0=np.load(f/'event_active_mask.npy');assert pcm_hash(x)==frozen[plan['id']]['input_pcm_sha256'];np.testing.assert_allclose(x,ref+noise,atol=1e-7,rtol=0)
        matched=plan['events'][0]['end_sample']+4410
        for e in plan['events']:
            if e['same_background_phase_as_first']:np.testing.assert_array_equal(x[e['start_sample']:e['start_sample']+matched],x[:matched])
        for policy in cfg['policies']+['whole_offline']:
            r=next(r for r in rows if r.get('stream_id')==plan['id'] and r['policy']==policy)
            path=a.full/'runs'/plan['id']/('whole_offline.wav' if policy=='whole_offline' else policy+'/output.wav');y=sf.read(path,dtype='float32',always_2d=True)[0];assert y.shape==x.shape
            if policy!='whole_offline':
                trace=json.loads((path.parent/'block_trace.json').read_text());assert len(trace)==cfg['long_stream_blocks'];assert trace[0]['start_sample']==0 and trace[-1]['end_sample']==len(x)
                for index,t in enumerate(trace):
                    assert t['index']==index and t['start_sample']==index*416 and t['end_sample']==(index+1)*416
                    assert t['raw_input_start_sample']==t['start_sample']-32 and t['raw_input_end_sample']==t['mathematical_required_sample']
                    if not t['eof']:assert t['mathematical_required_sample']<=t['input_received_sample'] and t['eof_zero_padding_samples']==0
                    if t['actual_available_seconds'] is not None:assert False,'Non-paced traces must not report measured wall-clock response'
            recomputed=event_results(plan,ref,x,y,noise,mask0,None,cfg)
            for e,w in zip(recomputed,r['events']):
                for key in ['si_sdri_db','output_snr_db','active_input_snr_db']:
                    d=abs(e['metrics'][key]-w['metrics'][key]);metric_diffs.append(d);assert d<1e-8
        carry=sf.read(a.full/'runs'/plan['id']/'carry/output.wav',dtype='float32',always_2d=True)[0];reset=sf.read(a.full/'runs'/plan['id']/'scheduled_reset/output.wav',dtype='float32',always_2d=True)[0];cut=cfg['scheduled_reset_block']*416;diff=float(np.max(np.abs(carry[:cut]-reset[:cut])));pre_reset_diffs.append(diff);assert diff<5e-5
    # Independent fresh-worker replay: one original continuous input and 3180 stateful steps.
    model,load_info=load_model(a.semantic_repo,a.checkpoint);before=state_hash(model);sid='bsb_0260_bsb_0124';plan=next(p for p in plans if p['id']==sid);f=a.full/'inputs/streams'/sid;x=sf.read(f/'input.wav',dtype='float32',always_2d=True)[0];ref=sf.read(f/'reference.wav',dtype='float32',always_2d=True)[0];noise=sf.read(f/'noise.wav',dtype='float32',always_2d=True)[0];mask0=np.load(f/'event_active_mask.npy');a.rerun_output.mkdir(parents=True,exist_ok=True)
    y,info,perf=stream_run(model,label_tensor('car_horn'),x,a.rerun_output,packet=32);original=sf.read(a.full/'runs'/sid/'carry/output.wav',dtype='float32',always_2d=True)[0];diff=float(np.max(np.abs(y-original)));assert diff<5e-5;after=state_hash(model);assert before==after
    events=event_results(plan,ref,x,y,noise,mask0,info,cfg);prior=next(r for r in rows if r.get('stream_id')==sid and r['policy']=='carry');rerun_metric_diff=max(abs(e['metrics']['si_sdri_db']-o['metrics']['si_sdri_db']) for e,o in zip(events,prior['events']));assert rerun_metric_diff<.05
    write_json(a.rerun_output/'results.json',dict(stream_id=sid,events=events,timing=perf,load_info=load_info,pretrained_forward_calls=len(info['traces']),model_state_before_sha256=before,model_state_after_sha256=after))
    for mode,root in [('full',a.full),('pilot',a.pilot)]:
        out=a.output/mode;out.mkdir(exist_ok=True)
        for filename in ['config.json','source_inventory.json','environment.json','results.json','run_summary.json','wav_manifest.json','gate.json','execution.log']:
            if (root/filename).exists():shutil.copyfile(root/filename,out/filename)
        if (root/'inputs/source_inventory.json').exists():shutil.copyfile(root/'inputs/source_inventory.json',out/'source_inventory.json')
    shutil.copytree(a.full/'analysis',a.output/'analysis',dirs_exist_ok=True);shutil.copyfile(a.rerun_output/'results.json',a.output/'independent_replay.json')
    verification=dict(pilot_wavs_checked=counts['pilot'],full_wavs_checked=counts['full'],full_quality_runs=25,metric_values_recomputed=len(metric_diffs),max_recomputed_metric_difference_db=max(metric_diffs),before_scheduled_reset_max_sample_difference=max(pre_reset_diffs),independent_rerun_forward_calls=len(info['traces']),independent_output_max_abs_sample_difference=diff,independent_event_si_sdri_max_difference_db=rerun_metric_diff,learned_parameters_and_registered_buffers_unchanged=before==after,model_state_sha256=before,physical_audio_io_measured=False)
    write_json(a.output/'verification.json',verification)
    # All clips keep recorded float amplitude. Same-phase event inputs are identical.
    selected=[]
    with zipfile.ZipFile(a.output/'listening.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
        hornplan=next(p for p in plans if p['id']=='bsb_0260_bsb_0124');base=a.full/'inputs/streams'/hornplan['id'];x=sf.read(base/'input.wav',dtype='float32',always_2d=True)[0];s=sf.read(base/'reference.wav',dtype='float32',always_2d=True)[0]
        def put_wav(name,array):
            import io
            b=io.BytesIO();sf.write(b,array,44100,format='WAV',subtype='FLOAT');z.writestr(name,b.getvalue())
        for name,index,policy in [('cold_first',0,'carry'),('steady_matched',1,'carry'),('forced_reset_same_input',4,'scheduled_reset'),('carry_same_input_at_reset_time',4,'carry')]:
            e=hornplan['events'][index];start=e['start_sample'];end=e['end_sample']+4410;y=sf.read(a.full/'runs'/hornplan['id']/policy/'output.wav',dtype='float32',always_2d=True)[0]
            for filename,arr in [('input',x),('reference',s),('output',y)]:put_wav(name+'/'+filename+'.wav',arr[start:end])
            selected.append(dict(name=name,event=e,policy=policy))
        crit=a.pilot/'inputs/critical';cx=sf.read(crit/'input.wav',dtype='float32',always_2d=True)[0];cs=sf.read(crit/'reference.wav',dtype='float32',always_2d=True)[0]
        for name,path,offset in [('r1_cold',a.pilot/'signals/cold/carry/output.wav',0),('r1_history_carry',a.pilot/'signals/zero_history/carry/output.wav',cfg['history_prime_blocks']*416),('r1_encoder_reset',a.pilot/'signals/zero_history/reset_encoder/output.wav',cfg['history_prime_blocks']*416)]:
            cy=sf.read(path,dtype='float32',always_2d=True)[0][offset:offset+len(cx)]
            for filename,arr in [('input',cx),('reference',cs),('output',cy)]:put_wav(name+'/'+filename+'.wav',arr)
        z.writestr('cases.json',json.dumps(selected,ensure_ascii=False,indent=2));z.writestr('ATTRIBUTION.md','# SH round 3 listening comparisons\n\nNo loudness normalization, clipping, or post-hoc alignment. FLOAT WAV. Timing is model-sample time; computation availability delay is reported separately. Original 0260 horn: DenisChardonnet; rain 0124: Joseph SARDIN; BigSoundBank CC0 https://bigsoundbank.com/licenses.html . Changes: gain-preserving excerpts, additive mixtures, repeated backgrounds/events, official unmodified SH extraction and specified neural-state interventions. Original recording/session independence and genuine binaural capture not established.\n\nThe four short stream examples contain exactly the same local mixture at matched event times. The three r1_* folders contain exactly the same original five-second mixture, with only prior state/context changed. See the report for cold-start failures, algorithmic lookahead and CPU-only playback limitations.\n')
    print(json.dumps(verification),flush=True)
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Bounded real-recording continuous-SH study, preceded by pretrained equivalence gate."""
import argparse,hashlib,json,os,platform,resource,subprocess,sys,time,traceback
from pathlib import Path
import numpy as np
import soundfile as sf
import torch
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from data import prepare,components,write_json,pcm_hash
from model_io import load_model,label_tensor,offline,UPSTREAM
from streaming import run_stream
sys.path.insert(0,str(HERE.parent/'round2'))
from experiment import describe_metrics,inventory,sha256


def read_mem():
    values={}
    for line in Path('/proc/self/status').read_text().splitlines():
        if line.startswith(('VmRSS:','VmHWM:')):k,v=line.split(':',1);values[k+'_kib']=int(v.split()[0])
    return values

def stats(v):
    a=np.asarray(v,dtype='float64')
    if not len(a):return None
    return dict(n=len(a),median=float(np.median(a)),p95=float(np.quantile(a,.95)),p99=float(np.quantile(a,.99)),max=float(a.max()),min=float(a.min()))

def quality(s,x,y,n,mask):
    try:return describe_metrics(s.astype('float64'),x.astype('float64'),y.astype('float64'),n.astype('float64'),mask)
    except ValueError as e:return dict(undefined_reason=str(e))

def summarize_trace(info,samples):
    traces=info['traces'];steady=[t for t in traces if t['start_sample']>=44100 and not t['eof']]
    return dict(blocks=len(traces),neural_forward_calls=len(traces),duration_seconds=samples/44100,
                forward_seconds=stats([t['forward_seconds'] for t in traces]),
                first_block_forward_seconds=traces[0]['forward_seconds'],
                steady_forward_seconds=stats([t['forward_seconds'] for t in steady]),
                step_seconds=stats([t['step_seconds'] for t in traces]),
                cpu_forward_rtf=sum(t['forward_seconds'] for t in traces)/(samples/44100),
                unpaced_adapter_wall_rtf=info['wall_seconds']/(samples/44100) if not info['paced'] else None,
                wall_seconds=info['wall_seconds'],paced=info['paced'],packet_samples=info['packet_samples'],
                blocks_step_exceeds_block_duration=sum(t['step_seconds']>416/44100 for t in traces if not t['eof']),
                modeled_queue_wait_seconds=stats([t['modeled_queue_wait_seconds'] for t in traces]),
                neural_state_bytes=info['neural_state_bytes'],
                packet_lateness_seconds=stats(info['packet_lateness_seconds']))

def event_results(plan,ref,x,y,noise,mask0,info,config):
    rows=[];guard=round(config['event_postguard_seconds']*44100);early=round(config['event_onset_score_seconds']*44100)
    for event in plan['events']:
        start=event['start_sample'];end=event['end_sample'];stop=min(len(x),end+guard)
        mask=np.zeros(stop-start,dtype=bool);mask[:len(mask0)]=mask0
        m=quality(ref[start:stop],x[start:stop],y[start:stop],noise[start:stop],mask)
        early_end=min(start+early,end);early_mask=mask[:early_end-start]
        early_metrics=quality(ref[start:early_end],x[start:early_end],y[start:early_end],noise[start:early_end],early_mask)
        remainder=quality(ref[early_end:stop],x[early_end:stop],y[early_end:stop],noise[early_end:stop],mask[early_end-start:])
        t=next(t for t in info['traces'] if t['start_sample']<=start<t['end_sample']) if info else None
        response=dict(algorithmic_input_wait_ms=(t['mathematical_required_sample']-start)/44100*1000,
                      actual_packet_wait_ms=(t['input_received_sample']-start)/44100*1000,
                      modeled_onset_to_computed_output_ms=(t['modeled_available_seconds']-start/44100)*1000,
                      paced_onset_to_computed_output_ms=(t['actual_available_seconds']-start/44100)*1000 if t['actual_available_seconds'] is not None else None,
                      interpretation='Availability of corresponding computed samples, not detection, audibility or physical headphone delivery') if t else None
        rows.append(dict(event,score_start_sample=start,score_end_sample=stop,metrics=m,onset_first_100ms=early_metrics,later_event_portion=remainder,response=response))
    return rows

def stream_run(model,label,x,folder,*,policy='carry',schedule=None,paced=False,packet=32):
    folder.mkdir(parents=True,exist_ok=True);before=read_mem();cpu0=time.process_time();wall0=time.perf_counter()
    y,info=run_stream(model,label,x,packet_samples=packet,reset_each_block=policy=='reset_each_block',reset_schedule=schedule,paced=paced)
    cpu_seconds=time.process_time()-cpu0;after=read_mem()
    sf.write(folder/'output.wav',y,44100,subtype='FLOAT')
    write_json(folder/'block_trace.json',info['traces']);write_json(folder/'state_resets.json',info['resets'])
    summary=summarize_trace(info,len(x));summary.update(cpu_seconds=cpu_seconds,process_cpu_percent=cpu_seconds/info['wall_seconds']*100,memory_before=before,memory_after=after)
    return y,info,summary

def pilot(root,model,config):
    critical,_=prepare(root/'inputs',config,long=False);x=critical['input'];ref=critical['reference'];noise=critical['noise'];mask=np.load(root/'inputs/critical/active_mask.npy');label=label_tensor('car_horn');pad=config['history_prime_blocks']*416
    rows=[];gate={};offline_outputs={};specs=[('cold',x,0),('zero_history',np.pad(x,((pad,0),(0,0))),pad)]
    calls=0
    for name,a,offset in specs:
        f=root/'signals'/name;f.mkdir(parents=True,exist_ok=True);sf.write(f/'input.wav',a,44100,subtype='FLOAT')
        t0=time.perf_counter();batch=offline(model,label,a);calls+=1;elapsed=time.perf_counter()-t0
        sf.write(f/'offline_output.wav',batch,44100,subtype='FLOAT');offline_outputs[name]=batch
        for policy in ['carry','reset_each_block'] if name=='zero_history' else ['carry']:
            y,info,summary=stream_run(model,label,a,f/policy,packet=config['capture_packet_samples'],policy=policy);calls+=len(info['traces']);cropped=y[offset:offset+len(x)];m=quality(ref,x,cropped,noise,mask);diff=float(np.max(np.abs(y-batch)))
            row=dict(id=name+'_'+policy,kind='pilot',signal=name,policy=policy,has_reference=True,metrics=m,stream_vs_offline_max_abs_sample_difference=diff,timing=summary,score_offset=offset,offline_forward_seconds=elapsed,status='processed');rows.append(row)
            if policy=='carry':
                gate[name+'_stream_equivalence']=diff<5e-5
                gate[name+'_metric_equivalence']=abs(m['si_sdri_db']-quality(ref,x,batch[offset:offset+len(x)],noise,mask)['si_sdri_db'])<1e-3
            print(json.dumps(dict(id=row['id'],si_sdri_db=m['si_sdri_db'],gain_db=float(np.mean(m['projected_gain_db'])),max_sample_difference=diff)),flush=True)
    # Reset individually audited buffer components at the exact end of quiet history.
    a=specs[1][1];offset=pad
    for part in ['encoder','decoder','output','all']:
        names=['encoder','decoder','output'] if part=='all' else [part]
        y,info,summary=stream_run(model,label,a,root/'signals'/'zero_history'/('reset_'+part),schedule={pad:names});calls+=len(info['traces']);m=quality(ref,x,y[offset:offset+len(x)],noise,mask)
        row=dict(id='zero_history_reset_'+part,kind='state_component_intervention',policy='reset_'+part,metrics=m,timing=summary,score_offset=offset,status='processed');rows.append(row);print(json.dumps(dict(id=row['id'],si_sdri_db=m['si_sdri_db'],gain_db=float(np.mean(m['projected_gain_db'])))),flush=True)
    # Verify only the stated future horizon is needed, with actual pretrained weights.
    altered=x.copy();altered[448:]*=-1;future=offline(model,label,altered);calls+=1
    gate['future_after_448_cannot_change_first_416']=bool(np.array_equal(future[:416],offline_outputs['cold'][:416]))
    within=x.copy();within[320:448]*=-1;inner=offline(model,label,within);calls+=1
    gate['within_block_future_change_first128_max_abs_difference']=float(np.max(np.abs(inner[:128]-offline_outputs['cold'][:128])))
    gate['cold_round2_metric_reproduced']=abs(rows[0]['metrics']['si_sdri_db']-(-31.099662634876726))<1e-3
    gate['quiet_history_round2_metric_reproduced']=abs(next(r for r in rows if r['id']=='zero_history_carry')['metrics']['si_sdri_db']-8.75632749678578)<1e-3
    passed=all(v for k,v in gate.items() if k!='within_block_future_change_first128_max_abs_difference')
    write_json(root/'results.json',rows);write_json(root/'gate.json',dict(passed=passed,checks=gate,pretrained_forward_calls=calls,quality_runs=len(rows),no_neural_parameters_modified=True))
    if not passed:raise RuntimeError('Pretrained streaming pilot gate failed; do not scale experiment')
    return rows,calls

def full(root,model,config):
    critical,plans=prepare(root/'inputs',config,long=True);rows=[];calls=0
    for plan in plans:
        folder=root/'inputs/streams'/plan['id'];x=sf.read(folder/'input.wav',dtype='float32',always_2d=True)[0];ref=sf.read(folder/'reference.wav',dtype='float32',always_2d=True)[0];noise=sf.read(folder/'noise.wav',dtype='float32',always_2d=True)[0];mask0=np.load(folder/'event_active_mask.npy');label=label_tensor('siren' if plan['source_id']=='iusb_014' else 'car_horn')
        for policy in config['policies']:
            schedule={config['scheduled_reset_block']*416:['encoder','decoder','output']} if policy=='scheduled_reset' else None
            f=root/'runs'/plan['id']/policy;y,info,summary=stream_run(model,label,x,f,policy=policy,schedule=schedule,packet=config['capture_packet_samples']);calls+=len(info['traces'])
            events=event_results(plan,ref,x,y,noise,mask0,info,config)
            row=dict(id=plan['id']+'_'+policy,stream_id=plan['id'],source_id=plan['source_id'],background_id=plan['background_id'],policy=policy,status='processed',events=events,timing=summary,output_pcm_sha256=pcm_hash(y));rows.append(row);write_json(root/'results.json',rows)
            print(json.dumps(dict(id=row['id'],event_si_sdri_db=[r['metrics'].get('si_sdri_db') for r in events],event_gain_db=[float(np.mean(r['metrics']['projected_gain_db'])) for r in events],rtf=summary['unpaced_adapter_wall_rtf'])),flush=True)
        # A single offline whole-sequence reference, not a sliding-window stream.
        t0=time.perf_counter();batch=offline(model,label,x);calls+=1;elapsed=time.perf_counter()-t0;sf.write(root/'runs'/plan['id']/'whole_offline.wav',batch,44100,subtype='FLOAT')
        carry=sf.read(root/'runs'/plan['id']/'carry/output.wav',dtype='float32',always_2d=True)[0];diff=float(np.max(np.abs(batch-carry)))
        if diff>=5e-5:raise RuntimeError('Long-sequence stream/offline equivalence failed')
        rows.append(dict(id=plan['id']+'_whole_offline',stream_id=plan['id'],source_id=plan['source_id'],background_id=plan['background_id'],policy='whole_offline',status='processed',events=event_results(plan,ref,x,batch,noise,mask0,None,config),offline_forward_seconds=elapsed,stream_max_abs_difference=diff))
        write_json(root/'results.json',rows)
    # Actual wall-clock paced FILE replay, with real background before the exact R1 crop.
    pad=config['paced_noise_prime_blocks']*416;x=np.concatenate((critical['noise'][-pad:],critical['input']));f=root/'paced';f.mkdir(parents=True,exist_ok=True);sf.write(f/'input.wav',x,44100,subtype='FLOAT');label=label_tensor('car_horn')
    y,info,summary=stream_run(model,label,x,f,paced=True,packet=config['capture_packet_samples']);calls+=len(info['traces'])
    ref=critical['reference'];noise=critical['noise'];mask=np.load(root/'inputs/critical/active_mask.npy');m=quality(ref,critical['input'],y[pad:pad+len(ref)],noise,mask);t=next(t for t in info['traces'] if t['start_sample']<=pad<t['end_sample'])
    paced=dict(id='paced_real_noise_then_exact_0260',policy='paced_carry',status='processed',metrics=m,event_onset_sample=pad,event_onset_seconds=pad/44100,actual_onset_to_computed_output_ms=(t['actual_available_seconds']-pad/44100)*1000,modeled_onset_to_computed_output_ms=(t['modeled_available_seconds']-pad/44100)*1000,timing=summary,physical_audio_io=False)
    rows.append(paced);write_json(root/'results.json',rows);print(json.dumps(dict(id=paced['id'],response_ms=paced['actual_onset_to_computed_output_ms'],si_sdri_db=m['si_sdri_db'])),flush=True)
    return rows,calls

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['pilot','full'],required=True);p.add_argument('--semantic-repo',type=Path,required=True);p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=a.output.resolve();root.mkdir(parents=True,exist_ok=True)
    if (root/'results.json').exists():raise FileExistsError('Fresh run directory required')
    cfg=json.loads((HERE/'config.json').read_text());assert subprocess.check_output(['git','-C',str(a.semantic_repo),'rev-parse','HEAD'],text=True).strip()==UPSTREAM
    write_json(root/'config.json',cfg);t0=time.perf_counter();model,loading=load_model(a.semantic_repo,a.checkpoint)
    write_json(root/'environment.json',dict(python=sys.version,platform=platform.platform(),cpu_info=Path('/proc/cpuinfo').read_text().split('\n\n')[0],torch_threads=torch.get_num_threads(),model=loading,source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),upstream=UPSTREAM,package_freeze=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True),input_recipe_sha256=sha256(HERE/'data.py'),adapter_sha256=sha256(HERE/'streaming.py'),model_loader_sha256=sha256(HERE/'model_io.py'),config_sha256=sha256(HERE/'config.json'),runner_sha256=sha256(Path(__file__))))
    try:
        rows,calls=pilot(root,model,cfg) if a.mode=='pilot' else full(root,model,cfg)
        inventory(root);write_json(root/'run_summary.json',dict(mode=a.mode,quality_runs=len(rows),pretrained_forward_calls=calls,processed=len(rows),failed=0,wall_seconds=time.perf_counter()-t0))
    except Exception:
        (root/'failure.log').write_text(traceback.format_exc());raise
if __name__=='__main__':main()

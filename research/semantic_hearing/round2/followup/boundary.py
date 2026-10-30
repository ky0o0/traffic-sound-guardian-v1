#!/usr/bin/env python3
"""Exploratory follow-up after R2 showed a large onset-position effect.

Prefix lengths are exact multiples of the model's 32*13=416-sample decoder block.
The original five-second mixture/stems/gains remain byte-for-byte unchanged after
cropping. Matched suffix controls hold padded inference length fixed.
"""
import argparse,csv,hashlib,json,os,shutil,subprocess,sys,time,traceback
from pathlib import Path
import numpy as np
import soundfile as sf
HERE=Path(__file__).resolve().parent;R2=HERE.parent;sys.path.insert(0,str(R2));from experiment import describe_metrics,inventory,write_json,fetch_verified,sha256,RATE,UPSTREAM,OFFICIAL_CHECKPOINT_SHA256

def main():
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--semantic-repo',type=Path,required=True);p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=a.output;root.mkdir(parents=True,exist_ok=True)
    if (root/'results.json').exists():raise FileExistsError('Fresh output directory required')
    assert subprocess.check_output(['git','-C',str(a.semantic_repo),'rev-parse','HEAD'],text=True).strip()==UPSTREAM
    fetch_verified('https://semantichearing.cs.washington.edu/39.pt',a.checkpoint,OFFICIAL_CHECKPOINT_SHA256)
    baselines=json.loads((a.baseline/'results.json').read_text());plan=[]
    for r in baselines:
        if r['family']=='round1':
            for mode in ['zero_prefix','zero_suffix']:plan.append(dict(baseline=r,mode=mode,padding_samples=160*416))
            if r['nominal_snr_db']==0:plan.append(dict(baseline=r,mode='noise_prefix',padding_samples=160*416))
        if r['family']=='position' and r['background_id'] is None and r['source_id'] in ['bsb_0258','bsb_0260'] and r['position']=='start':
            for blocks in [1,4,16,64,160,212]:plan.append(dict(baseline=r,mode='zero_prefix',padding_samples=blocks*416))
            plan.append(dict(baseline=r,mode='zero_suffix',padding_samples=160*416))
    assert len(plan)==42
    write_json(root/'plan.json',plan);write_json(root/'environment.json',dict(seed=20261030,threads=2,source_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),official_source=UPSTREAM,checkpoint_sha256=sha256(a.checkpoint),runner_sha256=sha256(Path(__file__)),dependency_freeze=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True),exploratory=True,trigger='Large onset-position effect observed in frozen round2 results; follow-up designed afterward'))
    env=os.environ.copy();env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2');rows=[]
    for item in plan:
        b=item['baseline'];mode=item['mode'];pad=item['padding_samples'];cid=f'{b["id"]}_{mode}_{pad}';folder=root/'cases'/cid;folder.mkdir(parents=True,exist_ok=True);original=a.baseline/'cases'/b['id'];t0=time.perf_counter();row=dict(id=cid,source_id=b['source_id'],baseline_id=b['id'],baseline_family=b['family'],background_id=b['background_id'],nominal_snr_db=b['nominal_snr_db'],mode=mode,padding_samples=pad,padding_seconds=pad/RATE,block_samples=416,status='failed',baseline_metrics=b['metrics'])
        try:
            x,sr=sf.read(original/'input.wav',always_2d=True,dtype='float32');ref,_=sf.read(original/'reference.wav',always_2d=True,dtype='float32');noise,_=sf.read(original/'added_noise.wav',always_2d=True,dtype='float32');mask=np.load(original/'active_mask.npy');assert sr==RATE and x.shape==(RATE*5,2)
            prefix=noise[-pad:].copy() if mode=='noise_prefix' else np.zeros((pad,2),dtype='float32')
            padded=np.concatenate([x,prefix]) if mode=='zero_suffix' else np.concatenate([prefix,x]);crop_start=0 if mode=='zero_suffix' else pad
            sf.write(folder/'model_input.wav',padded,RATE,subtype='FLOAT')
            proc=subprocess.run([sys.executable,str(R2/'infer.py'),'--semantic-repo',str(a.semantic_repo),'--checkpoint',str(a.checkpoint),'--input',str(folder/'model_input.wav'),'--output',str(folder/'model_output.wav'),'--target','car_horn','--group-id',b['source_id'],'--manifest',str(folder/'inference.json'),'--input-mode','recorded_stereo_with_explicit_context_padding'],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180);(folder/'process.log').write_text(proc.stdout)
            if proc.returncode:raise RuntimeError('Inference failed: '+str(proc.returncode))
            y,yr=sf.read(folder/'model_output.wav',always_2d=True,dtype='float32');assert yr==RATE and y.shape==padded.shape and np.isfinite(y).all();cropped=y[crop_start:crop_start+len(x)];sf.write(folder/'output.wav',cropped,RATE,subtype='FLOAT')
            for name in ['input.wav','reference.wav','added_noise.wav']:shutil.copyfile(original/name,folder/name)
            np.testing.assert_array_equal(padded[crop_start:crop_start+len(x)],x)
            m=describe_metrics(ref.astype('float64'),x.astype('float64'),cropped.astype('float64'),noise.astype('float64'),mask);row.update(status='processed',metrics=m,inference=json.loads((folder/'inference.json').read_text()),original_crop_pcm_sha256=hashlib.sha256(x.astype('<f4').tobytes()).hexdigest(),model_input_seconds=len(padded)/RATE,crop_start_sample=crop_start,output_si_sdr_delta_from_baseline_db=m['output_si_sdr_mean_db']-b['metrics']['output_si_sdr_mean_db'])
        except Exception as e:row['error']=str(e);(folder/'error.log').write_text(traceback.format_exc())
        row['wall_seconds']=time.perf_counter()-t0;rows.append(row);write_json(root/'results.json',rows);print(json.dumps({k:row[k] for k in ['id','status','wall_seconds']}),flush=True)
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,2,figsize=(12,4.5))
    for sid in ['bsb_0258','bsb_0260']:
        rs=[r for r in rows if r['source_id']==sid and r['baseline_family']=='position' and r['mode']=='zero_prefix' and r['status']=='processed'];rs=sorted(rs,key=lambda r:r['padding_samples']);base=rs[0]['baseline_metrics']
        axes[0].plot([0]+[r['padding_seconds'] for r in rs],[base['output_si_sdr_mean_db']]+[r['metrics']['output_si_sdr_mean_db'] for r in rs],marker='o',label=sid)
        axes[1].plot([0]+[r['padding_seconds'] for r in rs],[float(np.mean(base['projected_gain_db']))]+[float(np.mean(r['metrics']['projected_gain_db'])) for r in rs],marker='o',label=sid)
    axes[0].set_ylabel('Output SI-SDR (dB)');axes[1].set_ylabel('Projected target gain (dB)')
    for ax in axes:ax.set_xlabel('Block-aligned zero prefix (s)');ax.grid(alpha=.25);ax.legend()
    fig.suptitle('Exploratory boundary follow-up: same original target waveform and gain');fig.tight_layout();fig.savefig(root/'boundary.png',dpi=180);fig.savefig(root/'boundary.svg');plt.close(fig)
    inventory(root);write_json(root/'run_summary.json',dict(planned=len(plan),processed=sum(r['status']=='processed' for r in rows),failed=sum(r['status']=='failed' for r in rows),exploratory=True))
    if any(r['status']!='processed' for r in rows):raise SystemExit(1)
if __name__=='__main__':main()

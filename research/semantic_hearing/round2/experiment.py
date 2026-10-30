#!/usr/bin/env python3
"""Round two: paired interventions on recorded audio; official unmodified SH forward."""
import argparse
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
from extract import OFFICIAL_CHECKPOINT_SHA256, sha256
from real_audio import RATE, UPSTREAM, power, db_ratio, si_sdr, reference_metrics, fetch_verified, write_json

SEED=20261030

def active_mask(x, rate=RATE, threshold_db=-35):
    """20-ms RMS frames, >= peak frame RMS -35 dB, dilated one frame each side.

    This is an energy activity proxy, never a semantic or human event annotation.
    """
    x=np.asarray(x); hop=round(.02*rate)
    starts=list(range(0,len(x),hop))
    p=np.array([power(x[i:i+hop]) for i in starts])
    if len(p)==0 or p.max()<=0:raise ValueError('Silent target')
    a=p >= p.max()*10**(threshold_db/10)
    a=np.convolve(a.astype(int),[1,1,1],mode='full')[1:len(a)+1]>0
    return np.repeat(a,hop)[:len(x)]

def place(x,n,onset):
    x=np.asarray(x,dtype='float32')
    if onset<0 or onset+len(x)>n:raise ValueError('Event does not fit window')
    y=np.zeros((n,2),dtype='float32');y[onset:onset+len(x)]=x;return y

def place_mask(m,n,onset):
    out=np.zeros(n,dtype=bool);out[onset:onset+len(m)]=m;return out

def noise_gain_for_active_snr(target,noise,mask,snr):
    if not np.any(mask) or power(noise[mask])<=0:raise ValueError('Silent active noise')
    return math.sqrt(power(target[mask])/(power(noise[mask])*10**(snr/10)))

def describe_metrics(ref,x,y,noise,mask):
    if not np.any(mask):raise ValueError('No active samples')
    m=reference_metrics(ref,x,y)
    m['input_si_sdr_mean_db']=float(np.mean(m['input_si_sdr_db']))
    m['output_si_sdr_mean_db']=float(np.mean(m['output_si_sdr_db']))
    if power(noise)==0:
        m['input_si_sdr_db']=None;m['input_si_sdr_mean_db']=None;m['si_sdri_db']=None
    if power(y)==0:
        m['output_si_sdr_db']=None;m['output_si_sdr_mean_db']=None;m['si_sdri_db']=None
        m['si_sdr_status']='undefined_exactly_silent_output'
    else:m['si_sdr_status']='defined'
    # Same fixed sample alignment as round one. Gain is signed and per channel.
    s=ref-ref.mean(axis=0);o=y-y.mean(axis=0)
    alpha=np.sum(o*s,axis=0)/np.sum(s*s,axis=0)
    residual=o-s*alpha
    m.update(projected_gain_signed=[float(a) for a in alpha],
             projected_gain_db=[float(20*np.log10(max(abs(a),1e-15))) for a in alpha],
             residual_suppression_db=db_ratio(power(noise),power(residual)) if power(noise)>0 else None,
             residual_interpretation='Projection residual contains uncorrelated target distortion and remaining noise; not pure background separation',
             active_output_to_reference_energy_db=db_ratio(power(y[mask]),power(ref[mask])),
             active_output_snr_db=db_ratio(power(ref[mask]),power((y-ref)[mask])),
             active_input_snr_db=db_ratio(power(ref[mask]),power(noise[mask])),
             whole_input_snr_db=db_ratio(power(ref),power(noise)),
             active_input_si_sdr_db=si_sdr(ref[mask],x[mask]) if power(noise)>0 else None,
             active_output_si_sdr_db=si_sdr(ref[mask],y[mask]) if power(y[mask])>0 else None,
             inactive_output_energy_fraction=float(np.sum(y[~mask]**2)/max(np.sum(y**2),1e-30)))
    return m

def load_source(root,source,archive=None):
    path=root/'originals'/source['original_filename']
    if not path.exists() and source.get('archive_member'):
        if archive is None:raise ValueError('Archive reader required')
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(archive.read(source['archive_member']))
    if path.exists() and sha256(path)!=source['sha256']:raise ValueError('Cached source SHA-256 mismatch')
    fetch_verified(source['download_url'],path,source['sha256'])
    info=sf.info(path);x,sr=sf.read(path,always_2d=True,dtype='float32')
    if info.channels != source['channels'] or info.frames!=source['frames'] or sr!=source['rate']:
        raise ValueError('Source format changed: '+source['id'])
    if not np.isfinite(x).all():raise ValueError('Nonfinite source')
    if x.shape[1]==1:
        if source['input_mode']!='explicit_dual_mono_diagnostic':raise ValueError('Mono requires diagnostic opt-in')
        x=np.repeat(x,2,axis=1) # Explicit adapter diagnostic; NEVER genuine stereo/binaural data.
    elif x.shape[1]!=2:raise ValueError('Unsupported source channels')
    elif source['input_mode']=='recorded_stereo' and power(x[:,0]-x[:,1])/power(x)<1e-6:
        raise ValueError('Near-dual-mono cannot enter stereo stratum')
    if sr!=RATE:
        gcd=math.gcd(sr,RATE);x=resample_poly(x,RATE//gcd,sr//gcd,axis=0).astype('float32')
    return x

def segment(x,source):
    start=round(source.get('crop_start_seconds',0)*RATE)
    stop=min(len(x),start+round(source.get('crop_duration_seconds',5)*RATE))
    out=x[start:stop].copy()
    if len(out)==0:raise ValueError('Empty excerpt')
    return out

def make_plan(root,config,clips):
    """Plan is generated and written BEFORE any neural network outputs are observed."""
    n=round(config['window_seconds']*RATE);sources={s['id']:s for s in config['sources']};cases=[]
    bgs=[s for s in config['sources'] if s['role']=='background'];targets=[s for s in config['sources'] if s['role']=='target']
    def save(sid,event,positions,backgrounds,snrs,family,variant='original',snr_mode='active',spatial='original',gain_scale=1.):
        source=sources[sid];event=event*float(source.get('event_peak',.25))/max(np.max(np.abs(clips[sid])),1e-15)
        event=event*gain_scale
        if len(event)>n:raise ValueError('Oversized event')
        mask0=active_mask(event);center=(n-len(event))//2
        for bid in backgrounds:
            noise=np.zeros((n,2),dtype='float32') if bid is None else clips[bid][:n].copy()
            if len(noise)!=n:raise ValueError('Background too short')
            for snr in snrs:
                anchor=place(event,n,center);anchor_mask=place_mask(mask0,n,center)
                if bid is None:ng=0.
                elif snr_mode=='whole':ng=math.sqrt(power(anchor)/(power(noise)*10**(snr/10)))
                else:ng=noise_gain_for_active_snr(anchor,noise,anchor_mask,snr)
                # One common gain across all positions; noise and event gains remain fixed.
                possible=[place(event,n,0 if pos=='start' else center if pos=='middle' else n-len(event))+noise*ng for pos in positions]
                common=min(1.,.8/max(float(np.max(np.abs(z))) for z in possible))
                for pos in positions:
                    onset=0 if pos=='start' else center if pos=='middle' else n-len(event)
                    ref=place(event,n,onset)*common;added=noise*ng*common;mask=place_mask(mask0,n,onset)
                    if spatial=='swap_all':ref=ref[:,::-1].copy();added=added[:,::-1].copy()
                    elif spatial=='collapse_all':
                        ref=np.repeat(ref.mean(axis=1,keepdims=True),2,axis=1);added=np.repeat(added.mean(axis=1,keepdims=True),2,axis=1)
                    elif spatial!='original':raise ValueError(spatial)
                    name=f'{family}_{sid}_{variant}_{bid or "quiet"}_{snr_mode}{snr:+g}_{pos}_{spatial}_gain{gain_scale:g}'
                    folder=root/'cases'/name;folder.mkdir(parents=True,exist_ok=True)
                    x=(ref+added).astype('float32');sf.write(folder/'input.wav',x,RATE,subtype='FLOAT');sf.write(folder/'reference.wav',ref,RATE,subtype='FLOAT');sf.write(folder/'added_noise.wav',added,RATE,subtype='FLOAT')
                    np.save(folder/'active_mask.npy',mask)
                    cases.append(dict(id=name,family=family,source_id=sid,recording_group=source['recording_group'],target=source['target'],background_id=bid,background_type=sources[bid]['background_type'] if bid else 'quiet',variant=variant,position=pos,onset_sample=onset,event_samples=len(event),active_samples=int(mask.sum()),activity_definition='20ms RMS >= peak -35dB with 20ms dilation; energy proxy',duration_seconds=n/RATE,snr_mode=snr_mode,nominal_snr_db=snr if bid else None,noise_gain=ng,common_gain=common,event_gain_scale=gain_scale,spatial=spatial,input_mode=source['input_mode'],reference_kind=source['reference_kind'],has_reference=True))
    # Generalization convenience sample: same middle placement, active-SNR matching.
    for s in targets:
        save(s['id'],clips[s['id']],['middle'],[b['id'] for b in bgs],config.get('primary_snrs_db',config['snrs_db']),'background')
    for sid in config.get('snr_sources',[]):
        save(sid,clips[sid],['middle'],config['snr_backgrounds'],[-5,5],'snr')
    # Pure temporal interventions, including same gain/noise and no added noise.
    for sid in config['position_sources']:
        save(sid,clips[sid],['start','middle','end'],[None]+config['position_backgrounds'],[0],'position')
    # Same-recording nested prefix crops. Cuts include 5ms cosine ramps; no new originals.
    for sid in config['duration_sources']:
        for duration in config['durations_seconds']:
            event=clips[sid][:round(duration*RATE)].copy()
            if len(event)<round(duration*RATE):continue
            fade=min(round(.005*RATE),len(event)//4);ramp=np.sin(np.linspace(0,np.pi/2,fade))**2
            event[:fade]*=ramp[:,None];event[-fade:]*=ramp[::-1,None]
            save(sid,event,['middle'],[None]+config['duration_backgrounds'],[0],'duration',variant=f'prefix{duration:g}s_5msfade')
    # Extend the SAME failed recording by exact repeats. Discontinuities are declared.
    for reps in config['repeat_counts']:
        event=np.tile(clips['bsb_0260'],(reps,1))
        save('bsb_0260',event,['middle'],[None]+config['duration_backgrounds'],[0],'repeat',variant=f'edited_concat{reps}x')
    # Channel ablation changes recorded spatial cues, does not simulate ear geometry.
    for sid in config['spatial_sources']:
        for spatial in ['original','swap_all','collapse_all']:
            save(sid,clips[sid],['middle'],[None,config['position_backgrounds'][0]],[0],'spatial',spatial=spatial)
    # Input level sensitivity, fixed SNR, 3 event levels.
    for sid in config['level_sources']:
        for scale in [.1,.316227766,1.]:
            save(sid,clips[sid],['middle'],[None,config['position_backgrounds'][0]],[0],'level',gain_scale=scale)
    # Reproduce the exact R1 mixing rule, source samples and per-case peak scaling.
    for sid in ['bsb_0258','bsb_0260']:
        from real_audio import mix_at_snr
        for bid in ['bsb_0124','bsb_2717']:
            for snr in config['snrs_db']:
                # Use original source level (undo canonical event scaling by loading clips; no scaling was applied to clips).
                t=place(clips[sid],n,0);noise=clips[bid][:n]
                mix,ref,added,ng,cg=mix_at_snr(t,noise,snr)
                name=f'round1_{sid}_{bid}_snr{snr:+g}';folder=root/'cases'/name;folder.mkdir(parents=True,exist_ok=True)
                for filename,z in [('input',mix),('reference',ref),('added_noise',added)]:sf.write(folder/(filename+'.wav'),z,RATE,subtype='FLOAT')
                mask=place_mask(active_mask(clips[sid]),n,0);np.save(folder/'active_mask.npy',mask)
                cases.append(dict(id=name,family='round1',source_id=sid,recording_group=sources[sid]['recording_group'],target='car_horn',background_id=bid,background_type=sources[bid]['background_type'],variant='original',position='start',onset_sample=0,event_samples=len(clips[sid]),active_samples=int(mask.sum()),duration_seconds=n/RATE,snr_mode='whole',nominal_snr_db=snr,noise_gain=ng,common_gain=cg,event_gain_scale=None,spatial='original',input_mode=sources[sid]['input_mode'],reference_kind=sources[sid]['reference_kind'],has_reference=True))
    for b in bgs:
        x=clips[b['id']][:n];x=x*.25/max(float(np.max(np.abs(x))),1e-15)
        for target in ['car_horn','siren']:
            name='control_'+b['id']+'_'+target;folder=root/'cases'/name;folder.mkdir(parents=True,exist_ok=True);sf.write(folder/'input.wav',x,RATE,subtype='FLOAT')
            cases.append(dict(id=name,family='background_only',source_id=b['id'],background_id=b['id'],background_type=b['background_type'],target=target,duration_seconds=n/RATE,has_reference=False,reference_kind=None))
    if len({c['id'] for c in cases})!=len(cases):raise ValueError('Duplicate case id')
    write_json(root/'plan.json',cases);return cases

def inventory(root):
    rows=[]
    for path in sorted(root.rglob('*.wav')):
        info=sf.info(path);x,sr=sf.read(path,dtype='float32',always_2d=True)
        rows.append(dict(path=str(path.relative_to(root)),sha256=sha256(path),pcm_sha256=hashlib.sha256(x.astype('<f4').tobytes()).hexdigest(),bytes=path.stat().st_size,rate=sr,channels=info.channels,frames=info.frames,subtype=info.subtype,finite=bool(np.isfinite(x).all())))
    write_json(root/'wav_manifest.json',rows)

def main():
    p=argparse.ArgumentParser();p.add_argument('--semantic-repo',type=Path,required=True);p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--config',type=Path,default=HERE/'config.json');p.add_argument('--key-only',action='store_true');p.add_argument('--prepare-only',action='store_true');args=p.parse_args()
    root=args.output.resolve();root.mkdir(parents=True,exist_ok=True)
    if (root/'results.json').exists():raise FileExistsError('Fresh output directory required')
    started=time.perf_counter();config=json.loads(args.config.read_text());np.random.seed(SEED)
    revision=subprocess.check_output(['git','-C',str(args.semantic_repo),'rev-parse','HEAD'],text=True).strip()
    if revision!=UPSTREAM:raise ValueError('Wrong upstream revision')
    write_json(root/'config.json',config);clips={}
    from contextlib import ExitStack
    with ExitStack() as stack:
        archive=None
        if any(s.get('archive_member') and not (root/'originals'/s['original_filename']).exists() for s in config['sources']):
            from remotezip import RemoteZip
            archive=stack.enter_context(RemoteZip(next(s['download_url'] for s in config['sources'] if s.get('archive_member'))))
        for s in config['sources']:
            x=load_source(root,s,archive);clips[s['id']]=segment(x,s)
    diagnostics=[]
    from scipy.signal import correlate,correlation_lags
    for source in config['sources']:
        x=clips[source['id']].astype('float64');l=x[:,0]-x[:,0].mean();r=x[:,1]-x[:,1].mean();cross=correlate(l,r,mode='full',method='fft');lags=correlation_lags(len(l),len(r));keep=np.abs(lags)<=round(.02*RATE);values=cross[keep]/max(np.sqrt(np.sum(l*l)*np.sum(r*r)),1e-30);ix=np.argmax(np.abs(values));frame_power=[power(x[i:i+882]) for i in range(0,len(x),882)]
        diagnostics.append(dict(id=source['id'],excerpt_samples=len(x),excerpt_duration_seconds=len(x)/RATE,original_channels=source['channels'],input_mode=source['input_mode'],excerpt_lr_correlation=float(np.corrcoef(x.T)[0,1]),peak=float(np.max(np.abs(x))),activity_proxy_samples=int(active_mask(x).sum()),best_abs_lr_correlation_within_20ms=float(values[ix]),best_lr_lag_ms=float(lags[keep][ix]/RATE*1000),frame_power_20ms=frame_power,interpretation='Energy/correlation diagnostics only; do not certify content purity, true binaural geometry, or independent sessions'))
    write_json(root/'source_checks.json',diagnostics)
    cases=make_plan(root,config,clips)
    if args.key_only:
        cases=[c for c in cases if c['family']=='round1' or (c['family']=='position' and c['source_id'] in ['bsb_0260','bsb_0258']) or (c['family']=='background' and c['target']=='siren' and c['nominal_snr_db']==0)]
    write_json(root/'executed_plan.json',cases)
    write_json(root/'environment.json',dict(started_utc=datetime.now(timezone.utc).isoformat(),python=sys.version,platform=platform.platform(),cpu_info=Path('/proc/cpuinfo').read_text().split('\n\n')[0],threads=2,seed=SEED,upstream=revision,source_revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),runner_sha256=sha256(Path(__file__)),adapter_sha256=sha256(HERE.parent/'extract.py'),config_sha256=sha256(args.config),packages=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True)))
    if args.prepare_only:inventory(root);return
    fetch_verified('https://semantichearing.cs.washington.edu/39.pt',args.checkpoint,OFFICIAL_CHECKPOINT_SHA256)
    environment=os.environ.copy();environment.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2',PYTHONHASHSEED=str(SEED))
    results=[]
    for c in cases:
        folder=root/'cases'/c['id'];row=dict(c,status='failed');t0=time.perf_counter()
        command=[sys.executable,str(HERE/'infer.py'),'--semantic-repo',str(args.semantic_repo.resolve()),'--checkpoint',str(args.checkpoint.resolve()),'--input',str(folder/'input.wav'),'--output',str(folder/'output.wav'),'--target',c['target'],'--group-id',c['source_id'],'--manifest',str(folder/'inference.json'),'--input-mode',c.get('input_mode','recorded_stereo')]
        try:
            # The legacy adapter only checks two-channel format; source provenance is
            # enforced here. Explicit dual-mono diagnostics are never called binaural.
            proc=subprocess.run(command,env=environment,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180);(folder/'process.log').write_text(proc.stdout)
            if proc.returncode:raise RuntimeError('Official adapter failed: '+str(proc.returncode))
            x,sr=sf.read(folder/'input.wav',always_2d=True);y,yr=sf.read(folder/'output.wav',always_2d=True)
            if x.shape!=y.shape or sr!=RATE or yr!=RATE or not np.isfinite(y).all():raise ValueError('Output contract failure')
            inference=json.loads((folder/'inference.json').read_text());row.update(status='processed',inference=inference,rtf=inference['inference_seconds']/c['duration_seconds'],output_to_input_energy_db=db_ratio(power(y),power(x)))
            if c['has_reference']:
                ref,_=sf.read(folder/'reference.wav',always_2d=True);noise,_=sf.read(folder/'added_noise.wav',always_2d=True);mask=np.load(folder/'active_mask.npy');row['metrics']=describe_metrics(ref,x,y,noise,mask)
            else:row.update(metrics=None,interpretation='No clean target reference. Energy is descriptive; no false-positive rate without listening/annotation.')
        except Exception as e:
            row['error']=str(e);(folder/'error.log').write_text(traceback.format_exc())
        row['wall_seconds']=time.perf_counter()-t0;results.append(row);write_json(root/'results.json',results)
        print(json.dumps({k:row[k] for k in ['id','status','wall_seconds']}) ,flush=True)
    inventory(root)
    summary=dict(planned=len(cases),processed=sum(r['status']=='processed' for r in results),failed=sum(r['status']=='failed' for r in results),wall_seconds=time.perf_counter()-started,checkpoint_sha256=sha256(args.checkpoint))
    write_json(root/'run_summary.json',summary)
    if summary['failed']:raise SystemExit(1)
if __name__=='__main__':main()

"""Reuse the two small, already-committed R2 float-WAV archives. No downloads."""
import hashlib,io,json,sys,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'round2'))
from experiment import active_mask,noise_gain_for_active_snr,power
sys.path.insert(0,str(HERE.parent))
from extract import sha256

def pcm_hash(x):return hashlib.sha256(np.asarray(x,dtype='<f4').tobytes()).hexdigest()
def write_json(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def read_wav(z,name):
    data=z.read(name);x,sr=sf.read(io.BytesIO(data),dtype='float32',always_2d=True)
    if sr!=44100 or x.shape!=(220500,2) or not np.isfinite(x).all():raise ValueError('Invalid archived source '+name)
    return x,hashlib.sha256(data).hexdigest()

def components(config):
    archives={name:(HERE/info['path']).resolve() for name,info in config['archive_inputs'].items()}
    for name,path in archives.items():
        if sha256(path)!=config['archive_inputs'][name]['sha256']:raise ValueError('Prior ZIP hash mismatch')
    targets={};inventory=[]
    manifest={r['path']:r for r in json.loads((HERE.parent/'round2/evidence/full/wav_manifest.json').read_text())}
    with zipfile.ZipFile(archives['main']) as z:
        cases=json.loads(z.read('cases.json'))
        for sid in config['sources']:
            c=next(r for r in cases if r['source_id']==sid and (sid=='iusb_014' or (r['family']=='position' and (r['position']=='start' if sid=='bsb_0260' else True))))
            ref,digest=read_wav(z,c['id']+'/reference.wav')
            assert manifest['cases/'+c['id']+'/reference.wav']['sha256']==digest
            event=ref[c['onset_sample']:c['onset_sample']+c['event_samples']].copy()
            if sid=='iusb_014':
                event=event[:round(config['siren_edit_seconds']*config['rate'])].copy()
                fade=round(config['siren_edit_fade_seconds']*config['rate']);ramp=np.sin(np.linspace(0,np.pi/2,fade))**2;event[:fade]*=ramp[:,None];event[-fade:]*=ramp[::-1,None]
            targets[sid]=event
            inventory.append(dict(id=sid,prior_case=c['id'],source_reference_sha256=digest,event_samples=len(event),event_pcm_sha256=pcm_hash(event),reference_kind=c['reference_kind'],recording_geometry='Ordinary two-channel source, not established binaural',edited=sid=='iusb_014'))
        c=next(r for r in cases if r['source_id']=='iusb_014');mix,mix_hash=read_wav(z,c['id']+'/input.wav');ref,ref_hash=read_wav(z,c['id']+'/reference.wav')
        traffic=(mix.astype('float64')-ref.astype('float64')).astype('float32')
    with zipfile.ZipFile(archives['boundary']) as z:
        mix,mix_hash=read_wav(z,'zero_prefix/input.wav');ref,ref_hash=read_wav(z,'zero_prefix/reference.wav')
        assert manifest['cases/round1_bsb_0260_bsb_0124_snr+0/input.wav']['sha256']==mix_hash
        assert manifest['cases/round1_bsb_0260_bsb_0124_snr+0/reference.wav']['sha256']==ref_hash
        rain=(mix.astype('float64')-ref.astype('float64')).astype('float32')
        critical=dict(input=mix,reference=ref,noise=rain,input_sha256=mix_hash,reference_sha256=ref_hash)
    for sid,noise in [('bsb_0124',rain),('iusb_road_00',traffic)]:inventory.append(dict(id=sid,derived_stem_pcm_sha256=pcm_hash(noise),derivation='Prior FLOAT mixture minus synchronized recorded reference in float64, then float32; includes prior floating-point mixing roundoff, not a new original recording'))
    return targets,dict(bsb_0124=rain,iusb_road_00=traffic),critical,inventory

def prepare(root,config,long=True):
    root.mkdir(parents=True,exist_ok=True);targets,noises,critical,inventory=components(config);write_json(root/'source_inventory.json',inventory)
    f=root/'critical';f.mkdir(exist_ok=True)
    for name in ['input','reference','noise']:sf.write(f/(name+'.wav'),critical[name],config['rate'],subtype='FLOAT')
    mask=active_mask(critical['reference'][:21784]);full_mask=np.zeros(220500,dtype=bool);full_mask[:len(mask)]=mask;np.save(f/'active_mask.npy',full_mask)
    streams=[]
    if long:
        n=config['long_stream_blocks']*config['block_samples'];period=config['background_period_blocks']*config['block_samples']
        for sid,event0 in targets.items():
            event=event0*(config['event_peak']/max(float(np.max(np.abs(event0))),1e-15));mask0=active_mask(event)
            onsets=config['siren_event_blocks'] if sid=='iusb_014' else config['horn_event_blocks']
            for bid,bg in noises.items():
                template=bg[:period];noise=np.tile(template,(int(np.ceil(n/period)),1))[:n].copy()
                anchor=np.zeros((n,2),dtype='float32');anchor[:len(event)]=event;mask=np.zeros(n,dtype=bool);mask[:len(event)]=mask0
                ng=noise_gain_for_active_snr(anchor,noise,mask,config['nominal_active_snr_db']);noise*=ng
                target=np.zeros_like(noise);events=[]
                for index,block in enumerate(onsets):
                    start=block*config['block_samples'];end=start+len(event)
                    if end>n:raise ValueError('Event exceeds stream')
                    if index and events[-1]['end_sample']>start:raise ValueError('Overlapping target events confound event references')
                    target[start:end]+=event
                    events.append(dict(index=index,start_sample=start,end_sample=end,onset_seconds=start/config['rate'],end_seconds=end/config['rate'],onset_block=block,reference_kind=next(r['reference_kind'] for r in inventory if r['id']==sid),same_background_phase_as_first=(block%config['background_period_blocks']==0)))
                mix=target+noise;gain=min(1.,.8/max(float(np.max(np.abs(mix))),1e-15));target*=gain;noise*=gain;mix=(target+noise).astype('float32')
                name=sid+'_'+bid;folder=root/'streams'/name;folder.mkdir(parents=True,exist_ok=True)
                for filename,x in [('input',mix),('reference',target),('noise',noise)]:sf.write(folder/(filename+'.wav'),x,config['rate'],subtype='FLOAT')
                np.save(folder/'event_active_mask.npy',mask0)
                row=dict(id=name,source_id=sid,background_id=bid,samples=n,duration_seconds=n/config['rate'],period_samples=period,background_loop_seams_not_crossfaded=True,noise_gain=ng,common_gain=gain,events=events,input_pcm_sha256=pcm_hash(mix),reference_pcm_sha256=pcm_hash(target))
                write_json(folder/'plan.json',row);streams.append(row)
    write_json(root/'streams.json',streams);return critical,streams

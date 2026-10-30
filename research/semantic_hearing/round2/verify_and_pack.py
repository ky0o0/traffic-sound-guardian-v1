#!/usr/bin/env python3
"""Verify re-downloaded Actions artifacts in a fresh job, then preserve compact evidence."""
import argparse,hashlib,json,shutil,sys,zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE));from experiment import RATE,describe_metrics,power,sha256

def main():
    p=argparse.ArgumentParser();p.add_argument('--full',type=Path,required=True);p.add_argument('--key',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);a=p.parse_args();dest=a.destination;dest.mkdir(parents=True,exist_ok=True)
    cases={};metrics={};checked=0
    for name,root in [('full',a.full),('key',a.key)]:
        rows=json.loads((root/'results.json').read_text());cases[name]={r['id']:r for r in rows}
        assert rows and all(r['status']=='processed' for r in rows)
        for m in json.loads((root/'wav_manifest.json').read_text()):
            path=root/m['path'];assert sha256(path)==m['sha256'];x,sr=sf.read(path,always_2d=True,dtype='float32');assert np.isfinite(x).all();assert hashlib.sha256(x.astype('<f4').tobytes()).hexdigest()==m['pcm_sha256'];checked+=1
            if m['path'].startswith('cases/'):assert sr==RATE and x.shape==(RATE*5,2)
        for source in json.loads((root/'config.json').read_text())['sources']:assert sha256(root/'originals'/source['original_filename'])==source['sha256']
        for r in rows:
            folder=root/'cases'/r['id'];assert r['inference']['checkpoint_sha256']=='f0328655691378a65516ec08add170bcf474ba41bb2d475af7a7c63bf2478a21'
            if not r['has_reference']:continue
            arrays={key:sf.read(folder/(key+'.wav'),always_2d=True)[0] for key in ['input','output','reference','added_noise']};np.testing.assert_allclose(arrays['input'],arrays['reference']+arrays['added_noise'],atol=1e-7,rtol=0)
            recomputed=describe_metrics(arrays['reference'],arrays['input'],arrays['output'],arrays['added_noise'],np.load(folder/'active_mask.npy'))
            for key in ['si_sdri_db','output_snr_db','active_input_snr_db']:
                if recomputed[key] is None:assert r['metrics'][key] is None
                else:assert abs(recomputed[key]-r['metrics'][key])<1e-8
        out=dest/name;out.mkdir(exist_ok=True)
        for filename in ['config.json','executed_plan.json','environment.json','results.json','run_summary.json','wav_manifest.json','source_checks.json']:
            shutil.copyfile(root/filename,out/filename)
        if (root/'analysis').exists():shutil.copytree(root/'analysis',out/'analysis',dirs_exist_ok=True)
    max_input=0.;max_output=0.;max_metric=0.
    for cid,r in cases['key'].items():
        assert cid in cases['full']
        for filename in ['input','output']:
            x,_=sf.read(a.full/'cases'/cid/(filename+'.wav'),always_2d=True);y,_=sf.read(a.key/'cases'/cid/(filename+'.wav'),always_2d=True);diff=float(np.max(np.abs(x-y)))
            if filename=='input':max_input=max(max_input,diff);assert diff==0
            else:max_output=max(max_output,diff);assert diff<5e-5
        v=r.get('metrics',{}).get('si_sdri_db');w=cases['full'][cid].get('metrics',{}).get('si_sdri_db')
        if v is not None:max_metric=max(max_metric,abs(v-w));assert abs(v-w)<1e-3
    prior=json.loads((HERE.parent/'evidence/2026-10-30-actions/results.json').read_text());deltas=[]
    for old in prior:
        if not old['id'].startswith(('bsb_0258_bsb_','bsb_0260_bsb_')):continue
        cid='round1_'+old['id'];new=cases['full'][cid]
        deltas.append(abs(new['metrics']['si_sdri_db']-old['isolated_recording_metrics']['si_sdri_db']))
    assert len(deltas)==12 and max(deltas)<1e-3
    report=dict(wavs_hash_and_pcm_checked=checked,full_cases=len(cases['full']),key_cases=len(cases['key']),key_input_max_abs_difference=max_input,key_output_max_abs_difference=max_output,key_si_sdri_max_abs_difference_db=max_metric,round1_matched_cases=len(deltas),round1_si_sdri_max_abs_difference_db=max(deltas),checks='All stored WAV byte hashes/decoded hashes/formats/finiteness, 23 source hashes, additive stems, independent metric recomputation, official weight hash, fresh-run agreement, first-round numerical reproduction')
    (dest/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    # Preselected listening comparisons; preserve original float samples and gain.
    selected=[]
    for r in cases['full'].values():
        if (r['family']=='position' and r['background_id'] is None and r['source_id']=='bsb_0260' and r['position'] in ['start','middle']) or (r['family']=='position' and r['background_id'] is None and r['source_id']=='bsb_0257' and r['position']=='middle') or (r['family']=='background' and r['source_id'] in ['iusb_014','bsb_1463'] and r['background_id']=='iusb_road_00'):
            selected.append(r)
    with zipfile.ZipFile(dest/'listening-selection.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
        for r in selected:
            for filename in ['input.wav','output.wav','reference.wav']:
                z.write(a.full/'cases'/r['id']/filename,r['id']+'/'+filename)
        z.writestr('ATTRIBUTION.md','# Listening selection\n\nOriginal sample values and gains preserved as FLOAT WAV; no normalization. Each folder provides input mixture, output extraction, and recorded reference component. Edited mixtures and SH outputs are adaptations.\n\nBigSoundBank recordings by DenisChardonnet and Joseph SARDIN, CC0: https://bigsoundbank.com/licenses.html\n\nIUSB siren01 and traffic_bg01: Jean-Rémy Gloaguen, Mathieu Lagrange, Arnaud Can, Jean-François Petiot, CC BY 4.0; https://zenodo.org/records/1213793 ; https://creativecommons.org/licenses/by/4.0/ . These adaptations are shared under CC BY 4.0. See config.json for exact member paths/hashes/crops and source uncertainty.\n\nMono bsb_1463 is an explicit dual-mono model-input diagnostic, never real binaural data. No independent human purity annotation or safety validation.\n')
        z.writestr('cases.json',json.dumps(selected,ensure_ascii=False,indent=2));z.write(a.full/'config.json','config.json')
    report['listening_cases']=len(selected);report['listening_zip_sha256']=sha256(dest/'listening-selection.zip');(dest/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Verify downloaded boundary-study WAVs and publish compact measured evidence."""
import argparse,csv,hashlib,json,shutil,sys,zipfile
from pathlib import Path
import numpy as np,soundfile as sf
R2=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(R2));from experiment import sha256,describe_metrics,RATE,write_json
p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=a.run;out=a.output;out.mkdir(parents=True,exist_ok=True);rows=json.loads((root/'results.json').read_text());assert len(rows)==42 and all(r['status']=='processed' for r in rows)
checked=0
for m in json.loads((root/'wav_manifest.json').read_text()):
    path=root/m['path'];assert sha256(path)==m['sha256'];x,sr=sf.read(path,always_2d=True,dtype='float32');assert np.isfinite(x).all() and sr==RATE and x.shape[1]==2;assert hashlib.sha256(x.astype('<f4').tobytes()).hexdigest()==m['pcm_sha256'];checked+=1
for r in rows:
    f=root/'cases'/r['id'];padded,_=sf.read(f/'model_input.wav',always_2d=True,dtype='float32');x,_=sf.read(f/'input.wav',always_2d=True,dtype='float32');y,_=sf.read(f/'output.wav',always_2d=True,dtype='float32');start=r['crop_start_sample'];np.testing.assert_array_equal(padded[start:start+len(x)],x);assert hashlib.sha256(x.astype('<f4').tobytes()).hexdigest()==r['original_crop_pcm_sha256']
    # Additive signal identity and original gain are unchanged inside the evaluated crop.
    ref,_=sf.read(f/'reference.wav',always_2d=True);noise,_=sf.read(f/'added_noise.wav',always_2d=True);np.testing.assert_allclose(x,ref+noise,atol=1e-7,rtol=0)
for name in ['results.json','plan.json','environment.json','run_summary.json','wav_manifest.json','execution.log','boundary.png','boundary.svg']:shutil.copyfile(root/name,out/name)
flat=[]
for r in rows:
    m=r['metrics'];flat.append(dict(source_id=r['source_id'],baseline_family=r['baseline_family'],background_id=r['background_id'],snr_db=r['nominal_snr_db'],mode=r['mode'],padding_seconds=r['padding_seconds'],output_si_sdr_db=m['output_si_sdr_mean_db'],si_sdri_db=m['si_sdri_db'],projected_gain_db=float(np.mean(m['projected_gain_db'])),output_snr_db=m['output_snr_db'],delta_from_baseline_db=r['output_si_sdr_delta_from_baseline_db']))
with (out/'results.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(flat[0]));w.writeheader();w.writerows(flat)
write_json(out/'verification.json',dict(cases=42,wavs_checked=checked,original_evaluated_input_samples_exactly_preserved=True,matched_suffix_control=True,decoder_block_samples=416,exploratory=True))
with zipfile.ZipFile(out/'boundary-listening.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    selected=[r for r in rows if r['source_id']=='bsb_0260' and r['baseline_family']=='round1' and r['background_id']=='bsb_0124' and r['nominal_snr_db']==0 and r['mode'] in ['zero_prefix','zero_suffix']]
    for r in selected:
        for name in ['input.wav','output.wav','reference.wav']:z.write(root/'cases'/r['id']/name,r['mode']+'/'+name)
    z.writestr('ATTRIBUTION.md','BigSoundBank / DenisChardonnet (horn), Joseph SARDIN (rain), CC0. https://bigsoundbank.com/licenses.html . Adaptations: fixed mixtures, zero context padding, unmodified official Semantic Hearing extraction, fixed output crop. Original float amplitudes preserved; no normalization. See results.csv for scientific evidence. This is not a streaming latency or safety demonstration.\n')
print(json.dumps(dict(cases=42,wavs_checked=checked)),flush=True)

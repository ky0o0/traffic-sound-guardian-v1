#!/usr/bin/env python3
"""Read source metadata and screen recording redundancy. No neural models."""
import argparse,hashlib,json,struct,sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import correlate,resample_poly
HERE=Path(__file__).resolve().parent

def riff_tags(path):
    data=path.read_bytes();out={}
    if data[:4] not in [b'RIFF',b'RF64']:return out
    off=12
    while off+8<=len(data):
        tag=data[off:off+4];n=struct.unpack('<I',data[off+4:off+8])[0];body=data[off+8:off+8+n]
        if tag==b'LIST' and body[:4]==b'INFO':
            cursor=4
            while cursor+8<=len(body):
                key=body[cursor:cursor+4].decode('ascii',errors='replace');size=struct.unpack('<I',body[cursor+4:cursor+8])[0];out[key]=body[cursor+8:cursor+8+size].rstrip(b'\0').decode('utf8',errors='replace');cursor+=8+size+(size%2)
        elif tag in [b'bext',b'iXML']:out[tag.decode()]=body[:8192].decode('utf8',errors='replace').replace('\x00','')
        off+=8+n+(n%2)
    return out

def main():
    p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);p.add_argument('--config',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();config=json.loads(a.config.read_text());rows=[];horns={}
    for s in config['sources']:
        path=a.sources/'originals'/s['original_filename'];assert hashlib.sha256(path.read_bytes()).hexdigest()==s['sha256'];x,sr=sf.read(path,always_2d=True);row=dict(id=s['id'],riff_metadata=riff_tags(path),decoded_pcm_sha256=hashlib.sha256(x.astype('<f4').tobytes()).hexdigest())
        if x.shape[1]==2:
            left=x[:,0]-x[:,0].mean();right=x[:,1]-x[:,1].mean();alpha=float(np.dot(left,right)/max(np.dot(left,left),1e-30));row['right_from_left_gain']=alpha;row['right_from_left_residual_ratio']=float(np.sum((right-left*alpha)**2)/max(np.sum(right**2),1e-30))
        rows.append(row)
        if s['target']=='car_horn':
            # Read the SAME fixed excerpt; no metric-driven segment selection.
            start=round(s['crop_start_seconds']*sr);x=x[start:start+round(s['crop_duration_seconds']*sr)]
            mono=x.mean(axis=1);mono=resample_poly(mono,11025,sr);mono=mono-mono.mean();horns[s['id']]=mono
    pairs=[];ids=sorted(horns)
    for i,sid in enumerate(ids):
        for tid in ids[i+1:]:
            x,y=horns[sid],horns[tid];short,long=(x,y) if len(x)<=len(y) else (y,x)
            numerator=correlate(long,short,mode='valid',method='fft')
            # Running window sum without O(N*M) convolution.
            cs=np.concatenate(([0.],np.cumsum(long**2)));means=np.concatenate(([0.],np.cumsum(long)));sums=means[len(short):]-means[:-len(short)];energy=cs[len(short):]-cs[:-len(short)]-sums**2/len(short)
            scores=numerator/np.sqrt(np.maximum(energy,1e-30)*max(np.sum(short**2),1e-30));idx=int(np.argmax(np.abs(scores)))
            pairs.append(dict(a=sid,b=tid,max_abs_mono_subclip_correlation=float(abs(scores[idx])),long_clip_offset_seconds=idx/11025,interpretation='High correlation screens reuse; periodic horns alone can also correlate. Not proof of session independence or duplication.'))
    result=dict(sources=rows,horn_pairs=pairs,method='Original RIFF INFO/bext/iXML inspection, exact decoded hashes, channel linear-fit residual; all-pairs fixed-excerpt mono subclip correlation at 11025Hz',limitations='No human listening/purity annotation. No SH raw-file training map. File uniqueness does not establish independent recording sessions.')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()

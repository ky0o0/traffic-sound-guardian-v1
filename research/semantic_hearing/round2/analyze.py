#!/usr/bin/env python3
"""Descriptive stratified summaries. Conditions are never counted as independent recordings."""
import argparse,csv,json
from collections import defaultdict
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def dump(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def main():
    p=argparse.ArgumentParser();p.add_argument('run',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=a.output;root.mkdir(parents=True,exist_ok=True)
    rows=json.loads((a.run/'results.json').read_text());good=[r for r in rows if r['status']=='processed'];flat=[]
    for r in rows:
        d={k:v for k,v in r.items() if k not in ['metrics','inference'] and not isinstance(v,(dict,list))}
        for k,v in (r.get('metrics') or {}).items():d[k]=json.dumps(v) if isinstance(v,list) else v
        d['inference_seconds']=r.get('inference',{}).get('inference_seconds');flat.append(d)
    fields=list(dict.fromkeys(k for r in flat for k in r))
    with (root/'results.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(flat)
    grouped=defaultdict(list)
    for r in good:
        if r.get('metrics') is not None:grouped[(r['family'],r['source_id'],r.get('reference_kind'),r.get('input_mode'))].append(r)
    stats=[]
    for keys,rs in grouped.items():
        item=dict(zip(['family','source_id','reference_kind','input_mode'],keys));item['conditions']=len(rs)
        for metric in ['si_sdri_db','output_si_sdr_mean_db','output_snr_db','active_output_snr_db','output_to_reference_energy_db']:
            vs=[r['metrics'][metric] for r in rs if r['metrics'][metric] is not None]
            item[metric]=dict(mean=float(np.mean(vs)),median=float(np.median(vs)),min=float(min(vs)),max=float(max(vs))) if vs else None
        gains=[np.mean(r['metrics']['projected_gain_db']) for r in rs];item['mean_projected_gain_db']=float(np.mean(gains));item['positive_improvement_conditions']=sum((r['metrics']['si_sdri_db'] or 0)>0 for r in rs);stats.append(item)
    paired=[]
    pairs=defaultdict(dict)
    for r in good:
        if r['family']=='position':pairs[(r['source_id'],r['background_id'])][r['position']]=r
    for (sid,bg),rs in pairs.items():
        baseline=rs['start'];base=baseline['metrics']
        for pos in ['middle','end']:
            r=rs[pos];m=r['metrics'];paired.append(dict(source_id=sid,background_id=bg,position=pos,output_si_sdr_delta_from_start_db=m['output_si_sdr_mean_db']-base['output_si_sdr_mean_db'],gain_delta_from_start_db=float(np.mean(m['projected_gain_db'])-np.mean(base['projected_gain_db'])),active_snr_start_db=base['active_input_snr_db'],active_snr_moved_db=m['active_input_snr_db'],identical_noise_gain=r['noise_gain']==baseline['noise_gain'],identical_common_gain=r['common_gain']==baseline['common_gain']))
    summary=dict(total_conditions=len(rows),processed=len(good),failed=len(rows)-len(good),unique_used_recording_files=len(set(r['source_id'] for r in good)|set(r['background_id'] for r in good if r.get('background_id'))),forward_median_seconds=float(np.median([r['inference']['inference_seconds'] for r in good])),by_source_family=stats,position_pairs=paired)
    dump(root/'summary.json',summary)
    # Plot matched source curves; axes intentionally show units and source IDs.
    fig,axes=plt.subplots(1,2,figsize=(13,4.5))
    for sid in sorted({r['source_id'] for r in good if r['family']=='position'}):
        rs=[r for r in good if r['family']=='position' and r['source_id']==sid and r['background_id'] is None];order={'start':0,'middle':1,'end':2};rs=sorted(rs,key=lambda r:order[r['position']])
        axes[0].plot([r['position'] for r in rs],[r['metrics']['output_si_sdr_mean_db'] for r in rs],marker='o',label=sid)
        axes[1].plot([r['position'] for r in rs],[np.mean(r['metrics']['projected_gain_db']) for r in rs],marker='o',label=sid)
    axes[0].set_ylabel('Output SI-SDR (dB)');axes[1].set_ylabel('Projected target gain (dB)')
    for ax in axes:ax.set_title('Same target, no added background');ax.grid(alpha=.25);ax.legend(fontsize=8)
    fig.tight_layout();fig.savefig(root/'position.png',dpi=180);fig.savefig(root/'position.svg');plt.close(fig)
    fig,axes=plt.subplots(1,2,figsize=(13,4.5))
    for sid in sorted({r['source_id'] for r in good if r['family']=='duration'}):
        rs=[r for r in good if r['family']=='duration' and r['source_id']==sid and r['background_id'] is None];rs=sorted(rs,key=lambda r:r['event_samples'])
        axes[0].plot([r['event_samples']/44100 for r in rs],[r['metrics']['output_si_sdr_mean_db'] for r in rs],marker='o',label=sid)
        axes[1].plot([r['event_samples']/44100 for r in rs],[np.mean(r['metrics']['projected_gain_db']) for r in rs],marker='o',label=sid)
    axes[0].set_ylabel('Output SI-SDR (dB)');axes[1].set_ylabel('Projected target gain (dB)')
    for ax in axes:ax.set_xlabel('Edited prefix duration (s)');ax.set_title('Same-recording prefix crops, 5ms fades');ax.grid(alpha=.25);ax.legend(fontsize=8)
    fig.tight_layout();fig.savefig(root/'duration.png',dpi=180);fig.savefig(root/'duration.svg');plt.close(fig)
    rs=[r for r in good if r['family']=='background' and r['nominal_snr_db']==0];sids=sorted({r['source_id'] for r in rs});bgs=sorted({r['background_id'] for r in rs});matrix=np.full((len(sids),len(bgs)),np.nan)
    for r in rs:matrix[sids.index(r['source_id']),bgs.index(r['background_id'])]=r['metrics']['si_sdri_db']
    fig,ax=plt.subplots(figsize=(8,max(4,len(sids)*.48)));im=ax.imshow(matrix,cmap='RdBu',vmin=-30,vmax=30,aspect='auto');ax.set_xticks(range(len(bgs)),bgs,rotation=25,ha='right');ax.set_yticks(range(len(sids)),sids)
    for i in range(len(sids)):
        for j in range(len(bgs)):ax.text(j,i,f'{matrix[i,j]:.1f}',ha='center',va='center',fontsize=8)
    ax.set_title('SI-SDR improvement (dB), nominal active SNR = 0 dB\nSee config for reference purity and source-channel strata');fig.colorbar(im,ax=ax,label='dB');fig.tight_layout();fig.savefig(root/'background.png',dpi=180);fig.savefig(root/'background.svg');plt.close(fig)
if __name__=='__main__':main()

#!/usr/bin/env python3
import argparse,csv,json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def main():
    p=argparse.ArgumentParser();p.add_argument('--full',type=Path);p.add_argument('--pilot',type=Path);p.add_argument('--output',type=Path);p.add_argument('--evidence',type=Path);a=p.parse_args()
    if a.evidence:
        postprocess_evidence(a.evidence);return
    if not all([a.full,a.pilot,a.output]):p.error('--full, --pilot and --output are required without --evidence')
    a.output.mkdir(parents=True,exist_ok=True)
    rows=json.loads((a.full/'results.json').read_text());events=[];timing=[];blocks=[]
    for r in rows:
        for e in r.get('events',[]):
            m=e['metrics'];d=dict(run_id=r['id'],source=r['source_id'],background=r['background_id'],policy=r['policy'],event_index=e['index'],onset_seconds=e['onset_seconds'],same_background_phase_as_first=e['same_background_phase_as_first'],input_si_sdr_db=m.get('input_si_sdr_mean_db'),output_si_sdr_db=m.get('output_si_sdr_mean_db'),si_sdri_db=m.get('si_sdri_db'),projected_gain_db=float(np.mean(m['projected_gain_db'])) if 'projected_gain_db' in m else None,output_snr_db=m.get('output_snr_db'),active_output_snr_db=m.get('active_output_snr_db'),active_input_snr_db=m.get('active_input_snr_db'),onset_first100ms_gain_db=float(np.mean(e['onset_first_100ms']['projected_gain_db'])) if 'projected_gain_db' in e['onset_first_100ms'] else None,later_gain_db=float(np.mean(e['later_event_portion']['projected_gain_db'])) if 'projected_gain_db' in e['later_event_portion'] else None)
            if e['response']:d.update(e['response'])
            events.append(d)
        if r.get('timing'):
            t=r['timing'];timing.append(dict(id=r['id'],policy=r['policy'],blocks=t['blocks'],forward_median_ms=t['forward_seconds']['median']*1000,forward_p99_ms=t['forward_seconds']['p99']*1000,forward_max_ms=t['forward_seconds']['max']*1000,first_block_forward_ms=t['first_block_forward_seconds']*1000,steady_forward_median_ms=t['steady_forward_seconds']['median']*1000,step_median_ms=t['step_seconds']['median']*1000,step_p99_ms=t['step_seconds']['p99']*1000,step_max_ms=t['step_seconds']['max']*1000,cpu_forward_rtf=t['cpu_forward_rtf'],unpaced_adapter_wall_rtf=t['unpaced_adapter_wall_rtf'],cpu_seconds=t['cpu_seconds'],process_cpu_percent=t['process_cpu_percent'],memory_start_rss_kib=t['memory_before'].get('VmRSS_kib'),memory_end_rss_kib=t['memory_after'].get('VmRSS_kib'),process_lifetime_peak_rss_kib=t['memory_after'].get('VmHWM_kib'),neural_state_bytes=t['neural_state_bytes'],step_over_budget=t['blocks_step_exceeds_block_duration']))
            path=a.full/'paced/block_trace.json' if r['policy']=='paced_carry' else a.full/'runs'/r['stream_id']/r['policy']/'block_trace.json'
            for b in json.loads(path.read_text()):blocks.append(dict(run_id=r['id'],**b))
    def csv_out(name,data):
        keys=list(dict.fromkeys(k for r in data for k in r))
        with (a.output/name).open('w') as f:
            w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(data)
    csv_out('event_metrics.csv',events);csv_out('run_performance.csv',timing)
    for r in blocks:r['reset_components']='|'.join(r['reset_components'])
    csv_out('block_trace.csv',blocks)
    for metric,label,name in [('projected_gain_db','Projected target gain (dB)','event_gain'),('si_sdri_db','SI-SDR improvement (dB)','event_sdri')]:
        fig,axes=plt.subplots(1,3,figsize=(15,4.5))
        for ax,(sid,bid) in zip(axes,[('bsb_0260','bsb_0124'),('bsb_0260','iusb_road_00'),('iusb_014','iusb_road_00')]):
            for policy in ['carry','reset_each_block','scheduled_reset']:
                rs=[r for r in events if r['source']==sid and r['background']==bid and r['policy']==policy]
                ax.plot([r['onset_seconds'] for r in rs],[r[metric] for r in rs],marker='o',label=policy)
            ax.axvline(2650*416/44100,color='gray',ls=':',label='scheduled neural reset');ax.set_title(sid+' / '+bid);ax.set_xlabel('Warning onset (s)');ax.set_ylabel(label);ax.grid(alpha=.25);ax.legend(fontsize=7)
        fig.tight_layout();fig.savefig(a.output/(name+'.png'),dpi=180);fig.savefig(a.output/(name+'.svg'));plt.close(fig)
    pilot=json.loads((a.pilot/'results.json').read_text());fig,axes=plt.subplots(1,2,figsize=(12,4.5))
    labels=[r['id'].replace('zero_history_','warm_') for r in pilot];scores=[r['metrics']['si_sdri_db'] for r in pilot];gains=[float(np.mean(r['metrics']['projected_gain_db'])) for r in pilot]
    for ax,v,title in zip(axes,[scores,gains],['SI-SDR improvement (dB)','Projected target gain (dB)']):ax.bar(range(len(v)),v);ax.set_xticks(range(len(v)),labels,rotation=60,ha='right',fontsize=7);ax.set_ylabel(title);ax.grid(axis='y',alpha=.25)
    fig.suptitle('Same original 0260 mixture: controlled neural-state interventions');fig.tight_layout();fig.savefig(a.output/'state_interventions.png',dpi=180);fig.savefig(a.output/'state_interventions.svg');plt.close(fig)
    fig,ax=plt.subplots(figsize=(7,4))
    for rid in [r['id'] for r in rows if r['policy']=='carry']:
        times=sorted(b['step_seconds']*1000 for b in blocks if b['run_id']==rid and not b['eof']);ax.plot(times,np.arange(1,len(times)+1)/len(times),label=rid,alpha=.8)
    ax.axvline(416/44100*1000,color='black',ls='--',label='416-sample audio duration');ax.set_xlabel('Measured adapter step time (ms)');ax.set_ylabel('Empirical CDF');ax.set_xlim(0,min(50,max(b['step_seconds']*1000 for b in blocks)));ax.legend(fontsize=6);ax.grid(alpha=.25);fig.tight_layout();fig.savefig(a.output/'step_time_cdf.png',dpi=180);fig.savefig(a.output/'step_time_cdf.svg');plt.close(fig)
    (a.output/'summary.json').write_text(json.dumps(dict(quality_runs=len(rows),event_metric_rows=len(events),block_trace_rows=len(blocks),original_recording_files=5,target_sources=3,continuous_inputs=6),indent=2)+'\n')

def postprocess_evidence(evidence):
    """Derive presentation tables from saved actual results; no model invocation."""
    rows=json.loads((evidence/'full/results.json').read_text());out=evidence/'analysis'
    lookup={(r['id'],e['index']):e for r in rows for e in r.get('events',[])}
    path=out/'event_metrics.csv'
    with path.open() as f:data=list(csv.DictReader(f))
    for row in data:row['active_input_snr_db']=lookup[(row['run_id'],int(row['event_index']))]['metrics']['active_input_snr_db']
    fields=list(data[0])
    with path.open('w') as f:w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(data)
    with (out/'block_trace.csv').open() as f:blocks=list(csv.DictReader(f))
    paced=next(r for r in rows if r['policy']=='paced_carry');pt=[t for t in blocks if t['run_id']==paced['id']]
    lat=[(float(t['actual_available_seconds'])-int(t['start_sample'])/44100)*1000 for t in pt if t['eof']=='False']
    late=paced['timing']['packet_lateness_seconds']
    latency=dict(capture_packet_samples=32,packet_duration_ms=32/44100*1000,model_new_samples_per_step=416,block_duration_ms=416/44100*1000,input_right_context_samples=32,maximum_block_collection_wait_ms=448/44100*1000,paced_warning_onset_to_computed_output_ms=paced['actual_onset_to_computed_output_ms'],paced_warning_modeled_response_ms=paced['modeled_onset_to_computed_output_ms'],paced_all_first_sample_response_ms=dict(zip(['median','p95','p99','max'],[float(v) for v in np.quantile(lat,[.5,.95,.99,1])])),paced_input_packet_lateness_ms={k:(v*1000 if k!='n' else v) for k,v in late.items()},paced_last_output_after_file_end_ms=(float(pt[-1]['actual_available_seconds'])-int(pt[-1]['end_sample'])/44100)*1000,physical_microphone_DAC_Bluetooth_measured=False,warning_audibility_or_detection_measured=False)
    (out/'latency_summary.json').write_text(json.dumps(latency,indent=2)+'\n')
    carry=[r for r in rows if r['policy']=='carry'];p=json.loads((evidence/'full/environment.json').read_text())
    resource=dict(main_cpu=p['cpu_info'].split('model name')[1].splitlines()[0].strip(' :\t'),torch_threads=p['torch_threads'],parameters=p['model']['parameters'],parameter_float32_bytes=p['model']['parameters']*4,neural_cache_bytes=carry[0]['timing']['neural_state_bytes'],carry_rtf_range=[min(r['timing']['unpaced_adapter_wall_rtf'] for r in carry),max(r['timing']['unpaced_adapter_wall_rtf'] for r in carry)],carry_forward_median_ms_range=[min(r['timing']['forward_seconds']['median'] for r in carry)*1000,max(r['timing']['forward_seconds']['median'] for r in carry)*1000],carry_max_step_ms=max(r['timing']['step_seconds']['max'] for r in carry)*1000,carry_over_budget_blocks=sum(r['timing']['blocks_step_exceeds_block_duration'] for r in carry),carry_blocks=sum(r['timing']['blocks'] for r in carry),recorded_process_peak_rss_kib=max(r['timing']['memory_after']['VmHWM_kib'] for r in rows if r.get('timing')),interpretation='RSS includes Python/PyTorch, file-array/logging/evaluation and backend allocations. Cache byte count is not total memory. Source of RSS growth not isolated. No multi-hour bounded-memory or mobile measurement.')
    (out/'resource_summary.json').write_text(json.dumps(resource,indent=2)+'\n')
    fig,axes=plt.subplots(1,2,figsize=(11,4.5))
    for ax,bid in zip(axes,['bsb_0124','iusb_road_00']):
        carry=next(r for r in rows if r.get('source_id')=='iusb_014' and r.get('background_id')==bid and r['policy']=='carry')
        reset=next(r for r in rows if r.get('source_id')=='iusb_014' and r.get('background_id')==bid and r['policy']=='scheduled_reset')
        selected=[carry['events'][0],carry['events'][1],reset['events'][4]];x=np.arange(3)
        ax.bar(x-.18,[float(np.mean(e['metrics']['projected_gain_db'])) for e in selected],width=.36,label='whole event')
        ax.bar(x+.18,[float(np.mean(e['onset_first_100ms']['projected_gain_db'])) for e in selected],width=.36,label='first 100ms')
        ax.set_xticks(x,['cold first','steady','neural reset']);ax.set_title('IUSB siren recording / '+bid);ax.set_ylabel('Projected recording gain (dB)');ax.legend();ax.grid(axis='y',alpha=.25)
    fig.tight_layout();fig.savefig(out/'siren_onset.png',dpi=180);fig.savefig(out/'siren_onset.svg');plt.close(fig)

if __name__=='__main__':main()

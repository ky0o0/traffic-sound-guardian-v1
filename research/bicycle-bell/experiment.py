"""Run real, isolated FSD50K/YAMNet transfer learning. Never edits website assets.

Training is weakly supervised multiple-instance learning on actual recording bags.
The test split is not used for scaling, optimization, checkpoints, thresholds or hops.
"""
import os
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL','2')
os.environ.setdefault('OMP_NUM_THREADS','2')
import argparse
import collections
import concurrent.futures
import csv
import hashlib
import io
import json
import math
import pathlib
import platform
import re
import subprocess
import sys
import time
import urllib.request
import warnings
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from scipy.special import expit
from sklearn.metrics import average_precision_score, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
import tensorflow as tf
from tensorflow.lite.python import schema_py_generated as schema
import flatbuffers

HERE=pathlib.Path(__file__).resolve().parent
REPO=HERE.parent.parent
NAMES=['Bicycle bell','Vehicle horn, car horn, honking','Siren','Police car (siren)',
       'Ambulance (siren)','Fire engine, fire truck (siren)','Bell','Chime','Ding','Ping','Doorbell']
INDICES=[198,302,390,317,318,319,195,200,477,476,349]


def digest(data):return hashlib.sha256(data).hexdigest()
def dump(path,data):
    pathlib.Path(path).write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False))


def fetch(url,path):
    path=pathlib.Path(path)
    if path.exists():return path.read_bytes()
    for attempt in range(4):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'TrafficSoundGuardian-research/1'})
            with urllib.request.urlopen(request,timeout=90) as r:data=r.read()
            path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);return data
        except Exception:
            if attempt==3:raise
            time.sleep(1+attempt*2)


def allowed_license(value):
    if 'creativecommons.org/publicdomain/zero/' in value:return 'CC0-1.0'
    if re.search(r'creativecommons.org/licenses/by/\d',value):return 'CC-BY'
    return None


def category(labels,title):
    if 'Bicycle_bell' in labels:return 'bicycle_bell'
    # Do not introduce a likely unlabelled bicycle recording into the negatives.
    if re.search(r'(bike|bicycle|cycle).{0,20}(bell|ring)|(bell|ring).{0,20}(bike|bicycle)',title,re.I):return None
    text=' '.join(labels)+' '+title
    for key,pattern in [('doorbell',r'door.?bell'),('chime',r'chime'),('ding',r'\bding\b'),('beep',r'beep')]:
        if re.search(pattern,text,re.I):return key
    if 'Bell' in labels:return 'other_bell'
    if 'Music' in labels:return 'music'
    return 'environment'


def collect(protocol,cache,out):
    root=f'https://huggingface.co/datasets/{protocol["dataset_repo"]}/resolve/{protocol["dataset_revision"]}/'
    all_rows=[];metadata_hashes={};excluded=collections.Counter()
    expected={'dev':'b31a2eb130aea6d545d4b48511b24dfd0120420567a8d1066c52d54968bb3735',
              'eval':'ced921d00c4f7ace86b92c259689a1a40a8452808e93235021165ad2d8b77e6c'}
    for split in ['dev','eval']:
        labels_bytes=fetch(root+f'labels/{split}.csv',cache/f'{split}.csv')
        meta_bytes=fetch(root+f'metadata/{split}_clips_info_FSD50K.json',cache/f'{split}-info.json')
        if digest(meta_bytes)!=expected[split]:raise RuntimeError('Pinned metadata digest mismatch')
        metadata_hashes[split]={'labels_sha256':digest(labels_bytes),'metadata_sha256':digest(meta_bytes)}
        metadata=json.loads(meta_bytes)
        for row in csv.DictReader(io.StringIO(labels_bytes.decode())):
            info=metadata[str(row['fname'])];license_name=allowed_license(info.get('license',''))
            if not license_name:excluded['license']+=1;continue
            uploader=info.get('uploader','').strip()
            if not uploader:excluded['missing_uploader']+=1;continue
            labels=row['labels'].split(',');kind=category(labels,info.get('title',''))
            if kind is None:excluded['ambiguous_negative_title']+=1;continue
            all_rows.append({'id':str(row['fname']),'original_split':split,'labels':labels,
                'target':int(kind=='bicycle_bell'),'category':kind,'title':info.get('title',''),
                'uploader':uploader,'license':info['license'],'license_group':license_name,
                'source_url':f'https://freesound.org/s/{row["fname"]}/',
                'audio_url':root+f'clips/{split}/{row["fname"]}.wav'})
    limits={'bicycle_bell':protocol['positive_limit'],**protocol['negative_limits']}
    selected=[]
    for kind,limit in limits.items():
        pool=sorted((r for r in all_rows if r['category']==kind),key=lambda r:digest((str(protocol['seed'])+r['id']).encode()))
        # Round-robin uploaders avoids filling a category with one sample pack.
        by_author=collections.defaultdict(list)
        for r in pool:by_author[r['uploader'].casefold()].append(r)
        chosen=[]
        while len(chosen)<limit and by_author:
            for author in list(by_author):
                chosen.append(by_author[author].pop(0))
                if not by_author[author]:del by_author[author]
                if len(chosen)>=limit:break
        selected.extend(chosen)
    dump(out/'selection-before-download.json',{'metadata':metadata_hashes,'excluded':dict(excluded),
        'counts':dict(collections.Counter(r['category'] for r in selected)),'records':selected})
    print('SELECTED',dict(collections.Counter(r['category'] for r in selected)),flush=True)

    def download(row):
        row=dict(row)
        try:
            data=fetch(row['audio_url'],cache/'audio'/(row['id']+'.wav'))
            audio,rate=sf.read(io.BytesIO(data),dtype='float32',always_2d=True)
            mono=audio.mean(axis=1,dtype=np.float32)
            if not np.isfinite(mono).all() or len(mono)==0:raise ValueError('Invalid PCM')
            duration=len(mono)/rate
            if duration>protocol['max_seconds']+.01:raise ValueError('Audio exceeds preregistered 30-second cap')
            # Content digest used only for grouping; never alters inference audio.
            canonical=resample_poly(mono,16000//math.gcd(rate,16000),rate//math.gcd(rate,16000))
            peak=np.max(np.abs(canonical))
            if peak>0:canonical=canonical/peak
            fingerprint=digest(np.round(canonical*2047).astype('<i2').tobytes())
            row.update(sha256=digest(data),pcm_group=fingerprint,sample_rate=rate,
                channels=audio.shape[1],duration=duration,bytes=len(data))
        except Exception as error:row['error']=str(error)
        return row
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        downloaded=list(executor.map(download,selected))
    failures=[r for r in downloaded if 'error' in r]
    dump(out/'download-failures.json',failures)
    records=[r for r in downloaded if 'error' not in r]
    # Duplicate groups are merged transitively with all recordings by an uploader.
    parent=list(range(len(records)))
    def root_of(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    seen={}
    for i,r in enumerate(records):
        for key in [('uploader',r['uploader'].casefold()),('bytes',r['sha256']),('pcm',r['pcm_group'])]:
            if key in seen:parent[root_of(i)]=root_of(seen[key])
            else:seen[key]=i
    for i,r in enumerate(records):r['group']='g'+str(root_of(i))
    y=np.array([r['target'] for r in records]);groups=np.array([r['group'] for r in records])
    outer=StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=protocol['seed'])
    development,test=next(outer.split(np.zeros(len(y)),y,groups))
    inner=StratifiedGroupKFold(n_splits=4,shuffle=True,random_state=protocol['seed']+1)
    train_local,val_local=next(inner.split(np.zeros(len(development)),y[development],groups[development]))
    splits={'train':development[train_local],'validation':development[val_local],'test':test}
    for name,ids in splits.items():
        for i in ids:records[i]['split']=name
        counts=collections.Counter(int(y[i]) for i in ids)
        if counts[1]<5 or counts[0]<10:raise RuntimeError(f'Insufficient independent examples for {name}: {counts}')
    for a,b in [('train','validation'),('train','test'),('validation','test')]:
        if set(groups[splits[a]]) & set(groups[splits[b]]):raise RuntimeError('Group leakage')
    summary={name:{'clips':len(ids),'positive':int(y[ids].sum()),'negative':int((1-y[ids]).sum()),
        'groups':len(set(groups[ids])),'categories':dict(collections.Counter(records[i]['category'] for i in ids))}
        for name,ids in splits.items()}
    dump(out/'manifest.json',{'source':'FSD50K / Fhrozen mirror','revision':protocol['dataset_revision'],
        'metadata':metadata_hashes,'split_note':protocol['split'],'summary':summary,'records':records})
    print('SPLITS',json.dumps(summary),flush=True)
    return records


def export_encoder(protocol,out):
    original=(REPO/'yamnet.tflite').read_bytes()
    if digest(original)!=protocol['yamnet_sha256']:raise RuntimeError('Wrong YAMNet baseline')
    model=schema.ModelT.InitFromObj(schema.Model.GetRootAsModel(original,0))
    model.subgraphs[0].outputs=np.array([protocol['feature_tensor'],120],dtype=np.int32)
    builder=flatbuffers.Builder(0);offset=model.Pack(builder);builder.Finish(offset,file_identifier=b'TFL3')
    path=out/'yamnet_features.tflite';path.write_bytes(bytes(builder.Output()))
    interpreter=tf.lite.Interpreter(model_path=str(path),num_threads=2);interpreter.allocate_tensors()
    details=next(d for d in interpreter.get_tensor_details() if d['index']==protocol['feature_tensor'])
    if tuple(details['shape'])!=(1,1,1,1024) or 'layer28/reduce_mean' not in details['name']:raise RuntimeError('Unexpected feature tensor')
    return interpreter,details


def resample_window(samples,rate,kernels):
    """Port of production resample.js: 96 taps/1024 phases, native window edges."""
    if rate==16000:return samples.astype(np.float32,copy=True)
    if rate not in kernels:
        cutoff=.45*min(1,16000/rate);j=np.arange(96);p=np.arange(1024)[:,None]
        x=j[None,:]-47-p/1024
        weights=2*cutoff*np.sinc(2*cutoff*x)*(0.42-.5*np.cos(2*np.pi*j/95)+.08*np.cos(4*np.pi*j/95))
        kernels[rate]=weights/weights.sum(axis=1,keepdims=True)
    positions=np.arange(15600)*(rate/16000);integer=np.floor(positions).astype(int)
    phase=np.minimum(1023,np.floor((positions-integer)*1024).astype(int));output=np.empty(15600,dtype=np.float32)
    for start in range(0,15600,512):
        end=min(start+512,15600)
        indices=np.clip(integer[start:end,None]-47+np.arange(96),0,len(samples)-1)
        output[start:end]=np.clip((samples[indices]*kernels[rate][phase[start:end]]).sum(axis=1),-1,1)
    return output


def extract(records,protocol,cache,out):
    interpreter,detail=export_encoder(protocol,out);scale,zero=detail['quantization'];kernels={}
    features=[];scores=[];timings=[];parity_inputs=[];parity_scores=[]
    for n,r in enumerate(records):
        audio,rate=sf.read(cache/'audio'/(r['id']+'.wav'),dtype='float32',always_2d=True);audio=audio.mean(axis=1,dtype=np.float32)
        size=math.floor(rate*.975);hop=round(rate*.24)
        if len(audio)<size:audio=np.pad(audio,(0,size-len(audio)))
        embeddings=[];raw=[];ends=[]
        for start in range(0,len(audio)-size+1,hop):
            pcm=resample_window(audio[start:start+size],rate,kernels)
            began=time.perf_counter();interpreter.set_tensor(0,pcm);interpreter.invoke();elapsed=(time.perf_counter()-began)*1000
            embedding=(interpreter.get_tensor(protocol['feature_tensor']).reshape(-1).astype(np.float32)-zero)*scale
            result=interpreter.get_tensor(120).reshape(-1)
            if not np.isfinite(result).all() or result.shape!=(521,):raise RuntimeError('Bad genuine model result')
            embeddings.append(embedding);raw.append(result[INDICES]);ends.append((start+size)/rate);timings.append(elapsed)
            if len(parity_inputs)<8 and start==0:parity_inputs.append(pcm.copy());parity_scores.append(result.copy())
        features.append(np.array(embeddings,dtype=np.float32));scores.append(np.array(raw,dtype=np.float32));r['window_ends']=ends
        if n%50==0:print('FEATURES',n+1,'/',len(records),'windows',sum(len(x) for x in features),flush=True)
    np.savez_compressed(cache/'features.npz',**{f'x{i}':x for i,x in enumerate(features)},**{f's{i}':x for i,x in enumerate(scores)})
    # Compare output-only modified encoder against the unmodified baseline model.
    original=tf.lite.Interpreter(model_path=str(REPO/'yamnet.tflite'),num_threads=2);original.allocate_tensors();errors=[];base_times=[]
    for pcm,expected in zip(parity_inputs,parity_scores):
        began=time.perf_counter();original.set_tensor(0,pcm);original.invoke();base_times.append((time.perf_counter()-began)*1000)
        errors.append(float(np.max(np.abs(original.get_tensor(120).reshape(-1)-expected))))
    if max(errors)>1e-6:raise RuntimeError('Encoder changes altered baseline scores')
    dump(out/'encoder-check.json',{'original_sha256':protocol['yamnet_sha256'],'encoder_sha256':digest((out/'yamnet_features.tflite').read_bytes()),
        'feature_tensor':protocol['feature_tensor'],'feature_name':detail['name'],'quantization':[scale,zero],
        'baseline_output_max_abs_errors':errors,'encoder_inference_ms':distribution(timings),
        'original_inference_ms_small_parity_sample':distribution(base_times)})
    baseline_input=cache/'baseline-input.json';dump(baseline_input,{'names':NAMES,'rows':np.concatenate(scores).tolist()})
    actual=json.loads(subprocess.check_output(['node',str(HERE/'baseline.mjs'),str(baseline_input)],text=True))
    offset=0
    for r,s in zip(records,scores):
        r['site_winners']=actual[offset:offset+len(s)];offset+=len(s)
    return features,scores


def distribution(values):
    a=np.asarray(values,dtype=float)
    return {'n':len(a),'mean':float(a.mean()),'p50':float(np.median(a)),'p95':float(np.quantile(a,.95)),'max':float(a.max())} if len(a) else None


def metrics(y,pred):
    tn,fp,fn,tp=confusion_matrix(y,pred,labels=[0,1]).ravel()
    div=lambda a,b:float(a/b) if b else None
    return {'tp':int(tp),'fp':int(fp),'fn':int(fn),'tn':int(tn),'precision':div(tp,tp+fp),
        'recall':div(tp,tp+fn),'f1':div(2*tp,2*tp+fp+fn),'fpr':div(fp,fp+tn),
        'confusion_matrix':[[int(tn),int(fp)],[int(fn),int(tp)]]}


def choose_threshold(y,scores,protocol):
    choices=[]
    for threshold in np.unique(np.r_[0,scores,np.nextafter(1.,2.)]):
        m=metrics(y,scores>=threshold)
        feasible=(m['precision'] or 0)>=protocol['validation_min_precision'] and (m['fpr'] or 0)<=protocol['validation_max_fpr']
        choices.append({'threshold':float(threshold),'feasible':feasible,**m})
    def rank(m):
        return (m['feasible'],m['recall'] or 0,m['f1'] or 0,-(m['fpr'] or 0),m['threshold']) if m['feasible'] else (False,m['f1'] or 0,m['recall'] or 0,-(m['fpr'] or 0),m['threshold'])
    return max(choices,key=rank)


def policy_rank(choice,hop,ap=0.):
    return (choice['feasible'],choice['recall'] or 0,choice['f1'] or 0,-(choice['fpr'] or 0),hop,ap) if choice['feasible'] else (False,choice['f1'] or 0,choice['recall'] or 0,-(choice['fpr'] or 0),hop,ap)


def train(features,records,protocol,out):
    train_ids=[i for i,r in enumerate(records) if r['split']=='train'];val_ids=[i for i,r in enumerate(records) if r['split']=='validation']
    training=np.concatenate([features[i] for i in train_ids]);mean=training.mean(axis=0);std=np.maximum(training.std(axis=0),.05)
    max_frames=max(len(features[i]) for i in train_ids)
    bags=np.zeros((len(train_ids),max_frames,1024),dtype=np.float32);mask=np.zeros((len(train_ids),max_frames),dtype=bool)
    for n,i in enumerate(train_ids):bags[n,:len(features[i])]=(features[i]-mean)/std;mask[n,:len(features[i])]=True
    y=np.array([records[i]['target'] for i in train_ids],dtype=np.float32)
    vy=np.array([records[i]['target'] for i in val_ids]);vx=np.concatenate([(features[i]-mean)/std for i in val_ids])
    lengths=[len(features[i]) for i in val_ids];offsets=np.cumsum([0]+lengths)
    candidates=[];champion=None;selected_model=None;histories={}
    for index,config in enumerate(protocol['candidates']):
        tf.keras.backend.clear_session();tf.keras.utils.set_random_seed(protocol['seed']+index)
        model=tf.keras.Sequential([tf.keras.Input(shape=(1024,))])
        if config['hidden']:model.add(tf.keras.layers.Dense(config['hidden'],activation='relu',kernel_regularizer=tf.keras.regularizers.L2(config['l2'])))
        model.add(tf.keras.layers.Dense(1,kernel_regularizer=tf.keras.regularizers.L2(config['l2'])))
        optimizer=tf.keras.optimizers.Adam(.003 if config['hidden'] else .01)
        pos_weight=min(10.,float((y==0).sum()/max(1,(y==1).sum())))
        @tf.function(reduce_retracing=True)
        def step(x,m,label):
            with tf.GradientTape() as tape:
                logits=tf.reshape(model(tf.reshape(x,[-1,1024]),training=True),[tf.shape(x)[0],tf.shape(x)[1]])
                pooled=tf.reduce_max(tf.where(m,logits,tf.constant(-1e6,dtype=tf.float32)),axis=1)
                loss=tf.reduce_mean(tf.nn.weighted_cross_entropy_with_logits(label,pooled,pos_weight))
                loss+=tf.add_n(model.losses)
            gradients=tape.gradient(loss,model.trainable_variables);optimizer.apply_gradients(zip(gradients,model.trainable_variables));return loss
        best_ap=-1.;best_checkpoint=None;stale=0;history=[];best_weights=None
        rng=np.random.default_rng(protocol['seed']+index)
        for epoch in range(1,protocol['max_epochs']+1):
            order=rng.permutation(len(y));losses=[]
            for start in range(0,len(y),protocol['batch_clips']):
                b=order[start:start+protocol['batch_clips']];losses.append(float(step(bags[b],mask[b],y[b])))
            if epoch%protocol['evaluate_every_epochs']:continue
            vp=expit(model(vx,training=False).numpy().reshape(-1));clip_scores=np.array([vp[offsets[n]:offsets[n+1]].max() for n in range(len(val_ids))])
            ap=float(average_precision_score(vy,clip_scores));best_ap=max(best_ap,ap)
            checkpoint=max(policy_rank(choose_threshold(vy,np.array([vp[offsets[n]:offsets[n+1]:stride].max() for n in range(len(val_ids))]),protocol),hop,ap) for hop,stride in [(.48,2),(.24,1)])
            history.append({'epoch':epoch,'train_loss':float(np.mean(losses)),'validation_ap':ap,'validation_policy_rank':checkpoint})
            if best_checkpoint is None or checkpoint>best_checkpoint:best_checkpoint=checkpoint;best_weights=model.get_weights();stale=0
            else:stale+=1
            if stale>=protocol['early_stop_evaluations']:break
        model.set_weights(best_weights);histories[config['name']]=history
        vp=expit(model(vx,training=False).numpy().reshape(-1))
        for hop,stride in [(.48,2),(.24,1)]:
            peaks=np.array([vp[offsets[n]:offsets[n+1]:stride].max() for n in range(len(val_ids))])
            choice=choose_threshold(vy,peaks,protocol)
            result={'model':config['name'],'config':config,'hop_seconds':hop,'stride':stride,
                'validation_average_precision':float(average_precision_score(vy,peaks)),
                'epochs':epoch,'early_stopped':stale>=protocol['early_stop_evaluations'],**choice}
            candidates.append(result)
            rank=policy_rank(choice,hop)
            if champion is None or rank>champion[0]:
                champion=(rank,result);selected_model=tf.keras.models.clone_model(model);selected_model.set_weights(model.get_weights())
        print('TRAINED',config['name'],'epochs',epoch,'best val AP',best_ap,'best feasible',champion[1]['feasible'],flush=True)
    selected=champion[1];dump(out/'training-history.json',histories);dump(out/'validation-candidates.json',candidates)
    # Freeze the selection on disk before looking at any test predictions.
    dump(out/'selection-locked-before-test.json',selected)
    weights=selected_model.get_weights();weights[0]=weights[0]/std[:,None];weights[1]=weights[1]-mean@weights[0]
    selected_model.set_weights(weights)
    selected_model.save(out/'bicycle_bell_head.keras')
    exported=tf.keras.Sequential([tf.keras.Input(shape=(1024,)),selected_model,tf.keras.layers.Activation('sigmoid')])
    converter=tf.lite.TFLiteConverter.from_keras_model(exported);converted=converter.convert();(out/'bicycle_bell_head.tflite').write_bytes(converted)
    np.savez(out/'bicycle_bell_head_weights.npz',**{f'weight_{i}':w for i,w in enumerate(weights)})
    return selected_model,selected


def evaluate(model,selected,features,scores,records,protocol,out):
    test_ids=[i for i,r in enumerate(records) if r['split']=='test'];truth=np.array([records[i]['target'] for i in test_ids]);stride=selected['stride'];threshold=selected['threshold']
    head=tf.lite.Interpreter(model_path=str(out/'bicycle_bell_head.tflite'),num_threads=1);head.allocate_tensors();input_index=head.get_input_details()[0]['index'];output_index=head.get_output_details()[0]['index']
    head_probs=[];latencies=[];parity=[]
    for i in test_ids:
        predictions=[]
        for embedding in features[i]:
            began=time.perf_counter();head.set_tensor(input_index,embedding[None,:]);head.invoke();p=float(head.get_tensor(output_index)[0,0]);latencies.append((time.perf_counter()-began)*1000);predictions.append(p)
        expected=expit(model(features[i],training=False).numpy().reshape(-1));parity.append(float(np.max(np.abs(expected-predictions))));head_probs.append(np.array(predictions))
    if max(parity)>1e-4:raise RuntimeError('Exported head parity failed')
    policies={
        'trained_selected':np.array([p[::stride].max()>=threshold for p in head_probs]),
        'trained_same_480ms_hop':np.array([p[::2].max()>=threshold for p in head_probs]),
        'v1615_bicycle_raw_0.10':np.array([scores[i][::2,0].max()>=.1 for i in test_ids]),
        'v1615_displayed_bicycle_exact_rule':np.array(['Bicycle bell' in records[i]['site_winners'][::2] for i in test_ids]),
        'v1615_any_of_11_warning_classes':np.array([any(w is not None for w in records[i]['site_winners'][::2]) for i in test_ids])
    }
    reports={name:metrics(truth,pred) for name,pred in policies.items()}
    peaks=np.array([p[::stride].max() for p in head_probs]);trained=policies['trained_selected']
    per_category={}
    for kind in sorted(set(records[i]['category'] for i in test_ids)):
        ids=[n for n,i in enumerate(test_ids) if records[i]['category']==kind]
        per_category[kind]={'clips':len(ids),'positive_predictions':int(trained[ids].sum()),'actual_positive':int(truth[ids].sum())}
    errors=[];prediction_rows=[];first_detections=[];baseline_first=[]
    for n,i in enumerate(test_ids):
        r=records[i];p=head_probs[n]
        positive_indices=np.flatnonzero(p[::stride]>=threshold)*stride
        baseline_indices=np.flatnonzero(scores[i][::2,0]>=.1)*2
        if truth[n] and len(positive_indices):first_detections.append(r['window_ends'][positive_indices[0]])
        if truth[n] and len(baseline_indices):baseline_first.append(r['window_ends'][baseline_indices[0]])
        if int(trained[n])!=int(truth[n]):
            errors.append({**{k:r[k] for k in ['id','title','uploader','category','source_url','audio_url','duration','license']},
                'error':'false_negative' if truth[n] else 'false_positive','target':int(truth[n]),'peak':float(peaks[n])})
        for w,prob in enumerate(p):prediction_rows.append([r['id'],r['target'],r['category'],r['window_ends'][w],float(prob),*map(float,scores[i][w]),r['site_winners'][w]])
    with (out/'test-window-predictions.csv').open('w',newline='') as f:
        writer=csv.writer(f);writer.writerow(['id','clip_truth','category','window_end_seconds','trained_score',*NAMES,'site_winner']);writer.writerows(prediction_rows)
    runtime={'head_inference_ms':distribution(latencies),'export_max_abs_error':max(parity),
        'trained_file_start_to_first_positive_seconds':distribution(first_detections),
        'baseline_file_start_to_first_positive_seconds':distribution(baseline_first),
        'event_onset_latency':None,'hardware_microphone_latency':None,
        'note':'The two file-start distributions may cover different detected clips; neither measures onset latency.'}
    encoder_check=json.loads((out/'encoder-check.json').read_text())
    report={'status':'real_training_and_locked_test_completed','selection_feasible_on_validation':selected['feasible'],
        'selected':selected,'test_clips':len(test_ids),'test_positive':int(truth.sum()),'test_negative':int((1-truth).sum()),
        'test_average_precision':float(average_precision_score(truth,peaks)),
        'policies':reports,'negative_and_positive_category_breakdown':per_category,'timing':runtime,
        'encoder':encoder_check,'false_positive_count':reports['trained_selected']['fp'],'false_negative_count':reports['trained_selected']['fn'],
        'limitations':['Custom uploader-disjoint subset, not official FSD50K benchmark split.',
            'FSD50K human clip tags are weak labels; absence of a bicycle tag does not prove absence of an audible bicycle.',
            'Uploader grouping plus byte and normalized PCM hashes reduces leakage but cannot rule out all cross-uploader re-recordings.',
            'Public pretrained YAMNet training-data independence is not certified.',
            'No precise event timestamps, real microphone latency, iPad Safari performance or road-environment accuracy measured.',
            'The full-site 11-class warning metric counts legitimate non-bicycle warnings as positive outputs and is context only, not a bicycle-specific classifier.']}
    dump(out/'metrics.json',report);dump(out/'test-errors.json',errors)
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,2,figsize=(8,3.7))
    for axis,name,title in zip(axes,['v1615_bicycle_raw_0.10','trained_selected'],['Original YAMNet bicycle >= 0.10','Trained head (locked threshold)']):
        matrix=np.array(reports[name]['confusion_matrix']);axis.imshow(matrix,cmap='Blues');axis.set_title(title,fontsize=10)
        axis.set_xticks([0,1],['not bicycle','bicycle']);axis.set_yticks([0,1],['not bicycle','bicycle']);axis.set_xlabel('Predicted');axis.set_ylabel('True clip label')
        for row in range(2):
            for col in range(2):axis.text(col,row,str(matrix[row,col]),ha='center',va='center',color='red')
    fig.tight_layout();fig.savefig(out/'confusion-matrices.png',dpi=160);plt.close(fig)
    print('LOCKED TEST',json.dumps({'n':len(test_ids),'selection':selected['model'],'hop':selected['hop_seconds'],'policies':reports}),flush=True)
    return report


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',default=os.environ.get('BELL_RESULTS','bell-results'));parser.add_argument('--cache',default='bell-cache');args=parser.parse_args()
    out=pathlib.Path(args.out);cache=pathlib.Path(args.cache);out.mkdir(exist_ok=True,parents=True);cache.mkdir(exist_ok=True,parents=True)
    if (out/'metrics.json').exists():raise RuntimeError('Refusing to silently overwrite a completed test; use a fresh experiment output')
    protocol=json.loads((HERE/'protocol.json').read_text());dump(out/'protocol.json',protocol)
    tf.config.threading.set_inter_op_parallelism_threads(1);tf.config.threading.set_intra_op_parallelism_threads(2)
    started=time.perf_counter()
    try:
        records=collect(protocol,cache,out);features,scores=extract(records,protocol,cache,out)
        model,selected=train(features,records,protocol,out)
        report=evaluate(model,selected,features,scores,records,protocol,out)
        dump(out/'reproduction.json',{'git_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
            'protocol_sha256':digest((HERE/'protocol.json').read_bytes()),'platform':platform.platform(),
            'python':sys.version,'tensorflow':tf.__version__,'numpy':np.__version__,'elapsed_seconds':time.perf_counter()-started,
            'packages':subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True).splitlines()})
        (out/'MODEL-NOTICE.txt').write_text('Research only. Frozen YAMNet derived encoder: original MediaPipe YAMNet, Apache-2.0; only outputs changed. Original SHA256 '+protocol['yamnet_sha256']+'. Trained head requires this encoder and the recorded feature dequantization. Not integrated into the website. No traffic safety guarantee.\n')
        (out/'APACHE-2.0.txt').write_bytes((REPO/'APACHE-2.0.txt').read_bytes())
        checksums={p.name:digest(p.read_bytes()) for p in out.iterdir() if p.is_file() and p.name!='SHA256SUMS.json'};dump(out/'SHA256SUMS.json',checksums)
    except Exception as error:
        dump(out/'failure.json',{'error':str(error),'elapsed_seconds':time.perf_counter()-started});raise


if __name__=='__main__':main()

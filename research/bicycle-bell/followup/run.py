"""Round 2 development only: never open the old test audio or claim a fresh test."""
import sys,pathlib,json,os,hashlib,csv,io,collections,time,subprocess
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import experiment as e
import numpy as np
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE=e.HERE; OUT=pathlib.Path('bell-round2');OUT.mkdir(exist_ok=True)
CACHE=pathlib.Path(os.environ['RUNNER_TEMP'])/'bell-cache'
p=json.loads((HERE/'protocol.json').read_text())
p.update(experiment='bicycle-bell-20261102-round2-development',validation_min_precision=0.,validation_max_fpr=.049,candidates=[{'name':'linear_recall_l2_0.001','hidden':0,'l2':.001},{'name':'mlp64_recall_l2_0.001','hidden':64,'l2':.001}],max_epochs=120)
e.dump(OUT/'protocol.json',p)
e.tf.config.threading.set_inter_op_parallelism_threads(1);e.tf.config.threading.set_intra_op_parallelism_threads(2)
old=json.loads((HERE/'results/20261102-v1/manifest.json').read_text())['records']
# Metadata audit enumerates ALL license-permitted positives, independently of scores.
root=f'https://huggingface.co/datasets/{p["dataset_repo"]}/resolve/{p["dataset_revision"]}/'
new=[];audit=[]
oldids={r['id'] for r in old}; blocked_authors={r['uploader'].casefold() for r in old if r['split']!='train'}
for split in ['dev','eval']:
    labels=list(csv.DictReader(io.StringIO(e.fetch(root+f'labels/{split}.csv',CACHE/f'{split}.csv').decode())))
    meta=json.loads(e.fetch(root+f'metadata/{split}_clips_info_FSD50K.json',CACHE/f'{split}-info.json'))
    for row in labels:
        info=meta[row['fname']]; labels_=row['labels'].split(','); kind=e.category(labels_,info.get('title',''))
        if 'Bicycle_bell' in labels_: audit.append({'id':row['fname'],'uploader':info.get('uploader'),'license':info.get('license'),'used_in_v1':row['fname'] in oldids})
        if row['fname'] in oldids or kind is None or kind=='bicycle_bell':continue
        if not e.allowed_license(info.get('license','')) or not info.get('uploader'):continue
        if info['uploader'].casefold() in blocked_authors:continue
        new.append(dict(id=row['fname'],original_split=split,labels=labels_,target=0,category=kind,title=info.get('title',''),uploader=info['uploader'],license=info['license'],license_group=e.allowed_license(info['license']),source_url=f'https://freesound.org/s/{row["fname"]}/',audio_url=root+f'clips/{split}/{row["fname"]}.wav',split='train'))
e.dump(OUT/'positive-source-audit.json',audit)
# Fixed 60/category; one additional recording per uploader. No score-dependent mining.
selected=[];counts=collections.Counter();authors=set()
for r in sorted(new,key=lambda r:e.digest(('round2'+r['id']).encode())):
    a=r['uploader'].casefold()
    if counts[r['category']]>=60 or a in authors:continue
    selected.append(r);counts[r['category']]+=1;authors.add(a)
e.dump(OUT/'additional-data-before-download.json',selected)
# Reuse original feature arrays if present, otherwise re-extract train/validation only.
records=[dict(r) for r in old if r['split']!='test']; features=[];scores=[]
feature_path=CACHE/'features.npz';reuse=feature_path.exists()
if reuse:
    z=np.load(feature_path)
    for i,r in enumerate(old):
        if r['split']=='test':continue
        features.append(z[f'x{i}']);scores.append(z[f's{i}'])
    z.close()
else:
    for r in records:e.fetch(r['audio_url'],CACHE/'audio'/(r['id']+'.wav'))
    features,scores=e.extract(records,p,CACHE,OUT)
# Validate cache identity through source audio hashes, never silently trust array order alone.
for r,x,s in zip(records,features,scores):
    assert e.digest((CACHE/'audio'/(r['id']+'.wav')).read_bytes())==r['sha256']
    assert x.shape[1]==1024 and s.shape==(len(x),len(e.NAMES))
fail=[];extra=[];seen={r['sha256'] for r in old};seenpcm={r['pcm_group'] for r in old}
for r in selected:
    try:
        data=e.fetch(r['audio_url'],CACHE/'audio'/(r['id']+'.wav'))
        audio,rate=e.sf.read(io.BytesIO(data),dtype='float32',always_2d=True);mono=audio.mean(axis=1)
        if len(mono)/rate>30.01 or not np.isfinite(mono).all():raise ValueError('duration/PCM')
        g=e.math.gcd(rate,16000);pcm=e.resample_poly(mono,16000//g,rate//g);peak=np.abs(pcm).max()
        if peak:pcm=pcm/peak
        sha=e.digest(data);ph=e.digest(np.round(pcm*2047).astype('<i2').tobytes())
        if sha in seen or ph in seenpcm:raise ValueError('duplicate of existing data')
        seen.add(sha);seenpcm.add(ph)
        r.update(sha256=sha,pcm_group=ph,sample_rate=rate,duration=len(mono)/rate,group='uploader:'+r['uploader'].casefold());extra.append(r)
    except Exception as err:fail.append({'id':r['id'],'error':str(err)})
e.dump(OUT/'download-failures.json',fail)
# Separate extraction cache prevents overwriting the verified v1 cache.
if extra:
    ec=CACHE/'round2-extra';ec.mkdir(exist_ok=True);(ec/'audio').symlink_to(CACHE/'audio',target_is_directory=True) if not (ec/'audio').exists() else None
    xf,sf=e.extract(extra,p,ec,OUT);records+=extra;features+=xf;scores+=sf
for key in ['uploader','sha256','pcm_group']:
    vals={r[key].casefold() for r in records if r['split']=='validation'}
    assert not vals & {r[key].casefold() for r in records if r['split']=='train'},key
assert not {r['id'] for r in records}&{r['id'] for r in old if r['split']=='test'}
e.dump(OUT/'development-manifest.json',{'records':records,'reused_v1_feature_cache':reuse,'additional_negative_clips':len(extra),'old_test_audio_excluded':True})
vi=[i for i,r in enumerate(records) if r['split']=='validation'];ti=[i for i,r in enumerate(records) if r['split']=='train'];y=np.array([records[i]['target'] for i in vi]);results=[];valpred={}
def add(name,peaks):
    choice=e.choose_threshold(y,np.asarray(peaks),p);choice.update(model=name,fnr=1-choice['recall'],scope='development validation; not fresh independent test');results.append(choice);valpred[name]=list(map(float,peaks));return choice
# Equal 240ms inference and clip-max pooling across strategies.
b=np.array([scores[i][:,0].max() for i in vi]);add('yamnet_bicycle_threshold',b)
for cols,name in [([0,6],'bicycle_or_bell'),([0,6,7,8,9],'five_bell_classes')]:
    add(name,[scores[i][:,cols].max() for i in vi])
weights=np.load(HERE/'results/20261102-v1/bicycle_bell_head_weights.npz');w=[weights[f'weight_{i}'] for i in range(len(weights.files))]
def old_predict(x):return expit(np.maximum(0,x@w[0]+w[1])@w[2]+w[3]).reshape(-1)
a=add('saved_v1_head_rethreshold',[old_predict(features[i]).max() for i in vi])
oldp=np.asarray(valpred['saved_v1_head_rethreshold']);results.append(dict(model='saved_v1_head_original_threshold',threshold=.7501617074012756,**e.metrics(y,oldp>=.7501617074012756)))
# Score-space training tests whether negative bell categories help discriminate lookalikes.
pooled=np.array([np.r_[s.max(axis=0),s.mean(axis=0)] for s in scores]);ty=np.array([records[i]['target'] for i in ti])
for c in [.1,1.,10.]:
    m=make_pipeline(StandardScaler(),LogisticRegression(C=c,class_weight='balanced',max_iter=2000,random_state=20261102));m.fit(pooled[ti],ty);add('score_logistic_C'+str(c),m.predict_proba(pooled[vi])[:,1])
    import joblib
    joblib.dump(m,OUT/('score_logistic_C'+str(c)+'.joblib'))
model,choice=e.train(features,records,p,OUT)
newp=[expit(model(features[i],training=False).numpy().reshape(-1)).max() for i in vi];add('new_mil_head',newp)
# Bounded fusion search on validation only, no evaluation of the previous test.
for alpha in [.25,.5,.75]:add('yamnet_mil_fusion_'+str(alpha),alpha*b+(1-alpha)*np.asarray(newp))
for result in results:
    if 'recall' in result:result['fnr']=1-result['recall']
    result['scope']='development validation only'
e.dump(OUT/'validation-comparison.json',results);e.dump(OUT/'validation-clip-scores.json',{'ids':[records[i]['id'] for i in vi],'truth':y.tolist(),'scores':valpred})
for x in results:print('VALIDATION',json.dumps(x),flush=True)
newpositives=[r for r in audit if not r['used_in_v1'] and e.allowed_license(r['license'] or '')]
e.dump(OUT/'status.json',{'status':'development_completed_no_fresh_final_test','fresh_license_permitted_positives_in_pinned_source':len(newpositives),'additional_negative_clips':len(extra),'target_achieved':False,'reason':'All CC0/CC-BY bicycle positives in this pinned source were already consumed in v1. No unseen final-positive cohort available. Validation results cannot establish success.','event_level_metrics':None,'event_reason':'No reliable onset/offset annotations or continuous background timeline.','source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()})
e.dump(OUT/'SHA256SUMS.json',{f.name:e.digest(f.read_bytes()) for f in OUT.iterdir() if f.is_file() and f.name!='SHA256SUMS.json'})

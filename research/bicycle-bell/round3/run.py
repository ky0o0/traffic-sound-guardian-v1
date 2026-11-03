"""Expanded positive speakers and real-background augmentation; development only."""
import sys,pathlib,os,json,re,io,collections,math,subprocess,hashlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import experiment as e
import numpy as np
from scipy.special import expit
O=pathlib.Path('bell-round3');O.mkdir(exist_ok=True);C=pathlib.Path(os.environ['RUNNER_TEMP'])/'bell-cache'
p=json.loads((e.HERE/'protocol.json').read_text());p.update(experiment='round3-new-uploaders-background-mixing',validation_min_precision=0,validation_max_fpr=.049,max_epochs=120,candidates=[{'name':'linear_new_speakers','hidden':0,'l2':.001},{'name':'mlp32_new_speakers','hidden':32,'l2':.01},{'name':'mlp64_new_speakers','hidden':64,'l2':.001}]);e.dump(O/'protocol.json',p)
e.tf.config.threading.set_inter_op_parallelism_threads(1);e.tf.config.threading.set_intra_op_parallelism_threads(2)
old=json.loads((e.HERE/'results/20261102-v1/manifest.json').read_text())['records'];usedauthors={r['uploader'].casefold() for r in old}
audit=json.loads((e.HERE/'results/source-discovery/new-freesound-metadata.json').read_text())['candidates'];eligible=[]
for r in audit:
 title=r.get('metadata',{}).get('og:audio:title','')
 license_=next((l for l in r.get('licenses',[]) if e.allowed_license(l)),None)
 urls=[u for u in r.get('media_urls',[]) if u.startswith('https://cdn.freesound.org/') and u.endswith('-hq.mp3')]
 if not license_ or not urls or not re.search('bicycle|bike|fiets|fahrrad|vélo|bixi',title,re.I) or re.search('smartphone|synthe',title,re.I):continue
 assert r['uploader'].casefold() not in usedauthors
 bucket=int(e.digest(('round3-author:'+r['uploader'].casefold()).encode())[:8],16)%5
 split={0:'reserved_final',1:'validation'}.get(bucket,'train')
 eligible.append(dict(id=r['id'],uploader=r['uploader'],source_url=r['url'],audio_url=urls[0],license=license_,title=title,target=1,category='bicycle_bell',split=split,group='new:'+r['uploader'].casefold(),label_status='uploader title weak label; independent listening review pending'))
e.dump(O/'new-data-allocation-before-inference.json',eligible)
records=[dict(r) for r in old if r['split']!='test'];features=[];scores=[];z=np.load(C/'features.npz')
for i,r in enumerate(old):
 if r['split']=='test':continue
 assert e.digest((C/'audio'/(r['id']+'.wav')).read_bytes())==r['sha256']
 features.append(z[f'x{i}']);scores.append(z[f's{i}'])
z.close();extra=[];fails=[];seen={r['sha256'] for r in old};pcms={r['pcm_group'] for r in old}
for r in eligible:
 if r['split']=='reserved_final':continue # Sealed: no audio downloading or scoring.
 try:
  data=e.fetch(r['audio_url'],C/'new-mp3'/(r['id']+'.mp3'));audio,rate=e.sf.read(io.BytesIO(data),dtype='float32',always_2d=True);audio=audio.mean(axis=1)
  if not len(audio) or len(audio)/rate>30.01 or not np.isfinite(audio).all():raise ValueError('invalid or >30s recording; not truncated')
  g=math.gcd(rate,16000);canonical=e.resample_poly(audio,16000//g,rate//g);peak=np.abs(canonical).max()
  if peak:canonical/=peak
  pcm=e.digest(np.round(canonical*2047).astype('<i2').tobytes());sha=e.digest(data)
  if sha in seen or pcm in pcms:raise ValueError('duplicate')
  seen.add(sha);pcms.add(pcm);r.update(sha256=sha,pcm_group=pcm,sample_rate=rate,duration=len(audio)/rate)
  e.sf.write(C/'audio'/(r['id']+'.wav'),audio,rate,subtype='FLOAT');extra.append(r)
 except Exception as err:fails.append({'id':r['id'],'error':str(err)})
e.dump(O/'download-failures.json',fails)
# Real, training-only environment mixtures at 10 and 20dB SNR; not extra independent recordings.
backgrounds=[r for r in records if r['split']=='train' and r['category']=='environment'];aug=[]
for n,r in enumerate(extra):
 if r['split']!='train':continue
 signal,rate=e.sf.read(C/'audio'/(r['id']+'.wav'),dtype='float32')
 for k,snr in enumerate([10,20]):
  bg=backgrounds[(n*2+k)%len(backgrounds)];noise,nrate=e.sf.read(C/'audio'/(bg['id']+'.wav'),dtype='float32',always_2d=True);noise=noise.mean(axis=1);g=math.gcd(rate,nrate);noise=e.resample_poly(noise,rate//g,nrate//g);noise=np.resize(noise,len(signal))
  gain=np.sqrt(np.mean(signal**2))/(np.sqrt(np.mean(noise**2))+1e-8)*10**(-snr/20);mix=signal+noise*gain;mix/=max(1.,float(np.abs(mix).max()))
  ar=dict(r,id=r['id']+'_snr'+str(snr),augmentation={'type':'real_training_environment_mix','background_id':bg['id'],'snr_db':snr});e.sf.write(C/'audio'/(ar['id']+'.wav'),mix,rate,subtype='FLOAT');aug.append(ar)
extra+=aug
for key in ['uploader','pcm_group']:
 a={r[key].casefold() for r in records+extra if r['split']=='train'};b={r[key].casefold() for r in records+extra if r['split']=='validation'};assert not a&b,key
if extra:
 ec=C/'round3';ec.mkdir(exist_ok=True);(ec/'audio').symlink_to(C/'audio',target_is_directory=True)
 xf,sf=e.extract(extra,p,ec,O);features+=xf;scores+=sf;records+=extra
assert not {r['id'] for r in records}&{r['id'] for r in old if r['split']=='test'}
e.dump(O/'development-manifest.json',{'records':records,'new_original_clips':len(extra)-len(aug),'augmented_bags':len(aug),'sealed_final_audio_not_loaded':True})
vi=[i for i,r in enumerate(records) if r['split']=='validation'];y=np.array([records[i]['target'] for i in vi]);report=[]
def add(name,peaks,threshold=None):
 peaks=np.asarray(peaks);m=e.choose_threshold(y,peaks,p) if threshold is None else dict(threshold=threshold,**e.metrics(y,peaks>=threshold));m.update(model=name,fnr=1-m['recall'],scope='development validation only');report.append(m)
 return m
b=np.array([scores[i][:,0].max() for i in vi]);add('original_yamnet_fixed_0.1',b,.1);add('yamnet_rethreshold',b)
for cols,name in [([0,6],'two_bells'),([0,6,7,8,9],'five_bells')]:add(name,[scores[i][:,cols].max() for i in vi])
z=np.load(e.HERE/'results/20261102-v1/bicycle_bell_head_weights.npz');w=[z[f'weight_{i}'] for i in range(len(z.files))];oldpeaks=[expit(np.maximum(0,features[i]@w[0]+w[1])@w[2]+w[3]).max() for i in vi];add('saved_head_fixed',oldpeaks,.7501617074012756);add('saved_head_rethreshold',oldpeaks)
model,choice=e.train(features,records,p,O);npred=[expit(model(features[i],training=False).numpy().reshape(-1)).max() for i in vi];add('new_speakers_mil',npred)
for alpha in [.25,.5,.75]:add('fusion_'+str(alpha),alpha*b+(1-alpha)*np.array(npred))
e.dump(O/'validation-comparison.json',report)
e.dump(O/'validation-scores.json',{'records':[dict(id=records[i]['id'],uploader=records[i]['uploader'],truth=records[i]['target']) for i in vi],'new_head_peaks':list(map(float,npred))})
e.dump(O/'status.json',{'target_achieved':False,'fresh_final_test_executed':False,'sealed_positive_recordings':sum(r['split']=='reserved_final' for r in eligible),'validation_clips':len(vi),'validation_positive':int(y.sum()),'reason':'New sources remain weakly labelled, with no independent listening/event annotation. Small reserved cohort and no reserved negative cohort do not support final verification. Validation tuning is not a final test.','actual_source_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()})
for m in report:print('VALIDATION',json.dumps(m),flush=True)
e.dump(O/'SHA256SUMS.json',{f.name:e.digest(f.read_bytes()) for f in O.iterdir() if f.is_file() and f.name!='SHA256SUMS.json'})

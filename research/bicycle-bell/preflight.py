"""Read public FSD50K metadata and verify a real audio download on the runner."""
import csv
import hashlib
import io
import json
import os
import pathlib
import urllib.request

REVISION = 'ccf1acaff12f3f4a4c10052dddafbb6d22152c9b'
ROOT = f'https://huggingface.co/datasets/Fhrozen/FSD50k/resolve/{REVISION}/'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent':'TrafficSoundGuardian-research/1'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main():
    out = pathlib.Path(os.environ.get('BELL_RESULTS','bell-results')); out.mkdir(exist_ok=True,parents=True)
    report = {'revision':REVISION,'files':{},'audio':[]}
    try:
        for split in ['dev','eval']:
            rows = list(csv.DictReader(io.StringIO(fetch(ROOT+f'labels/{split}.csv').decode())))
            meta_bytes = fetch(ROOT+f'metadata/{split}_clips_info_FSD50K.json')
            meta = json.loads(meta_bytes)
            positive = [r for r in rows if 'Bicycle_bell' in r['labels'].split(',')]
            report['files'][split] = {'rows':len(rows),'bicycle_bell':len(positive),'metadata_type':type(meta).__name__,
                'metadata_sha256':hashlib.sha256(meta_bytes).hexdigest(),'first_label':rows[0],
                'first_metadata':next(iter(meta.items())) if isinstance(meta,dict) else meta[0]}
            for r in positive[:1]:
                item={'id':r['fname'],'split':split,'metadata':meta.get(str(r['fname'])) if isinstance(meta,dict) else None}
                for folder in (['dev','train'] if split=='dev' else ['eval']):
                    try:
                        audio=fetch(ROOT+f'clips/{folder}/{r["fname"]}.wav')
                        item.update(folder=folder,bytes=len(audio),sha256=hashlib.sha256(audio).hexdigest());break
                    except Exception as error:item.setdefault('attempts',[]).append({'folder':folder,'error':str(error)})
                report['audio'].append(item)
        print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
        if any('bytes' not in x for x in report['audio']):raise RuntimeError('No downloadable audio for a split')
    except Exception as error:
        report['error']=str(error);raise
    finally:
        (out/'preflight.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()

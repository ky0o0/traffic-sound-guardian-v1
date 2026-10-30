#!/usr/bin/env python3
"""Source discovery only. Never silently promotes filename labels to clean references."""
import argparse, hashlib, html, json, re, time, urllib.request
from pathlib import Path
from html.parser import HTMLParser
import numpy as np
import soundfile as sf

class Text(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_data(self,d): self.parts.append(d)
def plain(s):
    p=Text();p.feed(s);return re.sub(r'\s+',' ',html.unescape(' '.join(p.parts))).strip()
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'TrafficSoundGuardianResearch/2.0 (noncommercial audio research)'})
    with urllib.request.urlopen(req,timeout=90) as r:return r.read()
def save(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
def describe(path):
    info=sf.info(path); x,sr=sf.read(path,always_2d=True)
    if len(x)==0 or not np.isfinite(x).all():raise ValueError('Invalid source')
    powers=np.mean(x*x,axis=0)
    corr=float(np.corrcoef(x.T)[0,1]) if x.shape[1]==2 and min(powers)>0 else None
    delta=float(np.mean((x[:,0]-x[:,1])**2)/np.mean(x*x)) if x.shape[1]==2 else None
    return dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,rate=sr,channels=info.channels,frames=info.frames,duration=info.duration,subtype=info.subtype,lr_correlation=corr,relative_lr_difference=delta)
def main():
    a=argparse.ArgumentParser();a.add_argument('--output',type=Path,required=True);args=a.parse_args();root=args.output;root.mkdir(parents=True,exist_ok=True)
    (root/'pages').mkdir(exist_ok=True);(root/'originals').mkdir(exist_ok=True)
    found={};rows=[];errors=[]
    queries=['horn','horn&page=2','horn&page=3','siren','traffic','wind','crowd']
    for q in queries:
        url='https://bigsoundbank.com/search?q='+q
        try:
            raw=get(url).decode();(root/'pages'/('search_'+q.replace('&','_')+'.html')).write_text(raw)
        except Exception as e:errors.append(dict(url=url,error=str(e)));continue
        for match in re.finditer(r'href=["\']([^"\']+-s(\d+)\.html)["\']',raw):
            link,sid=match.group(1),match.group(2)
            found[sid]=link if link.startswith('http') else 'https://bigsoundbank.com/'+link.lstrip('/')
    ids=['0254','0255','0257','0258','0259','0260','0558','0850','0968','0970','2721','0886','0887','1463','1464','1465','1466','1467','2731','2760','0124','2717','0908','2969','0122']
    # Exact previously verified links remain usable if search HTML changes.
    for sid,slug in [('0258','recent-car-horn-2'),('0260','car-horn-4'),('0124','rain-and-storm'),('2717','storm-and-rain-3'),('2731','vehicle-siren'),('2760','gendarmerie-motorcycle-crossing')]:found.setdefault(sid,f'https://bigsoundbank.com/{slug}-s{sid}.html')
    for sid in ids:
        if sid not in found:errors.append(dict(id=sid,error='No canonical source link discovered'));continue
        url=found[sid]
        try:
            raw=get(url).decode();(root/'pages'/(sid+'.html')).write_text(raw);text=plain(raw)
            if not re.search(r'CC0|public.domain',text,re.I):raise ValueError('No explicit CC0 evidence')
            path=root/'originals'/('bsb_'+sid+'.wav');path.write_bytes(get(f'https://bigsoundbank.com/UPLOAD/bwf-en/{sid}.wav'))
            title=plain(re.search(r'<h1[^>]*>(.*?)</h1>',raw,re.S).group(1))
            # Keep publisher's technical description intact for manual review.
            start=text.find('Technical details'); stop=text.find('Other interesting',start)
            details=text[start:stop if stop>start else start+900]
            row=dict(id='bsb_'+sid,provider='BigSoundBank',source_page=url,download_url=f'https://bigsoundbank.com/UPLOAD/bwf-en/{sid}.wav',title=title,license='CC0-1.0',license_url='https://creativecommons.org/publicdomain/zero/1.0/',license_evidence='https://bigsoundbank.com/licenses.html',publisher_details=details,publisher_description=text[text.find('Horn of'):text.find('Horn of')+250] if 'Horn of' in text else None,training_overlap='Unknown; not asserted independent of SH training',**describe(path));rows.append(row);print(json.dumps(row),flush=True)
        except Exception as e:errors.append(dict(id=sid,url=url,error=str(e)));print(sid,str(e),flush=True)
        save(root/'inventory.json',rows);save(root/'errors.json',errors)
    # Independent providers: record actual public API responses, including failures.
    for label,url in [('zenodo_iusb','https://zenodo.org/api/records/1213793'),('figshare_lssiren','https://api.figshare.com/v2/articles/19291472'),('freesound','https://freesound.org/search/?q=car+horn')]:
        try:(root/'pages'/(label+'.txt')).write_bytes(get(url))
        except Exception as e:errors.append(dict(provider=label,url=url,error=str(e)))
    for category,query in [('car_horn','car horn filetype:audio'),('siren','emergency vehicle siren filetype:audio')]:
        import urllib.parse
        url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch=query,gsrnamespace=6,gsrlimit=8,prop='imageinfo',iiprop='url|extmetadata'))
        try:
            raw=get(url);(root/'pages'/('commons_'+category+'.json')).write_bytes(raw);obj=json.loads(raw)
            for page in obj.get('query',{}).get('pages',{}).values():
                inf=page['imageinfo'][0];meta=inf.get('extmetadata',{});lic=meta.get('LicenseShortName',{}).get('value','')
                if not re.match(r'CC0|CC BY|Public domain',lic):continue
                sid='commons_'+str(page['pageid']);path=root/'originals'/(sid+Path(inf['url']).suffix)
                try:
                    path.write_bytes(get(inf['url']));row=dict(id=sid,provider='Wikimedia Commons',source_page=inf['descriptionurl'],download_url=inf['url'],title=page['title'],target=category,license=lic,author=plain(meta.get('Artist',{}).get('value','unknown')),license_url=meta.get('LicenseUrl',{}).get('value'),description=plain(meta.get('ImageDescription',{}).get('value','')),reference_kind='unreviewed_scene',training_overlap='Unknown',original_filename=path.name,**describe(path));rows.append(row);print(json.dumps(row),flush=True)
                except Exception as e:errors.append(dict(id=sid,error=str(e)))
        except Exception as e:errors.append(dict(provider='Wikimedia Commons',url=url,error=str(e)))
    save(root/'inventory.json',rows);save(root/'errors.json',errors)
if __name__=='__main__': main()

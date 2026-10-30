#!/usr/bin/env python3
"""Inspect a Zenodo corpus and additional Commons recordings, without access workarounds."""
import argparse, io, json, re, urllib.parse, zipfile
from pathlib import Path
from probe import get, plain, describe, save

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);root=ap.parse_args().output;root.mkdir(parents=True,exist_ok=True);(root/'originals').mkdir(exist_ok=True);rows=[];errors=[];providers=[]
    try:
        obj=json.loads(get('https://zenodo.org/api/records/1213793'));save(root/'zenodo.json',obj)
        providers.append(dict(provider='Zenodo IUSB',license=obj['metadata'].get('license'),files=obj['files']))
        license=obj['metadata'].get('license',{}).get('id','')
        if license not in ['cc-by-4.0','cc-by-3.0','cc0-1.0']:raise ValueError('No accepted explicit dataset license: '+license)
        # This corpus is a 2.3GB ZIP. Read ordinary HTTP byte ranges via remotezip;
        # if range access fails, record the failure instead of bypassing controls.
        from remotezip import RemoteZip
        url=obj['files'][0]['links']['self']
        with RemoteZip(url) as z:
            names=z.namelist();save(root/'iusb_members.json',names)
            selected=[n for n in names if re.search(r'(horn|klaxon|siren|sirene)',n,re.I) and n.lower().endswith('.wav')][:30]
            for name in names:
                if re.search(r'(readme|license|licence|\.csv$|\.txt$)',name,re.I) and z.getinfo(name).file_size<2000000:
                    (root/('iusb_'+Path(name).name)).write_bytes(z.read(name))
            for i,name in enumerate(selected):
                path=root/'originals'/f'iusb_{i:03d}.wav';path.write_bytes(z.read(name));row=dict(id=path.stem,provider='Zenodo IUSB',source_page='https://zenodo.org/records/1213793',download_url=url,archive_member=name,original_filename=path.name,author='Jean-Rémy Gloaguen; Mathieu Lagrange; Arnaud Can; Jean-François Petiot',license=license,license_url='https://creativecommons.org/licenses/'+license.removeprefix('cc-').replace('-','/')+'/',target='car_horn' if re.search(r'horn|klaxon',name,re.I) else 'siren',reference_kind='unreviewed_recorded_event',training_overlap='Unknown; raw source provenance not established',**describe(path));rows.append(row);print(json.dumps(row),flush=True)
    except Exception as e:errors.append(dict(provider='Zenodo IUSB',error=str(e)))
    for target,query in [('car_horn','intitle:horn filetype:audio'),('siren','intitle:siren filetype:audio'),('siren','intitle:sirene filetype:audio')]:
        url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch=query,gsrnamespace=6,gsrlimit=12,prop='imageinfo',iiprop='url|extmetadata'))
        try:
            obj=json.loads(get(url));save(root/('commons_'+query.split()[0].replace(':','_')+'.json'),obj)
            for page in obj.get('query',{}).get('pages',{}).values():
                inf=page['imageinfo'][0];meta=inf.get('extmetadata',{});lic=meta.get('LicenseShortName',{}).get('value','');sid='commons_'+str(page['pageid'])
                if not re.match(r'CC0|CC BY|Public domain',lic) or any(r['id']==sid for r in rows):continue
                suffix=Path(urllib.parse.urlparse(inf['url']).path).suffix
                path=root/'originals'/(sid+suffix)
                try:
                    path.write_bytes(get(inf['url']));row=dict(id=sid,provider='Wikimedia Commons',source_page=inf['descriptionurl'],download_url=inf['url'],title=page['title'],target=target,license=lic,author=plain(meta.get('Artist',{}).get('value','unknown')),license_url=meta.get('LicenseUrl',{}).get('value'),description=plain(meta.get('ImageDescription',{}).get('value','')),reference_kind='unreviewed_scene',training_overlap='Unknown',original_filename=path.name,**describe(path));rows.append(row);print(json.dumps(row),flush=True)
                except Exception as e:
                    errors.append(dict(id=sid,error=str(e)))
                    if getattr(e,'code',None)==429:raise RuntimeError('Provider rate limit; stop Commons discovery')
        except Exception as e:
            errors.append(dict(provider='Wikimedia Commons',url=url,error=str(e)))
            break
    # A genuine recorded stereo road background, selected from canonical search links.
    try:
        search=get('https://bigsoundbank.com/search?q=traffic').decode()
        links=re.findall(r'href=["\']([^"\']+-s\d+\.html)["\']',search)
        url=next(x for x in links if 'under-a-highway-bridge' in x or 'under-highway' in x)
        if not url.startswith('http'):url='https://bigsoundbank.com/'+url.lstrip('/')
        raw=get(url).decode();text=plain(raw);sid='bsb_'+re.search(r'-s(\d+).html',url).group(1)
        if 'CC0' not in text:raise ValueError('No CC0 evidence')
        down='https://bigsoundbank.com/UPLOAD/bwf-en/'+sid[4:]+'.wav';path=root/'originals'/(sid+'.wav');path.write_bytes(get(down));row=dict(id=sid,provider='BigSoundBank',source_page=url,download_url=down,title='Under a highway bridge',target=None,role='background',background_type='traffic',license='CC0-1.0',license_url='https://creativecommons.org/publicdomain/zero/1.0/',author='Joseph SARDIN',description=text[text.find('Technical details'):text.find('Technical details')+700],original_filename=path.name,training_overlap='Unknown',**describe(path));rows.append(row);print(json.dumps(row),flush=True)
    except Exception as e:errors.append(dict(provider='BigSoundBank road',error=str(e)))
    save(root/'inventory.json',rows);save(root/'errors.json',errors);save(root/'providers.json',providers)
    print('PROVIDERS '+json.dumps(providers),flush=True);print('ERRORS '+json.dumps(errors),flush=True)
if __name__=='__main__':main()

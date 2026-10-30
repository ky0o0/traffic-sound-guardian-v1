#!/usr/bin/env python3
import argparse,json,re
from pathlib import Path
from remotezip import RemoteZip
from probe import get,describe,save,plain
URL='https://zenodo.org/api/records/1213793/files/Isolated%20urban%20sound%20database.zip/content'
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);root=ap.parse_args().output;root.mkdir(parents=True,exist_ok=True);(root/'originals').mkdir(exist_ok=True);rows=[]
    with RemoteZip(URL) as z:
        names=z.namelist();save(root/'members.json',names)
        for name in names:
            if re.search(r'(readme|license|licence|\.csv$|\.txt$)',name,re.I) and z.getinfo(name).file_size<2000000:
                content=z.read(name).decode(errors='replace');(root/Path(name).name).write_text(content);print('CORPUS_DOCUMENT '+json.dumps(dict(member=name,content=content)),flush=True)
        possible=[n for n in names if '/background/' in n and re.search(r'traffic|road|car',n,re.I) and n.endswith('.wav')]
        print('BACKGROUND_CANDIDATES '+json.dumps(possible),flush=True)
        for i,name in enumerate(possible[:20]):
            path=root/'originals'/f'iusb_road_{i:02d}.wav';path.write_bytes(z.read(name));row=dict(id=path.stem,provider='Zenodo IUSB',source_page='https://zenodo.org/records/1213793',download_url=URL,archive_member=name,original_filename=path.name,author='Jean-Rémy Gloaguen; Mathieu Lagrange; Arnaud Can; Jean-François Petiot',license='CC-BY-4.0',license_url='https://creativecommons.org/licenses/by/4.0/',target=None,role='background',background_type='traffic',training_overlap='Unknown',**describe(path));rows.append(row);print(json.dumps(row),flush=True)
            if row['channels']==2 and abs(row['lr_correlation'])<.9999:break
    # Provider metadata and errors from first audit are preserved in its artifact.
    for name,url in [('figshare','https://api.figshare.com/v2/articles/19291472'),('freesound','https://freesound.org/search/?q=car+horn')]:
        try:
            raw=get(url).decode();(root/(name+'.txt')).write_text(raw)
            if name=='figshare':
                o=json.loads(raw);print('ALTERNATIVE_PROVIDER '+json.dumps(dict(provider=name,license=o.get('license'),description=plain(o.get('description','')),files=[dict(name=f['name'],size=f['size']) for f in o.get('files',[])])),flush=True)
            else:print('ALTERNATIVE_PROVIDER '+json.dumps(dict(provider=name,available_page=True,original_download_requires_login=True)),flush=True)
        except Exception as e:print('ALTERNATIVE_PROVIDER '+json.dumps(dict(provider=name,error=str(e))),flush=True)
    save(root/'inventory.json',rows)
if __name__=='__main__':main()

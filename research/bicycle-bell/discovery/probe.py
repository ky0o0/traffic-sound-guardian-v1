"""Bounded source discovery; results are candidates, never automatic truth labels."""
import urllib.request,urllib.parse,json,pathlib,concurrent.futures,re,html
out=pathlib.Path('bell-discovery');out.mkdir(exist_ok=True)
queries={
 'commons_bicycle_bell':'https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch='bicycle bell filetype:audio',gsrnamespace=6,gsrlimit=50,prop='imageinfo',iiprop='url|extmetadata')),
 'commons_bike_bell':'https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',generator='search',gsrsearch='bike bell filetype:audio',gsrnamespace=6,gsrlimit=50,prop='imageinfo',iiprop='url|extmetadata')),
 'freesound_search':'https://freesound.org/search/?q=bicycle+bell',
 'archive_search':'https://archive.org/advancedsearch.php?'+urllib.parse.urlencode({'q':'mediatype:audio AND ("bicycle bell" OR "bike bell")','output':'json','rows':50,'fl[]':['identifier','title','licenseurl','creator']},doseq=True),
}
def probe(kv):
 name,url=kv
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'TrafficSoundGuardianResearch/2 (https://github.com/ky0o0/traffic-sound-guardian-v1; license metadata audit)'})
  with urllib.request.urlopen(req,timeout=30) as r:data=r.read(2000000);status=r.status
  if name=='freesound_search':
   body=data.decode()
   links=sorted(set(re.findall(r'/people/([^/\" ]+)/sounds/(\d+)/',body)))
   (out/'freesound-candidate-links.json').write_text(json.dumps(links,indent=2))
  else:(out/(name+'.response')).write_bytes(data)
  return {'source':name,'url':url,'http_status':status,'bytes':len(data),'note':'Metadata candidates require license, overlap and audio label review before any test use.'}
 except Exception as err:return {'source':name,'url':url,'error':str(err)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(probe,queries.items()))
(out/'source-discovery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,indent=2))
# Enumerate genuinely new Freesound uploaders; do not label or score candidates here.
old=json.loads(pathlib.Path('research/bicycle-bell/results/20261102-v1/manifest.json').read_text())['records']
old_authors={r['uploader'].casefold() for r in old};old_ids={r['id'] for r in old}
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'TrafficSoundGuardianResearch/2 (public audio license metadata research)'})
 with urllib.request.urlopen(req,timeout=25) as r:return r.read(2000000).decode()
links=set();errors=[]
for page in range(1,6):
 try:
  body=get('https://freesound.org/search/?q=bicycle+bell&page='+str(page))
  links.update(re.findall(r'/people/([^/\" ]+)/sounds/(\d+)/',body))
 except Exception as err:errors.append({'page':page,'error':str(err)})
links=sorted((a,i) for a,i in links if a.casefold() not in old_authors and i not in old_ids)
def detail(ai):
 a,i=ai;url=f'https://freesound.org/people/{a}/sounds/{i}/'
 try:
  body=get(url);normalized=html.unescape(body.replace('\\/','/'))
  media=sorted(set(re.findall(r'https?://[^\s\"<>]+\.(?:mp3|ogg|wav)',normalized)))
  licenses=sorted(set(re.findall(r'https?://creativecommons.org/[^\s\"<>]+',normalized)))
  metas={}
  from html.parser import HTMLParser
  class Parser(HTMLParser):
   def handle_starttag(self,tag,attrs):
    d=dict(attrs)
    if tag=='meta' and d.get('content') and (d.get('property','').startswith('og:') or d.get('name')=='description'):metas[d.get('property',d.get('name'))]=d['content']
  Parser().feed(body)
  return dict(id=i,uploader=a,url=url,media_urls=media,licenses=licenses,metadata=metas,label_status='candidate only; not audited as true bicycle')
 except Exception as err:return dict(id=i,uploader=a,url=url,error=str(err))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:candidates=list(pool.map(detail,links))
(out/'new-freesound-metadata.json').write_text(json.dumps({'candidates':candidates,'search_errors':errors},indent=2,ensure_ascii=False))
print('New source candidate count:',len(candidates))

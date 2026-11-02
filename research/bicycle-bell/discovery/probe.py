"""Bounded source discovery; results are candidates, never automatic truth labels."""
import urllib.request,urllib.parse,json,pathlib,concurrent.futures
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
  (out/(name+'.response')).write_bytes(data)
  return {'source':name,'url':url,'http_status':status,'bytes':len(data),'note':'Metadata candidates require license, overlap and audio label review before any test use.'}
 except Exception as err:return {'source':name,'url':url,'error':str(err)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(probe,queries.items()))
(out/'source-discovery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,indent=2))

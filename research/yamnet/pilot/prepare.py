#!/usr/bin/env python3
"""Download a fixed, auditable 30-recording *candidate* pilot dataset.

ESC-50 clips are original Freesound field recordings, NOT necessarily noisy traffic.
Commons sounds may be isolated; human review is required before claiming accuracy.
No mixing, augmentation, selection on model scores, or duplicate original Freesound IDs.
Never commit downloaded audio to the repository.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE=Path(__file__).resolve().parent
DATA=BASE/".working/audio"
REV="33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6"
META=f"https://raw.githubusercontent.com/karolpiczak/ESC-50/{REV}/meta/esc50.csv"
UA="TrafficSoundGuardian-educational-benchmark/0.1 (github.com/ky0o0/traffic-sound-guardian-v1)"
# Different file names; Commons may contain same underlying recording: provenance review pending.
COMMONS=[
 ("Bike-bell.wav","CC BY 3.0","kklab5050"),
 ("Bsumusictech bike-bell.wav","CC0 1.0","bsumusictech"),
 ("Ding Dong Bicycle Bell A.ogg","CC BY-SA 4.0","TeWeBs"),
 ("186096 marcel-farres bicycle-bell.wav","Check Commons file page","marcel-farres"),
 ("Classic Bicycle Bell recorded by Frick & Traa.wav","Check Commons file page","Frick & Traa"),
 ("Bicycle-bell.wav","Check Commons file page","See Commons"),
]
NEGATIVE_CLASSES=[("engine",2),("train",2),("rain",1),("wind",1),
                  ("church_bells",1),("clock_alarm",1)]

def get(url,tries=3):
    last=None
    for attempt in range(tries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA, "Accept":"*/*"})
            with urllib.request.urlopen(req,timeout=35) as f:
                b=f.read(8_000_000+1)
                if len(b)>8_000_000:
                    raise ValueError("Unexpectedly huge input; reject")
                return b,f.geturl()
        except (urllib.error.URLError,ValueError,TimeoutError) as e:
            last=e;time.sleep(1+attempt)
    raise RuntimeError(f"{url} failed: {last}")

def commons_orig(name):
    # Wikimedia Commons content-addressed upload path, calculated from page title.
    slug=name.replace(" ","_")
    md5=hashlib.md5(slug.encode("utf-8")).hexdigest()
    return "https://upload.wikimedia.org/wikipedia/commons/"+md5[0]+"/"+md5[:2]+"/"+urllib.parse.quote(slug,safe="()_-.")
def page_url(name):
    return "https://commons.wikimedia.org/wiki/File:"+urllib.parse.quote(name.replace(" ","_"),safe="()_-.")

def pick(src,kind,n,used):
    # Pick round-robin across folds, avoid correlated clips from one src_file.
    out=[]
    folds=[1,2,3,4,5]
    by_fold={f:sorted((r for r in src if r["category"]==kind and int(r["fold"])==f),
                      key=lambda r:r["filename"]) for f in folds}
    for _ in range(n):
        for f in folds:
            row=next((r for r in by_fold[f] if r["src_file"] not in used),None)
            if row is not None:
                out.append(row); used.add(row["src_file"]); by_fold[f].remove(row)
                break
        else:
            raise RuntimeError(f"Not enough independent sources for {kind}")
    return out

def main():
    DATA.mkdir(parents=True,exist_ok=True)
    metadata_bytes,_=get(META)
    metadata_hash=hashlib.sha256(metadata_bytes).hexdigest()
    rows=list(csv.DictReader(io.StringIO(metadata_bytes.decode("utf-8-sig"))))
    used=set();selected=[]
    for kind,n in [("car_horn",8),("siren",8)]+NEGATIVE_CLASSES:
        for r in pick(rows,kind,n,used):
            selected.append(dict(
              id="esc50_"+r["filename"].replace(".wav",""),
              filename=r["filename"],dataset="ESC-50",
              label=("horn" if kind=="car_horn" else "siren" if kind=="siren" else "none"),
              original_category=kind,original_recording_id="ESC50:"+r["src_file"],
              group_id="ESC50:"+r["src_file"],fold=int(r["fold"]),take=r["take"],
              attribution="K. J. Piczak, ESC-50; original Freesound authors in ESC-50 LICENSE",
              license="CC BY-NC 3.0 (ESC-50 subset)",
              source_url=f"https://github.com/karolpiczak/ESC-50/blob/{REV}/audio/{r['filename']}",
              download_url=f"https://raw.githubusercontent.com/karolpiczak/ESC-50/{REV}/audio/{r['filename']}",
              metadata_sha256=metadata_hash,source_label_human_audited=False,
              background_noise_human_audited=False))
    for name,lic,author in COMMONS:
        selected.append(dict(id="commons_"+str(COMMONS.index((name,lic,author))).zfill(2),
          filename=name,dataset="Wikimedia Commons",label="bell",
          original_category="bicycle bell",original_recording_id="Commons:"+name,
          group_id="Commons:"+name,attribution=author,license=lic,
          source_url=page_url(name),download_url=commons_orig(name),
          source_label_human_audited=False,background_noise_human_audited=False))
    assert len(selected)==30 and len({s["group_id"] for s in selected})==30
    summary={"status":"collecting","candidates":30,"ESC50_pin":REV,
             "ESC50_metadata_sha256":metadata_hash,
             "audited_event_onsets":False,"audited_background_noise":False,
             "selection_method":"predefined category/fold/source-id; never selected using AI output",
             "clips":[]}
    fails=[]
    for i,rec in enumerate(selected):
        dest=DATA/("clip%02d"%i+Path(rec["filename"]).suffix.lower())
        urls=[rec["download_url"]]
        if rec["dataset"]=="Wikimedia Commons":
            urls.append("https://commons.wikimedia.org/wiki/Special:FilePath/"+
                        urllib.parse.quote(rec["filename"],safe="()_-."))
        error=None;raw=None;fetched=None
        for u in urls:
            try:
                raw,fetched=get(u)
                if raw.startswith(b"<html") or raw.startswith(b"<!DOCTYPE"):
                    raise ValueError("Received HTML instead of audio")
                break
            except Exception as e:
                error=str(e)
        if raw is None:
            fails.append({"id":rec["id"],"error":error}); print("FETCH FAILED",rec["id"],error,flush=True)
            rec["download_status"]="failed"
        else:
            dest.write_bytes(raw)
            rec.update(file_local="audio/"+dest.name,size_bytes=len(raw),
                       sha256=hashlib.sha256(raw).hexdigest(),
                       fetched_url=fetched,download_status="ok")
            print("FETCH",i+1,len(raw),rec["id"],flush=True)
        summary["clips"].append(rec)
    summary["downloads_succeeded"]=sum(r["download_status"]=="ok" for r in selected)
    summary["downloads_failed"]=fails
    summary["status"]="downloaded" if not fails else "partially_downloaded"
    (BASE/".working").mkdir(exist_ok=True)
    (BASE/".working/manifest.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n")
    print("SELECTED",len(selected),"DOWNLOADED",summary["downloads_succeeded"],flush=True)
    # Incomplete is not a successful 30-file pilot. Preserve diagnostic manifest anyway.
    if fails:
        sys.exit(3)

if __name__=="__main__":
    main()

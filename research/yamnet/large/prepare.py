#!/usr/bin/env python3
"""Large real-audio source collection for YAMNet. No artificial sounds.

ESC-50 (GitHub), UrbanSound8K (HuggingFace community mirror of ORIGINAL
UrbanSound8K source audio), Wikimedia Commons bicycle bell originals mirrored
on GitHub, and one extra independently hosted university teaching recording.

All downloads are cryptographically hashed, per-origin grouped, and reported.
No item is selected, deleted or reordered using its classifier score.
Weak source tags are NOT audited temporal truth.
"""
import csv
from concurrent.futures import ThreadPoolExecutor,as_completed
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parent
WORK=ROOT/".working"
MEDIA=WORK/"audio"
ESC_COMMIT="33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6"
ESC_CSV=f"https://raw.githubusercontent.com/karolpiczak/ESC-50/{ESC_COMMIT}/meta/esc50.csv"
US_CSV="https://huggingface.co/datasets/danavery/urbansound8K/resolve/main/UrbanSound8K.csv"
US_BASE="https://huggingface.co/datasets/MahiA/UrbanSound8K/resolve/main/audios"
BELLS=[
    ("bicycle-bell-1.wav","Bicycle-bell-1.wav"),
    ("bicycle-bell-2.wav","Bicycle-bell-2.wav"),
    ("bike-bell.wav","Bike-bell.wav"),
    ("bsu-bike-bell.wav","Bsumusictech bike-bell.wav"),
    ("classic-bicycle-bell.wav","Classic Bicycle Bell recorded by Frick & Traa.wav"),
    ("ding-dong-bicycle-bell.ogg","Ding Dong Bicycle Bell A.ogg"),
    ("marcel-bicycle-bell.wav","186096 marcel-farres bicycle-bell.wav"),
    ("rotating-bicycle-bell.wav","Rotating-bicycle-bell.wav"),
]
UA="TSG-Education-Research/1.0 (GitHub ky0o0/traffic-sound-guardian-v1)"
MAX_BYTES=12_000_000
# Caps to bound CI runtime. ~250 separate source-group candidates before download.
ESC_COUNTS={"car_horn":32,"siren":24,"rain":10,"wind":10,
            "engine":10,"train":10,"church_bells":10,"clock_alarm":10,
            "footsteps":10,"helicopter":10}
URBAN_COUNTS={"car_horn":25,"siren":25,"street_music":9,
              "engine_idling":9,"children_playing":6,"air_conditioner":6}

def get(url,tries=3,limit=MAX_BYTES):
    err=None
    for n in range(tries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"*/*"})
            with urllib.request.urlopen(req,timeout=45) as r:
                b=r.read(limit+1)
                if len(b)>limit:raise ValueError("oversize file")
                if not b:raise ValueError("zero-size")
                if b[:5] in (b"<html",b"<?xml") or b.startswith(b"<!DOCTYPE"):
                    raise ValueError("received HTML instead of audio")
                return b, r.geturl()
        except Exception as e:
            err=e
            time.sleep(.5+n)
    raise RuntimeError(f"{str(err)[:200]}")

def hashbytes(x): return hashlib.sha256(x).hexdigest()

def choose(rows,key,counts,group_field,used):
    selected=[]
    for cat,num in counts.items():
        subset=sorted((r for r in rows if r[key]==cat),
                      key=lambda r:(int(r.get("salience","1"))!=2,
                                    int(r["fold"]),r.get("filename",r.get("slice_file_name",""))))
        # Round-robin across fold, favor background-salience clips in UrbanSound8K.
        buckets={f:[r for r in subset if int(r["fold"])==f] for f in range(1,11)}
        candidates=[]
        for b in buckets.values():candidates.extend(b)
        # deterministic round robin through folds, without same original-source recording
        local=[]
        for i in range(3000):
            f=1+(i%10)
            for r in list(buckets.get(f,[])):
                sid=r[group_field]
                if sid in used:continue
                local.append(r);used.add(sid);break
            if len(local)>=num:break
        if len(local)<num:raise RuntimeError(f"Insufficient distinct source recordings for {cat}: {len(local)}/{num}")
        selected.extend(local)
    return selected

def make_esc():
    b,u=get(ESC_CSV,limit=1_000_000)
    rows=list(csv.DictReader(io.StringIO(b.decode("utf8"))))
    used=set()
    # first eight entries in a cat don't represent independent background conditions;
    # deliberately sample each fold and track underlying Freesound IDs.
    entries=choose(rows,"category",ESC_COUNTS,"src_file",used)
    return [dict(dataset="ESC-50",group_id="freesound:"+r["src_file"],
        original_audio_id=r["src_file"],filename=r["filename"],
        id="esc_"+r["filename"].replace(".wav",""),
        label= ("horn" if r["category"]=="car_horn" else "siren" if r["category"]=="siren" else "none"),
        source_category=r["category"],fold=int(r["fold"]),salience="unspecified",
        url=f"https://raw.githubusercontent.com/karolpiczak/ESC-50/{ESC_COMMIT}/audio/{r['filename']}",
        landing_page=f"https://github.com/karolpiczak/ESC-50/tree/{ESC_COMMIT}/audio",
        license="CC BY-NC 3.0 (original ESC-50 distribution)",source_hash_esc_metadata=hashbytes(b),
        label_reviewed=False,onsets_reviewed=False,noise_reviewed=False) for r in entries]

def make_urban():
    b,u=get(US_CSV,limit=1_500_000)
    rows=list(csv.DictReader(io.StringIO(b.decode("utf8"))))
    used=set()
    # Do not feed clips shorter than the exact 0.975-second YAMNet window.
    rows=[r for r in rows if float(r["end"])-float(r["start"])>=0.977]
    entries=choose(rows,"class",URBAN_COUNTS,"fsID",used)
    return [dict(dataset="UrbanSound8K",group_id="freesound:"+r["fsID"],
       original_audio_id=r["fsID"],filename=r["slice_file_name"],
       id="urban_"+r["slice_file_name"].replace(".wav",""),
       label=("horn" if r["class"]=="car_horn" else "siren" if r["class"]=="siren" else "none"),
       source_category=r["class"],fold=int(r["fold"]),
       salience=("background" if int(r["salience"])==2 else "foreground"),
       url=f"{US_BASE}/fold{r['fold']}/{r['slice_file_name']}",
       landing_page="https://huggingface.co/datasets/MahiA/UrbanSound8K",
       license="UrbanSound8K original CC BY-NC 3.0 (mirror listing cannot relicense source)",
       source_hash_urban_metadata=hashbytes(b),
       label_reviewed=False,onsets_reviewed=False,noise_reviewed=False) for r in entries]

def make_bells():
    base="https://raw.githubusercontent.com/Jmxxp/Agenda_Otica/main/assets/sounds/"
    rows=[dict(dataset="Commons bell (GitHub mirror)",group_id="commons:"+name,
       original_audio_id=name,filename=filename,id="bell_"+filename.replace(".","_"),
       label="bell",source_category="bicycle bell",fold=None,salience="unknown",
       url=base+urllib.parse.quote(filename),
       landing_page="https://commons.wikimedia.org/wiki/File:"+urllib.parse.quote(name.replace(" ","_"),safe="()_-."),
       license="License varies by original Wikimedia Commons file; check linked original",
       label_reviewed=False,onsets_reviewed=False,noise_reviewed=False) for filename,name in BELLS]
    rows.append(dict(dataset="R6500 university teaching example",group_id="github:R6500-bicyclebell3",
       original_audio_id="Bicycle bell 3.wav",filename="Bicycle bell 3.wav",id="bell_r6500",
       label="bell",source_category="bicycle bell",fold=None,salience="unknown",
       url="https://raw.githubusercontent.com/R6500/Python-bits/master/Colaboratory/Sounds/Bicycle%20bell%203.wav",
       landing_page="https://github.com/R6500/Python-bits/blob/master/Colaboratory/Sounds/Bicycle%20bell%203.wav",
       license="Original audio license not verified; research-only, no redistribution",
       label_reviewed=False,onsets_reviewed=False,noise_reviewed=False))
    return rows

def fetch_one(item):
    u=item["url"]
    raw,actual=get(u)
    # Verify actual media header; no Git LFS pointer or login HTML may pass.
    looks=raw[:4] in [b"RIFF",b"fLaC",b"OggS"] or raw[:3]==b"ID3"
    if not looks:raise ValueError("NOT a real WAV/FLAC/OGG/MP3 audio stream: "+repr(raw[:24]))
    name=item["id"]+Path(item["filename"]).suffix.lower()
    path=MEDIA/name
    path.write_bytes(raw)
    return dict(file_local="audio/"+name,sha256=hashbytes(raw),
                bytes=len(raw),fetched_url=actual,download_status="ok")

def main():
    MEDIA.mkdir(parents=True,exist_ok=True)
    entries=make_esc()+make_urban()+make_bells()
    # Identical Freesound originals across ESC-50 and UrbanSound8K must not be
    # considered independent observations, even when cuts differ.
    hashes=[e["group_id"] for e in entries]
    duplicates={x for x in hashes if hashes.count(x)>1}
    if duplicates:
       # Drop all duplicates from Urban, preserving ESC.
       entries=[e for e in entries if e["dataset"]!="UrbanSound8K" or e["group_id"] not in duplicates]
    assert len({e["id"] for e in entries})==len(entries)
    succeeded=[];failed=[]
    with ThreadPoolExecutor(max_workers=8) as pool:
        fut={pool.submit(fetch_one,e):e for e in entries}
        for n,f in enumerate(as_completed(fut),1):
            e=fut[f]
            try:
                e.update(f.result());succeeded.append(e)
                if n%25==0:print("RETRIEVED",n,"/",len(entries),"success",len(succeeded),flush=True)
            except Exception as ex:
                e.update(download_status="failed",failure=str(ex)[:280])
                failed.append(dict(id=e["id"],dataset=e["dataset"],reason=e["failure"]))
                print("FAILED",e["id"],e["failure"],flush=True)
    selected=[e for e in entries if e.get("download_status")=="ok"]
    manifest=dict(state="downloaded_research_candidates_unreviewed",
      prepared_at_utc="2026-10-30",model="TSG main YAMNet",
      source_group_method="Freesound original ID across ESC-50 and UrbanSound8K; distinct Commons file",
      no_noise_filter_or_augmentation=True,
      selection_prior_to_model_scoring=True,
      planned=len(entries),successful=len(selected),failed=len(failed),
      failed_sources=failed,
      coverage={k:sum(x["label"]==k for x in selected) for k in ["horn","siren","bell","none"]},
      six_category_source_label_coverage={"bicycle_bell":"bell",
         "car_horn":"horn","siren":"siren",
         "police_car":"NOT YET TYPE-VERIFIED", "ambulance":"NOT YET TYPE-VERIFIED",
         "fire_engine":"NOT YET TYPE-VERIFIED"},
      clips=selected)
    (WORK/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    print("DONE",manifest["successful"],"failed",len(failed),"coverage",manifest["coverage"],flush=True)
    # Enough examples to run even if a mirroring provider is temporarily inaccessible;
    # no fake numbers. At least one bell and multiple source families required.
    if manifest["coverage"]["bell"]<4 or manifest["coverage"]["horn"]<25 or manifest["coverage"]["siren"]<25 or manifest["coverage"]["none"]<40:
        raise RuntimeError("Insufficient actual downloaded examples. Source manifest preserved.")
    if not any(e["dataset"]=="UrbanSound8K" for e in selected):
        raise RuntimeError("Second major environmental recording source unavailable. Do not claim multi-dataset pilot.")

if __name__=="__main__":main()

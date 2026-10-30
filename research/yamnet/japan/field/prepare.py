#!/usr/bin/env python3
"""Japan police vehicle field candidate *not* a synthesized siren.

Use real UrbanSound8K slices from original Freesound 34952:
https://freesound.org/people/eyecandyuk/sounds/34952/
Original uploader: Tokyo nighttime distant Japanese police siren;
commenter disputes police-vs-fire identity; REVIEW STILL REQUIRED.

Same original recording forms one source group; never report each slice
as independent observation. Source labels remain weak and must be checked.
Supplement with Japanese police sound-effects from independent public sites
but clearly flag these as NOT validated field recordings.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
import concurrent.futures
import re

ROOT=Path(__file__).resolve().parent
WORK=ROOT/".working"
AUDIO=WORK/"audio"
UA="TrafficSoundGuardian-school-research/1.0 (github.com/ky0o0/traffic-sound-guardian-v1)"
META="https://huggingface.co/datasets/danavery/urbansound8K/resolve/main/UrbanSound8K.csv"
AUDIO_BASE="https://huggingface.co/datasets/MahiA/UrbanSound8K/resolve/main/audios"

def download(url,maxbytes=10_000_000,tries=2):
    last=None
    for i in range(tries):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"*/*"})
            with urllib.request.urlopen(req,timeout=32) as response:
                data=response.read(maxbytes+1)
                final=response.url
                if len(data)>maxbytes:raise ValueError("File exceeded per-clip size bound")
                if len(data)<80:raise ValueError("Small non-media response")
                if data[:4] in (b"RIFF",b"OggS",b"fLaC") or data.startswith(b"ID3") or data[:2] in (b"\xff\xfb",b"\xff\xf3",b"\xff\xf2"):
                    return data,final
                raise ValueError("Not recognized audio; head="+repr(data[:35]))
        except Exception as e:
            last=e
            time.sleep(.8*(i+1))
    raise RuntimeError(str(last))

def fetch_urban():
    req=urllib.request.Request(META,headers={"User-Agent":UA})
    with urllib.request.urlopen(req,timeout=30) as response:raw=response.read(1_200_000)
    rows=list(csv.DictReader(io.StringIO(raw.decode("utf8-sig"))))
    matches=sorted([r for r in rows if r["fsID"]=="34952" and r["class"]=="siren"],key=lambda r:r["slice_file_name"])
    assert matches, "No source recordings from verified Tokyo original 34952"
    print("TOKYO_FILES_IN_URBANSOUND",len(matches),[x["slice_file_name"] for x in matches],flush=True)
    # Avoid accidental source mixing: 34952 is one recording, not N recordings.
    return [dict(id="tokyo34952_"+r["slice_file_name"][:-4],
      original_source_group="Freesound:34952", label="police",
      tier="REAL_JAPAN_FIELD_WITH_WEAK_VEHICLE_LABEL",
      source_type="original field recording of distant Japanese police siren (uploader; commenter disputes exact vehicle)",
      source_page="https://freesound.org/people/eyecandyuk/sounds/34952/",
      dataset="UrbanSound8K unmodified excerpt from Freesound #34952",
      metadata_sha256=hashlib.sha256(raw).hexdigest(),
      filename=r["slice_file_name"],
      exact_source_url=f"{AUDIO_BASE}/fold{r['fold']}/{r['slice_file_name']}",
      source_tag="siren", publisher_vehicle_label="police",
      salience=r.get("salience"),fold=int(r["fold"]),events_human_audited=False,
      license="UrbanSound8K CC BY-NC 3.0; original Freesound CC BY-NC 4.0") for r in matches]

def extras():
    # SFX are *not* proven field captures; include only as separate source tier.
    return [
        dict(id="esffects_japanese_patrol",original_source_group="esffects:124",
          label="police",tier="JAPAN_POLICE_SOUND_EFFECT_CAPTURE_UNVERIFIED",
          source_type="Japanese-language police siren SFX, origin not identified as live field capture",
          source_page="https://esffects.net/124.html",
          exact_source_url="https://esffects.net/data/124.mp3",
          filename="esffects124.mp3",events_human_audited=False,
          license="Publisher permits use but explicitly forbids redistributing source audio"),
        dict(id="pocket_se_distant_patrol",original_source_group="pocket-se:708",
          label="police",tier="JAPAN_POLICE_SOUND_EFFECT_CAPTURE_UNVERIFIED",
          source_type="Sound effect titled distant passing police siren; recording origin unconfirmed",
          source_page="https://pocket-se.info/archives/708/",
          exact_source_url="https://pocket-se.info/se/patoca.mp3",
          filename="pocketse708.mp3",events_human_audited=False,
          license="Refer to publisher site rules; do not redistribute raw audio")
    ]

def one(row):
    try:
        data,final=download(row["exact_source_url"])
        path=AUDIO/(re.sub(r"[^a-zA-Z0-9_.-]","_",row["id"])+Path(row["filename"]).suffix.lower())
        path.write_bytes(data)
        row.update(download_status="ok", file_local="audio/"+path.name,
                   sha256=hashlib.sha256(data).hexdigest(),size_bytes=len(data),
                   final_url=final)
    except Exception as e:
        row.update(download_status="failed",failure=str(e)[:260])
    return row

def main():
    AUDIO.mkdir(parents=True,exist_ok=True)
    candidates=fetch_urban()+extras()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result=list(pool.map(one,candidates))
    good=[r for r in result if r["download_status"]=="ok"]
    manifest=dict(benchmark="Japanese police real-field candidate with clear grouped-identity",
        provenance_rule="same original Freesound 34952 equals one source group regardless of clips",
        source_page_reference="https://freesound.org/people/eyecandyuk/sounds/34952/",
        human_review_complete=False,
        original_model_unchanged=True,
        candidates=len(result),success=len(good), clips=good,
        attempts=result,field_sources=list(set(x["original_source_group"] for x in good if x["tier"].startswith("REAL_JAPAN_FIELD"))),
        limitations=["Dataset siren primary label is confirmed but specific police source identity is disputed in Freesound comments.",
                     "Freesound Tokyo recording is distant and may contain background noise; actual recorded content not yet independently audited.",
                     "All UrbanSound8K slices here share one single source-group; no leakage across train/test.",
                     "Effects sources are not validated live Japanese police field recordings."])
    (WORK/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    for row in result:print("SOURCE",row["download_status"],row["id"],row.get("size_bytes",0),row.get("failure",""),flush=True)
    print("COMPLETE",len(good),"/",len(result),"FIELD_SLICES",sum(x["tier"].startswith("REAL_JAPAN_FIELD") for x in good),flush=True)
    if not any(r["tier"].startswith("REAL_JAPAN_FIELD") for r in good):
        raise RuntimeError("No real field Japan-police candidate downloaded; do not silently replace with synthetic")

if __name__=="__main__":main()

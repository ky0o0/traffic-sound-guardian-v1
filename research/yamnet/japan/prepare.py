#!/usr/bin/env python3
"""Japan-labelled emergency sirens: source-auditable independent research pilot.

IMPORTANT:
- OtoLogic's sirens are SYNTHESIZED. Police category presently has ONLY
  synthetic prototypes. They are NOT genuine street recordings.
- Taira Komori's recordings are individually labelled sound EFFECTS; do not
  assert road/street provenance without listening/verification.
- Multiple close/far/dry versions from ONE OtoLogic bank = ONE source group.
- No downloads redistributed. Exact SHA256 and provenance are recorded.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib,json,time,urllib.request,urllib.parse
from mutagen.mp3 import MP3

ROOT=Path(__file__).resolve().parent
WORK=ROOT/".working"
FILES=WORK/"audio"
UA="TrafficSoundGuardian educational non-commercial research / reproducible-source-check"
TBASE="https://taira-komori.net/sound/environment01/"
OBASE="https://otologic.jp/sounds/se/pre/"
TURL="https://taira-komori.net/enviroment01.html"
OURL="https://otologic.jp/free/se/transportation02.html"
ITEMS=[]
for fid,cls,nature in [
 ("ambulance_pass","ambulance","site-labelled emergency vehicle passing"),
 ("ambulance_siren","ambulance","site-labelled ambulance siren LOOP"),
 ("fire_engine_pass","fire","site-labelled fire truck passing"),
 ("fire_engine_start","fire","site-labelled fire truck starting"),
 ("fire_engines","fire","site-labelled several fire trucks"),
 ("daytime_traffic","none","Japan city traffic potentially with other warning sounds"),
 ("ubn_intersection1","none","Japan intersection background potentially with warning sounds"),
 ("wet_road1","none","Japanese wet-road traffic environment"),
 ("city_traffic","none","city traffic environment")
]:
  ITEMS.append(dict(id="taira_"+fid,filename=fid+".mp3",
    label=cls,source_category=fid,
    dataset="Taira Komori Japan effects",sound_kind="creator-labelled audio effect; recording geometry not verified",
    original_recording_group="Taira-Komori:"+fid,
    source_url=TURL,
    url=TBASE+fid+".mp3",
    license="Taira Komori website: educational/research use allowed; standalone redistribution prohibited",
    site_name="taira-komori.net"))
for cls,group,variants in [
("police","Police_Car-Siren03",["01(Close)","05(Far)","09(Dry)"]),
("ambulance","Ambulance-Siren03",["1(Close)","3(Far)","5(Dry)"]),
("fire","Fire_Truck-Siren01",["01(Close)","06(Far)","11(Dry)"])
]:
  for variant in variants:
    filename=f"{group}-{variant}.mp3"
    ITEMS.append(dict(id="otologic_"+cls+"_"+variant.split("(")[0],
      filename=filename,label=cls,source_category=group,
      dataset="OtoLogic Japan designed siren",sound_kind="SYNTHETIC Japanese-style siren; NOT actual street recording",
      original_recording_group="OtoLogic:"+group,source_url=OURL,
      url=OBASE+urllib.parse.quote(filename,safe="-."),
      license="OtoLogic site terms; attribution required for free use; no standalone redistribution",
      site_name="otologic.jp"))
assert len(ITEMS)==18

def pull(item):
    err=None
    for attempt in range(3):
        try:
            req=urllib.request.Request(item["url"],headers={"User-Agent":UA,"Accept":"audio/mpeg,*/*"})
            with urllib.request.urlopen(req,timeout=30) as f:
                buf=f.read(10_000_001)
                if len(buf)>10_000_000:raise ValueError("File above 10MB cap")
                if len(buf)<100:raise ValueError("not valid audio: too small")
                if buf.startswith(b"<!") or buf.startswith(b"<html"):raise ValueError("HTML rather than audio")
                local="audio/"+item["id"]+".mp3"
                (WORK/local).write_bytes(buf)
                sha=hashlib.sha256(buf).hexdigest()
                try:
                    duration=float(MP3(str(WORK/local)).info.length)
                except Exception as e:
                    raise ValueError("Could not decode MP3 duration") from e
                if not 0.975<=duration<=120:
                    raise ValueError(f"duration {duration:.3f} outside 0.975-120 sec range")
                return dict(file_local=local,sha256=sha,size_bytes=len(buf),
                            duration_seconds=duration,download_status="ok")
        except Exception as e:
            err=str(e)
            time.sleep(.5+attempt)
    raise RuntimeError(str(err)[:250])

def main():
    FILES.mkdir(parents=True,exist_ok=True)
    output=[];fail=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(pull,o):o for o in ITEMS}
        for f in as_completed(jobs):
            entry=jobs[f]
            try:
                data=f.result()
                entry.update(data)
                output.append(entry)
                print("OK",entry["id"],round(data["duration_seconds"],2),"sec",flush=True)
            except Exception as e:
                fail.append(dict(id=entry["id"],url=entry["url"],error=str(e)))
                print("FAILED",entry["id"],str(e),flush=True)
    output.sort(key=lambda e:e["id"])
    labels={k:sum(x["label"]==k for x in output) for k in ("police","ambulance","fire","none")}
    manifest={
      "state":"jp_sirens_pilot_real_model",
      "selected_before_model_scores":True,
      "all_classes_model_scores":6,
      "positive_labels_unverified_by_independent_listening":True,
      "police_all_synthetic_prototypes":True,
      "OtoLogic_variants_same_source_group":True,
      "positive_source_labels":labels,
      "total_downloaded":len(output),
      "failed_sources":fail,
      "clips":output,
      "no_audio_redistributed":True
    }
    (WORK/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
    print("COLLECTED",len(output),labels,"failed",len(fail),flush=True)
    if any(labels[c]<1 for c in ("police","ambulance","fire")):
        raise RuntimeError("No available source for all three Japanese siren categories: cannot test")

if __name__=="__main__":main()

#!/usr/bin/env python3
"""Japan-local emergency-siren candidate audio, exact provenance, no redistribution.

Municipal samples = official demonstration, not roadside capture.
Taira Komori = Japanese field-style emergency pass sound effects; real field
recording provenance must be verified separately, not assumed.
OtoLogic police = EXPLICIT SYNTH reference, not a real car or street clip.
Missing HTTP assets are recorded as failures rather than substituted.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT=Path(__file__).resolve().parent
OUT=ROOT/".working"
AUDIO=OUT/"audio"
DATA=[
 ("kisarazu_fire_alarm","fire","municipality_demonstration",
 "https://www.city.kisarazu.lg.jp/material/files/group/59/4.mp3",
 "https://www.city.kisarazu.lg.jp/soshiki/shobo/keibo/1/4056.html","Kisarazu Fire Bureau; fire response siren + bell"),
 ("kisarazu_fire_rescue","fire","municipality_demonstration",
 "https://www.city.kisarazu.lg.jp/material/files/group/59/5.mp3",
 "https://www.city.kisarazu.lg.jp/soshiki/shobo/keibo/1/4056.html","Kisarazu Fire Bureau; non-fire response siren"),
 ("kisarazu_ambulance","ambulance","municipality_demonstration",
 "https://www.city.kisarazu.lg.jp/material/files/group/59/6.mp3",
 "https://www.city.kisarazu.lg.jp/soshiki/shobo/keibo/1/4056.html","Kisarazu Fire Bureau; ambulance peepoh"),
 ("asahikawa_fire_normal","fire","municipality_demonstration",
 "https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335_d/fil/sairen.mp3",
 "https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335.html","Asahikawa 2026 fire truck normal siren"),
 ("asahikawa_fire_new","fire","municipality_demonstration",
 "https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335_d/fil/sairen_koukeikoku.mp3",
 "https://www.city.asahikawa.hokkaido.jp/kurashi/311/312/d083335.html","Asahikawa 2026 fire truck high-warning siren"),
 ("komori_ambulance_pass","ambulance","field_effect_provenance_unverified",
 "https://taira-komori.net/sound/environment01/ambulance_pass.mp3",
 "https://taira-komori.net/enviroment01.html","Taira Komori; ambulance pass"),
 ("komori_ambulance_loop","ambulance","field_effect_provenance_unverified",
 "https://taira-komori.net/sound/environment01/ambulance_siren.mp3",
 "https://taira-komori.net/enviroment01.html","Taira Komori; ambulance loop"),
 ("komori_fire_pass","fire","field_effect_provenance_unverified",
 "https://taira-komori.net/sound/environment01/fire_engine_pass.mp3",
 "https://taira-komori.net/enviroment01.html","Taira Komori; fire engine pass"),
 ("komori_fire_start","fire","field_effect_provenance_unverified",
 "https://taira-komori.net/sound/environment01/fire_engine_start.mp3",
 "https://taira-komori.net/enviroment01.html","Taira Komori; fire engine starting"),
 ("komori_fire_engines","fire","field_effect_provenance_unverified",
 "https://taira-komori.net/sound/environment01/fire_engines.mp3",
 "https://taira-komori.net/enviroment01.html","Taira Komori; several fire engines"),
 ("otologic_japan_police_close","police","japan_style_SYNTH_control_ONLY",
 "https://otologic.jp/sounds/se/pre/Police_Car-Siren03-01%28Close%29.mp3",
 "https://otologic.jp/free/se/transportation02.html","OtoLogic; explicitly synthesized Japan-style police siren"),
 ("otologic_japan_police_close_b","police","japan_style_SYNTH_control_ONLY",
 "https://otologic.jp/sounds/se/pre/Police_Car-Siren03-02%28Close%29.mp3",
 "https://otologic.jp/free/se/transportation02.html","OtoLogic; second rendering, SAME MODELLED SOURCE family"),
 ("otologic_japan_police_far","police","japan_style_SYNTH_control_ONLY",
 "https://otologic.jp/sounds/se/pre/Police_Car-Siren03-05%28Far%29.mp3",
 "https://otologic.jp/free/se/transportation02.html","OtoLogic; distant synthesized rendering of SAME family"),
]
UA="TSG Academic Benchmark Pilot (github.com/ky0o0/traffic-sound-guardian-v1)"
def one(x):
    id,label,tier,url,page,note=x
    result=dict(id=id,label=label,tier=tier,download_url=url,source_page=page,
                note=note,original_source_group=("otologic-jp-police03" if id.startswith("otologic") else
                        ("kisarazu-fire" if id.startswith("kisarazu_fire") else id)),
                public_distribution_rights_not_assumed=True,
                sound_type_human_confirmed_by_publisher=True,
                onset_annotation_human_checked=False,
                road_noise_present_unverified=True)
    e=None
    for k in range(2):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA})
            with urllib.request.urlopen(req,timeout=30) as r:b=r.read(7_000_001)
            if not (32<=len(b)<=7_000_000) or b[:5].lower()==b"<html":
                raise ValueError("Not an audio file")
            if not (b.startswith(b"ID3") or b[:2] in (b'\xff\xfb',b'\xff\xf3',b'\xff\xf2') or b[:4] in (b"RIFF",b"OggS")):
                raise ValueError("Unexpected audio header: "+repr(b[:20]))
            path=AUDIO/(id+".mp3")
            path.write_bytes(b)
            result.update(download_status="ok",file_local="audio/"+path.name,
                          size_bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
            return result
        except Exception as ex:
            e=str(ex)[:160]
            time.sleep(.6+k)
    result.update(download_status="failed",download_error=e)
    return result

def main():
    AUDIO.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(one,DATA))
    ok=[r for r in results if r["download_status"]=="ok"]
    manifest=dict(experiment="Japan-specific-vehicle-siren-audio-pilot",
                  planned=len(results),success=len(ok),clips=ok,all_attempts=results,
                  missing_classes=[c for c in ('police','ambulance','fire') if c not in [r["label"] for r in ok]],
                  classification_targets=["Siren","Police car (siren)","Ambulance (siren)","Fire engine, fire truck (siren)"],
                  notes="No presumed user-device measurements. Synthetic police is not a real police recording. Multiple sounds from the same family not independent.")
    (OUT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
    for r in results:print(r["download_status"],r["id"],r.get("size_bytes",0),r.get("download_error",""),flush=True)
    print("COLLECTION",len(ok),"/",len(results),flush=True)
    if len(ok)<3:
        raise SystemExit("Not enough genuine downloaded Japanese-siren references; no classifier results")

if __name__=="__main__":main()

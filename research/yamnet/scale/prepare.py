#!/usr/bin/env python3
"""Fixed, documented 100/100/100 real Freesound-source baseline + negatives.

Source primary labels FSD50K (manually annotated) and UrbanSound8K; real audio,
no generated examples and no augmented/pitch-shifted versions.  A Freesound ID
is counted at most once, including across these two datasets. Source labels
may be weak or incomplete; this alone cannot measure event-level performance.

FSD50K eval has exhaustively curated tags for 200 vocabulary classes, whereas
dev labels can be incomplete. Original audio has per-file Freesound CC licenses.
Original WAV source files must NEVER be committed or redistributed.
"""
from concurrent.futures import ThreadPoolExecutor,as_completed
import collections,csv,hashlib,io,json
from pathlib import Path
import re,time,urllib.request,urllib.error
from urllib.parse import quote

ROOT=Path(__file__).resolve().parent
WORK=ROOT/".working";MEDIA=WORK/"audio"
BASE="https://huggingface.co/datasets/Fhrozen/FSD50k/resolve/main/"
URBAN_CSV="https://huggingface.co/datasets/danavery/urbansound8K/resolve/main/UrbanSound8K.csv"
URBAN_BASE="https://huggingface.co/datasets/MahiA/UrbanSound8K/resolve/main/audios"
TARGET=100
UA="TrafficSoundGuardian-classification-research/1.0 (github.com/ky0o0/traffic-sound-guardian-v1)"
LABELS={
  "Bicycle_bell":"bell",
  "Vehicle_horn_and_car_horn_and_honking":"horn",
  "Siren":"siren",
}
NEG=["Rain","Wind","Engine","Traffic_noise","Vehicle","Speech","Music","Footsteps","Church_bell","Doorbell","Bell"]
MAX_FILE_BYTES=11_000_000

def get(url,limit=MAX_FILE_BYTES,retry=3):
    last=None
    for i in range(retry):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"*/*"})
            with urllib.request.urlopen(req,timeout=55) as r:
                b=r.read(limit+1)
                if len(b)>limit:raise ValueError("file too large")
                if len(b)<80:raise ValueError("not audio / empty")
                return b,r.geturl()
        except Exception as e:
            last=e
            time.sleep(.7*(i+1))
    raise RuntimeError(str(last)[:260])

def sha(b):return hashlib.sha256(b).hexdigest()

def read_csv(url):
    b,_=get(url,8_000_000)
    return list(csv.DictReader(io.StringIO(b.decode("utf-8-sig")))),sha(b)

def build_candidates():
    # Save metadata hashes: data and labels fixed before model inference.
    evalr,evalsha=read_csv(BASE+"labels/eval.csv")
    devr,devsha=read_csv(BASE+"labels/dev.csv")
    urban,urbansha=read_csv(URBAN_CSV)
    fsd=[]
    for split,rows,h in [("eval",evalr,evalsha),("dev",devr,devsha)]:
        for r in rows:
            tags=set(r["labels"].split(","))
            for tag,label in LABELS.items():
                if tag not in tags:continue
                source="freesound:"+r["fname"]
                fsd.append(dict(id="fsd_"+split+"_"+r["fname"],label=label,
                  dataset="FSD50K",partition_from_dataset=split,
                  source_group=source,original_id=r["fname"],
                  source_label_all=sorted(tags),
                  source_exhaustively_labeled=(split=="eval"),
                  annotation_audited_by_us=False,
                  audio_modified=False,
                  url=BASE+f"clips/{split}/{r['fname']}.wav",
                  original_source_page=f"https://freesound.org/s/{r['fname']}/",
                  license="Original Freesound CC terms vary per recording; see FSD50K metadata",
                  dataset_home="https://fsannotator.upf.edu/fsd/release/FSD50K/",
                  metadata_sha256=h))
    # prioritize curated eval, then dev; source ID cannot recur.
    fsd.sort(key=lambda r:(r["partition_from_dataset"]!="eval",int(r["original_id"])))
    # UrbanSound8K primary labels, different source family from FSD50K clips.
    us=[]
    for r in sorted(urban,key=lambda z:(int(z["fold"]),int(z["fsID"]),z["slice_file_name"])):
        if r["class"] not in ("car_horn","siren"):continue
        if float(r["end"])-float(r["start"])<0.976:continue
        us.append(dict(id="urban_"+r["slice_file_name"][:-4],
          label="horn" if r["class"]=="car_horn" else "siren",
          dataset="UrbanSound8K",partition_from_dataset="original",
          source_group="freesound:"+r["fsID"],original_id=r["fsID"],
          source_label_all=[r["class"]],source_exhaustively_labeled=False,
          annotation_audited_by_us=False,audio_modified=False,
          url=f"{URBAN_BASE}/fold{r['fold']}/{r['slice_file_name']}",
          original_source_page=f"https://freesound.org/s/{r['fsID']}/",
          license="Original UrbanSound8K (CC BY-NC 3.0)",
          dataset_home="https://urbansounddataset.weebly.com/urbansound8k.html",
          salience=("background" if int(r["salience"])==2 else "foreground"),
          metadata_sha256=urbansha))
    return fsd,us,{"FSD50K_eval_metadata_SHA256":evalsha,
                   "FSD50K_dev_metadata_SHA256":devsha,
                   "UrbanSound8K_metadata_SHA256":urbansha}

def selection(fsd,us):
    used=set()
    result=[]
    # Choose 100 from FSD for each label if possible; add Urban remainder
    # only if insufficient. Mixed sources can share Freesound IDs.
    for label in ("bell","horn","siren"):
        fst=[r for r in fsd if r["label"]==label]
        ust=[r for r in us if r["label"]==label]
        # For horn and siren deliberately sample 30 UrbanSound8K originals
        # in addition to FSD50K, not only mirror sites of one dataset.
        subset=(fst[:70]+ust+fst[70:]) if label!="bell" else fst
        n=0
        for r in subset:
            if r["source_group"] in used:continue
            used.add(r["source_group"]);result.append(r);n+=1
            if n>=TARGET:break
        print("SELECTED",label,n,"independent_source_groups",flush=True)
    # Test 100 non-target source recordings that do NOT share a source group.
    # FSD labels for other classes are source-primary non-target CANDIDATES
    # and not necessarily free of a faint emergency warning.
    non=[]
    er,eh=read_csv(BASE+"labels/eval.csv")
    for row in er:
        tags=set(row["labels"].split(","))
        if tags.intersection(LABELS) or not tags.intersection(NEG):continue
        non.append(dict(id="fsd_eval_"+row["fname"],label="none",dataset="FSD50K",
          partition_from_dataset="eval",source_group="freesound:"+row["fname"],
          original_id=row["fname"],source_label_all=sorted(tags),
          source_exhaustively_labeled=True,annotation_audited_by_us=False,
          audio_modified=False,url=BASE+f"clips/eval/{row['fname']}.wav",
          original_source_page=f"https://freesound.org/s/{row['fname']}/",
          license="Original Freesound CC terms vary per recording; see FSD50K metadata",
          dataset_home="https://fsannotator.upf.edu/fsd/release/FSD50K/",
          metadata_sha256=eh))
    # Shortest deterministic sample in categories to get varied negative types.
    groups=collections.defaultdict(list)
    for r in non:
        for tag in r["source_label_all"]:
            if tag in NEG:
                groups[tag].append(r)
                break
    for vals in groups.values():vals.sort(key=lambda x:x["original_id"])
    n=0
    while n<120:
        progress=False
        for tag in NEG:
            while groups[tag] and groups[tag][0]["source_group"] in used:
                groups[tag].pop(0)
            if not groups[tag]:continue
            x=groups[tag].pop(0)
            used.add(x["source_group"]);result.append(x);n+=1;progress=True
            if n>=120:break
        if not progress:break
    print("SELECTED none",n,"independent source groups",flush=True)
    return result

def sniff(raw):
    return raw[:4] in (b"RIFF",b"OggS",b"fLaC") or raw[:3]==b"ID3" or raw[:2] in (b"\xff\xfb",b"\xff\xf3",b"\xff\xf2")
def fetch_one(r):
    try:
        data,final=get(r["url"])
        if not sniff(data):raise RuntimeError("Not an audio file: "+repr(data[:24]))
        filename=r["id"]+".wav"
        (MEDIA/filename).write_bytes(data)
        return {**r,"file_local":"audio/"+filename,
                "size_bytes":len(data),"sha256":sha(data),
                "download_status":"ok","resolved_url":final}
    except Exception as e:return {**r,"download_status":"failed","failure":str(e)[:260]}

def main():
    MEDIA.mkdir(parents=True,exist_ok=True)
    fsd,us,meta=build_candidates()
    selected=selection(fsd,us)
    ids=collections.Counter(r["label"] for r in selected)
    if any(ids[k]<TARGET for k in ("bell","horn","siren")):
        raise RuntimeError("Insufficient unique source IDs to meet 100-per-class; no fake independent counts")
    print("SOURCE-META",json.dumps(meta),flush=True)
    downloads=[]
    with ThreadPoolExecutor(max_workers=15) as pool:
        futures={pool.submit(fetch_one,r):r for r in selected}
        for i,f in enumerate(as_completed(futures),1):
            x=f.result();downloads.append(x)
            if x["download_status"]!="ok":print("FAILED",x["id"],x["failure"],flush=True)
            if i%40==0:print("DOWNLOAD",i,"/",len(selected),flush=True)
    ok=[x for x in downloads if x["download_status"]=="ok"]
    bad=[{k:x.get(k) for k in ["id","label","dataset","failure"]} for x in downloads if x["download_status"]!="ok"]
    counts=collections.Counter(x["label"] for x in ok)
    manifest={
      "state":"downloaded_research_candidates_unreviewed",
      "source_metadata_sha256":meta,"selected_before_model_scoring":True,
      "model_version":"TSG 1.6 unchanged actual MediaPipe worker",
      "target_recordings_per_class":TARGET,
      "source_group_type":"original Freesound ID, cross dataset de-duplication",
      "license_note":"No source audio committed. Individual original licenses must be audited.",
      "japanese_specific_sirens_in_this_run":False,
      "warning":"Japan siren subtype studies remain separate. These are broad Freesound category samples only.",
      "planned":len(selected),"successful":len(ok),"failed_count":len(bad),
      "weak_label_count_by_group":dict(counts),
      "failed":bad,
      "clips":sorted(ok,key=lambda x:x["id"])
    }
    (WORK/"manifest.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
    print("FINAL-DOWNLOADED",len(ok),dict(counts),"fails",len(bad),flush=True)
    if any(counts[k]<50 for k in ("bell","horn","siren")):
        raise RuntimeError("Insufficient actual audio downloaded; cannot report threshold stats")

if __name__=="__main__":main()

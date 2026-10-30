#!/usr/bin/env python3
"""Provenance-aware wrapper around round one's unchanged official inference adapter."""
import argparse,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parent))
from extract import run

def main():
    p=argparse.ArgumentParser()
    for arg in ['semantic-repo','checkpoint','input','output','manifest']:p.add_argument('--'+arg,type=Path,required=True)
    for arg in ['target','group-id','input-mode']:p.add_argument('--'+arg,required=True)
    a=p.parse_args();manifest=a.manifest;a.manifest=None;a.float_output=True;a.overwrite=False;a.dry_run=False
    import torch
    torch.manual_seed(20261030);torch.set_num_threads(2)
    record=run(a)
    record.pop('stereo_only',None)
    record.update(input_mode=a.input_mode,input_channels=2,genuine_binaural_validated=False,seed=20261030,adapter='unchanged ../extract.py run()',source_provenance='See config.json; two input channels alone do not establish stereo or binaural recording')
    manifest.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
if __name__=='__main__':main()

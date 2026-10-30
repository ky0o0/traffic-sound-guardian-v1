#!/usr/bin/env python3
"""Reuse hash-verified licensed downloads already saved in research Actions artifacts."""
import argparse,json,shutil,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE.parent));from extract import sha256
p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
(a.output/'originals').mkdir(parents=True,exist_ok=True)
for source in json.loads((HERE/'config.json').read_text())['sources']:
    candidates=list(a.cache.rglob(source['id']+'.*'))
    candidates=[path for path in candidates if path.is_file() and path.parent.name=='originals' and sha256(path)==source['sha256']]
    if not candidates:raise FileNotFoundError('No verified artifact source: '+source['id'])
    shutil.copyfile(candidates[0],a.output/'originals'/source['original_filename'])
print('Verified and staged all 23 source originals; no further provider downloads')

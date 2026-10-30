"""Reuse the prior trusted checkpoint/import contract; no upstream model edits."""
import hashlib,importlib,json,sys,time,types
from pathlib import Path
import torch
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
from extract import OFFICIAL_CHECKPOINT_SHA256,LABELS,sha256,label_vector
UPSTREAM='07e9786c7a741f0a7c722dcde66a2679ca068c50'

def import_official(repo):
    sys.path.insert(0,str(Path(repo).resolve()))
    if 'src.helpers.eval_utils' not in sys.modules:
        stub=types.ModuleType('src.helpers.eval_utils')
        def unsupported(*a,**kw):raise RuntimeError('Unused ITD/ILD evaluator unavailable')
        stub.itd_diff=unsupported;stub.ild_diff=unsupported
        sys.modules['src.helpers.eval_utils']=stub
    return importlib.import_module('src.training.dcc_tf_binaural')

def load_model(repo,checkpoint):
    started=time.perf_counter()
    if sha256(checkpoint)!=OFFICIAL_CHECKPOINT_SHA256:raise ValueError('Official checkpoint hash mismatch')
    config=json.loads((Path(repo)/'experiments/dc_waveformer/config.json').read_text())
    torch.manual_seed(20261030);torch.set_num_threads(2)
    model=import_official(repo).Net(**config['model_params'])
    state=torch.load(str(checkpoint),map_location='cpu')
    model.load_state_dict(state['model_state_dict'],strict=True);model.eval()
    return model,dict(load_seconds=time.perf_counter()-started,parameters=sum(p.numel() for p in model.parameters()),checkpoint_sha256=sha256(checkpoint))

def label_tensor(target):return torch.tensor([label_vector(target)],dtype=torch.float32)

def offline(model,label,x):
    import numpy as np
    with torch.inference_mode():return model({'mixture':torch.from_numpy(np.ascontiguousarray(x.T)).unsqueeze(0),'label_vector':label})['x'].squeeze(0).numpy().T.copy()

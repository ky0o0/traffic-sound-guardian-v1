"""Contract/equivalence tests use the pinned official architecture, untrained.
They establish adapter semantics, never pretrained extraction quality.
"""
import os,sys,unittest
from pathlib import Path
import numpy as np
import torch
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from model_io import import_official,label_tensor,offline
from streaming import StatefulHearing,run_stream

class StreamingContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        repo=Path(os.environ['SH_REPO'])
        import json
        torch.manual_seed(7);torch.set_num_threads(2)
        cls.model=import_official(repo).Net(**json.loads((repo/'experiments/dc_waveformer/config.json').read_text())['model_params']).eval()
        cls.label=label_tensor('car_horn')
    def signal(self,n):return np.random.default_rng(42).normal(0,.04,(n,2)).astype('float32')
    def test_full_chunk_and_partial_eof_match_official_forward(self):
        for n in [1,31,32,415,416,417,447,448,831,832,5000]:
            x=self.signal(n);actual,info=run_stream(self.model,self.label,x);expected=offline(self.model,self.label,x)
            np.testing.assert_allclose(actual,expected,atol=3e-5,rtol=1e-4,err_msg='length '+str(n))
            self.assertEqual(sum(t['end_sample']-t['start_sample'] for t in info['traces']),n)
    def test_packetization_invariance(self):
        x=self.signal(6111);reference,_=run_stream(self.model,self.label,x,packet_samples=32)
        for packet in [1,160,416,1000]:
            y,_=run_stream(self.model,self.label,x,packet_samples=packet)
            np.testing.assert_array_equal(y,reference)
    def test_exact_lookahead_release_boundary(self):
        a=StatefulHearing(self.model,self.label);self.assertEqual(a.push(self.signal(447)),[])
        out=a.push(self.signal(1),start_sample=447);self.assertEqual(len(out),1)
        self.assertEqual(out[0].start_sample,0);self.assertEqual(len(out[0].samples),416)
        self.assertEqual(out[0].trace['input_received_sample'],448)
        self.assertEqual(out[0].trace['eof_zero_padding_samples'],0)
    def test_future_after_declared_context_cannot_change_emitted_block(self):
        x=self.signal(3000);other=x.copy();other[448:]*=-8
        a,_=run_stream(self.model,self.label,x);b,_=run_stream(self.model,self.label,other)
        np.testing.assert_array_equal(a[:416],b[:416])
    def test_snapshot_restore_preserves_partial_raw_queue_and_states(self):
        x=self.signal(5000);a=StatefulHearing(self.model,self.label);a.push(x[:1777]);checkpoint=a.snapshot();b=StatefulHearing(self.model,self.label);b.restore(checkpoint)
        ya=a.push(x[1777:],start_sample=1777)+a.flush();yb=b.push(x[1777:],start_sample=1777)+b.flush()
        np.testing.assert_array_equal(np.concatenate([e.samples for e in ya]),np.concatenate([e.samples for e in yb]))
        self.assertTrue(all(xa.data_ptr()!=xb.data_ptr() for xa,xb in zip(a.state,b.state)))
    def test_out_of_order_packet_and_double_eof_rejected(self):
        a=StatefulHearing(self.model,self.label)
        with self.assertRaises(ValueError):a.push(self.signal(32),start_sample=32)
        a.push(self.signal(32));a.flush()
        with self.assertRaises(RuntimeError):a.flush()
        with self.assertRaises(RuntimeError):a.push(self.signal(32))
    def test_reset_schedule_is_aligned_and_components_recorded(self):
        with self.assertRaises(ValueError):StatefulHearing(self.model,self.label,reset_schedule={1:['encoder']})
        x=self.signal(1800);y,info=run_stream(self.model,self.label,x,reset_schedule={832:['encoder']})
        self.assertEqual(info['resets'],[dict(output_sample=832,components=['encoder'],raw_context_retained=True)])
    def test_per_block_reset_is_separate_ablation(self):
        x=self.signal(3000);y,info=run_stream(self.model,self.label,x,reset_each_block=True)
        self.assertEqual(len(info['resets']),len(info['traces'])-1)
        self.assertTrue(all(set(t['components'])=={'encoder','decoder','output'} for t in info['resets']))

if __name__=='__main__':unittest.main()

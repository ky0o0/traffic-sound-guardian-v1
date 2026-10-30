import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np
import soundfile as sf
sys.path.insert(0,str(Path(__file__).resolve().parent))
from experiment import active_mask, place, place_mask, noise_gain_for_active_snr, describe_metrics, power, make_plan, RATE

class RoundTwoScientificTests(unittest.TestCase):
    def setUp(self):
        n=4096;t=np.arange(n)/n
        self.s=np.column_stack([np.sin(2*np.pi*7*t),np.cos(2*np.pi*11*t)])
        self.noise=np.column_stack([np.cos(2*np.pi*19*t),np.sin(2*np.pi*23*t)])
    def test_active_snr_does_not_count_padded_silence(self):
        s=place(self.s,40960,4096);mask=place_mask(np.ones(len(self.s),dtype=bool),40960,4096)
        noise=np.tile(self.noise,(10,1));gain=noise_gain_for_active_snr(s,noise,mask,5)
        self.assertAlmostEqual(10*np.log10(power(s[mask])/power((noise*gain)[mask])),5,places=6)
        self.assertAlmostEqual(10*np.log10(power(s)/power(noise*gain)),-5,places=6)
    def test_gain_and_residual_have_analytic_meaning(self):
        m=describe_metrics(self.s,self.s+self.noise,.1*self.s+.01*self.noise,self.noise,np.ones(4096,dtype=bool))
        np.testing.assert_allclose(m['projected_gain_signed'],[.1,.1],atol=1e-12)
        np.testing.assert_allclose(m['projected_gain_db'],[-20,-20],atol=1e-12)
        self.assertAlmostEqual(m['residual_suppression_db'],40,places=9)
        self.assertAlmostEqual(m['si_sdri_db'],20,places=9)
    def test_silent_output_is_not_a_defined_si_sdr_score(self):
        m=describe_metrics(self.s,self.s+self.noise,np.zeros_like(self.s),self.noise,np.ones(4096,dtype=bool))
        self.assertIsNone(m['output_si_sdr_db']);self.assertIsNone(m['si_sdri_db'])
    def test_target_only_does_not_publish_huge_improvement(self):
        m=describe_metrics(self.s,self.s,.5*self.s,np.zeros_like(self.s),np.ones(4096,dtype=bool))
        self.assertIsNone(m['si_sdri_db']);self.assertIsNone(m['input_si_sdr_db'])
        np.testing.assert_allclose(m['projected_gain_db'],[-6.020599913]*2,atol=1e-8)
    def test_metric_crosscheck_against_torchmetrics(self):
        import torch
        from torchmetrics.functional import scale_invariant_signal_distortion_ratio
        from real_audio import si_sdr
        expected=scale_invariant_signal_distortion_ratio(torch.tensor((self.s+.2*self.noise).T),torch.tensor(self.s.T),zero_mean=True).numpy()
        np.testing.assert_allclose(si_sdr(self.s,self.s+.2*self.noise),expected,atol=1e-9)
    def test_placement_cannot_truncate_event(self):
        with self.assertRaises(ValueError):place(self.s,4096,1)
        with self.assertRaises(ValueError):place(self.s,4096,-1)
    def test_silent_source_mask_rejected(self):
        with self.assertRaises(ValueError):active_mask(np.zeros((2000,2)))
    def test_placement_series_keeps_identical_gains_noise_and_samples(self):
        n=RATE*5;rng=np.random.default_rng(0);clips={'bsb_0258':self.s.astype('float32'),'bsb_0260':self.s.astype('float32'),'bsb_0124':rng.normal(size=(n,2)).astype('float32'),'bsb_2717':rng.normal(size=(n,2)).astype('float32')}
        sources=[dict(id=i,role='target',target='car_horn',recording_group='test',reference_kind='isolated_recording',input_mode='recorded_stereo') for i in ['bsb_0258','bsb_0260']]+[dict(id=i,role='background',background_type='test') for i in ['bsb_0124','bsb_2717']]
        cfg=dict(window_seconds=5,sources=sources,snrs_db=[0],position_sources=['bsb_0260'],position_backgrounds=['bsb_0124'],duration_sources=[],durations_seconds=[],duration_backgrounds=[],repeat_counts=[],spatial_sources=[],level_sources=[])
        with tempfile.TemporaryDirectory() as d:
            plan=make_plan(Path(d),cfg,clips);rows=[r for r in plan if r['family']=='position' and r['background_id']=='bsb_0124'];self.assertEqual(len(rows),3)
            self.assertEqual(len({r['noise_gain'] for r in rows}),1);self.assertEqual(len({r['common_gain'] for r in rows}),1)
            events=[];noises=[]
            for r in rows:
                folder=Path(d)/'cases'/r['id'];x,sr=sf.read(folder/'input.wav',always_2d=True);ref,_=sf.read(folder/'reference.wav',always_2d=True);noise,_=sf.read(folder/'added_noise.wav',always_2d=True)
                self.assertEqual(x.shape,(n,2));self.assertEqual(sr,RATE);np.testing.assert_allclose(x,ref+noise,atol=1e-7);self.assertLessEqual(np.abs(x).max(),.800001)
                events.append(ref[r['onset_sample']:r['onset_sample']+r['event_samples']]);noises.append(noise)
            for e in events[1:]:np.testing.assert_array_equal(e,events[0])
            for b in noises[1:]:np.testing.assert_array_equal(b,noises[0])
if __name__=='__main__':unittest.main()

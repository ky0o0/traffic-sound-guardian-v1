"""Analytical checks protect interpretation of audio quality metrics and mixtures."""
import unittest
import numpy as np
from real_audio import si_sdr, mix_at_snr, power, reference_metrics


class AudioMetricsTests(unittest.TestCase):
    def setUp(self):
        n=4096
        t=np.arange(n)/n
        self.s=np.column_stack((np.sin(2*np.pi*7*t),np.cos(2*np.pi*11*t)))
        self.n=np.column_stack((np.cos(2*np.pi*19*t),np.sin(2*np.pi*23*t)))

    def test_known_orthogonal_noise(self):
        # Orthogonal equal-power tones: 0.5-amplitude interference = 6.0206 dB.
        self.assertTrue(np.allclose(si_sdr(self.s,self.s+.5*self.n),[6.020599913]*2,atol=1e-7))

    def test_scale_invariance_does_not_mean_gain_preservation(self):
        a=reference_metrics(self.s,self.s+self.n,.01*(self.s+.1*self.n))
        self.assertAlmostEqual(a['si_sdri_db'],20,places=6)
        self.assertLess(a['output_to_reference_energy_db'],-39)
        self.assertLess(a['output_snr_db'],.1)

    def test_mix_ratio_and_no_clipping(self):
        for snr in [-5,0,5]:
            mix,ref,noise,_,_=mix_at_snr(self.s,self.n,snr)
            self.assertTrue(np.allclose(mix,ref+noise,atol=1e-7))
            self.assertAlmostEqual(10*np.log10(power(ref)/power(noise)),snr,places=5)
            self.assertLessEqual(np.max(np.abs(mix)),.800001)

    def test_silence_reference_rejected(self):
        with self.assertRaises(ValueError):
            si_sdr(np.zeros_like(self.s),self.n)

    def test_shape_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            si_sdr(self.s,self.s[:-1])

if __name__=='__main__':
    unittest.main()

"""Structural tests: NOT evidence of pretrained multi-target extraction quality."""
import unittest
import numpy as np
from study import LABELS, RATE, SAMPLES, CASES, compose, label_vector, schedule_sample, METHODS


class MultiClassProtocolTests(unittest.TestCase):
    def test_one_hot_and_two_hot_indices(self):
        for names, expected in [
            (('car_horn',),1), (('siren',),1),
            (('car_horn','siren'),2),
        ]:
            a=label_vector(*names).numpy()
            self.assertEqual(a.shape,(1,20))
            self.assertEqual(int(a.sum()),expected)
            self.assertEqual(int(a[0,LABELS.index('car_horn')]),int('car_horn' in names))
            self.assertEqual(int(a[0,LABELS.index('siren')]),int('siren' in names))

    def test_bad_target_names_fail_closed(self):
        for names in [(),('bicycle_bell',),('car_horn','car_horn'),('music',)]:
            with self.assertRaises(ValueError):
                label_vector(*names)

    def test_plan_is_fixed_and_includes_true_overlapping_events(self):
        self.assertEqual(len(CASES),6)
        self.assertEqual(set(METHODS),{'horn_only','siren_only','two_hot','two_pass_sum'})
        self.assertTrue(all(spec[0] for spec in CASES))
        bg=np.tile(np.linspace(-.1,.1,5*RATE,dtype=np.float32)[:,None],(1,2))
        targets={
            'bsb_0260': np.full((20000,2),.09,dtype=np.float32),
            'bsb_0257': np.full((19000,2),.07,dtype=np.float32),
            'iusb_014': np.full((88200,2),.05,dtype=np.float32),
        }
        backgrounds={'bsb_0124':bg,'iusb_road_00':bg}
        scenes={r['plan']['id']:r for r in (compose(spec,targets,backgrounds) for spec in CASES)}
        for name,scene in scenes.items():
            self.assertEqual(scene['input'].shape,(SAMPLES,2))
            self.assertTrue(np.isfinite(scene['input']).all())
            np.testing.assert_allclose(scene['input'],scene['horn']+scene['siren']+scene['noise'],atol=3e-7)
            self.assertLessEqual(float(np.max(np.abs(scene['input']))),.85001)
            self.assertTrue(scene['plan']['input_hash'])
        x=scenes['overlap_rain']['plan']
        h=x['horn_event'];s=x['siren_event']
        self.assertGreater(min(h['end_sample'],s['end_sample'])-max(h['start_sample'],s['start_sample']),0)
        self.assertIsNone(scenes['background_road']['plan']['horn_event'])
        self.assertIsNone(scenes['background_road']['plan']['siren_event'])

    def test_block_alignment(self):
        self.assertEqual(schedule_sample(2.0)%416,0)
        self.assertGreater(schedule_sample(2),0)
        with self.assertRaises(ValueError):
            schedule_sample(9.0)


if __name__=='__main__':
    unittest.main()

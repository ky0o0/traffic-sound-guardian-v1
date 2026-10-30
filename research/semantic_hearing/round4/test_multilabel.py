"""Structure/metric checks; these do NOT prove pretrained separation quality."""
import sys
from pathlib import Path
import unittest
import numpy as np

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from pilot import RATE, KINDS, label_for, make_case, joint_gains, si_sdr


class Round4Checks(unittest.TestCase):
    def setUp(self):
        t = np.arange(220500)/RATE
        self.horn = np.column_stack((np.sin(2*np.pi*500*t[:22000]),np.sin(2*np.pi*550*t[:22000]))).astype("float32")
        self.siren = np.column_stack((np.sin(2*np.pi*720*t[:88200]),np.sin(2*np.pi*730*t[:88200]))).astype("float32")
        self.noise = np.column_stack((np.sin(2*np.pi*33*t),np.cos(2*np.pi*27*t))).astype("float32")

    def test_multihot_is_two_labels_not_auto_classification(self):
        v=label_for(("car_horn","siren")).numpy()[0]
        self.assertEqual(v.shape,(20,))
        self.assertEqual(float(v.sum()),2.0)
        a=label_for(("car_horn",)).numpy()[0]
        b=label_for(("siren",)).numpy()[0]
        self.assertTrue(np.array_equal(a+b,v))

    def test_six_conditions_mixture_exact(self):
        for kind in KINDS:
            with self.subTest(kind=kind):
                (x,b,h,s), events, _ = make_case(kind,self.noise,self.horn,self.siren,"bsb_0260")
                self.assertEqual(x.shape,(308700,2))
                self.assertLess(float(np.max(np.abs(x))),0.851)
                self.assertLess(float(np.max(np.abs(x.astype("float64")-b-h-s))),3e-7)
                self.assertEqual(len(events),0 if kind=="none" else 2 if "then" in kind or kind=="overlap" else 1)

    def test_independent_gain_measurement_with_overlap(self):
        (x,b,h,s),_,_=make_case("overlap",self.noise,self.horn,self.siren,"bsb_0260")
        y=(0.7*h+0.25*s+0.1*b).astype("float32")
        gains=joint_gains(h,s,b,y,int(2.2*RATE),int(2.4*RATE))
        self.assertAlmostEqual(gains["horn"]["coefficient"],.7,places=2)
        self.assertAlmostEqual(gains["siren"]["coefficient"],.25,places=2)

    def test_si_sdr_reacts_to_cleaner_output(self):
        x=np.arange(1000)*.01
        r=np.column_stack((np.sin(x),np.cos(x))).astype("float32")
        noise=np.column_stack((np.cos(3*x),np.sin(5*x))).astype("float32")
        self.assertGreater(si_sdr(r,r+.01*noise),si_sdr(r,r+noise))


if __name__=="__main__":
    unittest.main()

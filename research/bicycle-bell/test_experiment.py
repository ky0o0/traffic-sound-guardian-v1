"""Numerical unit fixtures only; these are never dataset or accuracy evidence."""
import json
import subprocess
import unittest
import numpy as np
from experiment import allowed_license,category,metrics,choose_threshold,resample_window,REPO


class ProtocolTests(unittest.TestCase):
    def test_only_supported_licenses(self):
        self.assertEqual(allowed_license('http://creativecommons.org/licenses/by/3.0/'),'CC-BY')
        self.assertEqual(allowed_license('http://creativecommons.org/publicdomain/zero/1.0/'),'CC0-1.0')
        self.assertIsNone(allowed_license('http://creativecommons.org/licenses/by-nc/3.0/'))

    def test_ambiguous_bicycle_not_a_negative(self):
        self.assertIsNone(category(['Bell'],'a bike bell ringing'))
        self.assertEqual(category(['Bicycle_bell'],'ring'),'bicycle_bell')
        self.assertEqual(category(['Doorbell'],'ring'),'doorbell')

    def test_confusion_counts(self):
        m=metrics([0,0,1,1],[0,1,0,1])
        self.assertEqual(m['confusion_matrix'],[[1,1],[1,1]])
        self.assertEqual(m['precision'],.5);self.assertEqual(m['recall'],.5)
        self.assertEqual(m['f1'],.5);self.assertEqual(m['fpr'],.5)

    def test_validation_constraints_block_high_false_alarm_choice(self):
        p={'validation_min_precision':.9,'validation_max_fpr':.02}
        r=choose_threshold(np.array([1,1,0,0]),np.array([.9,.6,.7,.1]),p)
        self.assertTrue(r['feasible']);self.assertEqual(r['threshold'],.9)
        self.assertEqual(r['recall'],.5);self.assertEqual(r['fp'],0)

    def test_resampling_matches_production_javascript(self):
        rate=44100;t=np.arange(int(rate*.975))/rate
        x=(.2*np.sin(2*np.pi*1000*t)).astype(np.float32)
        script="import {toModelAudio} from './resample.js';let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);console.log(JSON.stringify(Array.from(toModelAudio(new Float32Array(j.x),j.rate))));"
        native=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps({'rate':rate,'x':x.tolist()}).encode(),cwd=REPO))
        ours=resample_window(x,rate,{})
        self.assertEqual(len(ours),15600)
        self.assertLess(np.max(np.abs(np.asarray(native)-ours)),2e-7)


if __name__=='__main__':unittest.main()

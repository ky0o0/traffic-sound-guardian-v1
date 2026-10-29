"""Pure contract tests for isolated offline Semantic Hearing adapter."""
import unittest
from extract import LABELS, TARGETS, label_vector

class ContractTests(unittest.TestCase):
    def test_label_order(self):
        self.assertEqual(len(LABELS), 20)
        self.assertEqual(LABELS.index("car_horn"), 4)
        self.assertEqual(LABELS.index("siren"), 16)
        self.assertNotIn("bicycle_bell", LABELS)

    def test_one_hot(self):
        for target in TARGETS:
            vector = label_vector(target)
            self.assertEqual(len(vector), 20)
            self.assertEqual(sum(vector), 1.0)
            self.assertEqual(vector[LABELS.index(target)], 1.0)

    def test_reject_unsupported(self):
        with self.assertRaises(ValueError):
            label_vector("bicycle_bell")

if __name__ == "__main__":
    unittest.main()

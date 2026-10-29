"""Contract tests for paired study A/B exports using genuine V1.5.4 schema keys."""
import unittest
from compare_exports import CLASSES, compare, counts, indexed_clips


def clip(group, labels, score, *, status="done"):
    return {
        "status": status, "sourceGroup": group, "labels": labels,
        "result": {"windows": [{"scores": {CLASSES["horn"]: score}}]},
    }


def sample(threshold=0.1, *, pos_score=0.2, neg_score=0.01):
    return {
        "schema": "traffic-sound-guardian-test/1",
        "thresholds": {CLASSES["horn"]: threshold},
        "clips": [clip("p", ["horn"], pos_score), clip("n", ["none"], neg_score)],
        "split": None,
    }


class PairedComparison(unittest.TestCase):
    def test_identical_predictions(self):
        result = compare(sample(), sample(), "horn")
        self.assertEqual(result["independent_groups"], 2)
        self.assertEqual(result["raw"]["f1"], 1)
        self.assertEqual(result["processed"]["f1"], 1)
        self.assertEqual(result["changed_predictions"], 0)

    def test_processed_improvement_is_measured_not_assumed(self):
        result = compare(sample(pos_score=0.02), sample(pos_score=0.21), "horn")
        self.assertEqual(result["raw"]["fn"], 1)
        self.assertEqual(result["processed"]["tp"], 1)
        self.assertEqual(result["changed_predictions"], 1)

    def test_processed_regression_is_reported(self):
        result = compare(sample(), sample(pos_score=0.02, neg_score=0.8), "horn")
        self.assertEqual(result["processed"]["fn"], 1)
        self.assertEqual(result["processed"]["fp"], 1)
        self.assertEqual(result["processed"]["f1"], 0)

    def test_reject_threshold_mismatch(self):
        with self.assertRaisesRegex(ValueError, "Threshold"):
            compare(sample(), sample(threshold=0.2), "horn")

    def test_reject_label_change(self):
        processed = sample()
        processed["clips"][0]["labels"] = ["none"]
        with self.assertRaisesRegex(ValueError, "truth labels"):
            compare(sample(), processed, "horn")

    def test_reject_missing_group(self):
        processed = sample()
        processed["clips"][1]["sourceGroup"] = "different"
        with self.assertRaisesRegex(ValueError, "group mismatch"):
            compare(sample(), processed, "horn")

    def test_reject_duplicate_group(self):
        with self.assertRaisesRegex(ValueError, "Multiple clips"):
            indexed_clips({"clips": [clip("a", ["horn"], .2), clip("a", ["horn"], .8)]})

    def test_counts_zero_denominators(self):
        record = [{"truth": False, "raw": {"detected": False}}]
        result = counts(record, "raw")
        self.assertIsNone(result["precision"])
        self.assertIsNone(result["recall"])
        self.assertIsNone(result["f1"])

if __name__ == "__main__":
    unittest.main()

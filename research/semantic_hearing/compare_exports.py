#!/usr/bin/env python3
"""Paired comparison of original vs Semantic Hearing-processed V1.5.4 AI Test JSON exports.

This is a retrospective offline classification comparison, not a measurement of
real-world safety, PAWS localization, or end-to-end audio latency.
"""
import argparse
import json
from pathlib import Path

CLASSES = {
    "horn": "Vehicle horn, car horn, honking",
    "siren": "Siren",
}


def load_export(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema") != "traffic-sound-guardian-test/1":
        raise ValueError(f"{path}: unsupported AI Test export schema")
    if data.get("split", {}).get("mode") == "heldout" and not data.get("heldoutRevealed"):
        raise ValueError(f"{path}: test-set results are still withheld; do not bypass the evaluation lock")
    return data


def indexed_clips(data):
    indexed = {}
    for clip in data["clips"]:
        if clip.get("status") != "done" or not clip.get("result"):
            continue
        labels = clip.get("labels", [])
        if not labels or "unknown" in labels:
            continue
        group = clip.get("sourceGroup")
        if not isinstance(group, str) or not group.strip():
            raise ValueError("Every included clip must have an original recording group ID")
        if group in indexed:
            raise ValueError(f"Multiple clips in group {group!r} in one condition: pair individual source recordings first")
        indexed[group] = clip
    return indexed


def score(clip, name):
    windows = clip["result"]["windows"]
    if not windows:
        raise ValueError("Processed clip has no completed inference windows")
    values = [window["scores"][name] for window in windows]
    if not all(type(v) in (float, int) and 0 <= v <= 1 for v in values):
        raise ValueError("Non-finite or invalid YAMNet scores")
    return max(values)


def counts(records, condition):
    c = dict(tp=0, fp=0, fn=0, tn=0)
    for row in records:
        truth, predicted = row["truth"], row[condition]["detected"]
        key = "tp" if truth and predicted else "fn" if truth else "fp" if predicted else "tn"
        c[key] += 1
    precision_denom = c["tp"] + c["fp"]
    recall_denom = c["tp"] + c["fn"]
    f1_denom = 2*c["tp"] + c["fp"] + c["fn"]
    return {
        **c,
        "precision": c["tp"] / precision_denom if precision_denom else None,
        "recall": c["tp"] / recall_denom if recall_denom else None,
        "f1": 2*c["tp"] / f1_denom if f1_denom else None,
    }


def compare(raw, processed, label):
    name = CLASSES[label]
    for data in (raw, processed):
        if name not in data.get("thresholds", {}):
            raise ValueError(f"Export lacks threshold for {name}")
    threshold = raw["thresholds"][name]
    if type(threshold) not in (int, float) or not 0.01 <= threshold <= 0.5:
        raise ValueError("Invalid threshold")
    if processed["thresholds"][name] != threshold:
        raise ValueError("Thresholds must match for an unbiased A/B comparison")
    a, b = indexed_clips(raw), indexed_clips(processed)
    if set(a) != set(b):
        raise ValueError(f"Original group mismatch: only raw={sorted(set(a)-set(b))}, only processed={sorted(set(b)-set(a))}")
    if not a:
        raise ValueError("No paired, successfully processed, ground-truth-labelled clips")
    rows = []
    for group in sorted(a):
        x, y = a[group], b[group]
        if set(x["labels"]) != set(y["labels"]):
            raise ValueError(f"{group}: original and processed truth labels differ")
        truth = label in x["labels"]
        raw_score, enhanced_score = score(x, name), score(y, name)
        rows.append({
            "group": group,
            "truth": truth,
            "raw": {"score": raw_score, "detected": raw_score >= threshold},
            "processed": {"score": enhanced_score, "detected": enhanced_score >= threshold},
        })
    return {
        "study": "exploratory paired clip-level comparison",
        "target": label,
        "threshold": threshold,
        "independent_groups": len(rows),
        "positive_groups": sum(r["truth"] for r in rows),
        "negative_groups": sum(not r["truth"] for r in rows),
        "raw": counts(rows, "raw"),
        "processed": counts(rows, "processed"),
        "changed_predictions": sum(r["raw"]["detected"] != r["processed"]["detected"] for r in rows),
        "rows": rows,
        "limitations": [
            "Both variants of each original recording are one paired unit, not two independent samples.",
            "The comparison uses original recorded clip truth, not guessed model labels.",
            "No uncertainty intervals or claim of generalizable improvement.",
            "Measured YAMNet offline processing time does not include Semantic Hearing preprocessing.",
            "Comparison is not an end-to-end real-time or safety evaluation.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True, help="AI Test JSON export of original files")
    parser.add_argument("--processed", type=Path, required=True, help="AI Test JSON export of extracted files")
    parser.add_argument("--label", choices=CLASSES, required=True)
    parser.add_argument("--output", type=Path, help="Write the resulting JSON report")
    args = parser.parse_args()
    result = compare(load_export(args.raw), load_export(args.processed), args.label)
    report = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()

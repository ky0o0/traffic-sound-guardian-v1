"""Independently verify saved artifacts/splits/CSV metrics without retraining or tuning."""
import collections
import csv
import hashlib
import json
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE / 'results/20261102-v1'


def verify():
    read = lambda name: json.loads((ROOT / name).read_text())
    checksums = read('SHA256SUMS.json')
    for name, expected in checksums.items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    manifest = read('manifest.json')['records']
    for key in ['group', 'sha256', 'pcm_group', 'uploader']:
        owners = {}
        for record in manifest:
            value = record[key].casefold() if key == 'uploader' else record[key]
            assert value not in owners or owners[value] == record['split'], (key, value)
            owners[value] = record['split']
    rows = list(csv.DictReader((ROOT / 'test-window-predictions.csv').open()))
    names = list(rows[0])[5:-1]
    payload = {'names': names, 'rows': [[float(row[k]) for k in names] for row in rows]}
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory) / 'scores.json'
        path.write_text(json.dumps(payload))
        winners = json.loads(subprocess.check_output(['node', str(HERE / 'baseline.mjs'), str(path)], text=True))
    assert winners == [row['site_winner'] or None for row in rows]
    grouped = collections.defaultdict(list)
    for row in rows:
        grouped[row['id']].append(row)
    test = {r['id']: r for r in manifest if r['split'] == 'test'}
    assert set(grouped) == set(test)
    saved = read('metrics.json')
    threshold = read('selection-locked-before-test.json')['threshold']
    confusion = {key: [[0, 0], [0, 0]] for key in saved['policies']}
    for identity, windows in grouped.items():
        truth = test[identity]['target']
        assert all(int(w['clip_truth']) == truth for w in windows)
        selected = max(float(w['trained_score']) for w in windows) >= threshold
        same_hop = max(float(w['trained_score']) for w in windows[::2]) >= threshold
        raw = max(float(w['Bicycle bell']) for w in windows[::2]) >= .10
        displayed = any(w['site_winner'] == 'Bicycle bell' for w in windows[::2])
        any_warning = any(w['site_winner'] for w in windows[::2])
        predictions = [selected, same_hop, raw, displayed, any_warning]
        for key, prediction in zip(confusion, predictions):
            confusion[key][truth][int(prediction)] += 1
    for key, matrix in confusion.items():
        assert matrix == saved['policies'][key]['confusion_matrix'], key
    original = HERE.parent.parent / 'yamnet.tflite'
    assert hashlib.sha256(original.read_bytes()).hexdigest() == read('encoder-check.json')['original_sha256']
    return {'checksummed_artifacts': len(checksums), 'recordings': len(manifest),
            'disjoint_keys_verified': ['group', 'sha256', 'pcm_group', 'uploader'],
            'test_clips_recomputed': len(grouped), 'test_windows_exact_site_rule_rechecked': len(rows),
            'confusion_matrices_recomputed': confusion, 'original_yamnet_unchanged': True}


if __name__ == '__main__':
    print(json.dumps(verify(), indent=2))

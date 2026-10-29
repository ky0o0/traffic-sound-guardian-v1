// Exact labels from the official YAMNet 521-class map. No generic traffic classes.
export const TARGETS = Object.freeze({
  'Bicycle bell': { index: 198, label: '自転車のベル' },
  'Vehicle horn, car horn, honking': { index: 302, label: '車のクラクション' },
  'Siren': { index: 390, label: 'サイレン' },
  'Police car (siren)': { index: 317, label: 'サイレン（パトカー）' },
  'Ambulance (siren)': { index: 318, label: 'サイレン（救急車）' },
  'Fire engine, fire truck (siren)': { index: 319, label: 'サイレン（消防車）' }
});

export function bestTarget(results) {
  let best = null;
  for (const result of results) {
    for (const head of result.classifications ?? []) {
      for (const category of head.categories ?? []) {
        const target = TARGETS[category.categoryName];
        if (target && Number.isFinite(category.score) && category.score >= 0 && category.score <= 1 &&
            (!best || category.score > best.score)) {
          best = { name: category.categoryName, label: target.label, score: category.score };
        }
      }
    }
  }
  return best;
}

/** Read the six official target classes from genuine YAMNet output.
 * All scores remain raw model scores; no normalization or calibration. */
export function targetScores(results) {
  const scores = {};
  for (const result of results) {
    for (const head of result.classifications ?? []) {
      for (const item of head.categories ?? []) {
        if (!Object.prototype.hasOwnProperty.call(TARGETS, item.categoryName)) continue;
        if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) continue;
        if (!(item.categoryName in scores) || item.score > scores[item.categoryName]) {
          scores[item.categoryName] = item.score;
        }
      }
    }
  }
  return scores;
}

/** Choose the highest raw-scoring class that meets ITS OWN threshold.
 * No single high-scoring but below-threshold class can hide another valid alert. */
export function chooseTarget(scores, thresholds = {}) {
  let best = null;
  for (const [name, target] of Object.entries(TARGETS)) {
    const score = scores?.[name];
    const threshold = thresholds?.[name] ?? 0.50;
    if (!Number.isFinite(score) || score < 0 || score > 1 ||
        !Number.isFinite(threshold) || threshold < 0.01 || threshold > 0.50 ||
        score < threshold) continue;
    if (!best || score > best.score) best = { name, label: target.label, score };
  }
  return best;
}

export class WarningGate {
  constructor() { this.reset(); }
  reset() { this.active = false; this.lastPositive = -Infinity; this.target = null; }
  // Each valid YAMNet result is sufficient. A missing/dropped frame does
  // not qualify, and there is no longer a consecutive-frame streak to reset.
  breakSequence() {}
  observe(target, now, minScore = 0.50) {
    this.expire(now);
    if (target && Number.isFinite(target.score) && Number.isFinite(minScore) &&
        minScore >= 0.01 && minScore <= 0.50 && target.score >= minScore) {
      this.active = true;
      this.lastPositive = now;
      this.target = target;
    }
    return this.active;
  }
  expire(now) {
    if (this.active && now - this.lastPositive >= 3000) {
      this.active = false;
      this.target = null;
    }
    return this.active;
  }
}

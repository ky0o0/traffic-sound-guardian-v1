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

/** Return the bicycle bell's raw YAMNet score independently of other classes. */
export function bicycleBellScore(results) {
  let score = null;
  for (const result of results) {
    for (const head of result.classifications ?? []) {
      for (const item of head.categories ?? []) {
        if (item.categoryName === 'Bicycle bell' && Number.isFinite(item.score) &&
            item.score >= 0 && item.score <= 1 && (score == null || item.score > score)) score = item.score;
      }
    }
  }
  return score;
}

/** Preserve normal traffic priority; permit a weaker bell signal to qualify
 * independently when no OTHER traffic target reaches the unchanged 0.50 floor. */
export function chooseTarget(best, bellScore, bellThreshold = 0.50) {
  if (best && best.score >= 0.50) return best;
  if (Number.isFinite(bellScore) && bellScore >= 0 && bellScore <= 1 &&
      Number.isFinite(bellThreshold) && bellThreshold >= 0.01 && bellThreshold <= 0.50 &&
      bellScore >= bellThreshold) {
    return { name: 'Bicycle bell', label: TARGETS['Bicycle bell'].label, score: bellScore };
  }
  return best;
}

export class WarningGate {
  constructor() { this.reset(); }
  reset() { this.streak = 0; this.active = false; this.lastPositive = -Infinity; this.target = null; }
  breakSequence() { this.streak = 0; }
  observe(target, now, minScore = 0.50) {
    this.expire(now);
    if (target && target.score >= minScore) {
      this.streak += 1;
      this.lastPositive = now;
      if (this.active || target.score >= 0.75 || this.streak >= 2) {
        this.active = true;
        this.target = target;
      }
    } else {
      this.streak = 0;
    }
    return this.active;
  }
  expire(now) {
    if (this.active && now - this.lastPositive >= 3000) {
      this.active = false;
      this.target = null;
      this.streak = 0;
    }
    return this.active;
  }
}

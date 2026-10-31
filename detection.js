// Exact labels from the official YAMNet 521-class map. No generic traffic classes.
// Legacy saved thresholds below 0.05 remain valid; new UI selections use 0.05 steps.
export const DEFAULT_THRESHOLD = 0.10;
export const WARNING_HOLD_MS = 1000;
export const TARGETS = Object.freeze({
  'Bicycle bell': { index: 198, label: '自転車のベル' },
  'Vehicle horn, car horn, honking': { index: 302, label: '車のクラクション' },
  'Siren': { index: 390, label: 'サイレン' },
  'Police car (siren)': { index: 317, label: 'サイレン（パトカー）' },
  'Ambulance (siren)': { index: 318, label: 'サイレン（救急車）' },
  'Fire engine, fire truck (siren)': { index: 319, label: 'サイレン（消防車）' }
});
// Five related bell-like YAMNet labels: each uses the fixed raw-score threshold
// DEFAULT_THRESHOLD (0.10), independently of the six user-adjustable targets.
// Keep the categories separate: a generic bell must not be called a bicycle bell.
export const SECONDARY_BELLS = Object.freeze({
  'Bell': { index: 195, label: '鐘・ベル' },
  'Chime': { index: 200, label: 'チャイム' },
  'Ding': { index: 477, label: 'チンという音' },
  'Ping': { index: 476, label: 'ピーンという音' },
  'Doorbell': { index: 349, label: 'ドアベル' }
});
export const WARNING_TARGETS = Object.freeze({ ...TARGETS, ...SECONDARY_BELLS });
export const TRAFFIC_ENVIRONMENT = Object.freeze([
  'Car', 'Truck', 'Motorcycle', 'Traffic noise, roadway noise'
]);

export function bestTarget(results) {
  let best = null;
  for (const result of results) {
    for (const head of result.classifications ?? []) {
      for (const category of head.categories ?? []) {
        const target = WARNING_TARGETS[category.categoryName];
        if (target && Number.isFinite(category.score) && category.score >= 0 && category.score <= 1 &&
            (!best || category.score > best.score)) {
          best = { name: category.categoryName, label: target.label, score: category.score };
        }
      }
    }
  }
  return best;
}

/** Read all eleven alertable classes from genuine YAMNet output.
 * All scores remain raw model scores; no normalization or calibration. */
export function targetScores(results) {
  const scores = {};
  for (const result of results) {
    for (const head of result.classifications ?? []) {
      for (const item of head.categories ?? []) {
        if (!Object.prototype.hasOwnProperty.call(WARNING_TARGETS, item.categoryName)) continue;
        if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) continue;
        if (!(item.categoryName in scores) || item.score > scores[item.categoryName]) {
          scores[item.categoryName] = item.score;
        }
      }
    }
  }
  return scores;
}

/** The six traffic targets keep their adjustable thresholds. Five generic
 * bell-like categories use a fixed 0.10 threshold. Either group triggers on
 * ONE inference; original traffic-specific categories take display priority
 * over generic bell labels, regardless of cross-group raw score. */
export function chooseTarget(scores, thresholds = {}) {
  const choose = (targets, adjustable) => {
    let best = null;
    for (const [name, target] of Object.entries(targets)) {
      const score = scores?.[name];
      const threshold = adjustable ? (thresholds?.[name] ?? DEFAULT_THRESHOLD) : DEFAULT_THRESHOLD;
      if (!Number.isFinite(score) || score < 0 || score > 1 ||
          !Number.isFinite(threshold) || threshold < 0.01 || threshold > 0.50 ||
          score < threshold) continue;
      if (!best || score > best.score) best = { name, label: target.label, score };
    }
    return best;
  };
  return choose(TARGETS, true) ?? choose(SECONDARY_BELLS, false);
}

export class WarningGate {
  constructor() { this.reset(); }
  reset() { this.active = false; this.lastPositive = -Infinity; this.target = null; }
  // Each valid YAMNet result is sufficient. A missing/dropped frame does
  // not qualify, and there is no longer a consecutive-frame streak to reset.
  breakSequence() {}
  observe(target, now, minScore = DEFAULT_THRESHOLD) {
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
    if (this.active && now - this.lastPositive >= WARNING_HOLD_MS) {
      this.active = false;
      this.target = null;
    }
    return this.active;
  }
}

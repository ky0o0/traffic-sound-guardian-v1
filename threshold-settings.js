import { WARNING_TARGETS, DEFAULT_THRESHOLD } from './detection.js?v=1.7.3';
export const THRESHOLD_STORAGE_KEY = 'trafficSoundGuardian.soundThresholds';
export const LEGACY_BELL_STORAGE_KEY = 'trafficSoundGuardian.bicycleBellThreshold';
export const STANDARD_THRESHOLD_STORAGE_KEY = 'trafficSoundGuardian.standardThreshold';
export const THRESHOLD_STOPS = Object.freeze([0.01, ...Array.from({length: 10}, (_, i) => (i + 1) / 20)]);
export function nearestThreshold(value) {
  return THRESHOLD_STOPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best, THRESHOLD_STOPS[0]);
}
export function thresholdsForMode(mode, soundThresholds, standardThreshold) {
 return mode === 'standard' ? Object.fromEntries(Object.keys(WARNING_TARGETS).map(name => [name, standardThreshold])) : soundThresholds;
}
export function createThresholdSettings(getStorage) {
 function loadThresholds() {
  const initial = Object.fromEntries(Object.keys(WARNING_TARGETS).map(name => [name, DEFAULT_THRESHOLD]));
  try {
    const raw = getStorage()?.getItem(THRESHOLD_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const name of Object.keys(WARNING_TARGETS)) {
          const value = saved[name];
          if (typeof value === 'number' && Number.isFinite(value) &&
              value >= 0.01 && value <= 0.50) initial[name] = Math.round(value * 100) / 100;
        }
      }
    } else {
      // Preserve any previously configured V1.4 bicycle-bell preference.
      const previous = getStorage()?.getItem(LEGACY_BELL_STORAGE_KEY);
      if (previous !== null && previous !== undefined && previous !== '') {
        const value = Number(previous);
        if (Number.isFinite(value) && value >= 0.01 && value <= 0.50) {
          initial['Bicycle bell'] = Math.round(value * 100) / 100;
        }
      }
    }
  } catch { /* Blocked storage: use the safe defaults. */ }
  return initial;
}
function loadStandardThreshold() {
  try {
    const raw = getStorage()?.getItem(STANDARD_THRESHOLD_STORAGE_KEY);
    if (raw === null || raw === undefined || raw === '') return DEFAULT_THRESHOLD;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0.01 && value <= 0.50 ? Math.round(value * 100) / 100 : DEFAULT_THRESHOLD;
  } catch { return DEFAULT_THRESHOLD; }
}
 function saveTest(values) { try { getStorage()?.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(values)); } catch {} }
 function saveStandard(value) { try { getStorage()?.setItem(STANDARD_THRESHOLD_STORAGE_KEY, value.toFixed(2)); } catch {} }
 return {loadTest:loadThresholds,loadStandard:loadStandardThreshold,saveTest,saveStandard};
}

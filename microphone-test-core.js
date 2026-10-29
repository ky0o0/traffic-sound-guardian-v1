// Pure helpers used by the optional microphone routing diagnostic.
// Do not confuse browser-reported track identity with physically verified ANC microphone access.
export function microphoneMatch(requestedId, track, devices = []) {
  if (!requestedId) return 'automatic';
  const actual = track?.getSettings?.()?.deviceId;
  if (!actual) return 'unknown';
  return actual === requestedId ? 'reported-match' : 'mismatch';
}
export function browserTrackInfo(track, devices = [], requestedId = '') {
  const settings = track?.getSettings?.() || {};
  const matching = devices.find(d => d.kind === 'audioinput' &&
    settings.deviceId && d.deviceId === settings.deviceId);
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
  return {
    label: track?.label || matching?.label || null,
    match: microphoneMatch(requestedId,track,devices),
    sampleRate: valid(settings.sampleRate),
    channels: valid(settings.channelCount),
    state: !track ? null : track.readyState === 'ended' ? 'ended' : track.muted ? 'muted' : track.readyState
  };
}
export function meterReading(samples) {
  if (!samples?.length) return {rms:0,dbfs:null,level:0};
  let total=0;
  for(const sample of samples) {
    const bounded = Number.isFinite(sample) ? Math.max(-1,Math.min(1,sample)) : 0;
    total+=bounded*bounded;
  }
  const rms = Math.sqrt(total/samples.length);
  const dbfs = rms>0 ? 20*Math.log10(rms) : null;
  // The visual width is not sound pressure or a calibrated safety metric.
  const level = dbfs===null ? 0 : Math.max(0,Math.min(100,(dbfs+65)/65*100));
  return {rms,dbfs,level};
}
export function micErrorCode(error) {
  const name=error?.name;
  if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError') return 'denied';
  if(name==='NotFoundError'||name==='DevicesNotFoundError') return 'noDevice';
  if(name==='NotReadableError'||name==='TrackStartError'||name==='AbortError') return 'busy';
  if(name==='OverconstrainedError') return 'unsupportedSelection';
  return 'otherError';
}

/* Read-only display helper: reports only browser-exposed information.
 * A track label is NOT proof that the named physical microphone is active.
 * The input source cannot be inferred from the connected audio OUTPUT device.
 * No media acquisition, recording, storage, network or device switching.
 */
export function microphoneSourceEvidence(track, devices = []) {
  const rawTrackLabel = typeof track?.label === 'string' ? track.label.trim() : '';
  let deviceId = '';
  try {
    const id = track?.getSettings?.()?.deviceId;
    if (typeof id === 'string') deviceId = id;
  } catch { /* Some Safari versions hide device settings. */ }
  const matched = deviceId && Array.isArray(devices) ? devices.find(d =>
    d?.kind === 'audioinput' && d.deviceId === deviceId && typeof d.label === 'string' &&
    d.label.trim()) : null;

  // Prefer a descriptive track label; generic "Microphone" can be improved
  // by a device list entry matching its reported deviceId.
  const generic = /^(microphone|mic|default|audio input|マイク|麦克风)(?:\s*\(.*\))?$/i;
  const deviceListLabel = matched?.label?.trim() || '';
  const label = (!rawTrackLabel || generic.test(rawTrackLabel)) && deviceListLabel
    ? deviceListLabel : rawTrackLabel;
  const basis = label === deviceListLabel && label !== rawTrackLabel ? 'device-list' :
    label ? 'track-label' : 'unavailable';

  // Only identify a type if the text *explicitly* says so. For example,
  // a generic model name, "Default", or "Microphone" remains unknown.
  const headphones = /airpods|earbuds?|earphones?|headphones?|headsets?|bluetooth\s*(mic|microphone|headset)|\b(beats\s+(studio|fit|flex|solo|powerbeats)|sony\s+wh-|sony\s+wf-|wh-1000xm|wf-1000xm|quietcomfort\s+(ultra|earbuds|headphones))\b|イヤホン|ヘッドホン|耳机|耳機/i;
  const builtIn = /\b(built[ -]?in|internal|integrated)\s+(microphone|mic)\b|\b(iphone|ipad|macbook)\s+(microphone|mic)\b|内蔵マイク|内置麦克风|内置麥克風/i;
  const kind = !label ? 'unknown' : headphones.test(label) ? 'headset' :
    builtIn.test(label) ? 'built-in' : 'unknown';

  return { kind, label, basis, hasReportedDeviceId: !!deviceId };
}

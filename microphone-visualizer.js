export function createMicrophoneVisualizer({ ui, window, requestAnimationFrame, getView, isCurrent }) {
  function drawWaveform(samples) {
    const canvas = ui.waveform;
    // The canvas is hidden in the Standard circle mode and the Test layout.
    // Skip 2,048 display samples whenever the waveform cannot be seen.
    if (canvas.getClientRects && !canvas.getClientRects().length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth || 300;
    const height = canvas.clientHeight || 48;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio),
      pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const light = window.document?.documentElement?.dataset?.theme === 'light';
    ctx.strokeStyle = getView() === 'warning' ? (light ? '#b5233b' : '#ff8795') : light ? '#177e75' : '#98dacc';
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (!samples) {
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
    } else
      for (let i = 0; i < samples.length; i++) {
        // V1.3.1: visual-only soft-knee amplification. True PCM controls the
        // waveform; tanh makes quiet sounds visible without harsh clipping.
        // Never modify PCM, capture buffers, YAMNet inputs or detection scores.
        const displaySample = Math.tanh(samples[i] * 18);
        const x = (i * width) / (samples.length - 1);
        const y = height / 2 - displaySample * height * 0.46;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    ctx.stroke();
  }
  function resetVisuals() {
    ui.visual.style.setProperty('--audio-level', '0');
    drawWaveform(null);
  }
  function startVisuals(s) {
    // Observe the SAME microphone stream in a parallel, read-only branch. The
    // original source -> capture -> silent output path is deliberately unchanged.
    s.analyser = s.context.createAnalyser();
    s.analyser.fftSize = 2048;
    s.source.connect(s.analyser); // AnalyserNode output may remain unconnected.
    const samples = new Float32Array(s.analyser.fftSize);
    // The rolling ten-second timeline can refresh up to 60 times/sec, independently
    // of the older full-PCM visual and microphone glow (kept at <=30fps).
    // The same read-only AnalyserNode is used; YAMNet's audio path is untouched.
    const TIMELINE_INTERVAL_MS = 1000 / 60;
    const LEGACY_INTERVAL_MS = 1000 / 30;
    let lastVisual = -Infinity,
      lastDraw = -Infinity,
      level = 0;
    const draw = (now) => {
      if (!isCurrent(s) || !s.connected || s.context.state !== 'running') return;
      // 1ms tolerance prevents a 60Hz screen's frame-clock rounding from halving the rate.
      if (now - lastVisual >= TIMELINE_INTERVAL_MS - 1) {
        lastVisual = now;
        s.analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const rms = Math.sqrt(energy / samples.length);
        // Visual-only 60fps RMS events; no PCM or AI results are forwarded/stored.
        window.dispatchEvent?.(
          new CustomEvent('tsg:visual', { detail: { time: s.context.currentTime, rms } }),
        );
        if (now - lastDraw >= LEGACY_INTERVAL_MS - 1) {
          const elapsed = Math.min(100, now - lastDraw);
          lastDraw = now;
          const target = Math.min(1, Math.sqrt(rms) * 2.4);
          level += (target - level) * (1 - Math.exp(-elapsed / (target > level ? 55 : 160)));
          if (level < 0.001) level = 0;
          drawWaveform(samples);
          ui.visual.style.setProperty('--audio-level', level.toFixed(4));
        }
      }
      s.visualFrame = requestAnimationFrame(draw);
    };
    s.visualFrame = requestAnimationFrame(draw);
  }
  return { drawWaveform, resetVisuals, startVisuals };
}

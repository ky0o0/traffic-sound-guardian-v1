// Bounded scalar metadata only. No PCM, persistence, network or second inference.
export class ResearchSession {
  constructor(names) { this.names = [...names]; this.start(null); }
  start(at, monotonicMs = null) {
    this.startedAt = at; this.startedMs = monotonicMs; this.stoppedMs = null;
    this.running = at !== null; this.total = 0; this.records = []; this.timings = [];
    this.updates = []; this.last = null; this.lastValidAt = null; this.lastWarningAt = null;
    this.counts = Object.fromEntries(this.names.map(name => [name, 0]));
  }
  stop(monotonicMs) { if (this.running) this.stoppedMs = monotonicMs; this.running = false; }
  append(record) { this.records.push(record); if (this.records.length > 100) this.records.shift(); }
  observe(data) {
    if (!this.running) return;
    this.total++;
    // Select only scalar fields from the actual controller event.
    const scores = Object.fromEntries(this.names.map(name => [name, Number.isFinite(data.scores?.[name]) ? data.scores[name] : null]));
    const thresholds = Object.fromEntries(this.names.map(name => [name, Number.isFinite(data.thresholds?.[name]) ? data.thresholds[name] : null]));
    const record = {kind:'inference', at:data.at, monotonicMs:data.monotonicMs,
      category:data.topCategory?.categoryName ?? null, score:Number.isFinite(data.topCategory?.score) ? data.topCategory.score : null,
      inferenceMs:Number.isFinite(data.inferenceMs) ? data.inferenceMs : null,
      top5:Array.isArray(data.top5) ? data.top5.map(x => ({categoryName:x.categoryName, score:x.score})) : null,
      scores, thresholds, inputSampleRate:Number.isFinite(data.inputSampleRate) ? data.inputSampleRate : null,
      contextSampleRate:Number.isFinite(data.contextSampleRate) ? data.contextSampleRate : null,
      microphone:data.microphone ? {label:data.microphone.label,basis:data.microphone.basis} : null};
    this.last = record;
    if (record.category && record.score !== null) this.lastValidAt = record.at;
    if (record.inferenceMs !== null) {this.timings.push(record.inferenceMs); if(this.timings.length > 20)this.timings.shift();}
    if (Number.isFinite(data.monotonicMs)) { this.updates.push(data.monotonicMs); if(this.updates.length > 20)this.updates.shift(); }
    this.append(record);
    if (Object.hasOwn(this.counts, data.warning)) {
      this.counts[data.warning]++; this.lastWarningAt = data.at;
      this.append({...record,kind:'warning',category:data.warning,score:scores[data.warning],top5:null});
    }
  }
  elapsed(now) { return this.startedMs === null ? null : Math.max(0, (this.running ? now : this.stoppedMs ?? this.startedMs) - this.startedMs); }
  get meanMs() { return this.timings.length ? this.timings.reduce((a,b) => a+b,0)/this.timings.length : null; }
  get hz() {
    const span = this.updates.at(-1) - this.updates[0];
    return this.updates.length > 1 && span > 0 ? (this.updates.length-1)*1000/span : null;
  }
  csv() {
    // Quote every cell, and neutralize spreadsheet formulas from browser labels.
    const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, x => "'"+x).replaceAll('"','""') + '"';
    const headers = ['time_iso','kind','category','raw_score','model_inference_ms','top5_raw_json','input_sample_rate_hz','context_sample_rate_hz','microphone_label','microphone_evidence',...this.names.flatMap(n => ['score:'+n,'effective_threshold:'+n])];
    const rows = this.records.map(r => [new Date(r.at).toISOString(),r.kind,r.category,r.score,r.inferenceMs,r.top5 ? JSON.stringify(r.top5) : null,r.inputSampleRate,r.contextSampleRate,r.microphone?.label,r.microphone?.basis,...this.names.flatMap(n => [r.scores[n],r.thresholds[n]])]);
    return '\uFEFF' + [headers,...rows].map(row => row.map(cell).join(',')).join('\r\n');
  }
}

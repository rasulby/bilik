// Short, locally synthesized cues. No network audio or background playback.
export const soundPatterns = {
  buzzer: [740],
  correct: [660, 880],
  wrong: [230, 150],
  false_start: [180, 180],
  timer_start: [500, 1000],
  timer_end: [300, 180, 110],
  score_awarded: [880, 1100, 1320],
  next_question: [520, 700],
  next_stage: [520, 700, 1040],
};
export class SoundEffects {
  constructor({
    defaultEnabled = true,
    storageKey = "bilik-sounds",
    storage,
    AudioContext,
  } = {}) {
    this.storageKey = storageKey;
    try {
      this.storage = storage ?? globalThis.window?.localStorage;
    } catch {}
    this.enabled = defaultEnabled;
    try {
      const saved = this.storage?.getItem(storageKey);
      if (saved !== null && saved !== undefined)
        this.enabled = saved === "true";
    } catch {}
    this.AudioContext =
      AudioContext ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
    this.context = null;
    this.seen = new Set();
    this.nodes = new Set();
    this.nextTime = 0;
  }
  unlock() {
    if (!this.enabled || !this.AudioContext) return;
    try {
      this.context ||= new this.AudioContext();
      if (this.context.state !== "running")
        this.context.resume().catch(() => {});
    } catch {
      /* Unsupported audio must never prevent gameplay. */
    }
  }
  toggle() {
    this.enabled = !this.enabled;
    try {
      this.storage?.setItem(this.storageKey, String(this.enabled));
    } catch {}
    if (this.enabled) this.unlock();
    else {
      for (const node of this.nodes)
        try {
          node.stop();
        } catch {}
      this.nodes.clear();
      this.nextTime = 0;
      this.context?.suspend().catch(() => {});
    }
    return this.enabled;
  }
  play(event) {
    if (!event || typeof event.id !== "string" || this.seen.has(event.id))
      return false;
    this.seen.add(event.id);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    const notes = soundPatterns[event.kind],
      ctx = this.context;
    if (
      !this.enabled ||
      !notes ||
      !ctx ||
      ctx.state !== "running" ||
      Date.now() - event.timestamp > 3000
    )
      return false;
    try {
      const start = Math.max(ctx.currentTime, this.nextTime);
      if (start - ctx.currentTime > 0.8) return false; // Bound bursts of simultaneous buzzes.
      const duration = event.kind === "timer_end" ? 0.1 : 0.065;
      notes.forEach((frequency, index) => {
        const at = start + index * (duration + 0.018),
          osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.07, at + 0.007);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        this.nodes.add(osc);
        osc.onended = () => {
          this.nodes.delete(osc);
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(at);
        osc.stop(at + duration + 0.005);
      });
      this.nextTime = start + notes.length * (duration + 0.018) + 0.03;
      return true;
    } catch {
      return false;
    }
  }
}

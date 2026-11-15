/** A short local chime. Audio is created/resumed only from a user gesture. */
export class CompletionSound {
  private context: AudioContext | null = null;
  private disposed = false;
  private active = new Set<OscillatorNode>();
  private playingUntil = 0;

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return false;
      this.context ??= new Constructor();
      const context = this.context;
      if (context.state !== 'running') {
        let timer: number | undefined;
        try {
          await Promise.race([context.resume(), new Promise<void>(resolve => { timer = window.setTimeout(resolve, 2000); })]);
        } finally { window.clearTimeout(timer); }
      }
      return !this.disposed && context.state === 'running';
    } catch { return false; }
  }

  play(): boolean {
    const context = this.context;
    if (this.disposed || !context || context.state !== 'running') return false;
    // A burst of completions shares one chime instead of stacking loud tones.
    if (context.currentTime < this.playingUntil) return true;
    try {
      const start = context.currentTime + 0.01;
      for (const [frequency, offset] of [[880, 0], [1174.66, 0.2], [1567.98, 0.4], [1174.66, 0.85], [1567.98, 1.05]]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.23, start + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32);
        oscillator.connect(gain); gain.connect(context.destination);
        this.active.add(oscillator);
        oscillator.onended = () => { this.active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start + offset); oscillator.stop(start + offset + 0.34);
      }
      this.playingUntil = start + 1.4;
      return true;
    } catch { this.stop(); return false; }
  }

  stop() {
    for (const oscillator of this.active) { try { oscillator.stop(); } catch {} }
    this.playingUntil = 0;
  }

  dispose() {
    this.disposed = true; this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}

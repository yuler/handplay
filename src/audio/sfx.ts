// Procedural WebAudio SFX (zero external asset loading, safe for iOS Safari)
class SoundEngine {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastStretchAt = 0;
  muted = false;

  /** Must run inside a user gesture on iOS before any sound can play. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      // Soft master bus: overall gain + gentle compressor so stacked cues never get piercing
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 14;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp);
      comp.connect(ctx.destination);
      this.ctx = ctx;
      this.out = master;
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.16,
    delay = 0,
  ) {
    if (this.muted || !this.ctx || !this.out) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Band-passed noise sweep: whooshes, puffs and soft thumps. */
  private noise(duration: number, fromHz: number, toHz: number, gainVal = 0.08, delay = 0, q = 0.9) {
    if (this.muted || !this.ctx || !this.out) return;
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 0.6);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(fromHz, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  // ---- UI ----
  click() {
    this.tone(520, 680, 0.06, 'triangle', 0.1);
  }

  /** Lobby card tap: bubbly "bloop" */
  tap() {
    this.tone(620, 880, 0.08, 'triangle', 0.12);
    this.tone(990, 1180, 0.07, 'sine', 0.07, 0.05);
    this.vibrate(10);
  }

  back() {
    this.tone(720, 440, 0.12, 'triangle', 0.1);
    this.tone(540, 330, 0.1, 'sine', 0.06, 0.06);
  }

  again() {
    this.tone(523.25, 523.25, 0.07, 'triangle', 0.1);
    this.tone(659.25, 659.25, 0.07, 'triangle', 0.1, 0.06);
    this.tone(783.99, 880, 0.12, 'triangle', 0.12, 0.12);
  }

  /** Call BEFORE muting so the "off" blip is still audible. */
  toggle(on: boolean) {
    if (on) this.tone(520, 820, 0.09, 'sine', 0.12);
    else this.tone(640, 360, 0.09, 'sine', 0.1);
  }

  whoosh() {
    this.noise(0.26, 380, 1900, 0.07);
  }

  loaderStart() {
    this.tone(392, 392, 0.09, 'sine', 0.08);
    this.tone(523.25, 587.33, 0.12, 'sine', 0.08, 0.09);
  }

  ready() {
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.09, i * 0.06));
    this.noise(0.3, 3000, 6000, 0.025, 0.12, 2);
  }

  /** Round start: "ding — DING!" */
  go() {
    this.tone(659.25, 659.25, 0.1, 'triangle', 0.11);
    this.tone(987.77, 1046.5, 0.22, 'triangle', 0.13, 0.13);
  }

  /** Last-seconds countdown, n = seconds left (5..1) */
  tick(n: number) {
    const f = n <= 1 ? 1174.66 : 880 + (5 - n) * 40;
    this.tone(f, f * 0.98, 0.06, 'sine', n <= 1 ? 0.12 : 0.09);
    this.tone(f * 0.5, f * 0.5, 0.04, 'triangle', 0.05);
  }

  // ---- Gameplay ----
  hit(combo = 1) {
    // Pentatonic climbing pitch
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const base = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    this.tone(base, base * 1.12, 0.14, 'triangle', 0.17);
    this.tone(base * 1.5, base * 1.55, 0.12, 'sine', 0.08, 0.04);
    this.vibrate(14);
  }

  fever() {
    this.tone(523.25, 523.25, 0.12, 'triangle', 0.15, 0);
    this.tone(659.25, 659.25, 0.12, 'triangle', 0.15, 0.08);
    this.tone(783.99, 783.99, 0.14, 'triangle', 0.16, 0.16);
    this.tone(1046.5, 1100, 0.28, 'sine', 0.18, 0.24);
    this.noise(0.4, 2500, 6500, 0.03, 0.24, 2);
    this.vibrate([16, 40, 24]);
  }

  /** Soft cartoon "boing-down", not a harsh buzzer */
  miss() {
    this.tone(330, 180, 0.24, 'triangle', 0.13);
    this.tone(250, 140, 0.2, 'sine', 0.08, 0.08);
    this.vibrate(28);
  }

  /** Finger-math card appears */
  question() {
    this.tone(587.33, 587.33, 0.08, 'sine', 0.09);
    this.tone(783.99, 932.33, 0.14, 'sine', 0.09, 0.09);
  }

  newRecord() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.13, i * 0.1));
    this.tone(1318.5, 1318.5, 0.5, 'sine', 0.1, 0.42);
    this.tone(1046.5, 1046.5, 0.5, 'triangle', 0.1, 0.42);
    this.noise(0.6, 3000, 7000, 0.03, 0.42, 2);
    this.vibrate([20, 50, 20, 50, 30]);
  }

  pinchGrab() {
    this.tone(360, 520, 0.07, 'sine', 0.11);
    this.vibrate(10);
  }

  /** Rubber-band creak; self-throttled so callers can't turn it into a machine gun */
  stretchTick(tension: number) {
    const now = performance.now();
    if (now - this.lastStretchAt < 120) return;
    this.lastStretchAt = now;
    const f = 220 + tension * 260;
    this.tone(f, f * 1.05, 0.04, 'triangle', 0.05);
  }

  launch(power: number) {
    this.tone(180 + power * 180, 620 + power * 240, 0.16, 'triangle', 0.14);
    this.noise(0.22, 600, 2400, 0.06);
    this.vibrate(16);
  }

  pop(combo = 1) {
    const f = 440 + Math.min(8, combo) * 70;
    this.tone(f, f * 1.6, 0.1, 'sine', 0.18);
    this.tone(f * 0.5, 110, 0.09, 'triangle', 0.1);
    this.vibrate(18);
  }

  star() {
    [1318.5, 1567.98, 2093].forEach((f, i) => this.tone(f, f, 0.1, 'sine', 0.07, i * 0.05));
  }

  /** Shot left the screen without hitting anything */
  whiff() {
    this.tone(420, 300, 0.12, 'sine', 0.05);
  }

  /** Muffled cartoon "poof-boom" instead of a harsh saw wave */
  bomb() {
    this.tone(150, 48, 0.34, 'sine', 0.24);
    this.noise(0.36, 900, 120, 0.16, 0, 0.7);
    this.vibrate([40, 30, 40]);
  }

  /** Twin eye-laser pew for Mouth Munch */
  laser() {
    this.tone(1320, 340, 0.14, 'sawtooth', 0.08);
    this.tone(1680, 520, 0.12, 'triangle', 0.09, 0.02);
    this.vibrate(12);
  }

  /** Playful chomp/gulp when eating stars/fruits */
  munch(combo = 1) {
    const f = 360 + Math.min(10, combo) * 48;
    this.tone(f, f * 1.45, 0.08, 'triangle', 0.15);
    this.tone(f * 1.5, f * 1.8, 0.07, 'sine', 0.08, 0.04);
    this.vibrate(10);
  }

  /** Cheek-puff shield deflect */
  shield() {
    this.tone(420, 880, 0.14, 'sine', 0.13);
    this.tone(660, 1180, 0.12, 'triangle', 0.08, 0.04);
    this.vibrate(15);
  }

  /** Rune lightning zap */
  zap(count = 1) {
    const base = 620 + Math.min(4, count) * 90;
    this.tone(base, base * 1.65, 0.12, 'triangle', 0.16);
    this.tone(base * 0.5, base * 1.2, 0.16, 'sawtooth', 0.06, 0.02);
    this.noise(0.18, 2200, 6200, 0.07, 0, 1.4);
    this.vibrate(count > 1 ? [16, 24, 18] : 14);
  }

  /** Camera shutter click for moment-of-failure snapshot */
  shutter() {
    this.noise(0.08, 1800, 4800, 0.15, 0, 0.8);
    this.tone(920, 320, 0.07, 'triangle', 0.12, 0.02);
    this.vibrate([25, 30, 35]);
  }

  /** Calibration ready countdown beep */
  countdown(go = false) {
    if (go) {
      this.tone(880, 1174.66, 0.18, 'triangle', 0.14);
    } else {
      this.tone(587.33, 587.33, 0.09, 'sine', 0.11);
    }
  }

  finish() {
    this.tone(523.25, 523.25, 0.15, 'triangle', 0.15, 0);
    this.tone(659.25, 659.25, 0.15, 'triangle', 0.15, 0.12);
    this.tone(783.99, 783.99, 0.15, 'triangle', 0.15, 0.24);
    this.tone(1046.5, 1046.5, 0.4, 'triangle', 0.18, 0.36);
  }

  vibrate(pattern: number | number[]) {
    if (!this.muted && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // ignore unsupported
      }
    }
  }
}

export const sfx = new SoundEngine();

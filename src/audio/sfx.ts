// Procedural WebAudio SFX (zero external asset loading, safe for iOS Safari)
class SoundEngine {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
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
    if (this.muted || !this.ctx) return;
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
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  click() {
    this.tone(520, 680, 0.06, 'triangle', 0.12);
  }

  hit(combo = 1) {
    // Pentatonic climbing pitch
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const base = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    this.tone(base, base * 1.12, 0.14, 'triangle', 0.2);
    this.tone(base * 1.5, base * 1.55, 0.12, 'sine', 0.1, 0.04);
    this.vibrate(18);
  }

  fever() {
    this.tone(523.25, 523.25, 0.12, 'triangle', 0.18, 0);
    this.tone(659.25, 659.25, 0.12, 'triangle', 0.18, 0.08);
    this.tone(783.99, 783.99, 0.14, 'triangle', 0.2, 0.16);
    this.tone(1046.5, 1100, 0.28, 'sine', 0.22, 0.24);
    this.vibrate([20, 40, 35]);
  }

  miss() {
    this.tone(240, 140, 0.22, 'sawtooth', 0.12);
    this.vibrate([35, 30, 35]);
  }

  pinchGrab() {
    this.tone(360, 520, 0.07, 'sine', 0.12);
    this.vibrate(12);
  }

  stretchTick(tension: number) {
    const f = 220 + tension * 260;
    this.tone(f, f * 1.05, 0.035, 'triangle', 0.06);
  }

  launch(power: number) {
    this.tone(180 + power * 180, 620 + power * 240, 0.16, 'triangle', 0.18);
    this.vibrate(22);
  }

  pop(combo = 1) {
    const f = 440 + Math.min(8, combo) * 70;
    this.tone(f, f * 1.6, 0.1, 'sine', 0.22);
    this.tone(f * 0.5, 110, 0.09, 'triangle', 0.14);
    this.vibrate(25);
  }

  bomb() {
    this.tone(160, 45, 0.32, 'sawtooth', 0.2);
    this.tone(100, 38, 0.28, 'square', 0.12, 0.02);
    this.vibrate([60, 30, 60]);
  }

  finish() {
    this.tone(523.25, 523.25, 0.15, 'triangle', 0.18, 0);
    this.tone(659.25, 659.25, 0.15, 'triangle', 0.18, 0.12);
    this.tone(783.99, 783.99, 0.15, 'triangle', 0.18, 0.24);
    this.tone(1046.5, 1046.5, 0.4, 'triangle', 0.22, 0.36);
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

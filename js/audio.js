// Tiny synthesized SFX. No audio files, no music loops, no extra downloads.
// Every sound is a short oscillator burst that is garbage-collected after use.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.07;
    this.active = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  tone({ freq = 220, to = freq, type = 'square', dur = 0.1, gain = 0.5, delay = 0 }) {
    if (!this.enabled || !this.ctx || this.active > 7) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this.master);
    this.active++;
    osc.onended = () => {
      this.active--;
      osc.disconnect();
      env.disconnect();
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'swing':
        this.tone({ freq: 190, to: 90, type: 'square', dur: 0.07, gain: 0.16 });
        break;
      case 'hit':
        this.tone({ freq: 120, to: 55, type: 'square', dur: 0.08, gain: 0.3 });
        this.tone({ freq: 260, to: 120, type: 'triangle', dur: 0.04, gain: 0.1 });
        break;
      case 'crit':
        this.tone({ freq: 170, to: 60, type: 'sawtooth', dur: 0.11, gain: 0.28 });
        this.tone({ freq: 520, to: 220, type: 'square', dur: 0.06, gain: 0.12, delay: 0.02 });
        break;
      case 'hurt':
        this.tone({ freq: 130, to: 62, type: 'sawtooth', dur: 0.16, gain: 0.22 });
        break;
      case 'ember':
        this.tone({ freq: 340, to: 760, type: 'triangle', dur: 0.16, gain: 0.22 });
        this.tone({ freq: 680, to: 340, type: 'sine', dur: 0.2, gain: 0.1, delay: 0.02 });
        break;
      case 'mend':
        this.tone({ freq: 440, to: 880, type: 'sine', dur: 0.33, gain: 0.17 });
        this.tone({ freq: 660, to: 990, type: 'triangle', dur: 0.3, gain: 0.08, delay: 0.06 });
        break;
      case 'potion':
        this.tone({ freq: 300, to: 620, type: 'sine', dur: 0.22, gain: 0.14 });
        break;
      case 'pickup':
        this.tone({ freq: 760, to: 1180, type: 'square', dur: 0.07, gain: 0.09 });
        break;
      case 'coin':
        this.tone({ freq: 980, to: 1420, type: 'square', dur: 0.06, gain: 0.08 });
        break;
      case 'level':
        [0, 0.09, 0.18].forEach((d, i) => this.tone({ freq: 440 * (1 + i * 0.26), to: 440 * (1 + i * 0.32), type: 'triangle', dur: 0.22, gain: 0.15, delay: d }));
        break;
      case 'quest':
        this.tone({ freq: 520, to: 700, type: 'triangle', dur: 0.18, gain: 0.13 });
        this.tone({ freq: 700, to: 900, type: 'triangle', dur: 0.22, gain: 0.1, delay: 0.1 });
        break;
      case 'death':
        this.tone({ freq: 150, to: 42, type: 'sawtooth', dur: 0.8, gain: 0.22 });
        break;
      case 'boss':
        this.tone({ freq: 74, to: 40, type: 'sawtooth', dur: 0.9, gain: 0.2 });
        this.tone({ freq: 52, to: 30, type: 'triangle', dur: 1.1, gain: 0.18, delay: 0.1 });
        break;
      case 'ui':
        this.tone({ freq: 480, to: 620, type: 'square', dur: 0.04, gain: 0.06 });
        break;
      default:
        break;
    }
  }
}

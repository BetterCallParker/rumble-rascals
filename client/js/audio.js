// Procedural cartoon sound effects (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
    this.lastPlay = new Map();
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running' && this.enabled;
  }

  // rate-limit identical sounds so 8-player chaos doesn't clip
  gate(key, ms) {
    const now = performance.now();
    if (now - (this.lastPlay.get(key) || 0) < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noise(t, dur, { type = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, freqEnd = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.4, attack = 0.003, vibrato = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = freq * 0.04;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, power = 10) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005;
    const p = Math.min(1.6, Math.max(0.35, power / 14));
    switch (name) {
      case 'punch':
        this.tone(t, 0.16, { freq: 150 * (1.2 - p * 0.2), freqEnd: 45, gain: 0.7 * p });
        this.noise(t, 0.09, { freq: 2200, freqEnd: 400, gain: 0.45 * p });
        break;
      case 'kick':
        this.tone(t, 0.2, { freq: 110, freqEnd: 38, gain: 0.8 * p });
        this.noise(t, 0.12, { freq: 1200, freqEnd: 250, gain: 0.5 * p });
        break;
      case 'wood':
        this.noise(t, 0.12, { type: 'bandpass', freq: 900, q: 3, gain: 0.9 * p });
        this.tone(t, 0.12, { type: 'triangle', freq: 320, freqEnd: 180, gain: 0.45 * p });
        this.tone(t, 0.14, { freq: 120, freqEnd: 50, gain: 0.5 * p });
        break;
      case 'metal':
        for (const [f, gg] of [[523, 0.3], [1187, 0.18], [1760, 0.12], [2637, 0.08]]) {
          this.tone(t, 0.55 * p, { type: 'triangle', freq: f * (0.95 + Math.random() * 0.1), gain: gg * p });
        }
        this.noise(t, 0.05, { type: 'highpass', freq: 3000, gain: 0.4 * p });
        this.tone(t, 0.15, { freq: 130, freqEnd: 50, gain: 0.5 * p });
        break;
      case 'pan':
        for (const [f, gg] of [[392, 0.35], [988, 0.2], [1568, 0.14], [2200, 0.1]]) {
          this.tone(t, 0.9, { type: 'sine', freq: f, gain: gg * p, vibrato: 7 });
        }
        this.noise(t, 0.04, { type: 'highpass', freq: 2500, gain: 0.35 });
        break;
      case 'slap':
        this.noise(t, 0.08, { type: 'highpass', freq: 1800, gain: 0.9 * p });
        this.noise(t + 0.01, 0.12, { type: 'bandpass', freq: 600, q: 2, gain: 0.4 * p });
        break;
      case 'rubber':
      case 'boing':
        this.tone(t, 0.35, { freq: 180, freqEnd: 520, gain: 0.45, vibrato: 18 });
        break;
      case 'whoosh':
        this.noise(t, 0.2 + p * 0.06, { type: 'bandpass', freq: 500, freqEnd: 2600, q: 1.5, gain: 0.35 * p, attack: 0.04 });
        break;
      case 'bigwhoosh':
        this.noise(t, 0.32, { type: 'bandpass', freq: 300, freqEnd: 3000, q: 1.2, gain: 0.6, attack: 0.06 });
        break;
      case 'jump':
        if (!this.gate('jump', 40)) return;
        this.tone(t, 0.12, { type: 'square', freq: 260, freqEnd: 620, gain: 0.08 });
        break;
      case 'land':
        if (!this.gate('land', 40)) return;
        this.tone(t, 0.1, { freq: 90, freqEnd: 40, gain: 0.35 * p });
        this.noise(t, 0.08, { freq: 500, gain: 0.25 * p });
        break;
      case 'bounce':
        if (!this.gate('bounce', 50)) return;
        this.tone(t, 0.14, { freq: 140, freqEnd: 60, gain: 0.5 * p });
        this.noise(t, 0.1, { freq: 700, gain: 0.3 * p });
        break;
      case 'block':
        this.tone(t, 0.08, { type: 'square', freq: 220, freqEnd: 160, gain: 0.18 });
        this.noise(t, 0.06, { type: 'bandpass', freq: 1500, q: 4, gain: 0.5 });
        break;
      case 'parry':
        this.tone(t, 0.6, { type: 'triangle', freq: 1318, gain: 0.35 });
        this.tone(t, 0.6, { type: 'sine', freq: 1975, gain: 0.25 });
        this.tone(t + 0.06, 0.5, { type: 'sine', freq: 2637, gain: 0.18 });
        break;
      case 'guardbreak':
        this.noise(t, 0.3, { freq: 1800, freqEnd: 200, gain: 0.8 });
        this.tone(t, 0.3, { type: 'sawtooth', freq: 300, freqEnd: 80, gain: 0.2 });
        break;
      case 'grab':
        if (!this.gate('grab', 60)) return;
        this.noise(t, 0.09, { type: 'bandpass', freq: 1200, q: 2, gain: 0.35 });
        this.tone(t, 0.07, { freq: 300, freqEnd: 200, gain: 0.15 });
        break;
      case 'lift':
        this.tone(t, 0.3, { type: 'triangle', freq: 200, freqEnd: 420, gain: 0.25 });
        break;
      case 'throw':
        this.noise(t, 0.28, { type: 'bandpass', freq: 400, freqEnd: 2200, q: 1.2, gain: 0.5, attack: 0.03 });
        this.tone(t, 0.18, { type: 'triangle', freq: 330, freqEnd: 660, gain: 0.15 });
        break;
      case 'pickup':
        this.tone(t, 0.08, { type: 'square', freq: 660, gain: 0.08 });
        this.tone(t + 0.06, 0.1, { type: 'square', freq: 990, gain: 0.08 });
        break;
      case 'break':
        this.noise(t, 0.35, { type: 'bandpass', freq: 700, q: 1.5, gain: 0.9 });
        for (let i = 0; i < 4; i++) this.noise(t + 0.04 * i + Math.random() * 0.03, 0.05, { type: 'bandpass', freq: 1500 + Math.random() * 1500, q: 5, gain: 0.4 });
        break;
      case 'boom':
        this.noise(t, 1.2, { freq: 1600, freqEnd: 60, gain: 1.2, attack: 0.005 });
        this.tone(t, 0.7, { freq: 90, freqEnd: 25, gain: 1.0 });
        this.noise(t + 0.05, 0.6, { type: 'highpass', freq: 2000, freqEnd: 400, gain: 0.3 });
        break;
      case 'knockout':
        // slide whistle down + birdies
        this.tone(t, 0.9, { type: 'sine', freq: 1600, freqEnd: 220, gain: 0.35, vibrato: 9 });
        for (let i = 0; i < 4; i++) {
          this.tone(t + 0.6 + i * 0.13, 0.08, { type: 'sine', freq: 2600 + (i % 2) * 500, freqEnd: 3400, gain: 0.12 });
        }
        break;
      case 'wake':
        this.tone(t, 0.25, { type: 'triangle', freq: 300, freqEnd: 900, gain: 0.2 });
        break;
      case 'escape':
        this.tone(t, 0.18, { type: 'square', freq: 400, freqEnd: 800, gain: 0.12 });
        this.noise(t, 0.12, { type: 'bandpass', freq: 1500, gain: 0.4 });
        break;
      case 'out':
        // long falling whistle then distant crash
        this.tone(t, 1.3, { type: 'sine', freq: 1900, freqEnd: 300, gain: 0.3 });
        this.noise(t + 1.25, 0.5, { freq: 900, freqEnd: 100, gain: 0.6 });
        this.tone(t + 1.25, 0.3, { freq: 80, freqEnd: 30, gain: 0.5 });
        break;
      case 'splat':
        this.noise(t, 0.18, { freq: 800, freqEnd: 200, gain: 0.8 });
        this.tone(t, 0.2, { freq: 100, freqEnd: 40, gain: 0.6 });
        break;
      case 'ball':
        this.play('metal', 20);
        this.tone(t, 0.4, { freq: 70, freqEnd: 30, gain: 0.9 });
        break;
      case 'dodge':
        this.noise(t, 0.16, { type: 'bandpass', freq: 900, freqEnd: 2400, q: 2, gain: 0.25, attack: 0.02 });
        break;
      case 'charge':
        this.tone(t, 0.25, { type: 'triangle', freq: 500, freqEnd: 1500, gain: 0.12 });
        break;
      case 'chargeFull':
        this.tone(t, 0.35, { type: 'triangle', freq: 1500, gain: 0.2, vibrato: 25 });
        this.tone(t, 0.35, { type: 'sine', freq: 2250, gain: 0.12 });
        break;
      case 'taunt':
        this.tone(t, 0.12, { type: 'square', freq: 520, gain: 0.07 });
        this.tone(t + 0.12, 0.12, { type: 'square', freq: 440, gain: 0.07 });
        this.tone(t + 0.24, 0.2, { type: 'square', freq: 660, gain: 0.07 });
        break;
      case 'drop':
        this.tone(t, 0.6, { type: 'sine', freq: 1200, freqEnd: 500, gain: 0.12 });
        break;
      case 'clunk':
        if (!this.gate('clunk', 70)) return;
        this.tone(t, 0.08, { type: 'triangle', freq: 260, freqEnd: 140, gain: 0.2 * p });
        this.noise(t, 0.05, { type: 'bandpass', freq: 1200, q: 3, gain: 0.2 * p });
        break;
      case 'beep':
        this.tone(t, 0.18, { type: 'square', freq: 660, gain: 0.12 });
        break;
      case 'go':
        this.tone(t, 0.6, { type: 'square', freq: 880, gain: 0.12 });
        this.tone(t, 0.6, { type: 'sawtooth', freq: 440, gain: 0.08 });
        this.noise(t, 0.4, { freq: 3000, gain: 0.2 });
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.11, 0.3, { type: 'square', freq: f, gain: 0.1 }));
        break;
      case 'join':
        this.tone(t, 0.1, { type: 'square', freq: 523, gain: 0.08 });
        this.tone(t + 0.08, 0.14, { type: 'square', freq: 784, gain: 0.08 });
        break;
    }
  }
}

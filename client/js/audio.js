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
      case 'pop':
        this.tone(t, 0.08, { type: 'square', freq: 900, freqEnd: 300, gain: 0.25 });
        this.noise(t, 0.05, { type: 'highpass', freq: 2000, gain: 0.4 });
        break;
      case 'shotgun':
        this.noise(t, 0.4, { freq: 2500, freqEnd: 200, gain: 1.0 });
        this.tone(t, 0.25, { freq: 120, freqEnd: 40, gain: 0.8 });
        break;
      case 'zap':
        this.tone(t, 0.15, { type: 'sawtooth', freq: 1800, freqEnd: 300, gain: 0.18 });
        this.tone(t, 0.15, { type: 'square', freq: 1200, freqEnd: 600, gain: 0.08 });
        break;
      case 'rocket':
        this.noise(t, 0.7, { type: 'bandpass', freq: 600, freqEnd: 2000, q: 0.8, gain: 0.6, attack: 0.03 });
        break;
      case 'flame':
        if (!this.gate('flame', 120)) return;
        this.noise(t, 0.3, { type: 'bandpass', freq: 500, q: 0.6, gain: 0.45, attack: 0.04 });
        break;
      case 'acid':
        if (!this.gate('acid', 110)) return;
        this.noise(t, 0.2, { type: 'highpass', freq: 3000, gain: 0.25, attack: 0.02 });
        this.tone(t, 0.12, { freq: 500, freqEnd: 900, gain: 0.06, vibrato: 30 });
        break;
      case 'sizzle':
        if (!this.gate('sizzle', 250)) return;
        this.noise(t, 0.5, { type: 'highpass', freq: 4000, gain: 0.2, attack: 0.05 });
        break;
      case 'glass':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.02, 0.25, { type: 'sine', freq: 2400 + Math.random() * 1800, gain: 0.12 });
        this.noise(t, 0.15, { type: 'highpass', freq: 3500, gain: 0.5 });
        break;
      case 'snow':
        this.noise(t, 0.25, { freq: 900, freqEnd: 200, gain: 0.6 });
        break;
      case 'squeak':
        this.tone(t, 0.18, { type: 'square', freq: 1300, freqEnd: 1900, gain: 0.12, vibrato: 25 });
        break;
      case 'guitar':
        [196, 247, 294, 392].forEach((f, i) => this.tone(t + i * 0.01, 0.7, { type: 'sawtooth', freq: f, gain: 0.08 }));
        this.noise(t, 0.08, { type: 'bandpass', freq: 1500, gain: 0.4 });
        break;
      case 'horn':
        this.tone(t, 0.9, { type: 'sawtooth', freq: 233, gain: 0.12 });
        this.tone(t, 0.9, { type: 'sawtooth', freq: 293, gain: 0.1 });
        this.tone(t, 0.9, { type: 'square', freq: 349, gain: 0.05 });
        break;
      case 'crush':
        this.play('metal', 22);
        this.tone(t, 0.4, { freq: 60, freqEnd: 25, gain: 1.0 });
        this.noise(t, 0.3, { freq: 600, freqEnd: 80, gain: 0.8 });
        break;
      case 'cling':
        if (!this.gate('cling', 80)) return;
        this.noise(t, 0.06, { type: 'bandpass', freq: 1800, q: 3, gain: 0.3 });
        break;
      case 'climb':
        this.tone(t, 0.15, { type: 'triangle', freq: 300, freqEnd: 700, gain: 0.15 });
        break;
      case 'super':
        this.tone(t, 0.8, { type: 'sawtooth', freq: 220, freqEnd: 880, gain: 0.18 });
        this.tone(t + 0.1, 0.7, { type: 'square', freq: 330, freqEnd: 1320, gain: 0.1 });
        this.noise(t, 0.8, { type: 'bandpass', freq: 400, freqEnd: 3000, q: 1, gain: 0.4, attack: 0.1 });
        break;
      case 'superReady':
        [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.08, 0.2, { type: 'square', freq: f, gain: 0.08 }));
        break;
      case 'click':
        this.tone(t, 0.04, { type: 'square', freq: 1800, gain: 0.08 });
        break;
      case 'catch':
        this.tone(t, 0.12, { type: 'square', freq: 523, gain: 0.08 });
        this.tone(t + 0.07, 0.16, { type: 'square', freq: 1046, gain: 0.08 });
        break;
      case 'finish':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(t + i * 0.09, 0.35, { type: 'square', freq: f, gain: 0.1 }));
        break;
      case 'squash':
        this.tone(t, 0.5, { type: 'sawtooth', freq: 300, freqEnd: 40, gain: 0.3 });
        this.noise(t, 0.3, { freq: 500, freqEnd: 60, gain: 0.8 });
        break;
      case 'select':
        this.tone(t, 0.06, { type: 'square', freq: 880, gain: 0.06 });
        break;
      case 'ready':
        this.tone(t, 0.09, { type: 'square', freq: 660, gain: 0.08 });
        this.tone(t + 0.07, 0.12, { type: 'square', freq: 990, gain: 0.08 });
        break;
    }
  }
}

// ------------------------------------------------------------------ procedural soundtrack
// Each stage gets its own original song built from a chord progression, a groove and a
// seeded melody, scheduled ahead of time with WebAudio.
const SONGS = [
  // Rooftop Rumble: punchy rock
  { name: 'Rooftop Rumble', bpm: 138, root: 48, scale: [0, 2, 4, 5, 7, 9, 10], prog: [0, 6, 3, 0, 0, 6, 4, 4], drums: 'rock', lead: 'square', bass: 'saw', seed: 11 },
  // Freight Frenzy: galloping western
  { name: 'Freight Frenzy', bpm: 156, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 0, 0, 3, 4, 0], drums: 'gallop', lead: 'whistle', bass: 'square', seed: 23 },
  // Ice Floe Fiasco: sparkly disco
  { name: 'Ice Floe Fiasco', bpm: 122, root: 45, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3, 0, 4, 3, 4], drums: 'disco', lead: 'bell', bass: 'saw', seed: 37 },
  // Gear Works: industrial stomp
  { name: 'Gear Works', bpm: 142, root: 40, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6, 0, 0, 3, 4], drums: 'stomp', lead: 'saw', bass: 'square', seed: 51 },
  // Steamroller Stampede: frantic chase
  { name: 'Steamroller Stampede', bpm: 172, root: 47, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 4, 0, 5, 3, 4, 4], drums: 'rock', lead: 'square', bass: 'saw', seed: 67 },
];

function seeded(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.song = -1;
    this.muted = false;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.tempoMul = 1;
    this.intensity = 1; // 0 = muffled lobby, 1 = full
    try { this.muted = localStorage.getItem('rr_music') === 'off'; } catch { /* ignore */ }
  }

  ensure() {
    const c = this.sfx.ctx;
    if (!c || this.out) return !!c;
    this.out = c.createGain();
    this.out.gain.value = this.muted ? 0 : 0.32;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.connect(this.out);
    this.out.connect(c.destination);
    return true;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('rr_music', m ? 'off' : 'on'); } catch { /* ignore */ }
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.32, this.sfx.ctx.currentTime, 0.1);
  }

  setIntensity(v) {
    if (!this.filter || v === this.intensity) return;
    this.intensity = v;
    this.filter.frequency.setTargetAtTime(v >= 1 ? 20000 : 900, this.sfx.ctx.currentTime, 0.4);
  }

  play(i) {
    if (!this.ensure()) return;
    if (i === this.song) return;
    this.song = i;
    const s = SONGS[i % SONGS.length];
    this.cur = s;
    this.rand = seeded(s.seed);
    this.melody = this.compose(s);
    this.step = 0;
    this.next = this.sfx.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  // 8 bars x 16 steps of melody: chord tones on strong beats, passing notes between
  compose(s) {
    const r = this.rand;
    const bars = [];
    const motifA = [], motifB = [];
    for (let i = 0; i < 16; i++) {
      motifA.push(r() < (i % 4 === 0 ? 0.95 : i % 2 === 0 ? 0.55 : 0.25) ? Math.floor(r() * 5) : null);
      motifB.push(r() < (i % 4 === 0 ? 0.9 : i % 2 === 0 ? 0.6 : 0.3) ? Math.floor(r() * 5) : null);
    }
    for (let b = 0; b < 8; b++) {
      const base = b % 4 === 3 ? motifB : motifA;
      bars.push(base.map((n, i) => (n === null ? null : (b % 2 && i > 11 ? n + 2 : n))));
    }
    return bars;
  }

  schedule() {
    const c = this.sfx.ctx;
    if (!c || !this.cur || c.state !== 'running') return;
    const s = this.cur;
    const stepDur = 60 / (s.bpm * this.tempoMul) / 4;
    while (this.next < c.currentTime + 0.15) {
      this.playStep(this.step, this.next, stepDur);
      this.next += stepDur;
      this.step = (this.step + 1) % (16 * 8);
    }
  }

  note(t, freq, dur, type, gain, attack = 0.005) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.filter);
    o.start(t);
    o.stop(t + dur + 0.02);
    return o;
  }

  drum(kind, t) {
    const c = this.sfx.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.filter);
      o.start(t);
      o.stop(t + 0.2);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    if (kind === 'snare') {
      f.type = 'bandpass';
      f.frequency.value = 1800;
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      this.note(t, 190, 0.08, 'triangle', 0.18);
    } else if (kind === 'clap') {
      f.type = 'bandpass';
      f.frequency.value = 1200;
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    } else if (kind === 'metal') {
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 8;
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    } else {
      f.type = 'highpass';
      f.frequency.value = 7000;
      g.gain.setValueAtTime(kind === 'ohat' ? 0.16 : 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ohat' ? 0.16 : 0.04));
    }
    src.connect(f).connect(g).connect(this.filter);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.25);
  }

  playStep(step, t, dur) {
    const s = this.cur;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const deg = s.prog[bar % s.prog.length];
    const sc = s.scale;
    const chord = [0, 2, 4].map((k) => s.root + sc[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7));
    // drums
    switch (s.drums) {
      case 'rock':
        if (i === 0 || i === 8 || i === 10) this.drum('kick', t);
        if (i === 4 || i === 12) this.drum('snare', t);
        if (i % 2 === 0) this.drum('hat', t);
        break;
      case 'gallop':
        if (i % 4 === 0) this.drum('kick', t);
        if (i % 8 === 4) this.drum('snare', t);
        if (i % 4 !== 1) this.drum('hat', t);
        break;
      case 'disco':
        if (i % 4 === 0) this.drum('kick', t);
        if (i === 4 || i === 12) this.drum('clap', t);
        if (i % 4 === 2) this.drum('ohat', t);
        break;
      case 'stomp':
        if (i === 0 || i === 3 || i === 8 || i === 11) this.drum('kick', t);
        if (i === 4 || i === 12) this.drum('snare', t);
        if (i % 4 === 2) this.drum('metal', t);
        break;
    }
    if (this.intensity < 1 && bar % 2) return; // lobby: sparser
    // bass
    const bassPat = s.drums === 'gallop' ? [0, null, 2, null, 0, null, 2, null, 0, null, 2, null, 0, null, 2, null] : [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 1, null, null];
    const bp = bassPat[i];
    if (bp !== null) {
      const n = bp === 2 ? chord[2] - 12 : bp === 1 ? chord[0] - 5 : chord[0] - 12;
      this.note(t, mtof(n), dur * 1.6, s.bass === 'saw' ? 'sawtooth' : 'square', 0.11);
    }
    // chord stabs
    if (i === 2 || i === 6 || i === 10 || i === 14) {
      for (const n of chord) this.note(t, mtof(n + 12), dur * 0.9, 'triangle', 0.035);
    }
    // lead melody
    const m = this.melody[bar % 8][i];
    if (m !== null && m !== undefined) {
      const n = s.root + 24 + sc[(deg + m) % 7] + 12 * Math.floor((deg + m) / 7);
      const type = s.lead === 'bell' ? 'sine' : s.lead === 'whistle' ? 'sine' : s.lead === 'saw' ? 'sawtooth' : 'square';
      const g = s.lead === 'bell' ? 0.09 : s.lead === 'saw' ? 0.05 : 0.055;
      this.note(t, mtof(n), dur * (s.lead === 'bell' ? 3 : 1.7), type, g);
      if (s.lead === 'bell') this.note(t, mtof(n + 12), dur * 2, 'sine', 0.03);
    }
  }
}

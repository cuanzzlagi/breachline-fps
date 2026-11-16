// audio.js — all sound is synthesized with WebAudio at runtime: no audio
// assets, nothing to load. World sounds are placed by distance and pan from
// the listener (the player), and every loud sound also raises a noise event
// on the shared bus, which is how bots hear gunfire.

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.6;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  // A positioned output chain for a world sound at (x,z) heard from (lx,lz,lyaw).
  _pan(x, z, lx, lz, lyaw, baseGain) {
    if (!this.ctx) return null;
    const dx = x - lx, dz = z - lz;
    const dist = Math.hypot(dx, dz);
    const gain = baseGain / (1 + dist * 0.14);
    if (gain < 0.004) return null;
    const g = this.ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (this.ctx.createStereoPanner) {
      const rel = Math.atan2(dx, dz) - lyaw;
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, Math.sin(rel))) * Math.min(1, dist / 6);
      g.connect(p); p.connect(this.master);
      node = g;
    } else g.connect(this.master);
    return { out: node, dist };
  }

  _noise(out, { dur = 0.12, freq = 1800, q = 0.8, type = 'lowpass', gain = 1, slide = 0 }) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(out, { freq = 440, dur = 0.1, type = 'sine', gain = 0.4, slide = 0 }) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // kind: pistol | smg | rifle | shotgun | sniper. At the listener's own
  // position (own=true) the shot is full and dry; a world shot is placed.
  shot(kind, x, z, L, own = false) {
    if (!this.ctx) return;
    const spec = {
      pistol: { f: 1500, d: 0.11, g: 0.5, body: 300 },
      smg: { f: 1700, d: 0.09, g: 0.42, body: 340 },
      rifle: { f: 1250, d: 0.13, g: 0.6, body: 260 },
      shotgun: { f: 800, d: 0.24, g: 0.8, body: 180 },
      sniper: { f: 950, d: 0.34, g: 0.9, body: 150 },
    }[kind] || { f: 1300, d: 0.12, g: 0.5, body: 280 };
    if (own) {
      const out = this.ctx.createGain(); out.gain.value = 0.9; out.connect(this.master);
      this._noise(out, { dur: spec.d, freq: spec.f, gain: spec.g });
      this._noise(out, { dur: spec.d * 0.7, freq: spec.body, gain: spec.g * 0.9 });
      return;
    }
    const p = this._pan(x, z, L.x, L.z, L.yaw, 0.85);
    if (!p) return;
    const far = p.dist > 22;
    this._noise(p.out, { dur: spec.d, freq: far ? spec.f * 0.45 : spec.f, gain: spec.g });
    this._noise(p.out, { dur: spec.d * 0.8, freq: spec.body, gain: spec.g * 0.8 });
  }

  dryFire() { if (this.ctx) this._tone(this.master, { freq: 2100, dur: 0.03, type: 'square', gain: 0.12 }); }
  reload() {
    if (!this.ctx) return;
    this._tone(this.master, { freq: 900, dur: 0.04, type: 'square', gain: 0.15 });
    setTimeout(() => this.ctx && this._tone(this.master, { freq: 620, dur: 0.05, type: 'square', gain: 0.18 }), 260);
  }
  hit(head) {
    if (!this.ctx) return;
    this._tone(this.master, { freq: head ? 2350 : 1650, dur: head ? 0.09 : 0.05, type: 'sine', gain: 0.32 });
  }
  hurt() { if (this.ctx) this._noise(this.master, { dur: 0.1, freq: 500, gain: 0.3 }); }
  step(x, z, L, own = false) {
    if (!this.ctx) return;
    if (own) { this._noise(this.master, { dur: 0.05, freq: 420, gain: 0.06 }); return; }
    const p = this._pan(x, z, L.x, L.z, L.yaw, 0.16);
    if (p) this._noise(p.out, { dur: 0.05, freq: 420, gain: 0.7 });
  }
  throwNade() { if (this.ctx) this._noise(this.master, { dur: 0.08, freq: 900, gain: 0.12 }); }
  flashPop(x, z, L) {
    if (!this.ctx) return;
    const p = this._pan(x, z, L.x, L.z, L.yaw, 0.7);
    if (p) { this._noise(p.out, { dur: 0.16, freq: 3200, type: 'highpass', gain: 0.8 }); this._tone(p.out, { freq: 3400, dur: 0.3, gain: 0.12 }); }
  }
  fragBoom(x, z, L) {
    if (!this.ctx) return;
    const p = this._pan(x, z, L.x, L.z, L.yaw, 1.0) || { out: this.master, dist: 4 };
    this._noise(p.out, { dur: 0.5, freq: 300, gain: 1.0, slide: -220 });
    this._tone(p.out, { freq: 68, dur: 0.42, gain: 0.8, slide: -30 });
  }
  beep(fast = false) { if (this.ctx) this._tone(this.master, { freq: fast ? 1560 : 1180, dur: 0.05, type: 'square', gain: 0.14 }); }
  explosion() {
    if (!this.ctx) return;
    this._noise(this.master, { dur: 1.1, freq: 240, gain: 1.0, slide: -180 });
    this._tone(this.master, { freq: 55, dur: 0.9, gain: 0.9, slide: -25 });
  }
  buy() { if (this.ctx) this._tone(this.master, { freq: 1320, dur: 0.06, type: 'triangle', gain: 0.22 }); }
  deny() { if (this.ctx) this._tone(this.master, { freq: 220, dur: 0.09, type: 'square', gain: 0.14 }); }
  stinger(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, i) => setTimeout(() => this.ctx && this._tone(this.master, { freq: f, dur: 0.22, type: 'triangle', gain: 0.25 }), i * 130));
  }
  plantDone() { if (this.ctx) { this._tone(this.master, { freq: 880, dur: 0.08, type: 'square', gain: 0.2 }); setTimeout(() => this.ctx && this._tone(this.master, { freq: 1320, dur: 0.1, type: 'square', gain: 0.2 }), 110); } }
}

import type { SfxName } from '../game/fxTypes';

export type TrackName = 'title' | 'grass' | 'beach' | 'sky' | 'challenge';

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freq(n: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) return 0;
  let semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  semi += (parseInt(m[3], 10) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

function parse(seq: string): string[] {
  return seq.replace(/\|/g, ' ').trim().split(/\s+/);
}

interface Track {
  bpm: number;
  lead: string[];
  bass: string[];
  chords: string[][];
  leadWave: OscillatorType;
  chordStyle: 'stab' | 'arp';
  kick: number[];
  snare: number[];
  hat: number[];
  leadVol: number;
  swing?: number;
}

const CH = (s: string) => s.split(' ');

const TRACKS: Record<TrackName, Track> = {
  title: {
    bpm: 136,
    leadWave: 'square',
    chordStyle: 'stab',
    leadVol: 0.12,
    lead: parse(`C5 . E5 G5 . E5 C5 . | D5 . F5 A5 . F5 D5 . | E5 . G5 C6 . B5 A5 G5 | A5 - G5 . E5 . . . |
                 F5 . A5 C6 . A5 F5 . | E5 . G5 C6 . G5 E5 . | D5 . F5 A5 G5 F5 E5 D5 | C5 - - . G4 . . .`),
    bass: parse(`C3 . G2 . C3 . G2 . | D3 . A2 . D3 . A2 . | E3 . B2 . E3 . B2 . | A2 . E3 . A2 . E3 . |
                 F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . . .`),
    chords: [CH('E4 G4 C5'), CH('F4 A4 D5'), CH('G4 C5 E5'), CH('E4 A4 C5'), CH('F4 A4 C5'), CH('E4 G4 C5'), CH('F4 B4 D5'), CH('E4 G4 C5')],
    kick: [0, 4],
    snare: [2, 6],
    hat: [1, 3, 5, 7],
  },
  grass: {
    bpm: 144,
    leadWave: 'square',
    chordStyle: 'stab',
    leadVol: 0.11,
    lead: parse(`E5 . C5 . G4 . C5 E5 | G5 - E5 . C5 . D5 E5 | F5 . D5 . A4 . D5 F5 | A5 - G5 . F5 . E5 D5 |
                 E5 . C5 . G4 . C5 E5 | G5 - A5 G5 F5 E5 D5 C5 | D5 . G4 . B4 . D5 F5 | E5 - - . C5 . . .`),
    bass: parse(`C3 . G3 . C3 . G3 . | C3 . G3 . C3 . G3 . | F2 . C3 . F2 . C3 . | F2 . C3 . F2 . C3 . |
                 C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 .`),
    chords: [CH('E4 G4 C5'), CH('E4 G4 C5'), CH('F4 A4 C5'), CH('F4 A4 C5'), CH('E4 G4 C5'), CH('E4 A4 C5'), CH('D4 G4 B4'), CH('E4 G4 C5')],
    kick: [0, 4],
    snare: [2, 6],
    hat: [1, 3, 5, 7],
  },
  beach: {
    bpm: 118,
    leadWave: 'triangle',
    chordStyle: 'stab',
    leadVol: 0.2,
    swing: 0.12,
    lead: parse(`D5 . B4 G4 . B4 D5 . | E5 D5 B4 . G4 . . . | C5 . A4 F#4 . A4 C5 . | D5 C5 A4 . F#4 . . . |
                 B4 . G4 E4 . G4 B4 . | C5 B4 G4 . E4 . D5 . | C5 . A4 . D5 . F#5 . | G5 - - . . . . .`),
    bass: parse(`G2 . . G2 D3 . . . | G2 . . G2 D3 . . . | D2 . . D2 A2 . . . | D2 . . D2 A2 . . . |
                 E2 . . E2 B2 . . . | C3 . . C3 G2 . . . | D2 . . D2 A2 . . . | G2 . . G2 D3 . G2 .`),
    chords: [CH('B3 D4 G4'), CH('B3 D4 G4'), CH('A3 D4 F#4'), CH('A3 D4 F#4'), CH('B3 E4 G4'), CH('C4 E4 G4'), CH('A3 D4 F#4'), CH('B3 D4 G4')],
    kick: [0, 3, 4],
    snare: [2, 6],
    hat: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  sky: {
    bpm: 104,
    leadWave: 'sine',
    chordStyle: 'arp',
    leadVol: 0.2,
    lead: parse(`A4 . C#5 . E5 . A5 . | G#5 - E5 . C#5 . B4 . | F#4 . A4 . D5 . F#5 . | E5 - - . . . . . |
                 D5 . F#5 . A5 . F#5 . | E5 . C#5 . A4 . C#5 . | B4 . D5 . G#5 . B5 . | A5 - - . . . . .`),
    bass: parse(`A2 - - - E3 - - - | A2 - - - E3 - - - | D3 - - - A2 - - - | A2 - - - E3 - - - |
                 D3 - - - F#3 - - - | A2 - - - C#3 - - - | E2 - - - B2 - - - | A2 - - - E3 - - -`),
    chords: [CH('A3 C#4 E4'), CH('A3 C#4 E4'), CH('D4 F#4 A4'), CH('A3 C#4 E4'), CH('D4 F#4 A4'), CH('A3 C#4 E4'), CH('E4 G#4 B4'), CH('A3 C#4 E4')],
    kick: [0],
    snare: [4],
    hat: [2, 6],
  },
  challenge: {
    bpm: 152,
    leadWave: 'square',
    chordStyle: 'arp',
    leadVol: 0.1,
    lead: parse(`A4 . A4 C5 . A4 E5 . | D5 . C5 . A4 . G4 . | A4 . A4 C5 . A4 G5 . | E5 - - . D5 . C5 . |
                 F5 . F5 E5 . D5 C5 . | E5 . E5 D5 . C5 B4 . | C5 . D5 . E5 . G5 . | A5 - - . E5 . . .`),
    bass: parse(`A2 A3 A2 A3 A2 A3 A2 A3 | F2 F3 F2 F3 F2 F3 F2 F3 | A2 A3 A2 A3 A2 A3 A2 A3 | E2 E3 E2 E3 E2 E3 E2 E3 |
                 D2 D3 D2 D3 D2 D3 D2 D3 | C3 C4 C3 C4 C3 C4 C3 C4 | F2 F3 F2 F3 G2 G3 G2 G3 | A2 A3 A2 A3 E2 E3 E2 E3`),
    chords: [CH('A3 C4 E4'), CH('F3 A3 C4'), CH('A3 C4 E4'), CH('E3 G#3 B3'), CH('D3 F3 A3'), CH('C4 E4 G4'), CH('F3 A3 C4'), CH('E3 G#3 B3')],
    kick: [0, 2, 4, 6],
    snare: [2, 6],
    hat: [1, 3, 5, 7],
  },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bgmVol = 0.6;
  private sfxVol = 0.8;
  private track: Track | null = null;
  private trackName: TrackName | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private lastPlay = new Map<string, number>();

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVol * 0.5;
      this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
      if (this.trackName) this.music(this.trackName, true);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(bgm: number, sfx: number): void {
    this.bgmVol = bgm;
    this.sfxVol = sfx;
    if (this.bgmGain && this.ctx) this.bgmGain.gain.setTargetAtTime(bgm * 0.5, this.ctx.currentTime, 0.05);
    if (this.sfxGain && this.ctx) this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- music

  music(name: TrackName | null, force = false): void {
    if (name === this.trackName && !force) return;
    this.trackName = name;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.track = name ? TRACKS[name] : null;
    if (!this.ctx || !this.track) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.12;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const tr = this.track;
    if (!ctx || !tr || !this.bgmGain) return;
    const stepDur = 60 / tr.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const i = this.step % tr.lead.length;
      const bar = Math.floor(i / 8) % tr.chords.length;
      const inBar = i % 8;
      const swing = tr.swing && inBar % 2 === 1 ? stepDur * tr.swing : 0;
      const t = this.nextTime + swing;
      // Lead.
      const n = tr.lead[i];
      if (n !== '.' && n !== '-') {
        let len = 1;
        while (tr.lead[(i + len) % tr.lead.length] === '-' && len < 8) len++;
        this.tone(this.bgmGain, freq(n), t, stepDur * len * 0.92, tr.leadWave, tr.leadVol, tr.leadWave === 'sine' ? 0.02 : 0.005);
        if (tr.leadWave === 'sine') this.tone(this.bgmGain, freq(n) * 2, t, stepDur * len * 0.5, 'sine', tr.leadVol * 0.25, 0.01);
      }
      // Bass.
      const b = tr.bass[i];
      if (b && b !== '.' && b !== '-') {
        let len = 1;
        while (tr.bass[(i + len) % tr.bass.length] === '-' && len < 8) len++;
        this.tone(this.bgmGain, freq(b), t, stepDur * len * 0.85, 'triangle', 0.28, 0.005);
      }
      // Chords.
      const chord = tr.chords[bar];
      if (tr.chordStyle === 'stab') {
        if (inBar % 2 === 1) for (const c of chord) this.tone(this.bgmGain, freq(c), t, stepDur * 0.45, 'square', 0.028, 0.003);
      } else {
        const c = chord[inBar % chord.length];
        this.tone(this.bgmGain, freq(c) * (inBar >= 4 ? 2 : 1), t, stepDur * 0.9, 'triangle', 0.06, 0.01);
      }
      // Drums.
      if (tr.kick.includes(inBar)) this.kick(t);
      if (tr.snare.includes(inBar)) this.snare(t);
      if (tr.hat.includes(inBar)) this.hat(t, tr.hat.length > 4 ? 0.025 : 0.04);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private tone(dest: AudioNode, f: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.55), t + Math.min(dur, 0.12) + attack);
    g.gain.setValueAtTime(Math.max(0.0001, vol * 0.55), t + Math.max(attack + 0.01, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.06);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.bgmGain!);
    o.start(t);
    o.stop(t + 0.18);
  }

  private snare(t: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f);
    f.connect(g);
    g.connect(this.bgmGain!);
    s.start(t, Math.random());
    s.stop(t + 0.13);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(f);
    f.connect(g);
    g.connect(this.bgmGain!);
    s.start(t, Math.random());
    s.stop(t + 0.05);
  }

  // ---------------------------------------------------------------- sfx

  play(name: SfxName, opts: { vol?: number; rate?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.035) return;
    this.lastPlay.set(name, now);
    const vol = opts.vol ?? 1;
    const r = opts.rate ?? 1;
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.sfxGain);
    const t = now + 0.005;
    const blip = (f: number, at: number, dur: number, type: OscillatorType = 'square', v = 0.25, f2?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * r, at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2 * r, at + dur);
      g.gain.setValueAtTime(v, at);
      g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + dur + 0.02);
    };
    const noise = (at: number, dur: number, type: BiquadFilterType, f0: number, f1: number, v = 0.4, q = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, at);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(v, at + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start(at, Math.random() * 1.5);
      s.stop(at + dur + 0.02);
    };
    const metal = (at: number, base: number, dur: number, v = 0.12) => {
      for (const k of [1, 1.47, 2.09, 2.76, 3.52]) {
        blip(base * k * (0.98 + Math.random() * 0.04), at, dur * (1.2 - k * 0.15), 'sine', v / k);
      }
    };
    switch (name) {
      case 'click':
        blip(880, t, 0.06, 'square', 0.12, 1320);
        break;
      case 'select':
        blip(660, t, 0.07, 'square', 0.12);
        blip(990, t + 0.06, 0.1, 'square', 0.12);
        break;
      case 'back':
        blip(700, t, 0.07, 'square', 0.1);
        blip(470, t + 0.06, 0.1, 'square', 0.1);
        break;
      case 'tick':
        blip(1700, t, 0.025, 'triangle', 0.08);
        break;
      case 'swipe':
      case 'whoosh':
        noise(t, 0.28, 'bandpass', 500, 3200, 0.5, 1.2);
        break;
      case 'throw':
        noise(t, 0.35, 'bandpass', 900, 260, 0.35, 1);
        break;
      case 'miss':
        blip(400, t, 0.18, 'triangle', 0.2, 220);
        break;
      case 'coin':
        blip(988, t, 0.07, 'square', 0.14);
        blip(1319, t + 0.07, 0.32, 'square', 0.14);
        break;
      case 'ring':
        [1047, 1319, 1568, 2093].forEach((f, i) => blip(f, t + i * 0.06, 0.25, 'triangle', 0.22));
        [2637, 3136].forEach((f, i) => blip(f, t + 0.26 + i * 0.05, 0.3, 'sine', 0.1));
        break;
      case 'boost':
        blip(300, t, 0.35, 'sawtooth', 0.12, 1400);
        noise(t, 0.4, 'bandpass', 600, 4000, 0.3, 2);
        break;
      case 'lucky':
        blip(392, t, 0.06, 'square', 0.15, 520);
        blip(988, t + 0.08, 0.06, 'square', 0.12);
        blip(1319, t + 0.14, 0.25, 'square', 0.12);
        break;
      case 'boing': {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(180 * r, t);
        o.frequency.exponentialRampToValueAtTime(620 * r, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(300 * r, t + 0.38);
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 18;
        lg.gain.value = 40;
        lfo.connect(lg);
        lg.connect(o.frequency);
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        o.connect(g);
        g.connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.45);
        lfo.stop(t + 0.45);
        break;
      }
      case 'leaves':
        noise(t, 0.35, 'highpass', 2500, 1800, 0.35);
        noise(t + 0.08, 0.3, 'highpass', 3500, 2500, 0.25);
        break;
      case 'chains':
        for (let i = 0; i < 7; i++) metal(t + i * 0.045 + Math.random() * 0.03, 900 + Math.random() * 700, 0.35, 0.09);
        break;
      case 'clank':
        metal(t, 520, 0.5, 0.2);
        break;
      case 'splash':
        noise(t, 0.9, 'lowpass', 4000, 300, 0.55);
        for (let i = 0; i < 5; i++) blip(500 + Math.random() * 700, t + 0.15 + i * 0.08, 0.06, 'sine', 0.08, 1200);
        break;
      case 'thud':
        blip(130, t, 0.13, 'sine', 0.5, 55);
        noise(t, 0.12, 'lowpass', 900, 200, 0.3);
        break;
      case 'sand':
        noise(t, 0.25, 'lowpass', 1400, 400, 0.4);
        break;
      case 'wood':
        blip(420, t, 0.08, 'triangle', 0.35, 300);
        blip(860, t, 0.04, 'square', 0.08);
        break;
      case 'stone':
        blip(300, t, 0.07, 'triangle', 0.3, 180);
        noise(t, 0.08, 'bandpass', 1800, 900, 0.3, 2);
        break;
      case 'snow':
      case 'cloud':
        noise(t, 0.3, 'lowpass', 1200, 300, 0.35);
        break;
      case 'fanfare':
        [523, 659, 784, 1047].forEach((f, i) => blip(f, t + i * 0.1, 0.18, 'square', 0.12));
        [784, 988, 1175].forEach((f) => blip(f, t + 0.45, 0.6, 'square', 0.08));
        blip(1568, t + 0.45, 0.7, 'triangle', 0.15);
        break;
      case 'holeIn':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => blip(f, t + i * 0.08, 0.22, 'square', 0.12));
        [1047, 1319, 1568, 2093].forEach((f) => blip(f, t + 0.55, 0.9, 'triangle', 0.1));
        for (let i = 0; i < 6; i++) blip(2637 + i * 200, t + 0.6 + i * 0.07, 0.15, 'sine', 0.05);
        break;
      case 'ob':
        blip(392, t, 0.25, 'sawtooth', 0.12, 370);
        blip(330, t + 0.28, 0.5, 'sawtooth', 0.12, 260);
        break;
      case 'star':
        [1568, 2093, 2637].forEach((f, i) => blip(f, t + i * 0.07, 0.25, 'triangle', 0.15));
        break;
      case 'buy':
        blip(988, t, 0.07, 'square', 0.12);
        blip(1319, t + 0.07, 0.15, 'square', 0.12);
        [784, 988, 1175, 1568].forEach((f, i) => blip(f, t + 0.2 + i * 0.05, 0.3, 'triangle', 0.12));
        break;
      case 'error':
        blip(160, t, 0.2, 'square', 0.12, 140);
        break;
    }
  }

  /** Continuous air rush while the disc flies. Pass 0 to fade out. */
  flight(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || ctx.state !== 'running') return;
    if (!this.wind && speed > 0.5) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
      this.wind = { src, filter, gain };
    }
    if (!this.wind) return;
    const t = ctx.currentTime;
    const v = Math.min(1, speed / 28);
    this.wind.gain.gain.setTargetAtTime(v * v * 0.22, t, 0.08);
    this.wind.filter.frequency.setTargetAtTime(300 + v * 1400, t, 0.08);
    if (speed <= 0.5) {
      const w = this.wind;
      this.wind = null;
      w.gain.gain.setTargetAtTime(0, t, 0.1);
      w.src.stop(t + 0.5);
    }
  }
}

export const audio = new AudioEngine();

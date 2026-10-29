// Všetok zvuk je syntetizovaný Web Audio API – žiadne zvukové súbory.
//  • SFX: krátke obálky oscilátorov a šumu
//  • Hudba: jednoduchý 4-kanálový „tracker“ (lead, bas, arpeggio, bicie) s plánovaním dopredu
import { settings } from '../settings.js';
import { SONGS } from './songs.js';
import { freq } from './notes.js';

export { freq };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.song = null;
    this.songName = null;
  }

  /** Vytvorí AudioContext – musí sa zavolať z obsluhy dotyku (iOS pravidlo). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.applySettings();
        this.noise = this.makeNoise();
        this.pulse25 = this.makePulse(0.25);
        this.pulse12 = this.makePulse(0.125);
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
        });
      }
      // „prázdny“ zvuk odomkne výstup na starších iOS
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
      this.ctx.resume();
      this.ready = this.ctx.state === 'running' || this.ready;
      this.ctx.onstatechange = () => {
        if (this.ctx.state === 'running') {
          this.ready = true;
          if (this.pendingSong) { const p = this.pendingSong; this.pendingSong = null; this.playMusic(p); }
        }
      };
    } catch { /* bez zvuku */ }
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(settings.music ? 0.32 : 0, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(settings.sfx ? 0.5 : 0, t, 0.02);
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Pulzná vlna so striedou duty (typický chiptune zvuk). */
  makePulse(duty) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return this.ctx.createPeriodicWave(real, imag);
  }

  // ------------------------------------------------------------------ nástroje
  tone(dest, { type = 'square', wave, f0, f1, t = 0, dur = 0.1, vol = 0.3, attack = 0.002, slide = 'exp' }) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    const start = c.currentTime + t;
    o.frequency.setValueAtTime(f0, start);
    if (f1) {
      if (slide === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
      else o.frequency.linearRampToValueAtTime(f1, start + dur);
    }
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  noiseBurst(dest, { t = 0, dur = 0.2, vol = 0.4, filter = 'lowpass', fq = 1200, fq1 }) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filter;
    const start = c.currentTime + t;
    f.frequency.setValueAtTime(fq, start);
    if (fq1) f.frequency.exponentialRampToValueAtTime(fq1, start + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(start, Math.random() * 0.5);
    s.stop(start + dur + 0.02);
  }

  // ------------------------------------------------------------------ SFX
  sfx(name) {
    if (!this.ctx || !this.ready || !settings.sfx) return;
    const d = this.sfxGain;
    const now = this.ctx.currentTime;
    // obmedzenie – rovnaký zvuk max raz za 40 ms (rýchla streľba by inak praskala)
    this.last ||= {};
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    switch (name) {
      case 'shot': this.tone(d, { wave: this.pulse25, f0: 900, f1: 180, dur: 0.07, vol: 0.18 }); break;
      case 'rapid': this.tone(d, { wave: this.pulse12, f0: 1200, f1: 300, dur: 0.05, vol: 0.13 }); break;
      case 'spread':
        this.tone(d, { type: 'square', f0: 500, f1: 90, dur: 0.12, vol: 0.16 });
        this.noiseBurst(d, { dur: 0.1, vol: 0.18, fq: 3000, fq1: 400 });
        break;
      case 'laser': this.tone(d, { type: 'sawtooth', f0: 1800, f1: 300, dur: 0.18, vol: 0.14 }); break;
      case 'flame': this.noiseBurst(d, { dur: 0.09, vol: 0.12, filter: 'bandpass', fq: 600, fq1: 300 }); break;
      case 'enemyShot': this.tone(d, { type: 'triangle', f0: 600, f1: 250, dur: 0.1, vol: 0.2 }); break;
      case 'jump': this.tone(d, { wave: this.pulse25, f0: 220, f1: 520, dur: 0.12, vol: 0.12, slide: 'lin' }); break;
      case 'hit': this.noiseBurst(d, { dur: 0.05, vol: 0.2, filter: 'highpass', fq: 2000 }); break;
      case 'ricochet': this.tone(d, { type: 'square', f0: 2400, f1: 1800, dur: 0.05, vol: 0.08 }); break;
      case 'explosion':
        this.noiseBurst(d, { dur: 0.5, vol: 0.5, fq: 1800, fq1: 120 });
        this.tone(d, { type: 'sine', f0: 140, f1: 35, dur: 0.4, vol: 0.5 });
        break;
      case 'bigExplosion':
        this.noiseBurst(d, { dur: 1.2, vol: 0.6, fq: 2400, fq1: 60 });
        this.tone(d, { type: 'sine', f0: 100, f1: 25, dur: 1.0, vol: 0.6 });
        break;
      case 'death':
        this.tone(d, { type: 'square', f0: 660, f1: 70, dur: 0.7, vol: 0.2 });
        this.tone(d, { type: 'square', f0: 670, f1: 72, dur: 0.7, vol: 0.12, t: 0.01 });
        break;
      case 'powerup': // arpeggio nahor
        ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) =>
          this.tone(d, { wave: this.pulse25, f0: freq(n), t: i * 0.05, dur: 0.09, vol: 0.18 }));
        break;
      case 'select': this.tone(d, { wave: this.pulse25, f0: 880, dur: 0.06, vol: 0.15 }); break;
      case 'confirm':
        this.tone(d, { wave: this.pulse25, f0: 660, dur: 0.06, vol: 0.15 });
        this.tone(d, { wave: this.pulse25, f0: 990, t: 0.06, dur: 0.1, vol: 0.15 });
        break;
      case 'checkpoint':
        ['G5', 'C6'].forEach((n, i) => this.tone(d, { type: 'triangle', f0: freq(n), t: i * 0.08, dur: 0.15, vol: 0.3 }));
        break;
      case 'stomp': this.tone(d, { type: 'sine', f0: 90, f1: 30, dur: 0.35, vol: 0.6 }); this.noiseBurst(d, { dur: 0.25, vol: 0.3, fq: 400 }); break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.tone(d, { type: 'square', f0: 520, f1: 780, t: i * 0.3, dur: 0.25, vol: 0.12, slide: 'lin' });
        break;
      case 'fanfare': { // víťazná fanfára
        const seq = [['C5', 0, 0.12], ['C5', 0.13, 0.12], ['C5', 0.26, 0.12], ['C5', 0.4, 0.3], ['Ab4', 0.72, 0.3], ['Bb4', 1.04, 0.3], ['C5', 1.36, 0.16], ['Bb4', 1.54, 0.12], ['C5', 1.68, 0.8]];
        for (const [n, t, dur] of seq) {
          this.tone(d, { wave: this.pulse25, f0: freq(n), t, dur, vol: 0.2, attack: 0.01 });
          this.tone(d, { type: 'triangle', f0: freq(n) / 2, t, dur, vol: 0.25, attack: 0.01 });
        }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ HUDBA
  /** Spustí skladbu podľa mena (menu, jungle, cave, base, reactor, boss). */
  playMusic(name) {
    if (this.songName === name && this.song) return;
    this.stopMusic();
    this.songName = name;
    if (!this.ctx || !this.ready) { this.pendingSong = name; return; }
    const song = SONGS[name];
    if (!song) return;
    this.song = { def: song, step: 0, next: this.ctx.currentTime + 0.08, stepDur: 60 / song.bpm / 4 };
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.song = null;
    this.songName = null;
    this.pendingSong = null;
  }

  /** Plánuje noty ~120 ms dopredu – presný rytmus aj pri záťaži hlavného vlákna. */
  schedule() {
    const s = this.song;
    if (!s) return;
    const c = this.ctx;
    while (s.next < c.currentTime + 0.12) {
      this.playStep(s.def, s.step, s.next - c.currentTime, s.stepDur);
      s.step = (s.step + 1) % s.def.length;
      s.next += s.stepDur;
    }
  }

  playStep(def, step, t, sd) {
    const g = this.musicGain;
    const lead = def.lead[step];
    if (lead) this.tone(g, { wave: this.pulse25, f0: lead.f, t, dur: lead.len * sd * 0.95, vol: 0.16, attack: 0.005 });
    const bass = def.bass[step];
    if (bass) this.tone(g, { type: 'triangle', f0: bass.f, t, dur: bass.len * sd * 0.9, vol: 0.42, attack: 0.003 });
    const arp = def.arp[step];
    if (arp) this.tone(g, { wave: this.pulse12, f0: arp.f, t, dur: sd * 0.8, vol: 0.06 });
    const dr = def.drums[step];
    if (dr === 'k') this.tone(g, { type: 'sine', f0: 150, f1: 40, t, dur: 0.14, vol: 0.6 });
    else if (dr === 's') this.noiseBurst(g, { t, dur: 0.11, vol: 0.28, filter: 'highpass', fq: 1200 });
    else if (dr === 'h') this.noiseBurst(g, { t, dur: 0.03, vol: 0.1, filter: 'highpass', fq: 7000 });
    else if (dr === 'x') { // kick + hat
      this.tone(g, { type: 'sine', f0: 150, f1: 40, t, dur: 0.14, vol: 0.6 });
      this.noiseBurst(g, { t, dur: 0.03, vol: 0.08, filter: 'highpass', fq: 7000 });
    }
  }
}

export const audio = new AudioEngine();

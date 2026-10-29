// Efekty: výbuchy, častice, otrasy obrazovky, zvuky, správy.
// Na hostiteľovi sa každý efekt zároveň zapíše do `events`, ktoré idú v snapshote klientom
// (tí ich prehrajú lokálne). Výbuchové sprity sa synchronizujú ako bežné sprity.
import { audio } from '../audio/Audio.js';
import { vibrate } from '../input/Controls.js';
import { netify } from './net-util.js';

const BURSTS = {
  fire: [0xff9a2a, 0xffd36a, 0xd0601a, 0xffffff],
  debris: [0x4a505e, 0x7a8294, 0x2a2e38],
  spark: [0x2ae0d0, 0xe8f4ff, 0x8ec5ff],
  purple: [0xb04aff, 0xff6aff, 0xffffff],
  water: [0x8ec5ff, 0xe8f4ff],
};

export class Fx {
  constructor(scene, record) {
    this.scene = scene;
    this.record = record;   // true = hostiteľ, zaznamenávaj udalosti pre klientov
    this.events = [];
    this.emitters = {};
    for (const [k, tint] of Object.entries(BURSTS)) {
      this.emitters[k] = scene.add.particles(0, 0, 'pixel', {
        emitting: false, speed: { min: 40, max: 170 }, lifespan: { min: 250, max: 650 },
        gravityY: 320, scale: { start: 0.9, end: 0 }, tint,
      }).setDepth(52);
    }
  }

  push(ev) { if (this.record) this.events.push(ev); }
  drain() { const e = this.events; this.events = []; return e; }

  sound(name) { audio.sfx(name); this.push(['s', name]); }

  shake(ms = 150, intensity = 0.006) {
    this.scene.cameras.main.shake(ms, intensity);
    this.push(['k', ms, intensity]);
  }

  burst(type, x, y, n = 12) {
    this.emitters[type]?.explode(n, x, y);
    this.push(['p', type, Math.round(x), Math.round(y), n]);
  }

  message(text, ms = 2000) {
    this.scene.showMessage?.(text, ms);
    this.push(['m', text, ms]);
  }

  /** Vibrácia len pre konkrétneho hráča (slot). */
  vibrate(slot, ms = 60) {
    if (slot === this.scene.localSlot) vibrate(ms);
    this.push(['v', slot, ms]);
  }

  /** Výbuch: animovaný sprite + častice + zvuk (+ otras pri veľkom). */
  explosion(x, y, big = false, type = 'fire') {
    const s = this.scene;
    const e = netify(s, s.add.sprite(x, y, 'explosion', 0), 'explosion');
    e.play('explode');
    e.once('animationcomplete', () => e.destroy());
    this.burst(type, x, y, big ? 30 : 10);
    if (big) this.burst('debris', x, y, 14);
    this.sound(big ? 'bigExplosion' : 'explosion');
    if (big) this.shake(260, 0.01);
  }

  spark(x, y) {
    const s = this.scene;
    const e = netify(s, s.add.sprite(x, y, 'spark', 0), 'spark');
    e.play('sparkle');
    e.once('animationcomplete', () => e.destroy());
  }

  /** Prehratie udalosti zo snapshotu (na klientovi). */
  replay(ev, localSlot) {
    switch (ev[0]) {
      case 's': audio.sfx(ev[1]); break;
      case 'k': this.scene.cameras.main.shake(ev[1], ev[2]); break;
      case 'p': this.emitters[ev[1]]?.explode(ev[4], ev[2], ev[3]); break;
      case 'm': this.scene.showMessage?.(ev[1], ev[2]); break;
      case 'v': if (ev[1] === localSlot) vibrate(ev[2]); break;
      default: break;
    }
  }
}

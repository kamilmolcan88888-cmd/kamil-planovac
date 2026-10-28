// Klient v multiplayeri nič nesimuluje – iba vykresľuje snapshoty od hostiteľa.
// Snapshot = zoznam spritov [id, textúra, snímka, x, y, flagy, uhol] + kamera + HUD + udalosti.
// Vykresľujeme s oneskorením INTERP_MS a interpolujeme medzi dvoma snapshotmi → plynulý
// pohyb aj pri 20 snapshotoch za sekundu a kolísaní siete.
import Phaser from 'phaser';
import { NET_TEX, INTERP_MS } from '../config.js';

export class NetView {
  constructor(scene) {
    this.scene = scene;
    this.sprites = new Map();
    this.buf = [];
    this.offset = null;     // odhad: lokálny čas − čas hostiteľa
    this.lastRecv = performance.now();
  }

  push(snap) {
    const now = performance.now();
    this.lastRecv = now;
    const d = now - snap.ts;
    // minimálne oneskorenie = najlepší odhad posunu hodín; pomaly sa prispôsobuje nahor
    if (this.offset === null || d < this.offset) this.offset = d;
    else this.offset += (d - this.offset) * 0.002;
    // nespoľahlivý kanál môže doručiť mimo poradia – staré zahodíme
    if (this.buf.length && snap.ts <= this.buf[this.buf.length - 1].ts) return;
    this.buf.push(snap);
    if (this.buf.length > 30) this.buf.shift();
  }

  get stale() { return performance.now() - this.lastRecv > 1500; }

  update() {
    if (!this.buf.length) return;
    const rt = performance.now() - this.offset - INTERP_MS;
    // nájdi snapshoty a, b také, že a.ts <= rt < b.ts
    let a = this.buf[0];
    let b = null;
    for (let i = 0; i < this.buf.length; i++) {
      if (this.buf[i].ts <= rt) a = this.buf[i];
      else { b = this.buf[i]; break; }
    }
    if (!b) b = a;
    // staré snapshoty už netreba
    while (this.buf.length > 2 && this.buf[1].ts <= rt) this.buf.shift();
    const k = b === a ? 1 : Phaser.Math.Clamp((rt - a.ts) / (b.ts - a.ts), 0, 1);

    const prev = new Map();
    for (const e of a.e) prev.set(e[0], e);
    const seen = new Set();
    for (const e of b.e) {
      const [id, tex, frame, x, y, flags, ang] = e;
      seen.add(id);
      let s = this.sprites.get(id);
      const key = NET_TEX[tex][0];
      if (!s || s.texture.key !== key) {
        s?.destroy();
        s = this.scene.add.sprite(x, y, key);
        s.setOrigin(NET_TEX[tex][1], NET_TEX[tex][2]).setDepth(NET_TEX[tex][3]);
        this.sprites.set(id, s);
      }
      const p = prev.get(id);
      if (p && p[1] === tex) {
        s.x = p[3] + (x - p[3]) * k;
        s.y = p[4] + (y - p[4]) * k;
        s.angle = p[6] + Phaser.Math.Angle.ShortestBetween(p[6], ang) * k;
      } else {
        s.setPosition(x, y);
        s.angle = ang;
      }
      if (s.texture.frameTotal > 1) s.setFrame(frame);
      s.setFlip(!!(flags & 1), !!(flags & 2));
      s.setAlpha(flags & 4 ? 0.35 : 1);
      s.setVisible(!(flags & 16));
      if (flags & 8) s.setTintFill(0xffffff); else if (s.isTinted) s.clearTint();
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) { s.destroy(); this.sprites.delete(id); }
    }
    // kamera
    const cam = this.scene.cameras.main;
    cam.scrollX = Math.round(a.cam[0] + (b.cam[0] - a.cam[0]) * k);
    cam.scrollY = Math.round(a.cam[1] + (b.cam[1] - a.cam[1]) * k);
  }

  destroy() {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}

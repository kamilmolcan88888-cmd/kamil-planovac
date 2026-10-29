// HUD nad hrou: hráči (životy, zbraň, skóre), HI-SCORE, pás zdravia bossa, správy, stav siete.
// Číta iba objekt `hud` z Game scény – funguje rovnako u hostiteľa aj klienta.
import Phaser from 'phaser';
import { W, H, HEROES, WEAPONS } from '../config.js';
import { text } from '../ui/ui.js';

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    this.panels = [0, 1, 2, 3].map((i) => {
      const x = 4 + i * 100;
      return {
        name: text(this, x, 3, ''),
        score: text(this, x, 13, ''),
        lives: [0, 1, 2, 3, 4].map((k) => this.add.image(x + k * 9 + 4, 27, 'ui', 0).setVisible(false)),
        weapon: text(this, x + 50, 23, ''),
      };
    });
    this.hi = text(this, W - 4, 3, '', { ox: 1, color: 0xffd36a });
    this.bossName = text(this, W / 2, 36, '', { ox: 0.5, color: 0xff6aff });
    this.bossBg = this.add.rectangle(W / 2, 48, 162, 6, 0x0b0e1a).setStrokeStyle(1, 0xb04aff);
    this.bossBar = this.add.rectangle(W / 2 - 80, 48, 160, 4, 0xe02a3a).setOrigin(0, 0.5);
    this.msg = text(this, W / 2, H / 2 - 30, '', { scale: 2, ox: 0.5, oy: 0.5, color: 0xffd36a });
    this.net = text(this, 4, H - 12, '', { color: 0x7a8294 });
  }

  update(time) {
    const game = this.scene.get('Game');
    const h = game?.hud;
    if (!h) return;
    this.panels.forEach((pn, i) => {
      const p = h.players[i];
      const vis = !!p;
      pn.name.setVisible(vis); pn.score.setVisible(vis); pn.weapon.setVisible(vis);
      pn.lives.forEach((l, k) => l.setVisible(vis && k < Math.min(5, p.lives)));
      if (!vis) return;
      const hero = HEROES[p.hero];
      pn.name.setText(`${p.me ? '>' : ''}P${p.slot + 1} ${hero.name}`).setTint(hero.color);
      pn.score.setText(String(p.score).padStart(7, '0'));
      const w = WEAPONS[p.weapon];
      pn.weapon.setText(p.lives > 0 ? `[${w.letter}]` : 'KO').setTint(p.lives > 0 ? 0xffd36a : 0xe02a3a);
    });
    this.hi.setText(`HI ${String(h.hi).padStart(7, '0')}`);
    const bv = h.boss >= 0;
    this.bossBg.setVisible(bv);
    this.bossBar.setVisible(bv);
    this.bossName.setVisible(bv).setText(h.bossName || '');
    if (bv) this.bossBar.width = 160 * Math.max(0, h.boss);
    const show = h.msg && game.time.now < h.msgUntil;
    this.msg.setVisible(!!show);
    if (show) { this.msg.setText(h.msg); this.msg.setAlpha(Math.floor(time / 250) % 4 === 0 ? 0.6 : 1); }
    this.net.setText(h.net || '');
  }
}

// UI pomocníci: pixelový text (vlastný bitmapový font s diakritikou) a jednoduché menu,
// ktoré sa ovláda dotykom, klávesnicou aj gamepadom.
import Phaser from 'phaser';
import { controls } from '../input/Controls.js';
import { audio } from '../audio/Audio.js';
import { W } from '../config.js';

// font má iba veľké písmená – typografické znaky nahradíme podporovanými
export const up = (s) => String(s).toLocaleUpperCase('sk-SK').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[„“”]/g, '"');

/** Pixelový text. scale = celé číslo (ostré pixely). */
export function text(scene, x, y, str, { scale = 1, color = 0xe8f4ff, ox = 0, oy = 0, depth = 100 } = {}) {
  return scene.add.bitmapText(x, y, 'font', up(str), 6).setScale(scale).setTint(color).setOrigin(ox, oy).setDepth(depth);
}

/**
 * Vertikálne menu.
 * items: [{ label: string | () => string, action?: () => void, change?: (dir) => void, disabled?: () => bool }]
 */
export class Menu {
  constructor(scene, x, y, items, { gap = 14, align = 0.5, color = 0xe8f4ff, active = 0xffd36a, depth = 100 } = {}) {
    this.scene = scene;
    this.items = items;
    this.index = 0;
    this.color = color;
    this.activeColor = active;
    this.enabled = true;
    this.texts = items.map((it, i) => {
      const t = text(scene, x, y + i * gap, '', { ox: align, depth });
      t.setInteractive(new Phaser.Geom.Rectangle(-20, -3, 0, gap), Phaser.Geom.Rectangle.Contains);
      t.on('pointerdown', () => {
        if (!this.enabled) return;
        if (this.index !== i) { this.index = i; this.refresh(); audio.sfx('select'); }
        this.tapped = i;
      });
      t.on('pointerup', (p) => {
        if (!this.enabled || this.tapped !== i) return;
        this.tapped = -1;
        const it2 = this.items[i];
        // ťuk na ľavú/pravú tretinu položky s voľbou = zmena hodnoty
        if (it2.change) {
          const local = p.x - (t.x - t.displayWidth * align);
          it2.change(local < t.displayWidth / 3 ? -1 : 1);
          audio.sfx('select');
          this.refresh();
        } else this.activate();
      });
      return t;
    });
    this.cursor = text(scene, 0, 0, '>', { color: active, depth });
    this.refresh();
  }

  label(it) { return typeof it.label === 'function' ? it.label() : it.label; }

  refresh() {
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      t.setText(up(this.label(it)));
      const dis = it.disabled?.();
      t.setTint(dis ? 0x4a505e : i === this.index ? this.activeColor : this.color);
      // zóna dotyku cez celý riadok
      const hw = Math.max(t.width + 40, 160);
      t.input.hitArea.setTo(-(hw - t.width) / 2, -3, hw, 16);
    });
    const cur = this.texts[this.index];
    if (cur) {
      this.cursor.setPosition(cur.x - cur.displayWidth * cur.originX - 10, cur.y);
      this.cursor.setVisible(this.enabled);
    }
  }

  activate() {
    const it = this.items[this.index];
    if (it.disabled?.()) { audio.sfx('ricochet'); return; }
    audio.sfx('confirm');
    if (it.action) it.action();
    else if (it.change) it.change(1);
    if (this.scene.sys.isActive()) this.refresh();
  }

  /** Volať v update() scény. */
  update() {
    if (!this.enabled) return;
    const c = controls;
    if (c.pressed('down')) { this.index = (this.index + 1) % this.items.length; audio.sfx('select'); this.refresh(); }
    if (c.pressed('up')) { this.index = (this.index - 1 + this.items.length) % this.items.length; audio.sfx('select'); this.refresh(); }
    const it = this.items[this.index];
    if (it.change && (c.pressed('left') || c.pressed('right'))) {
      it.change(c.pressed('left') ? -1 : 1);
      audio.sfx('select');
      this.refresh();
    }
    if (c.pressed('jump') || c.pressed('pause') || c.pressed('fire')) this.activate();
  }

  destroy() { this.texts.forEach((t) => t.destroy()); this.cursor.destroy(); }
}

/** Polopriehľadné pozadie cez celú obrazovku (pre overlay scény). */
export function dim(scene, alpha = 0.7) {
  return scene.add.rectangle(0, 0, W, 300, 0x0b0e1a, alpha).setOrigin(0).setScrollFactor(0).setDepth(90);
}

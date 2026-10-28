// Prekryvné scény: Pauza, Game Over (continue), Víťazstvo, Nastavenia.
import Phaser from 'phaser';
import { W, H } from '../config.js';
import { text, Menu, dim } from '../ui/ui.js';
import { settings, saveSettings } from '../settings.js';
import { audio } from '../audio/Audio.js';
import { touch } from '../input/Touch.js';
import { controls } from '../input/Controls.js';
import { toast } from '../platform/ios.js';
import { signalUrl } from '../net/Net.js';

const onOff = (v) => (v ? 'ZAP' : 'VYP');

/** Položky nastavení – zdieľané medzi Pauzou a Nastaveniami. */
function settingsItems(scene) {
  return [
    { label: () => `HUDBA: ${onOff(settings.music)}`, change: () => { settings.music = !settings.music; saveSettings(); audio.applySettings(); } },
    { label: () => `ZVUKY: ${onOff(settings.sfx)}`, change: () => { settings.sfx = !settings.sfx; saveSettings(); audio.applySettings(); } },
    { label: () => `VIBRÁCIE: ${onOff(settings.vibrate)}`, change: () => { settings.vibrate = !settings.vibrate; saveSettings(); } },
    { label: () => `AUTOMATICKÁ STREĽBA: ${onOff(settings.autoFire)}`, change: () => { settings.autoFire = !settings.autoFire; saveSettings(); } },
    {
      label: () => `ZOBRAZENIE: ${settings.pixelPerfect ? 'OSTRÉ PIXELY' : 'CELÁ OBRAZOVKA'}`,
      change: () => { settings.pixelPerfect = !settings.pixelPerfect; saveSettings(); window.dispatchEvent(new Event('resize')); },
    },
    {
      label: () => `VEĽKOSŤ OVLÁDANIA: < ${Math.round(settings.touch.scale * 100)}% >`,
      change: (d) => touch.setScale(settings.touch.scale + d * 0.1),
    },
    {
      label: () => `PRIEHĽADNOSŤ OVLÁDANIA: < ${Math.round(settings.touch.opacity * 100)}% >`,
      change: (d) => { settings.touch.opacity = Phaser.Math.Clamp(Math.round((settings.touch.opacity + d * 0.1) * 10) / 10, 0.2, 1); saveSettings(); touch.applyLayout(); },
    },
    {
      label: 'UPRAVIŤ ROZLOŽENIE OVLÁDANIA',
      action: () => {
        scene.menu.enabled = false;
        scene.scene.setVisible(false);
        touch.onEditDone = () => { scene.scene.setVisible(true); scene.menu.enabled = true; scene.menu.refresh(); };
        touch.startEdit();
      },
    },
  ];
}

// ---------------------------------------------------------------- PAUZA
export class PauseScene extends Phaser.Scene {
  constructor() { super('Pause'); }

  create(data) {
    this.solo = data.solo;
    dim(this, 0.75);
    text(this, W / 2, 20, 'PAUZA', { scale: 3, ox: 0.5, color: 0xff9a2a });
    if (!this.solo) text(this, W / 2, 50, 'CO-OP: HRA POKRAČUJE ĎALEJ!', { ox: 0.5, color: 0xe02a3a });
    this.menu = new Menu(this, W / 2, 70, [
      { label: 'POKRAČOVAŤ', action: () => this.close() },
      ...settingsItems(this),
      { label: 'UKONČIŤ HRU', action: () => { this.scene.stop(); this.scene.get('Game').quitToMenu(); } },
    ], { gap: 15, depth: 101 });
    this.opened = this.time.now;
  }

  close() {
    this.scene.stop();
    this.scene.get('Game').resumeFromPause(this.solo);
  }

  update(time) {
    if (time - this.opened < 200) return;
    this.menu.update();
  }
}

// ---------------------------------------------------------------- GAME OVER
export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data) {
    dim(this, 0.6);
    text(this, W / 2, 60, 'GAME OVER', { scale: 4, ox: 0.5, color: 0xe02a3a });
    touch.setVisible(false);
    const game = this.scene.get('Game');
    if (!data.host) {
      text(this, W / 2, 130, 'ČAKÁ SA NA ROZHODNUTIE HOSTITEĽA…', { ox: 0.5, color: 0x8ec5ff });
      this.menu = new Menu(this, W / 2, 170, [{ label: 'ODÍSŤ DO MENU', action: () => game.quitToMenu() }], { depth: 101 });
      return;
    }
    this.left = 10;
    this.countText = text(this, W / 2, 110, '', { ox: 0.5, color: 0xffd36a, scale: 2 });
    const items = [];
    if (data.continues > 0) items.push({ label: `POKRAČOVAŤ (ZOSTÁVA ${data.continues})`, action: () => { this.scene.stop(); game.continueGame(); } });
    items.push({ label: 'KONIEC', action: () => { this.scene.stop(); game.quitToMenu(); } });
    this.menu = new Menu(this, W / 2, 150, items, { gap: 18, depth: 101 });
    this.canContinue = data.continues > 0;
    if (this.canContinue) {
      this.time.addEvent({
        delay: 1000, repeat: 10,
        callback: () => {
          this.left--;
          this.countText.setText(String(Math.max(0, this.left)));
          if (this.left < 0) { this.scene.stop(); game.quitToMenu(); }
        },
      });
      this.countText.setText(String(this.left));
    }
    this.opened = this.time.now;
  }

  update(time) {
    if (time - (this.opened || 0) < 600) return;
    this.menu?.update();
  }
}

// ---------------------------------------------------------------- VÍŤAZSTVO
export class VictoryScene extends Phaser.Scene {
  constructor() { super('Victory'); }

  create(data) {
    this.cameras.main.setBackgroundColor('#0b0e1a');
    this.add.tileSprite(0, 0, W, H, 'bg1_sky').setOrigin(0);
    this.add.tileSprite(0, 30, W, 180, 'bg1_far').setOrigin(0);
    this.add.rectangle(0, 0, W, H, 0x0b0e1a, 0.45).setOrigin(0);
    text(this, W / 2, 24, 'VÍŤAZSTVO!', { scale: 3, ox: 0.5, color: 0xffd36a });
    const lines = [
      'REAKTOR UTÍCHOL. STROJ POD TATRAMI',
      'ZNOVA ZASPAL – TENTO RAZ NAVŽDY.',
      'HELIOS STRATIL SVOJU ZBRAŇ',
      'A KARPATY SÚ OPÄŤ SLOBODNÉ.',
      '',
      'RYS A ORLICA SA VRACAJÚ DOMOV.',
    ];
    lines.forEach((l, i) => text(this, W / 2, 70 + i * 14, l, { ox: 0.5 }));
    text(this, W / 2, 170, `SKÓRE ${String(data.score || 0).padStart(7, '0')}`, { scale: 2, ox: 0.5, color: 0xff9a2a });
    if (data.record) text(this, W / 2, 196, 'NOVÝ REKORD!', { ox: 0.5, color: 0xff6aff });
    const t = text(this, W / 2, 240, 'ŤUKNI PRE NÁVRAT DO MENU', { ox: 0.5, color: 0x8ec5ff });
    this.tweens.add({ targets: t, alpha: 0.2, yoyo: true, repeat: -1, duration: 600 });
    audio.stopMusic();
    audio.sfx('fanfare');
    this.time.delayedCall(3000, () => audio.playMusic('menu'));
    this.time.delayedCall(1200, () => { this.ready = true; this.input.once('pointerdown', () => this.scene.start('Menu')); });
  }

  update() {
    if (this.ready && (controls.pressed('jump') || controls.pressed('fire') || controls.pressed('pause'))) this.scene.start('Menu');
  }
}

// ---------------------------------------------------------------- NASTAVENIA (z menu)
export class SettingsScene extends Phaser.Scene {
  constructor() { super('Settings'); }

  create() {
    this.cameras.main.setBackgroundColor('#141a33');
    text(this, W / 2, 10, 'NASTAVENIA', { scale: 2, ox: 0.5, color: 0xff9a2a });
    this.menu = new Menu(this, W / 2, 40, [
      ...settingsItems(this),
      {
        label: () => `SERVER: ${settings.signalUrl ? 'VLASTNÝ' : 'PREDVOLENÝ'}`,
        action: () => {
          const v = window.prompt('Adresa signalizačného servera (wss://…/ws). Prázdne = rovnaký server ako hra.', settings.signalUrl || '');
          if (v !== null) { settings.signalUrl = v.trim(); saveSettings(); toast(`Server: ${signalUrl()}`, 4000); }
        },
      },
      { label: 'VYMAZAŤ HI-SCORE', action: () => { settings.highScore = 0; saveSettings(); toast('High score vymazané'); } },
      { label: 'SPÄŤ', action: () => this.scene.start('Menu') },
    ], { gap: 15 });
    text(this, W / 2, 256, 'TIP: VĽAVO/VPRAVO MENÍ HODNOTU', { ox: 0.5, color: 0x7a8294 });
  }

  update() { this.menu.update(); }
}

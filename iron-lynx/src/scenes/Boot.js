// Načítanie grafiky, vytvorenie fontu a animácií, úvodná obrazovka „ťukni pre štart“
// (prvý dotyk zároveň odomkne zvuk – pravidlo iOS).
import Phaser from 'phaser';
import { W, H } from '../config.js';
import { text } from '../ui/ui.js';
import { audio } from '../audio/Audio.js';
import { controls } from '../input/Controls.js';

const SHEETS = {
  player_rys: [32, 32], player_orlica: [32, 32], player_sokol: [32, 32], player_vlk: [32, 32],
  infantry: [32, 32], sniper: [32, 32], drone: [24, 16], turret: [32, 32], bullets: [8, 8], flame: [16, 16],
  boulder: [16, 16], powerups: [16, 16], explosion: [32, 32], spark: [8, 8], checkpoint: [16, 32],
  golem: [64, 64], spider: [96, 48], gate: [64, 128], reactor: [64, 64], arm: [32, 32], water: [16, 16], ui: [8, 8],
};
const IMAGES = [
  'turret_barrel', 'laser', 'armseg', 'pixel', 'water_body', 'waterfall', 'fog', 'emblem', 'font',
  'tiles1', 'tiles2', 'tiles3', 'tiles4',
  'bg1_sky', 'bg1_far', 'bg1_mid', 'bg1_near', 'bg2_far', 'bg2_near', 'bg3_sky', 'bg3_far', 'bg3_near', 'bg4_sky', 'bg4_far', 'bg4_near',
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const bar = this.add.rectangle(W / 2 - 80, H / 2, 0, 4, 0xb04aff).setOrigin(0, 0.5);
    const frame = this.add.rectangle(W / 2, H / 2, 164, 8).setStrokeStyle(1, 0x4f8ce0);
    this.load.on('progress', (v) => { bar.width = 160 * v; });
    this.load.once('complete', () => { bar.destroy(); frame.destroy(); });
    this.load.setPath('assets/');
    for (const [k, [fw, fh]] of Object.entries(SHEETS)) this.load.spritesheet(k, `${k}.png`, { frameWidth: fw, frameHeight: fh });
    for (const k of IMAGES) this.load.image(k, `${k}.png`);
    this.load.json('fontdef', 'font.json');
  }

  create() {
    // bitmapový font z vygenerovaného PNG (6×10, s diakritikou)
    const fd = this.cache.json.get('fontdef');
    const cfg = {
      image: 'font', width: fd.w, height: fd.h, chars: fd.chars, charsPerRow: fd.perRow,
      spacing: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, lineSpacing: 2,
    };
    this.cache.bitmapFont.add('font', Phaser.GameObjects.RetroFont.Parse(this, cfg));

    this.anims.create({ key: 'explode', frames: this.anims.generateFrameNumbers('explosion', { start: 0, end: 6 }), frameRate: 18 });
    this.anims.create({ key: 'sparkle', frames: this.anims.generateFrameNumbers('spark', { start: 0, end: 2 }), frameRate: 24 });

    // rýchly štart z URL pri vývoji/testovaní: ?level=2 (alebo ?menu)
    const q = new URLSearchParams(location.search);
    if (q.has('level') || q.has('menu')) { this.scene.start('Menu', { quick: q.get('level') }); return; }

    this.add.image(W / 2, 92, 'emblem').setScale(2);
    text(this, W / 2, 168, 'IRON LYNX', { scale: 3, ox: 0.5, color: 0xff9a2a });
    text(this, W / 2, 200, 'KARPATSKÝ ÚDER', { scale: 1, ox: 0.5, color: 0x8ec5ff });
    const tap = text(this, W / 2, 236, 'ŤUKNI ALEBO STLAČ KLÁVES', { ox: 0.5, color: 0xffd36a });
    this.tweens.add({ targets: tap, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
    const go = () => {
      if (this.started) return;
      this.started = true;
      audio.unlock();
      audio.sfx('confirm');
      this.scene.start('Menu');
    };
    this.input.once('pointerdown', go);
    this.go = go;
  }

  update() {
    if (this.go && (controls.pressed('jump') || controls.pressed('fire') || controls.pressed('pause'))) this.go();
  }
}

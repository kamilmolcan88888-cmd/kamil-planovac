// Hlavné menu: 1 hráč, co-op (vytvoriť / pripojiť sa), postava, obtiažnosť, nastavenia, príbeh.
import Phaser from 'phaser';
import { W, H, HEROES, DIFFICULTY, DIFF_KEYS } from '../config.js';
import { text, Menu } from '../ui/ui.js';
import { settings, saveSettings } from '../settings.js';
import { audio } from '../audio/Audio.js';
import { newSession, newPlayer } from '../game/session.js';
import { toast } from '../platform/ios.js';
import { controls } from '../input/Controls.js';

const STORY = [
  'ROK 2087.',
  'KORPORÁCIA HELIOS POD TATRAMI',
  'PREBUDILA PRASTARÝ STROJ.',
  'JEHO REAKTOR SA ŽIVÍ HOROU',
  'A JEHO ARMÁDA OVLÁDLA ÚDOLIA.',
  '',
  'DVAJA VOJACI ODBOJA – RYS A ORLICA –',
  'SA VYDÁVAJÚ CEZ DŽUNGĽU,',
  'KRYŠTÁLOVÉ JASKYNE A PODZEMNÚ',
  'ZÁKLADŇU AŽ K SRDCU STROJA.',
  '',
  'ZASTAVTE REAKTOR. ZACHRÁŇTE KARPATY.',
];

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(data = {}) {
    this.cameras.main.setBackgroundColor('#0b0e1a');
    // pomaly sa posúvajúce pozadie džungle
    this.bg = [
      this.add.tileSprite(0, 0, W, H, 'bg1_sky').setOrigin(0),
      this.add.tileSprite(0, 30, W, 180, 'bg1_far').setOrigin(0),
      this.add.tileSprite(0, 120, W, 140, 'bg1_mid').setOrigin(0),
      this.add.tileSprite(0, 170, W, 120, 'bg1_near').setOrigin(0),
      this.add.tileSprite(0, 200, W, 60, 'fog').setOrigin(0).setAlpha(0.8),
    ];
    this.add.rectangle(0, 0, W, H, 0x0b0e1a, 0.35).setOrigin(0);
    this.add.image(64, 56, 'emblem');
    text(this, 106, 30, 'IRON LYNX', { scale: 3, color: 0xff9a2a });
    text(this, 108, 64, 'KARPATSKÝ ÚDER', { scale: 1, color: 0x8ec5ff });

    this.menu = new Menu(this, W / 2, 100, [
      { label: 'HRAŤ – 1 HRÁČ', action: () => this.startSingle(0) },
      { label: 'CO-OP: VYTVORIŤ HRU', action: () => this.scene.start('Lobby', { role: 'host' }) },
      { label: 'CO-OP: PRIPOJIŤ SA', action: () => this.scene.start('Lobby', { role: 'client' }) },
      { label: () => `POSTAVA: < ${HEROES[settings.hero].name} >`, change: () => { settings.hero = settings.hero ? 0 : 1; saveSettings(); this.updateHero(); } },
      {
        label: () => `OBTIAŽNOSŤ: < ${DIFFICULTY[settings.difficulty].name} >`,
        change: (d) => { const i = DIFF_KEYS.indexOf(settings.difficulty); settings.difficulty = DIFF_KEYS[(i + d + 3) % 3]; saveSettings(); },
      },
      { label: 'NASTAVENIA', action: () => this.scene.start('Settings', { back: 'Menu' }) },
      { label: 'PRÍBEH', action: () => this.showStory() },
    ], { gap: 16 });

    this.hero = this.add.sprite(W - 60, 150, `player_${HEROES[settings.hero].key}`, 0).setScale(2);
    this.heroText = text(this, W - 60, 190, '', { ox: 0.5, color: 0xffd36a });
    this.updateHero();

    text(this, W / 2, 222, `HI-SCORE ${String(settings.highScore).padStart(7, '0')}`, { ox: 0.5, color: 0xffd36a });
    text(this, W / 2, 246, 'ŠÍPKY/WASD  Z=SKOK  X=STREĽBA  ENTER=PAUZA', { ox: 0.5, color: 0x7a8294 });
    text(this, W / 2, 258, 'GAMEPAD: A=SKOK  X/B=STREĽBA  START', { ox: 0.5, color: 0x7a8294 });
    if (data.score !== undefined) toast(data.record ? `Nový rekord: ${data.score}!` : `Skóre: ${data.score}`);

    audio.playMusic('menu');

    if (data.quick !== undefined && data.quick !== null) this.startSingle(Math.max(0, Math.min(3, Number(data.quick) - 1 || 0)));
  }

  updateHero() {
    const h = HEROES[settings.hero];
    this.hero.setTexture(`player_${h.key}`, 0);
    this.heroText.setText(`${h.name}\n${settings.hero ? 'SILNÁ' : 'RÝCHLY'}`);
  }

  startSingle(level) {
    const s = newSession('single', settings.difficulty, [newPlayer(0, settings.hero)], 0);
    s.level = level;
    this.registry.set('session', s);
    this.scene.start('Game', { level });
  }

  showStory() {
    this.menu.enabled = false;
    this.menu.refresh();
    const layer = this.add.container(0, 0).setDepth(200);
    layer.add(this.add.rectangle(0, 0, W, H, 0x0b0e1a, 0.92).setOrigin(0));
    STORY.forEach((l, i) => layer.add(text(this, W / 2, 30 + i * 15, l, { ox: 0.5, color: i === 0 ? 0xff9a2a : 0xe8f4ff, depth: 201 })));
    layer.add(text(this, W / 2, 250, 'ŤUKNI PRE NÁVRAT', { ox: 0.5, color: 0xffd36a, depth: 201 }));
    const close = () => { layer.destroy(); this.menu.enabled = true; this.menu.refresh(); this.storyClose = null; };
    this.time.delayedCall(200, () => {
      this.input.once('pointerdown', close);
      this.storyClose = close;
    });
  }

  update(time) {
    this.bg.forEach((b, i) => { b.tilePositionX = time * 0.004 * i * i; });
    if (this.storyClose) {
      if (controls.pressed('jump') || controls.pressed('fire') || controls.pressed('pause')) this.storyClose();
      return;
    }
    this.menu.update();
  }
}

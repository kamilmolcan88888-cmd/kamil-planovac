// Hráč (Rys / Orlica / Sokol / Vlk).
// Pohyb: beh, skok s premenlivou výškou, coyote time, jump buffering, kľak, ľah, zoskok
// z platformy (dole + skok), streľba v 8 smeroch. Snímky sa nastavujú ručne (nie cez anims),
// aby sa dali jednoducho poslať v snapshote.
import Phaser from 'phaser';
import { PHYS, PF, HEROES, WEAPONS } from '../config.js';
import { netify } from './net-util.js';
import { fireWeapon } from './Weapons.js';
import { T_PLAT } from './Level.js';

// Hitboxy pre jednotlivé pózy (spodok vždy na y = 31 v rámci 32×32 snímky)
const BODY = {
  stand: [10, 24, 11, 7],
  crouch: [10, 16, 11, 15],
  prone: [22, 8, 5, 23],
  ball: [12, 14, 10, 17],
};

export class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {object} sp  záznam hráča v session ({ slot, hero, lives, score, weapon })
   * @param {() => object} input  funkcia vracajúca aktuálny vstup
   */
  constructor(scene, x, y, sp, input) {
    const hero = HEROES[sp.hero];
    super(scene, x, y, `player_${hero.key}`, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    netify(scene, this, `player_${hero.key}`);
    this.sp = sp;
    this.slot = sp.slot;
    this.hero = hero;
    this.getInput = input;
    this.prevIn = {};
    this.facing = 1;
    this.aim = { x: 1, y: 0 };
    this.pose = 'stand';
    this.dead = false;
    this.jumping = false;
    this.coyoteUntil = 0;
    this.bufferUntil = 0;
    this.downSince = 0;
    this.dropUntil = 0;
    this.nextFire = 0;
    this.invulnUntil = scene.time.now + 2000;
    this.animT = 0;
    this.setPose('stand');
    this.body.setMaxVelocityY(PHYS.maxFall);
  }

  setPose(p) {
    if (this.pose === p && this.body.width === BODY[p][0]) return;
    this.pose = p;
    const [w, h, ox, oy] = BODY[p];
    this.body.setSize(w, h, false);
    this.body.setOffset(ox, oy);
  }

  get invulnerable() { return this.scene.time.now < this.invulnUntil; }

  /** Stojí hráč na jednosmernej platforme? (kvôli zoskoku) */
  onPlatform() {
    const lvl = this.scene.level;
    const y = this.body.bottom + 2;
    for (const x of [this.body.left + 1, this.body.right - 1]) {
      const t = lvl.layer.getTileAtWorldXY(x, y);
      if (t && t.index === T_PLAT) return true;
    }
    return false;
  }

  update(time, dt) {
    if (this.dead) { this.updateDead(time); return; }
    const inp = this.getInput();
    const prev = this.prevIn;
    this.prevIn = inp;
    const body = this.body;
    const onGround = body.blocked.down || body.touching.down;
    const P = PHYS;

    if (onGround) {
      this.coyoteUntil = time + P.coyoteMs;
      if (body.velocity.y >= 0) this.jumping = false;
    }
    const jumpPressed = inp.jump && !prev.jump;
    if (jumpPressed) this.bufferUntil = time + P.bufferMs;

    // --- skok / zoskok ---
    if (jumpPressed && inp.down && onGround && this.onPlatform()) {
      this.dropUntil = time + P.dropMs;          // prepadni cez platformu
      this.bufferUntil = 0;
      this.y += 2;
    } else if (this.bufferUntil > time && (onGround || this.coyoteUntil > time) && !this.jumping) {
      body.setVelocityY(P.jumpV);
      this.jumping = true;
      this.bufferUntil = 0;
      this.coyoteUntil = 0;
      this.scene.fx.sound('jump');
    }
    // premenlivá výška skoku – pustenie tlačidla skráti skok
    if (this.jumping && !inp.jump && body.velocity.y < P.jumpCut) body.setVelocityY(P.jumpCut);

    // --- vodorovný pohyb, kľak, ľah ---
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const crouching = onGround && inp.down && dir === 0 && !inp.up;
    if (crouching) { if (!this.downSince) this.downSince = time; } else this.downSince = 0;
    const prone = crouching && time - this.downSince > P.proneDelayMs;
    if (dir) this.facing = dir;
    const inWater = this.scene.level.inWater(this.x, this.body.bottom - 2);
    const speed = this.hero.speed * (inWater ? 0.8 : 1);
    body.setVelocityX(crouching ? 0 : dir * speed);

    // --- mierenie v 8 smeroch ---
    let ax;
    let ay;
    if (!onGround) {
      ax = dir;
      ay = inp.up ? -1 : inp.down ? 1 : 0;
      if (!ax && !ay) ax = this.facing;
    } else if (inp.up) { ax = dir; ay = -1; } else if (inp.down && dir) { ax = dir; ay = 1; } else { ax = this.facing; ay = 0; }
    this.aim.x = ax;
    this.aim.y = ay;

    // --- póza a snímka ---
    this.animT += dt;
    let frame;
    if (!onGround && this.jumping) {
      this.setPose('ball');
      frame = PF.jump[Math.floor(this.animT / 70) % 4];
    } else if (prone) {
      this.setPose('prone');
      frame = PF.prone;
    } else if (crouching) {
      this.setPose('crouch');
      frame = PF.crouch;
    } else {
      this.setPose('stand');
      const moving = dir !== 0 && onGround;
      const run = Math.floor(this.animT / 85) % 6;
      if (moving) frame = ay < 0 ? PF.runUp[run] : ay > 0 ? PF.runDown[run] : PF.run[run];
      else if (ay < 0) frame = ax ? PF.diagUp : PF.up;
      else if (ay > 0) frame = ax ? PF.diagDown : PF.idle[0];
      else frame = PF.idle[Math.floor(this.animT / 500) % 2];
    }
    this.setFrame(frame);
    this.setFlipX(this.facing < 0);

    // --- streľba ---
    if (inp.fire && time >= this.nextFire) {
      const w = WEAPONS[this.sp.weapon] || WEAPONS.basic;
      this.nextFire = time + w.rate;
      const m = this.muzzle(ax, ay);
      fireWeapon(this.scene, this, this.x + m.x, this.y + m.y, ax, ay);
    }

    // blikanie počas nesmrteľnosti
    this.setAlpha(this.invulnerable && Math.floor(time / 80) % 2 ? 0.35 : 1);
    if (inWater && onGround && dir && Math.random() < 0.08) this.scene.fx.burst('water', this.x, this.body.bottom - 3, 3);
  }

  /** Poloha ústia hlavne vzhľadom na stred spritu (podľa pózy a smeru). */
  muzzle(ax, ay) {
    const f = this.facing;
    if (this.pose === 'ball') return { x: ax * 8, y: ay * 8 };
    if (this.pose === 'prone') return { x: 15 * f, y: 12 };
    if (this.pose === 'crouch') return { x: 11 * f, y: 1 };
    if (ay < 0 && !ax) return { x: -2 * f, y: -18 };
    if (ay < 0) return { x: 7 * f, y: -14 };
    if (ay > 0) return { x: 8 * f, y: 3 };
    return { x: 11 * f, y: -5 };
  }

  /** Zásah – hráč zomrie (klasický run-and-gun: jeden zásah = smrť). force = pád do priepasti. */
  hit(force = false) {
    if (this.dead || (this.invulnerable && !force) || this.out) return false;
    this.dead = true;
    this.deadAt = this.scene.time.now;
    this.sp.lives -= 1;
    this.sp.weapon = 'basic';
    this.setPose('stand');
    this.body.setVelocity(-this.facing * 70, -230);
    this.jumping = false;
    this.scene.fx.sound('death');
    this.scene.fx.burst('fire', this.x, this.y, 8);
    this.scene.fx.vibrate(this.slot, 200);
    return true;
  }

  updateDead(time) {
    const t = time - this.deadAt;
    const onGround = this.body.blocked.down;
    if (onGround) this.body.setVelocityX(0);
    const f = t < 150 ? 0 : t < 350 ? 1 : t < 1000 ? 2 : 3;
    this.setFrame(PF.death[f]);
    this.setAlpha(t > 1000 && Math.floor(time / 60) % 2 ? 0.3 : 1);
    if (t > 1400 && !this.respawnRequested) {
      this.respawnRequested = true;
      this.scene.onPlayerDeathDone(this);
    }
  }

  respawn(x, y) {
    this.dead = false;
    this.respawnRequested = false;
    this.setPosition(x, y);
    this.body.setVelocity(0, 0);
    this.invulnUntil = this.scene.time.now + 2500;
    this.setVisible(true).setAlpha(1);
    this.body.enable = true;
    this.jumping = false;
  }
}

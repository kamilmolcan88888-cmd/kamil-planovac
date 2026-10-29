// Nepriatelia Helios: pešiak, strelec na skale, dron-kapsula s power-upom, automatická veža.
import Phaser from 'phaser';
import { SCORE, POWERUPS, WEAPONS } from '../config.js';
import { netify } from './net-util.js';
import { aimedShot, enemyShot } from './Weapons.js';

/** Spoločný základ: životy, zásah s bliknutím, smrť s výbuchom a bodmi. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, key, frame = 0, { hp = 1, gravity = false, walker = false, score = 100 } = {}) {
    super(scene, x, y, key, frame);
    scene.add.existing(this);
    scene.enemies.add(this);
    if (walker) scene.walkers.add(this);
    netify(scene, this, key);
    this.body.allowGravity = gravity;
    this.maxHp = this.hp = hp * scene.diff.hp;
    this.score = score;
    this.dying = false;
    this.contact = true;          // dotyk zabíja hráča
  }

  get diff() { return this.scene.diff; }

  /** Najbližší živý hráč (alebo null). */
  target() {
    let best = null;
    let bd = Infinity;
    for (const p of this.scene.players) {
      if (p.dead || !p.active) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  onScreen(m = 0) {
    const c = this.scene.cameras.main;
    return this.x > c.scrollX - m && this.x < c.scrollX + c.width + m && this.y > c.scrollY - m && this.y < c.scrollY + c.height + m;
  }

  /** Dostal zásah. Vráti false, ak strelu ignoruje (napr. štít). */
  damage(amount, owner) {
    if (this.dying) return false;
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(50, () => this.active && this.clearTint());
    this.scene.fx.sound('hit');
    if (this.hp <= 0) this.kill(owner);
    return true;
  }

  kill(owner) {
    if (this.dying) return;
    this.dying = true;
    this.scene.addScore(owner, this.score);
    this.onDeath(owner);
  }

  onDeath() {
    this.scene.fx.explosion(this.x, this.y);
    this.destroy();
  }

  /** Volané každú snímku. */
  tick() {}
}

// ---------------------------------------------------------------- pešiak
export class Infantry extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'infantry', 0, { hp: 1, gravity: true, walker: true, score: SCORE.infantry });
    this.body.setSize(10, 24).setOffset(11, 7);
    const t = this.target();
    this.dir = t && t.x > x ? 1 : -1;
    this.nextShot = scene.time.now + 900 + Math.random() * 1500;
    this.shootUntil = 0;
    this.animT = Math.random() * 400;
  }

  tick(time, dt) {
    if (this.dying) return;
    const b = this.body;
    const onGround = b.blocked.down;
    if (b.blocked.left) this.dir = 1;
    if (b.blocked.right) this.dir = -1;
    this.animT += dt;
    if (time < this.shootUntil) {
      b.setVelocityX(0);
      this.setFrame(4);
    } else {
      b.setVelocityX(onGround ? this.dir * 62 : b.velocity.x);
      this.setFrame(Math.floor(this.animT / 110) % 4);
    }
    this.setFlipX(this.dir < 0);
    // občas zastaví a vystrelí smerom k hráčovi
    const t = this.target();
    if (t && onGround && time > this.nextShot && this.onScreen(-8)) {
      this.nextShot = time + (1800 + Math.random() * 2400) / this.diff.fire;
      if (Math.sign(t.x - this.x) === this.dir || Math.random() < 0.5) {
        this.dir = t.x > this.x ? 1 : -1;
        this.shootUntil = time + 380;
        enemyShot(this.scene, this.x + this.dir * 12, this.y - 5, this.dir * 150, 0);
        this.scene.fx.sound('enemyShot');
      }
    }
    const c = this.scene.cameras.main;
    if (this.y > this.scene.level.height + 40 || this.x < c.scrollX - 80 || (this.scene.scrollAxis === 'y' && this.y > c.scrollY + c.height + 60)) this.destroy();
  }

  onDeath() {
    this.scene.fx.explosion(this.x, this.y - 4);
    this.scene.fx.burst('debris', this.x, this.y, 6);
    this.destroy();
  }
}

// ---------------------------------------------------------------- strelec na skale
export class Sniper extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'sniper', 0, { hp: 2, score: SCORE.sniper });
    this.body.setSize(14, 20).setOffset(9, 11);
    this.body.moves = false;
    this.nextShot = scene.time.now + 1200;
  }

  tick(time) {
    if (this.dying) return;
    const t = this.target();
    if (!t) return;
    const dx = t.x - this.x;
    const dy = t.y - 6 - (this.y - 6);
    this.setFlipX(dx < 0);
    const ang = Phaser.Math.RadToDeg(Math.atan2(dy, Math.abs(dx)));
    let f = 0;
    if (ang < -62) f = 2; else if (ang < -20) f = 1; else if (ang > 25) f = 3;
    this.setFrame(f);
    if (time > this.nextShot && this.onScreen(-4)) {
      this.nextShot = time + 1700 / this.diff.fire;
      const mx = [11, 8, 0, 9][f] * (dx < 0 ? -1 : 1);
      const my = [1, -9, -13, 7][f];
      aimedShot(this.scene, this.x + mx, this.y + my, t.x, t.y - 4, 140);
      this.scene.fx.sound('enemyShot');
    }
  }
}

// ---------------------------------------------------------------- dron-kapsula s power-upom
export class Drone extends Enemy {
  constructor(scene, x, y, drop) {
    super(scene, x, y, 'drone', 0, { hp: 1, score: SCORE.drone });
    this.contact = false;
    this.drop = drop;
    this.baseY = y;
    this.t0 = scene.time.now;
    this.body.setSize(20, 12);
  }

  tick(time) {
    if (this.dying) return;
    const t = (time - this.t0) / 1000;
    this.body.setVelocityX(75);
    this.y = this.baseY + Math.sin(t * 2.6) * 18;
    this.setFrame(Math.floor(time / 120) % 2);
    const c = this.scene.cameras.main;
    if (this.x > c.scrollX + c.width + 40) this.destroy();
  }

  onDeath() {
    this.scene.fx.explosion(this.x, this.y);
    new PowerUp(this.scene, this.x, this.y, this.drop);
    this.destroy();
  }
}

// ---------------------------------------------------------------- automatická veža
export class Turret extends Enemy {
  constructor(scene, x, y, { mounted = false } = {}) {
    super(scene, x, y, 'turret', 0, { hp: 9, score: SCORE.turret });
    this.body.setSize(24, 18).setOffset(4, 13);
    this.body.moves = false;
    this.contact = false;
    this.mounted = mounted;     // pripevnená na bossovi – stále otvorená
    this.barrel = netify(scene, scene.add.sprite(x, y - 2, 'turret_barrel'), 'turret_barrel');
    this.barrel.setAngle(180);
    this.open = mounted;
    this.nextShot = scene.time.now + 1500;
  }

  damage(amount, owner) {
    if (!this.open) { this.scene.fx.sound('ricochet'); this.scene.fx.spark(this.x, this.y); return true; }
    return super.damage(amount, owner);
  }

  tick(time, dt) {
    if (this.dying) return;
    const t = this.target();
    if (!t) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    this.open = this.mounted || (dist < 230 && this.onScreen(-8));
    this.setFrame(this.open ? 1 : 0);
    this.barrel.setVisible(this.open);
    if (!this.open) return;
    // hlaveň sa plynulo otáča k hráčovi (max 120°/s)
    const want = Phaser.Math.RadToDeg(Math.atan2(t.y - 4 - (this.y - 2), t.x - this.x));
    const diff = Phaser.Math.Angle.ShortestBetween(this.barrel.angle, want);
    this.barrel.angle += Phaser.Math.Clamp(diff, -0.12 * dt, 0.12 * dt);
    if (time > this.nextShot && Math.abs(diff) < 20) {
      this.nextShot = time + 1500 / this.diff.fire;
      const a = Phaser.Math.DegToRad(this.barrel.angle);
      enemyShot(this.scene, this.x + Math.cos(a) * 15, this.y - 2 + Math.sin(a) * 15, Math.cos(a) * 130, Math.sin(a) * 130);
      this.scene.fx.sound('enemyShot');
    }
  }

  onDeath() {
    this.scene.fx.explosion(this.x, this.y - 6);
    this.barrel.destroy();
    // trosky ostanú ležať (iba vizuál)
    const wreck = netify(this.scene, this.scene.add.sprite(this.x, this.y, 'turret', 2), 'turret');
    this.scene.decor.push(wreck);
    this.destroy();
  }

  destroy(fromScene) {
    if (this.barrel?.active) this.barrel.destroy();
    super.destroy(fromScene);
  }
}

// ---------------------------------------------------------------- power-up
export class PowerUp extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind) {
    const idx = Math.max(0, POWERUPS.indexOf(kind));
    super(scene, x, y, 'powerups', idx);
    scene.add.existing(this);
    scene.items.add(this);
    netify(scene, this, 'powerups');
    this.kind = POWERUPS[idx];
    this.body.setVelocity(25, -220);
    this.body.setSize(14, 14);
    this.born = scene.time.now;
  }

  tick(time) {
    if (this.body.blocked.down) this.body.setVelocityX(0);
    const age = time - this.born;
    if (age > 9000) this.setAlpha(Math.floor(time / 90) % 2 ? 0.3 : 1);
    if (age > 12000 || this.y > this.scene.level.height + 20) this.destroy();
  }

  collect(player) {
    player.sp.weapon = this.kind;
    this.scene.addScore(player.slot, SCORE.powerup);
    this.scene.fx.sound('powerup');
    this.scene.fx.vibrate(player.slot, 30);
    this.scene.fx.message(`${WEAPONS[this.kind].name}!`, 1000);
    this.destroy();
  }
}

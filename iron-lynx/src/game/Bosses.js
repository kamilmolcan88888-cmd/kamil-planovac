// Bossovia: Kamenný golem, Mechanický pavúk, Strážna brána (mini-boss), Hlavný reaktor.
// Každý boss má hp/maxHp (HUD ukazuje pás) a po smrti zavolá scene.bossDefeated().
import Phaser from 'phaser';
import { W, H, SCORE } from '../config.js';
import { Enemy, Turret, Infantry } from './Enemies.js';
import { enemyShot, aimedShot } from './Weapons.js';
import { netify } from './net-util.js';

class Boss extends Enemy {
  constructor(scene, x, y, key, hp, opts = {}) {
    super(scene, x, y, key, 0, { hp, score: SCORE.boss, ...opts });
    this.isBoss = true;
    this.arena = scene.arena;        // { x, y } ľavý horný roh arény
    this.state = 'intro';
    this.stateT = scene.time.now + 1200;
  }

  /** Zničenie: séria výbuchov, potom hlásenie scéne. */
  onDeath() {
    const s = this.scene;
    this.body.enable = false;
    let n = 0;
    s.time.addEvent({
      delay: 140, repeat: 14,
      callback: () => {
        n++;
        s.fx.explosion(this.x + Phaser.Math.Between(-this.width / 2, this.width / 2), this.y + Phaser.Math.Between(-this.height / 2, this.height / 2), n % 4 === 0);
        if (n === 15) { this.finalFrame(); s.bossDefeated(this); }
      },
    });
  }

  finalFrame() { this.destroy(); }
}

// ---------------------------------------------------------------- KAMENNÝ GOLEM (level 1)
export class Golem extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y - 32, 'golem', 110, { gravity: true, walker: true });
    this.body.setSize(40, 54).setOffset(12, 10);
    this.dir = -1;
    this.attack = 0;
  }

  tick(time, dt) {
    if (this.dying) return;
    const b = this.body;
    const t = this.target();
    const minX = this.arena.x + 60;
    const maxX = this.arena.x + W - 50;
    if (this.state === 'intro' || this.state === 'walk') {
      if (time > this.stateT) { this.state = this.attack++ % 2 ? 'stompWind' : 'throwWind'; this.stateT = time + 600; }
      if (this.x < minX) this.dir = 1;
      if (this.x > maxX) this.dir = -1;
      if (b.blocked.down) b.setVelocityX(this.dir * (this.hp < this.maxHp / 2 ? 48 : 32));
      this.setFrame(Math.floor(time / 300) % 2);
      if (t) this.setFlipX(t.x > this.x);
    } else if (this.state === 'throwWind') {
      b.setVelocityX(0);
      this.setFrame(2);
      if (time > this.stateT) {
        // balvan po balistickej dráhe na hráča (let ~1.1 s)
        if (t) {
          const tt = 1.1;
          const g = this.scene.physics.world.gravity.y;
          const sx = this.x + (t.x > this.x ? 20 : -20);
          const sy = this.y - 34;
          const vx = (t.x - sx) / tt;
          const vy = (t.y - sy - 0.5 * g * tt * tt) / tt;
          enemyShot(this.scene, sx, sy, vx, vy, 'boulder');
          if (this.hp < this.maxHp / 2) enemyShot(this.scene, sx, sy, vx * 0.6, vy, 'boulder');
          this.scene.fx.sound('enemyShot');
        }
        this.state = 'walk';
        this.stateT = time + 1500 / this.diff.fire;
      }
    } else if (this.state === 'stompWind') {
      b.setVelocityX(0);
      this.setFrame(3);
      if (time > this.stateT && b.blocked.down) {
        b.setVelocityY(-260);
        this.state = 'stompAir';
      }
    } else if (this.state === 'stompAir') {
      if (b.blocked.down && b.velocity.y >= 0) {
        this.scene.fx.shake(300, 0.012);
        this.scene.fx.sound('stomp');
        this.scene.fx.burst('debris', this.x, this.y + 30, 16);
        // zo stropu padajú kamene
        const n = 3 + Math.round(this.diff.fire * 2);
        for (let i = 0; i < n; i++) {
          const x = this.arena.x + 30 + ((i * 397 + time) % (W - 60));
          this.scene.time.delayedCall(i * 160, () => enemyShot(this.scene, x, this.scene.cameras.main.scrollY - 10, 0, 40, 'boulder'));
        }
        this.state = 'walk';
        this.stateT = time + 1800 / this.diff.fire;
      }
    }
  }

  finalFrame() {
    const rub = netify(this.scene, this.scene.add.sprite(this.x, this.y, 'golem', 4), 'golem');
    this.scene.decor.push(rub);
    this.destroy();
  }
}

// ---------------------------------------------------------------- MECHANICKÝ PAVÚK (level 2)
export class Spider extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y + 20, 'spider', 150);
    this.body.setSize(70, 30).setOffset(13, 8);
    this.homeY = y + 20;
    this.attack = 0;
  }

  tick(time) {
    if (this.dying) return;
    const t = this.target();
    const tt = time / 1000;
    if (this.state === 'intro' || this.state === 'move') {
      this.x = this.arena.x + W / 2 + Math.sin(tt * 0.9) * (W / 2 - 70);
      this.y = this.homeY + Math.sin(tt * 2.3) * 6;
      this.setFrame(Math.floor(time / 120) % 3);
      if (time > this.stateT) {
        this.attack++;
        this.state = this.attack % 3 === 0 ? 'lunge' : 'spread';
        this.stateT = time + 500;
      }
    } else if (this.state === 'spread') {
      this.setFrame(3);
      if (time > this.stateT) {
        if (t) {
          const base = Math.atan2(t.y - this.y, t.x - this.x);
          const n = this.hp < this.maxHp / 2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.22;
            enemyShot(this.scene, this.x, this.y + 10, Math.cos(a) * 120, Math.sin(a) * 120, 'plasma');
          }
          this.scene.fx.sound('laser');
        }
        this.state = 'move';
        this.stateT = time + 1700 / this.diff.fire;
      }
    } else if (this.state === 'lunge') {
      // skok dole na zem a späť hore
      this.setFrame(3);
      this.state = 'lunging';
      const floor = this.arena.y + H - 70;
      this.scene.tweens.add({
        targets: this, y: floor, duration: 500, ease: 'Quad.easeIn', yoyo: true, hold: 500,
        onYoyo: () => { this.scene.fx.shake(200, 0.008); this.scene.fx.sound('stomp'); },
        onComplete: () => { this.state = 'move'; this.stateT = time + 1500; },
      });
    }
  }
}

// ---------------------------------------------------------------- STRÁŽNA BRÁNA (level 3)
export class Gate extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y - 64, 'gate', 120);
    this.body.setSize(36, 128).setOffset(14, 0);
    this.body.moves = false;
    this.contact = false;
    scene.blockers.push(this);     // hráči cez bránu neprejdú
    this.turrets = [new Turret(scene, x - 14, y - 104, { mounted: true }), new Turret(scene, x - 14, y - 22, { mounted: true })];
    for (const tu of this.turrets) tu.setDepth(16);
    this.nextSpawn = scene.time.now + 3000;
  }

  /** Zraniteľné je len jadro v strede. */
  damage(amount, owner, bullet) {
    if (bullet && Math.abs(bullet.y - this.y) > 18) { this.scene.fx.sound('ricochet'); this.scene.fx.spark(bullet.x, bullet.y); return true; }
    return super.damage(amount, owner);
  }

  tick(time) {
    if (this.dying) return;
    this.setFrame(this.hp < this.maxHp / 2 ? 1 : 0);
    const t = this.target();
    if (time > this.stateT && t) {
      for (const d of [-0.25, 0, 0.25]) {
        const a = Math.atan2(t.y - this.y, t.x - this.x) + d;
        enemyShot(this.scene, this.x - 20, this.y, Math.cos(a) * 125, Math.sin(a) * 125, 'plasma');
      }
      this.scene.fx.sound('laser');
      this.stateT = time + 2200 / this.diff.fire;
    }
    // posily z poklopu
    if (time > this.nextSpawn) {
      this.nextSpawn = time + 4500 / this.diff.fire;
      if (this.scene.enemies.countActive() < 8) new Infantry(this.scene, this.arena.x + 20, this.arena.y + 120);
    }
  }

  onDeath() {
    for (const tu of this.turrets) if (tu.active) tu.kill(null);
    super.onDeath();
  }

  finalFrame() {
    const ruin = netify(this.scene, this.scene.add.sprite(this.x, this.y, 'gate', 2), 'gate');
    this.scene.decor.push(ruin);
    this.scene.blockers = this.scene.blockers.filter((b) => b !== this);
    this.destroy();
  }
}

// ---------------------------------------------------------------- HLAVNÝ REAKTOR (level 4)
class Arm extends Enemy {
  constructor(scene, core, idx) {
    super(scene, core.x, core.y, 'arm', 0, { hp: 22, score: SCORE.arm });
    this.core = core;
    this.idx = idx;
    this.body.setSize(22, 22);
    this.segs = [0, 1, 2].map(() => netify(scene, scene.add.sprite(core.x, core.y, 'armseg'), 'armseg'));
    this.nextShot = scene.time.now + 1500 + idx * 600;
  }

  tick(time) {
    if (this.dying) return;
    const c = this.core;
    const a = c.spin + (this.idx * Math.PI) / 2;
    const r = 62 + Math.sin(time / 600 + this.idx) * 12;
    this.x = c.x + Math.cos(a) * r;
    this.y = c.y + Math.sin(a) * r * 0.8;
    this.segs.forEach((s, i) => s.setPosition(c.x + (this.x - c.x) * (i + 1) / 4, c.y + (this.y - c.y) * (i + 1) / 4));
    const shooting = time > this.nextShot - 250;
    this.setFrame(shooting ? 1 : 0);
    const t = this.target();
    if (t && time > this.nextShot) {
      this.nextShot = time + 2400 / this.diff.fire;
      aimedShot(this.scene, this.x, this.y, t.x, t.y - 6, 135, 'bullet');
      this.scene.fx.sound('enemyShot');
    }
  }

  destroy(fromScene) {
    this.segs?.forEach((s) => s.active && s.destroy());
    super.destroy(fromScene);
  }
}

export class Reactor extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y, 'reactor', 130);
    this.body.setSize(44, 44);
    this.body.moves = false;
    this.contact = false;
    this.spin = 0;
    this.arms = [0, 1, 2, 3].map((i) => new Arm(scene, this, i));
    this.ringT = scene.time.now + 2500;
  }

  get shielded() { return this.arms.some((a) => a.active); }

  /** Bossov pás zdravia v HUD zahŕňa aj ramená. */
  get hpFrac() {
    const arms = this.arms.reduce((s, a) => s + (a.active ? Math.max(0, a.hp) : 0), 0);
    const armsMax = this.arms.reduce((s, a) => s + a.maxHp, 0);
    return (Math.max(0, this.hp) + arms) / (this.maxHp + armsMax);
  }

  damage(amount, owner, bullet) {
    if (this.shielded) {
      this.scene.fx.sound('ricochet');
      if (bullet) this.scene.fx.spark(bullet.x, bullet.y);
      return true;
    }
    return super.damage(amount, owner);
  }

  tick(time, dt) {
    if (this.dying) return;
    const angry = !this.shielded;
    this.spin += dt * (angry ? 0.0015 : 0.0009);
    this.setFrame(angry ? 2 : Math.floor(time / 250) % 2);
    if (angry && time > this.ringT) {
      const n = 12;
      const off = (time / 1000) % 1;
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2;
        enemyShot(this.scene, this.x, this.y, Math.cos(a) * 95, Math.sin(a) * 95, 'plasma');
      }
      this.scene.fx.sound('laser');
      this.ringT = time + 1800 / this.diff.fire;
    }
  }

  finalFrame() {
    const dead = netify(this.scene, this.scene.add.sprite(this.x, this.y, 'reactor', 3), 'reactor');
    this.scene.decor.push(dead);
    this.destroy();
  }
}

export const BOSSES = { golem: Golem, spider: Spider, gate: Gate, reactor: Reactor };

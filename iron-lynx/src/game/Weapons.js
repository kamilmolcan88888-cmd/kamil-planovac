// Zbrane hráča a strely nepriateľov.
import { WEAPONS } from '../config.js';
import { netify } from './net-util.js';

/** Vytvorí strelu hráča v skupine scene.pBullets. */
function makeBullet(scene, key, frame, x, y, vx, vy, props) {
  const b = scene.pBullets.create(x, y, key, frame);
  netify(scene, b, key);
  b.body.allowGravity = false;
  b.body.setVelocity(vx, vy);
  b.born = scene.time.now;
  b.hitSet = new Set();
  Object.assign(b, props);
  return b;
}

/**
 * Výstrel hráča.
 * @param ax,ay smer (-1/0/1) v 8 smeroch
 */
export function fireWeapon(scene, player, x, y, ax, ay) {
  const kind = player.sp.weapon;
  const w = WEAPONS[kind] || WEAPONS.basic;
  const base = Math.atan2(ay, ax);
  const dmg = w.dmg * player.hero.dmg;
  const owner = player.slot;
  const vel = (a, sp) => [Math.cos(a) * sp, Math.sin(a) * sp];
  switch (kind) {
    case 'rapid': {
      const [vx, vy] = vel(base, w.speed);
      makeBullet(scene, 'bullets', 1, x, y, vx, vy, { dmg, owner, life: 1200 });
      break;
    }
    case 'spread': {
      for (const d of [-24, -12, 0, 12, 24]) {
        const [vx, vy] = vel(base + (d * Math.PI) / 180, w.speed);
        makeBullet(scene, 'bullets', 2, x, y, vx, vy, { dmg, owner, life: 1100 });
      }
      break;
    }
    case 'laser': {
      const [vx, vy] = vel(base, w.speed);
      const b = makeBullet(scene, 'laser', 0, x + Math.cos(base) * 10, y + Math.sin(base) * 10, vx, vy, { dmg, owner, pierce: true, life: 900 });
      b.setAngle((base * 180) / Math.PI);
      b.body.setSize(8, 8);
      break;
    }
    case 'flame': {
      const a = base + (Math.random() - 0.5) * 0.25;
      const [vx, vy] = vel(a, w.speed);
      const b = makeBullet(scene, 'flame', 0, x, y, vx + player.body.velocity.x * 0.5, vy, { dmg, owner, pierce: true, life: w.life, flame: true });
      b.body.setSize(10, 10);
      break;
    }
    default: {
      const [vx, vy] = vel(base, w.speed);
      makeBullet(scene, 'bullets', 0, x, y, vx, vy, { dmg, owner, life: 1200 });
    }
  }
  scene.fx.sound(w.sfx);
}

/** Aktualizácia striel hráča: životnosť, animácia plameňa, mimo obrazovky. */
export function updatePlayerBullets(scene, time) {
  const cam = scene.cameras.main;
  for (const b of scene.pBullets.getChildren().slice()) {
    const age = time - b.born;
    if (b.flame) b.setFrame(Math.min(3, Math.floor((age / b.life) * 4)));
    const off = b.x < cam.scrollX - 24 || b.x > cam.scrollX + cam.width + 24 || b.y < cam.scrollY - 24 || b.y > cam.scrollY + cam.height + 24;
    if (age > b.life || off) b.destroy();
  }
}

/**
 * Strela nepriateľa.
 * @param kind 'bullet' | 'plasma' | 'boulder'
 */
export function enemyShot(scene, x, y, vx, vy, kind = 'bullet') {
  const diff = scene.diff;
  const key = kind === 'boulder' ? 'boulder' : 'bullets';
  const frame = kind === 'plasma' ? 4 : kind === 'boulder' ? 0 : 3;
  const b = scene.eBullets.create(x, y, key, frame);
  netify(scene, b, key);
  b.body.allowGravity = kind === 'boulder';
  b.body.setVelocity(vx * diff.bullet, vy * (kind === 'boulder' ? 1 : diff.bullet));
  b.body.setSize(kind === 'boulder' ? 12 : 4, kind === 'boulder' ? 12 : 4);
  b.born = scene.time.now;
  b.kind = kind;
  if (kind === 'boulder') b.setAngularVelocity(vx > 0 ? 360 : -360);
  return b;
}

/** Vystrelí na cieľ rýchlosťou speed. */
export function aimedShot(scene, x, y, tx, ty, speed, kind) {
  const a = Math.atan2(ty - y, tx - x);
  return enemyShot(scene, x, y, Math.cos(a) * speed, Math.sin(a) * speed, kind);
}

export function updateEnemyBullets(scene, time) {
  const cam = scene.cameras.main;
  for (const b of scene.eBullets.getChildren().slice()) {
    const m = 48;
    if (time - b.born > 6000 || b.x < cam.scrollX - m || b.x > cam.scrollX + cam.width + m || b.y > cam.scrollY + cam.height + m || b.y < cam.scrollY - 200) b.destroy();
  }
}

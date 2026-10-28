// Test bossov: pre každý level teleportuje hráča k aréne, overí spawn bossa, nechá ho
// chvíľu bojovať (hráč je nesmrteľný a strieľa), potom ho zničí a overí prechod levelu.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const out = process.env.OUT || '.';
const browser = await chromium.launch();
for (const lvl of [1, 2, 3, 4]) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + e.stack));
  await page.goto(`${url}?level=${lvl}`);
  await page.waitForFunction(() => window.__game?.scene.getScene('Game')?.players?.length);
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    const p = g.players[0];
    p.invulnUntil = 1e12;
    p.sp.weapon = 'spread';
    const a = g.arenaPos;
    if (g.scrollAxis === 'x') { g.cameras.main.scrollX = a.x - 20; p.setPosition(a.x + 230, 120); }
    else { g.cameras.main.scrollY = a.y + 20; p.setPosition(112, a.y + 150); }
    g.pending = g.pending.filter((s) => s.ch === 'C');
  });
  await page.keyboard.down('KeyX');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    return { locked: g.arenaLocked, boss: g.boss?.constructor.name, hp: g.boss && Math.round(g.hud.boss * 100), lives: g.players[0].sp.lives, eb: g.eBullets.countActive() };
  });
  await page.screenshot({ path: `${out}/boss${lvl}.png` });
  await page.evaluate(() => {
    const g = window.__game.scene.getScene('Game');
    if (!g.boss) return;
    g.boss.arms?.forEach((a) => a.active && a.kill(0));
    g.boss.kill(0);
  });
  await page.waitForTimeout(8500);
  const after = await page.evaluate(() => {
    const m = window.__game.scene;
    return { game: m.getScene('Game').sys.isActive() ? m.getScene('Game').levelIdx + 1 : null, victory: m.getScene('Victory').sys.isActive() };
  });
  console.log(`L${lvl}`, JSON.stringify(st), '→', JSON.stringify(after), errs.length ? errs.join('\n') : '');
  await page.close();
}
await browser.close();

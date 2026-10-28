// Dymový test v headless Chromium (Playwright): načíta hru, prejde menu, spustí level,
// chvíľu „hrá“ a uloží screenshoty. Použitie: node tests/smoke.mjs [url] [level]
import { createRequire } from 'node:module';

// Playwright je v sandboxe nainštalovaný globálne; lokálne: npm i -D playwright
const { chromium } = createRequire(import.meta.url)('playwright');

const url = process.argv[2] || 'http://localhost:5173/';
const level = process.argv[3] || '1';
const out = process.env.OUT || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${url}?level=${level}`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/L${level}-start.png` });
// hraj: drž doprava (resp. hore v leveli 2) a strieľaj, občas skoč
const dir = level === '2' ? 'ArrowUp' : 'ArrowRight';
await page.keyboard.down('KeyX');
for (let i = 0; i < 12; i++) {
  await page.keyboard.down(level === '2' ? 'ArrowRight' : dir);
  await page.keyboard.press('KeyZ', { delay: 200 });
  await page.waitForTimeout(400);
  if (level === '2') await page.keyboard.up('ArrowRight');
}
await page.screenshot({ path: `${out}/L${level}-play.png` });
const state = await page.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  return { active: g.sys.isActive(), cam: [g.cameras.main.scrollX, g.cameras.main.scrollY], players: g.players?.map((p) => [Math.round(p.x), Math.round(p.y), p.sp.lives]), enemies: g.enemies?.countActive(), fps: Math.round(window.__game.loop.actualFps) };
});
console.log(JSON.stringify(state));
console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close();

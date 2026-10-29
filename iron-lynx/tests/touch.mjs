// Test dotyku: viewport iPhone 11 na šírku, dva prsty naraz (D-pad doprava + Streľba).
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://localhost:5173/';
const out = process.env.OUT || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 896, height: 414 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${url}?level=1`);
await page.waitForFunction(() => window.__game?.scene.getScene('Game')?.players?.length);
const box = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, sel);
const canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.style.width, c.style.height]; });
console.log('canvas CSS:', canvas, '(očakávané 720x405 = 3× v fyzických px)');
const pad = await box('#dpad');
const fire = await box('#btnFire');
const cdp = await ctx.newCDPSession(page);
const x0 = await page.evaluate(() => window.__game.scene.getScene('Game').players[0].x);
const pts = [{ x: pad.x + pad.w * 0.4, y: pad.y, id: 1 }, { x: fire.x, y: fire.y, id: 2 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
}
const st = await page.evaluate(() => {
  const g = window.__game.scene.getScene('Game');
  return { x: g.players[0].x, bullets: g.pBullets.countActive() };
});
await page.screenshot({ path: `${out}/touch.png` });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
console.log(`posun hráča: ${Math.round(x0)} → ${Math.round(st.x)}, striel: ${st.bullets}`);
console.log(st.x > x0 + 40 && st.bullets > 0 ? 'MULTI-TOUCH OK' : 'MULTI-TOUCH ZLYHAL');
await browser.close();

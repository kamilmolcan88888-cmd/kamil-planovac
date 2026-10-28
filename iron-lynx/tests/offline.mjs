// Test PWA offline: načíta hru, počká na service worker, odpojí sieť a znovu načíta.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload();
await page.waitForTimeout(2500);
const ok = await page.evaluate(() => !!window.__game?.scene.getScene('Boot')?.sys.settings.status);
const manifest = await page.evaluate(() => document.querySelector('link[rel=manifest]').href);
console.log(ok ? 'OFFLINE OK – hra sa načítala bez siete' : 'OFFLINE ZLYHAL', manifest);
await browser.close();

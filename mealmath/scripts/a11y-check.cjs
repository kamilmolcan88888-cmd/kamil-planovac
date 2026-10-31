// Accessibility audit (axe-core, WCAG 2 A/AA) of every screen in light and dark mode on an iPhone viewport.
// Needs a running app:  npm run build && npx vite preview --port 4173   then   npm run check:a11y
const { chromium, devices } = require('playwright');
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE_URL || 'http://localhost:4173';

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/#/home`); await page.waitForTimeout(1500);
    const skip = page.getByRole('button', { name: /Preskočiť|Skip|Überspringen/ });
    if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(3500); }
    for (const route of ['home', 'week', 'shopping', 'prices', 'settings', 'progress', 'targets']) {
      await page.goto(`${BASE}/#/${route}`); await page.waitForTimeout(1200);
      await page.evaluate(axeSrc);
      const res = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] }));
      const bad = res.violations.filter(v => v.id !== 'region');
      failures += bad.length;
      console.log(`${scheme.padEnd(5)} ${route.padEnd(9)} ${bad.length ? bad.map(v => `${v.id} (${v.nodes.length})`).join(', ') : 'OK'}`);
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(failures ? 1 : 0);
})();

// Ad-hoc debugging harness: boots the game headless and runs the snippet in scripts/debug-snippet.mjs.
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
try {
  await page.goto(`${base}?autostart=1&${process.env.QUERY ?? 'difficulty=easy&seed=1337'}`);
  await page.waitForFunction(() => window.__game && window.__game.frames > 3, null, { timeout: 180000 });
  const { default: run } = await import(`./debug-snippet.mjs?${Date.now()}`);
  await run(page);
} catch (e) {
  console.log('DEBUG ERROR', e.message);
}
await browser.close();
await server.close();

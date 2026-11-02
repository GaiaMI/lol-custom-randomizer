// Regenerates dist/og.jpg, the preview shown when the site's link is posted (Discord, X...), and the PNG icons.
// Run after scripts/build.py, from the project root:  node scripts/og_image.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const file = 'file://' + path.resolve(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, locale: 'en-US' });
  await page.goto(file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, '..', 'dist', 'og.jpg'), type: 'jpeg', quality: 82 });
  // PNG versions of the logo, for browsers and phones that don't use favicon.svg
  const svg = fs.readFileSync(path.resolve(__dirname, '..', 'dist', 'favicon.svg'), 'utf8');
  for (const [name, size] of [['favicon-48.png', 48], ['apple-touch-icon.png', 180]]) {
    const icon = await browser.newPage({ viewport: { width: size, height: size } });
    await icon.setContent(`<!doctype html><style>html,body{margin:0;background:#121426}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await icon.screenshot({ path: path.resolve(__dirname, '..', 'dist', name) });
    await icon.close();
  }
  await browser.close();
})();

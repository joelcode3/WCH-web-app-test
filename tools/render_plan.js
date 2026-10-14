/*
 * Rendert assets/platzplan.svg zu assets/platzplan.png (schneller beim Zoomen als SVG).
 * Aufruf (im Projektordner, Webserver läuft auf Port 8000):  node tools/render_plan.js
 * Benötigt Playwright (npm i -g playwright) mit Chromium.
 */
const { chromium } = require('playwright');
const path = require('path');

const SCALE = 1.5; // Auflösung relativ zur Kartengröße (iPhone-tauglich)
const PORT = process.env.PORT || 8000;

(async () => {
  const data = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'plan-data.js'), 'utf8');
  const plan = JSON.parse(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: SCALE });
  await page.goto(`http://localhost:${PORT}/assets/platzplan.svg`);
  await page.screenshot({ path: path.join(__dirname, '..', 'assets', 'platzplan.png') });
  await browser.close();
  console.log(`assets/platzplan.png geschrieben (${Math.round(plan.width * SCALE)}x${Math.round(plan.height * SCALE)})`);
})();

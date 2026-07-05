// Varredura de ângulos e zooms intermediários via __solInfo.setView
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve(process.argv[3] || 'sol-3d.html');
const out = process.argv[2];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(5000);

  const st = await page.evaluate(() => window.__solInfo.state());
  // frações do caminho entre fit (1.0) e min (0.0): zooms intermediários
  const zooms = [
    ['z100-fit', st.fitDist],
    ['z60', st.minDist + (st.fitDist - st.minDist) * 0.60],
    ['z35', st.minDist + (st.fitDist - st.minDist) * 0.35],
    ['z15', st.minDist + (st.fitDist - st.minDist) * 0.15],
  ];
  const angles = [
    ['a0', Math.PI * 0.5, Math.PI * 0.5],
    ['a1', Math.PI * 1.0, Math.PI * 0.35],
    ['a2', Math.PI * 1.5, Math.PI * 0.62],
    ['a3', Math.PI * 0.15, Math.PI * 0.5],
  ];
  for (const [zn, dist] of zooms) {
    for (const [an, th, ph] of angles) {
      await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [th, ph, dist]);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${zn}-${an}.png` });
    }
  }
  console.log(errs.length ? 'console errors: ' + errs.join(' | ') : 'sweep ok, console limpo');
  await browser.close();
  process.exitCode = errs.length ? 2 : 0;
})();

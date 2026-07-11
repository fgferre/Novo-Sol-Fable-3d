// Captura o flare/arcada NO LIMBO (comparação com ref-08 AIA131) e um
// close do disco na fase gradual. Temporário de reality-check.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const outDir = process.argv[2] || 'out/reality';
const base = 'file://' + path.resolve('dist-single/index.html');
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(420000);
  await page.goto(base + '?det=1&seed=7&hold=48&tier=high&scale=1&loops=1.0');
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
  await page.evaluate(() => {
    for (let i = 0; i < 32; i++) window.__solInfo.setLoopLife(i, 0.35);
    window.__solInfo.forceFlarePair(0);
    window.__solInfo.setFlareClock(3.5);
  });
  const frames = async (n) => {
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 420000 });
  };
  await frames(6);   // arcada traça (2 jobs/frame)
  const st = await page.evaluate(() => window.__solInfo.state());
  const fi = await page.evaluate(() => window.__solInfo.flareInfo());
  // direção do flare em mundo (tilt z antes do spin y — Euler XYZ)
  const v = fi.dir, tz = 0.1265, ry = st.rotY;
  const tx = v[0]*Math.cos(tz) - v[1]*Math.sin(tz);
  const ty = v[0]*Math.sin(tz) + v[1]*Math.cos(tz);
  const w = [tx*Math.cos(ry) + v[2]*Math.sin(ry), ty, -tx*Math.sin(ry) + v[2]*Math.cos(ry)];
  const thF = Math.atan2(w[2], w[0]);
  const phF = Math.acos(Math.max(-1, Math.min(1, w[1])));
  const dist = st.minDist + (st.fitDist - st.minDist)*0.55;
  // câmera a 90° em theta => o flare fica NO LIMBO, arcada de perfil
  await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [thF + Math.PI/2, Math.PI - phF + 0.1, dist]);
  await frames(3);
  await page.screenshot({ path: path.join(outDir, 'limb-flare-arcade.png') });
  // e o close frontal das fitas (fase gradual madura)
  await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [thF, phF, st.minDist + (st.fitDist - st.minDist)*0.28]);
  await frames(3);
  await page.screenshot({ path: path.join(outDir, 'ribbons-close.png') });
  await browser.close();
  console.log('ok');
})();

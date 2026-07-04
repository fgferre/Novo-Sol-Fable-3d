// QA de controles AAA: teclado, dblclick, drag, wheel — via __solInfo.state()
const path = require('path');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve('sol-3d.html');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const msgs = [];
  page.on('console', (m) => { if (m.type() === 'error') msgs.push(m.text()); });
  page.on('pageerror', (e) => msgs.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const st = () => page.evaluate(() => window.__solInfo.state());
  const results = [];
  const s0 = await st();

  // setas giram
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  const s1 = await st();
  results.push(['ArrowLeft gira theta', Math.abs(s1.theta - s0.theta) > 0.05]);

  // +/- zoom
  await page.keyboard.press('+');
  await page.waitForTimeout(300);
  const s2 = await st();
  results.push(['tecla + aproxima', s2.targetCamDist < s1.targetCamDist - 0.01]);
  await page.keyboard.press('-');
  await page.waitForTimeout(300);

  // dblclick alterna enquadramento
  await page.mouse.dblclick(500, 350);
  await page.waitForTimeout(400);
  const s3 = await st();
  results.push(['dblclick faz close-up', s3.targetCamDist < s0.targetCamDist * 0.8]);
  await page.mouse.dblclick(500, 350);
  await page.waitForTimeout(400);
  const s4 = await st();
  results.push(['dblclick volta ao fit', Math.abs(s4.targetCamDist - s0.targetCamDist) < 0.2]);

  // R reseta zoom
  await page.keyboard.press('+');
  await page.waitForTimeout(200);
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  const s5 = await st();
  results.push(['R reseta enquadramento', Math.abs(s5.targetCamDist - s0.targetCamDist) < 0.2]);

  // arraste com inércia continua após soltar
  await page.mouse.move(500, 350);
  await page.mouse.down();
  for (let i = 0; i < 8; i++) { await page.mouse.move(500 + i * 25, 350); await page.waitForTimeout(16); }
  await page.mouse.up();
  const s6 = await st();
  // SwiftShader roda a ~1.5fps: espera o suficiente para conter frames de rAF
  await page.waitForTimeout(2500);
  const s7 = await st();
  results.push(['inércia após soltar', Math.abs(s7.theta - s6.theta) > 0.005]);

  let fail = 0;
  for (const [name, ok] of results) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); if (!ok) fail++; }
  if (msgs.length) { console.log('console errors:'); msgs.forEach((m) => console.log(m)); fail++; }
  await browser.close();
  process.exitCode = fail ? 2 : 0;
})();

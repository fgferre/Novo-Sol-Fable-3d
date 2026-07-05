// QA de PROEMINÊNCIA em órbita: fotografa a mesma proeminência de vários
// ângulos de câmera (o cartão cruzado não pode degenerar nem "virar" com
// a câmera) e em instantes espaçados (o laço deve evoluir suavemente).
// Uso: node tools/qa-prom-orbit.js <outDir> [arquivo.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve(process.argv[3] || 'sol-3d.html');
const out = process.argv[2];

function worldDir(objDir, rotY, tiltZ) {
  const [x0, y0, z0] = objDir;
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz, z1 = z0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  return [x1 * cy + z1 * sy, y1, -x1 * sy + z1 * cy];
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(5000);

  const proms = await page.evaluate(() => window.__solInfo.prominences());
  // a mais equatorial fica visível de mais ângulos
  const anchor = proms.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a));

  async function aim(offset) {
    const st = await page.evaluate(() => window.__solInfo.state());
    const dw = worldDir(anchor, st.rotY, 0.1265);
    const th = Math.atan2(dw[2], dw[0]) - Math.PI / 2 + offset;
    await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d),
      [th, Math.PI / 2, st.fitDist * 0.8]);
    await page.waitForTimeout(500);
  }

  // 5 ângulos: perfil perfeito, ±20°, ±40° (a proeminência gira p/ dentro
  // e p/ fora do limbo; deve esmaecer contra o disco sem virar agulha)
  const angles = [['p0', 0], ['m20', -0.35], ['p20', 0.35], ['m40', -0.7], ['p40', 0.7]];
  for (const [name, off] of angles) {
    await aim(off);
    await page.screenshot({ path: `${out}/ang-${name}.png` });
  }
  // 4 instantes no MESMO ângulo de perfil, ~5s entre eles (re-mira a cada
  // frame para compensar a rotação do Sol): evolução suave do laço
  for (let i = 0; i < 4; i++) {
    await aim(0);
    await page.screenshot({ path: `${out}/time-t${i}.png` });
    if (i < 3) await page.waitForTimeout(5000);
  }
  console.log('orbita ok');
  await browser.close();
})();

// Captura dirigida por ELEMENTO usando os ganchos __solInfo:
// limb (disco frontal), spot (região ativa centrada), prom (proeminência
// no limbo), fibril (zoom máximo no centro do disco)
const path = require('path');
const { chromium } = require('playwright');
// 2º argumento opcional: HTML alternativo (cópias instrumentadas de debug)
const url = 'file://' + path.resolve(process.argv[3] || 'sol-3d.html');
const out = process.argv[2];

function worldDir(objDir, rotY, tiltZ) {
  // três.js Euler XYZ: mundo = Ry(rotY) * Rz(tiltZ) * obj
  const [x0, y0, z0] = objDir;
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz, z1 = z0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  return [x1 * cy + z1 * sy, y1, -x1 * sy + z1 * cy];
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(6000);

  // A+D: disco frontal no enquadramento padrão (limbo + espículas + filamentos).
  // A COROA é desligada só nesta captura: os gates A (escurecimento de
  // limbo) e D (franja de espículas) medem a superfície, e o halo coronal
  // legítimo (T1.3) contamina ambos — o brilho além do limbo vira "franja"
  // e o bloom do halo apaga o escurecimento (validado: com coroa off,
  // A=0.77 e D=4.0px nos mesmos frames em que falhavam com halo).
  await page.evaluate(() => window.__solInfo.toggle && window.__solInfo.toggle('corona', false));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/element-limb.png' });
  await page.evaluate(() => window.__solInfo.toggle && window.__solInfo.toggle('corona', true));

  // B: região ativa mais forte, centrada, close
  let st = await page.evaluate(() => window.__solInfo.state());
  const regions = await page.evaluate(() => window.__solInfo.regions());
  let best = regions.reduce((a, b) => (Math.abs(b.w) > Math.abs(a.w) ? b : a));
  let ld = best.lead; const ll = Math.hypot(ld[0], ld[1], ld[2]);
  let dw = worldDir([ld[0] / ll, ld[1] / ll, ld[2] / ll], st.rotY, 0.1265);
  let th = Math.atan2(dw[2], dw[0]), ph = Math.acos(dw[1]);
  await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [th, ph, st.minDist * 1.35]);
  await page.waitForTimeout(900);
  // re-centra (o sol girou um pouco) e fotografa
  st = await page.evaluate(() => window.__solInfo.state());
  dw = worldDir([ld[0] / ll, ld[1] / ll, ld[2] / ll], st.rotY, 0.1265);
  th = Math.atan2(dw[2], dw[0]); ph = Math.acos(dw[1]);
  await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [th, ph, st.minDist * 1.35]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/element-spot.png' });

  // E: proeminência no limbo (âncora mais equatorial, câmera a 90°)
  const proms = await page.evaluate(() => window.__solInfo.prominences());
  st = await page.evaluate(() => window.__solInfo.state());
  let bestP = proms.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a));
  dw = worldDir(bestP, st.rotY, 0.1265);
  th = Math.atan2(dw[2], dw[0]) - Math.PI / 2;
  await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [th, Math.PI / 2, st.fitDist * 0.85]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '/element-prom.png' });

  // F: fibrilas em zoom máximo, centro do disco
  st = await page.evaluate(() => window.__solInfo.state());
  await page.evaluate(([d]) => window.__solInfo.setView(Math.PI * 0.62, Math.PI * 0.42, d), [st.minDist * 1.02]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + '/element-fibril.png' });

  console.log('capturas ok');
  await browser.close();
})();

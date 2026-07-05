// QA de MOVIMENTO: captura a mesma vista em instantes espaçados.
// Junto com tools/motion-check.py valida que (1) o Sol evolui de verdade
// (rotação + convecção + vida das regiões) e (2) sem "pop"/flicker.
// Uso: node tools/qa-motion.js <outDir> [arquivo.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve(process.argv[3] || 'sol-3d.html');
const out = process.argv[2];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(5000);

  // vista fixa (sem auto-rotação de câmera interferir: reposiciona antes
  // de cada frame para isolar o movimento DO SOL, não da câmera)
  const st = await page.evaluate(() => window.__solInfo.state());
  const rots = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(([d]) => window.__solInfo.setView(Math.PI * 0.5, Math.PI * 0.5, d), [st.fitDist * 0.75]);
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => window.__solInfo.state());
    rots.push(s.rotY);
    await page.screenshot({ path: `${out}/t${i}.png` });
    if (i < 3) await page.waitForTimeout(6000);
  }
  // rotação precisa avançar monotonicamente (o Sol gira sozinho)
  const dr = rots.slice(1).map((r, i) => r - rots[i]);
  const rotOk = dr.every((d) => d > 1e-4);
  console.log((rotOk ? 'PASS' : 'FAIL') + '  rotacao avanca -> ' + dr.map((d) => d.toFixed(4)).join(', '));
  await browser.close();
  process.exitCode = rotOk ? 0 : 2;
})();

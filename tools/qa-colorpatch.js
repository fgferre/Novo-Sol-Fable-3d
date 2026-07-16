// QA numérico da conversão Linear-sRGB→sRGB (achado 4 / PR 11).
// Carrega o build com ?colorpatch=1: o composite escreve quadrantes de
// cinza LINEAR conhecido por cima do frame graduado, atravessando SÓ a
// OETF final. Lê os bytes do PNG e valida:
//   sup-esq  0.18      → 118±1  (sRGB 0.4614)
//   sup-dir  0.0031308 → 10±1   (fim do ramo linear, 12.92·V)
//   inf-esq  0.0       → 0
//   inf-dir  1.0       → 255
// Falhas nomeadas: ≈46 no 0.18 = SEM conversão (linear cru no canvas);
// ≈181 no 0.18 = conversão DUPLA (OETF aplicada duas vezes).
// Uso: node tools/qa-colorpatch.js [dist-single/index.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const htmlFile = process.argv[2] || 'dist-single/index.html';
const url = 'file://' + path.resolve(htmlFile) + '?det=1&seed=7&hold=4&tier=low&scale=1&colorpatch=1';

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let fail = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(120000);
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 4, null, { timeout: 120000 });
    // o overlay #loading (fixed, fundo #000) desvanece em 0.7s — esperar a
    // opacidade computada chegar a 0, senão o screenshot lê o frame escurecido
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return !el || getComputedStyle(el).opacity === '0';
    }, null, { timeout: 60000 });
    const buf = await page.screenshot();
    await page.close();
    const png = PNG.sync.read(buf);

    // mediana de um bloco 9x9 (robusta a overlays de UI como o #hint)
    function median9(fx, fy) {
      const cx = Math.round(png.width * fx), cy = Math.round(png.height * fy);
      const vals = [];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const i = ((cy + dy) * png.width + (cx + dx)) * 4;
        vals.push(png.data[i]); // R (patch é cinza: R=G=B)
      }
      vals.sort((a, b) => a - b);
      return vals[(vals.length - 1) >> 1];
    }
    // quadrantes: vUv.y>=0.5 = topo do PNG; vUv.x<0.5 = esquerda
    const q18 = median9(0.30, 0.30);   // 0.18 linear
    const qLo = median9(0.70, 0.30);   // 0.0031308 linear
    const qZ  = median9(0.30, 0.70);   // 0.0
    const qFs = median9(0.70, 0.70);   // 1.0

    console.log(`lido: 0.18→${q18}  0.0031308→${qLo}  0→${qZ}  1→${qFs}`);
    function check(name, got, want, tol) {
      const ok = Math.abs(got - want) <= tol;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${got} (esperado ${want}±${tol})`);
      if (!ok) fail++;
    }
    check('cinza 0.18 → 118', q18, 118, 1);
    check('0.0031308 → 10', qLo, 10, 1);
    check('preto 0 → 0', qZ, 0, 0);
    check('branco 1 → 255', qFs, 255, 0);
    if (Math.abs(q18 - 46) <= 3) { console.log('FAIL  0.18 lido ≈46: OETF AUSENTE (linear cru no canvas)'); fail++; }
    if (Math.abs(q18 - 181) <= 3) { console.log('FAIL  0.18 lido ≈181: conversão DUPLA (OETF aplicada 2×)'); fail++; }
    if (errs.length) { console.log('console errors:'); errs.forEach((e) => console.log(e)); fail++; }
  } finally {
    await browser.close();
  }
  console.log(fail ? `colorpatch FALHOU (${fail})` : 'colorpatch ok: OETF sRGB única confirmada');
  process.exitCode = fail ? 2 : 0;
})();

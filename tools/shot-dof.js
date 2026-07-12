#!/usr/bin/env node
// Smoke visual do foco raso hexagonal (FASE 5): close-up com dof
// ligado vs desligado, e prova de que em FIT o knob não muda nada.
// Uso: node tools/shot-dof.js outDir [--file dist-single/index.html]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const outDir = process.argv[2] || 'out/shot-dof';
let htmlFile = 'dist-single/index.html';
const fi = process.argv.indexOf('--file');
if (fi > 0) htmlFile = process.argv[fi + 1];
fs.mkdirSync(outDir, { recursive: true });

function readPNG(p){ return PNG.sync.read(fs.readFileSync(p)); }
function diffPx(a, b){
  const A = readPNG(a), B = readPNG(b);
  if (A.width !== B.width || A.height !== B.height) return -1;
  return pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.1 });
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];

  async function shot(q, view, name){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto('file://' + path.resolve(htmlFile) + '?det=1&seed=7&hold=48&tier=high&scale=1' + q);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    if (view){
      await page.evaluate(v => window.__solInfo.setView(v[0], v[1], v[2]), view);
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction(f => window.__solInfo.frame > f, f0 + 4, { timeout: 420000 });
    }
    const info = await page.evaluate(() => window.__solInfo.dofInfo ? window.__solInfo.dofInfo() : null);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    await page.close();
    return info;
  }

  // close-up: perto do minDist (3.3) mirando uma região com estrutura
  const closeView = [Math.PI * 1.0, Math.PI * 0.42, 3.9];
  const i0 = await shot('', closeView, 'close-off');
  const i1 = await shot('&dof=1.0', closeView, 'close-dof');
  const i2 = await shot('&dof=1.0&look=sunshine', closeView, 'close-dof-sunshine');
  console.log('close off:', JSON.stringify(i0));
  console.log('close dof:', JSON.stringify(i1));

  // fit: dof ligado NÃO pode mudar o enquadramento aberto
  const f0 = await shot('', null, 'fit-off');
  const f1 = await shot('&dof=1.0', null, 'fit-dof');
  const dClose = diffPx(path.join(outDir, 'close-off.png'), path.join(outDir, 'close-dof.png'));
  const dFit = diffPx(path.join(outDir, 'fit-off.png'), path.join(outDir, 'fit-dof.png'));
  console.log('diff close on/off =', dClose, 'px (deve ser ALTO)');
  console.log('diff fit on/off   =', dFit, 'px (deve ser ~0)');
  console.log('erros de página:', errs.length ? errs : 'nenhum');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();

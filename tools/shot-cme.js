#!/usr/bin/env node
// Smoke visual do CME (FASE 5): força a erupção num par, salta o
// relógio para 3 fases (rise/impulsiva/cruzeiro) e fotografa no limbo
// e de frente (Thomson). Determinístico (?det=1&seed=7&hold alto).
// Uso: node tools/shot-cme.js outDir [--file dist-single/index.html]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = process.argv[2] || 'out/shot-cme';
let htmlFile = 'dist-single/index.html';
const fi = process.argv.indexOf('--file');
if (fi > 0) htmlFile = process.argv[fi + 1];
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(420000);
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const base = 'file://' + path.resolve(htmlFile);
  await page.goto(base + '?det=1&seed=7&hold=90&tier=high&scale=1&cme=1.1');
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 8, null, { timeout: 420000 });

  // dispara a CME no par 0 e espera o hold congelar (~1.4s de sim ao
  // vivo: as partículas ficam perto da base em todas as fotos — o
  // relógio da CASCA salta livre via setCmeClock, forma fechada)
  const dir = await page.evaluate(() => window.__solInfo.forceCME(0));
  console.log('forceCME dir =', JSON.stringify(dir));
  await page.waitForFunction(() => window.__solInfo.frame > 93, null, { timeout: 420000 });

  async function frames(n){
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction(f => window.__solInfo.frame > f, f0 + n, { timeout: 420000 });
  }

  // vista de LIMBO: câmera perpendicular à direção do evento
  const st = await page.evaluate(() => window.__solInfo.state());
  const w = await page.evaluate(() => {
    const i = window.__solInfo.cmeInfo();
    return i.dir;
  });
  // ângulos que colocam o evento no limbo: theta do evento + ~90°
  const thEvent = Math.atan2(w[2], w[0]);
  const phEvent = Math.acos(Math.max(-1, Math.min(1, w[1])));
  await page.evaluate(([th, ph, d]) => window.__solInfo.setView(th, ph, d),
    [thEvent + Math.PI / 2, Math.PI / 2, st.fitDist * 1.25]);

  for (const [name, t] of [['rise', 0.8], ['impulsiva', 2.6], ['cruzeiro', 6.5]]) {
    await page.evaluate(t2 => window.__solInfo.setCmeClock(t2), t);
    await frames(3);
    const info = await page.evaluate(() => window.__solInfo.cmeInfo());
    console.log(`t=${t}s front=${info.front} rho=${info.rho} env=${info.env} hdr=${info.hdr}`);
    await page.screenshot({ path: path.join(outDir, `cme-limbo-${name}.png`) });
  }

  // vista FRONTAL (halo): Thomson deve atenuar
  await page.evaluate(([th, ph, d]) => window.__solInfo.setView(th, ph, d),
    [thEvent, phEvent, st.fitDist * 1.25]);
  await page.evaluate(() => window.__solInfo.setCmeClock(6.5));
  await frames(3);
  const infoF = await page.evaluate(() => window.__solInfo.cmeInfo());
  console.log(`frontal t=6.5 hdr=${infoF.hdr}`);
  await page.screenshot({ path: path.join(outDir, 'cme-frontal-cruzeiro.png') });

  // A/B: desliga o knob ao vivo — a casca deve sumir
  await page.evaluate(() => { window.__solInfo.toggle('cme', false); });
  await frames(3);
  await page.screenshot({ path: path.join(outDir, 'cme-limbo-off.png') });

  console.log('erros de página:', errs.length ? errs : 'nenhum');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();

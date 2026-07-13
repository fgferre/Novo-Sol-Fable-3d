#!/usr/bin/env node
// Sweep de calibração B2 (FASE 6) para o painel de 3 juízes — SEM
// rebuild: 1 página por VISTA, variantes via setCvolShape ao vivo.
//   plumas : plume ∈ [0, 0.3, 0.6, 0.9, 1.2] em vista polar/mínimo
//            (buracos abertos; plume é UNIFORM — sem rebake) — 5 stills
//   cúspide: cusp ∈ [0, 0.3, 0.6, 0.9] × folha {v1: sheet .85/base .30,
//            v2: sheet 1.15/base .20} em wide equatorial/fase média
//            (cusp é peso do BAKE — rebakeCorona por variante) — 8 stills
//   conjunto candidato (plume .6 / cusp .6 / folha v2): fase média e
//            mínimo, wide estilo eclipse total — 2 stills
// Estado saltado: hold=90; setCyclePhase CEDO (o bake da cromosfera
// absorve a fase até o freeze) e rebakeCorona PÓS-freeze — o rebake
// pós-freeze mata o ciclo de bake fatiado em voo, cujo upload (~frame
// 118) revertia o volume para as cargas pré-salto no meio da grade
// (medido na calibração B2). cvol=0.5 (o preset — o painel julga o
// look shipped). Sem julgamento aqui.
// Uso: node tools/sweep-cvol2.js [outDir] [--file dist-single/index.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/sweep-cvol2';
const htmlFile = argOf('--file', 'dist-single/index.html');
const base = 'file://' + path.resolve(htmlFile);

const FOLHAS = { v1: { sheet: 0.85, base: 0.30 }, v2: { sheet: 1.15, base: 0.20 } };

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {};
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function openWide(phase){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(600000);
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(base + '?det=1&seed=7&hold=90&tier=high&scale=1&cvol=0.5&cycle=1');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 600000 });
    // salto CEDO (chromo absorve a fase nova até o freeze no frame 90)...
    await page.evaluate((p) => window.__solInfo.setCyclePhase(p, true), phase);
    await page.waitForFunction(() => window.__solInfo.frame > 93, null, { timeout: 600000 });
    // ...rebake PÓS-freeze: mata o ciclo fatiado em voo e congela o
    // volume da fase saltada para TODA a grade de variantes
    await page.evaluate(() => {
      window.__solInfo.rebakeCorona();
      const st = window.__solInfo.state();
      window.__solInfo.setView(0.8, Math.PI * 0.5, st.fitDist * 1.5);
    });
    await frames(page, 2);
    return page;
  }
  async function frames(page, n){
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 600000 });
  }
  async function shot(page, name, meta){
    await page.screenshot({ path: path.join(outDir, name) });
    manifest[name] = meta;
    console.log('shot', name, JSON.stringify(meta));
  }

  // --- plumas: vista polar/mínimo, plume é uniform (sem rebake) ---------
  {
    const page = await openWide(0.02);
    for (const v of [0, 0.3, 0.6, 0.9, 1.2]){
      await page.evaluate((x) => window.__solInfo.setCvolShape({ plume: x }), v);
      await frames(page, 2);
      await shot(page, `plume-${v.toFixed(2)}-polar-min.png`,
        { plume: v, cusp: 0, folha: 'v1 (default .85/.30)', vista: 'wide equatorial 1.5x fit',
          fase: 'mínimo (0.02 — buracos polares abertos)', ref: 'ref-09 (plumas finas/retas), ref-11 (buraco)' });
    }
    // conjunto candidato no mínimo (reusa a página: plume+cusp+folha v2)
    await page.evaluate((f) => {
      window.__solInfo.setCvolShape({ plume: 0.6, cusp: 0.6, sheet: f.sheet, base: f.base });
      window.__solInfo.rebakeCorona();
    }, FOLHAS.v2);
    await frames(page, 2);
    await shot(page, 'candidato-min.png',
      { plume: 0.6, cusp: 0.6, folha: 'v2 (1.15/.20)', vista: 'wide equatorial 1.5x fit',
        fase: 'mínimo (0.02)', ref: 'ref-09 (eclipse: cinturão + plumas polares)' });
    await page.close();
  }

  // --- cúspide: wide equatorial fase média, cusp×folha (rebake) ---------
  {
    const page = await openWide(0.25);
    for (const fname of ['v1', 'v2']){
      for (const c of [0, 0.3, 0.6, 0.9]){
        await page.evaluate((o) => {
          window.__solInfo.setCvolShape(o);
          window.__solInfo.rebakeCorona();
        }, { cusp: c, sheet: FOLHAS[fname].sheet, base: FOLHAS[fname].base, plume: 0 });
        await frames(page, 2);
        await shot(page, `cusp-${c.toFixed(2)}-folha-${fname}-media.png`,
          { plume: 0, cusp: c, folha: `${fname} (${FOLHAS[fname].sheet}/${FOLHAS[fname].base})`,
            vista: 'wide equatorial 1.5x fit', fase: 'média (0.25)',
            ref: 'ref-10 (cúspide→haste), ref-12 (pétalas)' });
      }
    }
    // conjunto candidato na fase média
    await page.evaluate((f) => {
      window.__solInfo.setCvolShape({ plume: 0.6, cusp: 0.6, sheet: f.sheet, base: f.base });
      window.__solInfo.rebakeCorona();
    }, FOLHAS.v2);
    await frames(page, 2);
    await shot(page, 'candidato-media.png',
      { plume: 0.6, cusp: 0.6, folha: 'v2 (1.15/.20)', vista: 'wide equatorial 1.5x fit',
        fase: 'média (0.25)', ref: 'ref-12 (eclipse total, pétalas com cúspide)' });
    await page.close();
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('manifest.json escrito em', outDir);
  await browser.close();
})();

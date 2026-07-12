#!/usr/bin/env node
// A/B de GPU por tier do CME (FASE 5): frame p95 com o evento no PIOR
// caso (casca no cruzeiro + partículas vivas, vista de limbo) vs sem o
// desenho (toggles cme/cmepts off), no SwiftShader — render por
// software é o limite SUPERIOR do custo relativo (GPUs reais executam
// o loop de amostras muito melhor). Também mede busy (CPU do corpo).
// Uso: node tools/perf-cme.js [--file dist-single/index.html]
const { chromium } = require('playwright');
const path = require('path');

let htmlFile = 'dist-single/index.html';
const fi = process.argv.indexOf('--file');
if (fi > 0) htmlFile = process.argv[fi + 1];
const base = 'file://' + path.resolve(htmlFile);

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function measure(tier){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(600000);
    // det SEM hold: o relógio corre (o evento é episódico — medir com o
    // relógio congelado seria o custo de UM instante, não do evento)
    await page.goto(base + `?det=1&seed=7&tier=${tier}&scale=1&cme=1.1`);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 10, null, { timeout: 600000 });
    async function frames(n){
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 600000 });
    }
    // ON: erupção viva, câmera no limbo do evento, relógio no meio do
    // evento (o setCmeClock reposiciona; o relógio segue correndo)
    await page.evaluate(() => window.__solInfo.forceCME(0));
    await frames(2);
    await page.evaluate(() => {
      const st = window.__solInfo.state();
      const d = window.__solInfo.cmeInfo().dir;
      const th = Math.atan2(d[2], d[0]);
      window.__solInfo.setView(th + Math.PI/2, Math.PI*0.5, st.fitDist*1.35);
      window.__solInfo.setCmeClock(3.0);
      window.__solInfo.perfReset();
    });
    await frames(45);
    const on = await page.evaluate(() => window.__solInfo.perf());
    const ciOn = await page.evaluate(() => window.__solInfo.cmeInfo());
    // OFF: mesmos estados, sem o desenho da casca/partículas
    await page.evaluate(() => {
      window.__solInfo.toggle('cme', false);
      window.__solInfo.toggle('cmepts', false);
      window.__solInfo.setCmeClock(3.0);
      window.__solInfo.perfReset();
    });
    await frames(45);
    const off = await page.evaluate(() => window.__solInfo.perf());
    await page.close();
    return { tier, steps: ciOn.steps, ptsN: ciOn.pts.n, cmeOnDuring: ciOn.on,
      on: { p95: on.ms.p95, avg: on.ms.avg, busyP95: on.busy.p95, calls: on.calls },
      off: { p95: off.ms.p95, avg: off.ms.avg, busyP95: off.busy.p95, calls: off.calls } };
  }

  for (const tier of ['mid', 'high', 'ultra']){
    const r = await measure(tier);
    const ratio = r.off.p95 > 0 ? (r.on.p95 / r.off.p95) : 0;
    console.log(`${r.tier}\tsteps=${r.steps}\tpts=${r.ptsN}\t` +
      `frame p95 on/off = ${r.on.p95} / ${r.off.p95} ms\tratio ×${ratio.toFixed(3)}\t` +
      `busy p95 on/off = ${r.on.busyP95} / ${r.off.busyP95} ms\tcalls ${r.on.calls}/${r.off.calls}`);
  }
  await browser.close();
})();

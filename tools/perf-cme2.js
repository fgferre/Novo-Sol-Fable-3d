#!/usr/bin/env node
// A/B de GPU por tier do B3 (FASE 6): pesos de forma do CME LIGADOS
// (candidatos calibrados stria=0.8/cav=0.85) vs pesos 0, com o MESMO evento vivo
// na vista de limbo — isola o custo da coordenada helicoidal (atan/
// sincos/fbm por amostra do rim, com early-out onde shell*fade<=1e-4)
// e do gate de cavidade (por RAIO, ~zero). Padrão perf-cme.js: det SEM
// hold (evento episódico precisa do relógio), setCmeClock(3.0) alinha
// a fase nas duas medições, WARMUP de 12 frames com o efeito já
// desenhando antes do perfReset (lição F5: a 1ª medição paga compile
// de pipeline do SwiftShader). SwiftShader = limite SUPERIOR do custo
// relativo — só RAZÕES valem; medição 2x por tier (regra audit-loop5:
// variância entre rodadas chega a 1.8x).
// Uso: node tools/perf-cme2.js [--file dist-single/index.html] [--runs 2]
const { chromium } = require('playwright');
const path = require('path');

function argOf(f, d){ const i = process.argv.indexOf(f); return i > -1 ? process.argv[i+1] : d; }
const htmlFile = argOf('--file', 'dist-single/index.html');
const RUNS = +argOf('--runs', 2);
const base = 'file://' + path.resolve(htmlFile);

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function measure(tier){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(900000);
    await page.goto(base + `?det=1&seed=7&tier=${tier}&scale=1&cme=1.1`);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 10, null, { timeout: 900000 });
    async function frames(n){
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 900000 });
    }
    await page.evaluate(() => window.__solInfo.forceCME(0));
    await frames(2);
    // ON: pesos candidatos, câmera no limbo, relógio no meio do evento
    await page.evaluate(() => {
      const st = window.__solInfo.state();
      const d = window.__solInfo.cmeInfo().dir;
      const th = Math.atan2(d[2], d[0]);
      window.__solInfo.setView(th + Math.PI/2, Math.PI*0.5, st.fitDist*1.35);
      window.__solInfo.setCmeShape({ stria: 0.8, cav: 0.85 });
      window.__solInfo.setCmeClock(3.0);
    });
    await frames(12);   // warmup: efeito desenhando ANTES do perfReset
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const on = await page.evaluate(() => window.__solInfo.perf());
    const ciOn = await page.evaluate(() => window.__solInfo.cmeInfo());
    // OFF: pesos 0 (mesma casca da F5), mesma fase do evento
    await page.evaluate(() => {
      window.__solInfo.setCmeShape({ stria: 0, cav: 0 });
      window.__solInfo.setCmeClock(3.0);
    });
    await frames(4);
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const off = await page.evaluate(() => window.__solInfo.perf());
    await page.close();
    return { tier, steps: ciOn.steps, stria: ciOn.stria, cav: ciOn.cav,
      on: { p95: on.ms.p95, avg: on.ms.avg, busyP95: on.busy.p95 },
      off: { p95: off.ms.p95, avg: off.ms.avg, busyP95: off.busy.p95 } };
  }

  for (const tier of ['mid', 'high']){
    for (let run = 1; run <= RUNS; run++){
      const r = await measure(tier);
      const ratio = r.off.p95 > 0 ? (r.on.p95 / r.off.p95) : 0;
      const ratioAvg = r.off.avg > 0 ? (r.on.avg / r.off.avg) : 0;
      console.log(`${r.tier}\trun${run}\tsteps=${r.steps}\t` +
        `frame p95 on/off = ${r.on.p95} / ${r.off.p95} ms\tratio ×${ratio.toFixed(3)}\t` +
        `avg on/off = ${r.on.avg} / ${r.off.avg} ms\tratio-avg ×${ratioAvg.toFixed(3)}\t` +
        `busy p95 on/off = ${r.on.busyP95} / ${r.off.busyP95} ms`);
    }
  }
  await browser.close();
})();

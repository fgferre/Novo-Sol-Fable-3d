#!/usr/bin/env node
// A/B de GPU por tier do knob `spots` (FASE 6 B1): frame p95 no PIOR
// caso (máximo do ciclo — 10 slots vivos —, disco enchendo a tela)
// spots=1.0 vs spots=0 (setSpots ao vivo: mesmo shader, gate uniforme
// desliga o loop — o A/B mede só o custo do loop+recalibração). No
// SwiftShader: render por software é o limite SUPERIOR do custo
// relativo — só a RAZÃO vale, nunca ms absolutos (protocolo F4/F5).
// Warmup >=12 frames com o efeito JÁ DESENHANDO antes do perfReset
// (lição F5: a 1ª medição paga compile de pipeline).
// Uso: node tools/perf-spots.js [--file dist-single/index.html]
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
    // det SEM hold (relógio a 1/60 fixo): o lifecycle das manchas roda
    // como em produção; spots=1.0 desde a carga => o shader com o loop
    // é o compilado da página (setSpots(0) não recompila nada)
    await page.goto(base + `?det=1&seed=7&tier=${tier}&scale=1&cycle=1&spots=1.0`);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 10, null, { timeout: 600000 });
    async function frames(n){
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 600000 });
    }
    // pior caso: máximo do ciclo (todos os slots elegíveis) + close-up
    // (o loop roda por PIXEL do disco — disco cheio = mais fragmentos)
    await page.evaluate(() => {
      window.__solInfo.setCyclePhase(0.5, true);
      const st = window.__solInfo.state();
      window.__solInfo.setView(Math.PI*0.5, Math.PI*0.5, st.fitDist*0.62);
    });
    await frames(12);   // warmup: compile de pipeline + estado assentado
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const on = await page.evaluate(() => window.__solInfo.perf());
    const si = await page.evaluate(() => window.__solInfo.spotsInfo());
    // OFF: mesmo estado/câmera, gate uniforme a zero
    await page.evaluate(() => window.__solInfo.setSpots(0));
    await frames(5);
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const off = await page.evaluate(() => window.__solInfo.perf());
    await page.close();
    return { tier, nSpots: si.n,
      on: { p95: on.ms.p95, avg: on.ms.avg, busyP95: on.busy.p95, calls: on.calls },
      off: { p95: off.ms.p95, avg: off.ms.avg, busyP95: off.busy.p95, calls: off.calls } };
  }

  for (const tier of ['mid', 'high']){
    const r = await measure(tier);
    const ratio = r.off.p95 > 0 ? (r.on.p95 / r.off.p95) : 0;
    console.log(`${r.tier}\tspots vivos=${r.nSpots}\t` +
      `frame p95 on/off = ${r.on.p95} / ${r.off.p95} ms\tratio ×${ratio.toFixed(3)}\t` +
      `avg on/off = ${r.on.avg} / ${r.off.avg} ms\t` +
      `busy p95 on/off = ${r.on.busyP95} / ${r.off.busyP95} ms\tcalls ${r.on.calls}/${r.off.calls}`);
  }
  await browser.close();
})();

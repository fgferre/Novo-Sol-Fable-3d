#!/usr/bin/env node
// A/B de GPU por tier dos pesos B2 (FASE 6): frame p95 do look cvol=0.5
// com pesos novos ligados (plume=0.9 + cusp=0.6) vs pesos 0, tiers mid e
// high. Pior caso das plumas: mínimo do ciclo (buracos polares grandes =
// mais pixels no gate) em vista wide (mais céu-coroa na tela). cusp não
// tem custo de runtime (só muda valores bakeados) — o A/B mede o bloco
// por-pixel das plumas. No SwiftShader só a RAZÃO vale (protocolo F4/F5);
// warmup >=12 frames com o efeito JÁ DESENHANDO antes do perfReset
// (lição F5: a 1ª medição paga compile de pipeline). det SEM hold.
// Uso: node tools/perf-cvol2.js [--file dist-single/index.html]
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
    await page.goto(base + `?det=1&seed=7&tier=${tier}&scale=1&cycle=1&cvol=0.5`);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 10, null, { timeout: 600000 });
    async function frames(n){
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 600000 });
    }
    // PR2: rebake assíncrono — espera a publicação do ciclo-alvo antes
    // de medir (a medição "on" precisa do volume desenhando)
    async function waitCycle(t){
      await page.waitForFunction((tc) => window.__solInfo.coronaInfo().cycles >= tc, t, { timeout: 600000 });
    }
    // mínimo do ciclo (buracos abertos) + vista wide + pesos ON
    const tcOn = await page.evaluate(() => {
      window.__solInfo.setCyclePhase(0.02, true);
      window.__solInfo.setCvolShape({ plume: 0.9, cusp: 0.6 });
      const st = window.__solInfo.state();
      window.__solInfo.setView(0.8, Math.PI * 0.5, st.fitDist * 1.5);
      return window.__solInfo.rebakeCorona().targetCycle;
    });
    await waitCycle(tcOn);
    await frames(12);   // warmup: compile de pipeline + estado assentado
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const on = await page.evaluate(() => window.__solInfo.perf());
    const ci = await page.evaluate(() => window.__solInfo.coronaInfo());
    // OFF: mesmos estado/câmera, pesos a zero (uPlume=0 pula o bloco;
    // cusp=0 + rebake volta a folha da F4)
    const tcOff = await page.evaluate(() => {
      window.__solInfo.setCvolShape({ plume: 0, cusp: 0 });
      return window.__solInfo.rebakeCorona().targetCycle;
    });
    await waitCycle(tcOff);
    await frames(5);
    await page.evaluate(() => window.__solInfo.perfReset());
    await frames(45);
    const off = await page.evaluate(() => window.__solInfo.perf());
    await page.close();
    return { tier, steps: ci.steps,
      on: { p95: on.ms.p95, avg: on.ms.avg, busyP95: on.busy.p95, calls: on.calls },
      off: { p95: off.ms.p95, avg: off.ms.avg, busyP95: off.busy.p95, calls: off.calls } };
  }

  for (const tier of ['mid', 'high']){
    const r = await measure(tier);
    const ratio = r.off.p95 > 0 ? (r.on.p95 / r.off.p95) : 0;
    console.log(`${r.tier}\tsteps=${r.steps}\t` +
      `frame p95 on/off = ${r.on.p95} / ${r.off.p95} ms\tratio ×${ratio.toFixed(3)}\t` +
      `avg on/off = ${r.on.avg} / ${r.off.avg} ms\t` +
      `busy p95 on/off = ${r.on.busyP95} / ${r.off.busyP95} ms\tcalls ${r.on.calls}/${r.off.calls}`);
  }
  await browser.close();
})();

#!/usr/bin/env node
// Sweep de calibração do knob `spots` (FASE 6 B1) para o painel de 3
// juízes — SEM rebuild: 1 página por vista, variantes via setSpots ao
// vivo. Grade: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5] × 2 vistas (fit +
// close-up da banda ativa) na fase de MÁXIMO do ciclo (estado saltado:
// hold=90, setCyclePhase(0.5,true) ANTES do congelamento para o bake
// absorver as regiões novas) + par de referência espelhando ref-06/07
// (fit no máximo, num nível médio e no mínimo, spots=1.0) + 1 close
// EXTREMO em spots=1.5 mirando o líder VIRTUAL mais forte (B1-fix:
// grupos agora nascem LONGE das regiões reais — a vista do grupo real
// não mostra a morfologia virtual de perto).
// Gera manifest.json (arquivo -> {spots, vista, fase}).
// Uso: node tools/sweep-spots.js [outDir] [--file dist-single/index.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/sweep-spots';
const htmlFile = argOf('--file', 'dist-single/index.html');
const base = 'file://' + path.resolve(htmlFile);
const VALUES = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {};
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  async function openAtPhase(phase){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(600000);
    page.on('pageerror', (e) => console.error('pageerror:', e.message));
    await page.goto(base + '?det=1&seed=7&hold=90&tier=high&scale=1&cycle=1');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 600000 });
    // estado saltado: fase + reseed ANTES do freeze (frame 90) — o bake
    // da cromosfera (~8Hz) absorve plage/colares das regiões novas
    await page.evaluate((p) => window.__solInfo.setCyclePhase(p, true), phase);
    await page.waitForFunction(() => window.__solInfo.frame > 93, null, { timeout: 600000 });
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
  // mira a banda ativa: aponta a câmera para o líder REAL mais forte
  // (objeto -> mundo: tilt z=0.1265 ANTES do rotY, Euler XYZ — padrão
  // qa-phase3). Necessário nas DUAS vistas: o sorteio de longitudes
  // pode deixar todas as regiões no lado oculto da vista default
  // (medido no seed 7/fase 0.5). Mirar sob freeze é seguro: o bake é
  // em espaço do objeto. distK: 1.0 = fit (disco inteiro), <1 = close.
  async function aimActiveBand(page, distK){
    await page.evaluate((dk) => {
      const st = window.__solInfo.state();
      const regs = window.__solInfo.regions();
      let bi = 0;
      for (let i = 1; i < regs.length; i++) if (Math.abs(regs[i].w) > Math.abs(regs[bi].w)) bi = i;
      const v = regs[bi].lead, tz = 0.1265, ry = st.rotY;
      const n = Math.hypot(v[0], v[1], v[2]) || 1;
      const p = [v[0]/n, v[1]/n, v[2]/n];
      const tx = p[0]*Math.cos(tz) - p[1]*Math.sin(tz);
      const ty = p[0]*Math.sin(tz) + p[1]*Math.cos(tz);
      const w = [tx*Math.cos(ry) + p[2]*Math.sin(ry), ty,
                 -tx*Math.sin(ry) + p[2]*Math.cos(ry)];
      const th = Math.atan2(w[2], w[0]);
      const ph = Math.acos(Math.max(-1, Math.min(1, w[1])));
      const dist = (dk >= 1) ? st.fitDist
                 : st.minDist + (st.fitDist - st.minDist)*dk;
      window.__solInfo.setView(th, ph, dist);
    }, distK);
    await frames(page, 3);
  }

  // mira o líder VIRTUAL mais forte (mesma conversão objeto->mundo do
  // aimActiveBand; slots dão lat/lon em graus no espaço do objeto).
  // Fallback: banda real, se nenhum slot virtual estiver vivo.
  async function aimStrongVirtual(page, distK){
    const ok = await page.evaluate((dk) => {
      const st = window.__solInfo.state();
      const si = window.__solInfo.spotsInfo();
      let best = null;
      si.slots.forEach((s) => {
        if (s.on && s.lead && (!best || s.r > best.r)) best = s;
      });
      if (!best) return false;
      const la = best.lat*Math.PI/180, lo = best.lon*Math.PI/180;
      const p = [Math.cos(la)*Math.cos(lo), Math.sin(la), Math.cos(la)*Math.sin(lo)];
      const tz = 0.1265, ry = st.rotY;
      const tx = p[0]*Math.cos(tz) - p[1]*Math.sin(tz);
      const ty = p[0]*Math.sin(tz) + p[1]*Math.cos(tz);
      const w = [tx*Math.cos(ry) + p[2]*Math.sin(ry), ty,
                 -tx*Math.sin(ry) + p[2]*Math.cos(ry)];
      const th = Math.atan2(w[2], w[0]);
      const ph = Math.acos(Math.max(-1, Math.min(1, w[1])));
      window.__solInfo.setView(th, ph, st.minDist + (st.fitDist - st.minDist)*dk);
      return true;
    }, distK);
    if (!ok) await aimActiveBand(page, distK);
    await frames(page, 3);
    return ok;
  }

  // --- grade 6 valores × 2 vistas, fase no MÁXIMO -----------------------
  for (const vista of ['fit', 'close']){
    const page = await openAtPhase(0.5);
    await aimActiveBand(page, vista === 'close' ? 0.42 : 1.0);
    for (const v of VALUES){
      await page.evaluate((x) => window.__solInfo.setSpots(x), v);
      await frames(page, 2);
      await shot(page, `spots-${v.toFixed(2)}-${vista}-max.png`,
        { spots: v, vista, fase: 'máximo (0.5, ampK~1.16)' });
    }
    if (vista === 'fit'){
      // referência ref-07 (GONG no máximo): o mesmo frame com spots=1.0
      await page.evaluate(() => window.__solInfo.setSpots(1.0));
      await frames(page, 2);
      await shot(page, 'ref07-espelho-fit-max.png',
        { spots: 1.0, vista: 'fit', fase: 'máximo (0.5)', ref: 'ref-07 (grupos múltiplos, umbras minúsculas)' });
    }
    if (vista === 'close'){
      // close EXTREMO no grupo virtual (spots já em 1.5 do último passo
      // da grade): morfologia líder/seguidor + penumbra 1:2.1 de perto
      const aimed = await aimStrongVirtual(page, 0.30);
      await shot(page, 'spots-1.50-close2-max.png',
        { spots: 1.5, vista: 'close2 (líder virtual, zoom 0.30)',
          fase: 'máximo (0.5, ampK~1.16)', aimedVirtual: aimed });
    }
    await page.close();
  }

  // --- par de referência ref-06/07: nível médio e mínimo (fit) ----------
  for (const [phase, name, ref] of [
    [0.18, 'ref-espelho-fit-medio.png', 'nível médio do ciclo (ampK~0.7)'],
    [0.02, 'ref06-espelho-fit-min.png', 'ref-06 (sol calmo, disco quase limpo)']]){
    const page = await openAtPhase(phase);
    await aimActiveBand(page, 1.0);
    await page.evaluate(() => window.__solInfo.setSpots(1.0));
    await frames(page, 2);
    await shot(page, name, { spots: 1.0, vista: 'fit', fase: 'fase ' + phase, ref });
    await page.close();
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('manifest.json escrito em', outDir);
  await browser.close();
})();

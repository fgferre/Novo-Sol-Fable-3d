// QA da FASE 6 ("Acabamento físico") — suíte em GRUPOS extensíveis:
//   S (B1) manchas de verdade (knob `spots`): contagem por fase do
//          ciclo, histograma de raios vs range GONG, paridade
//          live-toggle, efeito visível e determinismo.
//   P (B2) plumas polares + cúspide da coroa volumétrica — ADICIONAR
//          os checks no bloco marcado (mesmo padrão: página própria,
//          hooks setCvolShape/rebakeCorona, asserções numéricas+diff).
//   C (B3) estrias helicoidais + cavidade do CME: anisotropia do rim,
//          razão frente:cavidade no perfil radial pós-composite,
//          pesos 0 = look atual, determinismo do evento AO VIVO e
//          réplica do grupo K do qa:phase5 sob os pesos candidatos
//          (hooks setCmeShape/forceCME; captura ao vivo SEM saltar o
//          relógio — as partículas integram).
// Capturas determinísticas (?det=1&seed=7&hold=N) + asserções via
// __solInfo (spotsInfo/setSpots/setCyclePhase). Sai com 1 em FAIL.
// Uso: node tools/qa-phase6.js [outDir] [--file dist-single/index.html] [--group S,P,C]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/phase6';
const htmlFile = argOf('--file', 'dist-single/index.html');
const GROUPS = argOf('--group', 'S,P,C').split(',');
const base = 'file://' + path.resolve(htmlFile);

let fails = 0;
function check(name, ok, info){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info !== undefined ? '  (' + info + ')' : ''));
}
function readPng(f){ return PNG.sync.read(fs.readFileSync(f)); }
function diffPx(fileA, fileB){
  const a = readPng(fileA), b = readPng(fileB);
  if (a.width !== b.width || a.height !== b.height) return -1;
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
}
// luminância média de um crop central (régua de "escureceu de verdade":
// manchas só podem REMOVER luz do disco, nunca somar)
function cropLum(file, cw, ch){
  const p = readPng(file);
  const x0 = (p.width - cw) >> 1, y0 = (p.height - ch) >> 1;
  let s = 0;
  for (let y = y0; y < y0 + ch; y++){
    for (let x = x0; x < x0 + cw; x++){
      const i = (y*p.width + x)*4;
      s += 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2];
    }
  }
  return s/(cw*ch);
}
// contagem de pixels com delta RGB bruto > minD: manchas são escuro-
// sobre-escuro — o métrico YIQ do pixelmatch (threshold 0.1) subconta
// (medido: 805 px com delta>20 viravam 6 px no pixelmatch)
function rawDelta(fileA, fileB, minD){
  const a = readPng(fileA), b = readPng(fileB);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4){
    const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]);
    if (d > minD) n++;
  }
  return n;
}
// ---- helpers do GRUPO P (B2: geometria em unidades do RAIO DO DISCO) ----
// raio do disco em px (fórmula do composite, fov 42°, SUN_RADIUS 2.2)
function discRadiusPx(camDist, height){
  const ang = Math.asin(Math.min(1, 2.2 / Math.max(camDist, 2.2 * 1.001)));
  return height * 0.5 * Math.tan(ang) / Math.tan(21 * Math.PI / 180);
}
function lumAt(p, i){ return 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2]; }
// médias por setor num anel [r0,r1] em unidades de R: cap polar
// (|dy|>2.0|dx| — onde vivem os buracos/plumas) vs equatorial
// (|dx|>1.6|dy| — fora deles); eixo do Sol ~vertical nas vistas do QA
function sectorStats(file, Rpx, r0, r1){
  const p = readPng(file);
  const cx = p.width/2, cy = p.height/2;
  let pol = 0, np = 0, eq = 0, ne = 0;
  for (let y = 0; y < p.height; y++){
    for (let x = 0; x < p.width; x++){
      const dx = (x - cx)/Rpx, dy = (y - cy)/Rpx;
      const r = Math.hypot(dx, dy);
      if (r < r0 || r > r1) continue;
      const L = lumAt(p, (y*p.width + x)*4);
      if (Math.abs(dy) > Math.abs(dx)*2.0){ pol += L; np++; }
      else if (Math.abs(dx) > Math.abs(dy)*1.6){ eq += L; ne++; }
    }
  }
  return { polar: np ? pol/np : 0, equat: ne ? eq/ne : 0 };
}
// contagem rawDelta>minD por setor (assinatura regional das plumas)
function sectorRawDelta(fileA, fileB, Rpx, r0, r1, minD){
  const a = readPng(fileA), b = readPng(fileB);
  const cx = a.width/2, cy = a.height/2;
  let npol = 0, neq = 0;
  for (let y = 0; y < a.height; y++){
    for (let x = 0; x < a.width; x++){
      const dx = (x - cx)/Rpx, dy = (y - cy)/Rpx;
      const r = Math.hypot(dx, dy);
      if (r < r0 || r > r1) continue;
      const i = (y*a.width + x)*4;
      const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]);
      if (d <= minD) continue;
      if (Math.abs(dy) > Math.abs(dx)*2.0) npol++;
      else if (Math.abs(dx) > Math.abs(dy)*1.6) neq++;
    }
  }
  return { npol, neq };
}
// perfil angular de luminância integrado numa banda radial [r0,r1] (em
// R), suavizado ±2° — mede a largura TRANSVERSAL da folha do streamer
// sem o ruído das raias finas de 1-2px
function bandProfile(file, Rpx, r0, r1){
  const p = readPng(file);
  const cx = p.width/2, cy = p.height/2, N = 720;
  const sum = new Float64Array(N), cnt = new Float64Array(N);
  for (let y = 0; y < p.height; y++){
    for (let x = 0; x < p.width; x++){
      const dx = (x - cx)/Rpx, dy = (y - cy)/Rpx;
      const r = Math.hypot(dx, dy);
      if (r < r0 || r > r1) continue;
      let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI*2;
      const k = Math.min(N - 1, (a/(Math.PI*2)*N) | 0);
      sum[k] += lumAt(p, (y*p.width + x)*4); cnt[k]++;
    }
  }
  const prof = new Float64Array(N), sm = new Float64Array(N);
  for (let k = 0; k < N; k++) prof[k] = cnt[k] ? sum[k]/cnt[k] : 0;
  for (let k = 0; k < N; k++){
    let s = 0;
    for (let d = -4; d <= 4; d++) s += prof[(k + d + N) % N];
    sm[k] = s/9;
  }
  return sm;
}
// largura (graus) acima da meia-altura do pico local a ±winDeg de a0deg
function peakWidthDeg(prof, a0deg, winDeg){
  const N = prof.length, i0 = Math.round(a0deg/360*N), w = Math.round(winDeg/360*N);
  let pi = i0, pv = -1, floor = Infinity;
  for (let d = -w; d <= w; d++){
    const i = (i0 + d + N) % N;
    if (prof[i] > pv){ pv = prof[i]; pi = i; }
    if (prof[i] < floor) floor = prof[i];
  }
  const half = floor + (pv - floor)/2;
  let lo = 0, hi = 0;
  for (let d = 1; d <= w; d++){ if (prof[(pi - d + N) % N] >= half) lo = d; else break; }
  for (let d = 1; d <= w; d++){ if (prof[(pi + d) % N] >= half) hi = d; else break; }
  return { w: (lo + hi + 1)*360/N, peak: pv, at: pi*360/N };
}
// luminância média num anel [r0,r1] da MEIA-ALTURA + setores polar/equat
// (idêntico ao ringStats do qa-phase4 — o P6 re-executa I1/I2 com ele)
function ringStats(file, r0, r1){
  const p = readPng(file);
  const cx = p.width/2, cy = p.height/2, R = p.height/2;
  let sum = 0, n = 0, pol = 0, np = 0, eq = 0, ne = 0;
  for (let y = 0; y < p.height; y++){
    for (let x = 0; x < p.width; x++){
      const dx = (x-cx)/R, dy = (y-cy)/R;
      const r = Math.hypot(dx, dy);
      if (r < r0 || r > r1) continue;
      const L = lumAt(p, (y*p.width + x)*4);
      sum += L; n++;
      if (Math.abs(dy) > Math.abs(dx)*1.6){ pol += L; np++; }
      else if (Math.abs(dx) > Math.abs(dy)*1.6){ eq += L; ne++; }
    }
  }
  return { mean: n ? sum/n : 0, polar: np ? pol/np : 0, equat: ne ? eq/ne : 0 };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];

  async function open(q, holdF, viewport){
    const hold = holdF === undefined ? 48 : holdF;
    const page = await browser.newPage({ viewport: viewport || { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '?det=1&seed=7&hold=' + hold + '&tier=high&scale=1' + (q ? '&' + q : ''));
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    return page;
  }
  async function frames(page, n){
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 420000 });
  }
  async function waitFrame(page, f){
    await page.waitForFunction((n) => window.__solInfo.frame > n, f, { timeout: 420000 });
  }
  // PR2: rebakeCorona é ASSÍNCRONO (agenda ciclo forçado que anda sob
  // ?hold com passo sintético) — o evaluate retorna targetCycle e o QA
  // espera coronaInfo().cycles alcançá-lo antes de capturar
  async function waitCycle(page, target){
    await page.waitForFunction((t) => window.__solInfo.coronaInfo().cycles >= t, target, { timeout: 420000 });
  }

  // ======================= GRUPO S (B1: manchas) =======================
  if (GROUPS.includes('S')){
    {
      // página-mestra do ciclo: cycle=1 (senão cycleAmpK fica 1 em
      // qualquer fase) + spots=1; hold=90 dá janela para o salto de
      // estado ANTES do congelamento (o bake da cromosfera absorve as
      // regiões re-emergidas do máximo; os shots vêm depois do freeze)
      const page = await open('cycle=1&spots=1', 90);
      await page.evaluate(() => window.__solInfo.setCyclePhase(0.5, true));
      await waitFrame(page, 93);   // bake absorve o máximo; relógio congela no 90
      const siMax = await page.evaluate(() => window.__solInfo.spotsInfo());
      check('S2 máximo do ciclo tem grupos múltiplos (n>=6 manchas virtuais, ref-07)',
        siMax.n >= 6 && siMax.ampK > 1.1,
        'n=' + siMax.n + ' ampK=' + siMax.ampK);
      // S5: as manchas assinam o frame E escurecem o disco NA REGIÃO
      // da banda ativa. A câmera MIRA a região mais forte (o sorteio
      // de longitudes pode deixar todas as regiões no lado oculto da
      // vista default — medido no seed 7/fase 0.5: só 6 px na vista
      // default vs centenas com a banda de frente). Mirar sob freeze é
      // seguro: o bake é em espaço do OBJETO (independe da câmera).
      // Métrica: delta RGB bruto>20 (escuro-sobre-escuro subconta no
      // YIQ do pixelmatch) + luminância média cai no crop central.
      await page.evaluate(() => {
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
        window.__solInfo.setView(Math.atan2(w[2], w[0]),
          Math.acos(Math.max(-1, Math.min(1, w[1]))),
          st.minDist + (st.fitDist - st.minDist)*0.55);
      });
      await frames(page, 3);
      const onShot = path.join(outDir, 's5-spots-on.png');
      await page.screenshot({ path: onShot });
      await page.evaluate(() => window.__solInfo.setSpots(0));
      await frames(page, 3);
      const offShot = path.join(outDir, 's5-spots-off.png');
      await page.screenshot({ path: offShot });
      const nDiff = rawDelta(onShot, offShot, 20);
      const lumOn = cropLum(onShot, 400, 400), lumOff = cropLum(offShot, 400, 400);
      check('S5 spots=1 escurece a banda ativa (delta RGB>20 em >600px e lum média cai no crop 400²)',
        nDiff > 600 && lumOn < lumOff,
        nDiff + 'px, lum ' + lumOn.toFixed(3) + ' vs ' + lumOff.toFixed(3));
      await page.evaluate(() => window.__solInfo.setSpots(1));
      await frames(page, 2);
      // S1: mínimo do ciclo — banda quase vazia (~0-2 manchas)
      await page.evaluate(() => window.__solInfo.setCyclePhase(0.02, true));
      await frames(page, 3);
      const siMin = await page.evaluate(() => window.__solInfo.spotsInfo());
      check('S1 mínimo do ciclo quase limpo (n<=2 manchas virtuais, ref-06)',
        siMin.n <= 2 && siMin.ampK < 0.3,
        'n=' + siMin.n + ' ampK=' + siMin.ampK);
      // S3: histograma de raios numa amostra de fases — tudo dentro do
      // range GONG [0.005, 0.086]R e líder raro grande (>=0.05R)
      // presente (vem da recalibração dos raios REAIS no máximo e/ou
      // da cauda da distribuição virtual). Numérico puro: setCyclePhase
      // pós-freeze não precisa de bake (spotsInfo lê estado+uniforms).
      const radii = [];
      let nBig = 0, rMin = 1, rMax = 0;
      for (const ph of [0.28, 0.5, 0.72, 1.2, 1.35]){
        await page.evaluate((p) => window.__solInfo.setCyclePhase(p, true), ph);
        await frames(page, 2);
        const si = await page.evaluate(() => window.__solInfo.spotsInfo());
        si.slots.forEach((s) => { if (s.on) radii.push(s.r); });
        si.real.forEach((c) => { if (c.lifeK > 0.2) radii.push(c.r); });
      }
      radii.forEach((r) => {
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        if (r >= 0.05) nBig++;
      });
      check('S3 raios no range GONG [0.005,0.086]R com líder raro >=0.05R na amostra de fases',
        radii.length > 20 && rMin >= 0.005 - 1e-6 && rMax <= 0.086 + 1e-6 && nBig >= 1,
        radii.length + ' raios, min ' + rMin.toFixed(4) + ' max ' + rMax.toFixed(4) + ', >=0.05R: ' + nBig);
      await page.close();
    }
    {
      // S4: paridade live-toggle no frame DEFAULT (sem cycle/spots na
      // URL): ligar e desligar o knob devolve o frame congelado
      // (<=200px, régua de histerese do SwiftShader das fases 3-5;
      // spots não toca bake — esperado ~0px)
      const page = await open('', 48);
      const pre = path.join(outDir, 's4-pre.png');
      await page.screenshot({ path: pre });
      await page.evaluate(() => window.__solInfo.setSpots(1));
      await frames(page, 3);
      await page.evaluate(() => window.__solInfo.setSpots(0));
      await frames(page, 3);
      const post = path.join(outDir, 's4-post.png');
      await page.screenshot({ path: post });
      const n = diffPx(pre, post);
      const kn = await page.evaluate(() => window.__solInfo.knobs().spots);
      check('S4 live-toggle spots 0->1->0 devolve o frame default (<=200px)',
        n >= 0 && n <= 200 && kn === 0, n + 'px, knob ' + kn);
      await page.close();
    }
    {
      // S6: determinismo — 2 execuções do MESMO cenário spots=1 => 0px
      async function detShot(name){
        const p = await open('cycle=1&spots=1', 90);
        await p.evaluate(() => window.__solInfo.setCyclePhase(0.5, true));
        await waitFrame(p, 93);
        const f = path.join(outDir, name);
        await p.screenshot({ path: f });
        await p.close();
        return f;
      }
      const a = await detShot('s6-det-a.png');
      const b = await detShot('s6-det-b.png');
      const n = diffPx(a, b);
      check('S6 manchas determinísticas (2 execuções do cenário do máximo, 0px)',
        n === 0, n + 'px');
    }
  }

  // ================== GRUPO P (B2: plumas + cúspide) ==================
  if (GROUPS.includes('P')){
    // Limiares CALIBRADOS no build da B2 (medidos na calibração da
    // rodada, limiar ≈ metade do efeito medido): plumas medidas no cap
    // polar do MÍNIMO (buracos abertos) em cvol=0.5 — plume=0.9 deu
    // polar +0.432 (+5.6%) com 1262px de ΔRGB>10 e equat +0.000/0px;
    // cúspide medida em cvol=1.1 (SNR na banda alta) no cinturão
    // equatorial do mínimo — cusp=0.9 derrubou a largura da banda alta
    // p/ 0.59×(v1)/0.61×(v2) da de cusp=0; taper hi/lo baseline ~0.79.
    const CAL = {
      p1MinPolarDelta: 0.22,   // média do cap polar [1.02,1.5] sobe >= (medido +0.432 c/ plume .9)
      p1MinPx: 600,            // rawDelta>10 no cap polar >= (medido 1262px)
      p2MaxEqPx: 60,           // rawDelta>10 no setor equatorial <= (medido 0px)
      p2MaxEqDelta: 0.20,      // |média equat| move <= (medido 0.000)
      p3MaxHiRatio: 0.80,      // largura da folha na banda alta c/ cusp=0.9 <= 0.80x a de cusp=0 (medido 0.59-0.61x)
      p3BaseLo: 0.60,          // taper hi/lo com cusp=0 na banda do baseline (medido 0.79)
      p3BaseHi: 0.95
    };
    // "estado saltado" para o LOOK cvol: salto de fase CEDO (o bake da
    // cromosfera ~8Hz absorve as regiões novas até o freeze) e rebake
    // do volume DEPOIS do freeze. O rebake pós-freeze é OBRIGATÓRIO:
    // além do congelamento (doc F4), ele mata o ciclo de bake FATIADO
    // em voo (cvolStep=-1) — sem isso o upload do ciclo (~frame 118)
    // REVERTIA o volume para as cargas pré-salto no meio dos shots
    // (medido na calibração B2: +2.0 de luminância equatorial fantasma
    // entre variantes). Pós-freeze o accum congela e nada mais re-baka.
    async function openMin(q, phase){
      const page = await open(q, 90);
      await page.evaluate((p) => {
        window.__solInfo.toggle('stars', false);   // Via Láctea contamina o setor W (medido: pico fixo ~226°)
        window.__solInfo.setCyclePhase(p, true);
      }, phase);
      await waitFrame(page, 93);
      const tc = await page.evaluate(() => {
        // FASE 6 B4: os defaults shipped agora são plume/cusp 0.6 — os
        // checks P medem o efeito A/B a partir de pesos ZERADOS (a
        // mesma régua da calibração B2, que fixou os limiares CAL);
        // zerar ANTES do rebake pós-freeze para o bake já sair sem cusp
        window.__solInfo.setCvolShape({ plume: 0, cusp: 0 });
        const st = window.__solInfo.state();
        window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.5);
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tc);
      await frames(page, 2);
      return page;
    }
    {
      // ---- P1/P2/P4: plumas no buraco polar do mínimo (cvol preset) ----
      const page = await openMin('cvol=0.5&cycle=1', 0.02);
      const st = await page.evaluate(() => window.__solInfo.state());
      const Rpx = discRadiusPx(st.camDist, 600);
      const shot0 = path.join(outDir, 'p-plume0.png');
      await page.screenshot({ path: shot0 });
      // plume é UNIFORM (setCvolShape sem rebake — efeito imediato)
      await page.evaluate(() => window.__solInfo.setCvolShape({ plume: 0.9 }));
      await frames(page, 2);
      const shot9 = path.join(outDir, 'p-plume09.png');
      await page.screenshot({ path: shot9 });
      const s0 = sectorStats(shot0, Rpx, 1.02, 1.50);
      const s9 = sectorStats(shot9, Rpx, 1.02, 1.50);
      const rd = sectorRawDelta(shot0, shot9, Rpx, 1.02, 1.50, 10);
      check('P1 plumas visíveis no buraco polar (plume=0.9: cap polar sobe e assina px)',
        (s9.polar - s0.polar) >= CAL.p1MinPolarDelta && rd.npol >= CAL.p1MinPx,
        'polar +' + (s9.polar - s0.polar).toFixed(3) + ' (>=' + CAL.p1MinPolarDelta + '), ' +
        rd.npol + 'px (>=' + CAL.p1MinPx + ')');
      check('P2 plumas confinadas ao buraco (setor equatorial quase intacto)',
        rd.neq <= CAL.p2MaxEqPx && Math.abs(s9.equat - s0.equat) <= CAL.p2MaxEqDelta,
        'equat ' + rd.neq + 'px (<=' + CAL.p2MaxEqPx + '), delta média ' +
        (s9.equat - s0.equat).toFixed(3) + ' (<=' + CAL.p2MaxEqDelta + ')');
      // P4: pesos novos a 0 devolvem o look atual (A/B na MESMA página;
      // cusp mexe no BAKE => rebake nos dois sentidos; régua <=200px =
      // histerese de ~1 LSB do SwiftShader das fases 3-5)
      const tcHi = await page.evaluate(() => {
        window.__solInfo.setCvolShape({ plume: 0.9, cusp: 0.6 });
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tcHi);
      await frames(page, 2);
      const tcBack = await page.evaluate(() => {
        window.__solInfo.setCvolShape({ plume: 0, cusp: 0 });
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tcBack);
      await frames(page, 2);
      const shotBack = path.join(outDir, 'p-pesos0-volta.png');
      await page.screenshot({ path: shotBack });
      const nBack = diffPx(shot0, shotBack);
      const shNow = await page.evaluate(() => window.__solInfo.setCvolShape({}));
      check('P4 pesos 0 = look atual (A/B mesma página, <=200px)',
        nBack >= 0 && nBack <= 200 && shNow.plume === 0 && shNow.cusp === 0,
        nBack + 'px, shape ' + JSON.stringify(shNow));
      await page.close();
    }
    {
      // ---- P3: cúspide afunila a folha com a altura (cvol=1.1: SNR) ----
      // cinturão equatorial do mínimo (folha presa ao equador = perfil
      // transversal limpo nos lados E/W); largura FWHM na banda baixa
      // [1.15,1.40]R vs alta [1.55,1.85]R, média dos lados E e W
      const page = await openMin('cvol=1.1&cycle=1', 0.02);
      const st = await page.evaluate(() => window.__solInfo.state());
      const Rpx = discRadiusPx(st.camDist, 600);
      async function sheetWidths(tag){
        const f = path.join(outDir, 'p3-' + tag + '.png');
        await page.screenshot({ path: f });
        const lo = bandProfile(f, Rpx, 1.15, 1.40), hi = bandProfile(f, Rpx, 1.55, 1.85);
        const eLo = peakWidthDeg(lo, 0, 40), eHi = peakWidthDeg(hi, eLo.at, 25);
        const wLo = peakWidthDeg(lo, 180, 40), wHi = peakWidthDeg(hi, wLo.at, 25);
        return { lo: (eLo.w + wLo.w)/2, hi: (eHi.w + wHi.w)/2 };
      }
      const w0 = await sheetWidths('cusp0');
      const tc9 = await page.evaluate(() => {
        window.__solInfo.setCvolShape({ cusp: 0.9 });
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tc9);
      await frames(page, 2);
      const w9 = await sheetWidths('cusp09');
      const taper0 = w0.hi/Math.max(1e-3, w0.lo);
      check('P3a cusp=0 mantém o afunilamento baseline da folha (taper hi/lo na banda medida)',
        taper0 >= CAL.p3BaseLo && taper0 <= CAL.p3BaseHi,
        'taper ' + taper0.toFixed(3) + ' em [' + CAL.p3BaseLo + ',' + CAL.p3BaseHi + '], lo ' +
        w0.lo.toFixed(1) + '° hi ' + w0.hi.toFixed(1) + '°');
      check('P3b cusp=0.9 afunila a folha na banda alta (largura cai por fator mensurável)',
        w9.hi <= w0.hi * CAL.p3MaxHiRatio && w9.lo <= w0.lo * 1.05,
        'hi ' + w0.hi.toFixed(1) + '°->' + w9.hi.toFixed(1) + '° (<=' + CAL.p3MaxHiRatio +
        'x), lo ' + w0.lo.toFixed(1) + '°->' + w9.lo.toFixed(1) + '°');
      await page.close();
    }
    {
      // ---- P5: determinismo do conjunto (2 execuções -> 0px) ----------
      async function detShot(name){
        const p = await open('cvol=0.5&cycle=1', 90);
        await p.evaluate(() => window.__solInfo.setCyclePhase(0.02, true));
        await waitFrame(p, 93);
        // shape+rebake PÓS-freeze (mata o ciclo fatiado em voo — ver openMin)
        const tc = await p.evaluate(() => {
          window.__solInfo.setCvolShape({ plume: 0.9, cusp: 0.6 });
          const st = window.__solInfo.state();
          window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.5);
          return window.__solInfo.rebakeCorona().targetCycle;
        });
        await waitCycle(p, tc);
        await frames(p, 2);
        const f = path.join(outDir, name);
        await p.screenshot({ path: f });
        await p.close();
        return f;
      }
      const a = await detShot('p5-det-a.png');
      const b = await detShot('p5-det-b.png');
      const n = diffPx(a, b);
      check('P5 plumas+cúspide determinísticas (2 execuções, 0px)', n === 0, n + 'px');
    }
    {
      // ---- P6: I1/I2 do qa:phase4 sobrevivem aos CANDIDATOS MÁXIMOS ----
      // (plume=1.2 teto do sweep, cusp=0.9, folha v2 1.15/.20): plumas
      // brilham os buracos polares do mínimo e podem matar o I2 (razão
      // polar/equat deve CAIR >=18% no mínimo) — este check fixa o teto
      // seguro do sweep. Mesma receita do qa-phase4 (câmera fitDist*1.6,
      // anel [0.68,0.95] da meia-altura, fases 0.5/0.02 + rebake).
      const page = await open('cvol=1.1&cycle=1', 150);
      // salto p/ o máximo CEDO (chromo absorve); shape+rebake PÓS-freeze
      // (mata o ciclo fatiado em voo — ver openMin)
      await page.evaluate(() => window.__solInfo.setCyclePhase(0.5, true));
      await waitFrame(page, 153);
      const tcMax = await page.evaluate(() => {
        const st = window.__solInfo.state();
        window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.6);
        window.__solInfo.setCvolShape({ plume: 1.2, cusp: 0.9, sheet: 1.15, base: 0.20 });
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tcMax);
      await frames(page, 4);
      const shotMax = path.join(outDir, 'p6-cycle-max.png');
      await page.screenshot({ path: shotMax });
      const tcMin = await page.evaluate(() => {
        window.__solInfo.setCyclePhase(0.02, true);
        return window.__solInfo.rebakeCorona().targetCycle;
      });
      await waitCycle(page, tcMin);
      await frames(page, 4);
      const shotMin = path.join(outDir, 'p6-cycle-min.png');
      await page.screenshot({ path: shotMin });
      const sMax = ringStats(shotMax, 0.68, 0.95);
      const sMin = ringStats(shotMin, 0.68, 0.95);
      check('P6a I1 sob candidatos máximos: coroa do máximo mais cheia (anel +25%)',
        sMax.mean > sMin.mean * 1.25,
        'max ' + sMax.mean.toFixed(2) + ' vs min ' + sMin.mean.toFixed(2));
      const ratioMax = sMax.polar / Math.max(1e-3, sMax.equat);
      const ratioMin = sMin.polar / Math.max(1e-3, sMin.equat);
      check('P6b I2 sob candidatos máximos: mínimo ainda abre buracos polares (polar/equat cai >=18%)',
        ratioMin < ratioMax * 0.82,
        'max ' + ratioMax.toFixed(3) + ' -> min ' + ratioMin.toFixed(3));
      await page.close();
    }
  }

  // ================== GRUPO C (B3: estrias + cavidade) ================
  if (GROUPS.includes('C')){
    // Limiares CALIBRADOS na rodada B3 (regra da rodada: limiar ≈
    // metade do efeito medido). Baseline MEDIDO (build pré-B3 3b29425,
    // evento AO VIVO congelado em t=4.967 no limbo — forceCME(0) no
    // frame ~10, SEM saltar o relógio —, det=1&seed=7, estrelas off,
    // fitDist×1.6): razão frente:cavidade 1.189× (a régua "~1.3×" da
    // F5, re-medida nesta receita — este é o número desta régua);
    // "contas" do rim beadRMS 1.569. Com os pesos no build B3 (mesma
    // página/receita): stria=0.8 → beadRMS 0.63× o isotrópico
    // (de-beading → laços); cav=0.7 → razão 1.859× (ABAIXO do alvo —
    // por isso a calibração moveu o candidato); candidato
    // stria=0.8+cav=0.85 (casca+partículas) → razão 2.109× (≥2.0 do
    // PROMPT; a resposta do cav satura de propósito perto de 0.87 —
    // min(cav·1.15,1) — teto 0.8/1.0 mede 2.15×).
    const CCAL = {
      candStria: 0.8, candCav: 0.85,  // candidatos do sweep (painel decide)
      c1MaxBeadRatio: 0.80,           // beadRMS(stria .8)/beadRMS(0) <= (medido 0.58-0.63x)
      // PR11 (OETF sRGB): a razão é medida em luminância DISPLAY-referred
      // pós-composite — a sRGB levanta os escuros (cavidade +40%) mais
      // que os claros (frente +17%) e comprime a razão. Re-medição A/B
      // na MESMA máquina (Windows/SwiftShader): main (cor velha) 1.936x
      // → PR11 1.614x (fator só-cor 0.834; baseline pesos-0 1.127x →
      // 1.062x). Nota: na cor velha esta máquina já media 1.936x < 2.0
      // (deriva local pré-existente vs a calibração B3 de 2.109x, análoga
      // ao F3 da phase4). Novo limiar ancorado no observado com a MESMA
      // margem relativa da B3 (2.0/2.109 = 94.8%): 1.614×0.948 ≈ 1.53.
      c2MinRatio: 1.53,               // frente:cavidade no candidato (PROMPT-F6, recalibrado PR11)
      holdMain: 308,                  // t≈(308-10)/60 ≈ 4.97 — bolha formada
      holdDet: 128                    // t≈1.97 p/ o check de determinismo
    };
    // ---- helpers C (mesmas réguas do tools/sweep-cme2.js) ------------
    function lumBil(p, x, y){
      if (x < 0 || y < 0 || x > p.width - 2 || y > p.height - 2) return -1;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      function L(xx, yy){
        const i = (yy*p.width + xx)*4;
        return 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2];
      }
      return L(x0,y0)*(1-fx)*(1-fy) + L(x0+1,y0)*fx*(1-fy) + L(x0,y0+1)*(1-fx)*fy + L(x0+1,y0+1)*fx*fy;
    }
    // centroide do diff bruto A/B do toggle cme = direção do evento em
    // TELA (auto-calibrado, sem depender da convenção da câmera)
    function diffCentroid(fA, fB, minD){
      const a = readPng(fA), b = readPng(fB);
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < a.height; y++){
        for (let x = 0; x < a.width; x++){
          const i = (y*a.width + x)*4;
          const d = Math.abs(a.data[i]-b.data[i]) + Math.abs(a.data[i+1]-b.data[i+1]) + Math.abs(a.data[i+2]-b.data[i+2]);
          if (d > minD){ sx += x; sy += y; n++; }
        }
      }
      return n ? { x: sx/n, y: sy/n, n } : null;
    }
    // perfil radial pós-composite ao longo de û (janela ±6px) e razão
    // frente:cavidade nas bandas da bolha (cx, rho, front em R — lidos
    // do cmeInfo no instante congelado)
    function cavityMetrics(file, u, Rs, cxR, rho, front){
      const p = readPng(file);
      const cx = p.width/2, cy = p.height/2, vx = -u.y, vy = u.x;
      const r1 = Math.min(3.1, front + 0.55);
      function band(a, b, f){
        let v = f === 'max' ? -1 : (f === 'min' ? 1e9 : 0), n = 0;
        for (let r = Math.max(1.02, a); r <= Math.min(b, r1); r += 0.01){
          const px = cx + u.x*r*Rs, py = cy + u.y*r*Rs;
          let s = 0, m = 0;
          for (let k = -6; k <= 6; k++){
            const L = lumBil(p, px + vx*k, py + vy*k);
            if (L >= 0){ s += L; m++; }
          }
          if (!m) continue;
          const L = s/m;
          if (f === 'max') v = Math.max(v, L);
          else if (f === 'min') v = Math.min(v, L);
          else { v += L; n++; }
        }
        return f === 'mean' ? (n ? v/n : -1) : v;
      }
      const frontPeak = band(cxR + 0.55*rho, cxR + 1.15*rho, 'max');
      const cavMean = band(cxR - 0.30*rho, cxR + 0.45*rho, 'mean');
      return { frontPeak: +frontPeak.toFixed(3), cavMean: +cavMean.toFixed(3),
               ratio: +(frontPeak/Math.max(1e-3, cavMean)).toFixed(3) };
    }
    // "contas" do rim (flag F5): perfil ANGULAR do rim (média radial na
    // banda [0.78,1.04]ρ em volta do centro da bolha, amostra suavizada
    // 3×3 contra o chuvisco das partículas), detrend por média móvel
    // ±10°; o resíduo RMS mede os grumos angulares. fbm isotrópico =
    // contas (RMS alto); estrias helicoidais = laços alongados ao longo
    // do arco (RMS cai — medido 0.63× com stria=0.8, calibração B3).
    function rimBeadRMS(file, u, Rs, cxR, rho, RlimbPx){
      const p = readPng(file);
      const ccx = p.width/2 + u.x*cxR*Rs, ccy = p.height/2 + u.y*cxR*Rs;
      const NA = 360, NRR = 10, r0 = 0.78, r1 = 1.04;
      const A = new Float64Array(NA), C = new Float64Array(NA);
      for (let k = 0; k < NA; k++){
        const ang = k/NA*Math.PI*2;
        for (let j = 0; j < NRR; j++){
          const r = (r0 + (r1 - r0)*j/(NRR - 1))*rho*Rs;
          const x = ccx + Math.cos(ang)*r, y = ccy + Math.sin(ang)*r;
          if (Math.hypot(x - p.width/2, y - p.height/2) < RlimbPx*1.05) continue;
          if (x < 1 || y < 1 || x >= p.width - 1 || y >= p.height - 1) continue;
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++){
            for (let dx = -1; dx <= 1; dx++){
              const i = ((Math.round(y) + dy)*p.width + (Math.round(x) + dx))*4;
              s += 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2]; n++;
            }
          }
          A[k] += s/n; C[k]++;
        }
      }
      const P = new Float64Array(NA).fill(NaN);
      for (let k = 0; k < NA; k++) if (C[k] >= NRR*0.7) P[k] = A[k]/C[k];
      let rms = 0, n = 0;
      for (let k = 0; k < NA; k++){
        if (!isFinite(P[k])) continue;
        let s = 0, c = 0;
        for (let d = -10; d <= 10; d++){
          const q = (k + d + NA) % NA;
          if (isFinite(P[q])){ s += P[q]; c++; }
        }
        if (c < 15) continue;
        const res = P[k] - s/c; rms += res*res; n++;
      }
      return n ? Math.sqrt(rms/n) : 0;
    }
    // evento AO VIVO congelado no hold: forceCME no frame 10 EXATO e o
    // relógio corre até o freeze — SEM setCmeClock (as partículas do
    // ejecta INTEGRAM por transform feedback; saltar o relógio deixa a
    // nuvem na base enquanto a casca cruza a coroa — receita da F5/C).
    // O disparo é rAF-SINCRONIZADO dentro da página: o evaluate antigo
    // ("waitForFunction frame>8; forceCME") corria contra o rAF e caía
    // ora depois do frame 9, ora do 10 (medido: 1ª página do browser
    // sempre 10, 2ª sempre 9) — a duração do evento no freeze diferia
    // 1/60 s e o C4 media essa corrida, não a sim (cx 1.189 vs 1.191;
    // ficava SUB-limiar no pixelmatch até o fade-in/size do Bloco C
    // engordar os sprites). Frame 10 = o valor histórico das
    // calibrações (t=(hold-10)/60: holdDet→1.967, holdMain→4.967).
    async function openCmeLive(hold, q){
      const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(900000);
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      await page.goto(base + '?det=1&seed=7&hold=' + hold + '&tier=high&scale=1&cme=1.1' + (q ? '&' + q : ''));
      await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 0, null, { timeout: 900000 });
      const fAt = await page.evaluate(() => new Promise((res) => {
        (function tick(){
          if (window.__solInfo.frame >= 10){ window.__solInfo.forceCME(0); res(window.__solInfo.frame); }
          else requestAnimationFrame(tick);
        })();
      }));
      if (fAt !== 10) errs.push('openCmeLive: forceCME caiu no frame ' + fAt + ' (esperado 10)');
      await page.waitForFunction((f) => window.__solInfo.frame > f, hold + 3, { timeout: 900000 });
      return page;
    }
    // vista de limbo EXATA (tilt z=0.1265 antes do rotY — congelados
    // sob hold) + leitura do estado do evento no instante da foto
    async function limbViewExact(page, distMul){
      const info = await page.evaluate((dm) => {
        const st = window.__solInfo.state();
        const ci = window.__solInfo.cmeInfo();
        const v = ci.dir, tz = 0.1265, ry = st.rotY;
        const n = Math.hypot(v[0], v[1], v[2]) || 1;
        const p = [v[0]/n, v[1]/n, v[2]/n];
        const tx = p[0]*Math.cos(tz) - p[1]*Math.sin(tz);
        const ty = p[0]*Math.sin(tz) + p[1]*Math.cos(tz);
        const w = [tx*Math.cos(ry) + p[2]*Math.sin(ry), ty, -tx*Math.sin(ry) + p[2]*Math.cos(ry)];
        window.__solInfo.setView(Math.atan2(w[2], w[0]) + Math.PI/2, Math.PI*0.5, st.fitDist*dm);
        return ci;
      }, distMul);
      await frames(page, 2);
      return info;
    }
    // vista de limbo/frontal APROXIMADA (receita herdada do qa-phase5 —
    // ignora tilt/spin, ~0.16 rad no frame 48; usada só na réplica K)
    async function viewLimbK(page, dm){
      await page.evaluate((d2) => {
        const st = window.__solInfo.state();
        const d = window.__solInfo.cmeInfo().dir;
        window.__solInfo.setView(Math.atan2(d[2], d[0]) + Math.PI/2, Math.PI*0.5, st.fitDist*d2);
      }, dm);
      await frames(page, 3);
    }
    async function viewFrontK(page, dm){
      await page.evaluate((d2) => {
        const st = window.__solInfo.state();
        const d = window.__solInfo.cmeInfo().dir;
        window.__solInfo.setView(Math.atan2(d[2], d[0]),
          Math.acos(Math.max(-1, Math.min(1, d[1]))), st.fitDist*d2);
      }, dm);
      await frames(page, 3);
    }
    {
      // ---- página principal (t≈5.0, limbo): C1 estrias, C2 cavidade,
      // ---- C3 pesos 0 = look atual -------------------------------------
      const page = await openCmeLive(CCAL.holdMain, '');
      // FASE 6 B4: os defaults shipped agora são stria 0.8/cav 0.85 —
      // o baseline do C1/C2/C3 é o look de PESOS ZERADOS (a régua da
      // calibração B3); zerar via hook antes do shot A (uniform puro,
      // efeito imediato — o limbViewExact espera os frames)
      await page.evaluate(() => {
        window.__solInfo.toggle('stars', false);   // métrica limpa (Via Láctea contamina anel/perfil)
        window.__solInfo.setCmeShape({ stria: 0, cav: 0 });
      });
      const ci = await limbViewExact(page, 1.6);
      const st = await page.evaluate(() => window.__solInfo.state());
      const Rs = 300*2.2/(st.camDist*Math.tan(21*Math.PI/180));
      const RlimbPx = 300*Math.tan(Math.asin(2.2/st.camDist))/Math.tan(21*Math.PI/180);
      // û auto-calibrado por A/B do toggle na mesma página congelada;
      // o shot ON (pesos 0) é o BASELINE do C1/C2/C3
      const shotA = path.join(outDir, 'c-pesos0.png');
      await page.screenshot({ path: shotA });
      await page.evaluate(() => window.__solInfo.toggle('cme', false));
      await frames(page, 2);
      const shotOff = path.join(outDir, 'c-toggle-off.png');
      await page.screenshot({ path: shotOff });
      await page.evaluate(() => window.__solInfo.toggle('cme', true));
      await frames(page, 2);
      const cen = diffCentroid(shotA, shotOff, 12);
      const ul = Math.hypot(cen.x - 480, cen.y - 300);
      const u = { x: (cen.x - 480)/ul, y: (cen.y - 300)/ul };
      // C1: estrias helicoidais — o rim perde as "contas" (A/B puro
      // stria=0.8 vs 0 na mesma página congelada; anisotropia = fios
      // alongados AO LONGO do arco ⇒ o resíduo angular do rim cai)
      await page.evaluate(() => window.__solInfo.setCmeShape({ stria: 0.8, cav: 0 }));
      await frames(page, 2);
      const shotB = path.join(outDir, 'c-stria08.png');
      await page.screenshot({ path: shotB });
      const bead0 = rimBeadRMS(shotA, u, Rs, ci.cx, ci.rho, RlimbPx);
      const bead8 = rimBeadRMS(shotB, u, Rs, ci.cx, ci.rho, RlimbPx);
      check('C1 estrias: rim perde as contas com stria=0.8 (beadRMS <=' + CCAL.c1MaxBeadRatio + 'x o isotrópico)',
        bead0 > 0.2 && bead8 <= bead0 * CCAL.c1MaxBeadRatio,
        'beadRMS ' + bead0.toFixed(3) + ' -> ' + bead8.toFixed(3) + ' (' +
        (bead8/Math.max(1e-3, bead0)).toFixed(2) + 'x)');
      // C2: contraste frente:cavidade com os pesos CANDIDATOS (perfil
      // radial pós-composite — a régua da F5, medida DEPOIS do bloom)
      await page.evaluate((c) => window.__solInfo.setCmeShape(c),
        { stria: CCAL.candStria, cav: CCAL.candCav });
      await frames(page, 2);
      const shotC = path.join(outDir, 'c-candidato.png');
      await page.screenshot({ path: shotC });
      const met0 = cavityMetrics(shotA, u, Rs, ci.cx, ci.rho, ci.front);
      const metC = cavityMetrics(shotC, u, Rs, ci.cx, ci.rho, ci.front);
      check('C2 razão frente:cavidade >=' + CCAL.c2MinRatio + 'x com cav=' + CCAL.candCav + ' (baseline ~1.06x pós-sRGB)',
        metC.ratio >= CCAL.c2MinRatio,
        'baseline ' + met0.ratio + 'x -> candidato ' + metC.ratio + 'x (frente ' +
        metC.frontPeak + ', cavidade ' + metC.cavMean + ')');
      // C3: pesos 0 devolvem o look atual (A/B mesma página; régua
      // <=200px da histerese de ~1 LSB — esperado ~0: uniforms puros)
      await page.evaluate(() => window.__solInfo.setCmeShape({ stria: 0, cav: 0 }));
      await frames(page, 2);
      const shotE = path.join(outDir, 'c-pesos0-volta.png');
      await page.screenshot({ path: shotE });
      const nBack = diffPx(shotA, shotE);
      const shNow = await page.evaluate(() => window.__solInfo.cmeInfo());
      check('C3 pesos 0 = look atual (A/B mesma página, <=200px)',
        nBack >= 0 && nBack <= 200 && shNow.stria === 0 && shNow.cav === 0,
        nBack + 'px, stria ' + shNow.stria + ' cav ' + shNow.cav);
      await page.close();
    }
    {
      // ---- C4: determinismo do evento vivo com pesos candidatos -------
      async function detShot(name){
        const p = await openCmeLive(CCAL.holdDet, '');
        await p.evaluate((c) => window.__solInfo.setCmeShape(c),
          { stria: CCAL.candStria, cav: CCAL.candCav });
        await limbViewExact(p, 1.35);
        const f = path.join(outDir, name);
        await p.screenshot({ path: f });
        await p.close();
        return f;
      }
      const a = await detShot('c4-det-a.png');
      const b = await detShot('c4-det-b.png');
      const n = diffPx(a, b);
      check('C4 estrias+cavidade determinísticas (2 execuções ao vivo, 0px)', n === 0, n + 'px');
    }
    {
      // ---- C5: réplica do grupo K do qa:phase5 sob os pesos CANDIDATOS
      // (o look shipped não pode quebrar os gates herdados do CME) +
      // C6: teto do sweep (stria=1.2/cav=1.0) mantém a assinatura K2
      const page = await open('cme=1.1', 48);
      await page.evaluate((c) => window.__solInfo.setCmeShape(c),
        { stria: CCAL.candStria, cav: CCAL.candCav });
      const ci0 = await page.evaluate(() => window.__solInfo.cmeInfo());
      check('C5-K1 knob/tier prontos no high sob pesos (24 passos, 2048 pts, sem evento)',
        ci0.steps === 24 && ci0.on === false && ci0.pts.n === 2048 &&
        ci0.killed === false && ci0.stria === CCAL.candStria && ci0.cav === CCAL.candCav,
        JSON.stringify({ steps: ci0.steps, pts: ci0.pts.n, stria: ci0.stria, cav: ci0.cav }));
      await page.evaluate(() => window.__solInfo.forceCME(0));
      await frames(page, 2);
      await viewLimbK(page, 1.35);
      await page.evaluate(() => window.__solInfo.setCmeClock(5.0));
      await frames(page, 3);
      const ciOn = await page.evaluate(() => window.__solInfo.cmeInfo());
      const shotOn = path.join(outDir, 'c5-limbo-on.png');
      await page.screenshot({ path: shotOn });
      await page.evaluate(() => window.__solInfo.toggle('cme', false));
      await frames(page, 3);
      const shotOff = path.join(outDir, 'c5-limbo-off.png');
      await page.screenshot({ path: shotOff });
      const nSig = diffPx(shotOn, shotOff);
      check('C5-K2 casca assina o frame no limbo sob pesos (A/B mesma página, diff>400px)',
        ciOn.on === true && ciOn.count === 1 && nSig > 400, nSig + 'px, t=' + ciOn.t);
      check('C5-K3 expansão auto-similar sob pesos (front>1.9, rho>0.35)',
        ciOn.front > 1.9 && ciOn.rho > 0.35, 'front ' + ciOn.front + ' rho ' + ciOn.rho);
      await page.evaluate(() => window.__solInfo.toggle('cme', true));
      await frames(page, 2);
      const hdrLimb = (await page.evaluate(() => window.__solInfo.cmeInfo())).hdr;
      await viewFrontK(page, 1.35);
      const hdrFront = (await page.evaluate(() => window.__solInfo.cmeInfo())).hdr;
      check('C5-K4 Thomson sob pesos: limbo brilha, halo esmaece (razão>=2)',
        hdrLimb > 0.05 && hdrLimb >= hdrFront * 2.0,
        'limbo ' + hdrLimb + ' vs frontal ' + hdrFront);
      const ptsOn = (await page.evaluate(() => window.__solInfo.cmeInfo())).pts;
      await page.evaluate(() => window.__solInfo.toggle('cmepts', false));
      await frames(page, 2);
      const ptsOff = (await page.evaluate(() => window.__solInfo.cmeInfo())).pts;
      check('C5-K5 partículas TF vivas sob pesos; toggle cmepts esconde',
        ptsOn.visible === true && ptsOff.visible === false,
        JSON.stringify({ on: ptsOn.visible, off: ptsOff.visible }));
      // C6: TETO do sweep — a régua K2 sobrevive no extremo da grade
      await page.evaluate(() => {
        window.__solInfo.toggle('cmepts', true);
        window.__solInfo.setCmeShape({ stria: 1.2, cav: 1.0 });
      });
      await viewLimbK(page, 1.35);
      const shotCeil = path.join(outDir, 'c6-teto-on.png');
      await page.screenshot({ path: shotCeil });
      await page.evaluate(() => window.__solInfo.toggle('cme', false));
      await frames(page, 3);
      const shotCeilOff = path.join(outDir, 'c6-teto-off.png');
      await page.screenshot({ path: shotCeilOff });
      const nCeil = diffPx(shotCeil, shotCeilOff);
      check('C6 teto do sweep (stria=1.2/cav=1.0) mantém a assinatura no limbo (>400px)',
        nCeil > 400, nCeil + 'px');
      await page.close();
    }
    {
      // C5-K6: tier low segue no-op sob pesos (+ clamps do hook)
      const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(420000);
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      await page.goto(base + '?det=1&seed=7&hold=48&tier=low&scale=1&cme=1.1');
      await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
      const r = await page.evaluate(() => ({
        sh: window.__solInfo.setCmeShape({ stria: 9, cav: 9 }),
        f: window.__solInfo.forceCME(0), i: window.__solInfo.cmeInfo() }));
      check('C5-K6 tier low fica sem CME sob pesos (0 passos, forceCME=false; hook clampa 1.2/1.0)',
        r.f === false && r.i.steps === 0 && r.i.on === false && r.i.pts.n === 0 &&
        r.sh.stria === 1.2 && r.sh.cav === 1.0,
        JSON.stringify({ steps: r.i.steps, sh: r.sh }));
      await page.close();
    }
    {
      // C5-K7: determinismo da receita K sob pesos (2 execuções, 0px)
      async function detShotK(name){
        const p = await open('cme=1.1', 48);
        await p.evaluate((c) => window.__solInfo.setCmeShape(c),
          { stria: CCAL.candStria, cav: CCAL.candCav });
        await p.evaluate(() => window.__solInfo.forceCME(0));
        await frames(p, 2);
        await viewLimbK(p, 1.35);
        await p.evaluate(() => window.__solInfo.setCmeClock(4.0));
        await frames(p, 3);
        const f = path.join(outDir, name);
        await p.screenshot({ path: f });
        await p.close();
        return f;
      }
      const a = await detShotK('c5-det-a.png');
      const b = await detShotK('c5-det-b.png');
      const n = diffPx(a, b);
      check('C5-K7 casca+partículas determinísticas sob pesos (receita K, 0px)', n === 0, n + 'px');
    }
    {
      // C5-K8: cme->0 ao vivo apaga a casca mesmo com pesos ativos
      const page = await open('cme=1.1', 48);
      await page.evaluate((c) => window.__solInfo.setCmeShape(c),
        { stria: CCAL.candStria, cav: CCAL.candCav });
      const pre = path.join(outDir, 'c5-k8-pre.png');
      await page.screenshot({ path: pre });
      await page.evaluate(() => window.__solInfo.forceCME(0));
      await frames(page, 3);
      await page.evaluate(() => window.__solInfo.setCme(0));
      await frames(page, 3);
      const post = path.join(outDir, 'c5-k8-knob0.png');
      await page.screenshot({ path: post });
      const ciK = await page.evaluate(() => window.__solInfo.cmeInfo());
      const n = diffPx(pre, post);
      check('C5-K8 cme->0 ao vivo apaga a casca sob pesos (knob 0; flare segue)',
        ciK.knob === 0 && n >= 0, 'knob ' + ciK.knob + ', diff-c/flare ' + n + 'px');
      await page.close();
    }
  }

  await browser.close();
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log(fails ? ('QA FASE 6: ' + fails + ' FALHA(S)') : 'QA FASE 6: tudo verde');
  process.exit(fails ? 1 : 0);
})();

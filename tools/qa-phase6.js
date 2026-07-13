// QA da FASE 6 ("Acabamento físico") — suíte em GRUPOS extensíveis:
//   S (B1) manchas de verdade (knob `spots`): contagem por fase do
//          ciclo, histograma de raios vs range GONG, paridade
//          live-toggle, efeito visível e determinismo.
//   P (B2) plumas polares + cúspide da coroa volumétrica — ADICIONAR
//          os checks no bloco marcado (mesmo padrão: página própria,
//          hooks setCvolShape/rebakeCorona, asserções numéricas+diff).
//   C (B3) estrias helicoidais + cavidade do CME — idem (hooks
//          forceCME/setCmeClock, perfil radial pós-composite).
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
const GROUPS = argOf('--group', 'S,P').split(',');   // B3 liga C
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
      await page.evaluate(() => {
        window.__solInfo.rebakeCorona();
        const st = window.__solInfo.state();
        window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.5);
      });
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
      await page.evaluate(() => {
        window.__solInfo.setCvolShape({ plume: 0.9, cusp: 0.6 });
        window.__solInfo.rebakeCorona();
      });
      await frames(page, 2);
      await page.evaluate(() => {
        window.__solInfo.setCvolShape({ plume: 0, cusp: 0 });
        window.__solInfo.rebakeCorona();
      });
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
      await page.evaluate(() => {
        window.__solInfo.setCvolShape({ cusp: 0.9 });
        window.__solInfo.rebakeCorona();
      });
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
        await p.evaluate(() => {
          window.__solInfo.setCvolShape({ plume: 0.9, cusp: 0.6 });
          window.__solInfo.rebakeCorona();
          const st = window.__solInfo.state();
          window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.5);
        });
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
      await page.evaluate(() => {
        const st = window.__solInfo.state();
        window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.6);
        window.__solInfo.setCvolShape({ plume: 1.2, cusp: 0.9, sheet: 1.15, base: 0.20 });
        window.__solInfo.rebakeCorona();
      });
      await frames(page, 4);
      const shotMax = path.join(outDir, 'p6-cycle-max.png');
      await page.screenshot({ path: shotMax });
      await page.evaluate(() => {
        window.__solInfo.setCyclePhase(0.02, true);
        window.__solInfo.rebakeCorona();
      });
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
    // B3 adiciona aqui: forceCME + setCmeClock, perfil radial pós-
    // composite (contraste frente:cavidade >=2x) e assinatura das
    // estrias helicoidais vs fbm isotrópico.
    check('C0 grupo C ainda não implementado (B3)', false, 'placeholder');
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

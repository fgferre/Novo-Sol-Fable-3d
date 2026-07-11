// QA da FASE 4 ("a coroa de verdade"): coroa volumétrica raymarched —
// sampler3D 64³ bakeado do campo de cargas, helmet streamers na
// superfície neutra, buracos coronais unipolares, tier-gate com
// fallback no plano de raias e resposta ao ciclo (máximo cheio /
// mínimo com buracos polares).
// Capturas determinísticas (?det=1&seed=7&hold=48 — o MESMO frame da
// paridade) + asserções numéricas via __solInfo. Sai com 1 em FAIL.
// Uso: node tools/qa-phase4.js [outDir] [--file dist-single/index.html] [--ref qa/baselines]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/phase4';
const htmlFile = argOf('--file', 'dist-single/index.html');
const refDir = argOf('--ref', 'qa/baselines');
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
// diff de um recorte central (oclusão: o volume não pode pintar NA
// FRENTE do disco — o miolo do disco tem de ser bit-idêntico sem bloom)
function diffCrop(fileA, fileB, cw, ch){
  const a = readPng(fileA), b = readPng(fileB);
  const x0 = (a.width - cw) >> 1, y0 = (a.height - ch) >> 1;
  const ca = new PNG({ width: cw, height: ch });
  const cb = new PNG({ width: cw, height: ch });
  PNG.bitblt(a, ca, x0, y0, cw, ch, 0, 0);
  PNG.bitblt(b, cb, x0, y0, cw, ch, 0, 0);
  return pixelmatch(ca.data, cb.data, null, cw, ch, { threshold: 0 });
}
// luminância média num anel de raio [r0,r1] (fração da meia-altura) —
// mede a coroa fora do disco; e separada por setor polar vs equatorial
function ringStats(file, r0, r1){
  const p = readPng(file);
  const cx = p.width/2, cy = p.height/2, R = p.height/2;
  let sum = 0, n = 0, pol = 0, np = 0, eq = 0, ne = 0;
  for (let y = 0; y < p.height; y++){
    for (let x = 0; x < p.width; x++){
      const dx = (x-cx)/R, dy = (y-cy)/R;
      const r = Math.hypot(dx, dy);
      if (r < r0 || r > r1) continue;
      const i = (y*p.width + x)*4;
      const L = 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2];
      sum += L; n++;
      // setores: polar = |dy|>|dx| (eixo do Sol ~vertical no fit)
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

  async function open(q, viewport){
    const page = await browser.newPage({ viewport: viewport || { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '?det=1&seed=7&hold=48&tier=high&scale=1' + (q ? '&' + q : ''));
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    return page;
  }
  async function frames(page, n){
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 420000 });
  }

  // --- F: núcleo (knob, tier-gate, bake) --------------------------------
  {
    const page = await open('cvol=1.1');
    const ci = await page.evaluate(() => window.__solInfo.coronaInfo());
    check('F1 raymarch ligado no high (36 passos, 64³ pronto)',
      ci.on === true && ci.steps === 36 && ci.res === 64 && ci.ready === true && ci.cycles >= 1,
      JSON.stringify(ci));
    const shot = path.join(outDir, 'cvol-fit.png');
    await page.screenshot({ path: shot });
    const ref = path.join(refDir, 'desktop-fit.png');
    if (fs.existsSync(ref)){
      const n = diffPx(shot, ref);
      check('F2 coroa volumétrica muda o frame (diff>400px vs baseline)', n > 400, n + 'px');
    }
    // knob some => o frame volta PERTO do baseline. Não é 0px: meshes
    // extras visíveis durante os ciclos de bake deslocam o SwiftShader
    // em 1 LSB nas fatias seguintes (fenômeno pré-existente de
    // qualquer mesh transparente, medido na F4: ~112px acima do
    // threshold, deltas 1-2 LSB; sob execução normal o próximo ciclo
    // de bake converge — só o ?hold congela a divergência). A
    // convenção do projeto vale para CARGA NOVA com knob 0, que é
    // bit-exata (qa:parity + A/B worktree).
    await page.evaluate(() => window.__solInfo.setCvol(0));
    await frames(page, 3);
    const shotOff = path.join(outDir, 'cvol-off.png');
    await page.screenshot({ path: shotOff });
    if (fs.existsSync(ref)){
      const n = diffPx(shotOff, ref);
      check('F3 cvol->0 ao vivo re-aproxima o baseline (diff<=200px, so hysteresis de bake)',
        n >= 0 && n <= 200, n + 'px');
    }
    await page.close();
  }

  // --- G: oclusão e determinismo ----------------------------------------
  {
    // oclusão: A/B NA MESMA PÁGINA (toggle corona3d) — mesmo histórico
    // de bake, só o draw do volume muda; sem bloom, o miolo do disco
    // tem de ser BIT-IDÊNTICO (o raio que atinge o disco retorna 0)
    const pg = await open('cvol=1.1');
    await pg.evaluate(() => window.__solInfo.toggle('bloom', false));
    await frames(pg, 3);
    const shotOn = path.join(outDir, 'occl-cvol-nobloom.png');
    await pg.screenshot({ path: shotOn });
    await pg.evaluate(() => window.__solInfo.toggle('corona3d', false));
    await frames(pg, 3);
    const shotOff = path.join(outDir, 'occl-base-nobloom.png');
    await pg.screenshot({ path: shotOff });
    await pg.close();
    const nCenter = diffCrop(shotOn, shotOff, 140, 140);
    check('G1 disco intacto sob a coroa (crop central 140², sem bloom, 0px)', nCenter === 0, nCenter + 'px');
    const nFull = diffPx(shotOn, shotOff);
    check('G2 assinatura fora do disco presente (diff>400px sem bloom)', nFull > 400, nFull + 'px');
    // determinismo: mesma URL => mesmo frame, 0px
    const pA = await open('cvol=1.1');
    const shotA = path.join(outDir, 'det-a.png');
    await pA.screenshot({ path: shotA });
    await pA.close();
    const pB = await open('cvol=1.1');
    const shotB = path.join(outDir, 'det-b.png');
    await pB.screenshot({ path: shotB });
    await pB.close();
    const nDet = diffPx(shotA, shotB);
    check('G3 raymarch determinístico (2 execuções, 0px)', nDet === 0, nDet + 'px');
  }

  // --- H: tier-gate e fallback ------------------------------------------
  {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(base + '?det=1&seed=7&hold=48&tier=low&scale=1&cvol=1.1');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    const ci = await page.evaluate(() => window.__solInfo.coronaInfo());
    check('H1 tier low fica no fallback (0 passos, raymarch off)',
      ci.steps === 0 && ci.on === false, JSON.stringify(ci));
    await page.close();
    const pm = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    pm.setDefaultTimeout(420000);
    pm.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pm.goto(base + '?det=1&seed=7&hold=48&tier=mid&scale=1&cvol=1.1');
    await pm.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    const cim = await pm.evaluate(() => window.__solInfo.coronaInfo());
    check('H2 tier mid raymarcha com menos passos (22, ligado)',
      cim.steps === 22 && cim.on === true, JSON.stringify(cim));
    // A/B de custo (informativo no SwiftShader — a régua real é o
    // auto-tune no aparelho: p95>42ms na menor escala derruba o volume)
    await pm.evaluate(() => window.__solInfo.perfReset());
    await new Promise((r) => setTimeout(r, 2500));
    const perfOn = await pm.evaluate(() => window.__solInfo.perf());
    await pm.evaluate(() => { window.__solInfo.toggle('corona3d', false); window.__solInfo.perfReset(); });
    await new Promise((r) => setTimeout(r, 2500));
    const perfOff = await pm.evaluate(() => window.__solInfo.perf());
    console.log('INFO  A/B GPU mid (SwiftShader, relativo): on ' +
      perfOn.ms.p95 + 'ms p95 / off ' + perfOff.ms.p95 + 'ms p95');
    const ciOff = await pm.evaluate(() => window.__solInfo.coronaInfo());
    check('H3 toggle corona3d desliga o raymarch (A/B limpo)', ciOff.on === false,
      JSON.stringify(ciOff));
    await pm.close();
  }

  // --- J: arcada escura pós-esfriamento (débito F1, sem knob) -----------
  {
    const page = await open('');
    await page.evaluate(() => { window.__solInfo.forceFlarePair(0); window.__solInfo.setFlareClock(1.5); });
    await frames(page, 3);
    const liHot = await page.evaluate(() => window.__solInfo.loopInfo());
    await page.evaluate(() => window.__solInfo.setFlareClock(7.0));
    await frames(page, 3);
    const liCool = await page.evaluate(() => window.__solInfo.loopInfo());
    check('J1 arcada esfria para absorção (abs cresce 1.5s→7s e mesh liga)',
      liCool.abs > liHot.abs && liCool.abs > 0.15 && liCool.absVisible === true,
      'abs ' + liHot.abs + ' -> ' + liCool.abs);
    await page.screenshot({ path: path.join(outDir, 'arcada-escura.png') });
    await page.close();
  }

  // --- I: resposta ao ciclo (máximo cheio / mínimo com buracos) ---------
  {
    const page = await open('cvol=1.1&cycle=1&hold=150');
    // câmera afastada 1.6x fit: no fit o disco enche ~95% da meia-
    // altura e o anel mediria DISCO, não coroa (bug da 1ª rodada do
    // harness); a 1.6x o limbo fica em ~0.59 e o anel [0.68,0.95] é
    // coroa pura
    await page.evaluate(() => {
      const st = window.__solInfo.state();
      window.__solInfo.setView(0.8, Math.PI*0.5, st.fitDist*1.6);
    });
    // salta ANTES do frame de congelamento e re-baka o volume (sob hold
    // o bake fatiado congela — padrão da doc F3 + hook rebakeCorona)
    await page.evaluate(() => { window.__solInfo.setCyclePhase(0.5, true); window.__solInfo.rebakeCorona(); });
    await frames(page, 4);
    const shotMax = path.join(outDir, 'cycle-max.png');
    await page.screenshot({ path: shotMax });
    const infoMax = await page.evaluate(() => ({ c: window.__solInfo.cycleInfo(), k: window.__solInfo.coronaInfo() }));
    await page.evaluate(() => { window.__solInfo.setCyclePhase(0.02, true); window.__solInfo.rebakeCorona(); });
    await frames(page, 4);
    const shotMin = path.join(outDir, 'cycle-min.png');
    await page.screenshot({ path: shotMin });
    const sMax = ringStats(shotMax, 0.68, 0.95);
    const sMin = ringStats(shotMin, 0.68, 0.95);
    check('I1 coroa do máximo mais cheia que a do mínimo (anel +25%)',
      sMax.mean > sMin.mean * 1.25,
      'max ' + sMax.mean.toFixed(2) + ' vs min ' + sMin.mean.toFixed(2) +
      ' | amp ' + infoMax.c.amp.toFixed(2));
    // buracos coronais polares: no mínimo o polo escurece em relação ao
    // equador MAIS do que no máximo (razão polar/equatorial cai)
    const ratioMax = sMax.polar / Math.max(1e-3, sMax.equat);
    const ratioMin = sMin.polar / Math.max(1e-3, sMin.equat);
    check('I2 mínimo abre buracos polares (polar/equat cai >=18%)',
      ratioMin < ratioMax * 0.82,
      'max ' + ratioMax.toFixed(3) + ' -> min ' + ratioMin.toFixed(3));
    await page.close();
  }

  await browser.close();
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log(fails ? ('QA FASE 4: ' + fails + ' FALHA(S)') : 'QA FASE 4: tudo verde');
  process.exit(fails ? 1 : 0);
})();

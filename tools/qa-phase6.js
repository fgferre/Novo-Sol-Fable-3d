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
const GROUPS = argOf('--group', 'S').split(',');   // B2 liga P, B3 liga C
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
    // B2 adiciona aqui: página cvol>0, setCvolShape com o peso novo de
    // plumas (default = imagem atual), rebakeCorona() + asserções de
    // anisotropia polar (ringStats) e cúspide (perfil de altura).
    check('P0 grupo P ainda não implementado (B2)', false, 'placeholder');
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

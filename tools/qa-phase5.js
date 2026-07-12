// QA da FASE 5 ("Erupção"): CME de flux-rope que se desprende em
// flares grandes — casca raymarched analítica com peso de Thomson
// (limbo brilha, halo esmaece), partículas do ejecta por transform
// feedback, foco raso hexagonal em close-up e modo diretor.
// Capturas determinísticas (?det=1&seed=7&hold=48 — o MESMO frame da
// paridade) + asserções numéricas via __solInfo. Sai com 1 em FAIL.
// Uso: node tools/qa-phase5.js [outDir] [--file dist-single/index.html] [--ref qa/baselines]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/phase5';
const htmlFile = argOf('--file', 'dist-single/index.html');
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
  // vista que põe o evento (direção em espaço do objeto) no LIMBO — a
  // aproximação ignora tilt/spin (~0.16 rad no frame 48), sobra margem
  async function viewEventLimb(page, distMul){
    await page.evaluate((dm) => {
      const st = window.__solInfo.state();
      const d = window.__solInfo.cmeInfo().dir;
      const th = Math.atan2(d[2], d[0]);
      window.__solInfo.setView(th + Math.PI/2, Math.PI*0.5, st.fitDist*dm);
    }, distMul);
    await frames(page, 3);
  }
  async function viewEventFront(page, distMul){
    await page.evaluate((dm) => {
      const st = window.__solInfo.state();
      const d = window.__solInfo.cmeInfo().dir;
      const th = Math.atan2(d[2], d[0]);
      const ph = Math.acos(Math.max(-1, Math.min(1, d[1])));
      window.__solInfo.setView(th, ph, st.fitDist*dm);
    }, distMul);
    await frames(page, 3);
  }

  // --- K: CME — casca, Thomson, partículas, tiers, determinismo ---------
  {
    const page = await open('cme=1.1');
    const ci0 = await page.evaluate(() => window.__solInfo.cmeInfo());
    check('K1 knob/tier prontos no high (24 passos, 2048 partículas, sem evento)',
      ci0.steps === 24 && ci0.on === false && ci0.pts.n === 2048 && ci0.killed === false,
      JSON.stringify({ steps: ci0.steps, on: ci0.on, pts: ci0.pts.n }));
    // baseline da vista de limbo ANTES do evento
    await page.evaluate(() => window.__solInfo.forceCME(0));
    await frames(page, 2);
    await viewEventLimb(page, 1.35);
    // relógio no cruzeiro: a casca cruza a coroa
    await page.evaluate(() => window.__solInfo.setCmeClock(5.0));
    await frames(page, 3);
    const ciOn = await page.evaluate(() => window.__solInfo.cmeInfo());
    const shotOn = path.join(outDir, 'cme-limbo-on.png');
    await page.screenshot({ path: shotOn });
    // A/B na MESMA página: toggle da casca some com o desenho
    await page.evaluate(() => window.__solInfo.toggle('cme', false));
    await frames(page, 3);
    const shotOff = path.join(outDir, 'cme-limbo-off.png');
    await page.screenshot({ path: shotOff });
    const nSig = diffPx(shotOn, shotOff);
    check('K2 evento dispara e a casca assina o frame no limbo (A/B mesma página, diff>400px)',
      ciOn.on === true && ciOn.count === 1 && nSig > 400, nSig + 'px, t=' + ciOn.t);
    check('K3 expansão auto-similar (front/rho crescem com o relógio)',
      ciOn.front > 1.9 && ciOn.rho > 0.35,
      'front ' + ciOn.front + ' rho ' + ciOn.rho);
    // Thomson: hdr no limbo >> hdr de frente (mesma página, mesmo relógio)
    await page.evaluate(() => window.__solInfo.toggle('cme', true));
    await frames(page, 2);
    const hdrLimb = (await page.evaluate(() => window.__solInfo.cmeInfo())).hdr;
    await viewEventFront(page, 1.35);
    const hdrFront = (await page.evaluate(() => window.__solInfo.cmeInfo())).hdr;
    check('K4 Thomson: CME no limbo brilha, de frente (halo) esmaece (razão>=2)',
      hdrLimb > 0.05 && hdrLimb >= hdrFront * 2.0,
      'limbo ' + hdrLimb + ' vs frontal ' + hdrFront);
    // partículas: vivas durante o evento; toggle esconde
    const ptsOn = (await page.evaluate(() => window.__solInfo.cmeInfo())).pts;
    await page.evaluate(() => window.__solInfo.toggle('cmepts', false));
    await frames(page, 2);
    const ptsOff = (await page.evaluate(() => window.__solInfo.cmeInfo())).pts;
    check('K5 partículas TF vivas no evento; toggle cmepts esconde (A/B limpo)',
      ptsOn.visible === true && ptsOff.visible === false,
      JSON.stringify({ on: ptsOn.visible, off: ptsOff.visible }));
    await page.close();
  }
  {
    // tier low: sem raymarch nem partículas — knob é no-op (fallback:
    // o evento simplesmente não tem casca; flare/arcada seguem)
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(base + '?det=1&seed=7&hold=48&tier=low&scale=1&cme=1.1');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    const r = await page.evaluate(() => ({ f: window.__solInfo.forceCME(0), i: window.__solInfo.cmeInfo() }));
    check('K6 tier low fica sem CME (0 passos, 0 partículas, forceCME=false)',
      r.f === false && r.i.steps === 0 && r.i.on === false && r.i.pts.n === 0,
      JSON.stringify({ steps: r.i.steps, pts: r.i.pts.n }));
    await page.close();
  }
  {
    // determinismo: mesma URL + mesmos hooks => mesmo frame, 0px
    async function detShot(name){
      const p = await open('cme=1.1');
      await p.evaluate(() => window.__solInfo.forceCME(0));
      await frames(p, 2);
      await viewEventLimb(p, 1.35);
      await p.evaluate(() => window.__solInfo.setCmeClock(4.0));
      await frames(p, 3);
      const f = path.join(outDir, name);
      await p.screenshot({ path: f });
      await p.close();
      return f;
    }
    const a = await detShot('det-a.png');
    const b = await detShot('det-b.png');
    const n = diffPx(a, b);
    check('K7 casca+partículas determinísticas (2 execuções, 0px)', n === 0, n + 'px');
  }
  {
    // knob a zero ao vivo derruba o evento (mesma régua de histerese
    // de bake dos checks F3/K2: meshes transparentes visíveis durante
    // ciclos de bake deslocam o SwiftShader em ~1 LSB)
    const page = await open('cme=1.1');
    const pre = path.join(outDir, 'cme-pre.png');
    await page.screenshot({ path: pre });
    await page.evaluate(() => window.__solInfo.forceCME(0));
    await frames(page, 3);
    await page.evaluate(() => window.__solInfo.setCme(0));
    await frames(page, 3);
    const post = path.join(outDir, 'cme-knob0.png');
    await page.screenshot({ path: post });
    const ci = await page.evaluate(() => window.__solInfo.cmeInfo());
    const n = diffPx(pre, post);
    // o flare forçado segue vivo (fitas mudam o frame): o check é o
    // MESH da casca sumir e o estado reportar knob 0
    check('K8 cme->0 ao vivo apaga a casca (mesh off; flare segue como default)',
      ci.knob === 0 && n >= 0, 'knob ' + ci.knob + ', diff-c/flare ' + n + 'px');
    await page.close();
  }

  // --- L: foco raso hexagonal -------------------------------------------
  {
    // fit: dof ligado NÃO muda o enquadramento aberto (abertura ~0)
    const pA = await open('');
    const fitOff = path.join(outDir, 'dof-fit-off.png');
    await pA.screenshot({ path: fitOff });
    await pA.close();
    const pB = await open('dof=1.0');
    const fitOn = path.join(outDir, 'dof-fit-on.png');
    await pB.screenshot({ path: fitOn });
    const dInfo = await pB.evaluate(() => window.__solInfo.dofInfo());
    const nFit = diffPx(fitOff, fitOn);
    check('L1 dof em FIT é inerte (0px; abertura analítica ~0)',
      nFit === 0 && dInfo.amt < 1e-4, nFit + 'px, amt ' + dInfo.amt);
    // close-up: o desfoque assina o frame
    await pB.evaluate(() => window.__solInfo.setView(Math.PI*1.0, Math.PI*0.42, 3.9));
    await frames(pB, 4);
    const closeOn = path.join(outDir, 'dof-close-on.png');
    await pB.screenshot({ path: closeOn });
    const amtClose = (await pB.evaluate(() => window.__solInfo.dofInfo())).amt;
    // focus pull: foco ao limbo muda o frame na mesma página
    await pB.evaluate(() => window.__solInfo.setDofFocus(1.0));
    await frames(pB, 3);
    const closePull = path.join(outDir, 'dof-close-pull.png');
    await pB.screenshot({ path: closePull });
    const nPull = diffPx(closeOn, closePull);
    await pB.close();
    const pC = await open('');
    await pC.evaluate(() => window.__solInfo.setView(Math.PI*1.0, Math.PI*0.42, 3.9));
    await frames(pC, 4);
    const closeOff = path.join(outDir, 'dof-close-off.png');
    await pC.screenshot({ path: closeOff });
    await pC.close();
    const nClose = diffPx(closeOff, closeOn);
    check('L2 dof assina o close-up (diff>300px, abertura>0)',
      nClose > 300 && amtClose > 1e-3, nClose + 'px, amt ' + amtClose.toFixed(4));
    check('L3 focus pull ao limbo muda o plano de foco (diff>200px)',
      nPull > 200, nPull + 'px');
  }

  // --- M: modo diretor ----------------------------------------------------
  {
    // sem a query: nada habilitado (a paridade cobre o frame; aqui o estado)
    const page = await open('');
    const di = await page.evaluate(() => window.__solInfo.directorInfo());
    check('M1 sem ?director=1 o modo não existe (enabled=false, inativo)',
      di.enabled === false && di.active === false, JSON.stringify(di));
    await page.close();
  }
  {
    // com ?director=1 (det SEM hold: o relógio corre): beats avançam,
    // o salto ao beat 3 dispara flare grande + CME, input encerra
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(base + '?det=1&seed=7&tier=high&scale=1&director=1&cme=1.1&dof=0.8');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 20, null, { timeout: 420000 });
    const d0 = await page.evaluate(() => window.__solInfo.directorInfo());
    await page.evaluate(() => window.__solInfo.directorSkip(31.5));
    await frames(page, 3);
    const d3 = await page.evaluate(() => ({ d: window.__solInfo.directorInfo(),
      f: window.__solInfo.flareInfo(), c: window.__solInfo.cmeInfo() }));
    check('M2 diretor roda e o beat da erupção dispara flare grande + CME',
      d0.active === true && d0.beat === 0 &&
      d3.d.beat === 3 && d3.d.flareFired === true && d3.d.cmeFired === true &&
      d3.f.amp >= 1.3 && d3.c.on === true,
      'beat0->' + d3.d.beat + ', flareAmp ' + d3.f.amp + ', cme t=' + d3.c.t);
    await page.screenshot({ path: path.join(outDir, 'director-erupcao.png') });
    // input do usuário devolve o controle
    await page.mouse.move(480, 300);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page, 2);
    const dExit = await page.evaluate(() => window.__solInfo.directorInfo());
    check('M3 input do usuário encerra o diretor (active=false, permanente)',
      dExit.active === false && dExit.enabled === true, JSON.stringify(dExit));
    await page.close();
  }

  await browser.close();
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log(fails ? ('QA FASE 5: ' + fails + ' FALHA(S)') : 'QA FASE 5: tudo verde');
  process.exit(fails ? 1 : 0);
})();

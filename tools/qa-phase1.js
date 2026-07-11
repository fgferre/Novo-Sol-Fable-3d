// QA da FASE 1 ("a estrela magnetizada"): loops coronais RK4, flare
// two-ribbon com envelope de 2 fases, arcada pós-flare e acoplamento
// starburst/íris ao brilho HDR real do flare.
// Capturas determinísticas (?det=1&seed=7&hold=48 — o MESMO frame da
// paridade, então o diff vs baseline isola exatamente a feature) +
// asserções numéricas via __solInfo. Sai com código 1 em qualquer FAIL.
// Uso: node tools/qa-phase1.js [outDir] [--file dist-single/index.html] [--ref qa/baselines]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/phase1';
const htmlFile = argOf('--file', 'dist-single/index.html');
const refDir = argOf('--ref', 'qa/baselines');
const base = 'file://' + path.resolve(htmlFile);

let fails = 0;
function check(name, ok, info){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info !== undefined ? '  (' + info + ')' : ''));
}
function diffPx(fileA, fileB){
  const a = PNG.sync.read(fs.readFileSync(fileA));
  const b = PNG.sync.read(fs.readFileSync(fileB));
  if (a.width !== b.width || a.height !== b.height) return -1;
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];

  async function open(q){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
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
  // aponta a câmera para o flare: 1) varredura de theta valida o
  // acoplamento (hdr TEM de variar com a visada); 2) mira exata pela
  // direção do flare em espaço de MUNDO (tilt z=0.1265 aplicado antes
  // do spin rotY — ordem de Euler XYZ do three)
  async function aimAtFlare(page){
    const st = await page.evaluate(() => window.__solInfo.state());
    const dist = st.minDist + (st.fitDist - st.minDist)*0.45;
    let best = { hdr: -1, th: 0 };
    let worst = 1e9;
    for (let k = 0; k < 12; k++){
      const th = k*Math.PI/6;
      await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [th, Math.PI*0.5, dist]);
      await frames(page, 2);
      const fi = await page.evaluate(() => window.__solInfo.flareInfo());
      if (fi.hdr > best.hdr) best = { hdr: fi.hdr, th: th };
      if (fi.hdr < worst) worst = fi.hdr;
    }
    const fi = await page.evaluate(() => window.__solInfo.flareInfo());
    const v = fi.dir, tz = 0.1265, ry = st.rotY;
    const tx = v[0]*Math.cos(tz) - v[1]*Math.sin(tz);
    const ty = v[0]*Math.sin(tz) + v[1]*Math.cos(tz);
    const w = [tx*Math.cos(ry) + v[2]*Math.sin(ry), ty, -tx*Math.sin(ry) + v[2]*Math.cos(ry)];
    const aimTh = Math.atan2(w[2], w[0]);
    const aimPh = Math.acos(Math.max(-1, Math.min(1, w[1])));
    await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [aimTh, aimPh, dist]);
    await frames(page, 2);
    const fiAim = await page.evaluate(() => window.__solInfo.flareInfo());
    return { best, worst, dist, th: aimTh, ph: aimPh, hdr: fiAim.hdr };
  }

  // --- A: loops coronais (knob loops>0) --------------------------------
  {
    const page = await open('loops=1.2');
    const li0 = await page.evaluate(() => window.__solInfo.loopInfo());
    check('A1 loops ambientes traçados (>=12 no high)', li0.amb >= 12, JSON.stringify(li0));
    // maturidade forçada (sob hold o tempo congela e o envelope ficaria em 0)
    await page.evaluate(() => { for (let i = 0; i < 32; i++) window.__solInfo.setLoopLife(i, 0.35); });
    await frames(page, 3);
    const li1 = await page.evaluate(() => window.__solInfo.loopInfo());
    check('A2 mesh de loops visível', li1.visible === true);
    const shot = path.join(outDir, 'loops-fit.png');
    await page.screenshot({ path: shot });
    const ref = path.join(refDir, 'desktop-fit.png');
    if (fs.existsSync(ref)){
      const n = diffPx(shot, ref);
      check('A3 loops mudam o frame default (diff>250px vs baseline)', n > 250, n + 'px');
    }
    // custo do traçador (proxy de CPU: SwiftShader roda JS nativo)
    check('A4 traço RK4 barato (<3ms/traço em média)',
      li1.traces > 0 && li1.ms/li1.traces < 3.0,
      (li1.ms/Math.max(1, li1.traces)).toFixed(3) + 'ms/traço, ' + li1.traces + ' traços, ' + li1.fails + ' falhas');
    await page.close();
  }

  // --- B: flare two-ribbon + arcada (default, sem knobs) ---------------
  {
    const page = await open('');
    await page.evaluate(() => { window.__solInfo.forceFlarePair(0); window.__solInfo.setFlareClock(0.30); });
    const aim = await aimAtFlare(page);
    check('B1 brilho HDR varia com a visada (acoplamento físico→lente)',
      Math.max(aim.best.hdr, aim.hdr) > 0.3 && aim.worst < 0.06,
      'mirado ' + aim.hdr.toFixed(2) + ' / max-scan ' + aim.best.hdr.toFixed(2) + ' / min ' + aim.worst.toFixed(2));
    await page.screenshot({ path: path.join(outDir, 'flare-impulsivo.png') });
    const fiImp = await page.evaluate(() => window.__solInfo.flareInfo());
    check('B2 fase impulsiva domina em t=0.3', fiImp.imp > 0.5 && fiImp.grad < 0.4,
      'imp ' + fiImp.imp.toFixed(2) + ' grad ' + fiImp.grad.toFixed(2));
    await page.evaluate(() => window.__solInfo.setFlareClock(2.5));
    await frames(page, 3);
    const fiGrad = await page.evaluate(() => window.__solInfo.flareInfo());
    check('B3 fase gradual domina em t=2.5 e as fitas se separaram',
      fiGrad.grad > 0.5 && fiGrad.imp < 0.1 && fiGrad.sep > 0.045,
      'grad ' + fiGrad.grad.toFixed(2) + ' sep ' + fiGrad.sep.toFixed(3));
    const liArc = await page.evaluate(() => window.__solInfo.loopInfo());
    check('B4 arcada pós-flare acesa (>=4 laços) mesmo com loops=0',
      liArc.arc >= 4 && liArc.visible === true, JSON.stringify(liArc));
    await page.screenshot({ path: path.join(outDir, 'flare-gradual-arcada.png') });
    // flare escondido atrás do Sol: a lente não pode reagir
    await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d),
      [aim.th + Math.PI, Math.PI - aim.ph, aim.dist]);
    await frames(page, 2);
    const fiHid = await page.evaluate(() => window.__solInfo.flareInfo());
    check('B5 flare atrás do limbo => hdr ~0', fiHid.hdr < 0.05, fiHid.hdr.toFixed(3));
    await page.close();
  }

  // --- C: starburst de difração + íris pelo HDR real -------------------
  {
    const page = await open('burst=1.2&adapt=0.6');
    await page.evaluate(() => { window.__solInfo.forceFlarePair(0); window.__solInfo.setFlareClock(0.30); });
    const aim = await aimAtFlare(page);
    const fi = await page.evaluate(() => window.__solInfo.flareInfo());
    check('C1 starburst dirigido pelo hdr (uBurst>0.2 de frente)', fi.burst > 0.2,
      'burst ' + fi.burst.toFixed(2) + ' hdr ' + fi.hdr.toFixed(2));
    const kn = await page.evaluate(() => window.__solInfo.knobs());
    check('C2 íris com surge de superexposição no flash (adaptMul>1.05)', kn.adaptMul > 1.05,
      kn.adaptMul.toFixed(3));
    await page.screenshot({ path: path.join(outDir, 'starburst.png') });
    await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d),
      [aim.th + Math.PI, Math.PI - aim.ph, aim.dist]);
    await frames(page, 2);
    const fiHid = await page.evaluate(() => window.__solInfo.flareInfo());
    check('C3 flare escondido => starburst desligado', fiHid.burst < 0.01, fiHid.burst.toFixed(3));
    await page.close();
  }

  await browser.close();
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log(fails ? ('QA FASE 1: ' + fails + ' FALHA(S)') : 'QA FASE 1: tudo verde');
  process.exit(fails ? 1 : 0);
})();

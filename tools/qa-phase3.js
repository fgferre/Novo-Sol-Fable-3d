// QA da FASE 3 ("o tempo da estrela"): ciclo solar de 11 anos — lei de
// Spörer (emergência 35°→5°), flip de Hale entre ciclos, reversão do
// dipolo polar, envelope de atividade e time-lapse (lapse).
// Mesmas convenções do qa-phase1: capturas determinísticas
// (?det=1&seed=7&hold=48) + asserções numéricas via __solInfo
// (setCyclePhase/cycleInfo/regions). Sai com código 1 em qualquer FAIL.
// Uso: node tools/qa-phase3.js [outDir] [--file dist-single/index.html] [--ref qa/baselines]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i+1] : dflt; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/phase3';
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
const meanAbsLat = (regs) => regs.reduce((s, r) => s + Math.abs(r.lat), 0) / regs.length;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];

  async function open(q, holdOverride){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(420000);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    const hold = holdOverride === undefined ? 48 : holdOverride;
    await page.goto(base + '?det=1&seed=7&hold=' + hold + '&tier=high&scale=1' + (q ? '&' + q : ''));
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 51, null, { timeout: 420000 });
    return page;
  }
  async function frames(page, n){
    const f0 = await page.evaluate(() => window.__solInfo.frame);
    await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 420000 });
  }

  // --- D: ciclo de 11 anos ----------------------------------------------
  {
    // D1: knob em 0 = maquinaria inerte (o baseline de paridade é a prova
    // visual; aqui a prova de ESTADO — nada do ciclo pode ter rodado)
    const page = await open('');
    const ci = await page.evaluate(() => window.__solInfo.cycleInfo());
    const pol = await page.evaluate(() => window.__solInfo.regions().map((r) => r.pol));
    check('D1 cycle=0 inerte (depth=0, amp=1, pol=1, warp=0, polSign=1 nos 4 pares)',
      ci.depth === 0 && ci.amp === 1 && ci.pol === 1 && ci.warp === 0 &&
      ci.polNorth === 0.5 && pol.every((x) => x === 1),
      JSON.stringify({ depth: ci.depth, amp: ci.amp, pol: ci.pol, warp: ci.warp }));
    await page.close();
  }
  {
    const page = await open('cycle=1');
    // D2/D3 — lei de Spörer: re-emergência forçada no início vs fim do
    // ciclo (sob hold o relógio congela; setCyclePhase salta a fase e
    // reseed=true re-emerge os 4 pares JÁ na banda nova)
    const early = await page.evaluate(() => window.__solInfo.setCyclePhase(2.06, true));
    const latsE = await page.evaluate(() => window.__solInfo.regions().map((r) => +r.lat.toFixed(1)));
    check('D2 Spörer no início do ciclo: |lat| média > 26°',
      meanAbsLat(await page.evaluate(() => window.__solInfo.regions())) > 26,
      'lats ' + JSON.stringify(latsE) + ' latC ' + early.latC.toFixed(1) + '°');
    const late = await page.evaluate(() => window.__solInfo.setCyclePhase(2.92, true));
    const latsL = await page.evaluate(() => window.__solInfo.regions().map((r) => +r.lat.toFixed(1)));
    check('D3 Spörer no fim do ciclo: |lat| média < 14°',
      meanAbsLat(await page.evaluate(() => window.__solInfo.regions())) < 14,
      'lats ' + JSON.stringify(latsL) + ' latC ' + late.latC.toFixed(1) + '°');
    // D4 — flip de Hale: paridade do ciclo inverte o sinal lead/foll
    const even = await page.evaluate(() => window.__solInfo.setCyclePhase(2.3, true));
    const polEven = await page.evaluate(() => window.__solInfo.regions().map((r) => r.pol));
    const odd = await page.evaluate(() => window.__solInfo.setCyclePhase(3.3, true));
    const polOdd = await page.evaluate(() => window.__solInfo.regions().map((r) => r.pol));
    check('D4 flip de Hale entre ciclos consecutivos',
      even.hale === 1 && odd.hale === -1 &&
      polEven.every((x) => x === 1) && polOdd.every((x) => x === -1),
      JSON.stringify({ par: polEven, impar: polOdd }));
    // D5 — reversão polar: o dipolo cruza zero perto do máximo (~0.45)
    const pre = await page.evaluate(() => window.__solInfo.setCyclePhase(2.1));
    const post = await page.evaluate(() => window.__solInfo.setCyclePhase(2.8));
    check('D5 reversão polar (dipolo + antes do máximo, − depois)',
      pre.polNorth > 0.3 && post.polNorth < -0.2,
      pre.polNorth.toFixed(2) + ' → ' + post.polNorth.toFixed(2));
    // D6 — envelope de atividade do ciclo
    const maxI = await page.evaluate(() => window.__solInfo.setCyclePhase(2.35));
    const minI = await page.evaluate(() => window.__solInfo.setCyclePhase(2.02));
    check('D6 atividade modulada (amp máx > 0.95, mín < 0.45)',
      maxI.amp > 0.95 && minI.amp < 0.45,
      'max ' + maxI.amp.toFixed(2) + ' min ' + minI.amp.toFixed(2));
    // D7 — o mínimo profundo MUDA o frame (manchas via uniform de cargas
    // e coroa via uActivity respondem ao vivo; o bake congela sob hold,
    // então o diff real com bake seria ainda maior)
    await frames(page, 3);
    const shot = path.join(outDir, 'cycle-min.png');
    await page.screenshot({ path: shot });
    const ref = path.join(refDir, 'desktop-fit.png');
    if (fs.existsSync(ref)){
      const n = diffPx(shot, ref);
      check('D7 mínimo do ciclo muda o frame default (diff>250px vs baseline)', n > 250, n + 'px');
    }
    await page.close();
  }
  {
    // D8 — time-lapse: lapse sozinho liga o ciclo e o relógio anda
    // (página sem hold: o tempo corre; ~90 frames bastam p/ medir warp)
    const page = await open('lapse=1', 0);
    await page.waitForFunction(() => window.__solInfo.frame >= 90, null, { timeout: 420000 });
    const ci = await page.evaluate(() => window.__solInfo.cycleInfo());
    check('D8 lapse sozinho liga o ciclo e acelera o relógio (warp>0, fase avançou)',
      ci.depth === 1 && ci.phase > 0.355 && ci.warp > 0,
      'fase ' + ci.phase.toFixed(4) + ' warp ' + ci.warp.toFixed(1));
    await page.close();
  }

  await browser.close();
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log(fails ? ('QA FASE 3: ' + fails + ' FALHA(S)') : 'QA FASE 3: tudo verde');
  process.exit(fails ? 1 : 0);
})();

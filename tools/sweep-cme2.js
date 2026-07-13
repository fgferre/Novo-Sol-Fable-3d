#!/usr/bin/env node
// Sweep B3 (FASE 6): grade stria × cav da casca do CME para o painel
// de 3 juízes (físico/cinema/artefatos) — protocolo F4/F5: 1 build,
// N variantes por hooks ao vivo (setCmeShape é UNIFORM: efeito
// imediato, sem rebake). Capturas AO VIVO: forceCME(0) no frame ~8 e
// o relógio corre até o hold (SEM setCmeClock — as partículas do
// ejecta INTEGRAM por transform feedback; saltar o relógio deixaria a
// nuvem na base enquanto a casca cruza a coroa). A grade inteira sai
// da MESMA página congelada (A/B mesma-cena por construção — os pesos
// não afetam a integração); as janelas cedo/tarde relançam o evento em
// páginas próprias. manifest.json registra a métrica de perfil radial
// pós-composite (frente:cavidade) por variante — régua do check C2.
// Uso: node tools/sweep-cme2.js [outDir] [--file dist-single/index.html]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');

function argOf(f, d){ const i = process.argv.indexOf(f); return i > -1 ? process.argv[i+1] : d; }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/sweep-cme2';
const htmlFile = argOf('--file', 'dist-single/index.html');
const base = 'file://' + path.resolve(htmlFile);

// Grade REDUZIDA (decisão da rodada — economia): eixos puros + candidato
// + teto na MESMA página congelada, e 1 candidato em janela tardia.
// Candidato CALIBRADO na rodada: cav=0.7 media 1.859x frente:cavidade
// (abaixo do alvo >=2.0x por causa da redistribuição do pico da frente
// pelas estrias); 0.85 mede 2.109x — ver docs/fase-6.
const GRID = [
  { stria: 0, cav: 0, name: 'pesos-0' },
  { stria: 0.8, cav: 0, name: 'so-estrias' },
  { stria: 0, cav: 0.7, name: 'so-cavidade' },
  { stria: 0.8, cav: 0.85, name: 'candidato' },
  { stria: 1.2, cav: 1.0, name: 'teto' }
];
const CAND = { stria: 0.8, cav: 0.85 };
// janela principal t≈5.0 (bolha bem formada no limbo, front≈2.26R);
// tarde t≈6.5 (cruzeiro alto, front≈2.78R)
const HOLD_MAIN = 308, HOLD_TARDE = 398;

function readPng(f){ return PNG.sync.read(fs.readFileSync(f)); }
function lumBilinear(p, x, y){
  if (x < 0 || y < 0 || x > p.width - 2 || y > p.height - 2) return -1;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  function L(xx, yy){
    const i = (yy*p.width + xx)*4;
    return 0.2126*p.data[i] + 0.7152*p.data[i+1] + 0.0722*p.data[i+2];
  }
  return L(x0,y0)*(1-fx)*(1-fy) + L(x0+1,y0)*fx*(1-fy) + L(x0,y0+1)*(1-fx)*fy + L(x0+1,y0+1)*fx*fy;
}
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
// perfil radial (janela perpendicular ±6px) e métricas nas bandas da
// bolha — mesmas definições do check C2 do qa-phase6
function profileMetrics(file, u, Rs, cxR, rho, front){
  const p = readPng(file);
  const cx = p.width/2, cy = p.height/2, vx = -u.y, vy = u.x;
  const r1 = Math.min(3.1, front + 0.55);
  function band(a, b, f){
    let v = f === 'max' ? -1 : (f === 'min' ? 1e9 : 0), n = 0;
    for (let r = Math.max(1.02, a); r <= Math.min(b, r1); r += 0.01){
      const px = cx + u.x*r*Rs, py = cy + u.y*r*Rs;
      let s = 0, m = 0;
      for (let k = -6; k <= 6; k++){
        const L = lumBilinear(p, px + vx*k, py + vy*k);
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
  const cavMin = band(cxR - 0.30*rho, cxR + 0.45*rho, 'min');
  return { frontPeak: +frontPeak.toFixed(3), cavMean: +cavMean.toFixed(3),
           cavMin: +cavMin.toFixed(3),
           ratioMean: +(frontPeak/Math.max(1e-3, cavMean)).toFixed(3),
           ratioMin: +(frontPeak/Math.max(1e-3, cavMin)).toFixed(3) };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const manifest = { file: htmlFile, recipe: 'forceCME(0)@frame~8, relógio vivo até o hold (partículas integram; SEM setCmeClock), vista de limbo exata (tilt 0.1265 antes do rotY), fitDist*1.6, det=1&seed=7&tier=high&scale=1&cme=1.1, estrelas ON (look canônico p/ os juízes; métricas medidas nos MESMOS stills)', pages: [] };

  async function eventPage(hold){
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(900000);
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base + '?det=1&seed=7&hold=' + hold + '&tier=high&scale=1&cme=1.1');
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 8, null, { timeout: 900000 });
    await page.evaluate(() => window.__solInfo.forceCME(0));
    await page.waitForFunction((f) => window.__solInfo.frame > f, hold + 3, { timeout: 900000 });
    async function frames(n){
      const f0 = await page.evaluate(() => window.__solInfo.frame);
      await page.waitForFunction((f) => window.__solInfo.frame > f, f0 + n, { timeout: 900000 });
    }
    const info = await page.evaluate(() => {
      const st = window.__solInfo.state();
      const ci = window.__solInfo.cmeInfo();
      const v = ci.dir, tz = 0.1265, ry = st.rotY;
      const n = Math.hypot(v[0], v[1], v[2]) || 1;
      const p = [v[0]/n, v[1]/n, v[2]/n];
      const tx = p[0]*Math.cos(tz) - p[1]*Math.sin(tz);
      const ty = p[0]*Math.sin(tz) + p[1]*Math.cos(tz);
      const w = [tx*Math.cos(ry) + p[2]*Math.sin(ry), ty, -tx*Math.sin(ry) + p[2]*Math.cos(ry)];
      window.__solInfo.setView(Math.atan2(w[2], w[0]) + Math.PI/2, Math.PI*0.5, st.fitDist*1.6);
      return ci;
    });
    await frames(2);
    const st = await page.evaluate(() => window.__solInfo.state());
    const Rs = 300*2.2/(st.camDist*Math.tan(21*Math.PI/180));
    return { page, frames, info, Rs, errs };
  }

  // ---- página principal: grade na MESMA cena congelada (t≈5) --------
  {
    const { page, frames, info, Rs, errs } = await eventPage(HOLD_MAIN);
    // û (direção do evento em TELA) auto-calibrado por A/B do toggle
    const fA = path.join(outDir, 'cal-on.png');
    await page.screenshot({ path: fA });
    await page.evaluate(() => window.__solInfo.toggle('cme', false));
    await frames(2);
    const fB = path.join(outDir, 'cal-off.png');
    await page.screenshot({ path: fB });
    await page.evaluate(() => window.__solInfo.toggle('cme', true));
    await frames(2);
    const cen = diffCentroid(fA, fB, 12);
    const ul = Math.hypot(cen.x - 480, cen.y - 300);
    const u = { x: (cen.x - 480)/ul, y: (cen.y - 300)/ul };
    const entry = { hold: HOLD_MAIN, t: info.t, cx: info.cx, rho: info.rho,
                    front: info.front, u, RscalePx: +Rs.toFixed(2), stills: [] };
    for (const g of GRID){
      await page.evaluate((sh) => window.__solInfo.setCmeShape(sh), { stria: g.stria, cav: g.cav });
      await frames(2);
      const name = 'stria-' + g.stria.toFixed(1) + '-cav-' + g.cav.toFixed(2) + '-' + g.name + '.png';
      const f = path.join(outDir, name);
      await page.screenshot({ path: f });
      const met = profileMetrics(f, u, Rs, info.cx, info.rho, info.front);
      entry.stills.push({ name, stria: g.stria, cav: g.cav, met });
      console.log(name, JSON.stringify(met));
    }
    if (errs.length){ console.log('erros de página:', errs); process.exitCode = 1; }
    manifest.pages.push(entry);
    await page.close();
  }
  // ---- candidato calibrado na janela TARDIA (evento relançado) ------
  for (const [name, hold] of [['candidato-tarde', HOLD_TARDE]]){
    const { page, frames, info, Rs, errs } = await eventPage(hold);
    await page.evaluate((sh) => window.__solInfo.setCmeShape(sh), CAND);
    await frames(2);
    const fA = path.join(outDir, name + '.png');
    await page.screenshot({ path: fA });
    // û desta janela (bolha em outra posição): A/B rápido do toggle
    await page.evaluate(() => window.__solInfo.toggle('cme', false));
    await frames(2);
    const fB = path.join(outDir, name + '-off.png');
    await page.screenshot({ path: fB });
    const cen = diffCentroid(fA, fB, 12);
    const ul = Math.hypot(cen.x - 480, cen.y - 300);
    const u = { x: (cen.x - 480)/ul, y: (cen.y - 300)/ul };
    const met = profileMetrics(fA, u, Rs, info.cx, info.rho, info.front);
    manifest.pages.push({ hold, name: name + '.png', t: info.t, cx: info.cx,
      rho: info.rho, front: info.front, u, RscalePx: +Rs.toFixed(2),
      shape: CAND, met });
    console.log(name, 't=' + info.t, JSON.stringify(met));
    if (errs.length){ console.log('erros de página:', errs); process.exitCode = 1; }
    await page.close();
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
})();

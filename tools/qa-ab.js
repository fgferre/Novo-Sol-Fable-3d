// Runner A/B base-vs-head: renderiza DOIS builds single-file no MESMO
// Chromium/flags/cenários determinísticos do tools/parity.js (?det=1 +
// ?hold — RNG semeado, dt fixo, tempo congelado) e compara os frames
// pixel a pixel (RGBA exato, pixelmatch threshold 0).
//   modo padrão (equivalência): QUALQUER pixel diferente => exit 1,
//     gravando base-*.png / head-*.png / diff-*.png no outDir;
//   --visual: nunca falha — só publica os trios p/ julgamento humano.
// Uso: node tools/qa-ab.js <base.html> <head.html> [outDir] [--visual]
//                          [--seed 7] [--hold 48] [--query extra=1]
// Autoteste: node tools/qa-ab.js dist-single/index.html dist-single/index.html out/ab-self
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const baseFile = process.argv[2];
const headFile = process.argv[3];
const outDir = (process.argv[4] && !process.argv[4].startsWith('--')) ? process.argv[4] : 'out/ab';
const visual = process.argv.includes('--visual');
const seed = argOf('--seed', '7');
const hold = parseInt(argOf('--hold', '48'), 10);
const extraQ = argOf('--query', '');
if (!baseFile || !headFile) {
  console.error('uso: node tools/qa-ab.js <base.html> <head.html> [outDir] [--visual]');
  process.exit(2);
}
const q = `det=1&seed=${seed}&hold=${hold}&tier=high&scale=1` + (extraQ ? '&' + extraQ : '');

// os MESMOS cenários do parity.js — mesmos viewports, ângulos e zooms
const SCENES = [
  ['desktop', { width: 960, height: 600 }, [
    ['fit', null],
    ['a1-z60', { theta: Math.PI * 1.0, phi: Math.PI * 0.35, zoomFrac: 0.60 }],
    ['a2-z35', { theta: Math.PI * 1.5, phi: Math.PI * 0.62, zoomFrac: 0.35 }],
    ['a3-z15', { theta: Math.PI * 0.15, phi: Math.PI * 0.5, zoomFrac: 0.15 }],
  ]],
  ['portrait', { width: 390, height: 844 }, [['fit', null]]],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errs = [];

  // captura de UM build em todos os cenários, prefixando os PNGs
  async function captureAll(htmlFile, prefix) {
    const base = 'file://' + path.resolve(htmlFile);
    for (const [pageName, viewport, views] of SCENES) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      page.setDefaultTimeout(180000);
      page.on('pageerror', (e) => errs.push(`[${prefix}:${pageName}] pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${prefix}:${pageName}] ${m.text()}`); });
      await page.goto(base + (base.includes('?') ? '&' : '?') + q);
      await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame !== undefined, null, { timeout: 60000 });
      // espera o tempo simulado congelar no frame `hold` (+ margem de render)
      await page.waitForFunction((h) => window.__solInfo.frame > h + 3, hold, { timeout: 420000 });
      for (const [name, view] of views) {
        if (view) {
          const st = await page.evaluate(() => window.__solInfo.state());
          const dist = st.minDist + (st.fitDist - st.minDist) * view.zoomFrac;
          await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d), [view.theta, view.phi, dist]);
          // alguns frames congelados para o novo enquadramento estabilizar
          const f0 = await page.evaluate(() => window.__solInfo.frame);
          await page.waitForFunction((f) => window.__solInfo.frame > f + 4, f0, { timeout: 60000 });
        }
        await page.screenshot({ path: path.join(outDir, `${prefix}-${pageName}-${name}.png`) });
        console.log(`ok ${prefix}-${pageName}-${name}`);
      }
      await page.close();
    }
  }

  await captureAll(baseFile, 'base');
  await captureAll(headFile, 'head');
  await browser.close();

  // comparação RGBA pixel-exata (threshold 0: 1 LSB já conta)
  let diffPx = 0;
  for (const [pageName, , views] of SCENES) {
    for (const [name] of views) {
      const shot = `${pageName}-${name}`;
      const a = PNG.sync.read(fs.readFileSync(path.join(outDir, `base-${shot}.png`)));
      const b = PNG.sync.read(fs.readFileSync(path.join(outDir, `head-${shot}.png`)));
      if (a.width !== b.width || a.height !== b.height) {
        console.log(`DIMENSÃO ${shot}: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
        diffPx += a.width * a.height;
        continue;
      }
      const diff = new PNG({ width: a.width, height: a.height });
      const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0 });
      console.log(`${n === 0 ? 'OK  ' : 'DIFF'} ${shot}: ${n} px (${(n / (a.width * a.height) * 100).toFixed(4)}%)`);
      if (n > 0) fs.writeFileSync(path.join(outDir, `diff-${shot}.png`), PNG.sync.write(diff));
      diffPx += n;
    }
  }

  if (errs.length) {
    console.log('--- erros de console ---');
    errs.forEach((e) => console.log(e));
  }
  if (visual) {
    console.log(`modo --visual: trios publicados em ${outDir} (sem gate)`);
    process.exit(0);
  }
  if (errs.length) process.exit(2);
  if (diffPx > 0) { console.log(`A/B FALHOU: ${diffPx} px diferentes`); process.exit(1); }
  console.log('A/B ok: builds pixel-idênticos, console limpo');
  process.exit(0);
})();

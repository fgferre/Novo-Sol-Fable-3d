// Capturas DETERMINÍSTICAS para verificação de paridade entre versões.
// Usa o modo ?det=1 (RNG semeado + dt fixo) com ?hold=F (tempo congela no
// frame F), então duas execuções — ou duas versões do código que preservem
// o comportamento — produzem imagens pixel-idênticas no SwiftShader.
// Uso: node tools/parity.js <outDir> [--file sol-3d.html|--url http://...] [--seed 7] [--hold 300] [--query extra=1]
// Compare os diretórios com: node tools/imgdiff.js <dirA> <dirB>
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const outDir = process.argv[2] || 'shots-parity';
const urlArg = argOf('--url', null);
const htmlFile = argOf('--file', 'sol-3d.html');
const seed = argOf('--seed', '7');
// SwiftShader roda a ~1 fps neste conteúdo: 48 frames de assentamento
// (0.8s simulados) já superam o procedimento antigo (5s reais ≈ 8 frames)
// sem estourar o tempo de CI.
const hold = parseInt(argOf('--hold', '48'), 10);
const extraQ = argOf('--query', '');
const base = urlArg || 'file://' + path.resolve(htmlFile);
const q = `det=1&seed=${seed}&hold=${hold}&tier=high&scale=1` + (extraQ ? '&' + extraQ : '');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errs = [];

  async function capture(pageName, viewport, views) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(180000);
    page.on('pageerror', (e) => errs.push(`[${pageName}] pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${pageName}] ${m.text()}`); });
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
      await page.screenshot({ path: path.join(outDir, `${pageName}-${name}.png`) });
      console.log(`ok ${pageName}-${name}`);
    }
    await page.close();
  }

  await capture('desktop', { width: 960, height: 600 }, [
    ['fit', null],
    ['a1-z60', { theta: Math.PI * 1.0, phi: Math.PI * 0.35, zoomFrac: 0.60 }],
    ['a2-z35', { theta: Math.PI * 1.5, phi: Math.PI * 0.62, zoomFrac: 0.35 }],
    ['a3-z15', { theta: Math.PI * 0.15, phi: Math.PI * 0.5, zoomFrac: 0.15 }],
  ]);
  await capture('portrait', { width: 390, height: 844 }, [['fit', null]]);

  await browser.close();
  if (errs.length) {
    console.log('--- erros ---');
    errs.forEach((e) => console.log(e));
    process.exitCode = 2;
  } else {
    console.log('parity shots ok, console limpo');
  }
})();

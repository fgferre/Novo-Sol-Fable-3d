// Harness de screenshots (Chromium headless via Playwright).
// Uso: node tools/shot.js [outDir] [--file caminho.html]
// Gera: desktop.png (1280x800), portrait.png (390x844), zoom.png (close-up).
const path = require('path');
const fs = require('fs');

const { chromium } = require('playwright');

const outDir = process.argv[2] || 'shots';
const fileArgIdx = process.argv.indexOf('--file');
const htmlFile = fileArgIdx > -1 ? process.argv[fileArgIdx + 1] : 'dist-single/index.html';
// intro=0 (PR-5): as fotos assumem a câmera no fit — sem a abertura
// cinematográfica do 1º acesso (que roda em contexto sem storage).
const url = 'file://' + path.resolve(htmlFile) + '?intro=0';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const consoleMsgs = [];
  async function shoot(name, viewport, opts = {}) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
    page.setDefaultTimeout(120000);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        consoleMsgs.push(`[${name}] ${m.type()}: ${m.text()}`);
      }
    });
    page.on('pageerror', (e) => consoleMsgs.push(`[${name}] pageerror: ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__solInfo !== undefined, null, { timeout: 20000 });
    // deixa a simulação de convecção assentar e o loading sumir
    await page.waitForTimeout(opts.settleMs || 5000);
    if (opts.zoomWheels) {
      for (let i = 0; i < opts.zoomWheels; i++) {
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, -240);
        await page.waitForTimeout(90);
      }
      await page.waitForTimeout(1800); // zoom amortecido assentar
    }
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    await page.close();
    console.log('ok ' + name);
  }

  await shoot('desktop', { width: 1280, height: 800 });
  await shoot('portrait', { width: 390, height: 844 });
  await shoot('zoom', { width: 1280, height: 800 }, { zoomWheels: 10 });

  await browser.close();
  if (consoleMsgs.length) {
    console.log('\n--- console ---');
    consoleMsgs.forEach((m) => console.log(m));
    process.exitCode = 2;
  } else {
    console.log('console limpo');
  }
})();

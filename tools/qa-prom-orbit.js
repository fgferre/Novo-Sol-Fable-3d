// QA de PROEMINÊNCIA em órbita: fotografa a mesma proeminência de vários
// ângulos de câmera (o cartão cruzado não pode degenerar nem "virar" com
// a câmera) e em instantes espaçados (o laço deve evoluir suavemente).
// Uso: node tools/qa-prom-orbit.js <outDir> [arquivo.html]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const url = 'file://' + path.resolve(process.argv[3] || 'sol-3d.html');
const out = process.argv[2];

function worldDir(objDir, rotY, tiltZ) {
  const [x0, y0, z0] = objDir;
  const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
  const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz, z1 = z0;
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  return [x1 * cy + z1 * sy, y1, -x1 * sy + z1 * cy];
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  // SwiftShader renderiza devagar; o default de 30s estoura em screenshot
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.state, null, { timeout: 20000 });
  await page.waitForTimeout(5000);

  // congela a rotação: sob SwiftShader um screenshot leva 10-35s e o Sol
  // giraria até ~84° entre a mira e o frame capturado — a proeminência
  // mirada acabava dentro do disco (fade) ou atrás do limbo (oclusão),
  // parecendo "invisível" sem estar. A evolução dos fios (uTime) continua.
  const canFreeze = await page.evaluate(() => !!window.__solInfo.setRotSpeed);
  if (canFreeze) await page.evaluate(() => window.__solInfo.setRotSpeed(0));

  const proms = await page.evaluate(() => window.__solInfo.prominences());
  // a mais equatorial fica visível de mais ângulos; entre as equatoriais,
  // prefira uma MADURA (env alto) se o build expõe o ciclo de vida
  let anchor = proms.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a));
  let lifeIdx = -1;
  const life = await page.evaluate(() => window.__solInfo.promLife ? window.__solInfo.promLife() : null);
  if (life) {
    // prefere um ARCO (slots i%3==2): é o tipo alto e fotogênico validado
    // no QA isolado — leques/cortinas são baixos (30-100Mm) e legitimamente
    // tênues no enquadramento da órbita, o que virava FAIL falso
    const cand = life.map((l, i) => ({ l, i }))
      .filter((c) => Math.abs(c.l.dir[1]) < 0.6)
      .sort((a, b) => ((b.i % 3 === 2 ? 1 : 0) - (a.i % 3 === 2 ? 1 : 0))
                   || (Math.abs(a.l.dir[1]) - Math.abs(b.l.dir[1])))[0];
    if (cand) { anchor = cand.l.dir; lifeIdx = cand.i; }
  }

  let solvedTh = null;
  async function aim(offset) {
    // re-fixa a MATURIDADE e relê a âncora a CADA mira: a sessão inteira
    // leva minutos (SwiftShader) e o ciclo de vida é de 70-120s — sem
    // isso o alvo morre e RENASCE longe no meio da sessão, e as fotos
    // seguintes miram uma âncora obsoleta (limbo vazio no QA)
    if (lifeIdx >= 0) {
      await page.evaluate((i) => window.__solInfo.setPromLife(i, 0.3), lifeIdx);
      await page.waitForTimeout(400);
      anchor = (await page.evaluate(() => window.__solInfo.promLife()))[lifeIdx].dir;
    }
    const st = await page.evaluate(() => window.__solInfo.state());
    // MIRA EM MALHA FECHADA: em vez de derivar theta por convenção (Euler/
    // azimute divergiam e o alvo caía FORA do quadro), varre theta e MEDE
    // com projectProm onde a âncora cai na tela; escolhe o perfil que a
    // põe no limbo esquerdo, dentro do quadro. offset gira a partir daí.
    if (solvedTh === null && lifeIdx >= 0) {
      let best = null;
      for (let k = 0; k < 24; k++) {
        const cand = (2 * Math.PI * k) / 24;
        await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d),
          [cand, Math.PI / 2, st.fitDist]);
        await page.waitForTimeout(250);
        const pr = await page.evaluate((i) => window.__solInfo.projectProm(i), lifeIdx);
        if (!pr.inFront) continue;
        // alvo ideal: x ~ 18% da largura (limbo esquerdo), em quadro
        const score = Math.abs(pr.x - 180) + Math.abs(pr.y - 375) * 0.3
          + (pr.x < 5 || pr.x > 995 || pr.y < 5 || pr.y > 745 ? 1e6 : 0);
        if (!best || score < best.score) best = { th: cand, score, x: pr.x, y: pr.y };
      }
      if (best) {
        solvedTh = best.th;
        console.log(`mira resolvida: theta=${solvedTh.toFixed(3)} alvo na tela=(${best.x.toFixed(0)},${best.y.toFixed(0)})`);
      }
    }
    if (solvedTh === null) {
      // fallback (builds sem projectProm): fórmula analítica antiga
      const dw = worldDir(anchor, st.rotY, 0.1265);
      solvedTh = Math.atan2(dw[2], dw[0]) - Math.PI / 2;
    }
    await page.evaluate(([t, p, d]) => window.__solInfo.setView(t, p, d),
      [solvedTh + offset, Math.PI / 2, st.fitDist]);
    await page.waitForTimeout(500);
    // loga a posição de TELA do alvo: o inspetor sabe ONDE olhar
    if (lifeIdx >= 0) {
      const pr = await page.evaluate((i) => window.__solInfo.projectProm ? window.__solInfo.projectProm(i) : null, lifeIdx);
      if (pr) console.log(`alvo idx=${lifeIdx} off=${offset} tela=(${pr.x.toFixed(0)},${pr.y.toFixed(0)}) env=${pr.env.toFixed(2)} uInt=${pr.uInt.map((v) => v.toFixed(2)).join('/')}`);
    }
  }

  // 5 ângulos: perfil perfeito, ±20°, ±40° (a proeminência gira p/ dentro
  // e p/ fora do limbo; deve esmaecer contra o disco sem virar agulha)
  const angles = [['p0', 0], ['m20', -0.35], ['p20', 0.35], ['m40', -0.7], ['p40', 0.7]];
  for (const [name, off] of angles) {
    await aim(off);
    await page.screenshot({ path: `${out}/ang-${name}.png` });
  }
  // 4 instantes no MESMO ângulo de perfil, ~5s entre eles (re-mira a cada
  // frame para compensar a rotação do Sol): evolução suave do laço
  for (let i = 0; i < 4; i++) {
    await aim(0);
    await page.screenshot({ path: `${out}/time-t${i}.png` });
    if (i < 3) await page.waitForTimeout(5000);
  }
  // prova de que a proeminência GIRA com o Sol: câmera fixa, rotação
  // acelerada por 3s — a estrutura deve DESLOCAR-SE entre os dois frames
  if (canFreeze) {
    await aim(0);
    await page.screenshot({ path: `${out}/rot-a.png` });
    await page.evaluate(() => window.__solInfo.setRotSpeed(0.3));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__solInfo.setRotSpeed(0));
    await page.screenshot({ path: `${out}/rot-b.png` });
  }
  console.log('orbita ok');
  await browser.close();
})();

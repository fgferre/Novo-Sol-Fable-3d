// QA de MOVIMENTO (Bloco C, rodada pós-Fase 6) — harness de julgamento
// TEMPORAL. Todo julgamento visual até hoje foi em stills; este tool
// captura SEQUÊNCIAS determinísticas de frames consecutivos e computa
// métricas por pixel (100% pngjs/pixelmatch — sem ffmpeg):
//   - índice de flicker: std temporal / (média temporal + eps) por
//     pixel -> heatmap + p95 por região {disco, limbo, coroa, céu}
//     (máscaras por raio; raio do disco detectado do frame 1 por
//     luminância, fallback analítico asin(R/camDist));
//   - % de pixels estroboscópicos: |delta frame-a-frame| > limiar SEM
//     coerência de vizinhança 3x3 (ruído que pisca != estrutura que se
//     move — vizinhança que não acompanha o delta = strobo);
//   - coerência de trajetória (cenário do CME): fração do delta na
//     coroa explicada pelo melhor shift RADIAL de 1..6 px (advecção
//     vs chuvisco);
//   - determinismo temporal: cenário fit-idle capturado 2x -> pixelmatch
//     0px em TODOS os pares (falha = achado grave, aborta a rodada).
//
// Relógio: ?det=1&seed=7 SEM hold — dt = 1/60 FIXO por frame renderizado
// (main.js: rawDelta). Para alinhar screenshot<->frame SEM hold, o tool
// intercepta requestAnimationFrame (addInitScript): boot corre livre até
// assentar (frame > ~10, primeiro bake absorvido), depois o loop é
// "estacionado" numa fila e cada frame é disparado sob demanda
// (__m2.step() -> exatamente 1 animate síncrono) antes de cada
// screenshot. Sequência de M frames = M/60 s de tempo simulado,
// alinhada por construção nas 2 execuções do check de determinismo.
// (Riscos wall-clock conhecidos e tolerados, os mesmos da suíte hold:
// o gate da auto-órbita (2200 ms) abre ainda no frame 1-2 do boot
// SwiftShader em toda execução; o hint de UI esvai antes do 1º shot.)
//
// grain=0 em todos os cenários (protocolo do docs/audit-motion.md): o
// grão de filme é ruído DELIBERADO por frame — mediria só ele; o alvo
// são as flags herdadas (fios ~1px do fil-suave F4, streaks das
// partículas F5, FWHM 1.6-2.6px das plumas F6).
//
// Partículas do CME INTEGRAM (transform feedback) — o cenário do evento
// captura AO VIVO desde o disparo (forceCME), sem setCmeClock, com
// subamostragem k=4 (48 shots cobrem t=0..3.2s: rise + impulsiva).
//
// Modos:
//   default    : gate — compara com tools/motion2-thresholds.json, exit 1
//   --calibrate: grava os limiares = baseline medido x margem (p95*1.25
//                etc.) em tools/motion2-thresholds.json — os limiares
//                são sempre CALIBRADOS num baseline real, nunca inventados
// Uso: node tools/qa-motion2.js [outDir] [--file dist-single/index.html]
//      [--calibrate] [--scenario a,b] [--analyze-only]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function argOf(flag, dflt){ const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : dflt; }
function hasFlag(flag){ return process.argv.includes(flag); }
const outDir = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'out/motion2';
const htmlFile = argOf('--file', 'dist-single/index.html');
const thrFile = argOf('--thresholds', 'tools/motion2-thresholds.json');
const CALIBRATE = hasFlag('--calibrate');
const ANALYZE_ONLY = hasFlag('--analyze-only');
const onlyScen = argOf('--scenario', '') ? argOf('--scenario', '').split(',') : null;
const base = 'file://' + path.resolve(htmlFile);

const W = 960, H = 600;
const START_FRAME = 20;          // assentar: > ~10 e 1º ciclo de bake (frames 8-15) absorvido
const BOOT_FRAME = 8;            // estaciona o rAF depois deste frame
const BASE_Q = '?det=1&seed=7&tier=high&scale=1&grain=0';
const SUN_RADIUS = 2.2, FOV_HALF = 21 * Math.PI / 180;  // fallback analítico do raio
const DISC_LUM_THR = 65;         // limiar de luminância p/ detectar o limbo
                                 // (disco tone-mapped laranja: lum ~90-130; céu ~18-40; queda no limbo é abrupta)
const FLICKER_EPS = 2.0;         // std/(mean+eps), luminância 0..255
const STROBO_THR = 10;           // |delta| acima disto é "pisca visível"
const STROBO_COH_K = 0.5;        // vizinhança acompanha se |media 3x3| >= K*|delta|
const COH_ACTIVE_THR = 4;        // pixels da coroa que participam da coerência
const COH_SHIFTS = [1, 2, 3, 4, 5, 6];  // shifts radiais candidatos (px)
// regiões por raio (fração do raio do disco em px)
const REGIONS = [
  { name: 'disco', lo: 0.00, hi: 0.90 },
  { name: 'limbo', lo: 0.90, hi: 1.10 },
  { name: 'coroa', lo: 1.10, hi: 2.00 },
  { name: 'ceu',   lo: 2.00, hi: 1e9 },
];

// 6 sequências / 5 cenários da espec (close-fibrilas tem 2 variações).
// k = frames simulados entre shots (1 = consecutivos; CME usa 4 p/
// cobrir formação+expansão do evento ~3.2s em 48 shots).
const SCENARIOS = [
  { name: 'fit-idle',        M: 48, k: 1, q: '',         setup: null,    runs: 2 },
  { name: 'close-dof0',      M: 24, k: 1, q: '',         setup: 'close', runs: 1 },
  { name: 'close-dof',       M: 24, k: 1, q: 'dof=0.5',  setup: 'close', runs: 1 },
  { name: 'flare-cme-limbo', M: 48, k: 4, q: 'cme=0.9',  setup: 'cme',   runs: 1 },
  { name: 'lapse-ciclo',     M: 48, k: 1, q: 'lapse=1',  setup: null,    runs: 1 },
  { name: 'cvol-wide',       M: 48, k: 1, q: 'cvol=0.5', setup: 'wide',  runs: 1 },
];

let fails = 0;
function check(name, ok, info){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info !== undefined ? '  (' + info + ')' : ''));
}
function readPng(f){ return PNG.sync.read(fs.readFileSync(f)); }
function fname(dir, i){ return path.join(dir, 'f' + String(i).padStart(2, '0') + '.png'); }
function sleep(ms){ return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------- captura
async function capture(browser, scen, runIdx, errs){
  const dir = path.join(outDir, scen.name + (runIdx > 0 ? '-run2' : ''));
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(420000);
  page.on('pageerror', (e) => errs.push('pageerror[' + scen.name + ']: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[' + scen.name + '] ' + m.text()); });
  // shim do rAF: 'free' = passthrough (boot), 'step' = fila sob demanda
  await page.addInitScript(() => {
    const nat = window.requestAnimationFrame.bind(window);
    const q = [];
    let mode = 'free';
    window.__m2 = {
      setMode(m){ mode = m; },
      parked(){ return q.length > 0; },
      step(){
        const cbs = q.splice(0, q.length);
        const t = performance.now();
        for (const cb of cbs) cb(t);
        return cbs.length;
      },
    };
    window.requestAnimationFrame = function(cb){
      if (mode === 'free') return nat(cb);
      q.push(cb);
      return 0;
    };
  });
  const url = base + BASE_Q + (scen.q ? '&' + scen.q : '');
  await page.goto(url);
  await page.waitForFunction((n) => window.__solInfo && window.__solInfo.frame > n,
    BOOT_FRAME, { timeout: 420000, polling: 150 });
  // estaciona: o rAF nativo em voo re-enfileira o animate na nossa fila
  await page.evaluate(() => window.__m2.setMode('step'));
  let parked = false;
  for (let t = 0; t < 240 && !parked; t++){
    parked = await page.evaluate(() => window.__m2.parked());
    if (!parked) await sleep(250);
  }
  if (!parked) throw new Error(scen.name + ': loop nao estacionou');
  const step = async (n) => page.evaluate((k) => {
    let ran = 0;
    for (let i = 0; i < k; i++) ran += window.__m2.step();
    return { ran, frame: window.__solInfo.frame };
  }, n);
  let st = await step(0);
  if (st.frame > START_FRAME) throw new Error(scen.name + ': estacionou tarde demais (frame ' + st.frame + ' > ' + START_FRAME + ')');
  while (st.frame < START_FRAME) st = await step(1);
  // setup do cenário (hooks ao vivo; setView é snap — sem lerp)
  if (scen.setup === 'close'){
    await page.evaluate(() => window.__solInfo.setView(Math.PI * 1.0, Math.PI * 0.42, 3.9));
    await step(2);
  } else if (scen.setup === 'wide'){
    await page.evaluate(() => {
      const s = window.__solInfo.state();
      window.__solInfo.setView(s.theta, s.phi, s.fitDist * 1.55);
    });
    await step(2);
  } else if (scen.setup === 'cme'){
    // dispara flare grande + CME de verdade e poe o evento no limbo —
    // captura comeca IMEDIATAMENTE (t=0 do evento; particulas integram)
    const dir3 = await page.evaluate(() => {
      const d = window.__solInfo.forceCME(0);
      const s = window.__solInfo.state();
      const th = Math.atan2(d[2], d[0]);
      window.__solInfo.setView(th + Math.PI / 2, Math.PI * 0.5, s.fitDist * 1.35);
      return d;
    });
    if (!dir3) throw new Error('forceCME falhou');
  }
  const state0 = await page.evaluate(() => window.__solInfo.state());
  const frames = [];
  for (let i = 1; i <= scen.M; i++){
    const s = await step(scen.k);
    if (s.ran < scen.k) throw new Error(scen.name + ': step vazio no shot ' + i);
    frames.push(s.frame);
    await page.screenshot({ path: fname(dir, i) });
  }
  const extra = scen.setup === 'cme' ? { cme: await page.evaluate(() => window.__solInfo.cmeInfo()) } : {};
  await page.close();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    name: scen.name, run: runIdx, url, M: scen.M, k: scen.k, startFrame: START_FRAME,
    frames, state: { camDist: state0.camDist, fitDist: state0.fitDist, theta: state0.theta, phi: state0.phi },
    ...extra,
  }, null, 2));
  console.log('  capturado ' + scen.name + (runIdx > 0 ? ' (run2)' : '') +
    ' — frames det ' + frames[0] + '..' + frames[frames.length - 1]);
  return dir;
}

// ---------------------------------------------------------------- análise
function lumPlane(png){
  const n = png.width * png.height, out = new Float32Array(n), d = png.data;
  for (let i = 0; i < n; i++){
    const j = i * 4;
    out[i] = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
  }
  return out;
}
// raio do disco: 8 raios do centro (4 cardeais + 4 diagonais), último
// pixel com lum>=thr por raio; raios clipados na borda ou desviados por
// estrela/texto de UI são descartados pela MEDIANA; sanidade final
// contra o raio analítico (fov 42°, R=2.2, camDist do manifest) — se a
// mediana fugir >12% do analítico (proeminência/streamer no raio), fica
// o analítico. A câmera SEMPRE mira o centro, então centro = w/2,h/2.
function detectRadius(lum, w, h, camDist){
  const cx = w >> 1, cy = h >> 1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]];
  const rays = [];
  for (const [dx, dy] of dirs){
    let last = -1, s = 0;
    for (;; s++){
      const x = Math.round(cx + dx * s), y = Math.round(cy + dy * s);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (lum[y * w + x] >= DISC_LUM_THR) last = s;
    }
    rays.push({ r: last, clipped: last >= s - 3 });
  }
  const ang = Math.asin(Math.min(1, SUN_RADIUS / Math.max(camDist, SUN_RADIUS * 1.001)));
  const Ran = 0.5 * Math.tan(ang) / Math.tan(FOV_HALF) * h;
  const ok = rays.filter((r) => !r.clipped && r.r > 10).map((r) => r.r).sort((a, b) => a - b);
  if (ok.length >= 3){
    const Rlum = ok[Math.floor(ok.length / 2)];
    if (Math.abs(Rlum - Ran) / Ran <= 0.12) return { R: Rlum, mode: 'lum' };
  }
  return { R: Ran, mode: 'analitico' };
}
function regionMask(w, h, R){
  const cx = w / 2, cy = h / 2, mask = new Uint8Array(w * h), count = [0, 0, 0, 0, 0];
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const r = Math.hypot(x - cx, y - cy) / R;
      let code = 0;
      for (let k = 0; k < REGIONS.length; k++){
        if (r > REGIONS[k].lo && r <= REGIONS[k].hi){ code = k + 1; break; }
      }
      if (r === 0) code = 1;
      mask[y * w + x] = code;
      count[code]++;
    }
  }
  return { mask, count };
}
function quantile(sorted, q){
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function analyze(scen){
  const dir = path.join(outDir, scen.name);
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const M = man.M;
  const first = readPng(fname(dir, 1));
  const w = first.width, h = first.height, n = w * h;
  const det = detectRadius(lumPlane(first), w, h, man.state.camDist);
  const { mask, count } = regionMask(w, h, det.R);
  const isCme = scen.setup === 'cme';
  // mapas de shift radial (coerência do CME): fonte de cada pixel p/ shift s
  let shiftMaps = null;
  if (isCme){
    shiftMaps = COH_SHIFTS.map((s) => {
      const map = new Int32Array(n);
      const cx = w / 2, cy = h / 2;
      for (let y = 0; y < h; y++){
        for (let x = 0; x < w; x++){
          const i = y * w + x;
          const r = Math.hypot(x - cx, y - cy);
          if (r < 1){ map[i] = -1; continue; }
          const sx = Math.round(x - s * (x - cx) / r), sy = Math.round(y - s * (y - cy) / r);
          map[i] = (sx < 0 || sy < 0 || sx >= w || sy >= h) ? -1 : sy * w + sx;
        }
      }
      return map;
    });
  }
  const sum = new Float64Array(n), sumSq = new Float64Array(n);
  const stroboSum = [0, 0, 0, 0, 0], activeSum = [0, 0, 0, 0, 0];
  const stroboWorst = [0, 0, 0, 0, 0];
  let prev = null;
  const cohPairs = [];
  let meanAbsDeltaAcc = 0;
  for (let f = 1; f <= M; f++){
    const cur = lumPlane(readPng(fname(dir, f)));
    for (let i = 0; i < n; i++){ sum[i] += cur[i]; sumSq[i] += cur[i] * cur[i]; }
    if (prev){
      // delta + strobo (vizinhança 3x3 sem o centro tem de acompanhar)
      const stroboPair = [0, 0, 0, 0, 0];
      for (let y = 1; y < h - 1; y++){
        for (let x = 1; x < w - 1; x++){
          const i = y * w + x;
          const d = cur[i] - prev[i];
          const ad = d < 0 ? -d : d;
          if (ad <= STROBO_THR) continue;
          const code = mask[i];
          activeSum[code]++;
          let m = 0;
          m += cur[i - w - 1] - prev[i - w - 1]; m += cur[i - w] - prev[i - w]; m += cur[i - w + 1] - prev[i - w + 1];
          m += cur[i - 1] - prev[i - 1]; m += cur[i + 1] - prev[i + 1];
          m += cur[i + w - 1] - prev[i + w - 1]; m += cur[i + w] - prev[i + w]; m += cur[i + w + 1] - prev[i + w + 1];
          m /= 8;
          const coherent = (m * d > 0) && (Math.abs(m) >= STROBO_COH_K * ad);
          if (!coherent){ stroboSum[code]++; stroboPair[code]++; }
        }
      }
      for (let c = 1; c <= 4; c++){
        if (count[c]) stroboWorst[c] = Math.max(stroboWorst[c], stroboPair[c] / count[c]);
      }
      let acc = 0;
      for (let i = 0; i < n; i++){ const d = cur[i] - prev[i]; acc += d < 0 ? -d : d; }
      meanAbsDeltaAcc += acc / n;
      // coerência radial (só CME): melhor shift explica quanto do delta?
      if (isCme){
        let denom = 0;
        const nums = new Float64Array(COH_SHIFTS.length);
        for (let i = 0; i < n; i++){
          if (mask[i] !== 3) continue;           // coroa
          const d = cur[i] - prev[i];
          const ad = d < 0 ? -d : d;
          if (ad <= COH_ACTIVE_THR) continue;
          denom += ad;
          for (let s = 0; s < shiftMaps.length; s++){
            const src = shiftMaps[s][i];
            const r = src < 0 ? ad : Math.abs(cur[i] - prev[src]);
            nums[s] += r;
          }
        }
        if (denom > 1e-3){
          let best = 0;
          for (let s = 1; s < nums.length; s++) if (nums[s] < nums[best]) best = s;
          cohPairs.push({ expl: Math.max(0, 1 - nums[best] / denom), shift: COH_SHIFTS[best] });
        }
      }
    }
    prev = cur;
  }
  // mapa de flicker + p95 por região
  const flick = new Float32Array(n);
  for (let i = 0; i < n; i++){
    const mean = sum[i] / M;
    const varr = Math.max(0, sumSq[i] / M - mean * mean);
    flick[i] = Math.sqrt(varr) / (mean + FLICKER_EPS);
  }
  const flicker = {}, strobo = {};
  for (let c = 1; c <= 4; c++){
    const name = REGIONS[c - 1].name;
    if (!count[c]){ flicker[name] = null; strobo[name] = null; continue; }
    const vals = [];
    for (let i = 0; i < n; i++) if (mask[i] === c) vals.push(flick[i]);
    vals.sort((a, b) => a - b);
    flicker[name] = {
      mean: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(5),
      p95: +quantile(vals, 0.95).toFixed(5),
      p99: +quantile(vals, 0.99).toFixed(5),
      px: count[c],
    };
    strobo[name] = {
      fracMean: +(stroboSum[c] / ((M - 1) * count[c])).toFixed(6),
      fracWorstPair: +stroboWorst[c].toFixed(6),
      activeFracMean: +(activeSum[c] / ((M - 1) * count[c])).toFixed(6),
    };
  }
  // hotspots: máximo por bloco 40x40, top-5
  const bs = 40, spots = [];
  for (let by = 0; by < h; by += bs){
    for (let bx = 0; bx < w; bx += bs){
      let v = 0, px = bx, py = by;
      for (let y = by; y < Math.min(h, by + bs); y++){
        for (let x = bx; x < Math.min(w, bx + bs); x++){
          const i = y * w + x;
          if (flick[i] > v){ v = flick[i]; px = x; py = y; }
        }
      }
      spots.push({ x: px, y: py, val: +v.toFixed(4), region: REGIONS[(mask[py * w + px] || 1) - 1].name });
    }
  }
  spots.sort((a, b) => b.val - a.val);
  let coherence = null;
  if (isCme && cohPairs.length){
    const hist = {};
    cohPairs.forEach((p) => { hist[p.shift] = (hist[p.shift] || 0) + 1; });
    coherence = {
      explMean: +(cohPairs.reduce((a, p) => a + p.expl, 0) / cohPairs.length).toFixed(4),
      explMin: +Math.min(...cohPairs.map((p) => p.expl)).toFixed(4),
      pairs: cohPairs.length,
      shiftHist: hist,
    };
  }
  return {
    url: man.url, M, k: man.k, framesDet: [man.frames[0], man.frames[M - 1]],
    R_px: +det.R.toFixed(1), R_mode: det.mode,
    meanAbsDelta: +(meanAbsDeltaAcc / (M - 1)).toFixed(4),
    flicker, strobo, coherence,
    hotspots: spots.slice(0, 5),
    _flickMap: flick, _size: [w, h],
  };
}

// determinismo: todos os pares f_i(run1) vs f_i(run2) a 0px (pixelmatch 0.1,
// convenção da suíte). Falha = achado grave (aborta o resto por padrão).
function checkDeterminism(scen){
  const d1 = path.join(outDir, scen.name), d2 = path.join(outDir, scen.name + '-run2');
  const out = { pairs: scen.M, bad: [], maxPx: 0 };
  for (let i = 1; i <= scen.M; i++){
    const a = readPng(fname(d1, i)), b = readPng(fname(d2, i));
    const px = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    if (px > 0){
      out.bad.push({ frame: i, px });
      out.maxPx = Math.max(out.maxPx, px);
      if (out.bad.length === 1){
        const diff = new PNG({ width: a.width, height: a.height });
        pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
        fs.writeFileSync(path.join(outDir, 'det-diff-f' + String(i).padStart(2, '0') + '.png'), PNG.sync.write(diff));
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ contact sheet
function boxDown(png, f){
  const w = Math.floor(png.width / f), h = Math.floor(png.height / f);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      let r = 0, g = 0, b = 0;
      for (let yy = 0; yy < f; yy++){
        for (let xx = 0; xx < f; xx++){
          const j = ((y * f + yy) * png.width + (x * f + xx)) * 4;
          r += png.data[j]; g += png.data[j + 1]; b += png.data[j + 2];
        }
      }
      const o = (y * w + x) * 4, k = f * f;
      out.data[o] = r / k; out.data[o + 1] = g / k; out.data[o + 2] = b / k; out.data[o + 3] = 255;
    }
  }
  return out;
}
// colormap simples preto->azul->verde->amarelo->vermelho (v em 0..1)
function heatColor(v){
  const stops = [[0, 0, 0], [25, 60, 255], [0, 210, 110], [255, 225, 40], [255, 45, 20]];
  const t = Math.max(0, Math.min(0.9999, v)) * (stops.length - 1);
  const i = Math.floor(t), fr = t - i;
  return [0, 1, 2].map((c) => Math.round(stops[i][c] * (1 - fr) + stops[i + 1][c] * fr));
}
const HEAT_SCALE = 0.5;   // flicker 0..0.5 -> rampa inteira
function buildSheet(scen, res){
  const dir = path.join(outDir, scen.name);
  const stride = Math.floor(scen.M / 8);
  const idx = Array.from({ length: 8 }, (_, i) => 1 + i * stride);
  const thumbW = 240, thumbH = 150, gap = 2;
  const heatW = 480, heatH = 300;
  const sheet = new PNG({ width: 4 * (thumbW + gap) + heatW + gap, height: 2 * (thumbH + gap) });
  idx.forEach((fi, i) => {
    const t = boxDown(readPng(fname(dir, fi)), 4);
    PNG.bitblt(t, sheet, 0, 0, thumbW, thumbH, (i % 4) * (thumbW + gap), Math.floor(i / 4) * (thumbH + gap));
  });
  const [w, h] = res._size, fl = res._flickMap;
  const hx0 = 4 * (thumbW + gap);
  for (let y = 0; y < heatH; y++){
    for (let x = 0; x < heatW; x++){
      // média 2x2 do mapa full-res
      let v = 0;
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) v += fl[(y * 2 + yy) * w + (x * 2 + xx)];
      const c = heatColor((v / 4) / HEAT_SCALE);
      const o = ((y) * sheet.width + hx0 + x) * 4;
      sheet.data[o] = c[0]; sheet.data[o + 1] = c[1]; sheet.data[o + 2] = c[2]; sheet.data[o + 3] = 255;
    }
  }
  fs.mkdirSync(path.join(outDir, 'sheets'), { recursive: true });
  const f = path.join(outDir, 'sheets', scen.name + '.png');
  fs.writeFileSync(f, PNG.sync.write(sheet));
  return f;
}

// ------------------------------------------------------------------- main
(async () => {
  const t0 = Date.now();
  fs.mkdirSync(outDir, { recursive: true });
  const scens = SCENARIOS.filter((s) => !onlyScen || onlyScen.includes(s.name));
  if (!scens.length){ console.log('nenhum cenário casa com --scenario'); process.exit(2); }
  const errs = [];
  if (!ANALYZE_ONLY){
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const scen of scens){
      for (let run = 0; run < (scen.runs || 1); run++){
        await capture(browser, scen, run, errs);
      }
      if (scen.runs === 2){
        const det = checkDeterminism(scen);
        check('determinismo temporal (' + scen.name + ', 2 execuções, ' + scen.M + ' pares 0px)',
          det.bad.length === 0,
          det.bad.length ? ('DIVERGE em ' + det.bad.length + ' pares, 1º f' + det.bad[0].frame + ' com ' + det.bad[0].px + 'px — diff salvo') : 'todos 0px');
        if (det.bad.length){
          console.log('ACHADO GRAVE: sequência não determinística — abortando capturas restantes.');
          console.log(JSON.stringify(det.bad.slice(0, 6)));
          await browser.close();
          process.exit(3);
        }
      }
    }
    await browser.close();
  }
  // análise + sheets + metrics.json
  const metrics = { meta: { date: new Date().toISOString(), file: htmlFile, baseQuery: BASE_Q,
    startFrame: START_FRAME, stroboThr: STROBO_THR, flickerEps: FLICKER_EPS, heatScale: HEAT_SCALE }, scenarios: {} };
  for (const scen of scens){
    const res = analyze(scen);
    const sheet = buildSheet(scen, res);
    if (scen.runs === 2 && fs.existsSync(path.join(outDir, scen.name + '-run2', 'manifest.json'))){
      const det = checkDeterminism(scen);
      res.determinism = { pairs: det.pairs, divergent: det.bad.length, maxPx: det.maxPx, ok: det.bad.length === 0 };
    }
    delete res._flickMap; delete res._size;
    metrics.scenarios[scen.name] = res;
    console.log('cenário ' + scen.name + '  (R=' + res.R_px + 'px ' + res.R_mode + ', sheet ' + sheet + ')');
    for (const r of REGIONS){
      const f = res.flicker[r.name], s = res.strobo[r.name];
      if (!f){ console.log('  ' + r.name.padEnd(6) + ' (vazia)'); continue; }
      console.log('  ' + r.name.padEnd(6) +
        ' flicker p95 ' + f.p95.toFixed(4) + ' (p99 ' + f.p99.toFixed(4) + ')' +
        '  strobo ' + (100 * s.fracMean).toFixed(3) + '% (pior par ' + (100 * s.fracWorstPair).toFixed(3) + '%)');
    }
    if (res.coherence) console.log('  coerência radial: expl ' + res.coherence.explMean +
      ' (min ' + res.coherence.explMin + ', shifts ' + JSON.stringify(res.coherence.shiftHist) + ')');
    if (res.determinism) console.log('  determinismo: ' + (res.determinism.ok ? 'OK ' : 'FALHOU ') +
      res.determinism.pairs + ' pares, max ' + res.determinism.maxPx + 'px');
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log('metrics: ' + path.join(outDir, 'metrics.json'));

  if (CALIBRATE){
    // limiares = baseline medido x margem (nunca inventados): flicker/strobo
    // p95*1.25 (+piso p/ regiões quase-zero), coerência x0.8 por baixo
    const thr = { meta: { calibratedAt: new Date().toISOString(), from: path.join(outDir, 'metrics.json'), margin: 1.25 }, scenarios: {} };
    for (const [name, res] of Object.entries(metrics.scenarios)){
      const t = { flickerP95Max: {}, stroboFracMax: {} };
      for (const r of REGIONS){
        if (res.flicker[r.name]) t.flickerP95Max[r.name] = +(res.flicker[r.name].p95 * 1.25 + 0.005).toFixed(5);
        if (res.strobo[r.name]) t.stroboFracMax[r.name] = +(res.strobo[r.name].fracMean * 1.25 + 0.002).toFixed(6);
      }
      if (res.coherence) t.coherenceExplMin = +(res.coherence.explMean * 0.8).toFixed(4);
      thr.scenarios[name] = t;
    }
    fs.writeFileSync(thrFile, JSON.stringify(thr, null, 2));
    console.log('limiares calibrados gravados em ' + thrFile);
  } else {
    if (!fs.existsSync(thrFile)){
      console.log('sem ' + thrFile + ' — rode com --calibrate primeiro');
      process.exit(2);
    }
    const thr = JSON.parse(fs.readFileSync(thrFile, 'utf8'));
    for (const [name, res] of Object.entries(metrics.scenarios)){
      const t = thr.scenarios[name];
      if (!t){ check('limiares p/ ' + name, false, 'ausentes — recalibrar'); continue; }
      for (const r of REGIONS){
        if (res.flicker[r.name] && t.flickerP95Max[r.name] !== undefined)
          check(name + ' flicker p95 ' + r.name + ' <= ' + t.flickerP95Max[r.name],
            res.flicker[r.name].p95 <= t.flickerP95Max[r.name], res.flicker[r.name].p95);
        if (res.strobo[r.name] && t.stroboFracMax[r.name] !== undefined)
          check(name + ' strobo ' + r.name + ' <= ' + t.stroboFracMax[r.name],
            res.strobo[r.name].fracMean <= t.stroboFracMax[r.name], res.strobo[r.name].fracMean);
      }
      if (res.coherence && t.coherenceExplMin !== undefined)
        check(name + ' coerência >= ' + t.coherenceExplMin,
          res.coherence.explMean >= t.coherenceExplMin, res.coherence.explMean);
      if (res.determinism)
        check(name + ' determinismo 0px', res.determinism.ok, res.determinism.divergent + ' pares divergentes');
    }
  }
  if (errs.length){
    console.log('--- erros de página ---');
    errs.forEach((e) => console.log(e));
    fails++;
  }
  console.log((fails ? ('QA MOTION2: ' + fails + ' FALHA(S)') : 'QA MOTION2: tudo verde') +
    '  [' + ((Date.now() - t0) / 60000).toFixed(1) + ' min]');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

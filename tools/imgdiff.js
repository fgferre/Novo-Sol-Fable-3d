// Diff pixel a pixel entre dois diretórios de PNGs homônimos (paridade).
// Uso: node tools/imgdiff.js <dirA> <dirB> [--max-frac 0.001] [--out diffs/]
//        [--mask x,y,w,h]...
// Sai com código 1 se qualquer imagem exceder a fração de pixels diferentes.
// --mask exclui retângulos da comparação (repetível). y negativo ancora na
// BASE da imagem (y = height + y). Racional: o gate de paridade prova o
// RENDER determinístico da estrela; texto DOM (título/hint) rasteriza com a
// fonte do SO e variaria entre o CI (Liberation) e o desktop do dono (Segoe
// UI) — o conteúdo dos textos é coberto pelas suítes funcionais, não aqui.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

const dirA = process.argv[2];
const dirB = process.argv[3];
function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
}
const maxFrac = parseFloat(argOf('--max-frac', '0.001'));
const outDir = argOf('--out', null);
const masks = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--mask') {
    const p = String(process.argv[i + 1] || '').split(',').map(Number);
    if (p.length === 4 && p.every(Number.isFinite)) masks.push(p);
    else { console.error('máscara inválida: ' + process.argv[i + 1]); process.exit(2); }
  }
}
function applyMasks(png) {
  // Pinta as regiões mascaradas com um valor constante NAS DUAS imagens
  // antes do pixelmatch — diferenças ali deixam de existir por construção.
  for (const [mx, my0, mw, mh] of masks) {
    const my = my0 < 0 ? png.height + my0 : my0;
    for (let y = Math.max(0, my); y < Math.min(png.height, my + mh); y++) {
      for (let x = Math.max(0, mx); x < Math.min(png.width, mx + mw); x++) {
        const i = (y * png.width + x) * 4;
        png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255;
      }
    }
  }
}

const files = fs.readdirSync(dirA).filter((f) => f.endsWith('.png')).sort();
if (!files.length) { console.error('nenhum PNG em ' + dirA); process.exit(2); }
if (outDir) fs.mkdirSync(outDir, { recursive: true });

let fail = false;
for (const f of files) {
  const pa = path.join(dirA, f);
  const pb = path.join(dirB, f);
  if (!fs.existsSync(pb)) { console.log(`FALTA ${f} em ${dirB}`); fail = true; continue; }
  const a = PNG.sync.read(fs.readFileSync(pa));
  const b = PNG.sync.read(fs.readFileSync(pb));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`DIMENSÃO ${f}: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    fail = true; continue;
  }
  applyMasks(a); applyMasks(b);
  const diff = outDir ? new PNG({ width: a.width, height: a.height }) : null;
  const n = pixelmatch(a.data, b.data, diff ? diff.data : null, a.width, a.height, { threshold: 0.1 });
  const frac = n / (a.width * a.height);
  const ok = frac <= maxFrac;
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${f}: ${n} px (${(frac * 100).toFixed(4)}%)`);
  if (diff && n > 0) fs.writeFileSync(path.join(outDir, f), PNG.sync.write(diff));
  if (!ok) fail = true;
}
process.exit(fail ? 1 : 0);

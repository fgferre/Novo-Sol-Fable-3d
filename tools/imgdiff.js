// Diff pixel a pixel entre dois diretórios de PNGs homônimos (paridade).
// Uso: node tools/imgdiff.js <dirA> <dirB> [--max-frac 0.001] [--out diffs/]
// Sai com código 1 se qualquer imagem exceder a fração de pixels diferentes.
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
  const diff = outDir ? new PNG({ width: a.width, height: a.height }) : null;
  const n = pixelmatch(a.data, b.data, diff ? diff.data : null, a.width, a.height, { threshold: 0.1 });
  const frac = n / (a.width * a.height);
  const ok = frac <= maxFrac;
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${f}: ${n} px (${(frac * 100).toFixed(4)}%)`);
  if (diff && n > 0) fs.writeFileSync(path.join(outDir, f), PNG.sync.write(diff));
  if (!ok) fail = true;
}
process.exit(fail ? 1 : 0);

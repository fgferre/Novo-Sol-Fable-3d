// Lint PURO (node, sem browser) do conteúdo educativo — passo barato de CI.
// Regras (PR-6, legibilidade em 390px):
//   1. term com mais de 34 caracteres quebra em duas linhas apertadas no
//      cartão de 362px — FALHA.
//   2. corpo (body) com desvio de comprimento PT↔EN acima de 35% denuncia
//      tradução truncada/inflada — FALHA.
//   3. chave presente numa língua e ausente na outra — FALHA (completude).
// content.js é um módulo de dados sem imports; como o pacote é CJS, o
// `export const` é neutralizado por substituição textual e avaliado.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'edu', 'content.js');
const src = fs.readFileSync(file, 'utf8');
const EDU_CONTENT = new Function(
  src.replace(/^export\s+const\s+EDU_CONTENT/m, 'var EDU_CONTENT') + ';return EDU_CONTENT;'
)();

const MAX_TERM = 34;
const MAX_BODY_DEV = 0.35;

// Coleta todas as folhas {term, body} com o caminho completo (inclui tour.*).
function leaves(node, prefix, out) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.term === 'string' && typeof node.body === 'string') {
    out[prefix] = node;
    return out;
  }
  Object.keys(node).forEach((k) => {
    if (node[k] && typeof node[k] === 'object') leaves(node[k], prefix ? prefix + '.' + k : k, out);
  });
  return out;
}

const pt = leaves(EDU_CONTENT.pt, '', {});
const en = leaves(EDU_CONTENT.en, '', {});
const problems = [];
let checked = 0;

Object.keys(pt).forEach((key) => {
  if (!en[key]) { problems.push(`EN sem a chave "${key}"`); return; }
  checked++;
  [['pt', pt[key]], ['en', en[key]]].forEach(([lang, entry]) => {
    if (entry.term.length > MAX_TERM)
      problems.push(`${key} [${lang}] term com ${entry.term.length} chars (>${MAX_TERM}): "${entry.term}"`);
  });
  const a = pt[key].body.length, b = en[key].body.length;
  const dev = Math.abs(a - b) / Math.max(a, b);
  if (dev > MAX_BODY_DEV)
    problems.push(`${key} body PT=${a} EN=${b} chars — desvio ${(dev * 100).toFixed(0)}% (>${MAX_BODY_DEV * 100}%)`);
});
Object.keys(en).forEach((key) => { if (!pt[key]) problems.push(`PT sem a chave "${key}"`); });

if (problems.length) {
  problems.forEach((p) => console.log('FAIL  ' + p));
  console.log(`LINT CONTENT: ${problems.length} problema(s) em ${checked} entradas`);
  process.exitCode = 1;
} else {
  console.log(`LINT CONTENT: ${checked} entradas PT↔EN ok (term ≤${MAX_TERM} chars, desvio de corpo ≤${MAX_BODY_DEV * 100}%)`);
}

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

// PR-14 — paridade PT↔EN das entradas HELP (ajuda "?" do painel):
//   mesmas chaves nos dois idiomas; `what` e `visual` obrigatórios e
//   não-vazios; `edu` presente numa língua ⇒ presente na outra; desvio de
//   tamanho por campo ≤50%. strings.js também é módulo de dados sem imports.
const MAX_HELP_DEV = 0.5;
const stringsFile = path.join(__dirname, '..', 'src', 'ui', 'strings.js');
const stringsSrc = fs.readFileSync(stringsFile, 'utf8');
const HELP = new Function(
  stringsSrc.replace(/^export\s+const\s+/gm, 'var ') + ';return HELP;'
)();

let helpChecked = 0;
Object.keys(HELP.pt).forEach((key) => {
  if (!HELP.en[key]) { problems.push(`HELP EN sem a chave "${key}"`); return; }
  helpChecked++;
  const p = HELP.pt[key], e = HELP.en[key];
  ['what', 'visual'].forEach((field) => {
    [['pt', p], ['en', e]].forEach(([lang, entry]) => {
      if (typeof entry[field] !== 'string' || !entry[field].trim())
        problems.push(`HELP ${key} [${lang}] sem campo "${field}"`);
    });
  });
  if (!!p.edu !== !!e.edu)
    problems.push(`HELP ${key} nota educativa presente só em ${p.edu ? 'pt' : 'en'}`);
  ['what', 'visual', 'edu'].forEach((field) => {
    if (typeof p[field] !== 'string' || typeof e[field] !== 'string') return;
    const a = p[field].length, b = e[field].length;
    const dev = Math.abs(a - b) / Math.max(a, b);
    if (dev > MAX_HELP_DEV)
      problems.push(`HELP ${key}.${field} PT=${a} EN=${b} chars — desvio ${(dev * 100).toFixed(0)}% (>${MAX_HELP_DEV * 100}%)`);
  });
});
Object.keys(HELP.en).forEach((key) => { if (!HELP.pt[key]) problems.push(`HELP PT sem a chave "${key}"`); });

if (problems.length) {
  problems.forEach((p) => console.log('FAIL  ' + p));
  console.log(`LINT CONTENT: ${problems.length} problema(s) em ${checked} entradas + ${helpChecked} HELP`);
  process.exitCode = 1;
} else {
  console.log(`LINT CONTENT: ${checked} entradas PT↔EN ok (term ≤${MAX_TERM} chars, desvio de corpo ≤${MAX_BODY_DEV * 100}%) · ${helpChecked} entradas HELP ok (campos completos, desvio ≤${MAX_HELP_DEV * 100}%)`);
}

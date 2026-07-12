# Prompt: INFRA — Modularização completa do main.js (Bloco A, PR 1 de 3)

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: executar o **Bloco A do plano pós-roadmap** — quebrar
`src/main.js` (~5.880 linhas, IIFE única com closure gigante) nos
módulos por domínio previstos no roadmap, com paridade **BIT-EXATA**
(0px absoluto). É o "loop de infra dedicado" prometido desde a Fase 0.
Este bloco vem ANTES dos outros dois (Fase 6 física e Rodada de
Movimento — prompts próprios); não misturar escopos.
Fontes da verdade: `docs/roadmap-proximo-nivel.md`, `docs/fase-*.md`,
`README.md` (QA). Não confie em memória de conversas anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Use **subagentes e workflows sempre que possível** para poupar o
contexto da janela principal (exploração via Explore; verificações e
QA via agentes). A janela principal fica para as edições e o registro.

## PERFORMANCE (diretriz do dono)

**NÃO pedir números de FPS ao dono.** Este bloco não muda NENHUM
comportamento — performance idêntica por construção (mesmo código,
reorganizado). O gate é pixel, não velocidade.

## ESTADO ATUAL (git)

- `main`: Fases 0–5 completas e mescladas (PRs #41/#42/#43). O app é
  módulo ES único (`src/main.js`) importando `three`, buildado por
  Vite; `npm run build:single` (vite-plugin-singlefile) gera o
  `dist-single/index.html` auto-contido (offline/file:// — requisito
  do dono, iPhone). Pages publica `main`.
- Desenvolva na branch designada da sessão (a partir de `origin/main`),
  1 commit por estágio, PR único no fim, merge após gates.

## O DESENHO (decidido com o dono — seguir)

### Padrão único: factory + contexto compartilhado
`createX(ctx)` lê/escreve `ctx` e devolve a surface do domínio;
`init()` pendura: `ctx.prom = createProminences(ctx)`. Proibidos:
classes, singletons/estado module-level (side-effect em import time =
ordem controlada pelo bundler → quebra o stream RNG por construção),
param drilling.
**Regra anti-bug nº 1**: destructurar do ctx SÓ imutáveis (renderer,
TP, srand, geometrias); escalar mutável compartilhado (`elapsed`,
`surfFlareT`, `cmeT`, `hudOn`…) permanece `ctx.*` — NUNCA copiado
para variável local.

### Mapa de módulos (~20 + orquestrador)
`src/glsl/common.js` (NOISE/WORLEY/BFIELD/LIC/quadVertex — strings
puras); `src/core/config.js` (urlQ/det/srand/knob()/LOOK),
`core/renderer.js` (renderer/scene/camera/tiers/rtType — preservar a
ordem renderer→glStr→tier→rtType), `core/perf.js` (perf/subToggle/HUD/
autoTune); `src/sim/granulation.js` (ping-pong; `seed()` é chamada
SEPARADA na posição original ~l.857), `sim/activity.js` (ciclo/cargas/
bFieldJS); `src/surface/pil.js`, `surface/chromo.js` (bake),
`surface/sun.js` (disco), `surface/flares.js` (⚠ consome 1 srand na
posição ~l.5276, DEPOIS do painel — chamar a factory exatamente ali);
`src/atmosphere/coronaRays.js`, `coronaVolume.js`, `cme.js` (TF cru
verbatim), `spicules.js`, `prominences.js`, `loops.js`;
`src/scene/stars.js`; `src/post/pipeline.js`; `src/camera/controls.js`,
`camera/director.js`; `src/ui/panel.js`; `src/debug/solinfo.js`.
**`animate()` NÃO é extraído** — fica no `main.js` residual (~600-700
linhas) com o `init()` orquestrador: a ordem do frame é o espelho do
problema de ordem do init. Shaders específicos de domínio ficam
co-locados no módulo do domínio.

### Estágios (1 commit + gate cada; ≤~700 linhas/estágio)
0. Preparo: A/B baseline fresco de origin/main, gates verdes
   pré-refactor, criar diretórios.
1. `glsl/common.js` (puro — valida build:single multi-módulos e o
   `file://`).
2. `core/config.js` + `core/renderer.js`; nasce o `ctx` (srand/
   loopRand/cmeRand no ctx, criados UMA vez).
3. `sim/granulation.js`.
4. `sim/activity.js` + `surface/pil.js` (⚠ 1º consumidor de srand do
   init — cedo e isolado para o gate acusar deslocamento já).
5. `surface/chromo.js` + `surface/sun.js`.
6. `atmosphere/coronaRays.js` + `coronaVolume.js`.
7. `atmosphere/cme.js` + `spicules.js`.
8. `prominences.js` (⚠ 2º consumidor de srand); depois `loops.js`
   (loopRand no init, stream próprio).
9. `scene/stars.js` (⚠ 3º consumidor) + `post/pipeline.js`.
10. `camera/controls.js` + `core/perf.js`.
11. `surface/flares.js` (⚠ srand ~l.5276) + `camera/director.js`.
12. `ui/panel.js` (escreve em muitos domínios — surfaces prontas).
13. `debug/solinfo.js` (fecha sobre tudo — último).
14. Limpeza do main.js + rodada completa de gates + registro.

### Regras de segurança (a alma do bloco)
- **Nada de side-effects em import time**: módulos exportam APENAS
  funções e strings const; `init()` é o único dono da ordem — cada
  factory chamada na posição textual EXATA do bloco original; blocos
  descontíguos viram DUAS funções chamadas nas duas posições (ex.: sim
  material vs seedSimulation; flares vs consumo do srand).
- **Corpo movido VERBATIM**: manter `var`, nomes, ordem interna,
  comentários. Zero "aproveitar para melhorar" — rename/cleanup é PR
  futuro, nunca este.
- **Manifesto RNG** no topo do init(): comentário com a sequência de
  consumo (buildCharges → proeminências → loops(loopRand) → estrelas →
  flares 1×srand pós-painel); atualizar a cada estágio que tocar um
  consumidor.
- Shaders com constantes injetadas ('#define X '+N) viram
  `makeXShader(params)` chamado com os MESMOS valores no MESMO ponto —
  string final byte-idêntica.
- Diagnóstico quando um gate falhar: embrulhar `ctx.srand` num contador
  e comparar a contagem ao fim do init (main antigo vs novo) — localiza
  o deslocamento sem caçar pixel.
- vite-plugin-singlefile bundla imports ESTÁTICOS num chunk único ✓;
  proibido `import()` dinâmico e asset via `new URL()`; validar
  `dist-single/index.html` abrindo via `file://` no estágio 1.
- Hooks `__solInfo` e painel escrevem em vars de vários domínios: antes
  de cada estágio, grep das vars do bloco movido dentro dos hooks/
  painel/director/animate — a lista de escritas cruzadas define o que
  vai a `ctx` vs local de factory.
- `sol-3d.html` da raiz é LEGADO congelado — não tocar.

## GATES

Por estágio: `npm run build:single` + `npm run qa:parity` (smoke) +
**A/B worktree vs origin/main com `--max-frac 0`: 0px em 5/5** (o gate
de commit de verdade — o qa:parity tolera 0.001 e mascararia
deslocamento sutil):
```bash
git worktree add ../nsf-main origin/main
( cd ../nsf-main && npm ci && npm run build:single )   # 1x no início
node tools/parity.js qa-ab-branch --file dist-single/index.html
node tools/parity.js qa-ab-main   --file ../nsf-main/dist-single/index.html
node tools/imgdiff.js qa-ab-main qa-ab-branch --max-frac 0
```
Fechamento do PR: tudo acima + `qa:controls` 6/6 + `qa:phase1` 12/12 +
`qa:phase3` 12/12 + `qa:phase4` 13/13 + `qa:phase5` 14/14 + file:// ok
+ main.js residual ≤~700 linhas + grep sem side-effect top-level nos
módulos. Registro em `docs/infra-modularizacao.md` + roadmap + README;
commit; push; PR; merge (o dono acompanha pelo Pages).

## ARMADILHAS HERDADAS (leia os docs de fase antes de mexer)

SwiftShader ~1s/frame (capturas sempre `?det=1&seed=7&hold=48`);
1ª medição de GPU paga compile de pipeline (warmup antes de medir);
qualquer mesh transparente durante ciclos de bake desloca o SwiftShader
em ~1 LSB (histerese F4 — irrelevante aqui: knob 0 = bit-exato).

# Infra — Modularização do main.js (Bloco A pós-roadmap)

O "loop de infra dedicado" prometido desde a Fase 0: o `src/main.js`
monolítico (5.880 linhas, `init()` único com closure gigante) virou
**22 módulos por domínio + orquestrador residual de 661 linhas**, com
paridade **bit-exata** (0px absoluto em 5/5 cenas, `--max-frac 0`)
contra `origin/main` em TODOS os 13 estágios de extração. Nenhum
comportamento mudou; performance idêntica por construção (mesmo
código, reorganizado).

## O padrão: factory + contexto compartilhado

Todo módulo exporta `createX(ctx)`; o `init()` do `main.js` residual é
o ÚNICO dono da ordem — cada factory é chamada na posição textual
exata do bloco original (blocos descontíguos viram N factories nas N
posições, ex.: `surface/sun.js` com `createSunBase`/`createSunUniforms`/
`createSunMesh`). Proibido e verificado por grep: classes, estado
module-level, side-effect em import time (módulos exportam apenas
funções e strings const — bundler não controla ordem nenhuma),
`import()` dinâmico e asset via `new URL()` (vite-plugin-singlefile
continua gerando `dist-single/index.html` auto-contido, `file://` ok).

**Regra anti-bug nº 1** (a alma do bloco): destructurar do ctx SOMENTE
imutáveis (renderer, TP, srand, geometrias, uniforms-objeto, funções);
**escalar mutável compartilhado vive em `ctx.*` e NUNCA é copiado para
local** — `ctx.elapsed`, `ctx.surfFlareT`, `ctx.cmeT`, `ctx.theta`,
knobs `ctx.*_K`, contadores de perf etc. Referências criadas em
estágio posterior do init (ex.: cme.js lendo `ctx.surfFlareDir` de
flares.js) são **adiadas**: lidas como `ctx.*` em runtime, nunca
destructuradas na chamada da factory.

## Mapa de módulos

| Módulo | Conteúdo | Nota de ordem/RNG |
|---|---|---|
| `glsl/common.js` | NOISE/WORLEY/SFTDIR/BFIELD/LIC/quadVertex/uvMeshVertex | strings puras; replace de oitavas (FBM_OCTAVES) fica no main |
| `core/config.js` | urlQ/DET/knob()/LOOK + **os 3 streams RNG** | srand, cmeRand(seed^0x00C0E5ED), loopRand(seed^0x5EEDC0DE) criados 1× aqui; consumo permanece nos sites originais |
| `core/renderer.js` | renderer/scene/camera/tiers + `createRTType` | ordem renderer→glStr→tier→rtType preservada |
| `core/perf.js` | ring de perf/HUD/subToggle/autoTune | contadores em ctx.* |
| `sim/granulation.js` | ping-pong de convecção | `seed()` é chamada SEPARADA, na posição original (dentro do createActivity) |
| `sim/activity.js` | cargas/regiões/ciclo/bFieldJS | **1º consumidor de srand** (buildCharges na chamada da factory) |
| `surface/pil.js` | readback de PILs p/ âncoras | srand só na 1ª amostragem (runtime) |
| `surface/chromo.js` | bake 2-pass + smear + triple-buffer fatiado | estado do bake em ctx.bake* |
| `surface/sun.js` | disco em 3 factories | geometria → uniforms → shaders+mesh |
| `surface/flares.js` | envelopes/moldura PIL/gatilho | ⚠ cooldown = **último srand do init, PÓS-painel** — factory chamada exatamente ali |
| `atmosphere/coronaRays.js` | raias + sprite | ctx 2D de canvas → c2d (não sombrear o ctx) |
| `atmosphere/coronaVolume.js` | raymarch 64³, bake CPU fatiado | injeções `#define` byte-idênticas |
| `atmosphere/cme.js` | casca + **transform feedback WebGL2 cru verbatim** | cmeRand só em runtime |
| `atmosphere/spicules.js` | franja do limbo | ctx.spiculeUniforms lido pelo stepSimulation |
| `atmosphere/prominences.js` | cartões + gêmeos de absorção | **2º consumidor de srand** |
| `atmosphere/loops.js` | RK4 + arcada pós-flare | loopRand: 1 draw de init (initLoopStates) |
| `scene/stars.js` | estrelas/glints/Via Láctea/nebulosa | **3º consumidor de srand** |
| `post/pipeline.js` | bloom+streak+composite | knobs de cinema em ctx.* |
| `camera/controls.js` | órbita/zoom/toque/teclado | estado da câmera em ctx.* |
| `camera/director.js` | modo diretor | dirT/dirPair/dir*Fired em ctx.* |
| `ui/panel.js` | drawer de ajustes | zero RNG (invariante do srand pós-painel) |
| `debug/solinfo.js` | ~40 hooks de QA | fecha sobre tudo; refs de flares/director adiadas |

**`animate()` NÃO foi extraído** — permanece no `main.js` residual
(661 linhas) junto com: bootstrap, manifesto RNG + nascimento do ctx,
as ~24 chamadas de factory com os aliases de imutáveis, tuneLic,
inclinação do eixo (glue cross-domain), objeto inicial `__solInfo`,
onResize/hint e o estado de tempo do frame (clock/accums/temps). A
ordem do frame é o espelho do problema de ordem do init — ambos moram
juntos no orquestrador.

## Manifesto RNG (comentário vivo no topo do init)

Ordem de consumo no init: buildCharges(srand) → proeminências(srand) →
loops(loopRand 1×) → estrelas(srand) → [painel/solinfo: 0 draws] →
flares: cooldown 1×srand (PÓS-painel). Streams próprios nunca deslocam
o srand por construção; em `?det=1` os seeds de cmeRand/loopRand são
função pura do `?seed=` (zero draws na criação).

## Gates (por estágio e fechamento)

Cada um dos 13 estágios de extração = 1 commit + gate completo:
`npm run build:single` + captura A/B fresca (`rm -rf qa-ab-branch`
antes — aprendizado: timeout do parity sobre shots stale mascara
falha) + `node tools/imgdiff.js qa-ab-main qa-ab-branch --max-frac 0`
= **0px em 5/5** + `qa:parity` (smoke 0.001). Fechamento: qa:controls
6/6, qa:phase1 12/12, qa:phase3 12/12, qa:phase4 12/12, qa:phase5
14/14 — idênticos ao pré-refactor capturado do worktree de
`origin/main`. (Nota: roadmap dizia "13 checks" p/ phase4; o script
emite 12 — discrepância de doc pré-existente, não tocada.) Duas
métricas variaram entre execuções e foram VERIFICADAS como ruído de
ambiente, não divergência: os ms de traço RK4 (phase1, wall-clock) e o
`min` do I2 do phase4 — reexecutado 2× em CADA build, o próprio
monolito oscila (1.050→1.048) com faixas sobrepostas às do modular
(1.048→1.047), e o `max 1.656` é idêntico nos 4 runs.

## Bugs pegos pelos gates no caminho (e como)

1. **E4** — bridge `ctx.MACRO_SLOW` esquecida: `regDt*undefined = NaN`
   corrompia x/z das cargas (gate: 31–98% diff). Diagnóstico em
   minutos via sonda `__solInfo` A/B (regions com null), sem caça-pixel.
2. **E7/E8** — bridge `ctx.subToggle` caiu DENTRO do `stats()` do
   solinfo (heurística de fim de literal não previa `};  // comentário`);
   dormente no E7 (updateCME curto-circuita com CME_K=0), explodiu no
   E8 (`updateLoops` lê incondicional). Gate + pageerror.
3. **E10** — decl multi-var mista (`var scaleIdx = 0, tuneWin = [] ...`)
   quebrada pelo strip de `var`: órfãos em strict de módulo =
   ReferenceError no init (app congelava; parity timeout). Fix +
   varredura do padrão em todos os módulos.
4. **E10** — renames linha-alvo atingiram CHAVES de object literal no
   `state()` (`{ ctx.camDist: ... }` inválido) — chaves restauradas.
5. **E13** — defeito latente induzido no E4 e corrigido: `brEvAt` do
   solinfo usava `PIL_W/PIL_H` que ficaram locais ao pil.js →
   `ctx.PIL_W/PIL_H`.

## Verificações mecânicas que valem repetir em refactors futuros

- **Auditoria ctx**: todo `ctx.X` lido precisa de um `ctx.X =` em
  algum módulo/main (pegou a classe inteira das bridges esquecidas).
- **Varredura pós-rename**: para cada nome renomeado, grep das sobras
  bare fora do bloco (pegou LAPSE_K@director e lastCmeHDR@solinfo que
  as listas dos agentes perderam).
- **Sonda `__solInfo` A/B** (branch × main) antes do gate caro.
- Capturas A/B sempre frescas; `qa-ab-main` capturado 1× do worktree.

## Débitos deliberados (PR futuro de limpeza — NÃO neste bloco)

- `tuneLic` segue no main (2 consumidores, chromo+sun) exposto via
  `ctx.tuneLic`; candidato a `glsl/common.js` com assinatura pura.
- Nomes/idioma dos identificadores intactos (verbatim): rename é outro PR.
- Monólito legado `sol-3d.html` removido da árvore (histórico no git);
  fonte canônica = `src/` + `dist-single/`.

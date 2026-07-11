# Prompt: FASE 3 — "O tempo da estrela"

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: implementar a **Fase 3 do roadmap** (`docs/roadmap-proximo-nivel.md`)
em `src/main.js` — "o tempo da estrela" — o ciclo solar de 11 anos.
Fontes da verdade: `docs/fase-2-luz-como-materia.md` (o que existe, QA,
débitos), `docs/fase-1-estrela-magnetizada.md` (loops/flares),
`docs/roadmap-proximo-nivel.md` (decisões e fases), `docs/cinema-sunshine.md`
(camada cinema) e `README.md` (QA). Não confie em memória de conversas
anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Use **subagentes e workflows sempre que possível** para poupar o contexto
da janela principal: exploração de código via agente Explore (só a
conclusão volta), QA/capturas/sweeps via agentes ou Workflow (fan-out de
variantes + juiz visual), verificação adversarial de achados antes de
mexer. A janela principal fica para decisões, edições e o registro.

## ESTADO ATUAL (git)

- `main`: Fases 0+1+2 mescladas — base Vite + three atual (paridade
  provada), estrela magnetizada (loops RK4 como FITAS orientadas à
  câmera, flare two-ribbon + arcada gateada fora da fase impulsiva,
  starburst/íris pelo HDR real) e a luz como matéria (bloom espectral
  `disp`, halação quente `hal`, preset `?look=sunshine` calibrado por
  painel de juízes ligando loops/burst/disp/hal). Pages publica `main`.
- Desenvolva numa branch nova a partir de `origin/main`.

## ALVOS DA RODADA (re-priorizar; MEDIR antes de mexer)

1. **Ciclo de 11 anos** (Fase 3 núcleo): lei de Spörer (emergência das
   regiões ativas migrando de ±35° para ±5° ao longo do ciclo), reversão
   polar, flip de Hale entre ciclos (polaridade lead/foll invertida por
   hemisfério e por ciclo) — modulando a maquinaria de lifecycle que JÁ
   existe (pairStates, atividade global `uActivity`). Tempo do ciclo
   comprimido com honestidade de VFX (como p-modes/convecção).
2. **Continuidade filamento↔proeminência** no limbo: a mesma estrutura
   escura no disco (filamento) e vermelha além do limbo (proeminência) —
   hoje são sistemas separados.
3. **Cinema: modo time-lapse documental do ciclo** (knob/param novo,
   default 0), possivelmente com a deriva idle-cine existente.
4. **Débitos herdados** (ver doc F2): loop ambiente face-on lê como
   "rabisco" de 1px (candidatos: moss de footpoint, largura mínima
   maior); semeador ~80% rejeição (próxima ideia: pré-validar topologia,
   não o leque); arcada escura pós-esfriamento (precisa absorção, não
   aditivo); **FPS em iPhone real (SÓ O DONO: `?hud=1` no Pages)**.

## CONVENÇÕES (desde o LOOP-5 — não quebrar)

- **Todo knob novo default 0 = frame pixel-idêntico ao baseline.** Gate:
  `npm run build:single` + `npm run qa:parity` (vs `qa/baselines`,
  ≤0.001) e, para prova forte, A/B worktree de `origin/main` vs branch
  com `--max-frac 0` (a Fase 2 fez assim: 0px em 5/5).
- **Sorteios novos em RNG PRÓPRIO** (padrão `loopRand`): nunca
  adicionar/remover chamadas de `srand()` — o stream determinístico dos
  elementos existentes não pode deslocar. ATENÇÃO: o ciclo de 11 anos
  mexe na maquinaria de regiões ativas — se a emergência muda de
  latitude, o frame default MUDA. Estratégia esperada: knob `cycle`
  default 0 congela o comportamento atual (sol de "meio de ciclo"
  eterno); o ciclo só anda com o knob ligado.
- Loop de `animate` sem alocações; tiers respeitados (`TIER_PARAMS`);
  orçamento ≤1ms/frame no mid (sonda A/B busy/calls, ver docs F1/F2).
- QA por rodada: `npm run qa:controls` + `qa:parity` + `qa:phase1`
  (12 checks — mantê-lo verde) + smokes visuais julgados contra fotos
  REAIS (refs em `reference/images/`; borboleta de Spörer e ciclo têm
  diagramas clássicos — buscar refs novas se preciso). Hooks
  `__solInfo.*` para capturas determinísticas (forceFlarePair,
  setFlareClock, setLoopLife, flareInfo com disp/hal, loopInfo, setView,
  perf/perfReset, toggle).
- `sol-3d.html` na raiz é LEGADO congelado — não tocar.
- CI roda o gate em todo push; Pages publica só `main` (merge no fim).

## ARMADILHAS CONHECIDAS (aprendidas nas Fases 1–2)

- SwiftShader ~1s/frame: capturas SEMPRE em `?det=1&seed=7&hold=48` +
  hooks; sob hold o tempo congela (envelopes precisam de setFlareClock/
  setLoopLife; um ciclo de 11 anos precisará de um hook próprio, ex.
  `setCyclePhase`).
- A câmera SEMPRE mira o centro (sem pan): eventos no limbo exigem pôr o
  alvo no horizonte visível `acos(R/dist)` — a 90° o evento some atrás
  do limbo no zoom próximo (ver `limb-loops.js` da F2 e
  `tools/shot-flare-views.js`); mapeamento objeto→mundo com tilt
  z=0.1265 ANTES do spin rotY (Euler XYZ).
- Adicionar uniforms/branches gateados por knob=0 não quebra a paridade;
  mudar qualquer expressão do caminho default quebra.
- Efeito espectral na cadeia de bloom: mexa na SUBIDA (o downsample
  bilinear é acromático e domina o raio — a F2 mediu a descida sozinha
  como imperceptível).
- Julgamento visual: variantes demais viram ruído — 6 variantes × 2
  vistas com 3 juízes de lentes distintas convergiu unânime na F2.

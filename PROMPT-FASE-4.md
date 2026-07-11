# Prompt: FASE 4 — "A coroa de verdade"

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: implementar a **Fase 4 do roadmap** (`docs/roadmap-proximo-nivel.md`)
em `src/main.js` — "a coroa de verdade" — coroa volumétrica raymarched.
Fontes da verdade: `docs/fase-3-o-tempo-da-estrela.md` (o que existe, QA,
débitos), `docs/fase-2-luz-como-materia.md` (bloom/halação),
`docs/fase-1-estrela-magnetizada.md` (loops/campo), `docs/roadmap-proximo-
nivel.md` (decisões e fases), `docs/cinema-sunshine.md` (camada cinema) e
`README.md` (QA). Não confie em memória de conversas anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Use **subagentes e workflows sempre que possível** para poupar o contexto
da janela principal: exploração de código via agente Explore (só a
conclusão volta), QA/capturas/sweeps via agentes ou Workflow (fan-out de
variantes + juiz visual), verificação adversarial de achados antes de
mexer. A janela principal fica para decisões, edições e o registro.

## ESTADO ATUAL (git)

- `main`: Fases 0+1+2+3 mescladas — base Vite + three (paridade provada),
  estrela magnetizada (loops RK4 como fitas, flare two-ribbon,
  starburst/íris), luz como matéria (disp/hal, preset sunshine) e o tempo
  da estrela: ciclo de 11 anos (knob `cycle`: Spörer 35°→5°, flip de
  Hale, reversão polar, envelope de atividade em `cycleAmpK`), time-lapse
  documental (knob `lapse`, ciclo em ~45 s), continuidade
  filamento↔proeminência (knob `fprom`: gêmeo de ABSORÇÃO multiplicativa
  com o mesmo uSeed do cartão da proeminência — o mecanismo de absorção
  que a arcada escura pede já existe). Preset sunshine inclui
  `fprom:0.55`. Pages publica `main`.
- Desenvolva numa branch nova a partir de `origin/main`.

## ALVOS DA RODADA (re-priorizar; MEDIR antes de mexer)

1. **Coroa volumétrica raymarched** (Fase 4 núcleo): helmet streamers
   emergindo da topologia aberta/fechada do MESMO campo de cargas
   (payoff do WebGL2: densidade bakeada em `sampler3D` 64³, fatiada como
   o bake da cromosfera). Tier-gated e integrada ao auto-tune; o plano
   de gradiente atual fica como fallback dos tiers baixos. A coroa deve
   responder a `uActivity` (e portanto ao ciclo da F3: coroa de máximo é
   "cheia", de mínimo tem buracos coronais polares — refs novas SOHO/
   eclipse ajudam).
2. **Arcada escura pós-esfriamento** (débito F1/F2/F3): os laços
   pós-flare esfriam de aditivo para ABSORÇÃO — o blending multiplicativo
   do gêmeo fprom é o mecanismo pronto; falta aplicá-lo aos slots de
   arcada no fim do envelope gradual.
3. **Multiplicidade de manchas no máximo** (débito F3, flag 3/3 juízes):
   o máximo do ciclo tem 1-2 centros visíveis; ref-07 tem vários grupos.
   Candidato: slots virtuais baratos só para manchas pequenas (sem
   loops/proeminências), contagem modulada pela fase do ciclo — MEDIR o
   custo do bake antes.
4. **Débitos herdados**: **proporção das regiões ativas** (pedido do
   dono na F3: medir contra as refs GONG se os emaranhados escuros
   umbra+fibrilas têm escala realística — umbras reais são pontos de
   0.005–0.086R e em zoom próximo o conjunto lê como "chaga" grande);
   deriva diferencial satura sob lapse pesado (cap 0.35/frame —
   registrado, ver doc F3). A antiga pendência "FPS em iPhone real"
   foi ENCERRADA por decisão do dono no fim da F3 (auto-tune + seletor
   de tier cobrem; não pedir números ao dono) — mas o alvo de
   performance continua valendo: o raymarch da coroa precisa de A/B de
   GPU por tier e de respeitar ≥24 fps no mid.

## CONVENÇÕES (desde o LOOP-5 — não quebrar)

- **Todo knob novo default 0 = frame pixel-idêntico ao baseline.** Gate:
  `npm run build:single` + `npm run qa:parity` (vs `qa/baselines`,
  ≤0.001) e, para prova forte, A/B worktree de `origin/main` vs branch
  com `--max-frac 0` (F2 e F3 fizeram assim: 0px em 5/5).
- **Sorteios novos em RNG PRÓPRIO** (padrão `loopRand`):
  nunca adicionar/remover chamadas de `srand()` — o stream dos elementos
  existentes não pode deslocar (a F3 REUSOU o sorteio de latitude para a
  lei de Spörer por isso).
- Loop de `animate` sem alocações; tiers respeitados (`TIER_PARAMS`);
  orçamento ≤1ms/frame de CPU no mid; um raymarch novo precisa de A/B
  de GPU por tier (perf() busy/ms/p95) antes de entrar no default.
- QA por rodada: `npm run qa:controls` + `qa:parity` + `qa:phase1` +
  `qa:phase3` (24 checks somados — mantê-los verdes) + smokes visuais
  julgados contra fotos REAIS (refs em `reference/images/`; para a coroa
  buscar refs novas: eclipse total, LASCO C2, buraco coronal).
- Hooks `__solInfo.*` para capturas determinísticas (setCyclePhase,
  cycleInfo, fpromInfo, forceFlarePair, setFlareClock, setLoopLife,
  setPromLife, projectProm, setView, perf/perfReset, toggle).
- `sol-3d.html` na raiz é LEGADO congelado — não tocar.
- CI roda o gate em todo push; Pages publica só `main` (merge no fim).

## ARMADILHAS CONHECIDAS (aprendidas nas Fases 1–3)

- SwiftShader ~1s/frame: capturas SEMPRE em `?det=1&seed=7&hold=48` +
  hooks; sob hold o tempo congela E O BAKE NÃO RE-RODA — para fotografar
  um estado saltado (ex. setCyclePhase) use hold alto (150) e salte
  ANTES do frame de congelamento (ver shot-cycle.js na doc F3).
- A câmera SEMPRE mira o centro: eventos no limbo exigem o horizonte
  visível `acos(R/dist)`; mapeamento objeto→mundo com tilt z=0.1265
  ANTES do spin rotY (Euler XYZ). `prominences()` indexa MESHES (2
  cartões/prom ⇒ prom i = índice 2i). Âncora perto do polo: varrer em
  PHI (rumo ao equador), não em theta.
- Adicionar uniforms/branches gateados por knob=0 não quebra a paridade;
  mudar qualquer expressão do caminho default quebra (multiplicar por
  1.0 e somar 0.0 são bit-exatos e passam no gate — a F3 usou os dois).
- Absorção contra o disco: escalar por mu (a luz que resta) — multiply
  forte sobre o anel de limb darkening lê como "renda flutuante"; miolo
  sólido (gate de ruído vira modulação) — buracos até zero leem como
  dithering (painel F3, flag unânime).
- Julgamento visual: 3 juízes de lentes distintas (realismo/cinema/
  legibilidade) convergiu de novo na F3; capturas com maturidade
  forçada via hooks; medir ANTES de mexer (a 1ª margem da sonda de
  topologia não rejeitava nada — só a medição pegou).

# Prompt: FASE 5 — "Erupção"

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: implementar a **Fase 5 do roadmap** (`docs/roadmap-proximo-nivel.md`)
em `src/main.js` — "Erupção" — CME de flux-rope, partículas por transform
feedback, profundidade de campo hexagonal e modo diretor.
Fontes da verdade: `docs/fase-4-a-coroa-de-verdade.md` (o que existe, QA,
débitos), `docs/fase-3-o-tempo-da-estrela.md` (ciclo/fprom),
`docs/fase-1-estrela-magnetizada.md` (flare two-ribbon/loops),
`docs/fase-2-luz-como-materia.md` (bloom/halação),
`docs/roadmap-proximo-nivel.md` (decisões e fases),
`docs/cinema-sunshine.md` (camada cinema) e `README.md` (QA). Não confie
em memória de conversas anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Use **subagentes e workflows sempre que possível** para poupar o contexto
da janela principal: exploração de código via agente Explore (só a
conclusão volta), QA/capturas/sweeps via agentes ou Workflow (fan-out de
variantes + juiz visual), verificação adversarial de achados antes de
mexer. A janela principal fica para decisões, edições e o registro.

## PERFORMANCE (diretriz do dono — explícita)

**NÃO pedir números de FPS/performance ao dono — em nenhuma hipótese.**
A pendência "FPS em iPhone real" foi ENCERRADA por decisão do dono no
fim da F3; medição em aparelho do dono está fora do processo. O alvo
técnico de sempre continua valendo integralmente, mas é **gate de
código**, verificado por você com as ferramentas do repo:

- todo passe/draw novo (casca do CME, partículas, DoF) precisa de
  **A/B de GPU por tier** (hooks `__solInfo.perf`/`perfReset` —
  busy/ms/p95) antes de entrar no default de qualquer tier;
- e precisa **respeitar ≥24 fps no mid** (o limiar de 42ms p95 do
  auto-tune é a régua). O kill-switch do auto-tune (padrão `cvolKilled`
  da F4) é o mecanismo para custos que só aparecem em runtime.

Se o mid não segurar um efeito, ele não entra no default desse tier —
fica tier-gated acima — sem consultar o dono.

## ESTADO ATUAL (git)

- `main`: Fases 0+1+2+3+4 mescladas — base Vite + three (paridade
  provada), estrela magnetizada (loops RK4 como fitas, flare two-ribbon
  com envelope de 2 fases `flareEnvImp`/`flareEnvGrad`, arcada
  pós-flare, starburst/íris por `flareHDR`), luz como matéria
  (disp/hal), o tempo da estrela (ciclo de 11 anos `cycle`, time-lapse
  `lapse`, filamento↔proeminência `fprom` com gêmeo de absorção
  multiplicativa) e a coroa de verdade (`cvol`: Data3DTexture 64³
  bakeada 1 fatia/frame, raymarch GLSL3 com topologia por unipolaridade
  — streamers na superfície neutra, buracos coronais unipolares; arcada
  escura pós-esfriamento; kill-switch `cvolKilled` no auto-tune).
  Preset sunshine: h2 + `loops:0.55, burst:0.55, disp:0.40, hal:0.45,
  fprom:0.55, cvol:0.5`. Pages publica `main`.
- Desenvolva na branch designada da sessão (a partir de `origin/main`).

## ALVOS DA RODADA (re-priorizar; MEDIR antes de mexer)

1. **CME — casca de flux-rope que se desprende em flares grandes**
   (Fase 5 núcleo): nos flares fortes, a proeminência/flux-rope sobre a
   PIL perde equilíbrio e ERUPCIONA — casca de croissant/bolha que se
   expande auto-similar e escapa, com **brilho de espalhamento Thomson
   no limbo** (a "CME de três partes" do LASCO C2, ref-10: frente
   brilhante, cavidade escura, núcleo denso). Física e cinema juntos
   ("uma estrela, um estado"): o gatilho é o MESMO evento do flare
   two-ribbon (reconexão por baixo ⇒ fitas + arcada; a arcada escura
   pós-esfriamento da F4 é o rescaldo natural), a lente reage
   (íris/starburst já seguem `flareHDR`). A frequência deve seguir o
   ciclo da F3 (`uActivity`: no máximo CMEs frequentes; no mínimo
   raras). Knob novo default 0 = paridade bit-exata.
2. **Partículas por transform feedback** (payoff WebGL2 nº 2): material
   do núcleo/ejecta do CME — plasma que acompanha a casca, alonga e
   escapa (e/ou drena de volta pelas pernas do flux-rope, a chuva
   coronal do rescaldo). GPGPU via transform feedback (advecção na
   GPU), zero readback, buffers pré-alocados, tier-gated (contagem por
   tier; low pode ficar sem).
3. **Profundidade de campo hexagonal em close-ups** (cinema): bokeh de
   íris de 6 lâminas nos zooms próximos — CoC ANALÍTICO (foco na
   superfície mais próxima do disco; sem readback de Z, convenção da
   íris), gather hexagonal barato no composite ou em RT reduzido.
   Coerente com o starburst de 6 braços da F1 (a mesma íris). Knob
   default 0 = paridade.
4. **Modo diretor** (payoff da fase): sequência-atração determinística
   — ciclo (time-lapse), emergência de região, flare grande + CME +
   rescaldo, close-ups com DoF, linguagem de câmera Sunshine (`hand`) —
   coreografada por cima dos hooks/knobs existentes, opt-in por URL
   (`?director=1`), sem tocar o caminho default. É a vitrine que amarra
   as 5 fases.
5. **Débitos herdados** (re-priorizar; medir antes): multiplicidade de
   manchas no máximo (F3, flag 3/3 juízes — slots virtuais baratos,
   MEDIR custo do bake antes); proporção das regiões ativas vs refs
   GONG (pedido do dono na F3 — medir umbras contra 0.005–0.086R);
   plumas polares nos buracos coronais (F4 — candidata a modulação
   procedural no shader do raymarch); cúspide de helmet streamer (F4,
   partir de v2-folha-forte); balanço raias antigas × streamers
   volumétricos (F4); smoke de VÍDEO dos fios de 1px do fil-suave (F4 —
   o julgamento foi em stills).

## CONVENÇÕES (desde o LOOP-5 — não quebrar)

- **Todo knob novo default 0 = frame pixel-idêntico ao baseline.** Gate:
  `npm run build:single` + `npm run qa:parity` (vs `qa/baselines`,
  ≤0.001) e, para prova forte, A/B worktree de `origin/main` vs branch
  com `--max-frac 0` (F2, F3 e F4 fizeram assim: 0px em 5/5).
- **Sorteios novos em RNG PRÓPRIO** (padrão `loopRand`, mulberry32):
  nunca adicionar/remover chamadas de `srand()` — o stream dos elementos
  existentes não pode deslocar. Eventos default novos (CME em flare
  grande) só podem sortear em stream próprio.
- Loop de `animate` sem alocações; tiers respeitados (`TIER_PARAMS`);
  orçamento ≤1ms/frame de CPU no mid; passe/draw novo precisa de A/B
  de GPU por tier (perf() busy/ms/p95) antes de entrar no default.
- QA por rodada: `npm run qa:controls` + `qa:parity` + `qa:phase1` +
  `qa:phase3` + `qa:phase4` (37 checks somados — mantê-los verdes) +
  `qa:phase5` novo + smokes visuais julgados contra fotos REAIS (refs
  em `reference/images/`; para o CME: ref-10 LASCO C2 já existe —
  buscar ref de CME de três partes e de proeminência eruptiva se
  precisar).
- Hooks `__solInfo.*` para capturas determinísticas (setCyclePhase,
  cycleInfo, fpromInfo, forceFlarePair, setFlareClock, setLoopLife,
  setPromLife, projectProm, setView, perf/perfReset, toggle,
  coronaInfo, rebakeCorona, setCvol*) — todo subsistema novo ganha os
  seus (forceCME, cmeInfo, setDofFocus…).
- `sol-3d.html` na raiz é LEGADO congelado — não tocar.
- CI roda o gate em todo push; Pages publica só `main` (merge no fim).

## ARMADILHAS CONHECIDAS (aprendidas nas Fases 1–4)

- SwiftShader ~1s/frame: capturas SEMPRE em `?det=1&seed=7&hold=48` +
  hooks; sob hold o tempo congela E OS BAKES NÃO RE-RODAM — para
  fotografar estado saltado use hold alto (150) e salte ANTES do frame
  de congelamento (shot-cycle da F3), ou o hook `rebakeCorona` (F4).
- A câmera SEMPRE mira o centro: eventos no limbo exigem o horizonte
  visível `acos(R/dist)`; mapeamento objeto→mundo com tilt z=0.1265
  ANTES do spin rotY (Euler XYZ). `prominences()` indexa MESHES (2
  cartões/prom ⇒ prom i = índice 2i). Âncora perto do polo: varrer em
  PHI (rumo ao equador), não em theta.
- Adicionar uniforms/branches gateados por knob=0 não quebra a paridade;
  mudar qualquer expressão do caminho default quebra (multiplicar por
  1.0 e somar 0.0 são bit-exatos e passam no gate — a F3 e a F4 usaram
  os dois).
- Transparentes desenham DEPOIS dos opacos: raio/billboard que cobre o
  disco precisa cortar o que fica À FRENTE do disco (a F4 cortou o raio
  que atinge o disco; QA G1 prova o miolo bit-idêntico). `renderOrder`
  importa para absorção × emissão (arcada escura em -0.5: multiplica
  depois da coroa, antes das emissões).
- Absorção contra o disco: escalar por mu (a luz que resta); miolo
  sólido (gate de ruído vira modulação) — buracos até zero leem como
  dithering (painel F3, flag unânime).
- GLSL3 no three r185: `gl_FragColor` não existe — `out vec4 fragColor`
  explícito. Transform feedback exige gerenciar programas/VAOs fora do
  caminho feliz do three — isole num par de ShaderMaterial/raw GL bem
  encapsulado e NÃO toque o estado GL global sem restaurar.
- Qualquer mesh transparente extra visível durante ciclos de bake
  desloca o rasterizador SwiftShader em ~1 LSB (histerese documentada
  na F4, pré-existente) — checks de live-toggle usam tolerância ≤200px;
  paridade com knob 0 (mesh invisível) segue bit-exata.
- Julgamento visual: 3 juízes de lentes distintas (realismo/cinema/
  legibilidade|artefatos) convergiu nas F2/F3/F4; capturas com
  maturidade forçada via hooks; sweep SEM rebuild (uniforms por hook,
  padrão setCvolShape da F4); medir ANTES de mexer.

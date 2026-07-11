# Prompt: FASE 2 — "A luz como matéria" (+ polimento LOD da Fase 1)

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: implementar a **Fase 2 do roadmap** (`docs/roadmap-proximo-nivel.md`)
em `src/main.js` — "a luz como matéria" — e fechar os débitos de LOD da
Fase 1. Fontes da verdade: `docs/fase-1-estrela-magnetizada.md` (o que
existe, QA, débitos), `docs/roadmap-proximo-nivel.md` (decisões e fases),
`docs/cinema-sunshine.md` (camada cinema) e `README.md` (QA). Não confie
em memória de conversas anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Use **subagentes e workflows sempre que possível** para poupar o contexto
da janela principal: exploração de código via agente Explore (só a
conclusão volta), QA/capturas/sweeps via agentes ou Workflow (fan-out de
variantes + juiz visual), verificação adversarial de achados antes de
mexer. A janela principal fica para decisões, edições e o registro.

## ESTADO ATUAL (git)

- `main`: Fase 0 (Vite + three 0.185, paridade provada) + **Fase 1
  mesclada** — loops coronais RK4 (knob `loops`, default 0), flare
  two-ribbon com envelope de 2 fases + arcada pós-flare (default do
  evento), starburst de difração (knob `burst`, default 0) e íris
  dirigidos pelo brilho HDR real do flare. Pages publica `main`
  automaticamente (https://fgferre.github.io/Novo-Sol-Fable-3d/).
- Desenvolva numa branch nova a partir de `origin/main`.

## ALVOS DA RODADA (re-priorizar; MEDIR antes de mexer)

1. **Bloom espectral ponderado por corpo negro** (Fase 2 núcleo): R
   espalha mais que B (difração ∝ λ) — o halo quente de filme. Provável
   implementação: raios de blur por canal na cadeia dual-Kawase existente
   (sem passes novos se possível). Knob novo default 0.
2. **Halation com peso de temperatura** nas emissões de plage/flare
   (`veil` hoje é neutro): as altas quentes sangram mais para o vermelho.
   Reusar o mip largo existente; knob/extensão default 0.
3. **Débitos LOD da Fase 1** (registrados em
   `docs/fase-1-estrela-magnetizada.md`): (a) loops/arcada com ESPESSURA
   DE TELA (hoje LineSegments de 1px — de perto viram wireframe; trocar
   por fitas orientadas à câmera, mesmo buffer/estados); (b) strands das
   fitas de flare escalados por zoom; (c) opcional: estágio "arcada
   escura" pós-esfriamento (H-alfa real) e semeador ambiente menos
   perdulário (~80% de rejeição, inofensivo mas deselegante).
4. **Sweep com juiz visual** para calibrar um preset que ligue
   `loops`/`burst` (hoje fora do `?look=sunshine` — decisão registrada).
5. **Validação de FPS em iPhone real** (pendência desde a Fase 0): só o
   dono pode — pedir a ele `?hud=1` nos tiers mid/high e registrar.

## CONVENÇÕES (desde o LOOP-5 — não quebrar)

- **Todo knob novo default 0 = frame pixel-idêntico ao baseline.** Gate:
  `npm run build:single` + `npm run qa:parity` (vs `qa/baselines`,
  ≤0.001) e, para prova forte, A/B stash vs working tree com
  `--max-frac 0` (a Fase 1 fez assim: 0px em 5/5).
- **Sorteios novos em RNG PRÓPRIO** (padrão `loopRand` na Fase 1): nunca
  adicionar/remover chamadas de `srand()` — o stream determinístico dos
  elementos existentes não pode deslocar.
- Loop de `animate` sem alocações (temporários pré-alocados, laços de
  índice, nada de closure nova por frame).
- Tiers respeitados (`TIER_PARAMS`), orçamento ≤1ms/frame no mid para
  features novas; medir com a sonda A/B (busy + draw calls, ver doc F1).
- QA por rodada: `npm run qa:controls` + `qa:parity` + `qa:phase1`
  (12 checks — mantê-lo verde) + smokes visuais das features novas
  julgados contra fotos REAIS (o reality check da Fase 1 achou e corrigiu
  2 desvios; há refs em `reference/images/` e hooks `__solInfo.*` p/
  capturas determinísticas: forceFlarePair, setFlareClock, setLoopLife,
  flareInfo, loopInfo).
- `sol-3d.html` na raiz é LEGADO congelado (pré-migração) — não tocar.
- CI roda o gate em todo push; Pages publica só `main` (merge no fim).

## ARMADILHAS CONHECIDAS (aprendidas na Fase 1)

- SwiftShader ~1s/frame: capturas SEMPRE em `?det=1&seed=7&hold=48`
  (mesmo frame da paridade) + hooks de QA; sob hold o tempo congela
  (envelopes precisam de setFlareClock/setLoopLife).
- A câmera do app SEMPRE mira o centro (sem pan) e o horizonte visível é
  `acos(R/dist)` ≈ 63° no zoom médio, não 90°: enquadrar eventos no limbo
  exige calcular o ângulo (ver `tools/shot-flare-views.js` e o mapeamento
  objeto→mundo com tilt z=0.1265 ANTES do spin rotY, Euler XYZ).
- Adicionar uniforms/branches gateados por knob=0 não quebra a paridade;
  mudar qualquer expressão do caminho default quebra.

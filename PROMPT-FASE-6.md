# Prompt: FASE 6 — "Acabamento físico" (Bloco B, PR 2 de 3)

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: executar o **Bloco B do plano pós-roadmap** — os débitos
físicos acumulados nas Fases 3–5: multiplicidade+proporção de manchas
(knob novo `spots`), plumas polares e cúspide na coroa volumétrica, e
estrias do rope + contraste de cavidade no CME.
**Pré-requisito: o PR da INFRA (modularização, `PROMPT-INFRA-MODULAR.md`)
já mesclado** — este bloco trabalha no código modular
(`src/surface/sun.js`, `src/atmosphere/coronaVolume.js`,
`src/atmosphere/cme.js`). Se a infra ainda não entrou, PARE e execute
aquele prompt primeiro.
Fontes da verdade: `docs/roadmap-proximo-nivel.md`, `docs/fase-3..5-*.md`,
`docs/infra-modularizacao.md`, `reference/images/README.md`, `README.md`.
Não confie em memória de conversas anteriores.

## MÉTODO (diretriz do dono — INEGOCIÁVEL)

Subagentes e workflows sempre que possível (exploração via Explore;
sweep + painel de 3 juízes como Workflow — protocolo das F2-F5).
MEDIR antes de mexer.

## PERFORMANCE (diretriz do dono — explícita)

**NÃO pedir números de FPS ao dono.** Custo novo (loop uSpots no disco,
plumas no raymarch) exige **A/B de GPU por tier** via `__solInfo.perf`/
`perfReset` (com WARMUP de ~12 frames antes do perfReset — a 1ª medição
paga compile de pipeline, lição da F5) e respeito ao piso de 24fps do
mid (limiar 42ms p95); kill-switches são o mecanismo, não medição do
dono.

## ALVOS

### B1 — Manchas de verdade (knob novo `spots`, 0–1.5, default 0)
O débito mais flagrado do projeto (3/3 juízes desde a F3) + pedido do
dono (proporção vs refs GONG). FATOS mapeados no código pré-infra
(procure o equivalente pós-modularização em `src/surface/sun.js`):
- As umbras são desenhadas AO VIVO no fragment do disco (loop
  `for(i<8)` sobre uCharges, ~l.1388-1422 do main.js antigo), NÃO no
  bake. Raio atual: `r = (0.016 + 0.014*aw) * (1 - 0.45*isFoll)` ⇒
  líder 0.016-0.030R vs refs GONG 0.005-0.086R (ref-07: grupos
  múltiplos, umbras minúsculas E raras gigantes).
- Caminho de menor custo (decidido): **manchas VIRTUAIS por um uniform
  array novo `uSpots[N]` (N≈10) SÓ no shader do disco** — 1 shader
  recompila, ZERO custo no bake (opção (a) da exploração; a opção (b),
  aumentar uCharges, recompila 5 shaders e muda a física — descartada).
- Estado JS: slots virtuais com lifecycle leve — nascem PERTO de
  regiões vivas (lei de Spörer via banda do ciclo), contagem modulada
  por `cycleAmpK` (no máximo o disco ganha grupos como a ref-07),
  sorteios em RNG PRÓPRIO (`spotRand`, padrão loopRand — o stream do
  srand é sagrado). Sem carga no campo: não tocam fibrilas/coroa/PIL.
- Proporção: com `spots>0`, recalibrar o RAIO (reais e virtuais) para
  o range GONG — grupos maiores no máximo, líder raro até ~0.05-0.08R.
  Com `spots=0`: loop novo gateado por uniform (`if uSpotsOn`), o
  `max()` com contribuição 0 é bit-exato — paridade por construção.
- Limitação ACEITA (documentar): manchas virtuais sem colar de plage
  (o colar vem do canal B do bake, que lê a simulação — injetar no
  bake fica como refinamento futuro).
- GLSL1: loop com bound constante (`#define SPOTS_MAX`) + break/skip
  por w<=0.
- QA: contagem por fase do ciclo (mín/máx via setCyclePhase),
  histograma de raios vs range GONG, paridade spots=0, A/B GPU do loop.

### B2 — Plumas polares + cúspide (coroa volumétrica, sem knob novo)
Refinos do shader raymarch da F4 no look já knob-gated (`cvol`):
- Plumas: raios finos/retos/levemente divergentes DENTRO dos buracos
  coronais (unipolaridade alta perto da superfície — o proxy da F4 já
  identifica a região; ref-09). Modulação procedural ANGULAR no shader
  (o volume 64³ não resolve fios finos), peso novo exposto em
  `setCvolShape` com default = imagem atual (paridade do look atual;
  o painel de juízes decide o valor).
- Cúspide: termo de ALTURA no expoente da folha do streamer — partir
  de v2-folha-forte (sheet 1.15/base 0.20, nota técnica do juiz físico
  da F4).
- Gates: `cvol=0` bit-exato; checks I1/I2 do qa:phase4 verdes; painel
  de 3 juízes vs refs 09/10/11/12.

### B3 — Estrias do rope + cavidade (CME, sem knob novo)
Flags do painel da F5 no look knob-gated (`cme`), em
`src/atmosphere/cme.js`:
- Estrias: o fbm isotrópico do rim vira fbm em coordenada HELICOIDAL
  alinhada ao eixo do rope (`cmeAxis`) — o rim deve ler como laços
  aninhados (ref-13), não "contas" (flag do juiz físico F5).
- Cavidade: gate explícito de rarefação no interior da bolha. Alvo
  MEDIDO: contraste frente:cavidade ≥2× em perfil radial (hoje ~1.3×
  vs ≥3× na ref-13 — o bloom/veil preenchem; medir pós-composite).
- Gates: qa:phase5 grupo K verde; painel de juízes vs ref-13/14.

### B4 — Registro
`docs/fase-6-acabamento-fisico.md` + roadmap + README; preset
`?look=sunshine` ganha `spots` SE o painel aprovar (mediana das 3
recomendações — protocolo de sempre); débitos restantes anotados.

## CONVENÇÕES (LOOP-5+ — não quebrar)

Knob novo default 0 = frame bit-exato (prova: qa:parity + **A/B
worktree origin/main vs branch `--max-frac 0`, 0px em 5/5**); RNG novo
em stream próprio; zero alocações no animate; capturas
`?det=1&seed=7&hold=48` (estado saltado: hold alto + saltar antes do
congelamento + re-bake hooks); gates herdados TODOS verdes (controls
6/6, phase1 12/12, phase3 12/12, phase4 13/13, phase5 14/14) + novos
checks em `tools/qa-phase6.js` (`qa:phase6` no package.json); sweep de
calibração SEM rebuild (hooks setX ao vivo); painel de 3 juízes
(físico/cinema/artefatos) como Workflow; `sol-3d.html` da raiz é
legado congelado; 1 PR, merge no fim (o dono acompanha pelo Pages).

## ARMADILHAS

Câmera sempre mira o centro (evento no limbo: horizonte
`acos(R/dist)`); tilt z=0.1265 ANTES do rotY; `prominences()` indexa
MESHES (2 cartões/prom); transparentes desenham depois dos opacos
(corte do raio que atinge o disco — padrão F4/F5); GLSL3 no three
r185: `out vec4 fragColor`; histerese de ~1 LSB do SwiftShader com
mesh transparente durante bake (checks de live-toggle usam ≤200px);
julgamento em stills tem ponto cego de MOVIMENTO — flags temporais
ficam para o Bloco C (`PROMPT-RODADA-MOVIMENTO.md`), não corrigir aqui.

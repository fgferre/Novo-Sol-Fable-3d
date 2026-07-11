# Fase 2 — "A luz como matéria"

Registro de entrega da Fase 2 do roadmap (`roadmap-proximo-nivel.md`):
bloom espectral ponderado por corpo negro, halação com peso de
temperatura, e o fechamento dos débitos de LOD da Fase 1. Convenções do
LOOP-5 mantidas: **todo knob novo com default 0 = frame pixel-idêntico
ao baseline**, sorteios novos em RNG próprio, loop de `animate` sem
alocações, tiers respeitados.

## O que existe agora

### Bloom espectral (knob `disp`, default 0, 0–1.5)

Difração ∝ λ: o R espalha mais que o B — o "halo quente de filme".
Implementado DENTRO da cadeia dual-Kawase existente, sem passes novos:

- **Descida** (`downsampleFragment`): os 4 taps diagonais viram 12 quando
  o knob liga — offsets por canal, R em `uTexel·(1+0.35·disp)`, B em
  `uTexel·(1−0.25·disp)`, G intocado.
- **Subida** (`upsampleFragment`): a lição da rodada. O passthrough de
  1 tap vira um tent de 4 taps com raio por canal (R `0.5+1.70·disp`,
  B `0.5−0.34·disp` texels do mip de origem, por nível). **Só a descida
  espectral era imperceptível** (ΔR médio +0.21/255, 0.6% dos pixels no
  smoke A/B): o grosso do raio do dual-Kawase vem da pirâmide bilinear,
  que é acromática — o espalhamento diferencial precisa compor sobre o
  sinal ACUMULADO da subida. Com o tent espectral: 2.2% dos pixels,
  ΔR +0.54, ΔB −0.01 — saia quente visível no limbo, núcleo neutro.
- Assinatura espectral correta por construção: energia por canal
  conservada (os taps são médias), então o centro do halo fica um degrau
  mais frio e a borda mais quente — sem tint pintado à mão.

### Halação com peso de temperatura (knob `hal`, default 0, 0–1.5)

O `veil` neutro da camada cinema continua intocado; o `hal` é um ramo
NOVO no `compFragment` que reusa o MESMO mip largo (`tVeil`, custo zero
de passes):

- Peso por pixel = excesso espectral de R no mip largo
  (`max(hv.r − 0.5·(hv.g+hv.b), 0)`): plage (1.0, 0.70, 0.32) e limbo
  quente (1.0, 0.30, 0.10) sangram forte; altas NEUTRAS pesam ~0. É o
  "ponderado por corpo negro" do roadmap sem lookup de temperatura: a
  informação espectral da fonte já está no mip.
- Tint de anti-halation `vec3(1.0, 0.38, 0.14)` — no filme, a camada
  anti-halação absorve o λ curto; o que sangra de volta pela base é o
  vermelho.
- Ganho global surge com o flash: `uHal = HAL_K·(1 + 1.6·flareHDR)` —
  o MESMO escalar físico que dirige íris e starburst ("uma estrela, um
  estado"). Medido no smoke: hal 1.2 → 4.57 com flare impulsivo mirado
  (hdr 1.75).

### Débitos de LOD da Fase 1 — fechados

- **(a) Fitas orientadas à câmera** no lugar do `LineSegments` de 1px:
  cada ponto da linha central vira 2 vértices (`aSide` ±1) expandidos no
  vertex shader perpendicular à direção projetada do segmento. Largura =
  tubo de meia-largura FIXA EM MUNDO (0.006 R☉) projetada para pixels,
  com piso de 1px (longe degenera na linha fina de antes; brilho
  sub-pixel vira fade de energia, sem cintilar) e teto de 14px. Perfil
  transversal parabólico (`1 − vSide²`) — tubo de plasma, não fita de
  papel. Mesma filosofia de buffer (um único conjunto pré-alocado no
  máximo do tier, nunca realocado; só position/aTan mudam no re-traço) e
  mesmos estados (aditivo, sem depthWrite, depthTest liga — o disco
  oculta o que está atrás do limbo). `LineSegments` → `Mesh` indexado
  (2 triângulos/segmento, Uint16).
  - LOD fino aprendido no smoke: numa fita larga o contraste 4.6:1 das
    harmônicas de fluxo (vivo num fio de 1px) quebrava o tubo em
    "salsichas" — o contraste amortece com a largura em tela (`vWide`).
  - Check A3 do `qa:phase1` (diff vs baseline com loops=1.2) subiu de
    622px para 2095px — as fitas têm presença real; o smoke
    `limb-close` mostra feixes de tubos de perfil nos dois limbos, o
    look AIA das refs.
- **(b) Strands por zoom**: a frequência do ruído de recorte das fitas
  de flare (`fbmLight(sp·230)`) agora escala com `fitDist/camDist`
  (clamp 1.0–2.6), empacotada no `uFlareRib.w` que estava livre. No fit
  e além, fator 1.0 — o look calibrado da Fase 1 fica intocado; de
  perto o recorte granula fino em vez de virar blobs de aerógrafo.
- **(c) Semeador ambiente — experimentado e revertido.** O leque de
  offsets proporcional ao ângulo de separação lead→foll foi implementado
  e MEDIDO (sonda com 266 traços, high, det=1&seed=7): rejeição 79.7%
  vs 80.0% do leque fixo — a rejeição é dominada pela topologia do campo
  multi-carga, não pelo offset do leque. Revertido; o débito segue
  aberto e segue inofensivo (0.010 ms/traço medido).
- **(d) Arcada escura pós-esfriamento**: fora desta rodada, registrado
  de novo. Com blending aditivo não há como escurecer; exigiria absorção
  no shader do disco (como filamentos) ou passe multiplicativo — feature
  nova, não polimento.

### Arcada respeita a fase impulsiva (correção de física + estética)

O painel de juízes flagrou, unânime, "anéis fantasma" ao redor do core
do flare — presentes ATÉ NO CONTROLE sem knobs novos. Diagnóstico: era a
arcada pós-flare de frente, acesa já em t=0.3 (o envelope gradual vale
0.33 aí). Fisicamente os laços pós-reconexão crescem na fase GRADUAL,
minutos após o pico. Gate novo no relógio do evento (0.55→1.05): a
arcada fica apagada durante o flash e cresce no rescaldo. Em t≥2.5
(check B4) o gate já vale 1.

### Preset `?look=sunshine` — dívida da Fase 1 paga

`loops`/`burst` estavam fora do preset "até um sweep com juiz visual"
(decisão registrada na F1). Feito, com os knobs novos juntos:

- **Sweep**: 6 variantes × 2 vistas (fit + flare impulsivo mirado),
  capturas determinísticas (`det=1&seed=7&hold=48`, high).
- **Painel de 3 juízes** (Workflow, lentes distintas): diretor de
  fotografia (look Sunshine), físico solar (fidelidade vs refs
  GONG/AIA131), caçador de artefatos (legibilidade). **v1-sutil
  (0.5/0.5/0.4/0.4) venceu nas três lentes, 8.5/10 em todas.**
- **Valores finais = mediana das 3 recomendações**:
  `loops:0.55, burst:0.55, disp:0.40, hal:0.45`.
- Tetos aprendidos (documentados no `LOOK`): loops≥0.8 lê como "mola de
  neon"; burst≥1.0 vira cunha dura de star-filter; disp≥0.7 lava o disco
  para ouro; hal≥0.9 vira véu leitoso e amplifica qualquer artefato
  circular.
- O knob `loops` passou a ler `lk()` como os demais (estava hardcoded 0).

## QA da rodada

- **Paridade**: vs `qa/baselines` 0–7px (0.0000–0.0012%), os MESMOS
  deltas de anti-alias da Fase 0. Prova forte A/B (stash vs working
  tree, e ao final worktree de `origin/main` vs branch) com
  `--max-frac 0`: **0px em 5/5 capturas** — knobs novos em default 0
  não mudam um pixel.
- **`qa:controls`**: 6/6. **`qa:phase1`**: 12/12 verde (A3 2095px).
  Zero pageerror/console error em todas as cargas.
- **Perf (sonda A/B, tier mid, SwiftShader, 121 frames/config)**:
  baseline busy 1.14ms/30 calls; disp+hal 1.09ms/30 (zero custo, zero
  passes novos); loops-fitas 1.28ms/31 (+1 call do mesh, delta no
  ruído); tudo ligado 1.06ms/31. Orçamento ≤1ms/frame para features
  novas: respeitado (deltas ≤0.14ms, sinal trocado entre configs =
  ruído de medição).
- **Smokes visuais julgados**: bloom espectral (A/B numérico + crop de
  limbo), halação (fit + flare), fitas (fit / limb-close / macro /
  ribbons-mid), preset final (fit + impulsivo + gradual).

## Débito consciente (Fase 2)

- Semeador ambiente ~80% de rejeição: experimento de viés por separação
  não moveu a agulha (79.7% vs 80.0%) — próxima ideia teria de olhar a
  TOPOLOGIA (ex.: pré-validar o dipolo local antes de traçar), não o
  leque. Segue inofensivo.
- Loop ambiente quase de frente lê como "rabisco" fino (flag do juiz de
  legibilidade): o piso de 1px em elipse projetada é fio de cabelo.
  Candidatos: brilho de footpoint ("moss" mais forte) e/ou largura
  mínima maior para loops face-on. Knob do preset ficou em 0.55 em
  parte por isso.
- Arcada escura (H-alfa real pós-esfriamento): segue fora, ver (d).
- **Validação de FPS em iPhone real: SÓ O DONO PODE.** Pendente desde a
  Fase 0. Pedido: abrir https://fgferre.github.io/Novo-Sol-Fable-3d/
  no iPhone com `?hud=1` (e depois `?hud=1&tier=high`) e reportar os
  números do HUD (fps, ms avg/p95, cpu) para registro.

## Ferramentas da rodada (scratchpad, reproduzíveis)

Sondas e capturas viveram fora do repo (scratchpad da sessão):
`smoke-fase2.js` (8 smokes das features), `probe-seeder.js` (rejeição do
semeador), `perf-fase2.js` (A/B busy/calls no mid), `sweep-preset.js`
(6 variantes × 2 vistas), `limb-loops.js` (perfil no limbo com o evento
posto no horizonte visível `acos(R/dist)` — a 90° o evento some atrás do
limbo no zoom próximo), `verify-preset.js` (verificação final do
preset). Todas seguem o padrão `?det=1&seed=7&hold=48` + hooks
`__solInfo.*`; `flareInfo()` agora expõe `disp`/`hal` para sondas.

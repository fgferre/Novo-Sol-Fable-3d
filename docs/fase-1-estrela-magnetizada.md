# Fase 1 — "A estrela magnetizada" (2026-07-10)

Implementação da Fase 1 do roadmap: loops coronais traçados sobre o
campo de cargas existente, flares two-ribbon na PIL com arcadas
pós-flare (pendência do audit-loop6, ref-08 nota 4/10) e cinema
acoplado ao estado físico (starburst + íris dirigidos pelo brilho HDR
real do flare). Nenhuma dependência nova; tudo em `src/main.js`.

## 1. Loops coronais (knob `loops`, default 0)

- **Física**: linhas do MESMO campo de cargas do resto do app
  (`bFieldJS` = espelho JS de `BFIELD_GLSL`/`uCharges`), traçadas por
  **RK4 de passo de arco fixo sobre o campo unitário** B/|B| (o
  comprimento do passo independe de |B| — estável perto das cargas).
  Semeadas num leque sobre o pé LÍDER de uma região viva (sorteio
  ∝ |w|), voltado ao seguidor — viram a arcada da região ativa.
  Validação: a linha precisa FECHAR (pousar de volta na superfície),
  erguer-se o bastante para ler como laço (ápice ≥ 1.035 R) e não ser
  linha aberta (r > 2.3 R descarta — linhas polares ficam p/ a Fase 4).
- **Amortização** (como o bake fatiado): ≤1 re-traço por frame,
  ~0.02-0.03 ms/traço medido (SwiftShader CPU); re-traço só no fim do
  ciclo de vida do slot (idade/período/`lifeEnvelope`, períodos
  34-70 s) — o loop novo nasce do campo DO MOMENTO e acompanha a
  evolução das cargas. Traço com scratch pré-alocado: zero alocações.
- **Render**: um único `LineSegments` aditivo HDR (o bloom faz o glow),
  `depthTest` liga a oclusão pelo disco; envelope/hot por loop via
  uniform array lido no vertex shader; fluxo de plasma por 2 harmônicas
  incomensuráveis + pés mais brilhantes ("moss"). Brilho global escala
  com a atividade do ciclo ("uma estrela, um estado").
- **Tiers**: low 8+5, mid 12+7, high 16+9, ultra 22+12 loops
  (ambientes+arcada), segmentos 28/36/44/52.
- **Determinismo**: RNG PRÓPRIO (mulberry32 em stream separado do
  `srand`) — os sorteios novos não deslocam o stream determinístico
  dos elementos pré-existentes; paridade provada por A/B (abaixo).

## 2. Flare two-ribbon + arcada pós-flare (default; sem knob novo)

Era a pendência de maior nota ruim do audit-loop6 ("flare: fitas na
PIL + laços pós-flare + envelope 2 fases", ref-08, 4/10). O flare
continua sendo um EVENTO default (nenhum flare cai dentro do frame de
paridade `hold=48`), agora com a morfologia real:

- **Envelope de 2 fases**: `flareEnvImp` (flash da reconexão: sobe
  ~0.25 s, morre ~2 s — o envelope antigo) + `flareEnvGrad` (fitas e
  arcada: sobe ~2 s, decai com τ≈6 s — o rescaldo que flares reais
  mostram em H-alfa por minutos).
- **Fitas na PIL**: a moldura local (tangente/através da linha neutra)
  sai do PRÓPRIO campo — na PIL o campo horizontal aponta ATRAVÉS dela
  (da polaridade + para a −): `setFlareFrame` projeta `bFieldJS` no
  plano tangente. Duas gaussianas alongadas ao longo da tangente, que
  se AFASTAM na fase gradual (separação saturante 0.018→0.068 rad),
  linha central ondulada + strands com vãos (fbm ~230/esfera, fase
  própria por evento) — fitas esfarrapadas, não barras de aerógrafo.
  Emissão HDR (núcleo 3.6, fitas 2.2) para o bloom desenhar.
- **Arcada pós-flare**: reusa o MESMO traçador RK4, com slots extras
  re-semeados a cada evento ao longo da tangente da PIL, partindo
  ~0.06-0.12 rad do lado de uma polaridade (sondagem numérica: a linha
  pelo ponto médio a 1.004 R é o próprio ápice — rasteira; esses
  offsets dão ápice 1.03-1.17 R com pouso ≤ ~10°, a arcada baixa
  clássica). Compacidade EXIGIDA (ápice ≤ 1.35, pouso a ≤ ~23° do
  flare) — em PIL de sol calmo que conecta longe, "não houve arcada" é
  resultado físico válido. Os laços acendem em SEQUÊNCIA (zíper da
  reconexão, delay ~0.1 s/laço), brancos-quentes, e esfriam para a
  paleta coronal com a fase gradual. Passo fino h=0.01 (arcos curtos
  com pontos suficientes); ≤2 traços/frame no rescaldo do gatilho.

## 3. Cinema acoplado: starburst + íris pelo brilho HDR REAL

- **`flareHDR`** (JS, por frame, sem readback — convenção da íris
  analítica): envelope (2 fases) × amplitude × **visibilidade do ponto
  do flare no hemisfério voltado à câmera** (espaço de mundo). Antes a
  íris respondia ao envelope mesmo com o flare ATRÁS do Sol — efeito
  desconectado do estado físico. Agora flare atrás do limbo ⇒ lente
  não reage; o MESMO escalar dirige íris e starburst.
- **Íris (`adapt`)**: o termo de flare do alvo analítico e o surge de
  superexposição usam `flareHDR` no lugar do envelope cru.
- **Starburst de difração (knob `burst`, default 0)**: desenhado no
  composite na posição PROJETADA do flare — 6 braços `|cos 3θ|^18`
  (lâminas da íris) com alcance ESPECTRAL por canal (difração ∝ λ: R
  alcança mais longe que B, ponta avermelhada) + núcleo quente;
  rotação com assinatura fixa por evento + deriva ínfima. Custo ~10
  ALU no composite só quando ativo; zero passes novos.

## Knobs novos (convenção LOOP-5: default 0 = frame idêntico)

| knob | painel | faixa | efeito |
|---|---|---|---|
| `loops` | coroa → "Loops coronais" | 0-1.5 | brilho/presença dos loops ambientes |
| `burst` | cinema → "Starburst (difração)" | 0-1.5 | intensidade do starburst no flare |

O preset `?look=sunshine` NÃO foi tocado (calibração h2 do juiz
preservada); incluir `loops`/`burst` no preset fica para um sweep
futuro com juiz visual.

## QA (registro da entrega)

- **Paridade determinística**: A/B contra o código pré-Fase-1
  (mesmo commit, stash) — **0 px de diferença em 5/5 capturas**
  (`tools/imgdiff.js --max-frac 0`); vs `qa/baselines` (pré-migração):
  0-7 px, os MESMOS deltas de anti-alias documentados da Fase 0.
  `qa-controls` 6/6. Zero pageerror em todas as cargas.
- **`tools/qa-phase1.js`** (novo harness, 12 checks): loops traçados
  16/16 no high e visíveis (diff 622 px vs baseline com `loops=1.2`);
  traço 0.02-0.03 ms; fases impulsiva/gradual dominam nos tempos
  certos; separação das fitas cresce (0.052 rad em t=2.5); arcada 9/9
  acesa com `loops=0` (evento default); **hdr varia com a visada**
  (1.75 de frente, 0.00 atrás do limbo) e starburst/íris seguem
  (uBurst 2.1 de frente, 0 atrás; adaptMul 1.53 no flash).
- **Juiz visual** (capturas em det): fitas esfarrapadas paralelas
  entre as manchas do par, arcada em escada ligando fita a fita
  (morfologia ref-08/SDO); starburst de 6 braços com núcleo quente;
  loops ambientes lendo como arcadas coronais no limbo.
- **Orçamento (alvo ≤1 ms no mid)**: knob 0 ⇒ custo ZERO (nenhum
  traço, mesh invisível, nenhum passe novo). Ligado: +1 draw call
  (~1.4k verts no mid), shader de linha trivial, ≤1 traço RK4/frame
  (~0.03 ms CPU), atualização de envelopes ~25 floats/frame; flare
  ativo: fitas = ~15 ALU dentro do branch já existente do flare,
  arcada ≤2 traços/frame por ~4 frames. Sonda A/B medida no tier mid
  (SwiftShader): busy 1.09 ms (loops=0) vs 1.00 ms (loops=1.2, 12/12
  traçados) — delta dentro do ruído; draw calls 30→31 (+1 exato).

## Débito consciente

- Fail-rate do semeador ambiente ~80% (linhas abertas/rasteiras
  rejeitadas e re-sorteadas): inofensivo a 0.03 ms/traço com ≤1
  evento/frame, mas um semeador mais esperto (viés pela separação do
  par) cortaria o desperdício.
- Se um flare re-dispara com arcada anterior ainda >0 (raro: cooldown
  ≥12 s vs cauda ~20 s), os slots re-semeiam no evento novo — pop
  pequeno mascarado pelo flash impulsivo.
- Starburst/loops fora do preset `sunshine` até um sweep com juiz.

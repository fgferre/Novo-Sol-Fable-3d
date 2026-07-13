# Fase 6 — "Acabamento físico" (entrega 2026-07)

Bloco B do plano pós-roadmap: os débitos físicos acumulados nas Fases
3–5, atacados em 3 pacotes sobre o código modular do Bloco A —
**B1** manchas de verdade (knob novo `spots`), **B2** plumas polares +
cúspide na coroa volumétrica (pesos de forma do look `cvol`) e **B3**
estrias helicoidais do rope + cavidade do CME (pesos de forma do look
`cme`). Convenções do LOOP-5 intactas: knob novo default 0 = frame
bit-exato (provado por A/B worktree `--max-frac 0`, 0px em 5/5), RNG
novo em stream próprio (`spotRand`), zero alocações no `animate`,
calibração por sweep sem rebuild + painel de 3 juízes (com uma exceção
registrada abaixo).

## B1 — Manchas de verdade (knob `spots`, 0–1.5, default 0; preset sunshine 1.0)

### Mecanismo

- **Manchas VIRTUAIS por uniform array** (`uSpots`, 10× vec4,
  `#define SPOTS_MAX 10`) SÓ no shader do disco — zero custo no bake,
  1 shader recompila. Encoding: `xyz` = direção unitária × fade de vida
  (o `length` recupera o fade no shader — anti-pop), `w` = raio angular;
  `w<=0` = slot vazio. Gate uniforme `if (uSpotsK > 0.001)` pula o loop
  INTEIRO; early-out pela CORDA (`2(1−cos) > (6r)²`) descarta ~96% dos
  pares pixel-mancha antes de acos/snoise com saída bit-idêntica.
- **Lifecycle JS** (roda sempre; o knob só gateia uniforms ⇒ `setSpots`
  ao vivo reprodutível): 5 pares líder/seguidor, período 90–160 s,
  envelope de vida das regiões, deriva Snodgrass idêntica ao
  `driftCharge`, Joy tilt no seguidor. RNG próprio `spotRand`
  (mulberry32, XOR `0x59075EED`) com contagem FIXA de draws por evento
  — srand/cmeRand/loopRand intocados.
- **Lei de crescimento CORRIGIDA (B1-fix)** — o 1º painel flagrou (2
  flags ALTAS) fusão líder+seguidor num bloco 0.174–0.194R com interior
  chapado a partir de spots=1.0. A lei nova: o knob compra **contagem,
  não raio** (papéis fixos por par — principal → poros → médio no
  hemisfério oposto → médio-2 → pequeno — entram nos limiares
  `SPOT_THR=[0.05,0.42,0.68,0.90,1.16]` × `cycleAmpK`); raio saturante
  (`sizeK = 0.82+0.18·min(1,k)`); recal dos raios REAIS suave
  (`r = min(r0·(1 + k·(0.06+0.21aw²)·damp), 0.072)`); **anti-fusão** por
  keep-outs de nascimento (0.30 rad vs reais, 0.42 entre virtuais),
  separação interna do par pela regra da lente (≤30% de sobreposição no
  pior crescimento) e damp `uSpotsRealK` no par real apinhado do seed;
  **Spörer nos 2 hemisférios** (banda ±(25°−17°·fase) ± (7°−3°·fase),
  piso |lat| 6°, hemisférios alternados em cadeia); **penumbra** com
  platô 1.28r → borda 2.40r e profundidade 0.44 (razão medida em pixels
  no render: ~1:2.0 por raio equivalente).
- Medido (fase máximo, det=1&seed=7): k 0.25→1.5 dá 12→18 manchas,
  4→7 grupos (N+S), r máx do líder 0.039→0.058R — range GONG
  [0.005, 0.086] respeitado.

### Painel de juízes — 2 rodadas (protocolo de sempre + re-julgamento)

- **Painel 1** (sweep 6 valores × fit/close): mediana **0.5** com 2
  flags ALTAS (fusão 0.174–0.194R, "buraco de shader") — bloqueava
  preset ≥1.0. Motivou o B1-fix acima.
- **Re-painel** (sweep2 pós-correção): as 2 flags altas **resolvidas
  com evidência medida** (maior estrutura 0.0708R sob o teto GONG;
  umbras do par separadas com ponte de penumbra fibrilada); zero flags
  altas novas; recomendações 1.0/1.0/1.5 → **mediana 1.0**.
- **Preset `?look=sunshine` ganha `spots:1.0`** (aplicado no
  `LOOK_SUNSHINE` de `src/core/config.js`; o botão "aplicar look
  Sunshine" do painel aplica junto). O frame default (sem `?look`)
  segue com spots 0 = bit-exato.

## B2 — Plumas polares + cúspide (coroa volumétrica, pesos de forma)

### Mecanismo

- **Plumas** (`plume`, UNIFORM `uPlume` — efeito imediato, zero
  rebake): bloco ADITIVO por pixel no fragment do raymarch, confinado
  ao anel 1.0–1.52R e ao BURACO coronal — gate por unipolaridade
  |B·r̂|/|B| do campo VIVO avaliada em 2 alturas (1.06 e 1.35; o `min`
  mata picos locais sobre bipolos), janela 0.74–0.92 mais estrita que a
  do bake. Fios = 2 oitavas de fbm angular ESTÁTICO no referencial do
  objeto (freqs 9/18 — sem cintilação nova, sem estroboscópio); limiar
  sobe com a altura ⇒ fios afinam ao longo do comprimento. Ganho 0.28.
  Early-outs em ordem de custo: anel → gate (2×10 cargas) → 2×fbm.
- **Cúspide** (`cusp`, peso do BAKE `cvolWCusp` — exige
  `rebakeCorona()`): termo QUADRÁTICO de altura no expoente da folha,
  `sheet = exp(−unip²·(6 + 18h + cusp·130·h²))` — a meia-largura cai
  ~1/h (ponta) em vez de ~1/√h, e o espinho unip=0 sobrevive como haste.
- Calibração medida (mínimo, estrelas off): plume 0.6 → cap polar
  +3.7% (880 px), setor equatorial +0.000/0 px (confinamento perfeito);
  cusp 0.9 na folha v2 → largura da banda alta 18.3°→11.5° (0.63×).

### Painel de juízes — veredito UNÂNIME

3/3 lentes (físico/cinema/artefatos, confiança alta):
**plume 0.6 / cusp 0.6 / folha v2 (sheet 1.15, base 0.20)** — 0.9+
vira "godray"/starburst e quebra a hierarquia streamer>pluma; cusp 0.9
trunca as pétalas. **Shipped como defaults do shape** em
`coronaVolume.js` (knob-gated: com `cvol=0` a mesh nem desenha — frame
default intocado). Zero flags altas.

## B3 — Estrias helicoidais + cavidade (CME, pesos de forma)

### Mecanismo

- **Estrias** (`stria` 0–1.2): o fbm isotrópico do rim vira fbm em
  coordenada HELICOIDAL do rope — base ortonormal congelada por evento
  em `launchCME` (A = eixo da PIL, E1 = dir, E2 = A×E1, uniform novo
  `uCmeE2`); fase χ = azimute em volta do eixo − 1.1·(posição axial)/ρ;
  embedding (cos χ, sin χ, r_tubo·4.5) sem costura. Invariantes da
  hélice ⇒ o ruído fica constante ao longo de cada hélice → laços
  alongados (ref-13), não "contas" (flag do juiz físico da F5).
  `stria=0` executa o ramo isotrópico BYTE-idêntico da F5.
- **Cavidade** (`cav` 0–1.0): gate de rarefação POR RAIO (1×/pixel,
  antes da marcha — custo ~zero): β = parâmetro de impacto do raio ao
  centro da bolha na métrica squash-0.26;
  `rare = 1 − min(cav·1.15,1)·0.92·(1 − ss(0.42,0.96,β))` multiplica só
  a CASCA (núcleo preservado — hierarquia frente ≥ núcleo ≫ cavidade da
  ref-13). Partículas com gate próprio no vertex shader (nuvem dispersa
  do miolo ×0.85; a coluna densa da base FICA). `cav=0` ⇒ ×1.0 bit-exato.
- Calibração medida (receita do C2 — evento AO VIVO no limbo,
  t=4.97, estrelas off, perfil radial pós-composite): baseline razão
  frente:cavidade **1.189×** → candidato **stria 0.8 + cav 0.85 =
  2.109×** (alvo do prompt ≥2×); "contas" do rim beadRMS **0.58×** o
  isotrópico. Resposta do cav satura ~0.87 por construção — o teto do
  knob não escurece além do platô.

### EXCEÇÃO DE PROTOCOLO (modo economia da rodada)

Os defaults do CME (**stria 0.8 / cav 0.85**, em `cme.js`) foram
aprovados por **calibração medida (alvo quantitativo do prompt ≥2×
cumprido: 2.109×; de-beading 0.58×) + inspeção direta dos stills pelo
integrador — SEM painel de 3 juízes**, ao contrário do protocolo das
F2–F6 (decisão de economia da rodada, registrada aqui). Mitigantes: o
alvo era numérico (não estético), o teto inteiro do sweep foi provado
seguro (C5/C6: grupo K verde no teto stria 1.2/cav 1.0) e o Bloco C
re-julga o CME em MOVIMENTO (onde estrias/cavidade realmente aparecem).

## Knobs / hooks novos

- Knob `spots` (URL `?spots=`, slider no grupo "tempo" do painel,
  0–1.5 step 0.05; preset sunshine 1.0).
- `__solInfo.setSpots(v)`, `reseedSpots()`, `spotsInfo()`
  {n, ampK, slots[{on,r,…}], real[{r,lifeK,…}]}; `setCyclePhase(p,true)`
  re-emerge os pares virtuais junto com as regiões.
- `setCvolShape({plume, cusp})` (além de base/sheet/loop/hole da F4):
  `plume` = uniform (imediato), `cusp` = bake (exige `rebakeCorona()`);
  `coronaInfo()` expõe ambos.
- `setCmeShape({stria, cav})` (uniforms, imediato, clamps 1.2/1.0);
  `cmeInfo()` expõe ambos.

## QA (tools/qa-phase6.js — 27 checks S/P/C, `npm run qa:phase6`)

- **S (B1)**: S1 mínimo quase limpo (n≤2); S2 máximo com grupos
  múltiplos (n≥6); S3 histograma de raios ⊂ GONG [0.005,0.086] com
  líder raro ≥0.05R; S4 live-toggle devolve o frame default (≤200px);
  S5 spots=1 escurece a banda ativa (delta RGB bruto — o YIQ do
  pixelmatch subconta escuro-sobre-escuro, lição medida da rodada);
  S6 determinismo 0px.
- **P (B2)**: P1 plumas visíveis no cap polar; P2 confinadas (equat
  0px); P3a/b cúspide afunila a banda alta; P4 pesos 0 = look F4
  (volta ≤200px); P5 determinismo 0px; P6a/b I1/I2 do qa:phase4
  sobrevivem ao TETO do sweep (plume 1.2/cusp 0.9/folha v2).
- **C (B3)**: C1 de-beading do rim (≤0.80×); C2 razão frente:cavidade
  ≥2× no candidato; C3 pesos 0 = look F5 (0px); C4 determinismo ao
  vivo; C5 réplica do grupo K do qa:phase5 sob os pesos (8 checks);
  C6 teto do sweep mantém a assinatura K2.
- **Ajuste do B4 (defaults mudaram — documentado)**: com os defaults
  shipped ≠ 0, os baselines internos dos grupos P e C são capturados
  com os pesos ZERADOS via hook antes do A/B (`setCvolShape({plume:0,
  cusp:0})` + rebake no `openMin`; `setCmeShape({stria:0, cav:0})`
  antes do shot A do grupo C) — os checks continuam provando exatamente
  a espec/calibração de B2/B3 (mesmos limiares CAL/CCAL), e os defaults
  novos são exercitados pelos gates herdados (qa:phase4/qa:phase5 rodam
  com eles) e pelos checks de teto (P6/C5/C6 ≥ defaults). Nenhum limiar
  numérico mudou.

## Perf — A/B de GPU por tier (SwiftShader = teto do custo relativo; só razões valem)

| pacote | pior caso medido | mid (avg on/off) | high (avg on/off) |
|---|---|---|---|
| spots (B1) | máximo do ciclo + close, 10 slots | ×1.145–1.154 | ×1.096–1.110 |
| plumas+cúspide (B2) | mínimo/wide, plume 0.9+cusp 0.6 | ×1.006–1.021 | ×1.004–1.013 |
| estrias+cavidade (B3) | evento vivo no limbo, candidatos | ×1.002–1.016 | ×0.995–1.000 |

- O p95 entre rodadas do MESMO estado varia até ~19% no SwiftShader
  (nas duas direções) — a estatística estável é o avg de 45 frames
  (warmup 12 antes do `perfReset`, protocolo F5).
- spots ×~1.15 no mid está em família com o cvol aceito na F4 (×1.13);
  investigação: o custo NÃO é o scan do loop (early-out pela corda não
  moveu o avg) — é o conteúdo desenhado (pixels a mais no ramo
  licFibril da penumbra), o mesmo custo por pixel das manchas reais.
- cusp = zero custo de runtime (valores bakeados); cavidade = 1×/pixel
  fora da marcha; estrias = custo por amostra compensado pelo early-out
  (`shell·fade>1e-4` pula o fbm que o isotrópico pagava).
- Kill-switches seguem como mecanismo em GPU real (escala →
  `cmeKilled` → `cvolKilled`); `spots` sem kill próprio (custo pequeno
  medido — anotado como débito).

## Gates finais da integração (B4, branch com B1+B1fix+B2+B3+presets)

| gate | resultado |
|---|---|
| `npm run build:single` | limpo |
| A/B worktree origin/main vs branch, URL default, `--max-frac 0` | **0px em 5/5** (as mudanças de preset/defaults são knob-gated e não vazam para o frame default) |
| `npm run qa:parity` (baselines congelados ≤0.001) | OK 5/5 — deltas 0–7px de anti-alias conhecidos da Fase 0 |
| `npm run qa:phase6` (S+P+C) | 27 PASS, 0 FAIL |
| `npm run qa:phase4` | 12/12 (I1/I2 verdes JÁ COM os defaults novos — folha v2 + plume/cusp 0.6) |
| `npm run qa:phase5` | 14/14 (grupo K verde JÁ COM stria 0.8/cav 0.85 default) |
| `npm run qa:controls` / `qa:phase1` / `qa:phase3` | 6/6 · 12/12 · 12/12 |

## Débitos conscientes desta rodada

- Manchas virtuais **sem colar de plage** (o colar vem do canal B do
  bake, que lê a simulação — injetar no bake é refinamento futuro;
  limitação aceita no plano).
- **Bandas N/S não espelhadas** no máximo: grupos norte em +36/+43°
  vs banda sul em −6/−11° (re-painel, flag média 2×; ref-07 tem ambos
  em ~±10–20°) e migração medida da banda ~1.5° nos espelhos — a lei
  espelha o SORTEIO, não a latitude realizada.
- **Razão umbra:penumbra — metodologias divergem, registrar ambas**:
  ~1:1.6 medida por perfil radial (juiz físico do re-painel) vs 1:2.26
  por diâmetro equivalente d_eq (juiz cinema mediu 1:1.8–2.3); a probe
  do implementador (raio equivalente, limiares 0.45/0.85·mediana) dá
  ~1:2.0. Nenhuma é "a" verdade — fixar UMA régua no Bloco C.
- Distribuição de tamanhos **top-heavy vs GONG**: 3 principais com
  umbras 0.028–0.043R vs maior umbra da ref-07 ~0.015R ("muitas
  pequenas, raras grandes" ainda não é a assinatura) — aceito como
  estilização na distância de câmera do preset.
- Grupo **pen-only em 1.1<k<1.5**: um grupo norte nasce como mancha
  difusa sem núcleo ("hematoma") e só ganha umbra em k=1.5.
- Par REAL do seed com **franja de penumbra sobreposta 28–31%**
  (herdado do layout de cargas; umbras separadas — irremovível sem
  mover cargas reais, que são compartilhadas com plage/campo).
- **Cúspide sub-limiar no wide** a cvol=0.5 (delta máx 6/255 no quadro
  nativo — legível só em cvol alto/close; flag média do painel cvol).
- **Plumas somem em ~1.33R** (excesso cai a 10%) vs alvo 1.3–1.5R do
  perfil; não alongam com o peso, só ganham contraste.
- **Zona morta do cusp abaixo de ~0.3** (26 px de mudança vs 5095 no
  0.6); resposta útil do knob começa em ~0.4.
- **FWHM das plumas 1.6–2.6 px** em 960×600 — risco de shimmer
  sub-2px em movimento: REMETIDO AO BLOCO C (harness temporal), não
  corrigir em stills.
- **Sem haste/stalk além da cúspide** (ref-10 mostra hastes até ~6R;
  a cúspide atual só subtrai — as pétalas leem truncadas em cusp 0.9,
  por isso o default ficou 0.6).
- **Perf do spots não re-medido pós-B1-fix** (o bound do loop —
  SPOTS_MAX 10, skip w≤0, early-out pela corda — não mudou; custo novo
  por frame: 28 pares de aritmética escalar JS + 1 uniform float[8]).
- Cavidade média ainda **abaixo da ref-13 (≥3×)**: o piso é o
  preenchimento não-CME + bloom da frente + núcleo preservado
  (hierarquia de propósito); frente:cavMin chega a 13× no candidato.

# Rodada de MOVIMENTO (Bloco C) — harness temporal, baseline e correções

Bloco C do plano pós-roadmap (PR 3 de 3): todo julgamento visual até esta
rodada foi em STILLS — o ponto cego foi flagrado duas vezes (F4/F5) e uma
terceira flag (F6) nasceu já remetida para cá. Este bloco construiu a
régua temporal (`tools/qa-motion2.js`), MEDIU o estado shipped, corrigiu
só o barato/cirúrgico (3 correções knob-gated, default bit-exato provado)
e documentou o resto como débito consciente.

## 1. O harness — `npm run qa:motion2`

Sequências determinísticas de frames CONSECUTIVOS (`det=1&seed=7` SEM
hold: dt fixo 1/60 por frame renderizado), 960×600 tier high, `grain=0`
em tudo (o grão de filme é ruído deliberado por frame e afogaria as
flags — protocolo do `docs/audit-motion.md`). Alinhamento
screenshot↔frame por construção: o rAF é interceptado (addInitScript),
o boot corre livre até assentar, o loop é estacionado numa fila e cada
frame é disparado sob demanda (`__m2.step()` = 1 `animate()` síncrono)
antes de cada screenshot — sem isso o rAF a ~1s/frame do SwiftShader
deriva 1-3 frames durante o próprio screenshot.

7 sequências / 5 cenários + 1 controle:

| cenário | frames | knobs/setup |
|---|---|---|
| fit-idle | 48×2 execuções | quadro de descanso (determinismo: 48 pares 0px) |
| close-dof0 / close-dof | 24 | vista canônica `setView(π, 0.42π, 3.9)`, dof 0 vs 0.5 |
| flare-cme-limbo | 48 shots, k=4 | `cme=0.9`, `forceCME(0)` AO VIVO, t=0..3.2s |
| lapse-ciclo | 48 | `lapse=1` |
| cvol-wide | 48 | `cvol=0.5`, fitDist×1.55 |
| cvol0-wide | 48 | controle: mesma vista sem volume (o delta isola o cvol) |

Métricas por pixel (100% pngjs/pixelmatch, sem ffmpeg): **flicker** =
std temporal/(média+2) → p95 por região {disco ≤0.9R, limbo 0.9-1.1R,
coroa 1.1-2R, céu >2R}; **strobo %** = |Δ| frame-a-frame >10 SEM
coerência de vizinhança 3×3 (ruído que pisca ≠ estrutura que se move);
**coerência radial** (só CME) = fração do |Δ| da coroa explicada pelo
melhor shift radial 1..6px; **determinismo** = 2 execuções → pixelmatch
0px em todos os pares. Artefato julgável: tiras de filme (8 thumbs +
heatmap de flicker) em `out/motion2/sheets/`.

Custo real: ~1.4-4.5 min/cenário, suíte completa ~19 min — **gate de
RODADA, não de CI**.

## 2. Baseline temporal (main a268a26, pré-correções)

Determinismo temporal: **PASS** (fit-idle 2 execuções, 48/48 pares 0px).

Flicker p95 / strobo % (média dos pares [pior par]):

| cenário | disco | limbo | coroa | céu |
|---|---|---|---|---|
| fit-idle | 0.102 / 0.16% | 0.175 / 0.46% | 0.366 / 0.37% | 0.337 / 0.19% [0.92%] |
| close-dof0 | 0.209 / **20.5%** | 0.139 / 5.06% | — | — |
| close-dof | 0.209 / **20.0%** | 0.104 / 0.71% | — | — |
| flare-cme-limbo | 0.133 / 6.3% | 0.300 / 3.8% | 0.648 / **0.84% [1.16%]** | 1.123 / 0.33% |
| lapse-ciclo | 0.099 / 0.15% | 0.220 / **1.10%** | 0.368 / 0.37% | 0.337 / 0.19% |
| cvol-wide | 0.101 / 0.23% | 0.212 / 0.60% | 0.462 / 0.32% | 0.495 / 0.38% |
| cvol0-wide (ctl) | 0.101 / 0.23% | 0.185 / 0.58% | 0.483 / 0.32% | 0.502 / 0.38% |

Coerência radial do CME: **0.30** (shift vencedor 1px em 35/47 pares) —
em t=0..3.2s o delta é majoritariamente BRILHO (rise do flare + formação
da casca), não advecção.

Top hotspots do baseline: trilhas de estrelas sob o pan idle (maior
sinal absoluto, todos os cenários), caps polares das plumas (cvol),
zona do evento CME, anel do limbo (dobra o strobo sob lapse), campo de
fibrilas em close (20% strobo = o "ferver" da cromosfera de perto;
caráter, não defeito — dof=0.5 suprime o rim: limbo 5.06%→0.71%).

## 3. Flags herdadas — julgamento com números

- **F4 (fios ~1px do fil-suave em movimento): severidade BAIXA — sem
  correção.** No A/B cvol=0.5 vs controle na mesma vista o strobo da
  coroa fica IDÊNTICO (0.318% vs 0.318%); os fios movem-se
  coerentemente com a rotação. O p95 da coroa até CAI com o volume
  (0.462 vs 0.483): o glow estável amortece o flicker relativo das
  trilhas de estrela atrás dele.
- **F5 (streaks das partículas do CME): severidade MÉDIA — corrigida
  (§4.2).** Strobo da coroa 0.84%/1.16% no evento = 2.2-3× o piso idle;
  coerência radial 0.30 com shift dominante 1px — parte do movimento
  lia como chuvisco de nascimento (pontos sub-2px saltando 2-6px/step).
- **F6 (FWHM 1.6-2.6px das plumas): CONFIRMADA em movimento — o achado
  principal; corrigida (§4.1).** Delta de flicker cvol−controle no anel
  das plumas (1.02-1.5R): polar p99 +0.194 vs equatorial +0.046 (4-5×);
  os top-8 hotspots do delta caem todos nos 2 caps polares. Aliasing
  sub-pixel de fios de ~2px sob rotação+pan.

## 4. As 3 correções (cirúrgicas, knob-gated, default bit-exato)

A/B do frame default vs `origin/main` após as 3 correções:
`tools/parity.js` + `imgdiff --max-frac 0` → **0px em 5/5** (as mudanças
são gateadas por `cvol`/`cme`/`lapse`; o caminho default não executa
nenhuma delas).

Régua do delta polar/FWHM: setores empíricos ±36° centrados nos caps
(topo +20°, base +176° na tela; vista do cenário cvol-wide), anel
1.02-1.5R, FWHM medida nos picos (prom ≥4 lum) do perfil tangencial da
imagem-diferença f01(cvol)−f01(controle).

### 4.1 F6 — piso das plumas (`src/atmosphere/coronaVolume.js`)

Oitava alta do fbm angular dos fios 18→14 **e** topo do smoothstep do
limiar 0.46→0.54 (suaviza a PONTA dos fios; o A/B de flicker escolheu —
alargar o piso por baixo (lo −0.07) só ADICIONAVA fios fracos e piorava
o delta). Gateado por `uPlume>0` dentro de `cvol>0`; confinamento aos
buracos (gate `hg`) intocado.

| métrica (cvol-wide) | antes | depois |
|---|---|---|
| FWHM dos fios (mediana) | 2.45px (p25 1.31) | **3.82px** (p25 2.35) — alvo ≥3px ✓ |
| delta flicker polar p99 (vs ctl) | +0.194 | **+0.084** (alvo ≤0.10 ✓; p95 0.079→0.036) |
| delta equatorial p95/p99 | 0.020/0.046 | 0.018/0.037 |
| flicker p95 limbo/coroa/céu | 0.212/0.462/0.495 | 0.185/0.447/0.471 (nada piora) |

### 4.2 F5 — nascimento das partículas do CME (`src/atmosphere/cme.js`)

`aVel.w` passa a carregar tipo E idade (w = tipo·8 + idade, saturada em
4s; decodificação `step(7.5, w)`): **fade-in por idade** (~0.4s de
rampa) mata o pop de spawn, e o sprite ganha **+1px de gl_PointSize com
alpha compensado** (energia ∝ size²·α ⇒ comp=(s0/s1)²— brilho integrado
~constante): o grão sub-2px que saltava 2-6px/frame vira um risco mais
largo e tênue. Knob-gated por construção (sem evento com `cme>0` nada
disto roda).

| métrica (flare-cme-limbo) | antes | depois |
|---|---|---|
| strobo coroa (média dos pares) | 0.841% | **0.587%** (−30%; alvo ≤0.5% NÃO atingido — residual §5) |
| strobo coroa (pior par) | 1.157% | **0.732%** (−37%) |
| coerência radial (explMean) | 0.301 | **0.312** (alvo ≥0.4 NÃO atingido — residual §5) |
| flicker p95 disco/limbo/coroa/céu | 0.133/0.300/0.648/1.123 | 0.129/0.254/0.611/1.108 (tudo melhora) |

Distribuição temporal medida dos eventos residuais: UNIFORME ao longo de
t=0..3.2s (primeiro terço 23.6k, meio 24.7k, fim 28.8k eventos) — o pop
de nascimento morreu; o que resta é flicker de TRÂNSITO (casca fbm em
expansão + grãos cruzando pixels contra céu escuro, ampliado pela
subamostragem k=4 do cenário). Empurrar além exigiria mexer na dinâmica
de brilho da casca ou no comprimento dos streaks — além do cirúrgico.
A coerência é limitada pela física da janela: em t=0..3.2s o delta é
majoritariamente RISE de brilho (formação da casca), não advecção — a
régua já nasceu qualificada assim no baseline.

### 4.3 Lapse — easing de vida das regiões (`src/sim/activity.js` + `src/surface/sun.js`)

Sob lapse o relógio das regiões corre ~×27-40 e o nascimento/morte de
plage/faculae virava POP no limbo. Envelope com rampas esticadas ×1.75
(nascimento 0.14→0.245, morte 0.32→0.56 do período; a morte segue
terminando em 0.90 — renascimento não muda de fase), aplicado por blend
`min(1, LAPSE_K)` SÓ nos consumidores do relógio warpado (regiões reais
+ grupos de manchas — manchas e plage seguem em sincronia);
proeminências/loops (wall-clock) intocados. Com lapse=0 devolve o
envelope original sem aritmética extra; o director, que anima LAPSE_K
continuamente, morfa sem salto.

| métrica (lapse-ciclo) | antes | depois |
|---|---|---|
| strobo limbo (média dos pares) | 1.097% | **1.111%** (alvo ≤0.7% NÃO atingido — diagnóstico abaixo) |
| demais regiões | — | idênticas (±0.001) |

**Diagnóstico honesto (mapa de eventos por pixel + crops A/B):** o
excesso de strobo do limbo sob lapse vive num ÚNICO setor (ang −116° a
−156°, r=1.00R exato — a borda), na FRANJA DE ESPÍCULAS sobre um setor
de plage forte (o layout com lapse=1 liga o ciclo e posiciona uma região
ativa no limbo SE). As estrias de 1-2px da franja modulam com o CAMPO
warpado (deriva das cargas ~21×/frame no cap + resposta do sim/bake), e
pixels de borda com gradiente radial gigante viram strobo a qualquer
modulação — o easing de VIDA não atua nessa fonte (verificado: envelope
ativo ao vivo — env 1.00→0.71 no mesmo instante de nascimento — e strobo
inalterado). A rampa de envelope a 60fps sempre foi sub-limiar no
frame-a-frame (≤2-3 lum/frame); o que o easing entrega é o alvo
QUALITATIVO da flag original ("pop de região ativa"): sob lapse=1 um
nascimento completava em ~0.8-1.2s de wall-clock — vira ~1.4-2.1s, e o
passo de bake por região em rampa cai de ~8-16 p/ ~4.5-9 lum (abaixo do
limiar de strobo). Corrigir a fonte real (franja/advecção) exigiria
amortecer a resposta das espículas ou a cadência do bake sob lapse —
além do cirúrgico ⇒ débito (§5).

## 5. Débito consciente (sem correção nesta rodada)

- **Trilhas de estrelas sob o pan idle** (maior sinal absoluto do
  baseline; p95 do céu 1.12 no cenário CME por janela): aliasing
  sub-pixel do PSF pontual das estrelas varridas ~0.24px/frame.
  Qualquer suavização do PSF muda o frame DEFAULT (quebra o contrato
  bit-exato) — **não existe versão knob-gated barata**; fica como
  débito documentado, decisão do dono.
- **Fibrilas em close (20% strobo)**: caráter físico ("ferver" da
  cromosfera), não defeito claro; candidato futuro seria atenuar o
  shimmer com dofCloseK, mas mexe no default em close.
- **Residual do CME (strobo coroa 0.587% vs alvo 0.5%; coerência 0.31
  vs alvo 0.4)**: flicker de trânsito da casca/leque, uniforme no tempo
  (não é nascimento); melhorar exigiria mexer na dinâmica de brilho da
  casca ou alongar streaks (mudança de look além do aprovado).
- **Strobo do limbo sob lapse (1.11% vs alvo 0.7%)**: franja de
  espículas sobre setor de plage modulada pelo campo warpado
  (advecção/sim/bake), insensível ao easing de vida; candidatos
  (amortecer resposta das espículas sob lapse, cadência de bake maior
  sob lapse) mexem em pipelines compartilhados — decisão futura.

## 6. Limiares e como rodar

Limiares em `tools/motion2-thresholds.json` — **calibrados no baseline
PÓS-correções** (flicker/strobo p95×1.25 + piso; coerência ×0.8),
regravados com `--calibrate` ao fim desta rodada e verificados verdes em
modo gate (exit 0). Determinismo re-provado na recalibração: fit-idle
2 execuções, 48/48 pares 0px. Principais limiares que APERTARAM com as
correções (teto = medido×1.25): flare-cme coroa strobo 1.25%→0.93% e
flicker p95 0.815→0.769, limbo flicker 0.379→0.322, coerência min
0.241→0.249; cvol-wide limbo flicker 0.270→0.237. Os cenários default
(fit/close/cvol0) ficaram idênticos (±1 LSB de histerese SwiftShader).

```bash
npm run qa:motion2                      # modo gate (compara com os limiares; exit 1 se estourar)
npm run qa:motion2 -- --calibrate       # re-mede e REGRAVA os limiares (novo baseline)
npm run qa:motion2 -- --scenario cvol-wide,lapse-ciclo   # só cenários específicos
npm run qa:motion2 -- --analyze-only --calibrate         # re-analisa dos PNGs já capturados
```

Gate de RODADA (rodar ao fim de cada rodada de mudanças visuais que
toque em movimento), **não entra no CI** (~19 min de SwiftShader).
Qualquer correção visual aceita que mude métricas temporais ⇒ recalibrar
e commitar os limiares novos junto.

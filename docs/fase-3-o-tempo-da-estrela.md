# Fase 3 — "O tempo da estrela"

Registro de entrega da Fase 3 do roadmap (`roadmap-proximo-nivel.md`):
o ciclo solar de 11 anos (lei de Spörer, flip de Hale, reversão polar,
envelope de atividade), a continuidade filamento↔proeminência no limbo
e o modo time-lapse documental do ciclo. Convenções do LOOP-5 mantidas:
**todo knob novo com default 0 = frame pixel-idêntico ao baseline**
(provado com A/B worktree `--max-frac 0`: 0px em 5/5), sorteios novos
sem deslocar o stream do `srand`, loop de `animate` sem alocações,
tiers respeitados.

## O que existe agora

### Ciclo de 11 anos (knob `cycle`, default 0, 0–1.5)

Um escalar de fase (`cyclePhase01`, período `CYCLE_PERIOD = 1800`
unidades de tempo simulado ≈ 30 min a speed=1 — compressão honesta de
VFX, como p-modes/convecção) modula a maquinaria de lifecycle que JÁ
existia. Com `cycle=0` nada roda: fase congelada em 0.35 ("meio de
ciclo" eterno — o sol default de sempre). Com o knob ligado:

- **Lei de Spörer**: a banda de emergência de `placePair` migra de
  ±35° para ±5° ao longo do ciclo (centro `35−30·fase`, meia-largura
  `8−4·fase` graus). O sorteio de latitude REAPROVEITA o mesmo
  `srand()` do caminho default — nenhuma chamada nova, o stream
  determinístico não desloca. A fase inicial 0.35 põe a banda de
  Spörer (~18–31°) sobre a banda default (~14–31°): ligar o knob não
  teleporta manchas.
- **Envelope de atividade**: `amp = 0.18 + 0.98·sin(π·fase)^1.3` —
  máximo em ~0.35, piso 0.18 no mínimo profundo (o sol calmo da
  ref-06 ainda tem rede). Multiplica o |q| das regiões; `uActivity`
  (coroa, cooldown de flares, íris do cinema) segue de graça — "uma
  estrela, um estado".
- **Flip de Hale**: `ps.polSign` — a região que EMERGE carrega a
  polaridade do ciclo corrente (`cycleHale = ±1` pela paridade de
  `cycleN`); regiões vivas não trocam de sinal no meio da vida.
- **Reversão polar**: as 2 cargas polares (dipolo de fundo) seguem
  `cos(π·min(1, fase/0.9))·cycleHale` — cruzam zero na fase ~0.45
  (perto do máximo, como no Sol real) e renascem invertidas; contínuo
  na virada de ciclo porque o sinal de Hale flipa junto.
- `cycle>1` acelera o relógio natural do ciclo (até 1.5×).

Paridade bit-exata no default por construção: `polSign=1` e `ampK=1`
multiplicam por 1.0, o tempo das regiões vira `elapsed + cycleWarp`
com warp 0.0, e as cargas polares só são tocadas com o ciclo ligado.

### Time-lapse documental (knob `lapse`, default 0, 0–1.5)

O modo cinema do ciclo: multiplica o relógio do ciclo E o tempo de
vida das regiões ativas (`cycleWarp`, até ~×40 em lapse=1.5 — um ciclo
completo em ~45 s) sem tocar rotação, granulação, proeminências ou
flares — a estrela continua no tempo dela, só a maquinaria de manchas
corre. `lapse>0` com `cycle=0` liga o ciclo sozinho (modo documental
de um toque). Sob lapse pesado a deriva diferencial satura no cap de
0.35/frame — o cisalhamento fica sutilmente lento em relação ao
lifecycle; aceito e documentado.

### Continuidade filamento↔proeminência (knob `fprom`, default 0, 0–1.5)

A MESMA estrutura escura contra o disco e vermelha além do limbo.
Proeminência e filamento são o mesmo objeto visto de ângulos
diferentes — mas o cartão radial em pé degenera em linha de 0px visto
de cima. A solução: cada proeminência ganha um **gêmeo de absorção** —
um cartão DEITADO drapejado sobre a esfera (largura máx 0.05R), na
mesma âncora de PIL, com o MESMO `uSeed`, orientado pela mesma
tangente, usando o shader do hedgerow em variante de absorção:

- O perfil `yTop` que recorta o topo da cortina vira a MEIA-LARGURA do
  canal escuro — as reentrâncias são os "barbs" dos filamentos reais
  (ref-07). Mesmo seed ⇒ mesma silhueta: identidade de estrutura, não
  só de posição.
- **Blending multiplicativo** `dst·(1−src)` — absorção de verdade, não
  aditivo. É o mecanismo que o débito da arcada escura pós-esfriamento
  pede (fica para a próxima rodada, mas a porta está aberta).
- **Crossfade no limbo** pelo MESMO `facing` que apaga a emissão
  contra o disco: escuro ∝ s, vermelho ∝ (1−s). No QA, varredura em
  phi encontrou o ponto de coexistência: absorb 0.45 + emissão 0.23 na
  mesma âncora (check E4).
- **Fade por-pixel ∝ mu** (a luz que resta para absorver) + taper
  `smoothstep(0.25, 0.45, mu)`: filamentos H-alfa reais somem por
  projeção ao se aproximarem do limbo (ρ>0.9). Três artefatos foram
  flagrados e corrigidos no QA visual da rodada: picote (uAspect do
  cartão deitado ≠ do cartão em pé multiplicava a frequência dos fios
  3–5×), "renda" simétrica (abs() espelhando o noise — o y do ruído
  ficou assinado, só a máscara de largura usa |y|), e renda flutuante
  sobre o anel de limb darkening (multiply forte onde o disco já era
  escuro — resolvido pelo fade ∝ mu).
- Sem sorteios novos: uSeed copiado do cartão em pé, geometria não
  consome srand. Custo em fprom=0: gêmeos `visible=false`, zero draw.

### Débitos herdados da Fase 2 — fechados nesta rodada

- **Semeador de loops ~80% de rejeição** ("olhar a topologia, não o
  leque"): pré-validação com sonda Euler grosseira (88 passos × 1
  avaliação de campo ≈ 1/8 do custo do RK4 fino de 176×4) antes de
  cada traço; até 12 candidatos por slot, RK4 só nos aprovados (máx
  4). Medido (det seed=7, high, check A1/A4): 80 sondas filtram 46
  candidatos, traços finos 80→34, **rejeição fina 80%→53%**, 16/16
  slots cheios (antes P(slot vazio após 4 traços cegos) ≈ 0.41).
  Detalhe de calibração que quase passou: a 1ª margem
  (`minApex·0.88 = 0.911` < raio inicial 1.004) não rejeitava NADA —
  medir antes/depois pegou (probes 80, probeRej 0); margem refeita em
  valor absoluto.
- **Loop face-on "rabisco" de 1px**: o piso de largura da fita cresce
  com o encurtamento perspectivo do segmento (`dl` projetado vs
  esperado sem foreshortening) até ~3.2px, com energia conservada
  (`vFade = rawPx/wpx` generaliza o fade sub-pixel do LOOP-5 —
  expressão idêntica quando o piso é 1px). Vistas laterais invariantes
  (A/B vs origin/main: mesma imagem; check A3 inalterado em 2091px).

## Hooks novos de QA (`__solInfo`)

- `setCyclePhase(p, reseed)` — salta a fase (p em CICLOS: 1.3 = ciclo
  ímpar na fase 0.3, testa o flip de Hale); `reseed=true` re-emerge os
  4 pares já na banda nova (fotografa a borboleta sem esperar).
- `cycleInfo()` — `{cycle, lapse, depth, phase, n, hale, amp, pol,
  polNorth, warp, latC, latW}`.
- `regions()` ganhou `lat` (graus) e `pol` (sinal de Hale).
- `fpromInfo()` — `{vis, absorb, facing, seedMatch, env}` por
  proeminência.
- `loopInfo()` ganhou `probes`/`probeRej` (sonda de topologia).

## QA da rodada

- `npm run qa:phase3` — **12 checks novos** (grupo D: ciclo; grupo E:
  continuidade): D1 cycle=0 inerte, D2/D3 borboleta de Spörer (início
  >26°, fim <14° de latitude média), D4 flip de Hale, D5 reversão
  polar, D6 envelope de atividade, D7 mínimo muda o frame (5100px vs
  baseline), D8 lapse liga e acelera o relógio; E1 fprom=0 inerte, E2
  identidade de seed, E3 absorção viva (teto respeitado), E4 crossfade
  no limbo por varredura em phi.
- Gates de sempre: `qa:parity` 5/5 (≤0.0012%), **A/B worktree vs
  origin/main com `--max-frac 0`: 0px em 5/5**, `qa:controls` 6/6,
  `qa:phase1` 12/12 verde.
- Armadilha nova documentada: `prominences()` indexa MESHES (2
  cartões/proeminência) ⇒ prom i = índice 2i; e mirar âncora perto do
  polo exige o tilt z=0.1265 ANTES do rotY (a varredura em THETA quase
  não afasta âncora polar — varrer em PHI rumo ao equador afasta
  linearmente qualquer âncora).

## Julgamento visual (painel de 3 juízes: realismo/cinema/legibilidade)

Mesmo protocolo da F2 (lentes distintas, refs GONG ref-06/ref-07 +
ref-02/ref-03 como verdade). Achados convergentes e o que foi feito:

- **Picote/dithering no miolo dos filamentos** (flag unânime, pior
  ofensor): o gate de wisp da cortina abria buracos até zero e o canal
  visto de cima lia como aliasing. **Corrigido**: miolo sólido, wisp
  vira modulação (`0.60+0.40·wisp`) — filamento GONG é absorção
  contínua, fios só nas bordas.
- **"Reto demais lê como risco geométrico"** (2/3): o centro do canal
  agora MEANDRA por seed (`±0.38·snoise(xn·2.1)`) — serpenteado
  orgânico com largura variável, como ref-03.
- **Núcleo preto demais** (realismo: "GONG é cinza-escuro, nunca
  preto"): teto de absorção 0.55·fieldK1.2=0.66 → 0.45 com fieldK
  saturado.
- **Max↔min do ciclo a "~1 stop" não conta a história** (3/3): piso do
  envelope 0.18→0.10 e swing maior (0.10→1.16); em fase 0.35 vale
  ~1.03 (ligar o knob não dá pop). A **multiplicidade** de manchas no
  máximo (ref-07 tem vários grupos; a sim tem 4 slots de região) fica
  como débito estrutural — ver abaixo.
- **Loops face-on new vs old**: sem regressão (2/3 "idênticos", 1/3
  "new marginalmente melhor como tubo"). O caso degenerado real (loop
  100% face-on) é raro no enquadramento de disco; a melhora é por
  construção.
- **Notas** (antes das correções): ciclo 4–6.5/10 (contraste), fprom
  5–7.5/10 (forma boa, textura ruim), limbo 7–7.5/10 (esmaecimento
  crível), face-on 8.5/10 (sem regressão).
- **Preset**: recomendações 0.45/0.55/0.60 → mediana **`fprom:0.55`**
  entrou no `?look=sunshine` (mesmo patamar dos loops; ≥0.9 caricato).
  `cycle`/`lapse` ficam FORA do preset: são comportamento no tempo,
  não look.
- Curiosidade flagrada pelo juiz de cinema: com seed=7, a vista da
  região 0 forma uma "carinha" (pareidolia manchas+plage). É sorte de
  seed, não estrutura — registrado, não acionável.

## Débito consciente (Fase 3)

- **Arcada escura pós-esfriamento**: o mecanismo de absorção agora
  existe (gêmeo multiplicativo) — falta aplicá-lo à arcada pós-flare
  quando esfria. Candidato natural da Fase 4.
- **Borboleta com 4 regiões / multiplicidade no máximo**: com 4 slots
  de região, a "asa" da borboleta é pontilhada e o máximo tem 1-2
  centros de atividade visíveis — ref-07 tem vários grupos + plage
  espalhada (flag 3/3 juízes: é o que mais limita a narrativa do
  ciclo e do time-lapse). Candidato: slots virtuais baratos só para
  manchas pequenas (sem loops/proeminências), contagem modulada pela
  fase — medir custo do bake primeiro.
- **Deriva diferencial sob lapse pesado**: satura no cap de
  0.35/frame; imperceptível no time-lapse (as manchas nascem e morrem
  rápido demais para a deriva contar), mas registrado.
- **FPS em iPhone real (SÓ O DONO)**: pendente desde a Fase 0 — abrir
  `https://fgferre.github.io/Novo-Sol-Fable-3d/?hud=1` no iPhone
  (depois `?hud=1&tier=high`) e reportar fps / ms avg / p95 / cpu.

## Ferramentas da rodada (scratchpad, reproduzíveis)

- Smoke funcional do ciclo (8 checks, virou o grupo D do qa:phase3).
- `shot-fprom.js` — A/B on/off dos filamentos em 3 vistas (fit, face,
  limbo); 3 iterações de artefato flagradas e corrigidas com ele.
- `shot-cycle.js` — capturas max/min/early do ciclo com bake fresco
  (hold=150: congela DEPOIS de o bake absorver a fase saltada).
- `diag-fprom.js` — isolou a "renda além do limbo" (toggle de
  subsistemas: era o anel de limb darkening, não bloom nem gate).

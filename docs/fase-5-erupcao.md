# Fase 5 — "Erupção" (entrega 2026-07)

CME de flux-rope que se desprende em flares grandes (com brilho de
espalhamento Thomson no limbo), partículas do ejecta por transform
feedback, profundidade de campo hexagonal em close-ups e o modo
diretor — a sequência-atração que amarra as 5 fases do roadmap. Todo o
trabalho segue as convenções do LOOP-5: knob novo default 0 = frame
bit-idêntico ao baseline, sorteios em RNG próprio sem tocar o stream do
`srand`, zero alocações no `animate`, tiers respeitados com A/B de GPU.

## O mecanismo do CME (knob `cme`, 0–1.5, default 0)

### Casca raymarched ANALÍTICA (sem textura 3D)

A casca do flux-rope é uma bolha elipsoidal auto-similar — alongada ao
longo do eixo do rope (a tangente da PIL congelada no evento, o mesmo
triedro das fitas do flare) — raymarched em GLSL3 no mesmo padrão do
`cvol` da F4 (billboard de 7R, raio de perspectiva real, corte do raio
que atinge o disco). Diferenças que importam:

- **Densidade analítica por amostra** (nenhum bake): casca gaussiana em
  torno do raio da bolha + núcleo denso (a proeminência ejetada) atrás
  do centro + cone suave que ancora as pernas no hemisfério do evento.
  A textura de fios do rope é fbm ancorado NO REFERENCIAL DA BOLHA (os
  fios acompanham a expansão em vez de ficarem pregados no espaço).
- **Amostragem certa da casca fina**: a marcha cobre só o segmento do
  raio que cruza a ESFERA ENVOLVENTE da bolha (não a corda inteira do
  domínio de 6.6R) — 16-32 passos resolvem uma casca de ~0.05R e a
  frente ganha o rim de path-length das CMEs reais (ref-13). Foi o bug
  visual nº 1 da rodada: na corda inteira a casca virava névoa.
- **Peso de THOMSON**: por amostra, brilho × `1 − (p̂·r̂d)²` — o sin² do
  ângulo ao plano do céu. CME no limbo brilha; CME de frente ("halo")
  esmaece (razão medida no QA: ≥2×, tipicamente ~3.5×). Não é estética:
  é a assinatura física do espalhamento Thomson nos coronógrafos.
- **Cinemática em FORMA FECHADA**: `v(t) = 0.045 + 0.19·ss((t−1.2)/2.6)`
  tem primitiva analítica — rise lento (~1.2s, o rope infla), aceleração
  impulsiva SINCRONIZADA com a fase impulsiva do flare, cruzeiro
  constante; meio-ângulo de expansão ~26° (CMEs típicas: 25-35°).
  Evento visível ~8s — o fôlego do rescaldo gradual do flare (τ≈6s).
  Forma fechada ⇒ `setCmeClock(t)` fotografa QUALQUER instante de forma
  determinística (sob `?hold` o relógio salta e a geometria segue).
- **Brilho**: dilui com a expansão (conservação de massa na casca,
  `(0.16/ρ)^0.88`) e esmaece ao alcançar a borda do domínio (3.3R).

### Gatilho: só flare GRANDE solta CME

No disparo de um flare (natural ou forçado), a probabilidade de CME
cresce com a amplitude: `p = clamp((amp − 0.85)/0.45) · min(1, cme)` —
X-class em região forte é quase certo, M-class é raro. O sorteio vive
num **stream RNG próprio** (`cmeRand`, padrão `loopRand` da F1): nada
desloca o `srand` nem o `loopRand`. Cooldown de 20s entre eventos. Com
`cme=0` a chamada retorna antes de qualquer sorteio.

### Partículas do ejecta por TRANSFORM FEEDBACK (payoff WebGL2 nº 2)

O material do núcleo (a proeminência que ergue, ref-14) é um sistema de
partículas advectado 100% na GPU:

- **Ping-pong de VBOs** (posição+vida, velocidade+tipo) com
  `RASTERIZER_DISCARD` no passo de sim — zero readback, zero alocação
  por frame; `renderer.resetState()` devolve o estado ao three.
- **Respawn na janela do evento** (~0.9s): as partículas nascem na base
  do rope num leque ao longo do eixo da PIL, determinísticas por
  `gl_VertexID`+seed. Campo de velocidade auto-similar (radial a partir
  do centro da bolha + arrasto na direção do evento) com dispersão por
  partícula; **~28% drenam de volta** no rescaldo (chuva coronal).
- **Render**: 2 `THREE.Points` fixos (um por VBO, via
  `GLBufferAttribute`) alternando visibilidade — os VAOs do three ficam
  estáveis, sem rebuild por frame. Mistura de grãos finos e flocos
  (tamanho por hash) para não ler como spray uniforme.
- **Tiers**: `cmen` 0/1024/2048/4096 (low sem partículas).

### Tier-gate e kill-switch

`TIER_PARAMS.cmestep`: low **0** (o evento não tem casca — flare/arcada
seguem como sempre), mid **16**, high **24**, ultra **32** passos. No
auto-tune, `cmeKilled` é o PRIMEIRO degrau do kill (antes do
`cvolKilled` da F4): o CME é efeito episódico — se nem a menor escala
segura o frame durante uma erupção, a erupção não pode afundar o tier
inteiro. O gate de 24fps segue sendo código, não pergunta ao dono.

### "Uma estrela, um estado"

O evento é o MESMO do flare two-ribbon da F1: a reconexão que acende as
fitas é a que solta o rope (a arcada escura da F4 é o rescaldo natural
por baixo da CME que partiu). A lente reage: `lastCmeHDR` (envelope ×
amplitude × Thomson global) entra no alvo da íris (`+0.10·cmeHDR`, soma
0.0 bit-exata sem evento), e a casca em HDR alimenta bloom/veil/halação
por conta própria.

## Foco raso hexagonal (knob `dof`, 0–1.5, default 0)

- **CoC ANALÍTICO** (convenção da íris sem readback): o perfil da esfera
  dá a profundidade por pixel (`z = √(1−rr²)` no disco; céu além do
  limbo é fundo), CoC = |perfil − foco|. Nenhuma leitura de Z.
- **Abertura ∝ close-up**: `dofCloseK = clamp((fitDist/camDist −
  1.10)/1.10)²` — em FIT a abertura é ~0 e o knob ligado NÃO muda o
  enquadramento aberto (provado: 0px no QA L1); em close-up o desfoque
  cresce até ~2.6% da altura do quadro.
- **Bokeh hexagonal**: gather de 19 taps num HEXÁGONO (centro + anel de
  6 + anel de 12 nos vértices e meios de aresta) — a MESMA íris de 6
  lâminas do starburst da F1; highlights desfocados viram hexágonos.
- **Focus pull**: `uDofFocus` 0 (centro do disco) → 1 (limbo), com lerp
  curto (τ≈0.35s) — o modo diretor puxa o foco como um maquinista;
  `setDofFocus` snapa para QA sob `?hold`.

## Modo diretor (`?director=1`, default ausente = nada roda)

Sequência-atração determinística de ~84s que amarra as 5 fases, POR
CIMA dos mesmos knobs/estados dos hooks (nenhum caminho novo de
render): plano geral → push-in com foco raso na região ativa (tracking
da rotação real) → reposição ao limbo (o palco do Thomson) → **flare
X + CME** com rescaldo (arcada aditiva→escura) → retirada wide → 
time-lapse documental do ciclo → recomeça com a PRÓXIMA região como
protagonista. Beats por relógio próprio com lerps exponenciais (sem
estado acumulado além do relógio); qualquer input do usuário
(arrastar/scroll/tecla) devolve o controle e restaura os knobs que o
diretor moveu (`lapse`, foco). Recomendado: `?look=sunshine&director=1`.

## Hooks novos (`__solInfo.*`)

`forceCME(i)` (flare grande + casca no par i, sem sorteio);
`setCmeClock(t)`; `cmeInfo()` {on,t,amp,count,steps,killed,knob,front,
rho,cx,env,hdr,dir,pts}; `setCme(v)`; `setCmeCore(x)` (eixo do sweep);
`setDofFocus(x)` (−1 = automático; snapa sob hold); `dofInfo()`;
`directorSkip(t)` (fotografa um beat sem esperar); `directorInfo()`.
`toggle` ganhou `cme` e `cmepts`. `knobs()` expõe `cme`/`dof`/`director`.

## QA (tools/qa-phase5.js — 14 checks, `npm run qa:phase5`)

- K1-K8 (CME): knob/tier prontos; casca assina o frame no limbo (A/B
  mesma página); expansão auto-similar; **Thomson limbo vs frontal
  (razão ≥2)**; partículas vivas + toggle limpo; tier low sem CME
  (forceCME=false); **determinismo casca+partículas (2 execuções,
  0px)**; knob→0 ao vivo apaga a casca.
- L1-L3 (DoF): **fit inerte (0px)**; close-up assina (diff>300px);
  focus pull muda o plano (diff>200px).
- M1-M3 (diretor): sem query = inexistente; beats avançam e o beat da
  erupção dispara flare 1.35 + CME; input do usuário encerra.
- Gates herdados todos verdes: paridade ≤0.001 (5/5, deltas 0-7px = os
  MESMOS anti-alias da Fase 0), qa:controls 6/6, qa:phase1 12/12,
  qa:phase3 12/12, qa:phase4 13/13, e **A/B worktree origin/main vs
  branch com --max-frac 0: 0px em 5/5**.

## A/B de GPU por tier (perf hooks, SwiftShader)

(Preenchido na rodada de gates — ver seção QA do registro final.)

## Calibração visual (painel de juízes)

(Preenchido após o sweep + painel de 3 juízes — valores do preset.)

## Débitos conscientes desta rodada

- Multiplicidade de manchas no máximo (débito F3, flag 3/3 juízes) —
  não atacado; slots virtuais baratos seguem como candidato (medir o
  custo do bake antes).
- Proporção das regiões ativas vs refs GONG (pedido do dono na F3) —
  segue aberto.
- Plumas polares e cúspide real do helmet streamer (F4) — seguem
  anotados; o balanço raias antigas × streamers volumétricos idem.
- As partículas do CME não leem o campo magnético por partícula (não há
  textura de VETOR de campo) — a advecção é o campo auto-similar da
  casca + dispersão; um `sampler3D` de B abriria trilhas curvas reais.
- A casca não interage com a coroa volumétrica (não deprime a densidade
  do cvol atrás da frente — o "dimming" coronal real); candidato barato:
  modular o cvol pelo envelope do CME na região do cone.
- Sob `?hold`, partículas congelam no instante do hold (integração não
  salta com setCmeClock — só a casca tem forma fechada); documentado no
  harness (as fotos de beat usam hold≈lançamento+1.4s).

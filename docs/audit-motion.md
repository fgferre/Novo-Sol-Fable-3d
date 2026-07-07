# Auditoria de MOVIMENTO (2026-07-06) — sol-3d.html @ 81957ce

Dois auditores paralelos sobre o main pós-merge da camada Sunshine:
M1 (inventário de cadências, código + runtime) e M2 (crítica
perceptual de SEQUÊNCIAS, frames rAF-consecutivos). Motivação do
dono: os julgamentos anteriores eram todos sobre stills; o Sol do
Sunshine (2007) é vivo em MOVIMENTO. Este arquivo é a fonte da
verdade para o PROMPT-LOOP-7.

## VEREDITO GERAL

**Nota de cineasta para "vida do Sol em movimento": 5.5/10** (vs 6.8
da média estática) — o movimento é hoje a maior distância entre a
demo e o padrão Sunshine. Macro-evolução (filamentos se reorganizando
em 1-3s), rotação×textura (rígida, +9px/frame constante, sem
escorregamento) e renascimento de proeminências (env=0 no teleporte,
sem pop) CONVENCEM. O micro-movimento NÃO: "slideshow com dissolve,
não fervura".

## Bugs de sincronização confirmados (M1, com linhas @ 81957ce)

1. **Crossfade do bake truncado (risco 3)**: uBakeMix vai de 0 a
   ~0.875 e é ZERADO no swap (L3017, dentro do gate `bakeStep>=0`) —
   pop de 12.5% de blend a cada ciclo (~8Hz a 60fps; medido
   mixAtSwap 0.87-0.88). Acima de ~67fps o mix CONGELA nos frames de
   espera (accum<0.12) e depois salta (stall+jump). A speed=3 o
   clamp bakeCycleDt≤1.5 (L3010) fecha o fade cedo (stall em 1 +
   salto). Fix: avançar uBakeMix por delta FORA do gate e garantir
   chegada a 1.0 antes do swap.
2. **Guard-5 do sim satura sem drenar (risco 2)**: L2987 limita a 5
   passos/frame sem descartar o excedente do acumulador — em
   fps_real < TIME_SCALE·rate/50, simAccum cresce sem limite e a
   granulação/advecção fica PERMANENTEMENTE mais lenta que rotação/
   proeminências/bake (todos em `elapsed`). Medido tier=mid speed=3
   @1.6fps: 199/200 frames cravados no teto. Dessincronia CUMULATIVA.
   Fix: drenar/clampar simAccum ao teto do frame (tempo perdido de
   forma coerente, não acumulado).
3. **Tearing intra-bake (risco 3)**: o comentário L1024 promete
   "mesmo timestamp", mas as 8 fatias leem uSimTex AO VIVO (swap a
   cada passo do sim, L540-543) e uCharges mutado por
   updateActiveRegions durante o ciclo (L789/927). Medido: ~13
   passos de sim caem dentro de 1 ciclo de bake a 1.6fps (speed=3:
   ~37) → emendas horizontais entre bandas de latitude. Fix:
   snapshot de simTex/charges no início do ciclo de bake.
4. **regDt cap 0.2 (risco 1)**: L707 — a speed=3/fps<15 as cargas
   derivam ~33% mais devagar que a advecção da plage (manchas
   descolam da plage). Mesma família do bug 2.
5. **Íris em tempo real (risco 1, design)**: constantes da adaptação
   (0.5s/3.0s) são em rawDelta — corretas entre fps, mas em ?speed=3
   o olho reage 3× "lento" relativo ao mundo.

## Achados perceptuais (M2, speed=1, rotação congelada)

- **Disco = bimodal**: platôs 0.53-0.87 de diff + rajadas 3.4-4.0
  quando o bake troca (razão max/min 133). PROVA de mecanismo: com
  `toggle('bake',false)` o diff do disco cai a **0.03 = zero
  animação contínua no shader da superfície**; todo o "ferver"
  aparente é o bake ~8Hz + crossfade (que avança aos saltos: 2
  frames grandes + 4-8 congelados).
- **Camadas em cadências visíveis diferentes**: espículas contínuas
  (0.37/frame), disco pulsado, **coroa imóvel (diff 0.00)**,
  estrelas 100% estáticas (único elemento totalmente morto; sem
  twinkle).
- **Flare = "lâmpada" + íris = "cortina"**: flash local +3% por 1
  frame; depois a íris (adapt 0.55, termo 0.60·sfEnv) escurece o
  quadro TODO −26% ao longo de ~1.5s sem recuperação visível no
  clipe. O evento lê invertido: o mundo escurece mais do que o flare
  brilha.
- **Extinção de proeminência** comprime-se em ~1 frame no fim
  (smoothstep(0,0.08,uLife) satura cedo) — aspereza menor.
- Caveat honesto: sob SwiftShader o ciclo de bake dura ~0.8s sim
  (vs ~0.25s a 60fps), alongando platôs; mas a ausência total de
  movimento entre bakes (E1) e o caráter "dissolve entre poses"
  valem em qualquer fps.

## Tabela de cadências (M1)

| subsistema | cadência efetiva | interpolação | risco |
|---|---|---|---|
| sim convecção | 16/22/26Hz por tier; real: min(tier, fps·5) | swap seco | 2 |
| bake chromo+smear | fps/8 (60fps→7.5Hz; 30→3.75) | crossfade TRUNCADO | 3 |
| rotação | por frame contínua | n/a (bake em UV de objeto, gira junto) | 0 |
| LIC zoom | por frame | contínua (direção via sim = degrau 22Hz) | 1 |
| manchas / plage | frame / fps·8 | — / crossfade | 1 |
| proeminências | por frame (breathing 1/f) | renasce com env=0, sem pop | 0 |
| espículas | por frame | contínua | 0 |
| coroa | uniforms por frame, mas SHADER sem evolução própria | — | 0* |
| flares | envelope contínuo | kernel gauss fixo ("pisca") | 0 |
| deriva regiões | por frame, cap regDt 0.2 | n/a | 1 |
| cinema (shimmer/íris/streak) | por frame | contínua; íris em rawDelta | 1 |
| estrelas/Via Láctea | 0 Hz (só paralaxe) | n/a | 0* |

(*) risco 0 de dessincronia, mas coroa/estrelas são as camadas
MORTAS que quebram a ilusão por contraste com as vivas.

## BACKLOG DE MOVIMENTO (ordem recomendada)

1. **[BUG] Crossfade do bake**: avançar por delta fora do gate,
   completar a 1.0 antes do swap (elimina pop 12.5% + stall/jump).
2. **[BUG] Coerência temporal do sim**: drenar guard-5; snapshot de
   simTex/charges por ciclo de bake (tearing); alinhar regDt.
3. **[FEATURE nº1] Fervura contínua do disco**: domain-warp por
   uTime no shader da superfície (fração de px/frame) — o maior
   ganho único de vida; o bake vira evolução de conteúdo e o warp
   vira movimento contínuo entre poses.
4. **[FEATURE] Coroa viva**: flicker 1/f + rotação lenta própria
   dos raios via uTime no shader da coroa (hoje diff 0.00).
   Estrelas: twinkle sutil (amplitude pequena; astrofoto tem pouco,
   cinema tem algum — julgar por juiz visual).
5. **[TUNE] Flare×íris**: laço visual do uFlare ~4× mais forte;
   termo do flare na aTarget 0.60→~0.25; conectar com morfologia
   ref-08 (fitas + arcada pós-flare + envelope 2 fases) quando for
   atacada.
6. **[POLISH] Extinção de proeminência**: alargar o smoothstep final.

## Registro do LOOP-7

### Iteração 1 — [BUG] Crossfade do bake (commit 80ff485)

uBakeMix avança TODO frame (fora do gate de fatias) e o fade dura 85%
do ciclo medido, saturando em 1.0 antes do swap — no swap (prev:=cur,
mix:=0) a imagem é a mesma. QA M2: pop no swap ELIMINADO (diff do
disco no frame do swap = 0.076, igual ao piso sem-bake), sem
stall+jump, mix linear 0.147/frame a speed=1, **razão max/min do disco
133 → 7.8** (alvo <10 ✅). Gates 8/9 ×3 (I span 18/19 falha também no
HEAD anterior — complexo grande pré-existente, não regressão);
controles 6/6; neutralidade cinema limpa. Nota de cineasta 5.5 → 6.5:
"o slideshow virou dissolve contínuo e limpo, mas ainda é dissolve".
Achado para a iter 2: a speed=3 o clamp bakeCycleDt 1.5 < 0.85×ciclo
(~2.4s) congelava as camadas baked 3 de 8 frames por ciclo → clamp
elevado a 4.5 na iteração 2.

### Iteração 2 — [BUG] Coerência temporal do sim (commit 698b058)

(a) Dreno do guard-5: simAccum clampado a 1 passo pendente — sem
dessincronia cumulativa a fps baixa; (b) snapshot de simTex+charges no
início de cada ciclo de bake (chromo/smear leem só o snapshot) —
tearing intra-bake eliminado (zero emendas horizontais nos diffs);
(c) regDt cap 0.2→0.35 — cargas em sincronia com a plage a speed=3;
(d) clamp bakeCycleDt 1.5→4.5 — a speed=3 o fade cobre o ciclo todo
(A/B contra 80ff485: antes congelava 3 de 8 frames; agora mix linear
0.147/frame nas DUAS velocidades, satura exatamente no swap). Disco
0.60-0.76 no fade com dip só no swap (0.080 ≈ piso sem-bake 0.075);
razão max/min 8.5 (4.2 a speed=3). Gates 8/9-9/9-9/9 (só flake I);
controles 6/6; neutralidade limpa. Nota 6.8: "correção de ritmo real,
mas 7.5 só vem com fervura contínua + coroa viva".

### Iteração 3 — [FEATURE nº1] Fervura contínua do disco (commit 0109356)

Domain-warp do domínio do bake por uTime no fragment shader: 2
oitavas de snoise em espaço do OBJETO (uGranFreq*0.45 e *2.6, fases
t*0.9/t*1.7), amplitude 0.0035 UV. QA M2: **platô do disco sem bake
0.075 → 3.245** (speed=1; 5.505 a speed=3) — ~43x o alvo 0.3; razão
max/min com bake 1.1; swap invisível. Caráter julgado: "diffs nas
bordas de filamentos na escala das células, estrutura conservada e
empurrada — não nada como água nem vibra como ruído"; fios nítidos.
Rotação×textura rígida (warp gira junto, resíduo pós-compensação =
platô congelado). Perf: +0.7% no pior tier (low), high sem sinal de
regressão. Gates 9/9 ×3 (sem nem disparar flakes); controles 6/6;
neutralidade limpa. Nota 7.2 — falta coroa viva + estrelas (iter 4)
para ≥7.5.

### Iteração 4 — [FEATURE] Coroa viva + twinkle das estrelas (commit da99a73)

Coroa: deriva angular própria (uTime*0.010), fbm ~5x mais rápido
(0.030/0.045) e flicker 1/f por direção; streamers seguem ancorados
às cargas. **Diff da coroa 0.008 → 0.180** (speed=1; 0.379 a speed=3)
— "raios derivam/tremem como luz de eclipse", halo estável (sem
strobo/pulso). Estrelas: twinkle por estrela via onBeforeCompile
(amplitudes 0.30/0.45/0.18) — fases independentes (corr média −0.03),
"sutil-cinematográfico". Regressões limpas (fervura 3.10, swap
invisível, ratio 1.15). Perf: high +6.8% / low −7.4% (≤10%, ruído
±15pp). Gates OK (flake I 3/4 amostras, spans 19-20 — sem caminho
causal com coroa/estrelas; MONITORAR). **Nota 7.6 — alvo ≥7.5 do
loop ATINGIDO.** Caveats de protocolo do M2: medir com ?grain=0 e
gatear a auto-órbita (theta+=0.066*rawDelta) nas cópias debug.

### Iteração 5 — [TUNE] Flare×íris (commit 24ea975)

Laço visual do uFlare ~4x (heat += flareGlow*0.9; pico HDR 0.9→3.6) e
termo do flare na aTarget 0.60→0.25. QA M2 (forceFlareAt, sequência
completa): **evento lê CORRETO** — pico local +213.9% vs íris −0.9%
abaixo do baseline (antes: +3% vs −26% = invertido); surround brilha
+49.5% junto (boost 0.85·sfEnv) e assenta em ~2s. Pico segura como
filme: 0% de pixels quase-brancos (núcleo creme, halo âmbar, streak
anamórfico), granulação legível através do glow. Íris viva mas sutil
(fecha −6.6%, reabre tau 3s). Regressões limpas (fervura 2.86/4.47,
coroa 0.155/0.340, swap invisível). Gates 9/9-8/9-9/9 (flake I 1/3);
controles 6/6. Nota 7.8. O que separa de 8.5 é a morfologia ref-08
(ataque 1-frame + bola gaussiana) — fora desta missão.

## Métrica de progresso

Re-rodar o M2 (mesmo protocolo: 12+ frames rAF-consecutivos,
speed=1 e 3, strips por região, toggle bake off como controle) após
cada feature; alvo: disco com diff contínuo entre bakes (platô>0.3
sem o bake), razão max/min do disco <10, coroa >0, nota de cineasta
≥7.5. Gates A-I e qa-controls continuam obrigatórios (a fervura
mexe no shader do disco — vigiar D-tufos/G/H).

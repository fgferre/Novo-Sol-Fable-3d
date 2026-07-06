# Camada cinematográfica "Sunshine" (2026-07-06)

Missão: elevar a experiência visual da demo seguindo a linguagem de
SUNSHINE (2007, Danny Boyle / MPC / DP Alwin Küchler) — o Sol como
presença esmagadora, "brilho que dói" — dentro das limitações:
arquivo único sem rede, tiers de perf, física e gates A-I intactos,
default calibrado PIXEL-IDÊNTICO (a camada nova é 100% opt-in).

## O que a pesquisa documentou (fontes: fxguide, ASC, AWN)

- O Sol do filme é composto em camadas com relighting no comp; o
  brilho vem de HALAÇÃO/veiling glare ("knife edge of stability") e
  de FLARES REAIS de lente filmados pelo DP — "CG lens flares look
  too processed and clean" (Tom Wood).
- O truque nº 1 é psicológico/perceptual: interiores frios
  (cinza/azul/verde, sem laranja) para o ouro do Sol "penetrar";
  payoff da sala de observação = exposição despencando (filtro
  3.1%) com o quadro lavado de glare.
- Ad Astra: bloom granulado ao redor de highlights + exposição
  variando com a distância ao Sol. Interstellar: glare como FUNÇÃO
  DA LENTE (convolução com PSF medida), não sprite. Games (Elite,
  Outer Wilds): heat shimmer + auto-exposure agressivo.

## Tradução para o pipeline (mapa em audit-loop6/pesquisa)

Tudo converge no composite (L~2053-2086) + 1 cadeia nova de RTs:

1. **`veil` — veiling glare/halação**: soma do mip MAIS LARGO do
   dual-Kawase (bloomMips[último], já renderizado — custo ZERO de
   passes novos) lavando as sombras ao redor do disco.
2. **`adapt` — adaptação de exposição (olho/íris)**: alvo analítico
   em JS (cobertura angular do disco na tela + uActivity + envelope
   de flare sfEnv), lerp temporal ASSIMÉTRICO (fecha rápido no
   claro, reabre devagar); flare ⇒ surge de superexposição e a íris
   "fecha" em seguida. Sem readback de GPU.
3. **`streak` — flare anamórfico**: 2 RTs pequenos (largura/4 ×
   altura/16), blur horizontal em 2 passadas a partir do mip 1 já
   thresholdado; tint frio sutil; só renderiza quando knob > 0.
4. **`fringe` — franja cromática**: offsets RGB radiais nos
   estouros (máscara de luminância), 2 amostras extras no composite.
5. **`shimmer` — heat-haze**: distorção de UV com noise scrollando
   para cima, mascarada num anel além do limbo (centro/raio do disco
   projetados em JS); não toca o interior do disco.
6. **`tone` — grade split-tone**: sombras→azul-frio, altas→âmbar
   (o contraste Boyle/Küchler dentro de um frame só).

## Regras

- TODOS os knobs novos com default 0 ⇒ sem query/painel o frame é
  pixel-idêntico ao calibrado (gates continuam medindo o default).
- Preset `?look=sunshine` semeia o conjunto calibrado (knobs
  individuais na URL/painel têm precedência).
- Custo: zero passes novos com knobs a 0; streak só quando ativo;
  respeitar RENDER_SCALE/resizeTargets.
- QA por iteração (subagentes, veredito curto): neutralidade
  (diff=0 vs baseline no default), smoke visual de cada knob, gates
  2 amostras, qa-controls, zero pageerror; calibração final do
  preset por sweep + juiz visual.

## Iterações

- I1: composite (veil+tone+fringe+shimmer+adapt) + knobs/painel/
  preset/__solInfo.knobs.
- I2: streak anamórfico (RTs + passes + composite).
- I3: sweep de calibração do preset ?look=sunshine + juiz.
- I4: bateria final (gates 3×, controles, neutralidade, mobile) +
  registro + PR.

## Registro por iteração

- **I1 FEITO** (79348d7): veil/adapt/fringe/shimmer/tone no composite,
  preset ?look=sunshine, seção 'cinema' no painel, knobs() estendido.
  QA-I1: 9/10 PASS — veil +17-47% de céu sem artefatos; íris com
  assinatura flash→fecha comprovada (adaptMul 0.88→1.32 no pico do
  flare→0.78 fechada); shimmer +23% só no anel (interior do disco
  intacto); tone esfria o céu +15% mantendo o disco dourado; preset
  7/10 do juiz; gates 9/9 e 8/9 (flake conhecido do gate I); controles
  6/6; zero pageerror em ~12 cargas.
- **I1.1 FEITO** (dd77d21): fringe estava inerte (máscara de luma
  H-alfa nunca abria) → aberração cromática lateral real de lente
  (offset radial ∝ 0.006+0.020·r², zero no centro). A/B: separação
  R-B no limbo 0→7px com fringe=1.3.
- **I2 FEITO** (a58051d): streak anamórfico — RTs w/4×h/16, 2 passadas
  horizontais 17-taps (strides 2/8), tint frio, só renderiza com
  knob>0. Smoke: +58% na faixa equatorial, risco suave sem serrilhado.
- **I3 FEITO**: sweep de 7 variantes (5 + 2 híbridas) com juiz visual.
  Vencedora h2 (8.5/10 vs 7.0 do chute inicial): veil 0.85,
  streak 0.65, adapt 0.55, fringe 0.35, shimmer 0.45, tone 0.65,
  bloom 1.15, grain 1.7, vig 0.85, exposure 1.08. Clip 0.07% ≪ 0.5%,
  contraste frio/ouro 1.22, fibrilas nítidas (grad 2.44); portrait e
  zoom 6× confirmados sem clip. ACHADO: fringe ≥0.5 gera rebordo
  verde no limbo e ghosting RGB nas proeminências — teto do preset
  fixado em 0.35 (knob manual continua indo a 1.5).
- **I4 FEITO (bateria final verde)**: gates 9/9·9/9·8/9 (única falha
  = flake conhecido do gate I, span 23); qa-controls 6/6; neutralidade
  exata do default (12 knobs antigos + 6 cinema a 0, adaptMul=1);
  preset íntegro (knobs batem h2, halação+split-tone presentes, sem
  artefato novo, franja R/B da proeminência só visível em zoom 2×);
  painel 18 sliders (ao vivo, persistência, restaurar padrão, drag não
  gira o Sol, 390px com scroll); custo do preset ~0 (ms.avg razão
  0.962, +2 draw calls do streak); zero pageerror em ~15 cargas.
  Nota estética documentada: grain 1.7 do preset deixa speckles
  visíveis no portrait — escolha calibrada do juiz, ajustável no
  slider.

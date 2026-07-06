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

(preenchido conforme avança)

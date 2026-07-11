# Roadmap — o próximo nível (esplendor cinematográfico × física real)

Resposta à pergunta do dono: *"o projeto ainda tem espaço para ganhar? WebGL2
ajudaria? alguma biblioteca de efeitos ou pacote de física traria ganho?"*

**Sim, há muito espaço — e quase nada exige tecnologia nova.** Os maiores
ganhos vêm de reusar a física que o projeto já tem (o modelo magnético de
cargas pontuais em `BFIELD_GLSL`) para renderizar estruturas hoje
artísticas: coroa, loops, flares. As decisões abaixo foram conversadas e
aprovadas pelo dono (2026-07).

## Decisões de tecnologia

| Pergunta | Decisão | Racional |
|---|---|---|
| WebGL2? | **WebGL2 mínimo** (o three moderno já é WebGL2-only) | Desbloqueia `sampler3D` (coroa volumétrica), `texelFetch` (sims sem sangramento bilinear), MRT e transform feedback (partículas). Todo iPhone desde ~2020 tem WebGL2. |
| Upgrade do three (r128 → atual)? | **Sim, via npm/Vite** | O projeto usa pouco do three além do núcleo; a migração exige apenas `ColorManagement.enabled = false` + saída linear (pipeline de cor é 100% manual). Verificada por paridade pixel a pixel (`tools/parity.js`). |
| WebGPU / TSL? | **Não por ora** | iOS só tem WebGPU por padrão no iOS 26+; os sims fragment-shader ping-pong têm folga no WebGL2. Reavaliar quando o iOS 26+ for o piso realista. |
| Pacote de física (Rapier, cannon-es…)? | **Não — valor negativo** | São solvers de corpo rígido/colisão; a física daqui é de CAMPOS (advecção, difusão, campo potencial), já na GPU. Snodgrass-Ulrich, Leighton e Hale/Joy são modelos de domínio que nenhum pacote oferece. |
| Lib de pós-processamento (pmndrs/postprocessing)? | **Não** | O stack custom é domain-tuned (halation ciente de corpo negro, íris analítica sem readback) — melhor que o genérico. Roubar ideias do código MIT dela (DoF, lens flare), não a dependência. |
| Arquitetura | **Vite + npm + módulos ES** | Melhor para QA (CI com paridade determinística) e para crescer. `npm run build:single` preserva o arquivo único offline/file://. |
| Alvo de hardware | **≥24 fps no celular; desktop escala** | Tier `ultra` no desktop; auto-tune com piso por tier. |

## Princípio de design: "uma estrela, um estado"

Física e cinema caminham SEMPRE juntos, ligados pelo mesmo estado da
estrela (atividade, fase do ciclo, eventos de flare/CME): a física gera o
evento, a lente reage (íris fecha no flare, starburst cresce com o brilho
HDR real, veil respira com a atividade). Nada de efeito cosmético
desconectado do estado físico. Todo knob novo tem default = imagem
idêntica ao baseline (convenção do projeto desde o LOOP-5).

## Fases

### Fase 0 — Modernização da base (entregue nesta branch)
Vite + npm + three 0.185 com paridade pixel-perfect PROVADA (determinismo
0px; migração ≤7px/0,0012% — anti-alias de borda): modo `?det=1&seed&hold`
+ `tools/parity.js` + `tools/imgdiff.js`; QA em CI (workflow `qa.yml`);
tiers recalibrados (piso 24 fps mobile via limiar 42ms p95, tier ultra
desktop com DPR 3); fix do rebordo verde do fringe (CA espectral de 6
taps com pesos de arco-íris); tonemap AgX opcional (knob `film`, com
outset); oscilações p-mode (knob `pmode` — primeira física nova);
linguagem de câmera Sunshine (knob `hand`).

**Débito consciente da Fase 0**: o código do app segue monolítico em
`src/main.js` (~3400 linhas). A divisão em módulos por domínio
(`src/glsl/`, `src/sim/`, `src/surface/`, `src/atmosphere/`, `src/post/`,
`src/camera/`, `src/ui/`) fica como loop de infra dedicado: é um refactor
mecânico grande sobre um closure com muito estado compartilhado, e o
gate de paridade determinística já existe para fazê-lo com segurança.

### Fase 1 — "A estrela magnetizada" (entregue nesta branch)
Loops coronais traçados por RK4 sobre o campo de cargas existente
(reuso direto de `BFIELD_GLSL`/`uCharges`; traço na CPU amortizado como o
bake fatiado) + flares two-ribbon na PIL com arcadas pós-flare (pendência
do audit-loop6). Cinema acoplado: starburst de difração e fechamento de
íris dirigidos pelo brilho HDR real do flare. **É a feature que faz o Sol
parecer uma estrela magnetizada.**

**Entrega (2026-07, ver `docs/fase-1-estrela-magnetizada.md`)**: knobs
novos `loops` e `burst` (default 0 = paridade provada por A/B com 0 px);
flare two-ribbon com envelope de 2 fases e arcada pós-flare são o NOVO
comportamento default do evento de flare; QA dedicado em
`tools/qa-phase1.js` (12 checks). Débito consciente: `loops`/`burst`
fora do preset `?look=sunshine` até um sweep com juiz visual.

### Fase 2 — "A luz como matéria"
Bloom espectral ponderado por corpo negro (R espalha mais que B — difração
∝ λ, o halo quente de filme) + halation com peso de temperatura nas
emissões de plage/flare. Validação de FPS em iPhone real (pendência).

**Entrega (2026-07, ver `docs/fase-2-luz-como-materia.md`)**: knobs novos
`disp` (bloom espectral: tent por canal na SUBIDA do dual-Kawase — só a
descida era imperceptível) e `hal` (halação vermelha pesada pelo excesso
espectral de R no mip largo, ganho acoplado ao flareHDR), ambos default 0
= paridade provada por A/B com 0 px. Débitos de LOD da F1 fechados: loops
e arcada viraram FITAS orientadas à câmera (tubo de largura fixa em mundo,
piso 1px/teto 14px), strands por zoom, arcada gateada fora da fase
impulsiva (anéis fantasma flagrados pelo painel de juízes). Dívida do
preset paga: sweep 6×2 + painel de 3 juízes (v1-sutil unânime) →
`?look=sunshine` liga loops/burst/disp/hal (0.55/0.55/0.40/0.45).
Experimento honesto: viés de separação no semeador NÃO reduziu rejeição
(79.7% vs 80.0%), revertido. FPS em iPhone real: segue pendente (dono).

### Fase 3 — "O tempo da estrela"
Ciclo de 11 anos: lei de Spörer (emergência 35°→5°), reversão polar,
flip de Hale entre ciclos — modulando a maquinaria de lifecycle que já
existe. Continuidade filamento↔proeminência no limbo (a mesma estrutura
escura no disco e vermelha além do limbo). Cinema: modo time-lapse
documental do ciclo.

**Entrega (2026-07, ver `docs/fase-3-o-tempo-da-estrela.md`)**: knobs
novos `cycle` (fase do ciclo modulando Spörer/Hale/reversão polar/
atividade — o sorteio de latitude REUSA o srand do caminho default, sem
deslocar o stream), `lapse` (time-lapse documental: ciclo completo em
~45 s, só a maquinaria de manchas acelera) e `fprom` (gêmeo de ABSORÇÃO
multiplicativa deitado sobre a esfera, mesmo uSeed/âncora da
proeminência — a estrutura atravessa o limbo sem trocar de identidade),
todos default 0 = paridade A/B 0 px em 5/5. Débitos F2 fechados: sonda
de topologia no semeador (rejeição fina 80%→53%, 16/16 slots cheios) e
piso de largura por foreshortening nos loops face-on (energia
conservada). Painel de 3 juízes: miolo sólido + meandro + teto cinza
nos filamentos; preset ganha `fprom:0.55`. `qa:phase3` novo (12 checks
D/E). Débito estrutural anotado: multiplicidade de manchas no máximo
(4 slots de região). FPS em iPhone real: ENCERRADO por decisão do dono
no fechamento da F3 — sem medição formal; auto-tune + seletor de tier
no painel cobrem ("se estiver lento, o usuário baixa o tier"); o HUD
`?hud=1` fica para diagnóstico pontual.

### Fase 4 — "A coroa de verdade"
Coroa volumétrica raymarched com helmet streamers emergindo da topologia
aberta/fechada do campo (payoff do WebGL2: densidade bakeada em
`sampler3D` 64³, fatiada como o bake da cromosfera). Tier-gated e
integrada ao auto-tune; o plano de gradiente atual permanece como
fallback dos tiers baixos.

### Fase 5 — "Erupção"
CME: casca de flux-rope que se desprende em flares grandes (brilho de
espalhamento Thomson no limbo) + partículas por transform feedback +
profundidade de campo hexagonal em close-ups + "modo diretor" (sequência-
atração com ciclo, eventos e linguagem de câmera).

## Não-objetivos (decididos)
MHD de primeiros princípios; interação com magnetosfera terrestre (não há
Terra em cena); transferência radiativa espectral completa; WebGPU/TSL
antes do iOS 26+ ser piso; dependências de física/pós-processamento.

## Infra de QA (Fase 0)
- `?det=1&seed=N&hold=F`: RNG semeado + dt fixo 1/60 + tempo congelado no
  frame F → screenshots reprodutíveis pixel a pixel no SwiftShader.
- `tools/parity.js` captura o conjunto padrão (desktop fit + 3
  ângulos/zooms + portrait); `tools/imgdiff.js` compara diretórios.
- Baselines commitados em `qa/baselines/` (gerados do sol-3d.html
  PRÉ-migração — o critério de paridade da Fase 0).
- CI (`.github/workflows/qa.yml`): build + qa-controls + paridade em todo
  push/PR; Pages publica o build Vite + `sol-3d.html` single-file.

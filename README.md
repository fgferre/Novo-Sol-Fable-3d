# Novo Sol — Simulação 3D

Simulação em tempo real da cromosfera solar em H-alfa (WebGL2 + Three.js +
GLSL custom), com física fundamentada (rotação diferencial de
Snodgrass-Ulrich, leis de Hale/Joy, transporte de fluxo de Leighton,
escurecimento de limbo) e camada cinematográfica inspirada em *Sunshine*
(2007). Roteiro de evolução em `docs/roadmap-proximo-nivel.md`.

## Rodar

```bash
npm ci
npm run dev            # servidor Vite com hot-reload
npm run build          # build de produção em dist/ (publicado no Pages)
npm run build:single   # arquivo único offline em dist-single/index.html
```

O build de arquivo único abre direto do disco (`file://`) — é o modo de
uso no iPhone sem servidor. `sol-3d.html` na raiz é a versão legada
congelada (pré-migração), mantida como referência e geradora dos
baselines de paridade.

## Parâmetros de URL

`?look=sunshine` (preset cinematográfico) · `?speed=` · `?tier=low|mid|high|ultra`
· `?scale=` · `?idle=1` · knobs individuais
(`?film=1&pmode=0.6&hand=0.5&loops=1&burst=0.8`…).
Fase 3: `?cycle=1` liga o ciclo solar de 11 anos (Spörer, Hale,
reversão polar), `?lapse=1` o time-lapse documental do ciclo e
`?fprom=1` a continuidade filamento↔proeminência.
Fase 4: `?cvol=1` liga a coroa volumétrica raymarched (tier mid+).
Fase 5: `?cme=1` liga as CMEs (casca de flux-rope + partículas em
flares grandes; tier mid+), `?dof=1` o foco raso hexagonal em
close-ups e `?director=1` a sequência-atração (recomendado com
`?look=sunshine`; qualquer input devolve o controle).
Fase 6 ("acabamento físico"): `?spots=1` liga as manchas de verdade —
grupos múltiplos líder/seguidor com proporção GONG, lei de Spörer nos
dois hemisférios e contagem acompanhando a fase do ciclo (no preset
sunshine em 1.0, mediana do painel de juízes). A mesma fase refinou os
looks knob-gated existentes: a coroa volumétrica (`cvol`) ganhou plumas
polares nos buracos coronais e cúspide de helmet streamer (defaults
plume/cusp 0.6, folha v2 — painel unânime), e o CME (`cme`) ganhou
estrias helicoidais do rope e cavidade rarefeita (stria 0.8/cav 0.85,
contraste frente:cavidade ≥2× medido). Registro em
`docs/fase-6-acabamento-fisico.md`.
**Tudo isso também existe SEM URL**: o painel de ajustes no ⚙ tem
sliders para todos os knobs, o botão "aplicar look Sunshine" e o botão
"▶ modo diretor" (que empresta cme/dof no valor do preset e os devolve
quando você retoma a câmera). As URLs são atalhos/deep-links e o
caminho das ferramentas de QA; o painel é o caminho principal (salvo
em localStorage).

## QA

```bash
npm run qa:controls    # controles (teclado/drag/zoom) via __solInfo
npm run qa:parity      # paridade visual determinística vs qa/baselines
npm run qa:motion      # evolução temporal (com tools/motion-check.py)
npm run qa:shot        # screenshots desktop/portrait/zoom
npm run qa:phase1      # Fase 1: loops, flare two-ribbon, starburst/íris
npm run qa:phase3      # Fase 3: ciclo de 11 anos + filamento↔proeminência
npm run qa:phase4      # Fase 4: coroa volumétrica raymarched + arcada escura
npm run qa:phase5      # Fase 5: CME/erupção + foco raso + modo diretor
npm run qa:phase6      # Fase 6: manchas (spots) + plumas/cúspide + estrias/cavidade
npm run qa:motion2     # rodada de movimento: flicker/strobo/coerência por região em
                       # sequências determinísticas + tiras de filme (gate de RODADA,
                       # ~19 min — não roda em CI; ver docs/rodada-movimento.md)
```

O modo determinístico (`?det=1&seed=N&hold=F`) fixa RNG e dt e congela o
tempo no frame F — duas execuções produzem imagens pixel-idênticas no
SwiftShader, o que permite regressão visual exata em CI
(`.github/workflows/qa.yml`).

## Arquitetura (pós Bloco A)

O app é modular: `src/main.js` é só o orquestrador (bootstrap, `init()`
com o manifesto RNG e as chamadas de factory na ordem original, e o
`animate()`). Cada domínio vive em `src/{glsl,core,sim,surface,
atmosphere,scene,post,camera,ui,debug}/` como `createX(ctx)` — estado
mutável compartilhado em `ctx.*`, imutáveis destructurados, zero
side-effects em import time. Paridade bit-exata com o monolito
verificada por estágio; detalhes e regras em
`docs/infra-modularizacao.md`.

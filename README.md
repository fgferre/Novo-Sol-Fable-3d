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
Painel de ajustes no ⚙ (salvo em localStorage).

## QA

```bash
npm run qa:controls    # controles (teclado/drag/zoom) via __solInfo
npm run qa:parity      # paridade visual determinística vs qa/baselines
npm run qa:motion      # evolução temporal (com tools/motion-check.py)
npm run qa:shot        # screenshots desktop/portrait/zoom
npm run qa:phase1      # Fase 1: loops, flare two-ribbon, starburst/íris
npm run qa:phase3      # Fase 3: ciclo de 11 anos + filamento↔proeminência
npm run qa:phase4      # Fase 4: coroa volumétrica raymarched + arcada escura
```

O modo determinístico (`?det=1&seed=N&hold=F`) fixa RNG e dt e congela o
tempo no frame F — duas execuções produzem imagens pixel-idênticas no
SwiftShader, o que permite regressão visual exata em CI
(`.github/workflows/qa.yml`).

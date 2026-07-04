# Prompt: loop de física + fidelidade por feature vs fotos reais

Copie o texto abaixo para iniciar uma nova conversa sem contexto:

---

Missão: evoluir `./sol-3d.html` (Sol 3D em H-alfa, Three.js, arquivo
único) para que cada FEATURE derive da física simulada e passe num
reality check contra as fotos reais em `./reference/images/`, com o
resultado holístico coerente — detalhe E conjunto.

Estado da física (não regredir, só aprofundar):
- Campo Br EVOLUÍDO por transporte de fluxo em superfície (Leighton):
  advecção pelo escoamento (curl-noise + rotação diferencial de
  Snodgrass-Ulrich), difusão, fontes bipolares + tapete magnético.
  Canal G da textura de simulação.
- Fibrilas seguem o gradiente do Br transportado (sftGrad) nas 3
  camadas (bake, smear, disco). Filamentos = linhas de inversão do Br
  evoluído. Plage = concentrações do Br evoluído.
- Cargas pontuais restam como esqueleto das regiões ativas (manchas,
  âncoras de proeminências, flares) com leis de Hale/Joy e rejeição de
  sobreposição em `placePair`.

Alvo visual: `ref-01`..`ref-05` (fotos reais; `ref-04`/`ref-05` têm
tons INVERTIDOS; `ref-00` é render antigo — ignorar).

Checklist de features (cada uma exige reality check dedicado):
1. Células/rede do sol calmo (fundo das refs 01/03)
2. Fibrilas/estrias (ref-01; métrica F)
3. Manchas: líder coeso + seguidor fragmentado, contornos irregulares
4. Plage mosqueada, nunca manchões brancos lisos (ref-03; métrica B)
5. Filamentos escuros serpenteando, visíveis no disco (ref-02/03)
6. Limbo + espículas tufadas (ref-05; métricas A/D)
7. Proeminências brilhantes no limbo (ref-04)
8. MOVIMENTO: rotação carrega o padrão, convecção evolui, regiões
   nascem/morrem, SEM pop/flicker (qa-motion + motion-check)
9. Flares: brilho efêmero localizado em região ativa madura

Ferramentas (Playwright/Chromium prontos; NODE_PATH=/opt/node22/lib/node_modules;
`pip install pillow` se PIL faltar):
- `node tools/shot.js <dir>` — desktop/retrato/zoom
- `node tools/qa-elements.js <dir>` — capturas por elemento
- `python3 tools/analyze.py <dir> reference/images/ref-01-fibrilas-mancha.jpeg`
- `node tools/qa-motion.js <dir>` + `python3 tools/motion-check.py <dir>`
- `node tools/qa-controls.js` — controles não podem regredir
- varredura de ângulos/zooms via `__solInfo.setView` (crie um sweep)

Loop obrigatório por iteração:
1. Capture TODAS as ferramentas acima + varredura de ângulos/zooms.
2. ABRA as imagens; percorra o checklist feature a feature comparando
   com a ref correspondente; depois avalie o disco inteiro
   holisticamente (composição, contraste, movimento).
3. Liste desvios, ordene do pior; corrija SÓ o pior com mudança pequena
   e focada — física antes de cosmética (se puder derivar do campo
   evoluído, derive; use visualização de canais de debug numa CÓPIA
   antes de calibrar às cegas).
4. Repita até: todas as métricas PASS + checklist inteiro convincente +
   sem regressões. Commite cada iteração; push na branch designada.

Invariantes: arquivo único sem rede; controles intactos (qa-controls
10/10); zero erros de console; retrato enquadrado; física existente
nunca removida, só aprofundada.

Se ~15 iterações não convergirem, pare e escreva um resumo honesto dos
bloqueios.

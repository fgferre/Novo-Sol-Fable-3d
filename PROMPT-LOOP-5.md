# Prompt: revalidação total — harmonia, ciência, cinema AAA, performance

Copie o texto abaixo para iniciar uma nova conversa sem contexto:

---

Missão: revalidar TODAS as features técnicas de `./sol-3d.html` e como
elas conversam entre si — de forma harmoniosa, realista e
CIENTIFICAMENTE DEFENSÁVEL — e elevar o resultado a um visual
cinematográfico AAA com wow effect máximo em máquinas potentes, SEM
deixar de rodar bem em celulares (referência: iPhone 15 Pro).

## FASE 0 — AUDITORIA (obrigatória, delegada, paralela)

Antes de tocar em qualquer código, dispare subagentes paralelos (Agent
tool ou Workflow) que devolvem SÓ vereditos estruturados:

1. AUDITOR DE FÍSICA: lê `sol-3d.html` inteiro e produz uma ficha
   técnica por feature (granulação/rede, fibrilas, manchas Hale/Joy,
   plage, filamentos, espículas, proeminências ×3 tipos + ciclo de
   vida + acoplamento de campo + interação com flare, flares, coroa,
   limbo, rotação Snodgrass-Ulrich, transporte de fluxo Leighton,
   bloom/ACES, estrelas): base física, escalas reais vs render
   (R☉=696 Mm; tempos normalizados), aproximações assumidas, veredito
   de defensabilidade (forte/média/fraca) + 1 linha de correção.
2. AUDITOR DE HARMONIA: matriz de conexões feature↔feature — o que
   deriva do MESMO campo Br evoluído, o que ainda é aleatório/isolado,
   quais conexões faltam (ex.: espículas não sentem o campo? coroa não
   acompanha atividade?). Nada pode existir isolado.
3. JUIZ CINEMATOGRÁFICO: bateria visual fresca (sweep + shot +
   qa-prom-orbit) julgada contra as refs E contra padrão AAA de jogos/
   filmes: bloom, tonemap, grading, composição, micro-detalhe, câmera,
   profundidade, wow. Devolve top-3 upgrades de maior impacto.
4. PROFILER DE PERFORMANCE: mede ms/frame (média e p95) por tier e por
   zoom via rAF na página; identifica gargalos (passes de bloom,
   resolução, contagem de draw calls, custo dos shaders pesados);
   aponta lacunas de instrumentação. Honestidade obrigatória: o
   ambiente headless (SwiftShader) é um PROXY — documente o que só um
   device real mede.

A janela principal consolida tudo num BACKLOG ordenado por impacto
(pior desvio primeiro) e o commita em `docs/audit-loop5.md`.

## FASE 1..N — LOOP (regras dos loops anteriores, invariantes abaixo)

Por iteração: corrija SÓ o pior item do backlog com mudança pequena e
focada (física antes de cosmética; debug em cópia `debug-*.html`);
delegue captura+inspeção a subagentes (veredito PASS/FAIL + 1 frase +
arquivo de evidência); re-priorize o backlog; commit+push por iteração.

Trilhas do backlog (equilibre as três ao longo do loop):
- CIÊNCIA/HARMONIA: cada correção deve derivar do campo evoluído ou de
  física citável; conexões novas > enfeites novos.
- CINEMA AAA (tier alto): upgrades de wow — ex. coroa estruturada
  alinhada ao campo, erupção/CME rara como evento, grading fílmico,
  câmera idle cinematográfica, paralaxe de estrelas — desde que
  fisicamente defensáveis OU claramente apresentacionais (nunca
  pseudo-física).
- PERFORMANCE (tier móvel): sistema de tiers adaptativo em runtime
  (auto-detect por devicePixelRatio/renderer + auto-tune por FPS
  medido: cai de tier se p95 < 50 fps), adaptive DPR, cortes de custo
  que preservem a IDENTIDADE visual (nada de versão "capada" feia).
  Instrumente `__solInfo.perf()` (fps rolling, tier ativo, custo por
  subsistema) para o QA medir.

## INVARIANTES (nunca regredir)

- Arquivo único, sem rede, controles intactos (qa-controls), zero
  pageerror, retrato enquadrado.
- Gates A–I do `analyze.py` sempre PASS (duas amostras se um gate
  oscilar).
- Física existente nunca removida, só aprofundada: transporte de fluxo,
  ciclo de vida das regiões E das proeminências, pés colados, campo↔
  intensidade, flare↔proeminência, rotação carregando tudo.
- QA de proeminência: `qa-prom-orbit` (mira em malha fechada, loga a
  posição de tela do alvo — o inspetor DEVE usar essas coordenadas).
- Todo julgamento visual é feito ABRINDO as imagens (subagente), nunca
  por estatística cega.

## ECONOMIA DE CONTEXTO (obrigatório)

A janela principal SÓ decide, edita shader/JS e commita. Subagentes
fazem: baterias de captura, inspeção de imagens, profiling, auditorias
de código longas. Um subagente por bateria; paralelize independentes;
vereditos estruturados curtos (sem despejo de imagem/log na janela
principal). Fan-outs grandes (auditoria, varreduras multi-feature):
use o Workflow tool.

## FERRAMENTAS

tools/{shot,qa-elements,qa-motion,qa-controls,sweep,qa-prom-orbit}.js
+ tools/{analyze,motion-check}.py (NODE_PATH=/opt/node22/lib/node_modules;
`pip install pillow` se faltar). Hooks de QA em `window.__solInfo`:
state, setView, setRotSpeed, prominences, promLife, setPromLife,
promField, forceFlareAt, holdPromAgit, projectProm — adicione novos
hooks quando o QA precisar medir algo novo (ex.: perf()).
Sob SwiftShader: screenshots levam 10-35 s, o tempo simulado corre
~10-20× mais devagar (delta capped) e leituras de matriz podem ser
obsoletas — congele a rotação e use os hooks determinísticos.

## INTEGRAÇÃO

~15 iterações ou resumo honesto de bloqueios. Ao encerrar: PR para
`main` e MERGE (permissão do dono já concedida; nada valioso fica em
branch `claude/*`).

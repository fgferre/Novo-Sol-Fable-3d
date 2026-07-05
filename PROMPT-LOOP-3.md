# Prompt: loop autossustentável de fidelidade vs Sol real (GONG)

Missão standalone (executada por rotina agendada ou manualmente): evoluir
`./sol-3d.html` (Sol 3D em H-alfa, Three.js, arquivo único) comparando com
o Sol REAL de hoje e com as refs do repositório, num loop com orçamento
limitado por execução.

## Setup por execução

1. Branch de trabalho: crie/reutilize `claude/loop3-<data>` a partir do
   `main` mais recente.
2. Baixe a imagem GONG H-alfa full-disk mais recente disponível
   (diretório do dia em `https://gong2.nso.edu/HA/hag/AAAAMM/AAAAMMDD/`,
   arquivos `*.jpg`; use ~meio-dia UT do último dia com dados) para o
   scratchpad como `ref-live.jpg`. NÃO commitar essa imagem (o repositório
   já tem ref-06/ref-07 permanentes do GONG).
3. Ferramentas prontas (NODE_PATH=/opt/node22/lib/node_modules;
   `pip install pillow` se faltar): `tools/shot.js`, `tools/qa-elements.js`
   (aceita HTML alternativo), `tools/analyze.py` (8 gates A-H),
   `tools/qa-motion.js` + `tools/motion-check.py`, `tools/qa-controls.js`,
   `tools/sweep.js`, `tools/qa-prom-orbit.js`.

## Loop (máx. 3 iterações por execução — orçamento diário)

1. Capture TUDO (shot + qa-elements + analyze + motion + controls; sweep
   1x por execução) e ABRA as imagens.
2. Compare com `ref-live.jpg` (Sol de hoje), `reference/images/ref-01..07`
   e o checklist de 9 features do PROMPT-LOOP-2.md. Avalie também o
   BACKLOG DE OPORTUNIDADES abaixo.
3. Liste desvios, ordene do pior; corrija SÓ o pior com mudança pequena e
   focada — física antes de cosmética; visualize canais de debug numa
   CÓPIA (`debug-*.html` já está no .gitignore) antes de calibrar às cegas.
4. Commite cada iteração com mensagem descritiva; push na branch.

## Backlog de oportunidades (das refs GONG full-disk)

- Filamentos grandes com BARBS (pés laterais saindo do canal principal).
- Distribuição de tamanho de proeminências: típicas baixas (0.03-0.08 R),
  gigantes raras (hoje todas são grandes).
- Textura de fibrilas mais fina na escala do disco cheio.
- Grupos de manchas: umbras múltiplas pequenas aglomeradas (ref-07), não
  um só círculo por polo.
- Rede cromosférica (bright points) mais evidente no sol calmo.

## Invariantes (NUNCA violar)

- Arquivo único sem rede em runtime; controles intactos (qa-controls);
  zero erros de console; retrato enquadrado; física existente nunca
  removida, só aprofundada; gates A-H todos PASS ao final.
- Dimensões: manter faixas observacionais comentadas no código (umbras
  0.005-0.086 R; arcos ápice ≤ ~200 Mm; etc.).

## Encerramento por execução

- Se houve melhoria: abra PR da branch para `main` com resumo honesto,
  screenshots de antes/depois e métricas — e NÃO faça o merge: o dono
  revisa e mergeia (execuções automáticas não se auto-aprovam).
- Se NADA melhorou (tudo PASS e sem desvio corrigível pequeno): não
  commite ruído; apenas registre no resumo que o estado está estável e
  não abra PR.
- Se algo quebrou e não couber no orçamento: reverta a iteração quebrada
  (git revert/reset) antes de encerrar — nunca deixe a branch pior.

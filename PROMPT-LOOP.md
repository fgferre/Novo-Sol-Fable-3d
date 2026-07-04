# Prompt: loop de fidelidade do Sol procedural vs fotos reais

Copie o texto abaixo para iniciar uma nova conversa sem contexto:

---

Missão: iterar `./sol-3d.html` (simulação 3D do Sol em H-alfa, Three.js,
arquivo único autocontido) até ficar fiel às fotos reais em
`./reference/images/` — em TODOS os ângulos e níveis de zoom.

Alvo visual: `ref-01` a `ref-05` são fotos reais do Sol em H-alfa.
Atenção: `ref-04` e `ref-05` estão com tons INVERTIDOS (céu claro);
`ref-00` é um render antigo — ignore-a como alvo.

Ferramentas prontas (Playwright + Chromium já instalados; use
`NODE_PATH=/opt/node22/lib/node_modules`; se `analyze.py` reclamar de
PIL, rode `pip install pillow` antes):
- `node tools/shot.js <dir>` — screenshots desktop, retrato e zoom.
- `node tools/qa-elements.js <dir>` — capturas dirigidas por elemento
  (limbo, mancha centrada, proeminência no limbo, fibrilas em zoom
  máximo) usando os ganchos `window.__solInfo` do app.
- `python3 tools/analyze.py <dir> reference/images/ref-01-fibrilas-mancha.jpeg`
  — métricas objetivas (limbo, espículas, umbra, plage, coerência de
  fibrilas) com critérios PASS/FAIL derivados das refs.
- `node tools/qa-controls.js` — controles não podem regredir.

Loop obrigatório em cada iteração:
1. Capture: `tools/shot.js` + `tools/qa-elements.js` e, além disso,
   varra ângulos e zooms intermediários (arraste/rode a câmera via
   `__solInfo.setView`) — o Sol precisa convencer em qualquer vista,
   não só nas três padrão.
2. ABRA as capturas e compare lado a lado com cada ref no nível de zoom
   equivalente. Rode `tools/analyze.py`.
3. Liste as diferenças, ordene pela pior, corrija SÓ a pior com uma
   mudança pequena e focada no código.
4. Repita até: analyze.py 6/6 PASS E nenhuma diferença estrutural
   visível em nenhum ângulo/zoom, sem regressões nos demais.

Invariantes: arquivo único sem rede; controles atuais (arraste com
inércia, pinça, scroll, teclado, duplo clique) intactos — valide com
qa-controls.js; enquadramento correto em retrato; zero erros de console;
física existente pode ser melhorada, nunca removida.

Se após ~15 iterações não convergir, pare e escreva um resumo honesto
do estado e dos bloqueios.

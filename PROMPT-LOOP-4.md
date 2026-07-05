# Prompt: loop de CONEXÃO FÍSICA + ciclo de vida dos fenômenos

Missão: evoluir `./sol-3d.html` para que TODOS os fenômenos sejam
conectados fisicamente, animados em tempo real e com ciclo de vida —
nada flutua, nada é estático, nada existe isolado.

Bug evidenciado (screenshot do dono): arco de plasma FLUTUANDO no limbo
(pés sem contato com a cromosfera — vão visível sob a base) e parecendo
estático, sem animação de surgimento.

Checklist de conexões (cada uma exige reality check dedicado):
1. Pés dos arcos/proeminências COLADOS na cromosfera em qualquer ângulo
   (revisar corte `uSag` e base dos cartões; zero vão).
2. Ciclo de vida completo: proeminência NASCE (fios emergem crescendo da
   superfície), vive (drena/respira) e COLAPSA/erupciona — nunca pop-in;
   reuse `lifeEnvelope`/fases como nas regiões ativas.
3. Proeminência ↔ filamento: âncoras nas linhas de inversão do Br
   evoluído JÁ existem — aprofunde: intensidade da proeminência deve
   seguir a força local do campo (bFieldJS) ao longo da vida.
4. Flare ↔ proeminência: flare numa região madura agita/ergue a
   proeminência ancorada mais próxima (interação visível).
5. Tudo gira com o Sol e evolui: verificar com qa-prom-orbit (ângulos e
   instantes) que nada fica fixo no espaço nem congelado no tempo.

Regras do loop (as mesmas do PROMPT-LOOP-2.md — leia os invariantes de
lá): capture TUDO por iteração, ABRA as imagens, corrija SÓ o pior
desvio com mudança pequena (física antes de cosmética; debug em cópia
`debug-*.html`), commite e pushe cada iteração na branch designada,
gates A-I sempre PASS, ~15 iterações ou resumo honesto de bloqueios.

ECONOMIA DE CONTEXTO (obrigatório): delegue a subagentes (Agent tool)
os fluxos pesados — rodar baterias de captura/QA e INSPECIONAR as
imagens, devolvendo só veredito estruturado por feature (PASS/FAIL +
1 frase + arquivo da evidência); a janela principal só decide, edita o
shader e commita. Um subagente por bateria; paralelize quando
independentes.

Ferramentas: tools/{shot,qa-elements,qa-motion,qa-controls,sweep,
qa-prom-orbit}.js + tools/{analyze,motion-check}.py
(NODE_PATH=/opt/node22/lib/node_modules; `pip install pillow` se faltar;
qa-elements/sweep/qa-prom-orbit aceitam HTML alternativo de debug).

Integração: ao encerrar, PR para `main` e MERGE (permissão do dono já
concedida; nada valioso fica em branch `claude/*`).

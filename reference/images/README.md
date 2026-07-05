# Referências de imagem

Imagens de referência visual para a evolução da simulação 3D do Sol (`reference/sol3d.html`). As imagens `ref-01` a `ref-05` são astrofotografias solares na linha H-alpha (cromosfera), que mostram o nível de detalhe e as estruturas que queremos aproximar no render.

| Arquivo | Descrição |
| --- | --- |
| `ref-00-render-atual.jpeg` | Estado atual da simulação (`sol3d.html`): esfera completa com granulação, regiões ativas claras e uma proeminência no limbo. Ponto de partida para comparação. |
| `ref-01-fibrilas-mancha.jpeg` | Close da cromosfera com uma pequena mancha solar ao centro, cercada por fibrilas — os "fios" varridos que seguem o campo magnético. Referência para textura fina da superfície. |
| `ref-02-filamento-limbo.jpeg` | Filamento escuro e alongado visto contra o disco, perto do limbo. Mostra a curvatura do disco e o escurecimento em direção à borda (limb darkening). |
| `ref-03-filamentos-plage.jpeg` | Região ativa com plage (áreas brilhantes), pequena mancha e vários filamentos escuros serpenteando sobre o disco. Boa referência de composição de estruturas. |
| `ref-04-proeminencia-invertida.jpeg` | Proeminência em leque no limbo, em imagem com tons invertidos (céu claro, Sol escuro). Referência de forma e ramificação das proeminências. |
| `ref-05-limbo-espiculas-invertido.jpeg` | Limbo solar com espículas e pequenas proeminências, também em tons invertidos, com região ativa visível no disco. Referência da "franja" irregular do limbo. |

Observações:

- As imagens invertidas (`ref-04`, `ref-05`) são um estilo comum em astrofotografia H-alpha para realçar detalhes; ao usá-las como referência de cor, considerar a paleta invertida.
- Estruturas a evoluir na simulação a partir dessas referências: fibrilas/textura direcional seguindo campo magnético, filamentos escuros sobre o disco, espículas no limbo e proeminências mais ramificadas.

## Referências científicas full-disk (GONG/NSO)

| Arquivo | Descrição |
| --- | --- |
| `ref-06-gong-fulldisk-recente.jpg` | Full-disk H-alfa NSO/GONG (El Teide, 2026-07-04). Sol calmo: disco tonalmente quase plano, filamentos finos esparsos, plage nas RAs do limbo leste, proeminências pequenas. |
| `ref-07-gong-fulldisk-maximo.jpg` | Full-disk H-alfa NSO/GONG (Big Bear, 2024-10-09, máximo solar). Filamento gigante com barbs, grupos de manchas com umbras MINÚSCULAS na escala do disco (~0.005-0.01 R), plage extensa. |

Atribuição: dados do GONG (Global Oscillation Network Group), programa do
NSF/NSO operado pela AURA; cortesia NSO/AURA/NSF (halpha.nso.edu).

Aprendizados-chave dessas refs (escala de disco inteiro):
- Umbras reais são pontos: 3.5-60 Mm (0.005-0.086 R de diâmetro).
- Filamentos grandes têm BARBS (pés laterais), não são cobras lisas.
- O disco é tonalmente MUITO plano; a textura fina é sutil.
- Proeminências do dia-a-dia são baixas (0.03-0.08 R); gigantes são raras.

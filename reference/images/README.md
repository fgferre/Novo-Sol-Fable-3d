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

## Referências da coroa solar (Fase 4)

| Arquivo | Descrição |
| --- | --- |
| `ref-09-eclipse-coroa.jpg` | Eclipse total de 2017-08-21 (Madras, Oregon; NASA/Aubrey Gemignani, `NHQ201708210100`, images.nasa.gov). Coroa em luz branca na fase descendente do ciclo: feixes de streamers bem separados (NE, NW, SW e S), plumas polares finas e retas, base da coroa contínua e saturada colada ao limbo, cromosfera rosada aparecendo em pontos do limbo. |
| `ref-10-lasco-c2.jpg` | Coronógrafo SOHO/LASCO C2, 2026-07-11 03:00 UT (soho.nascom.nasa.gov, `data/realtime/c2/1024/latest.jpg`). Atividade alta: streamers radiais em quase todas as latitudes, material brilhante de CME no quadrante NW. O disco oclusor cobre até ~2.2 R☉ (círculo branco = 1 R☉); campo de visão ~6 R☉. |
| `ref-11-buraco-coronal.jpg` | SDO/AIA 193 Å, 2017-03-28 12:10 UT (sdo.gsfc.nasa.gov, arquivo `20170328_121029_1024_0193.jpg`). Buraco coronal gigante ancorado no polo sul e estendendo-se em arco até latitudes médias no lado oeste: interior quase preto na escala da imagem, bordas irregulares/dedadas, pontos brilhantes isolados dentro do buraco. Regiões ativas brilhantes no hemisfério norte para contraste. |
| `ref-12-eclipse-maximo.jpg` | Eclipse total de 2024-04-08 (Cleveland, Ohio; NASA/GRC/Jordan Salkin, `GRC-2024-C-02639`, images.nasa.gov). Coroa no MÁXIMO solar: "pétalas" de streamers em todas as latitudes, silhueta quase circular/cheia — comparar com `ref-09` (fase descendente: coroa assimétrica, feixes discretos + plumas polares). Proeminências rosadas visíveis no limbo E e S. |

Atribuição: fotos de eclipse NASA (domínio público — conteúdo NASA não tem
copyright); SOHO/LASCO cortesia do consórcio SOHO (projeto ESA/NASA, uso
livre com crédito); SDO/AIA cortesia NASA/SDO e equipe científica AIA
(domínio público NASA).

Aprendizados-chave para a coroa raymarched:

- Forma vs ciclo: no mínimo/fase descendente a coroa é assimétrica —
  streamers concentrados em latitudes baixas/médias + plumas polares finas
  (ref-09); no máximo é "cheia", com streamers em todas as latitudes e
  silhueta quase redonda (ref-12).
- Helmet streamers: base larga (~30-40° de largura angular no limbo) que
  afunila em cúspide por volta de ~1.5-2.5 R☉ e continua como haste fina e
  radial; no C2 (ref-10) as hastes seguem visíveis até a borda do campo
  (~6 R☉).
- Gradiente de brilho brutal: a coroa interna (< 1.3 R☉) satura na foto
  enquanto a externa some no fundo do céu em ~2-3 R☉ — queda de brilho de
  várias ordens de magnitude por R☉; o brilho total da coroa é ~1e-6 do
  disco (só visível com o disco ocultado).
- Plumas polares: raios finos, retos e curtos saindo dos buracos coronais
  polares, levemente divergentes (seguem o campo aberto), bem mais fracas
  que os streamers equatoriais.
- Buracos coronais (ref-11): em EUV são regiões QUASE PRETAS com bordas
  irregulares e pontos brilhantes internos; ocupam frações grandes do disco
  (o de ref-11 vai do polo sul até ~30°S ao longo de ~120° de longitude).
  Acima deles a coroa em luz branca fica escura (é de onde saem as plumas).
- Textura fina: a coroa não é névoa lisa — é feita de raios/filamentos
  radiais finos e sobrepostos (visível em ref-09 e ref-10); ruído radial
  fino sobre a densidade base vende o efeito.

## Referências de erupção/CME (Fase 5)

| Arquivo | Descrição |
| --- | --- |
| `ref-13-lasco-c2-cme-fluxrope.jpg` | SOHO/LASCO C2, 2002-12-02 19:26 UT (via NASA on The Commons / Wikimedia Commons). CME de flux-rope no limbo NW: a casca helicoidal do rope lê como LAÇOS circulares aninhados e brilhantes, com cavidade mais escura por dentro e material denso na base; segundo evento menor no SW. A referência-mãe da morfologia da casca do CME. |
| `ref-14-proeminencia-eruptiva-stereo.jpg` | STEREO/EUVI 304 Å, 2008-09-29 (NASA/STEREO, Wikimedia Commons, domínio público). Proeminência ERUPTIVA no limbo NW: o material frio arqueia, alonga e escapa como uma cauda fiapenta — o "núcleo denso" das CMEs de três partes é exatamente este material. Referência das partículas do ejecta e do desprendimento. |

Atribuição: SOHO/LASCO cortesia do consórcio SOHO (ESA/NASA, uso livre com
crédito); STEREO cortesia NASA (domínio público).

Aprendizados-chave para a erupção (Fase 5):

- CME de três partes (ref-13): FRENTE brilhante (a casca comprimida),
  CAVIDADE escura (o interior rarefeito do rope) e NÚCLEO denso (material
  de proeminência) — a hierarquia de brilho é frente ≥ núcleo ≫ cavidade.
- A casca não é uma bolha lisa: lê como fios/laços aninhados que seguem o
  eixo do rope (a textura de fbm ancorada no referencial da bolha).
- Expansão auto-similar: o ângulo do cone se mantém enquanto a frente
  avança; o brilho dilui com a expansão mas a FRENTE continua legível até
  sair do campo (C2 ~6 R☉).
- Thomson: CMEs de limbo são as brilhantes; halo CMEs (de frente) são
  tênues e anulares — o peso sin² do ângulo ao plano do céu é física, não
  estilo.
- Proeminência eruptiva (ref-14): o material NÃO sobe como bloco — alonga
  em fios que se curvam ao longo do caminho, parte escapa e parte drena de
  volta (chuva coronal).

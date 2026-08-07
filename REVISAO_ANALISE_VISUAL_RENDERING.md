# Revisão da análise visual e de rendering

Data: 2026-07-22  
Baseline auditado: `92323e7` (`main`, antes deste patch)  
Relatório de entrada: `codebase_visual_and_rendering_analysis.md` (Antigravity)

## Resultado executivo

O relatório foi tratado como hipótese e cada item foi rastreado até geometria,
consumidores e comportamento runtime. Quatro contratos justificaram correção;
cinco recomendações foram rejeitadas porque o impacto alegado não existe no
pipeline atual ou porque a correção proposta criaria regressão visual.

| ID | Veredito | Decisão |
|---|---|---|
| 1.1 `coronaOuter` | Rejeitado | O depth test é por fragmento. A textura só ganha alfa fora de ~3,43 unidades, além do disco de raio 2,2; esses fragmentos encontram o fundo do `sceneRT` e passam. Desligar depth test não recuperaria um sprite “inteiramente oculto”. |
| 1.2 corpo negro em 6600 K | Parcial, sem bug de UX | A aproximação piecewise tem um pequeno degrau matemático, mas as temperaturas das estrelas são sorteadas uma vez na construção do céu. Não há animação de temperatura nem “color pop” temporal. Suavizar mudaria o baseline sem benefício perceptível demonstrado. |
| 1.3 espículas | Rejeitado | `minDist=3,3`, raio da casca `2,2924` e near plane `0,1`: a câmera permanece ~1,008 unidade fora da casca. `DoubleSide + depthTest:false` faria a camada atravessar o disco. |
| 2.1 ACES/gama | Rejeitado | O composite mantém ACES e AgX em Linear-sRGB e aplica `colorspace_fragment` uma vez. O gate numérico lê `0,18→118`, não `181` (dupla OETF). Aplicar `pow(2.2)` ao ACES escureceria novamente o ramo correto. |
| 2.2 alfa do bloom | Parcial, corrigido | RGB estava correto e é o único canal consumido, portanto não havia artefato visual atual. O alfa realmente somava a cada upsample. Custom blending agora preserva RGB bit a bit e mantém o alfa de destino. |
| 3.1 renascimento magnético | Confirmado, corrigido | A região mudava de posição com piso de 3% de carga. O lifecycle agora respeita o envelope até zero; a relocação medida muda a geração e a direção com `w=0`. |
| 3.2 crossfade do bake | Rejeitado | As oito fatias escrevem um alvo ainda não publicado. O swap ocorre somente depois do bake completo e o fade contínuo usa o período medido. Misturar por `bakeStep/8` exibiria uma textura parcialmente escrita. |
| 4.1 orientação/zoom | Confirmado, corrigido | O clamp apagava a razão lógica: em QA, 390×844 → 844×390 → 390×844 mudava `camDist` de 4,8495 para 7,1415. A razão pré-clamp agora é preservada e o round-trip volta a 4,8495. |
| 4.2 drawer mobile | Confirmado e ampliado | Além do texto sob o vidro, o botão rotacionado chegava a `x=-4px`. O drawer reserva uma faixa segura de 68 px, respeita safe areas e oculta suavemente título/dica em telas estreitas. |

## Implementação

- `src/main.js`: preservação independente das razões de `camDist` e
  `targetCamDist`, incluindo clamps mínimo e máximo.
- `src/sim/activity.js`: força magnética segue `lifeEnvelopeEased` até zero.
- `src/post/pipeline.js`: upsample do bloom usa fatores separados para RGB e
  alfa; o framebuffer final permaneceu pixel-idêntico.
- `src/ui/panel.js`: largura responsiva segura, safe areas, estado visual no
  elemento raiz e fallback sem animação para `prefers-reduced-motion`.
- `src/debug/solinfo.js`: sonda determinística do lifecycle de regiões.
- `tools/qa-visual-integrity.js`: novo gate runtime para orientação, drawer e
  renascimento magnético; integrado a `qa:ci`.

## Evidência de QA

- `npm test`: verde (build normal + single, lint, controles, estado, novo gate,
  Bloom, tempo, eventos, efeitos sutis, educação, i18n, ajuda, tour e paridade).
- `npm run qa:phase3`: verde em todos os contratos do ciclo solar.
- `npm run qa:colorpatch`: `0,18→118`, `0,0031308→10`, preto `0`, branco `255`;
  OETF sRGB única confirmada.
- Paridade determinística: 0 pixels diferentes em
  `desktop-fit`, `desktop-a1-z60`, `desktop-a2-z35`, `desktop-a3-z15` e
  `portrait-fit`.
- Captura do drawer corrigido: `out/visual-integrity/mobile-panel.png`.

## Critério de exclusão

Não foram aplicadas mudanças apenas porque uma propriedade estava omitida ou
uma fórmula parecia suspeita. Cada alteração precisava demonstrar consumidor,
estado alcançável e impacto. Isso evitou três regressões propostas pelo relatório:
espículas atravessando o Sol, ACES relinearizado indevidamente e crossfade de
uma textura de cromosfera ainda incompleta.

# Baselines "museu" — canônicas do gate

## Origem

Capturas do workflow `regen-baselines` (run 29664836522, ubuntu/SwiftShader,
branch museu/pr4-sol-completo) — o ambiente do próprio gate, pela regra da
série Museu (incidente PR-1, ver `docs/SERIE-MUSEU.md`). Prova de
determinismo multiplataforma: as capturas do CI deram **0 px de diff (com
máscaras de texto)** contra as capturas Windows do desenvolvimento — o
render da cena museu completa é bit-idêntico entre plataformas.

## Query exata

Passada ao `tools/parity.js` via `--query` (vence os pins históricos do
det, que ficam ANTES na URL — a última ocorrência ganha no parse):

```
spots=1&loops=0.55&fprom=0.55&cme=0.9&cvol=0.5&burst=0.55&adapt=0.55&disp=0.4&hal=0.45&shimmer=0.45
```

Comando completo (o mesmo do passo "Paridade museu" do `qa.yml`):

```
node tools/parity.js qa-out-museu --file dist-single/index.html --query "spots=1&loops=0.55&fprom=0.55&cme=0.9&cvol=0.5&burst=0.55&adapt=0.55&disp=0.4&hal=0.45&shimmer=0.45"
node tools/imgdiff.js qa/baselines-museu qa-out-museu --max-frac 0.001 --out qa-diff-museu --mask 0,0,620,130 --mask 0,-90,9999,90
```

## Propósito

A paridade histórica (`qa/baselines`) protege o Sol "cru" (det puro, knobs
pinados em 0). A partir do PR-4 os defaults det-aware ligam os fenômenos e o
cinema acoplado a eventos no modo normal — esta família protege a cena que
o VISITANTE realmente vê: os mesmos 5 enquadramentos determinísticos, com os
knobs do museu religados por cima do det. Estabilidade provada no PR-4:
duas execuções locais consecutivas deram 0 px de diff em todos os shots com
`--max-frac 0` (máscaras de texto aplicadas).

## Como regenerar (caminho oficial)

1. GitHub → Actions → "Regenerar baselines" → Run workflow, preenchendo o
   input `query` com a query exata acima.
2. Baixar o artifact `baselines-regeneradas` e commitar os PNGs de `qa-out/`
   neste diretório (`qa/baselines-museu/`).
3. Mudança deliberada de visual nesta família segue a mesma regra da
   histórica: prova cirúrgica de confinamento do diff.

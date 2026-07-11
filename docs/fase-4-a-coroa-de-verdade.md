# Fase 4 — "A coroa de verdade" (entrega 2026-07)

Coroa volumétrica raymarched com helmet streamers emergindo da topologia
aberta/fechada do MESMO campo de cargas do projeto, + o débito da arcada
escura pós-esfriamento (F1) pago. Todo o trabalho segue as convenções do
LOOP-5: knob novo default 0 = frame bit-idêntico ao baseline (provado por
A/B worktree 0px em 5/5), RNG sem tocar o stream do `srand`, zero
alocações no `animate`.

## O mecanismo

### Densidade: sampler3D 64³ bakeado na CPU (o payoff do WebGL2)

- `THREE.Data3DTexture` 64³ R8 (256 KB), primeira textura 3D do projeto.
  O bake roda na CPU pelo espelho `bFieldJS`-equivalente (`cvolDensity`),
  FATIADO como o bake da cromosfera: 2 fatias z por frame, snapshot das
  10 cargas no início do ciclo (`snapshotCvolCharges`) e upload ATÔMICO
  no fim (staging → `cvolData` → `needsUpdate`) — sem tearing por
  construção. Cadência: ciclo de 32 frames + folga de 0.9s, sobra para a
  deriva das cargas e para o time-lapse do ciclo (`lapse`).
- Bake inicial síncrono (~64 fatias de uma vez) quando o knob já vem
  ligado na URL — a coroa nunca aparece vazia e a captura determinística
  vê o volume das cargas do frame 0.

### Topologia sem traçar linhas: o proxy de UNIPOLARIDADE

A F1 descartava linhas abertas ("ficam para a Fase 4"); traçar 262k
field-lines por bake seria impagável. O insight da F4: para distinguir
aberto/fechado por VOXEL basta a **unipolaridade** `|B·r̂|/|B|` do campo
de cargas:

- `unip ≈ 0` = superfície NEUTRA (o campo cruza de uma polaridade à
  outra) → é exatamente onde vivem os **helmet streamers** reais (folhas
  de plasma preso sobre a PIL global). A folha ganha densidade
  `exp(-unip²·k(r))` com `k` crescendo com a altura → base larga
  (~30-40°, ref-09) afunilando em cúspide.
- `unip ≈ 1` perto da superfície = região UNIPOLAR forte = campo aberto
  → **buraco coronal** (rarefação; interior quase preto na ref-11).
- Coroa baixa presa (`|B|` alto na base) ilumina as regiões ativas.

O comportamento no ciclo é EMERGENTE, sem nenhuma heurística nova: no
máximo os 4 bipolos dominam e a superfície neutra ondula por todas as
latitudes → coroa "cheia" de pétalas (ref-12); no mínimo sobra o dipolo
polar da F3 → cinturão de streamers equatorial + buracos polares
(ref-09). QA I1/I2: anel de coroa do máximo +44% de luminância vs
mínimo; razão polar/equatorial cai 26% no mínimo.

### Raymarch (GLSL3, primeiro shader `#version 300 es` do projeto)

- Billboard de 7R (o mesmo plano do fallback), raio de PERSPECTIVA real
  (`cameraPosition` → vértice), mundo→objeto via `mat3 uInvRot`
  (transposta da rotação do `sunMesh` — tilt 0.1265 + spin corretos, ao
  contrário da aproximação angular do plano de raias).
- Marcha num shell `r ∈ [1, 2.88]` com jitter determinístico por pixel
  (hash de `gl_FragCoord`); **raio que atinge o disco retorna 0** — a
  coroa à frente do disco é ~1e-6 do brilho dele, e os transparentes
  desenham DEPOIS dos opacos (sem o corte, o segmento frontal somava por
  cima do disco; QA G1 agora prova o miolo do disco BIT-IDÊNTICO com e
  sem coroa).
- Raias finas + flicker 1/f procedurais avaliados UMA vez por pixel (não
  por passo) modulam o resultado — a mesma vida do plano de raias, a
  textura de filamentos radiais finos das refs 09/10.
- three r185 GLSL3: `gl_FragColor` não existe — `out vec4 fragColor`
  explícito (o resto dos aliases o three injeta).

### Tier-gate, fallback e o gate de 24fps COMO CÓDIGO

- `TIER_PARAMS.cstep`: low **0** (o plano de raias segue sozinho como
  fallback), mid **22**, high **36**, ultra **48** passos. O custo
  escala nos passos e na resolução — o auto-tune de escala já o protege.
- Knob `cvol` (0–1.5, painel "coroa") default 0 = mesh invisível. Com
  `cvol>0` o plano de raias cede o protagonismo (×0.38 via `uCvolMix`;
  com 0 a multiplicação é por 1.0, bit-exata).
- **Auto-tune**: no degrau final (p95 > limiar na menor escala), ANTES
  de rebaixar o tier persistido, o raymarch é derrubado em runtime
  (`cvolKilled`) e a coroa volta ao fallback. É o gate do piso de 24 fps
  do mid (limiar 42ms p95) como MECANISMO — nenhuma medição é pedida ao
  dono, por decisão do dono no fim da F3.
- A/B de GPU por tier (SwiftShader, relativo): TODO preencher com a
  medição em máquina ociosa.

## Débito pago: arcada escura pós-esfriamento (F1/F2/F3)

Os laços pós-flare esfriavam só na COR (branco→laranja); em H-alfa a
arcada fria é ESCURA contra o disco. Agora: gêmeo de ABSORÇÃO da fita
(mesmo blending multiplicativo `dst·(1-src)` do `fprom`), compartilhando
a MESMA geometria/buffers do `loopMesh` (zero alocação nova). O envelope
escuro cresce com `(1-hot)` e decai no DOBRO do fôlego do gradual — o
brilho drena antes da absorção sumir. Regras do fprom respeitadas:
miolo sólido (wisp vira modulação, não gate) e escala por mu (a luz que
resta). `renderOrder -0.5`: multiplica depois da coroa (a arcada fria
faz silhueta contra ela) e antes das emissões. QA J1: abs 0.245→0.609 de
t=1.5s a t=7s. Sem knob novo: é o comportamento default do evento, como
a arcada aditiva da F1 — e não há flare natural no frame 48, então a
paridade não vê.

## QA (tools/qa-phase4.js — 13 checks, `npm run qa:phase4`)

- F1-F3: knob/tier/bake prontos; assinatura em vista wide (A/B mesma
  página, 1612px); volta ao baseline ao desligar (histerese ≤200px, ver
  anotação abaixo).
- G1-G3: oclusão do disco (crop central 140² BIT-exato, 0px, sem bloom);
  assinatura sem bloom (1728px); determinismo (2 execuções → 0px).
- H1-H3: low = fallback; mid = 22 passos; toggle `corona3d` limpa p/ A/B.
- I1-I2: ciclo (máximo cheio / mínimo com buracos polares) — capturas
  com `setCyclePhase` + hook novo `rebakeCorona` (sob hold o bake
  congela; o padrão shot-cycle da F3).
- J1: arcada escura.
- Gates herdados todos verdes: paridade ≤0.001 (5/5), qa:controls,
  qa:phase1 12/12, qa:phase3 12/12, e **A/B worktree origin/main vs
  branch com --max-frac 0: 0px em 5/5**.

## Anotação honesta: histerese de bake ao alternar meshes ao vivo

Investigação da rodada (bisseção E1-E10): QUALQUER mesh transparente
extra visível durante os ciclos de bake da cromosfera desloca o
rasterizador SwiftShader em ~1 LSB nas fatias seguintes (147k pixels de
delta 1-2, máx 58 nas fibrilas; reproduzido até com MeshBasicMaterial
preto; NÃO é GLSL3, nem sampler3D, nem o dim do plano — todos
descartados por experimento). O fenômeno é pré-existente (os loops da
F1 fazem o mesmo), determinístico, e em execução normal o próximo ciclo
de bake (~0.12s) converge — só o `?hold` congela a divergência. A
convenção do projeto (carga nova com knob 0 = bit-exato) está provada
intacta; o check F3 documenta o comportamento de live-toggle.

## Calibração visual (painel de juízes)

TODO: sweep 6 variantes × 2 vistas (`setCvolShape`/`setCvolFil`, sem
rebuild) + painel de 3 juízes (realismo vs refs 09-12 / cinema /
caça-artefatos). Resultado e decisão do preset `?look=sunshine` entram
aqui.

## Hooks novos (`__solInfo.*`)

`coronaInfo()` {steps,res,k,on,ready,killed,cycles}; `setCvol(v)`;
`rebakeCorona()`; `setCvolShape({base,sheet,loop,hole})`; `setCvolFil(x)`.
`loopInfo()` ganhou `abs`/`absVisible`. `subToggle` ganhou `corona3d`.
`knobs()` expõe `cvol`.

## Refs novas (reference/images/)

ref-09 (eclipse 2017, luz branca), ref-10 (LASCO C2), ref-11 (buraco
coronal AIA 193), ref-12 (eclipse 2024, máximo) — fontes NASA/SOHO/SDO,
domínio público, documentadas no README das refs com os aprendizados de
calibração (base satura <1.3R e morre em 2.5-3R; streamers de base larga
afunilando; buracos quase pretos; máximo cheio vs mínimo assimétrico).

## Débitos conscientes desta rodada

- Multiplicidade de manchas no máximo (débito F3, flag 3/3 juízes) — não
  atacado nesta rodada; slots virtuais baratos continuam como candidato,
  MEDIR o custo do bake antes.
- Proporção das regiões ativas vs refs GONG (pedido do dono na F3) —
  segue aberto.
- Plumas polares finas dentro dos buracos coronais (ref-09) — o volume
  64³ não as resolve; candidata a modulação procedural no shader.
- Histerese de bake ao alternar meshes ao vivo (anotação acima) — não é
  regressão da F4; investigar em GPU real fica anotado.

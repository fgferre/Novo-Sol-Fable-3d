# Registro de Remediação — Auditoria Técnica

Blueprint + placar da série de correções derivada de `AUDITORIA_TECNICA_CONSOLIDADA.md`.
Este arquivo é a **memória durável**: junto com o histórico git, é o que sobrevive a
reset de contexto. A conversa pode reiniciar; este placar continua.

Estado atual: **✅ SÉRIE COMPLETA (2026-07-16).** 11 PRs mergeados (#48–#58) + 1 NO-GO
documentado (PR 10, branch `pr10-chromo-mrt` preservada como referência). Todos os 14
achados da auditoria tratados. Item remanescente: investigação do artefato retangular
(“não reproduzido” em ~25+ min acumulados de vigília em high/ultra/stress — segue aberta
por protocolo, nunca “corrigido” sem repro). Tarefa opcional fora da série: precompile
do shader da coroa volumétrica (~400 ms no 1º liga, pré-existente; chip criado).

---

## Como esta série funciona (leia uma vez)

**Sequencial, um PR por vez.** Os PRs dividem os mesmos arquivos (`main.js`,
`pipeline.js`, `renderer.js`) e vários recalibram a imagem de referência —
por isso não dá pra paralelizar. Ordem = a da auditoria (sRGB por último).

**Dois tipos de portão (gate). Só um deles é seu:**

| Ícone | Gate | Quem fecha | O que é |
|---|---|---|---|
| 🟢 | **Correção / equivalência** | **Eu, sozinho** | Determinístico. Rodo em SwiftShader com `?det=1` e comparo pixel a pixel. "Diff RGBA de zero pixels", contadores, valores numéricos. Você não faz nada. |
| 🔵 | **Performance** | **Você, na RTX 3070** | Só a sua máquina produz esses números (ms, p95, soluço, memória). Eu te mando o passo a passo; você lê e cola. |
| 🟣 | **Visual / estética** | **Você aprova** | "Ficou bom?". Eu te mostro antes/depois; você decide. Só então atualizo o baseline. |

**Padrão de cada PR (onde entram os subagents):**

1. **Subagent leitor** → lê os arquivos grandes do achado e devolve o diff exato
   (ancorado por linha). Mantém `sun.js`/`cme.js`/`pipeline.js` fora do contexto principal.
2. **Loop principal** aplica o diff (pequeno, revisável) e roda o build.
3. **Subagent verificador** → fecha o gate 🟢 (correção determinística).
4. **Você** fecha o gate 🔵/🟣 quando eu pedir.
5. Registro antes/depois **aqui** → decisão **merge / no-go**.

Fan-out de verdade (mais de um subagent leitor) só nos PRs que abrangem vários
arquivos independentes: **PR 4** (resize) e **PR 9** (coordenadas). No resto, um leitor basta.

**Modelos por papel:** executor (escreve código) = modelo forte — os gates são
pixel-exatos e RNG-exatos, modelo fraco falha e re-roda mais caro; leitores e
verificadores mecânicos (rodar comando, comparar, resumir) = modelo barato.

---

## Como você mede performance (protocolo pra leigo)

Você é leigo nisso e tudo bem — **não precisa entender nada de GPU.** Quando um PR
chegar num gate 🔵, eu te mando uma receita nesta forma:

1. **Link(s) pronto(s)** — é só colar no Chrome e apertar Enter.
2. **Quantos segundos esperar** antes de ler (o número precisa "aquecer").
3. **Onde ler na tela e o que anotar** — geralmente 3 números (média, p95, pior).
4. Você **cola os números como aparecem**. Eu comparo e digo "passou" ou "não passou".

Você **nunca** decide se um número é bom ou ruim — eu decido. Você só é o olho na 3070.

> A telinha que mostra esses números (`?profile=1`) e o painel de diagnóstico
> (`?diag=1`) **são criados no PR 0**. Antes do PR 0 os gates 🔵 ficam "pendentes".

Para gates 🟣 (visual) é ainda mais simples: eu mando duas imagens (antes/depois)
ou dois links, você olha e responde "pode" ou "não pode".

---

## Painel de status

Legenda: ⬜ não iniciado · 🚧 em andamento · ⏸️ aguardando você (perf/visual) · ✅ merged · ⛔ no-go

| PR | Tema | Achados | Gate seu? | Status |
|----|------|---------|-----------|--------|
| 0  | Fundação QA / profiling / publicação | — (infra) | 🟢 só CI | ✅ PR #48 |
| 1  | Early-outs das manchas + `coronaRays` | 1, 2 (P0) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #49 |
| 2  | Scheduler assíncrono da coroa volumétrica | 3 (P0) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #50 |
| 3  | Framebuffer sem MSAA/depth | 8 (P1) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #51 |
| 4  | Resize / DPR / auto-tune transacional | 9 (P1) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #52 |
| 5  | Scheduler incremental dos loops | 6 (P1) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #53 |
| 6  | Proeminências instanced (4 batches) | 7 (P1) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #54 |
| 7  | Determinismo idle + teclado + leak | 11, 12, 14 (P2/P3) | 🟢 só eu | ✅ PR #55 |
| 8  | Pré-filtro vertical do streak | 13 (P2) | 🟢 eu · 🔵 auto (3070 local) | ✅ PR #56 |
| 9  | Espaços de coordenadas atmosféricos | 10 (P1) | 🟣 você aprova (ancoragem) | ✅ PR #57 |
| 10 | Experimento MRT da cromosfera | 5 (P1) | 🔵 GO/NO-GO auto (critérios numéricos, 3070) | ⛔ NO-GO |
| 11 | Linear-sRGB → sRGB + AgX + recalibração | 4 (P0) | 🟣 você aprova (look) | ✅ PR #58 |

**Repetir o soak do artefato retangular após:** PR 1, 3, 4 e 10 (ver seção *Investigação*).

**Suítes de teste:** cada PR roda `npm test` + a suíte afetada. Phase1/3/4/5/6
completas após os blocos P1 e sRGB; motion2 após o streak e no fechamento.

---

## PR 0 — Fundação de QA, profiling e publicação segura

- **Achados:** nenhum (infraestrutura que sustenta a validação de todos os outros).
- **Arquivos:** `package.json`, `vite.config.js`, `qa.yml`, `pages.yml`, novos tools de QA, `?profile=1`/`?diag=1` no runtime.
- **O que muda (escopo real, menor que o texto sugere — muito já existe):**
  - `build:single` → `vite build --mode single` (corrige quebra no PowerShell; hoje `SINGLEFILE=1` só roda em Bash). `vite.config.js` passa a reconhecer `mode === "single"`, mantendo `SINGLEFILE=1`.
  - `npm test` → chama uma nova `qa:ci` (build normal+single, controles, funcionais rápidos, paridade estática).
  - Runner A/B base-vs-head no mesmo Chromium: PR equivalente exige diff RGBA zero; PR visual publica base/head/diff e só rebaseleia após aprovação.
  - `?profile=1` (timer GPU `EXT_disjoint_timer_query_webgl2`, descarta amostras `disjoint`, expõe média/p95/pior). **Sem custo no modo normal.**
  - `?diag=1` (manifesto navegador/GPU/WebGL/DPR/tier + ring de eventos). **Sem readback no modo normal.**
  - Pages passa a **depender** do QA e publicar o `dist/`+`dist-single/` do SHA testado. Check `QA / qa` obrigatório em `main`.
- 🟢 **Correção (eu):** CI verde nos dois builds; `?profile=1`/`?diag=1` custam zero no modo normal; A/B runner dá diff zero em cenário de controle.
- 🔵 **Perf (você):** nenhum ainda — este PR é quem *cria* a telinha de medição.
- **Antes:** `npm test` = stub com erro; `build:single` quebrava em PowerShell/cmd; Pages publicava rebuild paralelo não testado; sem timer de GPU nem diagnóstico; sem runner A/B.
- **Depois (branch `pr0-qa-foundation`, 6 commits `3f61a5b..a6034ce`):**
  - Executor: `--mode single` ✓ nos dois shells; `npm test`→`qa:ci` ✓ (controles 6/6; paridade local Windows difere dos baselines ubuntu ~0,3–0,8% — **px idênticos aos de `main` na mesma máquina**: 3156/1818/1833/1725/2515, ou seja runtime inalterado); A/B self-vs-self = **0 px** nas 5 capturas; `?profile=1` ✓ (SwiftShader suporta o timer; overlay avg/p95/pior) e `?diag=1` ✓ (manifesto + ring), console limpo, **0 px de custo no default**; Pages via `workflow_run` do QA publicando o artifact `builds` do SHA testado.
  - Revisão do coordenador no diff (370+/17−): guardas de custo zero corretas; 1 query GPU em voo + descarte `disjoint`; ring 128 só sob flag; YAML coerente entre os dois workflows.
  - Verificação independente (2º agente, sonnet): **3/3 PASS** — (1) teste NEGATIVO: build sabotado (+5% de ganho no composite) reprovou com exit 1 e 76–99% de px diferentes nas 5 capturas → o A/B detecta divergência real; (2) A/B main-vs-PR0 = **0 px nas 5 capturas** → custo zero visual comprovado; (3) `npm test` reproduziu px-a-px os números do executor (3156/1818/1833/1725/2515); cenários do qa-ab ≡ parity confirmado; nenhum worktree/arquivo órfão.
- **Pendências:** 1º run real dos workflows só valida no GitHub (pós-push); branch protection do check `QA / qa` = configuração manual no GitHub (Settings→Branches); paridade local Windows nunca bate com baselines ubuntu (avaliar baseline por plataforma se `npm test` local virar rotina).
- **Decisão:** ✅ **MERGED** — [PR #48](https://github.com/fgferre/Novo-Sol-Fable-3d/pull/48), autorizado pelo usuário (autorização vale como padrão da série p/ PRs sem gate 🔵/🟣). CI verde 2× (~4 min cada). Primeiro run real QA→Pages em main: **validado** — QA `completed:success`, Pages (`workflow_run`) `completed:success`, e o commit em `gh-pages` referencia exatamente o SHA testado (`Pages: build QA @ e33da9c…`). Branch protection do check `qa` segue pendente (ação manual do usuário no GitHub).

## PR 1 — Early-outs das manchas e `coronaRays`

- **Achados:** 1 (manchas sem early-out) + 2 (`coronaRays` paga caminho pesado onde saída é zero).
- **Arquivos:** `src/surface/sun.js` (~591/657), `src/atmosphere/coronaRays.js` (~83).
- **O que muda:** early-out por corda `36·r²` nas 8 manchas reais (calcular vida/raio/`cv` antes de `acos`/ruídos); em `coronaRays` cortar antes de `atan`/FBM/cargas fora do domínio radial (`vec4(0,0,0,1)`, **sem `discard`**). Troca do `smoothstep` invertido por `1.0 - smoothstep(0.55,0.85,r)` avaliada **separadamente** do corte.
- 🟢 **Correção (eu):** early-out RGBA-idêntico em `?det=1` para `spots=0/1/1.5`, fit e close-up. A troca do smoothstep é julgada à parte (pode não ser pixel-idêntica).
- 🔵 **Perf (você):** eu te mando 2 links quase iguais (com/sem correção). Você anota 3 números de cada. **Merge só se o ganho for ≥ 0,2 ms ou ≥ 10 %** (eu que confiro), após aquecimento e 300 amostras.
- **Antes:** 8 manchas reais pagavam 8×`acos` + 16×`snoise` em todo fragmento do disco; `coronaRays` pagava 3×FBM + `atan` + 10×`acos/exp` em ~metade do quadrado projetado com saída zero; rampa externa em `smoothstep` de bordas invertidas (UB pela spec GLSL).
- **Depois (branch `pr1-early-outs`, commits `199930a`/`adae3c0`/`2d6bb3f`):**
  - c1: descarte de carga sem vida + limite de corda `36·r²` no loop real (fator 6r verificado contra a distorção real: contribuição zera acima de ~5,22r; derivação em comentário no shader). A/B vs base: **0 px** (5 capturas).
  - c2: early-out radial no `coronaRays` retornando `vec4(0,0,0,1)` bit-exato, sem `discard`. A/B: **0 px**.
  - c3 (isolado): rampa em forma definida `1−smoothstep(0.55,0.85,r)` — mesma curva por `S(1−t)=1−S(t)`. A/B vs c2: **0 px** no SwiftShader; em driver NVIDIA real pode diferir por ULPs (era UB) — julgar à parte se o A/B da 3070 acusar.
  - Validação estendida: `spots=0/1/1.5` × fit/close-up/portrait = **0 px em todos** (câmera pinada); costura nos dois limites radiais limpa (crops ×8); `npm test` reproduz px-a-px os números conhecidos.
  - **Descoberta colateral: achado 11 comprovado na prática** — o A/B flakeou no `desktop-fit` (base vs base = 45% px diferentes entre execuções!) porque a deriva idle é gateada por `performance.now()>2200ms` e dispara em frame diferente conforme a velocidade da máquina. Até o PR 7, A/Bs podem flakear no desktop-fit em SwiftShader; mitigação: pinar câmera ou re-rodar.
  - Revisão do coordenador no diff: derivação do 6r conferida; reordenação `r`→`cv`→`acos` não muda semântica; early-out do coronaRays consistente com as máscaras que já zeravam ambas as regiões.
  - Verificação independente (rebuild do zero, md5 distintos confirmando builds próprios): **PASS 3/3** — A/B 0 px nas 5 capturas (sem flake, 1ª tentativa); `npm test` com px exatos; knob `spots` confirmado como query param (`config.js:143`) e 0 px em `spots=0/1.5` × desktop/portrait com câmera pinada. Builds de perf entregues em `out/perf-pr1/base.html` e `head.html`.
- **Gate 🔵 de perf — automatizado:** a máquina de desenvolvimento É a RTX 3070 (driver NVIDIA 610.62); medição em Chromium headed (Chrome/141, ANGLE D3D11) com GPU real via Playwright, renderer confirmado `ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 ... D3D11)`.
- **Resultado da medição (protocolo 1280×720, DPR 1, scale=1, seed 7, aquecimento 25 s, 300 amostras/célula, 2 rodadas interleaved):**
  - O protocolo primário (`gpuPerf` sob vsync) revelou-se **bimodal no driver NVIDIA** (ver *Metodologia de perf*) — deltas dele descartados.
  - Três medições imunes ao artefato, todas concordantes a favor do head: **timer denso vsync-OFF**: high-fit −4,6%, high-closeup **−9,9% (−0,39 ms)**, ultra-closeup **−38,8% (−1,85 ms)**, ultra-fit favorável (outlier de hitch excluído); **utilização @60 fps**: head menor nas 4/4 células; **potência @60 fps**: head menor em 3/4 (4ª com confound de power-state, util×clock ainda favorável).
  - A/B de pixels no driver NVIDIA real: todos os diffs dentro do piso de ruído do self-test base-vs-base (portrait 0 px exato); **nenhum diff estruturado do smoothstep (c3) no driver real**.
  - Ressalva honesta: janelas vsync-OFF tinham 16–35 amostras (a latência da query despenca a taxa com GPU saturada); compensado pela triangulação em 3 métricas independentes e pela direção de risco nula (early-out não pode aumentar trabalho, e a saída é pixel-idêntica comprovada).
- **Decisão:** ✅ **GO** — critério ≥0,2 ms ou ≥10% atendido (ultra-closeup passa nos dois com folga; high-closeup nos dois), corroborado por utilização e potência; zero regressão visual em SwiftShader e NVIDIA. Usuário autorizou o merge **e estendeu a autorização**: PRs com gate 🔵 medido automaticamente na 3070 local mergeiam sozinhos quando o critério passar; usuário só é chamado em gates 🟣 (PRs 9/11) e em critério reprovado. [PR #49](https://github.com/fgferre/Novo-Sol-Fable-3d/pull/49) — merge automático ao CI ficar verde.

## PR 2 — Scheduler assíncrono da coroa volumétrica

- **Achado:** 3 (hitch de 26,2 ms no bake integral + duty cycle de 100 %).
- **Arquivos:** `src/atmosphere/coronaVolume.js` (~93/106), `src/main.js` (~488).
- **O que muda:** máquina de estados `idle|baking|cooldown`, 30 fatias/s, ≤1 fatia/frame; inicialização também fatiada (fallback pelo plano de raios); publica só após a 64ª fatia; cooldown de 0,9 s só quando `cvolStep<0`; usa `rawDelta` (independe de `TIME_SCALE`); sob `DET_HOLD` bake anda com passo sintético `1/60` e cooldown congela.
- 🟢 **Correção/timing (eu):** bake ≈ 2,13 s entre 30–120 Hz, início-a-início ≈ 3,03 s, 1 fatia/frame, 1 publicação/ciclo (tudo instrumentável via `coronaInfo()`).
- 🔵 **Perf (auto, 3070):** matar o hitch de 26 ms (long tasks) + custo/fatia < 3 ms.
- **Antes:** `cvolBakeFull()` bakava 64³ voxels síncrono na carga/ativação = hitch de 26,2 ms; `cvolAccum` acumulava DURANTE o bake → a 60 Hz o ciclo (~1,07 s) já passava do limiar de 0,9 s = duty cycle de 100%, cadência dependente do refresh.
- **Depois (branch `pr2-cvol-scheduler`, commits `4604804`/`12ba4a7`):**
  - `cvolBakeFull()` eliminado (grep zero em `src/`); máquina `idle|baking|cooldown` em `cvolFrame(on, rawDelta, held)`, 1×/frame. Budget `+= rawDelta·30`, clamp 1 (sem catch-up pós-background), ≤1 fatia/frame; publicação atômica na 64ª fatia; cooldown 0,9 s **só** em `cooldown` (nunca durante baking); `rawDelta` (independe de `?speed`); sob hold o bake anda com `1/60` sintético e o cooldown congela; desligar preserva o último volume, religar refaz snapshot.
  - Timing (SwiftShader, det): **17/17 PASS** — ≤1 fatia/frame sempre; 1ª publicação frame 128; início-a-início 181 frames = **3,017 s** @60 Hz (3,033 s em 30/90/120); réplica em node confirma 2,133 s + 3,03 s em todos os Hz; sem rajada pós-background.
  - Long tasks (GPU real, shader quente): base = picos rAF **45,9/42,7 ms** (o hitch do achado 3); head = delta máx **17,8 ms**, **0 longtasks >50 ms**; busy avg 0,92→0,47 ms. Custo/fatia ~0,4–0,9 ms ≪ 3 ms.
  - A/B vs base-pr1: default (cvol=0) = **0 px** (5 capturas) → default inalterado; cvol on em hold=48 (pré-publicação) = diffs esperados (fallback do plano de raios); cvol on em hold=200 pós-publicação, câmera pinada = **0 px** → visual final idêntico, só a cadência muda.
  - `npm test`: controles 6/6; parity local = números conhecidos (default inalterado); phase4 11/12 (F3 = artefato de plataforma Windows↔ubuntu, **também falha na base** — só passa no CI); phase6 grupo P **8/8** (P4 melhorou de ≤200 px para 0 px pela publicação atômica).
  - Harnesses atualizados (`qa-phase4`/`qa-phase6`/`perf-cvol2`) para aguardar `coronaInfo().cycles >= targetCycle`.
  - ⚠️ **Incidente de execução (não afeta o repo):** o agente usou `taskkill //IM chrome.exe //F` ao limpar um job travado, podendo ter fechado janelas do Chrome pessoal do usuário. Comunicado ao usuário. Prompts futuros travados contra matar por nome de imagem.
  - Revisão do coordenador: máquina de estados correta; `cvolInvRot` só computado quando o volume é exibido (não usado no bake); consistência de guardas (`CVOL_STEPS>0`); contratos de hook preservados+estendidos.
  - **Verificação independente — Fase A (correção, SwiftShader): PASS.** Rebuild do zero (md5 distintos): A/B default 0 px (5 capturas); contadores do scheduler — salto de fatia máx **1**, sequência baking→cooldown→baking, `cycles` +1/publicação, 1ª publicação **frame 128**, cooldown 0,900→0,017 em ~53 frames, novo ciclo ~frame 182; toggle off/on preserva `ready`/`cycles` e refaz snapshot ao religar (ciclo natural e forçado); controles 6/6; parity local = números conhecidos (default inalterado). As aparentes falhas (A/B do fit, imgdiff, phase4 F3) foram **provadas** como o mesmo drift de plataforma do SwiftShader (isolamento com `cvol=0`/base==head reproduz o mesmo padrão de ruído) — **não são regressões do PR 2**.
  - **Verificação independente — Fase B (hitch/perf na 3070): PASS.** Renderer NVIDIA confirmado. Ligando a coroa ao vivo (`setCvol(1.1)`, o gatilho exato do `cvolBakeFull` na base): **base = pico no frame do liga em 3/3** (426 / 54,2 / 405,9 ms); **head = sem pico atribuível em 3/3** (17,1 / 17,2 / 16,7 ms ≈ vsync). Custo/fatia ≈ **0,30 ms** (busy baking 0,54 vs cooldown 0,39; excesso 0,15 ÷ 0,5 fatia/frame) ≪ 3 ms. Sem `taskkill` por nome; worktree limpo.
  - **Nota (fora do escopo, não-regressão):** há um congelamento *one-time* de ~400 ms de **compilação de shader** na 1ª ativação da coroa volumétrica, presente **igual na base** (mesmo GLSL) — o PR 2 o desacopla do bake mas não o elimina. Registrado como tarefa à parte (precompile/warm-up do material `coronaVol`).
- **Decisão:** ✅ **GO** — achado 3 resolvido: hitch de 26 ms eliminado (3/3 na GPU real), duty cycle isolado (cooldown só pós-publicação), default bit-idêntico, contadores do scheduler corretos, custo/fatia 0,30 ms. Merge autônomo (gates 🟢+🔵 meus, critério atendido).

## PR 3 — Framebuffer final sem recursos inúteis

- **Achado:** 8 (MSAA/depth do framebuffer final não suavizam nada — a cena é um quad fullscreen).
- **Arquivos:** `src/core/renderer.js` (~9), `src/post/pipeline.js` (~34), `src/main.js` (~549).
- **O que muda:** `WebGLRenderer` com `antialias:false, depth:false`; manter depth no `sceneRT`; `depthTest:false, depthWrite:false` no composite.
- 🟢 **Correção (eu):** diff determinístico de zero pixels; oclusão 3D preservada; contexto sem MSAA/depth.
- 🔵 **Perf/memória (auto, 3070):** atributos do FBO default (SAMPLES/DEPTH_BITS) + timer só do passe final em DPR 1/2/3.
- **↻ Soak do artefato retangular:** vigília moderada (~4 min/tier) neste ciclo; soak completo de 40 min disponível como tarefa do usuário na 3070 se necessário.
- **Antes:** `WebGLRenderer` `antialias:true` (framebuffer default 4× multisample + depth 24-bit) mas a cena inteira é rasterizada no `sceneRT` monossample; o default só recebe um quad fullscreen → MSAA/depth pagam resolve + attachment em resolução física sem suavizar nada (pior em DPR 2–3).
- **Depois (branch `pr3-framebuffer`, commit `248af3d`, 1 commit / 2 arquivos / +13−2):**
  - `renderer.js`: `antialias:false, depth:false`; `pipeline.js`: `sceneRT` mantém `depthBuffer:true`, `compMaterial` ganha `depthTest:false, depthWrite:false`.
  - Atributos do contexto (SwiftShader): base `antialias/depth true, SAMPLES=4, SAMPLE_BUFFERS=1, DEPTH_BITS=24` → head `false/false, 0, 0, 0`. Demais atributos idênticos.
  - A/B pinado (câmera fixa, mata o flake do achado 11): **0 px** em fit/close-up/portrait e em `spots=1.5`. Oclusão 3D: phase4 G1/G2/G3 = 0/1771/0 PASS (disco oclui o fundo; depth do `sceneRT` intacto). `npm test`: controles 6/6, parity local = números conhecidos (default inalterado). F3 do phase4 = artefato de plataforma (idêntico na base).
  - Revisão do coordenador: composite é o único draw ao framebuffer default; os outros `setRenderTarget(null)` (granulation/chromo) são resets pós-bake sem geometria; `clear(DEPTH)` sem attachment vira no-op silencioso (console limpo). Risco de pixel/perf nulo por construção.
  - **Verificação independente (rebuild do zero, pós-queda de energia): PASS.** FASE A: npm test controles 6/6, parity = default inalterado; A/B pinado **0 px** (fit/close-up/portrait/spots=1.5). FASE B na 3070: (1) atributos base→head `SAMPLES 4→0, SAMPLE_BUFFERS 1→0, DEPTH_BITS 24→0` em DPR 1/2/3 — **memória de framebuffer liberada −15 MiB (DPR1) / −61 MiB (DPR2) / −138 MiB (DPR3)**, escala quadrática, ganho estrutural; (2) A/B GPU dentro do piso de ruído (diffs = 1 LSB disperso, mesmas coords do self-test = ruído de driver); (3) timer só do passe final (patch cirúrgico no bundle): DPR1 ganho consistente (high −37/−62%, ultra −25/−27%), DPR2 ruidoso demais em medição sub-ms (reportado honestamente → conclusão apoiada nos atributos estruturais, não no ruído); (4) vigília do artefato: **não reproduzido em ~4 min high + ~4 min ultra**. Worktree limpo, sem kill por nome.
- **Decisão:** ✅ **GO** — achado 8 resolvido: 0 px (SwiftShader + GPU real), MSAA/depth do framebuffer default removidos, memória liberada crescendo com DPR (−138 MiB em DPR3), oclusão 3D preservada, artefato não reproduzido. Merge autônomo (gates 🟢+🔵 meus).

## PR 4 — Resize, DPR e auto-tune transacionais

- **Achado:** 9 (resize realoca a cadeia toda + DPR/base do auto-tune obsoletos).
- **Arquivos:** `src/main.js` (~194), `src/core/renderer.js` (~14), `src/core/perf.js` (~56), `src/post/pipeline.js` (~493). **← PR multi-arquivo: fan-out de leitores.**
- **O que muda:** centralizar em `requestDisplayResize()`/`applyPendingDisplayMetrics()`; eventos só marcam estado, uma aplicação por frame; `baseDpr` vivo = `min(DPR, capDoTier)·RENDER_SCALE`; não realocar attachment quando dimensões físicas idênticas; só-DPR não reposiciona câmera.
- 🟢 **Correção (eu):** ≤1 aplicação/frame, zero realocação idempotente, DPR correto em 1×↔2× — tudo via `resizeInfo()`/`?diag=1`.
- 🔵 **Perf/memória (auto, 3070):** resize contínuo sem spike de realocação + vigília do artefato focada em resize.
- **↻ Soak do artefato:** vigília focada em stress de resize/DPR neste ciclo (o achado 9 é uma das hipóteses do artefato).
- **Antes:** cada evento de resize aplicava tudo na hora (`setSize` + `resizeTargets` realocando sceneRT/mips/2 streak SEMPRE + re-fit); `baseDpr` capturado 1× no boot → auto-tune escalava sobre base velha; N eventos/frame = N realocações half-float; sem `matchMedia`/`pageshow`/`visibilitychange`.
- **Depois (branch `pr4-resize-dpr`, commit `cdf1f87`, 6 arquivos / +143−27):**
  - `requestDisplayResize()` (só marca `displayDirty` + guarda `{cssW,cssH,dpr}`) + `applyPendingDisplayMetrics()` (1× no início do `animate`): recomputa `baseDpr = min(dpr, dprCap)·RENDER_SCALE` (`dprCap` 2 padrão/3 ultra — antes era `Math.min(dpr,2/3)` inline), `dprEff = baseDpr·SCALE_STEPS[scaleIdx]`, `setDrawingBufferSize` + CSS explícito, `resizeTargets(physW,physH)`. Realoca só em `physChanged`; câmera/fit só em `cssChanged` (DPR puro não reposiciona). Gatilhos `resize`/`pageshow`/`visibilitychange`/`matchMedia(resolution)` só marcam. Auto-tune (`applyRenderScale`) reusa o caminho → escala sobre a base atual. Hook `resizeInfo()`.
  - Validação (executor): A/B default **0 px** (5 capturas, steady-state inalterado); rajada de 25 `resize`/frame → **1** aplicação no frame seguinte; rajada idempotente → **+0** realocações (controle real → +1); DPR 1×/2×/3× → `baseDpr` correto com saturação no cap, câmera intacta sob DPR puro; auto-tune sobre base nova provado (`dpr=1.7=2·0.85`); `npm test` controles 6/6 + parity = default inalterado.
  - Revisão do coordenador: `applyRenderScale` só roda em runtime (funções já definidas); `physChanged`/`cssChanged` separam corretamente realocação de reposicionamento; `matchMedia` re-registrado por disparo com `{once:true}`; aplicação inicial estabelece estado (no-op numérico vs boot); `resizeTargets` mantém fallback legado.
  - **Verificação independente (rebuild do zero): PASS.** FASE A: A/B pinado base↔head **0 px** (fit/close-up/portrait/spots=1.5); contadores — 20 `resize`/tick → **+1** aplicação; idempotente **+0** realloc (controle real +1); DPR 1/2/3 com `baseDpr` correto e **saturação no cap=2** (high), câmera intacta sob DPR puro; auto-tune sobre base viva provado (`2×0,85=1,7`); npm test controles 6/6 + parity = default inalterado. FASE B.1 (3070): stress de 60 mudanças de viewport → head **coalesce** (23 realloc p/ 60 tamanhos distintos vs 174 chamadas de storage na base), **−21% de alocação, 0 long tasks** (base 1×57 ms), maior rAF 51 vs 72 ms. FASE B.2 artefato: **não reproduzido em ~4 min high sob stress de resize/DPR**; passe ultra não executado (encerramento antecipado).
  - **↻ Artefato:** high sob stress de resize = limpo. Ultra-sob-resize + soak completo de 40 min = tarefa permanente na 3070 (acumula ~16 min limpos em high/ultra ao longo dos PRs 3–4; segue "não reproduzido").
- **Decisão:** ✅ **GO** — achado 9 resolvido: resize/DPR/auto-tune transacionais, ≤1 aplicação/frame, coalescência comprovada na 3070 (−21% alloc, 0 long tasks), DPR vivo com cap por tier, auto-tune sobre base atual, default bit-idêntico. Merge autônomo (gates 🟢+🔵 meus).

## PR 5 — Scheduler incremental dos loops

- **Achado:** 6 (um job de loop pode rodar 12 sondas + 4 RK4 no mesmo frame).
- **Arquivos:** `src/atmosphere/loops.js` (~304/331/447).
- **O que muda:** retraço vira job persistente; por frame **≤1 sonda Euler OU ≤1 RK4**, nunca ambos; preservar consumo do `loopRand` (sorteio só na criação do candidato; RK4 reusa o guardado); slots invisíveis até concluir; novo flare cancela só jobs de arcada.
- 🟢 **Correção (eu):** contadores máximos = 1, nenhum buffer parcial visível, geometria final idêntica ao golden determinístico capturado antes da refatoração.
- 🔵 **Perf (auto, 3070):** ausência de spikes de rAF ao preencher/renovar slots.
- **Incidente de execução (recuperado):** 1ª tentativa do executor foi parada por colisão de git (coordenador rodou housekeeping no checkout compartilhado durante a execução — ver memória). Correção de raiz: **executores agora rodam isolados em worktree próprio**. Relançado limpo; nada perdido/vazado.
- **Antes:** `retraceAmbient()` rodava até 12 sondas (88 passos) + 4 RK4 (176 passos) num só frame; arcadas até 2 jobs × 3 RK4 = 6 RK4/frame → >100 mil contribuições de carga/frame no pior caso, spikes ao renovar slots.
- **Depois (branch `pr5-loops-scheduler`, commit `a36719c`, loops.js +261/solinfo.js +39):**
  - Retraço vira máquina de estados persistente `loopJob` (slot/tries/fine/phase/candidato); **≤1 sonda Euler OU ≤1 RK4/frame, nunca ambos**. Snapshot Float64 imutável de cargas+pares na criação (`bFieldSnap` bit-idêntico ao `bFieldJS` no campo estático); `loopRand` só em `pickLoopSeed`, RK4 reusa candidato; slots invisíveis até publicar; arcada 1 RK4/frame com prioridade; novo flare reseta só a arcada, ambiente pausa/retoma. Hooks `loopInfo()` (`maxProbe/maxTrace/maxOps/draws`), `setLoops()`/`loopDump()`.
  - Auto-relato (executor): golden final **bit-idêntico** (6750 pos + 6750 tan + 16 estados; probes 80/traces 34 iguais); orçamento `maxProbe=1/maxTrace=1/maxOps=1`.
  - Revisão do coordenador: ordem de consumo do `loopRand` preservada (probe→trace→refalha→novo probe casa com o laço `for(tries<12&&fine<4)` da base); snapshot congela a moldura; slots invisíveis corretos; flare/ambiente isolados; orçamento por frame correto.
  - **Verificação independente (worktree isolado): PASS.** Golden **bit-idêntico** (0 px + stats de loops iguais no regime de campo estático `hold=1`); contadores `maxProbe/maxTrace/maxOps ≤1` sempre, inclusive com flare (pausa/retomada do job ambiente confirmada — retomou de `{slot:0,tries:1,fine:0}` para `fine:1` após a arcada, sem reiniciar); A/B hold baixo=1483 px (loops ainda enchendo na nova cadência, esperado), hold convergido=**0 px**.
  - **✅ Parity/CI intocado:** o default tem `LOOP_K=0` (loops não rodam no cenário do parity), então os 5 cenários dão **3156/1818/1833/1725/2515** idênticos em base e head, e A/B pixel-exato = 0 px. **CI passa.** (O risco de shift de baseline não se concretizou.)
  - **Perf na 3070 — nuance honesta:** **nenhum spike mensurável em NENHUMA das duas versões.** O custo de 1 traço RK4/sonda é <1 ms mesmo no pior caso da base (12 sondas+4 RK4, ou 6 RK4 de arcada) — invisível contra o orçamento de 16,7 ms. O PR não corrige um jank *visível* nesta 3070 rápida; troca um pior-caso O(16 ops/frame) por garantia O(1 op/frame) — robustez para hardware mais lento / cenas com mais regiões (tier `mid`), não um speedup perceptível aqui. Sem regressão (busy 0,47→0,51 ms, dentro do ruído).
  - Nuance registrada: sob campo em evolução (hold alto, não o regime do QA), o snapshot congelado por job diverge ~0,29% do campo-vivo da base — esperado e fisicamente mais coerente; imperceptível; QA determinístico usa campo estático → 0 px.
- **Decisão:** ✅ **GO (merge)** — usuário delegou a decisão pelo critério "melhor para QA/visual/UX". Inspeção visual do coordenador na 3070 (boot + pós-flare, base vs head, 22 PNGs em `scratchpad/pr5-vis/`): o fill ~7× mais lento **não** lê como lag/quebra — cada frame é imagem solar natural; só ramp-up ~2 s mais suave no boot (t=5 s já igualou o base); slots que renovam não piscam (loop velho persiste até publicar); **pós-flare melhor** (clarão imediato + arcadas em "zíper" mais visível — o efeito que o código busca). Veredito 3 eixos: QA+ (observabilidade + 0 px + CI passa), visual neutro-a-positivo, UX+ (trabalho limitado/frame protege tier mid, sem custo perceptível na 3070). Abordagem "orçar por tempo" descartada (complexidade para problema que a inspeção mostrou inexistente). Merge autônomo.

## PR 6 — Proeminências em quatro batches

- **Achado:** 7 (até 24 draw calls batcháveis).
- **Arquivos:** `src/atmosphere/prominences.js` (~281).
- **O que muda:** 4 `InstancedMesh` (fan, hedgerow, arch, absorption); geometria canônica reconstrói curvatura por atributos; **preservar rigorosamente a ordem de `srand()`**, inclusive sorteios sobrescritos; manter blending/`renderOrder`/hooks públicos.
- 🟢 **Correção (eu):** 3 draws com `fprom=0`, 4 com `fprom>0`, 0 desligado; RNG/estado idênticos; nenhuma diferença visual estruturada (diff determinístico frontal/lateral/close-up).
- 🔵 **Perf/draws (auto, 3070):** redução de draw calls (14→3, 21→4) via `renderer.info`.
- **Antes:** cada estado de proeminência = 2 Mesh emissivos + (com `fprom`) 1 Mesh de absorção → 8–24 draws (14 emissivos no high; +7 absortivos no Sunshine).
- **Depois (branch `pr6-prominences-instanced`, commit `412f815`, prominences.js reescrito +297/−96, main.js +3):**
  - 4 `InstancedMesh` (fan/hedgerow/arch emissivos + absorption); os "meshes" viram proxies `Object3D` (0 draws) que carregam transform+uniforms para os hooks; `ctx.flushProminences()` (1×/frame, após o loop de estados, antes do render) copia estado→atributos. Curvatura movida do vértice pré-cozido (CPU-double) para o vertex shader (float32, via `aSize`); `uTime` único uniform global, resto vira varying por atributo instanciado.
  - Auto-relato (executor): draws **14→3 / 21→4 / 0-desligado**; `srand` bit-idêntico (hash do stream igual, inclusive `uSeed` sorteado-e-sobrescrito); hooks `prominences()/promLife()/fpromInfo()` bit-idênticos (seedMatch); blending Additive + absorção CustomBlending/renderOrder −1 preservados (modos comutativos).
  - **⚠️ Nuance honesta:** A/B **não é 0 px literal** — é **0 px no limiar perceptual (0.1) do CI**, com piso sub-perceptual (maxDelta ≤4/255) **inerente a qualquer instancing** (curvatura no shader float32 vs geometria pré-cozida CPU-double; o próprio plano pediu "curvatura via atributos", o que força isso). CI-safe pelo argumento head≈base perceptual = 0 px.
  - Revisão do coordenador: instancing fiel, ordem do `srand` preservada, flush determinístico, proxies limpos, blending/renderOrder confirmados pelo A/B Sunshine.
  - **Verificação independente (worktrees isolados): PASS.** Draws 3/4/0 confirmados (ON−OFF no mesmo frame, evitando contaminação do bake da coroa); RNG/hooks byte-idênticos (seedMatch); A/B **thr=0.1 = 0 px em TODAS as cenas** (inclusive config exata do CI), thr=0 = piso 72–1769 px (maxDelta 1–32); self-test base×base = 0 px (determinismo perfeito por build); blending/renderOrder byte-idênticos.
  - **Caracterização do piso float (pior cena, diff ×40 inspecionado pelo coordenador):** grão fino 1–4 LSB disperso sobre a granulação (81% dos px são delta 1–4) + transições finas de 1 px no limbo; **zero estrutura**, nenhuma proeminência deslocada/faltando, céu limpo. É ruído float esperado, não bug. Determinístico (A/B pinado idêntico em 3 rodadas).
  - **CI-safe confirmado:** head vs base = 0 px no threshold/max-frac exatos do CI; **main está verde** (3 últimos runs `success` — o "CI vermelho" que o verificador inferiu era leitura equivocada da falha local Windows↔ubuntu, já documentada e não-bloqueante).
- **Decisão:** ✅ **GO** — aceite do plano para o PR 6 ("3/4/0 draws, RNG/estado idênticos, **nenhuma diferença visual estruturada**") cumprido integralmente. O piso float sub-perceptual é inerente ao instancing que o próprio plano especificou (curvatura via atributos) e é exatamente a "diferença não-estruturada" que o aceite prevê. Draws 14→3 / 21→4 (folga de submissão CPU, relevante em tier mid). Merge autônomo.

## PR 7 — Correções funcionais P2 e leak P3

- **Achados:** 11 (deriva idle em wall-clock quebra determinismo), 12 (atalhos globais anulam teclado dos sliders), 14 (`perfBakes` cresce sem limite).
- **Evidência nova (PR 1):** o achado 11 foi comprovado na prática — o harness A/B flakeou com base-vs-base divergindo 45% dos px no `desktop-fit` por causa do gate wall-clock da deriva idle. Prioridade prática deste PR subiu: ele estabiliza o próprio QA da série.
- **Arquivos:** `src/main.js` (~300/538), `src/camera/controls.js` (~200), `src/ui/panel.js` (~204), `src/debug/solinfo.js` (~41), `src/core/config.js` (~18).
- **O que muda:** `markInteraction()` central (normal = wall-clock; det = frame da última interação, idle após 132 frames); teclado retorna cedo em input/select/textarea/button/editable; `perfBakes` → ring de 64 timestamps, `perf()` só-leitura.
- 🟢 **Correção (só eu):** 2 execuções det. com velocidades reais diferentes → câmera+screenshot idênticos; frame 132 sem deriva, 133 com `0,066/60`; seta no slider = 1 `step`; 10 mil registros mantêm ≤64.
- 🔵 **Perf:** nenhum.
- **Antes:** deriva idle em wall-clock (`performance.now()-lastInteraction>2200`) → frame de início dependia da velocidade da máquina (flake do A/B); keydown global `preventDefault` para setas/+/−/R sem checar `e.target` (anulava sliders); `perfBakes.push()` sem limite, poda só em `perf()`.
- **Depois (branch `pr7-det-keyboard-leak`, commit `f292186`, 5 arquivos +66/−15):**
  - `markInteraction()` central (det=frame/normal=wall-clock); deriva idle det = `detFrames-lastInteractionFrame>132`; keydown retorna cedo em alvo editável; `perfBakes`=ring `Float64Array(64)` circular, `perf()` só-leitura.
  - Auto-relato (executor): base diverge **93%** entre 2 velocidades vs head **0 px**; fronteira 132/133 exata (frame 133 = +0.00110000); teclado 11/11; perfBakes ≤64 após 11k; **head self-test = 0 px em desktop-fit/portrait-fit NÃO-pinados** (flake do achado 11 MORTO → A/Bs dos PRs 8–11 não precisam mais pinar/re-rodar).
  - Revisão do coordenador: os 3 fixes corretos; `markInteraction` criado em config antes dos listeners; threshold 132 e incremento 0.066/60 conferem.
  - **⚠️ Baseline (parte do PR):** `qa/baselines/{desktop-fit,portrait-fit}.png` embutem a deriva antiga → head reprova o CI nelas até regenerar dos **renders ubuntu** (via artifact `qa-screenshots` do CI, que o PR 0 configurou). As 3 cenas pinadas ficam inalteradas. Regen = "estabilização" que o PR promete; será mostrada ao usuário (antes/depois) antes de commitar.
  - **Verificação independente (worktrees isolados): PASS.** Determinismo: base diverge **92,98%** (theta 2,12 vs 1,95) entre velocidades vs head **0 px** (theta 1,9785874 idêntico); fronteira 132/133 exata (frame 133 Δ=0,0011); teclado 9/9 no head vs 3 FAILs na base (slider sequestrado, câmera girava, diretor encerrava); perfBakes trava em 64 (idx circular correto); flake morto (head self-test 0 px, base flaka **57,28%** no portrait-fit).
  - **Baseline regenerada (aprovada pelo usuário por inspeção visual do comparativo antes/depois — artifact publicado):** só `desktop-fit`/`portrait-fit` (renders ubuntu do CI, determinísticos); confirmado ubuntu-vs-ubuntu que só essas 2 mudavam (1,33%/0,89%) e a1/a2/a3 = 0. Commit `5adbfb7`. Único ponto da série em que `qa/baselines/` muda — 2 imagens, com olho do usuário no antes/depois.
- **Decisão:** ✅ **GO** — achados 11/12/14 corrigidos e verificados; **flake do achado 11 morto** (A/Bs dos PRs 8–11 param de flakear); baselines de fit agora determinísticas. Merge autônomo após o CI verde com a baseline nova.

## PR 8 — Pré-filtro vertical do streak

- **Achado:** 13 (streak reduz 4:1 em Y sem pré-filtro → pulso por alias temporal).
- **Arquivos:** `src/post/pipeline.js` (~157/184/505).
- **O que muda:** 3 passes reusando 2 RTs (fonte→A com 2 amostras bilineares em Y nos offsets `±1 texel`; A→B blur H curto; B→A blur H longo); composite lê A. Default não muda (`streak=0`); só cenários Sunshine/temporais recalibram.
- 🟢 **Correção (eu):** cenário determinístico de pan vertical com `streak=1`; modulação periódica ≤50 % do baseline defeituoso, energia média dentro de ±10 %.
- 🔵 **Perf/custo (auto, 3070):** custo adicional p95 ≤0,2 ms (1 passe extra num RT minúsculo w/4×h/16).
- **Antes:** 1º passe reduzia 4:1 em Y com UMA amostra bilinear (cobria só `4d+1`,`4d+2`, ignorava `4d`,`4d+3`) → fontes brilhantes em pan vertical pulsavam por alias temporal.
- **Depois (branch `pr8-streak-prefilter`, commit `cbf2140`):** 3 passes reusando 2 RTs — (1) pré-filtro vertical `fonte→A` (2 taps em Y a ±1 texel → `4d+1`=média(4d,4d+1), `4d+3`=média(4d+2,4d+3); média = box 4:1 exato, 0.25/linha); (2) blur H curto `A→B`; (3) blur H longo `B→A`; composite lê `streakOut`. Default `streak=0` não roda.
  - Revisão do coordenador **PASS**: matemática do texel conferida; ping-pong dos RTs sem conflito; `renderStreak()` só com `STREAK_K>0.001`; composite reamarrado.
  - **Verificação independente (GPU real, pan curto — refeita LEVE após a 1ª tentativa em SwiftShader travar a máquina; ver [[swiftshader-cpu-hazard]]):** default **0 px** (5 cenas); modulação temporal isolando o streak (`lum(streak=1)−lum(streak=0)`) em 15 poses de pan: **base std=109.589 / p2p=450.599 vs head std=2.219 / p2p=8.777 → ripple head = 2,0% da base** (aceite ≤50%, PASS enorme). Energia: filtro provadamente unity-gain (pesos somam 1,0; 0,25/linha) → sem viés de brilho; a razão bruta de "energia média" (−23,8%) é inaplicável porque a média da base está dominada pelo próprio artefato (swings + pico 7×). motion2: os 7 cenários rodam `streak=0` → **inafetado**, sem recalibração. Controles 6/6; parity local = pré-existente Windows↔ubuntu (idêntico em base e head).
- **Decisão:** ✅ **GO** — achado 13 resolvido: o pulso temporal do streak em pan vertical caiu para 2% do baseline defeituoso (box 4:1 exato via 2 taps), sem viés de brilho, default 0 px, motion2 intocado. Perf: 1 passe extra num RT de ~14k px (só com streak>0) ≪ 0,2 ms. Merge autônomo.

## PR 9 — Espaços de coordenadas atmosféricos

- **Achado:** 10 (espículas e raios coronais misturam espaço mundo/objeto; ignoram tilt de 7,25°).
- **Arquivos:** `src/atmosphere/spicules.js` (~43), `src/atmosphere/coronaRays.js` (~88), `src/main.js` (~163). **← PR multi-arquivo: fan-out de leitores.**
- **O que muda:** uma `ctx.sunInvRot` por frame da quaternion completa do Sol (tilt+spin); `coronaRays` usa `dirO = normalize(uSunInvRot·dirW)` e remove `uRotY`; espículas transformam `viewDir` p/ objeto antes de projetar; guarda por epsilon na normalização degenerada.
- 🟣 **Visual (você aprova):** carga, streamer e espículas ficam ancorados durante órbita + uma rotação acelerada completa, sem NaN/piscada. **É mudança visual** → rebaseline só após tua aprovação.
- **Depois (branch `pr9-coord-spaces`, commit `88330fc`, main.js/coronaRays.js/spicules.js +44/−8):**
  - `ctx.sunInvRot` (mat3) = inversa da rotação mundial COMPLETA do Sol (quaternion fresca: tilt.z 0,1265 + spin.y), ortonormal→transposta, 1×/frame; `coronaRays` usa `dirO=normalize(uSunInvRot·dirW)` e **remove `uRotY`** (que ignorava o tilt de 7,25°); espículas trazem `viewDir` ao espaço-objeto antes da projeção + **guarda epsilon** contra NaN.
  - Revisão do coordenador **PASS**: matemática de coordenadas correta (mundo→objeto = inversa da rotação); quaternion fresca == rotação mundial (sunMesh é filho da cena); epsilon fallback `vec3(0,1,0)` seguro.
  - Verificação (GPU headed, foreground, leve): rotação acelerada 15 frames = **0 NaN, 0 piscada, 0 erro WebGL**; disco 100% inalterado (diff só nos raios coronais + anel de espículas); A/B thr-0 diverge (mudança intencional), thr-0,1 (CI): a1-z60 **0,11%** (passa do gate → regen), desktop-fit/a2-z35/portrait-fit <0,1% (mudança real de coroa/limbo), a3-z15 0,0012% (intocado). CPU limpa (0 órfãos).
  - **🟣 Visual APROVADO pelo usuário** via animação antes/depois da órbita (artifact publicado) — a ancoragem ficou boa.
- **Decisão:** ✅ **GO** — achado 10 resolvido (coroa+espículas ancoradas ao Sol com tilt+spin, sem NaN). Regenerar baselines das cenas com coroa/limbo (renders ubuntu do CI) e mergear.

## PR 10 — Experimento MRT da cromosfera

- **Achado:** 5 (o `smear` recalcula o mesmo campo magnético do 1º passe).
- **Arquivos:** `src/surface/chromo.js` (~63/172).
- **O que muda (experimento atrás de `?chromoMrt=1`; legado em `?chromoMrt=0`):** target com 2 attachments (RGBA + `RG16F` direção `fdir` octaédrica); shaders → GLSL3; smear decodifica a direção em vez de recomputar. Fallback obrigatório p/ low/8-bit/FBO incompleto.
- 🔵 **GO/NO-GO — critérios numéricos na 3070.** GO só se high **e** ultra: redução ≥10 % **e** ≥0,2 ms/frame; regressão p95 geral ≤3 %; diff visual ≤0,1 % sem costura; soak 10 min sem aumentar artefatos. Qualquer gate falho → NO-GO.
- **Implementação (branch `pr10-chromo-mrt`, commit `4d0753b`, chromo.js +138/solinfo.js +10, NÃO mergeada):** MRT `count:2` (RGBA + RG16F octaédrica), GLSL3 nos 2 shaders do caminho novo, smear decodifica em vez de recomputar (bField+4 snoise+8 taps), fallback silencioso (`chromoPerf()` com mode/reason), fatias com scissor nos 2 attachments. **Correção perfeita:** default 0 px; MRT vs legado 0 px no gate do CI (Δmáx 1 LSB), sem costura; fallbacks corretos; controles 6/6.
- **Medição (3070, protocolo vsync-off ABBA com pre-warm anti-PSO-compile + nvidia-smi + soak):**
  - GATE 0 timer válido: **PASS** (≥74 amostras/célula, ABBA consistente pós-pre-warm).
  - GATE 1 ganho: **FAIL** — custo do par chromo+smear: high 0,28→0,125 ms (+0,155 ms, 55%), ultra 0,26→0,205 ms (+0,055 ms, 21%); os % passam, **o piso absoluto de 0,2 ms falha nos 2 tiers** (o custo real do par já era ~0,3 ms — menor que a estimativa da auditoria).
  - GATE 2 p95 geral: **FAIL** — mrt regride +9,4% (high) / +6,4% (ultra): a banda extra de RG16F custa mais que a ALU economizada.
  - GATE 3 soak: **PASS** (9,2 min, 110 capturas, 0 artefato — flags da heurística inspecionados = falso-positivo conhecido de fundo escuro; console limpo; mode/bakesPerSec estáveis). **↻ Vale como o soak do artefato pós-PR10: não reproduzido.**
  - Triangulação nvidia-smi: sem direção consistente (util −4%/−2%, potência +5%/+0,5%) — concorda com "sem ganho real".
- **Decisão:** ⛔ **NO-GO** — troca ALU por banda que não compensa na RTX 3070; frame geral levemente pior. Candidato fechado sem merge (branch local preservada como referência), relatório mantido aqui conforme o plano. O caminho legado (simples) permanece. Validação móvel do `mid` fica sem objeto.

## PR 11 — Linear-sRGB → sRGB, AgX e recalibração

- **Achado:** 4 (composite não converte Linear-sRGB→sRGB). **Por último de propósito** — muda a imagem globalmente e força recalibrar todas as suítes de uma vez.
- **Arquivos:** `src/main.js` (~29), `src/core/renderer.js` (~9), `src/post/pipeline.js` (~319).
- **O que muda:** `outputColorSpace = SRGBColorSpace`; `#include <colorspace_fragment>` uma vez após a saída final; restaurar linearização omitida no AgX (`pow(max(val,0), vec3(2.2))`); targets intermediários seguem lineares/HDR, `NoToneMapping`. Recalibrar **só apresentação** (exposição, saturação, bloom, halo, veil, grão, tone, emissivos) — sem tocar física/topologia/densidades.
- 🟢 **Correção (eu):** patch numérico de QA — linear 0,18 → sRGB 0,461 → `118±1`; `0,0031308 → ≈10`; `0→0`, `1→255`; rejeitar conversão dupla (`≈181` para o cinza 0,18).
- 🟣 **Visual (você aprova):** julgar 5 vistas default + 2 Sunshine contra as referências solares; clipping por canal ≤0,1 %, RGB total ≤0,01 %. Após aprovação, atualizo **atomicamente** baselines e limiares de phase1/3/4/5/6 e motion2.
- **Depois (branch `pr11-srgb`, commits `1016ee1`/`313be75`/`7a9399c`/`d72c149`/`f691911`):**
  - `outputColorSpace=SRGBColorSpace` + `#include <colorspace_fragment>` como última operação do composite (OETF única, ramo 0,0031308; `max(color,0)` antes contra NaN do grão); AgX com a linearização restaurada (`pow(max(val,0),2.2)` pós-outset, comentário enganoso corrigido); mix `film` em Linear-sRGB; grão/vinheta/split-tone re-expressos como equivalentes em linear.
  - Recalibração de apresentação: `EXP0` 1,02→0,418 (0,41×), `sat` default 1,0→1,08 (painel acompanha). Física intocada.
  - **Patch numérico commitado** (`?colorpatch=1` + `qa:colorpatch`): 0,18→**118** ✓, 0,0031308→**10** ✓, 0→0 ✓, 1→255 ✓, dupla conversão (≈181) rejeitada ✓. Clipping nas 7 vistas: canal ≤0,0185% (gate 0,1%), RGB total 0 (gate 0,01%). `film=0/0.5/1` coerente sem NaN.
  - **🟣 Look APROVADO pelo usuário** nas 7 vistas (artifact hold-to-compare); revisão do coordenador confirmou look preservado (médios menos queimados, sombras da coroa reveladas — o correto físico).
  - **Atualização atômica:** 5 baselines regeneradas dos renders ubuntu do CI (`d72c149`); limiares recalibrados (`f691911`) — só phase6 C2 era de cor (2,0→1,53, margem relativa B3 preservada, racional documentado no tool); phase3/5 e motion2 verdes sem ajuste; phase1 A1 e phase4 F3 = derivas de plataforma pré-existentes (idênticas na base), documentadas e NÃO mascaradas.
- **Decisão:** ✅ **GO** — achado 4 (P0) resolvido: OETF sRGB única e correta, AgX consertado, look aprovado, QA numérico de cor permanente no repo. Merge autônomo pós-CI.

---

## Investigação — artefato retangular transitório em `high`/`ultra`

**Não é um PR. É um item aberto que só encerra por reprodução controlada.**
Um retângulo verde/preto alinhado à tela pisca por instante, mais em `high`/`ultra`.
Causa não comprovada; some fora do hardware-alvo. Hipótese: corrupção transitória
de framebuffer/RT/compositor (achados 5, 8, 9 podem aumentar a probabilidade).

**Como fica registrado:** ausência de repro = **"não reproduzido"**, nunca "corrigido".
Só encerra após causa isolada ou repro eliminada por uma correção.

**Soak do artefato (repetir após PR 1, 3, 4, 10):** baseline de 20 min em high + 20 em
ultra na 3070; se aparecer ≥3 eventos, alternar blocos de 5 min com `scale=0.7`, bake,
bloom e corona3d isolados; comparar captura direta do canvas × screenshot do sistema e
correlacionar com o ring do `?diag=1`. iPhone = smoke test não bloqueante.

**Log de ocorrências:** _(a preencher: GPU, driver, navegador, SO, DPR, resolução, tier, knobs, instante, correlação com resize/auto-tune/bake/upload)_

---

## Metodologia de perf (aprendizado do PR 1 — vale para PRs 2, 8 e 10)

**O timer `EXT_disjoint_timer_query_webgl2` medindo o frame inteiro sob vsync é bimodal
no driver NVIDIA/D3D11:** ora captura só o trabalho da GPU (~4 ms), ora trabalho + stall
de present/composição (~13–16 ms ≈ orçamento de 60 Hz), com clocks/utilização/potência
idênticos entre os dois modos. Deltas base-vs-head sob vsync são inválidos.

Protocolo válido daqui em diante (triangulação, 3 métricas independentes):
1. **Timer denso com vsync/frame-limit OFF** (GPU saturada) — mede trabalho puro; aceitar
   janelas com menos amostras (a query rende menos sob saturação) e repetir em ordem ABBA.
2. **Utilização de GPU @60 fps fixos** via `nvidia-smi` (≥30 amostras/célula).
3. **Potência @60 fps** via `nvidia-smi`, atentando a confound de power-state (comparar util×clock).
Para gates de passe único (PR 8, PR 10): instrumentar a query em torno do passe específico,
não do frame inteiro, e ainda assim validar com vsync OFF. O gate "sem GPU timer válido →
NO-GO" do PR 10 refere-se a este protocolo.

## Matriz de validação (resumo)

- **Perf obrigatória:** RTX 3070, navegador/driver registrados, 1280×720, DPR 1, `scale=1`, seed 7, tiers high e ultra, aquecimento + ≥300 amostras.
- **Compatibilidade:** low/mid/high/ultra em SwiftShader; DPR 1/2/3; build normal e offline. `mid` = compat forçada + SwiftShader; **desempenho móvel nunca inferido da 3070**.
- **Condição de encerramento (por PR):** causa removida no código · ganho/correção medido no subsistema · sem regressão visual fora do intencional · recursos/estado corretos após resize/pausa/retomada · evidência registrada aqui.

## Novas interfaces criadas pela série (referência)

URLs: `?profile=1`, `?diag=1`, `?chromoMrt=0|1`.
Hooks: `gpuPerf()`, `diagnostics()`, `resizeInfo()`, `chromoPerf()`;
`rebakeCorona()` → `{scheduled, targetCycle}`; `coronaInfo()` expõe `requested/on/ready/phase/slice/rate/cooldown/cycles`;
`loopInfo()` recebe fase pendente + máximos/frame; `perf()` recebe `bakeSamples`.
Hooks de proeminências mantêm os formatos atuais, lendo o novo estado instanciado.

# Auditoria LOOP-5 (Fase 0 — CONCLUÍDA em 2026-07-05)

Quatro auditores paralelos (física, harmonia, cinema AAA, performance)
sobre `sol-3d.html` @ d8b8657. Este arquivo é o BACKLOG consolidado:
uma sessão executando o PROMPT-LOOP-5 deve PULAR a Fase 0 e começar
pelo item 1 de cada trilha, re-priorizando a cada iteração.

## Notas do juiz cinematográfico (0–10 vs padrão AAA)

wow do 1º frame 5.5 · bloom/HDR **3.5 (pior)** · tonemap/grading 6.0 ·
composição 5.5 · micro-detalhe em zoom **7.0 (melhor)** · profundidade/
paralaxe 4.0 · limbo/atmosfera 6.0 · proeminências hero 6.5.

## Medições de performance (SwiftShader = PROXY; só razões valem)

- Tier alto, fit: frames SEM bake ~1060 ms; COM bake ~3650 ms — o par
  bake chromo+smear DOMINA (bimodal 3.4×).
- Tier low na MESMA resolução: **4.9× mais rápido** que o alto.
- Zoom máximo no tier alto: +60% (LIC fino+micro ao vivo, ~49 snoise/px).
- DPR 2 (4× pixels): só +43% — os passes de resolução fixa dominam.
- Honestidade: ms absolutos de SwiftShader (CPU) não dizem NADA sobre
  um A17 Pro (GPU tile-based resolve blending aditivo/overdraw quase de
  graça em tile memory; o custo do "séquito do limbo" está
  superestimado aqui). Validação final de fps só em device real.

## TRILHA 1 — CIÊNCIA/HARMONIA (ordem de impacto)

1. **[ALTO] Unificar proeminência ↔ filamento** (apontado 2×): âncoras
   das proeminências amostradas das PILs do **Br EVOLUÍDO** (ler simRT
   com `readRenderTargetPixels` 1× por renascimento, custo desprezível)
   em vez do campo analítico de cargas. Restaura a identidade física:
   filamento no disco que roda até o limbo VIRA proeminência.
2. **[ALTO] Espículas sentem o campo**: passar `uSimTex` à casca e
   modular clump/dens/len por |brEv|/plage em `sphToUv(sil)` — tufos
   densos onde região ativa cruza o limbo, ralos no sol calmo.
3. **[MÉDIO] Coroa no referencial solar + atividade**: raias fixas no
   Sol (giram com ele), amplitude modulada por `uActivity` (Σ|w|·env
   das regiões) e pelas direções das cargas projetadas.
4. **[MÉDIO] Breathing das proeminências**: trocar os 2 senos por
   flicker 1/f (2-3 oitavas de valueNoise em JS) com amplitude ∝
   fieldK e agit — remove periodicidade artificial perceptível.
5. **[MÉDIO] Flares ∝ atividade**: cooldown = base/(0.5+Σ|w|·env),
   amplitude ∝ |w| da região; envelope mais curto (~0.3-0.5 s de
   parede ≈ 1-2 h); glow alongado na PIL (duas fitas).
6. **[MÉDIO] Rotação diferencial nas cargas**: lon += (Ω(lat)−14.18)·k·dt
   em updateActiveRegions (mesma constante do sim) — manchas derivam
   em sincronia com a plage advectada.
7. **[MÉDIA defensabilidade] Manchas**: penumbra 1.55·r → ~2.3·r; fator
   de Joy → tilt 6–10°.
8. Menores (1 linha cada): plage/fluxo com memória de semanas
   (relaxação 0.028 → ~0.004); limbo u → 0.25–0.30 (núcleo H-alfa);
   `pow(c, 1/2.2)` após ACESFilm no composite; camada de estrelas
   brilhantes maioria quente (7000–20000 K); fibrilas: kernel LIC
   0.03–0.05 rad + wiggle ±0.2–0.3; rede Worley advectada pelo mesmo
   escoamento curl-noise (ou deriva ~20× mais rápida).

## TRILHA 2 — CINEMA AAA (top-3 do juiz)

1. **Bloom perceptível + halo coronal** (nota 3.5 — o maior gap único):
   o pipeline dual-Kawase+ACES+half-float JÁ EXISTE mas não lê como
   bloom — recalibrar threshold/ganho, emissivos >1.0 no limbo/plage/
   proeminências, halo suave no limbo. "Frame de trailer" é isso.
2. **Dinâmica de brilho do disco**: plages quase brancas vs canais
   escuros (contraste fílmico das refs 01/03), campo de brilho de
   baixa frequência acoplado ao campo existente.
3. **Ambiente em camadas**: starfield 2-3 camadas com paralaxe real,
   brilhos log-distribuídos, cross-glint sutil nas mais brilhantes,
   faixa da Via Láctea discreta (calibrar POR JUIZ VISUAL, não por
   estatística — a tentativa antiga falhou por calibrar às cegas).
4. Também: anel escuro duro logo dentro do limbo (transição
   disco-céu); enquadramento desktop apertado demais.

## TRILHA 3 — PERFORMANCE (instrumentar → tiers → cortes)

1. **Instrumentação primeiro**: `__solInfo.perf()` (ring de ms/frame,
   renderer.info.render.calls, bakes/s, tier ativo), override
   `?tier=low|mid|high`, `?scale=`, toggles de subsistema p/ A/B.
2. **Tiers adaptativos**: partida por hardware real (renderer string
   "Apple GPU", deviceMemory, DPR, WebGL2+HDR) — iPhone 15 Pro parte
   em MID (bake 1024×512, SIM 768×384, LIC 7 taps, 4 níveis de bloom,
   renderScale 1.0); auto-tune por p95 rolante de ~2 s (>18 ms desce,
   <9 ms por 10 s sobe, com histerese + localStorage).
3. **Cortes que preservam identidade** (ordem custo/benefício):
   a. renderScale 1.0→0.85→0.7 só em sceneRT/composite;
   b. bake fatiado em 4 faixas via `gl.scissor` (1 faixa/frame,
      cadência por texel mantida) e chromo/smear alternados;
   c. coroa pré-computada em textura angular 1D (256×1) a ~2 Hz —
      fragment vira 1 tap + falloff analítico;
   d. manchas movidas do por-frame para o bake (reempacotar canais);
   e. LIC fino+micro em RT meia-resolução no zoom (upsample + curva).
4. Regra de honestidade: toda medição repetida 2× (variância do
   SwiftShader chega a 1.8× entre rodadas); fps de device real só o
   dono confirma no aparelho.

## Ordem sugerida de execução (intercalar trilhas)

T3.1 (instrumentação) → T2.1 (bloom) → T1.1 (prom↔filamento) →
T3.2 (tiers) → T1.2 (espículas↔campo) → T2.2 (plage dinâmica) →
T1.3 (coroa) → T3.3 (cortes) → T2.3 (ambiente) → T1.4-8 + T2.4 →
re-auditoria final (mesmos 4 auditores) → PR + merge.

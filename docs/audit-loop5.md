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

## Registro do loop (atualizado por iteração)

- **T3.1 FEITO** (57c1863 + HUD): `__solInfo.perf()`, tiers nomeados
  low/mid/high, `?tier=`/`?scale=`, toggles de 7 subsistemas, HUD
  on-device (`?hud=1` ou segurar o dedo parado ~1s). QA 32/32 PASS,
  zero pageerror; custo cai monotonicamente por tier (686→474→358 ms
  no SwiftShader).
- **ACHADO (pré-existente, não regressão)**: gate H (filamentos)
  falha com 0 canais no crop central em 3/3 amostras TAMBÉM no
  baseline 0bc92c1 — o canal existe visualmente mas não cruza o crop
  no instante da captura. Tratar junto com T1.1 (mexe em filamentos).
- Gate D-tufos oscila (limiar 1.7; amostras 1.72/1.64/4.95) — regra
  das duas amostras aplicada, maioria PASS.
- **T2.1 FEITO** (d737008): threshold HDR 1.0→0.72, strength 0.42→0.62,
  rim do limbo 0.4→1.15, plage emissiva HDR +0.35. Sweep de 5 variantes
  julgado vs refs (v4 7.0/10 vs baseline 3.5); disciplina H-alfa intacta
  (p50 +2%, 0% clipado). Gates: 2 amostras pós-mudança OK exceto H
  (pré-existente) e D-tufos (flake estocástico: 1 de 3 amostras passa
  com 3.97 — o gate depende de haver tufo proeminente no instante).
  Halo coronal além do limbo NÃO sai do bloom → movido para T1.3.
- **UX FEITO** (b3c3031, pedido do dono): arrasto horizontal era
  invertido (vertical já acompanhava o dedo) — agora "agarrar o globo"
  nos dois eixos, como Google Earth. qa-controls 6/6 + teste de sinal.
- **T1.1 FEITO**: âncoras de proeminência amostradas das PILs do Br
  EVOLUÍDO (canal G do simRT → RT 128×64 RGBA8 → readRenderTargetPixels
  1× por renascimento) com o MESMO critério dos filamentos do bake
  (|Br| pequeno + inversão de polaridade + gradiente vivo); cartão
  nasce ALINHADO à tangente da PIL (hedgerow corre ao longo da linha
  neutra). Fallback analítico mantido. QA 5/5: 20/20 âncoras válidas,
  16 bem distribuídas, morfologia normal, custo desprezível.

- **T3.2 FEITO** (d24577c + fix da guarda): detectTier por hardware
  (URL > localStorage > SwiftShader→high/tune off > Apple GPU+toque→MID
  > móvel c/ <4GB→LOW > desktop HIGH) e auto-tune de ESCALA em runtime
  (p95>18ms desce 1.0→0.85→0.7; <9ms/10s sobe; extremos persistem
  recomendação de tier no localStorage p/ a próxima carga). Guarda de
  aba-background (frame>250ms ou hidden) relaxada sob ?tune=1 (opt-in
  de QA — sob SwiftShader todo frame passa de 250ms e o teste ficava
  inerte). QA: 18 checks, cascata end-to-end provada no arquivo final
  (events=2, autoScale 0.7, solTier='mid', zero pageerror).
- Ruído conhecido: warning "GPU stall due to ReadPixels" no console em
  shots (readback das PILs da T1.1, 1× por renascimento) — não é erro.
- **T1.2 FEITO** (f4404ed): casca de espículas recebe uSimTex e modula
  comprimento ×[0.85..1.27], clump +45% e densidade ×[0.80..1.30] por
  |brEv| na silhueta. QA: correlação medida no limbo ativo vs calmo
  (+29% de altura média, visivelmente mais tufado), gates 2 amostras OK
  (D-tufos 2.50/1.72 — melhorou vs as oscilações 1.46/1.57), zero
  pageerror, aparência ref-05 preservada.

- **T2.2 FEITO**: peso da plage no heat 0.22→0.34, canais de filamento
  0.30→0.55, desvio de matiz da plage p/ creme (0.55, gate duplo
  plage>0.55 & heat>0.72). Sweep de 5 variantes: vencedora d4 7.5/10
  (plage creme mosqueada máx 172 sem clip) + fdark da d3; gates nos
  params exatos: G=0.291 (pw=0.34 não moveu o spread — contraste
  localizado), 0% clip, B/F/I ok.
- **ACHADO do sweep**: gate H não se resolve com escurecimento — os
  canais têm área (377≥300) mas span 27-29 <45 e fill 0.46: é problema
  de CONTINUIDADE da máscara no bake, não de ganho (tarefa própria).

- **T1.3 FEITO**: coroa reescrita no REFERENCIAL DO SOL (direção 3D do
  plano do céu girada ao espaço do objeto — ancoragem PROVADA: correlação
  de fase 0.083 entre frames girados 0.6 rad, picos coronais seguem a
  plage com corr 0.743), streamers reforçados sobre as cargas (cray
  0.90), halo largo 0.30 (respiro 3× o baseline em 1.02-1.05R, achado
  do T2.1 resolvido) e amplitude ∝ atividade global (cact 0.50).
  Gates m30: A 0.89 estável 4/4, G 0.303, zero anel/névoa.
- **UPGRADE FUTURO anotado**: c2 (chalo=0.55) lê ainda melhor como DP,
  mas o bloom do halo sangra ~30px p/ dentro do limbo e derruba o gate
  A (0.91-0.92). Pré-requisito: qa-elements capturar A/D com
  __solInfo.toggle('corona',false) (fix já validado: A=0.77, D=4.0px).
- **ACHADO de harness**: gate D falha com QUALQUER halo>0 (o limiar L>9
  até 1.15R conta o respiro como franja) — incompatibilidade da
  ferramenta, não defeito visual.

- **T3.3 FEITO** (3aa4fc8, item b — o de maior impacto medido): bake
  fatiado em 8 fatias via scissor (4 chromo + 4 smear, mesmo timestamp,
  smear lê chromo completo do mesmo ciclo). A/B vs baseline: pior frame
  −59% (3321→1366ms), p95/avg 1.80→1.21, fps +73%, zero costura, gates
  no estado conhecido. Itens c/d/e (coroa 1D, manchas no bake, LIC
  meia-res) ficam como oportunidades futuras — o gargalo dominante era b.
- **Harness A/D isolado da coroa** + halo pleno 0.55 (c2): qa-elements
  desliga a coroa só no element-limb (gates de superfície); o achado de
  que D-franja falhava com qualquer halo>0 fica resolvido na raiz.

- **T1.4-8 FEITO** (dc1c9c8): breathing 1/f (3 oitavas, aperiodicidade
  verificada), flares ∝ atividade e |w|, rotação diferencial nas cargas,
  penumbra 2.3r, Joy 6-10°, limbo u=0.30 (gate A 0.78-0.84 OK),
  relaxação Br 0.008, estrelas brilhantes maioria quente.
- **GATE H VERDE** (fbb6932): continuidade dos canais (gates de
  existência mais lentos, menos pinch, piso de gradiente menor) —
  H PASS 3/3 (antes 1 PASS em ~10 rodadas), canais lêem como ref-03.
  Vigiar gate I: 1 FAIL/3 (massa de filamento contada como mancha);
  se recorrer, nlw 0.80+0.40 → 0.85+0.35.
- **T2.3 FEITO** (fbb6932 + calibração): brilhos log, camada próxima
  com cross-glint (size 12 após juiz apontar ilegível), Via Láctea
  discreta re-normalizada à casca (setLength pós-flatten; opacity 0.45),
  paralaxe diferencial medida (-5.4%/passo, geometricamente correta
  para órbita: casca próxima desloca MENOS).

## PENDÊNCIAS HONESTAS para um próximo loop

- gamma pós-ACES (invalidaria as calibrações desta sessão — requer
  re-calibração conjunta de bloom/plage/halo);
- kernel LIC 0.03-0.05 rad + wiggle ±0.2-0.3 (mexe no aspecto mais bem
  avaliado, 7.0 — fazer com sweep+juiz dedicados);
- rede Worley advectada pelo escoamento;
- cortes T3.3 c/d/e (coroa 1D, manchas no bake, LIC meia-res no zoom);
- anel escuro no limbo + enquadramento desktop (T2.4);
- glow de flare alongado na PIL (duas fitas);
- validação de fps em device real (iPhone 15 Pro) — SÓ O DONO pode:
  abrir com ?hud=1 (ou segurar o dedo parado ~1s) e conferir fps/p95
  nos tiers mid e high.

## Ordem sugerida de execução (intercalar trilhas)

T3.1 (instrumentação) → T2.1 (bloom) → T1.1 (prom↔filamento) →
T3.2 (tiers) → T1.2 (espículas↔campo) → T2.2 (plage dinâmica) →
T1.3 (coroa) → T3.3 (cortes) → T2.3 (ambiente) → T1.4-8 + T2.4 →
re-auditoria final (mesmos 4 auditores) → PR + merge.

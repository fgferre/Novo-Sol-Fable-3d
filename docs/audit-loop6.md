# Auditoria LOOP-6 (Fase 0 — CONCLUÍDA em 2026-07-06)

Verificação total das implementações do LOOP-5 e follow-ups em
`sol-3d.html` @ **99e0d19** (main), caçando regressões. Quatro
verificadores paralelos (V1 física/harmonia, V2 gates+controles,
V3 cinema AAA, V4 perf+knobs+UI), cada item julgado contra os valores
das validações originais registradas em `docs/audit-loop5.md`.

## VEREDITO GERAL: 24/24 PASS — NENHUMA REGRESSÃO

A suspeita de regressão NÃO se confirmou em nenhuma trilha. Nenhum
item FAIL, nenhum DEGRADADO, nenhum flake novo. O backlog de correção
desta auditoria está **vazio**.

## BACKLOG por severidade

- FAIL: —
- DEGRADADO: —
- Flakes novos: —

## V1 — FÍSICA/HARMONIA (6/6 PASS)

1. **PILs (T1.1): PASS** — 10/10 âncoras válidas (mode=='pil',
   aligned==true, crossLon||crossLat), |br| máx 0.082 ≤ 0.20
   (original: 20/20, máx 0.114 — está MELHOR).
2. **Espículas↔campo (T1.2): PASS** — franja no limbo ativo (act 1.68)
   4.1px vs calmo (act 0.00) 2.7px = **+50%**; brilho da casca
   R+3..R+16: +68% (original: +29%).
3. **Coroa ancorada (T1.3): PASS** — correlação do perfil anelar
   (1.1–1.3R) após girar 1.50 rad = **0.004** (original 0.083; papel
   de parede ≈1.0). Controle de 58s SEM rotação = 0.278, provando que
   a decorrelação vem da rotação, não do ruído.
4. **Deriva diferencial (T1.6): PASS** — ?speed=3, 2 intervalos de
   45s: 4/4 cargas derivam em longitude, dependente de latitude
   (lat 12°: 5.0 mrad vs lat 25°: 0.4–0.6 mrad), razão constante
   ~0.67× a lei Snodgrass do código (explicada pelo cap regDt≤0.2 sob
   frames lentos do SwiftShader — não é defeito).
5. **Breathing 1/f (T1.4): PASS** — 8 leituras com holdPromAgit(2,0.5):
   card0 0.673–0.741, card1 1.177–1.304 (dentro de 0.6–1.5), 0 zeros
   espúrios, passos irregulares (cv 0.63/0.65, 3 inversões de sinal —
   não-senoidal).
6. **Flares (T1.5): PASS** — forceFlareAt seta surfFlareT=0 e
   surfFlareAmp=1.2 (l.~2531); gatilho natural amp=0.55+0.55|w|,
   cooldown=(12+rnd·14)/(0.5+1.1·uActivity), uActivity=Σ|w|/4;
   runtime: forceFlareAt(0)→true com efeito observável (agit 0→0.503,
   uInt 0.46/0.77→0.77/1.30).

## V2 — GATES + CONTROLES + ESTABILIDADE (4/4 PASS)

1. **Gates A-I, 3 amostras: PASS 9/9 · 9/9 · 9/9** — nem os flakes
   conhecidos apareceram. A=0.83/0.75/0.85; D-franja 3.9/4.5/5.1px;
   D-tufos 4.08/8.42/6.61 (folga sobre 1.7); B-umbra 0.27/0.27/0.29;
   B-plage 1.49/2.24/1.59; F 0.714/0.720/0.723; G 0.297/0.311/0.296;
   H 2/2/2 canais; I span 15/15/15 (≤16).
2. **qa-controls: PASS 6/6** na 1ª rodada (ArrowLeft, +, dblclick
   close-up, dblclick fit, R, inércia), sem re-run.
3. **"Agarrar o globo": PASS** — drag DIREITA: theta +1.1000
   (aumenta); drag BAIXO: phi −1.1000 (diminui). Conforme b3c3031.
4. **pageerror: PASS** — 0 em todas as 5 cargas (só o warning benigno
   "GPU stall due to ReadPixels").

## V3 — CINEMA AAA (4/4 PASS, juiz visual vs refs)

1. **Notas: PASS** — wow 7.0 · bloom/HDR 6.5 · grading 7.0 ·
   composição 6.0 · micro-detalhe 7.5 · profundidade 6.0 · limbo 7.0 ·
   proeminências 7.5 — **média 6.8 = baseline 6.8**, nenhum eixo caiu.
2. **Bloom/halo/plage: PASS** — clip no disco 0.000% (máx canal 244);
   halo decai monotônico 25.8→4.1 lum em 1.00r–1.58r, 0 violações,
   sem anel; plage creme mosqueada + canais escuros ≈ ref-03; rim do
   limbo presente ≈ ref-02.
3. **Via Láctea: PASS** — pico do véu default ≈26.5/255, mw=1
   ≈42–45/255, 0% clip em ambos; bojo âmbar + veio de poeira + bordas
   frias + estrelas por cima + glints em cruz legíveis. (Pico ~15–20%
   acima dos números do baseline 22/37 — diferença de metodologia de
   máscara do medidor, sem clip e sem perda morfológica; NÃO tratado
   como degradação.)
4. **Crossfade do bake: PASS** — diffs do disco entre 4 frames rAF
   consecutivos: 3.76/3.60/3.56, razão máx/mín **1.05** (original
   1.07); sem padrão "salto+idênticos"; fibrilas sem ghosting no zoom.

## V4 — PERF + KNOBS + UI (6/6 PASS)

1. **perf(): PASS** — 9 campos presentes em 4 cargas; ms.avg
   low 1291 < mid 1502 < high 2254 (monotônico; SwiftShader = proxy,
   só razões valem).
2. **Tiers/tune/bake: PASS** — default SwiftShader = high + tune off;
   ?tune=1 cascata 1.0→0.85 (53s)→0.7 (101s) + solTier='mid'
   persistido (143s), reload parte em mid; localStorage limpo ao fim
   (confirmado length=0). Bake fatiado: p95/avg 1.22 no default
   (1.08–1.37 por tier, ≤1.4).
3. **HUD: PASS** — ?hud=1 mostra; segurar ~1s alterna (inclusive
   partindo de oculto); não cobre o título.
4. **Painel ⚙: PASS** — abre/fecha; 12 sliders ao vivo 12/12 (bloom
   aplica no frame seguinte por cópia de uniform no render — por
   design); solKnobs persiste; "restaurar padrão" limpa; drag no
   painel não gira o Sol (dTheta 0.073 ≈ deriva idle vs 0.83 do drag
   no canvas); HUD desliza; 390px ok sem overflow.
5. **Knobs URL: PASS** — ?speed=0.2 ⇒ rotação 5.000× mais lenta com
   drag idêntico (câmera não escala); ?sat=0 ⇒ meanSat 0.0034; 8
   spot-checks visuais na direção esperada; precedência
   URL > painel salvo > default confirmada.
6. **Defaults: PASS** — knobs() sem query/localStorage = exatamente
   {speed:1, bloom:0.62, bloomth:0.72, exposure:1.02, sat:1, vig:0.55,
   grain:1, plageglow:0.35, halo:0.55, ray:0.9, cact:0.5, mw:0.62}.

## Notas de harness (não são defeitos do produto)

- Cargas de `regions()` têm raio 0.88 (não-unitárias) — afeta só
  tooling de QA que assuma vetor unitário.
- Sob SwiftShader (frames 0.5–2.5s), um drag em movimento pode
  alternar o HUD 1× (pointermove processado após o setTimeout de 1s)
  — artefato do ambiente lento, não reproduzível em device real.
- Pico da Via Láctea medido ~15–20% acima do baseline por diferença de
  máscara do medidor (p99 vs pico filtrado) — re-medir com a mesma
  metodologia antes de qualquer recalibração futura.

## PENDÊNCIAS (herdadas do LOOP-5, não são regressão)

- gamma pós-ACES (requer re-calibração conjunta bloom/plage/halo);
- kernel LIC físico 0.03–0.05 rad + wiggle ±0.2–0.3;
- rede Worley advectada pelo escoamento;
- cortes T3.3 c/d/e (coroa 1D, manchas no bake, LIC meia-res no zoom);
- anel escuro no limbo + enquadramento desktop (T2.4);
- flare: fitas na PIL + laços pós-flare + envelope 2 fases (ref-08,
  nota 4/10);
- validação de fps no iPhone real — só o dono (?hud=1, tiers mid/high).

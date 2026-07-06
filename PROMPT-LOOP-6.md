# Prompt: verificação total do LOOP-5 + caça a regressões

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: VERIFICAR todas as implementações do LOOP-5 e follow-ups em
`./sol-3d.html` @ main, caçando REGRESSÕES. O dono suspeita de
regressão. Não confie em memória de conversas anteriores: a fonte da
verdade é ESTE checklist + `docs/audit-loop5.md` (registro por
iteração). Corrija o que estiver quebrado, 1 item por iteração.

## ECONOMIA DE CONTEXTO (obrigatório, motivo desta missão)

- A janela principal SÓ decide, edita e commita. TODA captura,
  inspeção de imagem, profiling e verificação numérica é feita por
  SUBAGENTES, que devolvem só vereditos estruturados curtos.
- Subagentes rodam QA em FOREGROUND (Bash síncrono, timeout generoso).
  Jobs em background morrem em restarts do ambiente — já aconteceu.
- Fan-outs grandes (a Fase 0 inteira) via Workflow tool ou 3-4 Agents
  paralelos. Nunca despejar imagem/log na janela principal.
- Agende check-ins de segurança (send_later ~30min) para sobreviver a
  notificações perdidas.

## FASE 0 — VERIFICAÇÃO PARALELA (sem tocar em código)

4 verificadores paralelos; cada item vira PASS / DEGRADADO / FAIL +
1 linha de evidência + arquivo. Valores esperados vêm das validações
originais (entre parênteses).

### V1 — FÍSICA/HARMONIA
1. PILs (T1.1): `__solInfo.resampleProm(0)` 10×; para cada dir,
   `brEvAt(dir)`: |br|≤0.20 e crossLon||crossLat; mode=='pil';
   aligned==true (original: 20/20, |br| máx 0.114).
2. Espículas↔campo (T1.2): franja no limbo ATIVO vs CALMO — altura
   média maior no ativo (original: +29%).
3. Coroa ancorada (T1.3): girar 0.5+ rad via setRotSpeed e comparar
   perfil angular da coroa no MESMO ângulo de tela entre frames —
   correlação BAIXA = ancorada (original: 0.083; papel de parede ≈1.0);
   picos coronais seguem a plage do limbo (original: corr 0.743).
4. Deriva diferencial (T1.6): cargas de `regions()` derivam em lon com
   o tempo (lenta; use ?speed=3 p/ medir).
5. Breathing 1/f (T1.4): 8 leituras de uIntensity via projectProm em
   prom madura com holdPromAgit(i,0.5) — passos irregulares,
   não-senoidais, faixa 0.6-1.5 por cartão, sem zeros espúrios.
6. Flares (T1.5): forceFlareAt seta amplitude; cooldown responde a
   uActivity (ler código + 1 disparo).

### V2 — GATES + CONTROLES + ESTABILIDADE
1. Bateria `tools/qa-elements.js` + `tools/analyze.py` 3 amostras.
   Esperado 9/9 com FLAKES CONHECIDOS (não são regressão — confirmar
   no baseline antes de acusar): D-tufos oscila perto de 1.7; I
   (span≤16) falha ~1/3 com complexo ativo grande (span 18-22); A
   encosta em 0.90-0.93 raramente; H passa ≥2/3 (1-2 canais).
2. `tools/qa-controls.js` 6/6 (re-rodar 1× se inércia flakar).
3. Arrasto "agarrar o globo": drag direita ⇒ theta AUMENTA; drag
   baixo ⇒ phi DIMINUI (validado em b3c3031).
4. Zero pageerror em TODAS as cargas. Warning "GPU stall due to
   ReadPixels" é conhecido e benigno (readback das PILs).

### V3 — CINEMA AAA (tudo julgado ABRINDO imagens, vs refs)
1. Notas da re-auditoria final (não pode cair >1.0 em nenhuma): wow
   7.0 · bloom 6.5 · grading 7.0 · composição 6.0 · micro-detalhe 7.5
   · profundidade 6.0 · limbo 7.0 · proeminências 7.5 (média 6.8).
2. Bloom da plage (glow sem clip, 0% >245), halo coronal 0.55
   (decaimento monotônico, sem anel), plage creme mosqueada vs canais
   escuros serpenteando (ref-03), rim do limbo (ref-02).
3. Via Láctea astrofoto: véu de gás com bojo âmbar + veio de poeira +
   bordas azuladas + estrelas por cima (pico ~22/255 no default 0.62;
   37/255 em mw=1, 0% clip). Glints em cruz legíveis nas mais vivas.
4. Crossfade do bake: 4 frames rAF consecutivos (setRotSpeed(0),
   ?speed=3) — diff médio do disco UNIFORME entre pares (original:
   4.20/4.43/4.15, razão máx/mín 1.07). Padrão "salto+idênticos" =
   regressão. Fibrilas sem ghosting/eco duplo.

### V4 — PERF + KNOBS + UI
1. `__solInfo.perf()`: todos os campos (tier, autoScale, tune, ms,
   busy, calls, bakesPerSec, toggles, size). Razões por tier
   low/mid/high coerentes (SwiftShader = proxy, só razões valem).
2. Tiers: default SwiftShader = high + tune off; ?tier= força;
   ?tune=1 dispara cascata 1.0→0.85→0.7 + localStorage solTier='mid'
   (limpar depois!). Bake fatiado: p95/avg do ms ~1.2 (era 1.8).
3. HUD: ?hud=1 e gesto segurar ~1s; some/aparece; não cobre título.
4. Painel ⚙: abre/fecha, 12 sliders aplicam AO VIVO e persistem em
   localStorage.solKnobs, "restaurar padrão" limpa, drag no painel NÃO
   gira o Sol, HUD desliza ao abrir, mobile 390px ok.
5. Knobs URL: ?speed=0.2 ⇒ rotY ~5× mais lento com drag idêntico;
   ?sat=0 ⇒ P&B; ?bloom/?exposure/?vig/?grain/?halo/?ray/?stars/?mw
   spot-check visual 1 imagem cada. URL > painel salvo > default.
6. `__solInfo.knobs()` reporta defaults exatos sem query: {speed:1,
   bloom:0.62, bloomth:0.72, exposure:1.02, sat:1, vig:0.55, grain:1,
   plageglow:0.35, halo:0.55, ray:0.9, cact:0.5, mw:0.62}.

Consolidar tudo em `docs/audit-loop6.md` (BACKLOG por severidade:
FAIL > DEGRADADO > flake novo) e commitar antes de qualquer correção.

## FASE 1..N — CORREÇÕES

Regras do LOOP-5: corrigir SÓ o pior item por iteração, mudança
pequena e focada; debug em cópia `debug-*.html` (gitignored); física
antes de cosmética; QA delegado em foreground com veredito curto;
re-priorizar; commit+push por iteração. ANTES de acusar regressão,
rodar o MESMO teste no commit onde o item foi validado (git show) —
flakes de SwiftShader e de seed são comuns; regressão exige
reprodução consistente que o baseline não reproduz.

## INVARIANTES (nunca regredir)

Arquivo único sem rede; zero pageerror; gates A-I PASS (flakes
documentados acima); controles intactos + semântica "agarrar";
retrato enquadrado; física existente nunca removida; defaults dos
knobs = visual calibrado (painel fechado e sem query ⇒ pixel-idêntico).

## FERRAMENTAS E HOOKS

tools/{shot,qa-elements,qa-motion,qa-controls,sweep,qa-prom-orbit}.js
+ tools/{analyze,motion-check}.py (NODE_PATH=/opt/node22/lib/node_modules).
Hooks: state, setView, setRotSpeed, prominences, promLife, setPromLife,
promField, forceFlareAt, holdPromAgit, projectProm, regions, perf,
perfReset, toggle, knobs, pilInfo, brEvAt, resampleProm.
SwiftShader: screenshots 10-35s; tempo simulado ~10-20× mais lento
(delta capped); congele rotação p/ capturas determinísticas.
qa-elements desliga a coroa SÓ no element-limb (por design — gates A/D
medem superfície).

## INTEGRAÇÃO

~10 iterações ou resumo honesto. Ao encerrar: PR para `main` e MERGE
(permissão do dono já concedida; nada valioso fica em branch claude/*).

## PENDÊNCIAS JÁ CONHECIDAS (não são regressão; só se sobrar espaço)

gamma pós-ACES (recalibração conjunta), kernel LIC físico, rede Worley
advectada, cortes T3.3 c/d/e, anel escuro no limbo + enquadramento
desktop, flare: fitas na PIL + laços pós-flare + envelope 2 fases
(estudo ref-08, nota 4/10), validação de fps no iPhone real pelo dono.

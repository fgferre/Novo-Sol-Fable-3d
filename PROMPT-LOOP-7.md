# Prompt: LOOP-7 — o Sol VIVO (movimento padrão Sunshine)

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: dar VIDA EM MOVIMENTO ao Sol de `./sol-3d.html` @ main.
A auditoria de movimento (M1 cadências + M2 crítica perceptual de
sequências) deu **5.5/10** — a fonte da verdade é
`docs/audit-motion.md` (bugs com linhas, medições, backlog ordenado
e métrica de progresso). Contexto do look: `docs/cinema-sunshine.md`
e `docs/audit-loop6.md`. Não confie em memória de conversas
anteriores. Corrigir 1 item por iteração, na ordem do backlog de
movimento (bugs de sincronia → fervura contínua → coroa/estrelas
vivas → flare×íris → polish), re-priorizando a cada iteração.

## ECONOMIA DE CONTEXTO (obrigatório)

- A janela principal SÓ decide, edita e commita. TODA captura,
  inspeção de imagem/strip, profiling e verificação numérica é de
  SUBAGENTES, que devolvem vereditos estruturados curtos.
- Subagentes rodam QA em FOREGROUND (Bash síncrono, timeout até
  600000ms). Jobs em background morrem em restarts.
- Agende check-ins de segurança (send_later ~25-30min).

## PROTOCOLO DE QA DE MOVIMENTO (o termômetro do loop)

Após cada mudança visual, subagente re-roda o protocolo M2
(docs/audit-motion.md, seção "Métrica de progresso"): 12+ frames
rAF-consecutivos, speed=1 e speed=3, rotação congelada
(setRotSpeed(0)), diffs por região (disco/limbo/coroa), strip
lado a lado ABERTA e julgada, controle com toggle('bake',false).
Alvos: platô do disco >0.3 SEM bake; razão max/min do disco <10;
coroa >0; sem stall+jump no uBakeMix; nota de cineasta ≥7.5.
SwiftShader: frames 0.5-2.5s, delta capped 0.1s/frame — sequências
rAF-consecutivas são "vídeo em tempo simulado"; screenshots 10-35s.

## QA CLÁSSICO (continua obrigatório por iteração)

- `tools/qa-elements.js` + `tools/analyze.py` 2-3 amostras: 9/9 com
  flakes conhecidos (D-tufos ~1.7; I span≤16 falha ~1/3 c/ complexo
  grande; A 0.90-0.93 raro; H ≥2/3). A fervura mexe no shader do
  disco — vigiar D-tufos/G/H de perto.
- `tools/qa-controls.js` 6/6; zero pageerror; warning ReadPixels é
  benigno.
- Neutralidade da camada cinema: sem query/localStorage, knobs()
  = defaults e os 6 knobs cinema (veil/streak/adapt/fringe/shimmer/
  tone) em 0, adaptMul=1. ATENÇÃO: os fixes de movimento MUDAM o
  default (fervura/coroa/crossfade são o visual base) — isso é
  esperado e desejado; "neutralidade" vale só para os knobs cinema.
- Perf: __solInfo.perf() antes/depois — razões por tier não podem
  piorar >10% sem justificativa (fervura = ALU no frag do disco;
  medir no tier low também).

## INVARIANTES (nunca regredir)

Arquivo único sem rede; zero pageerror; física existente nunca
removida (PILs, espículas↔campo, coroa ancorada, deriva, breathing,
flares∝atividade); gates A-I PASS; controles + semântica "agarrar";
retrato enquadrado; preset ?look=sunshine intacto (re-julgar 1×
ao final); rotação×textura rígida e renascimento sem pop (M2 os
validou — não quebrar o que já é SUAVE).

## FERRAMENTAS E HOOKS

tools/{shot,qa-elements,qa-motion,qa-controls,sweep,qa-prom-orbit}.js
+ tools/{analyze,motion-check}.py (NODE_PATH=/opt/node22/lib/
node_modules, PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, Chromium
args SwiftShader: --use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader). Hooks __solInfo: state, setView,
setRotSpeed, prominences, promLife, setPromLife, promField,
forceFlareAt, holdPromAgit, projectProm, regions, perf, perfReset,
toggle, knobs, pilInfo, brEvAt, resampleProm. Debug em cópia
`debug-*.html` (gitignored).

## INTEGRAÇÃO

~8 iterações ou resumo honesto; registro por iteração em
docs/audit-motion.md (seção nova "Registro do LOOP-7"). Ao
encerrar: PR para `main` e MERGE (permissão do dono já concedida;
nada valioso fica em branch claude/*).

## PENDÊNCIAS FORA DESTA MISSÃO (não atacar sem sobrar espaço)

Composição/enquadramento desktop + anel do limbo (T2.4), gamma
pós-ACES (recalibração conjunta), kernel LIC físico, Worley
advectada, coroa 1D/manchas-no-bake/LIC meia-res (T3.3 c/d/e),
morfologia completa de flare ref-08 (fitas+arcada — o LOOP-7 só
rebalanceia flare×íris), grão luma-only e veil por aspect no preset,
validação de fps em iPhone real (só o dono).

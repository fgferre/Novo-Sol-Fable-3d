# Prompt: LOOP-9 — filamentos PROCEDURAIS: fechar resíduos de fidelidade

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: seguir fechando os gaps de FIDELIDADE FÍSICA dos filamentos de
`./sol-3d.html` @ `main`, em loop. Diretriz do dono (INEGOCIÁVEL): o Sol
é um modelo 100% PROCEDURAL que respeita REGRAS FÍSICAS — nada
pré-determinado, nada de máscara estática. Fontes da verdade:
`docs/audit-motion.md` (registros LOOP-8 iter 1 e 2 no topo — leia-os) e
`PROMPT-LOOP-7.md` (protocolo de QA, ferramentas, hooks, invariantes,
especificidades do SwiftShader — tudo continua valendo). Não confie em
memória de conversas anteriores.

## ESTADO ATUAL (git)

- `main` @ `2bf6bcd`: modelo procedural dos filamentos + 2 fixes do
  LOOP-8 JÁ MESCLADOS e no ar em https://fgferre.github.io/Novo-Sol-Fable-3d/
  (Pages auto via `.github/workflows/pages.yml` a cada push em `main`).
  - PR #25: fix de PERF (o bloqueio do tier high). A regressão NÃO era o
    bake do chromo (era MAIS BARATO que o main) e sim a presença de
    `pilSeed` no shader QUENTE do sim — o SwiftShader compila o programa
    inteiro (a ramificação `uSeed` é alcançável) e penaliza todo passo.
    Fix: `pilSeed` foi para um material de SEED dedicado
    (`simSeedMaterial`/`simSeedScene`); o passo quente usa um shader
    enxuto (`.replace` em runtime). High whole-frame +12% → +5%.
  - PR #26: fix de FRAGMENTAÇÃO dos canais. Causa: `filStr` (band-pass de
    `gradM`) zerava o canal no meio das regiões ativas. Fix: rolloff
    superior do `filStr` 0.38/0.90→0.48/1.02 + smear pass-2 ±4→±6. n de
    canais 18→12, gates 9/9, perf ≈ main.
- **Dominância hemisférica JÁ RESOLVIDA** (mediana 0.57, ≤0.8): o
  resíduo #1 do PROMPT-LOOP-8 não existe mais (seed-por-carga + placePair
  o corrigiram). NÃO re-atacar.

Comece com `git fetch origin main` e desenvolva na branch
`claude/loop-workflow-subagents-dxe9id` (reinicie-a de `main`: os PRs
anteriores já foram mesclados — `git fetch origin main && git checkout -B
claude/loop-workflow-subagents-dxe9id origin/main`).

## RESÍDUOS A ATACAR (re-priorizar a cada iteração, MEDIR antes de mexer)

1. **Comprimento mediano dos canais curto** (mediana ~0.042R vs envelope
   GONG 0.08-0.15R). O LOOP-8 concluiu que isso NÃO é alcançável por
   tuning de shader — a geometria dos ~4 canais contínuos já está no
   envelope (0.087R); o resto é (a) o segmentador do `analyze.py`
   cortando em cada pinch de brilho e (b) contas curtas residuais.
   Caminhos reais: um modelo de canal por TRAÇADO/advecção contínua da
   linha neutra (mais físico), ou reduzir os pinches na origem. Alto
   valor, mais difícil.
2. **Gate H mal-calibrado** (barato e útil de fechar): `analyze.py` usa
   limiar de span 60px (~0.163R) ACIMA do envelope GONG (0.15R máx),
   então sub-reporta canais reais que ESTÃO no envelope (H lê 1-5 quando
   há ~4-12). Recalibrar o span do gate H para ~40px (~0.11R) e re-medir.
   Isso é ferramenta de QA, não o shader — mas destrava medir os outros.
3. **Complexo de loops ~0.3R beirando trança** (visto em 3/8 reloads, até
   17.6% de cobertura LOCAL transiente). Suprimir o adensamento sem
   apagar canais legítimos (limite de densidade local por vizinhança na
   colocação/seed?).
4. **"Respiração" ~6s do contraste das feições escuras** (pré-existente,
   baixa prioridade).
5. Qualquer novo bug report do dono entra no loop e re-prioriza.

## LIÇÕES DE HARNESS (economizam HORAS — o container é efêmero, re-derive)

- **Timing sob SwiftShader/ANGLE:** `gl.finish()` e `gl.fenceSync`+
  `clientWaitSync` NÃO bloqueiam de forma confiável (dão número falso —
  0.02ms ou o teto do spin). Use **`gl.readPixels(0,0,1,1,...)` como
  barreira de GPU** (leitura síncrona força a conclusão de todos os
  draws). Descubra format/type com `IMPLEMENTATION_COLOR_READ_FORMAT/TYPE`
  (os RTs são float/half). ISOLE cada passe: injete um hook
  `__solInfo.benchXxx(iters)` que renderiza SÓ aquela cena (chromo bake,
  passo do sim, smear) N vezes com a barreira readPixels e cronometra.
- **Whole-frame é RUIDOSO** (frames de vários segundos como outliers). Use
  a MEDIANA (p50) de deltas de rAF-consecutivos, nunca a média; o
  `__solInfo.perf().ms.avg` é contaminado pelos outliers.
- **Baseline SEMPRE = `origin/main` ATUAL** (git fetch antes; comparar
  com main obsoleto infla a regressão — foi o erro original do LOOP-8).
- Os shaders são arrays de string JS com `.join('\n')`; `.replace` em
  runtime é padrão estabelecido no código (ajuste `lic7` do chromo; e o
  split do shader de seed do sim) para derivar variantes enxutas sem
  duplicar o array.
- Tier via URL: `?tier=low|mid|high`. Sob SwiftShader o default é high;
  o sim é 768² em mid E high (mesmo custo), 384² em low. O chromo é
  512/1024/2048.

## ECONOMIA DE CONTEXTO (obrigatório — evitar context rot)

- A janela principal SÓ decide, edita e commita. TODA captura,
  profiling, medição e QA é de SUBAGENTES/WORKFLOWS, que devolvem
  vereditos ESTRUTURADOS CURTOS. Protótipos/tuning: 1 subagente por
  missão em cópias `debug-*.html` (gitignored), devolvendo as edições
  EXATAS (trecho atual→novo) para a principal aplicar sem ler o
  transcript.
- QA por iteração: um workflow com subagentes PARALELOS (qa clássico +
  auditor M2 de movimento + métricas de filamento; perf quando houver
  custo de shader). Re-autore o script inline via a ferramenta Workflow.
- Subagentes rodam Bash em FOREGROUND (síncrono, timeout até 600000ms).
  Jobs em background morrem em restarts.
- CUIDADO: o transcript de um subagente fica em ~128 bytes ATÉ concluir —
  sinal de vida é o PROCESSO (ps por node/chromium) + arquivos de saída,
  NÃO o mtime do transcript. Subagentes de workflow rodam Fable 5 e podem
  esgotar limite/falhar — nesse caso a principal (modelo maior) mede/faz
  a perf ela mesma com Playwright + os hooks readPixels.
- Agende check-ins de segurança (send_later ~28min) e retome subagentes
  mortos (mtime parado E sem processo E sem novos arquivos >12min) via
  SendMessage/resumeFromRunId.

## PROTOCOLO DE QA (o termômetro)

Igual ao LOOP-7/8: M2 com 12+ frames rAF-consecutivos speed=1 e 3,
rotação congelada (`setRotSpeed(0)`), diffs por região, strips julgadas;
gates A-I via `tools/qa-elements.js` + `tools/analyze.py` (2-3 amostras;
`analyze.py` PRECISA do 2º arg `reference/images/ref-01-fibrilas-mancha.jpeg`
e de PIL — `pip install --break-system-packages Pillow`; flakes conhecidos:
D-tufos ~1.7, I span, A 0.90-0.93 raro; gate H sub-reporta — ver resíduo
#2); `tools/qa-controls.js` 6/6; zero pageerror; neutralidade dos 6 knobs
cinema (veil/streak/adapt/fringe/shimmer/tone=0, adaptMul=1);
`__solInfo.perf()` + timing isolado por passe (razão por tier <10% vs
main atual). Filamentos: n de canais, cobertura %, largura, comprimento,
dominância hemisférica e IoU entre reloads, com segmentação estilo GONG
(medir no settle de ~8s = pico de visibilidade; o campo afina após ~40s).
Refs GONG H-alfa navegáveis em https://gong2.nso.edu/HA/hag/YYYYMM/YYYYMMDD/

## INVARIANTES (nunca regredir)

Arquivo único sem rede; zero pageerror; física existente nunca removida
(filamentos SÓ em linhas neutras do fluxo evoluído; proeminências
ancoradas em PIL; manchas nos pés das cargas; coroa/deriva/breathing/
flares∝atividade; fervura contínua do disco; coroa viva + twinkle; Via
Láctea cinematográfica; crossfade do bake sem pop/stall/jump; macro-
evolução MACRO_SLOW=0.15; pré-aquecimento da idade no seed via
`simSeedMaterial`); gates A-I PASS; controles + semântica "agarrar";
preset `?look=sunshine` intacto (re-julgar 1× ao final); caminho
UnsignedByte (GPU antiga) funcional na idade dos filamentos.

## INTEGRAÇÃO

~6-8 iterações ou resumo honesto; registro por iteração em
`docs/audit-motion.md`. Ao concluir cada peça VERDE: PR para `main` e
MERGE (permissão do dono já concedida; o Pages atualiza sozinho — pode
confirmar com grep no HTML servido). Nada valioso fica só em branch. NÃO
mesclar peça que reprove um gate sem justificativa explícita.

---

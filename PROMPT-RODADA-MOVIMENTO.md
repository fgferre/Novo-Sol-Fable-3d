# Prompt: RODADA DE MOVIMENTO — harness temporal (Bloco C, PR 3 de 3)

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: executar o **Bloco C do plano pós-roadmap** — o harness de
julgamento TEMPORAL. Todo julgamento visual do projeto até hoje foi em
STILLS; o ponto cego foi flagrado duas vezes (F4: "fios de ~1px do
fil-suave podem cintilar em movimento"; F5: streaks das partículas
nunca vistos em movimento). Este bloco constrói a régua, MEDE o estado
atual, e corrige só o que for barato — o resto vira débito documentado.
**Pré-requisitos: PRs da INFRA e da FASE 6 mesclados** (prompts
próprios). Fontes da verdade: `docs/roadmap-proximo-nivel.md`,
`docs/fase-4..6-*.md`, `README.md`. Não confie em memória de conversas
anteriores.

## MÉTODO / PERFORMANCE (diretrizes do dono)

Subagentes/workflows sempre que possível; painel de juízes como
Workflow. NÃO pedir FPS ao dono. MEDIR antes de mexer — os limiares
dos checks novos são calibrados no `main` ATUAL primeiro (baseline
temporal), nunca inventados.

## O DESENHO

Ambiente SEM ffmpeg (verificado) — solução 100% pngjs (devDeps já
existentes: playwright/pngjs/pixelmatch; nenhuma dependência nova de
runtime, convenção do projeto).

### `tools/qa-motion2.js` (vira `qa:motion2` no package.json)
Captura sequências de M frames (~48, det SEM hold — o relógio corre a
1/60 fixo) para cenários fixos:
1. fit idle (o quadro de descanso);
2. close-up de fibrilas (dof=0 e dof do preset);
3. flare grande + CME no limbo (`forceCME(0)` + janela do evento);
4. time-lapse do ciclo (`lapse=1`);
5. coroa volumétrica em wide (`cvol` do preset — os fios de 1px da F4).

Por cenário computa (pngjs, por pixel):
- **índice de flicker**: std temporal / média local (mapa + escalar
  p95 por região: disco, limbo, coroa, céu);
- **% de pixels estroboscópicos**: delta frame-a-frame acima de limiar
  SEM coerência de vizinhança (ruído que pisca ≠ estrutura que se
  move);
- **coerência de trajetória** (cenário 3): o delta médio ao longo do
  movimento das partículas deve ler como advecção, não chuvisco;
- **determinismo temporal**: 2 execuções do cenário 1 → 0px em TODOS
  os M frames.

### Contact sheets (o artefato julgável)
Tiras de filme (grade de N frames subamostrados + heatmap de flicker
ao lado) montadas com pngjs — é o que o painel de juízes (Workflow, 3
lentes: físico/cinema/artefatos) consegue LER; o julgamento temporal =
métricas numéricas + tiras. GIF/vídeo ficam de fora (sem ffmpeg e o
juiz-LLM não assiste vídeo).

### Fluxo
1. Rodar o harness no `main` atual → baseline temporal + tiras.
2. Painel de juízes sobre as tiras + métricas → lista de flags
   temporais com severidade.
3. Corrigir SÓ o barato/cirúrgico (ex.: amplitude de flicker de um
   termo procedural, damping de um ruído); mudanças em looks
   knob-gated revalidadas pelo painel; default segue bit-exato (A/B
   worktree 0px em 5/5).
4. Calibrar os limiares dos checks NO baseline pós-correções; o
   `qa:motion2` entra como gate de rodada (não de CI — é lento).
5. Registro: `docs/rodada-movimento.md` (baseline, flags, o que foi
   corrigido, o que ficou como débito) + roadmap + README.

## CONVENÇÕES / ARMADILHAS

As de sempre (LOOP-5+): default bit-exato provado por A/B worktree
`--max-frac 0`; gates herdados todos verdes (controls, parity,
phase1/3/4/5/6); capturas SwiftShader ~1s/frame — sequências de 48
frames custam ~1min/cenário, orçar o tempo; partículas do CME
integram (não saltam com setCmeClock — capturar o evento AO VIVO desde
o disparo); `?det=1&seed=7` sem hold para sequências; warmup de
pipeline antes de qualquer medição de perf; `sol-3d.html` da raiz é
legado congelado; 1 PR, merge no fim.

# Prompt: LOOP-8 — filamentos PROCEDURAIS (fidelidade física) + otimização

Copie o texto abaixo para iniciar uma conversa nova e limpa:

---

Missão: levar ao `main` o modelo 100% PROCEDURAL dos filamentos de
`./sol-3d.html` e seguir fechando os gaps de fidelidade física em
loop. Diretriz do dono (inegociável): o Sol é um modelo procedural que
respeita REGRAS FÍSICAS — nada pré-determinado/máscara estática.
Fontes da verdade: `docs/audit-motion.md` (nota "WIP nesta branch" no
topo + histórico do LOOP-7) e `PROMPT-LOOP-7.md` (protocolo de QA,
ferramentas, hooks, invariantes, especificidades do SwiftShader — tudo
continua valendo). Não confie em memória de conversas anteriores.

## ESTADO ATUAL (git)

- `main` @ `b6b3802` (PR #24): calibração dos filamentos contra o
  envelope real GONG já mesclada — resolve o bug VISUAL do agrupamento.
  Publicado em https://fgferre.github.io/Novo-Sol-Fable-3d/ (branch
  `gh-pages`, auto-sincronizada por `.github/workflows/pages.yml` a
  cada push em `main`).
- Branch de trabalho `claude/loop-workflow-subagents-dxe9id`, 3 commits
  À FRENTE do main (JÁ commitados e pushed, base desta missão):
  - `e23e12a` — modelo 100% procedural: (1) CISALHAMENTO (o campo
    horizontal deve correr AO LONGO da linha neutra; arcadas que cruzam
    são suprimidas), (2) MATURIDADE com memória (canal B da textura do
    sim = idade-EMA advectada de "é PIL cisalhada aqui?", com unsharp
    +0.5 anti-difusão bilinear e quantização estocástica 1/255 para o
    caminho UnsignedByte; pré-aquecimento no seed; critério de extensão
    ±0.04 rad ao longo do canal), (3) SEED POR CARGA (uSeedOff nos
    ruídos do campo-alvo do sim — layout único por visita).
  - `6e994c9` — perf: pilCrit/pilNow decimado a ~4Hz (uDoAge/AGE_EVERY)
    + taxas uAgeGrow/uAgeDecay por SEGUNDO de elapsed (iguais entre
    tiers, ~2x mais lentas → persistência de dezenas de segundos).
  - doc WIP.

Comece com `git fetch origin main` e desenvolva NESTA branch (rebase
em main se o main tiver avançado). Se a branch já foi mesclada, trate
como nova mudança a partir do main.

## BLOQUEIO A RESOLVER (iteração 1, prioritária)

**PERF do tier high.** Medição (HEAD da branch vs `main` atual,
SwiftShader, 3 reps, ms.avg/frame): tier **low +9.8%** (DENTRO da meta
de 10%), tier **high +21.5%** (FORA). A decimação já derrubou de
+30/+32% para cá; o custo restante é o cisalhamento + maturidade
rodando por TEXEL do bake 2048² SÓ no tier high (chromo fragment
shader, ~L855-920 de sol-3d.html). Ideias (medir cada uma isolada):
dobrar/baratear o cálculo de shear; simplificar a amostragem de
extensão (as 2 conversões atan/asin p/ uvA/uvB por fragmento são
caras); mover parte da maturidade para o passe do sim (768² << 2048²);
ou baixar o custo só no tier high (o alvo é a RAZÃO por tier <10% sem
piorar a fidelidade GONG). NÃO regredir a qualidade: envelope 6-15
canais finos/face, cobertura <1.5%, largura 0.005-0.012R, layouts
diferentes entre reloads (IoU <0.4), sem flicker, sem emaranhado.

Baseline de perf CORRETO = `origin/main` ATUAL (git fetch antes!). Um
run anterior comparou contra um main obsoleto e inflou a regressão.

## DEPOIS DO MERGE — seguir o loop (fidelidade)

Resíduos e melhorias documentados (re-medir contra o modelo atual, o
seed+idade já melhoraram vários): dominância hemisférica com n>=10
(estava 0.63, alvo <=0.8); complexo de loops recorrente ~0.3R que
beira trança; comprimento mediano dos canais um pouco curto
(0.06-0.10R vs 0.08-0.15 GONG); "respiração" lenta ~6s do contraste
das feições escuras (pré-existente). Também: qualquer novo bug report
do dono entra no loop. Re-priorizar a cada iteração.

## ECONOMIA DE CONTEXTO (obrigatório — evitar context rot)

- A janela principal SÓ decide, edita e commita. TODA captura,
  inspeção de imagem/strip, profiling, medição numérica e QA é de
  SUBAGENTES/WORKFLOWS, que devolvem vereditos estruturados curtos.
- Protótipos/tuning pesados: 1 subagente por missão, trabalhando em
  cópias `debug-*.html` (gitignored), devolvendo as edições EXATAS
  (trecho atual→novo) para a principal aplicar sem ler o transcript.
- QA por iteração: um workflow com subagentes PARALELOS (qa clássico +
  auditor M2 de movimento + perf quando houver custo de shader). Ver o
  formato no histórico do LOOP-7; re-autore o script inline via a
  ferramenta Workflow (o container é efêmero — não conte com arquivos
  de scratch de sessões anteriores).
- Subagentes rodam QA em FOREGROUND (Bash síncrono, timeout até
  600000ms). Jobs em background morrem em restarts.
- Agende check-ins de segurança (send_later ~28min) e, se um subagente
  morrer (mtime do transcript parado >12min, ou erro de API/limite),
  RETOME via SendMessage ou resumeFromRunId. CUIDADO: subagentes de
  workflow podem esgotar o limite do modelo (Fable 5) e falhar —
  nesse caso a principal (modelo maior) pode medir a perf ela mesma
  com o harness de Playwright, ou o dono repõe créditos.

## PROTOCOLO DE QA (o termômetro)

Igual ao LOOP-7 (ver PROMPT-LOOP-7.md): M2 com 12+ frames
rAF-consecutivos speed=1 e 3, rotação congelada, diffs por região,
strips julgadas; gates A-I via tools/qa-elements.js + tools/analyze.py
(2-3 amostras, flakes conhecidos do I ~1/3); tools/qa-controls.js 6/6;
zero pageerror; neutralidade dos 6 knobs cinema; __solInfo.perf()
antes/depois (razões por tier <10% sem justificativa — medir tier low
E o tier padrão=high sob SwiftShader). Filamentos: medir n de canais,
cobertura %, largura, dominância hemisférica e IoU entre reloads com o
mesmo pipeline de segmentação das refs GONG (arquivo público navegável
em https://gong2.nso.edu/HA/hag/YYYYMM/YYYYMMDD/ ...?h.jpg se precisar
re-baixar referências).

## INVARIANTES (nunca regredir)

Arquivo único sem rede; zero pageerror; física existente nunca removida
(filamentos SÓ em linhas neutras do fluxo evoluído, proeminências
ancoradas em PIL, manchas nos pés das cargas, coroa/deriva/breathing/
flares∝atividade, fervura contínua do disco, coroa viva + twinkle,
Via Láctea cinematográfica, crossfade do bake sem pop/stall/jump,
manchas esmaecendo no renascimento, MACRO_SLOW=0.15 da macro-evolução);
gates A-I PASS; controles + semântica "agarrar"; preset ?look=sunshine
intacto (re-julgar 1× ao final); caminho UnsignedByte (fallback de
GPU antiga) funcional na idade dos filamentos.

## INTEGRAÇÃO

~6-8 iterações ou resumo honesto; registro por iteração em
docs/audit-motion.md. Ao concluir cada peça VERDE: PR para `main` e
MERGE (permissão do dono já concedida; o Pages atualiza sozinho — pode
confirmar com grep no HTML servido). Nada valioso fica só em branch.
NÃO mesclar peça que reprove um gate sem justificativa explícita.

---

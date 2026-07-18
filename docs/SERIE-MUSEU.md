# Série Museu — Ledger vivo

Blueprint + placar da série "Museu de Ciência" derivada do plano
`crie-o-melhor-plano-valiant-steele.md`. Segue o mesmo padrão do
`REMEDIACAO.md` (ledger vivo, sobrevive a reset de contexto — a conversa
reinicia, este placar continua).

**Objetivo da série:** o Novo Sol tem uma camada educativa completa (visita
guiada, exploração livre, coleção, i18n PT/EN) construída sobre a simulação
física — mas ela está **trancada**: descoberta desligada por padrão, cena
default deliberadamente "crua", sem evidência real de que funciona num
iPhone. Esta série **destranca o museu**: liga a camada educativa por
padrão, prova cada etapa em viewport de iPhone real (390×844 e paisagem),
e cobre todos os fenômenos visíveis com a cadeia "sinal físico → texto
PT/EN → coleção → prova" — sem prometer na tela nada que a pessoa não
esteja, de fato, vendo.

**Régua wow-first (diretriz do dono, 2026-07-18):** "toda decisão deve ser
tomada com a ideia de que, se melhora UX/QA/UI e gera efeito wow, deve ser
tomada" — não recuar de inovação por dar trabalho. Os únicos limites que
vencem o wow: honestidade da regra do museu (nada prometido que não está
na tela), acessibilidade (texto legível/VoiceOver/reduced-motion),
paridade `?det=1`, e o piso de performance no iPhone (o auto-tune
protege).

---

## Painel de status

Legenda status: ⬜ pendente · 🚧 em andamento · ⏸️ aguardando aceite do dono · ✅ merged

| PR | Título | Escopo | Gate 🟢 | Aceite 🟣 | Status |
|----|--------|--------|---------|-----------|--------|
| 1 | Porta e placa | Marca única no HTML ("SOL — uma estrela viva"), chip "▶ Visita guiada" no palco, hint em fonte única, meta/OG | baselines regeneradas por decisão de marca com prova cirúrgica (0 px de diff fora das regiões de título/hint nos 5 shots — o Sol é bit-idêntico); chip visível em 390×844, ≥44px, sem intersectar o disco, some ao iniciar a visita e não insiste depois da 1ª visita | "Abra em aba anônima no iPhone: título 'SOL — uma estrela viva'; chip 'Visita guiada' embaixo; um toque inicia a visita sem abrir a engrenagem." | ✅ merged (PR #61 + correção #PR-1b; ver Incidentes) |
| 2 | Blindagem | Try/catch com telemetria nos ticks edu, memoização do cartão, fix de landscape, fix da deriva idle na visita, prévias do painel desligadas durante a visita, restauração suave de pose, safe-area | qa:tour verde + checks novos (`faults===0`; pose restaurada); qa-ab base-vs-head pixel-0 | "Faça a visita e saia no meio: a câmera volta suave para onde estava." | ⬜ pendente |
| 3 | Go-live das descobertas | Default de `edu` passa a ligado fora de `det` (função det-aware, padrão `cycle`); URL/storage continuam vencendo | parity intacta por construção (edu inerte sob det); qa:edu/qa:tour verdes | "Abra em aba anônima: em 1-2 min um cartão de descoberta aparece sozinho quando algo acontece no Sol." | ⬜ pendente |
| 4 | O Sol completo por default | Defaults det-aware para física (spots/loops/fprom/cme/cvol) e para o cinema acoplado a eventos (burst/adapt/disp/hal/shimmer); blindagem de baselines (knobs visuais pinados na URL do parity) | baselines históricas intocadas; nova família de baselines "museu" estável; asserts de default atualizados | "Abra no iPhone e só observe 2 min: manchas com plages, arcos magnéticos e coroa aparecem sozinhos; quando vier um flare, a tela explode num starburst e a exposição respira." | ⬜ pendente |
| 5 | Abertura cinematográfica | Plano-sequência de ~5s no primeiro acesso, cinematografia da visita (ease + halo 3D de destaque), sessão de cinema oferecida ao fim da visita | parity intacta (intro inerte sob det); qa:tour com checks de transição (pose converge, sem overshoot); reduced-motion pula a abertura | "Abra em aba anônima no iPhone: o site COMEÇA com um plano-sequência que revela o Sol; na visita, um brilho marca o que o texto descreve; ao terminar, a sessão de cinema é oferecida." | ⬜ pendente |
| 6 | Prova mobile + CI reorganizado | qa:tour com touch real + UA iPhone, 44px e pausa por etapa, passada em `tier=mid`, landscape completo no gate, DPR3, gate de coroa por fótons, controles negativos por gate, legibilidade, CI em jobs paralelos + nightly + `regen-baselines`, checklist iPhone | checks novos + wall do workflow ≤30 min por job | "kicker ≥10px aprovado + primeira execução do checklist iPhone." | ⬜ pendente |
| 7 | `phenomena.js` | Módulo único da física observável (`flare/cme/spots/prominence/loops/corona/cycle`), construído sempre (inclusive sob det); migração de `tour.js` e dos emissores de `main.js` | qa-ab pixel-0 (criar o módulo não muda um LSB); `faults===0`; suíte completa verde | sem aceite visual próprio — é refactor interno; verificado pelo gate 🟢 e pelos PRs 8-10 que passam a consumir o módulo | ⬜ pendente |
| 8 | Onda 1 — loops e coroa | Emissor espontâneo de loops coronais, emissor de coroa via `phenomena.corona`, famílias novas na coleção (5→8), controles negativos | qa:edu estendido + idempotência | "Explore até um cartão 'Loops coronais' aparecer sozinho; a coleção mostra 8 famílias." | ⬜ pendente |
| 9 | Onda 2 — granulação e espículas | Descoberta por aproximação (`camDist` cruza limiar), POI de espículas no limbo | legibilidade em 390×844 + regras de âncora + controles negativos | "Aproxime bem: um cartão explica a granulação; chegue à borda: espículas." | ⬜ pendente |
| 10 | Onda 3 — buracos coronais e plumas | Marcador semântico `coronaHoleDir`/`strength` publicado no bake atômico do volume coronal; cartão + prova white-box + controle negativo (depende do `cvol` default-on do PR-4) | `npm run qa:ci` verde + prova white-box do marcador + controle negativo | "No mínimo do ciclo, as regiões escuras da coroa ganham nome." | ⬜ pendente |
| 11 | i18n completo | `STRINGS[lang]` para o painel inteiro, labels do schema por lookup, strings da coleção movidas para `content.js`, persistência central de `solKnobs` | prova de que trocar idioma varre o painel inteiro sem string PT residual (walk do DOM) | "Mude para EN: absolutamente tudo muda." | ⬜ pendente |
| 12 | Coleção completa + postal | Cartão único de conclusão da coleção; postal (captura do canvas sem `preserveDrawingBuffer`, Web Share com fallback de download) | `npm run qa:ci` verde + prova de captura do postal (canvas→imagem) | "Complete a coleção: a recompensa aparece uma vez; 'guardar esta vista' gera a imagem do SEU Sol." | ⬜ pendente |
| 13 | Quiosque | `?kiosk=1`: auto-inicia a visita após N s de idle, loop com sessão de cinema intercalada, desliga o gesto de HUD e o painel | `npm run qa:ci` verde + prova do auto-start/loop em `?kiosk=1` | "Abra o arquivo `sol-3d.html` num tablet sem internet: a visita roda em loop sozinha e um toque devolve o controle." | ⬜ pendente |

---

## Regras da série

- **1 PR por vez, sequencial.** Ordem = a dos 4 blocos do plano (destrancar
  → evidência iPhone → cobertura em ondas → alcance e memória). Vários PRs
  tocam os mesmos arquivos (`tour.js`, `edu.js`, `main.js`, `controls.js`)
  e alguns recalibram baselines — por isso não dá pra paralelizar.
- **Paridade `?det=1` nunca quebra.** É invariante da série inteira, não
  só de um PR: qualquer mudança de default, cinema ou descoberta tem que
  deixar o modo determinístico bit-idêntico ao que já existia. Exceção
  única e documentada: mudança DELIBERADA de texto/marca no chrome (que é
  capturado nos screenshots) exige regenerar baselines COM prova cirúrgica
  de que nenhum pixel fora da região de texto mudou — foi o caso do PR-1
  (título/hint; 0 px de diff fora dessas regiões nos 5 shots).
- **A camada educativa é inerte sob `det` por construção**
  ([edu.js:9](../src/edu/edu.js), [tour.js:25](../src/edu/tour.js)) — os
  PRs de go-live (3, 4, 5) ligam defaults só fora de `det`; o mecanismo já
  existe (`function(ctx){ return ctx.DET ? 0 : 1 }` em
  [controls.js:188-195](../src/core/controls.js)) e não move um byte das
  baselines quando usado.
- **Aceite do dono com passo literal.** Cada PR com gate 🟣 vem com o texto
  exato de "abra X, veja Y" — o dono só confirma sim/não, nunca julga
  números.
- **Auto-merge em CI verde autorizado.** Herdado do padrão da série
  anterior de remediação: push + PR + auto-merge quando o CI fica verde,
  sem gate do dono para o merge em si. Os gates 🟣 (visuais) podem ser
  assíncronos — registro antes/depois na issue/PR, aprovação depois.

---

## Incidentes e lições

**PR-1 (2026-07-18) — merge com CI vermelho + baselines dependentes de fonte.**
O `gh pr merge --auto` mergeia NA HORA quando o repositório não tem checks
obrigatórios — o PR-1 entrou no main com a paridade vermelha. Causa da
vermelhidão: as baselines tinham sido regeneradas na máquina local (fontes
Windows/Segoe UI), mas o gate renderiza no ubuntu (Liberation) — o texto DOM
do título/hint rasteriza diferente por SO. Correção (PR-1b): (1) `imgdiff.js`
ganhou `--mask x,y,w,h` e o gate mascara as DUAS faixas de texto (título
`0,0,620,130` e base `0,-90,9999,90`) — o render da estrela continua
comparado pixel a pixel e provou-se bit-idêntico entre Windows e ubuntu
(0 px com máscara); (2) baselines canônicas = capturas do PRÓPRIO gate
(artifact do CI); (3) workflow `regen-baselines.yml` (dispatch) é o caminho
oficial de regeneração. Regras novas da série: **nunca regenerar baseline de
máquina local**, e **merge manual após CI verde** até existir check
obrigatório no branch main.

---

## Como acompanhar

- **Local:** `npm test` (roda `qa:ci` — build normal + arquivo único,
  controles, funcionais rápidos, paridade estática).
- **CI:** [`.github/workflows/qa.yml`](../.github/workflows/qa.yml) roda em
  todo push/PR (build Vite + regressão de paridade visual em SwiftShader +
  QA de controles).
- **Deploy:** GitHub Pages publica automaticamente `dist/` + `dist-single/`
  do SHA testado sempre que o QA fica verde em `main` (workflow
  `pages.yml`, disparado via `workflow_run` do QA).

Cobertura de fenômenos é atualizada em paralelo em
[`docs/MUSEU_SOL_COBERTURA.md`](MUSEU_SOL_COBERTURA.md) a cada PR de
cobertura (blocos 3 e além).

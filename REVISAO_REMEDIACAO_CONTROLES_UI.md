# Revisão independente da remediação de controles de UI

> **Para**: a IA responsável pela série `8235469..12041ed` (PR1–PR7 de controles de UI).
> **Objeto**: o estado mergeado no `main` (`28fcff7` = `12041ed` + docs), revisado contra a base `0113673` e contra `AUDITORIA_CONTROLES_UI.md`.
> **Método**: leitura integral do diff e dos arquivos, rastreamento de todos os achados até código executável (consumidores, gates, shaders, DOM, persistência), verificação adversarial multi-agente (cada achado passou por um verificador instruído a refutá-lo), e execução real do build + das 5 suítes novas de QA em Chromium/SwiftShader (todas verdes; ambiente limpo ao final).
> **Regra desta revisão**: documentos, comentários, mensagens de commit e nomes de teste foram tratados como alegações; só entrou aqui o que foi confirmado no código. Cada item traz `arquivo:linha`.
> **Motivação original (não perder de vista)**: o usuário mexia em controles e **não percebia mudança nenhuma** no visual/comportamento. Todo julgamento abaixo é contra esse objetivo, não contra conformidade formal com a auditoria.

---

## 1. Veredicto executivo

A série é uma remediação substantiva e de boa qualidade. Os seis P0 da auditoria têm implementação real e rastreável; o store/schema central (`src/core/controls.js`) é um ativo genuíno; a camada de comunicação ("por que este controle não faz nada agora") ficou boa; as prévias disparam eventos físicos reais.

Porém:

1. A série **introduziu um defeito novo exatamente da classe que devia eliminar** (zona morta silenciosa: `cycle` vira no-op com `lapse>0`).
2. **Altera silenciosamente valores persistidos e o preset calibrado** (bloom, pmode, hand, arcadas do Sunshine) sem migração nem registro de decisão.
3. Parte do QA novo é **estrutural/circular**: valida o encanamento do store, não o consumidor final. Em particular, **a queixa nº 1 do usuário (Bloom imperceptível) segue sem nenhuma prova no pixel final**.
4. A percepção do usuário foi tratada por *exposição de parâmetros de engine* (35 sliders, +3 vs antes), não por redesign do modelo mental. A seção 5 propõe a direção de UX decidida com o usuário.

## 2. Confirmado como cumprido — não retrabalhar

| Item | Evidência |
|---|---|
| P0.1 Guard de teclado (série anterior, preservado) | `src/camera/controls.js:208-216` |
| P0.2 CME/CVOL com reasons `tier-unavailable`/`autotune-disabled`/`preparing`, slider desabilitado preservando nominal | `src/core/controls.js:78-92`, painel; testado em DOM real |
| P0.3 Diretor: URL e botão no mesmo `directorStart()`; overrides com dono no store; editar encerra o diretor; reset recarrega limpo | `src/camera/director.js:40-47,133,151` |
| P0.4 `fprom` 0..1 + renomeado; `min(1,·)` do consumidor ficou inerte | `src/main.js:573` |
| P0.5 `stars` sem saturação precoce (remap por partes, contínuo em v=1) | `src/core/controls.js:44-57` |
| P0.6 As 11 divergências de range da tabela §8 unificadas | schema completo |
| HUD long-press ↔ switch sincronizados por um único setter | `src/core/perf.js:48-54`, `src/ui/panel.js:218` |
| Auto-tune não persiste mais tier silenciosamente (vira recomendação + botão) | `src/core/perf.js:85-100` |
| Diretor em base de tempo única (`delta` simulado em beats E câmera) | `src/camera/director.js` inteiro |
| Paridade do frame default (bloomGain(1)=1, knee 0.3 ≡ smoothstep antigo, spread 1 ≡ offsets antigos, grainGain(1)=1, stars v=1 idêntico) | verificação analítica ponto a ponto |
| P2: schema único, setter central, switches/engrenagem semânticos, transição CSS corrigida, comentário "14 pares" eliminado | `src/core/controls.js`, `src/ui/panel.js` |
| Suítes novas: 56 checks, todos verdes em execução limpa do zero | `qa-control-state` 14/14, `qa-time` 9/9, `qa-bloom` 7/7, `qa-events` 14/14, `qa-subtle` 12/12 |

## 3. Defeitos e riscos confirmados (em ordem de prioridade)

### R1 [ALTA] `cycle` ("Profundidade do ciclo") é no-op silencioso com `lapse>0`

- `cycleDepth()` retorna `1.0` incondicionalmente quando `LAPSE_K>0.001` (`src/sim/activity.js:61`); antes só forçava 1.0 com `cycle≈0`. Busca exaustiva: **nenhum consumidor de `CYCLE_K` sobrevive** com lapse ligado (cycleAmpK/cyclePolF/Spörer/Hale/gate do relógio passam todos por `cycleDepth()`; a velocidade lê só `LAPSE_K`).
- Agravantes: `cycleCondition` devolve `effective:1, reason:''` (`src/core/controls.js:107-111`) — o painel não explica nada; o sweep de zona morta varre um controle por vez com os demais no default e a métrica ecoa `CYCLE_K` cru, então o QA não detecta (`tools/qa-control-state.js:65-84`, `controls.js:129`).
- **Correção sugerida**: `depth = max(min(1,CYCLE_K), lapse>0 ? 1 : 0)` foi a escolha atual; troque por manter `min(1,CYCLE_K)` como profundidade sempre, com `lapse>0 && cycle==0` (e só nesse caso) elevando para 1 — ou, se a fusão dos dois sliders da seção 5 for adotada, o problema desaparece por construção.
- **Aceite**: com `lapse=0.5`, varrer `cycle` 0→1 muda `cycleAmpK` de forma monotônica; QA cobre a combinação.

### R2 [MÉDIA] `bloomGain` altera looks persistidos e o preset sem migração

- `bloomGain(v)=v≤1?v:1+2(v−1)` (`src/core/controls.js:25`) aplicado sobre `solKnobs` cru, sem migração (`controls.js:202-221`). Preset Sunshine `1.15` passou de força `×1.15` para `×1.30` (+13% sobre o look julgado); `bloom=2.5` salvo na era antiga vira ganho `4.0` (×1.6). O mesmo padrão retroativo vale para `pmode`/`hand` dobrados no PR7.
- **Correção sugerida**: migração one-shot no boot (se `solKnobs.bloom>1` e sem flag de versão, converter para o valor que preserva a força antiga: `v' = 1+(v−1)/2`; análogo para pmode/hand), OU recalibrar o preset (`bloom: 1.075` reproduz a força antiga) e registrar a decisão em `REMEDIACAO.md`.
- **Aceite**: boot com `solKnobs` da era antiga produz `BLOOM_STRENGTH_BASE`/`uPmode`/amplitudes de hand iguais aos da base `0113673`, ou decisão contrária documentada.

### R3 [MÉDIA] Arcadas: default do produto mudou e Sunshine descalibrou — decisão não registrada

- `loops` virou master (`src/atmosphere/loops.js:571`) e os envelopes multiplicam `LOOP_K` (`loops.js:685,692`). Consequências: (a) **default (`loops=0`) perdeu as arcadas pós-flare** — feature default deliberada da fase anterior; (b) Sunshine (`loops=0.55`) tem arcadas 45% mais fracas que o look julgado; (c) `loops=1.5` → 1.5× acima de qualquer calibração (em `loops=1`, paridade exata com o antigo).
- A auditoria sancionava gatear como uma de duas opções — a escolha é legítima, mas precisa ser **registrada como decisão de produto** e o Sunshine possivelmente recalibrado (ex.: `loops: 1.0` no preset, ou envelope de arcada com piso).
- Cobertura: só resta teste negativo (`B5`, cancelamento); **nenhum teste positivo de arcada existe fora de `loops=1`** (`tools/qa-phase1.js:109-134`, `qa-phase4.js:225`).
- **Aceite**: decisão escrita em `REMEDIACAO.md`; se mantida, preset Sunshine re-julgado ou compensado.

### R4 [MÉDIA] Bloom sem prova no pixel final — a queixa original segue sem verificação

- O check "autoridade 5×" do `qa-bloom` é identidade aritmética: `energy = spread.energy × BLOOM_STRENGTH_BASE` (`src/post/pipeline.js:329`) multiplica em JS o escalar que o próprio slider escreve; sob `?hold` a razão 5 sai por construção. O check passaria mesmo se `uBloomStrength` nunca chegasse ao composite (`src/main.js:693`).
- **Nenhum teste da série varia o slider `bloom` e lê o framebuffer final.** Os checks de threshold/knee/spread são readbacks GPU reais e valem; o de intensidade, não.
- **Correção sugerida** (~20 linhas): no `qa-bloom`, screenshot do canvas em `bloom=0/1/3` (mesma cena, `?hold`), assert de diferença de pixels crescente e não trivial entre os três. Idealmente também um caso com `bloomth=0.4` para provar a perceptibilidade da combinação.
- **Aceite**: teste falha se o composite ignorar `uBloomStrength`.

### R5 [MÉDIA] Auto-tune: kill e recomendação invisíveis com painel fechado e voláteis

- `onPerformanceStateChange` é no-op com painel fechado (`src/ui/panel.js:191`); `cmeKilled/cvolKilled/recommendedTier` vivem só em memória — **a cada reload a degradação recomeça do zero**. Não há reativação individual de um kill (auditoria pedia "reativação/reload explícito"); só reset total ou troca de tier.
- **Correção sugerida**: persistir kills/recomendação (com carimbo de sessão) ou ao menos badge/aviso fora do painel; ação "reativar" por controle na linha de estado.
- **Aceite**: kill sobrevive a reload OU é sinalizado no primeiro frame pós-degradação mesmo com painel fechado; existe caminho de reativação sem apagar os knobs.

### R6 [MÉDIA] `bloomspread` muda de semântica quando `disp` liga; caminho espectral sem QA

- Com `disp=0` o upsample é passthrough e `uSpread` só escala o downsample; com `disp>0` escala também os taps do upsample em todos os níveis (`src/post/pipeline.js:105-107,152-154,171`). No Sunshine (`disp=0.40`) o knob dobra de braço discretamente. `qa-bloom` só testa spread com `disp=0` (`tools/qa-bloom.js:66-71`). Risco adicional: `spread≥1.5` amostra fora do footprint do downsample (undersampling nos extremos do range 0.5..2.5).
- **Aceite**: ou normalizar a semântica (spread age igual nos dois branches), ou documentar e cobrir `spread×disp` no QA; validar visualmente `spread=2.5` em GPU real.

### R7 [MÉDIA] Arestas das prévias de evento (código novo do PR6)

- `canPreviewCME` **não tem** a guarda `surfFlareT<8` que `canPreviewBurst` tem (`src/surface/flares.js:121-127` vs `:109-113`): prévia de CME durante flare em voo reinicia e realoca o flare.
- Acoplamento quadrático: `amp = getControl(knob)` vira amplitude do flare **e** ganho (`flares.js:117,133-134`); em `burst=0.15`, `uBurst≈0.033` (~3–7% do típico) — o evento dispara e é invisível, recriando a queixa original dentro da ferramenta que devia curá-la.
- `previewRegion` escolhe região só por facing, sem checagem de vida — flare pode nascer em região no piso residual, sem plage/mancha (`flares.js:88-99`). (O diretor tem o mesmo problema, mas é herdado da base.)
- `previewBurst/previewCME` chamam `directorUserExit` **antes** de validar: clique de prévia que falha ainda mata a sequência do diretor (`flares.js:115-116,130-131`).
- **Correções**: guarda de flare ativo no CME; amplitude fixa boa (ver seção 5, R-UX1); validar antes de encerrar o diretor.

### R8 [BAIXA] `cmeCondition` ignora cooldown (camada programática)

- Por ~12 s pós-evento, `getControlInfo('cme').reason` diz `waiting-flare` enquanto `maybeLaunchCME` está bloqueado por cooldown (`src/core/controls.js:86-92` vs `src/atmosphere/cme.js:109,118`). O painel visível não é afetado (o `syncAction` sobrescreve com "aguarde o rescaldo"), mas QA/consumidores programáticos veem motivo errado.
- **Correção**: adicionar branch `cooldown` em `cmeCondition`.

### R9 [BAIXA] Itens da auditoria que ficaram de fora (backlog explícito)

Confirmado que não foram implementados: dependência de `veil/streak/disp/hal` da pirâmide do Bloom não exposta (nem condition nem estado — §9.4/P1.4); `cact`/`ray` sem exposição de `uActivity` efetiva; `plageglow` sem indicador de cobertura; label "Câmera contemplativa" segue ambíguo (deriva idle básica roda com switch desligado, `src/main.js:675-682`); painel não mostra slots/fila de loops; `speed` sob `?hold` inerte sem indicação. Tratar como backlog consciente ou absorver no redesign da seção 5.

### R10 [BAIXA] Higiene/manutenção

- Fórmula `1+39·√lapse` duplicada entre física e store (`src/sim/activity.js:55-57` vs `src/core/controls.js:104-106`); easing `(mul−1)/8` triplicado. Se a física mudar, painel/`controls()` divergem em silêncio — unificar no `ctx.act`.
- Curva das estrelas duplicada (`src/scene/stars.js:92-100` ≡ `controls.js:48-57`); init de `uGrain` usa knob cru vs setter com `grainGain` (`src/post/pipeline.js:383` vs `controls.js:67-69`) — não chega a pixel (o `activateControlTargets` reaplica antes do 1º frame) mas vaza para o manifesto `?diag=1`.
- API morta nova: `ctx.syncControlUI` e `ctx.controlPanel` sem nenhum consumidor (`src/ui/panel.js:189,270`).
- Beat B5 do diretor: `setControlOverride` por frame (~840 chamadas/volta) com clamp+apply+notify+escrita de DOM mesmo com painel fechado — adicionar guarda de mudança de valor.
- A11y do drawer: `div` com `aria-label` sem `role` (nome não exposto de forma confiável), sem Escape, sem gestão de foco (o botão do diretor fecha o painel com `inert=true` derrubando o foco para o body).
- Risco latente de boot: default de `bloomth` lê `ctx.isHDR` e `ensure()` memoiza; acesso prematuro (hoje inexistente) memoizaria 0.82 em máquina HDR. Não é bug ativo; vale um comentário-guarda ou default resolvido tardiamente.

### R11 [BAIXA] QA estrutural prometendo mais do que verifica

O sweep de "faixa plana silenciosa" (`tools/qa-control-state.js:65-84`) roda num único `evaluate` síncrono sem renderizar frame; para ~todos os controles a métrica lê o mesmo slot que o setter escreveu — prova injetividade store→uniform, não resposta de consumidor, e não varre combinações (por isso não pegou R1). É útil; só renomear a intenção no cabeçalho e complementar com os testes de pixel de R4.

## 4. O que não foi provado (limites desta revisão)

- **Percepção visual humana**: tudo foi estático/numérico + SwiftShader. A perceptibilidade do Bloom pós-ACES na tela, e o novo look do Sunshine (+13% bloom, −45% arcadas), não têm julgamento visual registrado.
- **GPU real**: branch `step()` do knee=0 e `spread` extremo podem se comportar diferente em driver NVIDIA.
- **Auto-tune sob pressão real de perf**: analisado por rastreamento de código, não reproduzido.

## 5. Redesign de UX recomendado (decidido com o usuário — tratar como requisito de produto)

A causa-raiz da queixa não é só amplitude: o painel é um **painel de calibração exposto a leigo** (35 sliders, incluindo threshold/knee/spread do Bloom, que são parâmetros de engine). Direção acordada:

### R-UX1: eventos viram botões de primeira classe
- "Disparar flare" e "Ejetar CME" como botões (a infra já existe e funciona: `previewBurst/previewCME` disparam o caminho físico real).
- **Amplitude fixa boa (1.0–1.35, como o diretor usa)** — desacoplar do valor do slider (resolve o item quadrático de R7).
- Botão sempre visível; quando bloqueado, estado claro (cooldown com contagem, tier, kill).
- Opcional de alto valor: mirar a câmera na região escolhida ao disparar (reutilizar `dirAimAt`; a prévia já calcula a direção).
- O slider atual de burst/cme, se sobreviver, vira "frequência/ganho de eventos espontâneos" no painel avançado.

### R-UX2: painel em duas camadas via schema
- Campo `audience: 'basic'|'advanced'` no schema. Painel simples default: **Eventos** (botões) · **Tempo** (um seletor só: Normal / Acelerado ~10× / Time-lapse ~40× — funde `cycle`+`lapse` e elimina R1 por construção) · **Aparência** (presets + 2–3 macro-controles, ex.: "Glow" agrupando bloom+halo) · **Câmera** (contemplativa, diretor, aproximar). Os 35 sliders atuais ficam intactos atrás de um toggle "ajuste fino".

### R-UX3: explicações leigas com "?" (padrão de tooltip da indústria, adaptado a touch)
- Campo `description` no schema (uma linha por controle, formato fixo: *o que é* + *o que esperar* + *quando não faz nada*), renderizado por um botão "?" por linha.
- **Ponteiro fino**: tooltip em hover **e** focus de teclado (estender o `aria-describedby` já existente). **Ponteiro grosso (touch é público primário — iPhone)**: tap expande/recolhe inline com `aria-expanded`; nunca tooltip flutuante em celular.
- Separação de responsabilidades: o "?" carrega o texto estático; a linha `.state` existente continua com o dinâmico ("aguardando flare", "40× · ciclo em ~45 s").
- Renomear jargão: Bloom → "Brilho difuso (glow)", p-modes → "Pulsação da superfície", Grade Sunshine → "Tons de cinema", etc.
- Exemplo do tom: *Brilho difuso (glow)* — "Sangramento de luz das áreas mais quentes. No Sol calmo quase não há área assim — dispare um flare para ver a diferença." (Isso resolve por UX o que a engenharia não resolve: Bloom parecer morto no default é fisicamente correto dado o threshold; o painel deve dizer isso e oferecer o botão de flare ao lado.)

## 6. Plano de ação sugerido (ordem)

| # | Ação | Cobre | Esforço |
|---|---|---|---|
| 1 | Teste de pixel do Bloom (screenshot em 0/1/3) | R4, R11 | pequeno |
| 2 | Fix `cycle` sob lapse (ou fusão R-UX2-tempo) + QA da combinação | R1 | pequeno |
| 3 | Migração/recalibração de persistidos e preset (bloom/pmode/hand/arcadas) + registro da decisão das arcadas | R2, R3 | pequeno |
| 4 | Guardas das prévias (flare ativo no CME; validar antes de `directorUserExit`) + reason `cooldown` no `cmeCondition` | R7, R8 | pequeno |
| 5 | Botões de evento com amplitude fixa (+ mira de câmera opcional) | R-UX1, R7 | médio |
| 6 | `description` + "?" (hover/focus + tap-expand) e renomeações | R-UX3, R9 parcial | médio |
| 7 | `audience` basic/advanced + seletor único de tempo + macro-controles | R-UX2, R1 | médio/grande |
| 8 | Persistência/sinalização do auto-tune + reativação individual | R5 | médio |
| 9 | Higiene: fórmulas unificadas, API morta, guarda no B5, a11y do drawer, semântica do spread | R6, R10 | pequeno, distribuído |

Critério transversal de aceite para toda a série seguinte: **nenhum check novo pode validar apenas instrumentação criada para ele** — todo controle/botão precisa de pelo menos um assert no consumidor real (pixel, uniform consumido por draw executado, ou DOM visível ao usuário).

# Auditoria final de knobs e controles de UI — análise exclusiva de código

> Revisão 2: atualizada após meta-auditoria independente e nova conferência dos achados adjacentes no código.

## 1. Objetivo

Este relatório verifica se cada controle exposto pela interface:

1. recebe eventos da UI;
2. altera um estado vivo;
3. chega a um consumidor de simulação, câmera ou renderização;
4. possui amplitude e suporte espacial/temporal capazes de produzir resposta relevante;
5. não é anulado por thresholds, clamps, tone mapping, tier, enquadramento, eventos ou estados internos;
6. mantém a UI sincronizada com o estado realmente utilizado.

O relatório foi preparado para servir de entrada a outra IA encarregada de corrigir a implementação.

## 2. Restrições e significado das conclusões

- A auditoria foi feita exclusivamente por leitura, rastreamento e avaliação matemática do código.
- Não foram usados screenshots, inspeção visual, comparação de imagens ou julgamento estético.
- O build `npm run build` foi executado e concluído sem erro.
- “Perceptível” neste documento significa: o código produz uma diferença com amplitude, área ou duração razoáveis para sobreviver às etapas posteriores do pipeline. A percepção humana definitiva ainda não pode ser provada apenas estaticamente.
- Estimativas numéricas derivadas das equações do shader são identificadas como estimativas; gates, clamps e caminhos de execução são conclusões exatas.

## 3. Escopo inventariado

### 3.1 Sliders

Foram encontrados 32 sliders em `src/ui/panel.js`:

- Tempo: 5.
- Luz e cor: 6.
- Cinema: 12.
- Coroa: 7.
- Céu: 2.

Todos compartilham o listener `input` de `src/ui/panel.js:212-216`. Nenhum dos 32 é totalmente órfão no nível de conectividade. Isso, porém, não significa que todos tenham resposta efetiva.

### 3.2 Outras ações de UI

- Engrenagem de abrir/fechar painel.
- Switch Câmera contemplativa.
- Botão aplicar look Sunshine.
- Botão modo diretor.
- Switch HUD de FPS.
- Quatro botões de tier.
- Botão restaurar padrão.
- Gestos de órbita, zoom, enquadramento e HUD.
- Atalhos de teclado.

## 4. Critério de classificação

| Classe | Significado |
|---|---|
| **A — resposta robusta** | Caminho direto, área/amplitude relevante e sem depender de evento raro. |
| **B — resposta localizada ou sutil** | Funciona, mas afeta uma máscara pequena, movimento lento ou poucos níveis tonais. |
| **C — condicional/atrasado** | Pode ser exatamente zero no estado corrente, depende de tempo, enquadramento, tier, orientação ou evento. |
| **D — defeito funcional de UI** | Há zona morta, estado enganoso, conflito de eventos ou controle habilitado sem consumidor efetivo. |

Uma mesma entrada pode receber mais de uma classe, por exemplo `C/D` quando o efeito é legitimamente condicional mas a UI não comunica a condição.

## 5. Resumo executivo

### 5.1 Conclusão principal

Os 32 sliders estão conectados a algum estado, mas a UI não oferece 32 respostas perceptivas confiáveis.

Distribuição aproximada pelo código:

- 10 controles com resposta ampla ou forte.
- 14 controles localizados, deliberadamente sutis ou dependentes de outra camada.
- 8 controles capazes de produzir resposta nula ou muito atrasada no momento da manipulação.

### 5.2 Achados de maior prioridade

1. **Bloom está perceptualmente subalimentado.** O slider só multiplica um bright-pass já muito seletivo e o ACES comprime a resposta.
2. **Coroa volumétrica e CME são no-op no tier `low`**, mas continuam habilitados e persistindo valores.
3. **As setas dos sliders conflitam com o listener global da câmera**, que chama `preventDefault()`.
4. **Modo diretor dessincroniza UI, estado runtime e persistência** para CME, DOF e LAPSE; o caminho `?director=1` ainda difere do botão do painel.
5. **Filamento ↔ proeminência tem zona totalmente morta de `1,0` a `1,5`.**
6. **Estrelas satura antes do fim:** estrelas brilhantes em `1,25`, normais em aproximadamente `1,82`; de `~1,82` a `2,0` nada muda.
7. **Ciclo de 11 anos quase não responde ao ser ligado:** na fase inicial altera a atividade em apenas ~2,83%, leva 1.800 s e valores até `1` não aceleram o relógio.
8. **Há 11 divergências entre ranges de URL/configuração e ranges do painel**, permitindo que a UI mostre um valor diferente do utilizado.
9. **O slider Loops coronais não controla todas as estruturas que o nome sugere:** loops ambientes obedecem ao knob, mas arcadas pós-flare podem aparecer com `loops=0`.
10. **O switch visual do HUD pode divergir do HUD real** depois de um long-press no canvas.

## 6. Análise individual dos 32 knobs

## 6.1 Tempo

### 1. Ritmo do tempo (`speed`)

- UI: `0,05..2`, default `1`.
- Estado: `ctx.TIME_SCALE`.
- Consumidor: `delta = rawDelta * ctx.TIME_SCALE` em `src/main.js:282`.
- Efeito: altera rotação, simulação, bakes temporais, regiões, flares, loops e outros sistemas baseados em `delta`.
- Autoridade: razão de 40× entre mínimo e máximo do painel.
- Limitação: câmera, inércia, zoom e scheduler da coroa usam `rawDelta`; portanto não seguem o knob.
- O diretor mistura as duas bases: `dirT` avança com `delta`, mas suas interpolações de câmera usam `rawDelta`. Com `speed!=1`, os beats mudam de duração sem que as constantes de aproximação acompanhem, podendo fazer a câmera chegar menos ou mais perto dos alvos previstos.
- Condição especial: com QA determinístico congelado por `?hold`, `rawDelta=0`; o knob fica sem efeito.
- Classificação: **A**, com exceção do modo hold.
- Recomendação: manter, mas documentar que não controla a resposta da câmera nem schedulers em tempo real.

### 2. Oscilações p-mode (`pmode`)

- UI: `0..1`, default `0`.
- Estado: `sunUniforms.uPmode`.
- Consumidor: vertex shader em `src/surface/sun.js:442-456`; brilho em `src/surface/sun.js:799-801`.
- Fórmula: deslocamento `pmSum * 0.004 * raio`; modulação de brilho `1 + vPm*0.05`.
- Limite teórico: deslocamento da ordem de até ~0,4% do raio por unidade de `pmSum`; modulação luminosa de poucos por cento.
- Efeito temporal: períodos comprimidos de aproximadamente 21–34 s; uma alteração pode cair perto de um zero de seno naquele instante.
- Classificação: **B/C**.
- Recomendação: aumentar autoridade do range ou mostrar estado “oscilação temporal; observe por alguns segundos”. Não considerar apenas mudança instantânea.

### 3. Ciclo de 11 anos (`cycle`)

- UI: `0..1,5`, default `0`.
- Estado: `ctx.CYCLE_K`.
- Consumidores: `cycleDepth()`, `updateCycleState()` e relógio em `src/sim/activity.js:45-91` e `src/main.js:351-355`.
- Período: 1.800 unidades simuladas, aproximadamente 30 min em `speed=1`.
- Profundidade: `min(1, CYCLE_K)`.
- Velocidade: `max(1, CYCLE_K)`. Consequência exata: todo o intervalo `0<CYCLE_K<=1` roda na mesma velocidade de 30 min; apenas valores `1..1,5` aceleram até 1,5×.
- Fase inicial: `0,35`. A fórmula de atividade produz aproximadamente `1,0283`; portanto ligar de `0` para `1` muda o ganho inicial em apenas ~2,83%.
- A maior narrativa do ciclo só aparece com acúmulo de minutos.
- Classificação: **C/D** para uso interativo.
- Recomendação: separar “profundidade do ciclo” de “velocidade do ciclo”, ou remapear o slider para que todo o curso controle uma velocidade perceptível. Expor fase/tempo restante.

### 4. Time-lapse do ciclo (`lapse`)

- UI: `0..1,5`, default `0`.
- Estado: `ctx.LAPSE_K`.
- Velocidade: `1 + 26*lapse`, combinada com `max(1, cycle)`.
- Em `1,5`, o ciclo chega a aproximadamente 40× e dura ~45 s em `speed=1`.
- Lapse sozinho força `cycleDepth()` para `1`.
- Também altera o envelope das regiões por blend até `min(1,lapse)`; acima de `1`, esse componente satura, mas a velocidade continua crescendo.
- Durante o bloco B5 do modo diretor, `LAPSE_K` é sobrescrito programaticamente e depois restaurado, sem sincronizar o slider ou o armazenamento.
- Valores baixos continuam lentos: `0,05` resulta em ~2,3×, ainda cerca de 13 min por ciclo.
- Classificação: **C**; forte apenas na metade superior.
- Recomendação: usar curva não linear voltada a tempos interativos e informar multiplicador/tempo de ciclo no label.

### 5. Manchas solares (`spots`)

- UI: `0..1,5`, default `0`.
- Estado: `ctx.SPOTS_K`; uniform vivo atualizado em `src/surface/sun.js:340`.
- Consumidores: número de grupos virtuais, fade, tamanho saturante e recalibração das manchas reais em `src/surface/sun.js:218-340`.
- Resposta: localizada, dependente da posição/vida dos grupos e de sua face visível.
- O tamanho satura deliberadamente: de `1` a `1,5` cresce muito pouco; o ganho principal é multiplicidade.
- Há thresholds por slot, então novos grupos podem aparecer em degraus, embora o fade use `smoothstep`.
- Os thresholds efetivos são combinados com `cycleAmpK`; `spotsUpdate()` também usa `cycleWarp`. Portanto `spots`, `cycle` e `lapse` não são independentes: lapse altera nascimento/morte e o ciclo muda a quantidade efetiva de grupos.
- Classificação: **B/C**.
- Recomendação: refletir no label que o eixo principal é “quantidade de grupos”, não intensidade/tamanho, e expor contagem efetiva.

## 6.2 Luz e cor

### 6. Bloom (`bloom`)

- UI: `0..2,5`, default `1`.
- Estado: `ctx.BLOOM_STRENGTH_BASE = BLOOM_BASE0 * valor`.
- Ganho HDR: `0..1,55`; ganho LDR: `0..1,375`.
- Consumidor final: `sceneCol + bloomCol*uBloomStrength` antes do ACES em `src/post/pipeline.js:435`.
- O slider **não** controla threshold, soft knee, raio ou níveis da pirâmide.
- O threshold fica em `bloomth`, disponível por URL/configuração mas ausente do painel: `0,72` HDR ou `0,82` LDR.
- Bright-pass: média de 5 pixels, luminância e `smoothstep(threshold, threshold+0.3, b)` em `src/post/pipeline.js:53-70`.

#### Resposta do bright-pass HDR

| Luminância | Fração preservada |
|---:|---:|
| 0,72 | 0% |
| 0,75 | 2,8% |
| 0,80 | 17,5% |
| 0,85 | 40,1% |
| 0,90 | 64,8% |
| 1,00 | 98,7% |

#### Compatibilidade com a superfície solar

A superfície é deliberadamente achatada em torno de `heat≈0,5` em `src/surface/sun.js:533-542`. Aplicando a paleta e curva de ganho de `src/surface/sun.js:768-798`, sem plage/flare adicionais:

| `heat` | Luminância estimada | Fração HDR |
|---:|---:|---:|
| 0,50 | 0,39 | 0% |
| 0,60 | 0,52 | 0% |
| 0,70 | 0,65 | 0% |
| 0,80 | 0,78 | 11,5% |
| 0,90 | 0,89 | 61,4% |
| 1,00 | 0,96 | 90,6% |

Conclusão: a maior parte do disco é exatamente descartada antes de o slider atuar. O efeito fica restrito a plages quentes, limbo emissivo e flares.

Depois da soma, o ACES comprime as altas luzes, justamente onde há Bloom. Fora do disco, onde a diferença escaparia melhor da compressão, a energia espalhada é pequena. Uma contribuição `bloomCol≈0,01`, mesmo com o slider no máximo, produz diferença escalar estimada de apenas ~`1,9/255` após ACES para uma base intermediária.

- Classificação: **B/D — conectado, mas perceptualmente subalimentado**.
- Recomendação prioritária:
  - expor threshold/soft-knee ou remapeá-los internamente com o controle;
  - separar intensidade e espalhamento;
  - garantir que extremos `0` e máximo alterem uma fração espacial significativa;
  - considerar o efeito da aplicação antes do ACES e evitar depender apenas de pixels já comprimidos;
  - não confundir este knob com `Halo coronal`.

### 7. Exposição (`exposure`)

- UI: `0,5..1,8`, default `1`.
- Estado: `compUniforms.uExposure = EXP0*valor`.
- Consumidor: multiplica cena+bloom antes do ACES e também veil/hal/streak/burst.
- Resposta: global; sombras e médios respondem fortemente, altas são comprimidas pelo ACES.
- Classificação: **A**.
- Recomendação: manter; é um bom controle de referência para testar se o painel está operante.

### 8. Brilho das plages (`plageglow`)

- UI: `0..1,2`, default `0,35`.
- Estado: `sunUniforms.uPlageEm`.
- Consumidor: adição `vec3(1,0.70,0.32) * plage * uPlageEm` em `src/surface/sun.js:795-798`.
- Resposta: potencialmente forte dentro da máscara, mas espacialmente localizada e dependente de regiões ativas visíveis.
- Também pode alimentar Bloom apenas quando a luminância resultante ultrapassa o threshold.
- Classificação: **B/C**.
- Recomendação: expor uma leitura/indicador de cobertura de plage ou garantir uma região de demonstração ao manipular.

### 9. Saturação (`sat`)

- UI: `0..1,6`, default `1`.
- Fórmula: `mix(luminância, color, uSat)` após tone mapping.
- `0` produz escala de cinza; valores acima de `1` extrapolam saturação.
- Resposta: global, exceto em pixels já neutros.
- Classificação: **A**.

### 10. Vinheta (`vig`)

- UI: `0..1,2`, default `0,55`.
- Fórmula: `color *= 1 - dot(vUv-0.5, vUv-0.5)*uVig`.
- Centro é invariável; nos cantos `dot=0,5`, portanto o máximo do painel reduz o fator para `0,4`.
- Resposta: forte nas bordas.
- Classificação: **A/B**.

### 11. Grão de filme (`grain`)

- UI: `0..4`, default `1`.
- Fórmula: ruído `±0,5 * (1,6/255) * grain * dith`.
- No máximo e com `dith=1`, pico absoluto aproximado: `3,2/255` por pixel.
- Aplicado apenas nas áreas escuras por `smoothstep(0.30,0.06,luma)`.
- Mudanças pequenas do slider podem ficar abaixo de um nível de 8 bits por frame/pixel.
- Classificação: **B**.
- Recomendação: curva mais agressiva na metade inferior, valor numérico em “níveis de 8 bits” ou range reduzido com maior sensibilidade útil.

## 6.3 Cinema

### 12. Halação/glare (`veil`)

- UI: `0..1,5`, default `0`.
- Consumidor: mip mais largo da mesma pirâmide de Bloom, multiplicado por `uVeil*0,55`.
- Ganho máximo nominal: `0,825 * tVeil` antes do ACES.
- Dependência: se o bright-pass estiver quase vazio, o controle também estará.
- Classificação: **B/C**.
- Recomendação: tratar Bloom/veil como sistema; corrigir a alimentação da pirâmide ou oferecer fonte/threshold próprio.

### 13. Flare anamórfico (`streak`)

- UI: `0..1,5`, default `0`.
- Fonte: mip 1 do Bloom; duas passadas horizontais de 17 taps.
- Composite: `tStreak * uStreak*0,70`.
- Não exige um flare físico para executar, mas exige energia no bright-pass; sem altas fortes pode ficar tênue.
- Classificação: **B/C**.
- Recomendação: informar dependência de Bloom/altas ou alimentar streak diretamente de uma máscara de highlights mais permissiva.

### 14. Starburst (`burst`)

- UI: `0..1,5`, default `0`.
- Gate exato: `ctx.BURST_K>0.001 && flareHDR>0.004`; fora disso `uBurst=0` em `src/main.js:630-636`.
- Também exige flare na face visível e projeção válida.
- Quando ativo, amplitude é `BURST_K*flareHDR` e o shader desenha seis braços.
- Classificação: **C/D** para um slider de resposta imediata.
- Recomendação: oferecer preview/“disparar flare de teste”, mostrar status “aguardando flare visível” ou desabilitar enquanto o gate é zero.

### 15. Bloom espectral/dispersão (`disp`)

- UI: `0..1,5`, default `0`.
- Atua nos raios de amostragem por canal durante downsample/upsample.
- Redistribui espacialmente a energia; não aumenta a energia total por si só.
- Depende da pirâmide de Bloom conter sinal.
- Se `bloom=0` e `veil=streak=hal=0`, a dispersão pode executar e ainda assim não chegar ao composite visível.
- O próprio comentário em `src/post/pipeline.js:124-130` registra que a versão anterior era imperceptível e media apenas `+0,2/255` médio; a versão atual aumentou o raio, mas continua dependente da fonte seletiva.
- Classificação: **B/C/D**.
- Recomendação: comunicar dependência, acoplar a um ganho mínimo demonstrável ou desabilitar quando nenhuma camada consumidora está ativa.

### 16. Halação quente (`hal`)

- UI: `0..1,5`, default `0`.
- Fonte: excesso de vermelho do mip largo `max(R - 0,5*(G+B), 0)`.
- Composite: ganho `uHal*0,9`; `uHal` ainda sobe com flare por `1+1,6*flareHDR`.
- Duplamente seletivo: precisa passar no bright-pass e possuir excesso de vermelho.
- Classificação: **B/C**.
- Recomendação: status/preview e calibração conjunta com Bloom.

### 17. Olho/adaptação (`adapt`)

- UI: `0..1`, default `0`.
- Alvo: `1 / (1 + adapt*(0,42*cover + 0,20*activity*cover + 0,25*flare + 0,10*CME))`.
- Ataque: constante de 0,5 s; recuperação: 3 s.
- Resposta: global e temporal; pode demorar alguns segundos para assentar.
- Mesmo sem flare, o termo de cobertura do Sol produz resposta.
- A interpolação usa `rawDelta`, não `delta`; logo `speed` não acelera a resposta fisiológica. Isso é coerente com uma adaptação em tempo real, mas deve ser uma decisão explícita e documentada, não inferida pelo usuário.
- Classificação: **A/C**.
- Recomendação: mostrar multiplicador efetivo (`uAdapt`) e indicar que é um controle dinâmico, não exposição estática.

### 18. Franja da lente (`fringe`)

- UI: `0..1,5`, default `0`.
- Deslocamento radial: `rc * (0,006 + 0,020*dot(rc,rc))*uFringe`.
- Centro é exatamente invariável; bordas podem chegar a vários pixels em viewport comum.
- Usa seis taps espectrais e afeta bordas do Sol/estrelas.
- Classificação: **A/B**.

### 19. Calor no limbo (`shimmer`)

- UI: `0..1,5`, default `0`.
- Gate espacial: anel aproximadamente `1,0..1,45` raios solares, mais forte em `1,06..1,10`.
- Deslocamento máximo por componente de ruído é da ordem de `0,0045` UV no topo do slider.
- Interior do disco não muda.
- Classificação: **B/C**.
- Recomendação: manter como efeito localizado, mas indicar “somente no anel do limbo”.

### 20. Grade Sunshine (`tone`)

- UI: `0..1,2`, default `0`.
- Split-tone: sombras frias e altas douradas, aplicado depois de ACES e saturação.
- Em `1,2`, extrapola levemente os endpoints do `mix`, produzindo alteração cromática relevante.
- Resposta: ampla, mas depende da luminância local.
- Classificação: **A**.

### 21. Filme ACES→AgX (`film`)

- UI: `0..1`, default `0`.
- Fórmula: `mix(ACESFilm(color), AgXFilm(color), uFilm)`.
- Afeta sobretudo rolloff e saturação das altas; sombras próximas podem mudar pouco.
- Caminho global e contínuo.
- Classificação: **A/B**.

### 22. Câmera de mão (`hand`)

- UI: `0..1,5`, default `0`.
- Soma senos lentos à pose, sem alterar o estado persistente da câmera.
- Amplitude angular máxima aproximada no topo: subgrau por eixo.
- Como a câmera sempre olha para a origem, o disco permanece centralizado; a leitura vem de mudanças de orientação/textura e fundo estelar, não de grande deslocamento de quadro.
- Classificação: **B/C**.
- Recomendação: ampliar autoridade ou nomear como “micro-movimento”; não prometer tremor evidente.

### 23. Foco raso (`dof`)

- UI: `0..1,5`, default `0`.
- Abertura efetiva: `DOF_K * dofCloseK² * 0,026`.
- `dofCloseK = clamp((fitDist/camDist - 1,10)/1,10)`.
- No enquadramento fit, `dofCloseK=0`: efeito exatamente zero em todo o range.
- Só começa quando `camDist < fitDist/1,10`, aproximadamente abaixo de 90,9% da distância fit.
- O shader ainda ignora `uDof<=0,0008`, criando outra zona morta para combinações pequenas de knob/close-up.
- Classificação: **C/D**.
- Recomendação: desabilitar/explicar no fit, oferecer ação “aproximar para demonstrar” ou acoplar o controle a um preview de close-up.

## 6.4 Coroa

### 24. Halo coronal (`halo`)

- UI: `0..1,6`, default `0,55`.
- Fórmula: soma `uHalo*exp(-(r-diskR)*7)` ao núcleo `exp(-(r-diskR)*22)`.
- Afeta uma região larga fora do disco e possui amplitude relevante.
- Este é o controle que mais se aproxima da expectativa comum de “aumentar o glow ao redor do Sol”.
- Classificação: **A/B**.
- Recomendação: diferenciar semanticamente de Bloom no painel.

### 25. Streamers (`ray`)

- UI: `0..2,5`, default `0,9`.
- Fórmula: `rays *= 1 + uRayBoost*min(act,1,4)`.
- No máximo teórico de `act`, o fator vai de `1` a `4,5`.
- Fora das regiões alinhadas às cargas, `act` pode ser próximo de zero e o knob quase não atua.
- Classificação: **A/B/C**.
- Recomendação: expor atividade/localidade ou garantir que o estado inicial possua streamers visíveis na face corrente.

### 26. Resposta à atividade (`cact`)

- UI: `0..1,5`, default `0,5`.
- Fórmula final: `1 + uActGain*uActivity`, com `uActivity` limitado a `1`.
- Se atividade for `1`, o intervalo do painel produz fator `1..2,5`.
- Se atividade global for baixa, a resposta encolhe proporcionalmente.
- Classificação: **A/C**.
- Recomendação: exibir `uActivity` efetiva junto ao slider.

### 27. Coroa volumétrica (`cvol`)

- UI: `0..1,5`, default `0`.
- Tier `low`: `cstep=0`; controle é no-op exato.
- Tiers superiores: primeiro bake tem 64 fatias a 30 fatias/s, publicação após aproximadamente 2,13 s; ciclo completo com cooldown ~3,03 s.
- Antes da primeira publicação, o plano de raios permanece integral e o mesh volumétrico fica oculto.
- Auto-tune pode definir `ctx.cvolKilled=true`; depois disso o knob continua não zero, mas o efeito fica morto até reload.
- Quando pronto, o controle também reduz o plano de raios por `1 - 0,62*min(1,CVOL_K)`, portanto a resposta não é mera adição monotônica de luminância.
- Classificação: **C/D**.
- Recomendação prioritária: desabilitar em `low`, exibir “gerando volume”, refletir kill-switch na UI e oferecer reativação/reload explícito.

### 28. CME (`cme`)

- UI: `0..1,5`, default `0`.
- Tier `low`: `cmestep=0`; no-op exato.
- Gatilho: somente após flare, amplitude acima de `0,85`, probabilidade proporcional a `(amp-0,85)/0,45 * min(1,CME_K)`, sem CME ativa e fora do cooldown.
- Valores acima de `1` não aumentam a probabilidade, mas aumentam intensidade até `1,5` durante o evento.
- Evento dura aproximadamente 7–8 s de leitura forte e encerra no máximo em 18 s.
- Auto-tune pode matar CME sem sincronizar o slider.
- Orientação Thomson torna CME frontal deliberadamente tênue.
- Classificação: **C/D**.
- Recomendação prioritária: desabilitar em `low`, mostrar “aguardando flare elegível”, disponibilizar preview/trigger controlado e refletir auto-tune.

### 29. Loops coronais (`loops`)

- UI: `0..1,5`, default `0`.
- Loops ambientes: gate `subToggle.loops && LOOP_K>0,001`; envelope `lifeEnvelope * LOOP_K * (0,65+0,55*act)`.
- Arcadas pós-flare: seus envelopes não são multiplicados por `LOOP_K`. `loopMesh.visible` permanece verdadeiro quando `arcMax>0` ou há jobs na fila, mesmo com `LOOP_K=0`.
- Consequência: o slider controla apenas os loops ambientes; não é um master de todas as estruturas de loop/arcada sugeridas pelo label.
- Geometria é gerada por scheduler incremental; pode não haver resposta completa no mesmo frame.
- Afeta linhas localizadas e sujeitas a oclusão pelo disco.
- Classificação: **B/C/D** pela semântica incompleta.
- Recomendação: decidir se arcadas pós-flare são fenômeno obrigatório independente do knob. Se forem, renomear o controle para “Loops ambientes”; se não, gatear também as arcadas. Exibir slots prontos/ativos e tempo de preparação.

### 30. Filamento ↔ proeminência (`fprom`)

- UI: `0..1,5`, default `0`.
- Consumidor encontrado: absorção do filamento plano em `src/main.js:445-462`.
- Fórmula: `uAbsorb = min(1, FPROM_K) * 0,45 * facing * min(1,fieldK)`.
- Consequência exata: todo o intervalo `1,0..1,5` é uma zona totalmente morta; nenhum consumidor adicional de `FPROM_K` foi encontrado.
- A emissão das proeminências usa vida, campo, agitação e orientação, mas não `FPROM_K`. O label “Filamento ↔ proeminência” sugere um continuum emissão/absorção que o knob não implementa; ele controla apenas a absorção do filamento sobre o disco.
- Também depende de orientação, vida e campo; fora da face adequada pode ficar invisível.
- Classificação: **B/C/D**.
- Recomendação prioritária: limitar UI a `0..1`, remapear o range inteiro ou usar a faixa acima de `1` para uma propriedade real. Renomear para “Absorção dos filamentos” ou modular também a emissão para cumprir o label. Expor estado/orientação.

## 6.5 Céu

### 31. Estrelas (`stars`)

- UI: `0..2`, default `1`.
- Fórmula:
  - normais: `min(1, 0,55*valor)`;
  - brilhantes: `min(1, 0,80*valor)`.
- Saturações:
  - brilhantes saturam em `1,25`;
  - normais saturam em `1/0,55≈1,818`;
  - de aproximadamente `1,818` a `2`, nenhuma camada muda.
- De `1,25` a `1,818`, apenas as estrelas normais respondem.
- O controle não altera Via Láctea.
- Classificação: **A/B/D**.
- Recomendação: normalizar o range para que `2` corresponda ao máximo sem clamp precoce, ou limitar a UI a `~1,82` e deixar claro que não afeta a Via Láctea.

### 32. Via Láctea (`mw`)

- UI: `0..1`, default `0,62`.
- Consumidores: opacidade da faixa estelar e uniform `uMW` da nebulosa difusa.
- Ambos respondem linearmente ao slider.
- Classificação: **A/B**.

## 7. Auditoria das outras ações e controles

### 7.1 Engrenagem/painel

- Abre/fecha corretamente por classes CSS.
- Defeito menor: `btn.style.transition += ', right ...'` parte de uma string inline vazia; a vírgula inicial torna o valor CSS inválido. A transição de `right` pode não ser aplicada. Não há base suficiente para afirmar que isso apaga a transição válida de `transform` definida na stylesheet; uma declaração inline inválida tende a ser rejeitada, preservando a regra externa.
- O elemento é `div`, sem `button`, `role`, `tabindex` ou handler de teclado.

### 7.2 Câmera contemplativa

- Switch altera e persiste `ctx.IDLE_CINE`.
- Só acrescenta balanço/respiração após 2,2 s sem interação.
- A rotação idle básica acontece mesmo com o switch desligado; o switch controla apenas latitude e zoom respirado. O label pode sugerir que controla toda a câmera idle.

### 7.3 Look Sunshine

- Aplica 19 knobs via os mesmos setters dos sliders e persiste cada valor.
- Não representa todos os 32 controles; é um preset parcial.
- Em `low`, valores de `cvol` e `cme` são aplicados/persistidos sem efeito.
- Sliders alterados pelo preset são sincronizados corretamente.
- O comentário em `src/ui/panel.js:234-235` ainda fala em “14 pares”, mas o preset atual possui 19 chaves. É dívida documental, sem impacto runtime.

### 7.4 Modo diretor

- O botão do painel chama `directorStart()`, inicia a sequência e força mínimos de `CME_K=0,9` e `DOF_K=0,5` quando necessário.
- O caminho de URL `?director=1` apenas inicializa `DIRECTOR_ON=true`; não chama `directorStart()`. Assim, a sequência por URL pode rodar com CME/DOF em zero e perder a erupção e o foco raso pretendidos.
- Os elementos de slider não são atualizados quando o diretor empresta CME/DOF.
- No bloco B5, o diretor sobrescreve `LAPSE_K` e depois o restaura; o slider de lapse também não acompanha essas mutações.
- Abrir o painel não encerra o diretor, pois `directorUserExit()` está ligado a input do canvas/teclado, não aos controles do painel.
- Mover sliders não encerra o diretor. Se o usuário alterar CME, DOF ou lapse durante a sequência, o slider e `localStorage` recebem o novo valor, enquanto o diretor pode sobrescrevê-lo ou restaurar o valor salvo internamente. UI, persistência e runtime divergem.
- Reset durante o diretor também é inseguro: ele pode colocar CME/DOF em zero, mas uma saída posterior restaura os valores pré-diretor por cima do reset, mantendo a UI em zero e `solKnobs` vazio.
- O relógio da sequência usa `delta`, mas as interpolações da câmera usam `rawDelta`; `speed!=1` altera a duração dos beats sem escalar a aproximação da câmera.
- Recomendação prioritária: unificar boot por URL e botão no mesmo caminho; centralizar estado; sincronizar inputs em toda mutação programática; e decidir entre (a) qualquer edição/reset encerrar o diretor ou (b) knobs sob controle do diretor ficarem read-only e mostrarem o valor efetivo.

### 7.5 HUD de FPS

- Switch do painel e toque longo no canvas chegam a `hudToggle()`.
- O toque longo chama `hudToggle()` diretamente, mas a classe visual de `hudSw` só é atualizada no click do próprio switch. Após long-press, o switch pode mostrar OFF com HUD ON ou vice-versa.
- O switch é `div` click-only, sem operação por teclado.
- Toque longo exige um dedo parado por 1 s e é cancelado por movimento >9 px.
- Recomendação: um único setter/toggle deve atualizar estado, visibilidade e classe do switch; alternativamente, ressincronizar ao abrir o painel.

### 7.6 Tier de qualidade

- Botões persistem `solTier`, removem `tier=` da URL e recarregam.
- Clicar no tier atual é deliberadamente inerte.
- Não informa quais controles deixam de existir em `low`.
- Auto-tune pode persistir outra recomendação e matar CME/CVOL em runtime sem refletir isso no seletor/knobs.
- Ao persistir tier superior/inferior para o próximo carregamento, o auto-tune não recarrega nem atualiza a classe `.cur`. A sessão parece estável, mas o próximo load pode mudar de qualidade “sozinho”.
- Recomendação: informar “tier recomendado para o próximo carregamento” e oferecer recarga explícita.

### 7.7 Restaurar padrão

- Remove `solKnobs`, restaura os 32 sliders e desliga Câmera contemplativa.
- Não restaura tier, HUD, diretor ou kill-switches do auto-tune.
- Não encerra nem limpa o estado salvo internamente pelo diretor; uma saída posterior pode desfazer parte do reset em runtime.
- Se a página foi aberta com parâmetros de URL, um reload reaplica os parâmetros porque URL tem prioridade sobre armazenamento.
- O texto “restaurar padrão” pode ser interpretado como reset de todo o painel, mas o escopo real é parcial.

### 7.8 Mouse, toque e teclado

- Arraste: órbita com inércia.
- Wheel e pinça: zoom.
- Duplo clique/toque: alterna fit/close-up.
- Long press: HUD.
- Setas: órbita.
- `+`, `=`: aproxima.
- `-`, `_`: afasta.
- `R`: retorna ao fit.

Defeito confirmado: `window.addEventListener('keydown', onKeyDown)` não verifica `event.target`. Quando um range está focado, as setas chegam ao listener global, movem a câmera e chamam `preventDefault()`, cancelando a operação nativa do slider. Correção: ignorar eventos originados de `input`, `button`, `select`, `textarea` e elementos editáveis, ou escopar os atalhos ao canvas.

## 8. Divergências de range entre painel e configuração

Quando URL/localStorage fornece valor fora do range visual, `inp.value=d.get()` é limitado pelo próprio `input[type=range]`, mas o estado interno permanece no valor mais amplo. A UI pode mostrar um valor diferente do consumido.

| Knob | Painel | Config/URL |
|---|---:|---:|
| `speed` | 0,05–2 | 0,05–3 |
| `bloom` | 0–2,5 | 0–3 |
| `exposure` | 0,5–1,8 | 0,3–2,5 |
| `plageglow` | 0–1,2 | 0–1,5 |
| `sat` | 0–1,6 | 0–2 |
| `vig` | 0–1,2 | 0–1,5 |
| `grain` | 0–4 | 0–5 |
| `halo` | 0–1,6 | 0–2 |
| `ray` | 0–2,5 | 0–3 |
| `cact` | 0–1,5 | 0–2 |
| `stars` | 0–2 | 0–3 |

Recomendação: uma única definição de schema deve dirigir painel, parsing de URL, persistência, reset, introspecção e documentação.

## 9. Problemas arquiteturais transversais

### 9.1 Estado distribuído sem fonte única

Os knobs vivem em combinações de:

- `ctx.*`;
- uniforms;
- propriedades de materiais;
- valores dos elementos DOM;
- `localStorage`;
- overrides temporários do diretor;
- kill-switches do auto-tune.

Não existe um store/setter central que sincronize todos os consumidores e a UI. Isso causa divergência no modo diretor e torna estados efetivos invisíveis.

### 9.2 UI mostra valor nominal, não valor efetivo

Exemplos:

- `dof=1,5`, mas `uDof=0` no fit.
- `burst=1,5`, mas `uBurst=0` sem flare.
- `cvol=1`, mas efeito morto em low/killed/baking.
- `cme=1`, mas sem evento.
- `fprom=1,5`, mas ganho efetivo igual a `1,0`.
- `stars=2`, mas opacidades já saturadas.
- `loops=0`, mas uma arcada pós-flare ainda pode manter o mesh visível.
- HUD alternado por long-press, mas switch visual permanece no estado anterior.

Recomendação: cada controle condicional deve expor estado efetivo, motivo de inatividade e, quando aplicável, progresso.

### 9.3 Controles de evento apresentados como intensidades contínuas

`burst` e `cme` parecem sliders convencionais, mas são armadores/ganhos de eventos. Sem um trigger ou preview, o usuário pode concluir corretamente que nada acontece.

### 9.4 Dependências não representadas

- `disp`, `veil`, `streak` e `hal` dependem da pirâmide de Bloom.
- `dof` depende de zoom.
- `cvol`/`cme` dependem de tier e auto-tune.
- `ray` depende de atividade local.
- `plageglow`, `spots`, `loops`, `fprom` dependem de estruturas estarem visíveis.
- `spots` depende ainda de `cycleAmpK` e `cycleWarp`; `cycle`, `lapse` e `spots` formam um sistema acoplado.
- O botão diretor, `?director=1`, edição de sliders e reset percorrem caminhos diferentes para os mesmos estados.

O painel é uma lista plana e não comunica essas relações.

### 9.5 Bases de tempo inconsistentes

O projeto usa duas bases legítimas — `delta` simulado e `rawDelta` real — mas nem sempre explicita a política:

- `speed` escala rotação, simulação, flares e o relógio do diretor.
- câmera, inércia, zoom, adaptação do olho, foco e scheduler CVOL usam `rawDelta`.
- no diretor, a fase da sequência usa `delta` enquanto a aproximação da câmera usa `rawDelta`.

Para câmera e adaptação fisiológica, tempo real pode ser deliberado. No diretor, a mistura altera a coreografia com `speed!=1` e deve ser decidida explicitamente.

## 10. Plano de remediação sugerido

### P0 — corrigir controles enganosos ou mortos

1. Adicionar guarda de foco ao teclado global.
2. Desabilitar/explicar CME e CVOL em `low` e quando mortos pelo auto-tune.
3. Corrigir sincronização do modo diretor para CME, DOF e LAPSE; unificar `?director=1` e botão; definir política de edição/reset durante a sequência.
4. Remover/remapear zona morta de `fprom`.
5. Remover/remapear saturação final de `stars`.
6. Unificar ranges do painel e configuração.

### P1 — dar autoridade perceptiva aos knobs fracos

1. Reprojetar Bloom: threshold/soft-knee/raio/intensidade coerentes e expostos.
2. Reprojetar Ciclo para escala temporal interativa ou separar profundidade/velocidade.
3. Adicionar preview/trigger para Burst e CME.
4. Mostrar dependências e estados efetivos de DOF, Bloom-cinema, loops/arcadas e coroa.
5. Revisar curvas de baixa autoridade: grão, p-mode e câmera de mão.
6. Sincronizar o switch HUD com long-press e informar tier recomendado pelo auto-tune.
7. Definir política única de tempo para a coreografia do diretor.

### P2 — robustez e semântica da UI

1. Criar schema único de knobs.
2. Criar setter central com atualização de runtime, DOM e persistência.
3. Tornar engrenagem/switches controles semânticos e operáveis por teclado.
4. Definir exatamente o escopo de “restaurar padrão”.
5. Corrigir a transição CSS da engrenagem.
6. Corrigir comentário obsoleto de “14 pares” do preset Sunshine.

## 11. Critérios de aceite recomendados para a correção

### 11.1 Conectividade

Para cada knob:

1. Disparar `input` em mínimo, default e máximo.
2. Confirmar atualização do store central.
3. Confirmar atualização do consumidor efetivo/uniform.
4. Confirmar persistência e reconstrução idêntica após reload.

### 11.2 Efetividade sem inspeção visual

Para cada knob, expor via introspecção:

- valor nominal;
- valor efetivo após clamps/gates;
- motivo de inatividade;
- consumidores ativos;
- progresso/estado para efeitos assíncronos;
- métricas escalares relevantes.

Exemplos:

- Bloom: energia/fração do bright-pass, ganho e níveis ativos.
- DOF: `dofCloseK` e `uDof` efetivo.
- Burst: `flareHDR` e `uBurst`.
- CME: tier, eligible, cooldown, probabilidade, active, killed.
- CVOL: steps, phase, progress, ready, killed.
- Loops: slots prontos e envelopes >0.
- FProm: ganho efetivo após clamp/orientação.
- Stars: opacidades finais.
- Diretor: origem de ativação, fase, CME/DOF/LAPSE nominais e efetivos e base de tempo.
- HUD: `hudOn` e classe/estado acessível do switch.
- Tier: atual, recomendado para próximo load e kill-switches ativos.

### 11.3 Autoridade do curso

- Nenhuma faixa contínua do slider pode produzir exatamente o mesmo valor efetivo, salvo quando isso for comunicado como saturação deliberada.
- Extremos devem alterar uma métrica efetiva em magnitude definida pela equipe.
- Controles condicionais devem indicar o gate ou oferecer preview.
- Valores programáticos, URL, preset, diretor e auto-tune devem atualizar a UI.
- Ativar diretor por URL e pelo botão deve produzir o mesmo estado inicial efetivo.
- Editar ou resetar durante o diretor não pode ser desfeito silenciosamente numa saída posterior.
- `loops=0` deve ter semântica definida e testada: ou zera também arcadas, ou o label/estado deve declarar que controla apenas loops ambientes.
- Alternar HUD por qualquer caminho deve manter DOM e estado sincronizados.

## 12. Arquivos-chave

- `src/ui/panel.js` — definições, ranges, handlers, persistência e botões.
- `src/core/config.js` — URL/localStorage e knobs temporais/físicos.
- `src/main.js` — loop, gates e uniforms efetivos por frame.
- `src/post/pipeline.js` — Bloom e controles de cinema/composite.
- `src/surface/sun.js` — p-mode, plages e manchas.
- `src/sim/activity.js` — ciclo e time-lapse.
- `src/atmosphere/coronaRays.js` — halo, streamers e atividade.
- `src/atmosphere/coronaVolume.js` — scheduler e volume coronal.
- `src/atmosphere/cme.js` — gatilho, tier e envelope de CME.
- `src/atmosphere/loops.js` — loops e scheduler incremental.
- `src/scene/stars.js` — estrelas e Via Láctea.
- `src/camera/controls.js` — gestos e conflito de teclado.
- `src/camera/director.js` — overrides temporários e restauração.
- `src/core/perf.js` — HUD, tier e kill-switches.

## 13. Conclusão

O painel possui conectividade técnica ampla, mas mistura controles globais, efeitos locais, armadores de evento, parâmetros temporais e recursos dependentes de tier como se todos fossem sliders de resposta imediata. Isso explica por que o usuário pode manipular diversos knobs — especialmente Bloom — sem perceber mudança.

A correção não deve se limitar a aumentar multiplicadores. É necessário:

- remover zonas mortas;
- dar autoridade ao curso útil;
- expor dependências/gates;
- sincronizar estado nominal e efetivo;
- oferecer preview para eventos;
- alinhar a semântica do controle ao efeito realmente implementado.

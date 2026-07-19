# Museu Solar — cobertura e regra de qualidade

Este documento separa duas experiências que coexistem:

- **Exploração livre:** descobertas curtas que aparecem quando o fenômeno acontece por conta própria.
- **Visita guiada:** roteiro voluntário, com um cartão recolhível por vez, enquadramento assistido e tempo reduzido para leitura.

O modo determinístico (`?det=1`) não cria nenhuma das duas camadas.

## O que a visita já demonstra

| Etapa | O visitante vê | Fonte física usada | Prova automática no iPhone | Coleção (grava com `source.physical`) |
|---|---|---|---|---|
| 1 | Fotosfera e granulação | disco e simulação de convecção já renderizados | cartão não cobre o disco | `surface` (PR-8) |
| 2 | Manchas escuras e plages claras | região magnética bipolar real | região, geração e visibilidade | `spots` |
| 3 | Loops coronais | traçador de linhas de campo; só libera depois de um loop real | `loopStatesA.ok` | `loops` (PR-8) |
| 4 | Flare e arcada pós-flare | emissor canônico do flare e arcada | relógio e fonte do flare | `flare` |
| 5 | CME | prévia física da CME depois do rescaldo do flare | frente de CME emergida | `cme` |
| 6 | Filamento | absorção real sobre o disco | uniform de absorção físico | `prominence` (vista `filament`) |
| 7 | Proeminência | emissão real no limbo | intensidade física da estrutura | `prominence` (vista `prominence`) |
| 8 | Coroa e streamers | raios/halo coronais da cena | camada coronal presente (fótons no anel) | `corona` (PR-8) |
| 9 | Máximo solar | relógio físico acelerado até fase 0,5 | fase, amplitude e `hold` reais | `cycle` (vista `cycleMaximum`) |
| 10 | Mínimo solar | relógio físico acelerado até fase 0/1 | fase, amplitude e `hold` reais | `cycle` (vista `cycleMinimum`) |

A coleção tem **11 famílias** (`surface`, `granulation`, `spots`, `loops`,
`flare`, `cme`, `prominence`, `spicules`, `corona`, `coronalHole`, `cycle`
— ordem narrativa da visita, com o close-up da fotosfera logo após
`surface`, a franja do limbo junto das estruturas de borda e a janela
escura logo após a própria coroa) desde o PR-10; o painel calcula
"N de 11" dinamicamente a partir dessa ordem.

Em todas as etapas, a prova `npm run qa:tour` roda em ambiente de iPhone de verdade (UA Safari, toques e arrastes de TOQUE genuínos, `tier=mid` — o tier real do aparelho) e verifica, POR ETAPA: botões visíveis ≥44 px, cartão expandido sem estourar a tela, colisão cartão/disco, fonte física visível e leitura recolhida a 8% do tempo. A pausa com relógio físico parado é medida em dupla janela em três etapas representativas; a caminhada completa repete em paisagem 844×390; um gate DPR3 cobre a transação de display; controles negativos provam que loops/CME/coroa sem física reportam o texto honesto de indisponível; e o contraste WCAG do cartão (≥4.5) é medido por screenshot. A evidência (JSON + screenshots-chave) vai para `out/qa-tour/` e sobe como artifact do CI também em sucesso.

## O que também foi corrigido na exploração livre

Máximo e mínimo agora podem gerar explicação no curso natural do ciclo. Antes eles só apareciam durante a prévia do painel; a prova `npm run qa:edu` confirma que o cartão nasce de fase/amplitude físicas sem `cycleEvent` ativo.

**Loops coronais e coroa (PR-8, Onda 1):** os dois deixaram de ser exclusivos
da visita. Um cartão espontâneo de loops nasce quando existe uma linha de
campo REALMENTE traçada (`phenomena.loops.best` — a âncora é a semente do
próprio traçado) no hemisfério visível, uma vez por sessão; a coroa ganha um
cartão GLOBAL (sem âncora, como máximo/mínimo, prioridade mais baixa da
arbitragem) após mais de 8 segundos contínuos de fótons reais no anel
(`phenomena.corona.photons`, o gate do PR-6). Controles negativos provados:
`?loops=0` e `halo=0&ray=0` nunca emitem. A fotosfera (`surface`) entra na
coleção pela etapa 1 da visita.

**Granulação e espículas (PR-9, Onda 2):** as duas primeiras descobertas por
APROXIMAÇÃO — o cartão é recompensa pelo gesto de chegar perto e nunca
aparece sem ele. Os sinais vêm da fonte única (`phenomena.view`):
`closeness` (razão `fitDist/camDist`; granulação exige >1.6 — a "vista de
aproximação" que a tabela de lacunas pedia) e `limbFraction` (raio projetado
do disco sobre metade da menor dimensão do quadro, a mesma matemática do
`diskRect` da visita; espículas exigem >1.15 — o disco estoura o quadro e o
limbo o cruza). Cada limiar precisa ser SUSTENTADO por mais de 2 segundos de
relógio de parede (imune a `?speed`); afastar antes disso zera o relógio.
Os dois cartões são GLOBAIS por decisão consciente: a granulação está em toda
a superfície e as espículas são a franja inteira do limbo — ancorar uma
célula ou um jato específico apontaria algo que o shader não individualiza
(quebraria a regra "nada prometido que não está na tela"). O emissor de
espículas ainda exige a franja de fato desenhada (`spiculeMesh` visível).
Controles negativos provados: 30 s parado no enquadramento cheio nunca emite
(relógios white-box em `__solInfo.eduCloseupState`); afastar antes de 2 s
reseta. Uma explicação por sessão cada (latch do padrão PR-8).

**Buraco coronal (PR-10, Onda 3):** a última lacuna de cobertura assumida
fechou pela regra do museu — o marcador SEMÂNTICO nasceu no módulo dono
antes do cartão. O bake fatiado do volume coronal
(`src/atmosphere/coronaVolume.js`) acumula, durante o trabalho que já
acontece, a direção resultante das células claramente unipolares (janela
estrita 0.75–0.95 sobre o MESMO `unip` que a densidade computa) em DUAS
cascas — 1.02–1.30R (rarefação visível) e 1.30–1.70R (persistência do
campo aberto em altura, o mesmo raciocínio do gate de plumas do shader) —
e publica na atomicidade do upload `ctx.coronaHoleDir` +
`ctx.coronaHoleStrength` (0..1, o `min` das duas cascas no melhor setor) +
`ctx.coronaHoleGeneration`. A leitura é fonte única
(`phenomena.corona.hole()`, corte nomeado `PHEN_T.CORONA_HOLE_MIN=0.40`,
calibrado por medição: mínimo 0.48–0.53, máximo 0.10–0.33); o emissor
exige volume ligado e bakeado, buraco claramente aberto e a direção no
hemisfério visível sustentada >3 s de parede. O cartão é LOCAL com âncora
coronal a 1.35R (o buraco vive na coroa, não na superfície). Negativo
duplo provado: `cvol=0` nunca disponibiliza o marcador (sem a região
escura na tela não há promessa) e o MÁXIMO com coroa cheia publica
strength abaixo do corte e nunca emite. Uma explicação por sessão (latch
PR-8; `generation` não rearma — a coleção permite reler).

## Lacunas assumidas — não vender como pronto ainda

Estas partes visuais existem, mas ainda não têm a cadeia completa “fonte identificável → texto PT/EN → coleção → prova iPhone”:

| Família | Próximo trabalho necessário |
|---|---|
| P-modes | tratar como experimento de laboratório avançado, não como descoberta automática |
| Áudio reativo | **cortado de vez** — decisão do dono (2026-07-18); não é mais uma lacuna a fechar, ver não-objetivos abaixo |

Espículas e granulação/fibrilas saíram desta tabela no PR-9 (cobertas pela
descoberta por aproximação) e **buracos coronais e plumas saíram no PR-10**
(cobertos pelo marcador semântico do volume coronal + cartão — ver acima).
Nota de escopo do PR-10: a COBERTURA está fechada — o cartão explica a
janela do campo aberto, que é onde as plumas vivem; qualquer refinamento
adicional das plumas em si (FWHM/nitidez dos fios, herdado da F6/rodada de
movimento) é débito VISUAL anotado no roadmap
(`docs/roadmap-proximo-nivel.md`, `docs/rodada-movimento.md`), não lacuna
de cobertura do museu. Não resta lacuna de cobertura com PR planejado;
p-modes fica como não-objetivo consciente (tabela abaixo).

## Regra para ampliar o acervo

Nenhum novo item entra na visita ou na coleção apenas porque existe um slider. Ele precisa, nesta ordem:

1. sinal físico ou geometria real identificável;
2. condição de visibilidade no enquadramento;
3. explicação curta em português e inglês;
4. item de coleção somente após a observação;
5. prova automatizada em 390×844 e aceite visual em iPhone real.

Isso mantém a experiência com padrão de museu: a interface não promete um fenômeno que a pessoa não está, de fato, vendo.

## Não-objetivos conscientes (série Museu, 2026-07-18)

Itens fora do escopo da série Museu, por decisão explícita ou por razão
técnica registrada — não são lacunas a fechar, são limites conscientes.

| Item | Razão consciente |
|---|---|
| **Áudio reativo** | Decisão explícita do dono (2026-07-18): cortado de vez. |
| Texto 3D para os cartões | A camada ESPACIAL (halos, marcadores, destaques) evolui em WebGL/Three sem reservas (PR-5 da série Museu); o TEXTO permanece DOM porque seleção, VoiceOver, Dynamic Type, i18n e nitidez subpixel são acessibilidade inegociável — limite da régua wow-first, não economia. |
| WebGPU | Já decidido no roadmap; invalidaria a rede de baselines WebGL. |
| P-modes como descoberta | É experimento de laboratório, não observação espontânea (ver tabela de lacunas acima). Candidato futuro a seção "laboratório". |
| Rotação diferencial | Só honesta com traçador visível (duas manchas defasando) — exigiria visualização nova; futura etapa de visita v2 com `lapse`. |
| Telemetria/analytics | Sem backend; consentimento mancharia a experiência. Observação direta vale mais. |
| Terceiro sistema de rótulos | Exploração livre (rastreador) e visita (cartão fixo) coexistem por mérito; nenhum sistema novo entra. |
| "1 narrativa por vez" | Confirmado como correto para 390×844; a fila CME/proeminência já trata concorrência. |

**Modo diretor — promovido, não congelado:** o modo diretor não é
descontinuado nem virou legado. Ele é promovido a "sessão de cinema"
oferecida ao fim da visita guiada (PR-5 da série Museu) e intercalada no
quiosque (PR-13). Passivo conhecido a sanear quando tocado:
`dirForceFlare` escreve estado direto (autoridade dupla com
`previewBurst`) — unificar no caminho `previewBurst` na primeira mudança
que o PR-5 fizer nele.

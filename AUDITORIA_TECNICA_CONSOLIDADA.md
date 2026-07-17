# Auditoria técnica consolidada — código executável

## Objetivo e escopo

Relatório consolidado para correções futuras e validação independente.

- Escopo auditado: `index.html` e módulos JavaScript/GLSL efetivamente importados por `src/main.js`.
- Fora do escopo dos achados: documentação, scripts de `tools/`, estilo de código e alterações meramente cosméticas.
- Critério: causa comprovada no código e impacto relevante, aproximadamente `>= 0,2 ms/frame`, hitch perceptível ou erro gráfico/temporal observável.
- Estado do projeto: nenhum arquivo executável foi alterado durante a auditoria.

## Evidência de execução

Além da inspeção estática, o projeto foi executado em navegador a partir de uma cópia temporária:

- tier `high`, viewport 1280×720: 34 draw calls no frame observado;
- desligar proeminências reduziu o frame observado para 19 calls, coerente com os 14 cartões emissivos do tier e a variação dos passes agendados;
- `cvolBakeFull()` medido isoladamente: **26,2 ms**;
- nenhum erro de compilação GLSL/WebGL foi observado.

As medições acima indicam ordem de grandeza e não substituem GPU timer em hardware-alvo.

## Resumo executivo

| Prioridade | Achado | Tipo | Confiança |
|---|---|---|---|
| P0 | Early-out ausente nas oito manchas reais | GPU permanente | Alta |
| P0 | Shader `coronaRays` executa o caminho pesado onde a saída é zero | GPU permanente | Alta |
| P0 | Scheduler da coroa volumétrica causa hitch inicial e duty cycle de 100% | CPU/timing | Alta |
| P0 | Composite final não converte Linear-sRGB para sRGB | Correção gráfica global | Alta |
| P1 | Segundo passe da cromosfera recalcula o mesmo campo magnético | GPU/bake | Alta |
| P1 | Um job de loop pode executar 12 sondas e quatro RK4 no mesmo frame | CPU/jank | Alta |
| P1 | Proeminências usam até 24 draw calls batcháveis | CPU/draw calls | Alta |
| P1 | MSAA/depth do framebuffer final não beneficiam a cena | GPU/memória | Alta |
| P1 | Resize realoca toda a cadeia e mantém DPR/base do auto-tune obsoletos | Responsividade/GPU | Alta |
| P1 | Espículas e raios coronais misturam espaços de coordenadas | Bug gráfico | Alta |
| P2 | Deriva idle usa wall-clock e quebra o modo determinístico | Timing/QA | Alta |
| P2 | Atalhos globais anulam teclado dos sliders | Interação/acessibilidade | Alta |
| P2 | Streak reduz 4:1 em Y sem pré-filtro vertical | Bug gráfico condicional | Alta |
| P3 | `perfBakes` cresce sem limite quando o HUD está desligado | Leak lento | Alta |

---

## P0 — correções prioritárias

### 1. Early-out ausente nas oito manchas reais

**Severidade:** alta  
**Confiança:** alta  
**Arquivo:** [`src/surface/sun.js:591`](src/surface/sun.js#L591), comparação com [`src/surface/sun.js:657`](src/surface/sun.js#L657)

#### Problema e causa

Cada fragmento do disco avalia oito `acos` e dezesseis `snoise`, mesmo estando longe de todas as manchas. O loop das manchas virtuais, estruturalmente equivalente, já possui um descarte conservador por distância de corda; o loop real não.

```glsl
float d = acos(clamp(dot(spW, f), -1.0, 1.0));
d *= 1.0 + mix(...)*snoise(...) + mix(...)*snoise(...);
```

No loop virtual:

```glsl
if (2.0*(1.0 - cv) > rv*rv*36.0) continue;
```

#### Impacto

Trabalho pesado permanente em praticamente toda a área do Sol para contribuições que terminam exatamente em zero.

#### Correção recomendada

Calcular `r`, `lifeK` e `cv = dot(spW, f)` antes de `acos`/ruídos. Descartar cargas sem vida e aplicar:

```glsl
if (2.0*(1.0 - cv) > r*r*36.0) continue;
```

O limite de `6r` é conservador para o pior fator de distorção atual.

#### Validação

- GPU timer no render principal antes/depois.
- Mesmo seed, câmera e frame em `?det=1`; diff pixel a pixel deve ser zero.
- Testar `spots=0`, `1` e `1.5`.

### 2. `coronaRays` calcula ruído e dez cargas onde a saída é zero

**Severidade:** alta  
**Confiança:** alta  
**Arquivo:** [`src/atmosphere/coronaRays.js:83`](src/atmosphere/coronaRays.js#L83)

#### Problema e causa

O shader executa três `fbmLight`, trigonometria e dez pares `acos/exp` antes de aplicar as máscaras que zeram o interior do disco e a região externa do plano.

```glsl
float rays = fbmLight(...);
// mais dois fbmLight e loop de dez cargas
float fall = exp(...);
fall *= smoothstep(diskR*0.92, diskR*1.06, r);
fall *= smoothstep(0.85, 0.55, r);
```

O último `smoothstep` ainda usa bordas invertidas, comportamento indefinido pela GLSL.

#### Impacto

Aproximadamente metade do quadrado projetado paga o caminho completo para produzir RGB zero. O plano é permanente e usa `depthTest:false`.

#### Correção recomendada

Aplicar o domínio radial antes de `atan`, ruídos e cargas:

```glsl
if (r <= diskR*0.92 || r >= 0.85) discard;
```

Expressar a rampa externa de forma definida:

```glsl
1.0 - smoothstep(0.55, 0.85, r)
```

Não desligar o plano quando `cvol` estiver ativo: ele ainda participa do look. A otimização segura é cortar apenas regiões comprovadamente nulas.

#### Validação

- GPU timer com `corona` isolada e com `cvol` ligado/desligado.
- Diff determinístico deve ser zero no driver atual.
- Confirmar ausência de costura nos dois limites radiais.

### 3. Scheduler da coroa volumétrica causa hitch inicial e duty cycle de 100%

**Severidade:** alta  
**Confiança:** alta  
**Arquivos:** [`src/atmosphere/coronaVolume.js:93`](src/atmosphere/coronaVolume.js#L93), [`src/atmosphere/coronaVolume.js:106`](src/atmosphere/coronaVolume.js#L106), [`src/main.js:488`](src/main.js#L488)

#### Problema e causa

Há duas manifestações do mesmo ciclo de vida incompleto:

1. `cvolBakeFull()` processa 64³ voxels sincronamente no carregamento ou ao ativar `cvol`.
2. `ctx.cvolAccum` continua aumentando durante as 64 fatias. A 60 Hz, o bake dura aproximadamente 1,07 s; como o limiar é 0,9 s, o próximo ciclo começa imediatamente.

```js
for (var iz = 0; iz < CVOL_N; iz++) bakeCvolSlice(iz);
```

```js
ctx.cvolAccum += delta;
if (ctx.cvolStep < 0 && ctx.cvolAccum >= 0.9) { ... }
if (ctx.cvolStep >= 0) bakeCvolSlice(ctx.cvolStep);
```

#### Impacto

- Hitch medido de **26,2 ms** no rebake integral.
- Em refresh `<= ~71 Hz`, praticamente uma fatia CPU por frame sem a folga documentada.
- Cadência dependente do refresh rate.

#### Correção recomendada

Usar uma única máquina de estados:

- inicialização também fatiada;
- manter o volume anterior/fallback até concluir;
- acumular cooldown apenas quando `cvolStep < 0`;
- zerar `cvolAccum` ao concluir o ciclo;
- publicar `cvolData`/`needsUpdate` somente após a última fatia.

O upload integral de 256 KiB ao fim do ciclo não deve ser otimizado sem GPU timer: isoladamente, não há evidência de que supere o limiar da auditoria.

#### Validação

- Nenhum long task ao ativar o slider ou o preset Sunshine.
- Registrar início/fim de ciclos: deve haver aproximadamente 0,9 s de descanso após a conclusão.
- Validar 30, 60, 90 e 120 Hz.
- Revalidar baselines determinísticos, pois a cadência temporal mudará.

### 4. Composite final não converte Linear-sRGB para sRGB de exibição

**Severidade:** alta  
**Confiança:** alta  
**Arquivos:** [`src/main.js:29`](src/main.js#L29), [`src/core/renderer.js:9`](src/core/renderer.js#L9), [`src/post/pipeline.js:319`](src/post/pipeline.js#L319)

#### Problema e causa

ACES/AgX fazem tone mapping, mas não aplicam a função de transferência sRGB. O renderer declara saída Linear-sRGB e o `ShaderMaterial` final não inclui conversão de espaço.

```js
THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
```

```glsl
vec3 aces = ACESFilm(color);
gl_FragColor = vec4(color, 1.0);
```

A documentação oficial do three.js exige sRGB para o canvas e conversão explícita em materiais customizados: <https://threejs.org/manual/en/color-management.html>.

#### Impacto

Médios-tons, saturação e relações de luminância incorretos em todos os pixels. A alegação do comentário de que ACES “embute gamma” não corresponde à função implementada.

#### Correção recomendada

Escolher exatamente uma estratégia:

1. `renderer.outputColorSpace = THREE.SRGBColorSpace` e adicionar `#include <colorspace_fragment>` ao final do composite; ou
2. manter a saída linear do renderer e aplicar manualmente a OETF sRGB uma única vez.

Os render targets intermediários devem permanecer lineares/HDR.

#### Validação

- Patch conhecido de cinza linear 0,18 e comparação com o valor sRGB esperado.
- Confirmar ausência de conversão dupla.
- Recalibrar exposição, saturação e grão; esta correção não é pixel-idêntica ao baseline defeituoso.

---

## P1 — alto retorno após P0

### 5. O passe `smear` recalcula o campo magnético do primeiro passe

**Severidade:** média-alta  
**Confiança:** alta  
**Arquivo:** [`src/surface/chromo.js:63`](src/surface/chromo.js#L63) e [`src/surface/chromo.js:172`](src/surface/chromo.js#L172)

#### Problema e causa

Os dois passes recalculam `bField`, três ruídos, `sftGrad`, ruído de giro e `fdir` usando o mesmo snapshot e timestamp.

```glsl
vec3 B = bField(sp);
B += 0.30 * vec3(snoise(...), snoise(...), snoise(...));
B += sftGrad(vUv) * 7.0;
float wig = 0.85*snoise(...);
```

#### Impacto

Duplica dez contribuições de carga, leituras da simulação e quatro simplex por texel. No tier `high`, cada passe cobre 2048×1024 texels por ciclo.

#### Correção recomendada

Gravar `fdir` em attachment auxiliar MRT, por exemplo RG16F com codificação octaédrica, e amostrá-la no `smear`. Medir se o custo adicional de banda é menor que a recomputação antes de consolidar a mudança.

#### Validação

- GPU timer separado para fatias chromo e smear.
- Diff visual nas oito bandas e na costura longitudinal.
- Testar tiers `mid`, `high` e `ultra`.

### 6. Um job de loop pode executar 12 sondas e quatro RK4 no mesmo frame

**Severidade:** média-alta  
**Confiança:** alta  
**Arquivo:** [`src/atmosphere/loops.js:304`](src/atmosphere/loops.js#L304), [`src/atmosphere/loops.js:331`](src/atmosphere/loops.js#L331), [`src/atmosphere/loops.js:447`](src/atmosphere/loops.js#L447)

#### Problema e causa

O loop externo limita um retraço ambiente por frame, mas `retraceAmbient()` pode executar doze sondas de até 88 passos e quatro RK4 de até 176 passos dentro desse job.

```js
for (var tries = 0; tries < 12 && fine < 4; tries++) {
  if (!probeFieldLine(...)) continue;
  fine++;
  var nP = traceFieldLine(...);
}
```

Cada avaliação de campo percorre dez cargas.

#### Impacto

No pior caso, mais de 100 mil contribuições de carga nas sondas, além de até 28 mil no RK4, todas em JavaScript com `sqrt`. Gera spikes ao preencher ou renovar slots.

#### Correção recomendada

Converter o retraço em job persistente com orçamento por frame:

- no máximo uma sonda/candidato por frame;
- no máximo um RK4 fino por frame;
- manter o slot invisível até conclusão;
- preservar a ordem de consumo do RNG.

#### Validação

- Usar `loopStats.ms`, `probes` e `traces`.
- Nenhum frame pode conter múltiplos RK4.
- Para o mesmo seed, a geometria final precisa permanecer igual.

### 7. Proeminências usam até 24 draw calls batcháveis

**Severidade:** média-alta  
**Confiança:** alta  
**Arquivo:** [`src/atmosphere/prominences.js:281`](src/atmosphere/prominences.js#L281)

#### Problema e causa

Cada estado cria dois meshes/materials emissivos e, quando `fprom` está ativo, um terceiro mesh de absorção.

```js
var mesh = new THREE.Mesh(geo, mat);
var mesh2 = new THREE.Mesh(geo, mat2);
var flat = new THREE.Mesh(geoF, matF);
```

#### Impacto

8–16 draws emissivos, chegando a 12–24 com absorção. No tier `high`, são 14 cartões emissivos; o preset Sunshine adiciona sete absorptivos.

#### Correção recomendada

Instanciar por tipo de shader — fan, hedgerow, arch e absorption — levando matriz, dimensão, seed, vida, tempo e intensidade em atributos por instância.

#### Validação

- Comparar `renderer.info.render.calls`.
- Meta aproximada: três draws emissivos e um de absorção.
- Diff determinístico nas orientações frontal, lateral e close-up.

### 8. MSAA e depth do framebuffer final não beneficiam a cena 3D

**Severidade:** média-alta  
**Confiança:** alta  
**Arquivo:** [`src/core/renderer.js:9`](src/core/renderer.js#L9), [`src/post/pipeline.js:34`](src/post/pipeline.js#L34), [`src/main.js:549`](src/main.js#L549)

#### Problema e causa

`antialias:true` cria um framebuffer padrão multisample, mas toda a cena é rasterizada no `sceneRT` monossample. O canvas recebe apenas um quad fullscreen. O depth padrão também é desnecessário para esse quad.

```js
renderer.setRenderTarget(sceneRT);
renderer.render(scene, camera);
// ...
renderer.setRenderTarget(null);
renderer.render(compScene, quadCamera);
```

#### Impacto

Memória, banda e resolve multisample full-resolution sem suavizar bordas 3D, especialmente em DPR 2–3.

#### Correção recomendada

- `antialias:false, depth:false` no `WebGLRenderer`;
- preservar `depthBuffer:true` no `sceneRT`;
- `depthTest:false, depthWrite:false` no material do composite.

#### Validação

- Diff determinístico deve ser zero.
- GPU timer apenas no passe final.
- Conferir memória do framebuffer em DPR 1, 2 e 3.

### 9. Resize realoca toda a cadeia e mantém DPR/base obsoletos

**Severidade:** média-alta  
**Confiança:** alta  
**Arquivo:** [`src/main.js:194`](src/main.js#L194), [`src/core/renderer.js:14`](src/core/renderer.js#L14), [`src/core/perf.js:56`](src/core/perf.js#L56), [`src/post/pipeline.js:493`](src/post/pipeline.js#L493)

#### Problema e causa

Cada evento chama imediatamente `renderer.setSize()` e redimensiona `sceneRT`, todos os mips e dois targets de streak. Além disso, `ctx.pixelRatio` e `baseDpr` são capturados apenas no boot.

#### Impacto

- Drag/orientação: realocações repetidas de attachments half-float e jank.
- Mudança de DPR/zoom: imagem borrada ou renderização permanente de pixels excedentes.
- O auto-tune continua escalando sobre uma base antiga.

#### Correção recomendada

- O listener apenas marca resize dirty e guarda o último tamanho/DPR.
- Aplicar uma única atualização no próximo frame.
- Ignorar dimensões físicas idênticas.
- Centralizar o cálculo do DPR base, respeitando cap do tier, `RENDER_SCALE` e `SCALE_STEPS[scaleIdx]`.
- Tornar `baseDpr` atualizável no módulo de performance.
- Observar mudança de resolução com `matchMedia` quando não houver evento de tamanho.

#### Validação

- Instrumentar chamadas `setSize`: no máximo uma por frame.
- Arrastar a janela por vários segundos e observar long tasks/memória.
- Testar zoom e mudança entre monitores 1×/2×.
- Confirmar que o auto-tune continua subindo/descendo escala corretamente.

### 10. Espículas e raios coronais usam transformações mundo→objeto incompletas

**Severidade:** média  
**Confiança:** alta  
**Arquivo:** [`src/atmosphere/spicules.js:43`](src/atmosphere/spicules.js#L43), [`src/atmosphere/coronaRays.js:88`](src/atmosphere/coronaRays.js#L88), [`src/main.js:163`](src/main.js#L163)

#### Problema e causa

- Espículas fazem `dot` e subtração entre `vPosObj`, em espaço de objeto, e `viewDir`, em mundo.
- Raios coronais transformam mundo→objeto apenas com `-uRotY`, ignorando a inclinação solar fixa de 7,25°.

```glsl
vec3 sil = normalize(vPosObj - viewDir*dot(vPosObj, viewDir));
```

Enquanto:

```js
sunMesh.rotation.z = 0.1265;
```

#### Impacto

O padrão das espículas não permanece rigorosamente ancorado ao objeto; streamers ficam deslocados das cargas/regiões ativas.

#### Correção recomendada

Fornecer `mat3 uSunInvRot`, derivada da rotação mundial completa, e converter todas as direções mundiais para objeto antes de `dot`, projeção ou amostragem. Proteger a normalização da rejeição com epsilon.

#### Validação

- Acompanhar uma carga conhecida durante órbita e rotação.
- Streamer e resposta das espículas devem permanecer ancoradas ao mesmo ponto.
- Revalidar o limbo durante pelo menos uma rotação completa acelerada.

---

## P2 — correções funcionais condicionais

### 11. Deriva idle usa wall-clock e quebra o modo determinístico

**Severidade:** média  
**Confiança:** alta  
**Arquivo:** [`src/main.js:538`](src/main.js#L538), contrato em [`src/core/config.js:18`](src/core/config.js#L18)

#### Problema e causa

O modo `DET` fixa `rawDelta`, mas a ativação da deriva idle depende de `performance.now()`:

```js
if (pointers.size === 0 && performance.now()-ctx.lastInteraction > 2200) {
  ctx.theta += 0.066*rawDelta;
}
```

O frame em que a deriva começa depende da velocidade real da máquina.

#### Impacto

O mesmo seed/frame diverge entre GPU rápida, SwiftShader e execuções com jitter, tornando paridade pixel a pixel instável.

#### Correção recomendada

No modo determinístico, usar tempo simulado ou `ctx.detFrames > 132`. No modo normal, manter wall-clock.

#### Validação

Executar o mesmo frame em hardware e SwiftShader; hashes/screenshot devem coincidir.

### 12. Atalhos globais anulam o teclado dos sliders

**Severidade:** média  
**Confiança:** alta  
**Arquivo:** [`src/camera/controls.js:200`](src/camera/controls.js#L200), sliders em [`src/ui/panel.js:204`](src/ui/panel.js#L204)

#### Problema e causa

`keydown` está registrado em `window` e chama `preventDefault()` para setas, `+`, `-` e `R` sem verificar `e.target`.

#### Impacto

Com um range focado, a seta não ajusta o slider e ainda gira a câmera; também chama `directorUserExit()` indevidamente.

#### Correção recomendada

Antes de qualquer efeito:

```js
var el = e.target;
if (el && (el.matches('input, select, textarea, button, [contenteditable="true"]'))) return;
```

#### Validação

- Navegação completa do painel apenas por teclado.
- Atalhos continuam funcionando com foco no canvas/body.
- Testar leitor de tela e focus ring.

### 13. Streak reduz 4:1 em Y sem pré-filtro vertical

**Severidade:** média  
**Confiança:** alta  
**Arquivo:** [`src/post/pipeline.js:157`](src/post/pipeline.js#L157), [`src/post/pipeline.js:184`](src/post/pipeline.js#L184), [`src/post/pipeline.js:505`](src/post/pipeline.js#L505)

#### Problema e causa

O primeiro passe lê `bloomMips[1]`, aproximadamente `w/4 × h/4`, e grava em `streakRTa`, `w/4 × h/16`. O shader faz 17 taps somente em X; a redução vertical 4:1 depende de uma única amostra bilinear, que cobre apenas parte das linhas-fonte.

```glsl
texture2D(tDiffuse, vUv + vec2(float(i)*uTexelX*uStride, 0.0))
```

#### Impacto

Com `streak>0`, fontes brilhantes em movimento vertical podem alterar intensidade/pulsar por alias temporal.

#### Correção recomendada

Adicionar pré-filtro vertical no primeiro passe:

- duas amostras bilineares em Y por tap horizontal, cobrindo as quatro linhas-fonte; ou
- passe vertical 4:1 separado antes do blur horizontal.

Não adicionar apenas taps arbitrários sem verificar a posição dos centros de texel.

#### Validação

- Forçar flare brilhante e mover a câmera verticalmente em velocidade constante.
- Plotar luminância total do streak por frame; não deve haver modulação periódica.
- Revalidar energia do efeito após o filtro.

---

## P3 — manutenção confirmada

### 14. `perfBakes` cresce sem limite quando o HUD está desligado

**Severidade:** baixa  
**Confiança:** alta  
**Arquivo:** [`src/main.js:300`](src/main.js#L300), poda em [`src/debug/solinfo.js:41`](src/debug/solinfo.js#L41)

#### Problema e causa

O hot path faz `perfBakes.push(frameT0)` a cada ciclo. A poda de entradas antigas só ocorre quando alguém chama `window.__solInfo.perf()`, normalmente com HUD ligado.

#### Impacto

No default, o array pode crescer cerca de 7,5 entradas/s em 60 Hz, aproximadamente 27 mil entradas/hora, além da capacidade excedente do array. É um leak lento, relevante apenas em sessões longas.

#### Correção recomendada

Podar no próprio hot path após o push ou trocar por ring buffer/counter de janela fixa. Evitar `shift()` repetido em arrays grandes.

#### Validação

Sessão longa com HUD desligado: comprimento e memória devem permanecer limitados.

---

## Item em investigação

### Artefato retangular transitório em `high`/`ultra`

**Status:** sintoma observado, causa ainda não comprovada  
**Confiança:** baixa quanto à causa; alta quanto à existência do sintoma

#### Evidência observada

Foi capturado um frame com um grande retângulo verde e preto, alinhado aos pixels da tela, sobreposto à cena. O artefato aparece por tempo muito curto, com comportamento de piscada, e foi relatado como mais frequente nos tiers `high` e `ultra`.

Uma execução exploratória posterior em outra pilha gráfica permaneceu limpa durante 15 capturas espaçadas no tier `ultra`, sem erros WebGL no console. A ausência de reprodução fora do hardware-alvo indica possível dependência de GPU, driver, navegador, DPR ou pressão momentânea de recursos.

#### Hipóteses relacionadas

O formato alinhado à tela é mais compatível com corrupção transitória de framebuffer, render target ou compositor da GPU do que com uma geometria normal da cena. Os achados 5, 8 e 9 podem aumentar a probabilidade do sintoma em hardware específico:

- os dois passes cromosféricos cobrem 2048×1024 texels por ciclo em `high`/`ultra`;
- MSAA e depth do framebuffer final consomem memória, banda e resolve adicionais em DPR 2–3;
- resize e mudanças de escala realocam a cadeia de attachments half-float.

Operações GLSL formalmente indefinidas, como `smoothstep` com bordas invertidas, permanecem como hipótese secundária dependente de driver. Não há evidência suficiente para atribuir o artefato a um desses fatores isoladamente, e hitch de CPU por si só não explica a perda retangular de cor observada.

#### Validação necessária

- Registrar GPU, versão do driver, navegador, sistema operacional, DPR, resolução, tier e knobs quando ocorrer.
- Repetir em `high` e `ultra` com `scale=0.7`; desaparecimento consistente reforça pressão de framebuffer/banda.
- Isolar `bake`, `bloom` e `corona3d` com `window.__solInfo.toggle()` sem mudar os demais parâmetros.
- Comparar uma captura direta do canvas com screenshot do sistema no mesmo instante: artefato apenas na segunda aponta para compositor/driver; presente nas duas aponta para o pipeline WebGL.
- Verificar correlação temporal com resize, mudança de monitor/DPR, evento do auto-tune, fatias do bake cromosférico e upload da coroa volumétrica.
- Só promover a achado confirmado após reprodução controlada ou isolamento de um subsistema.

---

## Itens avaliados e não promovidos a achado

| Item | Decisão | Motivo |
|---|---|---|
| Upload completo do `Data3DTexture` 64³ | Não incluir | São 256 KiB por ciclo; falta evidência de custo `>= 0,2 ms`. Uploads parciais por fatia podem aumentar chamadas e sincronização. |
| Dois planos coronais simultâneos | Absorvido pelo achado 2 | O overdraw existe, mas desligar `coronaRays` altera o look. O corte radial é a otimização visualmente segura. |
| Substituir esfera de espículas por anel | Não incluir | Custo relevante e equivalência visual não foram comprovados. O shader descarta cedo grande parte do interior. |
| `sort()` do auto-tune | Não incluir | Janela máxima de 150 números; custo medido por outro auditor ficou abaixo do limiar. |
| Transição CSS do botão de ajustes | Não incluir | O `style.transition +=` é inválido quando o inline style está vazio, mas o efeito é apenas cosmético. |
| `driftCharge` sob `lapse` | Não incluir | Mecânica real, porém impacto visual estimado subperceptível antes do renascimento das regiões. |
| Outros `smoothstep` com bordas invertidas | Reavaliar durante correções | São formalmente indefinidos pela GLSL, mas não houve evidência independente de impacto no driver-alvo. Corrigir junto ao shader afetado, com diff visual. |

## Ordem sugerida de implementação

1. Early-out das manchas reais.
2. Early-out e `smoothstep` definido em `coronaRays`.
3. Refatorar o scheduler do volume: inicialização fatiada + cooldown após conclusão.
4. Desligar MSAA/depth do framebuffer final.
5. Corrigir resize/DPR.
6. Orçamentar jobs RK4 de loops.
7. Instanciar proeminências.
8. Cachear a direção magnética entre chromo/smear, condicionado a GPU timer.
9. Corrigir o output sRGB e recalibrar o look em branch isolada.
10. Corrigir espaços das camadas atmosféricas.
11. Corrigir determinismo, teclado, streak e leak de telemetria.

## Protocolo mínimo para cada correção

### Otimizações que prometem imagem idêntica

- `?det=1`, seed e frame fixos.
- Mesmo tier, viewport, DPR, câmera e knobs.
- Screenshot antes/depois e diff pixel a pixel.
- GPU timer ou medição CPU específica do subsistema; não usar apenas FPS médio.
- Medir `avg`, `p95` e pior frame.

### Correções gráficas deliberadas

- Espaço de cor: referência sRGB conhecida, sem conversão dupla.
- Espaços de coordenadas: acompanhar features ancoradas durante rotação/câmera.
- Streak: teste temporal com fonte movendo-se verticalmente.
- Registrar novos baselines somente após aprovação visual.

### Responsividade e timing

- Resize contínuo, orientação e troca de DPR.
- 30/60/90/120 Hz e retomada após aba em background.
- Hardware e SwiftShader para o modo determinístico.
- Teclado, mouse e touch com painel aberto/fechado.

## Condição de encerramento

Uma correção só deve ser marcada como concluída quando:

1. a causa no código foi removida;
2. o ganho ou correção foi medido no subsistema afetado;
3. não houve regressão visual fora das mudanças intencionais;
4. recursos e estado continuam corretos após resize, pausa e retomada;
5. o relatório ou baseline de validação registra a evidência.

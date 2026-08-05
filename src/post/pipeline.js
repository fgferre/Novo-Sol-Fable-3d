// post/pipeline.js — bloom multi-escala + streak + composite (ACES, CA,
// DoF, burst, vinheta, grão). Corpo verbatim; knobs de cinema e estado de
// adaptação/foco viram ctx.* (painel/solinfo/director/animate escrevem).

import * as THREE from 'three';
import { quadVertex } from '../glsl/common.js';
import { bloomGain, grainGain } from '../core/controls.js';

export function createPipeline(ctx){
  var renderer = ctx.renderer, isHDR = ctx.isHDR, rtType = ctx.rtType,
      knob = ctx.knob, lk = ctx.lk, BLOOM_LEVELS = ctx.BLOOM_LEVELS,
      makeFullscreenScene = ctx.makeFullscreenScene, quadCamera = ctx.quadCamera,
      urlQ = ctx.urlQ || {};
  // ---------------------------------------------------------------
  // Bloom multi-escala (cadeia de downsample + threshold, depois
  // upsample aditivo — técnica tipo "dual Kawase" usada em engines
  // de jogos), seguido de tonemap fílmico ACES no composite final.
  // ---------------------------------------------------------------
  // HDR: targets em half-float para que a emissão >1.0 do shader do Sol
  // sobreviva até o bloom. A detecção precisa ser ciente do contexto:
  //  - WebGL2: half-float é núcleo; a RENDERIZAÇÃO para ele exige
  //    EXT_color_buffer_float (ou _half_float). Consultar as extensões
  //    OES_* do WebGL1 aqui gera warnings e falso-negativo.
  //  - WebGL1: exige OES_texture_half_float (+_linear) e
  //    EXT_color_buffer_half_float.
  // Consultamos gl.getExtension direto (silencioso), nunca
  // renderer.extensions.get (que loga warning quando não acha).
  // (rtType/isHDR detectados no topo, antes dos targets da simulação)
  // Calibração do sweep T2.1 (5 variantes julgadas vs refs): com o disco
  // H-alfa pico ~0.98 de luminância, threshold 1.0 nunca florescia — só
  // flare raro. 0.72 + emissivos HDR de plage/limbo (no shader do sol)
  // fazem o bloom LER sem lavar o disco (p50 +2%, 0% de pixels clipados).
  // Achado 4 — recalibração de APRESENTAÇÃO pós-OETF: com a conversão
  // sRGB correta no fim do composite, a exposição antiga (1.02/1.06)
  // estourava os médios-tons (+48 de luminância média nas 7 vistas do
  // gate). 0.41× o valor antigo (0.418/0.435) minimiza o L1 do histograma
  // de luminância contra o look aprovado (grid GPU nas 5 vistas default:
  // ΔL médio ≤ +6, resíduo = o lift físico das sombras que a OETF revela).
  // O preset Sunshine (exposure 1.08 relativo) cavalga o mesmo fator.
  var EXP0 = isHDR ? 0.418 : 0.435;
  var BLOOM_THRESHOLD = knob('bloomth');
  var BLOOM_KNEE = knob('bloomknee');
  var BLOOM_SPREAD = knob('bloomspread');

  // Achado 8: a cena 3D (esfera do Sol, estrelas) É rasterizada AQUI, então
  // o depth DESTE alvo é obrigatório para a oclusão 3D — NÃO desligar. Só o
  // depth do framebuffer default (renderer.js) é inútil e foi removido.
  var sceneRT = new THREE.WebGLRenderTarget(2,2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: rtType, stencilBuffer:false, depthBuffer:true
  });

  var bloomMips = [];
  (function initBloomMips(){
    for (var i=0;i<BLOOM_LEVELS;i++){
      var rt = new THREE.WebGLRenderTarget(2, 2, {
        minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
        format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false
      });
      bloomMips.push({ rt: rt, w: 2, h: 2 });
    }
  })();

  var thresholdUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)},
    uThreshold:{value:BLOOM_THRESHOLD}, uKnee:{value:BLOOM_KNEE} };
  var thresholdFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uThreshold;',
    'uniform float uKnee;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  vec3 c2 = c;',
    '  c2 += texture2D(tDiffuse, vUv+vec2(uTexel.x,0.0)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv-vec2(uTexel.x,0.0)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv+vec2(0.0,uTexel.y)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv-vec2(0.0,uTexel.y)).rgb;',
    '  c2 /= 5.0;',
    '  float b = dot(c2, vec3(0.299,0.587,0.114));',
    '  float f = (uKnee <= 0.0001) ? step(uThreshold, b)',
    '             : smoothstep(uThreshold, uThreshold+uKnee, b);',
    '  gl_FragColor = vec4(c2*f, 1.0);',
    '}'
  ].join('\n');
  var thresholdMaterial = new THREE.ShaderMaterial({ uniforms: thresholdUniforms, vertexShader: quadVertex, fragmentShader: thresholdFragment });
  var thresholdScene = makeFullscreenScene(thresholdMaterial);

  var downsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)},
    uDisp:{value:0.0}, uSpread:{value:BLOOM_SPREAD} };
  var downsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
    'uniform float uSpread;',
    'varying vec2 vUv;',
    'void main(){',
    // FASE 2 — bloom espectral ponderado por corpo negro: raio de blur
    // POR CANAL (difração ∝ λ — R borra mais largo, B mais estreito;
    // razão ancorada em λ_R/λ_B ≈ 700/450). Este é o termo da DESCIDA;
    // o grosso do espalhamento diferencial acontece na subida (tent por
    // canal no upsampleFragment). Sem passes novos: só taps a mais, e
    // só quando o knob liga.
    '  if (uDisp > 0.001){',
    '    vec2 oR = uTexel * uSpread * (1.0 + 0.35*uDisp);',
    '    vec2 oB = uTexel * uSpread * (1.0 - 0.25*uDisp);',
    '    vec2 oG = uTexel * uSpread;',
    '    vec3 cS;',
    '    cS.r = texture2D(tDiffuse, vUv+vec2( oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2( oR.x,-oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x,-oR.y)).r;',
    '    cS.g = texture2D(tDiffuse, vUv+vec2( oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2( oG.x,-oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x,-oG.y)).g;',
    '    cS.b = texture2D(tDiffuse, vUv+vec2( oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2( oB.x,-oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x,-oB.y)).b;',
    '    gl_FragColor = vec4(cS*0.25, 1.0);',
    '    return;',
    '  }',
    '  vec2 o = uTexel*uSpread;',
    '  vec3 c = texture2D(tDiffuse, vUv+vec2(o.x,o.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-o.x,o.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(o.x,-o.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-o.x,-o.y)).rgb;',
    '  gl_FragColor = vec4(c*0.25, 1.0);',
    '}'
  ].join('\n');
  var downsampleMaterial = new THREE.ShaderMaterial({ uniforms: downsampleUniforms, vertexShader: quadVertex, fragmentShader: downsampleFragment });
  var downsampleScene = makeFullscreenScene(downsampleMaterial);

  var upsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)},
    uDisp:{value:0.0}, uSpread:{value:BLOOM_SPREAD} };
  var upsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
    'uniform float uSpread;',
    'varying vec2 vUv;',
    'void main(){',
    // FASE 2 — bloom espectral: o grosso do raio do dual-Kawase vem da
    // pirâmide em si (downsample bilinear), que é acromática; para o R
    // espalhar DE VERDADE mais que o B, a subida troca o passthrough
    // por um tent de 4 taps com raio POR CANAL a cada nível — o
    // espalhamento diferencial compõe sobre o sinal acumulado inteiro
    // (só o downsample espectral era imperceptível: ΔR médio +0.2/255
    // no smoke; medido 2026-07).
    '  if (uDisp > 0.001){',
    '    vec2 oR = uTexel * uSpread * (0.5 + 1.70*uDisp);',
    '    vec2 oG = uTexel * uSpread * 0.5;',
    '    vec2 oB = uTexel * uSpread * max(0.5 - 0.34*uDisp, 0.0);',
    '    vec3 cS;',
    '    cS.r = texture2D(tDiffuse, vUv+vec2( oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2( oR.x,-oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x,-oR.y)).r;',
    '    cS.g = texture2D(tDiffuse, vUv+vec2( oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2( oG.x,-oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x,-oG.y)).g;',
    '    cS.b = texture2D(tDiffuse, vUv+vec2( oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2( oB.x,-oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x,-oB.y)).b;',
    '    gl_FragColor = vec4(cS*0.25, 1.0);',
    '    return;',
    '  }',
    '  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);',
    '}'
  ].join('\n');
  var upsampleMaterial = new THREE.ShaderMaterial({
    uniforms: upsampleUniforms, vertexShader: quadVertex, fragmentShader: upsampleFragment,
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false
  });
  var upsampleScene = makeFullscreenScene(upsampleMaterial);

  // streak anamórfico (camada cinema): pré-filtro vertical + blur
  // horizontal longo em RT pequeno (w/4 × h/16), 3 passes reusando 2 RTs
  // (fonte→A, A→B, B→A) com alcance horizontal crescente; só roda quando
  // o knob streak > 0 — custo zero no default
  var streakRTa = new THREE.WebGLRenderTarget(2,2, {
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false
  });
  var streakRTb = streakRTa.clone();
  var streakW = 2, streakH = 2;
  var streakUniforms = { tDiffuse:{value:null}, uTexelX:{value:1}, uStride:{value:2} };
  var streakFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform float uTexelX;',
    'uniform float uStride;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 acc = vec3(0.0); float wsum = 0.0;',
    '  for (int i = -8; i <= 8; i++){',
    '    float w = exp(-0.35*abs(float(i)));',
    '    acc += texture2D(tDiffuse, vUv + vec2(float(i)*uTexelX*uStride, 0.0)).rgb * w;',
    '    wsum += w;',
    '  }',
    '  gl_FragColor = vec4(acc/wsum, 1.0);',
    '}'
  ].join('\n');
  var streakMaterial = new THREE.ShaderMaterial({ uniforms: streakUniforms, vertexShader: quadVertex, fragmentShader: streakFragment });
  var streakScene = makeFullscreenScene(streakMaterial);
  // Achado 13 — pré-filtro vertical do streak. O 1º passe reduz 4:1 em Y
  // (bloomMips[1] ~h/4 → streakRTa ~h/16): o centro de cada texel-destino d
  // mapeia para ~4d+2 no espaço de texel da FONTE, exatamente na fronteira
  // entre as linhas 4d+1 e 4d+2. Uma ÚNICA amostra bilinear (o que havia)
  // lê só esse par do meio e IGNORA as linhas 4d e 4d+3 → fontes brilhantes
  // em pan vertical aliasam/pulsam. Duas amostras bilineares em ±1 texel-
  // fonte caem em 4d+1 (média bilinear de 4d,4d+1) e 4d+3 (média de 4d+2,
  // 4d+3); a média das duas integra as QUATRO linhas com peso 0.25 cada.
  // Largura idêntica (fonte w/4 → A w/4) ⇒ mapeamento identidade em X, sem
  // reamostragem horizontal; o blur H fica nos passes 2 e 3.
  var streakPreUniforms = { tDiffuse:{value:null}, uTexelY:{value:1} };
  var streakPreFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform float uTexelY;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv + vec2(0.0,  uTexelY)).rgb;',
    '  c     += texture2D(tDiffuse, vUv + vec2(0.0, -uTexelY)).rgb;',
    '  gl_FragColor = vec4(c * 0.5, 1.0);',
    '}'
  ].join('\n');
  var streakPreMaterial = new THREE.ShaderMaterial({ uniforms: streakPreUniforms, vertexShader: quadVertex, fragmentShader: streakPreFragment });
  var streakPreScene = makeFullscreenScene(streakPreMaterial);
  function renderStreak(){
    // passe 1 — pré-filtro vertical (fonte bloomMips[1] → A): a redução 4:1
    // em Y integra as 4 linhas-fonte (2 taps bilineares em ±1 texel-fonte)
    var src = bloomMips[Math.min(1, bloomMips.length-1)];
    streakPreUniforms.tDiffuse.value = src.rt.texture;
    streakPreUniforms.uTexelY.value = 1/src.h;
    renderer.setRenderTarget(streakRTa);
    renderer.render(streakPreScene, quadCamera);
    // passe 2 — blur horizontal curto (A → B, stride 2)
    streakUniforms.tDiffuse.value = streakRTa.texture;
    streakUniforms.uTexelX.value = 1/streakW;
    streakUniforms.uStride.value = 2.0;
    renderer.setRenderTarget(streakRTb);
    renderer.render(streakScene, quadCamera);
    // passe 3 — blur horizontal longo (B → A, stride 8); o composite lê A
    streakUniforms.tDiffuse.value = streakRTb.texture;
    streakUniforms.uStride.value = 8.0;
    renderer.setRenderTarget(streakRTa);
    renderer.render(streakScene, quadCamera);
  }

  function renderBloom(){
    thresholdUniforms.tDiffuse.value = sceneRT.texture;
    thresholdUniforms.uTexel.value.set(1/sceneRT.width, 1/sceneRT.height);
    renderer.setRenderTarget(bloomMips[0].rt);
    renderer.render(thresholdScene, quadCamera);

    for (var i=1;i<bloomMips.length;i++){
      downsampleUniforms.tDiffuse.value = bloomMips[i-1].rt.texture;
      downsampleUniforms.uTexel.value.set(1/bloomMips[i-1].w, 1/bloomMips[i-1].h);
      renderer.setRenderTarget(bloomMips[i].rt);
      renderer.render(downsampleScene, quadCamera);
    }

    for (var j=bloomMips.length-2;j>=0;j--){
      upsampleUniforms.tDiffuse.value = bloomMips[j+1].rt.texture;
      upsampleUniforms.uTexel.value.set(1/bloomMips[j+1].w, 1/bloomMips[j+1].h);
      renderer.setRenderTarget(bloomMips[j].rt);
      renderer.autoClear = false;
      renderer.render(upsampleScene, quadCamera);
      renderer.autoClear = true;
    }
  }

  // Métrica sob demanda: reduz o bright-pass e o bloom acumulado para um
  // alvo byte 64² e faz um único readback síncrono somente quando QA/UI de
  // diagnóstico pede. O caminho normal não renderiza nem lê este alvo.
  var bloomMetricRT = new THREE.WebGLRenderTarget(64,64, {
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat, type:THREE.UnsignedByteType,
    depthBuffer:false, stencilBuffer:false
  });
  var bloomMetricUniforms = { tDiffuse:{value:null} };
  var bloomMetricMaterial = new THREE.ShaderMaterial({
    uniforms:bloomMetricUniforms, vertexShader:quadVertex,
    fragmentShader:[
      'uniform sampler2D tDiffuse;',
      'varying vec2 vUv;',
      'void main(){ gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb,1.0); }'
    ].join('\n')
  });
  var bloomMetricScene = makeFullscreenScene(bloomMetricMaterial);
  var bloomMetricPixels = new Uint8Array(64*64*4);
  function summarizeBloomMetric(){
    renderer.readRenderTargetPixels(bloomMetricRT,0,0,64,64,bloomMetricPixels);
    var energy=0, cover=0, sx=0, sy=0, i, x, y;
    for (y=0;y<64;y++) for(x=0;x<64;x++){
      i=(y*64+x)*4;
      var lum=(bloomMetricPixels[i]*0.299+bloomMetricPixels[i+1]*0.587+bloomMetricPixels[i+2]*0.114)/255;
      if(lum>1/255)cover++;
      energy+=lum;sx+=lum*(x+0.5);sy+=lum*(y+0.5);
    }
    var radius=0;
    if(energy>1e-9){
      var cx=sx/energy,cy=sy/energy;
      for(y=0;y<64;y++)for(x=0;x<64;x++){
        i=(y*64+x)*4;
        var l=(bloomMetricPixels[i]*0.299+bloomMetricPixels[i+1]*0.587+bloomMetricPixels[i+2]*0.114)/255;
        var dx=x+0.5-cx,dy=y+0.5-cy;radius+=l*(dx*dx+dy*dy);
      }
      radius=Math.sqrt(radius/energy)/64;
    }
    return { coverage:cover/(64*64), energy:energy/(64*64), radius:radius };
  }
  function measureBloom(){
    var previous=renderer.getRenderTarget(), autoClear=renderer.autoClear;
    thresholdUniforms.tDiffuse.value=sceneRT.texture;
    thresholdUniforms.uTexel.value.set(1/sceneRT.width,1/sceneRT.height);
    renderer.setRenderTarget(bloomMetricRT);renderer.autoClear=true;
    renderer.render(thresholdScene,quadCamera);
    var bright=summarizeBloomMetric();
    bloomMetricUniforms.tDiffuse.value=bloomMips[0].rt.texture;
    renderer.setRenderTarget(bloomMetricRT);renderer.render(bloomMetricScene,quadCamera);
    var spread=summarizeBloomMetric();
    renderer.setRenderTarget(previous);renderer.autoClear=autoClear;
    ctx.lastBloomMetrics={
      coverage:+bright.coverage.toFixed(6),
      brightEnergy:+bright.energy.toFixed(6),
      energy:+(spread.energy*ctx.BLOOM_STRENGTH_BASE).toFixed(6),
      radius:+spread.radius.toFixed(6),
      threshold:thresholdUniforms.uThreshold.value,
      knee:thresholdUniforms.uKnee.value,
      spread:downsampleUniforms.uSpread.value,
      gain:bloomGain(ctx.getAppliedControl('bloom'))
    };
    return Object.assign({},ctx.lastBloomMetrics);
  }

  var BLOOM_BASE0 = isHDR ? 0.62 : 0.55;
  ctx.BLOOM_STRENGTH_BASE = BLOOM_BASE0 * bloomGain(knob('bloom'));
  // camada cinema (ver docs/cinema-sunshine.md): defaults 0 = frame
  // pixel-idêntico ao calibrado; valores em JS p/ gating por toggle
  ctx.VEIL_BASE = knob('veil');
  ctx.STREAK_K = knob('streak');
  ctx.ADAPT_K = knob('adapt');
  // FASE 1 — starburst de difração no ponto do flare, dirigido pelo
  // brilho HDR REAL que chega à lente (envelope × visibilidade do
  // ponto no hemisfério voltado à câmera). Default 0 = sem efeito.
  ctx.BURST_K = knob('burst');
  // FASE 2 — a luz como matéria: dispersão espectral do bloom (raios de
  // blur por canal no dual-Kawase, ver downsampleFragment) e halação com
  // peso de temperatura (só as altas QUENTES sangram para o vermelho,
  // ver branch uHal no compFragment). Defaults 0 = frame pixel-idêntico.
  ctx.DISP_K = knob('disp');
  ctx.HAL_K = knob('hal');
  // hand: linguagem de câmera do Sunshine — o Sol é filmado em lente
  // longa com deriva lenta e micro-tremor de operador (0.1-0.3 Hz + um
  // harmônico rápido fraco). Soma de senos incomensuráveis = pseudo-
  // perlin sem alocação; média zero, NÃO acumula no estado da câmera.
  ctx.HAND_K = knob('hand');
  ctx.adaptCur = 1.0;
  // FASE 5 — foco raso: plano de foco corrente (lerp curto = focus
  // pull de maquinista) e override do modo diretor/QA (-1 = automático,
  // foco na superfície mais próxima do disco)
  ctx.dofFocusCur = 0.0;
  ctx.dofFocusOverride = -1;
  var cineProj = new THREE.Vector3();
  // FASE 1: flare em espaço de MUNDO (p/ visibilidade) + projeção do
  // starburst — temporários reutilizados, zero alocação por frame
  var flareWorldTmp = new THREE.Vector3();
  var burstProj = new THREE.Vector3();
  ctx.lastFlareHDR = 0;
  var compUniforms = {
    tScene:{value:null}, tBloom:{value:null}, tVeil:{value:null}, tStreak:{value:null},
    uStreak:{value: 0.0},
    uBloomStrength:{value: ctx.BLOOM_STRENGTH_BASE},
    uExposure:{value: EXP0 * knob('exposure')},
    // Achado 4 — recalibração: a saturação agora é misturada em LINEAR
    // (antes, em display); 1.08 devolve a saturação média aprovada
    // (Δsat ≤ ±0.04 nas 7 vistas do gate vs |−0.18| sem recalibrar).
    uSat:{value: knob('sat')},
    uVig:{value: knob('vig')},
    uGrain:{value: grainGain(knob('grain'))},
    uVeil:{value: 0.0},
    // FASE 2 — halação com peso de temperatura (0 = ramo desligado)
    uHal:{value: 0.0},
    uAdapt:{value: 1.0},
    uFringe:{value: knob('fringe')},
    uShimmer:{value: knob('shimmer')},
    uTone:{value: knob('tone')},
    // film: mistura ACES (0) -> AgX (1). AgX desatura as altas de forma
    // gradual — o centro do disco para de "clipar nuclear" e resolve a
    // pendência de recalibração pós-ACES do audit-loop6. Default 0 =
    // pixel-idêntico ao baseline.
    uFilm:{value: knob('film')},
    uCTime:{value: 0.0},
    uSunC:{value: new THREE.Vector2(0.5, 0.5)},
    uSunR:{value: 0.33},
    uAspect:{value: 1.0},
    // FASE 1 — starburst de difração (0 fora de flare/knob desligado)
    uBurst:{value: 0.0},
    uBurstPos:{value: new THREE.Vector2(0.5, 0.5)},
    uBurstRot:{value: 0.0},
    // FASE 5 — profundidade de campo hexagonal: uDof = raio máximo de
    // desfoque em UV NESTE frame (knob × fator de close-up, calculado
    // no JS — em fit é 0 e o ramo morre), uDofFocus = plano de foco no
    // perfil analítico da esfera (0 = centro do disco/superfície mais
    // próxima; 1 = limbo — o "focus pull" do modo diretor)
    uDof:{value: 0.0},
    uDofFocus:{value: 0.0},
    // Achado 4 — patch numérico de QA (?colorpatch=1): quadrantes de cinza
    // LINEAR conhecido escritos POR CIMA do frame já graduado, atravessando
    // só a OETF final. Constante por sessão (vem da URL), 0 = ramo morto.
    uPatch:{value: (urlQ.colorpatch === '1') ? 1.0 : 0.0}
  };
  var compFragment = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform sampler2D tVeil;',
    'uniform sampler2D tStreak;',
    'uniform float uStreak;',
    'uniform float uBloomStrength;',
    'uniform float uExposure;',
    'uniform float uSat;',
    'uniform float uVig;',
    'uniform float uGrain;',
    'uniform float uVeil;',
    'uniform float uHal;',
    'uniform float uAdapt;',
    'uniform float uFringe;',
    'uniform float uShimmer;',
    'uniform float uTone;',
    'uniform float uFilm;',
    'uniform float uCTime;',
    'uniform vec2 uSunC;',
    'uniform float uSunR;',
    'uniform float uAspect;',
    'uniform float uBurst;',
    'uniform vec2 uBurstPos;',
    'uniform float uBurstRot;',
    'uniform float uDof;',
    'uniform float uDofFocus;',
    'uniform float uPatch;',
    'varying vec2 vUv;',
    'vec3 ACESFilm(vec3 x){',
    '  float a=2.51; float b=0.03; float c=2.43; float d=0.59; float e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',
    // AgX (fit polinomial de B. Wrensch sobre o AgX de T. Sobotka): curva
    // de resposta tipo filme com rolloff suave nas altas. Achado 4: o fit
    // devolve o valor no espaço CODIFICADO (~gamma 2.2) do AgX base sRGB —
    // a linearização pow(2.2) que a referência aplica quando o alvo não é
    // o display estava OMITIDA (e o ACES NÃO "embute gamma": o fit de
    // Narkowicz é linear→linear). Restaurada após o outset: AgXFilm devolve
    // Linear-sRGB, comparável ao ACES, e a OETF única do fim exibe ambos.
    'vec3 agxContrast(vec3 x){',
    '  vec3 x2 = x*x; vec3 x4 = x2*x2;',
    '  return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232;',
    '}',
    'vec3 AgXFilm(vec3 val){',
    '  const mat3 agx_mat = mat3(',
    '    0.842479062253094, 0.0423282422610123, 0.0423756549057051,',
    '    0.0784335999999992, 0.878468636469772, 0.0784336,',
    '    0.0792237451477643, 0.0791661274605434, 0.879142973793104);',
    '  const mat3 agx_mat_inv = mat3(',
    '    1.19687900512017, -0.0528968517574562, -0.0529716355144438,',
    '    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,',
    '    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);',
    '  const float min_ev = -12.47393;',
    '  const float max_ev = 4.026069;',
    '  val = agx_mat * val;',
    '  val = clamp(log2(max(val, vec3(1e-10))), min_ev, max_ev);',
    '  val = (val - min_ev) / (max_ev - min_ev);',
    '  val = agxContrast(val);',
    // outset (inversa do inset): devolve a saturação que o inset guardou;
    // sem isto o resultado fica leitoso/dessaturado
    '  val = agx_mat_inv * val;',
    // Achado 4: linearização omitida restaurada — sai do espaço codificado
    // (~2.2) do AgX base sRGB de volta a Linear-sRGB (max evita pow de
    // negativo: o outset pode subamostrar levemente abaixo de zero)
    '  val = pow(max(val, vec3(0.0)), vec3(2.2));',
    '  return clamp(val, 0.0, 1.0);',
    '}',
    'float hash12(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), f.x),',
    '             mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y);',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    // heat-haze: anel logo além do limbo, noise subindo (ar quente);
    // nunca toca o interior do disco (fibrilas ficam estáveis)
    '  if (uShimmer > 0.001){',
    '    vec2 rel = (uv - uSunC) * vec2(uAspect, 1.0);',
    '    float rr = length(rel) / max(uSunR, 1e-4);',
    '    float band = smoothstep(1.0, 1.06, rr) * (1.0 - smoothstep(1.10, 1.45, rr));',
    '    if (band > 0.001){',
    '      vec2 np = uv * vec2(90.0, 60.0) + vec2(0.0, -uCTime*1.6);',
    '      vec2 wob = vec2(vnoise(np) - 0.5, vnoise(np + 17.7) - 0.5);',
    '      uv += wob * (band * uShimmer * 0.006);',
    '    }',
    '  }',
    '  vec3 sceneCol = texture2D(tScene, uv).rgb;',
    // aberração cromática lateral da lente: cresce com o ângulo de
    // campo (zero no centro), como vidro real — franja no limbo e nas
    // estrelas sem depender de máscara de luminância
    // CA espectral em 6 taps (antes: 3 amostras discretas R/G/B — o G
    // "parado" criava um rebordo VERDE sólido no limbo com fringe>=0.5,
    // porque em toda borda clara/escura o G segue inteiro onde o R já
    // caiu). O smear radial com pesos de arco-íris (R no extremo externo,
    // G no meio, B no interno, normalizados por canal) dissolve a borda
    // num gradiente espectral contínuo, como numa lente real.
    '  if (uFringe > 0.001){',
    '    vec2 rc = uv - 0.5;',
    '    vec2 off = rc * ((0.006 + 0.020*dot(rc, rc)) * uFringe);',
    '    vec3 accCA = vec3(0.0); vec3 wsumCA = vec3(0.0);',
    '    for (int i = 0; i < 6; i++){',
    '      float t = float(i)/5.0 - 0.5;',
    '      vec3 w = vec3(max(0.0, 0.5 + t), 1.0 - abs(t)*2.0, max(0.0, 0.5 - t));',
    '      accCA += texture2D(tScene, uv + off*(t*2.0)).rgb * w;',
    '      wsumCA += w;',
    '    }',
    '    sceneCol = accCA / max(wsumCA, vec3(1e-4));',
    '  }',
    // FASE 5 — profundidade de campo hexagonal (bokeh da íris de 6
    // lâminas, a MESMA do starburst). Profundidade ANALÍTICA: o perfil
    // da esfera dá z = sqrt(1-rr²) dentro do disco (1 = centro, mais
    // perto da câmera; 0 = limbo) e o céu além do limbo é fundo. CoC =
    // |perfil - foco|; o gather de 19 taps cobre um HEXÁGONO (centro +
    // anel 6 + anel 12 nos vértices e meios de aresta) — highlights
    // desfocados viram hexágonos, como numa íris real de 6 lâminas.
    // uDof já chega multiplicado pelo fator de close-up (0 em fit).
    '  if (uDof > 0.0008){',
    '    vec2 relD = (uv - uSunC) * vec2(uAspect, 1.0);',
    '    float rrD = length(relD) / max(uSunR, 1e-4);',
    '    float zProf = (rrD < 1.0) ? sqrt(max(0.0, 1.0 - rrD*rrD)) : -min((rrD - 1.0)*0.9, 0.6);',
    // banda de tolerância focal (±0.07 de perfil): o plano em foco é
    // uma FAIXA nítida, não uma casca de espessura zero (painel: o
    // pull ao limbo lia como véu global porque nada cravava nitidez)
    '    float coc = max(0.0, abs((1.0 - zProf) - uDofFocus) - 0.07);',
    '    float rUV = uDof * min(coc, 1.5);',
    '    if (rUV > 0.0008){',
    '      rUV = min(rUV, 0.045);',
    '      vec3 accD = sceneCol;',
    '      float rot = 0.26;',
    '      vec2 scl = vec2(rUV/uAspect, rUV);',
    '      for (int k = 0; k < 6; k++){',
    '        float aK = float(k)*1.0471976 + rot;',
    '        vec2 dir6 = vec2(cos(aK), sin(aK));',
    '        vec2 mid6 = vec2(cos(aK + 0.5235988), sin(aK + 0.5235988))*0.8660254;',
    '        accD += texture2D(tScene, uv + dir6*scl).rgb;',          // vértice do hex
    '        accD += texture2D(tScene, uv + dir6*scl*0.5).rgb;',      // anel interno
    '        accD += texture2D(tScene, uv + mid6*scl).rgb;',          // meio de aresta
    '      }',
    '      vec3 dofCol = accD * (1.0/19.0);',
    '      sceneCol = mix(sceneCol, dofCol, smoothstep(0.0008, 0.0035, rUV));',
    '    }',
    '  }',
    '  vec3 bloomCol = texture2D(tBloom, uv).rgb;',
    '  vec3 color = (sceneCol + bloomCol*uBloomStrength) * (uExposure * uAdapt);',
    // halação/veiling glare: o mip mais largo do dual-Kawase lava as
    // sombras ao redor do disco ("knife edge" do Sunshine)
    '  if (uVeil > 0.001){',
    '    color += texture2D(tVeil, uv).rgb * (uVeil * 0.55) * uExposure * uAdapt;',
    '  }',
    // FASE 2 — halação com peso de temperatura (corpo negro): no filme a
    // camada anti-halation absorve o λ curto; o que sangra de volta pela
    // base é o VERMELHO. Peso = excesso espectral de R no mip largo —
    // plage (1.0,0.70,0.32) e limbo quente (1.0,0.30,0.10) pesam muito,
    // altas NEUTRAS pesam ~0. As fontes quentes avermelham a vizinhança;
    // o veil neutro acima continua intocado (uHal=0 ⇒ ramo morto).
    '  if (uHal > 0.001){',
    '    vec3 hv = texture2D(tVeil, uv).rgb;',
    '    float hw = max(hv.r - 0.5*(hv.g + hv.b), 0.0);',
    '    color += vec3(1.0, 0.38, 0.14) * (hw * uHal * 0.9) * uExposure * uAdapt;',
    '  }',
    // streak anamórfico: risco horizontal frio (assinatura de lente
    // anamórfica; os flares do Sunshine eram de lente REAL)
    '  if (uStreak > 0.001){',
    '    color += texture2D(tStreak, uv).rgb * (uStreak * 0.70) * vec3(0.80,0.88,1.12) * uExposure * uAdapt;',
    '  }',
    // FASE 1 — starburst de difração das lâminas da íris, cravado na
    // POSIÇÃO PROJETADA do flare: 6 braços |cos(3θ)|^n com alcance
    // ESPECTRAL (difração ∝ λ — o R alcança mais longe que o B, ponta
    // avermelhada como em lente real) + núcleo quente. uBurst já chega
    // multiplicado pelo brilho HDR real do flare (JS): flare atrás do
    // limbo => 0 => a lente não inventa luz que não recebeu.
    '  if (uBurst > 0.001){',
    '    vec2 relB = (vUv - uBurstPos) * vec2(uAspect, 1.0);',
    '    float rB = length(relB);',
    '    float angB = atan(relB.y, relB.x);',
    '    float arms = pow(abs(cos((angB - uBurstRot)*3.0)), 18.0);',
    '    vec3 armFall = exp(vec3(-5.0, -7.5, -11.0) * rB);',
    '    vec3 burst = vec3(1.0, 0.72, 0.45) * arms * armFall;',
    '    burst += vec3(1.0, 0.85, 0.62) * exp(-rB*30.0);',
    '    color += burst * (uBurst * 0.85) * uExposure * uAdapt;',
    '  }',
    // Achado 4: o mix ACES–AgX acontece em LINEAR-sRGB (ambos os ramos
    // devolvem linear; a OETF única fica no fim do shader)
    '  vec3 aces = ACESFilm(color);',
    '  color = (uFilm > 0.001) ? mix(aces, AgXFilm(color), uFilm) : aces;',
    '  color = mix(vec3(dot(color, vec3(0.299,0.587,0.114))), color, uSat);',
    // split-tone Sunshine: sombras frias, altas douradas (contraste
    // ouro-vs-frio de Boyle/Küchler dentro do mesmo frame). Achado 4: o
    // tint era um multiplicador de DISPLAY (pré-OETF não havia conversão);
    // pow(tint, 2.4) reproduz o mesmo efeito em linear e os limiares do
    // smoothstep são os antigos (0.10/0.65 display) convertidos a linear.
    '  if (uTone > 0.001){',
    '    float tl = dot(color, vec3(0.299,0.587,0.114));',
    '    vec3 tint = mix(vec3(0.82,0.90,1.10), vec3(1.08,1.00,0.86), smoothstep(0.010, 0.380, tl));',
    '    color *= pow(mix(vec3(1.0), tint, uTone), vec3(2.4));',
    '  }',
    // vinheta cinematográfica sutil — o fator era de DISPLAY; elevar a 2.4
    // preserva a queda visual aprovada com o MESMO knob (D·k ≙ V·k^2.4)
    '  vec2 vc = vUv - 0.5;',
    '  color *= pow(max(1.0 - dot(vc, vc)*uVig, 0.0), 2.4);',
    // dithering só nas áreas ESCURAS (céu/coroa, onde há banding); no disco
    // ele viraria chuvisco isotrópico sobre as fibrilas. Achado 4: limiares
    // do gate convertidos a linear (0.30/0.06 display → 0.0732/0.0049) e
    // amplitude compensada pela inclinação inversa da OETF (dD/dV: 12.92 no
    // ramo linear, 0.4396·V^-0.5833 acima) — o grão mantém a MESMA amplitude
    // de display de antes (~1.6/255) em vez de explodir ×13 nos pretos.
    '  float dlum = dot(color, vec3(0.3333));',
    // bordas invertidas (edge0 > edge1) são INDEFINIDAS na GLSL — em alguns
    // drivers viram NaN, e aqui, na saída do pipeline, um pixel NaN pinta a
    // tela. Mesma rampa, na forma definida (o gate do uKnee lá em cima já
    // trata o caso degenerado do smoothstep; este ponto faltava).
    '  float dith = 1.0 - smoothstep(0.0049, 0.0732, dlum);',
    '  float dslope = (dlum > 0.0031308) ? 2.2749*pow(max(dlum, 0.0), 0.58333) : 0.0774;',
    '  color += (hash12(gl_FragCoord.xy) - 0.5) * (1.6/255.0) * dith * uGrain * dslope;',
    // Achado 4 — patch numérico de QA (?colorpatch=1): quadrantes de cinza
    // LINEAR conhecido por cima do frame graduado; atravessam só a OETF
    // abaixo. sup-esq 0.18→118±1 · sup-dir 0.0031308→≈10 · inf-esq 0→0 ·
    // inf-dir 1→255; 0.18 lido ≈181 = conversão DUPLA (falha).
    '  if (uPatch > 0.5){',
    '    color = (vUv.y >= 0.5) ? ((vUv.x < 0.5) ? vec3(0.18) : vec3(0.0031308))',
    '                           : ((vUv.x < 0.5) ? vec3(0.0) : vec3(1.0));',
    '  }',
    // Achado 4 — ÚNICA conversão Linear-sRGB→sRGB do pipeline: o three gera
    // linearToOutputTexel (OETF da spec, ramo 0.0031308) a partir do
    // outputColorSpace do renderer (renderer.js). O max() protege o pow da
    // OETF de negativos (grão/sat podem subamostrar abaixo de zero).
    '  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');
  // Achado 8: o composite é um quad fullscreen escrito no framebuffer
  // default (sem depth desde renderer.js). depthTest/depthWrite off — não
  // há nada com que testar profundidade e o quad cobre a tela inteira.
  var compMaterial = new THREE.ShaderMaterial({ uniforms: compUniforms, vertexShader: quadVertex, fragmentShader: compFragment, depthTest:false, depthWrite:false });
  var compScene = makeFullscreenScene(compMaterial);

  // Achado 9: recebe as dimensões FÍSICAS (drawing buffer) explícitas do
  // caminho transacional. Fallback (sem args) deriva da janela × DPR efetivo,
  // preservando o contrato legado.
  function resizeTargets(w, h){
    if (w === undefined || h === undefined){
      w = Math.floor(window.innerWidth*ctx.pixelRatio);
      h = Math.floor(window.innerHeight*ctx.pixelRatio);
    }
    w = Math.max(2, w); h = Math.max(2, h);
    sceneRT.setSize(w, h);
    var bw = Math.max(2, Math.floor(w/2));
    var bh = Math.max(2, Math.floor(h/2));
    for (var i=0;i<bloomMips.length;i++){
      bloomMips[i].rt.setSize(bw, bh);
      bloomMips[i].w = bw; bloomMips[i].h = bh;
      bw = Math.max(2, Math.floor(bw/2));
      bh = Math.max(2, Math.floor(bh/2));
    }
    streakW = Math.max(2, Math.floor(w/4));
    streakH = Math.max(2, Math.floor(h/16));
    streakRTa.setSize(streakW, streakH);
    streakRTb.setSize(streakW, streakH);
  }
  ctx.EXP0 = EXP0; ctx.BLOOM_BASE0 = BLOOM_BASE0; ctx.BLOOM_THRESHOLD = BLOOM_THRESHOLD;
  ctx.BLOOM_KNEE = BLOOM_KNEE; ctx.BLOOM_SPREAD = BLOOM_SPREAD;
  ctx.thresholdUniforms = thresholdUniforms;
  // Achado 13: após o 3º passe (B→A) o streak final está em A; o composite
  // lê streakOut (= streakRTa)
  ctx.sceneRT = sceneRT; ctx.bloomMips = bloomMips; ctx.streakOut = streakRTa;
  ctx.downsampleUniforms = downsampleUniforms; ctx.upsampleUniforms = upsampleUniforms;
  ctx.compUniforms = compUniforms; ctx.compScene = compScene;
  ctx.renderBloom = renderBloom; ctx.renderStreak = renderStreak;
  ctx.measureBloom = measureBloom;
  ctx.resizeTargets = resizeTargets; ctx.cineProj = cineProj;
  ctx.flareWorldTmp = flareWorldTmp; ctx.burstProj = burstProj;
}

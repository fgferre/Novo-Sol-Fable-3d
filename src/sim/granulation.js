// sim/granulation.js — simulação de convecção/transporte de fluxo em GPU
// (ping-pong de render targets). Corpo movido verbatim do main.js; seed()
// é chamado SEPARADO, na posição original do init (após buildCharges).

import * as THREE from 'three';
import { quadVertex } from '../glsl/common.js';

  // ---------------------------------------------------------------
  // SIMULAÇÃO FÍSICA: campo de convecção evoluído por GPU.
  //
  // Em vez de ruído puramente analítico (que só "escorrega" no tempo),
  // mantemos um estado (textura equirretangular lat/lon) que evolui via:
  //   1. advecção por um campo de velocidade sem divergência (rotacional
  //      de um potencial de ruído — a técnica clássica de "curl noise",
  //      usada em VFX para simular fluidos incompressíveis de forma barata);
  //   2. rotação diferencial real do Sol (mais rápida no equador que nos
  //      polos), lei aproximada de Snodgrass & Ulrich (1990):
  //      Ω(lat) ≈ 14.71 − 2.39·sin²(lat) − 1.78·sin⁴(lat) graus/dia;
  //   3. um termo de reação fraco que puxa o campo de volta para um ruído-
  //      alvo, evitando que a advecção pura borre tudo até virar cinza.
  //
  // Isso é uma simulação real (feedback em textura, não apenas tempo
  // parametrizando uma fórmula), mas é importante ser honesto: é uma
  // aproximação de VFX inspirada em convecção, não uma simulação de
  // magnetohidrodinâmica de primeiros princípios como as usadas em
  // física solar de verdade.
  // ---------------------------------------------------------------
export function createGranulation(ctx){
  var renderer = ctx.renderer, quadCamera = ctx.quadCamera,
      makeFullscreenScene = ctx.makeFullscreenScene, rtType = ctx.rtType,
      SIM_W = ctx.SIM_W, SIM_H = ctx.SIM_H, NOISE_GLSL = ctx.NOISE_GLSL;
  var simRTOptions = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false };
  var simRTs = [
    new THREE.WebGLRenderTarget(SIM_W, SIM_H, simRTOptions),
    new THREE.WebGLRenderTarget(SIM_W, SIM_H, simRTOptions)
  ];
  ctx.simIndex = 0;

  var simUniforms = {
    uPrevState: { value: null },
    uDt: { value: 0.0 },
    uTime: { value: 0.0 },
    uSeed: { value: 1.0 },
    uTexel: { value: new THREE.Vector2(1/SIM_W, 1/SIM_H) },
    uChargesSim: { value: null }   // preenchido após buildCharges
  };

  var simFragmentShader = NOISE_GLSL + '\n' + [
    'uniform sampler2D uPrevState;',
    'uniform float uDt;',
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform vec2 uTexel;',
    'uniform vec4 uChargesSim[10];',
    'varying vec2 vUv;',
    // TRANSPORTE DE FLUXO EM SUPERFÍCIE (Leighton 1964): o alvo de Br é
    // a soma dos bipolos das regiões ativas + o "tapete magnético" de
    // polaridade mista do sol calmo; a advecção (abaixo) arrasta esse
    // fluxo com o escoamento — indução MHD ideal reduzida à superfície.
    'float targetBr(vec3 p3, float t){',
    '  float b = 0.0;',
    '  for(int i=0;i<8;i++){',
    '    vec3 cd = uChargesSim[i].xyz;',
    '    float cl = length(cd);',
    '    if (cl < 1e-4) continue;',
    '    float dAng = acos(clamp(dot(p3, cd/cl), -1.0, 1.0));',
    '    b += uChargesSim[i].w * exp(-dAng*dAng*150.0);',
    '  }',
    '  b = clamp(b*0.7, -1.0, 1.0);',
    '  float carpet = snoise(p3*7.5 + vec3(0.0, 0.0, t*0.012));',
    '  carpet = sign(carpet) * smoothstep(0.30, 0.75, abs(carpet));',
    '  return clamp(b + carpet*0.38, -1.0, 1.0);',
    '}',
    'float potential(vec2 uv, float t){',
    '  float lon = uv.x*6.28318530718;',
    '  float lat = (uv.y-0.5)*3.14159265359;',
    '  vec3 p = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  return fbmLight(p*3.1 + vec3(0.0,0.0,t*0.06));',
    '}',
    'vec2 curlVel(vec2 uv, float t){',
    '  float e = 0.004;',
    '  float pL = potential(uv-vec2(e,0.0), t);',
    '  float pR = potential(uv+vec2(e,0.0), t);',
    '  float pD = potential(uv-vec2(0.0,e), t);',
    '  float pU = potential(uv+vec2(0.0,e), t);',
    '  float dPdx = (pR-pL)/(2.0*e);',
    '  float dPdy = (pU-pD)/(2.0*e);',
    '  return vec2(dPdy, -dPdx);',
    '}',
    'float diffRotDegPerDay(float lat){',
    '  float s = sin(lat); float s2 = s*s;',
    '  return 14.71 - 2.39*s2 - 1.78*s2*s2;',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float lat = (uv.y-0.5)*3.14159265359;',
    '  float lon = uv.x*6.28318530718;',
    '  vec3 p3 = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  float target = fbm(p3*3.6 + vec3(0.0,0.0,uTime*0.05));',
    '  target = target*0.5+0.5;',
    '  float tBr = targetBr(p3, uTime);',
    '  if (uSeed > 0.5) {',
    '    gl_FragColor = vec4(target, 0.5 + 0.5*tBr, target, 1.0);',
    '    return;',
    '  }',
    // CFL: o passo semi-Lagrangiano só transporta coerentemente se o
    // deslocamento por passo for ~1-2 texels. O curl-noise cru tem
    // gradiente O(10) em unidades de uv — sem este teto o estado era
    // amostrado a dezenas de texels de distância por passo e o campo
    // transportado se desintegrava em ruído uniforme (o Br evoluído
    // morria e levava filamentos, plage e fibrilas junto).
    '  vec2 cv = curlVel(uv, uTime);',
    '  float cvm = length(cv);',
    '  vec2 vel = cv * (0.005 / (cvm + 1.0));',
    // rotação diferencial RELATIVA ao referencial da malha (taxa de
    // Carrington ~14.18°/dia): a rotação média já é a própria esfera
    // girando; na textura fica só o CISALHAMENTO diferencial
    '  vel.x += (diffRotDegPerDay(lat) - 14.18) * 0.00028;',
    '  vec2 srcUV = vec2(fract(uv.x - vel.x*uDt), clamp(uv.y - vel.y*uDt, 0.0015, 0.9985));',
    '  vec4 prevC = texture2D(uPrevState, srcUV);',
    '  vec4 cR = texture2D(uPrevState, srcUV+vec2(uTexel.x,0.0));',
    '  vec4 cL = texture2D(uPrevState, srcUV-vec2(uTexel.x,0.0));',
    '  vec4 cU = texture2D(uPrevState, srcUV+vec2(0.0,uTexel.y));',
    '  vec4 cD = texture2D(uPrevState, srcUV-vec2(0.0,uTexel.y));',
    '  float prevVal = prevC.r;',
    '  float blur = (prevVal + cR.r + cL.r + cU.r + cD.r) / 5.0;',
    '  float advected = mix(prevVal, blur, 0.035);',
    '  float result = mix(advected, target, 0.022);',
    '  result = clamp(result, 0.0, 1.0);',
    // Br: mesma advecção (fluxo congelado no escoamento) + difusão de
    // Leighton um pouco maior + relaxação lenta para as fontes — o padrão
    // que se vê é o alvo DISTORCIDO pela história do escoamento
    '  float prevB = prevC.g*2.0 - 1.0;',
    '  float blurB = (prevB + (cR.g*2.0-1.0) + (cL.g*2.0-1.0) + (cU.g*2.0-1.0) + (cD.g*2.0-1.0)) / 5.0;',
    '  float advB = mix(prevB, blurB, 0.06);',
    '  float resB = clamp(mix(advB, tBr, 0.008), -1.0, 1.0);',
    '  gl_FragColor = vec4(result, 0.5 + 0.5*resB, result, 1.0);',
    '}'
  ].join('\n');

  var simStepMaterial = new THREE.ShaderMaterial({ uniforms: simUniforms, vertexShader: quadVertex, fragmentShader: simFragmentShader });
  var simStepScene = makeFullscreenScene(simStepMaterial);

  // semeia os dois alvos com ruído em força total para não haver "pop-in".
  // Chamada DEPOIS de buildCharges (uChargesSim precisa estar preenchido).
  function seedSimulation(){
    simUniforms.uSeed.value = 1.0;
    simUniforms.uTime.value = 0.0;
    renderer.setRenderTarget(simRTs[0]);
    renderer.render(simStepScene, quadCamera);
    renderer.setRenderTarget(simRTs[1]);
    renderer.render(simStepScene, quadCamera);
    renderer.setRenderTarget(null);
    simUniforms.uSeed.value = 0.0;
  }

  var simClockTime = 0.0;
  function stepSimulation(dt){
    simClockTime += dt;
    var srcRT = simRTs[ctx.simIndex];
    var dstRT = simRTs[1-ctx.simIndex];
    simUniforms.uPrevState.value = srcRT.texture;
    simUniforms.uDt.value = dt;
    simUniforms.uTime.value = simClockTime;
    renderer.setRenderTarget(dstRT);
    renderer.render(simStepScene, quadCamera);
    ctx.simIndex = 1-ctx.simIndex;
    // chromo/smear NÃO leem o sim vivo: as 8 fatias de um ciclo de bake
    // consomem o snapshot tirado no início do ciclo (snapshotBakeInputs)
    // — sem emendas horizontais entre bandas de latitude
    ctx.sunUniforms.uSimTex.value    = simRTs[ctx.simIndex].texture;
    ctx.spiculeUniforms.uSimTex.value = simRTs[ctx.simIndex].texture;
  }
  return { seedSimulation: seedSimulation, stepSimulation: stepSimulation,
           simRTs: simRTs, simUniforms: simUniforms, simRTOptions: simRTOptions };
}

// atmosphere/coronaRays.js — plano de raias da coroa + sprite externo.
// Corpo movido verbatim (único ajuste: o ctx 2D do canvas interno virou
// c2d para não sombrear o ctx compartilhado da factory).

import * as THREE from 'three';
import { uvMeshVertex } from '../glsl/common.js';

export function createCoronaRays(ctx){
  var scene = ctx.scene, knob = ctx.knob, NOISE_GLSL = ctx.NOISE_GLSL,
      SUN_RADIUS = ctx.SUN_RADIUS, charges = ctx.charges;
  // ---------------------------------------------------------------
  // (A antiga "casca de brilho" aditiva foi removida: ela criava um anel
  // branco artificial na borda, o oposto do escurecimento de limbo real.
  // O brilho externo agora vem de uma coroa suave, abaixo.)
  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // Coroa: gradientes radiais suaves. O truque para não virar "anel" nem
  // lavar o disco é deixar o centro TRANSPARENTE (o disco aparece através)
  // e o brilho surgir logo além da borda, desaparecendo devagar.
  // ---------------------------------------------------------------
  function makeRadialTexture(stops, size){
    size = size || 512;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var c2d = c.getContext('2d');
    var g = c2d.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    stops.forEach(function(s){ g.addColorStop(s[0], s[1]); });
    c2d.fillStyle = g;
    c2d.fillRect(0,0,size,size);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // (o gradiente interno foi substituído pelo shader de raios abaixo)
  var coronaOuterTex = makeRadialTexture([
    [0.00,'rgba(255,150,70,0)'],
    [0.40,'rgba(255,140,60,0)'],
    [0.52,'rgba(255,120,48,0.028)'],
    [0.75,'rgba(255,90,32,0.010)'],
    [1.00,'rgba(255,70,20,0)']
  ]);

  // Coroa interna com RAIOS RADIAIS (a assinatura visual de fotos de
  // eclipse): plano orientado à câmera, com falloff exponencial a partir
  // do limbo e raias moduladas por ruído angular que evoluem devagar.
  var CORONA_SIZE = SUN_RADIUS*7.0;
  // T1.3: halo 0.55 = variante c2 do sweep, a melhor leitura de DP
  // (transição disco->céu suave, decaimento monotônico, sem anel); os
  // halo pleno calibrado (histórico: gates A/D com coroa isolada).
  // cray 0.90 = streamers legíveis; cact 0.50 = coroa respira com o ciclo.
  var coronaRaysUniforms = {
    uTime: { value: 0 },
    uRight: { value: new THREE.Vector3(1,0,0) },
    uUp: { value: new THREE.Vector3(0,1,0) },
    uRotY: { value: 0 },
    uCharges: { value: charges },
    uActivity: { value: 0.5 },
    uHalo: { value: knob('halo', 0.55, 0.0, 2.0) },
    uActGain: { value: knob('cact', 0.50, 0.0, 2.0) },
    uRayBoost: { value: knob('ray', 0.90, 0.0, 3.0) },
    // FASE 4: com a coroa volumétrica ligada o plano de raias cede o
    // protagonismo (fica como base suave de halo). 0.0 default =
    // multiplicação por 1.0 no shader, bit-exata — baseline intocado.
    uCvolMix: { value: 0.0 }
  };
  var coronaRaysMat = new THREE.ShaderMaterial({
    uniforms: coronaRaysUniforms,
    vertexShader: uvMeshVertex,
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uTime;',
      'uniform vec3 uRight;',
      'uniform vec3 uUp;',
      'uniform float uRotY;',
      'uniform vec4 uCharges[10];',
      'uniform float uActivity;',
      'uniform float uHalo;',
      'uniform float uActGain;',
      'uniform float uRayBoost;',
      'uniform float uCvolMix;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 c = vUv - 0.5;',
      '  float r = length(c)*2.0;',                 // 0 centro -> 1 borda do plano
      '  float diskR = 2.0/7.0;',                   // raio do disco solar neste plano
      // PR1 (auditoria, achado 2) — early-out radial: fora do domínio
      // (interior do disco r<=diskR*0.92, exterior r>=0.85) as máscaras
      // de fall zeram e a saída atual é EXATAMENTE vec4(0,0,0,1) — o
      // retorno antecipado a reproduz bit a bit, poupando atan, os três
      // fbmLight e o loop de 10 cargas em ~metade do quadrado projetado.
      // Sem discard: alpha/blending aditivo preservados como estão.
      '  if (r <= diskR*0.92 || r >= 0.85){',
      '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);',
      '    return;',
      '  }',
      '  float ang = atan(c.y, c.x);',
      // T1.3: a raia vive no REFERENCIAL DO SOL. Direção 3D do ponto do
      // plano do céu (base da câmera) girada para o espaço do objeto: as
      // raias acompanham a rotação e as regiões ativas — não são mais um
      // papel de parede da tela
      '  vec3 dirW = normalize(uRight*cos(ang) + uUp*sin(ang));',
      '  float cy = cos(-uRotY); float sy = sin(-uRotY);',
      '  vec3 dirO = vec3(dirW.x*cy - dirW.z*sy, dirW.y, dirW.x*sy + dirW.z*cy);',
      // coroa VIVA (backlog M2 nº4): os raios evoluíam a uTime*0.006 —
      // diff 0.00 em qualquer clipe, a camada morta que quebrava a
      // ilusão por contraste com as vivas. Três tempos: deriva angular
      // própria LENTA do padrão (a coroa não é rígida com a fotosfera),
      // evolução do fbm ~5x mais rápida e flicker 1/f por direção —
      // a luz treme como em filme de eclipse. Streamers (act) seguem
      // ancorados às cargas: a física não muda, só o padrão respira.
      '  float ca = cos(uTime*0.010); float sa = sin(uTime*0.010);',
      '  vec3 ap = vec3(dirO.x*ca - dirO.z*sa, dirO.y, dirO.x*sa + dirO.z*ca)*2.6;',
      '  float rays = fbmLight(ap + vec3(0.0, 0.0, uTime*0.030));',
      '  rays = 0.68 + 0.36*rays;',
      '  float rays2 = fbmLight(ap*2.7 + vec3(7.3, 0.0, uTime*0.045));',
      '  rays *= 0.85 + 0.25*rays2;',
      '  float flick = fbmLight(dirO*1.9 + vec3(3.7, 8.2, uTime*0.55));',
      '  rays *= 0.90 + 0.20*flick;',
      // streamers nascem SOBRE as regiões ativas: reforço por carga
      '  float act = 0.0;',
      '  for(int i=0;i<10;i++){',
      '    vec3 cd = uCharges[i].xyz;',
      '    float cl = length(cd);',
      '    if (cl < 1e-4) continue;',
      '    float dA = acos(clamp(dot(dirO, cd/cl), -1.0, 1.0));',
      '    act += abs(uCharges[i].w) * exp(-dA*dA*9.0);',
      '  }',
      '  rays *= 1.0 + uRayBoost*min(act, 1.4);',
      // falloff: núcleo justo + RESPIRO largo (halo coronal — o bloom não
      // atravessa o limbo escurecido, T2.1)
      '  float fall = exp(-(r-diskR)*22.0) + uHalo*exp(-(r-diskR)*7.0);',
      '  fall *= smoothstep(diskR*0.92, diskR*1.06, r);',
      '  fall *= smoothstep(0.85, 0.55, r);',        // some bem antes da borda do plano
      '  vec3 col = mix(vec3(1.0,0.45,0.16), vec3(1.0,0.72,0.38), clamp((r-diskR)*2.2,0.0,1.0));',
      // amplitude respira com a atividade global do ciclo
      '  gl_FragColor = vec4(col * fall * rays * 0.16 * (1.0 + uActGain*uActivity) * (1.0 - 0.62*uCvolMix), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });
  var coronaRays = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), coronaRaysMat);
  coronaRays.renderOrder = -1;
  scene.add(coronaRays);

  var coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({map:coronaOuterTex, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false}));
  coronaOuter.scale.set(SUN_RADIUS*6.0, SUN_RADIUS*6.0, 1);
  scene.add(coronaOuter);
  ctx.coronaRays = coronaRays; ctx.coronaOuter = coronaOuter;
  ctx.coronaRaysUniforms = coronaRaysUniforms; ctx.CORONA_SIZE = CORONA_SIZE;
}

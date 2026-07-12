// atmosphere/spicules.js — franja felpuda do limbo. Corpo movido verbatim;
// ctx.spiculeUniforms é lido pelo stepSimulation (granulation) em runtime.

import * as THREE from 'three';

export function createSpicules(ctx){
  var scene = ctx.scene, SUN_RADIUS = ctx.SUN_RADIUS, SPHERE_SEG = ctx.SPHERE_SEG,
      NOISE_GLSL = ctx.NOISE_GLSL, simRTs = ctx.simRTs;
  // ---------------------------------------------------------------
  // Espículas: franja "felpuda" do limbo. Casca fina em torno do disco;
  // a opacidade vem de ruído de alta frequência ANGULAR (fios individuais)
  // com comprimento de franja irregular — o limbo real em H-alfa nunca é
  // uma borda geométrica limpa (ref-05).
  // ---------------------------------------------------------------
  var SPICULE_R = SUN_RADIUS*1.042;
  // mu na borda interna da casca (onde o disco a oculta):
  var SPICULE_MU0 = Math.sqrt(1.0 - (SUN_RADIUS*SUN_RADIUS)/(SPICULE_R*SPICULE_R));
  var spiculeUniforms = { uTime: { value: 0 }, uMu0: { value: SPICULE_MU0 },
                          uSimTex: { value: simRTs[0].texture } };
  ctx.spiculeUniforms = spiculeUniforms;
  var spiculeMat = new THREE.ShaderMaterial({
    uniforms: spiculeUniforms,
    vertexShader: [
      'varying vec3 vNormalW;',
      'varying vec3 vPositionW;',
      'varying vec3 vPosObj;',
      'void main(){',
      '  vPosObj = position;',
      '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
      '  vPositionW = worldPos.xyz;',
      '  vNormalW = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
      '}'
    ].join('\n'),
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uTime;',
      'uniform float uMu0;',
      'uniform sampler2D uSimTex;',
      'varying vec3 vNormalW;',
      'varying vec3 vPositionW;',
      'varying vec3 vPosObj;',
      'void main(){',
      '  vec3 viewDir = normalize(cameraPosition - vPositionW);',
      '  vec3 N = normalize(vNormalW);',
      '  float mu = dot(N, viewDir);',
      '  if (mu < 0.0) { discard; }',
      // h: 0 na borda do disco -> 1 na silhueta externa da casca.
      // Deixamos h ir um pouco NEGATIVO (sobre o disco) para a franja
      // nascer colada na borda, sem vão.
      '  float h = 1.0 - mu/uMu0;',
      '  if (h < -0.35) { discard; }',
      // coordenada angular estável ao longo do limbo (espaço do objeto,
      // gira com o Sol): posição projetada perpendicular à direção de visão
      '  vec3 sil = normalize(vPosObj - viewDir*dot(vPosObj, viewDir));',
      // T1.2: as espículas SENTEM o campo evoluído. |Br| do sim na direção
      // da silhueta (mesma textura que faz filamentos/plage no disco):
      // onde uma região ativa cruza o limbo, a franja fica mais alta,
      // mais tufada e mais densa; no sol calmo, mais rala — como as
      // espículas reais, mais vigorosas na borda da rede magnética forte
      '  float slon = atan(sil.z, sil.x);',
      '  float slat = asin(clamp(sil.y, -1.0, 1.0));',
      '  vec2 suv = vec2(fract(slon/6.28318530718), slat/3.14159265359 + 0.5);',
      '  float brEvS = texture2D(uSimTex, suv).g*2.0 - 1.0;',
      '  float fieldK = smoothstep(0.10, 0.50, abs(brEvS));',
      // fios finíssimos, quase constantes na radial: veludo, não engrenagem
      '  float th1 = snoise(sil*95.0 + vec3(0.0, 0.0, uTime*0.10));',
      '  float th2 = snoise(sil*185.0 + vec3(7.7, 0.0, uTime*0.16));',
      '  float threads = 0.5 + 0.5*(th1*0.6 + th2*0.5);',
      // comprimento irregular da franja, variando rápido ao longo do limbo
      '  float len = 0.24 + 0.34*(0.5 + 0.5*snoise(sil*22.0 + vec3(3.1)));',
      // moitas: espículas nascem AGRUPADAS na rede — tufos altos esparsos
      // se erguem sobre a franja rasa (ref-05); o campo forte agrava
      '  float clump = max(snoise(sil*6.5 + vec3(8.8, 0.0, uTime*0.03)), 0.0);',
      '  clump = min(clump + 0.45*fieldK*clump, 1.4);',
      '  len += 0.62*clump*clump;',
      '  len *= 0.85 + 0.42*fieldK;',
      '  float fringe = 1.0 - smoothstep(len*0.25, len, max(h, 0.0));',
      // some suavemente por cima do disco (h<0) para fundir com a borda
      '  fringe *= smoothstep(-0.35, -0.05, h);',
      // DENSIDADE também varia ao longo do limbo (ref-05): a altura já
      // tinha moitas, mas o alfa constante virava veludo uniforme —
      // grama real tem trechos ralos quase carecas entre tufos densos
      '  float bald = smoothstep(-0.55, 0.20, snoise(sil*3.7 + vec3(4.2, 0.0, uTime*0.02)));',
      '  float dens = (0.35 + 0.65*bald) * (0.80 + 0.45*clump);',
      '  dens *= 0.80 + 0.50*fieldK;',
      '  float a = fringe * (0.22 + 0.42*smoothstep(0.35, 0.85, threads)) * 0.55 * dens;',
      // pontas mais escuras: a franja derrete no céu, não brilha mais que o disco
      '  vec3 col = mix(vec3(0.85,0.24,0.07), vec3(0.38,0.06,0.02), smoothstep(0.0, 1.0, max(h,0.0)));',
      '  gl_FragColor = vec4(col, a);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide
  });
  var spiculeMesh = new THREE.Mesh(new THREE.SphereGeometry(SPICULE_R, SPHERE_SEG, SPHERE_SEG), spiculeMat);
  scene.add(spiculeMesh);
  ctx.spiculeMesh = spiculeMesh;
}

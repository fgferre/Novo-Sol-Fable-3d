// Novo Sol — app principal. Migrado de sol-3d.html (script inline) para
// módulo ES com three via npm. O pipeline de cor é 100% manual (HDR +
// ACES no composite), então desligamos o ColorManagement do three e
// mantemos a saída linear — comportamento idêntico ao r128.
import * as THREE from 'three';
import { NOISE_GLSL as NOISE_GLSL_SRC, WORLEY_GLSL, SFTDIR_GLSL, BFIELD_GLSL, LIC_GLSL, quadVertex, uvMeshVertex } from './glsl/common.js';
import { createConfig } from './core/config.js';
import { createGranulation } from './sim/granulation.js';
import { createActivity } from './sim/activity.js';
import { createPIL } from './surface/pil.js';
import { createChromo } from './surface/chromo.js';
import { createSunBase, createSunUniforms, createSunMesh } from './surface/sun.js';
import { createRenderer, createRenderInfra, createRTType } from './core/renderer.js';

THREE.ColorManagement.enabled = false;

(function(){
"use strict";

var loadingEl = document.getElementById('loading');
var hintEl = document.getElementById('hint');
var container = document.getElementById('canvas-container');

if (typeof THREE === 'undefined') {
  loadingEl.textContent = 'não foi possível carregar o motor 3D.';
  return;
}

try {
  init();
} catch (err) {
  console.error(err);
  loadingEl.textContent = 'seu navegador não conseguiu iniciar o WebGL.';
}

function init(){
  // --- Manifesto RNG (ordem de consumo no init) ---
  // buildCharges(srand) → proeminências(srand) → loops(loopRand 1×) → estrelas(srand)
  //   → [painel/__solInfo: 0 draws] → flares: cooldown 1×srand (PÓS-painel).
  // Streams criados UMA vez no createConfig: srand (mulberry32(seed) se DET, senão
  //   Math.random), cmeRand (seed ^ 0x00C0E5ED), loopRand (seed ^ 0x5EEDC0DE) —
  //   streams próprios: nada desloca o srand por construção.
  var ctx = {};
  ctx.container = container;
  createConfig(ctx);
  var urlQ = ctx.urlQ, DET = ctx.DET, DET_HOLD = ctx.DET_HOLD, srand = ctx.srand,
      knob = ctx.knob, lk = ctx.lk, LOOK = ctx.LOOK, LOOK_SUNSHINE = ctx.LOOK_SUNSHINE,
      RENDER_SCALE = ctx.RENDER_SCALE, loopRand = ctx.loopRand, cmeRand = ctx.cmeRand;

  createRenderer(ctx);
  var renderer = ctx.renderer, scene = ctx.scene, camera = ctx.camera,
      coarsePointer = ctx.coarsePointer, isSoftwareGL = ctx.isSoftwareGL,
      TIER = ctx.TIER, TP = ctx.TP, FBM_OCTAVES = ctx.FBM_OCTAVES,
      SPHERE_SEG = ctx.SPHERE_SEG, STAR_COUNT = ctx.STAR_COUNT, SIM_W = ctx.SIM_W,
      SIM_H = ctx.SIM_H, BLOOM_LEVELS = ctx.BLOOM_LEVELS,
      PROMINENCE_COUNT = ctx.PROMINENCE_COUNT, hasTouch = ctx.hasTouch;

  var NOISE_GLSL = NOISE_GLSL_SRC;
  NOISE_GLSL = NOISE_GLSL.replace('i<5;', 'i<' + FBM_OCTAVES + ';');
  ctx.NOISE_GLSL = NOISE_GLSL;

  // aparelhos fracos: LIC com 5 amostras em vez de 7 (mesma técnica do
  // ajuste de oitavas do fBm, feito por substituição de texto no GLSL)
  function tuneLic(src){
    return TP.lic7 ? src : src
      .replace(/int i=-6;i<=6/g, 'int i=-3;i<=3')
      .replace(/float\(i\)\/6\.0/g, 'float(i)/3.0');
  }
  ctx.tuneLic = tuneLic;

  createRenderInfra(ctx);
  var kelvinToRGB = ctx.kelvinToRGB, makeFullscreenScene = ctx.makeFullscreenScene,
      quadCamera = ctx.quadCamera;

  createRTType(ctx);
  var rtType = ctx.rtType, isHDR = ctx.isHDR;

  ctx.gran = createGranulation(ctx);
  var simRTs = ctx.gran.simRTs, simUniforms = ctx.gran.simUniforms,
      simRTOptions = ctx.gran.simRTOptions, stepSimulation = ctx.gran.stepSimulation,
      seedSimulation = ctx.gran.seedSimulation;
  ctx.simRTs = simRTs; ctx.simUniforms = simUniforms; ctx.simRTOptions = simRTOptions;
  ctx.pil = createPIL(ctx);
  var pilBrAt = ctx.pil.pilBrAt, refreshPILBuffer = ctx.pil.refreshPILBuffer,
      samplePILAnchor = ctx.pil.samplePILAnchor, pilStats = ctx.pil.pilStats;

  createSunBase(ctx);
  var SUN_RADIUS = ctx.SUN_RADIUS, sunGeometry = ctx.sunGeometry;

  ctx.act = createActivity(ctx);
  var charges = ctx.act.charges, pairStates = ctx.act.pairStates,
      updateCycleState = ctx.act.updateCycleState, placePair = ctx.act.placePair,
      updateActiveRegions = ctx.act.updateActiveRegions, cycleDepth = ctx.act.cycleDepth,
      lifeEnvelope = ctx.act.lifeEnvelope, bFieldJS = ctx.act.bFieldJS,
      flicker1f = ctx.act.flicker1f, cyclePolarN = ctx.act.cyclePolarN,
      CYCLE_PERIOD = ctx.act.CYCLE_PERIOD, CYCLE_PHASE0 = ctx.act.CYCLE_PHASE0,
      CYCLE_LAPSE_MUL = ctx.act.CYCLE_LAPSE_MUL;
  ctx.charges = charges; ctx.pairStates = pairStates;

  createSunUniforms(ctx);
  var sunUniforms = ctx.sunUniforms;

  ctx.chromo = createChromo(ctx);
  var bakeSets = ctx.bakeSets, bakeChromoSlice = ctx.chromo.bakeChromoSlice,
      snapshotBakeInputs = ctx.chromo.snapshotBakeInputs;

  createSunMesh(ctx);
  var sunMesh = ctx.sunMesh;

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
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    stops.forEach(function(s){ g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
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
  // gates A/D agora capturam com a coroa isolada (qa-elements), então o
  // halo pleno não os contamina. cray 0.90 é o mínimo que torna os
  // streamers legíveis; cact 0.50 faz a coroa respirar com o ciclo.
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

  // ---------------------------------------------------------------
  // FASE 4 — "a coroa de verdade": coroa volumétrica raymarched.
  // A densidade coronal vive num sampler3D 64³ (payoff do WebGL2)
  // bakeado na CPU pelo MESMO campo de cargas (bFieldJS), fatiado como
  // o bake da cromosfera (1 fatia z/frame, snapshot de cargas no
  // início do ciclo, upload atômico no fim — sem tearing). A topologia
  // aberta/fechada sai de um proxy físico barato, a UNIPOLARIDADE
  // |B·r̂|/|B|: folhas de helmet streamer nascem na superfície neutra
  // (unip≈0) e afinam com a altura (cúspide); buracos coronais são as
  // regiões unipolares fortes perto da superfície (polos no mínimo do
  // ciclo — emergente do dipolo polar da F3, sem heurística nova). No
  // máximo a superfície neutra ondula por todas as latitudes = coroa
  // "cheia" (refs 09/12); no mínimo sobra o cinturão equatorial +
  // buracos polares. Tier-gated (cstep=0 => o plano de raias segue
  // sozinho como fallback); knob cvol default 0 = mesh invisível.
  // ---------------------------------------------------------------
  var CVOL_STEPS = TP.cstep | 0;
  var CVOL_N = 64, CVOL_VR = 3.0, CVOL_ROUT = 2.88;
  var cvolStep = -1, cvolAccum = 0, cvolReady = false, cvolKilled = false, cvolCycles = 0;
  var coronaVol = null, cvolUniforms = null, cvolTex = null;
  var cvolData = null, cvolStage = null;
  var cvolQ = new Float32Array(40);       // snapshot das 10 cargas (x,y,z,w)
  var cvolInvRot = new THREE.Matrix3();
  function snapshotCvolCharges(){
    for (var i = 0; i < charges.length; i++){
      cvolQ[i*4]   = charges[i].x; cvolQ[i*4+1] = charges[i].y;
      cvolQ[i*4+2] = charges[i].z; cvolQ[i*4+3] = charges[i].w;
    }
  }
  // pesos da mistura de densidade — ajustáveis em runtime pelo hook
  // setCvolShape (sweep de calibração sem rebuild); os defaults são o
  // resultado do painel de juízes da rodada
  var cvolWBase = 0.30, cvolWSheet = 0.85, cvolWLoop = 0.55, cvolWHole = 0.62;
  // densidade coronal num ponto do espaço do objeto (esfera unitária)
  function cvolDensity(x, y, z){
    var r = Math.sqrt(x*x + y*y + z*z);
    if (r < 1.005 || r > CVOL_ROUT) return 0;
    var bx = 0, by = 0, bz = 0;
    for (var i = 0; i < 10; i++){
      var dx = x - cvolQ[i*4], dy = y - cvolQ[i*4+1], dz = z - cvolQ[i*4+2];
      var r2 = dx*dx + dy*dy + dz*dz + 1e-3;
      var k = cvolQ[i*4+3] / (r2 * Math.sqrt(r2));
      bx += dx*k; by += dy*k; bz += dz*k;
    }
    var bm = Math.sqrt(bx*bx + by*by + bz*bz) + 1e-9;
    var unip = Math.abs((bx*x + by*y + bz*z) / (r * bm));
    // base hidrostática (escala de altura 0.42R: satura na base e morre
    // em ~2.5-3R como nas fotos de eclipse — refs 09/12)
    var base = Math.exp(-(r - 1.0) * 2.38);
    // folha de streamer na superfície neutra; o expoente cresce com a
    // altura => a folha afunila (base larga ~30-40°, cúspide estreita)
    var sheet = Math.exp(-unip*unip * (6.0 + 18.0*(r - 1.0)));
    // coroa baixa presa às regiões ativas (|B| alto, só perto da base)
    var loopBase = Math.min(1.1, bm*0.5) * Math.exp(-(r - 1.0) * 6.2);
    // buraco coronal: unipolar forte perto da superfície rarefaz
    // (interior quase preto na ref-11)
    var hu = (unip - 0.60) / 0.30;
    hu = hu < 0 ? 0 : (hu > 1 ? 1 : hu);
    hu = hu*hu*(3.0 - 2.0*hu);
    var hole = hu * Math.exp(-(r - 1.0) * 3.3);
    var dens = base * (cvolWBase + cvolWSheet*sheet + cvolWLoop*loopBase) * (1.0 - cvolWHole*hole);
    // fade externo: o shell de marcha não corta seco em ROUT
    var fo = (CVOL_ROUT - 0.06 - r) * 4.0;
    if (fo < 0) fo = 0; else if (fo > 1) fo = 1;
    dens *= fo;
    return dens <= 0 ? 0 : (dens > 1 ? 1 : dens);
  }
  function bakeCvolSlice(iz){
    if (iz >= CVOL_N) return;
    var inv = (2.0*CVOL_VR) / CVOL_N, off = -CVOL_VR + 0.5*inv;
    var z = off + iz*inv, rowBase = iz * CVOL_N * CVOL_N;
    for (var iy = 0; iy < CVOL_N; iy++){
      var y = off + iy*inv, idx = rowBase + iy*CVOL_N;
      for (var ix = 0; ix < CVOL_N; ix++){
        var d = cvolDensity(off + ix*inv, y, z);
        // sqrt-encode: 8 bits rendem melhor onde a coroa é tênue
        cvolStage[idx + ix] = (Math.sqrt(d) * 255) | 0;
      }
    }
  }
  function cvolBakeFull(){
    snapshotCvolCharges();
    for (var iz = 0; iz < CVOL_N; iz++) bakeCvolSlice(iz);
    cvolData.set(cvolStage);
    cvolTex.needsUpdate = true;
    cvolReady = true; cvolCycles++; cvolStep = -1;
  }
  if (CVOL_STEPS > 0){
    cvolData = new Uint8Array(CVOL_N*CVOL_N*CVOL_N);
    cvolStage = new Uint8Array(CVOL_N*CVOL_N*CVOL_N);
    cvolTex = new THREE.Data3DTexture(cvolData, CVOL_N, CVOL_N, CVOL_N);
    cvolTex.format = THREE.RedFormat;
    cvolTex.type = THREE.UnsignedByteType;
    cvolTex.minFilter = THREE.LinearFilter;
    cvolTex.magFilter = THREE.LinearFilter;
    cvolTex.wrapS = cvolTex.wrapT = cvolTex.wrapR = THREE.ClampToEdgeWrapping;
    cvolTex.unpackAlignment = 1;
    cvolTex.needsUpdate = true;
    cvolUniforms = {
      uVol: { value: cvolTex },
      uInvRot: { value: cvolInvRot },
      uCvol: { value: 0 },
      uActivity: { value: 0.5 },
      uTime: { value: 0 },
      // contraste das raias finas procedurais sobre o volume (0 =
      // liso). 0.55 = v1-fil-suave, vencedora do painel de 3 juízes
      // da F4 (mediana 7.8: leitura orgânica de eclipse, sem o padrão
      // "penteado" CG do contraste cheio) — sweep 6×2 via
      // setCvolFil/setCvolShape, sem rebuild por variante
      uFil: { value: 0.55 }
    };
    var cvolMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: cvolUniforms,
      vertexShader: [
        'varying vec3 vWorld;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position, 1.0);',
        '  vWorld = w.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'
      ].join('\n'),
      fragmentShader: NOISE_GLSL + '\n' + [
        'precision highp sampler3D;',
        '#define CVOL_STEPS ' + CVOL_STEPS,
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'uniform sampler3D uVol;',
        'uniform mat3 uInvRot;',
        'uniform float uCvol;',
        'uniform float uActivity;',
        'uniform float uTime;',
        'uniform float uFil;',
        'varying vec3 vWorld;',
        // GLSL3: sem gl_FragColor — saída explícita
        'out vec4 fragColor;',
        'void main(){',
        // raio de PERSPECTIVA real (não a aproximação angular do plano
        // de raias): da câmera pelo vértice do billboard
        '  vec3 ro = cameraPosition;',
        '  vec3 rd = normalize(vWorld - cameraPosition);',
        '  float b = dot(ro, rd);',
        '  float R = SUN_R * ' + CVOL_ROUT.toFixed(3) + ';',
        '  float disc = b*b - (dot(ro,ro) - R*R);',
        '  if (disc <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sq = sqrt(disc);',
        '  float t0 = max(-b - sq, 0.0);',
        '  float t1 = -b + sq;',
        // raio que atinge o DISCO não contribui: a coroa à frente do
        // disco é ~1e-6 do brilho dele (invisível na realidade), e os
        // transparentes desenham DEPOIS dos opacos — sem este corte o
        // segmento frontal somaria brilho por cima do disco (QA G1)
        '  float di = b*b - (dot(ro,ro) - SUN_R*SUN_R);',
        '  if (di > 0.0){ fragColor = vec4(0.0); return; }',
        '  if (t1 <= t0 + 1e-4){ fragColor = vec4(0.0); return; }',
        '  float dt = (t1 - t0) / float(CVOL_STEPS);',
        // jitter determinístico por pixel (esconde banding; det=ok)
        '  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);',
        '  float t = t0 + dt*jit;',
        '  float sum = 0.0; float hsum = 0.0;',
        '  for (int i = 0; i < CVOL_STEPS; i++){',
        '    vec3 pO = (uInvRot * (ro + rd*t)) * (1.0/SUN_R);',
        '    float d = texture(uVol, pO*' + (0.5/CVOL_VR).toFixed(6) + ' + 0.5).r;',
        '    d = d*d;',                       // decode do sqrt-encode
        '    sum += d;',
        '    hsum += d*length(pO);',
        '    t += dt;',
        '  }',
        '  if (sum <= 1e-5){ fragColor = vec4(0.0); return; }',
        '  float hMean = hsum / sum;',
        // raias finas + flicker 1/f no referencial do objeto — a mesma
        // vida do plano de raias (uma avaliação por pixel, não por passo)
        '  vec3 dirO = normalize(uInvRot * normalize(vWorld));',
        '  float f1 = fbmLight(dirO*3.1 + vec3(0.0, 0.0, uTime*0.030));',
        '  float f2 = fbmLight(dirO*7.3 + vec3(5.1, 2.2, uTime*0.045));',
        '  float flick = fbmLight(dirO*1.9 + vec3(3.7, 8.2, uTime*0.55));',
        '  float fil = (0.62 + 0.55*f1) * (0.80 + 0.34*f2) * (0.90 + 0.20*flick);',
        '  fil = 1.0 + (fil - 1.0)*uFil;',
        // paleta quente do projeto, esfriando com a altura média da luz
        '  vec3 col = mix(vec3(1.0,0.72,0.42), vec3(1.0,0.46,0.20), clamp((hMean-1.0)*0.75, 0.0, 1.0));',
        '  float amp = sum * dt * (1.0/SUN_R) * 0.14 * uCvol * fil * (0.70 + 0.60*uActivity);',
        '  fragColor = vec4(col*amp, 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    coronaVol = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), cvolMat);
    coronaVol.renderOrder = -1;
    coronaVol.visible = false;
    scene.add(coronaVol);
    // knob ligado desde a carga (?cvol=): bake inicial síncrono com as
    // cargas do frame 0 (determinístico) — a coroa nunca aparece vazia
    if (ctx.CVOL_K > 0.001) cvolBakeFull();
  }

  // ---------------------------------------------------------------
  // FASE 5 — "Erupção": CME de flux-rope que se desprende em flares
  // GRANDES. A casca é raymarched ANALÍTICA (sem textura 3D): uma
  // bolha elipsoidal auto-similar — alongada ao longo do eixo do rope
  // (a tangente da PIL congelada no evento) — cujo centro sobe e cujo
  // raio cresce ∝ distância (meio-ângulo ~constante, como nas CMEs
  // reais). A frente brilhante é a casca fina; a cavidade é o interior
  // rarefeito; o núcleo denso é a proeminência ejetada (blob que vira
  // as PARTÍCULAS nos tiers com transform feedback). O brilho leva o
  // peso de THOMSON sin²(ângulo ao plano do céu): CME no limbo é
  // brilhante, CME de frente ("halo") é tênue — física, não estética.
  // Cinemática em FORMA FECHADA (rise lento → aceleração sincronizada
  // com a fase impulsiva do flare → cruzeiro auto-similar): saltar o
  // relógio via hook reproduz qualquer instante, determinístico.
  // Knob cme default 0 = nenhum evento dispara, mesh invisível, frame
  // e custo idênticos ao baseline.
  // ---------------------------------------------------------------
  var CME_STEPS = TP.cmestep | 0;
  var CME_PTS_N = TP.cmen | 0;
  var CME_ROUT = 3.30;              // a marcha vai além do cvol (2.88)
  var cmeT = 999, cmeAmp = 0, cmeCooldown = 0, cmeCount = 0;
  var cmeKilled = false;            // kill-switch do auto-tune (padrão cvolKilled)
  var cmeDir = new THREE.Vector3(0, 0, 1);
  var cmeAxis = new THREE.Vector3(1, 0, 0);
  var cmeSeedVal = 0;
  var lastCmeHDR = 0;
  // ganho do núcleo denso — mediana do painel de 3 juízes da F5
  // (1.3/1.4/0.9): com o boost do shader, 1.3 fecha a leitura de
  // "três partes" (frente/cavidade/núcleo) sem virar cometa
  var cmeCoreGain = 1.3;
  var cmeWorldTmp = new THREE.Vector3();
  // cinemática fechada: v(t) = 0.045 + 0.19·smoothstep((t-1.2)/2.6);
  // D(t) = ∫v dt tem primitiva analítica (x³ − x⁴/2 no trecho suave) —
  // rise lento do rope (~1.2s, o rope infla no lugar), aceleração
  // impulsiva SINCRONIZADA com a fase impulsiva do flare, cruzeiro
  // constante. Evento visível ~7-8s — o mesmo fôlego do rescaldo
  // gradual do flare (τ≈6s), tempo comprimido de VFX como tudo aqui.
  function cmeSmoothInt(x){
    if (x <= 0) return 0;
    if (x >= 1) return x - 0.5;
    var x3 = x*x*x;
    return x3 - 0.5*x3*x;
  }
  function cmeDist(t){
    return 0.045*t + 0.19*2.6*cmeSmoothInt((t - 1.2)/2.6);
  }
  // geometria auto-similar do instante t (escreve em cmeGeomOut — sem
  // alocação; usada pelo update, pelos hooks e pelo QA). Meio-ângulo
  // de expansão ~26° (rho cresce 0.45/R percorrido — CMEs típicas têm
  // 25-35°); brilho superficial dilui com a expansão (conservação de
  // massa na casca) e a frente esmaece ao alcançar a borda do domínio.
  var cmeGeomOut = { d:0, cx:0, rho:0, w:0, front:0, env:0 };
  function cmeGeomAt(t){
    var d = cmeDist(t);
    var rho = 0.16 + 0.45*d;
    var cx = 1.09 + d;
    var rise = t/0.7; rise = rise < 0 ? 0 : (rise > 1 ? 1 : rise);
    rise = rise*rise*(3.0 - 2.0*rise);
    var dil = Math.pow(0.16/rho, 0.88);
    var front = cx + rho;
    var fo = 1.0 - Math.min(1, Math.max(0, (front - 2.75)/0.50));
    cmeGeomOut.d = d; cmeGeomOut.cx = cx; cmeGeomOut.rho = rho;
    cmeGeomOut.w = 0.034 + 0.046*d;   // casca mais fina = rim com mais contraste
    cmeGeomOut.front = front;
    cmeGeomOut.env = rise * dil * fo;
    return cmeGeomOut;
  }
  function launchCME(amp){
    cmeT = 0;
    cmeAmp = amp;
    cmeDir.copy(surfFlareDir);
    cmeAxis.copy(flareTanDir);
    cmeSeedVal = cmeRand()*100.0;
    cmeCooldown = 20;
    cmeCount++;
    cmePtsSpawnArm();   // partículas re-armam a janela de respawn
  }
  // gatilho: chamado quando um flare dispara (natural ou forçado). Só
  // flare GRANDE solta CME — a probabilidade cresce com a amplitude
  // (X-class ~certo, M-class raro), no stream próprio cmeRand.
  function maybeLaunchCME(){
    if (ctx.CME_K <= 0.001 || CME_STEPS <= 0 || cmeKilled) return false;
    if (cmeT < 900 || cmeCooldown > 0) return false;
    var p = (surfFlareAmp - 0.85)/0.45;
    p = Math.max(0, Math.min(1, p)) * Math.min(1, ctx.CME_K);
    if (p <= 0 || cmeRand() >= p) return false;
    launchCME(surfFlareAmp);
    return true;
  }
  var cmeMesh = null, cmeUniforms = null;
  var cmeInvRot = new THREE.Matrix3();
  if (CME_STEPS > 0){
    cmeUniforms = {
      uInvRotC: { value: cmeInvRot },
      uCmeDir: { value: cmeDir },
      uCmeAxis: { value: cmeAxis },
      // x = distância do centro da bolha, y = raio, z = espessura da
      // casca, w = amplitude (envelope × knob × Thomson global no JS)
      uCmeKin: { value: new THREE.Vector4(1.1, 0.18, 0.045, 0) },
      // x = ganho do núcleo, y = tempo, z = seed do evento, w = livre
      uCmeMat: { value: new THREE.Vector4(0.9, 0, 0, 0) }
    };
    var cmeMatShader = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: cmeUniforms,
      vertexShader: [
        'varying vec3 vWorld;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position, 1.0);',
        '  vWorld = w.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'
      ].join('\n'),
      fragmentShader: NOISE_GLSL + '\n' + [
        '#define CME_STEPS ' + CME_STEPS,
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'uniform mat3 uInvRotC;',
        'uniform vec3 uCmeDir;',
        'uniform vec3 uCmeAxis;',
        'uniform vec4 uCmeKin;',
        'uniform vec4 uCmeMat;',
        'varying vec3 vWorld;',
        'out vec4 fragColor;',
        'void main(){',
        '  vec3 ro = cameraPosition;',
        '  vec3 rd = normalize(vWorld - cameraPosition);',
        '  float b = dot(ro, rd);',
        '  float R = SUN_R * ' + CME_ROUT.toFixed(3) + ';',
        '  float disc = b*b - (dot(ro,ro) - R*R);',
        '  if (disc <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sq = sqrt(disc);',
        '  float t0 = max(-b - sq, 0.0);',
        '  float t1 = -b + sq;',
        // o raio que atinge o DISCO não contribui (mesmo corte do cvol:
        // a coroa à frente do disco é invisível e os transparentes
        // desenham depois dos opacos — sem isto somaria sobre o disco)
        '  float di = b*b - (dot(ro,ro) - SUN_R*SUN_R);',
        '  if (di > 0.0){ fragColor = vec4(0.0); return; }',
        '  if (t1 <= t0 + 1e-4){ fragColor = vec4(0.0); return; }',
        // marcha no espaço do OBJETO (uma transformação, marcha linear)
        '  float invR = 1.0/SUN_R;',
        '  vec3 roO = (uInvRotC * ro) * invR;',
        '  vec3 rdO = normalize(uInvRotC * rd);',
        '  vec3 c = uCmeDir * uCmeKin.x;',
        '  float rho = uCmeKin.y;',
        '  float wSh = uCmeKin.z;',
        // amostragem CERTA da casca fina: marchar só o trecho do raio
        // que cruza a ESFERA ENVOLVENTE da bolha (raio rho+3.2w·k do
        // alongamento). Sem isto, 16-32 passos na corda inteira de
        // ~6.6R pulam uma casca de ~0.05R — vira névoa sem borda em
        // vez do rim de path-length do Thomson.
        '  float rBub = (rho + 3.2*wSh) * 1.38;',
        '  vec3 oc = roO - c;',
        '  float bB = dot(oc, rdO);',
        '  float dB = bB*bB - (dot(oc,oc) - rBub*rBub);',
        '  if (dB <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sqB = sqrt(dB);',
        '  float tA = max(-bB - sqB, max(t0*invR, 0.0));',
        '  float tB = min(-bB + sqB, t1*invR);',
        '  if (tB <= tA + 1e-5){ fragColor = vec4(0.0); return; }',
        '  float dtO = (tB - tA) / float(CME_STEPS);',
        '  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);',
        '  float tO = tA + dtO*jit;',
        '  float sum = 0.0; float hsum = 0.0; float ksum = 0.0;',
        '  for (int i = 0; i < CME_STEPS; i++){',
        '    vec3 p = roO + rdO*tO;',
        '    tO += dtO;',
        '    float r = length(p);',
        '    float fade = smoothstep(1.01, 1.06, r);',
        '    if (fade <= 0.0) continue;',
        // casca elipsoidal: alongada ao longo do eixo do rope (croissant)
        '    vec3 q = p - c;',
        '    float qa = dot(q, uCmeAxis);',
        '    float dc = length(q - uCmeAxis*(qa*0.26));',
        // casca engrossa rumo à BASE (as pernas do rope enraizadas no
        // limbo — flag 3/3 do painel: "bolha destacada"; a ref-13
        // mantém as pernas até o occulter)
        '    float wEff = wSh*(1.0 + 1.4*exp(-(r - 1.0)*2.8));',
        '    float shell = exp(-((dc - rho)*(dc - rho))/(wEff*wEff));',
        // pernas ancoradas: material só no hemisfério do evento
        '    float ca = dot(p, uCmeDir)/max(r, 1e-4);',
        '    shell *= smoothstep(0.02, 0.42, ca);',
        // núcleo denso (a proeminência ejetada) atrás do centro da
        // bolha — mais compacto e 2.2x mais forte (painel: núcleo era
        // "sub-liminar", a leitura três-partes só fechava com core alto)
        '    vec3 pk = p - uCmeDir*(uCmeKin.x - rho*0.34);',
        '    float rk = rho*0.30;',
        '    float core = exp(-dot(pk,pk)/(rk*rk)) * (uCmeMat.x*2.2);',
        // fios do rope: fbm no referencial da bolha (a textura ACOMPANHA
        // a casca em vez de ficar pregada no espaço)
        '    float n = fbmLight(q*(2.4/max(rho, 0.2)) + vec3(uCmeMat.z, uCmeMat.z*0.31, 0.0));',
        '    float fil = 0.68 + 0.55*n;',
        // peso de Thomson por amostra: sin² do ângulo ao plano do céu.
        // O núcleo (material denso de proeminência) sente MENOS o
        // Thomson — brilha por densidade, não só por geometria.
        '    float mu = dot(p, rdO)/max(r, 1e-4);',
        '    float thom = 1.0 - mu*mu;',
        '    float d = shell*fil*(0.22 + 0.78*thom)*fade + core*(0.50 + 0.50*thom)*fade;',
        '    sum += d;',
        '    hsum += d*clamp((r - 1.0)*0.8, 0.0, 1.0);',
        '    ksum += core*fade;',
        '  }',
        '  if (sum <= 1e-5){ fragColor = vec4(0.0); return; }',
        '  float hK = hsum/sum;',
        // luz branca espalhada (Thomson), QUENTE e emissiva (painel de
        // cinema: o tom marrom sobre o céu azul lia como "fumaça/
        // fuligem") — o núcleo puxa ao vermelho de proeminência
        '  vec3 col = mix(vec3(1.0, 0.88, 0.70), vec3(1.0, 0.66, 0.42), clamp(hK*0.8 + (ksum/sum)*0.6, 0.0, 1.0));',
        '  float amp = sum * dtO * 1.05 * uCmeKin.w;',
        '  fragColor = vec4(col*amp, 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    cmeMesh = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), cmeMatShader);
    cmeMesh.renderOrder = -0.75;   // depois da coroa (-1), antes da arcada escura (-0.5)
    cmeMesh.visible = false;
    scene.add(cmeMesh);
  }

  // ---------------------------------------------------------------
  // FASE 5 — partículas do ejecta por TRANSFORM FEEDBACK (o payoff
  // WebGL2 nº 2 do roadmap): advecção 100% na GPU (posição+velocidade
  // em ping-pong de VBOs, rasterizer discard no passo de sim), zero
  // readback, zero alocação por frame. O material do núcleo do CME
  // acompanha a expansão auto-similar da casca; uma fração "chove" de
  // volta (chuva coronal do rescaldo). Render: 2 THREE.Points fixos
  // (um por VBO, GLBufferAttribute) alternando visibilidade — os VAOs
  // do three ficam estáveis, sem rebuild por frame. Tiers sem
  // partículas (cmen=0) ou sem WebGL2: subsistema inteiro ausente.
  // ---------------------------------------------------------------
  var cmePts = { on:false, cur:0, prog:null, tf:null, vaos:[null,null],
                 posBuf:[null,null], velBuf:[null,null],
                 meshes:[null,null], uLoc:null, armT:-1 };
  function cmePtsSpawnArm(){ if (cmePts.on) cmePts.armT = 0; }
  (function buildCmeParticles(){
    if (CME_PTS_N <= 0 || CME_STEPS <= 0) return;
    var gl = renderer.getContext();
    if (!renderer.capabilities.isWebGL2) return;
    var vsrc = [
      '#version 300 es',
      'precision highp float;',
      'uniform float uDt;',
      'uniform float uT;',
      'uniform float uSeed;',
      'uniform float uRespawn;',
      'uniform vec3 uDir;',
      'uniform vec3 uAxis;',
      'uniform vec4 uKin;',   // x=cx, y=rho, z=vel de expansão, w=amp do evento
      'in vec4 aPos;',        // xyz (R=1) + vida
      'in vec4 aVel;',        // xyz + tipo (0 casca/ejecta, 1 chuva)
      'out vec4 tfPos;',
      'out vec4 tfVel;',
      'float h1(float n){ return fract(sin(n)*43758.5453123); }',
      'void main(){',
      '  float id = float(gl_VertexID);',
      '  vec4 P = aPos; vec4 V = aVel;',
      '  if (P.w <= 0.0){',
      '    if (uRespawn > 0.5){',
      // nasce na base do rope: leque ao longo do eixo da PIL (o
      // material da proeminência que ergue), determinístico por id+seed
      '      float a1 = h1(id*1.618 + uSeed);',
      '      float a2 = h1(id*2.717 + uSeed*1.37);',
      '      float a3 = h1(id*3.141 + uSeed*2.09);',
      '      float a4 = h1(id*4.669 + uSeed*0.53);',
      // leque COLIMADO (painel de cinema: o spray abria ~10h-4h para
      // um evento de 1h) mas ALONGADO em raio — o material lê como a
      // COLUNA que ergue da ref-14, não como bola nem como leque
      '      vec3 perp = normalize(cross(uDir, uAxis));',
      '      vec3 base = normalize(uDir + uAxis*(a1 - 0.5)*0.80 + perp*(a2 - 0.5)*0.34);',
      '      P.xyz = base*(1.03 + 0.60*a3*a3);',   // mais denso na base, cauda rala
      '      P.w = 0.60 + 0.80*a4;',
      // dispersão de velocidade por partícula: sem ela o campo-alvo
      // comum recolapsa o enxame num blob coeso de borda dura
      '      V.xyz = base*(0.02 + 0.10*a2)',
      '             + uAxis*(a1 - 0.5)*0.05 + perp*(a4 - 0.5)*0.05;',
      '      V.w = step(0.72, a1);',           // ~28% viram chuva coronal
      '    }',
      '  } else {',
      '    vec3 c = uDir*uKin.x;',
      '    vec3 rel = P.xyz - c;',
      '    float rl = length(rel) + 1e-5;',
      // campo de velocidade auto-similar: radial a partir do centro da
      // bolha + arrasto do vento na direção do evento
      '    vec3 vT = (rel/rl)*uKin.z*(0.40 + 0.60*clamp(rl/max(uKin.y, 0.05), 0.0, 1.4))',
      '            + uDir*uKin.z*0.55;',
      '    if (V.w > 0.5 && uT > 4.0){',
      // chuva coronal: no rescaldo, a fração presa drena de volta
      '      vT = -normalize(P.xyz)*0.20;',
      '    }',
      '    V.xyz += (vT - V.xyz)*min(1.0, uDt*2.2);',
      // cintilação de trajetória barata (não é curl de verdade, mas
      // quebra o alinhamento perfeito sem textura de campo)
      '    float w1 = h1(id*7.77)*6.2831;',
      '    V.xyz += vec3(sin(uT*1.9 + w1), sin(uT*2.3 + w1*1.7), cos(uT*2.1 + w1))*(uDt*0.012);',
      '    P.xyz += V.xyz*uDt;',
      '    float r = length(P.xyz);',
      '    P.w -= uDt*(0.085 + 0.05*h1(id*5.55));',
      '    if (r < 1.005 || r > 3.45) P.w = 0.0;',
      '  }',
      '  tfPos = P;',
      '  tfVel = V;',
      '  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);',
      '  gl_PointSize = 1.0;',
      '}'
    ].join('\n');
    var fsrc = '#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){ o = vec4(0.0); }';
    function sh(type, src){
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.error('CME TF shader: ' + gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsrc), fs = sh(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.transformFeedbackVaryings(prog, ['tfPos', 'tfVel'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      console.error('CME TF link: ' + gl.getProgramInfoLog(prog));
      return;
    }
    var init = new Float32Array(CME_PTS_N*4);   // vida 0 = morta (spawn no evento)
    for (var bi = 0; bi < 2; bi++){
      cmePts.posBuf[bi] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.posBuf[bi]);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      cmePts.velBuf[bi] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.velBuf[bi]);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    var locPos = gl.getAttribLocation(prog, 'aPos');
    var locVel = gl.getAttribLocation(prog, 'aVel');
    for (var vi = 0; vi < 2; vi++){
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.posBuf[vi]);
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 4, gl.FLOAT, false, 16, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.velBuf[vi]);
      gl.enableVertexAttribArray(locVel);
      gl.vertexAttribPointer(locVel, 4, gl.FLOAT, false, 16, 0);
      cmePts.vaos[vi] = vao;
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    cmePts.tf = gl.createTransformFeedback();
    cmePts.prog = prog;
    cmePts.uLoc = {
      dt: gl.getUniformLocation(prog, 'uDt'),
      t: gl.getUniformLocation(prog, 'uT'),
      seed: gl.getUniformLocation(prog, 'uSeed'),
      resp: gl.getUniformLocation(prog, 'uRespawn'),
      dir: gl.getUniformLocation(prog, 'uDir'),
      axis: gl.getUniformLocation(prog, 'uAxis'),
      kin: gl.getUniformLocation(prog, 'uKin')
    };
    // render: 2 Points fixos, um por VBO de posição (VAO do three estável)
    var ptsMat = new THREE.ShaderMaterial({
      uniforms: {
        uPx: { value: 30.0 },
        uAmp: { value: 0.0 }
      },
      vertexShader: [
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'attribute vec4 aPos;',
        'attribute vec4 aVel;',
        'varying float vLife;',
        'varying float vKind;',
        'varying vec2 vDir;',
        'varying float vStretch;',
        'uniform float uPx;',
        'float hsz(float n){ return fract(sin(n)*43758.5453123); }',
        'void main(){',
        '  vLife = aPos.w;',
        '  vKind = aVel.w;',
        '  vec4 mv = modelViewMatrix * vec4(aPos.xyz*SUN_R, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        // direção da VELOCIDADE em tela: o sprite vira um risco
        // alongado no rumo do movimento (painel 3/3: pontos uniformes
        // liam como confete/glitter — material filamentar não é dot)
        '  vec4 mv2 = modelViewMatrix * vec4((aPos.xyz + aVel.xyz*0.35)*SUN_R, 1.0);',
        '  vec4 c1 = projectionMatrix * mv2;',
        '  vec2 sd = c1.xy/max(abs(c1.w), 1e-4) - gl_Position.xy/max(abs(gl_Position.w), 1e-4);',
        '  float sl = length(sd);',
        '  vDir = sl > 1e-5 ? sd/sl : vec2(1.0, 0.0);',
        '  vStretch = clamp(sl*30.0, 0.0, 2.4);',
        // mistura de grãos finos e flocos (70% pequenos, cauda ~3x)
        '  float g = hsz(aPos.x*57.3 + aPos.y*23.1 + aPos.z*11.7);',
        '  float sz = uPx*(0.35 + 0.45*vKind + 1.6*g*g*g)/max(0.1, -mv.z);',
        '  gl_PointSize = clamp(sz*(1.0 + 0.5*vStretch), 0.0, 6.5) * step(0.001, vLife);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vLife;',
        'varying float vKind;',
        'varying vec2 vDir;',
        'varying float vStretch;',
        'uniform float uAmp;',
        'void main(){',
        '  vec2 d = gl_PointCoord - 0.5;',
        // gaussiana ALONGADA na direção do movimento (streak), fina na
        // normal — em repouso volta ao grão redondo
        '  float t = dot(d, vDir);',
        '  float n = d.x*vDir.y - d.y*vDir.x;',
        '  float a = exp(-(t*t*10.0/(1.0 + 2.2*vStretch) + n*n*(10.0 + 8.0*vStretch)));',
        '  a *= smoothstep(0.0, 0.15, vLife) * min(1.0, vLife);',
        '  vec3 col = mix(vec3(1.0, 0.52, 0.26), vec3(1.0, 0.76, 0.50), 0.25 + 0.5*vKind);',
        '  gl_FragColor = vec4(col*(a*uAmp*0.30), 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    for (var mi = 0; mi < 2; mi++){
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('aPos', new THREE.GLBufferAttribute(cmePts.posBuf[mi], gl.FLOAT, 4, 4, CME_PTS_N));
      geo.setAttribute('aVel', new THREE.GLBufferAttribute(cmePts.velBuf[mi], gl.FLOAT, 4, 4, CME_PTS_N));
      geo.setDrawRange(0, CME_PTS_N);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), SUN_RADIUS*4);
      var pm = new THREE.Points(geo, ptsMat);
      pm.frustumCulled = false;
      pm.visible = false;
      pm.rotation.z = 0.1265;        // mesmo tilt dos demais grupos do objeto
      pm.renderOrder = 0.5;          // aditivo, depois das emissões da esfera
      scene.add(pm);
      cmePts.meshes[mi] = pm;
    }
    cmePts.ptsMat = ptsMat;
    cmePts.on = true;
  })();
  // um passo de simulação por TRANSFORM FEEDBACK: lê do VBO corrente,
  // escreve no outro, alterna. Rasterizer discard: nenhum fragmento.
  // Depois devolve o estado GL ao three (resetState) — o custo é ~zero
  // e elimina qualquer suposição sobre caches de binding.
  function cmePtsTick(dt, respawn){
    var gl = renderer.getContext();
    var src = cmePts.cur, dst = 1 - src;
    gl.useProgram(cmePts.prog);
    gl.uniform1f(cmePts.uLoc.dt, dt);
    gl.uniform1f(cmePts.uLoc.t, cmeT);
    gl.uniform1f(cmePts.uLoc.seed, cmeSeedVal);
    gl.uniform1f(cmePts.uLoc.resp, respawn ? 1.0 : 0.0);
    gl.uniform3f(cmePts.uLoc.dir, cmeDir.x, cmeDir.y, cmeDir.z);
    gl.uniform3f(cmePts.uLoc.axis, cmeAxis.x, cmeAxis.y, cmeAxis.z);
    var g = cmeGeomOut;   // preenchido pelo update do frame
    // velocidade de expansão = derivada aproximada do D(t) na fase atual
    var vExp = 0.045 + 0.19*Math.min(1, Math.max(0, (cmeT - 1.2)/2.6));
    gl.uniform4f(cmePts.uLoc.kin, g.cx, g.rho, vExp, cmeAmp);
    gl.bindVertexArray(cmePts.vaos[src]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, cmePts.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, cmePts.posBuf[dst]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, cmePts.velBuf[dst]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, CME_PTS_N);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindVertexArray(null);
    renderer.resetState();
    cmePts.cur = dst;
  }
  // update por frame do CME (relógio, uniforms, visibilidade, lente).
  // Com knob 0 ou sem evento: só comparações — custo ~zero, sem estado.
  function updateCME(delta){
    if (cmeCooldown > 0) cmeCooldown -= delta;
    var active = cmeT < 900;
    if (active){
      cmeT += delta;
      cmeGeomAt(cmeT);
      if (cmeGeomOut.front > CME_ROUT || cmeT > 18){ cmeT = 999; active = false; }
    }
    var on = active && ctx.CME_K > 0.001 && CME_STEPS > 0 && !cmeKilled && subToggle.cme;
    lastCmeHDR = 0;
    if (cmeMesh) cmeMesh.visible = on;
    var ptsOn = on && cmePts.on && subToggle.cmepts;
    if (cmePts.on){
      cmePts.meshes[0].visible = ptsOn && cmePts.cur === 0;
      cmePts.meshes[1].visible = ptsOn && cmePts.cur === 1;
    }
    if (!on) return;
    var g = cmeGeomOut;
    // peso de Thomson GLOBAL para a lente/QA: sin² do ângulo do evento
    // ao plano do céu (o shader refina por amostra)
    cmeWorldTmp.copy(cmeDir).applyQuaternion(sunMesh.quaternion);
    var muC = cmeWorldTmp.dot(camDirN);
    var thom = 1.0 - muC*muC;
    lastCmeHDR = g.env * cmeAmp * (0.25 + 0.75*thom) * Math.min(1.5, ctx.CME_K);
    cmeMesh.quaternion.copy(camera.quaternion);
    cmeInvRot.setFromMatrix4(sunMesh.matrixWorld).transpose();
    cmeUniforms.uCmeKin.value.set(g.cx, g.rho, g.w,
      g.env * cmeAmp * Math.min(1.5, ctx.CME_K));
    // o núcleo esmaece conforme o material vira partículas/se dispersa
    cmeUniforms.uCmeMat.value.set(cmeCoreGain*Math.exp(-cmeT*0.10), cmeT, cmeSeedVal, 0);
    if (ptsOn){
      if (cmePts.armT >= 0) cmePts.armT += delta;
      var respawn = cmePts.armT >= 0 && cmePts.armT < 0.9;
      cmePtsTick(delta, respawn);
      // esmaece com o envelope do evento (sem corte seco no fim; o
      // +0.15 mantém a chuva coronal legível no rescaldo). Base 0.55:
      // o painel flagrou a nuvem SATURANDO (knob perceptualmente
      // inerte porque o aditivo estourava no tonemap)
      cmePts.ptsMat.uniforms.uAmp.value = 0.42 * Math.min(1.5, ctx.CME_K) *
        (0.35 + 0.65*thom) * Math.min(1, cmeAmp) *
        Math.min(1, 2.2*g.env + 0.15);
      // pós-tick: a visibilidade segue o VBO recém-escrito
      cmePts.meshes[0].visible = cmePts.cur === 0;
      cmePts.meshes[1].visible = cmePts.cur === 1;
    }
  }

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

  // ---------------------------------------------------------------
  // Proeminências solares (arcos de plasma). A cor foge de blackbody
  // de propósito: prominências são opticamente finas e o tom avermelhado
  // característico vem da linha de emissão H-alfa (656nm), não de
  // radiação térmica de corpo negro — então mantemos um vermelho definido
  // à mão em vez de "temperatura errada aplicada corretamente".
  // ---------------------------------------------------------------
  var prominenceGroup = new THREE.Group();
  var prominenceMeshes = [];
  var promStates = [];
  // âncora preferencialmente numa LINHA NEUTRA do campo magnético (é onde
  // proeminências reais se sustentam) — amostragem por rejeição. Usada no
  // nascimento E em cada RENASCIMENTO: o campo evolui, a âncora nova
  // segue o campo do momento.
  function sampleProminenceAnchor(){
    // 1a escolha: linha de inversão do campo EVOLUÍDO (mesma física dos
    // filamentos do bake); o campo analítico fica só de fallback
    var pil = samplePILAnchor();
    if (pil) return pil;
    var anchor = null;
    for (var tries=0; tries<48; tries++){
      var th = srand()*Math.PI*2;
      var ph = Math.acos(2*srand()-1);
      var cand = new THREE.Vector3(
        Math.sin(ph)*Math.cos(th),
        Math.cos(ph),
        Math.sin(ph)*Math.sin(th)
      );
      anchor = cand;
      var Bv = bFieldJS(cand);
      var bm = Bv.length() + 1e-6;
      if (Math.abs(Bv.dot(cand))/bm < 0.22 && bm > 0.5) break;
    }
    return anchor;
  }
  // (re)posiciona o par de cartões cruzados numa âncora nova, com forma
  // nova (uSeed): chamado no nascimento e a cada renascimento do ciclo de
  // vida — a proeminência velha colapsa (env->0) e a slot renasce longe
  function placeProminence(ps, anchor){
    var baseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), anchor);
    var ang0;
    if (anchor.pilTangent){
      // gira o eixo X do cartão (largura) para a tangente da PIL
      var x0 = new THREE.Vector3(1,0,0).applyQuaternion(baseQ);
      var cr = new THREE.Vector3().crossVectors(x0, anchor.pilTangent);
      ang0 = Math.atan2(anchor.dot(cr), x0.dot(anchor.pilTangent));
    } else ang0 = srand()*Math.PI;
    ps.meshes.forEach(function(mm, k){
      var spin = new THREE.Quaternion().setFromAxisAngle(anchor, ang0 + k*Math.PI*0.5);
      mm.quaternion.copy(spin.multiply(baseQ));
      mm.position.copy(anchor).multiplyScalar(SUN_RADIUS*0.995);
      mm.userData.dir = anchor.clone();
      mm.material.uniforms.uSeed.value = srand()*100;
    });
    // FASE 3 — o gêmeo de absorção (filamento deitado) segue o cartão
    // 0: mesma âncora, mesma orientação (x ao longo da PIL) e o MESMO
    // uSeed — a estrutura escura no disco é a mesma cortina do limbo.
    // Nenhum sorteio novo: o stream do srand não desloca.
    if (ps.flat){
      ps.flat.quaternion.copy(ps.meshes[0].quaternion);
      ps.flat.position.copy(ps.meshes[0].position);
      ps.flat.userData.dir = ps.meshes[0].userData.dir;
      ps.flat.material.uniforms.uSeed.value = ps.meshes[0].material.uniforms.uSeed.value;
    }
  }
  // uniforms comuns aos três shaders de proeminência (ciclo de vida,
  // agitação por flare e "tempo do plasma" são a mesma interface)
  var PROM_HEADER_GLSL = [
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform float uIntensity;',
    'uniform float uAspect;',
    'uniform float uLife;',
    'uniform float uAgit;',
    'uniform float uPTime;',
    'varying vec2 vUv;'
  ].join('\n');
  var hedgerowFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
    'void main(){',
    '  float xn = vUv.x*2.0 - 1.0;',
    '  float y = vUv.y;',
    // topo em arco irregular (mais alto no meio, recortado por ruído
    // em duas escalas — os montículos da ref-05 são bem denteados)
    '  float yTop = (0.60 + 0.28*snoise(vec3(xn*2.3, uSeed, 0.0))',
    '             + 0.12*snoise(vec3(xn*6.1, uSeed*1.7, 2.0))) * (1.0 - xn*xn*0.62);',
    // ciclo de vida: a cortina CRESCE da superfície e recolhe no fim
    '  yTop *= 0.10 + 0.90*uLife;',
    // flare vizinho ERGUE a cortina (injeção de energia por baixo)
    '  yTop *= 1.0 + 0.60*uAgit;',
    // cortina: fios VERTICAIS finos, drenando devagar (uPTime acelera
    // a drenagem sob agitação, sem saltos)
    '  float th1 = snoise(vec3(vUv.x*uAspect*24.0, y*3.0 - uPTime*0.05, uSeed));',
    '  float th2 = snoise(vec3(vUv.x*uAspect*55.0, y*6.0 - uPTime*0.08, uSeed+7.7));',
    '  float wisp = smoothstep(0.05, 0.80, (th1*0.6 + th2*0.5)*0.5+0.5);',
    '  float body = smoothstep(0.02, 0.16, yTop - y);',
    '  float a = wisp * body * uIntensity;',
    '  a *= 1.0 - smoothstep(0.72, 1.0, abs(xn));',
    // corta abaixo da superfície curva (sem borda reta flutuante)
    '  a *= smoothstep(0.0, 0.07, y);',
    // extinção alargada 0.08→0.22 (backlog M2 nº6, aqui e nas outras
    // 2 camadas): o fade final comprimia-se em ~1 frame — a
    // proeminência agora se apaga ao longo da cauda do envelope
    '  a *= smoothstep(0.0, 0.22, uLife);',
    '  vec3 col = mix(vec3(0.45,0.06,0.02), vec3(1.30,0.42,0.12), wisp*(1.0-y*0.8));',
    // brilho HDR do flare: a COR sobe (o alfa satura no corpo denso e
    // esconderia o reavivamento; >1.0 o bloom captura)
    '  col *= 1.0 + 0.9*uAgit;',
    '  gl_FragColor = vec4(col, a*1.05);',
    '}'
  ].join('\n');
  // PLUMA VARRIDA (ref-04): a proeminência real da foto não é um
  // leque denso e simétrico — são FEIXES distintos de fios finos
  // quase paralelos, todos varridos para um lado, com pontas
  // desfiadas e céu vazio entre os feixes
  var fanFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
      'void main(){',
      '  float xn = vUv.x*2.0 - 1.0;',
      // pé deslocado para o lado oposto à varredura
      '  float side = (fract(uSeed*0.73) > 0.5) ? 1.0 : -1.0;',
      '  vec2 p = vec2(xn*uAspect*0.5 - 0.30*side, vUv.y + 0.06);',
      '  float r = length(p);',
      '  float ang = atan(-side*p.x, p.y);',
      // varredura: o fio curva-se para o lado conforme sobe
      '  float sweep = 0.55 + 0.40*snoise(vec3(uSeed*0.7, 1.3, 0.0));',
      '  float aa = ang - sweep*r*1.35;',
      // feixes com VÃOS: gate de baixa frequência sobre o ângulo varrido
      '  float bundle = snoise(vec3(aa*3.4, uSeed*1.9, 0.4));',
      '  float bgate = smoothstep(-0.05, 0.42, bundle);',
      // fios finos e paralelos dentro de cada feixe (drenam devagar)
      '  float th1 = snoise(vec3(aa*26.0 + uSeed, r*2.0 - uPTime*0.045, uSeed));',
      '  float th2 = snoise(vec3(aa*57.0 - uSeed, r*3.6 - uPTime*0.07, uSeed*2.3));',
      '  float wisp = smoothstep(0.12, 0.80, (th1*0.60 + th2*0.50)*0.5+0.5);',
      // cada feixe tem comprimento próprio; a ponta é DESFIADA
      '  float blen = 0.62 + 0.34*snoise(vec3(bundle*2.7, uSeed*1.3, 2.2));',
      // ciclo de vida: os feixes ALONGAM a partir da superfície
      '  blen *= 0.10 + 0.90*uLife;',
      // flare vizinho alonga/ergue os feixes
      '  blen *= 1.0 + 0.50*uAgit;',
      '  float fray = 0.12*snoise(vec3(aa*13.0, r*6.0, uSeed*3.1));',
      '  float tip = 1.0 - smoothstep(blen*0.52, blen + fray, r);',
      '  float a = wisp * bgate * tip * uIntensity;',
      '  a *= 1.0 - smoothstep(1.05, 1.45, abs(ang));',
      '  a *= smoothstep(0.0, 0.05, vUv.y);',
      '  a *= smoothstep(0.0, 0.22, uLife);',
      // H-alfa contra céu escuro: vermelho profundo, pontas mais frias
      '  vec3 col = mix(vec3(0.48,0.07,0.02), vec3(1.30,0.45,0.13), wisp*tip);',
      '  col *= 1.0 + 0.9*uAgit;',
      '  gl_FragColor = vec4(col, a*1.15);',
      '}'
    ].join('\n');
  // ARCO: tubo de fios seguindo um laço magnético — coordenadas
  // polares centradas ABAIXO da base; o feixe vive num anel |r-R0|
  // fino, fios comprimidos na direção ANGULAR (seguem o arco), pés
  // mais grossos/brilhantes e vão transparente sob o vão do laço
  var archFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
    'void main(){',
    '  float xn = vUv.x*2.0 - 1.0;',
    '  float y = vUv.y;',
    '  vec2 p = vec2(xn*uAspect*0.5, y + 0.22);',
    '  float r = length(p);',
    '  float ang = atan(p.x, p.y);',
    // raio do laço: UM arco só por proeminência (o raio não pode
    // ondular com o ângulo, senão vira renda de arquinhos) — apenas
    // uma assimetria suave e respiração lenta. Alto o bastante para
    // o vão sob o laço se erguer claramente do limbo
    '  float R0 = 0.78 + 0.05*snoise(vec3(uSeed, 2.1, 0.0))',
    '           + 0.030*snoise(vec3(ang*0.8 + uSeed, 5.3, uTime*0.02));',
    // ciclo de vida: o laço ERGUE-SE de sob a superfície (R0 pequeno
    // fica todo abaixo do limbo) e afunda de volta no colapso
    '  R0 *= 0.15 + 0.85*uLife;',
    // flare vizinho ERGUE o laço inteiro
    '  R0 *= 1.0 + 0.32*uAgit;',
    '  float d = r - R0;',
    // fios ao longo do arco (dreno lento de matéria pelos pés: o
    // padrão angular desliza para baixo dos dois lados; uPTime
    // acelera o dreno sob agitação, sem saltos)
    '  float drift = uPTime*0.045;',
    // FIOS ANISOTRÓPICOS (ref-04): fios reais correm PARALELOS ao
    // arco — variação rápida ATRAVÉS do tubo (d), lenta ao longo
    // (ang). Frequências parecidas nos dois eixos viravam mancha
    // isotrópica ("pele de onça" num tubo sólido).
    // frequência angular BAIXA: fios longos e contínuos ao longo do
    // arco (freq alta picotava em "confete tracejado")
    '  float th1 = snoise(vec3(ang*1.6 + uSeed + sign(ang)*drift, d*34.0, uSeed*1.3));',
    '  float th2 = snoise(vec3(ang*3.0 - uSeed + sign(ang)*drift*1.6, d*70.0, uSeed*2.1));',
    // gate chega a ZERO entre fios: céu aparece ATRAVÉS do laço
    // (proeminência é opticamente fina, não tubo opaco)
    '  float wisp = smoothstep(0.34, 0.74, (th1*0.62 + th2*0.5)*0.5+0.5);',
    // feixes com vãos de céu entre grupos de fios
    '  float bund = smoothstep(-0.35, 0.30, snoise(vec3(ang*2.3 + uSeed*3.1, d*7.0, uSeed)));',
    // tubo mais grosso e denso nos pés (como nos laços reais)
    '  float thick = 0.12 + 0.05*smoothstep(0.35, 1.15, abs(ang))',
    '              + 0.025*snoise(vec3(ang*3.1, uSeed*0.7, 0.0));',
    // borda EMPLUMADA: os fios definem a silhueta, não um degrau
    '  float tube = 1.0 - smoothstep(thick*0.10, thick*1.30, abs(d));',
    '  float feet = 1.0 - smoothstep(1.08, 1.38, abs(ang));',
    '  float a = wisp * bund * tube * feet * uIntensity;',
    '  a *= smoothstep(0.0, 0.06, y);',
    '  a *= smoothstep(0.0, 0.22, uLife);',
    '  vec3 col = mix(vec3(0.45,0.06,0.02), vec3(1.28,0.42,0.12), wisp);',
    '  col *= 1.0 + 0.9*uAgit;',
    // vãos derrubaram a cobertura média: compensa no alfa para o laço
    // existir em exposição nativa (fios finos MAS visíveis)
    '  gl_FragColor = vec4(col, a*2.0);',
    '}'
  ].join('\n');
  // FASE 3 — CONTINUIDADE FILAMENTO↔PROEMINÊNCIA. Proeminência e
  // filamento são o MESMO objeto visto de ângulos diferentes: a cortina
  // de plasma vermelha de perfil (limbo) é o canal escuro de absorção
  // visto de cima (disco). O cartão radial em pé degenera em linha de
  // 0px visto de cima, então o gêmeo escuro é um cartão DEITADO sobre a
  // esfera, na mesma âncora/tangente de PIL e com o MESMO uSeed — o
  // perfil yTop que recorta o topo da cortina vira a meia-largura do
  // canal (as reentrâncias são os "barbs" dos filamentos reais, ver
  // ref-07). Blending multiplicativo dst*(1-src): absorção de verdade,
  // não aditivo — o mesmo mecanismo que o débito da arcada escura pede.
  // O crossfade usa o MESMO facing que apaga a emissão contra o disco:
  // escuro ∝ s, vermelho ∝ (1-s) — no limbo a estrutura troca de cara
  // sem trocar de identidade.
  // vertex do gêmeo: igual ao uvMeshVertex + posição de MUNDO por
  // varying — o gate por-pixel do limbo precisa saber onde o ponto da
  // superfície está em relação à borda visível do disco
  var promAbsorbVertex = [
    'varying vec2 vUv;',
    'varying vec3 vWPos;',
    'void main(){',
    '  vUv = uv;',
    '  vWPos = (modelMatrix * vec4(position,1.0)).xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
    '}'
  ].join('\n');
  var promAbsorbFragment = hedgerowFragment
    .replace('void main(){',
      'uniform float uAbsorb;\nvarying vec3 vWPos;\nvoid main(){')
    // yc = afastamento do CENTRO do canal (a PIL corre no meio do
    // cartão deitado); o y do ruído fica ASSINADO — espelhar o noise
    // com abs() gerava "renda" simétrica ornamental (QA F3). O centro
    // MEANDRA com a longitude (painel de juízes F3: "reto demais lê
    // como risco geométrico" — filamentos reais serpenteiam, ref-03)
    .replace('  float y = vUv.y;',
      '  float y = vUv.y;\n' +
      '  float yc = abs(y*2.0 - 1.0 + 0.38*snoise(vec3(xn*2.1, uSeed*2.9, 1.5)));')
    // a largura do canal usa yc (o perfil yTop da cortina vira a
    // meia-largura do filamento — as reentrâncias são os barbs)
    .replace('  float body = smoothstep(0.02, 0.16, yTop - y);',
      '  float body = smoothstep(0.02, 0.16, yTop - yc);')
    // miolo SÓLIDO: o gate de wisp da cortina abre buracos até zero, e
    // visto de cima o canal virava picote/dithering (flag unânime do
    // painel de juízes F3 — filamento GONG é absorção contínua e macia,
    // fios só nas bordas). O wisp vira modulação suave, não gate.
    .replace('  float a = wisp * body * uIntensity;',
      '  float a = (0.60 + 0.40*wisp) * body * uIntensity;')
    // o corte "abaixo da superfície" do cartão em pé mataria um lado
    // inteiro do canal deitado — fora
    .replace('  a *= smoothstep(0.0, 0.07, y);', '')
    .replace('  gl_FragColor = vec4(col, a*1.05);',
      // fade por-pixel do limbo: a absorção escala com mu (a luz que
      // RESTA para absorver — sobre o anel escurecido do limbo um
      // multiply forte lia como renda flutuante, QA F3) e um taper mata
      // o resíduo perto da borda: filamentos H-alfa reais somem por
      // projeção ao se aproximarem do limbo (ρ>0.9) e é a proeminência
      // vermelha do cartão em pé que assume dali em diante. mu usa o
      // horizonte verdadeiro (ponto→câmera, não o eixo da câmera).
      '  float mu = dot(normalize(vWPos), normalize(cameraPosition - vWPos));\n' +
      '  float ab = clamp(a*1.3, 0.0, 1.0) * uAbsorb' +
      ' * mu * smoothstep(0.25, 0.45, mu);\n' +
      '  gl_FragColor = vec4(vec3(ab), 1.0);');
  (function buildProminences(){
    for(var i=0;i<PROMINENCE_COUNT;i++){
      // âncora na superfície + plano vertical (local +Y = radial para fora).
      // O leque de fios é desenhado no shader em coordenadas polares a
      // partir da base — como as proeminências reais: fios finos que
      // sobem, curvam e se ramificam (ver ref-04).
      var anchor = sampleProminenceAnchor();
      // três tipos: leque plumoso (ref-04), "hedgerow" — cortina de fios
      // verticais com topo em arco irregular, o tipo mais comum no limbo —
      // e ARCO/LAÇO: ponte de plasma com dois pés ancorados e vão escuro
      // embaixo (a proeminência "clássica" de laço magnético)
      var promType = i % 3;   // 0 leque, 1 hedgerow, 2 arco
      var isHedgerow = (promType === 1);
      var isArch = (promType === 2);
      // DIMENSÕES calibradas pela observação (R☉ ≈ 696 Mm):
      //  - laços/arcos: ápice típico 50-150 Mm; sistemas gigantes ~200 Mm
      //    (limite histórico, ex. "Granddaddy" 1946). Com R0=0.78 e centro
      //    -0.22, o ápice fica ~0.56·h => h 0.22-0.32R dá ápice 86-125 Mm ✓
      //  - quiescentes/hedgerow: 30-100 Mm de altura => h 0.09-0.15R ✓
      //  - plumas/surges eruptivos: 100-250 Mm => h 0.18-0.32R ✓
      var w = isArch ? SUN_RADIUS*(0.80 + srand()*0.35)
            : isHedgerow ? SUN_RADIUS*(0.60 + srand()*0.32) : SUN_RADIUS*(0.55 + srand()*0.5);
      var h = isArch ? SUN_RADIUS*(0.22 + srand()*0.10)
            : isHedgerow ? SUN_RADIUS*(0.09 + srand()*0.06) : SUN_RADIUS*(0.18 + srand()*0.14);
      var geo = new THREE.PlaneGeometry(w, h, 48, 1);
      geo.translate(0, h*0.5 - SUN_RADIUS*0.02, 0);   // base levemente dentro do disco
      // CONEXÃO FÍSICA: um cartão reto não abraça a esfera — nas pontas a
      // base flutuava até ~0.14R acima do limbo (um corte parabólico no
      // shader só disfarçava, deixando vão sob os pés dos arcos). Curvamos
      // o cartão em torno do centro do Sol: cada coluna de vértices vira um
      // raio, a base fica a raio constante 0.975R em QUALQUER x e vUv.y
      // passa a medir altura radial verdadeira acima da base.
      (function bendOverSphere(){
        var pos = geo.attributes.position;
        var cDist = SUN_RADIUS*0.995;   // centro do Sol no espaço local
        for (var vi=0; vi<pos.count; vi++){
          var vx = pos.getX(vi), vy = pos.getY(vi);
          var aBend = vx / SUN_RADIUS;
          var rho = cDist + vy;
          pos.setXYZ(vi, rho*Math.sin(aBend), rho*Math.cos(aBend) - cDist, pos.getZ(vi));
        }
        geo.computeBoundingSphere();
      })();
      var promUniforms = {
        uTime: { value: 0 },
        uSeed: { value: srand()*100 },
        uIntensity: { value: 1.0 },
        uAspect: { value: w/h },
        // ciclo de vida (0..1): a ESTRUTURA cresce da superfície no
        // nascimento e recolhe no colapso — nunca pop-in
        uLife: { value: 0.0 },
        // agitação por flare vizinho (0..1): ergue e reaviva o plasma
        uAgit: { value: 0.0 },
        // "tempo do plasma": acumulado em JS com velocidade variável
        // (acelera sob agitação SEM saltar a fase do ruído — multiplicar
        // uTime por um fator transitório saltaria a coordenada do noise)
        uPTime: { value: 0.0 }
      };
      var mat = new THREE.ShaderMaterial({
        uniforms: promUniforms,
        vertexShader: uvMeshVertex,
        fragmentShader: isArch ? archFragment : (isHedgerow ? hedgerowFragment : fanFragment),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      // dois planos cruzados a 90° (cartões de folhagem): nunca degeneram
      // em "agulha" quando vistos de perfil. Materiais independentes para
      // que cada plano possa esmaecer conforme fica de FRENTE à câmera —
      // proeminências são folhas opticamente finas: brilham de perfil.
      var mat2 = mat.clone();
      var mesh = new THREE.Mesh(geo, mat);
      var mesh2 = new THREE.Mesh(geo, mat2);
      var phase = srand()*Math.PI*2;
      var speed = 0.6+srand()*0.8;
      // ciclo de vida como o das regiões ativas: períodos individuais e
      // fases ESCALONADAS (o limbo nunca fica vazio nem lotado de uma vez)
      var ps = { meshes: [mesh, mesh2], period: 70 + srand()*50,
                 phase: 0, reborn: false };
      ps.phase = (i/PROMINENCE_COUNT + srand()*0.08) * ps.period;
      [mesh, mesh2].forEach(function(mm, k){
        mm.userData.twinIdx = k;
        mm.userData.phase = phase;
        mm.userData.speed = speed;
        mm.userData.state = ps;
        prominenceMeshes.push(mm);
        prominenceGroup.add(mm);
      });
      // FASE 3 — gêmeo de absorção (filamento): cartão DEITADO drapejado
      // sobre a esfera, largura máxima ~0.05R (canais reais 0.005-0.012R,
      // gigantes com barbs mais largos — ref-07). Sem sorteios novos: a
      // geometria não consome srand e o uSeed é copiado do cartão em pé.
      (function buildFlatTwin(){
        var hF = SUN_RADIUS*0.05;
        var geoF = new THREE.PlaneGeometry(w, hF, 48, 6);
        var posF = geoF.attributes.position;
        var cDist = SUN_RADIUS*0.995;
        var lift = SUN_RADIUS*0.012;   // acima da superfície, sem z-fight
        for (var vi=0; vi<posF.count; vi++){
          // plano xy -> xz (deitado), depois drapeja no raio da esfera
          var vx = posF.getX(vi), vz = posF.getY(vi);
          var dl = Math.sqrt(vx*vx + cDist*cDist + vz*vz);
          var rr = (cDist + lift)/dl;
          posF.setXYZ(vi, vx*rr, cDist*rr - cDist, vz*rr);
        }
        geoF.computeBoundingSphere();
        var matF = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 }, uSeed: { value: 0 },
            // uAspect do cartão EM PÉ (não w/hF): a frequência dos fios
            // do shader escala com o aspect — com w/hF (~11-23) o canal
            // virava picote; com w/h a fibra tem a MESMA escala da
            // cortina do limbo (identidade de textura, não só de seed)
            uIntensity: { value: 1.0 }, uAspect: { value: w/h },
            uLife: { value: 0.0 }, uAgit: { value: 0.0 },
            uPTime: { value: 0.0 }, uAbsorb: { value: 0.0 }
          },
          vertexShader: promAbsorbVertex,
          fragmentShader: promAbsorbFragment,
          transparent: true,
          blending: THREE.CustomBlending,
          blendSrc: THREE.ZeroFactor,
          blendDst: THREE.OneMinusSrcColorFactor,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        var flat = new THREE.Mesh(geoF, matF);
        flat.renderOrder = -1;   // escurece o disco ANTES das emissões
        flat.visible = false;    // knob fprom=0: nem entra no draw
        ps.flat = flat;
        prominenceGroup.add(flat);
      })();
      placeProminence(ps, anchor);
      promStates.push(ps);
    }
  })();
  scene.add(prominenceGroup);

  // ---------------------------------------------------------------
  // FASE 1 — LOOPS CORONAIS: linhas de campo do MESMO modelo de cargas
  // (bFieldJS = espelho JS do BFIELD_GLSL/uCharges) traçadas por RK4 na
  // CPU e amortizadas como o bake fatiado (≤1 traço por frame; arcada
  // de flare ≤2). O traço vive no espaço do OBJETO e gira com a esfera.
  // Renderização: um único LineSegments aditivo com brilho HDR (o bloom
  // faz o glow) e envelope por loop via uniform array — zero alocações
  // por frame. Knob `loops` default 0 = frame idêntico ao baseline
  // (convenção LOOP-5); os slots de ARCADA PÓS-FLARE são reusados pelo
  // flare two-ribbon e acendem em qualquer default DURANTE um flare
  // (pendência do audit-loop6 — flares já eram um evento default).
  // ---------------------------------------------------------------
  var LOOP_K = knob('loops', lk('loops', 0), 0.0, 1.5);
  var LOOP_AMB = TP.loops, LOOP_ARC = TP.larc, LOOP_N = LOOP_AMB + LOOP_ARC;
  var LOOP_SEG = TP.lseg;
  // FASE 2 (débito LOD da Fase 1): fitas orientadas à câmera no lugar de
  // LineSegments de 1px. Cada ponto da linha central vira DOIS vértices
  // (aSide ±1) expandidos no vertex shader perpendicular à direção
  // projetada do segmento — tubo de meia-largura FIXA EM MUNDO com piso
  // de 1px na tela (longe continua fino como antes; perto vira fita, não
  // wireframe). Mesma filosofia de buffer: um único conjunto pré-alocado
  // no tamanho máximo, nunca realocado; só position/aTan mudam no re-traço.
  var LOOP_VPTS = LOOP_SEG + 1;                       // pontos da linha central
  var loopPositions = new Float32Array(LOOP_N * LOOP_VPTS * 2 * 3);
  var loopTanAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2 * 3);
  var loopParamAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopIdxAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopSideAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopIndex = new Uint16Array(LOOP_N * LOOP_SEG * 6);
  (function fillLoopStatics(){
    // aParam (0..1 ao longo do arco), aLoop (slot) e aSide (±1) são
    // ESTÁTICOS; o índice (2 triângulos por segmento) também
    for (var li = 0; li < LOOP_N; li++){
      var vbase = li*LOOP_VPTS*2;
      for (var s = 0; s <= LOOP_SEG; s++){
        var v = vbase + s*2;
        loopParamAttr[v]     = s/LOOP_SEG;
        loopParamAttr[v + 1] = s/LOOP_SEG;
        loopIdxAttr[v]     = li;
        loopIdxAttr[v + 1] = li;
        loopSideAttr[v]     = -1;
        loopSideAttr[v + 1] =  1;
      }
      for (var g = 0; g < LOOP_SEG; g++){
        var v0 = vbase + g*2, o = (li*LOOP_SEG + g)*6;
        loopIndex[o]   = v0;     loopIndex[o+1] = v0 + 1; loopIndex[o+2] = v0 + 2;
        loopIndex[o+3] = v0 + 2; loopIndex[o+4] = v0 + 1; loopIndex[o+5] = v0 + 3;
      }
    }
  })();
  var loopGeo = new THREE.BufferGeometry();
  loopGeo.setAttribute('position', new THREE.BufferAttribute(loopPositions, 3));
  loopGeo.setAttribute('aTan', new THREE.BufferAttribute(loopTanAttr, 3));
  loopGeo.setAttribute('aParam', new THREE.BufferAttribute(loopParamAttr, 1));
  loopGeo.setAttribute('aLoop', new THREE.BufferAttribute(loopIdxAttr, 1));
  loopGeo.setAttribute('aSide', new THREE.BufferAttribute(loopSideAttr, 1));
  loopGeo.setIndex(new THREE.BufferAttribute(loopIndex, 1));
  var loopEnvArr = new Float32Array(LOOP_N);   // intensidade final por loop
  var loopHotArr = new Float32Array(LOOP_N);   // 1 = recém-reconectado (branco)
  // FASE 4 (débito F1/F2/F3): peso de ABSORÇÃO por loop — só os slots
  // de arcada enchem, quando os laços pós-flare esfriam de aditivo
  // para escuro (em H-alfa a arcada fria absorve contra o disco)
  var loopCoolArr = new Float32Array(LOOP_N);
  var loopUniforms = {
    uTime: { value: 0 },
    uLoopEnv: { value: loopEnvArr },
    uLoopHot: { value: loopHotArr },
    // FASE 2 — fitas com espessura de tela: resolução do viewport (px)
    // e meia-largura do tubo em unidades de MUNDO (~0.006 R☉ visual)
    uRes: { value: new THREE.Vector2(2, 2) },
    uLoopW: { value: SUN_RADIUS * 0.0060 }
  };
  var loopMaterial = new THREE.ShaderMaterial({
    uniforms: loopUniforms,
    vertexShader: [
      'attribute float aParam;',
      'attribute float aLoop;',
      'attribute float aSide;',
      'attribute vec3 aTan;',
      // lookup do envelope no VERTEX shader (indexação dinâmica de
      // uniform é garantida lá, não no fragment em ES baixo)
      'uniform float uLoopEnv[' + LOOP_N + '];',
      'uniform float uLoopHot[' + LOOP_N + '];',
      'uniform vec2 uRes;',
      'uniform float uLoopW;',
      'varying float vParam;',
      'varying float vEnv;',
      'varying float vHot;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying float vWide;',
      'void main(){',
      '  vParam = aParam; vId = aLoop; vSide = aSide;',
      '  int li = int(aLoop + 0.5);',
      '  vEnv = uLoopEnv[li];',
      '  vHot = uLoopHot[li];',
      // fita orientada à câmera: expande o vértice perpendicular à
      // DIREÇÃO PROJETADA do segmento (espaço de tela). Largura = tubo
      // de meia-largura fixa em mundo projetado para pixels, com PISO
      // de 1px (longe a fita degenera na linha fina de antes — o brilho
      // sub-pixel vira fade de energia em vFade, sem cintilar) e teto
      // de 22px (perto é fita larga, não wireframe).
      '  vec4 clipA = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipB = projectionMatrix * modelViewMatrix * vec4(position + aTan, 1.0);',
      '  float wA = max(clipA.w, 0.01);',
      '  float wB = max(clipB.w, 0.01);',
      '  vec2 dS = (clipB.xy/wB - clipA.xy/wA) * uRes;',
      '  float dl = length(dS);',
      '  vec2 nrm = (dl > 1e-3) ? vec2(-dS.y, dS.x)/dl : vec2(0.0, 1.0);',
      '  float pxScale = 0.5 * uRes.y * projectionMatrix[1][1];',
      '  float rawPx = uLoopW * pxScale / wA;',
      // FASE 3 (débito F2): loop quase FACE-ON degenerava em "rabisco"
      // de 1px — o piso de largura agora cresce com o encurtamento
      // perspectivo do segmento (dl projetado vs comprimento esperado
      // sem foreshortening); de lado nada muda (piso 1px do LOOP-5)
      '  float expPx = length(aTan) * pxScale / wA;',
      '  float faceK = 1.0 - clamp(dl / max(expPx, 1e-3), 0.0, 1.0);',
      '  float wMin = 1.0 + 2.2*faceK*faceK;',
      '  float wpx = clamp(rawPx, wMin, 14.0);',
      // energia conservada na largura FORÇADA: o brilho cai na razão
      // rawPx/wpx (generaliza o fade sub-pixel antigo — para wMin=1 a
      // expressão é idêntica à do LOOP-5)
      '  vFade = clamp(rawPx / wpx, 0.05, 1.0);',
      // vWide 0→1 conforme a fita alarga na tela: o fragment usa para
      // AMORTECER o contraste do fluxo (que em 1px lia como cintilação
      // viva, mas numa fita larga vira "salsichas" de brilho)
      '  vWide = clamp((rawPx - 1.0)/13.0, 0.0, 1.0);',
      '  clipA.xy += nrm * (aSide * wpx * 2.0 / uRes) * wA;',
      '  gl_Position = clipA;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'varying float vParam;',
      'varying float vEnv;',
      'varying float vHot;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying float vWide;',
      'void main(){',
      '  if (vEnv < 0.002) discard;',
      // plasma escoando pelo tubo (condensação coronal): 2 harmônicas
      // incomensuráveis em sentidos opostos — vivo, sem período audível.
      // De perto (fita larga, vWide→1) o contraste do fluxo amortece:
      // o brilho pulsante que anima um fio de 1px quebraria a fita em
      // salsichas (visto no smoke ribbons-close da Fase 2)
      '  float f1 = sin(vParam*18.85 - uTime*1.9 + vId*7.31);',
      '  float f2 = sin(vParam*40.84 + uTime*1.23 + vId*3.17);',
      '  float fAmp = 1.0 - 0.62*vWide;',
      '  float flow = 0.62 + (0.26*f1 + 0.14*f2)*fAmp;',
      // pés mais brilhantes (coluna emissiva mais densa na base, como
      // o "moss" das imagens TRACE/AIA)
      '  float foot = 1.0 - vParam*(1.0 - vParam)*2.0;',
      '  float bright = flow * (0.55 + 0.45*foot*foot);',
      // perfil transversal do tubo: coluna de emissão máxima no eixo,
      // caindo suave na borda (integral de um cilindro oco fino leria
      // como 2 riscos; o cheio lê como tubo de plasma)
      '  float prof = 1.0 - vSide*vSide;',
      '  vec3 col = mix(vec3(1.0, 0.40, 0.12), vec3(1.0, 0.74, 0.40), flow*0.6);',
      // arcada recém-reconectada é quase branca e ESFRIA para a paleta
      '  col = mix(col, vec3(1.25, 1.05, 0.85), vHot);',
      '  gl_FragColor = vec4(col * (bright * vEnv * prof * vFade), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,         // o disco OCULTA loops atrás do limbo
    side: THREE.DoubleSide   // a fita gira com a câmera; sem lado "de trás"
  });
  var loopMesh = new THREE.Mesh(loopGeo, loopMaterial);
  loopMesh.frustumCulled = false;   // posições mudam; a esfera de 2.2R sempre enquadra
  loopMesh.visible = false;
  // FASE 4 — ARCADA ESCURA pós-esfriamento (débito da F1): gêmeo de
  // ABSORÇÃO da fita, mesmo mecanismo multiplicativo dst*(1-src) do
  // fprom. Compartilha a MESMA geometria/buffers do loopMesh (zero
  // alocação nova por frame); o envelope vem de uLoopCool, que só os
  // slots de arcada enchem quando o laço esfria no fim do rescaldo.
  // renderOrder -0.5: multiplica DEPOIS da coroa (a arcada fria faz
  // silhueta contra a coroa também) e antes das emissões aditivas.
  var loopAbsUniforms = {
    uTime: { value: 0 },
    uLoopCool: { value: loopCoolArr },
    uRes: loopUniforms.uRes,
    uLoopW: loopUniforms.uLoopW
  };
  var loopAbsMaterial = new THREE.ShaderMaterial({
    uniforms: loopAbsUniforms,
    vertexShader: [
      'attribute float aParam;',
      'attribute float aLoop;',
      'attribute float aSide;',
      'attribute vec3 aTan;',
      'uniform float uLoopCool[' + LOOP_N + '];',
      'uniform vec2 uRes;',
      'uniform float uLoopW;',
      'varying float vParam;',
      'varying float vCool;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying vec3 vWPos;',
      'void main(){',
      '  vParam = aParam; vId = aLoop; vSide = aSide;',
      '  int li = int(aLoop + 0.5);',
      '  vCool = uLoopCool[li];',
      '  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      // a MESMA fita billboard do loopMesh (largura em px com piso e
      // teto) — a absorção veste exatamente o corpo da emissão
      '  vec4 clipA = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipB = projectionMatrix * modelViewMatrix * vec4(position + aTan, 1.0);',
      '  float wA = max(clipA.w, 0.01);',
      '  float wB = max(clipB.w, 0.01);',
      '  vec2 dS = (clipB.xy/wB - clipA.xy/wA) * uRes;',
      '  float dl = length(dS);',
      '  vec2 nrm = (dl > 1e-3) ? vec2(-dS.y, dS.x)/dl : vec2(0.0, 1.0);',
      '  float pxScale = 0.5 * uRes.y * projectionMatrix[1][1];',
      '  float rawPx = uLoopW * pxScale / wA;',
      '  float expPx = length(aTan) * pxScale / wA;',
      '  float faceK = 1.0 - clamp(dl / max(expPx, 1e-3), 0.0, 1.0);',
      '  float wMin = 1.0 + 2.2*faceK*faceK;',
      '  float wpx = clamp(rawPx, wMin, 14.0);',
      '  vFade = clamp(rawPx / wpx, 0.05, 1.0);',
      '  clipA.xy += nrm * (aSide * wpx * 2.0 / uRes) * wA;',
      '  gl_Position = clipA;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'varying float vParam;',
      'varying float vCool;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying vec3 vWPos;',
      'void main(){',
      '  if (vCool < 0.004) discard;',
      // miolo SÓLIDO (lição do painel F3: buracos até zero leem como
      // dithering) — o fluxo vira modulação suave, não gate
      '  float f1 = sin(vParam*18.85 - uTime*0.6 + vId*7.31);',
      '  float body = 0.72 + 0.18*f1;',
      '  float prof = 1.0 - vSide*vSide;',
      // absorção escala com mu (a luz que RESTA — regra do fprom): no
      // limbo o multiply forte sobre o anel escurecido lia como renda
      '  float mu = dot(normalize(vWPos), normalize(cameraPosition - vWPos));',
      '  float ab = prof * body * vCool * vFade * clamp(mu, 0.0, 1.0) * smoothstep(0.12, 0.30, mu);',
      '  gl_FragColor = vec4(vec3(ab * 0.55), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  var loopAbsMesh = new THREE.Mesh(loopGeo, loopAbsMaterial);
  loopAbsMesh.frustumCulled = false;
  loopAbsMesh.visible = false;
  loopAbsMesh.renderOrder = -0.5;
  var loopGroup = new THREE.Group();
  loopGroup.add(loopMesh);
  loopGroup.add(loopAbsMesh);
  scene.add(loopGroup);

  // Traçador RK4 com passo de ARCO fixo sobre o campo unitário B/|B|
  // (o comprimento do passo independe de |B| — estável perto das
  // cargas). Scratch pré-alocado: zero alocações nos re-traços.
  var LOOP_TRACE_MAX = 176;
  var loopTraceBuf = new Float32Array((LOOP_TRACE_MAX + 1)*3);
  var loopTraceLen = new Float32Array(LOOP_TRACE_MAX + 1);
  var loopPtsBuf = new Float32Array((LOOP_SEG + 1)*3);
  var loopFieldP = new THREE.Vector3();
  var lk1 = [0,0,0], lk2 = [0,0,0], lk3 = [0,0,0], lk4 = [0,0,0];
  function loopFieldDir(x, y, z, side, out){
    var B = bFieldJS(loopFieldP.set(x, y, z));
    var m = Math.sqrt(B.x*B.x + B.y*B.y + B.z*B.z) + 1e-9;
    out[0] = B.x/m*side; out[1] = B.y/m*side; out[2] = B.z/m*side;
  }
  var loopStats = { traces: 0, fails: 0, ms: 0, probes: 0, probeRej: 0 };
  // FASE 3 (débito F2 "semeador perdulário"): pré-validação da
  // TOPOLOGIA com uma sonda Euler grosseira (~11x mais barata que o
  // RK4 fino: 64 passos × 1 avaliação de campo vs 176 × 4) — a
  // rejeição de ~80% é dominada pela topologia do campo multi-carga
  // (linha aberta/apex fora da faixa), que a sonda enxerga. Margem no
  // apex em VALOR (±0.012/±0.15), não fração: a 1ª versão usava
  // minApex*0.88=0.911 < raio inicial 1.004 — nunca rejeitava nada
  // (medido: probes 80, probeRej 0, fails finos inalterados em 80%).
  function probeFieldLine(sx, sy, sz, minApex, maxApex){
    var t0 = performance.now();
    var px = sx*1.004, py = sy*1.004, pz = sz*1.004;
    var B0 = bFieldJS(loopFieldP.set(px, py, pz));
    var side = (B0.x*px + B0.y*py + B0.z*pz) >= 0.0 ? 1.0 : -1.0;
    var h = 0.045, apex = 0, landed = false;
    for (var st = 0; st < 88; st++){
      loopFieldDir(px, py, pz, side, lk1);
      px += lk1[0]*h; py += lk1[1]*h; pz += lk1[2]*h;
      var r = Math.sqrt(px*px + py*py + pz*pz);
      if (r > apex) apex = r;
      if (r < 1.001){ landed = true; break; }
      if (r > 2.3) break;
    }
    loopStats.probes++;
    loopStats.ms += performance.now() - t0;
    if (!landed || st < 2 || apex < minApex || apex > maxApex + 0.12){
      loopStats.probeRej++;
      return false;
    }
    return true;
  }
  // traça a linha de campo que passa por (sx,sy,sz) na direção que
  // SOBE; devolve o nº de pontos no scratch, 0 = inválida (linha
  // aberta/rasteira demais). [minApex, maxApex] distingue loops
  // ambientes (altos) de arcadas pós-flare — compactas POR FÍSICA: o
  // laço recém-reconectado nasce baixo, logo acima das fitas.
  function traceFieldLine(sx, sy, sz, minApex, maxApex, h){
    var t0 = performance.now();
    var half = h*0.5, sixth = h/6.0;
    var px = sx*1.004, py = sy*1.004, pz = sz*1.004;
    var B0 = bFieldJS(loopFieldP.set(px, py, pz));
    var side = (B0.x*px + B0.y*py + B0.z*pz) >= 0.0 ? 1.0 : -1.0;
    var n = 0, apex = 0, landed = false;
    loopTraceBuf[0] = px; loopTraceBuf[1] = py; loopTraceBuf[2] = pz;
    loopTraceLen[0] = 0;
    for (var st = 0; st < LOOP_TRACE_MAX; st++){
      loopFieldDir(px, py, pz, side, lk1);
      loopFieldDir(px + lk1[0]*half, py + lk1[1]*half, pz + lk1[2]*half, side, lk2);
      loopFieldDir(px + lk2[0]*half, py + lk2[1]*half, pz + lk2[2]*half, side, lk3);
      loopFieldDir(px + lk3[0]*h,    py + lk3[1]*h,    pz + lk3[2]*h,    side, lk4);
      px += (lk1[0] + 2.0*(lk2[0] + lk3[0]) + lk4[0]) * sixth;
      py += (lk1[1] + 2.0*(lk2[1] + lk3[1]) + lk4[1]) * sixth;
      pz += (lk1[2] + 2.0*(lk2[2] + lk3[2]) + lk4[2]) * sixth;
      n++;
      loopTraceBuf[n*3] = px; loopTraceBuf[n*3+1] = py; loopTraceBuf[n*3+2] = pz;
      loopTraceLen[n] = loopTraceLen[n-1] + h;
      var r = Math.sqrt(px*px + py*py + pz*pz);
      if (r > apex) apex = r;
      if (r < 1.001){ landed = true; break; }   // pousou na outra polaridade
      if (r > 2.3) break;                        // linha ABERTA (polar): descarta
    }
    loopStats.ms += performance.now() - t0;
    loopStats.traces++;
    if (!landed || n < 8 || apex < minApex || apex > maxApex){
      loopStats.fails++;
      return 0;
    }
    return n + 1;
  }
  // reamostra o traço em LOOP_SEG+1 pontos EQUIDISTANTES em arco (a
  // fase do fluxo no shader precisa de param uniforme) e grava o slot
  // como pares de segmento, já em escala de mundo (SUN_RADIUS)
  function writeLoopSlot(slot, nPts){
    var total = loopTraceLen[nPts-1];
    var j = 0;
    for (var s = 0; s <= LOOP_SEG; s++){
      var target = total * s / LOOP_SEG;
      while (j < nPts - 2 && loopTraceLen[j+1] < target) j++;
      var l0 = loopTraceLen[j], l1 = loopTraceLen[j+1];
      var f = (l1 > l0) ? (target - l0)/(l1 - l0) : 0.0;
      loopPtsBuf[s*3]   = (loopTraceBuf[j*3]   + (loopTraceBuf[j*3+3] - loopTraceBuf[j*3])  *f) * SUN_RADIUS;
      loopPtsBuf[s*3+1] = (loopTraceBuf[j*3+1] + (loopTraceBuf[j*3+4] - loopTraceBuf[j*3+1])*f) * SUN_RADIUS;
      loopPtsBuf[s*3+2] = (loopTraceBuf[j*3+2] + (loopTraceBuf[j*3+5] - loopTraceBuf[j*3+2])*f) * SUN_RADIUS;
    }
    // FASE 2 — fitas: cada ponto central vira 2 vértices (lados ±1);
    // a tangente (diferença central dos vizinhos) vai junto para o
    // vertex shader orientar a fita à câmera
    var base = slot*LOOP_VPTS*2*3;
    for (var g = 0; g <= LOOP_SEG; g++){
      var p3 = g*3;
      var pn = (g < LOOP_SEG ? g + 1 : LOOP_SEG)*3;
      var pp = (g > 0 ? g - 1 : 0)*3;
      var tx = loopPtsBuf[pn]   - loopPtsBuf[pp];
      var ty = loopPtsBuf[pn+1] - loopPtsBuf[pp+1];
      var tz = loopPtsBuf[pn+2] - loopPtsBuf[pp+2];
      var o = base + g*6;
      loopPositions[o]   = loopPtsBuf[p3];
      loopPositions[o+1] = loopPtsBuf[p3+1];
      loopPositions[o+2] = loopPtsBuf[p3+2];
      loopPositions[o+3] = loopPtsBuf[p3];
      loopPositions[o+4] = loopPtsBuf[p3+1];
      loopPositions[o+5] = loopPtsBuf[p3+2];
      loopTanAttr[o]   = tx; loopTanAttr[o+1] = ty; loopTanAttr[o+2] = tz;
      loopTanAttr[o+3] = tx; loopTanAttr[o+4] = ty; loopTanAttr[o+5] = tz;
    }
    loopGeo.attributes.position.needsUpdate = true;
    loopGeo.attributes.aTan.needsUpdate = true;
  }
  // semeia perto do pé LÍDER de uma região viva (sorteio ∝ |w|), num
  // leque voltado ao seguidor: as linhas traçadas viram a arcada da
  // região ativa — alturas variadas conforme o offset do pé
  var loopSeedTmp = new THREE.Vector3();
  var loopAxisTmp = new THREE.Vector3();
  var loopLatTmp = new THREE.Vector3();
  function pickLoopSeed(out){
    var tot = 0, i, ps = null;
    for (i = 0; i < pairStates.length; i++) tot += Math.abs(pairStates[i].lead.w);
    if (tot < 0.05) return false;
    var r = loopRand()*tot;
    for (i = 0; i < pairStates.length; i++){
      r -= Math.abs(pairStates[i].lead.w);
      if (r <= 0){ ps = pairStates[i]; break; }
    }
    if (!ps) ps = pairStates[pairStates.length-1];
    if (Math.abs(ps.lead.w) < 0.25) return false;   // região quase morta não enche loop
    loopSeedTmp.set(ps.lead.x, ps.lead.y, ps.lead.z).normalize();
    loopAxisTmp.set(ps.foll.x, ps.foll.y, ps.foll.z).normalize();
    loopAxisTmp.addScaledVector(loopSeedTmp, -loopAxisTmp.dot(loopSeedTmp));
    if (loopAxisTmp.lengthSq() < 1e-6) return false;
    loopAxisTmp.normalize();
    loopLatTmp.crossVectors(loopSeedTmp, loopAxisTmp);
    // FASE 2: o viés do leque pela separação do par foi EXPERIMENTADO e
    // revertido — rejeição medida 79.7% vs 80% do leque fixo (a rejeição
    // é dominada pela topologia do campo multi-carga, não pelo offset).
    // Registrado em docs/fase-2; o débito "semeador perdulário" segue
    // aberto e segue inofensivo (0.01 ms/traço).
    out.copy(loopSeedTmp)
       .addScaledVector(loopAxisTmp, 0.02 + 0.16*loopRand())
       .addScaledVector(loopLatTmp, (loopRand() - 0.5)*0.16)
       .normalize();
    return true;
  }
  // ciclo de vida dos loops ambientes: mesmo padrão das regiões ativas
  // (idade/período/lifeEnvelope); no fim do ciclo o slot é re-traçado
  // no campo DO MOMENTO — loops acompanham a evolução das cargas
  var loopStatesA = [];
  (function initLoopStates(){
    for (var i = 0; i < LOOP_AMB; i++){
      loopStatesA.push({ age: 0, period: 34 + loopRand()*36, ok: false });
    }
  })();
  var loopSeedOut = new THREE.Vector3();
  function retraceAmbient(slot){
    // FASE 3: sonda barata filtra até 12 candidatos; o RK4 fino roda só
    // nos aprovados (máx 4). Antes: 4 traços finos cegos com ~80% de
    // rejeição => P(slot vazio) ~0.41; agora o slot quase sempre enche.
    var fine = 0;
    for (var tries = 0; tries < 12 && fine < 4; tries++){
      if (!pickLoopSeed(loopSeedOut)) break;
      if (!probeFieldLine(loopSeedOut.x, loopSeedOut.y, loopSeedOut.z, 1.035, 1.95)) continue;
      fine++;
      var nP = traceFieldLine(loopSeedOut.x, loopSeedOut.y, loopSeedOut.z, 1.035, 1.95, 0.02);
      if (nP > 0){
        writeLoopSlot(slot, nP);
        var st = loopStatesA[slot];
        st.ok = true; st.age = 0; st.period = 34 + loopRand()*36;
        return true;
      }
    }
    return false;
  }
  // ARCADA PÓS-FLARE: slots extras re-semeados a cada flare ao longo da
  // tangente da PIL; acendem em SEQUÊNCIA (o "zíper" da reconexão
  // propagando pela linha neutra), com o envelope GRADUAL do flare, e
  // esfriam de branco-quente para a paleta coronal
  var arcStates = [];
  (function initArcStates(){
    for (var i = 0; i < LOOP_ARC; i++) arcStates.push({ ok: false, delay: 0, off: 0 });
  })();
  var lastArcAbsMax = 0;   // FASE 4: pico corrente da arcada escura (QA)
  var arcQueueN = 0;
  var arcSeedBase = new THREE.Vector3();
  var arcSeedTan = new THREE.Vector3();
  var arcSeedPerp = new THREE.Vector3();
  var arcSeedOut = new THREE.Vector3();
  function scheduleFlareArcade(){
    // congela a moldura da PIL do EVENTO (o Sol gira; a arcada não
    // pode escorregar para outra moldura no meio do rescaldo)
    arcSeedBase.copy(surfFlareDir);
    arcSeedTan.copy(flareTanDir);
    arcSeedPerp.copy(flarePerpDir);
    for (var i = 0; i < LOOP_ARC; i++){
      var st = arcStates[i];
      st.ok = false;
      st.off = ((LOOP_ARC > 1 ? i/(LOOP_ARC-1) : 0.5) - 0.5) * 0.16 + (loopRand() - 0.5)*0.015;
      st.delay = i*0.10 + loopRand()*0.05;
      loopEnvArr[LOOP_AMB + i] = 0;
      loopCoolArr[LOOP_AMB + i] = 0;
    }
    arcQueueN = LOOP_ARC;
  }
  // uma linha só é ARCADA se pousar PERTO do flare (≤ ~23°): a PIL de
  // sol calmo pode conectar o ponto a outra região/polo — laço gigante
  // que leria como raio saindo do disco, não como arcada pós-flare
  function arcTraceCompact(nP){
    if (nP === 0) return false;
    var e0 = (nP - 1)*3;
    var ex = loopTraceBuf[e0], ey = loopTraceBuf[e0+1], ez = loopTraceBuf[e0+2];
    var em = Math.sqrt(ex*ex + ey*ey + ez*ez) + 1e-9;
    return (ex*arcSeedBase.x + ey*arcSeedBase.y + ez*arcSeedBase.z)/em > 0.92;
  }
  function traceArcadeJob(){
    var i = LOOP_ARC - arcQueueN;
    arcQueueN--;
    var st = arcStates[i];
    // parte do lado de UMA polaridade (offset ATRAVÉS da PIL ~ onde a
    // fita estaciona na fase gradual): a linha sobe, cruza a linha
    // neutra e pousa do outro lado. Sondagem numérica (2026-07): a
    // linha pelo ponto médio a 1.004 é o próprio ápice (rasteira);
    // across 0.06–0.12 dá ápice 1.03–1.17 com pouso ≤ ~10° — a arcada
    // baixa clássica. Passo fino (h=0.01): arcos curtos com pontos
    // suficientes p/ curvar. Se o campo local não fechar compacto, o
    // slot fica apagado ("não houve arcada" é resultado físico válido).
    for (var att = 0; att < 3; att++){
      var across = -0.06 - 0.03*att;
      arcSeedOut.copy(arcSeedBase)
        .addScaledVector(arcSeedTan, st.off + (att > 0 ? (loopRand() - 0.5)*0.02 : 0))
        .addScaledVector(arcSeedPerp, across)
        .normalize();
      var nP = traceFieldLine(arcSeedOut.x, arcSeedOut.y, arcSeedOut.z, 1.025, 1.35, 0.01);
      if (arcTraceCompact(nP)){
        writeLoopSlot(LOOP_AMB + i, nP);
        st.ok = true;
        return;
      }
    }
  }
  // atualização por frame (chamada no animate): laços de índice, sem
  // closures — zero alocações. Orçamento de traço: 2 jobs de arcada OU
  // 1 re-traço ambiente por frame (nunca ambos).
  function updateLoops(delta){
    var loopsOn = subToggle.loops && LOOP_K > 0.001;
    var act = coronaRaysUniforms.uActivity.value;
    var i, st;
    if (arcQueueN > 0){ traceArcadeJob(); if (arcQueueN > 0) traceArcadeJob(); }
    else if (loopsOn){
      // re-traço ambiente amortizado: acha O PRIMEIRO slot vencido
      for (i = 0; i < LOOP_AMB; i++){
        st = loopStatesA[i];
        if (!st.ok || st.age >= st.period*0.90){
          retraceAmbient(i);
          break;
        }
      }
    }
    var arcMax = 0, arcAbsMax = 0;
    for (i = 0; i < LOOP_ARC; i++){
      st = arcStates[i];
      var envA = 0, envAbs = 0;
      if (st.ok){
        var ta = surfFlareT - st.delay;
        if (ta > 0){
          // FASE 2: a arcada NÃO aparece durante o flash impulsivo —
          // fisicamente os laços pós-reconexão crescem na fase gradual,
          // e visualmente a arcada de frente lia como "anéis fantasma"
          // ao redor do core (flagrado unânime pelo painel de juízes,
          // presente até no controle sem knobs). Gate 0.55→1.05 no
          // relógio do evento; em t>=2.5 (check B4) já vale 1.
          var arcGate = Math.min(1, Math.max(0, (surfFlareT - 0.55)/0.5));
          envA = flareEnvGrad(ta) * 1.25 * surfFlareAmp * arcGate;
          var hotK = Math.exp(-ta*0.30);
          loopHotArr[LOOP_AMB + i] = hotK;
          // FASE 4 (débito F1): o laço que ESFRIA troca emissão por
          // ABSORÇÃO — o envelope escuro cresce com (1-hot) e decai
          // no dobro do fôlego do gradual (a arcada fria demora a
          // drenar; em H-alfa ela persiste escura sobre o disco)
          envAbs = flareEnvGrad(ta*0.5) * (1.0 - hotK) * surfFlareAmp * arcGate;
        }
      }
      if (envA < 0.004) envA = 0;
      if (envAbs < 0.004) envAbs = 0;
      loopEnvArr[LOOP_AMB + i] = envA;
      loopCoolArr[LOOP_AMB + i] = Math.min(1, envAbs);
      if (envA > arcMax) arcMax = envA;
      if (envAbs > arcAbsMax) arcAbsMax = envAbs;
    }
    for (i = 0; i < LOOP_AMB; i++){
      st = loopStatesA[i];
      if (!loopsOn || !st.ok){ loopEnvArr[i] = 0; continue; }
      st.age += delta;
      // brilho = ciclo de vida × knob × atividade global do ciclo
      // ("uma estrela, um estado": sol ativo tem coroa mais cheia)
      loopEnvArr[i] = lifeEnvelope(st.age/st.period) * LOOP_K * (0.65 + 0.55*act);
      loopHotArr[i] = 0;
    }
    loopUniforms.uTime.value = elapsed;
    loopUniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
    loopMesh.visible = subToggle.loops && (loopsOn || arcMax > 0 || arcQueueN > 0);
    // arcada escura: só entra no draw quando algum slot esfriou de fato
    loopAbsUniforms.uTime.value = elapsed;
    lastArcAbsMax = arcAbsMax;
    loopAbsMesh.visible = subToggle.loops && arcAbsMax > 0;
  }

  // ---------------------------------------------------------------
  // Campo de estrelas — cor por classe de temperatura estelar real
  // (a maioria das estrelas visíveis é fria/avermelhada; poucas são
  // quentes/azuis), usando a mesma função de corpo negro.
  // ---------------------------------------------------------------
  function buildStars(count, radius, hotBias){
    var positions = new Float32Array(count*3);
    var colors = new Float32Array(count*3);
    for(var i=0;i<count;i++){
      var u = srand(), v = srand();
      var th = 2*Math.PI*u;
      var ph = Math.acos(2*v-1);
      var rr = radius*(0.55+srand()*0.45);
      positions[i*3]   = rr*Math.sin(ph)*Math.cos(th);
      positions[i*3+1] = rr*Math.sin(ph)*Math.sin(th);
      positions[i*3+2] = rr*Math.cos(ph);
      var starTemp = (srand() < (hotBias ? 0.30 : 0.75))
        ? (2800+srand()*3200)
        : (hotBias ? (7000+srand()*13000) : (6000+srand()*20000));
      var sc = kelvinToRGB(starTemp);
      var b = 0.35 + 0.90*Math.pow(srand(), 2.2);   // distribuição ~log: poucas vivas
      colors[i*3]=sc.r*b; colors[i*3+1]=sc.g*b; colors[i*3+2]=sc.b*b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    var mat = new THREE.PointsMaterial({size:1.35, vertexColors:true, transparent:true, opacity:0.55, sizeAttenuation:true});
    return new THREE.Points(geo, mat);
  }
  // glint em cruz para as estrelas VIVAS (sprite: núcleo radial + braços)
  var glintTex = (function(){
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0.0,'rgba(255,255,255,1)');
    g.addColorStop(0.22,'rgba(255,255,255,0.34)');
    g.addColorStop(1.0,'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
    ctx.globalCompositeOperation = 'lighter';
    var arm = ctx.createLinearGradient(0,0,64,0);
    arm.addColorStop(0,'rgba(255,255,255,0)');
    arm.addColorStop(0.5,'rgba(255,255,255,0.5)');
    arm.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = arm; ctx.fillRect(0,31,64,2);
    ctx.translate(32,32); ctx.rotate(Math.PI/2); ctx.translate(-32,-32);
    ctx.fillRect(0,31,64,2);
    var tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  })();
  var stars = buildStars(STAR_COUNT, 700);
  scene.add(stars);
  // camada esparsa de estrelas maiores e mais vivas: profundidade no fundo
  // camada brilhante mais PRÓXIMA (raio 500 vs 700): paralaxe diferencial
  // real quando a câmera ORBITA o pivô — a casca próxima desloca MENOS
  // que o fundo (lei R/(R+d); medido -5.4% por passo de órbita)
  var brightStars = buildStars(TP.bright, 500, true);
  brightStars.material.size = 12.0;   // ~9px na tela: a cruz do glint fica legível
  brightStars.material.opacity = 0.8;
  brightStars.material.map = glintTex;
  brightStars.material.blending = THREE.AdditiveBlending;
  brightStars.material.depthWrite = false;
  scene.add(brightStars);
  // T2.3c: faixa da Via Láctea DISCRETA — terceira camada achatada num
  // plano inclinado (grande círculo), fraca e densa
  var milkyWay = buildStars(Math.floor(STAR_COUNT*0.9), 730);
  (function flattenToBand(){
    var pos = milkyWay.geometry.attributes.position;
    var n = new THREE.Vector3(0.35, 0.85, 0.40).normalize();
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++){
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      var rr0 = v.length();
      v.addScaledVector(n, -v.dot(n)*0.86);
      v.setLength(rr0);   // direção achatada, mas de volta à casca distante
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  })();
  milkyWay.material.size = 1.7;
  milkyWay.material.opacity = knob('mw', 0.62, 0.0, 1.0);
  var STARS_OP0 = stars.material.opacity, BRIGHT_OP0 = brightStars.material.opacity;
  var starK = knob('stars', 1.0, 0.0, 3.0);
  stars.material.opacity = Math.min(1, STARS_OP0*starK);
  brightStars.material.opacity = Math.min(1, BRIGHT_OP0*starK);
  scene.add(milkyWay);
  // twinkle SUTIL (backlog M2 nº4: estrelas eram a única camada 100%
  // morta). Cada estrela pisca com fase e cadência próprias (hash da
  // posição), modulando a OPACIDADE — astrofoto tem pouco, cinema tem
  // algum; a cruz de glint das vivas é a que mais cintila.
  var twinkleUniform = { value: 0 };
  function addTwinkle(mat, amp){
    mat.onBeforeCompile = function(shader){
      shader.uniforms.uTwT = twinkleUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTwT;\nvarying float vTw;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n'
          + 'float twPh = fract(sin(dot(position, vec3(12.9898,78.233,37.719)))*43758.5453)*6.2832;\n'
          + 'float twSp = 2.0 + 4.0*fract(sin(dot(position, vec3(39.3468,11.135,83.155)))*24634.6345);\n'
          + 'vTw = 1.0 - ' + amp.toFixed(2) + '*(0.5 + 0.5*sin(uTwT*twSp + twPh));\n');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTw;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
                 'vec4 diffuseColor = vec4( diffuse, opacity * vTw );');
    };
    // sem isto o three reusa o MESMO programa para amps diferentes
    // (onBeforeCompile.toString() é igual — o amp vive num closure)
    mat.customProgramCacheKey = function(){ return 'twinkle' + amp; };
  }
  addTwinkle(stars.material, 0.30);
  addTwinkle(brightStars.material, 0.45);
  addTwinkle(milkyWay.material, 0.18);
  // Via Láctea opção B (astrofoto): véu DIFUSO de gás por trás da camada
  // estelar — faixa gaussiana no mesmo plano, manchas de fBm, veio de
  // poeira escura no meio, bojo galáctico dourado e bordas azuladas.
  // Aditivo e fora do disco: não toca nos gates.
  var mwNebUniforms = { uMW: { value: 0.0 }, uN: { value: new THREE.Vector3(0.35,0.85,0.40).normalize() } };
  var mwNeb = new THREE.Mesh(new THREE.SphereGeometry(710, 32, 32), new THREE.ShaderMaterial({
    uniforms: mwNebUniforms,
    vertexShader: [
      'varying vec3 vD;',
      'void main(){ vD = position;',
      '  gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uMW;',
      'uniform vec3 uN;',
      'varying vec3 vD;',
      // Via Láctea CINEMATOGRÁFICA (pedido do dono): a versão anterior
      // lia monocromática — ganho 0.16 deixava o véu no toe do ACES e a
      // única variação de matiz (mix azul↔dourado por ck) era ~0 em
      // quase toda a faixa. Agora: campos de fBm SEPARADOS para
      // densidade (3 escalas), matiz fria por mancha (azul↔ciano),
      // manchas de H-alfa avermelhadas, alcance do bojo dourado e veio
      // de poeira marrom sinuoso. uMW segue multiplicando tudo (knob
      // mw=0 desliga); nada dos knobs cinema é tocado.
      'void main(){',
      '  vec3 d = normalize(vD);',
      '  float b = dot(d, uN);',
      '  float band = exp(-b*b*34.0);',
      '  float halo = 0.20*exp(-b*b*9.0);',
      '  if (band + halo < 0.006){ gl_FragColor = vec4(0.0); return; }',
      '  vec3 core = normalize(cross(uN, vec3(0.2,0.0,1.0)));',
      '  float ck = pow(max(dot(d, core), 0.0), 6.0);',
      '  float c1 = fbmLight(d*3.2)*0.5+0.5;',
      '  float c2 = fbmLight(d*7.5+vec3(13.1))*0.5+0.5;',
      '  float c3 = fbmLight(d*16.0+vec3(4.2,8.8,1.5))*0.5+0.5;',
      '  float cloud = 0.22 + 1.5*(0.5*c1+0.32*c2+0.18*c3);',
      '  cloud *= cloud;',
      '  float bw = b + 0.045*fbmLight(d*5.0+vec3(7.7));',
      '  float dust = exp(-bw*bw*300.0) * smoothstep(0.32,0.80,fbmLight(d*9.0+vec3(4.7))*0.5+0.5);',
      '  float hue  = fbmLight(d*2.3+vec3(21.7))*0.5+0.5;',
      '  float hue2 = fbmLight(d*4.2+vec3(33.3))*0.5+0.5;',
      '  float hue3 = fbmLight(d*3.1+vec3(55.5))*0.5+0.5;',
      '  vec3 cCyan = vec3(0.26,0.78,1.30);',
      '  vec3 cBlue = vec3(0.42,0.55,1.30);',
      '  vec3 cAmber= vec3(1.10,0.72,0.38);',
      '  vec3 cHa   = vec3(1.05,0.28,0.22);',
      '  vec3 col = mix(cBlue, cCyan, smoothstep(0.2,0.8,hue));',
      '  col = mix(col, cAmber, clamp(ck*(0.7+0.9*hue3),0.0,1.0));',
      '  float haM = smoothstep(0.58,0.76,hue2)*(0.4+0.6*c2);',
      '  col = mix(col, cHa, haM*0.85);',
      '  col = mix(col, cCyan, 0.55*smoothstep(0.06,0.20,abs(b))*(1.0-ck));',
      '  float coolB = smoothstep(0.55,0.90,hue)*(1.0-clamp(ck*2.0,0.0,1.0))*(1.0-haM);',
      '  col *= 1.0 + 0.55*coolB;',
      '  col = mix(col, vec3(0.45,0.28,0.16), dust*0.7);',
      '  float I = (band*(0.65+0.90*ck) + halo*0.4)*cloud*(1.0-0.78*dust);',
      '  gl_FragColor = vec4(col * I * uMW * 0.27, 1.0);',
      '}'
    ].join('\n'),
    side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  mwNebUniforms.uMW.value = milkyWay.material.opacity;
  scene.add(mwNeb);

  // (Tentativa de faixa da Via Láctea removida: sem QA visual funcionando,
  // calibrar estética por estatística de pixels se provou má ideia.)

  // inclinação real do eixo solar (~7.25° em relação à eclíptica)
  sunMesh.rotation.z = 0.1265;
  prominenceGroup.rotation.z = 0.1265;
  spiculeMesh.rotation.z = 0.1265;
  loopGroup.rotation.z = 0.1265;

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
  var EXP0 = isHDR ? 1.02 : 1.06;
  var BLOOM_THRESHOLD = knob('bloomth', isHDR ? 0.72 : 0.82, 0.2, 2.0);
  // diagnóstico acessível via console: window.__solInfo
  try { window.__solInfo = { webgl2: !!(renderer.capabilities && renderer.capabilities.isWebGL2), hdr: isHDR, tier: TIER, scale: RENDER_SCALE }; } catch(e){}

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

  var thresholdUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uThreshold:{value:BLOOM_THRESHOLD} };
  var thresholdFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uThreshold;',
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
    '  float f = smoothstep(uThreshold, uThreshold+0.3, b);',
    '  gl_FragColor = vec4(c2*f, 1.0);',
    '}'
  ].join('\n');
  var thresholdMaterial = new THREE.ShaderMaterial({ uniforms: thresholdUniforms, vertexShader: quadVertex, fragmentShader: thresholdFragment });
  var thresholdScene = makeFullscreenScene(thresholdMaterial);

  var downsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uDisp:{value:0.0} };
  var downsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
    'varying vec2 vUv;',
    'void main(){',
    // FASE 2 — bloom espectral ponderado por corpo negro: raio de blur
    // POR CANAL (difração ∝ λ — R borra mais largo, B mais estreito;
    // razão ancorada em λ_R/λ_B ≈ 700/450). Este é o termo da DESCIDA;
    // o grosso do espalhamento diferencial acontece na subida (tent por
    // canal no upsampleFragment). Sem passes novos: só taps a mais, e
    // só quando o knob liga.
    '  if (uDisp > 0.001){',
    '    vec2 oR = uTexel * (1.0 + 0.35*uDisp);',
    '    vec2 oB = uTexel * (1.0 - 0.25*uDisp);',
    '    vec3 cS;',
    '    cS.r = texture2D(tDiffuse, vUv+vec2( oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2( oR.x,-oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x,-oR.y)).r;',
    '    cS.g = texture2D(tDiffuse, vUv+vec2( uTexel.x, uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-uTexel.x, uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2( uTexel.x,-uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-uTexel.x,-uTexel.y)).g;',
    '    cS.b = texture2D(tDiffuse, vUv+vec2( oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2( oB.x,-oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x,-oB.y)).b;',
    '    gl_FragColor = vec4(cS*0.25, 1.0);',
    '    return;',
    '  }',
    '  vec3 c = texture2D(tDiffuse, vUv+vec2(uTexel.x,uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-uTexel.x,uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(uTexel.x,-uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-uTexel.x,-uTexel.y)).rgb;',
    '  gl_FragColor = vec4(c*0.25, 1.0);',
    '}'
  ].join('\n');
  var downsampleMaterial = new THREE.ShaderMaterial({ uniforms: downsampleUniforms, vertexShader: quadVertex, fragmentShader: downsampleFragment });
  var downsampleScene = makeFullscreenScene(downsampleMaterial);

  var upsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uDisp:{value:0.0} };
  var upsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
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
    '    vec2 oR = uTexel * (0.5 + 1.70*uDisp);',
    '    vec2 oG = uTexel * 0.5;',
    '    vec2 oB = uTexel * max(0.5 - 0.34*uDisp, 0.0);',
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

  // streak anamórfico (camada cinema): blur horizontal longo em RT
  // pequeno (w/4 × h/16), 2 passadas com alcance crescente; só roda
  // quando o knob streak > 0 — custo zero no default
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
  function renderStreak(){
    var src = bloomMips[Math.min(1, bloomMips.length-1)];
    streakUniforms.tDiffuse.value = src.rt.texture;
    streakUniforms.uTexelX.value = 1/src.w;
    streakUniforms.uStride.value = 2.0;
    renderer.setRenderTarget(streakRTa);
    renderer.render(streakScene, quadCamera);
    streakUniforms.tDiffuse.value = streakRTa.texture;
    streakUniforms.uTexelX.value = 1/streakW;
    streakUniforms.uStride.value = 8.0;
    renderer.setRenderTarget(streakRTb);
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

  var BLOOM_BASE0 = isHDR ? 0.62 : 0.55;
  var BLOOM_STRENGTH_BASE = BLOOM_BASE0 * knob('bloom', lk('bloom', 1.0), 0.0, 3.0);
  // camada cinema (ver docs/cinema-sunshine.md): defaults 0 = frame
  // pixel-idêntico ao calibrado; valores em JS p/ gating por toggle
  var VEIL_BASE = knob('veil', lk('veil', 0), 0.0, 1.5);
  var STREAK_K = knob('streak', lk('streak', 0), 0.0, 1.5);
  var ADAPT_K = knob('adapt', lk('adapt', 0), 0.0, 1.0);
  // FASE 1 — starburst de difração no ponto do flare, dirigido pelo
  // brilho HDR REAL que chega à lente (envelope × visibilidade do
  // ponto no hemisfério voltado à câmera). Default 0 = sem efeito.
  var BURST_K = knob('burst', lk('burst', 0), 0.0, 1.5);
  // FASE 2 — a luz como matéria: dispersão espectral do bloom (raios de
  // blur por canal no dual-Kawase, ver downsampleFragment) e halação com
  // peso de temperatura (só as altas QUENTES sangram para o vermelho,
  // ver branch uHal no compFragment). Defaults 0 = frame pixel-idêntico.
  var DISP_K = knob('disp', lk('disp', 0), 0.0, 1.5);
  var HAL_K = knob('hal', lk('hal', 0), 0.0, 1.5);
  // hand: linguagem de câmera do Sunshine — o Sol é filmado em lente
  // longa com deriva lenta e micro-tremor de operador (0.1-0.3 Hz + um
  // harmônico rápido fraco). Soma de senos incomensuráveis = pseudo-
  // perlin sem alocação; média zero, NÃO acumula no estado da câmera.
  var HAND_K = knob('hand', lk('hand', 0), 0.0, 1.5);
  var adaptCur = 1.0;
  // FASE 5 — foco raso: plano de foco corrente (lerp curto = focus
  // pull de maquinista) e override do modo diretor/QA (-1 = automático,
  // foco na superfície mais próxima do disco)
  var dofFocusCur = 0.0;
  var dofFocusOverride = -1;
  var cineProj = new THREE.Vector3();
  // FASE 1: flare em espaço de MUNDO (p/ visibilidade) + projeção do
  // starburst — temporários reutilizados, zero alocação por frame
  var flareWorldTmp = new THREE.Vector3();
  var burstProj = new THREE.Vector3();
  var lastFlareHDR = 0;
  var compUniforms = {
    tScene:{value:null}, tBloom:{value:null}, tVeil:{value:null}, tStreak:{value:null},
    uStreak:{value: 0.0},
    uBloomStrength:{value: BLOOM_STRENGTH_BASE},
    uExposure:{value: EXP0 * knob('exposure', lk('exposure', 1.0), 0.3, 2.5)},
    uSat:{value: knob('sat', 1.0, 0.0, 2.0)},
    uVig:{value: knob('vig', lk('vig', 0.55), 0.0, 1.5)},
    uGrain:{value: knob('grain', lk('grain', 1.0), 0.0, 5.0)},
    uVeil:{value: 0.0},
    // FASE 2 — halação com peso de temperatura (0 = ramo desligado)
    uHal:{value: 0.0},
    uAdapt:{value: 1.0},
    uFringe:{value: knob('fringe', lk('fringe', 0), 0.0, 1.5)},
    uShimmer:{value: knob('shimmer', lk('shimmer', 0), 0.0, 1.5)},
    uTone:{value: knob('tone', lk('tone', 0), 0.0, 1.2)},
    // film: mistura ACES (0) -> AgX (1). AgX desatura as altas de forma
    // gradual — o centro do disco para de "clipar nuclear" e resolve a
    // pendência de recalibração pós-ACES do audit-loop6. Default 0 =
    // pixel-idêntico ao baseline.
    uFilm:{value: knob('film', lk('film', 0), 0.0, 1.0)},
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
    uDofFocus:{value: 0.0}
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
    'varying vec2 vUv;',
    'vec3 ACESFilm(vec3 x){',
    '  float a=2.51; float b=0.03; float c=2.43; float d=0.59; float e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',
    // AgX (fit polinomial de B. Wrensch sobre o AgX de T. Sobotka): curva
    // de resposta tipo filme com rolloff suave nas altas. Como o pipeline
    // grava direto no canvas (o ACES acima também embute o "gamma"), o
    // resultado fica no espaço codificado do AgX base — comparável ao ACES.
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
    '  vec3 aces = ACESFilm(color);',
    '  color = (uFilm > 0.001) ? mix(aces, AgXFilm(color), uFilm) : aces;',
    '  color = mix(vec3(dot(color, vec3(0.299,0.587,0.114))), color, uSat);',
    // split-tone Sunshine: sombras frias, altas douradas (contraste
    // ouro-vs-frio de Boyle/Küchler dentro do mesmo frame)
    '  if (uTone > 0.001){',
    '    float tl = dot(color, vec3(0.299,0.587,0.114));',
    '    vec3 tint = mix(vec3(0.82,0.90,1.10), vec3(1.08,1.00,0.86), smoothstep(0.10, 0.65, tl));',
    '    color *= mix(vec3(1.0), tint, uTone);',
    '  }',
    // vinheta cinematográfica sutil
    '  vec2 vc = vUv - 0.5;',
    '  color *= 1.0 - dot(vc, vc)*uVig;',
    // dithering só nas áreas ESCURAS (céu/coroa, onde há banding);
    // no disco ele viraria chuvisco isotrópico sobre as fibrilas
    '  float dith = smoothstep(0.30, 0.06, dot(color, vec3(0.3333)));',
    '  color += (hash12(gl_FragCoord.xy) - 0.5) * (1.6/255.0) * dith * uGrain;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
  var compMaterial = new THREE.ShaderMaterial({ uniforms: compUniforms, vertexShader: quadVertex, fragmentShader: compFragment });
  var compScene = makeFullscreenScene(compMaterial);

  function resizeTargets(){
    var w = Math.max(2, Math.floor(window.innerWidth*ctx.pixelRatio));
    var h = Math.max(2, Math.floor(window.innerHeight*ctx.pixelRatio));
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

  // ---------------------------------------------------------------
  // Controles de câmera (arraste/1 dedo = orbita; roda/2 dedos = zoom)
  // ---------------------------------------------------------------
  var V_HALF_FOV = (42 * Math.PI / 180) / 2;
  var R_FIT = SUN_RADIUS * 1.15;

  function computeFitDist(){
    var aspect = window.innerWidth / window.innerHeight;
    var d = R_FIT / Math.tan(V_HALF_FOV);
    d *= Math.max(1, 1 / aspect);
    return d;
  }

  var theta = Math.PI*0.62, phi = Math.PI*0.42;
  var thetaVel = 0, phiVel = 0;          // inércia do giro (rad/s)
  var fitDist = computeFitDist();
  var camDist = fitDist;
  var targetCamDist = fitDist;           // zoom amortecido: camDist persegue este alvo
  var minDist = SUN_RADIUS*1.5, maxDist = 30;
  var lastInteraction = 0;

  var pointers = new Map();
  var rotLast = null;
  var rotId = null;
  var pinchPrevDist = 0;
  var flingSamples = [];

  function updateCamera(){
    var th = theta, ph = phi;
    // offsets de "mão" aplicados só na POSE do frame (theta/phi reais
    // ficam intactos: soltar o knob volta exatamente ao enquadramento)
    if (HAND_K > 0.001){
      var ht = elapsed || 0;
      th += HAND_K*(0.0042*Math.sin(ht*0.291) + 0.0023*Math.sin(ht*0.833+1.7) + 0.0008*Math.sin(ht*2.31+0.4));
      ph += HAND_K*(0.0031*Math.sin(ht*0.247+0.9) + 0.0017*Math.sin(ht*0.911+2.6) + 0.0007*Math.sin(ht*2.73+1.2));
    }
    var sp = Math.sin(ph);
    camera.position.set(
      camDist*sp*Math.cos(th),
      camDist*Math.cos(ph),
      camDist*sp*Math.sin(th)
    );
    camera.lookAt(0,0,0);
  }

  function pointerDistance(){
    var pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    var dx = pts[0].x - pts[1].x;
    var dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function onPointerDown(e){
    directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch(_){}
    if (pointers.size === 1){
      rotId = e.pointerId;
      rotLast = { x: e.clientX, y: e.clientY };
      thetaVel = 0; phiVel = 0;
      flingSamples.length = 0;
      // gesto do HUD: dispara se o dedo ficar parado até o timer vencer
      hudDown = { x: e.clientX, y: e.clientY };
      clearTimeout(hudTimer);
      hudTimer = setTimeout(function(){
        if (hudDown && pointers.size === 1) hudToggle();
      }, 1000);
    } else if (pointers.size === 2){
      rotId = null; rotLast = null;
      pinchPrevDist = pointerDistance();
      hudDown = null; clearTimeout(hudTimer);
    }
    lastInteraction = performance.now();
  }

  function onPointerMove(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (hudDown && (Math.abs(e.clientX - hudDown.x) > 9 ||
                    Math.abs(e.clientY - hudDown.y) > 9)){
      hudDown = null; clearTimeout(hudTimer);
    }

    if (pointers.size >= 2){
      var d = pointerDistance();
      if (pinchPrevDist > 0 && d > 0){
        targetCamDist *= pinchPrevDist / d;
        targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
      }
      pinchPrevDist = d;
      lastInteraction = performance.now();
      return;
    }

    if (e.pointerId === rotId && rotLast){
      var dx = e.clientX - rotLast.x;
      var dy = e.clientY - rotLast.y;
      rotLast.x = e.clientX; rotLast.y = e.clientY;
      // semântica "agarrar o globo" (Google Earth/Maps): a superfície
      // acompanha o dedo nos DOIS eixos. Antes o horizontal era invertido
      // (câmera orbitava no sentido do dedo => superfície ia ao contrário)
      // enquanto o vertical já acompanhava — eixos misturados.
      var dth = dx*0.0055;
      var dph = -dy*0.0055;
      theta += dth;
      phi   += dph;
      phi = Math.max(0.18, Math.min(Math.PI-0.18, phi));
      // velocidade instantânea (suavizada) para o "arremesso" ao soltar
      var nowT = performance.now();
      var dtv = Math.max(0.008, (nowT - (onPointerMove._t || nowT-16))/1000);
      onPointerMove._t = nowT;
      thetaVel = thetaVel*0.65 + (dth/dtv)*0.35;
      phiVel   = phiVel*0.65   + (dph/dtv)*0.35;
      // janela p/ estimar o fling no soltar por deslocamento acumulado:
      // robusto a stalls de frame (o estimador acima despenca se um único
      // intervalo entre eventos vier longo). Usa o timestamp do EVENTO:
      // reflete o ritmo real do gesto mesmo com a thread principal travada
      var evT = (e.timeStamp && e.timeStamp > 0) ? e.timeStamp : nowT;
      flingSamples.push({ t: evT, th: theta, ph: phi });
      if (flingSamples.length > 12) flingSamples.shift();
      lastInteraction = nowT;
    }
  }

  function endPointer(e){
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    hudDown = null; clearTimeout(hudTimer);
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch(_){}
    if (pointers.size === 1){
      var remaining = pointers.entries().next().value;
      rotId = remaining[0];
      rotLast = { x: remaining[1].x, y: remaining[1].y };
      pinchPrevDist = 0;
    } else if (pointers.size === 0){
      rotId = null; rotLast = null; pinchPrevDist = 0;
      // fling pela janela de deslocamento (~180ms): pega a amostra mais
      // antiga ainda recente e deriva a velocidade média — não depende do
      // espaçamento dos eventos individuais
      var nowE = performance.now();
      var nS = flingSamples.length;
      if (nS >= 2){
        var newest = flingSamples[nS-1];
        var pick = null;
        for (var fi = 0; fi < nS; fi++){
          if (nowE - flingSamples[fi].t <= 180){ pick = flingSamples[fi]; break; }
        }
        // eventos muito espaçados (máquina lenta/stall): a janela só contém
        // a última amostra (deslocamento zero) — usa a penúltima, que
        // carrega a última perna real do gesto
        if (pick === null || pick === newest) pick = flingSamples[nS-2];
        if (pick !== newest){
          var dtF = Math.max(0.016, (newest.t - pick.t)/1000);
          thetaVel = (newest.th - pick.th)/dtF;
          phiVel   = (newest.ph - pick.ph)/dtF;
        }
      }
      // com 0-1 amostras, fica o estimador suavizado do arraste
      flingSamples.length = 0;
    }
    lastInteraction = performance.now();
  }

  function onWheel(e){
    e.preventDefault();
    directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    targetCamDist += e.deltaY*0.0035*targetCamDist;
    targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
    lastInteraction = performance.now();
  }

  // ---- polimento AAA de controles ----
  // duplo clique / toque duplo: alterna entre enquadramento e close-up
  function toggleFrame(){
    var closeDist = Math.max(minDist*1.12, fitDist*0.42);
    targetCamDist = (targetCamDist > fitDist*0.72) ? closeDist : fitDist;
    lastInteraction = performance.now();
  }
  var lastTap = { t: -1e9, x: 0, y: 0 };
  function onTapCheck(e){
    if (e.pointerType !== 'touch') return;
    var now = performance.now();
    var dx = e.clientX - lastTap.x, dy = e.clientY - lastTap.y;
    if (now - lastTap.t < 320 && (dx*dx + dy*dy) < 32*32){
      toggleFrame();
      lastTap.t = -1e9;
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  // teclado: setas giram (com a mesma inércia do arraste), +/- aproxima,
  // R volta ao enquadramento — acessível sem mouse
  function onKeyDown(e){
    directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    var k = e.key;
    var handled = true;
    // passo imediato + impulso de inércia: responde já no keydown mesmo
    // se o próximo frame demorar (máquinas lentas), sem mudar o "feel"
    if (k === 'ArrowLeft')       { thetaVel += 2.0; theta += 0.08; }
    else if (k === 'ArrowRight') { thetaVel -= 2.0; theta -= 0.08; }
    else if (k === 'ArrowUp')    { phiVel   -= 1.5; phi = Math.max(0.18, phi - 0.06); }
    else if (k === 'ArrowDown')  { phiVel   += 1.5; phi = Math.min(Math.PI-0.18, phi + 0.06); }
    else if (k === '+' || k === '=') targetCamDist = Math.max(minDist, targetCamDist*0.82);
    else if (k === '-' || k === '_') targetCamDist = Math.min(maxDist, targetCamDist*1.22);
    else if (k === 'r' || k === 'R') targetCamDist = fitDist;
    else handled = false;
    if (handled){
      e.preventDefault();
      lastInteraction = performance.now();
    }
  }

  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', function(e){
    renderer.domElement.style.cursor = 'grabbing';
    onPointerDown(e);
    onTapCheck(e);
  });
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', function(e){
    renderer.domElement.style.cursor = 'grab';
    endPointer(e);
  });
  renderer.domElement.addEventListener('pointercancel', endPointer);
  renderer.domElement.addEventListener('lostpointercapture', endPointer);
  renderer.domElement.addEventListener('wheel', onWheel, {passive:false});
  renderer.domElement.addEventListener('dblclick', function(e){ e.preventDefault(); toggleFrame(); });
  renderer.domElement.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------
  // Instrumentação de performance: ring de ~4s de intervalos frame-a-
  // frame e de custo CPU do corpo do animate; draw calls acumulados
  // por FRAME (autoReset off + reset manual — com bloom/bake/sim o
  // frame tem vários render() e o autoReset só mostraria o último);
  // bakes/s numa janela de 5s. Toggles de subsistema para o profiler
  // medir custo por A/B sem recarregar.
  // ---------------------------------------------------------------
  renderer.info.autoReset = false;
  var perfFrameMs = new Float32Array(240);
  var perfBusyMs  = new Float32Array(240);
  var perfIdx = 0, perfN = 0, perfLastT = 0, perfCalls = 0;
  var perfBakes = [];
  var subToggle = { sim:true, bake:true, bloom:true, spicules:true,
                    corona:true, prominences:true, stars:true, loops:true,
                    corona3d:true,     // FASE 4: A/B do raymarch isolado
                    cme:true, cmepts:true };   // FASE 5: A/B da casca/partículas

  // HUD de perf on-device: ?hud=1 liga na carga; segurar um dedo PARADO
  // ~1s alterna (o arquivo aberto localmente no iPhone não tem como
  // receber query string nem abrir console — o gesto resolve os dois).
  var hudEl = document.createElement('div');
  hudEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:40;' +
    'font:11px/1.5 ui-monospace,Menlo,monospace;color:#aef;' +
    'background:rgba(0,10,20,0.55);padding:6px 9px;border-radius:8px;' +
    'pointer-events:none;white-space:pre;display:none';
  document.body.appendChild(hudEl);
  var hudOn = urlQ.hud === '1';
  if (hudOn) hudEl.style.display = 'block';
  var hudTimer = 0, hudDown = null, hudAccum = 0;
  function hudToggle(){ hudOn = !hudOn; hudEl.style.display = hudOn ? 'block' : 'none'; }

  // ---------------------------------------------------------------
  // T3.2: auto-tune em runtime. Trocar o TIER ao vivo exigiria
  // reconstruir shaders e render targets; o que é barato mudar é a
  // ESCALA de render (pixelRatio -> canvas + sceneRT + bloom; sim e
  // bake têm tamanho fixo e não mudam de cara). Então: p95 do frame
  // acima de 18ms desce a escala 1.0 -> 0.85 -> 0.7; p95 < 9ms
  // sustentado por 10s sobe de volta (histerese pelos degraus + janela
  // limpa a cada troca). Nos EXTREMOS, persiste uma recomendação de
  // tier no localStorage para a PRÓXIMA carga — assim um aparelho que
  // não segura nem 0.7 abre direto num tier menor, e um que sobra
  // fôlego por 30s no teto abre num maior.
  // ---------------------------------------------------------------
  var SCALE_STEPS = [1.0, 0.85, 0.7];
  var baseDpr = ctx.pixelRatio;
  var scaleIdx = 0, tuneWin = [], tuneGoodT = 0, tuneCooldown = 0, tuneEvents = 0;
  var autoTuneOn = (urlQ.tune === '1') ||
                   (!urlQ.tier && !(parseFloat(urlQ.scale) > 0) && !isSoftwareGL);
  function applyRenderScale(i){
    scaleIdx = Math.max(0, Math.min(SCALE_STEPS.length-1, i));
    ctx.pixelRatio = baseDpr * SCALE_STEPS[scaleIdx];
    renderer.setPixelRatio(ctx.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    tuneEvents++;
  }
  function persistTier(t){ try { localStorage.setItem('solTier', t); } catch(e){} }
  var TIER_ORDER = ['low', 'mid', 'high', 'ultra'];
  // Alvos por classe de aparelho: no desktop degrada acima de 18ms p95
  // (~55fps) como antes; no móvel o compromisso decidido é OUTRO — piso
  // de 24fps (42ms p95): o aparelho segura o tier/escala enquanto estiver
  // acima disso em vez de se rebaixar até o low para perseguir 60.
  var TUNE_HI = coarsePointer ? 42 : 18;
  var TUNE_LO = coarsePointer ? 21 : 9;
  function autoTune(delta, frameMs){
    // aba em background/stall: rAF é estrangulado a ~1fps e o p95 iria
    // rebaixar (e persistir!) um tier por culpa do navegador, não da GPU.
    // ?tune=1 (opt-in de QA) relaxa a guarda: sob SwiftShader TODO frame
    // passa de 250ms e o teste do auto-tune ficava inerte.
    if ((frameMs > 250 || document.hidden) && urlQ.tune !== '1') return;
    tuneWin.push(frameMs);
    if (tuneWin.length > 150) tuneWin.shift();
    tuneCooldown -= delta;
    if (tuneWin.length < 30 || tuneCooldown > 0) return;
    var a = tuneWin.slice().sort(function(x, y){ return x - y; });
    var p95 = a[Math.floor(a.length*0.95)];
    if (p95 > TUNE_HI){
      tuneGoodT = 0;
      if (scaleIdx < SCALE_STEPS.length-1){
        applyRenderScale(scaleIdx+1);
        tuneCooldown = 4; tuneWin.length = 0;
      } else {
        // FASE 5: primeiro degrau do kill — o CME (casca + partículas)
        // cai antes da coroa volumétrica: é efeito EPISÓDICO; se nem a
        // menor escala segura o frame durante uma erupção, a erupção
        // não pode afundar o tier inteiro.
        if (CME_STEPS > 0 && !cmeKilled && ctx.CME_K > 0.001){
          cmeKilled = true; tuneEvents++;
          tuneCooldown = 4; tuneWin.length = 0;
        } else
        // FASE 4: antes de rebaixar o tier persistido, derruba a coroa
        // volumétrica em runtime — se o aparelho não segura o raymarch
        // nem na menor escala, a coroa volta ao plano de gradiente
        // (fallback) e o resto do tier sobrevive. É o gate de código do
        // piso de 24fps: nenhuma medição é pedida ao dono.
        if (CVOL_STEPS > 0 && !cvolKilled && ctx.CVOL_K > 0.001){
          cvolKilled = true; tuneEvents++;
          tuneCooldown = 4; tuneWin.length = 0;
        } else {
          var k = TIER_ORDER.indexOf(TIER);
          if (k > 0){ persistTier(TIER_ORDER[k-1]); tuneCooldown = 1e9; }
        }
      }
    } else if (p95 < TUNE_LO){
      tuneGoodT += delta;
      if (scaleIdx > 0 && tuneGoodT > 10){
        applyRenderScale(scaleIdx-1);
        tuneGoodT = 0; tuneCooldown = 6; tuneWin.length = 0;
      } else if (scaleIdx === 0 && tuneGoodT > 30){
        var k2 = TIER_ORDER.indexOf(TIER);
        // ultra é só para ponteiro fino (desktop): DPR 3 + malha 192
        // afogariam um celular que por acaso sustente 60 no high
        var kMax = coarsePointer ? 2 : TIER_ORDER.length - 1;
        if (k2 < kMax && !urlQ.tier){ persistTier(TIER_ORDER[k2+1]); }
        tuneGoodT = -1e9;   // uma recomendação por sessão
      }
    } else tuneGoodT = 0;
  }

  // estado exposto para QA automatizado (leitura + posicionamento de câmera)
  try {
    if (window.__solInfo){
      window.__solInfo.perf = function(){
        function stats(buf, n){
          if (!n) return { avg: 0, p95: 0 };
          var a = Array.prototype.slice.call(buf, 0, n).sort(function(x,y){ return x-y; });
          var s = 0; for (var i=0;i<n;i++) s += a[i];
          return { avg: +(s/n).toFixed(2),
                   p95: +a[Math.min(n-1, Math.floor(n*0.95))].toFixed(2) };
        }
        var now = performance.now();
        while (perfBakes.length && now - perfBakes[0] > 5000) perfBakes.shift();
        var f = stats(perfFrameMs, perfN);
        return { tier: TIER, scale: RENDER_SCALE, dpr: ctx.pixelRatio,
                 autoScale: SCALE_STEPS[scaleIdx],
                 tune: { on: autoTuneOn, events: tuneEvents },
                 frames: perfN, ms: f, busy: stats(perfBusyMs, perfN),
                 fps: f.avg > 0 ? +(1000/f.avg).toFixed(1) : 0,
                 calls: perfCalls, bakesPerSec: +(perfBakes.length/5).toFixed(2),
                 toggles: JSON.parse(JSON.stringify(subToggle)),
                 size: [renderer.domElement.width, renderer.domElement.height] };
      };
      // painel de knobs ativos (introspecção p/ QA e usuário)
      window.__solInfo.knobs = function(){
        return { speed: ctx.TIME_SCALE, idle: ctx.IDLE_CINE,
                 bloom: compUniforms.uBloomStrength.value, bloomth: BLOOM_THRESHOLD,
                 exposure: compUniforms.uExposure.value, sat: compUniforms.uSat.value,
                 vig: compUniforms.uVig.value, grain: compUniforms.uGrain.value,
                 plageglow: sunUniforms.uPlageEm.value,
                 halo: coronaRaysUniforms.uHalo.value, ray: coronaRaysUniforms.uRayBoost.value,
                 cact: coronaRaysUniforms.uActGain.value,
                 mw: milkyWay.material.opacity, stars: stars.material.opacity,
                 veil: VEIL_BASE, streak: STREAK_K, adapt: ADAPT_K,
                 fringe: compUniforms.uFringe.value,
                 shimmer: compUniforms.uShimmer.value,
                 tone: compUniforms.uTone.value,
                 film: compUniforms.uFilm.value,
                 pmode: sunUniforms.uPmode.value,
                 hand: HAND_K,
                 loops: LOOP_K,
                 burst: BURST_K,
                 cycle: ctx.CYCLE_K,
                 lapse: ctx.LAPSE_K,
                 fprom: ctx.FPROM_K,
                 cvol: ctx.CVOL_K,
                 cme: ctx.CME_K,
                 dof: ctx.DOF_K,
                 director: ctx.DIRECTOR_ON,
                 adaptMul: compUniforms.uAdapt.value,
                 look: LOOK ? 'sunshine' : '' };
      };
      window.__solInfo.perfReset = function(){
        perfN = 0; perfIdx = 0; perfLastT = 0; perfBakes.length = 0;
      };
      // FASE 4: estado da coroa volumétrica (QA: tier-gate, bake, kill)
      window.__solInfo.coronaInfo = function(){
        return { steps: CVOL_STEPS, res: CVOL_N, k: ctx.CVOL_K,
                 on: CVOL_STEPS > 0 && ctx.CVOL_K > 0.001 && !cvolKilled &&
                     subToggle.corona && subToggle.corona3d,
                 ready: cvolReady, killed: cvolKilled, cycles: cvolCycles };
      };
      window.__solInfo.setCvol = function(v){
        ctx.CVOL_K = Math.min(1.5, Math.max(0, +v || 0));
        return ctx.CVOL_K;
      };
      // re-bake síncrono do volume (QA: sob ?hold o bake fatiado congela;
      // depois de setCyclePhase a captura precisa do volume da fase nova)
      window.__solInfo.rebakeCorona = function(){
        if (CVOL_STEPS > 0){ cvolBakeFull(); return true; }
        return false;
      };
      // eixos do sweep de calibração (painel de juízes) sem rebuild:
      // pesos do bake de densidade + contraste das raias procedurais
      window.__solInfo.setCvolShape = function(o){
        o = o || {};
        if (o.base  !== undefined) cvolWBase  = +o.base;
        if (o.sheet !== undefined) cvolWSheet = +o.sheet;
        if (o.loop  !== undefined) cvolWLoop  = +o.loop;
        if (o.hole  !== undefined) cvolWHole  = +o.hole;
        return { base: cvolWBase, sheet: cvolWSheet, loop: cvolWLoop, hole: cvolWHole };
      };
      window.__solInfo.setCvolFil = function(x){
        if (cvolUniforms) cvolUniforms.uFil.value = Math.min(2, Math.max(0, +x || 0));
        return cvolUniforms ? cvolUniforms.uFil.value : 0;
      };
      // liga/desliga um subsistema (A/B de custo); sem argumento inverte;
      // nome desconhecido devolve a lista de nomes válidos
      window.__solInfo.toggle = function(name, on){
        if (!(name in subToggle)) return Object.keys(subToggle);
        subToggle[name] = (on === undefined) ? !subToggle[name] : !!on;
        spiculeMesh.visible = subToggle.spicules;
        coronaRays.visible = coronaOuter.visible = subToggle.corona;
        prominenceGroup.visible = subToggle.prominences;
        stars.visible = brightStars.visible = milkyWay.visible = mwNeb.visible = subToggle.stars;
        return subToggle[name];
      };
      window.__solInfo.state = function(){
        return { camDist: camDist, targetCamDist: targetCamDist, theta: theta, phi: phi,
                 thetaVel: thetaVel, phiVel: phiVel,
                 rotY: sunMesh.rotation.y, fitDist: fitDist, minDist: minDist };
      };
      window.__solInfo.regions = function(){
        return pairStates.map(function(ps){
          return { lead: [ps.lead.x, ps.lead.y, ps.lead.z], w: ps.lead.w, baseQ: ps.baseQ,
                   // FASE 3: latitude do líder em graus (o raio das cargas
                   // é 0.88) e sinal de Hale — p/ o QA da borboleta
                   lat: Math.asin(Math.max(-1, Math.min(1, ps.lead.y/0.88)))*180/Math.PI,
                   pol: ps.polSign };
        });
      };
      // FASE 3 — QA do ciclo de 11 anos: fase/índice/sinais correntes...
      window.__solInfo.cycleInfo = function(){
        return { cycle: ctx.CYCLE_K, lapse: ctx.LAPSE_K, depth: cycleDepth(),
                 phase: ctx.cyclePhase01, n: ctx.cycleN, hale: ctx.cycleHale,
                 amp: ctx.cycleAmpK, pol: ctx.cyclePolF, polNorth: cyclePolarN.w,
                 warp: ctx.cycleWarp,
                 latC: 35 - 30*ctx.cyclePhase01, latW: 8 - 4*ctx.cyclePhase01 };
      };
      // ...e salto determinístico de fase (sob ?det&hold o tempo congela;
      // p em CICLOS — 1.3 = ciclo ímpar na fase 0.3, testa o flip de
      // Hale). reseed=true re-emerge os 4 pares JÁ na banda da fase nova
      // (fotografa a borboleta sem esperar renascimentos naturais).
      window.__solInfo.setCyclePhase = function(p, reseed){
        ctx.cycleTime = (p - CYCLE_PHASE0) * CYCLE_PERIOD;
        updateCycleState();
        if (reseed){
          for (var i = 0; i < pairStates.length; i++){
            pairStates[i].reborn = false;
            placePair(pairStates[i]);
          }
        }
        return window.__solInfo.cycleInfo();
      };
      window.__solInfo.prominences = function(){
        return prominenceMeshes.map(function(m){
          var d = m.userData.dir;
          return [d.x, d.y, d.z];
        });
      };
      // QA do ciclo de vida: ler fase (x em 0..1) e envelope de cada
      // proeminência, e SALTAR uma proeminência para um ponto do ciclo
      // (fotografar nascimento/maturidade/colapso sem esperar minutos)
      window.__solInfo.promLife = function(){
        return promStates.map(function(ps){
          var lx = ((elapsed + ps.phase) % ps.period) / ps.period;
          var d = ps.meshes[0].userData.dir;
          return { x: lx, env: lifeEnvelope(lx), dir: [d.x, d.y, d.z] };
        });
      };
      window.__solInfo.setPromLife = function(i, x){
        var ps = promStates[i];
        ps.phase = ((x*ps.period - elapsed) % ps.period + ps.period) % ps.period;
      };
      // QA: sob SwiftShader um screenshot leva 10-35s e o Sol giraria até
      // ~84° entre a mira e o frame capturado (a proeminência mirada some
      // p/ dentro do disco ou atrás do limbo). Congelar/ajustar a rotação
      // torna a captura determinística sem tocar no resto da animação.
      window.__solInfo.setRotSpeed = function(v){ ROT_SPEED = v; };
      // QA: posição de TELA da âncora da proeminência i (px) + fatores de
      // intensidade correntes dos dois cartões — tira a ambiguidade de
      // "qual mancha na foto é o alvo" nas sessões de órbita
      window.__solInfo.projectProm = function(i){
        var ps = promStates[i];
        var w = ps.meshes[0].userData.dir.clone()
          .applyQuaternion(prominenceGroup.quaternion).multiplyScalar(SUN_RADIUS);
        // matrizes frescas: sob SwiftShader (~1fps) a leitura logo após
        // setView pegava matrixWorldInverse do frame ANTERIOR
        camera.updateMatrixWorld(true);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        var v = w.project(camera);
        return { x: (v.x*0.5 + 0.5) * window.innerWidth,
                 y: (1.0 - (v.y*0.5 + 0.5)) * window.innerHeight,
                 inFront: v.z < 1.0,
                 env: ps.env, fieldK: ps.fieldK,
                 uInt: ps.meshes.map(function(m){ return m.material.uniforms.uIntensity.value; }) };
      };
      // QA (calibração): força do campo e fatores aplicados por proeminência
      window.__solInfo.promField = function(){
        return promStates.map(function(ps){
          return { Bm: bFieldJS(ps.meshes[0].userData.dir).length(),
                   fieldK: ps.fieldK, agit: ps.agit || 0 };
        });
      };
      // QA: fixa a agitação num valor (fotografia determinística — sob
      // SwiftShader o tempo simulado corre ~10-20x mais devagar e o
      // envelope natural nunca coincide com o instante do screenshot)
      window.__solInfo.holdPromAgit = function(i, v){
        promStates[i].agitHold = (v == null) ? null : v;
      };
      // QA: dispara um flare de superfície na âncora da proeminência i
      // (testa a interação flare->proeminência sem esperar o cooldown)
      window.__solInfo.forceFlareAt = function(i){
        surfFlareDir.copy(promStates[i].meshes[0].userData.dir).normalize();
        surfFlareT = 0;
        surfFlareAmp = 1.2;   // QA: o gatilho natural seta via |w|; o forçado usa amp fixa
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        return !!agitateNearestProm(surfFlareDir);
      };
      // QA FASE 1: flare no ponto MÉDIO do par i — o mesmo alvo do
      // gatilho natural (é onde a arcada fecha compacta; forceFlareAt
      // ancora em PIL de sol calmo, onde pode nem haver arcada)
      window.__solInfo.forceFlarePair = function(i){
        var ps = pairStates[i];
        surfFlareDir.set(
          (ps.lead.x + ps.foll.x)*0.5,
          (ps.lead.y + ps.foll.y)*0.5,
          (ps.lead.z + ps.foll.z)*0.5).normalize();
        surfFlareT = 0;
        surfFlareAmp = 1.2;
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        agitateNearestProm(surfFlareDir);
        return [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z];
      };
      // QA FASE 1: sob ?det&hold o tempo congela (delta=0) e surfFlareT
      // não avança — fixar o relógio do flare fotografa qualquer fase
      // (impulsiva/gradual) de forma determinística
      window.__solInfo.setFlareClock = function(t){ surfFlareT = t; };
      window.__solInfo.flareInfo = function(){
        return { t: surfFlareT, amp: surfFlareAmp,
                 imp: flareEnvImp(surfFlareT), grad: flareEnvGrad(surfFlareT),
                 sep: sunUniforms.uFlareGeo.value.w,
                 dir: [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z],
                 tan: [flareTanDir.x, flareTanDir.y, flareTanDir.z],
                 hdr: lastFlareHDR, burst: compUniforms.uBurst.value,
                 disp: DISP_K, hal: compUniforms.uHal.value };
      };
      // QA FASE 1: estado dos loops coronais (traçados, arcada viva,
      // custo acumulado do traçador) e salto de fase p/ fotografia
      window.__solInfo.loopInfo = function(){
        var nOk = 0, nArc = 0, i;
        for (i = 0; i < LOOP_AMB; i++) if (loopStatesA[i].ok) nOk++;
        for (i = 0; i < LOOP_ARC; i++) if (arcStates[i].ok && loopEnvArr[LOOP_AMB+i] > 0.004) nArc++;
        return { on: LOOP_K, amb: nOk, arc: nArc, queue: arcQueueN,
                 visible: loopMesh.visible,
                 abs: +lastArcAbsMax.toFixed(3),
                 absVisible: loopAbsMesh.visible,
                 traces: loopStats.traces, fails: loopStats.fails,
                 probes: loopStats.probes, probeRej: loopStats.probeRej,
                 ms: +loopStats.ms.toFixed(2) };
      };
      window.__solInfo.setLoopLife = function(i, x){
        var st = loopStatesA[i];
        if (st && st.ok) st.age = x*st.period;
      };
      // QA T1.1: modo/candidatos da última amostragem de PIL, leitura do
      // Br evoluído numa direção, e re-amostragem forçada de uma slot
      window.__solInfo.pilInfo = function(){
        return { mode: pilStats.mode, candidates: pilStats.candidates };
      };
      window.__solInfo.brEvAt = function(dx, dy, dz){
        refreshPILBuffer();
        var lon = Math.atan2(dz, dx); if (lon < 0) lon += Math.PI*2;
        var lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        var x = Math.floor(lon/(Math.PI*2)*PIL_W);
        var y = Math.floor((lat/Math.PI + 0.5)*PIL_H);
        return { br: pilBrAt(x, y),
                 crossLon: pilBrAt(x-2, y)*pilBrAt(x+2, y) < 0.0,
                 crossLat: pilBrAt(x, y-2)*pilBrAt(x, y+2) < 0.0 };
      };
      // FASE 3 — QA da continuidade filamento↔proeminência: estado dos
      // gêmeos de absorção (visibilidade, força, identidade de seed)
      window.__solInfo.fpromInfo = function(){
        camera.updateMatrixWorld(true);
        var cd = camera.position.clone().normalize();
        return promStates.map(function(ps){
          var facing = ps.flat.userData.dir.clone()
            .applyQuaternion(prominenceGroup.quaternion).dot(cd);
          return { vis: ps.flat.visible,
                   absorb: ps.flat.material.uniforms.uAbsorb.value,
                   facing: facing,
                   seedMatch: ps.flat.material.uniforms.uSeed.value ===
                              ps.meshes[0].material.uniforms.uSeed.value,
                   env: ps.env };
        });
      };
      window.__solInfo.resampleProm = function(i){
        var a = sampleProminenceAnchor();
        placeProminence(promStates[i], a);
        return { dir: [a.x, a.y, a.z], mode: pilStats.mode,
                 candidates: pilStats.candidates, aligned: !!a.pilTangent };
      };
      window.__solInfo.setView = function(th, ph, dist){
        theta = th; phi = Math.max(0.18, Math.min(Math.PI-0.18, ph));
        targetCamDist = camDist = Math.max(minDist, Math.min(maxDist, dist));
        thetaVel = 0; phiVel = 0;
        lastInteraction = performance.now();
        updateCamera();
      };
      // FASE 5 — QA do CME: força a erupção no par i (flare grande +
      // casca, sem o sorteio de probabilidade), fixa o relógio para
      // fotografar qualquer fase, e lê o estado inteiro
      window.__solInfo.forceCME = function(i){
        var ps = pairStates[(i || 0) % pairStates.length];
        surfFlareDir.set(
          (ps.lead.x + ps.foll.x)*0.5,
          (ps.lead.y + ps.foll.y)*0.5,
          (ps.lead.z + ps.foll.z)*0.5).normalize();
        surfFlareT = 0;
        surfFlareAmp = 1.35;
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        agitateNearestProm(surfFlareDir);
        if (CME_STEPS <= 0) return false;
        launchCME(1.35);
        return [cmeDir.x, cmeDir.y, cmeDir.z];
      };
      window.__solInfo.setCmeClock = function(t){
        if (cmeT >= 900) return false;
        cmeT = Math.max(0, +t || 0);
        cmeGeomAt(cmeT);
        return true;
      };
      // eixos do sweep de calibração (painel de juízes) sem rebuild:
      // knob ao vivo + ganho do núcleo denso da casca
      window.__solInfo.setCme = function(v){
        ctx.CME_K = Math.min(1.5, Math.max(0, +v || 0));
        return ctx.CME_K;
      };
      window.__solInfo.setCmeCore = function(x){
        cmeCoreGain = Math.min(2.5, Math.max(0, +x || 0));
        return cmeCoreGain;
      };
      window.__solInfo.cmeInfo = function(){
        var g = cmeGeomAt(cmeT < 900 ? cmeT : 0);
        return { on: cmeT < 900, t: cmeT < 900 ? cmeT : -1, amp: cmeAmp,
                 count: cmeCount, steps: CME_STEPS, killed: cmeKilled,
                 knob: ctx.CME_K, cooldown: +cmeCooldown.toFixed(2),
                 front: +g.front.toFixed(3), rho: +g.rho.toFixed(3),
                 cx: +g.cx.toFixed(3), env: +g.env.toFixed(3),
                 hdr: +lastCmeHDR.toFixed(3),
                 dir: [cmeDir.x, cmeDir.y, cmeDir.z],
                 pts: { on: cmePts.on, n: CME_PTS_N,
                        visible: cmePts.on ? (cmePts.meshes[0].visible || cmePts.meshes[1].visible) : false } };
      };
      // FASE 5 — QA do foco raso: override do plano de foco (0 centro,
      // 1 limbo; -1 volta ao automático) + estado corrente
      window.__solInfo.setDofFocus = function(x){
        dofFocusOverride = (x === undefined || x < 0) ? -1 : Math.min(1.5, +x);
        // snap imediato (QA sob ?hold: rawDelta=0 congela o lerp do
        // focus pull; ao vivo o diretor puxa suave pelo lerp)
        if (dofFocusOverride >= 0) dofFocusCur = dofFocusOverride;
        return dofFocusOverride;
      };
      window.__solInfo.dofInfo = function(){
        return { knob: ctx.DOF_K, amt: compUniforms.uDof.value,
                 focus: compUniforms.uDofFocus.value,
                 override: dofFocusOverride };
      };
      // FASE 5 — modo diretor por HOOK (o mesmo caminho do botão do
      // painel: liga em runtime, sem URL, com empréstimo de knobs)
      window.__solInfo.directorStart = function(){
        directorStart();
        return window.__solInfo.directorInfo();
      };
      // FASE 5 — QA do modo diretor: salto de relógio (fotografar um
      // beat sem esperar a sequência; os beats disparam na entrada)
      window.__solInfo.directorSkip = function(t){
        if (!ctx.DIRECTOR_ON) return false;
        if (dirT <= -900) return false;
        dirT = Math.max(0, +t || 0);
        return dirT;
      };
      // FASE 5 — QA do modo diretor: relógio/beat correntes
      window.__solInfo.directorInfo = function(){
        var beat = -1, t = dirT;
        if (ctx.DIRECTOR_ON && t >= 0){
          beat = t < 10 ? 0 : t < 22 ? 1 : t < 30 ? 2 : t < 48 ? 3 :
                 t < 64 ? 4 : t < 78 ? 5 : 6;
        }
        return { enabled: ctx.DIRECTOR_ON, active: directorActive(),
                 t: +Math.max(-1, t).toFixed(2), beat: beat, pair: dirPair,
                 flareFired: dirFlareFired, cmeFired: dirCmeFired };
      };
    }
  } catch(_){}


  // ---------------------------------------------------------------
  // PAINEL DE AJUSTES (drawer): sliders para os knobs cinematográficos,
  // com persistência em localStorage — no iPhone via arquivo local não
  // há query string, então o painel é o caminho principal de ajuste.
  // Prioridade: URL > painel salvo > default. Design: vidro fosco com
  // acento solar, coerente com a estética da cena.
  // ---------------------------------------------------------------
  (function buildKnobPanel(){
    var css = document.createElement('style');
    css.textContent = [
      '#knobBtn{position:fixed;right:14px;bottom:14px;z-index:45;width:44px;height:44px;',
      ' border-radius:50%;border:1px solid rgba(255,170,90,.28);color:#ffb877;font-size:18px;',
      ' background:rgba(12,16,26,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      ' display:flex;align-items:center;justify-content:center;cursor:pointer;',
      ' transition:transform .5s cubic-bezier(.22,1,.36,1),background .3s;user-select:none;-webkit-user-select:none}',
      '#knobBtn:hover{background:rgba(40,28,16,.72)}',
      '#hint{margin-right:64px}',
      '#knobBtn.open{transform:rotate(120deg)}',
      '#knobPanel{position:fixed;top:0;right:0;height:100%;width:min(330px,86vw);z-index:44;',
      ' background:linear-gradient(165deg,rgba(15,18,28,.82),rgba(7,9,15,.90));',
      ' backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25);',
      ' border-left:1px solid rgba(255,165,80,.14);box-shadow:-28px 0 70px rgba(0,0,0,.5);',
      ' transform:translateX(106%);transition:transform .55s cubic-bezier(.22,1,.36,1);',
      ' overflow-y:auto;overscroll-behavior:contain;padding:24px 22px 96px;box-sizing:border-box;',
      ' color:#e9e4da;touch-action:pan-y;font-family:inherit}',
      '#knobPanel.open{transform:translateX(0)}',
      '#knobPanel h2{margin:0 0 2px;font-size:15px;font-weight:600;letter-spacing:.04em;color:#ffd9a8}',
      '#knobPanel .sub{font-size:10.5px;color:rgba(233,228,218,.42);margin:0 0 14px}',
      '#knobPanel .sec{margin:20px 0 6px;font-size:9.5px;font-weight:600;letter-spacing:.22em;',
      ' text-transform:uppercase;color:rgba(255,160,80,.55)}',
      '#knobPanel .row{margin:10px 0 2px}',
      '#knobPanel .lab{display:flex;justify-content:space-between;font-size:12px;color:rgba(233,228,218,.85)}',
      '#knobPanel .val{font-variant-numeric:tabular-nums;color:rgba(255,190,130,.9);font-size:11.5px}',
      'input[type=range].kn{-webkit-appearance:none;appearance:none;width:100%;height:24px;',
      ' background:transparent;margin:0;display:block}',
      'input[type=range].kn::-webkit-slider-runnable-track{height:3px;border-radius:2px;',
      ' background:linear-gradient(90deg,#ff9a3c var(--f,50%),rgba(255,255,255,.13) var(--f,50%))}',
      'input[type=range].kn::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;',
      ' border-radius:50%;margin-top:-6px;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);',
      ' box-shadow:0 0 10px rgba(255,140,50,.55),0 1px 3px rgba(0,0,0,.6)}',
      'input[type=range].kn::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.13)}',
      'input[type=range].kn::-moz-range-progress{height:3px;border-radius:2px;background:#ff9a3c}',
      'input[type=range].kn::-moz-range-thumb{width:15px;height:15px;border-radius:50%;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);box-shadow:0 0 10px rgba(255,140,50,.55)}',
      '#knobPanel .switch{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}',
      '#knobPanel .sw{position:relative;width:40px;height:22px;border-radius:12px;cursor:pointer;',
      ' background:rgba(255,255,255,.14);transition:background .25s}',
      '#knobPanel .sw.on{background:rgba(255,140,50,.75)}',
      '#knobPanel .sw::after{content:"";position:absolute;top:2.5px;left:3px;width:17px;height:17px;',
      ' border-radius:50%;background:#f5efe6;transition:transform .25s cubic-bezier(.22,1,.36,1);',
      ' box-shadow:0 1px 3px rgba(0,0,0,.4)}',
      '#knobPanel .sw.on::after{transform:translateX(17px)}',
      '#knobReset{margin-top:22px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.3);background:transparent;color:#ffb877;font-size:12px;',
      ' letter-spacing:.05em;transition:background .25s}',
      '#knobReset:hover{background:rgba(255,140,50,.12)}',
      // botão do preset (mesma linguagem do reset, cheio de laranja)
      '#lookBtn,#dirBtn{margin-top:14px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.45);background:rgba(255,140,50,.16);color:#ffd9a8;',
      ' font-size:12px;letter-spacing:.05em;transition:background .25s}',
      '#lookBtn:hover,#dirBtn:hover{background:rgba(255,140,50,.28)}',
      '#dirBtn{margin-top:8px}',
      // seletor segmentado de tier (troca exige recarregar — decisão de boot)
      '#tierRow{display:flex;gap:6px;margin:8px 0 2px}',
      '#tierRow button{flex:1;padding:7px 0;border-radius:8px;cursor:pointer;font-size:11px;',
      ' border:1px solid rgba(255,170,90,.25);background:transparent;color:rgba(233,228,218,.75);',
      ' letter-spacing:.04em;transition:background .25s}',
      '#tierRow button.cur{background:rgba(255,140,50,.30);color:#ffd9a8;border-color:rgba(255,170,90,.55)}',
      '#tierNote{font-size:10px;color:rgba(233,228,218,.38);margin:4px 0 0}'
    ].join('\n');
    document.head.appendChild(css);

    function saveKnob(k, v){
      try {
        ctx.savedKnobs[k] = v;
        localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs));
      } catch(e){}
    }
    var DEFS = [
      { sec: 'tempo' },
      { k:'speed', label:'Ritmo do tempo', lo:0.05, hi:2, step:0.05, dflt:1,
        get:function(){ return ctx.TIME_SCALE; }, set:function(v){ ctx.TIME_SCALE = v; } },
      { k:'pmode', label:'Oscilações (p-modes)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return sunUniforms.uPmode.value; },
        set:function(v){ sunUniforms.uPmode.value = v; } },
      { k:'cycle', label:'Ciclo de 11 anos', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CYCLE_K; }, set:function(v){ ctx.CYCLE_K = v; } },
      { k:'lapse', label:'Time-lapse do ciclo', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.LAPSE_K; }, set:function(v){ ctx.LAPSE_K = v; } },
      { sec: 'luz & cor' },
      { k:'bloom', label:'Bloom', lo:0, hi:2.5, step:0.05, dflt:1,
        get:function(){ return BLOOM_STRENGTH_BASE/BLOOM_BASE0; },
        set:function(v){ BLOOM_STRENGTH_BASE = BLOOM_BASE0*v; } },
      { k:'exposure', label:'Exposição', lo:0.5, hi:1.8, step:0.02, dflt:1,
        get:function(){ return compUniforms.uExposure.value/EXP0; },
        set:function(v){ compUniforms.uExposure.value = EXP0*v; } },
      { k:'plageglow', label:'Brilho das plages', lo:0, hi:1.2, step:0.05, dflt:0.35,
        get:function(){ return sunUniforms.uPlageEm.value; },
        set:function(v){ sunUniforms.uPlageEm.value = v; } },
      { k:'sat', label:'Saturação', lo:0, hi:1.6, step:0.05, dflt:1,
        get:function(){ return compUniforms.uSat.value; },
        set:function(v){ compUniforms.uSat.value = v; } },
      { k:'vig', label:'Vinheta', lo:0, hi:1.2, step:0.05, dflt:0.55,
        get:function(){ return compUniforms.uVig.value; },
        set:function(v){ compUniforms.uVig.value = v; } },
      { k:'grain', label:'Grão de filme', lo:0, hi:4, step:0.1, dflt:1,
        get:function(){ return compUniforms.uGrain.value; },
        set:function(v){ compUniforms.uGrain.value = v; } },
      { sec: 'cinema' },
      { k:'veil', label:'Halação (glare)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return VEIL_BASE; }, set:function(v){ VEIL_BASE = v; } },
      { k:'streak', label:'Flare anamórfico', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return STREAK_K; }, set:function(v){ STREAK_K = v; } },
      { k:'burst', label:'Starburst (difração)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return BURST_K; }, set:function(v){ BURST_K = v; } },
      { k:'disp', label:'Bloom espectral (dispersão)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return DISP_K; }, set:function(v){ DISP_K = v; } },
      { k:'hal', label:'Halação quente (corpo negro)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return HAL_K; }, set:function(v){ HAL_K = v; } },
      { k:'adapt', label:'Olho (adaptação)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return ADAPT_K; }, set:function(v){ ADAPT_K = v; } },
      { k:'fringe', label:'Franja da lente', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFringe.value; },
        set:function(v){ compUniforms.uFringe.value = v; } },
      { k:'shimmer', label:'Calor no limbo', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uShimmer.value; },
        set:function(v){ compUniforms.uShimmer.value = v; } },
      { k:'tone', label:'Grade Sunshine', lo:0, hi:1.2, step:0.05, dflt:0,
        get:function(){ return compUniforms.uTone.value; },
        set:function(v){ compUniforms.uTone.value = v; } },
      { k:'film', label:'Filme (ACES→AgX)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFilm.value; },
        set:function(v){ compUniforms.uFilm.value = v; } },
      { k:'hand', label:'Câmera de mão', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return HAND_K; }, set:function(v){ HAND_K = v; } },
      { k:'dof', label:'Foco raso (bokeh hex)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.DOF_K; }, set:function(v){ ctx.DOF_K = v; } },
      { sec: 'coroa' },
      { k:'halo', label:'Halo coronal', lo:0, hi:1.6, step:0.05, dflt:0.55,
        get:function(){ return coronaRaysUniforms.uHalo.value; },
        set:function(v){ coronaRaysUniforms.uHalo.value = v; } },
      { k:'ray', label:'Streamers', lo:0, hi:2.5, step:0.05, dflt:0.9,
        get:function(){ return coronaRaysUniforms.uRayBoost.value; },
        set:function(v){ coronaRaysUniforms.uRayBoost.value = v; } },
      { k:'cact', label:'Resposta à atividade', lo:0, hi:1.5, step:0.05, dflt:0.5,
        get:function(){ return coronaRaysUniforms.uActGain.value; },
        set:function(v){ coronaRaysUniforms.uActGain.value = v; } },
      { k:'cvol', label:'Coroa volumétrica (raymarch)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CVOL_K; }, set:function(v){ ctx.CVOL_K = v; } },
      { k:'cme', label:'CME (erupção)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CME_K; }, set:function(v){ ctx.CME_K = v; } },
      { k:'loops', label:'Loops coronais', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return LOOP_K; }, set:function(v){ LOOP_K = v; } },
      { k:'fprom', label:'Filamento ↔ proeminência', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.FPROM_K; }, set:function(v){ ctx.FPROM_K = v; } },
      { sec: 'céu' },
      { k:'stars', label:'Estrelas', lo:0, hi:2, step:0.05, dflt:1,
        get:function(){ return stars.material.opacity/STARS_OP0; },
        set:function(v){ stars.material.opacity = Math.min(1, STARS_OP0*v);
                         brightStars.material.opacity = Math.min(1, BRIGHT_OP0*v); } },
      { k:'mw', label:'Via Láctea', lo:0, hi:1, step:0.02, dflt:0.62,
        get:function(){ return milkyWay.material.opacity; },
        set:function(v){ milkyWay.material.opacity = v; mwNebUniforms.uMW.value = v; } },
      { sec: 'câmera' }
    ];

    var panel = document.createElement('div');
    panel.id = 'knobPanel';
    var head = document.createElement('h2'); head.textContent = 'Ajustes';
    var sub = document.createElement('p'); sub.className = 'sub';
    sub.textContent = 'cena, luz e câmera · salvo neste aparelho';
    panel.appendChild(head); panel.appendChild(sub);

    var sliders = [];
    DEFS.forEach(function(d){
      if (d.sec){
        var s = document.createElement('div'); s.className = 'sec';
        s.textContent = d.sec; panel.appendChild(s); return;
      }
      var row = document.createElement('div'); row.className = 'row';
      var lab = document.createElement('div'); lab.className = 'lab';
      var name = document.createElement('span'); name.textContent = d.label;
      var val = document.createElement('span'); val.className = 'val';
      lab.appendChild(name); lab.appendChild(val);
      var inp = document.createElement('input');
      inp.type = 'range'; inp.className = 'kn';
      inp.min = d.lo; inp.max = d.hi; inp.step = d.step;
      function paint(v){
        val.textContent = (+v).toFixed(2);
        inp.style.setProperty('--f', (100*(v - d.lo)/(d.hi - d.lo)) + '%');
      }
      inp.value = d.get(); paint(inp.value);
      inp.addEventListener('input', function(){
        var v = parseFloat(inp.value);
        d.set(v); paint(v); saveKnob(d.k, v);
      });
      row.appendChild(lab); row.appendChild(inp);
      panel.appendChild(row);
      sliders.push({ d: d, inp: inp, paint: paint });
    });

    // switch da câmera idle cinematográfica
    var swRow = document.createElement('div'); swRow.className = 'switch';
    var swLab = document.createElement('span'); swLab.textContent = 'Câmera contemplativa';
    var sw = document.createElement('div'); sw.className = 'sw' + (ctx.IDLE_CINE ? ' on' : '');
    sw.addEventListener('click', function(){
      ctx.IDLE_CINE = !ctx.IDLE_CINE;
      sw.classList.toggle('on', ctx.IDLE_CINE);
      saveKnob('idle', ctx.IDLE_CINE ? 1 : 0);
    });
    swRow.appendChild(swLab); swRow.appendChild(sw);
    panel.appendChild(swRow);

    // ---- look ----------------------------------------------------
    // aplica o preset Sunshine AO VIVO pelos setters dos sliders (os
    // mesmos 14 pares do ?look=sunshine) — pedido do dono: nada de URL
    var secLook = document.createElement('div'); secLook.className = 'sec';
    secLook.textContent = 'look'; panel.appendChild(secLook);
    var lookBtn = document.createElement('button');
    lookBtn.id = 'lookBtn'; lookBtn.textContent = 'aplicar look Sunshine';
    lookBtn.addEventListener('click', function(){
      sliders.forEach(function(s){
        var v = LOOK_SUNSHINE[s.d.k];
        if (v === undefined) return;
        s.d.set(v); s.inp.value = v; s.paint(v); saveKnob(s.d.k, v);
      });
    });
    panel.appendChild(lookBtn);
    // FASE 5 — modo diretor SEM URL: a sequência-atração é controle
    // in-app como tudo o mais. O botão fecha o painel e entrega a
    // câmera ao diretor; qualquer arrasto/scroll/tecla devolve o
    // controle (e restaura os knobs emprestados).
    var dirBtn = document.createElement('button');
    dirBtn.id = 'dirBtn';
    dirBtn.textContent = '▶ modo diretor (sequência)';
    dirBtn.addEventListener('click', function(){
      directorStart();
      panel.classList.remove('open');
      btn.classList.remove('open');
    });
    panel.appendChild(dirBtn);

    // ---- diagnóstico ----------------------------------------------
    var secDiag = document.createElement('div'); secDiag.className = 'sec';
    secDiag.textContent = 'diagnóstico'; panel.appendChild(secDiag);
    var hudRow = document.createElement('div'); hudRow.className = 'switch';
    var hudLab = document.createElement('span'); hudLab.textContent = 'HUD de FPS';
    var hudSw = document.createElement('div'); hudSw.className = 'sw' + (hudOn ? ' on' : '');
    hudSw.addEventListener('click', function(){
      hudToggle();
      hudSw.classList.toggle('on', hudOn);
    });
    hudRow.appendChild(hudLab); hudRow.appendChild(hudSw);
    panel.appendChild(hudRow);

    // ---- qualidade (tier) ------------------------------------------
    // o tier dimensiona buffers/shaders no BOOT — trocar recarrega a
    // página; a escolha persiste em localStorage (solTier) e o botão
    // limpa qualquer ?tier= da URL para a persistência valer
    var secTier = document.createElement('div'); secTier.className = 'sec';
    secTier.textContent = 'qualidade'; panel.appendChild(secTier);
    var tierRow = document.createElement('div'); tierRow.id = 'tierRow';
    TIER_ORDER.forEach(function(t){
      var tb = document.createElement('button');
      tb.textContent = t;
      if (t === TIER) tb.className = 'cur';
      tb.addEventListener('click', function(){
        if (t === TIER) return;
        persistTier(t);
        var q = (location.search || '').replace(/^\?/, '').split('&')
          .filter(function(kv){ return kv && kv.indexOf('tier=') !== 0; }).join('&');
        location.href = location.pathname + (q ? '?' + q : '');
      });
      tierRow.appendChild(tb);
    });
    panel.appendChild(tierRow);
    var tierNote = document.createElement('p'); tierNote.id = 'tierNote';
    tierNote.textContent = 'trocar a qualidade recarrega a cena';
    panel.appendChild(tierNote);

    var reset = document.createElement('button');
    reset.id = 'knobReset'; reset.textContent = 'restaurar padrão';
    reset.addEventListener('click', function(){
      try { localStorage.removeItem('solKnobs'); } catch(e){}
      ctx.savedKnobs = {};
      sliders.forEach(function(s){ s.d.set(s.d.dflt); s.inp.value = s.d.dflt; s.paint(s.d.dflt); });
      if (ctx.IDLE_CINE){ ctx.IDLE_CINE = false; sw.classList.remove('on'); }
    });
    panel.appendChild(reset);
    document.body.appendChild(panel);

    var btn = document.createElement('div');
    btn.id = 'knobBtn'; btn.title = 'ajustes';
    btn.textContent = '⚙';
    btn.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      // o ⚙ acompanha a borda do painel (não flutua sobre os controles)
      // e o HUD desliza para fora da área coberta — quem mexe em knobs
      // de custo é exatamente quem quer ver o fps
      var edge = 'calc(min(330px, 86vw) + 14px)';
      btn.style.right = open ? edge : '14px';
      hudEl.style.right = open ? 'calc(min(330px, 86vw) + 18px)' : '10px';
    });
    btn.style.transition += ', right .55s cubic-bezier(.22,1,.36,1)';
    hudEl.style.transition = 'right .55s cubic-bezier(.22,1,.36,1)';
    document.body.appendChild(btn);
  })();

  function onResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    var newFit = computeFitDist();
    if (fitDist > 0){ camDist *= newFit / fitDist; targetCamDist *= newFit / fitDist; }
    fitDist = newFit;
    camDist = Math.max(minDist, Math.min(maxDist, camDist));
    targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
  }
  window.addEventListener('resize', onResize);

  resizeTargets();
  updateCamera();

  // ---------------------------------------------------------------
  // Loop de animação
  // ---------------------------------------------------------------
  var clock = new THREE.Clock();
  var elapsed = 0;
  var simAccum = 0;
  var chromoAccum = 0;
  // temporários do frame (reutilizados: nada de alocação por frame)
  var camDirN = new THREE.Vector3();
  var promNormal = new THREE.Vector3();
  var promWorldTmp = new THREE.Vector3();
  var camRightTmp = new THREE.Vector3();
  var camUpTmp = new THREE.Vector3();
  var SIM_STEP_INTERVAL = TP.simStep;
  // MACRO_SLOW (bug report do dono pós-LOOP-7): a macro-evolução — a
  // FORMA do campo de filamentos (fluxo advectado, canal G) e a
  // turbulência de larga escala — reorganizava-se em ~1-2s, uma
  // "gelatina" em frequência própria destoando da rotação majestosa
  // (filamentos reais vivem dias). 0.15 = sweep perceptual A/B/C:
  // forma estável em ~4s, deriva/cisalhamento em ~15s, reorganização
  // em ~30s. A vida FINA (fervura, fibrilas, plage, espículas,
  // flares, breathing) NÃO é escalada — segue no ritmo atual.
  var MACRO_SLOW = 0.15;
  ctx.MACRO_SLOW = MACRO_SLOW;
  var SIM_DT = 0.6*MACRO_SLOW;
  var ROT_SPEED = 0.042;

  // FASE 1 — envelope de DUAS FASES (pendência do audit-loop6, ref-08):
  //  - IMPULSIVA: o flash da reconexão no topo do laço — sobe em ~0.25s
  //    e morre em ~2s (era o único envelope antes);
  //  - GRADUAL: fitas + arcada pós-flare — sobe em ~2s e decai com
  //    τ≈6s, o rescaldo que flares reais mostram em H-alfa por minutos.
  function flareEnvImp(ft){
    return (1.0 - Math.exp(-ft*10.0)) * Math.exp(-ft*1.6);
  }
  function flareEnvGrad(ft){
    return ft <= 0 ? 0 : (1.0 - Math.exp(-ft*1.4)) * Math.exp(-ft*0.16);
  }
  // flare de SUPERFÍCIE: laço brilhante na plage de uma região madura
  var surfFlareT = 999;
  var surfFlareAmp = 1.0;
  var surfFlareCooldown = 8 + srand()*10;
  var surfFlareDir = new THREE.Vector3(0, 0, 1);
  // moldura da PIL no ponto do flare: na linha neutra o campo
  // HORIZONTAL aponta ATRAVÉS dela (da polaridade + para a −) — o
  // "perp" sai direto do próprio campo de cargas e a tangente fecha o
  // triedro. Vale para o gatilho natural E para o forceFlareAt de QA.
  var flareTanDir = new THREE.Vector3(1, 0, 0);
  var flarePerpDir = new THREE.Vector3(0, 0, 1);
  var flareSeedVal = 0;
  var flareBtmp = new THREE.Vector3();
  function setFlareFrame(dir){
    var B = bFieldJS(dir);
    flareBtmp.copy(B).addScaledVector(dir, -B.dot(dir));
    if (flareBtmp.lengthSq() < 1e-8){
      // campo degenerado: qualquer perpendicular estável serve
      flareBtmp.set(-dir.y, dir.x, 0);
      if (flareBtmp.lengthSq() < 1e-8) flareBtmp.set(0, -dir.z, dir.y);
    }
    flarePerpDir.copy(flareBtmp).normalize();
    flareTanDir.crossVectors(dir, flarePerpDir).normalize();
    flareSeedVal = loopRand()*100.0;   // recorte das fitas muda por evento
  }
  // flare <-> proeminência: a reconexão que ilumina a superfície também
  // injeta energia no plasma suspenso — o flare AGITA/ERGUE a proeminência
  // madura ancorada mais perto (< ~60°); as outras não sentem nada
  function agitateNearestProm(dir){
    var bestPs = null, bestDot = 0.5;
    promStates.forEach(function(pp){
      if ((pp.env || 0) < 0.35) return;   // jovem/moribunda não responde
      var d = pp.meshes[0].userData.dir.dot(dir);
      if (d > bestDot){ bestDot = d; bestPs = pp; }
    });
    if (bestPs) bestPs.agitT = 0;
    return bestPs;
  }
  function triggerSurfaceFlare(){
    var live = pairStates.filter(function(ps){ return Math.abs(ps.lead.w) > Math.abs(ps.baseQ)*0.6; });
    if (!live.length) return false;
    var ps = live[Math.floor(srand()*live.length)];
    // ponto entre o par (onde os laços de flare reais acontecem), com jitter
    surfFlareDir.set(
      (ps.lead.x + ps.foll.x)*0.5 + (srand()-0.5)*0.06,
      (ps.lead.y + ps.foll.y)*0.5 + (srand()-0.5)*0.06,
      (ps.lead.z + ps.foll.z)*0.5 + (srand()-0.5)*0.06
    ).normalize();
    // amplitude ∝ |w| da região que flareia (X-class só em região forte)
    surfFlareAmp = Math.min(1.5, 0.55 + 0.55*Math.abs(ps.lead.w));
    setFlareFrame(surfFlareDir);   // moldura das fitas na PIL local
    scheduleFlareArcade();         // arcada re-semeada para ESTE evento
    agitateNearestProm(surfFlareDir);
    return true;
  }

  if (hintEl) {
    hintEl.textContent = hasTouch
      ? 'arraste para girar · pince aproxima · toque duplo enquadra'
      : 'arraste para girar · scroll aproxima · duplo clique enquadra';
  }
  setTimeout(function(){ if(hintEl) hintEl.style.opacity='0'; }, 6000);

  // ---------------------------------------------------------------
  // FASE 5 — MODO DIRETOR (?director=1): sequência-atração
  // determinística que amarra as 5 fases — plano geral, push-in com
  // foco raso na região ativa (tracking da rotação real), recuo ao
  // limbo, flare grande + CME com rescaldo, retirada wide e time-lapse
  // documental do ciclo — tudo POR CIMA dos mesmos knobs/estados dos
  // hooks (nenhum caminho novo de render). Qualquer input do usuário
  // (arrastar/scroll/tecla) devolve o controle e restaura os knobs que
  // o diretor moveu. Sem ?director=1 nada daqui roda.
  // ---------------------------------------------------------------
  var dirT = -1;
  var dirPair = 0;
  var dirFlareFired = false, dirCmeFired = false;
  var dirSavedLapse = 0;
  var dirSavedCme = -1, dirSavedDof = -1;   // -1 = nada a restaurar
  var dirWorldTmp = new THREE.Vector3();
  var dirAng = { th: 0, ph: 0 };
  function directorActive(){ return ctx.DIRECTOR_ON && dirT >= 0; }
  function directorUserExit(){
    if (!directorActive()) return;
    dirT = -999;   // permanente: o usuário assumiu a câmera
    ctx.LAPSE_K = dirSavedLapse;
    dofFocusOverride = -1;
    // devolve os knobs que o diretor emprestou para a vitrine
    if (dirSavedCme >= 0){ ctx.CME_K = dirSavedCme; dirSavedCme = -1; }
    if (dirSavedDof >= 0){ ctx.DOF_K = dirSavedDof; dirSavedDof = -1; }
  }
  // início pelo PAINEL (a sequência não pode depender de URL): liga o
  // modo em runtime e garante os knobs mínimos da vitrine — CME e foco
  // raso no valor do preset se estiverem abaixo dele (restaurados na
  // saída). Quem já tem os knobs altos não é tocado.
  function directorStart(){
    ctx.DIRECTOR_ON = true;
    dirT = -1;
    dirFlareFired = false; dirCmeFired = false;
    if (CME_STEPS > 0 && ctx.CME_K < 0.85){ dirSavedCme = ctx.CME_K; ctx.CME_K = 0.9; }
    if (ctx.DOF_K < 0.5){ dirSavedDof = ctx.DOF_K; ctx.DOF_K = 0.5; }
  }
  function dirEase(x){ x = Math.max(0, Math.min(1, x)); return x*x*(3 - 2*x); }
  function dirAimAt(w){
    dirAng.ph = Math.acos(Math.max(-1, Math.min(1, w.y)));
    dirAng.th = Math.atan2(w.z, w.x);
  }
  function dirRegionWorld(i){
    var ps = pairStates[i % pairStates.length];
    return dirWorldTmp.set(
      (ps.lead.x + ps.foll.x)*0.5,
      (ps.lead.y + ps.foll.y)*0.5,
      (ps.lead.z + ps.foll.z)*0.5).normalize()
      .applyQuaternion(sunMesh.quaternion);
  }
  function dirForceFlare(i, amp){
    var ps = pairStates[i % pairStates.length];
    surfFlareDir.set(
      (ps.lead.x + ps.foll.x)*0.5,
      (ps.lead.y + ps.foll.y)*0.5,
      (ps.lead.z + ps.foll.z)*0.5).normalize();
    surfFlareT = 0;
    surfFlareAmp = amp;
    setFlareFrame(surfFlareDir);
    scheduleFlareArcade();
    agitateNearestProm(surfFlareDir);
  }
  function dirLerpAngle(a, b, k){
    var d = b - a;
    while (d > Math.PI) d -= Math.PI*2;
    while (d < -Math.PI) d += Math.PI*2;
    return a + d*k;
  }
  function directorTick(delta, rawDelta){
    if (dirT < 0){ dirT = 0; dirSavedLapse = ctx.LAPSE_K; }
    dirT += delta;
    var t = dirT;
    thetaVel = 0; phiVel = 0;
    var horizon = Math.acos(Math.min(1, SUN_RADIUS/Math.max(camDist, SUN_RADIUS*1.001)));
    var w, k;
    if (t < 10){
      // B0 — plano geral: o Sol inteiro, respiração lenta para dentro
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/6.0);
      theta = dirLerpAngle(theta, dirAng.th - 0.9, k);
      phi += (Math.PI*0.46 - phi)*k;
      targetCamDist = fitDist*(1.28 - 0.018*Math.min(t, 10));
      dofFocusOverride = -1;
    } else if (t < 22){
      // B1 — push-in: tracking da região protagonista (ela gira com o
      // Sol e a câmera a persegue), foco raso no centro do quadro
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/2.2);
      theta = dirLerpAngle(theta, dirAng.th, k);
      phi += (dirAng.ph - phi)*k;
      targetCamDist += (minDist*1.30 - targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      dofFocusOverride = 0.0;
    } else if (t < 30){
      // B2 — reposição ao limbo: a região desliza para a borda (o
      // palco do Thomson) e o foco puxa ao horizonte
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/2.6);
      theta = dirLerpAngle(theta, dirAng.th + horizon*0.94, k);
      phi += (dirAng.ph*0.5 + Math.PI*0.25 - phi)*k;
      targetCamDist += (fitDist*0.78 - targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      dofFocusOverride = 1.0;
    } else if (t < 48){
      // B3 — a erupção: flare X no limbo; a casca desprende ~1s depois
      // (slow rise → impulsiva, sincronizada com o envelope do flare)
      if (!dirFlareFired){ dirFlareFired = true; dirForceFlare(dirPair, 1.35); }
      if (!dirCmeFired && t >= 31.0 && CME_STEPS > 0 && ctx.CME_K > 0.001 && !cmeKilled){
        dirCmeFired = true; launchCME(1.35);
      }
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/4.5);
      theta = dirLerpAngle(theta, dirAng.th + horizon*0.94, k*0.4);
      targetCamDist += (fitDist*0.92 - targetCamDist)*(1 - Math.exp(-rawDelta/8.0));
      dofFocusOverride = 1.0;
    } else if (t < 64){
      // B4 — retirada: a casca cruza a coroa, a arcada escura fica
      dofFocusOverride = -1;
      targetCamDist += (fitDist*1.30 - targetCamDist)*(1 - Math.exp(-rawDelta/6.0));
      theta += 0.012*rawDelta;
    } else if (t < 78){
      // B5 — time-lapse documental: só a maquinaria de manchas corre
      var up = dirEase((t - 64)/3.0);
      var down = 1 - dirEase((t - 75)/3.0);
      ctx.LAPSE_K = Math.max(dirSavedLapse, 0.85*up*down);
      theta += 0.010*rawDelta;
    } else if (t < 84){
      // B6 — assentar de volta ao plano geral
      ctx.LAPSE_K = dirSavedLapse;
      targetCamDist += (fitDist*1.28 - targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      theta += 0.010*rawDelta;
    } else {
      // loop: próxima volta com outra região protagonista
      dirT = 0; dirPair = (dirPair + 1) % pairStates.length;
      dirFlareFired = false; dirCmeFired = false;
    }
    phi = Math.max(0.18, Math.min(Math.PI - 0.18, phi));
  }

  function animate(){
    requestAnimationFrame(animate);
    var frameT0 = performance.now();
    if (DET && window.__solInfo) window.__solInfo.frame = ++ctx.detFrames;
    var rawDelta = DET
      ? ((DET_HOLD > 0 && ctx.detFrames > DET_HOLD) ? 0 : (1/60))
      : Math.min(clock.getDelta(), 0.1);
    var delta = rawDelta * ctx.TIME_SCALE;
    elapsed += delta;
    sunUniforms.uTime.value = elapsed;
    // FASE 5 — modo diretor: coreografa câmera/eventos/knobs por cima
    // do estado (uma comparação sem ?director=1). dirT=-1 é "ainda não
    // começou" (o tick inicia); -999 é "usuário assumiu" (permanente).
    if (ctx.DIRECTOR_ON && dirT > -900) directorTick(delta, rawDelta);

    simAccum += delta;
    if (subToggle.sim){
      var guard = 0;
      while (simAccum >= SIM_STEP_INTERVAL && guard < 5){
        simAccum -= SIM_STEP_INTERVAL;
        stepSimulation(SIM_DT);
        guard++;
      }
      // dreno do guard-5 (bug 2 da auditoria): sem isto, a fps baixa o
      // acumulador cresce sem limite e a granulação fica PERMANENTEMENTE
      // atrás de rotação/proeminências/bake (dessincronia cumulativa).
      // Tempo que não coube no frame é descartado de forma coerente —
      // fica no máximo 1 passo pendente para o próximo frame.
      if (simAccum > SIM_STEP_INTERVAL) simAccum = SIM_STEP_INTERVAL;
    } else simAccum = 0;

    // bake estrutural a ~8Hz, FATIADO (T3.3): um ciclo = 8 fatias, uma
    // por frame — o custo do par chromo+smear se dilui e o pior frame
    // deixa de ser 3.4x o frame típico
    chromoAccum += delta;
    if (ctx.bakeStep < 0 && chromoAccum >= 0.12 && subToggle.bake){
      chromoAccum = 0;
      ctx.bakeStep = 0;
      ctx.bakeTime = elapsed;
      snapshotBakeInputs();
    }
    if (ctx.bakeStep >= 0){
      bakeChromoSlice(ctx.bakeStep, ctx.bakeTime);
      ctx.bakeStep++;
      if (ctx.bakeStep >= 8){
        ctx.bakeStep = -1; perfBakes.push(frameT0);
        ctx.bakePrev = ctx.bakeCur; ctx.bakeCur = ctx.bakeWrite;
        ctx.bakeWrite = (ctx.bakeCur === ctx.bakePrev) ? (ctx.bakeCur+1)%3 : 3 - ctx.bakeCur - ctx.bakePrev;
        // clamp 4.5: cobre o ciclo a speed=3/fps baixa (~2.4s×0.85) — o
        // antigo 1.5 fechava o fade cedo e congelava as camadas baked
        // por 3 de 8 frames por ciclo (QA da iteração 1)
        ctx.bakeCycleDt = Math.max(0.05, Math.min(4.5, (elapsed - ctx.bakeSwapT)*0.85));
        ctx.bakeSwapT = elapsed;
        sunUniforms.uChromoTex.value  = bakeSets[ctx.bakeCur].s.texture;
        sunUniforms.uChromoFar.value  = bakeSets[ctx.bakeCur].c.texture;
        sunUniforms.uChromoTexP.value = bakeSets[ctx.bakePrev].s.texture;
        sunUniforms.uChromoFarP.value = bakeSets[ctx.bakePrev].c.texture;
      }
    }
    // crossfade avança TODO frame, fora do gate de fatias: sem congelar
    // nos frames de espera (fps>67) nem truncar em ~0.875. O fade dura
    // 85% do ciclo medido, então o mix SATURA em 1.0 antes do swap — e
    // no swap (prev:=cur, mix:=0) a imagem exibida é a MESMA, sem pop.
    sunUniforms.uBakeMix.value = Math.min(1, (elapsed - ctx.bakeSwapT)/ctx.bakeCycleDt);

    sunMesh.rotation.y += ROT_SPEED * delta;
    prominenceGroup.rotation.y = sunMesh.rotation.y;
    spiculeMesh.rotation.y = sunMesh.rotation.y;
    loopGroup.rotation.y = sunMesh.rotation.y;
    spiculeUniforms.uTime.value = elapsed;

    // FASE 3 — relógio do ciclo de 11 anos: só anda com cycle/lapse
    // ligados. cycle>1 acelera o relógio natural; lapse (time-lapse
    // documental) multiplica o relógio do ciclo E o tempo das regiões
    // (cycleWarp), sem tocar rotação/sim/proeminências. Default 0:
    // warp fica 0.0 e elapsed+0.0 é bit-exato — baseline intocado.
    if (cycleDepth() > 0.001){
      var cycMul = Math.max(1.0, ctx.CYCLE_K) + ctx.LAPSE_K * CYCLE_LAPSE_MUL;
      ctx.cycleTime += delta * cycMul;
      if (cycMul > 1.0) ctx.cycleWarp += delta * (cycMul - 1.0);
      updateCycleState();
    }
    // ciclo de vida das regiões ativas (o bake absorve as mudanças a ~8Hz)
    updateActiveRegions(elapsed + ctx.cycleWarp);
    // flare de superfície: ataque rápido, decaimento lento
    surfFlareCooldown -= delta;
    if (surfFlareCooldown <= 0){
      if (triggerSurfaceFlare()){
        surfFlareT = 0;
        // FASE 5: flare grande pode soltar CME (sorteio no stream
        // próprio cmeRand; com cme=0 a chamada é um return imediato)
        maybeLaunchCME();
      }
      // sol ativo flareia mais: cooldown encolhe com a atividade global
      surfFlareCooldown = (12 + srand()*14) / (0.5 + 1.1*coronaRaysUniforms.uActivity.value);
    }
    surfFlareT += delta;
    // FASE 1 — duas fases: núcleo impulsivo + fitas (impulso curto e
    // rescaldo gradual) que se SEPARAM da PIL a ritmo saturante, e a
    // fita alonga junto — a geometria toda deriva de surfFlareT
    var sfImp = flareEnvImp(surfFlareT);
    var sfGrad = flareEnvGrad(surfFlareT);
    var sfEnv = sfImp * 1.7 * surfFlareAmp;
    var sfRib = (0.45*sfImp + 0.85*sfGrad) * 1.7 * surfFlareAmp;
    if (sfEnv < 0.004) sfEnv = 0;
    if (sfRib < 0.004) sfRib = 0;
    var sfSep = 0.018 + 0.050*(1.0 - Math.exp(-surfFlareT*0.45));
    var sfLen = 0.055 + 0.040*(1.0 - Math.exp(-surfFlareT*0.45));
    // uFlare.xyz em espaço do OBJETO (o mesmo das cargas/sp no shader)
    sunUniforms.uFlare.value.set(surfFlareDir.x, surfFlareDir.y, surfFlareDir.z, sfEnv);
    sunUniforms.uFlareGeo.value.set(flareTanDir.x, flareTanDir.y, flareTanDir.z, sfSep);
    sunUniforms.uFlarePerp.value.set(flarePerpDir.x, flarePerpDir.y, flarePerpDir.z, sfLen);
    // FASE 2 (débito LOD): w = fator de zoom dos STRANDS das fitas — de
    // perto (camDist < fit) o ruído de recorte fica proporcionalmente
    // mais fino, mantendo a densidade de strands EM TELA; de longe fica
    // 1.0 (look calibrado da Fase 1 intocado)
    sunUniforms.uFlareRib.value.set(sfRib, 0.010, flareSeedVal,
      Math.min(2.6, Math.max(1.0, fitDist/camDist)));
    // loops coronais + arcada pós-flare (FASE 1): ciclo de vida,
    // traços amortizados e envelopes — tudo sem alocação
    updateLoops(delta);
    camDirN.copy(camera.position).normalize();
    // FASE 5 — CME: relógio, cinemática fechada, uniforms da casca e
    // passo de transform feedback das partículas. Sem evento/knob 0:
    // só comparações (custo ~zero) e nenhum estado muda.
    if (cmePts.on){
      cmePts.meshes[0].rotation.y = sunMesh.rotation.y;
      cmePts.meshes[1].rotation.y = sunMesh.rotation.y;
    }
    updateCME(delta);
    // estado por proeminência (uma vez por PAR de cartões, não por mesh)
    promStates.forEach(function(ps){
      // ciclo de vida: nasce crescendo da superfície, vive, colapsa e a
      // slot RENASCE noutra linha neutra (mesmo padrão das regiões ativas)
      var lx = ((elapsed + ps.phase) % ps.period) / ps.period;
      ps.env = lifeEnvelope(lx);
      if (lx >= 0.90){
        if (!ps.reborn){ placeProminence(ps, sampleProminenceAnchor()); ps.reborn = true; }
      } else ps.reborn = false;
      // proeminência <-> campo: a intensidade acompanha a força LOCAL do
      // campo das cargas (bFieldJS) na âncora AO LONGO DA VIDA — as
      // regiões ativas que sustentam a linha neutra crescem e decaem, e o
      // plasma suspenso esmorece/reaviva junto (suavizado p/ não tremer)
      var Bm = bFieldJS(ps.meshes[0].userData.dir).length();
      var fieldK = Math.min(1.2, 0.35 + 0.65*(Bm/1.1));
      ps.fieldK = (ps.fieldK === undefined) ? fieldK
                : ps.fieldK + (fieldK - ps.fieldK)*Math.min(1, delta*0.8);
      // agitação por flare vizinho: ataque rápido (~1s), relaxa em ~6s
      ps.agitT = (ps.agitT === undefined) ? 999 : ps.agitT + delta;
      ps.agit = (1.0 - Math.exp(-ps.agitT*3.0)) * Math.exp(-ps.agitT*0.55);
      if (ps.agit < 0.004) ps.agit = 0;
      if (ps.agitHold != null) ps.agit = ps.agitHold;   // QA: valor fixado
      // "tempo do plasma": corre mais rápido sob agitação (dreno acelera)
      ps.drift = (ps.drift || 0) + delta*(1.0 + 4.0*ps.agit);
      // orientação dos DOIS cartões: folha fina esmaece de frente (nv) e
      // de perfil (edgeK), mas o PAR deve somar brilho ~constante — o
      // gêmeo carrega o que o outro perde. Sem a normalização, a sorte
      // do spin deixava proeminências até ~2.6x mais fracas que outras.
      if (!ps.orient) ps.orient = [0, 0];
      for (var oi = 0; oi < 2; oi++){
        ps.meshes[oi].getWorldDirection(promNormal);
        var nv = Math.abs(promNormal.dot(camDirN));
        var ek = Math.min(1, Math.max(0, (nv - 0.03) / 0.13));
        ps.orient[oi] = (1.0 - 0.5*nv) * ek*ek*(3 - 2*ek);
      }
      ps.orientNorm = 1.05 / Math.max(0.45, ps.orient[0] + ps.orient[1]);
      // FASE 3 — gêmeo de absorção: escuro ∝ s (o MESMO smoothstep de
      // facing que apaga a emissão contra o disco usa 1-s) — no limbo
      // os dois se cruzam e a estrutura continua através da borda.
      // Teto 0.55 = a mesma absorção máxima dos filamentos do bake.
      if (ctx.FPROM_K > 0.001){
        ps.flat.visible = true;
        var facingF = promWorldTmp.copy(ps.flat.userData.dir)
          .applyQuaternion(prominenceGroup.quaternion).dot(camDirN);
        var sF = Math.min(1, Math.max(0, (facingF - 0.10) / 0.42));
        sF = sF*sF*(3.0-2.0*sF);
        var fu = ps.flat.material.uniforms;
        fu.uLife.value = ps.env;
        fu.uAgit.value = ps.agit;
        fu.uPTime.value = ps.drift;
        fu.uTime.value = elapsed;
        // teto 0.45 com fieldK saturado: filamento GONG é cinza-escuro
        // sobre o disco, nunca preto (juiz de realismo F3 — o teto
        // antigo 0.55·fieldK1.2=0.66 saturava o núcleo para preto)
        fu.uAbsorb.value = Math.min(1.0, ctx.FPROM_K) * 0.45 * sF * Math.min(1.0, ps.fieldK);
      } else if (ps.flat.visible) ps.flat.visible = false;
    });
    prominenceMeshes.forEach(function(m){
      var ps = m.userData.state;
      var env = ps.env;
      m.material.uniforms.uLife.value = env;
      m.material.uniforms.uAgit.value = ps.agit;
      m.material.uniforms.uPTime.value = ps.drift;
      // flicker 1/f: 3 oitavas de value noise — remove a periodicidade
      // audível dos 2 senos; respira mais forte sob campo forte/agitação
      var famp = 0.16 + 0.14*ps.fieldK + 0.45*ps.agit;
      var f = 0.65 + famp * flicker1f(elapsed*m.userData.speed + m.userData.phase);
      var base = Math.max(0.55, Math.min(1.15, f + 0.2));
      base *= 0.30 + 0.70*env;   // jovem/moribunda é mais tênue que madura
      base *= ps.fieldK;
      // flare vizinho reaviva o plasma suspenso (interação visível)
      base += 1.6 * ps.agit;
      // física do limbo: proeminências só brilham na borda; contra o disco, somem
      var facing = promWorldTmp.copy(m.userData.dir)
        .applyQuaternion(prominenceGroup.quaternion).dot(camDirN);
      var s = Math.min(1, Math.max(0, (facing - 0.10) / 0.42));
      s = s*s*(3.0-2.0*s);
      base *= (0.05 + 0.95*(1.0 - s));
      // orientação normalizada por PAR (calculada no loop de estados):
      // preserva o fade físico de cada cartão, mas a soma dos gêmeos
      // rende brilho ~constante em qualquer ângulo/spin
      base *= ps.orient[m.userData.twinIdx] * ps.orientNorm;
      m.material.uniforms.uIntensity.value = base;
      m.material.uniforms.uTime.value = elapsed;
    });

    coronaRays.quaternion.copy(camera.quaternion);
    coronaRaysUniforms.uTime.value = elapsed;
    twinkleUniform.value = elapsed;
    // T1.3: base da câmera + rotação do Sol + atividade global p/ a coroa
    camRightTmp.set(1,0,0).applyQuaternion(camera.quaternion);
    camUpTmp.set(0,1,0).applyQuaternion(camera.quaternion);
    coronaRaysUniforms.uRight.value.copy(camRightTmp);
    coronaRaysUniforms.uUp.value.copy(camUpTmp);
    coronaRaysUniforms.uRotY.value = sunMesh.rotation.y;
    var actSum = 0;
    for (var ai = 0; ai < pairStates.length; ai++) actSum += Math.abs(pairStates[ai].lead.w);
    coronaRaysUniforms.uActivity.value = Math.min(1.0, actSum/4.0);

    // FASE 4 — coroa volumétrica: uniforms + bake fatiado do sampler3D
    // (2 fatias z/frame, ciclo ~0.5s + folga; cadência de sobra para a
    // deriva lenta das cargas e para o time-lapse do ciclo). Com knob 0
    // nada aqui roda além do teste — custo e frame idênticos.
    if (CVOL_STEPS > 0){
      var cvolOn = ctx.CVOL_K > 0.001 && !cvolKilled && subToggle.corona && subToggle.corona3d;
      if (cvolOn && !cvolReady) cvolBakeFull();   // ligada ao vivo pelo painel
      coronaVol.visible = cvolOn;
      coronaRaysUniforms.uCvolMix.value = cvolOn ? Math.min(1.0, ctx.CVOL_K) : 0.0;
      if (cvolOn){
        coronaVol.quaternion.copy(camera.quaternion);
        cvolUniforms.uCvol.value = ctx.CVOL_K;
        cvolUniforms.uTime.value = elapsed;
        cvolUniforms.uActivity.value = coronaRaysUniforms.uActivity.value;
        // mundo -> objeto: transposta da rotação do sunMesh (tilt+spin).
        // Usa o matrixWorld da última renderização (defasagem de 1
        // frame de spin, ~4e-4 rad — invisível): chamar
        // updateMatrixWorld() aqui mudava o timing de update da cena
        // e deixava resíduo de 1 LSB nos ciclos de bake (QA F3)
        cvolInvRot.setFromMatrix4(sunMesh.matrixWorld).transpose();
        cvolAccum += delta;
        if (cvolStep < 0 && cvolAccum >= 0.9){
          cvolStep = 0; cvolAccum = 0; snapshotCvolCharges();
        }
        if (cvolStep >= 0){
          // 1 fatia/frame: 2 fatias custavam ~2.9ms de busy p95 no mid
          // (A/B da rodada; orçamento CPU ≤1ms/frame). O ciclo vira
          // ~64 frames + folga de 0.9s — cadência de sobra para a
          // deriva das cargas (~150s) e para o lapse (ciclo em ~45s)
          bakeCvolSlice(cvolStep);
          cvolStep += 1;
          if (cvolStep >= CVOL_N){
            cvolStep = -1; cvolCycles++;
            cvolData.set(cvolStage);        // upload atômico: sem tearing
            cvolTex.needsUpdate = true;
          }
        }
      }
    }

    // inércia: continua girando ao soltar, com amortecimento exponencial
    if (pointers.size === 0){
      theta += thetaVel*rawDelta;
      phi   += phiVel*rawDelta;
      phi = Math.max(0.18, Math.min(Math.PI-0.18, phi));
      var damp = Math.exp(-2.6*rawDelta);
      thetaVel *= damp; phiVel *= damp;
      if (Math.abs(thetaVel) < 0.002) thetaVel = 0;
      if (Math.abs(phiVel) < 0.002) phiVel = 0;
    }
    // zoom amortecido
    camDist += (targetCamDist - camDist) * (1.0 - Math.exp(-9.0*rawDelta));
    sunUniforms.uCamDist.value = camDist;

    if (pointers.size === 0 && performance.now()-lastInteraction > 2200 && !directorActive()){
      theta += 0.066*rawDelta;
      // ?idle=1: câmera idle cinematográfica — deriva orbital + balanço
      // de latitude + respiração de zoom, tudo senoidal (média zero)
      if (ctx.IDLE_CINE){
        phi += 0.012*Math.sin(elapsed*0.11)*rawDelta;
        targetCamDist += Math.sin(elapsed*0.073)*0.010*rawDelta*targetCamDist;
      }
    }
    updateCamera();

    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    // FASE 2 — dispersão espectral do bloom (lida ANTES do renderBloom)
    downsampleUniforms.uDisp.value = DISP_K;
    upsampleUniforms.uDisp.value = DISP_K;
    if (subToggle.bloom) renderBloom();
    compUniforms.uBloomStrength.value = subToggle.bloom ? BLOOM_STRENGTH_BASE : 0.0;

    // --- camada cinema (Sunshine) ---------------------------------
    // halação usa o mip mais largo do bloom; zera junto com o toggle
    compUniforms.uVeil.value = subToggle.bloom ? VEIL_BASE : 0.0;
    compUniforms.tVeil.value = bloomMips[bloomMips.length-1].rt.texture;
    if (STREAK_K > 0.001 && subToggle.bloom) renderStreak();
    compUniforms.uStreak.value = subToggle.bloom ? STREAK_K : 0.0;
    compUniforms.tStreak.value = streakRTb.texture;
    compUniforms.uCTime.value = elapsed;
    // centro/raio do disco em UV de tela (p/ o anel de heat-haze)
    cineProj.set(0,0,0).project(camera);
    compUniforms.uSunC.value.set(cineProj.x*0.5+0.5, cineProj.y*0.5+0.5);
    var cineHalf = camera.fov * Math.PI / 360;
    var cineAng = Math.asin(Math.min(1, SUN_RADIUS / Math.max(camDist, SUN_RADIUS*1.001)));
    compUniforms.uSunR.value = 0.5 * Math.tan(cineAng) / Math.tan(cineHalf);
    compUniforms.uAspect.value = renderer.domElement.width / Math.max(1, renderer.domElement.height);
    // FASE 5 — abertura do foco raso: cresce ao sair do fit para o
    // close-up (em fit ~0 ⇒ knob ligado não muda o enquadramento
    // aberto); o foco persegue o alvo com lerp curto — focus pull de
    // maquinista, não corte seco. Com knob 0 o ramo escreve 0 e o
    // branch do shader morre.
    if (ctx.DOF_K > 0.001){
      var dofCloseK = Math.max(0, Math.min(1, (fitDist/camDist - 1.10)/1.10));
      var dofTgt = (dofFocusOverride >= 0) ? dofFocusOverride : 0.0;
      dofFocusCur += (dofTgt - dofFocusCur) * (1.0 - Math.exp(-rawDelta/0.35));
      compUniforms.uDof.value = ctx.DOF_K * dofCloseK*dofCloseK * 0.026;
      compUniforms.uDofFocus.value = dofFocusCur;
    } else compUniforms.uDof.value = 0.0;
    // FASE 1 — brilho HDR REAL do flare na lente: envelope (2 fases) ×
    // visibilidade do ponto do flare no hemisfério voltado à câmera
    // (espaço de mundo). Antes a íris respondia a sfEnv mesmo com o
    // flare ATRÁS do Sol — efeito desacoplado do estado físico. Agora
    // flare no limbo/lado oculto ⇒ lente não reage ("uma estrela, um
    // estado"); o MESMO escalar dirige íris e starburst.
    flareWorldTmp.copy(surfFlareDir).applyQuaternion(sunMesh.quaternion);
    var flareFacing = flareWorldTmp.dot(camDirN);
    var fvis = Math.min(1, Math.max(0, (flareFacing - 0.04)/0.26));
    fvis = fvis*fvis*(3.0 - 2.0*fvis);
    var flareHDR = (sfEnv + 0.5*sfRib) * fvis;
    lastFlareHDR = flareHDR;
    // FASE 2 — halação quente: além do peso espectral por pixel (shader),
    // o ganho global SURGE com o flash do flare — o mesmo escalar físico
    // que dirige íris e starburst ("uma estrela, um estado")
    compUniforms.uHal.value = subToggle.bloom ? HAL_K * (1.0 + 1.6*flareHDR) : 0.0;
    // adaptação de exposição (olho/íris): fecha rápido no claro, reabre
    // devagar; flare estoura o quadro ANTES de a íris correr atrás
    if (ADAPT_K > 0.001){
      var cover = cineAng / cineHalf; cover = Math.min(2.0, cover*cover);
      // termo do flare 0.60→0.25 (backlog M2 nº5): a íris escurecia o
      // quadro TODO -26% enquanto o flash local era +3% — o evento lia
      // invertido; com o laço 4x mais forte, o flare ganha a leitura
      // FASE 5: a CME visível também pesa na íris (lastCmeHDR = 0 sem
      // evento ⇒ soma 0.0, bit-exato — convenção F3/F4)
      var aTarget = 1.0 / (1.0 + ADAPT_K*(0.42*cover
        + 0.20*coronaRaysUniforms.uActivity.value*cover + 0.25*flareHDR
        + 0.10*lastCmeHDR));
      var aTau = (aTarget < adaptCur) ? 0.5 : 3.0;
      adaptCur += (aTarget - adaptCur) * (1.0 - Math.exp(-rawDelta/aTau));
      compUniforms.uAdapt.value = adaptCur * (1.0 + ADAPT_K*0.85*flareHDR);
    } else { adaptCur = 1.0; compUniforms.uAdapt.value = 1.0; }
    // starburst de difração: cravado na posição PROJETADA do flare e
    // dirigido pelo mesmo flareHDR — nasce, cresce e some com o brilho
    // físico (impulsivo forte, rescaldo fraco), nunca com um timer
    if (BURST_K > 0.001 && flareHDR > 0.004){
      burstProj.copy(flareWorldTmp).multiplyScalar(SUN_RADIUS).project(camera);
      compUniforms.uBurstPos.value.set(burstProj.x*0.5 + 0.5, burstProj.y*0.5 + 0.5);
      compUniforms.uBurst.value = (burstProj.z < 1.0) ? BURST_K * flareHDR : 0.0;
      // rotação: assinatura fixa por EVENTO + deriva ínfima (lente viva)
      compUniforms.uBurstRot.value = flareSeedVal*0.7 + Math.sin(elapsed*0.9 + flareSeedVal)*0.03;
    } else compUniforms.uBurst.value = 0.0;
    // ----------------------------------------------------------------

    compUniforms.tScene.value = sceneRT.texture;
    compUniforms.tBloom.value = bloomMips[0].rt.texture;
    renderer.setRenderTarget(null);
    renderer.render(compScene, quadCamera);

    // HUD: atualiza a ~2Hz com as mesmas métricas do __solInfo.perf()
    hudAccum += rawDelta;
    if (hudOn && hudAccum >= 0.5 && window.__solInfo && window.__solInfo.perf){
      hudAccum = 0;
      var P = window.__solInfo.perf();
      hudEl.textContent = 'tier ' + P.tier + ' x' + P.autoScale + '  ' + P.fps + ' fps\n' +
        'ms ' + P.ms.avg + ' avg  ' + P.ms.p95 + ' p95\n' +
        'cpu ' + P.busy.avg + '  calls ' + P.calls + '  bake/s ' + P.bakesPerSec;
    }

    // fecha a medição do frame: intervalo rAF->rAF + custo CPU do corpo
    var frameT1 = performance.now();
    var fMs = (perfLastT > 0) ? (frameT0 - perfLastT) : (frameT1 - frameT0);
    perfBusyMs[perfIdx] = frameT1 - frameT0;
    perfFrameMs[perfIdx] = fMs;
    perfLastT = frameT0;
    if (autoTuneOn) autoTune(rawDelta, fMs);
    perfIdx = (perfIdx + 1) % 240;
    if (perfN < 240) perfN++;
    perfCalls = renderer.info.render.calls;
    renderer.info.reset();
  }

  animate();
  loadingEl.classList.add('hidden');
}

})();

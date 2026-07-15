// core/renderer.js — renderer/scene/camera/tiers e sondas de GPU.
// Ordem preservada do main.js original: renderer → glStr → tier → (rtType em
// factory própria, chamada na posição original, APÓS o bloco de sim-comentário).

import * as THREE from 'three';

export function createRenderer(ctx){
  var urlQ = ctx.urlQ, RENDER_SCALE = ctx.RENDER_SCALE, container = ctx.container;
  // Achado 8: a cena 3D é rasterizada no sceneRT monossample (com depth
  // próprio); o canvas recebe só um quad fullscreen do composite. MSAA e
  // depth do framebuffer DEFAULT não suavizam nem ocluem nada — só custam
  // resolve multisample + attachment de depth em resolução física (pior em
  // DPR 2–3). Desligados aqui; o depth da cena vive no sceneRT (pipeline.js).
  var renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, powerPreference: 'high-performance' });
  // three moderno liga saída sRGB por padrão; o composite já faz tonemap e
  // gamma por conta própria — saída linear reproduz o r128 exatamente.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // Achado 9: cap de DPR por tier (2 padrão, 3 no ultra) e BASE VIVA do
  // auto-tune. baseDpr = min(devicePixelRatio, dprCap)·RENDER_SCALE; o DPR
  // efetivo (ctx.pixelRatio) = baseDpr·SCALE_STEPS[scaleIdx]. São recomputados
  // na aplicação transacional (applyPendingDisplayMetrics, main.js) sobre a
  // DPR corrente — aqui só o boot (scaleIdx=0 ⇒ pixelRatio=baseDpr).
  ctx.dprCap = 2;
  ctx.baseDpr = Math.min(window.devicePixelRatio || 1, ctx.dprCap) * RENDER_SCALE;
  ctx.pixelRatio = ctx.baseDpr;
  renderer.setPixelRatio(ctx.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 3000);

  // Qualidade adaptativa: o tier controla oitavas de ruído, malha,
  // textura de simulação, bake, bloom e contagem de proeminências.
  var coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var smallScreen = Math.max(window.innerWidth, window.innerHeight) < 820;
  // Tiers NOMEADOS (low/mid/high); MID é o alvo do iPhone 15 Pro:
  // bake 1024, SIM 768x384, LIC 7 taps, 4 níveis de bloom.
  // FASE 1: loops = nº de loops coronais ambientes, larc = slots de
  // arcada pós-flare, lseg = segmentos por loop (o traço RK4 é CPU
  // amortizado — os contadores escalam com o tier, não o custo/frame).
  var TIER_PARAMS = {
    // FASE 4: cstep = passos do raymarch da coroa volumétrica (0 = tier
    // fica no plano de gradiente; o custo do raymarch escala linear nos
    // passos E na resolução — o auto-tune de escala já o protege).
    // FASE 5: cmestep = passos do raymarch da casca do CME (analítico,
    // sem textura — mais barato por passo que o cvol e episódico: só
    // custa DURANTE um evento); cmen = partículas do ejecta por
    // transform feedback (0 = tier sem partículas).
    low:  { fbm:4, seg:96,  stars:3500, bright:130, simW:384, simH:192, simStep:1/16, bloom:3, prom:4, chromo:512,  granFreq:22.0, lic7:false, loops:8,  larc:5,  lseg:28, cstep:0,  cmestep:0,  cmen:0 },
    mid:  { fbm:5, seg:128, stars:5000, bright:200, simW:768, simH:384, simStep:1/22, bloom:4, prom:6, chromo:1024, granFreq:30.0, lic7:true,  loops:12, larc:7,  lseg:36, cstep:22, cmestep:16, cmen:1024 },
    high: { fbm:5, seg:128, stars:7000, bright:240, simW:768, simH:384, simStep:1/26, bloom:4, prom:7, chromo:2048, granFreq:34.0, lic7:true,  loops:16, larc:9,  lseg:44, cstep:36, cmestep:24, cmen:2048 },
    // ULTRA (desktop com GPU dedicada): DPR até 3, malha/sim/estrelas
    // maiores e 5 níveis de bloom. Nunca é escolhido no primeiro load —
    // só o auto-tune promove (p95 < limiar por 30s no high) ou ?tier=ultra.
    ultra:{ fbm:6, seg:192, stars:10000, bright:320, simW:1024, simH:512, simStep:1/30, bloom:5, prom:8, chromo:2048, granFreq:36.0, lic7:true, loops:22, larc:12, lseg:52, cstep:48, cmestep:32, cmen:4096 }
  };
  // T3.2: partida por HARDWARE + memória de sessões anteriores. A
  // heurística antiga (toque/tela pequena => low) rebaixava iPhones Pro;
  // agora o renderer decide: Apple GPU com toque parte em MID, desktop em
  // HIGH, móvel genérico com pouca RAM em LOW. SwiftShader/llvmpipe (QA
  // headless) fica em HIGH: os gates visuais são calibrados no tier alto —
  // e o auto-tune é desligado lá, senão o p95 do render por software
  // rebaixaria a resolução e mudaria as capturas.
  var glStr = '';
  try {
    var glc = renderer.getContext();
    var dbgInfo = glc.getExtension('WEBGL_debug_renderer_info');
    glStr = String(glc.getParameter(dbgInfo ? dbgInfo.UNMASKED_RENDERER_WEBGL : glc.RENDERER)).toLowerCase();
  } catch(e){}
  var isSoftwareGL = /swiftshader|llvmpipe|softpipe|software/.test(glStr);
  function detectTier(){
    if (TIER_PARAMS[urlQ.tier]) return urlQ.tier;
    try {
      var saved = localStorage.getItem('solTier');   // auto-tune passado
      if (TIER_PARAMS[saved]) return saved;
    } catch(e){}
    if (isSoftwareGL) return 'high';
    if (/apple gpu|apple a[0-9]|apple m[0-9]/.test(glStr)) return coarsePointer ? 'mid' : 'high';
    var mem = navigator.deviceMemory || 0;
    if (coarsePointer || smallScreen) return (mem > 0 && mem < 4) ? 'low' : 'mid';
    return 'high';
  }
  var TIER = detectTier();
  var TP = TIER_PARAMS[TIER];
  // ultra desbloqueia DPR nativo até 3 (o cap 2 protege os tiers móveis)
  if (TIER === 'ultra'){
    ctx.dprCap = 3;
    ctx.baseDpr = Math.min(window.devicePixelRatio || 1, ctx.dprCap) * RENDER_SCALE;
    ctx.pixelRatio = ctx.baseDpr;
    renderer.setPixelRatio(ctx.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  var FBM_OCTAVES = TP.fbm;
  var SPHERE_SEG  = TP.seg;
  var STAR_COUNT  = TP.stars;
  var SIM_W = TP.simW;
  var SIM_H = TP.simH;
  var BLOOM_LEVELS = TP.bloom;
  var PROMINENCE_COUNT = TP.prom;
  var hasTouch = coarsePointer || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  ctx.renderer = renderer; ctx.scene = scene; ctx.camera = camera;
  ctx.coarsePointer = coarsePointer; ctx.isSoftwareGL = isSoftwareGL;
  ctx.TIER = TIER; ctx.TP = TP; ctx.FBM_OCTAVES = FBM_OCTAVES;
  ctx.SPHERE_SEG = SPHERE_SEG; ctx.STAR_COUNT = STAR_COUNT; ctx.SIM_W = SIM_W;
  ctx.SIM_H = SIM_H; ctx.BLOOM_LEVELS = BLOOM_LEVELS;
  ctx.PROMINENCE_COUNT = PROMINENCE_COUNT; ctx.hasTouch = hasTouch;
}

export function createRenderInfra(ctx){
  // Radiação de corpo negro (aproximação de Tanner Helland, válida
  // ~1000K-40000K): cor a partir de temperatura para as estrelas.
  function kelvinToRGB(kelvin){
    var tmp = kelvin/100, r,g,b;
    if (tmp<=66) r=255; else r=Math.min(255,Math.max(0,329.698727446*Math.pow(tmp-60,-0.1332047592)));
    if (tmp<=66) g=Math.min(255,Math.max(0,99.4708025861*Math.log(tmp)-161.1195681661));
    else g=Math.min(255,Math.max(0,288.1221695283*Math.pow(tmp-60,-0.0755148492)));
    if (tmp>=66) b=255; else if(tmp<=19) b=0; else b=Math.min(255,Math.max(0,138.5177312231*Math.log(tmp-10)-305.0447927307));
    return new THREE.Color(r/255,g/255,b/255);
  }

  function makeFullscreenScene(material){
    var geo = new THREE.PlaneGeometry(2,2);
    var mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    var s = new THREE.Scene();
    s.add(mesh);
    return s;
  }
  var quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  ctx.kelvinToRGB = kelvinToRGB; ctx.makeFullscreenScene = makeFullscreenScene;
  ctx.quadCamera = quadCamera;
}

export function createRTType(ctx){
  var renderer = ctx.renderer;
  // HDR: detecção de half-float ANTES dos render targets da simulação —
  // o estado do transporte de fluxo precisa de precisão: em 8 bits os
  // incrementos de ~3% por passo quantizam para zero e o campo evoluído
  // congela/erode até virar uniforme.
  var rtType = THREE.UnsignedByteType;
  try {
    var glCtx0 = renderer.getContext();
    var isWebGL2Ctx = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
    if (isWebGL2Ctx) {
      if (glCtx0.getExtension('EXT_color_buffer_float') || glCtx0.getExtension('EXT_color_buffer_half_float')) {
        rtType = THREE.HalfFloatType;
      }
    } else {
      if (glCtx0.getExtension('OES_texture_half_float') &&
          glCtx0.getExtension('OES_texture_half_float_linear') &&
          glCtx0.getExtension('EXT_color_buffer_half_float')) {
        rtType = THREE.HalfFloatType;
      }
    }
  } catch(e){}
  var isHDR = (rtType === THREE.HalfFloatType);
  ctx.rtType = rtType; ctx.isHDR = isHDR;
}

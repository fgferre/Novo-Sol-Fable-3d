// Novo Sol — app principal. Migrado de sol-3d.html (script inline) para
// módulo ES com three via npm. O pipeline de cor é 100% manual (HDR +
// ACES/AgX no composite em Linear-sRGB), então desligamos o ColorManagement
// do three; a exibição converte para sRGB UMA vez, no fim do composite
// (achado 4: outputColorSpace sRGB + #include <colorspace_fragment>).
import * as THREE from 'three';
import { NOISE_GLSL as NOISE_GLSL_SRC, WORLEY_GLSL, SFTDIR_GLSL, BFIELD_GLSL, LIC_GLSL, quadVertex, uvMeshVertex } from './glsl/common.js';
import { createConfig } from './core/config.js';
import { createGranulation } from './sim/granulation.js';
import { createActivity } from './sim/activity.js';
import { createPIL } from './surface/pil.js';
import { createChromo } from './surface/chromo.js';
import { createSunBase, createSunUniforms, createSunMesh } from './surface/sun.js';
import { createCoronaRays } from './atmosphere/coronaRays.js';
import { createCoronaVolume } from './atmosphere/coronaVolume.js';
import { createCME } from './atmosphere/cme.js';
import { createSpicules } from './atmosphere/spicules.js';
import { createProminences } from './atmosphere/prominences.js';
import { createLoops } from './atmosphere/loops.js';
import { createStars } from './scene/stars.js';
import { createPipeline } from './post/pipeline.js';
import { createControls } from './camera/controls.js';
import { createIntro } from './camera/intro.js';
import { createPerf } from './core/perf.js';
import { createFlares } from './surface/flares.js';
import { createDirector } from './camera/director.js';
import { createPanel } from './ui/panel.js';
import { createSolInfo } from './debug/solinfo.js';
import { createGpuProfile } from './debug/gpuprofile.js';
import { createDiag } from './debug/diag.js';
import { createRenderer, createRenderInfra, createRTType } from './core/renderer.js';
import { createEdu } from './edu/edu.js';
import { EDU_CONTENT } from './edu/content.js';
import { createEduCollection } from './edu/collection.js';
import { createEduTour } from './edu/tour.js';

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
      cycleMultiplier = ctx.act.cycleMultiplier, tickCycleEvent = ctx.act.tickCycleEvent,
      lifeEnvelope = ctx.act.lifeEnvelope, bFieldJS = ctx.act.bFieldJS,
      flicker1f = ctx.act.flicker1f, cyclePolarN = ctx.act.cyclePolarN,
      CYCLE_PERIOD = ctx.act.CYCLE_PERIOD, CYCLE_PHASE0 = ctx.act.CYCLE_PHASE0;
  ctx.charges = charges; ctx.pairStates = pairStates;

  createSunUniforms(ctx);
  var sunUniforms = ctx.sunUniforms;

  ctx.chromo = createChromo(ctx);
  var bakeSets = ctx.bakeSets, bakeChromoSlice = ctx.chromo.bakeChromoSlice,
      snapshotBakeInputs = ctx.chromo.snapshotBakeInputs;

  createSunMesh(ctx);
  var sunMesh = ctx.sunMesh;

  // PR9 (achado 10) — UMA inversa da rotação mundial COMPLETA do Sol (tilt de
  // 7,25° + spin) por frame, compartilhada pelos raios coronais e pelas
  // espículas para ancorar direções mundo->objeto. Criada aqui (antes das
  // factories) para que os uniforms uSunInvRot referenciem o mesmo Matrix3;
  // o valor é recomputado in-place no animate.
  ctx.sunInvRot = new THREE.Matrix3();

  createCoronaRays(ctx);
  var coronaRays = ctx.coronaRays, coronaOuter = ctx.coronaOuter,
      coronaRaysUniforms = ctx.coronaRaysUniforms, CORONA_SIZE = ctx.CORONA_SIZE;

  createCoronaVolume(ctx);
  var coronaVol = ctx.coronaVol, cvolUniforms = ctx.cvolUniforms,
      CVOL_STEPS = ctx.CVOL_STEPS, cvolFrame = ctx.cvolFrame,
      cvolInvRot = ctx.cvolInvRot;

  createCME(ctx);
  var cmeMesh = ctx.cmeMesh, cmeUniforms = ctx.cmeUniforms, cmePts = ctx.cmePts,
      cmeGeomAt = ctx.cmeGeomAt, launchCME = ctx.launchCME,
      maybeLaunchCME = ctx.maybeLaunchCME, updateCME = ctx.updateCME,
      CME_STEPS = ctx.CME_STEPS, CME_PTS_N = ctx.CME_PTS_N,
      cmeInvRot = ctx.cmeInvRot, cmeDir = ctx.cmeDir;

  createSpicules(ctx);
  var spiculeMesh = ctx.spiculeMesh, spiculeUniforms = ctx.spiculeUniforms;

  ctx.prom = createProminences(ctx);
  var prominenceGroup = ctx.prominenceGroup, prominenceMeshes = ctx.prominenceMeshes,
      promStates = ctx.promStates, sampleProminenceAnchor = ctx.sampleProminenceAnchor,
      placeProminence = ctx.placeProminence;

  createLoops(ctx);
  var loopGroup = ctx.loopGroup, loopMesh = ctx.loopMesh, loopAbsMesh = ctx.loopAbsMesh,
      loopUniforms = ctx.loopUniforms, loopStatesA = ctx.loopStatesA,
      arcStates = ctx.arcStates, loopStats = ctx.loopStats, loopEnvArr = ctx.loopEnvArr,
      LOOP_AMB = ctx.LOOP_AMB, LOOP_ARC = ctx.LOOP_ARC,
      updateLoops = ctx.updateLoops, scheduleFlareArcade = ctx.scheduleFlareArcade;
  createStars(ctx);
  var stars = ctx.stars, brightStars = ctx.brightStars, milkyWay = ctx.milkyWay,
      mwNeb = ctx.mwNeb, mwNebUniforms = ctx.mwNebUniforms,
      twinkleUniform = ctx.twinkleUniform,
      STARS_OP0 = ctx.STARS_OP0, BRIGHT_OP0 = ctx.BRIGHT_OP0;

  // inclinação real do eixo solar (~7.25° em relação à eclíptica)
  sunMesh.rotation.z = 0.1265;
  prominenceGroup.rotation.z = 0.1265;
  spiculeMesh.rotation.z = 0.1265;
  loopGroup.rotation.z = 0.1265;

  // diagnóstico acessível via console: window.__solInfo
  try { window.__solInfo = { webgl2: !!(renderer.capabilities && renderer.capabilities.isWebGL2), hdr: isHDR, tier: TIER, scale: RENDER_SCALE }; } catch(e){}

  createPipeline(ctx);
  var EXP0 = ctx.EXP0, BLOOM_BASE0 = ctx.BLOOM_BASE0, BLOOM_THRESHOLD = ctx.BLOOM_THRESHOLD,
      sceneRT = ctx.sceneRT, bloomMips = ctx.bloomMips, streakOut = ctx.streakOut,
      downsampleUniforms = ctx.downsampleUniforms, upsampleUniforms = ctx.upsampleUniforms,
      compUniforms = ctx.compUniforms, compScene = ctx.compScene,
      renderBloom = ctx.renderBloom, renderStreak = ctx.renderStreak,
      resizeTargets = ctx.resizeTargets, cineProj = ctx.cineProj,
      flareWorldTmp = ctx.flareWorldTmp, burstProj = ctx.burstProj;

  createControls(ctx);
  var updateCamera = ctx.updateCamera, computeFitDist = ctx.computeFitDist,
      pointers = ctx.pointers, minDist = ctx.minDist, maxDist = ctx.maxDist;

  createPerf(ctx);
  var subToggle = ctx.subToggle, hudEl = ctx.hudEl, hudToggle = ctx.hudToggle,
      persistTier = ctx.persistTier, autoTune = ctx.autoTune, autoTuneOn = ctx.autoTuneOn,
      SCALE_STEPS = ctx.SCALE_STEPS, TIER_ORDER = ctx.TIER_ORDER,
      perfFrameMs = ctx.perfFrameMs, perfBusyMs = ctx.perfBusyMs, perfBakes = ctx.perfBakes;

  // PR0 — ?profile=1: timer de GPU do frame. Sem a query a factory
  // retorna sem definir ctx.gpuFrame* e os hooks abaixo ficam undefined
  // (o animate paga só um if falsy por frame — custo ~zero, convenção
  // dos gates de knob).
  createGpuProfile(ctx);
  var gpuFrameBegin = ctx.gpuFrameBegin, gpuFrameEnd = ctx.gpuFrameEnd;

  createSolInfo(ctx);

  // PR0 — ?diag=1: manifesto + ring de eventos. Depois do createSolInfo
  // (o manifesto fotografa __solInfo.knobs()); sem a query, retorna sem
  // tocar em nada e ctx.diagEvent segue o no-op do createConfig.
  createDiag(ctx);

  // Todos os targets existem neste ponto; o store central assume a autoria
  // do runtime antes de o painel se inscrever ou o primeiro frame rodar.
  ctx.activateControlTargets();
  // A coleção não cria UI nem toca no modo determinístico. Ela nasce antes
  // do painel para que o menu possa refletir imediatamente descobertas
  // salvas em visitas anteriores; createEdu registra só fatos já visíveis.
  createEduCollection(ctx);
  createPanel(ctx);

  // ---------------------------------------------------------------
  // Achado 9 — resize / DPR / auto-tune TRANSACIONAIS. Todo gatilho só marca
  // estado (requestDisplayResize, guardando o último {cssW,cssH,dpr}); a
  // aplicação acontece UMA vez por frame no início do animate
  // (applyPendingDisplayMetrics). Regras:
  //  - não realoca a cadeia de attachments quando as dims FÍSICAS não mudam;
  //  - mudança só de DPR não reposiciona a câmera (só resize de CSS/aspecto);
  //  - baseDpr é VIVO: recomputado da DPR corrente, não capturado no boot —
  //    o auto-tune passa a escalar sobre a base atual.
  // ---------------------------------------------------------------
  var pendingCssW = window.innerWidth, pendingCssH = window.innerHeight;
  var pendingDpr = window.devicePixelRatio || 1;
  var lastCssW = -1, lastCssH = -1, lastPhysW = -1, lastPhysH = -1;
  ctx.displayDirty = false;
  ctx.displayApplies = 0;    // passes de aplicação consumidos (QA: ≤1/frame)
  ctx.displayReallocs = 0;   // realocações de attachments (QA: 0 idempotente)
  ctx.dispCssW = pendingCssW; ctx.dispCssH = pendingCssH;
  ctx.dispPhysW = 0; ctx.dispPhysH = 0;

  function requestDisplayResize(){
    pendingCssW = window.innerWidth;
    pendingCssH = window.innerHeight;
    pendingDpr = window.devicePixelRatio || 1;
    ctx.displayDirty = true;
  }
  function applyPendingDisplayMetrics(){
    if (!ctx.displayDirty) return;
    ctx.displayDirty = false;
    ctx.displayApplies++;

    var cssW = pendingCssW, cssH = pendingCssH;
    // baseDpr VIVO = min(DPR, cap do tier)·RENDER_SCALE; DPR efetivo aplica o
    // degrau do auto-tune por cima
    ctx.baseDpr = Math.min(pendingDpr, ctx.dprCap) * RENDER_SCALE;
    var dprEff = ctx.baseDpr * SCALE_STEPS[ctx.scaleIdx];
    ctx.pixelRatio = dprEff;

    var physW = Math.max(2, Math.floor(cssW * dprEff));
    var physH = Math.max(2, Math.floor(cssH * dprEff));
    var cssChanged  = (cssW !== lastCssW || cssH !== lastCssH);
    var physChanged = (physW !== lastPhysW || physH !== lastPhysH);

    if (cssChanged || physChanged){
      // dimensiona o drawing buffer (w/h lógicos + DPR de uma vez); NÃO toca no
      // canvas.style, então fixamos o CSS do canvas explicitamente
      renderer.setDrawingBufferSize(cssW, cssH, dprEff);
      var cv = renderer.domElement;
      cv.style.width = cssW + 'px';
      cv.style.height = cssH + 'px';
    }
    // idempotência: só realoca sceneRT/mips/streak quando as dims FÍSICAS mudam
    if (physChanged){
      resizeTargets(physW, physH);
      ctx.displayReallocs++;
      lastPhysW = physW; lastPhysH = physH;
    }
    // câmera/fit só quando o CSS (aspecto/tamanho lógico) muda — mudança só de
    // DPR mantém theta/phi/dist intactos
    if (cssChanged){
      camera.aspect = cssW / cssH;
      camera.updateProjectionMatrix();
      var newFit = computeFitDist();
      if (ctx.fitDist > 0){ ctx.camDist *= newFit / ctx.fitDist; ctx.targetCamDist *= newFit / ctx.fitDist; }
      ctx.fitDist = newFit;
      ctx.camDist = Math.max(minDist, Math.min(maxDist, ctx.camDist));
      ctx.targetCamDist = Math.max(minDist, Math.min(maxDist, ctx.targetCamDist));
      lastCssW = cssW; lastCssH = cssH;
      updateCamera();
    }
    ctx.dispCssW = cssW; ctx.dispCssH = cssH;
    ctx.dispPhysW = physW; ctx.dispPhysH = physH;
    ctx.diagEvent('display-apply', physW, physH);
  }
  ctx.requestDisplayResize = requestDisplayResize;
  ctx.applyPendingDisplayMetrics = applyPendingDisplayMetrics;

  // gatilhos: TODOS só marcam estado; nenhum aplica direto
  window.addEventListener('resize', requestDisplayResize);
  window.addEventListener('pageshow', requestDisplayResize);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden) requestDisplayResize();
  });
  // mudança de resolução/DPR sem evento de resize (troca de monitor 1×↔2×,
  // zoom do navegador): matchMedia re-registrado a cada disparo, sempre com a
  // DPR corrente
  if (window.matchMedia){
    (function watchDpr(){
      var mq;
      try { mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)'); }
      catch(e){ return; }
      var onChange = function(){ requestDisplayResize(); watchDpr(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange, { once: true });
      else if (mq.addListener) mq.addListener(onChange);   // Safari legado
    })();
  }

  // aplicação inicial: estabelece canvas/attachments/câmera (no-op numérico
  // sobre o que o renderer já dimensionou no boot)
  requestDisplayResize();
  applyPendingDisplayMetrics();

  // ---------------------------------------------------------------
  // Loop de animação
  // ---------------------------------------------------------------
  var clock = new THREE.Clock();
  ctx.elapsed = 0;
  var simAccum = 0;
  var chromoAccum = 0;
  // temporários do frame (reutilizados: nada de alocação por frame)
  var camDirN = new THREE.Vector3();
  ctx.camDirN = camDirN;
  var promNormal = new THREE.Vector3();
  var promWorldTmp = new THREE.Vector3();
  var camRightTmp = new THREE.Vector3();
  var camUpTmp = new THREE.Vector3();
  // PR9 — scratch p/ montar a rotação do Sol a partir da quaternion fresca
  var sunRotM4 = new THREE.Matrix4();
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
  ctx.ROT_SPEED = 0.042;

  createFlares(ctx);
  var setFlareFrame = ctx.setFlareFrame, agitateNearestProm = ctx.agitateNearestProm,
      triggerSurfaceFlare = ctx.triggerSurfaceFlare, flareEnvImp = ctx.flareEnvImp,
      flareEnvGrad = ctx.flareEnvGrad, surfFlareDir = ctx.surfFlareDir,
      flareTanDir = ctx.flareTanDir, flarePerpDir = ctx.flarePerpDir;

  // Fonte única do hint: content.js (idioma resolvido pelo config). O texto
  // estático do index.html é só fallback no-JS; edu.js retoca ao trocar idioma.
  if (hintEl) {
    var hintCopy = EDU_CONTENT[ctx.eduLang === 'en' ? 'en' : 'pt'];
    hintEl.textContent = hasTouch ? hintCopy.touchHint : hintCopy.desktopHint;
  }
  // PR-5: o fade-out do hint vive em ctx para a abertura cinematográfica
  // poder rearmá-lo (o hint só conta os 6s DEPOIS de aparecer). Sem a
  // abertura (det/retorno) o comportamento é byte-idêntico ao histórico.
  ctx.hideHint = function(){ if(hintEl) hintEl.style.opacity='0'; };
  ctx.hintHideTimer = setTimeout(ctx.hideHint, 6000);

  // Camada educativa opt-in. Sob ?det=1 a fábrica retorna antes de criar
  // DOM, textura, listener ou tick; ?edu=1 habilita a primeira fatia.
  createEdu(ctx);

  createDirector(ctx);
  // PR-5 — abertura cinematográfica do primeiro acesso. Depois do director
  // (a abertura cede a câmera se ele estiver ativo) e ANTES da visita: o
  // chip do palco consulta ctx.introActive já no primeiro syncChip.
  createIntro(ctx);
  // A visita guiada é separada das descobertas espontâneas e do diretor:
  // cartão persistente/tátil, tempo de leitura e enquadramento consentido.
  createEduTour(ctx);
  var directorTick = ctx.directorTick, directorActive = ctx.directorActive,
      directorStart = ctx.directorStart;

  function animate(){
    requestAnimationFrame(animate);
    var frameT0 = performance.now();
    // Achado 9: aplica as métricas de display pendentes UMA vez, no início do
    // frame. Resize/DPR/pageshow/retomada e o auto-tune só marcam estado; aqui
    // consolida no máx. 1 aplicação/frame (early-return sem custo se limpo).
    applyPendingDisplayMetrics();
    // PR0 — ?profile=1: a query de GPU envolve o frame INTEIRO (sim,
    // bakes, cena e composite); sem a query o hook é undefined
    if (gpuFrameBegin) gpuFrameBegin();
    if (DET && window.__solInfo) window.__solInfo.frame = ++ctx.detFrames;
    // PR2: `held` (tempo congelado sob ?hold) também alimenta o
    // scheduler da coroa volumétrica — bake em voo anda com passo
    // sintético, cooldown congela
    var held = DET && DET_HOLD > 0 && ctx.detFrames > DET_HOLD;
    var rawDelta = DET
      ? (held ? 0 : (1/60))
      : Math.min(clock.getDelta(), 0.1);
    var delta = rawDelta * ctx.TIME_SCALE;
    // O museu só reduz/pausa o relógio físico durante uma leitura explícita.
    // A câmera continua com rawDelta, portanto ainda converge suavemente.
    if (!DET && ctx.eduTourTimeFactor !== undefined) delta *= ctx.eduTourTimeFactor;
    ctx.elapsed += delta;
    sunUniforms.uTime.value = ctx.elapsed;
    // FASE 5 — modo diretor: coreografa câmera/eventos/knobs por cima
    // do estado (uma comparação sem ?director=1). ctx.dirT=-1 é "ainda não
    // começou" (o tick inicia); -999 é "usuário assumiu" (permanente).
    // O diretor inteiro usa o relógio simulado: beats e aproximações mantêm
    // a mesma trajetória quando `speed` comprime ou expande a sequência.
    if (ctx.DIRECTOR_ON && ctx.dirT > -900) directorTick(delta);

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
      ctx.bakeTime = ctx.elapsed;
      snapshotBakeInputs();
    }
    if (ctx.bakeStep >= 0){
      bakeChromoSlice(ctx.bakeStep, ctx.bakeTime);
      ctx.bakeStep++;
      if (ctx.bakeStep >= 8){
        // Achado 14 (PR7): grava no ring de 64 (índice circular), sem push.
        ctx.bakeStep = -1;
        perfBakes[ctx.perfBakeIdx] = frameT0;
        ctx.perfBakeIdx = (ctx.perfBakeIdx + 1) & 63;
        if (ctx.perfBakeN < 64) ctx.perfBakeN++;
        ctx.bakePrev = ctx.bakeCur; ctx.bakeCur = ctx.bakeWrite;
        ctx.bakeWrite = (ctx.bakeCur === ctx.bakePrev) ? (ctx.bakeCur+1)%3 : 3 - ctx.bakeCur - ctx.bakePrev;
        // clamp 4.5: cobre o ciclo a speed=3/fps baixa (~2.4s×0.85) — o
        // antigo 1.5 fechava o fade cedo e congelava as camadas baked
        // por 3 de 8 frames por ciclo (QA da iteração 1)
        ctx.bakeCycleDt = Math.max(0.05, Math.min(4.5, (ctx.elapsed - ctx.bakeSwapT)*0.85));
        ctx.bakeSwapT = ctx.elapsed;
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
    sunUniforms.uBakeMix.value = Math.min(1, (ctx.elapsed - ctx.bakeSwapT)/ctx.bakeCycleDt);

    sunMesh.rotation.y += ctx.ROT_SPEED * delta;
    prominenceGroup.rotation.y = sunMesh.rotation.y;
    spiculeMesh.rotation.y = sunMesh.rotation.y;
    loopGroup.rotation.y = sunMesh.rotation.y;
    // PR9 (achado 10): UMA inversa da rotação mundial do Sol por frame, da
    // quaternion FRESCA (tilt.z + spin.y recém-atualizado) — consistente com o
    // modelMatrix que o render usa neste frame. Ortonormal → inversa =
    // transposta. Alimenta uSunInvRot dos raios coronais e das espículas.
    // (sunMesh é filho da cena → quaternion == rotação mundial.)
    sunRotM4.makeRotationFromQuaternion(sunMesh.quaternion);
    ctx.sunInvRot.setFromMatrix4(sunRotM4).transpose();
    spiculeUniforms.uTime.value = ctx.elapsed;

    // FASE 3 — relógio do ciclo de 11 anos: só anda com cycle/lapse
    // ligados. cycle controla só a PROFUNDIDADE e sempre roda em 1×;
    // lapse (time-lapse documental) multiplica o relógio do ciclo e regiões
    // (cycleWarp), sem tocar rotação/sim/proeminências. Default 0:
    // warp fica 0.0 e elapsed+0.0 é bit-exato — baseline intocado.
    // EVENTO máximo/mínimo solar: boost temporário do multiplicador do
    // relógio do ciclo (prévia do painel/hook de QA). Sem evento é um
    // return imediato — caminho default/det intocado.
    tickCycleEvent(delta);
    if (cycleDepth() > 0.001){
      var cycMul = cycleMultiplier();
      ctx.cycleTime += delta * cycMul;
      if (cycMul > 1.0) ctx.cycleWarp += delta * (cycMul - 1.0);
      updateCycleState();
      // Museu Solar — máximo e mínimo precisam nascer tanto na prévia
      // acelerada quanto na evolução natural do relógio. Antes só o estado
      // `hold` da prévia emitia o cartão, deixando um ciclo normal de ~30 min
      // sem explicação alguma. Os limiares abaixo vêm do MESMO estado físico
      // (fase/amplitude), e a chave por meio-ciclo impede repetição.
      if (!DET && ctx.EDU_K > .5 && ctx.eduEvent){
        var eduCycleTotal=CYCLE_PHASE0+ctx.cycleTime/CYCLE_PERIOD;
        // O mínimo atravessa a fronteira 0/1; +.04 torna os dois lados da
        // mesma janela a mesma chave (evita explicar duas vezes a virada).
        var eduMaxKey=Math.floor(eduCycleTotal)*2+1;
        var eduMinKey=Math.floor(eduCycleTotal+.04)*2;
        var atMax=Math.abs(ctx.cyclePhase01-.5)<.04&&ctx.cycleAmpK>1.12;
        var atMin=(ctx.cyclePhase01<.04||ctx.cyclePhase01>.96)&&ctx.cycleAmpK<.50;
        if(atMax){
          if(ctx.eduCycleMaxKey!==eduMaxKey&&ctx.eduEvent('cycleMaximum',ctx.cyclePhase01,ctx.cycleAmpK,ctx.cyclePolF,1,eduMaxKey))ctx.eduCycleMaxKey=eduMaxKey;
        }else if(atMin){
          if(ctx.eduCycleMinKey!==eduMinKey&&ctx.eduEvent('cycleMinimum',ctx.cyclePhase01,ctx.cycleAmpK,ctx.cyclePolF,1,eduMinKey))ctx.eduCycleMinKey=eduMinKey;
        }
      }
    } else if (ctx.solarMaxK !== 0) ctx.solarMaxK = 0;
    // escalar de apresentação do máximo (uniform do disco); com ciclo
    // desligado/det é 0.0 — os termos do shader colapsam bit-exatos
    sunUniforms.uMaxK.value = ctx.solarMaxK;
    // ciclo de vida das regiões ativas (o bake absorve as mudanças a ~8Hz)
    updateActiveRegions(ctx.elapsed + ctx.cycleWarp);
    // flare de superfície: ataque rápido, decaimento lento
    ctx.surfFlareCooldown -= delta;
    if (ctx.surfFlareCooldown <= 0){
      if (triggerSurfaceFlare()){
        ctx.surfFlareT = 0;
        // FASE 5: flare grande pode soltar CME (sorteio no stream
        // próprio cmeRand; com cme=0 a chamada é um return imediato)
        maybeLaunchCME();
      }
      // sol ativo flareia mais: cooldown encolhe com a atividade global
      ctx.surfFlareCooldown = (12 + srand()*14) / (0.5 + 1.1*coronaRaysUniforms.uActivity.value);
    }
    ctx.surfFlareT += delta;
    // FASE 1 — duas fases: núcleo impulsivo + fitas (impulso curto e
    // rescaldo gradual) que se SEPARAM da PIL a ritmo saturante, e a
    // fita alonga junto — a geometria toda deriva de ctx.surfFlareT
    var sfImp = flareEnvImp(ctx.surfFlareT);
    var sfGrad = flareEnvGrad(ctx.surfFlareT);
    var sfEnv = sfImp * 1.7 * ctx.surfFlareAmp;
    var sfRib = (0.45*sfImp + 0.85*sfGrad) * 1.7 * ctx.surfFlareAmp;
    if (sfEnv < 0.004) sfEnv = 0;
    if (sfRib < 0.004) sfRib = 0;
    var sfSep = 0.018 + 0.050*(1.0 - Math.exp(-ctx.surfFlareT*0.45));
    var sfLen = 0.055 + 0.040*(1.0 - Math.exp(-ctx.surfFlareT*0.45));
    // uFlare.xyz em espaço do OBJETO (o mesmo das cargas/sp no shader)
    sunUniforms.uFlare.value.set(surfFlareDir.x, surfFlareDir.y, surfFlareDir.z, sfEnv);
    sunUniforms.uFlareGeo.value.set(flareTanDir.x, flareTanDir.y, flareTanDir.z, sfSep);
    sunUniforms.uFlarePerp.value.set(flarePerpDir.x, flarePerpDir.y, flarePerpDir.z, sfLen);
    // FASE 2 (débito LOD): w = fator de zoom dos STRANDS das fitas — de
    // perto (ctx.camDist < fit) o ruído de recorte fica proporcionalmente
    // mais fino, mantendo a densidade de strands EM TELA; de longe fica
    // 1.0 (look calibrado da Fase 1 intocado)
    sunUniforms.uFlareRib.value.set(sfRib, 0.010, ctx.flareSeedVal,
      Math.min(2.6, Math.max(1.0, ctx.fitDist/ctx.camDist)));
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
      var lx = ((ctx.elapsed + ps.phase) % ps.period) / ps.period;
      ps.env = lifeEnvelope(lx);
      if (lx >= 0.90){
        if (!ps.reborn){
          placeProminence(ps, sampleProminenceAnchor());
          ps.reborn = true;
          // A slot agora representa outra estrutura física. Só este
          // renascimento natural muda a identidade educativa; os hooks de
          // QA também chamam placeProminence(), mas não devem criar história.
          ps.eduGeneration++;
        }
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
        fu.uTime.value = ctx.elapsed;
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
      var f = 0.65 + famp * flicker1f(ctx.elapsed*m.userData.speed + m.userData.phase);
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
      m.material.uniforms.uTime.value = ctx.elapsed;
    });
    // Museu Solar: uma proeminência/filamento é UMA estrutura, com uma
    // identidade estável por geração. Só avaliamos isto com a experiência
    // ligada e fora do determinístico: sem custo, DOM ou estado educativo no
    // baseline técnico. O emissor recebe sinais já calculados pelo render
    // (emissão no limbo e absorção no disco), nunca uma inferência de cor.
    if (!DET && ctx.EDU_K > .5){
      if (!ctx.promEduModes){
        ctx.promEduModes = new Int8Array(promStates.length);
        ctx.promEduHeights = new Float32Array(promStates.length);
      }
      for (var epi=0; epi<promStates.length; epi++){
        var eps = promStates[epi];
        var edir = eps.meshes[0].userData.dir;
        var eEmit = Math.max(eps.meshes[0].material.uniforms.uIntensity.value,
          eps.meshes[1].material.uniforms.uIntensity.value);
        var eAbsorb = eps.flat && eps.flat.visible ? eps.flat.material.uniforms.uAbsorb.value : 0;
        var eFacing = promWorldTmp.copy(edir).applyQuaternion(prominenceGroup.quaternion).dot(camDirN);
        // O mesmo limiar que a cena usa para tornar a estrutura legível:
        // emissão fora do limbo; absorção real sobre o disco. A faixa de
        // sobreposição vira uma única narrativa "filamento e proeminência".
        var isFilament = eAbsorb >= 0.055;
        var isProminence = eEmit >= 0.34 && eFacing < 0.28;
        ctx.promEduModes[epi] = isFilament ? (isProminence ? 3 : 2) : 1;
        ctx.promEduHeights[epi] = (eps.eduHeight || SUN_RADIUS*0.12) * 0.56;
        if (eps.eduAnnouncedGeneration !== eps.eduGeneration && eps.env >= 0.98 &&
            eps.fieldK >= 0.52 && (isFilament || isProminence)){
          if (ctx.eduEvent('prominence',edir.x,edir.y,edir.z,Math.max(eEmit,eAbsorb),epi,eps.eduGeneration))
            eps.eduAnnouncedGeneration = eps.eduGeneration;
        }
      }
    }
    // PR6 — despeja o estado dos proxies de proeminência nos atributos das
    // 4 InstancedMesh (após o loop de estados, antes do render)
    ctx.flushProminences();

    coronaRays.quaternion.copy(camera.quaternion);
    coronaRaysUniforms.uTime.value = ctx.elapsed;
    twinkleUniform.value = ctx.elapsed;
    // T1.3: base da câmera + rotação do Sol + atividade global p/ a coroa
    camRightTmp.set(1,0,0).applyQuaternion(camera.quaternion);
    camUpTmp.set(0,1,0).applyQuaternion(camera.quaternion);
    coronaRaysUniforms.uRight.value.copy(camRightTmp);
    coronaRaysUniforms.uUp.value.copy(camUpTmp);
    // PR9 (achado 10): uRotY removido — o uSunInvRot compartilhado (computado
    // acima, tilt+spin) faz a transformação mundo->objeto completa no shader.
    var actSum = 0;
    for (var ai = 0; ai < pairStates.length; ai++) actSum += Math.abs(pairStates[ai].lead.w);
    coronaRaysUniforms.uActivity.value = Math.min(1.0, actSum/4.0);

    // FASE 4 / PR2 — coroa volumétrica: uniforms + scheduler assíncrono
    // do bake do sampler3D (máquina idle|baking|cooldown em
    // coronaVolume.js: 30 fatias/s, ≤1 fatia/frame, publicação atômica
    // após a 64ª, cooldown de 0.9s SÓ após publicar). Com knob 0 nada
    // aqui roda além do teste — custo e frame idênticos.
    if (CVOL_STEPS > 0){
      var cvolOn = ctx.CVOL_K > 0.001 && !ctx.cvolKilled && subToggle.corona && subToggle.corona3d;
      // até a 1ª publicação o plano de raias segue INTEGRAL (mix 0 e
      // mesh oculta — sem hitch de bake síncrono ao ligar pelo painel);
      // depois, o último volume publicado fica de pé até a troca
      var cvolShow = cvolOn && ctx.cvolReady;
      coronaVol.visible = cvolShow;
      coronaRaysUniforms.uCvolMix.value = cvolShow ? Math.min(1.0, ctx.CVOL_K) : 0.0;
      if (cvolShow){
        coronaVol.quaternion.copy(camera.quaternion);
        cvolUniforms.uCvol.value = ctx.CVOL_K;
        cvolUniforms.uTime.value = ctx.elapsed;
        cvolUniforms.uActivity.value = coronaRaysUniforms.uActivity.value;
        // mundo -> objeto: transposta da rotação do sunMesh (tilt+spin).
        // Usa o matrixWorld da última renderização (defasagem de 1
        // frame de spin, ~4e-4 rad — invisível): chamar
        // updateMatrixWorld() aqui mudava o timing de update da cena
        // e deixava resíduo de 1 LSB nos ciclos de bake (QA F3)
        cvolInvRot.setFromMatrix4(sunMesh.matrixWorld).transpose();
      }
      // scheduler em rawDelta: a cadência do bake independe do
      // TIME_SCALE (?speed) — 64/30 + 0.9 ≈ 3.03s início-a-início
      cvolFrame(cvolOn, rawDelta, held);
    }

    // PR-5 — abertura cinematográfica: beat único de câmera do primeiro
    // acesso. Sob ?det a factory nem roda (hook undefined — if falsy, o
    // mesmo custo dos gates de knob). Mesma blindagem PR-2 dos ticks edu:
    // a 1ª falha desliga a abertura, registra no ring e revela o chrome
    // (o skip é só DOM/estado — nunca deixa o título invisível para sempre).
    if (ctx.introTick){
      try { ctx.introTick(rawDelta); }
      catch(e){
        ctx.introTick = null; ctx.eduFault('tick-intro', e);
        try { if (ctx.introUserSkip) ctx.introUserSkip(); } catch(_){}
      }
    }
    // A visita pode ajustar a pose-alvo antes da inércia/zoom. Um gesto do
    // usuário desliga apenas esta assistência (controls.js), não a visita.
    // PR-2 (Museu): uma exceção na camada edu não pode derrubar o frame.
    // Na PRIMEIRA falha o tick é desligado (degradação limpa: a cena
    // continua, a camada edu para) e a falha vai para o ring de telemetria.
    // Sob ?det os ticks são undefined — o guard nunca entra, inerte.
    if (ctx.eduTourCameraTick){
      try { ctx.eduTourCameraTick(rawDelta); }
      catch(e){ ctx.eduTourCameraTick = null; ctx.eduFault('tick-tour-camera', e); }
    }
    // inércia: continua girando ao soltar, com amortecimento exponencial
    if (pointers.size === 0){
      ctx.theta += ctx.thetaVel*rawDelta;
      ctx.phi   += ctx.phiVel*rawDelta;
      ctx.phi = Math.max(0.18, Math.min(Math.PI-0.18, ctx.phi));
      var damp = Math.exp(-2.6*rawDelta);
      ctx.thetaVel *= damp; ctx.phiVel *= damp;
      if (Math.abs(ctx.thetaVel) < 0.002) ctx.thetaVel = 0;
      if (Math.abs(ctx.phiVel) < 0.002) ctx.phiVel = 0;
    }
    // zoom amortecido
    ctx.camDist += (ctx.targetCamDist - ctx.camDist) * (1.0 - Math.exp(-9.0*rawDelta));
    sunUniforms.uCamDist.value = ctx.camDist;

    // Achado 11 (PR7): gatilho da deriva idle. No modo normal continua
    // wall-clock (2200ms desde a última interação). No modo determinístico o
    // wall-clock quebrava a paridade — o frame em que a deriva começava
    // dependia da velocidade da máquina (flake do A/B base-vs-base). Agora
    // conta FRAMES desde a última interação: >132 (≈2200ms@60fps) ⇒ frame 132
    // ainda sem deriva, frame 133 recebe o 1º incremento 0.066·rawDelta.
    // PR-2 (Museu): a visita guiada enquadra a câmera; a deriva idle não
    // disputa com ela. Sob ?det eduTourActive é undefined (fábrica ausente)
    // e a condição fica idêntica à anterior — paridade por construção.
    var idleDrift = (DET
      ? (ctx.detFrames - ctx.lastInteractionFrame > 132)
      : (performance.now() - ctx.lastInteraction > 2200))
      && !ctx.eduTourActive;
    if (pointers.size === 0 && idleDrift && !directorActive()){
      ctx.theta += 0.066*rawDelta;
      // ?idle=1: câmera idle cinematográfica — deriva orbital + balanço
      // de latitude + respiração de zoom, tudo senoidal (média zero)
      if (ctx.IDLE_CINE){
        ctx.phi += 0.012*Math.sin(ctx.elapsed*0.11)*rawDelta;
        ctx.targetCamDist += Math.sin(ctx.elapsed*0.073)*0.010*rawDelta*ctx.targetCamDist;
      }
    }
    updateCamera();
    // A fonte física e a câmera deste mesmo frame já estão atualizadas; a
    // visita confirma visibilidade e libera seu cartão somente agora.
    // PR-2: mesma blindagem do cameraTick — 1ª falha desliga e registra.
    if (ctx.eduTourTick){
      try { ctx.eduTourTick(rawDelta); }
      catch(e){ ctx.eduTourTick = null; ctx.eduFault('tick-tour', e); }
    }
    // Museu Solar — grupo de manchas: a descoberta nasce da região ativa
    // magnética real (as cargas lead/foll), não dos slots virtuais usados
    // apenas para enriquecer a textura do disco. Uma explicação por sessão
    // basta para ensinar a ideia; a coleção persistente poderá reabri-la.
    // Não explicamos uma mancha quando a camada visual de manchas foi
    // desativada: a coleção e o cartão devem sempre corresponder a algo que
    // a pessoa consegue ver na cena, não apenas ao campo magnético interno.
    if (!DET && ctx.EDU_K > .5 && ctx.SPOTS_K > .5 && !ctx.eduSpotExplained){
      for (var eduSpotI=0; eduSpotI<pairStates.length; eduSpotI++){
        var eduSpot = pairStates[eduSpotI];
        if (eduSpot.eduAnnouncedGeneration === eduSpot.eduGeneration) continue;
        var leadStrength = Math.abs(eduSpot.lead.w) / Math.max(.001,Math.abs(eduSpot.baseQ));
        var follStrength = Math.abs(eduSpot.foll.w) / Math.max(.001,Math.abs(eduSpot.baseQ)*.85);
        var groupStrength = Math.min(leadStrength,follStrength);
        if (groupStrength < .70) continue;
        var groupX = eduSpot.lead.x + eduSpot.foll.x;
        var groupY = eduSpot.lead.y + eduSpot.foll.y;
        var groupZ = eduSpot.lead.z + eduSpot.foll.z;
        var groupLen = Math.sqrt(groupX*groupX + groupY*groupY + groupZ*groupZ);
        if (groupLen < .001) continue;
        if (ctx.eduEvent('spots',groupX/groupLen,groupY/groupLen,groupZ/groupLen,groupStrength,eduSpotI,eduSpot.eduGeneration)){
          eduSpot.eduAnnouncedGeneration = eduSpot.eduGeneration;
          ctx.eduSpotExplained = true;
          break;
        }
      }
    }
    // PR-2: mesma blindagem — a descoberta espontânea nunca derruba a cena.
    if (ctx.eduTick){
      try { ctx.eduTick(rawDelta); }
      catch(e){ ctx.eduTick = null; ctx.eduFault('tick-edu', e); }
    }

    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    // FASE 2 — dispersão espectral do bloom (lida ANTES do renderBloom)
    downsampleUniforms.uDisp.value = ctx.DISP_K;
    upsampleUniforms.uDisp.value = ctx.DISP_K;
    if (subToggle.bloom) renderBloom();
    compUniforms.uBloomStrength.value = subToggle.bloom ? ctx.BLOOM_STRENGTH_BASE : 0.0;

    // --- camada cinema (Sunshine) ---------------------------------
    // halação usa o mip mais largo do bloom; zera junto com o toggle
    compUniforms.uVeil.value = subToggle.bloom ? ctx.VEIL_BASE : 0.0;
    compUniforms.tVeil.value = bloomMips[bloomMips.length-1].rt.texture;
    if (ctx.STREAK_K > 0.001 && subToggle.bloom) renderStreak();
    compUniforms.uStreak.value = subToggle.bloom ? ctx.STREAK_K : 0.0;
    compUniforms.tStreak.value = streakOut.texture;
    compUniforms.uCTime.value = ctx.elapsed;
    // centro/raio do disco em UV de tela (p/ o anel de heat-haze)
    cineProj.set(0,0,0).project(camera);
    compUniforms.uSunC.value.set(cineProj.x*0.5+0.5, cineProj.y*0.5+0.5);
    var cineHalf = camera.fov * Math.PI / 360;
    var cineAng = Math.asin(Math.min(1, SUN_RADIUS / Math.max(ctx.camDist, SUN_RADIUS*1.001)));
    compUniforms.uSunR.value = 0.5 * Math.tan(cineAng) / Math.tan(cineHalf);
    compUniforms.uAspect.value = renderer.domElement.width / Math.max(1, renderer.domElement.height);
    // FASE 5 — abertura do foco raso: cresce ao sair do fit para o
    // close-up (em fit ~0 ⇒ knob ligado não muda o enquadramento
    // aberto); o foco persegue o alvo com lerp curto — focus pull de
    // maquinista, não corte seco. Com knob 0 o ramo escreve 0 e o
    // branch do shader morre.
    if (ctx.DOF_K > 0.001){
      var dofCloseK = Math.max(0, Math.min(1, (ctx.fitDist/ctx.camDist - 1.10)/1.10));
      var dofTgt = (ctx.dofFocusOverride >= 0) ? ctx.dofFocusOverride : 0.0;
      ctx.dofFocusCur += (dofTgt - ctx.dofFocusCur) * (1.0 - Math.exp(-rawDelta/0.35));
      compUniforms.uDof.value = ctx.DOF_K * dofCloseK*dofCloseK * 0.026;
      compUniforms.uDofFocus.value = ctx.dofFocusCur;
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
    ctx.lastFlareHDR = flareHDR;
    // FASE 2 — halação quente: além do peso espectral por pixel (shader),
    // o ganho global SURGE com o flash do flare — o mesmo escalar físico
    // que dirige íris e starburst ("uma estrela, um estado")
    compUniforms.uHal.value = subToggle.bloom ? ctx.HAL_K * (1.0 + 1.6*flareHDR) : 0.0;
    // adaptação de exposição (olho/íris): fecha rápido no claro, reabre
    // devagar; flare estoura o quadro ANTES de a íris correr atrás
    if (ctx.ADAPT_K > 0.001){
      var cover = cineAng / cineHalf; cover = Math.min(2.0, cover*cover);
      // termo do flare 0.60→0.25 (backlog M2 nº5): a íris escurecia o
      // quadro TODO -26% enquanto o flash local era +3% — o evento lia
      // invertido; com o laço 4x mais forte, o flare ganha a leitura
      // FASE 5: a CME visível também pesa na íris (lastCmeHDR = 0 sem
      // evento ⇒ soma 0.0, bit-exato — convenção F3/F4)
      var aTarget = 1.0 / (1.0 + ctx.ADAPT_K*(0.42*cover
        + 0.20*coronaRaysUniforms.uActivity.value*cover + 0.25*flareHDR
        + 0.10*ctx.lastCmeHDR));
      var aTau = (aTarget < ctx.adaptCur) ? 0.5 : 3.0;
      ctx.adaptCur += (aTarget - ctx.adaptCur) * (1.0 - Math.exp(-rawDelta/aTau));
      compUniforms.uAdapt.value = ctx.adaptCur * (1.0 + ctx.ADAPT_K*0.85*flareHDR);
    } else { ctx.adaptCur = 1.0; compUniforms.uAdapt.value = 1.0; }
    // starburst de difração: cravado na posição PROJETADA do flare e
    // dirigido pelo mesmo flareHDR — nasce, cresce e some com o brilho
    // físico (impulsivo forte, rescaldo fraco), nunca com um timer
    if (ctx.BURST_K > 0.001 && flareHDR > 0.004){
      burstProj.copy(flareWorldTmp).multiplyScalar(SUN_RADIUS).project(camera);
      compUniforms.uBurstPos.value.set(burstProj.x*0.5 + 0.5, burstProj.y*0.5 + 0.5);
      compUniforms.uBurst.value = (burstProj.z < 1.0) ? ctx.BURST_K * flareHDR : 0.0;
      // rotação: assinatura fixa por EVENTO + deriva ínfima (lente viva)
      compUniforms.uBurstRot.value = ctx.flareSeedVal*0.7 + Math.sin(ctx.elapsed*0.9 + ctx.flareSeedVal)*0.03;
    } else compUniforms.uBurst.value = 0.0;
    // ----------------------------------------------------------------

    compUniforms.tScene.value = sceneRT.texture;
    compUniforms.tBloom.value = bloomMips[0].rt.texture;
    renderer.setRenderTarget(null);
    renderer.render(compScene, quadCamera);
    if (gpuFrameEnd) gpuFrameEnd();

    // HUD: atualiza a ~2Hz com as mesmas métricas do __solInfo.perf()
    ctx.hudAccum += rawDelta;
    if (ctx.hudOn && ctx.hudAccum >= 0.5 && window.__solInfo && window.__solInfo.perf){
      ctx.hudAccum = 0;
      var P = window.__solInfo.perf();
      hudEl.textContent = 'tier ' + P.tier + ' x' + P.autoScale + '  ' + P.fps + ' fps\n' +
        'ms ' + P.ms.avg + ' avg  ' + P.ms.p95 + ' p95\n' +
        'cpu ' + P.busy.avg + '  calls ' + P.calls + '  bake/s ' + P.bakesPerSec;
    }

    // fecha a medição do frame: intervalo rAF->rAF + custo CPU do corpo
    var frameT1 = performance.now();
    var fMs = (ctx.perfLastT > 0) ? (frameT0 - ctx.perfLastT) : (frameT1 - frameT0);
    perfBusyMs[ctx.perfIdx] = frameT1 - frameT0;
    perfFrameMs[ctx.perfIdx] = fMs;
    ctx.perfLastT = frameT0;
    if (autoTuneOn) autoTune(rawDelta, fMs);
    ctx.perfIdx = (ctx.perfIdx + 1) % 240;
    if (ctx.perfN < 240) ctx.perfN++;
    ctx.perfCalls = renderer.info.render.calls;
    renderer.info.reset();
  }

  animate();
  loadingEl.classList.add('hidden');
}

})();

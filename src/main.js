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
import { createCoronaRays } from './atmosphere/coronaRays.js';
import { createCoronaVolume } from './atmosphere/coronaVolume.js';
import { createCME } from './atmosphere/cme.js';
import { createSpicules } from './atmosphere/spicules.js';
import { createProminences } from './atmosphere/prominences.js';
import { createLoops } from './atmosphere/loops.js';
import { createStars } from './scene/stars.js';
import { createPipeline } from './post/pipeline.js';
import { createControls } from './camera/controls.js';
import { createPerf } from './core/perf.js';
import { createFlares } from './surface/flares.js';
import { createDirector } from './camera/director.js';
import { createPanel } from './ui/panel.js';
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

  createCoronaRays(ctx);
  var coronaRays = ctx.coronaRays, coronaOuter = ctx.coronaOuter,
      coronaRaysUniforms = ctx.coronaRaysUniforms, CORONA_SIZE = ctx.CORONA_SIZE;

  createCoronaVolume(ctx);
  var coronaVol = ctx.coronaVol, cvolUniforms = ctx.cvolUniforms,
      CVOL_STEPS = ctx.CVOL_STEPS, CVOL_N = ctx.CVOL_N,
      cvolBakeFull = ctx.cvolBakeFull, bakeCvolSlice = ctx.bakeCvolSlice,
      snapshotCvolCharges = ctx.snapshotCvolCharges, cvolData = ctx.cvolData,
      cvolStage = ctx.cvolStage, cvolTex = ctx.cvolTex, cvolInvRot = ctx.cvolInvRot;

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
      sceneRT = ctx.sceneRT, bloomMips = ctx.bloomMips, streakRTb = ctx.streakRTb,
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
        var f = stats(perfFrameMs, ctx.perfN);
        return { tier: TIER, scale: RENDER_SCALE, dpr: ctx.pixelRatio,
                 autoScale: SCALE_STEPS[ctx.scaleIdx],
                 tune: { on: autoTuneOn, events: ctx.tuneEvents },
                 frames: ctx.perfN, ms: f, busy: stats(perfBusyMs, ctx.perfN),
                 fps: f.avg > 0 ? +(1000/f.avg).toFixed(1) : 0,
                 calls: ctx.perfCalls, bakesPerSec: +(perfBakes.length/5).toFixed(2),
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
                 veil: ctx.VEIL_BASE, streak: ctx.STREAK_K, adapt: ctx.ADAPT_K,
                 fringe: compUniforms.uFringe.value,
                 shimmer: compUniforms.uShimmer.value,
                 tone: compUniforms.uTone.value,
                 film: compUniforms.uFilm.value,
                 pmode: sunUniforms.uPmode.value,
                 hand: ctx.HAND_K,
                 loops: ctx.LOOP_K,
                 burst: ctx.BURST_K,
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
        ctx.perfN = 0; ctx.perfIdx = 0; ctx.perfLastT = 0; perfBakes.length = 0;
      };
      // FASE 4: estado da coroa volumétrica (QA: tier-gate, bake, kill)
      window.__solInfo.coronaInfo = function(){
        return { steps: CVOL_STEPS, res: CVOL_N, k: ctx.CVOL_K,
                 on: CVOL_STEPS > 0 && ctx.CVOL_K > 0.001 && !ctx.cvolKilled &&
                     subToggle.corona && subToggle.corona3d,
                 ready: ctx.cvolReady, killed: ctx.cvolKilled, cycles: ctx.cvolCycles };
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
        if (o.base  !== undefined) ctx.cvolWBase  = +o.base;
        if (o.sheet !== undefined) ctx.cvolWSheet = +o.sheet;
        if (o.loop  !== undefined) ctx.cvolWLoop  = +o.loop;
        if (o.hole  !== undefined) ctx.cvolWHole  = +o.hole;
        return { base: ctx.cvolWBase, sheet: ctx.cvolWSheet, loop: ctx.cvolWLoop, hole: ctx.cvolWHole };
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
        return { camDist: ctx.camDist, targetCamDist: ctx.targetCamDist, theta: ctx.theta, phi: ctx.phi,
                 thetaVel: ctx.thetaVel, phiVel: ctx.phiVel,
                 rotY: sunMesh.rotation.y, fitDist: ctx.fitDist, minDist: minDist };
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
          var lx = ((ctx.elapsed + ps.phase) % ps.period) / ps.period;
          var d = ps.meshes[0].userData.dir;
          return { x: lx, env: lifeEnvelope(lx), dir: [d.x, d.y, d.z] };
        });
      };
      window.__solInfo.setPromLife = function(i, x){
        var ps = promStates[i];
        ps.phase = ((x*ps.period - ctx.elapsed) % ps.period + ps.period) % ps.period;
      };
      // QA: sob SwiftShader um screenshot leva 10-35s e o Sol giraria até
      // ~84° entre a mira e o frame capturado (a proeminência mirada some
      // p/ dentro do disco ou atrás do limbo). Congelar/ajustar a rotação
      // torna a captura determinística sem tocar no resto da animação.
      window.__solInfo.setRotSpeed = function(v){ ctx.ROT_SPEED = v; };
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
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.2;   // QA: o gatilho natural seta via |w|; o forçado usa amp fixa
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
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.2;
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        agitateNearestProm(surfFlareDir);
        return [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z];
      };
      // QA FASE 1: sob ?det&hold o tempo congela (delta=0) e ctx.surfFlareT
      // não avança — fixar o relógio do flare fotografa qualquer fase
      // (impulsiva/gradual) de forma determinística
      window.__solInfo.setFlareClock = function(t){ ctx.surfFlareT = t; };
      window.__solInfo.flareInfo = function(){
        return { t: ctx.surfFlareT, amp: ctx.surfFlareAmp,
                 imp: flareEnvImp(ctx.surfFlareT), grad: flareEnvGrad(ctx.surfFlareT),
                 sep: sunUniforms.uFlareGeo.value.w,
                 dir: [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z],
                 tan: [flareTanDir.x, flareTanDir.y, flareTanDir.z],
                 hdr: ctx.lastFlareHDR, burst: compUniforms.uBurst.value,
                 disp: ctx.DISP_K, hal: compUniforms.uHal.value };
      };
      // QA FASE 1: estado dos loops coronais (traçados, arcada viva,
      // custo acumulado do traçador) e salto de fase p/ fotografia
      window.__solInfo.loopInfo = function(){
        var nOk = 0, nArc = 0, i;
        for (i = 0; i < LOOP_AMB; i++) if (loopStatesA[i].ok) nOk++;
        for (i = 0; i < LOOP_ARC; i++) if (arcStates[i].ok && loopEnvArr[LOOP_AMB+i] > 0.004) nArc++;
        return { on: ctx.LOOP_K, amb: nOk, arc: nArc, queue: ctx.arcQueueN,
                 visible: loopMesh.visible,
                 abs: +ctx.lastArcAbsMax.toFixed(3),
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
        ctx.theta = th; ctx.phi = Math.max(0.18, Math.min(Math.PI-0.18, ph));
        ctx.targetCamDist = ctx.camDist = Math.max(minDist, Math.min(maxDist, dist));
        ctx.thetaVel = 0; ctx.phiVel = 0;
        ctx.lastInteraction = performance.now();
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
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.35;
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        agitateNearestProm(surfFlareDir);
        if (CME_STEPS <= 0) return false;
        launchCME(1.35);
        return [cmeDir.x, cmeDir.y, cmeDir.z];
      };
      window.__solInfo.setCmeClock = function(t){
        if (ctx.cmeT >= 900) return false;
        ctx.cmeT = Math.max(0, +t || 0);
        cmeGeomAt(ctx.cmeT);
        return true;
      };
      // eixos do sweep de calibração (painel de juízes) sem rebuild:
      // knob ao vivo + ganho do núcleo denso da casca
      window.__solInfo.setCme = function(v){
        ctx.CME_K = Math.min(1.5, Math.max(0, +v || 0));
        return ctx.CME_K;
      };
      window.__solInfo.setCmeCore = function(x){
        ctx.cmeCoreGain = Math.min(2.5, Math.max(0, +x || 0));
        return ctx.cmeCoreGain;
      };
      window.__solInfo.cmeInfo = function(){
        var g = cmeGeomAt(ctx.cmeT < 900 ? ctx.cmeT : 0);
        return { on: ctx.cmeT < 900, t: ctx.cmeT < 900 ? ctx.cmeT : -1, amp: ctx.cmeAmp,
                 count: ctx.cmeCount, steps: CME_STEPS, killed: ctx.cmeKilled,
                 knob: ctx.CME_K, cooldown: +ctx.cmeCooldown.toFixed(2),
                 front: +g.front.toFixed(3), rho: +g.rho.toFixed(3),
                 cx: +g.cx.toFixed(3), env: +g.env.toFixed(3),
                 hdr: +ctx.lastCmeHDR.toFixed(3),
                 dir: [cmeDir.x, cmeDir.y, cmeDir.z],
                 pts: { on: cmePts.on, n: CME_PTS_N,
                        visible: cmePts.on ? (cmePts.meshes[0].visible || cmePts.meshes[1].visible) : false } };
      };
      // FASE 5 — QA do foco raso: override do plano de foco (0 centro,
      // 1 limbo; -1 volta ao automático) + estado corrente
      window.__solInfo.setDofFocus = function(x){
        ctx.dofFocusOverride = (x === undefined || x < 0) ? -1 : Math.min(1.5, +x);
        // snap imediato (QA sob ?hold: rawDelta=0 congela o lerp do
        // focus pull; ao vivo o diretor puxa suave pelo lerp)
        if (ctx.dofFocusOverride >= 0) ctx.dofFocusCur = ctx.dofFocusOverride;
        return ctx.dofFocusOverride;
      };
      window.__solInfo.dofInfo = function(){
        return { knob: ctx.DOF_K, amt: compUniforms.uDof.value,
                 focus: compUniforms.uDofFocus.value,
                 override: ctx.dofFocusOverride };
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
        if (ctx.dirT <= -900) return false;
        ctx.dirT = Math.max(0, +t || 0);
        return ctx.dirT;
      };
      // FASE 5 — QA do modo diretor: relógio/beat correntes
      window.__solInfo.directorInfo = function(){
        var beat = -1, t = ctx.dirT;
        if (ctx.DIRECTOR_ON && t >= 0){
          beat = t < 10 ? 0 : t < 22 ? 1 : t < 30 ? 2 : t < 48 ? 3 :
                 t < 64 ? 4 : t < 78 ? 5 : 6;
        }
        return { enabled: ctx.DIRECTOR_ON, active: directorActive(),
                 t: +Math.max(-1, t).toFixed(2), beat: beat, pair: ctx.dirPair,
                 flareFired: ctx.dirFlareFired, cmeFired: ctx.dirCmeFired };
      };
    }
  } catch(_){}

  createPanel(ctx);

  function onResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    var newFit = computeFitDist();
    if (ctx.fitDist > 0){ ctx.camDist *= newFit / ctx.fitDist; ctx.targetCamDist *= newFit / ctx.fitDist; }
    ctx.fitDist = newFit;
    ctx.camDist = Math.max(minDist, Math.min(maxDist, ctx.camDist));
    ctx.targetCamDist = Math.max(minDist, Math.min(maxDist, ctx.targetCamDist));
  }
  window.addEventListener('resize', onResize);

  resizeTargets();
  updateCamera();

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

  if (hintEl) {
    hintEl.textContent = hasTouch
      ? 'arraste para girar · pince aproxima · toque duplo enquadra'
      : 'arraste para girar · scroll aproxima · duplo clique enquadra';
  }
  setTimeout(function(){ if(hintEl) hintEl.style.opacity='0'; }, 6000);

  createDirector(ctx);
  var directorTick = ctx.directorTick, directorActive = ctx.directorActive,
      directorStart = ctx.directorStart;

  function animate(){
    requestAnimationFrame(animate);
    var frameT0 = performance.now();
    if (DET && window.__solInfo) window.__solInfo.frame = ++ctx.detFrames;
    var rawDelta = DET
      ? ((DET_HOLD > 0 && ctx.detFrames > DET_HOLD) ? 0 : (1/60))
      : Math.min(clock.getDelta(), 0.1);
    var delta = rawDelta * ctx.TIME_SCALE;
    ctx.elapsed += delta;
    sunUniforms.uTime.value = ctx.elapsed;
    // FASE 5 — modo diretor: coreografa câmera/eventos/knobs por cima
    // do estado (uma comparação sem ?director=1). ctx.dirT=-1 é "ainda não
    // começou" (o tick inicia); -999 é "usuário assumiu" (permanente).
    if (ctx.DIRECTOR_ON && ctx.dirT > -900) directorTick(delta, rawDelta);

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
        ctx.bakeStep = -1; perfBakes.push(frameT0);
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
    spiculeUniforms.uTime.value = ctx.elapsed;

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

    coronaRays.quaternion.copy(camera.quaternion);
    coronaRaysUniforms.uTime.value = ctx.elapsed;
    twinkleUniform.value = ctx.elapsed;
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
      var cvolOn = ctx.CVOL_K > 0.001 && !ctx.cvolKilled && subToggle.corona && subToggle.corona3d;
      if (cvolOn && !ctx.cvolReady) cvolBakeFull();   // ligada ao vivo pelo painel
      coronaVol.visible = cvolOn;
      coronaRaysUniforms.uCvolMix.value = cvolOn ? Math.min(1.0, ctx.CVOL_K) : 0.0;
      if (cvolOn){
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
        ctx.cvolAccum += delta;
        if (ctx.cvolStep < 0 && ctx.cvolAccum >= 0.9){
          ctx.cvolStep = 0; ctx.cvolAccum = 0; snapshotCvolCharges();
        }
        if (ctx.cvolStep >= 0){
          // 1 fatia/frame: 2 fatias custavam ~2.9ms de busy p95 no mid
          // (A/B da rodada; orçamento CPU ≤1ms/frame). O ciclo vira
          // ~64 frames + folga de 0.9s — cadência de sobra para a
          // deriva das cargas (~150s) e para o lapse (ciclo em ~45s)
          bakeCvolSlice(ctx.cvolStep);
          ctx.cvolStep += 1;
          if (ctx.cvolStep >= CVOL_N){
            ctx.cvolStep = -1; ctx.cvolCycles++;
            cvolData.set(cvolStage);        // upload atômico: sem tearing
            cvolTex.needsUpdate = true;
          }
        }
      }
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

    if (pointers.size === 0 && performance.now()-ctx.lastInteraction > 2200 && !directorActive()){
      ctx.theta += 0.066*rawDelta;
      // ?idle=1: câmera idle cinematográfica — deriva orbital + balanço
      // de latitude + respiração de zoom, tudo senoidal (média zero)
      if (ctx.IDLE_CINE){
        ctx.phi += 0.012*Math.sin(ctx.elapsed*0.11)*rawDelta;
        ctx.targetCamDist += Math.sin(ctx.elapsed*0.073)*0.010*rawDelta*ctx.targetCamDist;
      }
    }
    updateCamera();

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
    compUniforms.tStreak.value = streakRTb.texture;
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

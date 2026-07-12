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
        get:function(){ return ctx.BLOOM_STRENGTH_BASE/BLOOM_BASE0; },
        set:function(v){ ctx.BLOOM_STRENGTH_BASE = BLOOM_BASE0*v; } },
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
        get:function(){ return ctx.VEIL_BASE; }, set:function(v){ ctx.VEIL_BASE = v; } },
      { k:'streak', label:'Flare anamórfico', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.STREAK_K; }, set:function(v){ ctx.STREAK_K = v; } },
      { k:'burst', label:'Starburst (difração)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.BURST_K; }, set:function(v){ ctx.BURST_K = v; } },
      { k:'disp', label:'Bloom espectral (dispersão)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.DISP_K; }, set:function(v){ ctx.DISP_K = v; } },
      { k:'hal', label:'Halação quente (corpo negro)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.HAL_K; }, set:function(v){ ctx.HAL_K = v; } },
      { k:'adapt', label:'Olho (adaptação)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return ctx.ADAPT_K; }, set:function(v){ ctx.ADAPT_K = v; } },
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
        get:function(){ return ctx.HAND_K; }, set:function(v){ ctx.HAND_K = v; } },
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
        get:function(){ return ctx.LOOP_K; }, set:function(v){ ctx.LOOP_K = v; } },
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
    var hudSw = document.createElement('div'); hudSw.className = 'sw' + (ctx.hudOn ? ' on' : '');
    hudSw.addEventListener('click', function(){
      hudToggle();
      hudSw.classList.toggle('on', ctx.hudOn);
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
  ctx.flareEnvGrad = flareEnvGrad;
  // flare de SUPERFÍCIE: laço brilhante na plage de uma região madura
  ctx.surfFlareT = 999;
  ctx.surfFlareAmp = 1.0;
  var surfFlareCooldown = 8 + srand()*10;
  var surfFlareDir = new THREE.Vector3(0, 0, 1);
  ctx.surfFlareDir = surfFlareDir;
  // moldura da PIL no ponto do flare: na linha neutra o campo
  // HORIZONTAL aponta ATRAVÉS dela (da polaridade + para a −) — o
  // "perp" sai direto do próprio campo de cargas e a tangente fecha o
  // triedro. Vale para o gatilho natural E para o forceFlareAt de QA.
  var flareTanDir = new THREE.Vector3(1, 0, 0);
  ctx.flareTanDir = flareTanDir;
  var flarePerpDir = new THREE.Vector3(0, 0, 1);
  ctx.flarePerpDir = flarePerpDir;
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
    ctx.surfFlareAmp = Math.min(1.5, 0.55 + 0.55*Math.abs(ps.lead.w));
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
    ctx.dofFocusOverride = -1;
    // devolve os knobs que o diretor emprestou para a vitrine
    if (dirSavedCme >= 0){ ctx.CME_K = dirSavedCme; dirSavedCme = -1; }
    if (dirSavedDof >= 0){ ctx.DOF_K = dirSavedDof; dirSavedDof = -1; }
  }
  ctx.directorUserExit = directorUserExit;
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
    ctx.surfFlareT = 0;
    ctx.surfFlareAmp = amp;
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
    ctx.thetaVel = 0; ctx.phiVel = 0;
    var horizon = Math.acos(Math.min(1, SUN_RADIUS/Math.max(ctx.camDist, SUN_RADIUS*1.001)));
    var w, k;
    if (t < 10){
      // B0 — plano geral: o Sol inteiro, respiração lenta para dentro
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/6.0);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th - 0.9, k);
      ctx.phi += (Math.PI*0.46 - ctx.phi)*k;
      ctx.targetCamDist = ctx.fitDist*(1.28 - 0.018*Math.min(t, 10));
      ctx.dofFocusOverride = -1;
    } else if (t < 22){
      // B1 — push-in: tracking da região protagonista (ela gira com o
      // Sol e a câmera a persegue), foco raso no centro do quadro
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/2.2);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th, k);
      ctx.phi += (dirAng.ph - ctx.phi)*k;
      ctx.targetCamDist += (minDist*1.30 - ctx.targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      ctx.dofFocusOverride = 0.0;
    } else if (t < 30){
      // B2 — reposição ao limbo: a região desliza para a borda (o
      // palco do Thomson) e o foco puxa ao horizonte
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/2.6);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th + horizon*0.94, k);
      ctx.phi += (dirAng.ph*0.5 + Math.PI*0.25 - ctx.phi)*k;
      ctx.targetCamDist += (ctx.fitDist*0.78 - ctx.targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      ctx.dofFocusOverride = 1.0;
    } else if (t < 48){
      // B3 — a erupção: flare X no limbo; a casca desprende ~1s depois
      // (slow rise → impulsiva, sincronizada com o envelope do flare)
      if (!dirFlareFired){ dirFlareFired = true; dirForceFlare(dirPair, 1.35); }
      if (!dirCmeFired && t >= 31.0 && CME_STEPS > 0 && ctx.CME_K > 0.001 && !ctx.cmeKilled){
        dirCmeFired = true; launchCME(1.35);
      }
      w = dirRegionWorld(dirPair); dirAimAt(w);
      k = 1 - Math.exp(-rawDelta/4.5);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th + horizon*0.94, k*0.4);
      ctx.targetCamDist += (ctx.fitDist*0.92 - ctx.targetCamDist)*(1 - Math.exp(-rawDelta/8.0));
      ctx.dofFocusOverride = 1.0;
    } else if (t < 64){
      // B4 — retirada: a casca cruza a coroa, a arcada escura fica
      ctx.dofFocusOverride = -1;
      ctx.targetCamDist += (ctx.fitDist*1.30 - ctx.targetCamDist)*(1 - Math.exp(-rawDelta/6.0));
      ctx.theta += 0.012*rawDelta;
    } else if (t < 78){
      // B5 — time-lapse documental: só a maquinaria de manchas corre
      var up = dirEase((t - 64)/3.0);
      var down = 1 - dirEase((t - 75)/3.0);
      ctx.LAPSE_K = Math.max(dirSavedLapse, 0.85*up*down);
      ctx.theta += 0.010*rawDelta;
    } else if (t < 84){
      // B6 — assentar de volta ao plano geral
      ctx.LAPSE_K = dirSavedLapse;
      ctx.targetCamDist += (ctx.fitDist*1.28 - ctx.targetCamDist)*(1 - Math.exp(-rawDelta/3.0));
      ctx.theta += 0.010*rawDelta;
    } else {
      // loop: próxima volta com outra região protagonista
      dirT = 0; dirPair = (dirPair + 1) % pairStates.length;
      dirFlareFired = false; dirCmeFired = false;
    }
    ctx.phi = Math.max(0.18, Math.min(Math.PI - 0.18, ctx.phi));
  }

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

    sunMesh.rotation.y += ROT_SPEED * delta;
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
    surfFlareCooldown -= delta;
    if (surfFlareCooldown <= 0){
      if (triggerSurfaceFlare()){
        ctx.surfFlareT = 0;
        // FASE 5: flare grande pode soltar CME (sorteio no stream
        // próprio cmeRand; com cme=0 a chamada é um return imediato)
        maybeLaunchCME();
      }
      // sol ativo flareia mais: cooldown encolhe com a atividade global
      surfFlareCooldown = (12 + srand()*14) / (0.5 + 1.1*coronaRaysUniforms.uActivity.value);
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
    sunUniforms.uFlareRib.value.set(sfRib, 0.010, flareSeedVal,
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
      compUniforms.uBurstRot.value = flareSeedVal*0.7 + Math.sin(ctx.elapsed*0.9 + flareSeedVal)*0.03;
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

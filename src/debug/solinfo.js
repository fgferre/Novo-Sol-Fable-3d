// debug/solinfo.js — hooks de QA (__solInfo.*): leitura de estado e
// controles determinísticos. Fecha sobre TODAS as superfícies (último
// módulo); refs de flares/director (factories posteriores no init) são
// adiadas via ctx.*. Corpo verbatim.

export function createSolInfo(ctx){
  var renderer = ctx.renderer, camera = ctx.camera, TIER = ctx.TIER,
      RENDER_SCALE = ctx.RENDER_SCALE, SCALE_STEPS = ctx.SCALE_STEPS,
      autoTuneOn = ctx.autoTuneOn, subToggle = ctx.subToggle,
      perfFrameMs = ctx.perfFrameMs, perfBusyMs = ctx.perfBusyMs,
      perfBakes = ctx.perfBakes, compUniforms = ctx.compUniforms,
      BLOOM_THRESHOLD = ctx.BLOOM_THRESHOLD, sunUniforms = ctx.sunUniforms,
      coronaRaysUniforms = ctx.coronaRaysUniforms, milkyWay = ctx.milkyWay,
      stars = ctx.stars, brightStars = ctx.brightStars, mwNeb = ctx.mwNeb,
      LOOK = ctx.LOOK, CVOL_STEPS = ctx.CVOL_STEPS, CVOL_N = ctx.CVOL_N,
      cvolUniforms = ctx.cvolUniforms,
      spiculeMesh = ctx.spiculeMesh, coronaRays = ctx.coronaRays,
      coronaOuter = ctx.coronaOuter, prominenceGroup = ctx.prominenceGroup,
      sunMesh = ctx.sunMesh, minDist = ctx.minDist, maxDist = ctx.maxDist,
      pairStates = ctx.pairStates, cycleDepth = ctx.act.cycleDepth,
      cyclePolarN = ctx.act.cyclePolarN, CYCLE_PHASE0 = ctx.act.CYCLE_PHASE0,
      CYCLE_PERIOD = ctx.act.CYCLE_PERIOD, updateCycleState = ctx.act.updateCycleState,
      placePair = ctx.act.placePair, lifeEnvelope = ctx.act.lifeEnvelope,
      bFieldJS = ctx.act.bFieldJS, prominenceMeshes = ctx.prominenceMeshes,
      promStates = ctx.promStates, SUN_RADIUS = ctx.SUN_RADIUS,
      sampleProminenceAnchor = ctx.sampleProminenceAnchor,
      placeProminence = ctx.placeProminence, LOOP_AMB = ctx.LOOP_AMB,
      LOOP_ARC = ctx.LOOP_ARC, loopStatesA = ctx.loopStatesA,
      arcStates = ctx.arcStates, loopEnvArr = ctx.loopEnvArr,
      loopMesh = ctx.loopMesh, loopAbsMesh = ctx.loopAbsMesh,
      loopStats = ctx.loopStats, pilStats = ctx.pil.pilStats,
      refreshPILBuffer = ctx.pil.refreshPILBuffer, pilBrAt = ctx.pil.pilBrAt,
      PIL_W = ctx.PIL_W, PIL_H = ctx.PIL_H,
      scheduleFlareArcade = ctx.scheduleFlareArcade, CME_STEPS = ctx.CME_STEPS,
      CME_PTS_N = ctx.CME_PTS_N, cmeGeomAt = ctx.cmeGeomAt,
      launchCME = ctx.launchCME, cmeDir = ctx.cmeDir, cmePts = ctx.cmePts,
      updateCamera = ctx.updateCamera, DET_HOLD = ctx.DET_HOLD;
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
        // Achado 14 (PR7): perfBakes é um RING fixo de 64 timestamps escrito
        // no hot path; perf() é SÓ-LEITURA — conta quantos bakes caíram nos
        // últimos 5s sem podar (a poda antiga só rodava aqui, então com o HUD
        // desligado o array crescia sem limite). A ordem circular é
        // irrelevante para a contagem: basta varrer os perfBakeN slots vivos.
        var now = performance.now();
        var nBakes = 0;
        for (var bi = 0; bi < ctx.perfBakeN; bi++){
          if (now - perfBakes[bi] <= 5000) nBakes++;
        }
        var f = stats(perfFrameMs, ctx.perfN);
        return { tier: TIER, scale: RENDER_SCALE, dpr: ctx.pixelRatio,
                 autoScale: SCALE_STEPS[ctx.scaleIdx],
                 tune: { on: autoTuneOn, events: ctx.tuneEvents },
                 frames: ctx.perfN, ms: f, busy: stats(perfBusyMs, ctx.perfN),
                 fps: f.avg > 0 ? +(1000/f.avg).toFixed(1) : 0,
                 calls: ctx.perfCalls, bakesPerSec: +(nBakes/5).toFixed(2),
                 toggles: JSON.parse(JSON.stringify(subToggle)),
                 size: [renderer.domElement.width, renderer.domElement.height] };
      };
      // painel de knobs ativos (introspecção p/ QA e usuário)
      window.__solInfo.knobs = function(){
        return { speed: ctx.TIME_SCALE, idle: ctx.IDLE_CINE,
                 bloom: compUniforms.uBloomStrength.value,
                 bloomth: ctx.thresholdUniforms.uThreshold.value,
                 bloomknee: ctx.thresholdUniforms.uKnee.value,
                 bloomspread: ctx.downsampleUniforms.uSpread.value,
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
                 spots: ctx.SPOTS_K,
                 director: ctx.DIRECTOR_ON,
                 adaptMul: compUniforms.uAdapt.value,
                 look: LOOK ? 'sunshine' : '' };
      };
      // Contrato canônico dos controles. Sem argumento devolve o mapa
      // completo; com chave devolve um snapshot único. Setters históricos
      // abaixo continuam wrappers, mas toda escrita converge no store.
      window.__solInfo.controls = function(key){
        return key ? ctx.getControlInfo(key) : ctx.getControlsInfo();
      };
      window.__solInfo.setControl = function(key, value){
        if (ctx.directorUserExit) ctx.directorUserExit();
        return ctx.setControl(key, value, { source:'qa', persist:true });
      };
      window.__solInfo.setAutoTuneKill = function(key, on){
        if (key === 'cme') ctx.cmeKilled=!!on;
        else if (key === 'cvol') ctx.cvolKilled=!!on;
        else return false;
        if (ctx.onPerformanceStateChange) ctx.onPerformanceStateChange();
        return ctx.getControlInfo(key);
      };
      window.__solInfo.bloomInfo = function(){ return ctx.measureBloom(); };
      window.__solInfo.perfReset = function(){
        ctx.perfN = 0; ctx.perfIdx = 0; ctx.perfLastT = 0;
        ctx.perfBakeN = 0; ctx.perfBakeIdx = 0;
      };
      // Achado 9 — QA do resize/DPR/auto-tune transacional. cssW/cssH = últimas
      // dims LÓGICAS aplicadas; physW/physH = dims FÍSICAS do drawing buffer/
      // attachments; dpr = DPR EFETIVO (baseDpr·SCALE_STEPS[scaleIdx]); baseDpr =
      // base viva (min(DPR,dprCap)·RENDER_SCALE); dirty = há pedido pendente;
      // applies = passes de aplicação (gate: ≤1/frame); reallocs = realocações de
      // attachments (gate: 0 quando as dims físicas não mudam).
      window.__solInfo.resizeInfo = function(){
        return { cssW: ctx.dispCssW, cssH: ctx.dispCssH,
                 dpr: ctx.pixelRatio, baseDpr: ctx.baseDpr, dprCap: ctx.dprCap,
                 scaleIdx: ctx.scaleIdx, physW: ctx.dispPhysW, physH: ctx.dispPhysH,
                 dirty: !!ctx.displayDirty, applies: ctx.displayApplies,
                 reallocs: ctx.displayReallocs };
      };
      // PR0 — ?profile=1: janela deslizante do timer de GPU (debug/
      // gpuprofile.js). Sem a query o módulo nem inicializa: o hook
      // responde supported:false sem criar query alguma.
      window.__solInfo.gpuPerf = function(){
        return ctx.gpuPerf ? ctx.gpuPerf()
          : { supported: false, samples: 0, avgMs: 0, p95Ms: 0, worstMs: 0 };
      };
      // PR0 — ?diag=1: manifesto do ambiente + ring de eventos (debug/
      // diag.js). Sem a query o módulo nem inicializa: manifest null e
      // ring vazio, sem custo algum no frame.
      window.__solInfo.diagnostics = function(){
        return ctx.diagData ? ctx.diagData() : { manifest: null, events: [] };
      };
      // FASE 4: estado da coroa volumétrica (QA: tier-gate, bake, kill)
      // FASE 6 B2: expõe também os pesos novos (plume uniform / cusp bake)
      // PR2: campos do scheduler assíncrono — requested (pedido de
      // rebake pendente), phase (idle|baking|cooldown), slice (próxima
      // fatia do staging, -1 fora de baking), rate (fatias/s) e
      // cooldown (segundos restantes de descanso pós-publicação)
      window.__solInfo.coronaInfo = function(){
        return { steps: CVOL_STEPS, res: CVOL_N, k: ctx.CVOL_K,
                 on: CVOL_STEPS > 0 && ctx.CVOL_K > 0.001 && !ctx.cvolKilled &&
                     subToggle.corona && subToggle.corona3d,
                 ready: ctx.cvolReady, killed: ctx.cvolKilled, cycles: ctx.cvolCycles,
                 requested: ctx.cvolPending, phase: ctx.cvolPhase,
                 slice: ctx.cvolStep, rate: ctx.CVOL_RATE,
                 cooldown: ctx.cvolPhase === 'cooldown'
                   ? +Math.max(0, ctx.CVOL_COOLDOWN - ctx.cvolAccum).toFixed(3) : 0,
                 plume: cvolUniforms ? cvolUniforms.uPlume.value : 0,
                 cusp: ctx.cvolWCusp };
      };
      window.__solInfo.setCvol = function(v){
        return ctx.setControl('cvol',v,{source:'qa',persist:false});
      };
      // PR2 — re-bake ASSÍNCRONO do volume: agenda um ciclo FORÇADO
      // (snapshot novo no próximo frame; reinicia staging em voo; anda
      // mesmo sob ?hold, com passo sintético 1/60) e devolve o ciclo a
      // aguardar: o QA espera coronaInfo().cycles >= targetCycle em vez
      // do antigo bake síncrono (que era o hitch de 26ms do achado 3).
      window.__solInfo.rebakeCorona = function(){
        if (CVOL_STEPS > 0){
          ctx.cvolPending = true;
          ctx.diagEvent('cvol-request', ctx.cvolCycles + 1);
          return { scheduled: true, targetCycle: ctx.cvolCycles + 1 };
        }
        return { scheduled: false, targetCycle: ctx.cvolCycles };
      };
      // eixos do sweep de calibração (painel de juízes) sem rebuild:
      // pesos do bake de densidade + contraste das raias procedurais.
      // FASE 6 B2 — dois pesos novos, semânticas DIFERENTES:
      //   cusp  -> peso do BAKE (como base/sheet/loop/hole): só surte
      //            efeito após rebakeCorona() (ou o ciclo fatiado);
      //   plume -> UNIFORM do shader: efeito IMEDIATO no próximo frame
      //            (zero rebake — é o eixo barato do sweep).
      window.__solInfo.setCvolShape = function(o){
        o = o || {};
        if (o.base  !== undefined) ctx.cvolWBase  = +o.base;
        if (o.sheet !== undefined) ctx.cvolWSheet = +o.sheet;
        if (o.loop  !== undefined) ctx.cvolWLoop  = +o.loop;
        if (o.hole  !== undefined) ctx.cvolWHole  = +o.hole;
        if (o.cusp  !== undefined) ctx.cvolWCusp  = +o.cusp;
        if (o.plume !== undefined && cvolUniforms)
          cvolUniforms.uPlume.value = Math.min(2, Math.max(0, +o.plume || 0));
        return { base: ctx.cvolWBase, sheet: ctx.cvolWSheet, loop: ctx.cvolWLoop,
                 hole: ctx.cvolWHole, cusp: ctx.cvolWCusp,
                 plume: cvolUniforms ? cvolUniforms.uPlume.value : 0 };
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
          // FASE 6: as manchas virtuais re-emergem junto (grupos na
          // banda da fase nova); com spots=0 é invisível — só desloca
          // o stream próprio spotRand, nunca o srand
          if (ctx.spotsReseed) ctx.spotsReseed();
        }
        return window.__solInfo.cycleInfo();
      };
      // FASE 6 — QA das manchas: knob ao vivo (padrão setCvol), re-
      // emergência dos 5 pares virtuais e leitura de contagem/raios
      // (histograma vs range GONG 0.005-0.086R). Os slots refletem o
      // ÚLTIMO frame renderizado — avance >=1 frame após um hook antes
      // de ler.
      window.__solInfo.setSpots = function(v){
        return ctx.setControl('spots',v,{source:'qa',persist:false});
      };
      window.__solInfo.reseedSpots = function(){
        if (ctx.spotsReseed) ctx.spotsReseed();
        return ctx.spotsInfoData ? ctx.spotsInfoData() : null;
      };
      window.__solInfo.spotsInfo = function(){
        return ctx.spotsInfoData ? ctx.spotsInfoData() : null;
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
        ctx.surfFlareDir.copy(promStates[i].meshes[0].userData.dir).normalize();
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.2;   // QA: o gatilho natural seta via |w|; o forçado usa amp fixa
        ctx.setFlareFrame(ctx.surfFlareDir);
        scheduleFlareArcade();
        return !!ctx.agitateNearestProm(ctx.surfFlareDir);
      };
      // QA FASE 1: flare no ponto MÉDIO do par i — o mesmo alvo do
      // gatilho natural (é onde a arcada fecha compacta; forceFlareAt
      // ancora em PIL de sol calmo, onde pode nem haver arcada)
      window.__solInfo.forceFlarePair = function(i){
        var ps = pairStates[i];
        ctx.surfFlareDir.set(
          (ps.lead.x + ps.foll.x)*0.5,
          (ps.lead.y + ps.foll.y)*0.5,
          (ps.lead.z + ps.foll.z)*0.5).normalize();
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.2;
        ctx.setFlareFrame(ctx.surfFlareDir);
        scheduleFlareArcade();
        ctx.agitateNearestProm(ctx.surfFlareDir);
        return [ctx.surfFlareDir.x, ctx.surfFlareDir.y, ctx.surfFlareDir.z];
      };
      // QA FASE 1: sob ?det&hold o tempo congela (delta=0) e ctx.surfFlareT
      // não avança — fixar o relógio do flare fotografa qualquer fase
      // (impulsiva/gradual) de forma determinística
      window.__solInfo.setFlareClock = function(t){ ctx.surfFlareT = t; };
      window.__solInfo.flareInfo = function(){
        return { t: ctx.surfFlareT, amp: ctx.surfFlareAmp,
                 imp: ctx.flareEnvImp(ctx.surfFlareT), grad: ctx.flareEnvGrad(ctx.surfFlareT),
                 sep: sunUniforms.uFlareGeo.value.w,
                 dir: [ctx.surfFlareDir.x, ctx.surfFlareDir.y, ctx.surfFlareDir.z],
                 tan: [ctx.flareTanDir.x, ctx.flareTanDir.y, ctx.flareTanDir.z],
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
                 ms: +loopStats.ms.toFixed(2),
                 // PR5 (achado 6) — scheduler incremental: fase pendente do
                 // job ambiente (null = sem job em voo) + contadores de
                 // ORÇAMENTO por frame. lastProbe/lastTrace = trabalho da
                 // ÚLTIMA chamada de updateLoops; maxProbe/maxTrace/maxOps =
                 // pico desde o boot (gate: cada ≤1; ops ≤1 = nunca ambos).
                 phase: ctx.loopJob ? ctx.loopJob.phase : null,
                 job: ctx.loopJob
                   ? { slot: ctx.loopJob.slot, tries: ctx.loopJob.tries, fine: ctx.loopJob.fine }
                   : null,
                 lastProbe: ctx.loopLastProbeFrame || 0,
                 lastTrace: ctx.loopLastTraceFrame || 0,
                 maxProbe: ctx.loopMaxProbeFrame || 0,
                 maxTrace: ctx.loopMaxTraceFrame || 0,
                 maxOps: ctx.loopMaxOpsFrame || 0,
                 draws: (loopStats.draws || 0) };
      };
      window.__solInfo.setLoopLife = function(i, x){
        var st = loopStatesA[i];
        if (st && st.ok) st.age = x*st.period;
      };
      // PR5 — liga o knob dos loops ao vivo (padrão setCvol/setSpots). Uso
      // no golden/A/B determinístico: ativar os loops APÓS o freeze do
      // ?hold, quando pairStates e o stream loopRand estão idênticos entre
      // builds e o campo é estático — o retraço então converge para a MESMA
      // geometria seja síncrono (base) ou fatiado por frame (head).
      window.__solInfo.setLoops = function(v){
        return ctx.setControl('loops',v,{source:'qa',persist:false});
      };
      // PR5 — dump determinístico da geometria PUBLICADA dos loops (o
      // "golden"): buffers position/aTan dos slots + estado por slot (RNG-
      // derivado). Leitura PURA (não sorteia, não muta). Avance ≥1 frame
      // após um retraço antes de ler. draws = nº de sorteios loopRand
      // contados no módulo de loops (0 na base sem o contador).
      window.__solInfo.loopDump = function(){
        var g = loopMesh.geometry;
        return { pos: Array.prototype.slice.call(g.attributes.position.array),
                 tan: Array.prototype.slice.call(g.attributes.aTan.array),
                 amb: loopStatesA.map(function(s){ return { ok: s.ok, period: s.period, age: s.age }; }),
                 arc: arcStates.map(function(s){ return { ok: s.ok, off: s.off, delay: s.delay }; }),
                 draws: (loopStats.draws || 0) };
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
        ctx.markInteraction();
        updateCamera();
      };
      // FASE 5 — QA do CME: força a erupção no par i (flare grande +
      // casca, sem o sorteio de probabilidade), fixa o relógio para
      // fotografar qualquer fase, e lê o estado inteiro
      window.__solInfo.forceCME = function(i){
        var ps = pairStates[(i || 0) % pairStates.length];
        ctx.surfFlareDir.set(
          (ps.lead.x + ps.foll.x)*0.5,
          (ps.lead.y + ps.foll.y)*0.5,
          (ps.lead.z + ps.foll.z)*0.5).normalize();
        ctx.surfFlareT = 0;
        ctx.surfFlareAmp = 1.35;
        ctx.setFlareFrame(ctx.surfFlareDir);
        scheduleFlareArcade();
        ctx.agitateNearestProm(ctx.surfFlareDir);
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
        return ctx.setControl('cme',v,{source:'qa',persist:false});
      };
      window.__solInfo.setCmeCore = function(x){
        ctx.cmeCoreGain = Math.min(2.5, Math.max(0, +x || 0));
        return ctx.cmeCoreGain;
      };
      // FASE 6 B3 — pesos de FORMA da casca do CME (padrão setCvolShape;
      // eixos do sweep de calibração sem rebuild). Ambos são UNIFORMS do
      // shader: efeito IMEDIATO no próximo frame, sem rebake.
      //   stria 0-1.2: estrias helicoidais do rim (0 = fbm isotrópico da
      //                F5, ramo do shader byte-idêntico = bit-exato);
      //   cav   0-1.0: rarefação da cavidade por raio (0 = casca da F5
      //                bit-exata; o núcleo NUNCA é atenuado).
      window.__solInfo.setCmeShape = function(o){
        o = o || {};
        if (o.stria !== undefined) ctx.cmeStriaK = Math.min(1.2, Math.max(0, +o.stria || 0));
        if (o.cav !== undefined) ctx.cmeCavK = Math.min(1.0, Math.max(0, +o.cav || 0));
        return { stria: ctx.cmeStriaK, cav: ctx.cmeCavK };
      };
      window.__solInfo.cmeInfo = function(){
        var g = cmeGeomAt(ctx.cmeT < 900 ? ctx.cmeT : 0);
        return { on: ctx.cmeT < 900, t: ctx.cmeT < 900 ? ctx.cmeT : -1, amp: ctx.cmeAmp,
                 count: ctx.cmeCount, steps: CME_STEPS, killed: ctx.cmeKilled,
                 knob: ctx.CME_K, stria: ctx.cmeStriaK, cav: ctx.cmeCavK,
                 cooldown: +ctx.cmeCooldown.toFixed(2),
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
        ctx.directorStart();
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
        return { enabled: ctx.DIRECTOR_ON, active: ctx.directorActive(),
                 t: +Math.max(-1, t).toFixed(2), beat: beat, pair: ctx.dirPair,
                 flareFired: ctx.dirFlareFired, cmeFired: ctx.dirCmeFired };
      };
    }
  } catch(_){}
}

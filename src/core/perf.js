// core/perf.js — ring de perf, HUD on-device, subToggle de subsistemas,
// escala de render e autoTune (kill-switch cvol/cme). Corpo verbatim;
// contadores mutáveis viram ctx.* (animate/solinfo escrevem).

export function createPerf(ctx){
  var renderer = ctx.renderer, urlQ = ctx.urlQ, coarsePointer = ctx.coarsePointer,
      isSoftwareGL = ctx.isSoftwareGL, TIER = ctx.TIER,
      resizeTargets = ctx.resizeTargets, CME_STEPS = ctx.CME_STEPS,
      CVOL_STEPS = ctx.CVOL_STEPS;
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
  ctx.perfIdx = 0, ctx.perfN = 0, ctx.perfLastT = 0, ctx.perfCalls = 0;
  var perfBakes = [];
  var subToggle = { sim:true, bake:true, bloom:true, spicules:true,
                    corona:true, prominences:true, stars:true, loops:true,
                    corona3d:true,     // FASE 4: A/B do raymarch isolado
                    cme:true, cmepts:true };   // FASE 5: A/B da casca/partículas
  ctx.subToggle = subToggle;

  // HUD de perf on-device: ?hud=1 liga na carga; segurar um dedo PARADO
  // ~1s alterna (o arquivo aberto localmente no iPhone não tem como
  // receber query string nem abrir console — o gesto resolve os dois).
  var hudEl = document.createElement('div');
  hudEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:40;' +
    'font:11px/1.5 ui-monospace,Menlo,monospace;color:#aef;' +
    'background:rgba(0,10,20,0.55);padding:6px 9px;border-radius:8px;' +
    'pointer-events:none;white-space:pre;display:none';
  document.body.appendChild(hudEl);
  ctx.hudOn = urlQ.hud === '1';
  if (ctx.hudOn) hudEl.style.display = 'block';
  ctx.hudTimer = 0, ctx.hudDown = null, ctx.hudAccum = 0;
  function hudToggle(){ ctx.hudOn = !ctx.hudOn; hudEl.style.display = ctx.hudOn ? 'block' : 'none'; }

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
  ctx.scaleIdx = 0; var tuneWin = [], tuneGoodT = 0, tuneCooldown = 0; ctx.tuneEvents = 0;
  var autoTuneOn = (urlQ.tune === '1') ||
                   (!urlQ.tier && !(parseFloat(urlQ.scale) > 0) && !isSoftwareGL);
  function applyRenderScale(i){
    ctx.scaleIdx = Math.max(0, Math.min(SCALE_STEPS.length-1, i));
    ctx.pixelRatio = baseDpr * SCALE_STEPS[ctx.scaleIdx];
    renderer.setPixelRatio(ctx.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    ctx.tuneEvents++;
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
      if (ctx.scaleIdx < SCALE_STEPS.length-1){
        applyRenderScale(ctx.scaleIdx+1);
        tuneCooldown = 4; tuneWin.length = 0;
      } else {
        // FASE 5: primeiro degrau do kill — o CME (casca + partículas)
        // cai antes da coroa volumétrica: é efeito EPISÓDICO; se nem a
        // menor escala segura o frame durante uma erupção, a erupção
        // não pode afundar o tier inteiro.
        if (CME_STEPS > 0 && !ctx.cmeKilled && ctx.CME_K > 0.001){
          ctx.cmeKilled = true; ctx.tuneEvents++;
          tuneCooldown = 4; tuneWin.length = 0;
        } else
        // FASE 4: antes de rebaixar o tier persistido, derruba a coroa
        // volumétrica em runtime — se o aparelho não segura o raymarch
        // nem na menor escala, a coroa volta ao plano de gradiente
        // (fallback) e o resto do tier sobrevive. É o gate de código do
        // piso de 24fps: nenhuma medição é pedida ao dono.
        if (CVOL_STEPS > 0 && !ctx.cvolKilled && ctx.CVOL_K > 0.001){
          ctx.cvolKilled = true; ctx.tuneEvents++;
          tuneCooldown = 4; tuneWin.length = 0;
        } else {
          var k = TIER_ORDER.indexOf(TIER);
          if (k > 0){ persistTier(TIER_ORDER[k-1]); tuneCooldown = 1e9; }
        }
      }
    } else if (p95 < TUNE_LO){
      tuneGoodT += delta;
      if (ctx.scaleIdx > 0 && tuneGoodT > 10){
        applyRenderScale(ctx.scaleIdx-1);
        tuneGoodT = 0; tuneCooldown = 6; tuneWin.length = 0;
      } else if (ctx.scaleIdx === 0 && tuneGoodT > 30){
        var k2 = TIER_ORDER.indexOf(TIER);
        // ultra é só para ponteiro fino (desktop): DPR 3 + malha 192
        // afogariam um celular que por acaso sustente 60 no high
        var kMax = coarsePointer ? 2 : TIER_ORDER.length - 1;
        if (k2 < kMax && !urlQ.tier){ persistTier(TIER_ORDER[k2+1]); }
        tuneGoodT = -1e9;   // uma recomendação por sessão
      }
    } else tuneGoodT = 0;
  }
  ctx.hudEl = hudEl; ctx.hudToggle = hudToggle; ctx.persistTier = persistTier;
  ctx.autoTune = autoTune; ctx.autoTuneOn = autoTuneOn;
  ctx.SCALE_STEPS = SCALE_STEPS; ctx.TIER_ORDER = TIER_ORDER;
  ctx.perfFrameMs = perfFrameMs; ctx.perfBusyMs = perfBusyMs; ctx.perfBakes = perfBakes;
}

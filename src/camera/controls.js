// camera/controls.js — órbita/zoom/teclado/toque. Corpo verbatim; o estado
// da câmera (theta/phi/vels/camDist/targetCamDist/fitDist/lastInteraction)
// vira ctx.* — solinfo/director/animate/applyPendingDisplayMetrics escrevem. Listeners DOM
// são ligados NA chamada da factory (posição original do init).

export function createControls(ctx){
  var camera = ctx.camera, renderer = ctx.renderer, SUN_RADIUS = ctx.SUN_RADIUS;
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

  ctx.theta = Math.PI*0.62, ctx.phi = Math.PI*0.42;
  ctx.thetaVel = 0, ctx.phiVel = 0;          // inércia do giro (rad/s)
  ctx.fitDist = computeFitDist();
  ctx.camDist = ctx.fitDist;
  ctx.targetCamDist = ctx.fitDist;           // zoom amortecido: camDist persegue este alvo
  var minDist = SUN_RADIUS*1.5, maxDist = 30;
  ctx.lastInteraction = 0;

  var pointers = new Map();
  var rotLast = null;
  var rotId = null;
  var pinchPrevDist = 0;
  var flingSamples = [];

  function updateCamera(){
    var th = ctx.theta, ph = ctx.phi;
    // offsets de "mão" aplicados só na POSE do frame (theta/phi reais
    // ficam intactos: soltar o knob volta exatamente ao enquadramento)
    if (ctx.HAND_K > 0.001){
      var ht = ctx.elapsed || 0;
      th += ctx.HAND_K*(0.0042*Math.sin(ht*0.291) + 0.0023*Math.sin(ht*0.833+1.7) + 0.0008*Math.sin(ht*2.31+0.4));
      ph += ctx.HAND_K*(0.0031*Math.sin(ht*0.247+0.9) + 0.0017*Math.sin(ht*0.911+2.6) + 0.0007*Math.sin(ht*2.73+1.2));
    }
    var sp = Math.sin(ph);
    camera.position.set(
      ctx.camDist*sp*Math.cos(th),
      ctx.camDist*Math.cos(ph),
      ctx.camDist*sp*Math.sin(th)
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
    ctx.directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch(_){}
    if (pointers.size === 1){
      rotId = e.pointerId;
      rotLast = { x: e.clientX, y: e.clientY };
      ctx.thetaVel = 0; ctx.phiVel = 0;
      flingSamples.length = 0;
      // gesto do HUD: dispara se o dedo ficar parado até o timer vencer
      ctx.hudDown = { x: e.clientX, y: e.clientY };
      clearTimeout(ctx.hudTimer);
      ctx.hudTimer = setTimeout(function(){
        if (ctx.hudDown && pointers.size === 1) ctx.hudToggle();
      }, 1000);
    } else if (pointers.size === 2){
      rotId = null; rotLast = null;
      pinchPrevDist = pointerDistance();
      ctx.hudDown = null; clearTimeout(ctx.hudTimer);
    }
    ctx.lastInteraction = performance.now();
  }

  function onPointerMove(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ctx.hudDown && (Math.abs(e.clientX - ctx.hudDown.x) > 9 ||
                    Math.abs(e.clientY - ctx.hudDown.y) > 9)){
      ctx.hudDown = null; clearTimeout(ctx.hudTimer);
    }

    if (pointers.size >= 2){
      var d = pointerDistance();
      if (pinchPrevDist > 0 && d > 0){
        ctx.targetCamDist *= pinchPrevDist / d;
        ctx.targetCamDist = Math.max(minDist, Math.min(maxDist, ctx.targetCamDist));
      }
      pinchPrevDist = d;
      ctx.lastInteraction = performance.now();
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
      ctx.theta += dth;
      ctx.phi   += dph;
      ctx.phi = Math.max(0.18, Math.min(Math.PI-0.18, ctx.phi));
      // velocidade instantânea (suavizada) para o "arremesso" ao soltar
      var nowT = performance.now();
      var dtv = Math.max(0.008, (nowT - (onPointerMove._t || nowT-16))/1000);
      onPointerMove._t = nowT;
      ctx.thetaVel = ctx.thetaVel*0.65 + (dth/dtv)*0.35;
      ctx.phiVel   = ctx.phiVel*0.65   + (dph/dtv)*0.35;
      // janela p/ estimar o fling no soltar por deslocamento acumulado:
      // robusto a stalls de frame (o estimador acima despenca se um único
      // intervalo entre eventos vier longo). Usa o timestamp do EVENTO:
      // reflete o ritmo real do gesto mesmo com a thread principal travada
      var evT = (e.timeStamp && e.timeStamp > 0) ? e.timeStamp : nowT;
      flingSamples.push({ t: evT, th: ctx.theta, ph: ctx.phi });
      if (flingSamples.length > 12) flingSamples.shift();
      ctx.lastInteraction = nowT;
    }
  }

  function endPointer(e){
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    ctx.hudDown = null; clearTimeout(ctx.hudTimer);
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
          ctx.thetaVel = (newest.th - pick.th)/dtF;
          ctx.phiVel   = (newest.ph - pick.ph)/dtF;
        }
      }
      // com 0-1 amostras, fica o estimador suavizado do arraste
      flingSamples.length = 0;
    }
    ctx.lastInteraction = performance.now();
  }

  function onWheel(e){
    e.preventDefault();
    ctx.directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    ctx.targetCamDist += e.deltaY*0.0035*ctx.targetCamDist;
    ctx.targetCamDist = Math.max(minDist, Math.min(maxDist, ctx.targetCamDist));
    ctx.lastInteraction = performance.now();
  }

  // ---- polimento AAA de controles ----
  // duplo clique / toque duplo: alterna entre enquadramento e close-up
  function toggleFrame(){
    var closeDist = Math.max(minDist*1.12, ctx.fitDist*0.42);
    ctx.targetCamDist = (ctx.targetCamDist > ctx.fitDist*0.72) ? closeDist : ctx.fitDist;
    ctx.lastInteraction = performance.now();
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
    ctx.directorUserExit();   // FASE 5: input devolve a câmera ao usuário
    var k = e.key;
    var handled = true;
    // passo imediato + impulso de inércia: responde já no keydown mesmo
    // se o próximo frame demorar (máquinas lentas), sem mudar o "feel"
    if (k === 'ArrowLeft')       { ctx.thetaVel += 2.0; ctx.theta += 0.08; }
    else if (k === 'ArrowRight') { ctx.thetaVel -= 2.0; ctx.theta -= 0.08; }
    else if (k === 'ArrowUp')    { ctx.phiVel   -= 1.5; ctx.phi = Math.max(0.18, ctx.phi - 0.06); }
    else if (k === 'ArrowDown')  { ctx.phiVel   += 1.5; ctx.phi = Math.min(Math.PI-0.18, ctx.phi + 0.06); }
    else if (k === '+' || k === '=') ctx.targetCamDist = Math.max(minDist, ctx.targetCamDist*0.82);
    else if (k === '-' || k === '_') ctx.targetCamDist = Math.min(maxDist, ctx.targetCamDist*1.22);
    else if (k === 'r' || k === 'R') ctx.targetCamDist = ctx.fitDist;
    else handled = false;
    if (handled){
      e.preventDefault();
      ctx.lastInteraction = performance.now();
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
  ctx.updateCamera = updateCamera; ctx.computeFitDist = computeFitDist;
  ctx.pointers = pointers; ctx.minDist = minDist; ctx.maxDist = maxDist;
}

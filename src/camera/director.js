// camera/director.js — modo diretor: sequência-atração determinística por
// cima dos hooks/knobs. Overrides transitórios vivem no store central;
// valores nominais/persistidos nunca são sobrescritos pela sequência.

import * as THREE from 'three';

export function createDirector(ctx){
  var setFlareFrame = ctx.setFlareFrame, agitateNearestProm = ctx.agitateNearestProm,
      surfFlareDir = ctx.surfFlareDir, pairStates = ctx.pairStates,
      sunMesh = ctx.sunMesh, SUN_RADIUS = ctx.SUN_RADIUS, minDist = ctx.minDist,
      scheduleFlareArcade = ctx.scheduleFlareArcade, launchCME = ctx.launchCME,
      CME_STEPS = ctx.CME_STEPS;
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
  ctx.dirT = -1;
  ctx.dirPair = 0;
  ctx.dirFlareFired = false, ctx.dirCmeFired = false;
  var dirWorldTmp = new THREE.Vector3();
  var dirAng = { th: 0, ph: 0 };
  function directorActive(){ return ctx.DIRECTOR_ON && ctx.dirT >= 0; }
  function directorUserExit(){
    if (!directorActive()) return;
    ctx.dirT = -999;   // permanente: o usuário assumiu a câmera
    ctx.dofFocusOverride = -1;
    ctx.clearControlOverrides('director');
  }
  ctx.directorUserExit = directorUserExit;
  // início pelo PAINEL (a sequência não pode depender de URL): liga o
  // modo em runtime e garante os knobs mínimos da vitrine — CME e foco
  // raso no valor do preset se estiverem abaixo dele (restaurados na
  // saída). Quem já tem os knobs altos não é tocado.
  function directorStart(){
    if (directorActive()) directorUserExit();
    ctx.DIRECTOR_ON = true;
    ctx.dirT = 0;
    ctx.dirFlareFired = false; ctx.dirCmeFired = false;
    ctx.clearControlOverrides('director');
    if (CME_STEPS > 0) ctx.setControlOverride('director','cme',Math.max(ctx.getControl('cme'),0.9));
    ctx.setControlOverride('director','dof',Math.max(ctx.getControl('dof'),0.5));
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
    if (ctx.notifyFlareEvent) ctx.notifyFlareEvent();
  }
  function dirLerpAngle(a, b, k){
    var d = b - a;
    while (d > Math.PI) d -= Math.PI*2;
    while (d < -Math.PI) d += Math.PI*2;
    return a + d*k;
  }
  function directorTick(delta){
    ctx.dirT += delta;
    var t = ctx.dirT;
    ctx.thetaVel = 0; ctx.phiVel = 0;
    var horizon = Math.acos(Math.min(1, SUN_RADIUS/Math.max(ctx.camDist, SUN_RADIUS*1.001)));
    var w, k;
    if (t < 10){
      // B0 — plano geral: o Sol inteiro, respiração lenta para dentro
      w = dirRegionWorld(ctx.dirPair); dirAimAt(w);
      k = 1 - Math.exp(-delta/6.0);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th - 0.9, k);
      ctx.phi += (Math.PI*0.46 - ctx.phi)*k;
      ctx.targetCamDist = ctx.fitDist*(1.28 - 0.018*Math.min(t, 10));
      ctx.dofFocusOverride = -1;
    } else if (t < 22){
      // B1 — push-in: tracking da região protagonista (ela gira com o
      // Sol e a câmera a persegue), foco raso no centro do quadro
      w = dirRegionWorld(ctx.dirPair); dirAimAt(w);
      k = 1 - Math.exp(-delta/2.2);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th, k);
      ctx.phi += (dirAng.ph - ctx.phi)*k;
      ctx.targetCamDist += (minDist*1.30 - ctx.targetCamDist)*(1 - Math.exp(-delta/3.0));
      ctx.dofFocusOverride = 0.0;
    } else if (t < 30){
      // B2 — reposição ao limbo: a região desliza para a borda (o
      // palco do Thomson) e o foco puxa ao horizonte
      w = dirRegionWorld(ctx.dirPair); dirAimAt(w);
      k = 1 - Math.exp(-delta/2.6);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th + horizon*0.94, k);
      ctx.phi += (dirAng.ph*0.5 + Math.PI*0.25 - ctx.phi)*k;
      ctx.targetCamDist += (ctx.fitDist*0.78 - ctx.targetCamDist)*(1 - Math.exp(-delta/3.0));
      ctx.dofFocusOverride = 1.0;
    } else if (t < 48){
      // B3 — a erupção: flare X no limbo; a casca desprende ~1s depois
      // (slow rise → impulsiva, sincronizada com o envelope do flare)
      if (!ctx.dirFlareFired){ ctx.dirFlareFired = true; dirForceFlare(ctx.dirPair, 1.35); }
      if (!ctx.dirCmeFired && t >= 31.0 && CME_STEPS > 0 && ctx.CME_K > 0.001 && !ctx.cmeKilled){
        ctx.dirCmeFired = true; launchCME(1.35);
      }
      w = dirRegionWorld(ctx.dirPair); dirAimAt(w);
      k = 1 - Math.exp(-delta/4.5);
      ctx.theta = dirLerpAngle(ctx.theta, dirAng.th + horizon*0.94, k*0.4);
      ctx.targetCamDist += (ctx.fitDist*0.92 - ctx.targetCamDist)*(1 - Math.exp(-delta/8.0));
      ctx.dofFocusOverride = 1.0;
    } else if (t < 64){
      // B4 — retirada: a casca cruza a coroa, a arcada escura fica
      ctx.dofFocusOverride = -1;
      ctx.targetCamDist += (ctx.fitDist*1.30 - ctx.targetCamDist)*(1 - Math.exp(-delta/6.0));
      ctx.theta += 0.012*delta;
    } else if (t < 78){
      // B5 — time-lapse documental: só a maquinaria de manchas corre
      var up = dirEase((t - 64)/3.0);
      var down = 1 - dirEase((t - 75)/3.0);
      ctx.setControlOverride('director','lapse',Math.max(ctx.getControl('lapse'),0.85*up*down));
      ctx.theta += 0.010*delta;
    } else if (t < 84){
      // B6 — assentar de volta ao plano geral
      ctx.clearControlOverride('director','lapse');
      ctx.targetCamDist += (ctx.fitDist*1.28 - ctx.targetCamDist)*(1 - Math.exp(-delta/3.0));
      ctx.theta += 0.010*delta;
    } else {
      // loop: próxima volta com outra região protagonista
      ctx.dirT = 0; ctx.dirPair = (ctx.dirPair + 1) % pairStates.length;
      ctx.dirFlareFired = false; ctx.dirCmeFired = false;
    }
    ctx.phi = Math.max(0.18, Math.min(Math.PI - 0.18, ctx.phi));
  }
  ctx.directorActive = directorActive; ctx.directorStart = directorStart;
  ctx.directorTick = directorTick;
  // URL e botão percorrem exatamente a mesma inicialização, inclusive os
  // mínimos temporários de CME/DOF e a captura dos valores a restaurar.
  if (ctx.DIRECTOR_ON) directorStart();
}

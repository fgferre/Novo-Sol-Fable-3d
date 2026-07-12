// surface/flares.js — flares de superfície: envelopes, moldura da PIL no
// ponto do flare e gatilho. Corpo verbatim. ⚠ O cooldown inicial consome
// 1×srand e é o ÚLTIMO draw do init (pós-painel) — factory chamada
// exatamente na posição textual original.

import * as THREE from 'three';

export function createFlares(ctx){
  var srand = ctx.srand, loopRand = ctx.loopRand, bFieldJS = ctx.act.bFieldJS,
      promStates = ctx.promStates, pairStates = ctx.pairStates,
      scheduleFlareArcade = ctx.scheduleFlareArcade;
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
  ctx.surfFlareCooldown = 8 + srand()*10;
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
  ctx.flareSeedVal = 0;
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
    ctx.flareSeedVal = loopRand()*100.0;   // recorte das fitas muda por evento
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
  ctx.flareEnvImp = flareEnvImp; ctx.setFlareFrame = setFlareFrame;
  ctx.agitateNearestProm = agitateNearestProm;
  ctx.triggerSurfaceFlare = triggerSurfaceFlare;
}

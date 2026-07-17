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
  // Emissor canônico do evento educativo. Passa apenas primitivos para que
  // o caminho desligado continue sem alocação; natural, preview e QA usam-no.
  function notifyFlareEvent(){
    return ctx.eduEvent('flare',surfFlareDir.x,surfFlareDir.y,surfFlareDir.z,ctx.surfFlareAmp);
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
    notifyFlareEvent();
    return true;
  }
  // Previews de UI usam exatamente a moldura física do flare/CME, mas a
  // escolha da região é determinística e orientada pela câmera: Burst pega
  // a região mais frontal; CME pega a região visível mais perto do limbo,
  // onde o peso de Thomson é máximo.
  var previewObj=new THREE.Vector3(),previewWorld=new THREE.Vector3(),previewCam=new THREE.Vector3();
  function previewRegion(mode){
    previewCam.copy(ctx.camera.position).normalize();
    var best=-1,bestScore=1e9,bestFacing=0;
    for(var i=0;i<pairStates.length;i++){
      var ps=pairStates[i];
      // O gatilho natural só aceita regiões maduras. A prévia usa o mesmo
      // critério para não ressuscitar uma região residual quase sem fluxo.
      if(Math.abs(ps.lead.w)<=Math.abs(ps.baseQ)*0.6)continue;
      previewObj.set((ps.lead.x+ps.foll.x)*0.5,(ps.lead.y+ps.foll.y)*0.5,(ps.lead.z+ps.foll.z)*0.5).normalize();
      previewWorld.copy(previewObj).applyQuaternion(ctx.sunMesh.quaternion);
      var facing=previewWorld.dot(previewCam);
      if(facing<=0.02)continue;
      var score=mode==='burst'?-facing:Math.abs(facing-0.08);
      if(score<bestScore){bestScore=score;best=i;bestFacing=facing;}
    }
    return best<0?null:{index:best,facing:bestFacing,thomson:1-bestFacing*bestFacing};
  }
  function firePreviewPair(sel,amp){
    var ps=pairStates[sel.index];
    surfFlareDir.set((ps.lead.x+ps.foll.x)*0.5,(ps.lead.y+ps.foll.y)*0.5,(ps.lead.z+ps.foll.z)*0.5).normalize();
    ctx.surfFlareT=0;ctx.surfFlareAmp=amp;
    setFlareFrame(surfFlareDir);scheduleFlareArcade();agitateNearestProm(surfFlareDir);
    notifyFlareEvent();
    ctx.surfFlareCooldown=Math.max(ctx.surfFlareCooldown,8);
  }
  function canPreviewBurst(){
    if(ctx.getControl('burst')<=0.001)return {ok:false,reason:'source-empty'};
    if(ctx.surfFlareT<8)return {ok:false,reason:'event-active'};
    var sel=previewRegion('burst');
    return sel?Object.assign({ok:true,reason:''},sel):{ok:false,reason:'not-visible'};
  }
  function previewBurst(){
    var state=canPreviewBurst();if(!state.ok)return state;
    if(ctx.directorUserExit)ctx.directorUserExit();
    var strength=ctx.getControl('burst'),eventAmp=1;
    // A amplitude física do flare é canônica; BURST_K aplica a intensidade
    // nominal uma única vez no consumidor óptico (antes a prévia fazia k²).
    firePreviewPair(state,eventAmp);
    return Object.assign({},state,{amp:strength,strength:strength,eventAmp:eventAmp});
  }
  function canPreviewCME(){
    if(ctx.getControl('cme')<=0.001)return {ok:false,reason:'source-empty'};
    if(ctx.CME_STEPS<=0)return {ok:false,reason:'tier-unavailable'};
    if(ctx.cmeKilled)return {ok:false,reason:'autotune-disabled'};
    if(ctx.surfFlareT<8)return {ok:false,reason:'event-active'};
    if(ctx.cmeT<900)return {ok:false,reason:'event-active'};
    if(ctx.cmeCooldown>0)return {ok:false,reason:'cooldown'};
    var sel=previewRegion('cme');
    return sel?Object.assign({ok:true,reason:''},sel):{ok:false,reason:'not-visible'};
  }
  function previewCME(){
    var state=canPreviewCME();if(!state.ok)return state;
    if(ctx.directorUserExit)ctx.directorUserExit();
    var strength=ctx.getControl('cme'),eventAmp=1;
    // CME_K controla o brilho uma vez em updateCME; o evento-fonte não
    // replica o knob, evitando a resposta quadrática das prévias antigas.
    firePreviewPair(state,eventAmp);ctx.launchCME(eventAmp);
    return Object.assign({},state,{amp:strength,strength:strength,eventAmp:eventAmp});
  }
  ctx.flareEnvImp = flareEnvImp; ctx.setFlareFrame = setFlareFrame;
  ctx.agitateNearestProm = agitateNearestProm;
  ctx.notifyFlareEvent = notifyFlareEvent;
  ctx.triggerSurfaceFlare = triggerSurfaceFlare;
  ctx.canPreviewBurst=canPreviewBurst;ctx.previewBurst=previewBurst;
  ctx.canPreviewCME=canPreviewCME;ctx.previewCME=previewCME;
}

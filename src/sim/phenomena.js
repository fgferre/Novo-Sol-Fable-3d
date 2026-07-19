// sim/phenomena.js — PR-7 (Série Museu): fonte ÚNICA da física observável.
//
// Antes deste módulo, a mesma pergunta ("há um flare agora? qual é o melhor
// par magnético? estamos no máximo do ciclo?") era respondida por três
// lugares com limiares mágicos próprios: tour.js, os emissores educativos de
// main.js e o adaptador de QA em solinfo.js. Um refactor de uniform quebraria
// a visita em silêncio. Aqui a leitura vira adaptador único:
//
//   ctx.phenomena = { flare, cme, spots, prominence, loops, corona, cycle }
//
// Regras do módulo:
//  - LEITURA PURA. Nenhum getter cria DOM, toca GPU, muda estado da simulação
//    ou consulta relógio. Os únicos "efeitos" são cópias em vetores scratch
//    (out/temporários reutilizados — padrão do resto do app, zero alocação).
//  - Construído SEMPRE, inclusive sob ?det=1 — como é só leitura, existir não
//    custa nada e os consumidores (todos gated fora do det) nunca o chamam lá.
//  - Fecha sobre ctx e lê ctx.* LAZILY (na chamada, não na construção): vários
//    campos (surfFlareDir, camDirN) nascem depois desta factory no init.
//  - A inércia/chaves educativas (eduAnnouncedGeneration, eduCycleMaxKey…)
//    continuam nos CONSUMIDORES — este módulo responde "o que é físico agora",
//    nunca "o que já foi contado".

import * as THREE from 'three';

// Limiares NOMEADOS da física observável. Todo número aqui existia antes como
// literal mágico no consumidor indicado no comentário — o valor é o herdado,
// byte a byte (refactor puro: nenhum limiar foi "corrigido" nesta migração).
export var PHEN_T = {
  // -- manchas (pares magnéticos lead/foll) --------------------------------
  PAIR_STRENGTH_TOUR: .55,    // tour.js frontPair: par "físico" p/ a visita
  SPOTS_STRENGTH_EMIT: .70,   // main.js: força mínima p/ a descoberta espontânea
  // -- proeminência / filamento -------------------------------------------
  // ATENÇÃO — divergência HERDADA: o emissor espontâneo exige absorção .055
  // e a visita aceita .02. Ninguém sabe se é intencional; os dois valores
  // ganham nome aqui de propósito, SEM unificar — julgar (e possivelmente
  // colapsar num só) é assunto de PR próprio, com prova visual.
  FILAMENT_ABSORB_EMIT: .055, // main.js emissor: isFilament
  FILAMENT_ABSORB_TOUR: .02,  // tour.js updateSourceVisibility: sala filamento
  PROM_EMIT: .34,             // main.js emissor: isProminence (emissão no limbo)
  PROM_FACING: .28,           // main.js emissor: isProminence (fora do disco)
  PROM_EMIT_TOUR: .04,        // tour.js: proeminência visível p/ a sala da visita
  PROM_MATURE_TOUR: .1,       // tour.js matureProm: env·fieldK mínimo "físico"
  PROM_ENV_EMIT: .98,         // main.js emissor: só anuncia estrutura madura
  PROM_FIELD_EMIT: .52,       // main.js emissor: só anuncia sob campo real
  // -- flare de superfície -------------------------------------------------
  FLARE_ACTIVE_MAX_T: 12,     // tour.js: flare ainda "acontecendo" (t em s)
  FLARE_READY_MIN: .08,       // tour.js tickStep: envelope já subiu
  FLARE_READY_MAX: 10,        // tour.js tickStep: ainda não esmaeceu
  // -- CME -----------------------------------------------------------------
  CME_DONE_T: 900,            // sentinela do relógio: t>=900 = sem evento
  CME_READY_MIN: .18,         // tour.js tickStep: casca já saiu do disco
  CME_READY_MAX: 10,          // tour.js tickStep: frente ainda em cena
  // -- loops coronais ------------------------------------------------------
  LOOP_KNOB_MIN: .01,         // tour.js: knob de loops efetivamente ligado
  LOOP_ARC_ENV_MIN: .004,     // envelope mínimo p/ contar arco pós-flare vivo
  // PR-8 (NOVO, não herdado — nasce já nomeado): brilho mínimo do loop mais
  // forte p/ a descoberta espontânea. Um arco recém-nascido ou quase apagado
  // não sustenta um cartão de museu ("nada prometido que não está na tela").
  LOOP_EMIT_ENV_MIN: .06,
  // -- ciclo de 11 anos ----------------------------------------------------
  CYCLE_PHASE_WIN: .04,       // janela de fase em torno do máximo/mínimo
  CYCLE_MAX_AMP: 1.12,        // amplitude mínima p/ "máximo solar"
  CYCLE_MIN_AMP: .5,          // amplitude máxima p/ "mínimo solar"
  // -- vista / aproximação (PR-9, NOVOS — nascem já nomeados) ---------------
  // Calibração medida na geometria real (SUN_RADIUS=2.2, fov 42°, R_FIT
  // 1.15R, minDist 1.5R): no fit closeness=1.00 e limbFraction≈0.88–0.92
  // (qualquer aspecto) — nenhum dos dois limiares dispara sem gesto de
  // aproximação. CLOSEUP_RATIO 1.6 ⇒ camDist<fitDist/1.6 (≈1.87R em
  // paisagem; o zoom máximo chega a 1.5R ⇒ closeness máx ≈2.0 — alcançável
  // em todo aspecto). LIMB_FILL 1.15 ⇒ o raio projetado do disco estoura a
  // menor dimensão do quadro em 15% (paisagem: d≈2.48R, closeness≈1.21;
  // retrato 390×844: d≈5.0R, closeness≈1.30) — cruza ANTES do close-up no
  // zoom contínuo: primeiro a franja do limbo, depois só superfície.
  CLOSEUP_RATIO: 1.6,         // granulação: camDist < fitDist/1.6 sustentado
  LIMB_FILL: 1.15             // espículas: disco estoura o quadro em 15%+
};

export function createPhenomena(ctx){
  // scratch reutilizado do facing das proeminências (zero alocação por chamada)
  var facingTmp = new THREE.Vector3();

  // Região magnética i no MESMO contrato do adaptador de QA
  // (__solInfo.eduSpotRegion): direção = soma lead+foll normalizada; força =
  // min(leadK, follK) com o follower medido contra 85% do baseQ. `len` extra
  // é o módulo do vetor ANTES de normalizar (guarda de geometria degenerada
  // do emissor de main.js).
  function spotRegion(i){
    var ps = ctx.pairStates[i];
    if (!ps) return null;
    var leadK = Math.abs(ps.lead.w)/Math.max(.001, Math.abs(ps.baseQ));
    var follK = Math.abs(ps.foll.w)/Math.max(.001, Math.abs(ps.baseQ)*.85);
    var x = ps.lead.x + ps.foll.x, y = ps.lead.y + ps.foll.y, z = ps.lead.z + ps.foll.z;
    var len = Math.sqrt(x*x + y*y + z*z), l = len || 1;
    return { sourceId: i, generation: ps.eduGeneration,
             dir: [x/l, y/l, z/l], strength: Math.min(leadK, follK), len: len };
  }

  ctx.phenomena = {
    flare: {
      // "há um flare em cena": relógio dentro da janela E amplitude real
      active: function(){ return ctx.surfFlareT < PHEN_T.FLARE_ACTIVE_MAX_T && ctx.surfFlareAmp > 0; },
      t: function(){ return ctx.surfFlareT; },
      amp: function(){ return ctx.surfFlareAmp; },
      // direção em espaço do OBJETO (o consumidor aplica a quaternion do Sol)
      dir: function(out){ return out.copy(ctx.surfFlareDir); }
    },
    cme: {
      // subsistema existe neste tier e não foi morto pelo auto-tune
      available: function(){ return !(ctx.CME_STEPS <= 0 || ctx.cmeKilled); },
      active: function(){ return ctx.cmeT > 0 && ctx.cmeT < PHEN_T.CME_DONE_T; },
      t: function(){ return ctx.cmeT; },
      // raio da frente da casca (em R_sun) no instante corrente — mesma
      // convenção do __solInfo.cmeInfo (t saturado em 0 sem evento)
      front: function(){ return ctx.cmeGeomAt(ctx.cmeT < PHEN_T.CME_DONE_T ? ctx.cmeT : 0).front; },
      dir: function(out){ return out.copy(ctx.cmeDir); }
    },
    spots: {
      region: spotRegion,
      // o "melhor par magnético" (antes duplicado em tour.frontPair e
      // aproximado no eduSpotRegion do QA): argmax da força sobre os pares
      best: function(){
        var bi = -1, bk = -1;
        for (var i = 0; i < ctx.pairStates.length; i++){
          var ps = ctx.pairStates[i];
          var k = Math.min(Math.abs(ps.lead.w)/Math.max(.001, Math.abs(ps.baseQ)),
                           Math.abs(ps.foll.w)/Math.max(.001, Math.abs(ps.baseQ)*.85));
          if (k > bk){ bk = k; bi = i; }
        }
        return bi < 0 ? null : spotRegion(bi);
      }
    },
    prominence: {
      // Fotografia observável da estrutura i — os MESMOS sinais que o render
      // acabou de escrever (uIntensity/uAbsorb), nunca inferência de cor.
      // mode: 1 = só emissão/nada, 2 = filamento, 3 = filamento+proeminência
      // (contrato herdado de ctx.promEduModes). dir é o Vector3 vivo do
      // userData (leitura; não mutar). Exige ctx.camDirN do frame corrente.
      state: function(i){
        var ps = ctx.promStates[i];
        if (!ps) return null;
        var emit = Math.max(ps.meshes[0].material.uniforms.uIntensity.value,
                            ps.meshes[1].material.uniforms.uIntensity.value);
        var absorb = ps.flat && ps.flat.visible ? ps.flat.material.uniforms.uAbsorb.value : 0;
        var dir = ps.meshes[0].userData.dir;
        var facing = facingTmp.copy(dir).applyQuaternion(ctx.prominenceGroup.quaternion).dot(ctx.camDirN);
        var isFilament = absorb >= PHEN_T.FILAMENT_ABSORB_EMIT;
        var isProminence = emit >= PHEN_T.PROM_EMIT && facing < PHEN_T.PROM_FACING;
        return { mode: isFilament ? (isProminence ? 3 : 2) : 1,
                 isFilament: isFilament, isProminence: isProminence,
                 emit: emit, absorb: absorb, facing: facing,
                 env: ps.env || 0, fieldK: ps.fieldK || 0,
                 dir: dir, generation: ps.eduGeneration };
      }
    },
    loops: {
      // ao menos uma linha de campo ambiente realmente traçada (não só o knob)
      anyAmbient: function(){
        for (var i = 0; i < ctx.loopStatesA.length; i++) if (ctx.loopStatesA[i].ok) return true;
        return false;
      },
      counts: function(){
        var amb = 0, arc = 0, i;
        for (i = 0; i < ctx.LOOP_AMB; i++) if (ctx.loopStatesA[i].ok) amb++;
        for (i = 0; i < ctx.LOOP_ARC; i++)
          if (ctx.arcStates[i].ok && ctx.loopEnvArr[ctx.LOOP_AMB + i] > PHEN_T.LOOP_ARC_ENV_MIN) arc++;
        return { amb: amb, arc: arc };
      },
      // PR-8 — âncora observável do emissor espontâneo: o loop ambiente ok de
      // maior envelope corrente. `dir` é a SEMENTE real do traçado (nasce em
      // atmosphere/loops.js no sucesso do RK4 — sinal novo no módulo dono,
      // exposto aqui), espaço do objeto (consumidor aplica a quaternion do
      // Sol). env>0 implica camada ligada e desenhada (updateLoops zera os
      // envelopes ambientes com loops desligados) — best() nunca aponta para
      // um arco que não está na tela.
      best: function(){
        var bi = -1, be = 0;
        for (var i = 0; i < ctx.LOOP_AMB; i++){
          var st = ctx.loopStatesA[i];
          if (st.ok && ctx.loopEnvArr[i] > be){ be = ctx.loopEnvArr[i]; bi = i; }
        }
        return bi < 0 ? null : { slot: bi, env: be, dir: ctx.loopStatesA[bi].dir };
      }
    },
    corona: {
      // PR-6 — gate da coroa por FÓTONS, não por objeto (migrado de tour.js).
      // O antigo `physical=!!ctx.coronaRays` era tautológico (o mesh existe em
      // todo tier). Físico de verdade = o plano de raias está no draw E os
      // uniforms que produzem luz no anel (uHalo/uRayBoost) são positivos.
      photons: function(){
        var u = ctx.coronaRaysUniforms;
        return !!(ctx.coronaRays && ctx.coronaRays.visible &&
                  u && u.uHalo && u.uHalo.value > 0 && u.uRayBoost && u.uRayBoost.value > 0);
      },
      // intensidades correntes do anel (p/ o emissor de coroa do PR-8)
      raysStrength: function(){
        var u = ctx.coronaRaysUniforms;
        if (!u) return { halo: 0, ray: 0, activity: 0 };
        return { halo: u.uHalo.value, ray: u.uRayBoost.value, activity: u.uActivity.value };
      }
    },
    cycle: {
      phase01: function(){ return ctx.cyclePhase01; },
      ampK: function(){ return ctx.cycleAmpK; },
      atMax: function(){
        return Math.abs(ctx.cyclePhase01 - .5) < PHEN_T.CYCLE_PHASE_WIN &&
               ctx.cycleAmpK > PHEN_T.CYCLE_MAX_AMP;
      },
      atMin: function(){
        return (ctx.cyclePhase01 < PHEN_T.CYCLE_PHASE_WIN ||
                ctx.cyclePhase01 > 1 - PHEN_T.CYCLE_PHASE_WIN) &&
               ctx.cycleAmpK < PHEN_T.CYCLE_MIN_AMP;
      }
    },
    view: {
      // PR-9 — sinais de APROXIMAÇÃO (geometria de câmera, não física do
      // plasma; entram aqui porque são a CONDIÇÃO observável das descobertas
      // de close-up — a mesma régua "o que está na tela agora" do resto do
      // módulo). closeness: razão fitDist/camDist — 1 = enquadramento cheio,
      // >1 = mais perto que o fit (a MESMA conta do LOD dos strands e do DOF
      // em main.js). Leitura pura: nada de DOM/estado.
      closeness: function(){ return ctx.fitDist / Math.max(1e-6, ctx.camDist); },
      // limbFraction: raio PROJETADO do disco (px) sobre metade da MENOR
      // dimensão do viewport — a mesma matemática do diskRect da visita
      // (tour.stateSnapshot): raio_px = tan(asin(R/d))/tan(fov/2)·h/2 (fov é
      // vertical ⇒ h). >1 = o disco não cabe na menor dimensão; o limbo
      // cruza o quadro. Número (não booleano): o consumidor escolhe o limiar
      // (PHEN_T.LIMB_FILL) e o QA lê o valor cru. Dimensões: as CSS já
      // aplicadas ao render (ctx.dispCssW/H, achado 9), com fallback ao
      // window para leituras antes da 1ª aplicação.
      limbFraction: function(){
        var w = ctx.dispCssW || window.innerWidth || 1;
        var h = ctx.dispCssH || window.innerHeight || 1;
        var dist = Math.max(ctx.camDist, ctx.SUN_RADIUS*1.001);
        var half = (ctx.camera.fov || 42) * Math.PI / 360;
        var radius = Math.tan(Math.asin(Math.min(1, ctx.SUN_RADIUS/dist))) / Math.tan(half) * h * .5;
        return radius / (Math.min(w, h) * .5);
      }
    }
  };
}

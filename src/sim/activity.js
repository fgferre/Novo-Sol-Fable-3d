// sim/activity.js — modelo magnético: cargas/regiões ativas, ciclo de 11
// anos e bFieldJS (espelho JS do BFIELD_GLSL). Corpo movido verbatim;
// buildCharges/seedSimulation rodam NA CHAMADA da factory (posição do init).

import * as THREE from 'three';
import { cycleDepthFor, cycleEasingFor, cycleMultiplierFor } from '../core/controls.js';

export function createActivity(ctx){
  var srand = ctx.srand, simUniforms = ctx.simUniforms,
      seedSimulation = ctx.gran.seedSimulation;
  // ---------------------------------------------------------------
  // MODELO MAGNÉTICO: o que organiza a cromosfera real é o campo B.
  // Aproximamos com cargas pontuais logo abaixo da superfície:
  //  - 4 regiões ativas BIPOLARES (par líder/seguidor separado em
  //    longitude, em faixas de latitude, polaridade do líder oposta por
  //    hemisfério — lei de Hale);
  //  - 2 cargas polares fracas (dipolo global de fundo).
  // Tudo deriva do MESMO campo: fibrilas seguem B tangencial, filamentos
  // vivem nas linhas neutras (Br=0), manchas nos pés das cargas, plage
  // onde |B| é forte. Posições em espaço do objeto: giram com a esfera.
  // ---------------------------------------------------------------
  var charges = [];
  var pairStates = [];
  function sphDir(lo, la){
    return new THREE.Vector3(Math.cos(la)*Math.cos(lo), Math.sin(la), Math.cos(la)*Math.sin(lo));
  }
  // ---------------------------------------------------------------
  // FASE 3 — CICLO DE 11 ANOS. Um escalar de fase (cyclePhase01) modula
  // a maquinaria de lifecycle que já existe:
  //  - lei de Spörer: a banda de emergência migra de ±35° para ±5° ao
  //    longo do ciclo (diagrama borboleta) — placePair reaproveita o
  //    MESMO sorteio de latitude (o stream do srand não desloca);
  //  - envelope de atividade: |q| das regiões cresce ao máximo (~fase
  //    0.35) e definha no mínimo — uActivity (coroa, cooldown de flare,
  //    íris) segue de graça ("uma estrela, um estado");
  //  - flip de Hale: a polaridade líder/seguidor inverte por ciclo
  //    (ps.polSign, aplicado na emergência — regiões vivas não trocam);
  //  - reversão polar: o dipolo de fundo cruza zero perto do máximo
  //    (fase ~0.45) e renasce invertido (cargas polares moduladas).
  // Tempo comprimido com honestidade de VFX: 11 anos ~ CYCLE_PERIOD
  // unidades simuladas (~30 min a speed=1); lapse acelera até ~×40.
  // Com cycle=0 NADA disto roda: fase congelada em 0.35 (meio de
  // ciclo), polSign=1, ampK=1, cargas polares intocadas — o frame
  // default é pixel-idêntico ao baseline (gate qa:parity + A/B 0px).
  // ---------------------------------------------------------------
  var CYCLE_PERIOD = 1800;    // unidades de tempo simulado por ciclo
  var CYCLE_PHASE0 = 0.35;    // fase do sol default (meio de ciclo)
  ctx.cycleTime = 0;          // só anda com o ciclo ligado
  ctx.cycleWarp = 0;          // tempo EXTRA acumulado p/ as regiões (lapse)
  ctx.cyclePhase01 = CYCLE_PHASE0;
  ctx.cycleN = 0;             // índice do ciclo (paridade => Hale)
  ctx.cycleHale = 1;          // sinal de Hale do ciclo corrente
  ctx.cycleAmpK = 1;          // ganho global de atividade
  ctx.cyclePolF = 1;          // fator do dipolo polar (1 = default)
  // EVENTO "máximo/mínimo solar" (prévia do painel + hook de QA): boost
  // TEMPORÁRIO do multiplicador do relógio do ciclo até um alvo de fase,
  // segura ~20 s no alvo (relógio parado) e devolve ao ritmo normal.
  // Mesma física, tempo comprimido — nenhum uniform é setado na mão.
  // Com evento nulo, cycleEventMul=1 e nada muda (caminho det intocado).
  ctx.solarMaxK = 0;          // 0 em amp<=1.0, 1 em amp>=1.14 (smoothstep)
  ctx.cycleEventMul = 1;
  var cycleEvent = null;
  var CYCLE_EVT_RAMP = 6;     // s simulados de subida até o alvo
  var cyclePolarN = null, cyclePolarS = null;
  function cycleMultiplier(){
    // durante um evento o boost É o multiplicador (0 no hold = relógio
    // parado no pico); fora dele, a lei de sempre derivada do lapse
    return cycleEvent ? ctx.cycleEventMul : cycleMultiplierFor(ctx.LAPSE_K);
  }
  function cycleDepth(){
    // lapse sozinho liga o ciclo (modo documental de um toque)
    return cycleDepthFor(ctx.CYCLE_K, ctx.LAPSE_K);
  }
  function updateCycleState(){
    var d = cycleDepth();
    var tot = CYCLE_PHASE0 + ctx.cycleTime / CYCLE_PERIOD;
    ctx.cycleN = Math.floor(tot);
    ctx.cyclePhase01 = tot - ctx.cycleN;
    ctx.cycleHale = ((ctx.cycleN % 2) + 2) % 2 === 0 ? 1 : -1;
    // atividade: sobe rápido ao máximo (~0.35), decai lento. Piso 0.10
    // e swing maior (painel de juízes F3: max↔min a "~1 stop" não
    // contava a história — o mínimo precisa de disco quase limpo, ver
    // ref-06 vs ref-07); em fase 0.35 vale ~1.03 (ligar o knob não dá
    // pop perceptível nas regiões vivas)
    var amp = 0.10 + 1.06 * Math.pow(Math.sin(Math.PI * ctx.cyclePhase01), 1.15);
    ctx.cycleAmpK = 1.0 + (amp - 1.0) * d;
    // EVENTO DE MÁXIMO — escalar de apresentação derivado da física:
    // smoothstep(1.0, 1.14, ampK). Teto real do amp = 1.16 (fase 0.5,
    // d=1). Com o ciclo desligado (d=0) ampK=1.0 => maxK=0 exato — o
    // frame default/det permanece byte-idêntico por construção.
    var mk = (ctx.cycleAmpK - 1.0) / 0.14;
    mk = mk < 0 ? 0 : (mk > 1 ? 1 : mk);
    ctx.solarMaxK = mk * mk * (3.0 - 2.0 * mk);
    // dipolo polar: cruza zero na fase 0.45 (reversão no máximo) e
    // satura invertido no fim do ciclo; contínuo na virada de ciclo
    // porque o sinal de Hale flipa junto
    var pol = Math.cos(Math.PI * Math.min(1.0, ctx.cyclePhase01 / 0.9)) * ctx.cycleHale;
    ctx.cyclePolF = 1.0 + (pol - 1.0) * d;
    if (cyclePolarN){
      cyclePolarN.w =  0.5 * ctx.cyclePolF;
      cyclePolarS.w = -0.5 * ctx.cyclePolF;
    }
  }
  // lei de Spörer: banda de emergência na fase corrente. latR é o MESMO
  // sorteio uniforme que o caminho default consome — sem chamadas novas
  // de srand(). defLat entra p/ o blend suave de profundidade do knob.
  function cycleEmergenceLat(latR, hemi, defLat){
    var d = cycleDepth();
    var latC = (35.0 - 30.0 * ctx.cyclePhase01) * (Math.PI / 180.0);
    var latW = (8.0 - 4.0 * ctx.cyclePhase01) * (Math.PI / 180.0);
    var lat = Math.max(0.035, latC + (latR * 2.0 - 1.0) * latW);
    return defLat + (hemi * lat - defLat) * d;
  }
  function placePair(ps){
    // Uma nova posição equivale a uma nova região magnética física. A
    // geração dá identidade estável à descoberta educativa sem depender
    // dos pontos visuais auxiliares de manchas.
    ps.eduGeneration++;
    // rejeição: regiões ativas independentes não nascem sobrepostas —
    // exige distância angular mínima dos líderes das outras regiões
    var lat, lon, lead;
    for (var attempt = 0; attempt < 24; attempt++){
      var latR = srand();
      lat = ps.hemi * (0.24 + latR*0.30);
      // FASE 3 — lei de Spörer: com o ciclo ligado a banda migra
      // 35°→5°; reaproveita latR (stream do srand intocado)
      if (cycleDepth() > 0.001) lat = cycleEmergenceLat(latR, ps.hemi, lat);
      lon = srand()*Math.PI*2;
      lead = sphDir(lon, lat);
      var minAng = Math.PI, minLon = Math.PI;
      for (var j = 0; j < pairStates.length; j++){
        var other = pairStates[j];
        if (other === ps || !other.lead) continue;
        var od = new THREE.Vector3(other.lead.x, other.lead.y, other.lead.z);
        if (od.lengthSq() < 1e-6) continue;
        minAng = Math.min(minAng, lead.angleTo(od.normalize()));
        // separação LONGITUDINAL mínima entre pares vivos (envelope
        // GONG 2012-2026): sem ela os pares sorteavam no mesmo lado e a
        // teia de linhas neutras — e os filamentos — aglomerava num
        // hemisfério; fallback após 24 tentativas = comportamento antigo
        var dl = Math.abs(lon - Math.atan2(od.z, od.x));
        dl = dl % (Math.PI*2); if (dl > Math.PI) dl = Math.PI*2 - dl;
        minLon = Math.min(minLon, dl);
      }
      if (minAng > 0.55 && minLon >= 1.2) break;
    }
    // lei de Joy: o par é inclinado — o seguidor fica mais perto do polo;
    // separação maior que o raio das manchas (pares reais não se tocam)
    var sep = 0.19 + srand()*0.10;
    var follLat = lat + ps.hemi * sep * (0.105 + srand()*0.071);   // tilt de Joy 6-10 graus
    lead.multiplyScalar(0.88);
    var foll = sphDir(lon+sep, follLat).multiplyScalar(0.88);
    ps.lead.set(lead.x, lead.y, lead.z, ps.lead.w);
    ps.foll.set(foll.x, foll.y, foll.z, ps.foll.w);
    // FASE 3 — flip de Hale: a região que EMERGE carrega a polaridade
    // do ciclo corrente (regiões vivas não trocam de sinal no meio da
    // vida). Com o ciclo desligado, polSign=1 = comportamento de sempre.
    ps.polSign = (cycleDepth() > 0.001) ? ctx.cycleHale : 1;
  }
  (function buildCharges(){
    for (var i=0;i<4;i++){
      var hemi = (i%2===0) ? 1 : -1;
      var q = (1.0 + srand()*0.8) * hemi;
      var lead = new THREE.Vector4(0,0,0, q);
      var foll = new THREE.Vector4(0,0,0, -q*0.85);
      charges.push(lead); charges.push(foll);
      // ciclo de vida: emerge -> madura -> decai -> some (e renasce em
      // outro lugar). Fases espalhadas: sempre há 2-3 regiões vivas.
      var ps = {
        lead: lead, foll: foll, baseQ: q, hemi: hemi,
        period: 150 + srand()*90,
        phase: 0, reborn: false, polSign: 1,
        eduGeneration: -1, eduAnnouncedGeneration: -1
      };
      ps.phase = (i/4 + srand()*0.1) * ps.period;
      placePair(ps);
      pairStates.push(ps);
    }
    charges.push(cyclePolarN = new THREE.Vector4(0,  0.55, 0,  0.5));
    charges.push(cyclePolarS = new THREE.Vector4(0, -0.55, 0, -0.5));
  })();
  // FASE 3: com ?cycle/?lapse na URL o estado do ciclo (amp, dipolo
  // polar) vale desde o primeiro frame/seed do sim; com knob=0 é no-op
  updateCycleState();
  simUniforms.uChargesSim.value = charges;
  seedSimulation();
  function lifeEnvelope(x){   // x em 0..1 dentro do período
    if (x < 0.14) { var a = x/0.14; return a*a*(3.0-2.0*a); }
    if (x < 0.58) return 1.0;
    if (x < 0.90) { var b = (x-0.58)/0.32; return 1.0 - b*b*(3.0-2.0*b); }
    return 0.0;
  }
  // BLOCO C (rodada de movimento): sob LAPSE o relógio das regiões corre
  // ~×27-40 e o nascimento/morte de plage/faculae vira POP no limbo
  // (strobo 1.10% no cenário lapse vs 0.46% idle — baseline temporal).
  // Rampas esticadas ×1.75 (nascimento 0.14→0.245, morte 0.32→0.56;
  // a morte segue terminando em 0.90 — o renascimento não muda de fase).
  function lifeEnvelopeLapse(x){
    if (x < 0.245) { var a = x/0.245; return a*a*(3.0-2.0*a); }
    if (x < 0.34) return 1.0;
    if (x < 0.90) { var b = (x-0.34)/0.56; return 1.0 - b*b*(3.0-2.0*b); }
    return 0.0;
  }
  // O easing deriva do multiplicador efetivo: quando o relógio já corre
  // perto de 10× (menor step da UI), as rampas largas entram por completo
  // para nascimento/morte não virarem strobo. Com lapse=0 o envelope
  // original volta sem aritmética extra. Usada só
  // pelos consumidores do relógio WARPADO (regiões reais + grupos de
  // manchas do sun.js — que assim seguem em sincronia com a plage);
  // proeminências/loops correm em wall-clock e ficam no envelope de
  // sempre.
  function lifeEnvelopeEased(x){
    var e = lifeEnvelope(x);
    // o boost do evento acelera o MESMO relógio warpado do lapse: as
    // rampas largas entram pelo mesmo easing (sem strobo na subida)
    if (ctx.LAPSE_K > 0 || (cycleEvent && ctx.cycleEventMul > 1)){
      var easeK=cycleEasingFor(cycleMultiplier());
      e += (lifeEnvelopeLapse(x) - e)*easeK;
    }
    return e;
  }
  // ---------------------------------------------------------------
  // EVENTO máximo/mínimo solar. startCycleEvent(alvo, hold): comprime o
  // caminho de fase até o alvo em ~CYCLE_EVT_RAMP s (multiplicador
  // derivado do que falta / tempo restante — nunca abaixo do ritmo do
  // lapse), congela o relógio no alvo por `hold` s simulados e libera.
  // tickCycleEvent roda todo frame no animate (com evento nulo é um
  // return imediato — caminho default/det intocado).
  // ---------------------------------------------------------------
  function startCycleEvent(target01, hold){
    var tot = CYCLE_PHASE0 + ctx.cycleTime / CYCLE_PERIOD;
    var ahead = target01 - (tot - Math.floor(tot));
    if (ahead < 0.002) ahead += 1.0;   // alvo sempre À FRENTE (fase anda, nunca salta)
    cycleEvent = { targetTot: tot + ahead, holdLeft: hold,
                   rampLeft: CYCLE_EVT_RAMP, state: 'ramp' };
    ctx.cycleEventMul = 1;
  }
  function endCycleEvent(){
    cycleEvent = null;
    ctx.cycleEventMul = 1;
  }
  function tickCycleEvent(delta){
    if (!cycleEvent) return;
    // ciclo desligado no meio do evento (usuário zerou cycle/lapse):
    // aborta limpo — sem relógio não há o que acelerar/segurar
    if (cycleDepth() <= 0.001){ endCycleEvent(); return; }
    var ev = cycleEvent;
    if (ev.state === 'ramp'){
      var remain = (ev.targetTot - (CYCLE_PHASE0 + ctx.cycleTime / CYCLE_PERIOD)) * CYCLE_PERIOD;
      if (remain <= 0.5){
        ev.state = 'hold';        // chegou: segura no alvo (relógio parado)
        ctx.cycleEventMul = 0;
      } else {
        ev.rampLeft = Math.max(0, ev.rampLeft - delta);
        // cobre o que falta no tempo de rampa restante; no último frame
        // (rampLeft<delta) fecha exato em delta*mul = remain — sem overshoot
        var need = remain / Math.max(ev.rampLeft, Math.max(delta, 1/240));
        ctx.cycleEventMul = Math.max(cycleMultiplierFor(ctx.LAPSE_K), Math.min(need, 3600));
      }
    } else {
      ctx.cycleEventMul = 0;
      ev.holdLeft -= delta;
      if (ev.holdLeft <= 0) endCycleEvent();
    }
  }
  function cycleEventInfo(){
    return cycleEvent
      ? { on: true, state: cycleEvent.state, mul: +ctx.cycleEventMul.toFixed(2),
          holdLeft: +Math.max(0, cycleEvent.holdLeft).toFixed(2),
          targetTot: cycleEvent.targetTot }
      : { on: false, state: '', mul: 1, holdLeft: 0, targetTot: 0 };
  }
  // prévias do painel (padrão canPreviewBurst/previewBurst do flares.js)
  function canPreviewCycleEvent(){
    if (cycleDepth() <= 0.001) return { ok:false, reason:'source-empty' };
    if (cycleEvent) return { ok:false, reason:'event-active' };
    return { ok:true, reason:'' };
  }
  function previewSolarMax(){
    var state = canPreviewCycleEvent();
    if (!state.ok) return state;
    if (ctx.directorUserExit) ctx.directorUserExit();
    startCycleEvent(0.5, 20);   // fase 0.5 = pico do envelope (amp 1.16)
    return { ok:true, reason:'', target:'max' };
  }
  function previewSolarMin(){
    var state = canPreviewCycleEvent();
    if (!state.ok) return state;
    if (ctx.directorUserExit) ctx.directorUserExit();
    startCycleEvent(1.0, 20);   // fase 0/1 = fundo do envelope (amp 0.10)
    return { ok:true, reason:'', target:'min' };
  }
  ctx.canPreviewSolarMax = canPreviewCycleEvent;
  ctx.canPreviewSolarMin = canPreviewCycleEvent;
  ctx.previewSolarMax = previewSolarMax;
  ctx.previewSolarMin = previewSolarMin;
  var lastRegionT = 0;
  function updateActiveRegions(timeNow){
    // rotação diferencial nas CARGAS (mesma lei Snodgrass do sim, relativa
    // à taxa de Carrington 14.18°/dia): manchas derivam em sincronia com a
    // plage advectada — antes só a textura cisalhava e as cargas ficavam
    // cap 0.35 > delta máximo por frame (rawDelta 0.1 × speed 3 = 0.3):
    // a deriva das cargas nunca perde tempo relativo à advecção da plage
    // (bug 4 da auditoria — o cap antigo 0.2 descolava manchas da plage)
    var regDt = Math.min(timeNow - lastRegionT, 0.35);
    lastRegionT = timeNow;
    for (var i=0;i<pairStates.length;i++){
      var ps = pairStates[i];
      var x = ((timeNow + ps.phase) % ps.period) / ps.period;
      var env = lifeEnvelopeEased(x);   // = lifeEnvelope(x) com lapse=0
      if (x >= 0.90){
        if (!ps.reborn){ placePair(ps); ps.reborn = true; }   // renasce longe
      } else {
        ps.reborn = false;
      }
      // FASE 3: polSign (flip de Hale) e cycleAmpK (envelope de
      // atividade do ciclo) valem 1 com o ciclo desligado — o produto
      // por 1.0 é bit-exato, o caminho default não muda
      ps.lead.w =  ps.baseQ * ps.polSign * Math.max(env, 0.03) * ctx.cycleAmpK;
      ps.foll.w = -ps.baseQ * ps.polSign * 0.85 * Math.max(env, 0.03) * ctx.cycleAmpK;
      // MACRO_SLOW: a advecção do sim desacelera junto (SIM_DT) — as
      // cargas derivam na mesma escala para as manchas não descolarem
      // da plage (família do bug 4 da auditoria de movimento)
      if (regDt > 0){ driftCharge(ps.lead, regDt*ctx.MACRO_SLOW); driftCharge(ps.foll, regDt*ctx.MACRO_SLOW); }
    }
  }
  updateActiveRegions(0);
  // cisalhamento diferencial de uma carga: mesma constante do sim
  // (vel.x = (Ω(lat)-14.18)*0.00028 em unidades de uv por tempo simulado)
  function driftCharge(c, dt){
    var lat = Math.asin(Math.max(-1, Math.min(1, c.y)));
    var s2 = Math.sin(lat)*Math.sin(lat);
    var omega = 14.71 - 2.39*s2 - 1.78*s2*s2;
    var dlon = (omega - 14.18) * 0.00028 * 6.28318 * dt;
    var cx = c.x, cz = c.z, cd = Math.cos(dlon), sd = Math.sin(dlon);
    c.x = cx*cd - cz*sd; c.z = cx*sd + cz*cd;
  }
  // value noise 1D com 3 oitavas (flicker 1/f do plasma suspenso)
  function vhash1(i){ var s = Math.sin(i*127.1 + 311.7)*43758.5453; return s - Math.floor(s); }
  function vnoise1(x){
    var i = Math.floor(x), fr = x - i, u = fr*fr*(3-2*fr);
    return (vhash1(i)*(1-u) + vhash1(i+1)*u)*2 - 1;
  }
  function flicker1f(t){
    return (vnoise1(t) + 0.5*vnoise1(t*2.17 + 7.3) + 0.25*vnoise1(t*4.61 + 13.1)) / 1.75;
  }
  // avaliação do mesmo campo em JS (para ancorar proeminências etc.).
  // Roda por proeminência a cada frame: aritmética escalar num vetor
  // reutilizado — zero alocações no caminho quente (o retorno é
  // compartilhado; nenhum chamador o retém entre chamadas)
  var bFieldOut = new THREE.Vector3();
  function bFieldJS(p){
    var bx = 0, by = 0, bz = 0;
    for (var i=0;i<charges.length;i++){
      var c = charges[i];
      var dx = p.x-c.x, dy = p.y-c.y, dz = p.z-c.z;
      var r2 = dx*dx + dy*dy + dz*dz + 1e-3;
      var k = c.w/(r2*Math.sqrt(r2));
      bx += dx*k; by += dy*k; bz += dz*k;
    }
    return bFieldOut.set(bx, by, bz);
  }
  return { charges: charges, pairStates: pairStates,
           updateCycleState: updateCycleState, placePair: placePair,
           updateActiveRegions: updateActiveRegions, cycleDepth: cycleDepth,
           cycleMultiplier: cycleMultiplier,
           startCycleEvent: startCycleEvent, tickCycleEvent: tickCycleEvent,
           cycleEventInfo: cycleEventInfo,
           lifeEnvelope: lifeEnvelope, lifeEnvelopeEased: lifeEnvelopeEased,
           bFieldJS: bFieldJS, flicker1f: flicker1f,
           cyclePolarN: cyclePolarN, cyclePolarS: cyclePolarS,
           CYCLE_PERIOD: CYCLE_PERIOD, CYCLE_PHASE0: CYCLE_PHASE0 };
}

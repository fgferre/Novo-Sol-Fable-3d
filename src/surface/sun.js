// surface/sun.js — o disco solar em três posições textuais do init original:
// geometria (antes do modelo magnético), uniforms (depois das cargas) e
// shaders+mesh (depois do bake da cromosfera). Corpos movidos verbatim.

import * as THREE from 'three';
import { SFTDIR_GLSL, BFIELD_GLSL, LIC_GLSL } from '../glsl/common.js';

export function createSunBase(ctx){
  var SPHERE_SEG = ctx.SPHERE_SEG;
  // ---------------------------------------------------------------
  // Superfície do Sol
  // ---------------------------------------------------------------
  var SUN_RADIUS = 2.2;
  var sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, SPHERE_SEG, SPHERE_SEG);
  ctx.SUN_RADIUS = SUN_RADIUS; ctx.sunGeometry = sunGeometry;
}

export function createSunUniforms(ctx){
  var SUN_RADIUS = ctx.SUN_RADIUS, charges = ctx.charges, knob = ctx.knob,
      TP = ctx.TP, simRTs = ctx.simRTs, simUniforms = ctx.simUniforms,
      pairStates = ctx.pairStates, spotRand = ctx.spotRand,
      lifeEnvelope = ctx.act.lifeEnvelope;

  // ---------------------------------------------------------------
  // FASE 6 (B1) — MANCHAS VIRTUAIS: até 10 slots (5 pares líder/
  // seguidor) desenhados SÓ no fragment do disco via uniform array
  // uSpots — zero custo no bake e nenhuma carga no campo (fibrilas/
  // coroa/PIL/plage não veem estas manchas; limitação aceita: virtuais
  // sem colar de plage, o colar vem do canal B do bake). Lifecycle
  // leve no padrão das regiões ativas (período/fase/renasce longe),
  // sorteios 100% no stream PRÓPRIO spotRand. Nascem PERTO de regiões
  // vivas (grupos como a ref-07): âncora sorteada entre os 4 pares
  // reais com peso |w|, dispersão na LARGURA da banda de Spörer da
  // fase corrente (o equivalente do cycleEmergenceLat de activity.js —
  // a latitude central já vem da âncora, que emerge na banda). A
  // simulação roda SEMPRE, independente do knob (o knob só gateia
  // uniforms/desenho) — setSpots() ao vivo é reprodutível.
  // Encoding do uSpots[i]: xyz = direção unitária × fade de vida
  // (length(xyz) recupera o fade — evita pop de nascimento/morte, como
  // o lifeK das manchas reais), w = raio angular em rad (~R); w<=0 =
  // slot vazio (skip no shader).
  // ---------------------------------------------------------------
  var SPOTS_MAX = 10;
  var spotVecs = [];
  for (var sv = 0; sv < SPOTS_MAX; sv++) spotVecs.push(new THREE.Vector4(0, 0, 0, 0));
  // gate de multiplicidade por par: o par p só é elegível quando
  // cycleAmpK×knobMul cruza o limiar (rampa suave de 0.08 — sem pop).
  // No mínimo do ciclo (ampK~0.14) só o par 0 vive (~0-2 manchas);
  // no máximo (ampK~1.16) os 5 pares (grupos múltiplos, ref-07).
  var SPOT_THR = [0.05, 0.42, 0.68, 0.90, 1.08];
  var spotPairs = [];
  function sstep(a, b, x){
    var t = Math.min(1, Math.max(0, (x - a)/(b - a)));
    return t*t*(3 - 2*t);
  }
  // nascimento de um par de manchas: 7 draws FIXOS de spotRand por
  // chamada (contagem constante = lifecycle determinístico sob det)
  function placeSpotPair(sp){
    // âncora: região ativa sorteada com peso |w| (nasce onde há vida)
    var wSum = 0, i;
    for (i = 0; i < pairStates.length; i++) wSum += Math.abs(pairStates[i].lead.w) + 0.05;
    var pick = spotRand() * wSum, k = 0;
    for (i = 0; i < pairStates.length; i++){
      pick -= Math.abs(pairStates[i].lead.w) + 0.05;
      if (pick <= 0){ k = i; break; }
    }
    var ps = pairStates[k];
    // ponto médio do par real (o grupo se forma EM VOLTA da região);
    // as cargas vivem em raio 0.88 — normalizar antes de ler lat/lon
    var ax = (ps.lead.x + ps.foll.x)*0.5, ay = (ps.lead.y + ps.foll.y)*0.5,
        az = (ps.lead.z + ps.foll.z)*0.5;
    var al = Math.sqrt(ax*ax + ay*ay + az*az) || 1;
    var lat0 = Math.asin(Math.max(-1, Math.min(1, ay/al)));
    var lon0 = Math.atan2(az, ax);
    // dispersão do grupo: ±~19° em longitude; em latitude a meia-
    // largura da banda de Spörer da fase corrente (8°→4°, lei da
    // activity.js) — no fim do ciclo os grupos apertam na banda
    var latW = (8.0 - 4.0*ctx.cyclePhase01) * (Math.PI/180.0);
    var lon = lon0 + (spotRand()*2.0 - 1.0)*0.34;
    var lat = lat0 + (spotRand()*2.0 - 1.0)*latW*0.9;
    // tamanhos (range GONG 0.005-0.086R em raio angular): distribuição
    // pesada nos pequenos (mediana ~0.014), líder raro grande (~0.05+)
    var uL = spotRand();
    sp.lr0 = 0.0065 + 0.0505*Math.pow(uL, 2.8);
    sp.fr0 = sp.lr0 * (0.42 + 0.20*spotRand());   // seguidor 42-62% (Hale)
    // separação do par MENOR que a das regiões (é o mesmo grupo) +
    // tilt de Joy (seguidor levemente rumo ao polo)
    var sep = 0.07 + spotRand()*0.09;
    var joy = sep*(0.10 + 0.07*spotRand());
    var hemi = (lat >= 0) ? 1 : -1;
    var cl = Math.cos(lat);
    sp.lx = cl*Math.cos(lon); sp.ly = Math.sin(lat); sp.lz = cl*Math.sin(lon);
    var latF = lat + hemi*joy, lonF = lon + sep, cf = Math.cos(latF);
    sp.fx = cf*Math.cos(lonF); sp.fy = Math.sin(latF); sp.fz = cf*Math.sin(lonF);
  }
  (function buildSpotPairs(){
    for (var p = 0; p < 5; p++){
      var sp = { period: 90 + spotRand()*70, phase: 0, reborn: false,
                 lx: 0, ly: 0, lz: 0, lr0: 0.01,
                 fx: 0, fy: 0, fz: 0, fr0: 0.006 };
      // fases espalhadas (mesmo padrão do buildCharges): sempre há
      // pares em estágios diferentes do envelope. Teto 0.78 do x
      // inicial: o 1º renascimento natural (draws de spotRand) fica a
      // >=0.12·period (~11s sim) de distância — nunca DENTRO de uma
      // janela de captura de QA (o frame do hook tem jitter de wall-
      // clock; um renascimento na janela dessincronizaria o stream)
      sp.phase = (p/5*0.85 + spotRand()*0.10) * sp.period;
      placeSpotPair(sp);
      spotPairs.push(sp);
    }
  })();
  // re-emergência total (hook de QA/sweep, chamada pelo reseed do
  // setCyclePhase): 8 draws fixos por par — determinístico; o mesmo
  // teto de x pós-reseed. A fase NÃO lê o relógio corrente: o x na
  // captura depende só do frame congelado (frame-exato sob det), nunca
  // do instante de wall-clock em que o hook rodou (anti-flaky S6).
  function spotsReseed(){
    for (var p = 0; p < 5; p++){
      var sp = spotPairs[p];
      sp.phase = (p/5*0.85 + spotRand()*0.10) * sp.period;
      sp.reborn = false;
      placeSpotPair(sp);
    }
  }
  // cisalhamento diferencial (mesma lei Snodgrass de driftCharge):
  // devolve o dlon para a latitude — as manchas derivam em sincronia
  // com as cargas/plage e não descolam do entorno
  function spotDriftLon(y, dt){
    var lat = Math.asin(Math.max(-1, Math.min(1, y)));
    var s2 = Math.sin(lat)*Math.sin(lat);
    var omega = 14.71 - 2.39*s2 - 1.78*s2*s2;
    return (omega - 14.18) * 0.00028 * 6.28318 * dt;
  }
  var spotLastT = 0;
  // atualização por frame (chamada pelo onBeforeRender do disco — main
  // render apenas, 1×/frame): ZERO alocações; roda independente do
  // knob (uSpotsK é quem gateia o desenho no shader)
  function spotsUpdate(){
    var tNow = ctx.elapsed + ctx.cycleWarp;   // mesmo relógio das regiões (lapse acelera)
    var dt = tNow - spotLastT;
    if (dt < 0) dt = 0; if (dt > 0.35) dt = 0.35;
    spotLastT = tNow;
    var drift = dt * ctx.MACRO_SLOW;
    var k = ctx.SPOTS_K;
    // multiplicidade: contagem instantânea = ciclo (cycleAmpK) × knob;
    // amplitude (tamanho) também escala com o knob — contínuo nos dois.
    // kOn zera os SLOTS com knob 0 (o estado continua simulando — o
    // desenho/uniform é a única coisa gateada): spotsInfo().n lê 0 e o
    // shader nem entra no loop (uSpotsK=0).
    var kOn = k > 0.001 ? 1 : 0;
    var knobMul = 0.35 + 0.65*Math.min(1, k) + 0.10*Math.max(0, k - 1);
    var gate = ctx.cycleAmpK * knobMul;
    var sizeK = 0.45 + 0.55*Math.min(1.5, k);
    for (var p = 0; p < 5; p++){
      var sp = spotPairs[p];
      var x = ((tNow + sp.phase) % sp.period) / sp.period;
      var env = lifeEnvelope(x);
      if (x >= 0.90){
        if (!sp.reborn){ placeSpotPair(sp); sp.reborn = true; }   // renasce noutro grupo
      } else sp.reborn = false;
      if (drift > 0){
        var dl = spotDriftLon(sp.ly, drift), cd = Math.cos(dl), sd = Math.sin(dl);
        var x0 = sp.lx, z0 = sp.lz;
        sp.lx = x0*cd - z0*sd; sp.lz = x0*sd + z0*cd;
        dl = spotDriftLon(sp.fy, drift); cd = Math.cos(dl); sd = Math.sin(dl);
        x0 = sp.fx; z0 = sp.fz;
        sp.fx = x0*cd - z0*sd; sp.fz = x0*sd + z0*cd;
      }
      // fade = vida (anti-pop, como o lifeK das reais) × rampa do gate
      var fade = sstep(0.02, 0.25, env) * sstep(0.0, 0.08, gate - SPOT_THR[p]) * kOn;
      // raio efetivo cresce com a vida (como aw nas reais) e com o
      // knob; clamp no range GONG [0.005, 0.086]
      var grow = (0.40 + 0.60*env) * sizeK;
      var rl = Math.min(0.086, Math.max(0.005, sp.lr0 * grow));
      var rf = Math.min(0.086, Math.max(0.005, sp.fr0 * grow));
      var vl = spotVecs[2*p], vf = spotVecs[2*p + 1];
      if (fade <= 0.004){
        vl.set(0, 0, 0, 0); vf.set(0, 0, 0, 0);
      } else {
        vl.set(sp.lx*fade, sp.ly*fade, sp.lz*fade, rl);
        vf.set(sp.fx*fade, sp.fy*fade, sp.fz*fade, rf);
      }
    }
    sunUniforms.uSpotsK.value = k;
  }
  // introspecção p/ QA (spotsInfo): slots como o shader os vê (o vec4
  // reflete o último frame renderizado) + raios EFETIVOS das manchas
  // reais com a mesma recalibração do shader (espelho JS, padrão
  // bFieldJS↔BFIELD_GLSL). Aloca — só chamar fora do caminho quente.
  function spotsInfoData(){
    var k = ctx.SPOTS_K;
    var out = { knob: k, ampK: +ctx.cycleAmpK.toFixed(3),
                phase: +ctx.cyclePhase01.toFixed(3), n: 0, slots: [], real: [] };
    for (var i = 0; i < SPOTS_MAX; i++){
      var v = spotVecs[i], on = v.w > 0;
      if (on) out.n++;
      var l = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) || 1;
      out.slots.push({ on: on, lead: (i % 2) === 0,
        lat: on ? +(Math.asin(Math.max(-1, Math.min(1, v.y/l)))*180/Math.PI).toFixed(2) : 0,
        lon: on ? +(Math.atan2(v.z, v.x)*180/Math.PI).toFixed(2) : 0,
        r: on ? +v.w.toFixed(4) : 0,
        fade: on ? +Math.min(1, l).toFixed(3) : 0 });
    }
    for (var j = 0; j < 8; j++){
      var c = charges[j], aw = Math.abs(c.w), isFoll = j % 2;
      var r0 = (0.016 + 0.014*aw) * (1.0 - 0.45*isFoll);
      var re = Math.min(r0 * (1.0 + k*(0.10 + 0.20*aw*aw)), 0.086);
      var cl2 = Math.sqrt(c.x*c.x + c.y*c.y + c.z*c.z) || 1;
      out.real.push({ lead: isFoll === 0,
        lat: +(Math.asin(Math.max(-1, Math.min(1, c.y/cl2)))*180/Math.PI).toFixed(2),
        lon: +(Math.atan2(c.z, c.x)*180/Math.PI).toFixed(2),
        aw: +aw.toFixed(3), r0: +r0.toFixed(4), r: +re.toFixed(4),
        lifeK: +sstep(0.04, 0.30, aw).toFixed(3) });
    }
    return out;
  }
  ctx.spotsUpdate = spotsUpdate;
  ctx.spotsReseed = spotsReseed;
  ctx.spotsInfoData = spotsInfoData;

  var sunUniforms = {
    uTime: { value: 0 },
    uDispScale: { value: SUN_RADIUS * 0.004 },
    uChromoTex: { value: null },
    uChromoFar: { value: null },
    uChromoTexP: { value: null },
    uChromoFarP: { value: null },
    uBakeMix: { value: 1.0 },
    uGranFreq: { value: TP.granFreq },
    uCamDist: { value: 6.0 },
    uCharges: { value: charges },
    uFlare: { value: new THREE.Vector4(0, 0, 1, 0) },
    // FASE 1 — moldura das fitas two-ribbon (tudo zero fora de flare):
    // uFlareGeo = tangente da PIL (xyz) + meia-separação das fitas (w);
    // uFlarePerp = através da PIL (xyz) + meio-comprimento da fita (w);
    // uFlareRib = amplitude das fitas (x), largura (y), fase do ruído
    // de recorte (z) — cada flare rasga diferente.
    uFlareGeo: { value: new THREE.Vector4(1, 0, 0, 0.02) },
    uFlarePerp: { value: new THREE.Vector4(0, 0, 1, 0.06) },
    uFlareRib: { value: new THREE.Vector4(0, 0.010, 0, 1) },
    uPlageEm: { value: knob('plageglow', 0.35, 0.0, 1.5) },
    // Oscilações p-mode (heliosismologia): o Sol "toca" em modos acústicos
    // de ~5 minutos (harmônicos esféricos de baixo grau, Leighton 1962).
    // Aqui: 3 modos (l=2 m=0, l=2 m=2, l=3 m=1) com períodos comprimidos
    // (~21-34s de parede; os reais são 296-317s) e amplitude exagerada
    // ~10^4x (Δr/R real ≈ 10^-7 seria invisível) — mesma honestidade de
    // VFX da convecção. Default 0 = desligado, frame idêntico ao baseline.
    uPmode: { value: knob('pmode', 0.0, 0.0, 1.0) },
    uSimTex: { value: simRTs[0].texture },
    uSimTexel: { value: simUniforms.uTexel.value },
    // FASE 6 (B1) — manchas virtuais: array VIVO de 10 Vector4
    // (mutado por spotsUpdate a cada frame; three re-flatten uniform
    // arrays por frame) + gate/escala do knob (0 = loop pulado no
    // shader e recalibração ×1.0 — frame bit-exato ao baseline)
    uSpots: { value: spotVecs },
    uSpotsK: { value: ctx.SPOTS_K }
  };
  ctx.sunUniforms = sunUniforms;
}

export function createSunMesh(ctx){
  var scene = ctx.scene, sunUniforms = ctx.sunUniforms,
      sunGeometry = ctx.sunGeometry, NOISE_GLSL = ctx.NOISE_GLSL,
      tuneLic = ctx.tuneLic;
  var sunVertexShader = NOISE_GLSL + '\n' + [
    'uniform float uTime;',
    'uniform float uDispScale;',
    'uniform float uPmode;',
    'varying vec3 vNormalW;',
    'varying vec3 vPositionW;',
    'varying vec3 vPosObj;',
    'varying float vDisp;',
    'varying float vPm;',
    'varying vec2 vUvV;',
    'void main(){',
    '  vUvV = uv;',
    '  vPosObj = position;',   // espaço do OBJETO: o padrão gira junto com a esfera
    '  vec3 seed = position * 1.6 + vec3(0.0, 0.0, uTime*0.045);',
    '  float n = fbm(seed);',
    '  vDisp = n;',
    // p-modes: soma de 3 harmônicos esféricos de baixo grau (polinômios de
    // Legendre em sin(lat)), períodos incomensuráveis — a superfície
    // "respira" como um sino tocando em acordes, não como um pistão
    '  float pmSum = 0.0;',
    '  if (uPmode > 0.001){',
    '    vec3 np = normalize(position);',
    '    float plat = np.y;',
    '    float plon = atan(np.z, np.x);',
    '    float p20 = 1.5*plat*plat - 0.5;',
    '    float p22 = 1.0 - plat*plat;',
    '    float p31 = plat*sqrt(max(0.0, 1.0 - plat*plat));',
    '    pmSum = 0.45*p20*sin(uTime*0.299)',
    '          + 0.35*p22*sin(uTime*0.229 + 2.0*plon)',
    '          + 0.30*p31*sin(uTime*0.185 + plon);',
    '    pmSum *= uPmode;',
    '  }',
    '  vPm = pmSum;',
    '  vec3 displaced = position + normal * (n * uDispScale + pmSum * 0.004 * length(position));',
    '  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);',
    '  vPositionW = worldPos.xyz;',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------
  // Fragment: plasma por turbulência com distorção de domínio.
  //   heat = sim(larga escala, evolui na GPU) + fbm(fbm-distorcido)
  // A cor sai de corpo negro e a SAÍDA É HDR (até ~2.4): o tonemap ACES
  // comprime e o bloom captura os picos — é isso que dá a sensação de
  // material EMISSIVO, não de textura iluminada.
  // Nota: todo ruído usa vPosObj (espaço do objeto). Antes usava posição
  // de mundo — bug real: o padrão ficava fixo no espaço enquanto a esfera
  // girava por baixo ("derrapagem" das manchas).
  // ---------------------------------------------------------------
  var sunFragmentShader = NOISE_GLSL + '\n' + [
    'uniform float uTime;',
    'uniform sampler2D uChromoTex;',
    'uniform sampler2D uChromoFar;',
    'uniform sampler2D uChromoTexP;',
    'uniform sampler2D uChromoFarP;',
    'uniform float uBakeMix;',
    'uniform float uGranFreq;',
    'uniform float uCamDist;',
    'uniform float uPlageEm;',
    'uniform vec4 uFlare;',
    'uniform vec4 uFlareGeo;',
    'uniform vec4 uFlarePerp;',
    'uniform vec4 uFlareRib;',
    'uniform sampler2D uSimTex;',
    'uniform vec2 uSimTexel;',
    'varying vec3 vNormalW;',
    'varying vec3 vPositionW;',
    'varying vec3 vPosObj;',
    'varying float vDisp;',
    'varying float vPm;',
    'varying vec2 vUvV;',
    'uniform vec4 uCharges[10];',
    // FASE 6 (B1) — manchas virtuais: xyz = direção × fade de vida
    // (length recupera o fade), w = raio angular em rad (w<=0 = slot
    // vazio). uSpotsK gateia o loop E a recalibração dos raios reais.
    '#define SPOTS_MAX 10',
    'uniform vec4 uSpots[SPOTS_MAX];',
    'uniform float uSpotsK;'].join('\n') + '\n' + SFTDIR_GLSL + '\n' + BFIELD_GLSL + '\n' + LIC_GLSL + '\n' + [
    'void main(){',
    '  vec3 viewDir = normalize(cameraPosition - vPositionW);',
    '  vec3 N = normalize(vNormalW);',
    '  float mu = max(dot(N, viewDir), 0.0);',
    '  vec3 sp = normalize(vPosObj);',
    '  float t = uTime;',
    // --- estrutura baked: R=larga escala, G=filamento, B=plage.
    // De longe usa o passe calmo (o seeing borraria os feixes); de perto
    // o passe com LIC iterado, onde tudo é feito de fios varridos ---
    '  float close = smoothstep(6.2, 3.4, uCamDist);',
    '  float kNear = clamp(close*1.2 + 0.15, 0.0, 1.0);',
    // FERVURA contínua (feature nº1 da auditoria de movimento): o bake
    // dá a EVOLUÇÃO do conteúdo (~8Hz + crossfade), mas entre poses nada
    // se movia (diff do disco 0.075 sem bake = só grão). Domain-warp do
    // domínio do bake por uTime, em espaço do OBJETO (gira rígido com a
    // textura): células na escala da granulação empurram filamentos,
    // rede e plage continuamente, fração de px por frame — o disco FERVE
    // em vez de dissolver entre stills.
    '  float bfq = uGranFreq*0.45;',
    '  vec2 boil = vec2(snoise(sp*bfq + vec3(0.0, 0.0, t*0.9)),',
    '                   snoise(sp*bfq + vec3(5.1, 1.7, t*0.9)))',
    '      + 0.5*vec2(snoise(sp*bfq*2.6 + vec3(2.3, 8.6, t*1.7)),',
    '                 snoise(sp*bfq*2.6 + vec3(7.7, 3.9, t*1.7)));',
    '  vec2 buv = vec2(fract(vUvV.x + boil.x*0.0035), clamp(vUvV.y + boil.y*0.0035, 0.0, 1.0));',
    // crossfade temporal do bake: o plasma evolui contínuo entre o ciclo
    // anterior e o atual, em vez de saltar em degraus de ~8Hz (a rotação
    // é por frame; sem isto o conteúdo parecia stop-motion desalinhado)
    '  vec4 st = mix(mix(texture2D(uChromoFarP, buv), texture2D(uChromoTexP, buv), kNear),',
    '                mix(texture2D(uChromoFar,  buv), texture2D(uChromoTex,  buv), kNear), uBakeMix);',
    '  float heat = st.r + vDisp*0.06;',
    // disciplina tonal H-alfa: o disco é quase plano em luminância; a
    // larga escala só sugere estrutura — a riqueza vem da textura fina.
    // De perto acalma MENOS: nas fotos reais (ref-01) plage, rede e
    // faixas escuras continuam bem visíveis no close-up — achatar a
    // larga escala 4.5x deixava o zoom um "pelo" uniforme irreal.
    // de LONGE mais suave ainda: as refs 02/03 mostram sol calmo quase
    // plano em enquadramento cheio (métrica G: spread 0.10-0.16).
    // 0.31 dá margem ao gate mesmo com região ativa no centro do disco
    '  heat = 0.50 + (heat - 0.52)*mix(0.31, 0.26, close);',
    // --- fibrilas grossas: baked (canal A). De perto, o claro/escuro é
    // FEITO de fibrilas: a larga escala modula o contraste dos fios ---
    '  float fibC = st.a*2.0 - 1.0;',
    '  heat += fibC * mix(0.055, 0.12, close) * (0.65 + 0.70*st.r);',
    // LOD: de perto, campo magnético + LIC ao vivo dão as camadas finas
    // (de longe o disco é praticamente só o sampler do bake)
    '  if (close > 0.003){',
    '    vec3 B = bField(sp);',
    // mesma direção do bake (gradiente do fluxo transportado): as camadas
    // finas ao vivo seguem o MESMO campo evoluído das camadas baked
    '    B += 0.30 * vec3(snoise(sp*2.4 + vec3(0.0,0.0,t*0.006)),',
    '                     snoise(sp*2.4 + vec3(4.2,7.1,t*0.006)),',
    '                     snoise(sp*2.4 + vec3(9.3,2.8,t*0.006)));',
    '    B += sftGrad(vUvV) * 7.0;',
    '    vec3 Bt = B - sp*dot(B, sp);',
    '    float BtL = length(Bt);',
    '    float wig = 0.85*snoise(sp*3.4 + vec3(0.0,0.0,t*0.012));',
    '    vec3 fdir = (BtL > 1e-4)',
    '      ? (Bt*cos(wig) + cross(sp, Bt)*sin(wig)) / BtL',
    '      : vec3(0.5773);',
    '    float fibF = licFibril(sp, fdir, uGranFreq*3.5, 0.22, t*1.3);',
    '    heat += close * fibF * 0.16;',
    // camada micro: só em zoom máximo, fios finíssimos
    '    float closer = smoothstep(4.8, 3.5, uCamDist);',
    '    if (closer > 0.003){',
    '      heat += closer * licFibril(sp, fdir, uGranFreq*7.0, 0.08, t*1.6) * 0.20;',
    '    }',
    '  }',
    // --- manchas: nos PÉS das cargas magnéticas (regiões ativas) ---
    // A umbra é desenhada AO VIVO, mas o colar de plage/penumbra vem da
    // textura warpada pela fervura — avaliar o campo da mancha no MESMO
    // domínio warpado (spW = sp deslocado pelo boil via tangentes da
    // esfera) faz a umbra ferver junto com o entorno, em vez de ficar
    // rígida enquanto o colar balança (diagnóstico pós-LOOP-7).
    '  float bst = max(sqrt(max(1.0 - sp.y*sp.y, 0.0)), 0.1);',
    '  vec3 spW = normalize(sp + (vec3(sp.z, 0.0, -sp.x)*(6.2832*boil.x)',
    '      + vec3(-sp.x*sp.y, 1.0 - sp.y*sp.y, -sp.z*sp.y)*(3.1416*boil.y/bst))*0.0035);',
    '  float umbra = 0.0; float pen = 0.0; vec3 dirRad = vec3(0.5773);',
    '  for(int i=0;i<8;i++){',
    '    vec3 f = normalize(uCharges[i].xyz);',
    '    float aw = abs(uCharges[i].w);',
    // FIX manchas abruptas (diagnóstico pós-LOOP-7): a escuridão da
    // umbra não escalava com a vida da carga — só o raio. Com o piso
    // 0.03 do updateActiveRegions, a mancha "morta" seguia 100% escura
    // e TELEPORTAVA ~57° em 1 frame no renascimento (pop a cada
    // ~40-60s a 60fps). lifeK esmaece a zero antes do teleporte, como
    // as proeminências já fazem com env; o piso 0.03 vira só guarda
    // numérica do campo.
    '    float lifeK = smoothstep(0.04, 0.30, aw);',
    '    float d = acos(clamp(dot(spW, f), -1.0, 1.0));',
    // assimetria física do par (lei de Hale na prática): o LÍDER (índice
    // par) é grande e coeso; o SEGUIDOR (ímpar) é menor e fragmentado —
    // pares reais nunca são dois olhos gêmeos
    '    float isFoll = mod(float(i), 2.0);',
    // contorno irregular: umbra real não é um círculo perfeito
    '    d *= 1.0 + mix(0.18, 0.38, isFoll)*snoise(spW*24.0 + f*9.0)',
    '           + mix(0.07, 0.16, isFoll)*snoise(spW*60.0 - f*4.0);',
    // ESCALA OBSERVADA (ref-07 GONG full-disk): umbras reais têm
    // 3.5-60 Mm de diâmetro (0.005-0.086 R). Antes chegava a 0.18 R —
    // uma ordem de grandeza acima de qualquer mancha já registrada
    '    float r = (0.016 + 0.014*aw) * (1.0 - 0.45*isFoll);',
    // FASE 6 (B1) — recalibração de proporção GONG gateada pelo knob:
    // com spots>0 os raios reais esticam rumo ao alto do range
    // observado (termo quadrático em aw ⇒ só o líder FORTE fica
    // grande, ~0.05-0.08R; teto 0.086R). Medido (seed 7, máximo): aw
    // 1.39 ⇒ r 0.035→0.052 em spots=1, 0.061 em 1.5. Com uSpotsK=0 o
    // multiplicador é EXATAMENTE 1.0 e o min() é no-op (r baseline <=
    // ~0.045R) — paridade bit-exata por construção.
    '    r = min(r * (1.0 + uSpotsK*(0.10 + 0.20*aw*aw)), 0.086);',
    '    float ui0 = 1.0 - smoothstep(r*0.55, r, d);',
    '    float ui = ui0 * lifeK;',
    '    float pi = clamp((1.0 - smoothstep(r, r*2.3, d)) - ui0, 0.0, 1.0) * lifeK;',
    '    umbra = max(umbra, ui);',
    '    if (pi > pen){',
    '      pen = pi;',
    '      vec3 tc = f - sp*dot(f, sp);',
    '      float tl = length(tc);',
    '      if (tl > 1e-4) dirRad = tc/tl;',
    '    }',
    '  }',
    // FASE 6 (B1) — manchas VIRTUAIS (uSpots): multiplicidade e
    // proporção GONG só no shader do disco. Mesmo padrão do loop real:
    // distância angular no domínio warpado (spW — a mancha ferve com o
    // colar), contorno irregular, assimetria líder/seguidor pela
    // paridade do índice, penumbra 1:2.3 e contribuição pelos MESMOS
    // max()/argmax de umbra/pen (com contribuição 0 o max é bit-
    // exato). Gate uSpotsK: knob 0 pula o loop inteiro (branch
    // uniforme). Early-out pela CORDA (2(1-cos) = corda², corda<=arco
    // sempre): descarta só quando dv>6r GARANTIDO — lá a contribuição
    // já é 0 (pen morre em 2.3r e o ruído de contorno encolhe dv no
    // máximo ×0.46 ⇒ zero acima de 5r). Poupa o acos e os 2 snoise na
    // quase totalidade dos pixels (A/B: o acos por spot dominava o
    // custo do loop no pior caso).
    '  if (uSpotsK > 0.001){',
    '    for(int i=0;i<SPOTS_MAX;i++){',
    '      float rv = uSpots[i].w;',
    '      if (rv <= 0.0) continue;',
    '      float lifeKv = length(uSpots[i].xyz);',
    '      vec3 fv = uSpots[i].xyz / max(lifeKv, 1e-4);',
    '      float cv = dot(spW, fv);',
    '      if (2.0*(1.0 - cv) > rv*rv*36.0) continue;',
    '      float dv = acos(clamp(cv, -1.0, 1.0));',
    '      float isFollV = mod(float(i), 2.0);',
    '      dv *= 1.0 + mix(0.18, 0.38, isFollV)*snoise(spW*24.0 + fv*9.0)',
    '            + mix(0.07, 0.16, isFollV)*snoise(spW*60.0 - fv*4.0);',
    '      float uiV0 = 1.0 - smoothstep(rv*0.55, rv, dv);',
    '      float uiV = uiV0 * lifeKv;',
    '      float piV = clamp((1.0 - smoothstep(rv, rv*2.3, dv)) - uiV0, 0.0, 1.0) * lifeKv;',
    '      umbra = max(umbra, uiV);',
    '      if (piV > pen){',
    '        pen = piV;',
    '        vec3 tcv = fv - sp*dot(fv, sp);',
    '        float tlv = length(tcv);',
    '        if (tlv > 1e-4) dirRad = tcv/tlv;',
    '      }',
    '    }',
    '  }',
    '  if (pen > 0.002){',
    '    float pf = licFibril(sp, dirRad, 62.0, 0.09, t);',
    '    pen *= 0.45 + 0.95*(pf*0.5+0.5);',
    '  }',
    // --- plage: onde o campo é forte (em volta das regiões ativas),
    // mas fora das manchas — brilha sem nunca chegar ao branco ---
    '  float plage = st.b * (1.0 - umbra - pen*0.7);',
    // 0.34 (era 0.22): sweep T2.2 — plage mais quente SEM mover o spread
    // do sol calmo (gate G ficou em 0.29, contraste localizado)
    '  heat = heat*(1.0 - umbra*0.96 - pen*0.38) + clamp(plage, 0.0, 1.0)*0.34;',
    // --- flare TWO-RIBBON (FASE 1, pendência audit-loop6 ref-08):
    // flash IMPULSIVO compacto no topo do laço (uFlare.w, a reconexão
    // em si) + DUAS fitas cromosféricas paralelas à PIL local que se
    // AFASTAM na fase gradual (uFlareGeo.w cresce) — a assinatura
    // clássica dos flares em H-alfa. A moldura tangente/perp vem do
    // PRÓPRIO campo de cargas (setFlareFrame). Fora de flare os dois
    // gates são 0 e o bloco inteiro é pulado (frame = baseline). ---
    '  float flareGlow = 0.0;',
    '  float flareRibG = 0.0;',
    '  if (uFlare.w + uFlareRib.x > 0.004){',
    '    float fdist = acos(clamp(dot(sp, uFlare.xyz), -1.0, 1.0));',
    // máscara de localidade: mata o eco antipodal das coords do plano
    // tangente (dot com a tangente volta a ~0 do outro lado da esfera)
    '    float floc = 1.0 - smoothstep(0.22, 0.32, fdist);',
    '    if (floc > 0.002){',
    '      float frib = 0.55 + 0.45*(fbmLight(sp*26.0 + vec3(3.9))*0.5+0.5);',
    // laço ~4x mais forte (backlog M2 nº5): o flash local era +3% por
    // 1 frame — "lâmpada" que perdia para o escurecimento da íris e o
    // evento lia INVERTIDO (o mundo escurecia mais do que o flare
    // brilhava). O pico agora domina a leitura; a íris responde menos.
    '      flareGlow = uFlare.w * exp(-fdist*fdist*700.0) * frib * floc;',
    // fitas: coordenadas angulares no plano tangente da PIL (válidas
    // localmente; floc já limitou o domínio)
    '      float fdx = dot(sp, uFlareGeo.xyz);',
    '      float fdy = dot(sp, uFlarePerp.xyz);',
    '      float falong = exp(-fdx*fdx/(uFlarePerp.w*uFlarePerp.w));',
    // fitas reais NÃO são barras de aerógrafo (reality-check vs o X17
    // de 2003-10-28 em H-alfa): o PAR curva junto (dobra de baixa freq
    // compartilhada), cada fita ainda ondula POR CONTA PRÓPRIA (kinks
    // independentes — fitas reais não são paralelas perfeitas), o
    // brilho quebra em STRANDS com vãos, e o par é ASSIMÉTRICO — uma
    // fita mais brilhante/estreita que a outra (lado sorteado por
    // evento via a fase uFlareRib.z)
    '      float fbend = fbmLight(sp*12.0 + vec3(uFlareRib.z*0.7)) * 0.022;',
    '      float fwob1 = fbend + fbmLight(sp*34.0 + vec3(uFlareRib.z*1.3)) * 0.014;',
    '      float fwob2 = fbend + fbmLight(sp*34.0 + vec3(uFlareRib.z*1.3 + 9.2)) * 0.014;',
    '      float fasy = (fract(uFlareRib.z*0.173) > 0.5) ? 1.0 : -1.0;',
    // FASE 2 (débito LOD): frequência dos strands escalada pelo zoom
    // (uFlareRib.w, 1 no fit e além, cresce ao aproximar) — o recorte
    // granula mais fino de perto em vez de virar blobs de aerógrafo
    '      float frag1 = 0.25 + 0.95*smoothstep(0.25, 0.75, fbmLight(sp*(230.0*uFlareRib.w) + vec3(uFlareRib.z))*0.5+0.5);',
    '      float frag2 = 0.25 + 0.95*smoothstep(0.25, 0.75, fbmLight(sp*(230.0*uFlareRib.w) + vec3(uFlareRib.z+4.7))*0.5+0.5);',
    '      float fd1 = (fdy + fwob1 - uFlareGeo.w)/(uFlareRib.y*(1.0 - 0.15*fasy));',
    '      float fd2 = (fdy + fwob2 + uFlareGeo.w)/(uFlareRib.y*(1.0 + 0.15*fasy));',
    '      flareRibG = uFlareRib.x * falong * (exp(-fd1*fd1)*frag1*(1.0 + 0.24*fasy)',
    '                                        + exp(-fd2*fd2)*frag2*(1.0 - 0.24*fasy)) * floc;',
    '      heat += flareGlow*0.9 + flareRibG*0.55;',
    '    }',
    '  }',
    // --- filamentos (linhas neutras) vêm do bake; exclusão de manchas aqui ---
    '  float fil = st.g * clamp(1.0 - umbra - pen, 0.0, 1.0);',
    // 0.55 (era 0.30): canais de filamento "tinta serpenteando" (ref-03);
    // de graça para o gate G — o falloff do fil é local
    '  heat *= 1.0 - fil*0.55;',
    '  heat = clamp(heat, 0.0, 1.24);',
    // --- paleta H-alfa: emissão em banda estreita (656nm) exibida em
    // falsa-cor laranja, como em astrofotografia real. Não é corpo negro:
    // a matiz é quase constante; heat modula LUMINÂNCIA e desloca a matiz
    // só um pouco para o amarelo nas áreas quentes (plage).
    '  vec3 color = mix(vec3(1.0, 0.34, 0.06), vec3(1.0, 0.62, 0.24), smoothstep(0.15, 1.05, heat));',
    // plage quase branca (refs 01/03, sweep T2.2): desvio de matiz para
    // creme SÓ onde plage E heat são altos — mosqueado preservado, 0% clip
    '  color = mix(color, vec3(1.0, 0.86, 0.62), 0.55 * smoothstep(0.55, 1.0, clamp(plage, 0.0, 1.0)) * smoothstep(0.72, 1.12, heat));',
    '  color *= mix(0.16, 1.42, smoothstep(0.04, 1.08, heat));',
    '  color += vec3(1.0, 0.55, 0.22) * flareGlow * 3.6;',   // pico HDR do flare (~4x, backlog M2 nº5)
    // fitas: cromosfera aquecida a ~branco (mais neutra que o flash);
    // HDR um degrau abaixo do núcleo (2.2: acima disso o ACES achata os
    // strands num oval liso) — o bloom desenha o par de riscos
    '  color += vec3(1.0, 0.74, 0.46) * flareRibG * 2.2;',
    // --- escurecimento + avermelhamento de limbo (lei linear, u=0.72) ---
    '  float limbU = 0.30;',   // núcleo H-alfa: u≈0.25-0.30 na literatura (bem mais suave que contínuo)
    '  color *= (1.0-limbU) + limbU*mu;',
    '  float edge = pow(1.0-mu, 1.7);',
    '  color.g *= 1.0 - edge*0.30;',
    '  color.b *= 1.0 - edge*0.50;',
    '  color *= 1.0 - edge*0.15;',
    // fina cromosfera avermelhada na borda, com espículas (ruído fino)
    '  float spic = 0.7 + 0.5*fbmLight(sp*46.0 + vec3(0.0, 0.0, t*0.5));',
    // 1.15 (era 0.4): a borda quente da ref-02 e fonte HDR p/ o bloom do
    // limbo; 1.30 já começava a ler como anel em monitor claro
    '  color += vec3(1.0, 0.30, 0.10) * pow(1.0-mu, 3.5) * 1.15 * spic;',
    // plage como fonte HDR (>1.0): é o que faz o bloom finalmente ler
    // como bloom (glow suave em volta das regiões ativas, ref-03) sem
    // tocar na luminância mediana do disco
    '  color += vec3(1.0, 0.70, 0.32) * clamp(plage, 0.0, 1.0) * uPlageEm;',
    // p-mode: a crista da onda acústica é levemente mais quente/brilhante
    // (perturbação de temperatura acompanha a de deslocamento)
    '  color *= 1.0 + vPm * 0.05;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  sunFragmentShader = tuneLic(sunFragmentShader);

  var sunMaterial = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: sunVertexShader,
    fragmentShader: sunFragmentShader
  });
  var sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  // FASE 6 (B1): o lifecycle das manchas virtuais atualiza AQUI — o
  // onBeforeRender do disco dispara 1×/frame, só no render principal
  // (os bakes usam cenas próprias de quad ⇒ zero custo no bake). Roda
  // sempre (knob só gateia o desenho): ~10 slots de aritmética escalar,
  // zero alocações — e setSpots() ao vivo é reprodutível por construção.
  sunMesh.onBeforeRender = function(){ ctx.spotsUpdate(); };
  scene.add(sunMesh);
  ctx.sunMesh = sunMesh;
}

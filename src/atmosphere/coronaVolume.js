// atmosphere/coronaVolume.js — coroa volumétrica raymarched (densidade em
// sampler3D 64³ bakeada em CPU, espelho do bFieldJS). Corpo verbatim;
// estado mutável do bake fatiado (ctx.cvol*) compartilhado com o animate.

import * as THREE from 'three';

export function createCoronaVolume(ctx){
  var scene = ctx.scene, TP = ctx.TP, NOISE_GLSL = ctx.NOISE_GLSL,
      SUN_RADIUS = ctx.SUN_RADIUS, CORONA_SIZE = ctx.CORONA_SIZE,
      charges = ctx.charges;
  // ---------------------------------------------------------------
  // FASE 4 — "a coroa de verdade": coroa volumétrica raymarched.
  // A densidade coronal vive num sampler3D 64³ (payoff do WebGL2)
  // bakeado na CPU pelo MESMO campo de cargas (bFieldJS), fatiado como
  // o bake da cromosfera (1 fatia z/frame, snapshot de cargas no
  // início do ciclo, upload atômico no fim — sem tearing). A topologia
  // aberta/fechada sai de um proxy físico barato, a UNIPOLARIDADE
  // |B·r̂|/|B|: folhas de helmet streamer nascem na superfície neutra
  // (unip≈0) e afinam com a altura (cúspide); buracos coronais são as
  // regiões unipolares fortes perto da superfície (polos no mínimo do
  // ciclo — emergente do dipolo polar da F3, sem heurística nova). No
  // máximo a superfície neutra ondula por todas as latitudes = coroa
  // "cheia" (refs 09/12); no mínimo sobra o cinturão equatorial +
  // buracos polares. Tier-gated (cstep=0 => o plano de raias segue
  // sozinho como fallback); knob cvol default 0 = mesh invisível.
  // ---------------------------------------------------------------
  var CVOL_STEPS = TP.cstep | 0;
  var CVOL_N = 64, CVOL_VR = 3.0, CVOL_ROUT = 2.88;
  ctx.cvolStep = -1, ctx.cvolAccum = 0, ctx.cvolReady = false, ctx.cvolKilled = false, ctx.cvolCycles = 0;
  var coronaVol = null, cvolUniforms = null, cvolTex = null;
  var cvolData = null, cvolStage = null;
  var cvolQ = new Float32Array(40);       // snapshot das 10 cargas (x,y,z,w)
  var cvolInvRot = new THREE.Matrix3();
  function snapshotCvolCharges(){
    for (var i = 0; i < charges.length; i++){
      cvolQ[i*4]   = charges[i].x; cvolQ[i*4+1] = charges[i].y;
      cvolQ[i*4+2] = charges[i].z; cvolQ[i*4+3] = charges[i].w;
    }
  }
  // pesos da mistura de densidade — ajustáveis em runtime pelo hook
  // setCvolShape (sweep de calibração sem rebuild); os defaults são o
  // resultado do painel de juízes da rodada. FASE 6 B4: folha v2
  // "forte" (sheet 1.15 / base 0.20 — nota técnica do juiz físico da
  // F4, aprovada UNÂNIME no painel do B2). Só visíveis com cvol>0
  // (knob-gated): o frame default segue bit-exato.
  ctx.cvolWBase = 0.20, ctx.cvolWSheet = 1.15, ctx.cvolWLoop = 0.55, ctx.cvolWHole = 0.62;
  // FASE 6 B2 — cúspide do helmet streamer: peso do termo QUADRÁTICO de
  // altura no expoente da folha (a folha AFUNILA em ponta e segue como
  // haste fina — refs 10/12; nota técnica do juiz físico da F4). Peso
  // CPU-side (entra no bake da densidade): setCvolShape({cusp}) precisa
  // de rebakeCorona() para surtir efeito. B4: default 0.6 = veredito
  // unânime do painel de 3 juízes (0.9+ trunca as pétalas); com peso 0
  // a folha da F4 é bit-exata (somar 0.0 ao expoente não muda double).
  ctx.cvolWCusp = 0.6;
  // densidade coronal num ponto do espaço do objeto (esfera unitária)
  function cvolDensity(x, y, z){
    var r = Math.sqrt(x*x + y*y + z*z);
    if (r < 1.005 || r > CVOL_ROUT) return 0;
    var bx = 0, by = 0, bz = 0;
    for (var i = 0; i < 10; i++){
      var dx = x - cvolQ[i*4], dy = y - cvolQ[i*4+1], dz = z - cvolQ[i*4+2];
      var r2 = dx*dx + dy*dy + dz*dz + 1e-3;
      var k = cvolQ[i*4+3] / (r2 * Math.sqrt(r2));
      bx += dx*k; by += dy*k; bz += dz*k;
    }
    var bm = Math.sqrt(bx*bx + by*by + bz*bz) + 1e-9;
    var unip = Math.abs((bx*x + by*y + bz*z) / (r * bm));
    // base hidrostática (escala de altura 0.42R: satura na base e morre
    // em ~2.5-3R como nas fotos de eclipse — refs 09/12)
    var base = Math.exp(-(r - 1.0) * 2.38);
    // folha de streamer na superfície neutra; o expoente cresce com a
    // altura => a folha afunila (base larga ~30-40°, cúspide estreita).
    // FASE 6 B2: termo quadrático de altura (peso cusp) fecha o capacete
    // em PONTA — a meia-largura cai ~1/h em vez de ~1/sqrt(h) — e o
    // espinho da folha (unip=0) sobrevive como haste fina (ref-10)
    var h = r - 1.0;
    var sheet = Math.exp(-unip*unip * (6.0 + 18.0*h + ctx.cvolWCusp*130.0*h*h));
    // coroa baixa presa às regiões ativas (|B| alto, só perto da base)
    var loopBase = Math.min(1.1, bm*0.5) * Math.exp(-(r - 1.0) * 6.2);
    // buraco coronal: unipolar forte perto da superfície rarefaz
    // (interior quase preto na ref-11)
    var hu = (unip - 0.60) / 0.30;
    hu = hu < 0 ? 0 : (hu > 1 ? 1 : hu);
    hu = hu*hu*(3.0 - 2.0*hu);
    var hole = hu * Math.exp(-(r - 1.0) * 3.3);
    var dens = base * (ctx.cvolWBase + ctx.cvolWSheet*sheet + ctx.cvolWLoop*loopBase) * (1.0 - ctx.cvolWHole*hole);
    // fade externo: o shell de marcha não corta seco em ROUT
    var fo = (CVOL_ROUT - 0.06 - r) * 4.0;
    if (fo < 0) fo = 0; else if (fo > 1) fo = 1;
    dens *= fo;
    return dens <= 0 ? 0 : (dens > 1 ? 1 : dens);
  }
  function bakeCvolSlice(iz){
    if (iz >= CVOL_N) return;
    var inv = (2.0*CVOL_VR) / CVOL_N, off = -CVOL_VR + 0.5*inv;
    var z = off + iz*inv, rowBase = iz * CVOL_N * CVOL_N;
    for (var iy = 0; iy < CVOL_N; iy++){
      var y = off + iy*inv, idx = rowBase + iy*CVOL_N;
      for (var ix = 0; ix < CVOL_N; ix++){
        var d = cvolDensity(off + ix*inv, y, z);
        // sqrt-encode: 8 bits rendem melhor onde a coroa é tênue
        cvolStage[idx + ix] = (Math.sqrt(d) * 255) | 0;
      }
    }
  }
  function cvolBakeFull(){
    snapshotCvolCharges();
    for (var iz = 0; iz < CVOL_N; iz++) bakeCvolSlice(iz);
    cvolData.set(cvolStage);
    cvolTex.needsUpdate = true;
    ctx.cvolReady = true; ctx.cvolCycles++; ctx.cvolStep = -1;
  }
  if (CVOL_STEPS > 0){
    cvolData = new Uint8Array(CVOL_N*CVOL_N*CVOL_N);
    cvolStage = new Uint8Array(CVOL_N*CVOL_N*CVOL_N);
    cvolTex = new THREE.Data3DTexture(cvolData, CVOL_N, CVOL_N, CVOL_N);
    cvolTex.format = THREE.RedFormat;
    cvolTex.type = THREE.UnsignedByteType;
    cvolTex.minFilter = THREE.LinearFilter;
    cvolTex.magFilter = THREE.LinearFilter;
    cvolTex.wrapS = cvolTex.wrapT = cvolTex.wrapR = THREE.ClampToEdgeWrapping;
    cvolTex.unpackAlignment = 1;
    cvolTex.needsUpdate = true;
    cvolUniforms = {
      uVol: { value: cvolTex },
      uInvRot: { value: cvolInvRot },
      uCvol: { value: 0 },
      uActivity: { value: 0.5 },
      uTime: { value: 0 },
      // contraste das raias finas procedurais sobre o volume (0 =
      // liso). 0.55 = v1-fil-suave, vencedora do painel de 3 juízes
      // da F4 (mediana 7.8: leitura orgânica de eclipse, sem o padrão
      // "penteado" CG do contraste cheio) — sweep 6×2 via
      // setCvolFil/setCvolShape, sem rebuild por variante
      uFil: { value: 0.55 },
      // FASE 6 B2 — plumas polares (ref-09/11): peso UNIFORM (efeito
      // imediato no sweep, zero rebake — modulação procedural angular
      // por PIXEL, o volume 64³ não resolve fios finos). B4: default
      // 0.6 = veredito unânime do painel (0.9+ vira "godray"); com
      // peso 0 o bloco é pulado no shader (imagem F4 bit-idêntica) e
      // com cvol=0 a mesh nem desenha. Ajuste via setCvolShape({plume}).
      uPlume: { value: 0.6 },
      // cargas VIVAS (o mesmo array de Vector4 do disco/coronaRays; o
      // three re-flatten por frame) — o gate de buraco coronal das
      // plumas reavalia a unipolaridade no pé da linha radial do pixel
      uCharges: { value: charges }
    };
    var cvolMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: cvolUniforms,
      vertexShader: [
        'varying vec3 vWorld;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position, 1.0);',
        '  vWorld = w.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'
      ].join('\n'),
      fragmentShader: NOISE_GLSL + '\n' + [
        'precision highp sampler3D;',
        '#define CVOL_STEPS ' + CVOL_STEPS,
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'uniform sampler3D uVol;',
        'uniform mat3 uInvRot;',
        'uniform float uCvol;',
        'uniform float uActivity;',
        'uniform float uTime;',
        'uniform float uFil;',
        'uniform float uPlume;',
        'uniform vec4 uCharges[10];',
        'varying vec3 vWorld;',
        // GLSL3: sem gl_FragColor — saída explícita
        'out vec4 fragColor;',
        'void main(){',
        // raio de PERSPECTIVA real (não a aproximação angular do plano
        // de raias): da câmera pelo vértice do billboard
        '  vec3 ro = cameraPosition;',
        '  vec3 rd = normalize(vWorld - cameraPosition);',
        '  float b = dot(ro, rd);',
        '  float R = SUN_R * ' + CVOL_ROUT.toFixed(3) + ';',
        '  float disc = b*b - (dot(ro,ro) - R*R);',
        '  if (disc <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sq = sqrt(disc);',
        '  float t0 = max(-b - sq, 0.0);',
        '  float t1 = -b + sq;',
        // raio que atinge o DISCO não contribui: a coroa à frente do
        // disco é ~1e-6 do brilho dele (invisível na realidade), e os
        // transparentes desenham DEPOIS dos opacos — sem este corte o
        // segmento frontal somaria brilho por cima do disco (QA G1)
        '  float di = b*b - (dot(ro,ro) - SUN_R*SUN_R);',
        '  if (di > 0.0){ fragColor = vec4(0.0); return; }',
        '  if (t1 <= t0 + 1e-4){ fragColor = vec4(0.0); return; }',
        '  float dt = (t1 - t0) / float(CVOL_STEPS);',
        // jitter determinístico por pixel (esconde banding; det=ok)
        '  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);',
        '  float t = t0 + dt*jit;',
        '  float sum = 0.0; float hsum = 0.0;',
        '  for (int i = 0; i < CVOL_STEPS; i++){',
        '    vec3 pO = (uInvRot * (ro + rd*t)) * (1.0/SUN_R);',
        '    float d = texture(uVol, pO*' + (0.5/CVOL_VR).toFixed(6) + ' + 0.5).r;',
        '    d = d*d;',                       // decode do sqrt-encode
        '    sum += d;',
        '    hsum += d*length(pO);',
        '    t += dt;',
        '  }',
        '  if (sum <= 1e-5){ fragColor = vec4(0.0); return; }',
        '  float hMean = hsum / sum;',
        // raias finas + flicker 1/f no referencial do objeto — a mesma
        // vida do plano de raias (uma avaliação por pixel, não por passo)
        '  vec3 dirO = normalize(uInvRot * normalize(vWorld));',
        '  float f1 = fbmLight(dirO*3.1 + vec3(0.0, 0.0, uTime*0.030));',
        '  float f2 = fbmLight(dirO*7.3 + vec3(5.1, 2.2, uTime*0.045));',
        '  float flick = fbmLight(dirO*1.9 + vec3(3.7, 8.2, uTime*0.55));',
        '  float fil = (0.62 + 0.55*f1) * (0.80 + 0.34*f2) * (0.90 + 0.20*flick);',
        '  fil = 1.0 + (fil - 1.0)*uFil;',
        // paleta quente do projeto, esfriando com a altura média da luz
        '  vec3 col = mix(vec3(1.0,0.72,0.42), vec3(1.0,0.46,0.20), clamp((hMean-1.0)*0.75, 0.0, 1.0));',
        '  float amp = sum * dt * (1.0/SUN_R) * 0.14 * uCvol * fil * (0.70 + 0.60*uActivity);',
        '  vec3 rgb = col * amp;',
        // ------------------------------------------------------------
        // FASE 6 B2 — plumas polares (ref-09 eclipse, ref-11 buraco
        // coronal): fios FINOS e RETOS dentro dos buracos. Termo
        // ADITIVO por pixel gateado por uPlume>0 (peso 0 contribui
        // exatamente nada => look atual bit-idêntico). dirO é constante
        // ao longo de cada linha radial da imagem (billboard passa pelo
        // centro) => ruído angular em dirO dá fios retos e radiais que,
        // confinados ao buraco, abrem em leque a partir do centro dele.
        // Early-outs em ordem de custo: perfil de altura (rp) -> gate
        // de buraco (2x10 cargas) -> só então os 2 fbm dos fios.
        // ------------------------------------------------------------
        '  if (uPlume > 0.0){',
        // pé da linha radial: vWorld ~ ponto de máxima aproximação do
        // raio; rp = altura no plano do céu em unidades de R
        '    vec3 pO0 = (uInvRot * vWorld) * (1.0/SUN_R);',
        '    float rp = length(pO0);',
        // nasce na base (r~1.0-1.1), afina e some até ~1.5R
        '    float hk = 1.0 - smoothstep(1.06, 1.52, rp);',
        '    hk *= hk;',
        '    if (hk > 0.001){',
        // buraco coronal = campo ABERTO: unipolaridade alta em DUAS
        // alturas (1.06 e 1.35) na radial do pixel — o min() mata os
        // picos locais de unip sobre cargas bipolares (loops fechados
        // perdem a radialidade com a altura; o buraco não). Janela
        // 0.74-0.92, mais estrita que a do bake (0.60-0.90): plumas
        // estritamente DENTRO do buraco visível
        '      float ug = 1.0;',
        '      for (int s = 0; s < 2; s++){',
        '        vec3 fp = dirO * (s == 0 ? 1.06 : 1.35);',
        '        vec3 B = vec3(0.0);',
        '        for (int i = 0; i < 10; i++){',
        '          vec3 dv = fp - uCharges[i].xyz;',
        '          float r2 = dot(dv, dv) + 1e-3;',
        '          B += dv * (uCharges[i].w / (r2 * sqrt(r2)));',
        '        }',
        '        ug = min(ug, abs(dot(B, dirO)) / (length(B) + 1e-9));',
        '      }',
        '      float hg = smoothstep(0.74, 0.92, ug);',
        '      if (hg > 0.001){',
        // fios: 2 oitavas angulares ESTÁTICAS no referencial do objeto
        // (giram com o Sol; sem uTime — nada de cintilação nova, flags
        // temporais são do Bloco C). Freq máx 18 ~ 2.5x o f2 das raias
        // (7.3): sem estroboscópio novo em rotação. O limiar sobe com a
        // altura => os fios AFINAM ao longo do comprimento
        '        float p1 = fbmLight(dirO*9.0 + vec3(7.7, 1.3, 0.0));',
        '        float p2 = fbmLight(dirO*18.0 + vec3(3.1, 12.9, 0.0));',
        '        float strand = smoothstep(0.12 + 0.20*(rp - 1.0), 0.46, p1*0.55 + p2*0.65);',
        // ganho calibrado na rodada: plume=0.9 soma ~+8-14% no setor do
        // cap polar do mínimo (medido) — visível e ainda "bem mais
        // fraco que os streamers equatoriais" (ref-09)
        '        float pl = uPlume * hg * hk * strand * uCvol * 0.28;',
        '        rgb += mix(vec3(1.0,0.72,0.42), vec3(1.0,0.52,0.26), clamp((rp-1.0)*1.4, 0.0, 1.0)) * pl;',
        '      }',
        '    }',
        '  }',
        '  fragColor = vec4(rgb, 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    coronaVol = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), cvolMat);
    coronaVol.renderOrder = -1;
    coronaVol.visible = false;
    scene.add(coronaVol);
    // knob ligado desde a carga (?cvol=): bake inicial síncrono com as
    // cargas do frame 0 (determinístico) — a coroa nunca aparece vazia
    if (ctx.CVOL_K > 0.001) cvolBakeFull();
  }
  ctx.coronaVol = coronaVol; ctx.cvolUniforms = cvolUniforms;
  ctx.CVOL_STEPS = CVOL_STEPS; ctx.CVOL_N = CVOL_N;
  ctx.cvolBakeFull = cvolBakeFull; ctx.bakeCvolSlice = bakeCvolSlice;
  ctx.snapshotCvolCharges = snapshotCvolCharges; ctx.cvolData = cvolData;
  ctx.cvolStage = cvolStage; ctx.cvolTex = cvolTex; ctx.cvolInvRot = cvolInvRot;
}

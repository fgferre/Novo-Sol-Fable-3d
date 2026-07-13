// atmosphere/cme.js — CME de flux-rope: casca raymarched analítica +
// partículas em transform feedback WebGL2 CRU (movido verbatim, inclusive
// o programa TF). Estado mutável (ctx.cme*) compartilhado com solinfo/
// director/autoTune; refs de flares/perf são adiadas via ctx.* (criadas
// em estágios posteriores do init, lidas só em runtime).

import * as THREE from 'three';

export function createCME(ctx){
  var scene = ctx.scene, renderer = ctx.renderer, camera = ctx.camera,
      TP = ctx.TP, NOISE_GLSL = ctx.NOISE_GLSL, SUN_RADIUS = ctx.SUN_RADIUS,
      CORONA_SIZE = ctx.CORONA_SIZE, cmeRand = ctx.cmeRand, sunMesh = ctx.sunMesh;
  // ---------------------------------------------------------------
  // FASE 5 — "Erupção": CME de flux-rope que se desprende em flares
  // GRANDES. A casca é raymarched ANALÍTICA (sem textura 3D): uma
  // bolha elipsoidal auto-similar — alongada ao longo do eixo do rope
  // (a tangente da PIL congelada no evento) — cujo centro sobe e cujo
  // raio cresce ∝ distância (meio-ângulo ~constante, como nas CMEs
  // reais). A frente brilhante é a casca fina; a cavidade é o interior
  // rarefeito; o núcleo denso é a proeminência ejetada (blob que vira
  // as PARTÍCULAS nos tiers com transform feedback). O brilho leva o
  // peso de THOMSON sin²(ângulo ao plano do céu): CME no limbo é
  // brilhante, CME de frente ("halo") é tênue — física, não estética.
  // Cinemática em FORMA FECHADA (rise lento → aceleração sincronizada
  // com a fase impulsiva do flare → cruzeiro auto-similar): saltar o
  // relógio via hook reproduz qualquer instante, determinístico.
  // Knob cme default 0 = nenhum evento dispara, mesh invisível, frame
  // e custo idênticos ao baseline.
  // ---------------------------------------------------------------
  var CME_STEPS = TP.cmestep | 0;
  var CME_PTS_N = TP.cmen | 0;
  var CME_ROUT = 3.30;              // a marcha vai além do cvol (2.88)
  ctx.cmeT = 999, ctx.cmeAmp = 0, ctx.cmeCooldown = 0, ctx.cmeCount = 0;
  ctx.cmeKilled = false;            // kill-switch do auto-tune (padrão cvolKilled)
  var cmeDir = new THREE.Vector3(0, 0, 1);
  var cmeAxis = new THREE.Vector3(1, 0, 0);
  var cmeSeedVal = 0;
  ctx.lastCmeHDR = 0;
  // ganho do núcleo denso — mediana do painel de 3 juízes da F5
  // (1.3/1.4/0.9): com o boost do shader, 1.3 fecha a leitura de
  // "três partes" (frente/cavidade/núcleo) sem virar cometa
  ctx.cmeCoreGain = 1.3;
  // FASE 6 B3 — pesos de FORMA do look (sem knob de URL/painel; hooks
  // __solInfo.setCmeShape):
  //   cmeStriaK 0-1.2: estrias HELICOIDAIS do rim (fbm em coordenada
  //     helicoidal do rope — laços aninhados, ref-13) — 0 = fbm
  //     isotrópico da F5 bit-exato (ramo do shader byte-idêntico);
  //   cmeCavK 0-1.0: rarefação da CAVIDADE (gate por raio no interior
  //     da bolha) — 0 = casca da F5 bit-exata (multiplicação por 1.0).
  // B4: defaults 0.8/0.85 = candidato CALIBRADO por medição (razão
  // frente:cavidade 1.19×→2.11× ≥ alvo 2×; beadRMS 0.58× o isotrópico)
  // + inspeção direta — SEM painel de juízes (exceção do modo economia
  // da rodada, registrada em docs/fase-6-acabamento-fisico.md). Só
  // visíveis durante um evento com cme>0 (knob-gated): frame default
  // segue bit-exato.
  ctx.cmeStriaK = 0.8;
  ctx.cmeCavK = 0.85;
  // 3º eixo da base ortonormal do rope (axis × dir), congelado por
  // evento em launchCME — scratch, zero alocação no animate
  var cmeE2 = new THREE.Vector3(0, 0, 1);
  var cmeWorldTmp = new THREE.Vector3();
  // cinemática fechada: v(t) = 0.045 + 0.19·smoothstep((t-1.2)/2.6);
  // D(t) = ∫v dt tem primitiva analítica (x³ − x⁴/2 no trecho suave) —
  // rise lento do rope (~1.2s, o rope infla no lugar), aceleração
  // impulsiva SINCRONIZADA com a fase impulsiva do flare, cruzeiro
  // constante. Evento visível ~7-8s — o mesmo fôlego do rescaldo
  // gradual do flare (τ≈6s), tempo comprimido de VFX como tudo aqui.
  function cmeSmoothInt(x){
    if (x <= 0) return 0;
    if (x >= 1) return x - 0.5;
    var x3 = x*x*x;
    return x3 - 0.5*x3*x;
  }
  function cmeDist(t){
    return 0.045*t + 0.19*2.6*cmeSmoothInt((t - 1.2)/2.6);
  }
  // geometria auto-similar do instante t (escreve em cmeGeomOut — sem
  // alocação; usada pelo update, pelos hooks e pelo QA). Meio-ângulo
  // de expansão ~26° (rho cresce 0.45/R percorrido — CMEs típicas têm
  // 25-35°); brilho superficial dilui com a expansão (conservação de
  // massa na casca) e a frente esmaece ao alcançar a borda do domínio.
  var cmeGeomOut = { d:0, cx:0, rho:0, w:0, front:0, env:0 };
  function cmeGeomAt(t){
    var d = cmeDist(t);
    var rho = 0.16 + 0.45*d;
    var cx = 1.09 + d;
    var rise = t/0.7; rise = rise < 0 ? 0 : (rise > 1 ? 1 : rise);
    rise = rise*rise*(3.0 - 2.0*rise);
    var dil = Math.pow(0.16/rho, 0.88);
    var front = cx + rho;
    var fo = 1.0 - Math.min(1, Math.max(0, (front - 2.75)/0.50));
    cmeGeomOut.d = d; cmeGeomOut.cx = cx; cmeGeomOut.rho = rho;
    cmeGeomOut.w = 0.034 + 0.046*d;   // casca mais fina = rim com mais contraste
    cmeGeomOut.front = front;
    cmeGeomOut.env = rise * dil * fo;
    return cmeGeomOut;
  }
  function launchCME(amp){
    ctx.cmeT = 0;
    ctx.cmeAmp = amp;
    cmeDir.copy(ctx.surfFlareDir);
    cmeAxis.copy(ctx.flareTanDir);
    // FASE 6 B3: fecha a base ortonormal do rope 1x por evento (JS,
    // scratch — nada aloca). axis ⊥ dir por construção (flares.js
    // fecha o triedro dir/perp/tan); e2 = axis × dir dá a referência
    // de fase da coordenada helicoidal das estrias no shader.
    cmeE2.crossVectors(cmeAxis, cmeDir).normalize();
    cmeSeedVal = cmeRand()*100.0;
    ctx.cmeCooldown = 20;
    ctx.cmeCount++;
    cmePtsSpawnArm();   // partículas re-armam a janela de respawn
  }
  // gatilho: chamado quando um flare dispara (natural ou forçado). Só
  // flare GRANDE solta CME — a probabilidade cresce com a amplitude
  // (X-class ~certo, M-class raro), no stream próprio cmeRand.
  function maybeLaunchCME(){
    if (ctx.CME_K <= 0.001 || CME_STEPS <= 0 || ctx.cmeKilled) return false;
    if (ctx.cmeT < 900 || ctx.cmeCooldown > 0) return false;
    var p = (ctx.surfFlareAmp - 0.85)/0.45;
    p = Math.max(0, Math.min(1, p)) * Math.min(1, ctx.CME_K);
    if (p <= 0 || cmeRand() >= p) return false;
    launchCME(ctx.surfFlareAmp);
    return true;
  }
  var cmeMesh = null, cmeUniforms = null;
  var cmeInvRot = new THREE.Matrix3();
  if (CME_STEPS > 0){
    cmeUniforms = {
      uInvRotC: { value: cmeInvRot },
      uCmeDir: { value: cmeDir },
      uCmeAxis: { value: cmeAxis },
      // x = distância do centro da bolha, y = raio, z = espessura da
      // casca, w = amplitude (envelope × knob × Thomson global no JS)
      uCmeKin: { value: new THREE.Vector4(1.1, 0.18, 0.045, 0) },
      // x = ganho do núcleo, y = tempo, z = seed do evento, w = livre
      uCmeMat: { value: new THREE.Vector4(0.9, 0, 0, 0) },
      // FASE 6 B3: x = stria (estrias helicoidais 0-1.2), y = cav
      // (rarefação da cavidade 0-1.0) — pesos de forma via setCmeShape
      uCmeShape: { value: new THREE.Vector2(0, 0) },
      // 3º eixo da base do rope (axis × dir, congelado em launchCME)
      uCmeE2: { value: cmeE2 }
    };
    var cmeMatShader = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: cmeUniforms,
      vertexShader: [
        'varying vec3 vWorld;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position, 1.0);',
        '  vWorld = w.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * w;',
        '}'
      ].join('\n'),
      fragmentShader: NOISE_GLSL + '\n' + [
        '#define CME_STEPS ' + CME_STEPS,
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'uniform mat3 uInvRotC;',
        'uniform vec3 uCmeDir;',
        'uniform vec3 uCmeAxis;',
        'uniform vec4 uCmeKin;',
        'uniform vec4 uCmeMat;',
        'uniform vec2 uCmeShape;',
        'uniform vec3 uCmeE2;',
        'varying vec3 vWorld;',
        'out vec4 fragColor;',
        'void main(){',
        '  vec3 ro = cameraPosition;',
        '  vec3 rd = normalize(vWorld - cameraPosition);',
        '  float b = dot(ro, rd);',
        '  float R = SUN_R * ' + CME_ROUT.toFixed(3) + ';',
        '  float disc = b*b - (dot(ro,ro) - R*R);',
        '  if (disc <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sq = sqrt(disc);',
        '  float t0 = max(-b - sq, 0.0);',
        '  float t1 = -b + sq;',
        // o raio que atinge o DISCO não contribui (mesmo corte do cvol:
        // a coroa à frente do disco é invisível e os transparentes
        // desenham depois dos opacos — sem isto somaria sobre o disco)
        '  float di = b*b - (dot(ro,ro) - SUN_R*SUN_R);',
        '  if (di > 0.0){ fragColor = vec4(0.0); return; }',
        '  if (t1 <= t0 + 1e-4){ fragColor = vec4(0.0); return; }',
        // marcha no espaço do OBJETO (uma transformação, marcha linear)
        '  float invR = 1.0/SUN_R;',
        '  vec3 roO = (uInvRotC * ro) * invR;',
        '  vec3 rdO = normalize(uInvRotC * rd);',
        '  vec3 c = uCmeDir * uCmeKin.x;',
        '  float rho = uCmeKin.y;',
        '  float wSh = uCmeKin.z;',
        // amostragem CERTA da casca fina: marchar só o trecho do raio
        // que cruza a ESFERA ENVOLVENTE da bolha (raio rho+3.2w·k do
        // alongamento). Sem isto, 16-32 passos na corda inteira de
        // ~6.6R pulam uma casca de ~0.05R — vira névoa sem borda em
        // vez do rim de path-length do Thomson.
        '  float rBub = (rho + 3.2*wSh) * 1.38;',
        '  vec3 oc = roO - c;',
        '  float bB = dot(oc, rdO);',
        '  float dB = bB*bB - (dot(oc,oc) - rBub*rBub);',
        '  if (dB <= 0.0){ fragColor = vec4(0.0); return; }',
        '  float sqB = sqrt(dB);',
        '  float tA = max(-bB - sqB, max(t0*invR, 0.0));',
        '  float tB = min(-bB + sqB, t1*invR);',
        '  if (tB <= tA + 1e-5){ fragColor = vec4(0.0); return; }',
        // FASE 6 B3b — rarefação da CAVIDADE, POR RAIO (uCmeShape.y):
        // beta = parâmetro de impacto do raio ao centro da bolha na
        // MESMA métrica squash-0.26 do dc. beta≈rho é o raio tangente
        // ao rim (fica intacto — a frente segue brilhante); beta→0 é o
        // raio que cruza o miolo: as DUAS travessias da casca (perto e
        // longe) escurecem juntas — num pipeline aditivo a cavidade
        // projetada só escurece reduzindo a emissão do PRÓPRIO CME. O
        // núcleo (proeminência ejetada) NÃO é atenuado — hierarquia da
        // ref-13: frente ≥ núcleo ≫ cavidade. cav=0: rare=1.0 e o
        // multiply por 1.0 é bit-exato (casca da F5 intocada).
        // Profundidade CALIBRADA na rodada (medido: o preenchimento
        // NÃO-casca da banda da cavidade — núcleo+partículas+bloom ≈
        // 44% do total — limita o contraste): a casca some quase toda
        // no miolo (0.92), a meia-rampa satura em cav≈0.87
        // (min(cav·1.15,1)) e as PARTÍCULAS ganham gate próprio (vCav
        // no material dos pontos — "shell/veil/pontos" do plano B3).
        '  float rare = 1.0;',
        '  if (uCmeShape.y > 0.0){',
        '    vec3 aM = oc - uCmeAxis*(dot(oc, uCmeAxis)*0.26);',
        '    vec3 bM = rdO - uCmeAxis*(dot(rdO, uCmeAxis)*0.26);',
        '    float tI = -dot(aM, bM)/max(dot(bM, bM), 1e-6);',
        '    float beta = length(aM + bM*tI)/max(rho, 1e-4);',
        '    rare = 1.0 - min(uCmeShape.y*1.15, 1.0)*0.92*(1.0 - smoothstep(0.42, 0.96, beta));',
        '  }',
        '  float dtO = (tB - tA) / float(CME_STEPS);',
        '  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);',
        '  float tO = tA + dtO*jit;',
        '  float sum = 0.0; float hsum = 0.0; float ksum = 0.0;',
        '  for (int i = 0; i < CME_STEPS; i++){',
        '    vec3 p = roO + rdO*tO;',
        '    tO += dtO;',
        '    float r = length(p);',
        '    float fade = smoothstep(1.01, 1.06, r);',
        '    if (fade <= 0.0) continue;',
        // casca elipsoidal: alongada ao longo do eixo do rope (croissant)
        '    vec3 q = p - c;',
        '    float qa = dot(q, uCmeAxis);',
        '    float dc = length(q - uCmeAxis*(qa*0.26));',
        // casca engrossa rumo à BASE (as pernas do rope enraizadas no
        // limbo — flag 3/3 do painel: "bolha destacada"; a ref-13
        // mantém as pernas até o occulter)
        '    float wEff = wSh*(1.0 + 1.4*exp(-(r - 1.0)*2.8));',
        '    float shell = exp(-((dc - rho)*(dc - rho))/(wEff*wEff));',
        // pernas ancoradas: material só no hemisfério do evento
        '    float ca = dot(p, uCmeDir)/max(r, 1e-4);',
        '    shell *= smoothstep(0.02, 0.42, ca);',
        // núcleo denso (a proeminência ejetada) atrás do centro da
        // bolha — mais compacto e 2.2x mais forte (painel: núcleo era
        // "sub-liminar", a leitura três-partes só fechava com core alto)
        '    vec3 pk = p - uCmeDir*(uCmeKin.x - rho*0.34);',
        '    float rk = rho*0.30;',
        '    float core = exp(-dot(pk,pk)/(rk*rk)) * (uCmeMat.x*2.2);',
        // fios do rope: fbm no referencial da bolha (a textura ACOMPANHA
        // a casca em vez de ficar pregada no espaço).
        // FASE 6 B3a — com stria>0 o fbm é amostrado em coordenada
        // HELICOIDAL do rope (rr = raio do tubo em unidades de rho;
        // chi = azimute em volta do eixo, enrolado com pitch 1.1 ao
        // longo do eixo — embedding cos/sin mantém a periodicidade):
        // anisotrópico ALONGADO ao longo dos laços (arcos ~70°+, ~4
        // tubos aninhados através do rim) em vez de "contas" (ref-13).
        // Blend por COORDENADA (qi→qh) até stria=1; acima, aprofunda a
        // modulação. Early-out: fora do rim (shell*fade<=1e-4, onde o
        // fil é invisível) o ramo stria>0 nem avalia o fbm — o custo
        // por amostra cai onde a casca não contribui. stria=0 executa
        // o ramo isotrópico BYTE-IDÊNTICO ao da F5 (bit-exato).
        '    float n = 0.0;',
        '    if (uCmeShape.x <= 0.0){',
        '      n = fbmLight(q*(2.4/max(rho, 0.2)) + vec3(uCmeMat.z, uCmeMat.z*0.31, 0.0));',
        '    } else if (shell*fade > 1e-4){',
        '      float sN = max(rho, 0.2);',
        '      vec3 qr = q - uCmeAxis*qa;',
        '      float rr = length(qr)/sN;',
        '      float chi = atan(dot(qr, uCmeE2), dot(qr, uCmeDir) + 1e-5) - 1.1*qa/sN + uCmeMat.z*0.7;',
        '      vec3 qh = vec3(cos(chi)*0.85, sin(chi)*0.85, rr*4.5 + uCmeMat.z*0.53);',
        '      vec3 qi = q*(2.4/sN) + vec3(uCmeMat.z, uCmeMat.z*0.31, 0.0);',
        '      n = fbmLight(mix(qi, qh, min(uCmeShape.x, 1.0)));',
        '      n *= 1.0 + 0.35*max(uCmeShape.x - 1.0, 0.0);',
        '    }',
        '    float fil = 0.68 + 0.55*n;',
        // peso de Thomson por amostra: sin² do ângulo ao plano do céu.
        // O núcleo (material denso de proeminência) sente MENOS o
        // Thomson — brilha por densidade, não só por geometria.
        '    float mu = dot(p, rdO)/max(r, 1e-4);',
        '    float thom = 1.0 - mu*mu;',
        '    float d = shell*fil*(0.22 + 0.78*thom)*fade*rare + core*(0.50 + 0.50*thom)*fade;',
        '    sum += d;',
        '    hsum += d*clamp((r - 1.0)*0.8, 0.0, 1.0);',
        '    ksum += core*fade;',
        '  }',
        '  if (sum <= 1e-5){ fragColor = vec4(0.0); return; }',
        '  float hK = hsum/sum;',
        // luz branca espalhada (Thomson), QUENTE e emissiva (painel de
        // cinema: o tom marrom sobre o céu azul lia como "fumaça/
        // fuligem") — o núcleo puxa ao vermelho de proeminência
        '  vec3 col = mix(vec3(1.0, 0.88, 0.70), vec3(1.0, 0.66, 0.42), clamp(hK*0.8 + (ksum/sum)*0.6, 0.0, 1.0));',
        '  float amp = sum * dtO * 1.05 * uCmeKin.w;',
        '  fragColor = vec4(col*amp, 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    cmeMesh = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), cmeMatShader);
    cmeMesh.renderOrder = -0.75;   // depois da coroa (-1), antes da arcada escura (-0.5)
    cmeMesh.visible = false;
    scene.add(cmeMesh);
  }

  // ---------------------------------------------------------------
  // FASE 5 — partículas do ejecta por TRANSFORM FEEDBACK (o payoff
  // WebGL2 nº 2 do roadmap): advecção 100% na GPU (posição+velocidade
  // em ping-pong de VBOs, rasterizer discard no passo de sim), zero
  // readback, zero alocação por frame. O material do núcleo do CME
  // acompanha a expansão auto-similar da casca; uma fração "chove" de
  // volta (chuva coronal do rescaldo). Render: 2 THREE.Points fixos
  // (um por VBO, GLBufferAttribute) alternando visibilidade — os VAOs
  // do three ficam estáveis, sem rebuild por frame. Tiers sem
  // partículas (cmen=0) ou sem WebGL2: subsistema inteiro ausente.
  // ---------------------------------------------------------------
  var cmePts = { on:false, cur:0, prog:null, tf:null, vaos:[null,null],
                 posBuf:[null,null], velBuf:[null,null],
                 meshes:[null,null], uLoc:null, armT:-1 };
  function cmePtsSpawnArm(){ if (cmePts.on) cmePts.armT = 0; }
  (function buildCmeParticles(){
    if (CME_PTS_N <= 0 || CME_STEPS <= 0) return;
    var gl = renderer.getContext();
    if (!renderer.capabilities.isWebGL2) return;
    var vsrc = [
      '#version 300 es',
      'precision highp float;',
      'uniform float uDt;',
      'uniform float uT;',
      'uniform float uSeed;',
      'uniform float uRespawn;',
      'uniform vec3 uDir;',
      'uniform vec3 uAxis;',
      'uniform vec4 uKin;',   // x=cx, y=rho, z=vel de expansão, w=amp do evento
      'in vec4 aPos;',        // xyz (R=1) + vida
      'in vec4 aVel;',        // xyz + tipo (0 casca/ejecta, 1 chuva)
      'out vec4 tfPos;',
      'out vec4 tfVel;',
      'float h1(float n){ return fract(sin(n)*43758.5453123); }',
      'void main(){',
      '  float id = float(gl_VertexID);',
      '  vec4 P = aPos; vec4 V = aVel;',
      '  if (P.w <= 0.0){',
      '    if (uRespawn > 0.5){',
      // nasce na base do rope: leque ao longo do eixo da PIL (o
      // material da proeminência que ergue), determinístico por id+seed
      '      float a1 = h1(id*1.618 + uSeed);',
      '      float a2 = h1(id*2.717 + uSeed*1.37);',
      '      float a3 = h1(id*3.141 + uSeed*2.09);',
      '      float a4 = h1(id*4.669 + uSeed*0.53);',
      // leque COLIMADO (painel de cinema: o spray abria ~10h-4h para
      // um evento de 1h) mas ALONGADO em raio — o material lê como a
      // COLUNA que ergue da ref-14, não como bola nem como leque
      '      vec3 perp = normalize(cross(uDir, uAxis));',
      '      vec3 base = normalize(uDir + uAxis*(a1 - 0.5)*0.80 + perp*(a2 - 0.5)*0.34);',
      '      P.xyz = base*(1.03 + 0.60*a3*a3);',   // mais denso na base, cauda rala
      '      P.w = 0.60 + 0.80*a4;',
      // dispersão de velocidade por partícula: sem ela o campo-alvo
      // comum recolapsa o enxame num blob coeso de borda dura
      '      V.xyz = base*(0.02 + 0.10*a2)',
      '             + uAxis*(a1 - 0.5)*0.05 + perp*(a4 - 0.5)*0.05;',
      '      V.w = step(0.72, a1);',           // ~28% viram chuva coronal
      '    }',
      '  } else {',
      '    vec3 c = uDir*uKin.x;',
      '    vec3 rel = P.xyz - c;',
      '    float rl = length(rel) + 1e-5;',
      // campo de velocidade auto-similar: radial a partir do centro da
      // bolha + arrasto do vento na direção do evento
      '    vec3 vT = (rel/rl)*uKin.z*(0.40 + 0.60*clamp(rl/max(uKin.y, 0.05), 0.0, 1.4))',
      '            + uDir*uKin.z*0.55;',
      '    if (V.w > 0.5 && uT > 4.0){',
      // chuva coronal: no rescaldo, a fração presa drena de volta
      '      vT = -normalize(P.xyz)*0.20;',
      '    }',
      '    V.xyz += (vT - V.xyz)*min(1.0, uDt*2.2);',
      // cintilação de trajetória barata (não é curl de verdade, mas
      // quebra o alinhamento perfeito sem textura de campo)
      '    float w1 = h1(id*7.77)*6.2831;',
      '    V.xyz += vec3(sin(uT*1.9 + w1), sin(uT*2.3 + w1*1.7), cos(uT*2.1 + w1))*(uDt*0.012);',
      '    P.xyz += V.xyz*uDt;',
      '    float r = length(P.xyz);',
      '    P.w -= uDt*(0.085 + 0.05*h1(id*5.55));',
      '    if (r < 1.005 || r > 3.45) P.w = 0.0;',
      '  }',
      '  tfPos = P;',
      '  tfVel = V;',
      '  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);',
      '  gl_PointSize = 1.0;',
      '}'
    ].join('\n');
    var fsrc = '#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){ o = vec4(0.0); }';
    function sh(type, src){
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.error('CME TF shader: ' + gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsrc), fs = sh(gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.transformFeedbackVaryings(prog, ['tfPos', 'tfVel'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      console.error('CME TF link: ' + gl.getProgramInfoLog(prog));
      return;
    }
    var init = new Float32Array(CME_PTS_N*4);   // vida 0 = morta (spawn no evento)
    for (var bi = 0; bi < 2; bi++){
      cmePts.posBuf[bi] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.posBuf[bi]);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      cmePts.velBuf[bi] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.velBuf[bi]);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    var locPos = gl.getAttribLocation(prog, 'aPos');
    var locVel = gl.getAttribLocation(prog, 'aVel');
    for (var vi = 0; vi < 2; vi++){
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.posBuf[vi]);
      gl.enableVertexAttribArray(locPos);
      gl.vertexAttribPointer(locPos, 4, gl.FLOAT, false, 16, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cmePts.velBuf[vi]);
      gl.enableVertexAttribArray(locVel);
      gl.vertexAttribPointer(locVel, 4, gl.FLOAT, false, 16, 0);
      cmePts.vaos[vi] = vao;
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    cmePts.tf = gl.createTransformFeedback();
    cmePts.prog = prog;
    cmePts.uLoc = {
      dt: gl.getUniformLocation(prog, 'uDt'),
      t: gl.getUniformLocation(prog, 'uT'),
      seed: gl.getUniformLocation(prog, 'uSeed'),
      resp: gl.getUniformLocation(prog, 'uRespawn'),
      dir: gl.getUniformLocation(prog, 'uDir'),
      axis: gl.getUniformLocation(prog, 'uAxis'),
      kin: gl.getUniformLocation(prog, 'uKin')
    };
    // render: 2 Points fixos, um por VBO de posição (VAO do three estável)
    var ptsMat = new THREE.ShaderMaterial({
      uniforms: {
        uPx: { value: 30.0 },
        uAmp: { value: 0.0 },
        // FASE 6 B3b — rarefação da cavidade nas PARTÍCULAS ("shell/
        // veil/pontos"): a nuvem que se dispersa pelo MIOLO da bolha
        // acima do núcleo esmaece com cav; a coluna da base/núcleo fica
        // (material denso da ref-13/14). x=cx, y=rho, z=cav.
        uCavKin: { value: new THREE.Vector4(1.1, 0.18, 0, 0) },
        uCavDir: { value: cmeDir },
        uCavAxis: { value: cmeAxis }
      },
      vertexShader: [
        '#define SUN_R ' + SUN_RADIUS.toFixed(4),
        'attribute vec4 aPos;',
        'attribute vec4 aVel;',
        'varying float vLife;',
        'varying float vKind;',
        'varying vec2 vDir;',
        'varying float vStretch;',
        'varying float vCav;',
        'uniform float uPx;',
        'uniform vec4 uCavKin;',
        'uniform vec3 uCavDir;',
        'uniform vec3 uCavAxis;',
        'float hsz(float n){ return fract(sin(n)*43758.5453123); }',
        'void main(){',
        '  vLife = aPos.w;',
        '  vKind = aVel.w;',
        '  vec4 mv = modelViewMatrix * vec4(aPos.xyz*SUN_R, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        // FASE 6 B3b — gate da cavidade por partícula (aPos já está no
        // espaço do objeto, R=1 — o MESMO referencial da casca): dentro
        // do rope (dcp<~1, métrica squash-0.26) E acima do centro do
        // núcleo (hcol além de cx−0.34ρ) a partícula esmaece. cav=0 ⇒
        // vCav=1.0 e o multiply no fragment é bit-exato.
        '  vec3 pd = aPos.xyz - uCavDir*uCavKin.x;',
        '  float qa2 = dot(pd, uCavAxis);',
        '  float dcp = length(pd - uCavAxis*(qa2*0.26))/max(uCavKin.y, 1e-4);',
        '  float hcol = dot(aPos.xyz, uCavDir);',
        '  float inCav = (1.0 - smoothstep(0.60, 0.95, dcp))',
        '              * smoothstep(uCavKin.x - 0.50*uCavKin.y, uCavKin.x - 0.15*uCavKin.y, hcol);',
        '  vCav = 1.0 - min(uCavKin.z*1.15, 1.0)*0.85*inCav;',
        // direção da VELOCIDADE em tela: o sprite vira um risco
        // alongado no rumo do movimento (painel 3/3: pontos uniformes
        // liam como confete/glitter — material filamentar não é dot)
        '  vec4 mv2 = modelViewMatrix * vec4((aPos.xyz + aVel.xyz*0.35)*SUN_R, 1.0);',
        '  vec4 c1 = projectionMatrix * mv2;',
        '  vec2 sd = c1.xy/max(abs(c1.w), 1e-4) - gl_Position.xy/max(abs(gl_Position.w), 1e-4);',
        '  float sl = length(sd);',
        '  vDir = sl > 1e-5 ? sd/sl : vec2(1.0, 0.0);',
        '  vStretch = clamp(sl*30.0, 0.0, 2.4);',
        // mistura de grãos finos e flocos (70% pequenos, cauda ~3x)
        '  float g = hsz(aPos.x*57.3 + aPos.y*23.1 + aPos.z*11.7);',
        '  float sz = uPx*(0.35 + 0.45*vKind + 1.6*g*g*g)/max(0.1, -mv.z);',
        '  gl_PointSize = clamp(sz*(1.0 + 0.5*vStretch), 0.0, 6.5) * step(0.001, vLife);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vLife;',
        'varying float vKind;',
        'varying vec2 vDir;',
        'varying float vStretch;',
        'varying float vCav;',
        'uniform float uAmp;',
        'void main(){',
        '  vec2 d = gl_PointCoord - 0.5;',
        // gaussiana ALONGADA na direção do movimento (streak), fina na
        // normal — em repouso volta ao grão redondo
        '  float t = dot(d, vDir);',
        '  float n = d.x*vDir.y - d.y*vDir.x;',
        '  float a = exp(-(t*t*10.0/(1.0 + 2.2*vStretch) + n*n*(10.0 + 8.0*vStretch)));',
        '  a *= smoothstep(0.0, 0.15, vLife) * min(1.0, vLife);',
        '  vec3 col = mix(vec3(1.0, 0.52, 0.26), vec3(1.0, 0.76, 0.50), 0.25 + 0.5*vKind);',
        // vCav = rarefação da cavidade (FASE 6 B3b; 1.0 bit-exato com cav=0)
        '  gl_FragColor = vec4(col*(a*uAmp*0.30*vCav), 1.0);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    });
    for (var mi = 0; mi < 2; mi++){
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('aPos', new THREE.GLBufferAttribute(cmePts.posBuf[mi], gl.FLOAT, 4, 4, CME_PTS_N));
      geo.setAttribute('aVel', new THREE.GLBufferAttribute(cmePts.velBuf[mi], gl.FLOAT, 4, 4, CME_PTS_N));
      geo.setDrawRange(0, CME_PTS_N);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), SUN_RADIUS*4);
      var pm = new THREE.Points(geo, ptsMat);
      pm.frustumCulled = false;
      pm.visible = false;
      pm.rotation.z = 0.1265;        // mesmo tilt dos demais grupos do objeto
      pm.renderOrder = 0.5;          // aditivo, depois das emissões da esfera
      scene.add(pm);
      cmePts.meshes[mi] = pm;
    }
    cmePts.ptsMat = ptsMat;
    cmePts.on = true;
  })();
  // um passo de simulação por TRANSFORM FEEDBACK: lê do VBO corrente,
  // escreve no outro, alterna. Rasterizer discard: nenhum fragmento.
  // Depois devolve o estado GL ao three (resetState) — o custo é ~zero
  // e elimina qualquer suposição sobre caches de binding.
  function cmePtsTick(dt, respawn){
    var gl = renderer.getContext();
    var src = cmePts.cur, dst = 1 - src;
    gl.useProgram(cmePts.prog);
    gl.uniform1f(cmePts.uLoc.dt, dt);
    gl.uniform1f(cmePts.uLoc.t, ctx.cmeT);
    gl.uniform1f(cmePts.uLoc.seed, cmeSeedVal);
    gl.uniform1f(cmePts.uLoc.resp, respawn ? 1.0 : 0.0);
    gl.uniform3f(cmePts.uLoc.dir, cmeDir.x, cmeDir.y, cmeDir.z);
    gl.uniform3f(cmePts.uLoc.axis, cmeAxis.x, cmeAxis.y, cmeAxis.z);
    var g = cmeGeomOut;   // preenchido pelo update do frame
    // velocidade de expansão = derivada aproximada do D(t) na fase atual
    var vExp = 0.045 + 0.19*Math.min(1, Math.max(0, (ctx.cmeT - 1.2)/2.6));
    gl.uniform4f(cmePts.uLoc.kin, g.cx, g.rho, vExp, ctx.cmeAmp);
    gl.bindVertexArray(cmePts.vaos[src]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, cmePts.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, cmePts.posBuf[dst]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, cmePts.velBuf[dst]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, CME_PTS_N);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindVertexArray(null);
    renderer.resetState();
    cmePts.cur = dst;
  }
  // update por frame do CME (relógio, uniforms, visibilidade, lente).
  // Com knob 0 ou sem evento: só comparações — custo ~zero, sem estado.
  function updateCME(delta){
    if (ctx.cmeCooldown > 0) ctx.cmeCooldown -= delta;
    var active = ctx.cmeT < 900;
    if (active){
      ctx.cmeT += delta;
      cmeGeomAt(ctx.cmeT);
      if (cmeGeomOut.front > CME_ROUT || ctx.cmeT > 18){ ctx.cmeT = 999; active = false; }
    }
    var on = active && ctx.CME_K > 0.001 && CME_STEPS > 0 && !ctx.cmeKilled && ctx.subToggle.cme;
    ctx.lastCmeHDR = 0;
    if (cmeMesh) cmeMesh.visible = on;
    var ptsOn = on && cmePts.on && ctx.subToggle.cmepts;
    if (cmePts.on){
      cmePts.meshes[0].visible = ptsOn && cmePts.cur === 0;
      cmePts.meshes[1].visible = ptsOn && cmePts.cur === 1;
    }
    if (!on) return;
    var g = cmeGeomOut;
    // peso de Thomson GLOBAL para a lente/QA: sin² do ângulo do evento
    // ao plano do céu (o shader refina por amostra)
    cmeWorldTmp.copy(cmeDir).applyQuaternion(sunMesh.quaternion);
    var muC = cmeWorldTmp.dot(ctx.camDirN);
    var thom = 1.0 - muC*muC;
    ctx.lastCmeHDR = g.env * ctx.cmeAmp * (0.25 + 0.75*thom) * Math.min(1.5, ctx.CME_K);
    cmeMesh.quaternion.copy(camera.quaternion);
    cmeInvRot.setFromMatrix4(sunMesh.matrixWorld).transpose();
    cmeUniforms.uCmeKin.value.set(g.cx, g.rho, g.w,
      g.env * ctx.cmeAmp * Math.min(1.5, ctx.CME_K));
    // o núcleo esmaece conforme o material vira partículas/se dispersa
    cmeUniforms.uCmeMat.value.set(ctx.cmeCoreGain*Math.exp(-ctx.cmeT*0.10), ctx.cmeT, cmeSeedVal, 0);
    // FASE 6 B3: pesos de forma (hooks setCmeShape — 2 floats, zero alloc)
    cmeUniforms.uCmeShape.value.set(ctx.cmeStriaK, ctx.cmeCavK);
    if (ptsOn){
      if (cmePts.armT >= 0) cmePts.armT += delta;
      var respawn = cmePts.armT >= 0 && cmePts.armT < 0.9;
      cmePtsTick(delta, respawn);
      // esmaece com o envelope do evento (sem corte seco no fim; o
      // +0.15 mantém a chuva coronal legível no rescaldo). Base 0.55:
      // o painel flagrou a nuvem SATURANDO (knob perceptualmente
      // inerte porque o aditivo estourava no tonemap)
      cmePts.ptsMat.uniforms.uAmp.value = 0.42 * Math.min(1.5, ctx.CME_K) *
        (0.35 + 0.65*thom) * Math.min(1, ctx.cmeAmp) *
        Math.min(1, 2.2*g.env + 0.15);
      // FASE 6 B3b: geometria do gate da cavidade das partículas
      // (uCavDir/uCavAxis referenciam os Vector3 vivos — zero alloc)
      cmePts.ptsMat.uniforms.uCavKin.value.set(g.cx, g.rho, ctx.cmeCavK, 0);
      // pós-tick: a visibilidade segue o VBO recém-escrito
      cmePts.meshes[0].visible = cmePts.cur === 0;
      cmePts.meshes[1].visible = cmePts.cur === 1;
    }
  }
  ctx.cmeMesh = cmeMesh; ctx.cmeUniforms = cmeUniforms; ctx.cmeInvRot = cmeInvRot;
  ctx.cmeDir = cmeDir; ctx.cmeGeomAt = cmeGeomAt; ctx.cmePts = cmePts;
  ctx.launchCME = launchCME; ctx.maybeLaunchCME = maybeLaunchCME;
  ctx.updateCME = updateCME; ctx.CME_STEPS = CME_STEPS; ctx.CME_PTS_N = CME_PTS_N;
}

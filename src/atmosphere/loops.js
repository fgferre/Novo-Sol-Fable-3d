// atmosphere/loops.js — loops coronais RK4 no MESMO campo de cargas +
// arcada pós-flare. Corpo movido verbatim; loopRand é stream próprio
// (1 draw no init em initLoopStates); refs de flares/perf adiadas via ctx.*.

import * as THREE from 'three';

export function createLoops(ctx){
  var scene = ctx.scene, renderer = ctx.renderer, TP = ctx.TP,
      knob = ctx.knob, lk = ctx.lk, SUN_RADIUS = ctx.SUN_RADIUS,
      bFieldJS = ctx.act.bFieldJS, lifeEnvelope = ctx.act.lifeEnvelope,
      pairStates = ctx.pairStates, loopRand = ctx.loopRand,
      coronaRaysUniforms = ctx.coronaRaysUniforms;
  // ---------------------------------------------------------------
  // FASE 1 — LOOPS CORONAIS: linhas de campo do MESMO modelo de cargas
  // (bFieldJS = espelho JS do BFIELD_GLSL/uCharges) traçadas por RK4 na
  // CPU e amortizadas como o bake fatiado (≤1 traço por frame; arcada
  // de flare ≤2). O traço vive no espaço do OBJETO e gira com a esfera.
  // Renderização: um único LineSegments aditivo com brilho HDR (o bloom
  // faz o glow) e envelope por loop via uniform array — zero alocações
  // por frame. Knob `loops` default 0 = frame idêntico ao baseline
  // (convenção LOOP-5); os slots de ARCADA PÓS-FLARE são reusados pelo
  // flare two-ribbon e acendem em qualquer default DURANTE um flare
  // (pendência do audit-loop6 — flares já eram um evento default).
  // ---------------------------------------------------------------
  ctx.LOOP_K = knob('loops', lk('loops', 0), 0.0, 1.5);
  var LOOP_AMB = TP.loops, LOOP_ARC = TP.larc, LOOP_N = LOOP_AMB + LOOP_ARC;
  var LOOP_SEG = TP.lseg;
  // FASE 2 (débito LOD da Fase 1): fitas orientadas à câmera no lugar de
  // LineSegments de 1px. Cada ponto da linha central vira DOIS vértices
  // (aSide ±1) expandidos no vertex shader perpendicular à direção
  // projetada do segmento — tubo de meia-largura FIXA EM MUNDO com piso
  // de 1px na tela (longe continua fino como antes; perto vira fita, não
  // wireframe). Mesma filosofia de buffer: um único conjunto pré-alocado
  // no tamanho máximo, nunca realocado; só position/aTan mudam no re-traço.
  var LOOP_VPTS = LOOP_SEG + 1;                       // pontos da linha central
  var loopPositions = new Float32Array(LOOP_N * LOOP_VPTS * 2 * 3);
  var loopTanAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2 * 3);
  var loopParamAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopIdxAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopSideAttr = new Float32Array(LOOP_N * LOOP_VPTS * 2);
  var loopIndex = new Uint16Array(LOOP_N * LOOP_SEG * 6);
  (function fillLoopStatics(){
    // aParam (0..1 ao longo do arco), aLoop (slot) e aSide (±1) são
    // ESTÁTICOS; o índice (2 triângulos por segmento) também
    for (var li = 0; li < LOOP_N; li++){
      var vbase = li*LOOP_VPTS*2;
      for (var s = 0; s <= LOOP_SEG; s++){
        var v = vbase + s*2;
        loopParamAttr[v]     = s/LOOP_SEG;
        loopParamAttr[v + 1] = s/LOOP_SEG;
        loopIdxAttr[v]     = li;
        loopIdxAttr[v + 1] = li;
        loopSideAttr[v]     = -1;
        loopSideAttr[v + 1] =  1;
      }
      for (var g = 0; g < LOOP_SEG; g++){
        var v0 = vbase + g*2, o = (li*LOOP_SEG + g)*6;
        loopIndex[o]   = v0;     loopIndex[o+1] = v0 + 1; loopIndex[o+2] = v0 + 2;
        loopIndex[o+3] = v0 + 2; loopIndex[o+4] = v0 + 1; loopIndex[o+5] = v0 + 3;
      }
    }
  })();
  var loopGeo = new THREE.BufferGeometry();
  loopGeo.setAttribute('position', new THREE.BufferAttribute(loopPositions, 3));
  loopGeo.setAttribute('aTan', new THREE.BufferAttribute(loopTanAttr, 3));
  loopGeo.setAttribute('aParam', new THREE.BufferAttribute(loopParamAttr, 1));
  loopGeo.setAttribute('aLoop', new THREE.BufferAttribute(loopIdxAttr, 1));
  loopGeo.setAttribute('aSide', new THREE.BufferAttribute(loopSideAttr, 1));
  loopGeo.setIndex(new THREE.BufferAttribute(loopIndex, 1));
  var loopEnvArr = new Float32Array(LOOP_N);   // intensidade final por loop
  var loopHotArr = new Float32Array(LOOP_N);   // 1 = recém-reconectado (branco)
  // FASE 4 (débito F1/F2/F3): peso de ABSORÇÃO por loop — só os slots
  // de arcada enchem, quando os laços pós-flare esfriam de aditivo
  // para escuro (em H-alfa a arcada fria absorve contra o disco)
  var loopCoolArr = new Float32Array(LOOP_N);
  var loopUniforms = {
    uTime: { value: 0 },
    uLoopEnv: { value: loopEnvArr },
    uLoopHot: { value: loopHotArr },
    // FASE 2 — fitas com espessura de tela: resolução do viewport (px)
    // e meia-largura do tubo em unidades de MUNDO (~0.006 R☉ visual)
    uRes: { value: new THREE.Vector2(2, 2) },
    uLoopW: { value: SUN_RADIUS * 0.0060 }
  };
  var loopMaterial = new THREE.ShaderMaterial({
    uniforms: loopUniforms,
    vertexShader: [
      'attribute float aParam;',
      'attribute float aLoop;',
      'attribute float aSide;',
      'attribute vec3 aTan;',
      // lookup do envelope no VERTEX shader (indexação dinâmica de
      // uniform é garantida lá, não no fragment em ES baixo)
      'uniform float uLoopEnv[' + LOOP_N + '];',
      'uniform float uLoopHot[' + LOOP_N + '];',
      'uniform vec2 uRes;',
      'uniform float uLoopW;',
      'varying float vParam;',
      'varying float vEnv;',
      'varying float vHot;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying float vWide;',
      'void main(){',
      '  vParam = aParam; vId = aLoop; vSide = aSide;',
      '  int li = int(aLoop + 0.5);',
      '  vEnv = uLoopEnv[li];',
      '  vHot = uLoopHot[li];',
      // fita orientada à câmera: expande o vértice perpendicular à
      // DIREÇÃO PROJETADA do segmento (espaço de tela). Largura = tubo
      // de meia-largura fixa em mundo projetado para pixels, com PISO
      // de 1px (longe a fita degenera na linha fina de antes — o brilho
      // sub-pixel vira fade de energia em vFade, sem cintilar) e teto
      // de 22px (perto é fita larga, não wireframe).
      '  vec4 clipA = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipB = projectionMatrix * modelViewMatrix * vec4(position + aTan, 1.0);',
      '  float wA = max(clipA.w, 0.01);',
      '  float wB = max(clipB.w, 0.01);',
      '  vec2 dS = (clipB.xy/wB - clipA.xy/wA) * uRes;',
      '  float dl = length(dS);',
      '  vec2 nrm = (dl > 1e-3) ? vec2(-dS.y, dS.x)/dl : vec2(0.0, 1.0);',
      '  float pxScale = 0.5 * uRes.y * projectionMatrix[1][1];',
      '  float rawPx = uLoopW * pxScale / wA;',
      // FASE 3 (débito F2): loop quase FACE-ON degenerava em "rabisco"
      // de 1px — o piso de largura agora cresce com o encurtamento
      // perspectivo do segmento (dl projetado vs comprimento esperado
      // sem foreshortening); de lado nada muda (piso 1px do LOOP-5)
      '  float expPx = length(aTan) * pxScale / wA;',
      '  float faceK = 1.0 - clamp(dl / max(expPx, 1e-3), 0.0, 1.0);',
      '  float wMin = 1.0 + 2.2*faceK*faceK;',
      '  float wpx = clamp(rawPx, wMin, 14.0);',
      // energia conservada na largura FORÇADA: o brilho cai na razão
      // rawPx/wpx (generaliza o fade sub-pixel antigo — para wMin=1 a
      // expressão é idêntica à do LOOP-5)
      '  vFade = clamp(rawPx / wpx, 0.05, 1.0);',
      // vWide 0→1 conforme a fita alarga na tela: o fragment usa para
      // AMORTECER o contraste do fluxo (que em 1px lia como cintilação
      // viva, mas numa fita larga vira "salsichas" de brilho)
      '  vWide = clamp((rawPx - 1.0)/13.0, 0.0, 1.0);',
      '  clipA.xy += nrm * (aSide * wpx * 2.0 / uRes) * wA;',
      '  gl_Position = clipA;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'varying float vParam;',
      'varying float vEnv;',
      'varying float vHot;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying float vWide;',
      'void main(){',
      '  if (vEnv < 0.002) discard;',
      // plasma escoando pelo tubo (condensação coronal): 2 harmônicas
      // incomensuráveis em sentidos opostos — vivo, sem período audível.
      // De perto (fita larga, vWide→1) o contraste do fluxo amortece:
      // o brilho pulsante que anima um fio de 1px quebraria a fita em
      // salsichas (visto no smoke ribbons-close da Fase 2)
      '  float f1 = sin(vParam*18.85 - uTime*1.9 + vId*7.31);',
      '  float f2 = sin(vParam*40.84 + uTime*1.23 + vId*3.17);',
      '  float fAmp = 1.0 - 0.62*vWide;',
      '  float flow = 0.62 + (0.26*f1 + 0.14*f2)*fAmp;',
      // pés mais brilhantes (coluna emissiva mais densa na base, como
      // o "moss" das imagens TRACE/AIA)
      '  float foot = 1.0 - vParam*(1.0 - vParam)*2.0;',
      '  float bright = flow * (0.55 + 0.45*foot*foot);',
      // perfil transversal do tubo: coluna de emissão máxima no eixo,
      // caindo suave na borda (integral de um cilindro oco fino leria
      // como 2 riscos; o cheio lê como tubo de plasma)
      '  float prof = 1.0 - vSide*vSide;',
      '  vec3 col = mix(vec3(1.0, 0.40, 0.12), vec3(1.0, 0.74, 0.40), flow*0.6);',
      // arcada recém-reconectada é quase branca e ESFRIA para a paleta
      '  col = mix(col, vec3(1.25, 1.05, 0.85), vHot);',
      '  gl_FragColor = vec4(col * (bright * vEnv * prof * vFade), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,         // o disco OCULTA loops atrás do limbo
    side: THREE.DoubleSide   // a fita gira com a câmera; sem lado "de trás"
  });
  var loopMesh = new THREE.Mesh(loopGeo, loopMaterial);
  loopMesh.frustumCulled = false;   // posições mudam; a esfera de 2.2R sempre enquadra
  loopMesh.visible = false;
  // FASE 4 — ARCADA ESCURA pós-esfriamento (débito da F1): gêmeo de
  // ABSORÇÃO da fita, mesmo mecanismo multiplicativo dst*(1-src) do
  // fprom. Compartilha a MESMA geometria/buffers do loopMesh (zero
  // alocação nova por frame); o envelope vem de uLoopCool, que só os
  // slots de arcada enchem quando o laço esfria no fim do rescaldo.
  // renderOrder -0.5: multiplica DEPOIS da coroa (a arcada fria faz
  // silhueta contra a coroa também) e antes das emissões aditivas.
  var loopAbsUniforms = {
    uTime: { value: 0 },
    uLoopCool: { value: loopCoolArr },
    uRes: loopUniforms.uRes,
    uLoopW: loopUniforms.uLoopW
  };
  var loopAbsMaterial = new THREE.ShaderMaterial({
    uniforms: loopAbsUniforms,
    vertexShader: [
      'attribute float aParam;',
      'attribute float aLoop;',
      'attribute float aSide;',
      'attribute vec3 aTan;',
      'uniform float uLoopCool[' + LOOP_N + '];',
      'uniform vec2 uRes;',
      'uniform float uLoopW;',
      'varying float vParam;',
      'varying float vCool;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying vec3 vWPos;',
      'void main(){',
      '  vParam = aParam; vId = aLoop; vSide = aSide;',
      '  int li = int(aLoop + 0.5);',
      '  vCool = uLoopCool[li];',
      '  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      // a MESMA fita billboard do loopMesh (largura em px com piso e
      // teto) — a absorção veste exatamente o corpo da emissão
      '  vec4 clipA = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '  vec4 clipB = projectionMatrix * modelViewMatrix * vec4(position + aTan, 1.0);',
      '  float wA = max(clipA.w, 0.01);',
      '  float wB = max(clipB.w, 0.01);',
      '  vec2 dS = (clipB.xy/wB - clipA.xy/wA) * uRes;',
      '  float dl = length(dS);',
      '  vec2 nrm = (dl > 1e-3) ? vec2(-dS.y, dS.x)/dl : vec2(0.0, 1.0);',
      '  float pxScale = 0.5 * uRes.y * projectionMatrix[1][1];',
      '  float rawPx = uLoopW * pxScale / wA;',
      '  float expPx = length(aTan) * pxScale / wA;',
      '  float faceK = 1.0 - clamp(dl / max(expPx, 1e-3), 0.0, 1.0);',
      '  float wMin = 1.0 + 2.2*faceK*faceK;',
      '  float wpx = clamp(rawPx, wMin, 14.0);',
      '  vFade = clamp(rawPx / wpx, 0.05, 1.0);',
      '  clipA.xy += nrm * (aSide * wpx * 2.0 / uRes) * wA;',
      '  gl_Position = clipA;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'varying float vParam;',
      'varying float vCool;',
      'varying float vId;',
      'varying float vSide;',
      'varying float vFade;',
      'varying vec3 vWPos;',
      'void main(){',
      '  if (vCool < 0.004) discard;',
      // miolo SÓLIDO (lição do painel F3: buracos até zero leem como
      // dithering) — o fluxo vira modulação suave, não gate
      '  float f1 = sin(vParam*18.85 - uTime*0.6 + vId*7.31);',
      '  float body = 0.72 + 0.18*f1;',
      '  float prof = 1.0 - vSide*vSide;',
      // absorção escala com mu (a luz que RESTA — regra do fprom): no
      // limbo o multiply forte sobre o anel escurecido lia como renda
      '  float mu = dot(normalize(vWPos), normalize(cameraPosition - vWPos));',
      '  float ab = prof * body * vCool * vFade * clamp(mu, 0.0, 1.0) * smoothstep(0.12, 0.30, mu);',
      '  gl_FragColor = vec4(vec3(ab * 0.55), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  var loopAbsMesh = new THREE.Mesh(loopGeo, loopAbsMaterial);
  loopAbsMesh.frustumCulled = false;
  loopAbsMesh.visible = false;
  loopAbsMesh.renderOrder = -0.5;
  var loopGroup = new THREE.Group();
  loopGroup.add(loopMesh);
  loopGroup.add(loopAbsMesh);
  scene.add(loopGroup);

  // Traçador RK4 com passo de ARCO fixo sobre o campo unitário B/|B|
  // (o comprimento do passo independe de |B| — estável perto das
  // cargas). Scratch pré-alocado: zero alocações nos re-traços.
  var LOOP_TRACE_MAX = 176;
  var loopTraceBuf = new Float32Array((LOOP_TRACE_MAX + 1)*3);
  var loopTraceLen = new Float32Array(LOOP_TRACE_MAX + 1);
  var loopPtsBuf = new Float32Array((LOOP_SEG + 1)*3);
  var loopFieldP = new THREE.Vector3();
  var lk1 = [0,0,0], lk2 = [0,0,0], lk3 = [0,0,0], lk4 = [0,0,0];
  function loopFieldDir(x, y, z, side, out){
    var B = bFieldJS(loopFieldP.set(x, y, z));
    var m = Math.sqrt(B.x*B.x + B.y*B.y + B.z*B.z) + 1e-9;
    out[0] = B.x/m*side; out[1] = B.y/m*side; out[2] = B.z/m*side;
  }
  var loopStats = { traces: 0, fails: 0, ms: 0, probes: 0, probeRej: 0 };
  // FASE 3 (débito F2 "semeador perdulário"): pré-validação da
  // TOPOLOGIA com uma sonda Euler grosseira (~11x mais barata que o
  // RK4 fino: 64 passos × 1 avaliação de campo vs 176 × 4) — a
  // rejeição de ~80% é dominada pela topologia do campo multi-carga
  // (linha aberta/apex fora da faixa), que a sonda enxerga. Margem no
  // apex em VALOR (±0.012/±0.15), não fração: a 1ª versão usava
  // minApex*0.88=0.911 < raio inicial 1.004 — nunca rejeitava nada
  // (medido: probes 80, probeRej 0, fails finos inalterados em 80%).
  function probeFieldLine(sx, sy, sz, minApex, maxApex){
    var t0 = performance.now();
    var px = sx*1.004, py = sy*1.004, pz = sz*1.004;
    var B0 = bFieldJS(loopFieldP.set(px, py, pz));
    var side = (B0.x*px + B0.y*py + B0.z*pz) >= 0.0 ? 1.0 : -1.0;
    var h = 0.045, apex = 0, landed = false;
    for (var st = 0; st < 88; st++){
      loopFieldDir(px, py, pz, side, lk1);
      px += lk1[0]*h; py += lk1[1]*h; pz += lk1[2]*h;
      var r = Math.sqrt(px*px + py*py + pz*pz);
      if (r > apex) apex = r;
      if (r < 1.001){ landed = true; break; }
      if (r > 2.3) break;
    }
    loopStats.probes++;
    loopStats.ms += performance.now() - t0;
    if (!landed || st < 2 || apex < minApex || apex > maxApex + 0.12){
      loopStats.probeRej++;
      return false;
    }
    return true;
  }
  // traça a linha de campo que passa por (sx,sy,sz) na direção que
  // SOBE; devolve o nº de pontos no scratch, 0 = inválida (linha
  // aberta/rasteira demais). [minApex, maxApex] distingue loops
  // ambientes (altos) de arcadas pós-flare — compactas POR FÍSICA: o
  // laço recém-reconectado nasce baixo, logo acima das fitas.
  function traceFieldLine(sx, sy, sz, minApex, maxApex, h){
    var t0 = performance.now();
    var half = h*0.5, sixth = h/6.0;
    var px = sx*1.004, py = sy*1.004, pz = sz*1.004;
    var B0 = bFieldJS(loopFieldP.set(px, py, pz));
    var side = (B0.x*px + B0.y*py + B0.z*pz) >= 0.0 ? 1.0 : -1.0;
    var n = 0, apex = 0, landed = false;
    loopTraceBuf[0] = px; loopTraceBuf[1] = py; loopTraceBuf[2] = pz;
    loopTraceLen[0] = 0;
    for (var st = 0; st < LOOP_TRACE_MAX; st++){
      loopFieldDir(px, py, pz, side, lk1);
      loopFieldDir(px + lk1[0]*half, py + lk1[1]*half, pz + lk1[2]*half, side, lk2);
      loopFieldDir(px + lk2[0]*half, py + lk2[1]*half, pz + lk2[2]*half, side, lk3);
      loopFieldDir(px + lk3[0]*h,    py + lk3[1]*h,    pz + lk3[2]*h,    side, lk4);
      px += (lk1[0] + 2.0*(lk2[0] + lk3[0]) + lk4[0]) * sixth;
      py += (lk1[1] + 2.0*(lk2[1] + lk3[1]) + lk4[1]) * sixth;
      pz += (lk1[2] + 2.0*(lk2[2] + lk3[2]) + lk4[2]) * sixth;
      n++;
      loopTraceBuf[n*3] = px; loopTraceBuf[n*3+1] = py; loopTraceBuf[n*3+2] = pz;
      loopTraceLen[n] = loopTraceLen[n-1] + h;
      var r = Math.sqrt(px*px + py*py + pz*pz);
      if (r > apex) apex = r;
      if (r < 1.001){ landed = true; break; }   // pousou na outra polaridade
      if (r > 2.3) break;                        // linha ABERTA (polar): descarta
    }
    loopStats.ms += performance.now() - t0;
    loopStats.traces++;
    if (!landed || n < 8 || apex < minApex || apex > maxApex){
      loopStats.fails++;
      return 0;
    }
    return n + 1;
  }
  // reamostra o traço em LOOP_SEG+1 pontos EQUIDISTANTES em arco (a
  // fase do fluxo no shader precisa de param uniforme) e grava o slot
  // como pares de segmento, já em escala de mundo (SUN_RADIUS)
  function writeLoopSlot(slot, nPts){
    var total = loopTraceLen[nPts-1];
    var j = 0;
    for (var s = 0; s <= LOOP_SEG; s++){
      var target = total * s / LOOP_SEG;
      while (j < nPts - 2 && loopTraceLen[j+1] < target) j++;
      var l0 = loopTraceLen[j], l1 = loopTraceLen[j+1];
      var f = (l1 > l0) ? (target - l0)/(l1 - l0) : 0.0;
      loopPtsBuf[s*3]   = (loopTraceBuf[j*3]   + (loopTraceBuf[j*3+3] - loopTraceBuf[j*3])  *f) * SUN_RADIUS;
      loopPtsBuf[s*3+1] = (loopTraceBuf[j*3+1] + (loopTraceBuf[j*3+4] - loopTraceBuf[j*3+1])*f) * SUN_RADIUS;
      loopPtsBuf[s*3+2] = (loopTraceBuf[j*3+2] + (loopTraceBuf[j*3+5] - loopTraceBuf[j*3+2])*f) * SUN_RADIUS;
    }
    // FASE 2 — fitas: cada ponto central vira 2 vértices (lados ±1);
    // a tangente (diferença central dos vizinhos) vai junto para o
    // vertex shader orientar a fita à câmera
    var base = slot*LOOP_VPTS*2*3;
    for (var g = 0; g <= LOOP_SEG; g++){
      var p3 = g*3;
      var pn = (g < LOOP_SEG ? g + 1 : LOOP_SEG)*3;
      var pp = (g > 0 ? g - 1 : 0)*3;
      var tx = loopPtsBuf[pn]   - loopPtsBuf[pp];
      var ty = loopPtsBuf[pn+1] - loopPtsBuf[pp+1];
      var tz = loopPtsBuf[pn+2] - loopPtsBuf[pp+2];
      var o = base + g*6;
      loopPositions[o]   = loopPtsBuf[p3];
      loopPositions[o+1] = loopPtsBuf[p3+1];
      loopPositions[o+2] = loopPtsBuf[p3+2];
      loopPositions[o+3] = loopPtsBuf[p3];
      loopPositions[o+4] = loopPtsBuf[p3+1];
      loopPositions[o+5] = loopPtsBuf[p3+2];
      loopTanAttr[o]   = tx; loopTanAttr[o+1] = ty; loopTanAttr[o+2] = tz;
      loopTanAttr[o+3] = tx; loopTanAttr[o+4] = ty; loopTanAttr[o+5] = tz;
    }
    loopGeo.attributes.position.needsUpdate = true;
    loopGeo.attributes.aTan.needsUpdate = true;
  }
  // semeia perto do pé LÍDER de uma região viva (sorteio ∝ |w|), num
  // leque voltado ao seguidor: as linhas traçadas viram a arcada da
  // região ativa — alturas variadas conforme o offset do pé
  var loopSeedTmp = new THREE.Vector3();
  var loopAxisTmp = new THREE.Vector3();
  var loopLatTmp = new THREE.Vector3();
  function pickLoopSeed(out){
    var tot = 0, i, ps = null;
    for (i = 0; i < pairStates.length; i++) tot += Math.abs(pairStates[i].lead.w);
    if (tot < 0.05) return false;
    var r = loopRand()*tot;
    for (i = 0; i < pairStates.length; i++){
      r -= Math.abs(pairStates[i].lead.w);
      if (r <= 0){ ps = pairStates[i]; break; }
    }
    if (!ps) ps = pairStates[pairStates.length-1];
    if (Math.abs(ps.lead.w) < 0.25) return false;   // região quase morta não enche loop
    loopSeedTmp.set(ps.lead.x, ps.lead.y, ps.lead.z).normalize();
    loopAxisTmp.set(ps.foll.x, ps.foll.y, ps.foll.z).normalize();
    loopAxisTmp.addScaledVector(loopSeedTmp, -loopAxisTmp.dot(loopSeedTmp));
    if (loopAxisTmp.lengthSq() < 1e-6) return false;
    loopAxisTmp.normalize();
    loopLatTmp.crossVectors(loopSeedTmp, loopAxisTmp);
    // FASE 2: o viés do leque pela separação do par foi EXPERIMENTADO e
    // revertido — rejeição medida 79.7% vs 80% do leque fixo (a rejeição
    // é dominada pela topologia do campo multi-carga, não pelo offset).
    // Registrado em docs/fase-2; o débito "semeador perdulário" segue
    // aberto e segue inofensivo (0.01 ms/traço).
    out.copy(loopSeedTmp)
       .addScaledVector(loopAxisTmp, 0.02 + 0.16*loopRand())
       .addScaledVector(loopLatTmp, (loopRand() - 0.5)*0.16)
       .normalize();
    return true;
  }
  // ciclo de vida dos loops ambientes: mesmo padrão das regiões ativas
  // (idade/período/lifeEnvelope); no fim do ciclo o slot é re-traçado
  // no campo DO MOMENTO — loops acompanham a evolução das cargas
  var loopStatesA = [];
  (function initLoopStates(){
    for (var i = 0; i < LOOP_AMB; i++){
      loopStatesA.push({ age: 0, period: 34 + loopRand()*36, ok: false });
    }
  })();
  var loopSeedOut = new THREE.Vector3();
  function retraceAmbient(slot){
    // FASE 3: sonda barata filtra até 12 candidatos; o RK4 fino roda só
    // nos aprovados (máx 4). Antes: 4 traços finos cegos com ~80% de
    // rejeição => P(slot vazio) ~0.41; agora o slot quase sempre enche.
    var fine = 0;
    for (var tries = 0; tries < 12 && fine < 4; tries++){
      if (!pickLoopSeed(loopSeedOut)) break;
      if (!probeFieldLine(loopSeedOut.x, loopSeedOut.y, loopSeedOut.z, 1.035, 1.95)) continue;
      fine++;
      var nP = traceFieldLine(loopSeedOut.x, loopSeedOut.y, loopSeedOut.z, 1.035, 1.95, 0.02);
      if (nP > 0){
        writeLoopSlot(slot, nP);
        var st = loopStatesA[slot];
        st.ok = true; st.age = 0; st.period = 34 + loopRand()*36;
        return true;
      }
    }
    return false;
  }
  // ARCADA PÓS-FLARE: slots extras re-semeados a cada flare ao longo da
  // tangente da PIL; acendem em SEQUÊNCIA (o "zíper" da reconexão
  // propagando pela linha neutra), com o envelope GRADUAL do flare, e
  // esfriam de branco-quente para a paleta coronal
  var arcStates = [];
  (function initArcStates(){
    for (var i = 0; i < LOOP_ARC; i++) arcStates.push({ ok: false, delay: 0, off: 0 });
  })();
  ctx.lastArcAbsMax = 0;   // FASE 4: pico corrente da arcada escura (QA)
  ctx.arcQueueN = 0;
  var arcSeedBase = new THREE.Vector3();
  var arcSeedTan = new THREE.Vector3();
  var arcSeedPerp = new THREE.Vector3();
  var arcSeedOut = new THREE.Vector3();
  function scheduleFlareArcade(){
    // congela a moldura da PIL do EVENTO (o Sol gira; a arcada não
    // pode escorregar para outra moldura no meio do rescaldo)
    arcSeedBase.copy(ctx.surfFlareDir);
    arcSeedTan.copy(ctx.flareTanDir);
    arcSeedPerp.copy(ctx.flarePerpDir);
    for (var i = 0; i < LOOP_ARC; i++){
      var st = arcStates[i];
      st.ok = false;
      st.off = ((LOOP_ARC > 1 ? i/(LOOP_ARC-1) : 0.5) - 0.5) * 0.16 + (loopRand() - 0.5)*0.015;
      st.delay = i*0.10 + loopRand()*0.05;
      loopEnvArr[LOOP_AMB + i] = 0;
      loopCoolArr[LOOP_AMB + i] = 0;
    }
    ctx.arcQueueN = LOOP_ARC;
  }
  // uma linha só é ARCADA se pousar PERTO do flare (≤ ~23°): a PIL de
  // sol calmo pode conectar o ponto a outra região/polo — laço gigante
  // que leria como raio saindo do disco, não como arcada pós-flare
  function arcTraceCompact(nP){
    if (nP === 0) return false;
    var e0 = (nP - 1)*3;
    var ex = loopTraceBuf[e0], ey = loopTraceBuf[e0+1], ez = loopTraceBuf[e0+2];
    var em = Math.sqrt(ex*ex + ey*ey + ez*ez) + 1e-9;
    return (ex*arcSeedBase.x + ey*arcSeedBase.y + ez*arcSeedBase.z)/em > 0.92;
  }
  function traceArcadeJob(){
    var i = LOOP_ARC - ctx.arcQueueN;
    ctx.arcQueueN--;
    var st = arcStates[i];
    // parte do lado de UMA polaridade (offset ATRAVÉS da PIL ~ onde a
    // fita estaciona na fase gradual): a linha sobe, cruza a linha
    // neutra e pousa do outro lado. Sondagem numérica (2026-07): a
    // linha pelo ponto médio a 1.004 é o próprio ápice (rasteira);
    // across 0.06–0.12 dá ápice 1.03–1.17 com pouso ≤ ~10° — a arcada
    // baixa clássica. Passo fino (h=0.01): arcos curtos com pontos
    // suficientes p/ curvar. Se o campo local não fechar compacto, o
    // slot fica apagado ("não houve arcada" é resultado físico válido).
    for (var att = 0; att < 3; att++){
      var across = -0.06 - 0.03*att;
      arcSeedOut.copy(arcSeedBase)
        .addScaledVector(arcSeedTan, st.off + (att > 0 ? (loopRand() - 0.5)*0.02 : 0))
        .addScaledVector(arcSeedPerp, across)
        .normalize();
      var nP = traceFieldLine(arcSeedOut.x, arcSeedOut.y, arcSeedOut.z, 1.025, 1.35, 0.01);
      if (arcTraceCompact(nP)){
        writeLoopSlot(LOOP_AMB + i, nP);
        st.ok = true;
        return;
      }
    }
  }
  // atualização por frame (chamada no animate): laços de índice, sem
  // closures — zero alocações. Orçamento de traço: 2 jobs de arcada OU
  // 1 re-traço ambiente por frame (nunca ambos).
  function updateLoops(delta){
    var loopsOn = ctx.subToggle.loops && ctx.LOOP_K > 0.001;
    var act = coronaRaysUniforms.uActivity.value;
    var i, st;
    if (ctx.arcQueueN > 0){ traceArcadeJob(); if (ctx.arcQueueN > 0) traceArcadeJob(); }
    else if (loopsOn){
      // re-traço ambiente amortizado: acha O PRIMEIRO slot vencido
      for (i = 0; i < LOOP_AMB; i++){
        st = loopStatesA[i];
        if (!st.ok || st.age >= st.period*0.90){
          retraceAmbient(i);
          break;
        }
      }
    }
    var arcMax = 0, arcAbsMax = 0;
    for (i = 0; i < LOOP_ARC; i++){
      st = arcStates[i];
      var envA = 0, envAbs = 0;
      if (st.ok){
        var ta = ctx.surfFlareT - st.delay;
        if (ta > 0){
          // FASE 2: a arcada NÃO aparece durante o flash impulsivo —
          // fisicamente os laços pós-reconexão crescem na fase gradual,
          // e visualmente a arcada de frente lia como "anéis fantasma"
          // ao redor do core (flagrado unânime pelo painel de juízes,
          // presente até no controle sem knobs). Gate 0.55→1.05 no
          // relógio do evento; em t>=2.5 (check B4) já vale 1.
          var arcGate = Math.min(1, Math.max(0, (ctx.surfFlareT - 0.55)/0.5));
          envA = ctx.flareEnvGrad(ta) * 1.25 * ctx.surfFlareAmp * arcGate;
          var hotK = Math.exp(-ta*0.30);
          loopHotArr[LOOP_AMB + i] = hotK;
          // FASE 4 (débito F1): o laço que ESFRIA troca emissão por
          // ABSORÇÃO — o envelope escuro cresce com (1-hot) e decai
          // no dobro do fôlego do gradual (a arcada fria demora a
          // drenar; em H-alfa ela persiste escura sobre o disco)
          envAbs = ctx.flareEnvGrad(ta*0.5) * (1.0 - hotK) * ctx.surfFlareAmp * arcGate;
        }
      }
      if (envA < 0.004) envA = 0;
      if (envAbs < 0.004) envAbs = 0;
      loopEnvArr[LOOP_AMB + i] = envA;
      loopCoolArr[LOOP_AMB + i] = Math.min(1, envAbs);
      if (envA > arcMax) arcMax = envA;
      if (envAbs > arcAbsMax) arcAbsMax = envAbs;
    }
    for (i = 0; i < LOOP_AMB; i++){
      st = loopStatesA[i];
      if (!loopsOn || !st.ok){ loopEnvArr[i] = 0; continue; }
      st.age += delta;
      // brilho = ciclo de vida × knob × atividade global do ciclo
      // ("uma estrela, um estado": sol ativo tem coroa mais cheia)
      loopEnvArr[i] = lifeEnvelope(st.age/st.period) * ctx.LOOP_K * (0.65 + 0.55*act);
      loopHotArr[i] = 0;
    }
    loopUniforms.uTime.value = ctx.elapsed;
    loopUniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
    loopMesh.visible = ctx.subToggle.loops && (loopsOn || arcMax > 0 || ctx.arcQueueN > 0);
    // arcada escura: só entra no draw quando algum slot esfriou de fato
    loopAbsUniforms.uTime.value = ctx.elapsed;
    ctx.lastArcAbsMax = arcAbsMax;
    loopAbsMesh.visible = ctx.subToggle.loops && arcAbsMax > 0;
  }
  ctx.loopGroup = loopGroup; ctx.loopMesh = loopMesh; ctx.loopAbsMesh = loopAbsMesh;
  ctx.loopUniforms = loopUniforms; ctx.loopStatesA = loopStatesA;
  ctx.arcStates = arcStates; ctx.loopStats = loopStats;
  ctx.loopEnvArr = loopEnvArr; ctx.LOOP_AMB = LOOP_AMB; ctx.LOOP_ARC = LOOP_ARC;
  ctx.updateLoops = updateLoops; ctx.scheduleFlareArcade = scheduleFlareArcade;
}

// surface/chromo.js — bake estrutural da cromosfera (2 passes + smear +
// triple-buffer fatiado). Corpo movido verbatim; estado mutável do bake
// (ctx.bake*) é compartilhado com o animate residual.

import * as THREE from 'three';
import { quadVertex, WORLEY_GLSL, SFTDIR_GLSL, BFIELD_GLSL, LIC_GLSL } from '../glsl/common.js';

export function createChromo(ctx){
  var renderer = ctx.renderer, quadCamera = ctx.quadCamera,
      makeFullscreenScene = ctx.makeFullscreenScene, TP = ctx.TP,
      SIM_W = ctx.SIM_W, SIM_H = ctx.SIM_H, NOISE_GLSL = ctx.NOISE_GLSL,
      simRTOptions = ctx.simRTOptions, simRTs = ctx.simRTs,
      simUniforms = ctx.simUniforms, charges = ctx.charges,
      sunUniforms = ctx.sunUniforms, tuneLic = ctx.tuneLic;
  // ---------------------------------------------------------------
  // BAKE ESTRUTURAL: as camadas de baixa frequência (turbulência,
  // filamentos de linha neutra, plage) mudam devagar — não precisam ser
  // recalculadas por pixel a cada frame. São renderizadas numa textura
  // equirretangular a ~8Hz; o shader do disco vira um sampler + o que
  // exige resolução plena (fibrilas LIC, manchas, limbo).
  //   R = calor de larga escala   G = filamento   B = plage
  // ---------------------------------------------------------------
  var CHROMO_W = TP.chromo;
  var CHROMO_H = CHROMO_W >> 1;
  // ---------------------------------------------------------------
  // PR10 (achado 5) — EXPERIMENTO MRT atrás de ?chromoMrt=1 (default 0 =
  // caminho legado byte-idêntico). Os dois passes recalculavam o MESMO
  // campo por texel (bField de 10 cargas + 3 snoise + sftGrad + ruído de
  // giro + fdir) do mesmo snapshot/timestamp. Com MRT o 1º passe grava a
  // direção fdir num attachment auxiliar RG16F (codificação octaédrica,
  // 2×float16 — precisão de sobra p/ direção) e o smear a DECODIFICA em
  // vez de recomputar. Gate de capacidade: WebGL2 + tier>low + RT half-
  // float + 2 draw buffers + FBO completo; qualquer falha => fallback
  // SILENCIOSO ao legado, exposto em __solInfo.chromoPerf() {mode,reason}.
  // ---------------------------------------------------------------
  var mrtWant = !!(ctx.urlQ && ctx.urlQ.chromoMrt === '1');
  var mrtOk = false, mrtReason = 'knob-off';
  if (mrtWant){
    var glMrt = null;
    try { glMrt = renderer.getContext(); } catch(e){}
    if (!(renderer.capabilities && renderer.capabilities.isWebGL2)) mrtReason = 'no-webgl2';
    else if (ctx.TIER === 'low') mrtReason = 'tier-low';
    else if (!ctx.isHDR) mrtReason = 'rt-8bit';
    else if (!glMrt || glMrt.getParameter(glMrt.MAX_DRAW_BUFFERS) < 2) mrtReason = 'draw-buffers';
    else { mrtOk = true; mrtReason = 'active'; }
  }
  // RT do 1º passe: no modo MRT são 2 attachments (0 = RGBA idêntico ao
  // legado; 1 = RG16F com a direção octaédrica). O bake é FATIADO: o
  // scissor do slice recorta os DOIS attachments juntos, então cada banda
  // grava cor+direção coerentes do mesmo timestamp.
  function makeBakeRT(){
    if (mrtOk){
      var rtm = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, Object.assign({ count: 2 }, simRTOptions));
      rtm.textures[0].wrapS = THREE.RepeatWrapping;   // costura de longitude
      rtm.textures[1].format = THREE.RGFormat;        // + HalfFloat => RG16F
      rtm.textures[1].type = THREE.HalfFloatType;
      return rtm;
    }
    var rt1 = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, simRTOptions);
    rt1.texture.wrapS = THREE.RepeatWrapping;   // costura de longitude
    return rt1;
  }
  var chromoRT = makeBakeRT();
  // fallback obrigatório: alguns drivers aceitam criar o FBO com RG16F e
  // só reprovam no checkFramebufferStatus — sondar ANTES de comprometer
  // os shaders com o caminho MRT.
  if (mrtOk){
    try {
      renderer.setRenderTarget(chromoRT);
      var glFb = renderer.getContext();
      var fbSt = glFb.checkFramebufferStatus(glFb.FRAMEBUFFER);
      renderer.setRenderTarget(null);
      if (fbSt !== glFb.FRAMEBUFFER_COMPLETE){ mrtOk = false; mrtReason = 'fbo-incomplete'; }
    } catch(e){
      mrtOk = false; mrtReason = 'fbo-error';
      try { renderer.setRenderTarget(null); } catch(e2){}
    }
    if (!mrtOk){ chromoRT.dispose(); chromoRT = makeBakeRT(); }
  }
  ctx.chromoMode = { mode: mrtOk ? 'mrt' : 'legacy', reason: mrtReason,
                     attachments: mrtOk ? 2 : 1, rt: [CHROMO_W, CHROMO_H] };
  // encode/decode octaédrico padrão: mapeia a esfera unitária no quadrado
  // [-1,1]² (dobra o hemisfério z<0 sobre as bordas) — 2 floats bastam
  var OCT_GLSL = [
    'vec2 octWrap(vec2 v){',
    '  return (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);',
    '}',
    'vec2 octEncode(vec3 n){',
    '  n /= (abs(n.x) + abs(n.y) + abs(n.z));',
    '  return (n.z >= 0.0) ? n.xy : octWrap(n.xy);',
    '}',
    'vec3 octDecode(vec2 e){',
    '  vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));',
    '  if (n.z < 0.0) n.xy = octWrap(n.xy);',
    '  return normalize(n);',
    '}'
  ].join('\n');
  var chromoUniforms = {
    uTime: { value: 0 },
    uSimTex: { value: simRTs[0].texture },
    uSimTexel: { value: simUniforms.uTexel.value },
    uGranFreq: { value: TP.granFreq },
    uCharges: { value: charges }
  };
  var chromoFragment = NOISE_GLSL + '\n' + WORLEY_GLSL + '\n' + [
    'uniform float uTime;',
    'uniform sampler2D uSimTex;',
    'uniform vec2 uSimTexel;',
    'uniform float uGranFreq;',
    'uniform vec4 uCharges[10];',
    'varying vec2 vUv;'].join('\n') + '\n' + SFTDIR_GLSL + '\n' + BFIELD_GLSL + '\n' + LIC_GLSL + '\n' + [
    'void main(){',
    '  float lon = vUv.x*6.28318530718;',
    '  float lat = (vUv.y-0.5)*3.14159265359;',
    '  vec3 sp = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  float t = uTime;',
    // larga escala: convecção (sim) + turbulência com distorção de domínio
    '  float sim = texture2D(uSimTex, vUv).r;',
    '  vec3 q = sp * 2.6;',
    // fases ×0.15 (MACRO_SLOW): a turbulência de larga escala morfa em
    // dezenas de segundos, não em segundos — era 0.045/0.05/0.06
    '  vec2 w = vec2(fbm(q + vec3(0.0, 0.0, t*0.00675)), fbm(q + vec3(5.2, 1.3, -t*0.0075)));',
    '  vec3 rq = q + 1.7*vec3(w.x, w.y, (w.x+w.y)*0.5);',
    '  float turb = fbm(rq*1.7 + vec3(0.0, 0.0, t*0.009))*0.5+0.5;',
    '  float heatLS = sim*0.60 + turb*0.40;',
    '  heatLS = pow(max(heatLS, 0.0), 1.75) + 0.05;',
    // rede de supergranulação: células ~30Mm; as BORDAS (F2-F1 pequeno)
    // são a rede cromosférica brilhante que organiza o sol calmo
    '  vec2 sg = worleyF1F2(sp*23.0 + vec3(0.0, 0.0, t*0.004));',
    '  float network = 1.0 - smoothstep(0.0, 0.17, sg.y - sg.x);',
    '  network *= 0.6 + 0.4*(snoise(sp*7.0 + vec3(1.3))*0.5+0.5);',
    '  heatLS += network * 0.075;',
    // campo magnético + ruído do sol calmo (idêntico ao shader do disco)
    '  vec3 B = bField(sp);',
    // sol calmo: a direção vem do GRADIENTE do fluxo transportado pela
    // simulação (tapete magnético advectado) + um resto de ruído p/ vida
    '  B += 0.30 * vec3(snoise(sp*2.4 + vec3(0.0,0.0,t*0.006)),',
    '                   snoise(sp*2.4 + vec3(4.2,7.1,t*0.006)),',
    '                   snoise(sp*2.4 + vec3(9.3,2.8,t*0.006)));',
    '  vec3 gradEv = sftGrad(vUv);',
    '  B += gradEv * 7.0;',
    '  float Br = dot(B, sp);',
    '  float Bmag = length(B) + 1e-5;',
    // FÍSICA: filamentos e plage agora derivam do Br EVOLUÍDO (canal G
    // da simulação, transportado pelo escoamento) — não mais do campo
    // analítico das cargas. Br suavizado com cruz de 5 taps:
    '  float brEv = texture2D(uSimTex, vUv).g*2.0 - 1.0;',
    '  brEv = (brEv',
    '    + (texture2D(uSimTex, vec2(fract(vUv.x + uSimTexel.x*2.0), vUv.y)).g*2.0 - 1.0)',
    '    + (texture2D(uSimTex, vec2(fract(vUv.x - uSimTexel.x*2.0), vUv.y)).g*2.0 - 1.0)',
    '    + (texture2D(uSimTex, vec2(vUv.x, clamp(vUv.y + uSimTexel.y*2.0, 0.0, 1.0))).g*2.0 - 1.0)',
    '    + (texture2D(uSimTex, vec2(vUv.x, clamp(vUv.y - uSimTexel.y*2.0, 0.0, 1.0))).g*2.0 - 1.0)) / 5.0;',
    '  float gradM = length(gradEv);',
    // filamentos: linha de INVERSÃO do fluxo transportado (|Br|~0 com
    // fluxo oposto em volta — é onde filamentos reais se sustentam)
    '  float nl = abs(brEv) / (abs(brEv) + gradM*1.1 + 0.01);',
    // filamentos reais são CANAIS largos e difusos (ref-02/03), não
    // traços de caneta: máscaras mais largas e rampa mais longa
    // Calibração contra envelope GONG (16 imagens reais 2012-2026, ver
    // docs/audit-motion.md): canais reais são FINOS (0.005-0.012R),
    // esparsos (8-15/disco, <1% de área) e independentes — larguras
    // 0.13/0.21→0.038/0.058, rampas mais curtas, gates mais altos,
    // filStr com teto menor (corta o colar colado à plage) e ganho
    // 1.7→2.1 para o núcleo fino continuar legível. A FONTE não muda:
    // canais seguem nascendo só nas linhas neutras do fluxo evoluído.
    '  float filW1 = 0.038*(0.55 + 0.9*(fbmLight(sp*3.2 + vec3(9.1, 2.2, 0.0))*0.5+0.5));',
    '  float filW3 = 0.058*(0.50 + 0.9*(fbmLight(sp*2.1 + vec3(5.5, 0.9, 2.8))*0.5+0.5));',
    '  float nlw = nl * (0.80 + 0.40*(fbmLight(sp*4.5 + vec3(7.7, 4.1, 1.9))*0.5+0.5));',
    '  float rib1 = 1.0 - smoothstep(filW1*0.10, filW1*1.15, nlw);',
    '  float rib3 = 1.0 - smoothstep(filW3*0.10, filW3*1.15, nlw);',
    '  float filGate1 = smoothstep(0.23, 0.48, fbm(sp*0.70 + vec3(3.3, 7.7, 0.5)));',
    '  float filGate3 = smoothstep(0.36, 0.58, fbm(sp*0.60 + vec3(6.1, 3.9, 8.2)));',
    // piso de gradiente mais baixo: filamentos QUIESCENTES longos vivem
    // em linhas neutras de campo FRACO (refs 02/03) — o piso alto cortava
    // o canal em fragmentos curtos ("ameba" em vez de serpente)
    '  float filStr = smoothstep(0.012, 0.05, gradM) * (1.0 - smoothstep(0.5, 1.2, gradM));',
    '  float fil = max(rib1*filGate1, rib3*filGate3) * filStr;',
    // ganho: as máscaras multiplicadas raramente chegam a 1 — recupera a
    // profundidade visível dos filamentos (posição continua vindo do Br).
    // Ganho menor que antes: 2.4 saturava o clamp e binarizava a borda
    '  fil = clamp(fil*2.1, 0.0, 1.0);',
    // plage: concentração forte do fluxo EVOLUÍDO
    '  float plage = smoothstep(0.26, 0.55, abs(brEv));',
    // plage real é MOSQUEADA: flocos brilhantes seguindo a rede, não um
    // disco liso — quebra forte em duas escalas
    '  float fleck = fbmLight(sp*14.0 + vec3(2.4))*0.5+0.5;',
    '  fleck = fleck * (0.55 + 0.45*(snoise(sp*34.0 + vec3(8.8))*0.5+0.5));',
    '  plage *= 0.30 + 0.85*smoothstep(0.30, 0.72, fleck);',
    // fibrilas grossas também são baked (espaço do objeto: giram com a
    // esfera). As camadas fina/micro continuam vivas no disco, só de perto.
    '  vec3 Bt = B - sp*Br;',
    '  float BtL = length(Bt);',
    '  float wig = 0.85*snoise(sp*3.4 + vec3(0.0,0.0,t*0.012));',
    '  vec3 fdir = (BtL > 1e-4)',
    '    ? (Bt*cos(wig) + cross(sp, Bt)*sin(wig)) / BtL',
    '    : vec3(0.5773);',
    '  float fibC = licFibril(sp, fdir, uGranFreq*1.45, 0.14, t);',
    // filamentos são FEIXES de fios escuros (fibrilas do canal), não
    // faixas lisas: modular pela textura LIC quebra o contorno contínuo
    // ("vinco de celofane") em fios — como nas ref-02/03 de perto
    '  fil *= 0.55 + 0.75*(fibC*0.5+0.5);',
    '  gl_FragColor = vec4(min(heatLS, 1.0), fil, min(plage, 1.0), 0.5 + 0.5*fibC);',
    '}'
  ].join('\n');
  chromoFragment = tuneLic(chromoFragment);
  // PR10: a variante MRT é o MESMO shader (GLSL3) com outputs explícitos —
  // attachment 0 recebe o vec4 legado intacto, attachment 1 a fdir
  // octaédrica. Derivada por substituição textual da linha de saída para
  // nunca divergir do corpo legado.
  var chromoMaterial;
  if (mrtOk){
    var CHROMO_OUT = 'gl_FragColor = vec4(min(heatLS, 1.0), fil, min(plage, 1.0), 0.5 + 0.5*fibC);';
    var chromoFragmentMrt = [
      'layout(location = 0) out vec4 oColor;',
      'layout(location = 1) out vec2 oDir;'
    ].join('\n') + '\n' + OCT_GLSL + '\n' + chromoFragment.replace(CHROMO_OUT,
      'oColor = vec4(min(heatLS, 1.0), fil, min(plage, 1.0), 0.5 + 0.5*fibC);\n' +
      '  oDir = octEncode(fdir);');
    chromoMaterial = new THREE.ShaderMaterial({ uniforms: chromoUniforms, vertexShader: quadVertex, fragmentShader: chromoFragmentMrt, glslVersion: THREE.GLSL3 });
  } else {
    chromoMaterial = new THREE.ShaderMaterial({ uniforms: chromoUniforms, vertexShader: quadVertex, fragmentShader: chromoFragment });
  }
  var chromoScene = makeFullscreenScene(chromoMaterial);

  // ---------------------------------------------------------------
  // 2º PASSE: LIC ITERADO em espaço de textura. Borra o resultado do
  // 1º passe AO LONGO do campo magnético — os próprios "blobs" de
  // luminância viram feixes varridos de fios longos, como nas fotos
  // reais em H-alfa, onde até a plage é riscada na direção do campo.
  // Só leituras de textura: custo desprezível a ~8Hz.
  // ---------------------------------------------------------------
  var chromoRT2 = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, simRTOptions);
  chromoRT2.texture.wrapS = THREE.RepeatWrapping;
  var smearUniforms = {
    uSrc: { value: chromoRT.texture },
    uTime: { value: 0 },
    uCharges: { value: charges },
    uTexel: { value: new THREE.Vector2(1/CHROMO_W, 1/CHROMO_H) },
    uSimTex: { value: simRTs[0].texture },
    uSimTexel: { value: simUniforms.uTexel.value }
  };
  var smearFragment = NOISE_GLSL + '\n' + [
    'uniform sampler2D uSrc;',
    'uniform float uTime;',
    'uniform vec4 uCharges[10];',
    'uniform vec2 uTexel;',
    'uniform sampler2D uSimTex;',
    'uniform vec2 uSimTexel;',
    'varying vec2 vUv;'].join('\n') + '\n' + SFTDIR_GLSL + '\n' + BFIELD_GLSL + '\n' + [
    'vec2 sphToUv(vec3 q){',
    '  return vec2(fract(atan(q.z, q.x)/6.28318530718),',
    '              asin(clamp(q.y, -1.0, 1.0))/3.14159265359 + 0.5);',
    '}',
    'void main(){',
    '  float lon = vUv.x*6.28318530718;',
    '  float lat = (vUv.y-0.5)*3.14159265359;',
    '  vec3 sp = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  float t = uTime;',
    '  vec3 B = bField(sp);',
    // mesma direção do bake: gradiente do fluxo transportado + resto de ruído
    '  B += 0.30 * vec3(snoise(sp*2.4 + vec3(0.0,0.0,t*0.006)),',
    '                   snoise(sp*2.4 + vec3(4.2,7.1,t*0.006)),',
    '                   snoise(sp*2.4 + vec3(9.3,2.8,t*0.006)));',
    '  B += sftGrad(vUv) * 7.0;',
    '  vec3 Bt = B - sp*dot(B, sp);',
    '  float BtL = length(Bt);',
    '  float wig = 0.85*snoise(sp*3.4 + vec3(0.0,0.0,t*0.012));',
    '  vec3 dir = (BtL > 1e-4)',
    '    ? (Bt*cos(wig) + cross(sp, Bt)*sin(wig)) / BtL',
    '    : vec3(0.5773);',
    // varredura longa: ±4 passos de ~3 texels ao longo do fluxo
    '  float stepArc = uTexel.x * 6.28318530718 * 1.6;',
    '  vec4 acc = vec4(0.0); float wsum = 0.0;',
    '  for(int i=-4;i<=4;i++){',
    '    vec3 q = normalize(sp + dir*(float(i)*stepArc));',
    '    float w = 1.0 - abs(float(i))/5.2;',
    '    acc += texture2D(uSrc, sphToUv(q)) * w;',
    '    wsum += w;',
    '  }',
    '  vec4 sm = acc / wsum;',
    // recupera o contraste dos fios após o borrão direcional
    '  float fib = sm.a*2.0 - 1.0;',
    '  fib = sign(fib) * pow(abs(fib), 0.62);',
    '  gl_FragColor = vec4(sm.r, sm.g, sm.b, fib*0.5 + 0.5);',
    '}'
  ].join('\n');
  // PR10: no modo MRT o smear NÃO recomputa bField/snoise/sftGrad/giro —
  // amostra a fdir do attachment 1 (mesmo texel, mesmo timestamp do 1º
  // passe) e decodifica. Sobram só as leituras de textura da varredura.
  var smearMaterial;
  if (mrtOk){
    smearUniforms.uFdir = { value: chromoRT.textures[1] };
    var smearFragmentMrt = [
      'layout(location = 0) out vec4 oColor;',
      'uniform sampler2D uSrc;',
      'uniform sampler2D uFdir;',
      'uniform vec2 uTexel;',
      'varying vec2 vUv;'
    ].join('\n') + '\n' + OCT_GLSL + '\n' + [
      'vec2 sphToUv(vec3 q){',
      '  return vec2(fract(atan(q.z, q.x)/6.28318530718),',
      '              asin(clamp(q.y, -1.0, 1.0))/3.14159265359 + 0.5);',
      '}',
      'void main(){',
      '  float lon = vUv.x*6.28318530718;',
      '  float lat = (vUv.y-0.5)*3.14159265359;',
      '  vec3 sp = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
      // direção do campo lida do bake (attachment 1), não recomputada
      '  vec3 dir = octDecode(texture2D(uFdir, vUv).rg);',
      // varredura longa: ±4 passos de ~3 texels ao longo do fluxo
      '  float stepArc = uTexel.x * 6.28318530718 * 1.6;',
      '  vec4 acc = vec4(0.0); float wsum = 0.0;',
      '  for(int i=-4;i<=4;i++){',
      '    vec3 q = normalize(sp + dir*(float(i)*stepArc));',
      '    float w = 1.0 - abs(float(i))/5.2;',
      '    acc += texture2D(uSrc, sphToUv(q)) * w;',
      '    wsum += w;',
      '  }',
      '  vec4 sm = acc / wsum;',
      // recupera o contraste dos fios após o borrão direcional
      '  float fib = sm.a*2.0 - 1.0;',
      '  fib = sign(fib) * pow(abs(fib), 0.62);',
      '  oColor = vec4(sm.r, sm.g, sm.b, fib*0.5 + 0.5);',
      '}'
    ].join('\n');
    smearMaterial = new THREE.ShaderMaterial({ uniforms: smearUniforms, vertexShader: quadVertex, fragmentShader: smearFragmentMrt, glslVersion: THREE.GLSL3 });
  } else {
    smearMaterial = new THREE.ShaderMaterial({ uniforms: smearUniforms, vertexShader: quadVertex, fragmentShader: smearFragment });
  }
  var smearScene = makeFullscreenScene(smearMaterial);

  // 3 conjuntos de bake (atual / anterior / escrita): o shader lê os dois
  // primeiros em crossfade enquanto o terceiro é assado fatiado.
  // PR10: os alvos `c` (1º passe) nascem via makeBakeRT — 2 attachments no
  // modo MRT, idênticos ao legado fora dele; os `s` (smear) seguem RGBA.
  function cloneChromoRT(){
    var rt = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, simRTOptions);
    rt.texture.wrapS = THREE.RepeatWrapping;
    return rt;
  }
  var bakeSets = [
    { c: chromoRT, s: chromoRT2 },
    { c: makeBakeRT(), s: cloneChromoRT() },
    { c: makeBakeRT(), s: cloneChromoRT() }
  ];
  ctx.bakeCur = 0, ctx.bakePrev = 0, ctx.bakeWrite = 1;
  ctx.bakeSwapT = 0, ctx.bakeCycleDt = 0.25;
  function bakeChromo(timeNow){
    chromoUniforms.uTime.value = timeNow;
    renderer.setRenderTarget(chromoRT);
    renderer.render(chromoScene, quadCamera);
    smearUniforms.uTime.value = timeNow;
    renderer.setRenderTarget(chromoRT2);
    renderer.render(smearScene, quadCamera);
    renderer.setRenderTarget(null);
    sunUniforms.uChromoTex.value = chromoRT2.texture;   // varrido (perto)
    sunUniforms.uChromoFar.value = chromoRT.texture;    // calmo (longe)
    sunUniforms.uChromoTexP.value = chromoRT2.texture;
    sunUniforms.uChromoFarP.value = chromoRT.texture;
    sunUniforms.uBakeMix.value = 1.0;
  }
  bakeChromo(0.0);   // primeira passada: o disco nunca vê textura vazia

  // T3.3: bake FATIADO. O par chromo+smear dominava o frame (medição da
  // auditoria: frames com bake 3.4x mais lentos — pico bimodal). Cada
  // ciclo agora são 8 fatias de 1/4 de altura via scissor, uma por
  // frame: passos 0-3 = faixas do chromo, 4-7 = faixas do smear (o
  // smear sempre lê um chromoRT completo do MESMO ciclo — sem costura
  // temporal entre as camadas). Todas as fatias usam o MESMO timestamp,
  // então não há emenda de fase entre faixas; a cadência por texel fica
  // ~igual (8 frames a 60fps ≈ os 0.12s antigos).
  ctx.bakeStep = -1, ctx.bakeTime = 0;
  function bakeChromoSlice(step, timeNow){
    var band = step % 4;
    var bandH = CHROMO_H >> 2;
    var isChromo = step < 4;
    var ws = bakeSets[ctx.bakeWrite];
    var rt = isChromo ? ws.c : ws.s;
    rt.scissor.set(0, band*bandH, CHROMO_W, bandH);
    rt.scissorTest = true;
    if (isChromo){
      chromoUniforms.uTime.value = timeNow;
      renderer.setRenderTarget(ws.c);
      renderer.render(chromoScene, quadCamera);
    } else {
      smearUniforms.uTime.value = timeNow;
      smearUniforms.uSrc.value = ws.c.texture;
      // PR10: a fdir acompanha o conjunto de escrita (attachment 1 do
      // MESMO ciclo que o uSrc — sem costura temporal entre cor e direção)
      if (mrtOk) smearUniforms.uFdir.value = ws.c.textures[1];
      renderer.setRenderTarget(ws.s);
      renderer.render(smearScene, quadCamera);
    }
    rt.scissorTest = false;
    renderer.setRenderTarget(null);
  }
  // Coerência intra-ciclo (bug 3 da auditoria de movimento): as fatias
  // liam uSimTex AO VIVO (o ping-pong troca a cada passo do sim — ~13
  // passos caem dentro de 1 ciclo a fps baixa) e uCharges mutado por
  // updateActiveRegions no meio do ciclo → tearing entre bandas de
  // latitude. Snapshot dos DOIS no início do ciclo: todas as fatias
  // leem um único estado, coerente com o timestamp único (bakeTime).
  var bakeSimRT = new THREE.WebGLRenderTarget(SIM_W, SIM_H, simRTOptions);
  var bakeCopyUniforms = { tSrc: { value: null } };
  var bakeCopyMaterial = new THREE.ShaderMaterial({ uniforms: bakeCopyUniforms, vertexShader: quadVertex, fragmentShader: [
    'uniform sampler2D tSrc;',
    'varying vec2 vUv;',
    'void main(){ gl_FragColor = texture2D(tSrc, vUv); }'
  ].join('\n') });
  var bakeCopyScene = makeFullscreenScene(bakeCopyMaterial);
  var bakeCharges = charges.map(function(c){ return c.clone(); });
  chromoUniforms.uCharges.value = bakeCharges;
  smearUniforms.uCharges.value = bakeCharges;
  function snapshotBakeInputs(){
    ctx.diagEvent('chromo-bake');   // início de um ciclo fatiado (~8Hz)
    bakeCopyUniforms.tSrc.value = simRTs[ctx.simIndex].texture;
    renderer.setRenderTarget(bakeSimRT);
    renderer.render(bakeCopyScene, quadCamera);
    renderer.setRenderTarget(null);
    chromoUniforms.uSimTex.value = bakeSimRT.texture;
    smearUniforms.uSimTex.value  = bakeSimRT.texture;
    for (var i=0;i<charges.length;i++) bakeCharges[i].copy(charges[i]);
  }
  ctx.bakeSets = bakeSets;
  return { bakeChromoSlice: bakeChromoSlice, snapshotBakeInputs: snapshotBakeInputs };
}

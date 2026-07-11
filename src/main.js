// Novo Sol — app principal. Migrado de sol-3d.html (script inline) para
// módulo ES com three via npm. O pipeline de cor é 100% manual (HDR +
// ACES no composite), então desligamos o ColorManagement do three e
// mantemos a saída linear — comportamento idêntico ao r128.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

(function(){
"use strict";

var loadingEl = document.getElementById('loading');
var hintEl = document.getElementById('hint');
var container = document.getElementById('canvas-container');

if (typeof THREE === 'undefined') {
  loadingEl.textContent = 'não foi possível carregar o motor 3D.';
  return;
}

try {
  init();
} catch (err) {
  console.error(err);
  loadingEl.textContent = 'seu navegador não conseguiu iniciar o WebGL.';
}

function init(){

  // Overrides de QA/perf via URL: ?tier=low|mid|high força o tier de
  // partida e ?scale= multiplica o pixelRatio — o profiler mede A/B de
  // custo por resolução e por tier sem editar o arquivo.
  var urlQ = {};
  try {
    (location.search || '').replace(/^\?/, '').split('&').forEach(function(kv){
      if (!kv) return; var p = kv.split('=');
      urlQ[p[0]] = decodeURIComponent(p[1] || '');
    });
  } catch(e){}
  // Modo determinístico de QA (?det=1[&seed=N]): todos os sorteios do APP
  // passam por srand() — um PRNG semeado (mulberry32) — e o dt do frame
  // fica fixo em 1/60s simulado. Com isso duas execuções produzem
  // exatamente a mesma cena/frame — é o que permite comparar screenshots
  // pixel a pixel entre versões do código (paridade de migração). O RNG é
  // LOCAL do app (não sobrescreve Math.random): o three consome
  // Math.random internamente (UUIDs) em quantidades que variam por versão
  // e contaminaria o stream. Sem ?det=1, srand === Math.random.
  var DET = urlQ.det === '1';
  // ?hold=F congela o tempo simulado a partir do frame F (delta=0): o
  // frame renderizado vira uma imagem ESTÁTICA e o screenshot deixa de
  // correr contra o requestAnimationFrame.
  var DET_HOLD = 0;
  var detFrames = 0;
  var srand = Math.random;
  if (DET) DET_HOLD = parseInt(urlQ.hold, 10) || 0;
  if (DET) {
    var detSeed = ((parseInt(urlQ.seed, 10) || 1) >>> 0) || 1;
    srand = function(){
      detSeed = (detSeed + 0x6D2B79F5) >>> 0;
      var t = detSeed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var savedKnobs = {};
  try { savedKnobs = JSON.parse(localStorage.getItem('solKnobs') || '{}') || {}; } catch(e){}
  function knob(name, dflt, lo, hi){
    var v = parseFloat(urlQ[name]);
    if (v !== v && savedKnobs[name] !== undefined) v = parseFloat(savedKnobs[name]);
    return (v === v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  }
  // Knobs cinematográficos (defaults = visual calibrado do LOOP-5; sem
  // query string NADA muda). speed comprime/expande o tempo SIMULADO de
  // forma coerente (rotação, deriva, ciclos, flares, sim) sem tocar na
  // resposta dos controles de câmera.
  var TIME_SCALE = knob('speed', 1.0, 0.05, 3.0);
  // ?look=sunshine: preset da camada cinematográfica (Sunshine 2007 —
  // halação, íris, lente); semeia DEFAULTS, então knob individual na
  // URL/painel continua tendo precedência. Sem o preset, tudo em 0.
  var LOOK = (urlQ.look === 'sunshine') ? {
    // calibrado por sweep de 7 variantes + juiz visual (h2, 8.5/10;
    // fringe>=0.5 gera rebordo verde no limbo — manter <=0.35)
    veil:0.85, adapt:0.55, fringe:0.35, shimmer:0.45, tone:0.65,
    streak:0.65, bloom:1.15, grain:1.7, vig:0.85, exposure:1.08
  } : null;
  function lk(n, base){ return (LOOK && LOOK[n] !== undefined) ? LOOK[n] : base; }
  var IDLE_CINE = urlQ.idle === '1' || (urlQ.idle === undefined && savedKnobs.idle == 1);
  var RENDER_SCALE = (parseFloat(urlQ.scale) > 0)
    ? Math.min(2.0, Math.max(0.3, parseFloat(urlQ.scale))) : 1.0;

  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  // three moderno liga saída sRGB por padrão; o composite já faz tonemap e
  // gamma por conta própria — saída linear reproduz o r128 exatamente.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  var pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 1);
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, window.innerWidth/window.innerHeight, 0.1, 3000);

  // Qualidade adaptativa: o tier controla oitavas de ruído, malha,
  // textura de simulação, bake, bloom e contagem de proeminências.
  var coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var smallScreen = Math.max(window.innerWidth, window.innerHeight) < 820;
  // Tiers NOMEADOS (low/mid/high); MID é o alvo do iPhone 15 Pro:
  // bake 1024, SIM 768x384, LIC 7 taps, 4 níveis de bloom.
  // FASE 1: loops = nº de loops coronais ambientes, larc = slots de
  // arcada pós-flare, lseg = segmentos por loop (o traço RK4 é CPU
  // amortizado — os contadores escalam com o tier, não o custo/frame).
  var TIER_PARAMS = {
    low:  { fbm:4, seg:96,  stars:3500, bright:130, simW:384, simH:192, simStep:1/16, bloom:3, prom:4, chromo:512,  granFreq:22.0, lic7:false, loops:8,  larc:5,  lseg:28 },
    mid:  { fbm:5, seg:128, stars:5000, bright:200, simW:768, simH:384, simStep:1/22, bloom:4, prom:6, chromo:1024, granFreq:30.0, lic7:true,  loops:12, larc:7,  lseg:36 },
    high: { fbm:5, seg:128, stars:7000, bright:240, simW:768, simH:384, simStep:1/26, bloom:4, prom:7, chromo:2048, granFreq:34.0, lic7:true,  loops:16, larc:9,  lseg:44 },
    // ULTRA (desktop com GPU dedicada): DPR até 3, malha/sim/estrelas
    // maiores e 5 níveis de bloom. Nunca é escolhido no primeiro load —
    // só o auto-tune promove (p95 < limiar por 30s no high) ou ?tier=ultra.
    ultra:{ fbm:6, seg:192, stars:10000, bright:320, simW:1024, simH:512, simStep:1/30, bloom:5, prom:8, chromo:2048, granFreq:36.0, lic7:true, loops:22, larc:12, lseg:52 }
  };
  // T3.2: partida por HARDWARE + memória de sessões anteriores. A
  // heurística antiga (toque/tela pequena => low) rebaixava iPhones Pro;
  // agora o renderer decide: Apple GPU com toque parte em MID, desktop em
  // HIGH, móvel genérico com pouca RAM em LOW. SwiftShader/llvmpipe (QA
  // headless) fica em HIGH: os gates visuais são calibrados no tier alto —
  // e o auto-tune é desligado lá, senão o p95 do render por software
  // rebaixaria a resolução e mudaria as capturas.
  var glStr = '';
  try {
    var glc = renderer.getContext();
    var dbgInfo = glc.getExtension('WEBGL_debug_renderer_info');
    glStr = String(glc.getParameter(dbgInfo ? dbgInfo.UNMASKED_RENDERER_WEBGL : glc.RENDERER)).toLowerCase();
  } catch(e){}
  var isSoftwareGL = /swiftshader|llvmpipe|softpipe|software/.test(glStr);
  function detectTier(){
    if (TIER_PARAMS[urlQ.tier]) return urlQ.tier;
    try {
      var saved = localStorage.getItem('solTier');   // auto-tune passado
      if (TIER_PARAMS[saved]) return saved;
    } catch(e){}
    if (isSoftwareGL) return 'high';
    if (/apple gpu|apple a[0-9]|apple m[0-9]/.test(glStr)) return coarsePointer ? 'mid' : 'high';
    var mem = navigator.deviceMemory || 0;
    if (coarsePointer || smallScreen) return (mem > 0 && mem < 4) ? 'low' : 'mid';
    return 'high';
  }
  var TIER = detectTier();
  var TP = TIER_PARAMS[TIER];
  // ultra desbloqueia DPR nativo até 3 (o cap 2 protege os tiers móveis)
  if (TIER === 'ultra'){
    pixelRatio = Math.min(window.devicePixelRatio || 1, 3) * RENDER_SCALE;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  var FBM_OCTAVES = TP.fbm;
  var SPHERE_SEG  = TP.seg;
  var STAR_COUNT  = TP.stars;
  var SIM_W = TP.simW;
  var SIM_H = TP.simH;
  var BLOOM_LEVELS = TP.bloom;
  var PROMINENCE_COUNT = TP.prom;
  var hasTouch = coarsePointer || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // ---------------------------------------------------------------
  // Ruído simplex 3D (Ashima Arts, domínio público / MIT) + fBm
  // ---------------------------------------------------------------
  var NOISE_GLSL = [
    'vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}',
    'vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}',
    'float snoise(vec3 v){',
    '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
    '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i  = floor(v + dot(v, C.yyy));',
    '  vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz);',
    '  vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy);',
    '  vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx;',
    '  vec3 x2 = x0 - i2 + C.yyy;',
    '  vec3 x3 = x0 - D.yyy;',
    '  i = mod289(i);',
    '  vec4 p = permute(permute(permute(',
    '             i.z + vec4(0.0, i1.z, i2.z, 1.0))',
    '           + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
    '           + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 0.142857142857;',
    '  vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
    '  vec4 x_ = floor(j * ns.z);',
    '  vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy;',
    '  vec4 y = y_ * ns.x + ns.yyyy;',
    '  vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy);',
    '  vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0)*2.0 + 1.0;',
    '  vec4 s1 = floor(b1)*2.0 + 1.0;',
    '  vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
    '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x);',
    '  vec3 p1 = vec3(a0.zw, h.y);',
    '  vec3 p2 = vec3(a1.xy, h.z);',
    '  vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
    '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
    '  m = m * m;',
    '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
    '}',
    'float fbm(vec3 p){',
    '  float v = 0.0; float a = 0.5;',
    '  for(int i=0;i<5;i++){ v += a*snoise(p); p *= 2.02; a *= 0.5; }',
    '  return v;',
    '}',
    'float fbmLight(vec3 p){',
    '  float v = 0.0; float a = 0.5;',
    '  for(int i=0;i<3;i++){ v += a*snoise(p); p *= 2.02; a *= 0.5; }',
    '  return v;',
    '}'
  ].join('\n');
  NOISE_GLSL = NOISE_GLSL.replace('i<5;', 'i<' + FBM_OCTAVES + ';');

  // ---------------------------------------------------------------
  // Ruído celular (Worley). Retorna as duas menores distâncias (F1,F2):
  //  - F1 pequeno  -> perto do centro de uma célula (grânulo quente)
  //  - F2-F1 ~ 0   -> em cima de uma fronteira (veio intergranular frio)
  // É exatamente a estrutura da granulação real da fotosfera do Sol.
  // ---------------------------------------------------------------
  var WORLEY_GLSL = [
    'vec3 hash33(vec3 p){',
    '  p = vec3(dot(p,vec3(127.1,311.7,74.7)),',
    '           dot(p,vec3(269.5,183.3,246.1)),',
    '           dot(p,vec3(113.5,271.9,124.6)));',
    '  return fract(sin(p)*43758.5453123);',
    '}',
    'vec2 worleyF1F2(vec3 p){',
    '  vec3 ip = floor(p); vec3 fp = fract(p);',
    '  float d1 = 9.0; float d2 = 9.0;',
    '  for(int x=-1;x<=1;x++)',
    '  for(int y=-1;y<=1;y++)',
    '  for(int z=-1;z<=1;z++){',
    '    vec3 g = vec3(float(x),float(y),float(z));',
    '    vec3 o = hash33(ip+g);',
    '    vec3 r = g + o - fp;',
    '    float d = dot(r,r);',
    '    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }',
    '  }',
    '  return vec2(sqrt(d1), sqrt(d2));',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------
  // Gradiente tangencial do Br TRANSPORTADO (canal G da simulação):
  // o campo horizontal da cromosfera aponta ~ ao longo do gradiente do
  // potencial magnético suavizado — as fibrilas do sol calmo agora
  // seguem um campo que foi advectado pelo escoamento, não ruído fixo.
  // (o shader que incluir este trecho precisa declarar uSimTex/uSimTexel)
  // ---------------------------------------------------------------
  var SFTDIR_GLSL = [
    'vec3 sftGrad(vec2 uv){',
    '  vec2 t3 = uSimTexel*3.0;',
    '  vec2 t8 = uSimTexel*8.0;',
    '  float bR = texture2D(uSimTex, vec2(fract(uv.x+t3.x), uv.y)).g + texture2D(uSimTex, vec2(fract(uv.x+t8.x), uv.y)).g;',
    '  float bL = texture2D(uSimTex, vec2(fract(uv.x-t3.x), uv.y)).g + texture2D(uSimTex, vec2(fract(uv.x-t8.x), uv.y)).g;',
    '  float bU = texture2D(uSimTex, vec2(uv.x, clamp(uv.y+t3.y, 0.0, 1.0))).g + texture2D(uSimTex, vec2(uv.x, clamp(uv.y+t8.y, 0.0, 1.0))).g;',
    '  float bD = texture2D(uSimTex, vec2(uv.x, clamp(uv.y-t3.y, 0.0, 1.0))).g + texture2D(uSimTex, vec2(uv.x, clamp(uv.y-t8.y, 0.0, 1.0))).g;',
    '  float lat = (uv.y-0.5)*3.14159265359;',
    '  float lon = uv.x*6.28318530718;',
    '  vec3 eLon = vec3(-sin(lon), 0.0, cos(lon));',
    '  vec3 eLat = vec3(-sin(lat)*cos(lon), cos(lat), -sin(lat)*sin(lon));',
    '  float gx = (bR-bL) / max(cos(lat), 0.2);',
    '  float gy = (bU-bD);',
    '  return eLon*gx + eLat*gy;',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------
  // Campo magnético de cargas pontuais sob a superfície + LIC (line
  // integral convolution) barata — blocos compartilhados pelos shaders
  // do bake (chromo), do smear e do disco: os três avaliam o MESMO
  // campo e a MESMA convolução de fios.
  // ---------------------------------------------------------------
  var BFIELD_GLSL = [
    'vec3 bField(vec3 p){',
    '  vec3 B = vec3(0.0);',
    '  for(int i=0;i<10;i++){',
    '    vec3 d = p - uCharges[i].xyz;',
    '    float r2 = dot(d,d) + 1e-3;',
    '    B += uCharges[i].w * d / (r2*sqrt(r2));',
    '  }',
    '  return B;',
    '}'
  ].join('\n');
  // média de ruído fino amostrado ao longo da direção do fluxo -> o
  // ruído vira fios "escovados"; domínio ANISOTRÓPICO (comprimido ao
  // longo do fluxo — cada fio nasce ~4x mais longo antes mesmo da
  // convolução) e curva de contraste gamma < 1 no |x| (fios nítidos)
  var LIC_GLSL = [
    'float licFibril(vec3 p, vec3 dir, float freq, float stepLen, float t){',
    '  float acc = 0.0; float wsum = 0.0;',
    '  for(int i=-6;i<=6;i++){',
    '    float s = float(i)/6.0;',
    '    float w = 1.0 - abs(s)*0.62;',
    '    vec3 q = normalize(p + dir*(s*stepLen));',
    '    vec3 qq = q*freq;',
    '    qq -= dir*(dot(qq, dir)*0.88);',
    '    acc += snoise(qq + vec3(0.0,0.0,t*0.05)) * w;',
    '    wsum += w;',
    '  }',
    '  acc /= wsum;',
    '  return sign(acc) * pow(abs(acc), 0.68);',
    '}'
  ].join('\n');
  // aparelhos fracos: LIC com 5 amostras em vez de 7 (mesma técnica do
  // ajuste de oitavas do fBm, feito por substituição de texto no GLSL)
  function tuneLic(src){
    return TP.lic7 ? src : src
      .replace(/int i=-6;i<=6/g, 'int i=-3;i<=3')
      .replace(/float\(i\)\/6\.0/g, 'float(i)/3.0');
  }

  // Radiação de corpo negro (aproximação de Tanner Helland, válida
  // ~1000K-40000K): cor a partir de temperatura para as estrelas.
  function kelvinToRGB(kelvin){
    var tmp = kelvin/100, r,g,b;
    if (tmp<=66) r=255; else r=Math.min(255,Math.max(0,329.698727446*Math.pow(tmp-60,-0.1332047592)));
    if (tmp<=66) g=Math.min(255,Math.max(0,99.4708025861*Math.log(tmp)-161.1195681661));
    else g=Math.min(255,Math.max(0,288.1221695283*Math.pow(tmp-60,-0.0755148492)));
    if (tmp>=66) b=255; else if(tmp<=19) b=0; else b=Math.min(255,Math.max(0,138.5177312231*Math.log(tmp-10)-305.0447927307));
    return new THREE.Color(r/255,g/255,b/255);
  }

  // ---------------------------------------------------------------
  // Infraestrutura compartilhada de "quad" de tela cheia
  // (usada pela simulação e pelo bloom multi-escala)
  // ---------------------------------------------------------------
  var quadVertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }';
  // vertex padrão de malha com UV (coroa de raios e cartões de proeminência)
  var uvMeshVertex = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
    '}'
  ].join('\n');
  function makeFullscreenScene(material){
    var geo = new THREE.PlaneGeometry(2,2);
    var mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    var s = new THREE.Scene();
    s.add(mesh);
    return s;
  }
  var quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  // ---------------------------------------------------------------
  // SIMULAÇÃO FÍSICA: campo de convecção evoluído por GPU.
  //
  // Em vez de ruído puramente analítico (que só "escorrega" no tempo),
  // mantemos um estado (textura equirretangular lat/lon) que evolui via:
  //   1. advecção por um campo de velocidade sem divergência (rotacional
  //      de um potencial de ruído — a técnica clássica de "curl noise",
  //      usada em VFX para simular fluidos incompressíveis de forma barata);
  //   2. rotação diferencial real do Sol (mais rápida no equador que nos
  //      polos), lei aproximada de Snodgrass & Ulrich (1990):
  //      Ω(lat) ≈ 14.71 − 2.39·sin²(lat) − 1.78·sin⁴(lat) graus/dia;
  //   3. um termo de reação fraco que puxa o campo de volta para um ruído-
  //      alvo, evitando que a advecção pura borre tudo até virar cinza.
  //
  // Isso é uma simulação real (feedback em textura, não apenas tempo
  // parametrizando uma fórmula), mas é importante ser honesto: é uma
  // aproximação de VFX inspirada em convecção, não uma simulação de
  // magnetohidrodinâmica de primeiros princípios como as usadas em
  // física solar de verdade.
  // ---------------------------------------------------------------
  // HDR: detecção de half-float ANTES dos render targets da simulação —
  // o estado do transporte de fluxo precisa de precisão: em 8 bits os
  // incrementos de ~3% por passo quantizam para zero e o campo evoluído
  // congela/erode até virar uniforme.
  var rtType = THREE.UnsignedByteType;
  try {
    var glCtx0 = renderer.getContext();
    var isWebGL2Ctx = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
    if (isWebGL2Ctx) {
      if (glCtx0.getExtension('EXT_color_buffer_float') || glCtx0.getExtension('EXT_color_buffer_half_float')) {
        rtType = THREE.HalfFloatType;
      }
    } else {
      if (glCtx0.getExtension('OES_texture_half_float') &&
          glCtx0.getExtension('OES_texture_half_float_linear') &&
          glCtx0.getExtension('EXT_color_buffer_half_float')) {
        rtType = THREE.HalfFloatType;
      }
    }
  } catch(e){}
  var isHDR = (rtType === THREE.HalfFloatType);

  var simRTOptions = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false };
  var simRTs = [
    new THREE.WebGLRenderTarget(SIM_W, SIM_H, simRTOptions),
    new THREE.WebGLRenderTarget(SIM_W, SIM_H, simRTOptions)
  ];
  var simIndex = 0;

  var simUniforms = {
    uPrevState: { value: null },
    uDt: { value: 0.0 },
    uTime: { value: 0.0 },
    uSeed: { value: 1.0 },
    uTexel: { value: new THREE.Vector2(1/SIM_W, 1/SIM_H) },
    uChargesSim: { value: null }   // preenchido após buildCharges
  };

  var simFragmentShader = NOISE_GLSL + '\n' + [
    'uniform sampler2D uPrevState;',
    'uniform float uDt;',
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform vec2 uTexel;',
    'uniform vec4 uChargesSim[10];',
    'varying vec2 vUv;',
    // TRANSPORTE DE FLUXO EM SUPERFÍCIE (Leighton 1964): o alvo de Br é
    // a soma dos bipolos das regiões ativas + o "tapete magnético" de
    // polaridade mista do sol calmo; a advecção (abaixo) arrasta esse
    // fluxo com o escoamento — indução MHD ideal reduzida à superfície.
    'float targetBr(vec3 p3, float t){',
    '  float b = 0.0;',
    '  for(int i=0;i<8;i++){',
    '    vec3 cd = uChargesSim[i].xyz;',
    '    float cl = length(cd);',
    '    if (cl < 1e-4) continue;',
    '    float dAng = acos(clamp(dot(p3, cd/cl), -1.0, 1.0));',
    '    b += uChargesSim[i].w * exp(-dAng*dAng*150.0);',
    '  }',
    '  b = clamp(b*0.7, -1.0, 1.0);',
    '  float carpet = snoise(p3*7.5 + vec3(0.0, 0.0, t*0.012));',
    '  carpet = sign(carpet) * smoothstep(0.30, 0.75, abs(carpet));',
    '  return clamp(b + carpet*0.38, -1.0, 1.0);',
    '}',
    'float potential(vec2 uv, float t){',
    '  float lon = uv.x*6.28318530718;',
    '  float lat = (uv.y-0.5)*3.14159265359;',
    '  vec3 p = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  return fbmLight(p*3.1 + vec3(0.0,0.0,t*0.06));',
    '}',
    'vec2 curlVel(vec2 uv, float t){',
    '  float e = 0.004;',
    '  float pL = potential(uv-vec2(e,0.0), t);',
    '  float pR = potential(uv+vec2(e,0.0), t);',
    '  float pD = potential(uv-vec2(0.0,e), t);',
    '  float pU = potential(uv+vec2(0.0,e), t);',
    '  float dPdx = (pR-pL)/(2.0*e);',
    '  float dPdy = (pU-pD)/(2.0*e);',
    '  return vec2(dPdy, -dPdx);',
    '}',
    'float diffRotDegPerDay(float lat){',
    '  float s = sin(lat); float s2 = s*s;',
    '  return 14.71 - 2.39*s2 - 1.78*s2*s2;',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float lat = (uv.y-0.5)*3.14159265359;',
    '  float lon = uv.x*6.28318530718;',
    '  vec3 p3 = vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon));',
    '  float target = fbm(p3*3.6 + vec3(0.0,0.0,uTime*0.05));',
    '  target = target*0.5+0.5;',
    '  float tBr = targetBr(p3, uTime);',
    '  if (uSeed > 0.5) {',
    '    gl_FragColor = vec4(target, 0.5 + 0.5*tBr, target, 1.0);',
    '    return;',
    '  }',
    // CFL: o passo semi-Lagrangiano só transporta coerentemente se o
    // deslocamento por passo for ~1-2 texels. O curl-noise cru tem
    // gradiente O(10) em unidades de uv — sem este teto o estado era
    // amostrado a dezenas de texels de distância por passo e o campo
    // transportado se desintegrava em ruído uniforme (o Br evoluído
    // morria e levava filamentos, plage e fibrilas junto).
    '  vec2 cv = curlVel(uv, uTime);',
    '  float cvm = length(cv);',
    '  vec2 vel = cv * (0.005 / (cvm + 1.0));',
    // rotação diferencial RELATIVA ao referencial da malha (taxa de
    // Carrington ~14.18°/dia): a rotação média já é a própria esfera
    // girando; na textura fica só o CISALHAMENTO diferencial
    '  vel.x += (diffRotDegPerDay(lat) - 14.18) * 0.00028;',
    '  vec2 srcUV = vec2(fract(uv.x - vel.x*uDt), clamp(uv.y - vel.y*uDt, 0.0015, 0.9985));',
    '  vec4 prevC = texture2D(uPrevState, srcUV);',
    '  vec4 cR = texture2D(uPrevState, srcUV+vec2(uTexel.x,0.0));',
    '  vec4 cL = texture2D(uPrevState, srcUV-vec2(uTexel.x,0.0));',
    '  vec4 cU = texture2D(uPrevState, srcUV+vec2(0.0,uTexel.y));',
    '  vec4 cD = texture2D(uPrevState, srcUV-vec2(0.0,uTexel.y));',
    '  float prevVal = prevC.r;',
    '  float blur = (prevVal + cR.r + cL.r + cU.r + cD.r) / 5.0;',
    '  float advected = mix(prevVal, blur, 0.035);',
    '  float result = mix(advected, target, 0.022);',
    '  result = clamp(result, 0.0, 1.0);',
    // Br: mesma advecção (fluxo congelado no escoamento) + difusão de
    // Leighton um pouco maior + relaxação lenta para as fontes — o padrão
    // que se vê é o alvo DISTORCIDO pela história do escoamento
    '  float prevB = prevC.g*2.0 - 1.0;',
    '  float blurB = (prevB + (cR.g*2.0-1.0) + (cL.g*2.0-1.0) + (cU.g*2.0-1.0) + (cD.g*2.0-1.0)) / 5.0;',
    '  float advB = mix(prevB, blurB, 0.06);',
    '  float resB = clamp(mix(advB, tBr, 0.008), -1.0, 1.0);',
    '  gl_FragColor = vec4(result, 0.5 + 0.5*resB, result, 1.0);',
    '}'
  ].join('\n');

  var simStepMaterial = new THREE.ShaderMaterial({ uniforms: simUniforms, vertexShader: quadVertex, fragmentShader: simFragmentShader });
  var simStepScene = makeFullscreenScene(simStepMaterial);

  // semeia os dois alvos com ruído em força total para não haver "pop-in".
  // Chamada DEPOIS de buildCharges (uChargesSim precisa estar preenchido).
  function seedSimulation(){
    simUniforms.uSeed.value = 1.0;
    simUniforms.uTime.value = 0.0;
    renderer.setRenderTarget(simRTs[0]);
    renderer.render(simStepScene, quadCamera);
    renderer.setRenderTarget(simRTs[1]);
    renderer.render(simStepScene, quadCamera);
    renderer.setRenderTarget(null);
    simUniforms.uSeed.value = 0.0;
  }

  var simClockTime = 0.0;
  function stepSimulation(dt){
    simClockTime += dt;
    var srcRT = simRTs[simIndex];
    var dstRT = simRTs[1-simIndex];
    simUniforms.uPrevState.value = srcRT.texture;
    simUniforms.uDt.value = dt;
    simUniforms.uTime.value = simClockTime;
    renderer.setRenderTarget(dstRT);
    renderer.render(simStepScene, quadCamera);
    simIndex = 1-simIndex;
    // chromo/smear NÃO leem o sim vivo: as 8 fatias de um ciclo de bake
    // consomem o snapshot tirado no início do ciclo (snapshotBakeInputs)
    // — sem emendas horizontais entre bandas de latitude
    sunUniforms.uSimTex.value    = simRTs[simIndex].texture;
    spiculeUniforms.uSimTex.value = simRTs[simIndex].texture;
  }

  // ---------------------------------------------------------------
  // T1.1: PILs do Br EVOLUÍDO para as âncoras das proeminências.
  // O canal G do sim é copiado a um RT 128x64 RGBA8 (1 blit + readPixels
  // por RENASCIMENTO — custo desprezível) e o JS procura linhas de
  // inversão com o MESMO critério do bake (|Br| pequeno + fluxo oposto
  // em volta): o filamento que a rotação leva ao limbo é o que vira
  // proeminência, e a âncora acompanha o campo evoluído do momento.
  // ---------------------------------------------------------------
  var PIL_W = 128, PIL_H = 64;
  var pilRT = new THREE.WebGLRenderTarget(PIL_W, PIL_H, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    depthBuffer: false, stencilBuffer: false });
  var pilCopyUniforms = { tSrc: { value: null } };
  var pilCopyMaterial = new THREE.ShaderMaterial({ uniforms: pilCopyUniforms, vertexShader: quadVertex, fragmentShader: [
    'uniform sampler2D tSrc;',
    'varying vec2 vUv;',
    'void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).g, 0.0, 0.0, 1.0); }'
  ].join('\n') });
  var pilCopyScene = makeFullscreenScene(pilCopyMaterial);
  var pilBuf = new Uint8Array(PIL_W*PIL_H*4);
  var pilStats = { mode: 'none', candidates: 0 };
  function pilBrAt(x, y){
    x = ((x % PIL_W) + PIL_W) % PIL_W;
    y = Math.max(0, Math.min(PIL_H-1, y));
    return pilBuf[(y*PIL_W + x)*4] / 127.5 - 1.0;
  }
  function refreshPILBuffer(){
    pilCopyUniforms.tSrc.value = simRTs[simIndex].texture;
    var prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(pilRT);
    renderer.render(pilCopyScene, quadCamera);
    renderer.readRenderTargetPixels(pilRT, 0, 0, PIL_W, PIL_H, pilBuf);
    renderer.setRenderTarget(prevRT);
  }
  function samplePILAnchor(){
    try {
      refreshPILBuffer();
      var cands = [];
      for (var y=7; y<PIL_H-7; y++){          // evita |lat| > ~70 graus
        var lat0 = ((y+0.5)/PIL_H - 0.5) * Math.PI;
        var cl0 = Math.max(Math.cos(lat0), 0.35);
        for (var x=0; x<PIL_W; x++){
          var br = pilBrAt(x, y);
          if (Math.abs(br) > 0.16) continue;
          var bL = pilBrAt(x-2, y), bR = pilBrAt(x+2, y);
          var bD = pilBrAt(x, y-2), bU = pilBrAt(x, y+2);
          if (bR*bL >= 0.0 && bU*bD >= 0.0) continue;   // precisa inverter
          var gx = (bR - bL)/cl0, gy = bU - bD;         // gradiente angular
          var g = Math.sqrt(gx*gx + gy*gy);
          if (g < 0.14) continue;               // PIL de campo morto não sustenta
          cands.push({ x:x, y:y, gx:gx, gy:gy, s: Math.min(g, 1.2) });
        }
      }
      pilStats.candidates = cands.length;
      if (!cands.length){ pilStats.mode = 'fallback'; return null; }
      var tot = 0; cands.forEach(function(c){ tot += c.s; });
      var r = srand()*tot, c = cands[cands.length-1];
      for (var i=0;i<cands.length;i++){ r -= cands[i].s; if (r <= 0){ c = cands[i]; break; } }
      var lon = (c.x+0.5)/PIL_W * Math.PI*2;
      var lat = ((c.y+0.5)/PIL_H - 0.5) * Math.PI;
      var cl = Math.cos(lat);
      var anchor = new THREE.Vector3(cl*Math.cos(lon), Math.sin(lat), cl*Math.sin(lon));
      // tangente da PIL (perpendicular ao gradiente de Br no plano
      // tangente): o cartão nasce ALINHADO ao canal do filamento — como
      // um hedgerow real, que corre AO LONGO da linha neutra
      var east = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon));
      var north = new THREE.Vector3(-Math.sin(lat)*Math.cos(lon), Math.cos(lat), -Math.sin(lat)*Math.sin(lon));
      var t3 = east.multiplyScalar(-c.gy).add(north.multiplyScalar(c.gx));
      if (t3.lengthSq() > 1e-8) anchor.pilTangent = t3.normalize();
      pilStats.mode = 'pil';
      return anchor;
    } catch(e){ pilStats.mode = 'fallback'; return null; }
  }

  // ---------------------------------------------------------------
  // Superfície do Sol
  // ---------------------------------------------------------------
  var SUN_RADIUS = 2.2;
  var sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, SPHERE_SEG, SPHERE_SEG);

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
  function placePair(ps){
    // rejeição: regiões ativas independentes não nascem sobrepostas —
    // exige distância angular mínima dos líderes das outras regiões
    var lat, lon, lead;
    for (var attempt = 0; attempt < 24; attempt++){
      lat = ps.hemi * (0.24 + srand()*0.30);
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
        phase: 0, reborn: false
      };
      ps.phase = (i/4 + srand()*0.1) * ps.period;
      placePair(ps);
      pairStates.push(ps);
    }
    charges.push(new THREE.Vector4(0,  0.55, 0,  0.5));
    charges.push(new THREE.Vector4(0, -0.55, 0, -0.5));
  })();
  simUniforms.uChargesSim.value = charges;
  seedSimulation();
  function lifeEnvelope(x){   // x em 0..1 dentro do período
    if (x < 0.14) { var a = x/0.14; return a*a*(3.0-2.0*a); }
    if (x < 0.58) return 1.0;
    if (x < 0.90) { var b = (x-0.58)/0.32; return 1.0 - b*b*(3.0-2.0*b); }
    return 0.0;
  }
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
      var env = lifeEnvelope(x);
      if (x >= 0.90){
        if (!ps.reborn){ placePair(ps); ps.reborn = true; }   // renasce longe
      } else {
        ps.reborn = false;
      }
      ps.lead.w =  ps.baseQ * Math.max(env, 0.03);
      ps.foll.w = -ps.baseQ * 0.85 * Math.max(env, 0.03);
      // MACRO_SLOW: a advecção do sim desacelera junto (SIM_DT) — as
      // cargas derivam na mesma escala para as manchas não descolarem
      // da plage (família do bug 4 da auditoria de movimento)
      if (regDt > 0){ driftCharge(ps.lead, regDt*MACRO_SLOW); driftCharge(ps.foll, regDt*MACRO_SLOW); }
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
    uSimTexel: { value: simUniforms.uTexel.value }
  };

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
  var chromoRT = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, simRTOptions);
  chromoRT.texture.wrapS = THREE.RepeatWrapping;   // costura de longitude
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
  var chromoMaterial = new THREE.ShaderMaterial({ uniforms: chromoUniforms, vertexShader: quadVertex, fragmentShader: chromoFragment });
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
  var smearMaterial = new THREE.ShaderMaterial({ uniforms: smearUniforms, vertexShader: quadVertex, fragmentShader: smearFragment });
  var smearScene = makeFullscreenScene(smearMaterial);

  // 3 conjuntos de bake (atual / anterior / escrita): o shader lê os dois
  // primeiros em crossfade enquanto o terceiro é assado fatiado
  function cloneChromoRT(){
    var rt = new THREE.WebGLRenderTarget(CHROMO_W, CHROMO_H, simRTOptions);
    rt.texture.wrapS = THREE.RepeatWrapping;
    return rt;
  }
  var bakeSets = [
    { c: chromoRT, s: chromoRT2 },
    { c: cloneChromoRT(), s: cloneChromoRT() },
    { c: cloneChromoRT(), s: cloneChromoRT() }
  ];
  var bakeCur = 0, bakePrev = 0, bakeWrite = 1;
  var bakeSwapT = 0, bakeCycleDt = 0.25;
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
  var bakeStep = -1, bakeTime = 0;
  function bakeChromoSlice(step, timeNow){
    var band = step % 4;
    var bandH = CHROMO_H >> 2;
    var isChromo = step < 4;
    var ws = bakeSets[bakeWrite];
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
    bakeCopyUniforms.tSrc.value = simRTs[simIndex].texture;
    renderer.setRenderTarget(bakeSimRT);
    renderer.render(bakeCopyScene, quadCamera);
    renderer.setRenderTarget(null);
    chromoUniforms.uSimTex.value = bakeSimRT.texture;
    smearUniforms.uSimTex.value  = bakeSimRT.texture;
    for (var i=0;i<charges.length;i++) bakeCharges[i].copy(charges[i]);
  }

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
    'uniform vec4 uCharges[10];'].join('\n') + '\n' + SFTDIR_GLSL + '\n' + BFIELD_GLSL + '\n' + LIC_GLSL + '\n' + [
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
  scene.add(sunMesh);

  // ---------------------------------------------------------------
  // (A antiga "casca de brilho" aditiva foi removida: ela criava um anel
  // branco artificial na borda, o oposto do escurecimento de limbo real.
  // O brilho externo agora vem de uma coroa suave, abaixo.)
  // ---------------------------------------------------------------

  // ---------------------------------------------------------------
  // Coroa: gradientes radiais suaves. O truque para não virar "anel" nem
  // lavar o disco é deixar o centro TRANSPARENTE (o disco aparece através)
  // e o brilho surgir logo além da borda, desaparecendo devagar.
  // ---------------------------------------------------------------
  function makeRadialTexture(stops, size){
    size = size || 512;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    stops.forEach(function(s){ g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // (o gradiente interno foi substituído pelo shader de raios abaixo)
  var coronaOuterTex = makeRadialTexture([
    [0.00,'rgba(255,150,70,0)'],
    [0.40,'rgba(255,140,60,0)'],
    [0.52,'rgba(255,120,48,0.028)'],
    [0.75,'rgba(255,90,32,0.010)'],
    [1.00,'rgba(255,70,20,0)']
  ]);

  // Coroa interna com RAIOS RADIAIS (a assinatura visual de fotos de
  // eclipse): plano orientado à câmera, com falloff exponencial a partir
  // do limbo e raias moduladas por ruído angular que evoluem devagar.
  var CORONA_SIZE = SUN_RADIUS*7.0;
  // T1.3: halo 0.55 = variante c2 do sweep, a melhor leitura de DP
  // (transição disco->céu suave, decaimento monotônico, sem anel); os
  // gates A/D agora capturam com a coroa isolada (qa-elements), então o
  // halo pleno não os contamina. cray 0.90 é o mínimo que torna os
  // streamers legíveis; cact 0.50 faz a coroa respirar com o ciclo.
  var coronaRaysUniforms = {
    uTime: { value: 0 },
    uRight: { value: new THREE.Vector3(1,0,0) },
    uUp: { value: new THREE.Vector3(0,1,0) },
    uRotY: { value: 0 },
    uCharges: { value: charges },
    uActivity: { value: 0.5 },
    uHalo: { value: knob('halo', 0.55, 0.0, 2.0) },
    uActGain: { value: knob('cact', 0.50, 0.0, 2.0) },
    uRayBoost: { value: knob('ray', 0.90, 0.0, 3.0) }
  };
  var coronaRaysMat = new THREE.ShaderMaterial({
    uniforms: coronaRaysUniforms,
    vertexShader: uvMeshVertex,
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uTime;',
      'uniform vec3 uRight;',
      'uniform vec3 uUp;',
      'uniform float uRotY;',
      'uniform vec4 uCharges[10];',
      'uniform float uActivity;',
      'uniform float uHalo;',
      'uniform float uActGain;',
      'uniform float uRayBoost;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 c = vUv - 0.5;',
      '  float r = length(c)*2.0;',                 // 0 centro -> 1 borda do plano
      '  float diskR = 2.0/7.0;',                   // raio do disco solar neste plano
      '  float ang = atan(c.y, c.x);',
      // T1.3: a raia vive no REFERENCIAL DO SOL. Direção 3D do ponto do
      // plano do céu (base da câmera) girada para o espaço do objeto: as
      // raias acompanham a rotação e as regiões ativas — não são mais um
      // papel de parede da tela
      '  vec3 dirW = normalize(uRight*cos(ang) + uUp*sin(ang));',
      '  float cy = cos(-uRotY); float sy = sin(-uRotY);',
      '  vec3 dirO = vec3(dirW.x*cy - dirW.z*sy, dirW.y, dirW.x*sy + dirW.z*cy);',
      // coroa VIVA (backlog M2 nº4): os raios evoluíam a uTime*0.006 —
      // diff 0.00 em qualquer clipe, a camada morta que quebrava a
      // ilusão por contraste com as vivas. Três tempos: deriva angular
      // própria LENTA do padrão (a coroa não é rígida com a fotosfera),
      // evolução do fbm ~5x mais rápida e flicker 1/f por direção —
      // a luz treme como em filme de eclipse. Streamers (act) seguem
      // ancorados às cargas: a física não muda, só o padrão respira.
      '  float ca = cos(uTime*0.010); float sa = sin(uTime*0.010);',
      '  vec3 ap = vec3(dirO.x*ca - dirO.z*sa, dirO.y, dirO.x*sa + dirO.z*ca)*2.6;',
      '  float rays = fbmLight(ap + vec3(0.0, 0.0, uTime*0.030));',
      '  rays = 0.68 + 0.36*rays;',
      '  float rays2 = fbmLight(ap*2.7 + vec3(7.3, 0.0, uTime*0.045));',
      '  rays *= 0.85 + 0.25*rays2;',
      '  float flick = fbmLight(dirO*1.9 + vec3(3.7, 8.2, uTime*0.55));',
      '  rays *= 0.90 + 0.20*flick;',
      // streamers nascem SOBRE as regiões ativas: reforço por carga
      '  float act = 0.0;',
      '  for(int i=0;i<10;i++){',
      '    vec3 cd = uCharges[i].xyz;',
      '    float cl = length(cd);',
      '    if (cl < 1e-4) continue;',
      '    float dA = acos(clamp(dot(dirO, cd/cl), -1.0, 1.0));',
      '    act += abs(uCharges[i].w) * exp(-dA*dA*9.0);',
      '  }',
      '  rays *= 1.0 + uRayBoost*min(act, 1.4);',
      // falloff: núcleo justo + RESPIRO largo (halo coronal — o bloom não
      // atravessa o limbo escurecido, T2.1)
      '  float fall = exp(-(r-diskR)*22.0) + uHalo*exp(-(r-diskR)*7.0);',
      '  fall *= smoothstep(diskR*0.92, diskR*1.06, r);',
      '  fall *= smoothstep(0.85, 0.55, r);',        // some bem antes da borda do plano
      '  vec3 col = mix(vec3(1.0,0.45,0.16), vec3(1.0,0.72,0.38), clamp((r-diskR)*2.2,0.0,1.0));',
      // amplitude respira com a atividade global do ciclo
      '  gl_FragColor = vec4(col * fall * rays * 0.16 * (1.0 + uActGain*uActivity), 1.0);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false
  });
  var coronaRays = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_SIZE, CORONA_SIZE), coronaRaysMat);
  coronaRays.renderOrder = -1;
  scene.add(coronaRays);

  var coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({map:coronaOuterTex, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false}));
  coronaOuter.scale.set(SUN_RADIUS*6.0, SUN_RADIUS*6.0, 1);
  scene.add(coronaOuter);

  // ---------------------------------------------------------------
  // Espículas: franja "felpuda" do limbo. Casca fina em torno do disco;
  // a opacidade vem de ruído de alta frequência ANGULAR (fios individuais)
  // com comprimento de franja irregular — o limbo real em H-alfa nunca é
  // uma borda geométrica limpa (ref-05).
  // ---------------------------------------------------------------
  var SPICULE_R = SUN_RADIUS*1.042;
  // mu na borda interna da casca (onde o disco a oculta):
  var SPICULE_MU0 = Math.sqrt(1.0 - (SUN_RADIUS*SUN_RADIUS)/(SPICULE_R*SPICULE_R));
  var spiculeUniforms = { uTime: { value: 0 }, uMu0: { value: SPICULE_MU0 },
                          uSimTex: { value: simRTs[0].texture } };
  var spiculeMat = new THREE.ShaderMaterial({
    uniforms: spiculeUniforms,
    vertexShader: [
      'varying vec3 vNormalW;',
      'varying vec3 vPositionW;',
      'varying vec3 vPosObj;',
      'void main(){',
      '  vPosObj = position;',
      '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
      '  vPositionW = worldPos.xyz;',
      '  vNormalW = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * viewMatrix * worldPos;',
      '}'
    ].join('\n'),
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uTime;',
      'uniform float uMu0;',
      'uniform sampler2D uSimTex;',
      'varying vec3 vNormalW;',
      'varying vec3 vPositionW;',
      'varying vec3 vPosObj;',
      'void main(){',
      '  vec3 viewDir = normalize(cameraPosition - vPositionW);',
      '  vec3 N = normalize(vNormalW);',
      '  float mu = dot(N, viewDir);',
      '  if (mu < 0.0) { discard; }',
      // h: 0 na borda do disco -> 1 na silhueta externa da casca.
      // Deixamos h ir um pouco NEGATIVO (sobre o disco) para a franja
      // nascer colada na borda, sem vão.
      '  float h = 1.0 - mu/uMu0;',
      '  if (h < -0.35) { discard; }',
      // coordenada angular estável ao longo do limbo (espaço do objeto,
      // gira com o Sol): posição projetada perpendicular à direção de visão
      '  vec3 sil = normalize(vPosObj - viewDir*dot(vPosObj, viewDir));',
      // T1.2: as espículas SENTEM o campo evoluído. |Br| do sim na direção
      // da silhueta (mesma textura que faz filamentos/plage no disco):
      // onde uma região ativa cruza o limbo, a franja fica mais alta,
      // mais tufada e mais densa; no sol calmo, mais rala — como as
      // espículas reais, mais vigorosas na borda da rede magnética forte
      '  float slon = atan(sil.z, sil.x);',
      '  float slat = asin(clamp(sil.y, -1.0, 1.0));',
      '  vec2 suv = vec2(fract(slon/6.28318530718), slat/3.14159265359 + 0.5);',
      '  float brEvS = texture2D(uSimTex, suv).g*2.0 - 1.0;',
      '  float fieldK = smoothstep(0.10, 0.50, abs(brEvS));',
      // fios finíssimos, quase constantes na radial: veludo, não engrenagem
      '  float th1 = snoise(sil*95.0 + vec3(0.0, 0.0, uTime*0.10));',
      '  float th2 = snoise(sil*185.0 + vec3(7.7, 0.0, uTime*0.16));',
      '  float threads = 0.5 + 0.5*(th1*0.6 + th2*0.5);',
      // comprimento irregular da franja, variando rápido ao longo do limbo
      '  float len = 0.24 + 0.34*(0.5 + 0.5*snoise(sil*22.0 + vec3(3.1)));',
      // moitas: espículas nascem AGRUPADAS na rede — tufos altos esparsos
      // se erguem sobre a franja rasa (ref-05); o campo forte agrava
      '  float clump = max(snoise(sil*6.5 + vec3(8.8, 0.0, uTime*0.03)), 0.0);',
      '  clump = min(clump + 0.45*fieldK*clump, 1.4);',
      '  len += 0.62*clump*clump;',
      '  len *= 0.85 + 0.42*fieldK;',
      '  float fringe = 1.0 - smoothstep(len*0.25, len, max(h, 0.0));',
      // some suavemente por cima do disco (h<0) para fundir com a borda
      '  fringe *= smoothstep(-0.35, -0.05, h);',
      // DENSIDADE também varia ao longo do limbo (ref-05): a altura já
      // tinha moitas, mas o alfa constante virava veludo uniforme —
      // grama real tem trechos ralos quase carecas entre tufos densos
      '  float bald = smoothstep(-0.55, 0.20, snoise(sil*3.7 + vec3(4.2, 0.0, uTime*0.02)));',
      '  float dens = (0.35 + 0.65*bald) * (0.80 + 0.45*clump);',
      '  dens *= 0.80 + 0.50*fieldK;',
      '  float a = fringe * (0.22 + 0.42*smoothstep(0.35, 0.85, threads)) * 0.55 * dens;',
      // pontas mais escuras: a franja derrete no céu, não brilha mais que o disco
      '  vec3 col = mix(vec3(0.85,0.24,0.07), vec3(0.38,0.06,0.02), smoothstep(0.0, 1.0, max(h,0.0)));',
      '  gl_FragColor = vec4(col, a);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide
  });
  var spiculeMesh = new THREE.Mesh(new THREE.SphereGeometry(SPICULE_R, SPHERE_SEG, SPHERE_SEG), spiculeMat);
  scene.add(spiculeMesh);

  // ---------------------------------------------------------------
  // Proeminências solares (arcos de plasma). A cor foge de blackbody
  // de propósito: prominências são opticamente finas e o tom avermelhado
  // característico vem da linha de emissão H-alfa (656nm), não de
  // radiação térmica de corpo negro — então mantemos um vermelho definido
  // à mão em vez de "temperatura errada aplicada corretamente".
  // ---------------------------------------------------------------
  var prominenceGroup = new THREE.Group();
  var prominenceMeshes = [];
  var promStates = [];
  // âncora preferencialmente numa LINHA NEUTRA do campo magnético (é onde
  // proeminências reais se sustentam) — amostragem por rejeição. Usada no
  // nascimento E em cada RENASCIMENTO: o campo evolui, a âncora nova
  // segue o campo do momento.
  function sampleProminenceAnchor(){
    // 1a escolha: linha de inversão do campo EVOLUÍDO (mesma física dos
    // filamentos do bake); o campo analítico fica só de fallback
    var pil = samplePILAnchor();
    if (pil) return pil;
    var anchor = null;
    for (var tries=0; tries<48; tries++){
      var th = srand()*Math.PI*2;
      var ph = Math.acos(2*srand()-1);
      var cand = new THREE.Vector3(
        Math.sin(ph)*Math.cos(th),
        Math.cos(ph),
        Math.sin(ph)*Math.sin(th)
      );
      anchor = cand;
      var Bv = bFieldJS(cand);
      var bm = Bv.length() + 1e-6;
      if (Math.abs(Bv.dot(cand))/bm < 0.22 && bm > 0.5) break;
    }
    return anchor;
  }
  // (re)posiciona o par de cartões cruzados numa âncora nova, com forma
  // nova (uSeed): chamado no nascimento e a cada renascimento do ciclo de
  // vida — a proeminência velha colapsa (env->0) e a slot renasce longe
  function placeProminence(ps, anchor){
    var baseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), anchor);
    var ang0;
    if (anchor.pilTangent){
      // gira o eixo X do cartão (largura) para a tangente da PIL
      var x0 = new THREE.Vector3(1,0,0).applyQuaternion(baseQ);
      var cr = new THREE.Vector3().crossVectors(x0, anchor.pilTangent);
      ang0 = Math.atan2(anchor.dot(cr), x0.dot(anchor.pilTangent));
    } else ang0 = srand()*Math.PI;
    ps.meshes.forEach(function(mm, k){
      var spin = new THREE.Quaternion().setFromAxisAngle(anchor, ang0 + k*Math.PI*0.5);
      mm.quaternion.copy(spin.multiply(baseQ));
      mm.position.copy(anchor).multiplyScalar(SUN_RADIUS*0.995);
      mm.userData.dir = anchor.clone();
      mm.material.uniforms.uSeed.value = srand()*100;
    });
  }
  // uniforms comuns aos três shaders de proeminência (ciclo de vida,
  // agitação por flare e "tempo do plasma" são a mesma interface)
  var PROM_HEADER_GLSL = [
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform float uIntensity;',
    'uniform float uAspect;',
    'uniform float uLife;',
    'uniform float uAgit;',
    'uniform float uPTime;',
    'varying vec2 vUv;'
  ].join('\n');
  var hedgerowFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
    'void main(){',
    '  float xn = vUv.x*2.0 - 1.0;',
    '  float y = vUv.y;',
    // topo em arco irregular (mais alto no meio, recortado por ruído
    // em duas escalas — os montículos da ref-05 são bem denteados)
    '  float yTop = (0.60 + 0.28*snoise(vec3(xn*2.3, uSeed, 0.0))',
    '             + 0.12*snoise(vec3(xn*6.1, uSeed*1.7, 2.0))) * (1.0 - xn*xn*0.62);',
    // ciclo de vida: a cortina CRESCE da superfície e recolhe no fim
    '  yTop *= 0.10 + 0.90*uLife;',
    // flare vizinho ERGUE a cortina (injeção de energia por baixo)
    '  yTop *= 1.0 + 0.60*uAgit;',
    // cortina: fios VERTICAIS finos, drenando devagar (uPTime acelera
    // a drenagem sob agitação, sem saltos)
    '  float th1 = snoise(vec3(vUv.x*uAspect*24.0, y*3.0 - uPTime*0.05, uSeed));',
    '  float th2 = snoise(vec3(vUv.x*uAspect*55.0, y*6.0 - uPTime*0.08, uSeed+7.7));',
    '  float wisp = smoothstep(0.05, 0.80, (th1*0.6 + th2*0.5)*0.5+0.5);',
    '  float body = smoothstep(0.02, 0.16, yTop - y);',
    '  float a = wisp * body * uIntensity;',
    '  a *= 1.0 - smoothstep(0.72, 1.0, abs(xn));',
    // corta abaixo da superfície curva (sem borda reta flutuante)
    '  a *= smoothstep(0.0, 0.07, y);',
    // extinção alargada 0.08→0.22 (backlog M2 nº6, aqui e nas outras
    // 2 camadas): o fade final comprimia-se em ~1 frame — a
    // proeminência agora se apaga ao longo da cauda do envelope
    '  a *= smoothstep(0.0, 0.22, uLife);',
    '  vec3 col = mix(vec3(0.45,0.06,0.02), vec3(1.30,0.42,0.12), wisp*(1.0-y*0.8));',
    // brilho HDR do flare: a COR sobe (o alfa satura no corpo denso e
    // esconderia o reavivamento; >1.0 o bloom captura)
    '  col *= 1.0 + 0.9*uAgit;',
    '  gl_FragColor = vec4(col, a*1.05);',
    '}'
  ].join('\n');
  // PLUMA VARRIDA (ref-04): a proeminência real da foto não é um
  // leque denso e simétrico — são FEIXES distintos de fios finos
  // quase paralelos, todos varridos para um lado, com pontas
  // desfiadas e céu vazio entre os feixes
  var fanFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
      'void main(){',
      '  float xn = vUv.x*2.0 - 1.0;',
      // pé deslocado para o lado oposto à varredura
      '  float side = (fract(uSeed*0.73) > 0.5) ? 1.0 : -1.0;',
      '  vec2 p = vec2(xn*uAspect*0.5 - 0.30*side, vUv.y + 0.06);',
      '  float r = length(p);',
      '  float ang = atan(-side*p.x, p.y);',
      // varredura: o fio curva-se para o lado conforme sobe
      '  float sweep = 0.55 + 0.40*snoise(vec3(uSeed*0.7, 1.3, 0.0));',
      '  float aa = ang - sweep*r*1.35;',
      // feixes com VÃOS: gate de baixa frequência sobre o ângulo varrido
      '  float bundle = snoise(vec3(aa*3.4, uSeed*1.9, 0.4));',
      '  float bgate = smoothstep(-0.05, 0.42, bundle);',
      // fios finos e paralelos dentro de cada feixe (drenam devagar)
      '  float th1 = snoise(vec3(aa*26.0 + uSeed, r*2.0 - uPTime*0.045, uSeed));',
      '  float th2 = snoise(vec3(aa*57.0 - uSeed, r*3.6 - uPTime*0.07, uSeed*2.3));',
      '  float wisp = smoothstep(0.12, 0.80, (th1*0.60 + th2*0.50)*0.5+0.5);',
      // cada feixe tem comprimento próprio; a ponta é DESFIADA
      '  float blen = 0.62 + 0.34*snoise(vec3(bundle*2.7, uSeed*1.3, 2.2));',
      // ciclo de vida: os feixes ALONGAM a partir da superfície
      '  blen *= 0.10 + 0.90*uLife;',
      // flare vizinho alonga/ergue os feixes
      '  blen *= 1.0 + 0.50*uAgit;',
      '  float fray = 0.12*snoise(vec3(aa*13.0, r*6.0, uSeed*3.1));',
      '  float tip = 1.0 - smoothstep(blen*0.52, blen + fray, r);',
      '  float a = wisp * bgate * tip * uIntensity;',
      '  a *= 1.0 - smoothstep(1.05, 1.45, abs(ang));',
      '  a *= smoothstep(0.0, 0.05, vUv.y);',
      '  a *= smoothstep(0.0, 0.22, uLife);',
      // H-alfa contra céu escuro: vermelho profundo, pontas mais frias
      '  vec3 col = mix(vec3(0.48,0.07,0.02), vec3(1.30,0.45,0.13), wisp*tip);',
      '  col *= 1.0 + 0.9*uAgit;',
      '  gl_FragColor = vec4(col, a*1.15);',
      '}'
    ].join('\n');
  // ARCO: tubo de fios seguindo um laço magnético — coordenadas
  // polares centradas ABAIXO da base; o feixe vive num anel |r-R0|
  // fino, fios comprimidos na direção ANGULAR (seguem o arco), pés
  // mais grossos/brilhantes e vão transparente sob o vão do laço
  var archFragment = NOISE_GLSL + '\n' + PROM_HEADER_GLSL + '\n' + [
    'void main(){',
    '  float xn = vUv.x*2.0 - 1.0;',
    '  float y = vUv.y;',
    '  vec2 p = vec2(xn*uAspect*0.5, y + 0.22);',
    '  float r = length(p);',
    '  float ang = atan(p.x, p.y);',
    // raio do laço: UM arco só por proeminência (o raio não pode
    // ondular com o ângulo, senão vira renda de arquinhos) — apenas
    // uma assimetria suave e respiração lenta. Alto o bastante para
    // o vão sob o laço se erguer claramente do limbo
    '  float R0 = 0.78 + 0.05*snoise(vec3(uSeed, 2.1, 0.0))',
    '           + 0.030*snoise(vec3(ang*0.8 + uSeed, 5.3, uTime*0.02));',
    // ciclo de vida: o laço ERGUE-SE de sob a superfície (R0 pequeno
    // fica todo abaixo do limbo) e afunda de volta no colapso
    '  R0 *= 0.15 + 0.85*uLife;',
    // flare vizinho ERGUE o laço inteiro
    '  R0 *= 1.0 + 0.32*uAgit;',
    '  float d = r - R0;',
    // fios ao longo do arco (dreno lento de matéria pelos pés: o
    // padrão angular desliza para baixo dos dois lados; uPTime
    // acelera o dreno sob agitação, sem saltos)
    '  float drift = uPTime*0.045;',
    // FIOS ANISOTRÓPICOS (ref-04): fios reais correm PARALELOS ao
    // arco — variação rápida ATRAVÉS do tubo (d), lenta ao longo
    // (ang). Frequências parecidas nos dois eixos viravam mancha
    // isotrópica ("pele de onça" num tubo sólido).
    // frequência angular BAIXA: fios longos e contínuos ao longo do
    // arco (freq alta picotava em "confete tracejado")
    '  float th1 = snoise(vec3(ang*1.6 + uSeed + sign(ang)*drift, d*34.0, uSeed*1.3));',
    '  float th2 = snoise(vec3(ang*3.0 - uSeed + sign(ang)*drift*1.6, d*70.0, uSeed*2.1));',
    // gate chega a ZERO entre fios: céu aparece ATRAVÉS do laço
    // (proeminência é opticamente fina, não tubo opaco)
    '  float wisp = smoothstep(0.34, 0.74, (th1*0.62 + th2*0.5)*0.5+0.5);',
    // feixes com vãos de céu entre grupos de fios
    '  float bund = smoothstep(-0.35, 0.30, snoise(vec3(ang*2.3 + uSeed*3.1, d*7.0, uSeed)));',
    // tubo mais grosso e denso nos pés (como nos laços reais)
    '  float thick = 0.12 + 0.05*smoothstep(0.35, 1.15, abs(ang))',
    '              + 0.025*snoise(vec3(ang*3.1, uSeed*0.7, 0.0));',
    // borda EMPLUMADA: os fios definem a silhueta, não um degrau
    '  float tube = 1.0 - smoothstep(thick*0.10, thick*1.30, abs(d));',
    '  float feet = 1.0 - smoothstep(1.08, 1.38, abs(ang));',
    '  float a = wisp * bund * tube * feet * uIntensity;',
    '  a *= smoothstep(0.0, 0.06, y);',
    '  a *= smoothstep(0.0, 0.22, uLife);',
    '  vec3 col = mix(vec3(0.45,0.06,0.02), vec3(1.28,0.42,0.12), wisp);',
    '  col *= 1.0 + 0.9*uAgit;',
    // vãos derrubaram a cobertura média: compensa no alfa para o laço
    // existir em exposição nativa (fios finos MAS visíveis)
    '  gl_FragColor = vec4(col, a*2.0);',
    '}'
  ].join('\n');
  (function buildProminences(){
    for(var i=0;i<PROMINENCE_COUNT;i++){
      // âncora na superfície + plano vertical (local +Y = radial para fora).
      // O leque de fios é desenhado no shader em coordenadas polares a
      // partir da base — como as proeminências reais: fios finos que
      // sobem, curvam e se ramificam (ver ref-04).
      var anchor = sampleProminenceAnchor();
      // três tipos: leque plumoso (ref-04), "hedgerow" — cortina de fios
      // verticais com topo em arco irregular, o tipo mais comum no limbo —
      // e ARCO/LAÇO: ponte de plasma com dois pés ancorados e vão escuro
      // embaixo (a proeminência "clássica" de laço magnético)
      var promType = i % 3;   // 0 leque, 1 hedgerow, 2 arco
      var isHedgerow = (promType === 1);
      var isArch = (promType === 2);
      // DIMENSÕES calibradas pela observação (R☉ ≈ 696 Mm):
      //  - laços/arcos: ápice típico 50-150 Mm; sistemas gigantes ~200 Mm
      //    (limite histórico, ex. "Granddaddy" 1946). Com R0=0.78 e centro
      //    -0.22, o ápice fica ~0.56·h => h 0.22-0.32R dá ápice 86-125 Mm ✓
      //  - quiescentes/hedgerow: 30-100 Mm de altura => h 0.09-0.15R ✓
      //  - plumas/surges eruptivos: 100-250 Mm => h 0.18-0.32R ✓
      var w = isArch ? SUN_RADIUS*(0.80 + srand()*0.35)
            : isHedgerow ? SUN_RADIUS*(0.60 + srand()*0.32) : SUN_RADIUS*(0.55 + srand()*0.5);
      var h = isArch ? SUN_RADIUS*(0.22 + srand()*0.10)
            : isHedgerow ? SUN_RADIUS*(0.09 + srand()*0.06) : SUN_RADIUS*(0.18 + srand()*0.14);
      var geo = new THREE.PlaneGeometry(w, h, 48, 1);
      geo.translate(0, h*0.5 - SUN_RADIUS*0.02, 0);   // base levemente dentro do disco
      // CONEXÃO FÍSICA: um cartão reto não abraça a esfera — nas pontas a
      // base flutuava até ~0.14R acima do limbo (um corte parabólico no
      // shader só disfarçava, deixando vão sob os pés dos arcos). Curvamos
      // o cartão em torno do centro do Sol: cada coluna de vértices vira um
      // raio, a base fica a raio constante 0.975R em QUALQUER x e vUv.y
      // passa a medir altura radial verdadeira acima da base.
      (function bendOverSphere(){
        var pos = geo.attributes.position;
        var cDist = SUN_RADIUS*0.995;   // centro do Sol no espaço local
        for (var vi=0; vi<pos.count; vi++){
          var vx = pos.getX(vi), vy = pos.getY(vi);
          var aBend = vx / SUN_RADIUS;
          var rho = cDist + vy;
          pos.setXYZ(vi, rho*Math.sin(aBend), rho*Math.cos(aBend) - cDist, pos.getZ(vi));
        }
        geo.computeBoundingSphere();
      })();
      var promUniforms = {
        uTime: { value: 0 },
        uSeed: { value: srand()*100 },
        uIntensity: { value: 1.0 },
        uAspect: { value: w/h },
        // ciclo de vida (0..1): a ESTRUTURA cresce da superfície no
        // nascimento e recolhe no colapso — nunca pop-in
        uLife: { value: 0.0 },
        // agitação por flare vizinho (0..1): ergue e reaviva o plasma
        uAgit: { value: 0.0 },
        // "tempo do plasma": acumulado em JS com velocidade variável
        // (acelera sob agitação SEM saltar a fase do ruído — multiplicar
        // uTime por um fator transitório saltaria a coordenada do noise)
        uPTime: { value: 0.0 }
      };
      var mat = new THREE.ShaderMaterial({
        uniforms: promUniforms,
        vertexShader: uvMeshVertex,
        fragmentShader: isArch ? archFragment : (isHedgerow ? hedgerowFragment : fanFragment),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      // dois planos cruzados a 90° (cartões de folhagem): nunca degeneram
      // em "agulha" quando vistos de perfil. Materiais independentes para
      // que cada plano possa esmaecer conforme fica de FRENTE à câmera —
      // proeminências são folhas opticamente finas: brilham de perfil.
      var mat2 = mat.clone();
      var mesh = new THREE.Mesh(geo, mat);
      var mesh2 = new THREE.Mesh(geo, mat2);
      var phase = srand()*Math.PI*2;
      var speed = 0.6+srand()*0.8;
      // ciclo de vida como o das regiões ativas: períodos individuais e
      // fases ESCALONADAS (o limbo nunca fica vazio nem lotado de uma vez)
      var ps = { meshes: [mesh, mesh2], period: 70 + srand()*50,
                 phase: 0, reborn: false };
      ps.phase = (i/PROMINENCE_COUNT + srand()*0.08) * ps.period;
      [mesh, mesh2].forEach(function(mm, k){
        mm.userData.twinIdx = k;
        mm.userData.phase = phase;
        mm.userData.speed = speed;
        mm.userData.state = ps;
        prominenceMeshes.push(mm);
        prominenceGroup.add(mm);
      });
      placeProminence(ps, anchor);
      promStates.push(ps);
    }
  })();
  scene.add(prominenceGroup);

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
  // RNG PRÓPRIO (mesmo mulberry32 do modo det, stream separado): os
  // sorteios novos NÃO tocam o stream do srand — a paridade
  // determinística dos elementos pré-existentes (proeminências,
  // estrelas, flares) fica intacta por construção.
  var loopRandState = DET ? ((((parseInt(urlQ.seed, 10) || 1) >>> 0) ^ 0x5EEDC0DE) >>> 0)
                          : ((Math.random()*4294967296) >>> 0);
  function loopRand(){
    loopRandState = (loopRandState + 0x6D2B79F5) >>> 0;
    var t = loopRandState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  var LOOP_K = knob('loops', 0.0, 0.0, 1.5);
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
      '  float wpx = clamp(rawPx, 1.0, 14.0);',
      '  vFade = clamp(rawPx, 0.05, 1.0);',
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
  var loopGroup = new THREE.Group();
  loopGroup.add(loopMesh);
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
  var loopStats = { traces: 0, fails: 0, ms: 0 };
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
    // FASE 2 (débito F1): viés pela SEPARAÇÃO do par — o leque de
    // offsets escala com o ângulo lead→foll em vez de ser fixo. Par
    // apertado semeia perto (linha fecha baixa), par largo semeia longe
    // (fecha alta): menos sorteios caem em linha aberta/rasteira.
    // Medido no probe (high, det=1&seed=7): rejeição 80% → ver doc F2.
    var sepAng = Math.acos(Math.max(-1, Math.min(1, loopSeedTmp.dot(loopAxisTmp))));
    loopAxisTmp.addScaledVector(loopSeedTmp, -loopAxisTmp.dot(loopSeedTmp));
    if (loopAxisTmp.lengthSq() < 1e-6) return false;
    loopAxisTmp.normalize();
    loopLatTmp.crossVectors(loopSeedTmp, loopAxisTmp);
    out.copy(loopSeedTmp)
       .addScaledVector(loopAxisTmp, sepAng*(0.12 + 0.60*loopRand()))
       .addScaledVector(loopLatTmp, (loopRand() - 0.5)*0.30*sepAng)
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
    for (var tries = 0; tries < 4; tries++){
      if (!pickLoopSeed(loopSeedOut)) break;
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
  var arcQueueN = 0;
  var arcSeedBase = new THREE.Vector3();
  var arcSeedTan = new THREE.Vector3();
  var arcSeedPerp = new THREE.Vector3();
  var arcSeedOut = new THREE.Vector3();
  function scheduleFlareArcade(){
    // congela a moldura da PIL do EVENTO (o Sol gira; a arcada não
    // pode escorregar para outra moldura no meio do rescaldo)
    arcSeedBase.copy(surfFlareDir);
    arcSeedTan.copy(flareTanDir);
    arcSeedPerp.copy(flarePerpDir);
    for (var i = 0; i < LOOP_ARC; i++){
      var st = arcStates[i];
      st.ok = false;
      st.off = ((LOOP_ARC > 1 ? i/(LOOP_ARC-1) : 0.5) - 0.5) * 0.16 + (loopRand() - 0.5)*0.015;
      st.delay = i*0.10 + loopRand()*0.05;
      loopEnvArr[LOOP_AMB + i] = 0;
    }
    arcQueueN = LOOP_ARC;
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
    var i = LOOP_ARC - arcQueueN;
    arcQueueN--;
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
    var loopsOn = subToggle.loops && LOOP_K > 0.001;
    var act = coronaRaysUniforms.uActivity.value;
    var i, st;
    if (arcQueueN > 0){ traceArcadeJob(); if (arcQueueN > 0) traceArcadeJob(); }
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
    var arcMax = 0;
    for (i = 0; i < LOOP_ARC; i++){
      st = arcStates[i];
      var envA = 0;
      if (st.ok){
        var ta = surfFlareT - st.delay;
        if (ta > 0){
          envA = flareEnvGrad(ta) * 1.25 * surfFlareAmp;
          loopHotArr[LOOP_AMB + i] = Math.exp(-ta*0.30);
        }
      }
      if (envA < 0.004) envA = 0;
      loopEnvArr[LOOP_AMB + i] = envA;
      if (envA > arcMax) arcMax = envA;
    }
    for (i = 0; i < LOOP_AMB; i++){
      st = loopStatesA[i];
      if (!loopsOn || !st.ok){ loopEnvArr[i] = 0; continue; }
      st.age += delta;
      // brilho = ciclo de vida × knob × atividade global do ciclo
      // ("uma estrela, um estado": sol ativo tem coroa mais cheia)
      loopEnvArr[i] = lifeEnvelope(st.age/st.period) * LOOP_K * (0.65 + 0.55*act);
      loopHotArr[i] = 0;
    }
    loopUniforms.uTime.value = elapsed;
    loopUniforms.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
    loopMesh.visible = subToggle.loops && (loopsOn || arcMax > 0 || arcQueueN > 0);
  }

  // ---------------------------------------------------------------
  // Campo de estrelas — cor por classe de temperatura estelar real
  // (a maioria das estrelas visíveis é fria/avermelhada; poucas são
  // quentes/azuis), usando a mesma função de corpo negro.
  // ---------------------------------------------------------------
  function buildStars(count, radius, hotBias){
    var positions = new Float32Array(count*3);
    var colors = new Float32Array(count*3);
    for(var i=0;i<count;i++){
      var u = srand(), v = srand();
      var th = 2*Math.PI*u;
      var ph = Math.acos(2*v-1);
      var rr = radius*(0.55+srand()*0.45);
      positions[i*3]   = rr*Math.sin(ph)*Math.cos(th);
      positions[i*3+1] = rr*Math.sin(ph)*Math.sin(th);
      positions[i*3+2] = rr*Math.cos(ph);
      var starTemp = (srand() < (hotBias ? 0.30 : 0.75))
        ? (2800+srand()*3200)
        : (hotBias ? (7000+srand()*13000) : (6000+srand()*20000));
      var sc = kelvinToRGB(starTemp);
      var b = 0.35 + 0.90*Math.pow(srand(), 2.2);   // distribuição ~log: poucas vivas
      colors[i*3]=sc.r*b; colors[i*3+1]=sc.g*b; colors[i*3+2]=sc.b*b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    var mat = new THREE.PointsMaterial({size:1.35, vertexColors:true, transparent:true, opacity:0.55, sizeAttenuation:true});
    return new THREE.Points(geo, mat);
  }
  // glint em cruz para as estrelas VIVAS (sprite: núcleo radial + braços)
  var glintTex = (function(){
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0.0,'rgba(255,255,255,1)');
    g.addColorStop(0.22,'rgba(255,255,255,0.34)');
    g.addColorStop(1.0,'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
    ctx.globalCompositeOperation = 'lighter';
    var arm = ctx.createLinearGradient(0,0,64,0);
    arm.addColorStop(0,'rgba(255,255,255,0)');
    arm.addColorStop(0.5,'rgba(255,255,255,0.5)');
    arm.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = arm; ctx.fillRect(0,31,64,2);
    ctx.translate(32,32); ctx.rotate(Math.PI/2); ctx.translate(-32,-32);
    ctx.fillRect(0,31,64,2);
    var tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  })();
  var stars = buildStars(STAR_COUNT, 700);
  scene.add(stars);
  // camada esparsa de estrelas maiores e mais vivas: profundidade no fundo
  // camada brilhante mais PRÓXIMA (raio 500 vs 700): paralaxe diferencial
  // real quando a câmera ORBITA o pivô — a casca próxima desloca MENOS
  // que o fundo (lei R/(R+d); medido -5.4% por passo de órbita)
  var brightStars = buildStars(TP.bright, 500, true);
  brightStars.material.size = 12.0;   // ~9px na tela: a cruz do glint fica legível
  brightStars.material.opacity = 0.8;
  brightStars.material.map = glintTex;
  brightStars.material.blending = THREE.AdditiveBlending;
  brightStars.material.depthWrite = false;
  scene.add(brightStars);
  // T2.3c: faixa da Via Láctea DISCRETA — terceira camada achatada num
  // plano inclinado (grande círculo), fraca e densa
  var milkyWay = buildStars(Math.floor(STAR_COUNT*0.9), 730);
  (function flattenToBand(){
    var pos = milkyWay.geometry.attributes.position;
    var n = new THREE.Vector3(0.35, 0.85, 0.40).normalize();
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++){
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      var rr0 = v.length();
      v.addScaledVector(n, -v.dot(n)*0.86);
      v.setLength(rr0);   // direção achatada, mas de volta à casca distante
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  })();
  milkyWay.material.size = 1.7;
  milkyWay.material.opacity = knob('mw', 0.62, 0.0, 1.0);
  var STARS_OP0 = stars.material.opacity, BRIGHT_OP0 = brightStars.material.opacity;
  var starK = knob('stars', 1.0, 0.0, 3.0);
  stars.material.opacity = Math.min(1, STARS_OP0*starK);
  brightStars.material.opacity = Math.min(1, BRIGHT_OP0*starK);
  scene.add(milkyWay);
  // twinkle SUTIL (backlog M2 nº4: estrelas eram a única camada 100%
  // morta). Cada estrela pisca com fase e cadência próprias (hash da
  // posição), modulando a OPACIDADE — astrofoto tem pouco, cinema tem
  // algum; a cruz de glint das vivas é a que mais cintila.
  var twinkleUniform = { value: 0 };
  function addTwinkle(mat, amp){
    mat.onBeforeCompile = function(shader){
      shader.uniforms.uTwT = twinkleUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTwT;\nvarying float vTw;')
        .replace('#include <color_vertex>', '#include <color_vertex>\n'
          + 'float twPh = fract(sin(dot(position, vec3(12.9898,78.233,37.719)))*43758.5453)*6.2832;\n'
          + 'float twSp = 2.0 + 4.0*fract(sin(dot(position, vec3(39.3468,11.135,83.155)))*24634.6345);\n'
          + 'vTw = 1.0 - ' + amp.toFixed(2) + '*(0.5 + 0.5*sin(uTwT*twSp + twPh));\n');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTw;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
                 'vec4 diffuseColor = vec4( diffuse, opacity * vTw );');
    };
    // sem isto o three reusa o MESMO programa para amps diferentes
    // (onBeforeCompile.toString() é igual — o amp vive num closure)
    mat.customProgramCacheKey = function(){ return 'twinkle' + amp; };
  }
  addTwinkle(stars.material, 0.30);
  addTwinkle(brightStars.material, 0.45);
  addTwinkle(milkyWay.material, 0.18);
  // Via Láctea opção B (astrofoto): véu DIFUSO de gás por trás da camada
  // estelar — faixa gaussiana no mesmo plano, manchas de fBm, veio de
  // poeira escura no meio, bojo galáctico dourado e bordas azuladas.
  // Aditivo e fora do disco: não toca nos gates.
  var mwNebUniforms = { uMW: { value: 0.0 }, uN: { value: new THREE.Vector3(0.35,0.85,0.40).normalize() } };
  var mwNeb = new THREE.Mesh(new THREE.SphereGeometry(710, 32, 32), new THREE.ShaderMaterial({
    uniforms: mwNebUniforms,
    vertexShader: [
      'varying vec3 vD;',
      'void main(){ vD = position;',
      '  gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: NOISE_GLSL + '\n' + [
      'uniform float uMW;',
      'uniform vec3 uN;',
      'varying vec3 vD;',
      // Via Láctea CINEMATOGRÁFICA (pedido do dono): a versão anterior
      // lia monocromática — ganho 0.16 deixava o véu no toe do ACES e a
      // única variação de matiz (mix azul↔dourado por ck) era ~0 em
      // quase toda a faixa. Agora: campos de fBm SEPARADOS para
      // densidade (3 escalas), matiz fria por mancha (azul↔ciano),
      // manchas de H-alfa avermelhadas, alcance do bojo dourado e veio
      // de poeira marrom sinuoso. uMW segue multiplicando tudo (knob
      // mw=0 desliga); nada dos knobs cinema é tocado.
      'void main(){',
      '  vec3 d = normalize(vD);',
      '  float b = dot(d, uN);',
      '  float band = exp(-b*b*34.0);',
      '  float halo = 0.20*exp(-b*b*9.0);',
      '  if (band + halo < 0.006){ gl_FragColor = vec4(0.0); return; }',
      '  vec3 core = normalize(cross(uN, vec3(0.2,0.0,1.0)));',
      '  float ck = pow(max(dot(d, core), 0.0), 6.0);',
      '  float c1 = fbmLight(d*3.2)*0.5+0.5;',
      '  float c2 = fbmLight(d*7.5+vec3(13.1))*0.5+0.5;',
      '  float c3 = fbmLight(d*16.0+vec3(4.2,8.8,1.5))*0.5+0.5;',
      '  float cloud = 0.22 + 1.5*(0.5*c1+0.32*c2+0.18*c3);',
      '  cloud *= cloud;',
      '  float bw = b + 0.045*fbmLight(d*5.0+vec3(7.7));',
      '  float dust = exp(-bw*bw*300.0) * smoothstep(0.32,0.80,fbmLight(d*9.0+vec3(4.7))*0.5+0.5);',
      '  float hue  = fbmLight(d*2.3+vec3(21.7))*0.5+0.5;',
      '  float hue2 = fbmLight(d*4.2+vec3(33.3))*0.5+0.5;',
      '  float hue3 = fbmLight(d*3.1+vec3(55.5))*0.5+0.5;',
      '  vec3 cCyan = vec3(0.26,0.78,1.30);',
      '  vec3 cBlue = vec3(0.42,0.55,1.30);',
      '  vec3 cAmber= vec3(1.10,0.72,0.38);',
      '  vec3 cHa   = vec3(1.05,0.28,0.22);',
      '  vec3 col = mix(cBlue, cCyan, smoothstep(0.2,0.8,hue));',
      '  col = mix(col, cAmber, clamp(ck*(0.7+0.9*hue3),0.0,1.0));',
      '  float haM = smoothstep(0.58,0.76,hue2)*(0.4+0.6*c2);',
      '  col = mix(col, cHa, haM*0.85);',
      '  col = mix(col, cCyan, 0.55*smoothstep(0.06,0.20,abs(b))*(1.0-ck));',
      '  float coolB = smoothstep(0.55,0.90,hue)*(1.0-clamp(ck*2.0,0.0,1.0))*(1.0-haM);',
      '  col *= 1.0 + 0.55*coolB;',
      '  col = mix(col, vec3(0.45,0.28,0.16), dust*0.7);',
      '  float I = (band*(0.65+0.90*ck) + halo*0.4)*cloud*(1.0-0.78*dust);',
      '  gl_FragColor = vec4(col * I * uMW * 0.27, 1.0);',
      '}'
    ].join('\n'),
    side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  mwNebUniforms.uMW.value = milkyWay.material.opacity;
  scene.add(mwNeb);

  // (Tentativa de faixa da Via Láctea removida: sem QA visual funcionando,
  // calibrar estética por estatística de pixels se provou má ideia.)

  // inclinação real do eixo solar (~7.25° em relação à eclíptica)
  sunMesh.rotation.z = 0.1265;
  prominenceGroup.rotation.z = 0.1265;
  spiculeMesh.rotation.z = 0.1265;
  loopGroup.rotation.z = 0.1265;

  // ---------------------------------------------------------------
  // Bloom multi-escala (cadeia de downsample + threshold, depois
  // upsample aditivo — técnica tipo "dual Kawase" usada em engines
  // de jogos), seguido de tonemap fílmico ACES no composite final.
  // ---------------------------------------------------------------
  // HDR: targets em half-float para que a emissão >1.0 do shader do Sol
  // sobreviva até o bloom. A detecção precisa ser ciente do contexto:
  //  - WebGL2: half-float é núcleo; a RENDERIZAÇÃO para ele exige
  //    EXT_color_buffer_float (ou _half_float). Consultar as extensões
  //    OES_* do WebGL1 aqui gera warnings e falso-negativo.
  //  - WebGL1: exige OES_texture_half_float (+_linear) e
  //    EXT_color_buffer_half_float.
  // Consultamos gl.getExtension direto (silencioso), nunca
  // renderer.extensions.get (que loga warning quando não acha).
  // (rtType/isHDR detectados no topo, antes dos targets da simulação)
  // Calibração do sweep T2.1 (5 variantes julgadas vs refs): com o disco
  // H-alfa pico ~0.98 de luminância, threshold 1.0 nunca florescia — só
  // flare raro. 0.72 + emissivos HDR de plage/limbo (no shader do sol)
  // fazem o bloom LER sem lavar o disco (p50 +2%, 0% de pixels clipados).
  var EXP0 = isHDR ? 1.02 : 1.06;
  var BLOOM_THRESHOLD = knob('bloomth', isHDR ? 0.72 : 0.82, 0.2, 2.0);
  // diagnóstico acessível via console: window.__solInfo
  try { window.__solInfo = { webgl2: !!(renderer.capabilities && renderer.capabilities.isWebGL2), hdr: isHDR, tier: TIER, scale: RENDER_SCALE }; } catch(e){}

  var sceneRT = new THREE.WebGLRenderTarget(2,2, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, type: rtType, stencilBuffer:false, depthBuffer:true
  });

  var bloomMips = [];
  (function initBloomMips(){
    for (var i=0;i<BLOOM_LEVELS;i++){
      var rt = new THREE.WebGLRenderTarget(2, 2, {
        minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
        format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false
      });
      bloomMips.push({ rt: rt, w: 2, h: 2 });
    }
  })();

  var thresholdUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uThreshold:{value:BLOOM_THRESHOLD} };
  var thresholdFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uThreshold;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  vec3 c2 = c;',
    '  c2 += texture2D(tDiffuse, vUv+vec2(uTexel.x,0.0)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv-vec2(uTexel.x,0.0)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv+vec2(0.0,uTexel.y)).rgb;',
    '  c2 += texture2D(tDiffuse, vUv-vec2(0.0,uTexel.y)).rgb;',
    '  c2 /= 5.0;',
    '  float b = dot(c2, vec3(0.299,0.587,0.114));',
    '  float f = smoothstep(uThreshold, uThreshold+0.3, b);',
    '  gl_FragColor = vec4(c2*f, 1.0);',
    '}'
  ].join('\n');
  var thresholdMaterial = new THREE.ShaderMaterial({ uniforms: thresholdUniforms, vertexShader: quadVertex, fragmentShader: thresholdFragment });
  var thresholdScene = makeFullscreenScene(thresholdMaterial);

  var downsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uDisp:{value:0.0} };
  var downsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
    'varying vec2 vUv;',
    'void main(){',
    // FASE 2 — bloom espectral ponderado por corpo negro: raio de blur
    // POR CANAL (difração ∝ λ — R borra mais largo, B mais estreito;
    // razão ancorada em λ_R/λ_B ≈ 700/450). Este é o termo da DESCIDA;
    // o grosso do espalhamento diferencial acontece na subida (tent por
    // canal no upsampleFragment). Sem passes novos: só taps a mais, e
    // só quando o knob liga.
    '  if (uDisp > 0.001){',
    '    vec2 oR = uTexel * (1.0 + 0.35*uDisp);',
    '    vec2 oB = uTexel * (1.0 - 0.25*uDisp);',
    '    vec3 cS;',
    '    cS.r = texture2D(tDiffuse, vUv+vec2( oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2( oR.x,-oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x,-oR.y)).r;',
    '    cS.g = texture2D(tDiffuse, vUv+vec2( uTexel.x, uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-uTexel.x, uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2( uTexel.x,-uTexel.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-uTexel.x,-uTexel.y)).g;',
    '    cS.b = texture2D(tDiffuse, vUv+vec2( oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2( oB.x,-oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x,-oB.y)).b;',
    '    gl_FragColor = vec4(cS*0.25, 1.0);',
    '    return;',
    '  }',
    '  vec3 c = texture2D(tDiffuse, vUv+vec2(uTexel.x,uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-uTexel.x,uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(uTexel.x,-uTexel.y)).rgb;',
    '  c += texture2D(tDiffuse, vUv+vec2(-uTexel.x,-uTexel.y)).rgb;',
    '  gl_FragColor = vec4(c*0.25, 1.0);',
    '}'
  ].join('\n');
  var downsampleMaterial = new THREE.ShaderMaterial({ uniforms: downsampleUniforms, vertexShader: quadVertex, fragmentShader: downsampleFragment });
  var downsampleScene = makeFullscreenScene(downsampleMaterial);

  var upsampleUniforms = { tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1,1)}, uDisp:{value:0.0} };
  var upsampleFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform vec2 uTexel;',
    'uniform float uDisp;',
    'varying vec2 vUv;',
    'void main(){',
    // FASE 2 — bloom espectral: o grosso do raio do dual-Kawase vem da
    // pirâmide em si (downsample bilinear), que é acromática; para o R
    // espalhar DE VERDADE mais que o B, a subida troca o passthrough
    // por um tent de 4 taps com raio POR CANAL a cada nível — o
    // espalhamento diferencial compõe sobre o sinal acumulado inteiro
    // (só o downsample espectral era imperceptível: ΔR médio +0.2/255
    // no smoke; medido 2026-07).
    '  if (uDisp > 0.001){',
    '    vec2 oR = uTexel * (0.5 + 1.70*uDisp);',
    '    vec2 oG = uTexel * 0.5;',
    '    vec2 oB = uTexel * max(0.5 - 0.34*uDisp, 0.0);',
    '    vec3 cS;',
    '    cS.r = texture2D(tDiffuse, vUv+vec2( oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x, oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2( oR.x,-oR.y)).r',
    '         + texture2D(tDiffuse, vUv+vec2(-oR.x,-oR.y)).r;',
    '    cS.g = texture2D(tDiffuse, vUv+vec2( oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x, oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2( oG.x,-oG.y)).g',
    '         + texture2D(tDiffuse, vUv+vec2(-oG.x,-oG.y)).g;',
    '    cS.b = texture2D(tDiffuse, vUv+vec2( oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x, oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2( oB.x,-oB.y)).b',
    '         + texture2D(tDiffuse, vUv+vec2(-oB.x,-oB.y)).b;',
    '    gl_FragColor = vec4(cS*0.25, 1.0);',
    '    return;',
    '  }',
    '  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);',
    '}'
  ].join('\n');
  var upsampleMaterial = new THREE.ShaderMaterial({
    uniforms: upsampleUniforms, vertexShader: quadVertex, fragmentShader: upsampleFragment,
    transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false
  });
  var upsampleScene = makeFullscreenScene(upsampleMaterial);

  // streak anamórfico (camada cinema): blur horizontal longo em RT
  // pequeno (w/4 × h/16), 2 passadas com alcance crescente; só roda
  // quando o knob streak > 0 — custo zero no default
  var streakRTa = new THREE.WebGLRenderTarget(2,2, {
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat, type: rtType, depthBuffer:false, stencilBuffer:false
  });
  var streakRTb = streakRTa.clone();
  var streakW = 2, streakH = 2;
  var streakUniforms = { tDiffuse:{value:null}, uTexelX:{value:1}, uStride:{value:2} };
  var streakFragment = [
    'uniform sampler2D tDiffuse;',
    'uniform float uTexelX;',
    'uniform float uStride;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 acc = vec3(0.0); float wsum = 0.0;',
    '  for (int i = -8; i <= 8; i++){',
    '    float w = exp(-0.35*abs(float(i)));',
    '    acc += texture2D(tDiffuse, vUv + vec2(float(i)*uTexelX*uStride, 0.0)).rgb * w;',
    '    wsum += w;',
    '  }',
    '  gl_FragColor = vec4(acc/wsum, 1.0);',
    '}'
  ].join('\n');
  var streakMaterial = new THREE.ShaderMaterial({ uniforms: streakUniforms, vertexShader: quadVertex, fragmentShader: streakFragment });
  var streakScene = makeFullscreenScene(streakMaterial);
  function renderStreak(){
    var src = bloomMips[Math.min(1, bloomMips.length-1)];
    streakUniforms.tDiffuse.value = src.rt.texture;
    streakUniforms.uTexelX.value = 1/src.w;
    streakUniforms.uStride.value = 2.0;
    renderer.setRenderTarget(streakRTa);
    renderer.render(streakScene, quadCamera);
    streakUniforms.tDiffuse.value = streakRTa.texture;
    streakUniforms.uTexelX.value = 1/streakW;
    streakUniforms.uStride.value = 8.0;
    renderer.setRenderTarget(streakRTb);
    renderer.render(streakScene, quadCamera);
  }

  function renderBloom(){
    thresholdUniforms.tDiffuse.value = sceneRT.texture;
    thresholdUniforms.uTexel.value.set(1/sceneRT.width, 1/sceneRT.height);
    renderer.setRenderTarget(bloomMips[0].rt);
    renderer.render(thresholdScene, quadCamera);

    for (var i=1;i<bloomMips.length;i++){
      downsampleUniforms.tDiffuse.value = bloomMips[i-1].rt.texture;
      downsampleUniforms.uTexel.value.set(1/bloomMips[i-1].w, 1/bloomMips[i-1].h);
      renderer.setRenderTarget(bloomMips[i].rt);
      renderer.render(downsampleScene, quadCamera);
    }

    for (var j=bloomMips.length-2;j>=0;j--){
      upsampleUniforms.tDiffuse.value = bloomMips[j+1].rt.texture;
      upsampleUniforms.uTexel.value.set(1/bloomMips[j+1].w, 1/bloomMips[j+1].h);
      renderer.setRenderTarget(bloomMips[j].rt);
      renderer.autoClear = false;
      renderer.render(upsampleScene, quadCamera);
      renderer.autoClear = true;
    }
  }

  var BLOOM_BASE0 = isHDR ? 0.62 : 0.55;
  var BLOOM_STRENGTH_BASE = BLOOM_BASE0 * knob('bloom', lk('bloom', 1.0), 0.0, 3.0);
  // camada cinema (ver docs/cinema-sunshine.md): defaults 0 = frame
  // pixel-idêntico ao calibrado; valores em JS p/ gating por toggle
  var VEIL_BASE = knob('veil', lk('veil', 0), 0.0, 1.5);
  var STREAK_K = knob('streak', lk('streak', 0), 0.0, 1.5);
  var ADAPT_K = knob('adapt', lk('adapt', 0), 0.0, 1.0);
  // FASE 1 — starburst de difração no ponto do flare, dirigido pelo
  // brilho HDR REAL que chega à lente (envelope × visibilidade do
  // ponto no hemisfério voltado à câmera). Default 0 = sem efeito.
  var BURST_K = knob('burst', lk('burst', 0), 0.0, 1.5);
  // FASE 2 — a luz como matéria: dispersão espectral do bloom (raios de
  // blur por canal no dual-Kawase, ver downsampleFragment) e halação com
  // peso de temperatura (só as altas QUENTES sangram para o vermelho,
  // ver branch uHal no compFragment). Defaults 0 = frame pixel-idêntico.
  var DISP_K = knob('disp', lk('disp', 0), 0.0, 1.5);
  var HAL_K = knob('hal', lk('hal', 0), 0.0, 1.5);
  // hand: linguagem de câmera do Sunshine — o Sol é filmado em lente
  // longa com deriva lenta e micro-tremor de operador (0.1-0.3 Hz + um
  // harmônico rápido fraco). Soma de senos incomensuráveis = pseudo-
  // perlin sem alocação; média zero, NÃO acumula no estado da câmera.
  var HAND_K = knob('hand', lk('hand', 0), 0.0, 1.5);
  var adaptCur = 1.0;
  var cineProj = new THREE.Vector3();
  // FASE 1: flare em espaço de MUNDO (p/ visibilidade) + projeção do
  // starburst — temporários reutilizados, zero alocação por frame
  var flareWorldTmp = new THREE.Vector3();
  var burstProj = new THREE.Vector3();
  var lastFlareHDR = 0;
  var compUniforms = {
    tScene:{value:null}, tBloom:{value:null}, tVeil:{value:null}, tStreak:{value:null},
    uStreak:{value: 0.0},
    uBloomStrength:{value: BLOOM_STRENGTH_BASE},
    uExposure:{value: EXP0 * knob('exposure', lk('exposure', 1.0), 0.3, 2.5)},
    uSat:{value: knob('sat', 1.0, 0.0, 2.0)},
    uVig:{value: knob('vig', lk('vig', 0.55), 0.0, 1.5)},
    uGrain:{value: knob('grain', lk('grain', 1.0), 0.0, 5.0)},
    uVeil:{value: 0.0},
    // FASE 2 — halação com peso de temperatura (0 = ramo desligado)
    uHal:{value: 0.0},
    uAdapt:{value: 1.0},
    uFringe:{value: knob('fringe', lk('fringe', 0), 0.0, 1.5)},
    uShimmer:{value: knob('shimmer', lk('shimmer', 0), 0.0, 1.5)},
    uTone:{value: knob('tone', lk('tone', 0), 0.0, 1.2)},
    // film: mistura ACES (0) -> AgX (1). AgX desatura as altas de forma
    // gradual — o centro do disco para de "clipar nuclear" e resolve a
    // pendência de recalibração pós-ACES do audit-loop6. Default 0 =
    // pixel-idêntico ao baseline.
    uFilm:{value: knob('film', lk('film', 0), 0.0, 1.0)},
    uCTime:{value: 0.0},
    uSunC:{value: new THREE.Vector2(0.5, 0.5)},
    uSunR:{value: 0.33},
    uAspect:{value: 1.0},
    // FASE 1 — starburst de difração (0 fora de flare/knob desligado)
    uBurst:{value: 0.0},
    uBurstPos:{value: new THREE.Vector2(0.5, 0.5)},
    uBurstRot:{value: 0.0}
  };
  var compFragment = [
    'uniform sampler2D tScene;',
    'uniform sampler2D tBloom;',
    'uniform sampler2D tVeil;',
    'uniform sampler2D tStreak;',
    'uniform float uStreak;',
    'uniform float uBloomStrength;',
    'uniform float uExposure;',
    'uniform float uSat;',
    'uniform float uVig;',
    'uniform float uGrain;',
    'uniform float uVeil;',
    'uniform float uHal;',
    'uniform float uAdapt;',
    'uniform float uFringe;',
    'uniform float uShimmer;',
    'uniform float uTone;',
    'uniform float uFilm;',
    'uniform float uCTime;',
    'uniform vec2 uSunC;',
    'uniform float uSunR;',
    'uniform float uAspect;',
    'uniform float uBurst;',
    'uniform vec2 uBurstPos;',
    'uniform float uBurstRot;',
    'varying vec2 vUv;',
    'vec3 ACESFilm(vec3 x){',
    '  float a=2.51; float b=0.03; float c=2.43; float d=0.59; float e=0.14;',
    '  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);',
    '}',
    // AgX (fit polinomial de B. Wrensch sobre o AgX de T. Sobotka): curva
    // de resposta tipo filme com rolloff suave nas altas. Como o pipeline
    // grava direto no canvas (o ACES acima também embute o "gamma"), o
    // resultado fica no espaço codificado do AgX base — comparável ao ACES.
    'vec3 agxContrast(vec3 x){',
    '  vec3 x2 = x*x; vec3 x4 = x2*x2;',
    '  return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232;',
    '}',
    'vec3 AgXFilm(vec3 val){',
    '  const mat3 agx_mat = mat3(',
    '    0.842479062253094, 0.0423282422610123, 0.0423756549057051,',
    '    0.0784335999999992, 0.878468636469772, 0.0784336,',
    '    0.0792237451477643, 0.0791661274605434, 0.879142973793104);',
    '  const mat3 agx_mat_inv = mat3(',
    '    1.19687900512017, -0.0528968517574562, -0.0529716355144438,',
    '    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,',
    '    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);',
    '  const float min_ev = -12.47393;',
    '  const float max_ev = 4.026069;',
    '  val = agx_mat * val;',
    '  val = clamp(log2(max(val, vec3(1e-10))), min_ev, max_ev);',
    '  val = (val - min_ev) / (max_ev - min_ev);',
    '  val = agxContrast(val);',
    // outset (inversa do inset): devolve a saturação que o inset guardou;
    // sem isto o resultado fica leitoso/dessaturado
    '  val = agx_mat_inv * val;',
    '  return clamp(val, 0.0, 1.0);',
    '}',
    'float hash12(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), f.x),',
    '             mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y);',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    // heat-haze: anel logo além do limbo, noise subindo (ar quente);
    // nunca toca o interior do disco (fibrilas ficam estáveis)
    '  if (uShimmer > 0.001){',
    '    vec2 rel = (uv - uSunC) * vec2(uAspect, 1.0);',
    '    float rr = length(rel) / max(uSunR, 1e-4);',
    '    float band = smoothstep(1.0, 1.06, rr) * (1.0 - smoothstep(1.10, 1.45, rr));',
    '    if (band > 0.001){',
    '      vec2 np = uv * vec2(90.0, 60.0) + vec2(0.0, -uCTime*1.6);',
    '      vec2 wob = vec2(vnoise(np) - 0.5, vnoise(np + 17.7) - 0.5);',
    '      uv += wob * (band * uShimmer * 0.006);',
    '    }',
    '  }',
    '  vec3 sceneCol = texture2D(tScene, uv).rgb;',
    // aberração cromática lateral da lente: cresce com o ângulo de
    // campo (zero no centro), como vidro real — franja no limbo e nas
    // estrelas sem depender de máscara de luminância
    // CA espectral em 6 taps (antes: 3 amostras discretas R/G/B — o G
    // "parado" criava um rebordo VERDE sólido no limbo com fringe>=0.5,
    // porque em toda borda clara/escura o G segue inteiro onde o R já
    // caiu). O smear radial com pesos de arco-íris (R no extremo externo,
    // G no meio, B no interno, normalizados por canal) dissolve a borda
    // num gradiente espectral contínuo, como numa lente real.
    '  if (uFringe > 0.001){',
    '    vec2 rc = uv - 0.5;',
    '    vec2 off = rc * ((0.006 + 0.020*dot(rc, rc)) * uFringe);',
    '    vec3 accCA = vec3(0.0); vec3 wsumCA = vec3(0.0);',
    '    for (int i = 0; i < 6; i++){',
    '      float t = float(i)/5.0 - 0.5;',
    '      vec3 w = vec3(max(0.0, 0.5 + t), 1.0 - abs(t)*2.0, max(0.0, 0.5 - t));',
    '      accCA += texture2D(tScene, uv + off*(t*2.0)).rgb * w;',
    '      wsumCA += w;',
    '    }',
    '    sceneCol = accCA / max(wsumCA, vec3(1e-4));',
    '  }',
    '  vec3 bloomCol = texture2D(tBloom, uv).rgb;',
    '  vec3 color = (sceneCol + bloomCol*uBloomStrength) * (uExposure * uAdapt);',
    // halação/veiling glare: o mip mais largo do dual-Kawase lava as
    // sombras ao redor do disco ("knife edge" do Sunshine)
    '  if (uVeil > 0.001){',
    '    color += texture2D(tVeil, uv).rgb * (uVeil * 0.55) * uExposure * uAdapt;',
    '  }',
    // FASE 2 — halação com peso de temperatura (corpo negro): no filme a
    // camada anti-halation absorve o λ curto; o que sangra de volta pela
    // base é o VERMELHO. Peso = excesso espectral de R no mip largo —
    // plage (1.0,0.70,0.32) e limbo quente (1.0,0.30,0.10) pesam muito,
    // altas NEUTRAS pesam ~0. As fontes quentes avermelham a vizinhança;
    // o veil neutro acima continua intocado (uHal=0 ⇒ ramo morto).
    '  if (uHal > 0.001){',
    '    vec3 hv = texture2D(tVeil, uv).rgb;',
    '    float hw = max(hv.r - 0.5*(hv.g + hv.b), 0.0);',
    '    color += vec3(1.0, 0.38, 0.14) * (hw * uHal * 0.9) * uExposure * uAdapt;',
    '  }',
    // streak anamórfico: risco horizontal frio (assinatura de lente
    // anamórfica; os flares do Sunshine eram de lente REAL)
    '  if (uStreak > 0.001){',
    '    color += texture2D(tStreak, uv).rgb * (uStreak * 0.70) * vec3(0.80,0.88,1.12) * uExposure * uAdapt;',
    '  }',
    // FASE 1 — starburst de difração das lâminas da íris, cravado na
    // POSIÇÃO PROJETADA do flare: 6 braços |cos(3θ)|^n com alcance
    // ESPECTRAL (difração ∝ λ — o R alcança mais longe que o B, ponta
    // avermelhada como em lente real) + núcleo quente. uBurst já chega
    // multiplicado pelo brilho HDR real do flare (JS): flare atrás do
    // limbo => 0 => a lente não inventa luz que não recebeu.
    '  if (uBurst > 0.001){',
    '    vec2 relB = (vUv - uBurstPos) * vec2(uAspect, 1.0);',
    '    float rB = length(relB);',
    '    float angB = atan(relB.y, relB.x);',
    '    float arms = pow(abs(cos((angB - uBurstRot)*3.0)), 18.0);',
    '    vec3 armFall = exp(vec3(-5.0, -7.5, -11.0) * rB);',
    '    vec3 burst = vec3(1.0, 0.72, 0.45) * arms * armFall;',
    '    burst += vec3(1.0, 0.85, 0.62) * exp(-rB*30.0);',
    '    color += burst * (uBurst * 0.85) * uExposure * uAdapt;',
    '  }',
    '  vec3 aces = ACESFilm(color);',
    '  color = (uFilm > 0.001) ? mix(aces, AgXFilm(color), uFilm) : aces;',
    '  color = mix(vec3(dot(color, vec3(0.299,0.587,0.114))), color, uSat);',
    // split-tone Sunshine: sombras frias, altas douradas (contraste
    // ouro-vs-frio de Boyle/Küchler dentro do mesmo frame)
    '  if (uTone > 0.001){',
    '    float tl = dot(color, vec3(0.299,0.587,0.114));',
    '    vec3 tint = mix(vec3(0.82,0.90,1.10), vec3(1.08,1.00,0.86), smoothstep(0.10, 0.65, tl));',
    '    color *= mix(vec3(1.0), tint, uTone);',
    '  }',
    // vinheta cinematográfica sutil
    '  vec2 vc = vUv - 0.5;',
    '  color *= 1.0 - dot(vc, vc)*uVig;',
    // dithering só nas áreas ESCURAS (céu/coroa, onde há banding);
    // no disco ele viraria chuvisco isotrópico sobre as fibrilas
    '  float dith = smoothstep(0.30, 0.06, dot(color, vec3(0.3333)));',
    '  color += (hash12(gl_FragCoord.xy) - 0.5) * (1.6/255.0) * dith * uGrain;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
  var compMaterial = new THREE.ShaderMaterial({ uniforms: compUniforms, vertexShader: quadVertex, fragmentShader: compFragment });
  var compScene = makeFullscreenScene(compMaterial);

  function resizeTargets(){
    var w = Math.max(2, Math.floor(window.innerWidth*pixelRatio));
    var h = Math.max(2, Math.floor(window.innerHeight*pixelRatio));
    sceneRT.setSize(w, h);
    var bw = Math.max(2, Math.floor(w/2));
    var bh = Math.max(2, Math.floor(h/2));
    for (var i=0;i<bloomMips.length;i++){
      bloomMips[i].rt.setSize(bw, bh);
      bloomMips[i].w = bw; bloomMips[i].h = bh;
      bw = Math.max(2, Math.floor(bw/2));
      bh = Math.max(2, Math.floor(bh/2));
    }
    streakW = Math.max(2, Math.floor(w/4));
    streakH = Math.max(2, Math.floor(h/16));
    streakRTa.setSize(streakW, streakH);
    streakRTb.setSize(streakW, streakH);
  }

  // ---------------------------------------------------------------
  // Controles de câmera (arraste/1 dedo = orbita; roda/2 dedos = zoom)
  // ---------------------------------------------------------------
  var V_HALF_FOV = (42 * Math.PI / 180) / 2;
  var R_FIT = SUN_RADIUS * 1.15;

  function computeFitDist(){
    var aspect = window.innerWidth / window.innerHeight;
    var d = R_FIT / Math.tan(V_HALF_FOV);
    d *= Math.max(1, 1 / aspect);
    return d;
  }

  var theta = Math.PI*0.62, phi = Math.PI*0.42;
  var thetaVel = 0, phiVel = 0;          // inércia do giro (rad/s)
  var fitDist = computeFitDist();
  var camDist = fitDist;
  var targetCamDist = fitDist;           // zoom amortecido: camDist persegue este alvo
  var minDist = SUN_RADIUS*1.5, maxDist = 30;
  var lastInteraction = 0;

  var pointers = new Map();
  var rotLast = null;
  var rotId = null;
  var pinchPrevDist = 0;
  var flingSamples = [];

  function updateCamera(){
    var th = theta, ph = phi;
    // offsets de "mão" aplicados só na POSE do frame (theta/phi reais
    // ficam intactos: soltar o knob volta exatamente ao enquadramento)
    if (HAND_K > 0.001){
      var ht = elapsed || 0;
      th += HAND_K*(0.0042*Math.sin(ht*0.291) + 0.0023*Math.sin(ht*0.833+1.7) + 0.0008*Math.sin(ht*2.31+0.4));
      ph += HAND_K*(0.0031*Math.sin(ht*0.247+0.9) + 0.0017*Math.sin(ht*0.911+2.6) + 0.0007*Math.sin(ht*2.73+1.2));
    }
    var sp = Math.sin(ph);
    camera.position.set(
      camDist*sp*Math.cos(th),
      camDist*Math.cos(ph),
      camDist*sp*Math.sin(th)
    );
    camera.lookAt(0,0,0);
  }

  function pointerDistance(){
    var pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    var dx = pts[0].x - pts[1].x;
    var dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function onPointerDown(e){
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch(_){}
    if (pointers.size === 1){
      rotId = e.pointerId;
      rotLast = { x: e.clientX, y: e.clientY };
      thetaVel = 0; phiVel = 0;
      flingSamples.length = 0;
      // gesto do HUD: dispara se o dedo ficar parado até o timer vencer
      hudDown = { x: e.clientX, y: e.clientY };
      clearTimeout(hudTimer);
      hudTimer = setTimeout(function(){
        if (hudDown && pointers.size === 1) hudToggle();
      }, 1000);
    } else if (pointers.size === 2){
      rotId = null; rotLast = null;
      pinchPrevDist = pointerDistance();
      hudDown = null; clearTimeout(hudTimer);
    }
    lastInteraction = performance.now();
  }

  function onPointerMove(e){
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (hudDown && (Math.abs(e.clientX - hudDown.x) > 9 ||
                    Math.abs(e.clientY - hudDown.y) > 9)){
      hudDown = null; clearTimeout(hudTimer);
    }

    if (pointers.size >= 2){
      var d = pointerDistance();
      if (pinchPrevDist > 0 && d > 0){
        targetCamDist *= pinchPrevDist / d;
        targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
      }
      pinchPrevDist = d;
      lastInteraction = performance.now();
      return;
    }

    if (e.pointerId === rotId && rotLast){
      var dx = e.clientX - rotLast.x;
      var dy = e.clientY - rotLast.y;
      rotLast.x = e.clientX; rotLast.y = e.clientY;
      // semântica "agarrar o globo" (Google Earth/Maps): a superfície
      // acompanha o dedo nos DOIS eixos. Antes o horizontal era invertido
      // (câmera orbitava no sentido do dedo => superfície ia ao contrário)
      // enquanto o vertical já acompanhava — eixos misturados.
      var dth = dx*0.0055;
      var dph = -dy*0.0055;
      theta += dth;
      phi   += dph;
      phi = Math.max(0.18, Math.min(Math.PI-0.18, phi));
      // velocidade instantânea (suavizada) para o "arremesso" ao soltar
      var nowT = performance.now();
      var dtv = Math.max(0.008, (nowT - (onPointerMove._t || nowT-16))/1000);
      onPointerMove._t = nowT;
      thetaVel = thetaVel*0.65 + (dth/dtv)*0.35;
      phiVel   = phiVel*0.65   + (dph/dtv)*0.35;
      // janela p/ estimar o fling no soltar por deslocamento acumulado:
      // robusto a stalls de frame (o estimador acima despenca se um único
      // intervalo entre eventos vier longo). Usa o timestamp do EVENTO:
      // reflete o ritmo real do gesto mesmo com a thread principal travada
      var evT = (e.timeStamp && e.timeStamp > 0) ? e.timeStamp : nowT;
      flingSamples.push({ t: evT, th: theta, ph: phi });
      if (flingSamples.length > 12) flingSamples.shift();
      lastInteraction = nowT;
    }
  }

  function endPointer(e){
    if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
    hudDown = null; clearTimeout(hudTimer);
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch(_){}
    if (pointers.size === 1){
      var remaining = pointers.entries().next().value;
      rotId = remaining[0];
      rotLast = { x: remaining[1].x, y: remaining[1].y };
      pinchPrevDist = 0;
    } else if (pointers.size === 0){
      rotId = null; rotLast = null; pinchPrevDist = 0;
      // fling pela janela de deslocamento (~180ms): pega a amostra mais
      // antiga ainda recente e deriva a velocidade média — não depende do
      // espaçamento dos eventos individuais
      var nowE = performance.now();
      var nS = flingSamples.length;
      if (nS >= 2){
        var newest = flingSamples[nS-1];
        var pick = null;
        for (var fi = 0; fi < nS; fi++){
          if (nowE - flingSamples[fi].t <= 180){ pick = flingSamples[fi]; break; }
        }
        // eventos muito espaçados (máquina lenta/stall): a janela só contém
        // a última amostra (deslocamento zero) — usa a penúltima, que
        // carrega a última perna real do gesto
        if (pick === null || pick === newest) pick = flingSamples[nS-2];
        if (pick !== newest){
          var dtF = Math.max(0.016, (newest.t - pick.t)/1000);
          thetaVel = (newest.th - pick.th)/dtF;
          phiVel   = (newest.ph - pick.ph)/dtF;
        }
      }
      // com 0-1 amostras, fica o estimador suavizado do arraste
      flingSamples.length = 0;
    }
    lastInteraction = performance.now();
  }

  function onWheel(e){
    e.preventDefault();
    targetCamDist += e.deltaY*0.0035*targetCamDist;
    targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
    lastInteraction = performance.now();
  }

  // ---- polimento AAA de controles ----
  // duplo clique / toque duplo: alterna entre enquadramento e close-up
  function toggleFrame(){
    var closeDist = Math.max(minDist*1.12, fitDist*0.42);
    targetCamDist = (targetCamDist > fitDist*0.72) ? closeDist : fitDist;
    lastInteraction = performance.now();
  }
  var lastTap = { t: -1e9, x: 0, y: 0 };
  function onTapCheck(e){
    if (e.pointerType !== 'touch') return;
    var now = performance.now();
    var dx = e.clientX - lastTap.x, dy = e.clientY - lastTap.y;
    if (now - lastTap.t < 320 && (dx*dx + dy*dy) < 32*32){
      toggleFrame();
      lastTap.t = -1e9;
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  // teclado: setas giram (com a mesma inércia do arraste), +/- aproxima,
  // R volta ao enquadramento — acessível sem mouse
  function onKeyDown(e){
    var k = e.key;
    var handled = true;
    // passo imediato + impulso de inércia: responde já no keydown mesmo
    // se o próximo frame demorar (máquinas lentas), sem mudar o "feel"
    if (k === 'ArrowLeft')       { thetaVel += 2.0; theta += 0.08; }
    else if (k === 'ArrowRight') { thetaVel -= 2.0; theta -= 0.08; }
    else if (k === 'ArrowUp')    { phiVel   -= 1.5; phi = Math.max(0.18, phi - 0.06); }
    else if (k === 'ArrowDown')  { phiVel   += 1.5; phi = Math.min(Math.PI-0.18, phi + 0.06); }
    else if (k === '+' || k === '=') targetCamDist = Math.max(minDist, targetCamDist*0.82);
    else if (k === '-' || k === '_') targetCamDist = Math.min(maxDist, targetCamDist*1.22);
    else if (k === 'r' || k === 'R') targetCamDist = fitDist;
    else handled = false;
    if (handled){
      e.preventDefault();
      lastInteraction = performance.now();
    }
  }

  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', function(e){
    renderer.domElement.style.cursor = 'grabbing';
    onPointerDown(e);
    onTapCheck(e);
  });
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', function(e){
    renderer.domElement.style.cursor = 'grab';
    endPointer(e);
  });
  renderer.domElement.addEventListener('pointercancel', endPointer);
  renderer.domElement.addEventListener('lostpointercapture', endPointer);
  renderer.domElement.addEventListener('wheel', onWheel, {passive:false});
  renderer.domElement.addEventListener('dblclick', function(e){ e.preventDefault(); toggleFrame(); });
  renderer.domElement.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  window.addEventListener('keydown', onKeyDown);

  // ---------------------------------------------------------------
  // Instrumentação de performance: ring de ~4s de intervalos frame-a-
  // frame e de custo CPU do corpo do animate; draw calls acumulados
  // por FRAME (autoReset off + reset manual — com bloom/bake/sim o
  // frame tem vários render() e o autoReset só mostraria o último);
  // bakes/s numa janela de 5s. Toggles de subsistema para o profiler
  // medir custo por A/B sem recarregar.
  // ---------------------------------------------------------------
  renderer.info.autoReset = false;
  var perfFrameMs = new Float32Array(240);
  var perfBusyMs  = new Float32Array(240);
  var perfIdx = 0, perfN = 0, perfLastT = 0, perfCalls = 0;
  var perfBakes = [];
  var subToggle = { sim:true, bake:true, bloom:true, spicules:true,
                    corona:true, prominences:true, stars:true, loops:true };

  // HUD de perf on-device: ?hud=1 liga na carga; segurar um dedo PARADO
  // ~1s alterna (o arquivo aberto localmente no iPhone não tem como
  // receber query string nem abrir console — o gesto resolve os dois).
  var hudEl = document.createElement('div');
  hudEl.style.cssText = 'position:fixed;top:10px;right:10px;z-index:40;' +
    'font:11px/1.5 ui-monospace,Menlo,monospace;color:#aef;' +
    'background:rgba(0,10,20,0.55);padding:6px 9px;border-radius:8px;' +
    'pointer-events:none;white-space:pre;display:none';
  document.body.appendChild(hudEl);
  var hudOn = urlQ.hud === '1';
  if (hudOn) hudEl.style.display = 'block';
  var hudTimer = 0, hudDown = null, hudAccum = 0;
  function hudToggle(){ hudOn = !hudOn; hudEl.style.display = hudOn ? 'block' : 'none'; }

  // ---------------------------------------------------------------
  // T3.2: auto-tune em runtime. Trocar o TIER ao vivo exigiria
  // reconstruir shaders e render targets; o que é barato mudar é a
  // ESCALA de render (pixelRatio -> canvas + sceneRT + bloom; sim e
  // bake têm tamanho fixo e não mudam de cara). Então: p95 do frame
  // acima de 18ms desce a escala 1.0 -> 0.85 -> 0.7; p95 < 9ms
  // sustentado por 10s sobe de volta (histerese pelos degraus + janela
  // limpa a cada troca). Nos EXTREMOS, persiste uma recomendação de
  // tier no localStorage para a PRÓXIMA carga — assim um aparelho que
  // não segura nem 0.7 abre direto num tier menor, e um que sobra
  // fôlego por 30s no teto abre num maior.
  // ---------------------------------------------------------------
  var SCALE_STEPS = [1.0, 0.85, 0.7];
  var baseDpr = pixelRatio;
  var scaleIdx = 0, tuneWin = [], tuneGoodT = 0, tuneCooldown = 0, tuneEvents = 0;
  var autoTuneOn = (urlQ.tune === '1') ||
                   (!urlQ.tier && !(parseFloat(urlQ.scale) > 0) && !isSoftwareGL);
  function applyRenderScale(i){
    scaleIdx = Math.max(0, Math.min(SCALE_STEPS.length-1, i));
    pixelRatio = baseDpr * SCALE_STEPS[scaleIdx];
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    tuneEvents++;
  }
  function persistTier(t){ try { localStorage.setItem('solTier', t); } catch(e){} }
  var TIER_ORDER = ['low', 'mid', 'high', 'ultra'];
  // Alvos por classe de aparelho: no desktop degrada acima de 18ms p95
  // (~55fps) como antes; no móvel o compromisso decidido é OUTRO — piso
  // de 24fps (42ms p95): o aparelho segura o tier/escala enquanto estiver
  // acima disso em vez de se rebaixar até o low para perseguir 60.
  var TUNE_HI = coarsePointer ? 42 : 18;
  var TUNE_LO = coarsePointer ? 21 : 9;
  function autoTune(delta, frameMs){
    // aba em background/stall: rAF é estrangulado a ~1fps e o p95 iria
    // rebaixar (e persistir!) um tier por culpa do navegador, não da GPU.
    // ?tune=1 (opt-in de QA) relaxa a guarda: sob SwiftShader TODO frame
    // passa de 250ms e o teste do auto-tune ficava inerte.
    if ((frameMs > 250 || document.hidden) && urlQ.tune !== '1') return;
    tuneWin.push(frameMs);
    if (tuneWin.length > 150) tuneWin.shift();
    tuneCooldown -= delta;
    if (tuneWin.length < 30 || tuneCooldown > 0) return;
    var a = tuneWin.slice().sort(function(x, y){ return x - y; });
    var p95 = a[Math.floor(a.length*0.95)];
    if (p95 > TUNE_HI){
      tuneGoodT = 0;
      if (scaleIdx < SCALE_STEPS.length-1){
        applyRenderScale(scaleIdx+1);
        tuneCooldown = 4; tuneWin.length = 0;
      } else {
        var k = TIER_ORDER.indexOf(TIER);
        if (k > 0){ persistTier(TIER_ORDER[k-1]); tuneCooldown = 1e9; }
      }
    } else if (p95 < TUNE_LO){
      tuneGoodT += delta;
      if (scaleIdx > 0 && tuneGoodT > 10){
        applyRenderScale(scaleIdx-1);
        tuneGoodT = 0; tuneCooldown = 6; tuneWin.length = 0;
      } else if (scaleIdx === 0 && tuneGoodT > 30){
        var k2 = TIER_ORDER.indexOf(TIER);
        // ultra é só para ponteiro fino (desktop): DPR 3 + malha 192
        // afogariam um celular que por acaso sustente 60 no high
        var kMax = coarsePointer ? 2 : TIER_ORDER.length - 1;
        if (k2 < kMax && !urlQ.tier){ persistTier(TIER_ORDER[k2+1]); }
        tuneGoodT = -1e9;   // uma recomendação por sessão
      }
    } else tuneGoodT = 0;
  }

  // estado exposto para QA automatizado (leitura + posicionamento de câmera)
  try {
    if (window.__solInfo){
      window.__solInfo.perf = function(){
        function stats(buf, n){
          if (!n) return { avg: 0, p95: 0 };
          var a = Array.prototype.slice.call(buf, 0, n).sort(function(x,y){ return x-y; });
          var s = 0; for (var i=0;i<n;i++) s += a[i];
          return { avg: +(s/n).toFixed(2),
                   p95: +a[Math.min(n-1, Math.floor(n*0.95))].toFixed(2) };
        }
        var now = performance.now();
        while (perfBakes.length && now - perfBakes[0] > 5000) perfBakes.shift();
        var f = stats(perfFrameMs, perfN);
        return { tier: TIER, scale: RENDER_SCALE, dpr: pixelRatio,
                 autoScale: SCALE_STEPS[scaleIdx],
                 tune: { on: autoTuneOn, events: tuneEvents },
                 frames: perfN, ms: f, busy: stats(perfBusyMs, perfN),
                 fps: f.avg > 0 ? +(1000/f.avg).toFixed(1) : 0,
                 calls: perfCalls, bakesPerSec: +(perfBakes.length/5).toFixed(2),
                 toggles: JSON.parse(JSON.stringify(subToggle)),
                 size: [renderer.domElement.width, renderer.domElement.height] };
      };
      // painel de knobs ativos (introspecção p/ QA e usuário)
      window.__solInfo.knobs = function(){
        return { speed: TIME_SCALE, idle: IDLE_CINE,
                 bloom: compUniforms.uBloomStrength.value, bloomth: BLOOM_THRESHOLD,
                 exposure: compUniforms.uExposure.value, sat: compUniforms.uSat.value,
                 vig: compUniforms.uVig.value, grain: compUniforms.uGrain.value,
                 plageglow: sunUniforms.uPlageEm.value,
                 halo: coronaRaysUniforms.uHalo.value, ray: coronaRaysUniforms.uRayBoost.value,
                 cact: coronaRaysUniforms.uActGain.value,
                 mw: milkyWay.material.opacity, stars: stars.material.opacity,
                 veil: VEIL_BASE, streak: STREAK_K, adapt: ADAPT_K,
                 fringe: compUniforms.uFringe.value,
                 shimmer: compUniforms.uShimmer.value,
                 tone: compUniforms.uTone.value,
                 film: compUniforms.uFilm.value,
                 pmode: sunUniforms.uPmode.value,
                 hand: HAND_K,
                 loops: LOOP_K,
                 burst: BURST_K,
                 adaptMul: compUniforms.uAdapt.value,
                 look: LOOK ? 'sunshine' : '' };
      };
      window.__solInfo.perfReset = function(){
        perfN = 0; perfIdx = 0; perfLastT = 0; perfBakes.length = 0;
      };
      // liga/desliga um subsistema (A/B de custo); sem argumento inverte;
      // nome desconhecido devolve a lista de nomes válidos
      window.__solInfo.toggle = function(name, on){
        if (!(name in subToggle)) return Object.keys(subToggle);
        subToggle[name] = (on === undefined) ? !subToggle[name] : !!on;
        spiculeMesh.visible = subToggle.spicules;
        coronaRays.visible = coronaOuter.visible = subToggle.corona;
        prominenceGroup.visible = subToggle.prominences;
        stars.visible = brightStars.visible = milkyWay.visible = mwNeb.visible = subToggle.stars;
        return subToggle[name];
      };
      window.__solInfo.state = function(){
        return { camDist: camDist, targetCamDist: targetCamDist, theta: theta, phi: phi,
                 thetaVel: thetaVel, phiVel: phiVel,
                 rotY: sunMesh.rotation.y, fitDist: fitDist, minDist: minDist };
      };
      window.__solInfo.regions = function(){
        return pairStates.map(function(ps){
          return { lead: [ps.lead.x, ps.lead.y, ps.lead.z], w: ps.lead.w, baseQ: ps.baseQ };
        });
      };
      window.__solInfo.prominences = function(){
        return prominenceMeshes.map(function(m){
          var d = m.userData.dir;
          return [d.x, d.y, d.z];
        });
      };
      // QA do ciclo de vida: ler fase (x em 0..1) e envelope de cada
      // proeminência, e SALTAR uma proeminência para um ponto do ciclo
      // (fotografar nascimento/maturidade/colapso sem esperar minutos)
      window.__solInfo.promLife = function(){
        return promStates.map(function(ps){
          var lx = ((elapsed + ps.phase) % ps.period) / ps.period;
          var d = ps.meshes[0].userData.dir;
          return { x: lx, env: lifeEnvelope(lx), dir: [d.x, d.y, d.z] };
        });
      };
      window.__solInfo.setPromLife = function(i, x){
        var ps = promStates[i];
        ps.phase = ((x*ps.period - elapsed) % ps.period + ps.period) % ps.period;
      };
      // QA: sob SwiftShader um screenshot leva 10-35s e o Sol giraria até
      // ~84° entre a mira e o frame capturado (a proeminência mirada some
      // p/ dentro do disco ou atrás do limbo). Congelar/ajustar a rotação
      // torna a captura determinística sem tocar no resto da animação.
      window.__solInfo.setRotSpeed = function(v){ ROT_SPEED = v; };
      // QA: posição de TELA da âncora da proeminência i (px) + fatores de
      // intensidade correntes dos dois cartões — tira a ambiguidade de
      // "qual mancha na foto é o alvo" nas sessões de órbita
      window.__solInfo.projectProm = function(i){
        var ps = promStates[i];
        var w = ps.meshes[0].userData.dir.clone()
          .applyQuaternion(prominenceGroup.quaternion).multiplyScalar(SUN_RADIUS);
        // matrizes frescas: sob SwiftShader (~1fps) a leitura logo após
        // setView pegava matrixWorldInverse do frame ANTERIOR
        camera.updateMatrixWorld(true);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        var v = w.project(camera);
        return { x: (v.x*0.5 + 0.5) * window.innerWidth,
                 y: (1.0 - (v.y*0.5 + 0.5)) * window.innerHeight,
                 inFront: v.z < 1.0,
                 env: ps.env, fieldK: ps.fieldK,
                 uInt: ps.meshes.map(function(m){ return m.material.uniforms.uIntensity.value; }) };
      };
      // QA (calibração): força do campo e fatores aplicados por proeminência
      window.__solInfo.promField = function(){
        return promStates.map(function(ps){
          return { Bm: bFieldJS(ps.meshes[0].userData.dir).length(),
                   fieldK: ps.fieldK, agit: ps.agit || 0 };
        });
      };
      // QA: fixa a agitação num valor (fotografia determinística — sob
      // SwiftShader o tempo simulado corre ~10-20x mais devagar e o
      // envelope natural nunca coincide com o instante do screenshot)
      window.__solInfo.holdPromAgit = function(i, v){
        promStates[i].agitHold = (v == null) ? null : v;
      };
      // QA: dispara um flare de superfície na âncora da proeminência i
      // (testa a interação flare->proeminência sem esperar o cooldown)
      window.__solInfo.forceFlareAt = function(i){
        surfFlareDir.copy(promStates[i].meshes[0].userData.dir).normalize();
        surfFlareT = 0;
        surfFlareAmp = 1.2;   // QA: o gatilho natural seta via |w|; o forçado usa amp fixa
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        return !!agitateNearestProm(surfFlareDir);
      };
      // QA FASE 1: flare no ponto MÉDIO do par i — o mesmo alvo do
      // gatilho natural (é onde a arcada fecha compacta; forceFlareAt
      // ancora em PIL de sol calmo, onde pode nem haver arcada)
      window.__solInfo.forceFlarePair = function(i){
        var ps = pairStates[i];
        surfFlareDir.set(
          (ps.lead.x + ps.foll.x)*0.5,
          (ps.lead.y + ps.foll.y)*0.5,
          (ps.lead.z + ps.foll.z)*0.5).normalize();
        surfFlareT = 0;
        surfFlareAmp = 1.2;
        setFlareFrame(surfFlareDir);
        scheduleFlareArcade();
        agitateNearestProm(surfFlareDir);
        return [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z];
      };
      // QA FASE 1: sob ?det&hold o tempo congela (delta=0) e surfFlareT
      // não avança — fixar o relógio do flare fotografa qualquer fase
      // (impulsiva/gradual) de forma determinística
      window.__solInfo.setFlareClock = function(t){ surfFlareT = t; };
      window.__solInfo.flareInfo = function(){
        return { t: surfFlareT, amp: surfFlareAmp,
                 imp: flareEnvImp(surfFlareT), grad: flareEnvGrad(surfFlareT),
                 sep: sunUniforms.uFlareGeo.value.w,
                 dir: [surfFlareDir.x, surfFlareDir.y, surfFlareDir.z],
                 tan: [flareTanDir.x, flareTanDir.y, flareTanDir.z],
                 hdr: lastFlareHDR, burst: compUniforms.uBurst.value,
                 disp: DISP_K, hal: compUniforms.uHal.value };
      };
      // QA FASE 1: estado dos loops coronais (traçados, arcada viva,
      // custo acumulado do traçador) e salto de fase p/ fotografia
      window.__solInfo.loopInfo = function(){
        var nOk = 0, nArc = 0, i;
        for (i = 0; i < LOOP_AMB; i++) if (loopStatesA[i].ok) nOk++;
        for (i = 0; i < LOOP_ARC; i++) if (arcStates[i].ok && loopEnvArr[LOOP_AMB+i] > 0.004) nArc++;
        return { on: LOOP_K, amb: nOk, arc: nArc, queue: arcQueueN,
                 visible: loopMesh.visible,
                 traces: loopStats.traces, fails: loopStats.fails,
                 ms: +loopStats.ms.toFixed(2) };
      };
      window.__solInfo.setLoopLife = function(i, x){
        var st = loopStatesA[i];
        if (st && st.ok) st.age = x*st.period;
      };
      // QA T1.1: modo/candidatos da última amostragem de PIL, leitura do
      // Br evoluído numa direção, e re-amostragem forçada de uma slot
      window.__solInfo.pilInfo = function(){
        return { mode: pilStats.mode, candidates: pilStats.candidates };
      };
      window.__solInfo.brEvAt = function(dx, dy, dz){
        refreshPILBuffer();
        var lon = Math.atan2(dz, dx); if (lon < 0) lon += Math.PI*2;
        var lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        var x = Math.floor(lon/(Math.PI*2)*PIL_W);
        var y = Math.floor((lat/Math.PI + 0.5)*PIL_H);
        return { br: pilBrAt(x, y),
                 crossLon: pilBrAt(x-2, y)*pilBrAt(x+2, y) < 0.0,
                 crossLat: pilBrAt(x, y-2)*pilBrAt(x, y+2) < 0.0 };
      };
      window.__solInfo.resampleProm = function(i){
        var a = sampleProminenceAnchor();
        placeProminence(promStates[i], a);
        return { dir: [a.x, a.y, a.z], mode: pilStats.mode,
                 candidates: pilStats.candidates, aligned: !!a.pilTangent };
      };
      window.__solInfo.setView = function(th, ph, dist){
        theta = th; phi = Math.max(0.18, Math.min(Math.PI-0.18, ph));
        targetCamDist = camDist = Math.max(minDist, Math.min(maxDist, dist));
        thetaVel = 0; phiVel = 0;
        lastInteraction = performance.now();
        updateCamera();
      };
    }
  } catch(_){}


  // ---------------------------------------------------------------
  // PAINEL DE AJUSTES (drawer): sliders para os knobs cinematográficos,
  // com persistência em localStorage — no iPhone via arquivo local não
  // há query string, então o painel é o caminho principal de ajuste.
  // Prioridade: URL > painel salvo > default. Design: vidro fosco com
  // acento solar, coerente com a estética da cena.
  // ---------------------------------------------------------------
  (function buildKnobPanel(){
    var css = document.createElement('style');
    css.textContent = [
      '#knobBtn{position:fixed;right:14px;bottom:14px;z-index:45;width:44px;height:44px;',
      ' border-radius:50%;border:1px solid rgba(255,170,90,.28);color:#ffb877;font-size:18px;',
      ' background:rgba(12,16,26,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      ' display:flex;align-items:center;justify-content:center;cursor:pointer;',
      ' transition:transform .5s cubic-bezier(.22,1,.36,1),background .3s;user-select:none;-webkit-user-select:none}',
      '#knobBtn:hover{background:rgba(40,28,16,.72)}',
      '#hint{margin-right:64px}',
      '#knobBtn.open{transform:rotate(120deg)}',
      '#knobPanel{position:fixed;top:0;right:0;height:100%;width:min(330px,86vw);z-index:44;',
      ' background:linear-gradient(165deg,rgba(15,18,28,.82),rgba(7,9,15,.90));',
      ' backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25);',
      ' border-left:1px solid rgba(255,165,80,.14);box-shadow:-28px 0 70px rgba(0,0,0,.5);',
      ' transform:translateX(106%);transition:transform .55s cubic-bezier(.22,1,.36,1);',
      ' overflow-y:auto;overscroll-behavior:contain;padding:24px 22px 96px;box-sizing:border-box;',
      ' color:#e9e4da;touch-action:pan-y;font-family:inherit}',
      '#knobPanel.open{transform:translateX(0)}',
      '#knobPanel h2{margin:0 0 2px;font-size:15px;font-weight:600;letter-spacing:.04em;color:#ffd9a8}',
      '#knobPanel .sub{font-size:10.5px;color:rgba(233,228,218,.42);margin:0 0 14px}',
      '#knobPanel .sec{margin:20px 0 6px;font-size:9.5px;font-weight:600;letter-spacing:.22em;',
      ' text-transform:uppercase;color:rgba(255,160,80,.55)}',
      '#knobPanel .row{margin:10px 0 2px}',
      '#knobPanel .lab{display:flex;justify-content:space-between;font-size:12px;color:rgba(233,228,218,.85)}',
      '#knobPanel .val{font-variant-numeric:tabular-nums;color:rgba(255,190,130,.9);font-size:11.5px}',
      'input[type=range].kn{-webkit-appearance:none;appearance:none;width:100%;height:24px;',
      ' background:transparent;margin:0;display:block}',
      'input[type=range].kn::-webkit-slider-runnable-track{height:3px;border-radius:2px;',
      ' background:linear-gradient(90deg,#ff9a3c var(--f,50%),rgba(255,255,255,.13) var(--f,50%))}',
      'input[type=range].kn::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;',
      ' border-radius:50%;margin-top:-6px;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);',
      ' box-shadow:0 0 10px rgba(255,140,50,.55),0 1px 3px rgba(0,0,0,.6)}',
      'input[type=range].kn::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.13)}',
      'input[type=range].kn::-moz-range-progress{height:3px;border-radius:2px;background:#ff9a3c}',
      'input[type=range].kn::-moz-range-thumb{width:15px;height:15px;border-radius:50%;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);box-shadow:0 0 10px rgba(255,140,50,.55)}',
      '#knobPanel .switch{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}',
      '#knobPanel .sw{position:relative;width:40px;height:22px;border-radius:12px;cursor:pointer;',
      ' background:rgba(255,255,255,.14);transition:background .25s}',
      '#knobPanel .sw.on{background:rgba(255,140,50,.75)}',
      '#knobPanel .sw::after{content:"";position:absolute;top:2.5px;left:3px;width:17px;height:17px;',
      ' border-radius:50%;background:#f5efe6;transition:transform .25s cubic-bezier(.22,1,.36,1);',
      ' box-shadow:0 1px 3px rgba(0,0,0,.4)}',
      '#knobPanel .sw.on::after{transform:translateX(17px)}',
      '#knobReset{margin-top:22px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.3);background:transparent;color:#ffb877;font-size:12px;',
      ' letter-spacing:.05em;transition:background .25s}',
      '#knobReset:hover{background:rgba(255,140,50,.12)}'
    ].join('\n');
    document.head.appendChild(css);

    function saveKnob(k, v){
      try {
        savedKnobs[k] = v;
        localStorage.setItem('solKnobs', JSON.stringify(savedKnobs));
      } catch(e){}
    }
    var DEFS = [
      { sec: 'tempo' },
      { k:'speed', label:'Ritmo do tempo', lo:0.05, hi:2, step:0.05, dflt:1,
        get:function(){ return TIME_SCALE; }, set:function(v){ TIME_SCALE = v; } },
      { k:'pmode', label:'Oscilações (p-modes)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return sunUniforms.uPmode.value; },
        set:function(v){ sunUniforms.uPmode.value = v; } },
      { sec: 'luz & cor' },
      { k:'bloom', label:'Bloom', lo:0, hi:2.5, step:0.05, dflt:1,
        get:function(){ return BLOOM_STRENGTH_BASE/BLOOM_BASE0; },
        set:function(v){ BLOOM_STRENGTH_BASE = BLOOM_BASE0*v; } },
      { k:'exposure', label:'Exposição', lo:0.5, hi:1.8, step:0.02, dflt:1,
        get:function(){ return compUniforms.uExposure.value/EXP0; },
        set:function(v){ compUniforms.uExposure.value = EXP0*v; } },
      { k:'plageglow', label:'Brilho das plages', lo:0, hi:1.2, step:0.05, dflt:0.35,
        get:function(){ return sunUniforms.uPlageEm.value; },
        set:function(v){ sunUniforms.uPlageEm.value = v; } },
      { k:'sat', label:'Saturação', lo:0, hi:1.6, step:0.05, dflt:1,
        get:function(){ return compUniforms.uSat.value; },
        set:function(v){ compUniforms.uSat.value = v; } },
      { k:'vig', label:'Vinheta', lo:0, hi:1.2, step:0.05, dflt:0.55,
        get:function(){ return compUniforms.uVig.value; },
        set:function(v){ compUniforms.uVig.value = v; } },
      { k:'grain', label:'Grão de filme', lo:0, hi:4, step:0.1, dflt:1,
        get:function(){ return compUniforms.uGrain.value; },
        set:function(v){ compUniforms.uGrain.value = v; } },
      { sec: 'cinema' },
      { k:'veil', label:'Halação (glare)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return VEIL_BASE; }, set:function(v){ VEIL_BASE = v; } },
      { k:'streak', label:'Flare anamórfico', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return STREAK_K; }, set:function(v){ STREAK_K = v; } },
      { k:'burst', label:'Starburst (difração)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return BURST_K; }, set:function(v){ BURST_K = v; } },
      { k:'disp', label:'Bloom espectral (dispersão)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return DISP_K; }, set:function(v){ DISP_K = v; } },
      { k:'hal', label:'Halação quente (corpo negro)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return HAL_K; }, set:function(v){ HAL_K = v; } },
      { k:'adapt', label:'Olho (adaptação)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return ADAPT_K; }, set:function(v){ ADAPT_K = v; } },
      { k:'fringe', label:'Franja da lente', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFringe.value; },
        set:function(v){ compUniforms.uFringe.value = v; } },
      { k:'shimmer', label:'Calor no limbo', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uShimmer.value; },
        set:function(v){ compUniforms.uShimmer.value = v; } },
      { k:'tone', label:'Grade Sunshine', lo:0, hi:1.2, step:0.05, dflt:0,
        get:function(){ return compUniforms.uTone.value; },
        set:function(v){ compUniforms.uTone.value = v; } },
      { k:'film', label:'Filme (ACES→AgX)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFilm.value; },
        set:function(v){ compUniforms.uFilm.value = v; } },
      { k:'hand', label:'Câmera de mão', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return HAND_K; }, set:function(v){ HAND_K = v; } },
      { sec: 'coroa' },
      { k:'halo', label:'Halo coronal', lo:0, hi:1.6, step:0.05, dflt:0.55,
        get:function(){ return coronaRaysUniforms.uHalo.value; },
        set:function(v){ coronaRaysUniforms.uHalo.value = v; } },
      { k:'ray', label:'Streamers', lo:0, hi:2.5, step:0.05, dflt:0.9,
        get:function(){ return coronaRaysUniforms.uRayBoost.value; },
        set:function(v){ coronaRaysUniforms.uRayBoost.value = v; } },
      { k:'cact', label:'Resposta à atividade', lo:0, hi:1.5, step:0.05, dflt:0.5,
        get:function(){ return coronaRaysUniforms.uActGain.value; },
        set:function(v){ coronaRaysUniforms.uActGain.value = v; } },
      { k:'loops', label:'Loops coronais', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return LOOP_K; }, set:function(v){ LOOP_K = v; } },
      { sec: 'céu' },
      { k:'stars', label:'Estrelas', lo:0, hi:2, step:0.05, dflt:1,
        get:function(){ return stars.material.opacity/STARS_OP0; },
        set:function(v){ stars.material.opacity = Math.min(1, STARS_OP0*v);
                         brightStars.material.opacity = Math.min(1, BRIGHT_OP0*v); } },
      { k:'mw', label:'Via Láctea', lo:0, hi:1, step:0.02, dflt:0.62,
        get:function(){ return milkyWay.material.opacity; },
        set:function(v){ milkyWay.material.opacity = v; mwNebUniforms.uMW.value = v; } },
      { sec: 'câmera' }
    ];

    var panel = document.createElement('div');
    panel.id = 'knobPanel';
    var head = document.createElement('h2'); head.textContent = 'Ajustes';
    var sub = document.createElement('p'); sub.className = 'sub';
    sub.textContent = 'cena, luz e câmera · salvo neste aparelho';
    panel.appendChild(head); panel.appendChild(sub);

    var sliders = [];
    DEFS.forEach(function(d){
      if (d.sec){
        var s = document.createElement('div'); s.className = 'sec';
        s.textContent = d.sec; panel.appendChild(s); return;
      }
      var row = document.createElement('div'); row.className = 'row';
      var lab = document.createElement('div'); lab.className = 'lab';
      var name = document.createElement('span'); name.textContent = d.label;
      var val = document.createElement('span'); val.className = 'val';
      lab.appendChild(name); lab.appendChild(val);
      var inp = document.createElement('input');
      inp.type = 'range'; inp.className = 'kn';
      inp.min = d.lo; inp.max = d.hi; inp.step = d.step;
      function paint(v){
        val.textContent = (+v).toFixed(2);
        inp.style.setProperty('--f', (100*(v - d.lo)/(d.hi - d.lo)) + '%');
      }
      inp.value = d.get(); paint(inp.value);
      inp.addEventListener('input', function(){
        var v = parseFloat(inp.value);
        d.set(v); paint(v); saveKnob(d.k, v);
      });
      row.appendChild(lab); row.appendChild(inp);
      panel.appendChild(row);
      sliders.push({ d: d, inp: inp, paint: paint });
    });

    // switch da câmera idle cinematográfica
    var swRow = document.createElement('div'); swRow.className = 'switch';
    var swLab = document.createElement('span'); swLab.textContent = 'Câmera contemplativa';
    var sw = document.createElement('div'); sw.className = 'sw' + (IDLE_CINE ? ' on' : '');
    sw.addEventListener('click', function(){
      IDLE_CINE = !IDLE_CINE;
      sw.classList.toggle('on', IDLE_CINE);
      saveKnob('idle', IDLE_CINE ? 1 : 0);
    });
    swRow.appendChild(swLab); swRow.appendChild(sw);
    panel.appendChild(swRow);

    var reset = document.createElement('button');
    reset.id = 'knobReset'; reset.textContent = 'restaurar padrão';
    reset.addEventListener('click', function(){
      try { localStorage.removeItem('solKnobs'); } catch(e){}
      savedKnobs = {};
      sliders.forEach(function(s){ s.d.set(s.d.dflt); s.inp.value = s.d.dflt; s.paint(s.d.dflt); });
      if (IDLE_CINE){ IDLE_CINE = false; sw.classList.remove('on'); }
    });
    panel.appendChild(reset);
    document.body.appendChild(panel);

    var btn = document.createElement('div');
    btn.id = 'knobBtn'; btn.title = 'ajustes';
    btn.textContent = '⚙';
    btn.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      // o ⚙ acompanha a borda do painel (não flutua sobre os controles)
      // e o HUD desliza para fora da área coberta — quem mexe em knobs
      // de custo é exatamente quem quer ver o fps
      var edge = 'calc(min(330px, 86vw) + 14px)';
      btn.style.right = open ? edge : '14px';
      hudEl.style.right = open ? 'calc(min(330px, 86vw) + 18px)' : '10px';
    });
    btn.style.transition += ', right .55s cubic-bezier(.22,1,.36,1)';
    hudEl.style.transition = 'right .55s cubic-bezier(.22,1,.36,1)';
    document.body.appendChild(btn);
  })();

  function onResize(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeTargets();
    var newFit = computeFitDist();
    if (fitDist > 0){ camDist *= newFit / fitDist; targetCamDist *= newFit / fitDist; }
    fitDist = newFit;
    camDist = Math.max(minDist, Math.min(maxDist, camDist));
    targetCamDist = Math.max(minDist, Math.min(maxDist, targetCamDist));
  }
  window.addEventListener('resize', onResize);

  resizeTargets();
  updateCamera();

  // ---------------------------------------------------------------
  // Loop de animação
  // ---------------------------------------------------------------
  var clock = new THREE.Clock();
  var elapsed = 0;
  var simAccum = 0;
  var chromoAccum = 0;
  // temporários do frame (reutilizados: nada de alocação por frame)
  var camDirN = new THREE.Vector3();
  var promNormal = new THREE.Vector3();
  var promWorldTmp = new THREE.Vector3();
  var camRightTmp = new THREE.Vector3();
  var camUpTmp = new THREE.Vector3();
  var SIM_STEP_INTERVAL = TP.simStep;
  // MACRO_SLOW (bug report do dono pós-LOOP-7): a macro-evolução — a
  // FORMA do campo de filamentos (fluxo advectado, canal G) e a
  // turbulência de larga escala — reorganizava-se em ~1-2s, uma
  // "gelatina" em frequência própria destoando da rotação majestosa
  // (filamentos reais vivem dias). 0.15 = sweep perceptual A/B/C:
  // forma estável em ~4s, deriva/cisalhamento em ~15s, reorganização
  // em ~30s. A vida FINA (fervura, fibrilas, plage, espículas,
  // flares, breathing) NÃO é escalada — segue no ritmo atual.
  var MACRO_SLOW = 0.15;
  var SIM_DT = 0.6*MACRO_SLOW;
  var ROT_SPEED = 0.042;

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
  // flare de SUPERFÍCIE: laço brilhante na plage de uma região madura
  var surfFlareT = 999;
  var surfFlareAmp = 1.0;
  var surfFlareCooldown = 8 + srand()*10;
  var surfFlareDir = new THREE.Vector3(0, 0, 1);
  // moldura da PIL no ponto do flare: na linha neutra o campo
  // HORIZONTAL aponta ATRAVÉS dela (da polaridade + para a −) — o
  // "perp" sai direto do próprio campo de cargas e a tangente fecha o
  // triedro. Vale para o gatilho natural E para o forceFlareAt de QA.
  var flareTanDir = new THREE.Vector3(1, 0, 0);
  var flarePerpDir = new THREE.Vector3(0, 0, 1);
  var flareSeedVal = 0;
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
    flareSeedVal = loopRand()*100.0;   // recorte das fitas muda por evento
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
    surfFlareAmp = Math.min(1.5, 0.55 + 0.55*Math.abs(ps.lead.w));
    setFlareFrame(surfFlareDir);   // moldura das fitas na PIL local
    scheduleFlareArcade();         // arcada re-semeada para ESTE evento
    agitateNearestProm(surfFlareDir);
    return true;
  }

  if (hintEl) {
    hintEl.textContent = hasTouch
      ? 'arraste para girar · pince aproxima · toque duplo enquadra'
      : 'arraste para girar · scroll aproxima · duplo clique enquadra';
  }
  setTimeout(function(){ if(hintEl) hintEl.style.opacity='0'; }, 6000);

  function animate(){
    requestAnimationFrame(animate);
    var frameT0 = performance.now();
    if (DET && window.__solInfo) window.__solInfo.frame = ++detFrames;
    var rawDelta = DET
      ? ((DET_HOLD > 0 && detFrames > DET_HOLD) ? 0 : (1/60))
      : Math.min(clock.getDelta(), 0.1);
    var delta = rawDelta * TIME_SCALE;
    elapsed += delta;
    sunUniforms.uTime.value = elapsed;

    simAccum += delta;
    if (subToggle.sim){
      var guard = 0;
      while (simAccum >= SIM_STEP_INTERVAL && guard < 5){
        simAccum -= SIM_STEP_INTERVAL;
        stepSimulation(SIM_DT);
        guard++;
      }
      // dreno do guard-5 (bug 2 da auditoria): sem isto, a fps baixa o
      // acumulador cresce sem limite e a granulação fica PERMANENTEMENTE
      // atrás de rotação/proeminências/bake (dessincronia cumulativa).
      // Tempo que não coube no frame é descartado de forma coerente —
      // fica no máximo 1 passo pendente para o próximo frame.
      if (simAccum > SIM_STEP_INTERVAL) simAccum = SIM_STEP_INTERVAL;
    } else simAccum = 0;

    // bake estrutural a ~8Hz, FATIADO (T3.3): um ciclo = 8 fatias, uma
    // por frame — o custo do par chromo+smear se dilui e o pior frame
    // deixa de ser 3.4x o frame típico
    chromoAccum += delta;
    if (bakeStep < 0 && chromoAccum >= 0.12 && subToggle.bake){
      chromoAccum = 0;
      bakeStep = 0;
      bakeTime = elapsed;
      snapshotBakeInputs();
    }
    if (bakeStep >= 0){
      bakeChromoSlice(bakeStep, bakeTime);
      bakeStep++;
      if (bakeStep >= 8){
        bakeStep = -1; perfBakes.push(frameT0);
        bakePrev = bakeCur; bakeCur = bakeWrite;
        bakeWrite = (bakeCur === bakePrev) ? (bakeCur+1)%3 : 3 - bakeCur - bakePrev;
        // clamp 4.5: cobre o ciclo a speed=3/fps baixa (~2.4s×0.85) — o
        // antigo 1.5 fechava o fade cedo e congelava as camadas baked
        // por 3 de 8 frames por ciclo (QA da iteração 1)
        bakeCycleDt = Math.max(0.05, Math.min(4.5, (elapsed - bakeSwapT)*0.85));
        bakeSwapT = elapsed;
        sunUniforms.uChromoTex.value  = bakeSets[bakeCur].s.texture;
        sunUniforms.uChromoFar.value  = bakeSets[bakeCur].c.texture;
        sunUniforms.uChromoTexP.value = bakeSets[bakePrev].s.texture;
        sunUniforms.uChromoFarP.value = bakeSets[bakePrev].c.texture;
      }
    }
    // crossfade avança TODO frame, fora do gate de fatias: sem congelar
    // nos frames de espera (fps>67) nem truncar em ~0.875. O fade dura
    // 85% do ciclo medido, então o mix SATURA em 1.0 antes do swap — e
    // no swap (prev:=cur, mix:=0) a imagem exibida é a MESMA, sem pop.
    sunUniforms.uBakeMix.value = Math.min(1, (elapsed - bakeSwapT)/bakeCycleDt);

    sunMesh.rotation.y += ROT_SPEED * delta;
    prominenceGroup.rotation.y = sunMesh.rotation.y;
    spiculeMesh.rotation.y = sunMesh.rotation.y;
    loopGroup.rotation.y = sunMesh.rotation.y;
    spiculeUniforms.uTime.value = elapsed;

    // ciclo de vida das regiões ativas (o bake absorve as mudanças a ~8Hz)
    updateActiveRegions(elapsed);
    // flare de superfície: ataque rápido, decaimento lento
    surfFlareCooldown -= delta;
    if (surfFlareCooldown <= 0){
      if (triggerSurfaceFlare()) surfFlareT = 0;
      // sol ativo flareia mais: cooldown encolhe com a atividade global
      surfFlareCooldown = (12 + srand()*14) / (0.5 + 1.1*coronaRaysUniforms.uActivity.value);
    }
    surfFlareT += delta;
    // FASE 1 — duas fases: núcleo impulsivo + fitas (impulso curto e
    // rescaldo gradual) que se SEPARAM da PIL a ritmo saturante, e a
    // fita alonga junto — a geometria toda deriva de surfFlareT
    var sfImp = flareEnvImp(surfFlareT);
    var sfGrad = flareEnvGrad(surfFlareT);
    var sfEnv = sfImp * 1.7 * surfFlareAmp;
    var sfRib = (0.45*sfImp + 0.85*sfGrad) * 1.7 * surfFlareAmp;
    if (sfEnv < 0.004) sfEnv = 0;
    if (sfRib < 0.004) sfRib = 0;
    var sfSep = 0.018 + 0.050*(1.0 - Math.exp(-surfFlareT*0.45));
    var sfLen = 0.055 + 0.040*(1.0 - Math.exp(-surfFlareT*0.45));
    // uFlare.xyz em espaço do OBJETO (o mesmo das cargas/sp no shader)
    sunUniforms.uFlare.value.set(surfFlareDir.x, surfFlareDir.y, surfFlareDir.z, sfEnv);
    sunUniforms.uFlareGeo.value.set(flareTanDir.x, flareTanDir.y, flareTanDir.z, sfSep);
    sunUniforms.uFlarePerp.value.set(flarePerpDir.x, flarePerpDir.y, flarePerpDir.z, sfLen);
    // FASE 2 (débito LOD): w = fator de zoom dos STRANDS das fitas — de
    // perto (camDist < fit) o ruído de recorte fica proporcionalmente
    // mais fino, mantendo a densidade de strands EM TELA; de longe fica
    // 1.0 (look calibrado da Fase 1 intocado)
    sunUniforms.uFlareRib.value.set(sfRib, 0.010, flareSeedVal,
      Math.min(2.6, Math.max(1.0, fitDist/camDist)));
    // loops coronais + arcada pós-flare (FASE 1): ciclo de vida,
    // traços amortizados e envelopes — tudo sem alocação
    updateLoops(delta);
    camDirN.copy(camera.position).normalize();
    // estado por proeminência (uma vez por PAR de cartões, não por mesh)
    promStates.forEach(function(ps){
      // ciclo de vida: nasce crescendo da superfície, vive, colapsa e a
      // slot RENASCE noutra linha neutra (mesmo padrão das regiões ativas)
      var lx = ((elapsed + ps.phase) % ps.period) / ps.period;
      ps.env = lifeEnvelope(lx);
      if (lx >= 0.90){
        if (!ps.reborn){ placeProminence(ps, sampleProminenceAnchor()); ps.reborn = true; }
      } else ps.reborn = false;
      // proeminência <-> campo: a intensidade acompanha a força LOCAL do
      // campo das cargas (bFieldJS) na âncora AO LONGO DA VIDA — as
      // regiões ativas que sustentam a linha neutra crescem e decaem, e o
      // plasma suspenso esmorece/reaviva junto (suavizado p/ não tremer)
      var Bm = bFieldJS(ps.meshes[0].userData.dir).length();
      var fieldK = Math.min(1.2, 0.35 + 0.65*(Bm/1.1));
      ps.fieldK = (ps.fieldK === undefined) ? fieldK
                : ps.fieldK + (fieldK - ps.fieldK)*Math.min(1, delta*0.8);
      // agitação por flare vizinho: ataque rápido (~1s), relaxa em ~6s
      ps.agitT = (ps.agitT === undefined) ? 999 : ps.agitT + delta;
      ps.agit = (1.0 - Math.exp(-ps.agitT*3.0)) * Math.exp(-ps.agitT*0.55);
      if (ps.agit < 0.004) ps.agit = 0;
      if (ps.agitHold != null) ps.agit = ps.agitHold;   // QA: valor fixado
      // "tempo do plasma": corre mais rápido sob agitação (dreno acelera)
      ps.drift = (ps.drift || 0) + delta*(1.0 + 4.0*ps.agit);
      // orientação dos DOIS cartões: folha fina esmaece de frente (nv) e
      // de perfil (edgeK), mas o PAR deve somar brilho ~constante — o
      // gêmeo carrega o que o outro perde. Sem a normalização, a sorte
      // do spin deixava proeminências até ~2.6x mais fracas que outras.
      if (!ps.orient) ps.orient = [0, 0];
      for (var oi = 0; oi < 2; oi++){
        ps.meshes[oi].getWorldDirection(promNormal);
        var nv = Math.abs(promNormal.dot(camDirN));
        var ek = Math.min(1, Math.max(0, (nv - 0.03) / 0.13));
        ps.orient[oi] = (1.0 - 0.5*nv) * ek*ek*(3 - 2*ek);
      }
      ps.orientNorm = 1.05 / Math.max(0.45, ps.orient[0] + ps.orient[1]);
    });
    prominenceMeshes.forEach(function(m){
      var ps = m.userData.state;
      var env = ps.env;
      m.material.uniforms.uLife.value = env;
      m.material.uniforms.uAgit.value = ps.agit;
      m.material.uniforms.uPTime.value = ps.drift;
      // flicker 1/f: 3 oitavas de value noise — remove a periodicidade
      // audível dos 2 senos; respira mais forte sob campo forte/agitação
      var famp = 0.16 + 0.14*ps.fieldK + 0.45*ps.agit;
      var f = 0.65 + famp * flicker1f(elapsed*m.userData.speed + m.userData.phase);
      var base = Math.max(0.55, Math.min(1.15, f + 0.2));
      base *= 0.30 + 0.70*env;   // jovem/moribunda é mais tênue que madura
      base *= ps.fieldK;
      // flare vizinho reaviva o plasma suspenso (interação visível)
      base += 1.6 * ps.agit;
      // física do limbo: proeminências só brilham na borda; contra o disco, somem
      var facing = promWorldTmp.copy(m.userData.dir)
        .applyQuaternion(prominenceGroup.quaternion).dot(camDirN);
      var s = Math.min(1, Math.max(0, (facing - 0.10) / 0.42));
      s = s*s*(3.0-2.0*s);
      base *= (0.05 + 0.95*(1.0 - s));
      // orientação normalizada por PAR (calculada no loop de estados):
      // preserva o fade físico de cada cartão, mas a soma dos gêmeos
      // rende brilho ~constante em qualquer ângulo/spin
      base *= ps.orient[m.userData.twinIdx] * ps.orientNorm;
      m.material.uniforms.uIntensity.value = base;
      m.material.uniforms.uTime.value = elapsed;
    });

    coronaRays.quaternion.copy(camera.quaternion);
    coronaRaysUniforms.uTime.value = elapsed;
    twinkleUniform.value = elapsed;
    // T1.3: base da câmera + rotação do Sol + atividade global p/ a coroa
    camRightTmp.set(1,0,0).applyQuaternion(camera.quaternion);
    camUpTmp.set(0,1,0).applyQuaternion(camera.quaternion);
    coronaRaysUniforms.uRight.value.copy(camRightTmp);
    coronaRaysUniforms.uUp.value.copy(camUpTmp);
    coronaRaysUniforms.uRotY.value = sunMesh.rotation.y;
    var actSum = 0;
    for (var ai = 0; ai < pairStates.length; ai++) actSum += Math.abs(pairStates[ai].lead.w);
    coronaRaysUniforms.uActivity.value = Math.min(1.0, actSum/4.0);

    // inércia: continua girando ao soltar, com amortecimento exponencial
    if (pointers.size === 0){
      theta += thetaVel*rawDelta;
      phi   += phiVel*rawDelta;
      phi = Math.max(0.18, Math.min(Math.PI-0.18, phi));
      var damp = Math.exp(-2.6*rawDelta);
      thetaVel *= damp; phiVel *= damp;
      if (Math.abs(thetaVel) < 0.002) thetaVel = 0;
      if (Math.abs(phiVel) < 0.002) phiVel = 0;
    }
    // zoom amortecido
    camDist += (targetCamDist - camDist) * (1.0 - Math.exp(-9.0*rawDelta));
    sunUniforms.uCamDist.value = camDist;

    if (pointers.size === 0 && performance.now()-lastInteraction > 2200){
      theta += 0.066*rawDelta;
      // ?idle=1: câmera idle cinematográfica — deriva orbital + balanço
      // de latitude + respiração de zoom, tudo senoidal (média zero)
      if (IDLE_CINE){
        phi += 0.012*Math.sin(elapsed*0.11)*rawDelta;
        targetCamDist += Math.sin(elapsed*0.073)*0.010*rawDelta*targetCamDist;
      }
    }
    updateCamera();

    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    // FASE 2 — dispersão espectral do bloom (lida ANTES do renderBloom)
    downsampleUniforms.uDisp.value = DISP_K;
    upsampleUniforms.uDisp.value = DISP_K;
    if (subToggle.bloom) renderBloom();
    compUniforms.uBloomStrength.value = subToggle.bloom ? BLOOM_STRENGTH_BASE : 0.0;

    // --- camada cinema (Sunshine) ---------------------------------
    // halação usa o mip mais largo do bloom; zera junto com o toggle
    compUniforms.uVeil.value = subToggle.bloom ? VEIL_BASE : 0.0;
    compUniforms.tVeil.value = bloomMips[bloomMips.length-1].rt.texture;
    if (STREAK_K > 0.001 && subToggle.bloom) renderStreak();
    compUniforms.uStreak.value = subToggle.bloom ? STREAK_K : 0.0;
    compUniforms.tStreak.value = streakRTb.texture;
    compUniforms.uCTime.value = elapsed;
    // centro/raio do disco em UV de tela (p/ o anel de heat-haze)
    cineProj.set(0,0,0).project(camera);
    compUniforms.uSunC.value.set(cineProj.x*0.5+0.5, cineProj.y*0.5+0.5);
    var cineHalf = camera.fov * Math.PI / 360;
    var cineAng = Math.asin(Math.min(1, SUN_RADIUS / Math.max(camDist, SUN_RADIUS*1.001)));
    compUniforms.uSunR.value = 0.5 * Math.tan(cineAng) / Math.tan(cineHalf);
    compUniforms.uAspect.value = renderer.domElement.width / Math.max(1, renderer.domElement.height);
    // FASE 1 — brilho HDR REAL do flare na lente: envelope (2 fases) ×
    // visibilidade do ponto do flare no hemisfério voltado à câmera
    // (espaço de mundo). Antes a íris respondia a sfEnv mesmo com o
    // flare ATRÁS do Sol — efeito desacoplado do estado físico. Agora
    // flare no limbo/lado oculto ⇒ lente não reage ("uma estrela, um
    // estado"); o MESMO escalar dirige íris e starburst.
    flareWorldTmp.copy(surfFlareDir).applyQuaternion(sunMesh.quaternion);
    var flareFacing = flareWorldTmp.dot(camDirN);
    var fvis = Math.min(1, Math.max(0, (flareFacing - 0.04)/0.26));
    fvis = fvis*fvis*(3.0 - 2.0*fvis);
    var flareHDR = (sfEnv + 0.5*sfRib) * fvis;
    lastFlareHDR = flareHDR;
    // FASE 2 — halação quente: além do peso espectral por pixel (shader),
    // o ganho global SURGE com o flash do flare — o mesmo escalar físico
    // que dirige íris e starburst ("uma estrela, um estado")
    compUniforms.uHal.value = subToggle.bloom ? HAL_K * (1.0 + 1.6*flareHDR) : 0.0;
    // adaptação de exposição (olho/íris): fecha rápido no claro, reabre
    // devagar; flare estoura o quadro ANTES de a íris correr atrás
    if (ADAPT_K > 0.001){
      var cover = cineAng / cineHalf; cover = Math.min(2.0, cover*cover);
      // termo do flare 0.60→0.25 (backlog M2 nº5): a íris escurecia o
      // quadro TODO -26% enquanto o flash local era +3% — o evento lia
      // invertido; com o laço 4x mais forte, o flare ganha a leitura
      var aTarget = 1.0 / (1.0 + ADAPT_K*(0.42*cover
        + 0.20*coronaRaysUniforms.uActivity.value*cover + 0.25*flareHDR));
      var aTau = (aTarget < adaptCur) ? 0.5 : 3.0;
      adaptCur += (aTarget - adaptCur) * (1.0 - Math.exp(-rawDelta/aTau));
      compUniforms.uAdapt.value = adaptCur * (1.0 + ADAPT_K*0.85*flareHDR);
    } else { adaptCur = 1.0; compUniforms.uAdapt.value = 1.0; }
    // starburst de difração: cravado na posição PROJETADA do flare e
    // dirigido pelo mesmo flareHDR — nasce, cresce e some com o brilho
    // físico (impulsivo forte, rescaldo fraco), nunca com um timer
    if (BURST_K > 0.001 && flareHDR > 0.004){
      burstProj.copy(flareWorldTmp).multiplyScalar(SUN_RADIUS).project(camera);
      compUniforms.uBurstPos.value.set(burstProj.x*0.5 + 0.5, burstProj.y*0.5 + 0.5);
      compUniforms.uBurst.value = (burstProj.z < 1.0) ? BURST_K * flareHDR : 0.0;
      // rotação: assinatura fixa por EVENTO + deriva ínfima (lente viva)
      compUniforms.uBurstRot.value = flareSeedVal*0.7 + Math.sin(elapsed*0.9 + flareSeedVal)*0.03;
    } else compUniforms.uBurst.value = 0.0;
    // ----------------------------------------------------------------

    compUniforms.tScene.value = sceneRT.texture;
    compUniforms.tBloom.value = bloomMips[0].rt.texture;
    renderer.setRenderTarget(null);
    renderer.render(compScene, quadCamera);

    // HUD: atualiza a ~2Hz com as mesmas métricas do __solInfo.perf()
    hudAccum += rawDelta;
    if (hudOn && hudAccum >= 0.5 && window.__solInfo && window.__solInfo.perf){
      hudAccum = 0;
      var P = window.__solInfo.perf();
      hudEl.textContent = 'tier ' + P.tier + ' x' + P.autoScale + '  ' + P.fps + ' fps\n' +
        'ms ' + P.ms.avg + ' avg  ' + P.ms.p95 + ' p95\n' +
        'cpu ' + P.busy.avg + '  calls ' + P.calls + '  bake/s ' + P.bakesPerSec;
    }

    // fecha a medição do frame: intervalo rAF->rAF + custo CPU do corpo
    var frameT1 = performance.now();
    var fMs = (perfLastT > 0) ? (frameT0 - perfLastT) : (frameT1 - frameT0);
    perfBusyMs[perfIdx] = frameT1 - frameT0;
    perfFrameMs[perfIdx] = fMs;
    perfLastT = frameT0;
    if (autoTuneOn) autoTune(rawDelta, fMs);
    perfIdx = (perfIdx + 1) % 240;
    if (perfN < 240) perfN++;
    perfCalls = renderer.info.render.calls;
    renderer.info.reset();
  }

  animate();
  loadingEl.classList.add('hidden');
}

})();

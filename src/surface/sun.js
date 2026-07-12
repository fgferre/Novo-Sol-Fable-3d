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
      TP = ctx.TP, simRTs = ctx.simRTs, simUniforms = ctx.simUniforms;
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
  ctx.sunMesh = sunMesh;
}

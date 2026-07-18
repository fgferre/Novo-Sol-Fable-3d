// atmosphere/prominences.js — proeminências/filamentos (cartões hedgerow/
// fan/arch + gêmeos de absorção). Corpo movido verbatim; buildProminences
// roda NA chamada da factory (2º consumidor de srand do init — posição
// textual preservada entre buildCharges e loops/estrelas).
//
// PR 6 (achado 7) — INSTANCING. Antes: cada estado criava 2 Mesh emissivos
// + 1 Mesh de absorção => 8–24 draws batcháveis. Agora: QUATRO InstancedMesh
// (fan/hedgerow/arch emissivos + absorption) => 3 draws com fprom=0, 4 com
// fprom>0. A curvatura sobre a esfera (que antes era bakeada por-vértice em
// geometria própria de cada cartão) foi movida para o VERTEX SHADER, que a
// reconstrói a partir da largura/altura por instância (aSize); as matrizes
// por instância guardam âncora/orientação. Os "meshes" que o resto do app
// (main.js, solinfo.js) enxerga são Object3D-PROXY leves — sem geometria,
// zero draws — que continuam carregando .userData.dir, .quaternion,
// .position e um .material.uniforms plano; um flush por frame copia o estado
// dos proxies para os atributos das InstancedMesh. Assim placeProminence,
// sampleProminenceAnchor, o consumo de srand e TODOS os hooks públicos
// permanecem BIT-IDÊNTICOS — só a submissão à GPU muda.

import * as THREE from 'three';

export function createProminences(ctx){
  var scene = ctx.scene, srand = ctx.srand, knob = ctx.knob,
      SUN_RADIUS = ctx.SUN_RADIUS, PROMINENCE_COUNT = ctx.PROMINENCE_COUNT,
      NOISE_GLSL = ctx.NOISE_GLSL, bFieldJS = ctx.act.bFieldJS,
      samplePILAnchor = ctx.pil.samplePILAnchor;
  // ---------------------------------------------------------------
  // Proeminências solares (arcos de plasma). A cor foge de blackbody
  // de propósito: prominências são opticamente finas e o tom avermelhado
  // característico vem da linha de emissão H-alfa (656nm), não de
  // radiação térmica de corpo negro — então mantemos um vermelho definido
  // à mão em vez de "temperatura errada aplicada corretamente".
  // ---------------------------------------------------------------
  var prominenceGroup = new THREE.Group();
  var prominenceMeshes = [];   // proxies emissivos (2 por proeminência)
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
  // vida — a proeminência velha colapsa (env->0) e a slot renasce longe.
  // Opera sobre os proxies (Object3D + material.uniforms plano): o consumo
  // de srand (ang0 + 2 uSeeds) é IDÊNTICO ao mesh-por-mesh de antes.
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
    // FASE 3 — o gêmeo de absorção (filamento deitado) segue o cartão
    // 0: mesma âncora, mesma orientação (x ao longo da PIL) e o MESMO
    // uSeed — a estrutura escura no disco é a mesma cortina do limbo.
    // Nenhum sorteio novo: o stream do srand não desloca.
    if (ps.flat){
      ps.flat.quaternion.copy(ps.meshes[0].quaternion);
      ps.flat.position.copy(ps.meshes[0].position);
      ps.flat.userData.dir = ps.meshes[0].userData.dir;
      ps.flat.material.uniforms.uSeed.value = ps.meshes[0].material.uniforms.uSeed.value;
    }
  }
  // clona um bloco de uniforms {chave:{value}} — substitui mat.clone() do
  // ShaderMaterial (todos os valores aqui são números escalares)
  function cloneUnis(u){ var o = {}; for (var k in u) o[k] = { value: u[k].value }; return o; }

  // uniforms comuns aos três shaders de proeminência (ciclo de vida,
  // agitação por flare e "tempo do plasma" são a mesma interface). uTime é
  // GLOBAL (mesmo valor p/ todas as instâncias) => uniform de material; o
  // resto é POR INSTÂNCIA => atributo instanciado, entregue ao fragment por
  // varying com o MESMO nome (o corpo do shader fica idêntico ao de antes).
  var PROM_FRAG_HEADER = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying float uSeed;',
    'varying float uIntensity;',
    'varying float uAspect;',
    'varying float uLife;',
    'varying float uAgit;',
    'varying float uPTime;'
  ].join('\n');
  // vertex instanciado dos cartões EM PÉ: reconstrói a curvatura sobre a
  // esfera (antes bakeada em bendOverSphere) a partir de aSize=(w,h). O
  // plano canônico é [-0.5,0.5]² em xy; vx=px·w, vy=h·(py+0.5)-R·0.02 —
  // igual ao PlaneGeometry(w,h)+translate de antes; depois dobra em torno
  // do centro do Sol (raio constante na base). instanceMatrix guarda a
  // âncora/orientação (injetado pelo three via USE_INSTANCING).
  var PROM_EMIT_VERTEX = [
    'attribute vec2 aSize;',
    'attribute float aSeed;',
    'attribute float aIntensity;',
    'attribute float aAspect;',
    'attribute float aLife;',
    'attribute float aAgit;',
    'attribute float aPTime;',
    'uniform float uSR;',
    'varying vec2 vUv;',
    'varying float uSeed;',
    'varying float uIntensity;',
    'varying float uAspect;',
    'varying float uLife;',
    'varying float uAgit;',
    'varying float uPTime;',
    'void main(){',
    '  vUv = uv;',
    '  uSeed = aSeed; uIntensity = aIntensity; uAspect = aAspect;',
    '  uLife = aLife; uAgit = aAgit; uPTime = aPTime;',
    '  float cDist = uSR*0.995;',
    '  float vx = position.x * aSize.x;',
    '  float vy = aSize.y*(position.y+0.5) - uSR*0.02;',
    '  float aBend = vx / uSR;',
    '  float rho = cDist + vy;',
    '  vec3 p = vec3(rho*sin(aBend), rho*cos(aBend) - cDist, 0.0);',
    '  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');
  // ---- corpos dos fragmentos (verbatim; só a plumagem uniform->varying) --
  var hedgerowBody = [
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
    // extinção alargada 0.08->0.22 (backlog M2 nº6, aqui e nas outras
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
  var hedgerowFragment = NOISE_GLSL + '\n' + PROM_FRAG_HEADER + '\n' + hedgerowBody;
  // PLUMA VARRIDA (ref-04): a proeminência real da foto não é um
  // leque denso e simétrico — são FEIXES distintos de fios finos
  // quase paralelos, todos varridos para um lado, com pontas
  // desfiadas e céu vazio entre os feixes
  var fanBody = [
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
  var fanFragment = NOISE_GLSL + '\n' + PROM_FRAG_HEADER + '\n' + fanBody;
  // ARCO: tubo de fios seguindo um laço magnético — coordenadas
  // polares centradas ABAIXO da base; o feixe vive num anel |r-R0|
  // fino, fios comprimidos na direção ANGULAR (seguem o arco), pés
  // mais grossos/brilhantes e vão transparente sob o vão do laço
  var archBody = [
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
  var archFragment = NOISE_GLSL + '\n' + PROM_FRAG_HEADER + '\n' + archBody;
  // FASE 3 — CONTINUIDADE FILAMENTO<->PROEMINÊNCIA. Proeminência e
  // filamento são o MESMO objeto visto de ângulos diferentes: a cortina
  // de plasma vermelha de perfil (limbo) é o canal escuro de absorção
  // visto de cima (disco). O cartão radial em pé degenera em linha de
  // 0px visto de cima, então o gêmeo escuro é um cartão DEITADO sobre a
  // esfera, na mesma âncora/tangente de PIL e com o MESMO uSeed — o
  // perfil yTop que recorta o topo da cortina vira a meia-largura do
  // canal (as reentrâncias são os "barbs" dos filamentos reais, ver
  // ref-07). Blending multiplicativo dst*(1-src): absorção de verdade,
  // não aditivo — o mesmo mecanismo que o débito da arcada escura pede.
  // O crossfade usa o MESMO facing que apaga a emissão contra o disco:
  // escuro ∝ s, vermelho ∝ (1-s) — no limbo a estrutura troca de cara
  // sem trocar de identidade.
  // vertex do gêmeo instanciado: reconstrói o drapejado sobre a esfera
  // (antes bakeado em buildFlatTwin) a partir de aSize.x=w; hF já vem na
  // altura do plano canônico. vWPos (posição de MUNDO) por varying — o
  // gate por-pixel do limbo precisa saber onde o ponto da superfície está
  // em relação à borda visível do disco.
  var PROM_ABSORB_VERTEX = [
    'attribute vec2 aSize;',
    'attribute float aSeed;',
    'attribute float aIntensity;',
    'attribute float aAspect;',
    'attribute float aLife;',
    'attribute float aAgit;',
    'attribute float aPTime;',
    'attribute float aAbsorb;',
    'uniform float uSR;',
    'varying vec2 vUv;',
    'varying vec3 vWPos;',
    'varying float uSeed;',
    'varying float uIntensity;',
    'varying float uAspect;',
    'varying float uLife;',
    'varying float uAgit;',
    'varying float uPTime;',
    'varying float uAbsorb;',
    'void main(){',
    '  vUv = uv;',
    '  uSeed = aSeed; uIntensity = aIntensity; uAspect = aAspect;',
    '  uLife = aLife; uAgit = aAgit; uPTime = aPTime; uAbsorb = aAbsorb;',
    '  float cDist = uSR*0.995;',
    '  float lift = uSR*0.012;',   // acima da superfície, sem z-fight
    '  float vx = position.x * aSize.x;',
    '  float vz = position.y;',
    '  float dl = sqrt(vx*vx + cDist*cDist + vz*vz);',
    '  float rr = (cDist + lift)/dl;',
    '  vec3 p = vec3(vx*rr, cDist*rr - cDist, vz*rr);',
    '  vWPos = (modelMatrix * instanceMatrix * vec4(p,1.0)).xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p,1.0);',
    '}'
  ].join('\n');
  // header do fragment de absorção: mesmas varyings + uAbsorb + vWPos
  // (cameraPosition vem do ShaderMaterial). Reaproveita o hedgerowBody
  // via as MESMAS substituições de antes (só o miolo muda).
  var PROM_ABSORB_HEADER = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying vec3 vWPos;',
    'varying float uSeed;',
    'varying float uIntensity;',
    'varying float uAspect;',
    'varying float uLife;',
    'varying float uAgit;',
    'varying float uPTime;',
    'varying float uAbsorb;'
  ].join('\n');
  var promAbsorbFragment = NOISE_GLSL + '\n' + PROM_ABSORB_HEADER + '\n' + hedgerowBody
    // yc = afastamento do CENTRO do canal (a PIL corre no meio do
    // cartão deitado); o y do ruído fica ASSINADO — espelhar o noise
    // com abs() gerava "renda" simétrica ornamental (QA F3). O centro
    // MEANDRA com a longitude (painel de juízes F3: "reto demais lê
    // como risco geométrico" — filamentos reais serpenteiam, ref-03)
    .replace('  float y = vUv.y;',
      '  float y = vUv.y;\n' +
      '  float yc = abs(y*2.0 - 1.0 + 0.38*snoise(vec3(xn*2.1, uSeed*2.9, 1.5)));')
    // a largura do canal usa yc (o perfil yTop da cortina vira a
    // meia-largura do filamento — as reentrâncias são os barbs)
    .replace('  float body = smoothstep(0.02, 0.16, yTop - y);',
      '  float body = smoothstep(0.02, 0.16, yTop - yc);')
    // miolo SÓLIDO: o gate de wisp da cortina abre buracos até zero, e
    // visto de cima o canal virava picote/dithering (flag unânime do
    // painel de juízes F3 — filamento GONG é absorção contínua e macia,
    // fios só nas bordas). O wisp vira modulação suave, não gate.
    .replace('  float a = wisp * body * uIntensity;',
      '  float a = (0.60 + 0.40*wisp) * body * uIntensity;')
    // o corte "abaixo da superfície" do cartão em pé mataria um lado
    // inteiro do canal deitado — fora
    .replace('  a *= smoothstep(0.0, 0.07, y);', '')
    .replace('  gl_FragColor = vec4(col, a*1.05);',
      // fade por-pixel do limbo: a absorção escala com mu (a luz que
      // RESTA para absorver — sobre o anel escurecido do limbo um
      // multiply forte lia como renda flutuante, QA F3) e um taper mata
      // o resíduo perto da borda: filamentos H-alfa reais somem por
      // projeção ao se aproximarem do limbo (ρ>0.9) e é a proeminência
      // vermelha do cartão em pé que assume dali em diante. mu usa o
      // horizonte verdadeiro (ponto->câmera, não o eixo da câmera).
      '  float mu = dot(normalize(vWPos), normalize(cameraPosition - vWPos));\n' +
      '  float ab = clamp(a*1.3, 0.0, 1.0) * uAbsorb' +
      ' * mu * smoothstep(0.25, 0.45, mu);\n' +
      '  gl_FragColor = vec4(vec3(ab), 1.0);');

  // ---------------------------------------------------------------
  // GEOMETRIAS CANÔNICAS compartilhadas (uma p/ os emissivos, uma p/ a
  // absorção). O bend/drapejado é feito no VERTEX a partir de aSize —
  // aqui só a topologia (mesma resolução de antes: 48×1 e 48×6).
  // ---------------------------------------------------------------
  var emitGeo = new THREE.PlaneGeometry(1, 1, 48, 1);
  var absGeo = new THREE.PlaneGeometry(1, SUN_RADIUS*0.05, 48, 6);

  // conta instâncias por tipo (0 leque, 1 hedgerow, 2 arco). Cada
  // proeminência contribui 2 instâncias emissivas (par cruzado) e 1 de
  // absorção. Alto/ultra/mid/low têm sempre >=1 por tipo (PROM>=4).
  var typeProm = [0, 0, 0];
  for (var ti = 0; ti < PROMINENCE_COUNT; ti++) typeProm[ti % 3]++;

  var FRAGS = [fanFragment, hedgerowFragment, archFragment];  // idx = promType
  var EMIT_ATTRS = ['aSeed', 'aIntensity', 'aLife', 'aAgit', 'aPTime'];   // dinâmicos/frame

  // fábrica de uma InstancedMesh emissiva por tipo
  function makeEmitMesh(promType){
    var count = typeProm[promType] * 2;
    var g = emitGeo.clone();
    g.setAttribute('aSize',      new THREE.InstancedBufferAttribute(new Float32Array(count*2), 2));
    g.setAttribute('aSeed',      new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute('aAspect',    new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute('aLife',      new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute('aAgit',      new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    g.setAttribute('aPTime',     new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    var m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSR: { value: SUN_RADIUS } },
      vertexShader: PROM_EMIT_VERTEX,
      fragmentShader: FRAGS[promType],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var im = new THREE.InstancedMesh(g, m, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;   // instâncias vão p/ o limbo; o bbox canônico não cobre
    prominenceGroup.add(im);
    return im;
  }
  var emitMesh = [makeEmitMesh(0), makeEmitMesh(1), makeEmitMesh(2)];

  // InstancedMesh de absorção (7 instâncias no high, 1 por proeminência)
  var absCount = PROMINENCE_COUNT;
  (function(){
    absGeo.setAttribute('aSize',      new THREE.InstancedBufferAttribute(new Float32Array(absCount*2), 2));
    absGeo.setAttribute('aSeed',      new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aAspect',    new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aLife',      new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aAgit',      new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aPTime',     new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
    absGeo.setAttribute('aAbsorb',    new THREE.InstancedBufferAttribute(new Float32Array(absCount), 1));
  })();
  var absMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSR: { value: SUN_RADIUS } },
    vertexShader: PROM_ABSORB_VERTEX,
    fragmentShader: promAbsorbFragment,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var absMesh = new THREE.InstancedMesh(absGeo, absMat, absCount);
  absMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  absMesh.frustumCulled = false;
  absMesh.renderOrder = -1;    // escurece o disco ANTES das emissões
  absMesh.visible = false;     // knob fprom=0: nem entra no draw
  prominenceGroup.add(absMesh);

  // proxies por tipo/slot (p/ o flush) e lista de flats (absorção)
  var emitProx = [[], [], []];   // emitProx[promType][slot] = proxy emissivo
  var flatProx = [];             // flatProx[i] = proxy do gêmeo de absorção
  var typeSlot = [0, 0, 0];

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
      // (a curvatura sobre a esfera antes bakeada aqui vive agora no
      // PROM_EMIT_VERTEX; a geometria é canônica e compartilhada.)
      var promUniforms = {
        uTime: { value: 0 },
        uSeed: { value: srand()*100 },   // consumido e depois SOBRESCRITO no placeProminence
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
      // dois planos cruzados a 90° (cartões de folhagem): nunca degeneram
      // em "agulha" quando vistos de perfil. Uniforms independentes para
      // que cada plano possa esmaecer conforme fica de FRENTE à câmera —
      // proeminências são folhas opticamente finas: brilham de perfil.
      // Os "meshes" agora são Object3D-PROXY: sem geometria (zero draws),
      // só carregam transform + uniforms p/ os hooks e o flush.
      var mesh = new THREE.Object3D();  mesh.material = { uniforms: promUniforms };
      var mesh2 = new THREE.Object3D(); mesh2.material = { uniforms: cloneUnis(promUniforms) };
      var phase = srand()*Math.PI*2;
      var speed = 0.6+srand()*0.8;
      // ciclo de vida como o das regiões ativas: períodos individuais e
      // fases ESCALONADAS (o limbo nunca fica vazio nem lotado de uma vez)
      var ps = { meshes: [mesh, mesh2], period: 70 + srand()*50,
                 phase: 0, reborn: false,
                 // Identidade educativa da estrutura física. O índice do
                 // promStates é estável; a geração muda apenas quando este
                 // slot renasce naturalmente em outra linha neutra.
                 eduGeneration: 0, eduAnnouncedGeneration: -1,
                 eduHeight: h };
      ps.phase = (i/PROMINENCE_COUNT + srand()*0.08) * ps.period;
      var slot = typeSlot[promType];   // par de slots consecutivos p/ os gêmeos
      [mesh, mesh2].forEach(function(mm, k){
        mm.userData.twinIdx = k;
        mm.userData.phase = phase;
        mm.userData.speed = speed;
        mm.userData.state = ps;
        mm._im = emitMesh[promType];
        mm._slot = slot + k;
        emitProx[promType][slot + k] = mm;
        // aSize/aAspect são ESTÁTICOS por instância (só uSeed muda no
        // renascimento) — grava uma vez aqui
        var g = emitMesh[promType].geometry.attributes;
        g.aSize.setXY(slot + k, w, h);
        g.aAspect.setX(slot + k, w/h);
        prominenceMeshes.push(mm);
        prominenceGroup.add(mm);
      });
      typeSlot[promType] = slot + 2;
      // FASE 3 — gêmeo de absorção (filamento): cartão DEITADO drapejado
      // sobre a esfera, largura máxima ~0.05R (canais reais 0.005-0.012R,
      // gigantes com barbs mais largos — ref-07). Sem sorteios novos: a
      // geometria não consome srand e o uSeed é copiado do cartão em pé.
      (function buildFlatTwin(){
        var flat = new THREE.Object3D();
        flat.material = { uniforms: {
          uTime: { value: 0 }, uSeed: { value: 0 },
          // uAspect do cartão EM PÉ (não w/hF): a frequência dos fios
          // do shader escala com o aspect — com w/hF (~11-23) o canal
          // virava picote; com w/h a fibra tem a MESMA escala da
          // cortina do limbo (identidade de textura, não só de seed)
          uIntensity: { value: 1.0 }, uAspect: { value: w/h },
          uLife: { value: 0.0 }, uAgit: { value: 0.0 },
          uPTime: { value: 0.0 }, uAbsorb: { value: 0.0 }
        } };
        flat.visible = false;    // knob fprom=0: o InstancedMesh não desenha
        flat._slot = i;
        ps.flat = flat;
        flatProx[i] = flat;
        var g = absGeo.attributes;
        g.aSize.setXY(i, w, h);
        g.aAspect.setX(i, w/h);
        prominenceGroup.add(flat);
      })();
      placeProminence(ps, anchor);
      promStates.push(ps);
    }
  })();
  scene.add(prominenceGroup);

  // flush por-frame: copia o estado dos proxies (transform + uniforms
  // planos, escritos pelo main.js e pelo placeProminence) para os
  // atributos das InstancedMesh. Chamado uma vez por frame pelo animate,
  // após o loop de estados e ANTES do render (determinístico, sem lag).
  function flushEmit(im, proxies){
    if (!proxies.length) return;
    var g = im.geometry.attributes;
    for (var s=0;s<proxies.length;s++){
      var p = proxies[s], u = p.material.uniforms;
      p.updateMatrix();
      im.setMatrixAt(s, p.matrix);
      g.aSeed.setX(s, u.uSeed.value);
      g.aIntensity.setX(s, u.uIntensity.value);
      g.aLife.setX(s, u.uLife.value);
      g.aAgit.setX(s, u.uAgit.value);
      g.aPTime.setX(s, u.uPTime.value);
    }
    im.instanceMatrix.needsUpdate = true;
    for (var a=0;a<EMIT_ATTRS.length;a++) g[EMIT_ATTRS[a]].needsUpdate = true;
    im.material.uniforms.uTime.value = proxies[0].material.uniforms.uTime.value;
  }
  function flushProminences(){
    flushEmit(emitMesh[0], emitProx[0]);
    flushEmit(emitMesh[1], emitProx[1]);
    flushEmit(emitMesh[2], emitProx[2]);
    // absorção: visibilidade segue os proxies (main.js liga/desliga todos
    // juntos conforme FPROM_K); só flush do buffer quando visível
    absMesh.visible = !!(flatProx.length && flatProx[0].visible);
    if (absMesh.visible){
      var g = absGeo.attributes;
      for (var s=0;s<flatProx.length;s++){
        var p = flatProx[s], u = p.material.uniforms;
        p.updateMatrix();
        absMesh.setMatrixAt(s, p.matrix);
        g.aSeed.setX(s, u.uSeed.value);
        g.aIntensity.setX(s, u.uIntensity.value);
        g.aLife.setX(s, u.uLife.value);
        g.aAgit.setX(s, u.uAgit.value);
        g.aPTime.setX(s, u.uPTime.value);
        g.aAbsorb.setX(s, u.uAbsorb.value);
      }
      absMesh.instanceMatrix.needsUpdate = true;
      g.aSeed.needsUpdate = g.aIntensity.needsUpdate = g.aLife.needsUpdate =
        g.aAgit.needsUpdate = g.aPTime.needsUpdate = g.aAbsorb.needsUpdate = true;
      absMat.uniforms.uTime.value = flatProx[0].material.uniforms.uTime.value;
    }
  }

  ctx.prominenceGroup = prominenceGroup; ctx.prominenceMeshes = prominenceMeshes;
  ctx.promStates = promStates; ctx.sampleProminenceAnchor = sampleProminenceAnchor;
  ctx.placeProminence = placeProminence;
  ctx.flushProminences = flushProminences;
}

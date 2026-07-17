// scene/stars.js — céu: estrelas por classe térmica, glints, Via Láctea e
// nebulosa. Corpo verbatim (ctx 2D do canvas → c2d, como no coronaRays);
// buildStars é o 3º consumidor de srand do init — posição preservada.

import * as THREE from 'three';

export function createStars(ctx){
  var scene = ctx.scene, srand = ctx.srand, kelvinToRGB = ctx.kelvinToRGB,
      STAR_COUNT = ctx.STAR_COUNT, TP = ctx.TP, knob = ctx.knob,
      NOISE_GLSL = ctx.NOISE_GLSL;

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
    var c2d = c.getContext('2d');
    var g = c2d.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0.0,'rgba(255,255,255,1)');
    g.addColorStop(0.22,'rgba(255,255,255,0.34)');
    g.addColorStop(1.0,'rgba(255,255,255,0)');
    c2d.fillStyle = g; c2d.fillRect(0,0,64,64);
    c2d.globalCompositeOperation = 'lighter';
    var arm = c2d.createLinearGradient(0,0,64,0);
    arm.addColorStop(0,'rgba(255,255,255,0)');
    arm.addColorStop(0.5,'rgba(255,255,255,0.5)');
    arm.addColorStop(1,'rgba(255,255,255,0)');
    c2d.fillStyle = arm; c2d.fillRect(0,31,64,2);
    c2d.translate(32,32); c2d.rotate(Math.PI/2); c2d.translate(-32,-32);
    c2d.fillRect(0,31,64,2);
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
  milkyWay.material.opacity = knob('mw');
  var STARS_OP0 = stars.material.opacity, BRIGHT_OP0 = brightStars.material.opacity;
  var starK = knob('stars');
  if (starK <= 1){
    stars.material.opacity = STARS_OP0*starK;
    brightStars.material.opacity = BRIGHT_OP0*starK;
  } else {
    var starT = Math.min(1, starK - 1);
    stars.material.opacity = STARS_OP0 + (1-STARS_OP0)*starT;
    brightStars.material.opacity = BRIGHT_OP0 + (1-BRIGHT_OP0)*starT;
  }
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
  ctx.stars = stars; ctx.brightStars = brightStars; ctx.milkyWay = milkyWay;
  ctx.mwNeb = mwNeb; ctx.mwNebUniforms = mwNebUniforms;
  ctx.twinkleUniform = twinkleUniform;
  ctx.STARS_OP0 = STARS_OP0; ctx.BRIGHT_OP0 = BRIGHT_OP0;
}

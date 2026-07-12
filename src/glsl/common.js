// GLSL compartilhado — strings puras (sem side-effects de import).
// Movido verbatim de src/main.js (Bloco A da modularização); os
// consumidores concatenam estes blocos nos shaders de cada domínio.

  // ---------------------------------------------------------------
  // Ruído simplex 3D (Ashima Arts, domínio público / MIT) + fBm
  // ---------------------------------------------------------------
export const NOISE_GLSL = [
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

  // ---------------------------------------------------------------
  // Ruído celular (Worley). Retorna as duas menores distâncias (F1,F2):
  //  - F1 pequeno  -> perto do centro de uma célula (grânulo quente)
  //  - F2-F1 ~ 0   -> em cima de uma fronteira (veio intergranular frio)
  // É exatamente a estrutura da granulação real da fotosfera do Sol.
  // ---------------------------------------------------------------
export const WORLEY_GLSL = [
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
export const SFTDIR_GLSL = [
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
export const BFIELD_GLSL = [
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
export const LIC_GLSL = [
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

  // ---------------------------------------------------------------
  // Infraestrutura compartilhada de "quad" de tela cheia
  // (usada pela simulação e pelo bloom multi-escala)
  // ---------------------------------------------------------------
export const quadVertex = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }';
  // vertex padrão de malha com UV (coroa de raios e cartões de proeminência)
export const uvMeshVertex = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
    '}'
  ].join('\n');

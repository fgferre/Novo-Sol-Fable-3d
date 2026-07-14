// core/config.js — configuração via URL/localStorage, modo determinístico e
// os TRÊS streams de RNG (srand/cmeRand/loopRand), criados UMA vez aqui.
// Corpo movido verbatim de src/main.js; escalares mutáveis compartilhados
// (knobs etc.) vivem como ctx.* — nunca copiados para locais.

export function createConfig(ctx){

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
  ctx.detFrames = 0;
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
  ctx.savedKnobs = {};
  try { ctx.savedKnobs = JSON.parse(localStorage.getItem('solKnobs') || '{}') || {}; } catch(e){}
  function knob(name, dflt, lo, hi){
    var v = parseFloat(urlQ[name]);
    if (v !== v && ctx.savedKnobs[name] !== undefined) v = parseFloat(ctx.savedKnobs[name]);
    return (v === v) ? Math.min(hi, Math.max(lo, v)) : dflt;
  }
  // Knobs cinematográficos (defaults = visual calibrado do LOOP-5; sem
  // query string NADA muda). speed comprime/expande o tempo SIMULADO de
  // forma coerente (rotação, deriva, ciclos, flares, sim) sem tocar na
  // resposta dos controles de câmera.
  ctx.TIME_SCALE = knob('speed', 1.0, 0.05, 3.0);
  // ?look=sunshine: preset da camada cinematográfica (Sunshine 2007 —
  // halação, íris, lente); semeia DEFAULTS, então knob individual na
  // URL/painel continua tendo precedência. Sem o preset, tudo em 0.
  // valores do preset SEMPRE disponíveis (o painel da engrenagem tem um
  // botão "look Sunshine" que os aplica ao vivo, sem URL)
  var LOOK_SUNSHINE = {
    // calibrado por sweep de 7 variantes + juiz visual (h2, 8.5/10;
    // fringe>=0.5 gera rebordo verde no limbo — manter <=0.35)
    veil:0.85, adapt:0.55, fringe:0.35, shimmer:0.45, tone:0.65,
    streak:0.65, bloom:1.15, grain:1.7, vig:0.85, exposure:1.08,
    // FASE 2: loops/burst (dívida da F1) + disp/hal calibrados por
    // sweep de 6 variantes × 2 vistas com painel de 3 juízes (cinema/
    // realismo/legibilidade) — v1-sutil venceu unânime (8.5/10 nas 3
    // lentes); valores = mediana das 3 recomendações. Acima disso:
    // loops>=0.8 vira "mola de neon", burst>=1.0 vira cunha dura,
    // disp>=0.7 lava o disco p/ ouro, hal>=0.9 véu leitoso.
    loops:0.55, burst:0.55, disp:0.40, hal:0.45,
    // FASE 3: filamentos escuros como âncora de escala (painel de 3
    // juízes: mediana 0.55, mesmo patamar dos loops; >=0.9 vira
    // caricato — núcleo preto). cycle/lapse ficam FORA do preset: são
    // comportamento no tempo, não look.
    fprom:0.55,
    // FASE 4: coroa volumétrica raymarched (mediana do painel: 0.5 —
    // "somar textura, não luminância"; bloom espectral e halação já
    // carregam o brilho; >=1.0 lava o céu na vista fit). Nos tiers sem
    // raymarch (low) é no-op e o plano de raias segue como fallback.
    cvol:0.5,
    // FASE 5: CME + foco raso, painel de 3 juízes (sweep 6×2 + 4 doses
    // de dof, sem rebuild). cme = mediana 0.9 (0.6 cinema / 0.9 físico
    // / 1.2 artefatos — cada lente puxou p/ um lado; 0.9 mantém o
    // evento como pulso raro sem afogar o rim no céu). dof = 0.5
    // UNÂNIME (falloff contido e fílmico; 0.8-1.2 e o focus pull ao
    // limbo ficam para o modo diretor). Em tiers sem CME (low) o cme
    // é no-op, como o cvol.
    cme:0.9, dof:0.5,
    // FASE 6: manchas de verdade (grupos GONG). Mediana do RE-painel de
    // 3 juízes (1.0/1.0/1.5 → 1.0) sobre o sweep2 pós-correção da lei
    // de crescimento — o painel 1 (mediana 0.5) tinha 2 flags ALTAS de
    // fusão líder+seguidor, resolvidas no B1-fix e re-julgadas.
    spots:1.0
  };
  var LOOK = (urlQ.look === 'sunshine') ? LOOK_SUNSHINE : null;
  function lk(n, base){ return (LOOK && LOOK[n] !== undefined) ? LOOK[n] : base; }
  ctx.IDLE_CINE = urlQ.idle === '1' || (urlQ.idle === undefined && ctx.savedKnobs.idle == 1);
  // FASE 3 — o tempo da estrela: cycle liga o ciclo de 11 anos (0 = o
  // sol "de meio de ciclo" eterno de sempre; frame default intocado;
  // >1 acelera o relógio natural do ciclo). lapse é o time-lapse
  // documental da camada cinema: multiplica o relógio do ciclo E o
  // tempo de vida das regiões ativas (só a maquinaria de manchas —
  // rotação, granulação e proeminências seguem no tempo normal, a
  // mesma honestidade de VFX de p-modes/convecção). lapse>0 com
  // cycle=0 liga o ciclo sozinho (modo documental de um toque).
  ctx.CYCLE_K = knob('cycle', lk('cycle', 0), 0.0, 1.5);
  ctx.LAPSE_K = knob('lapse', lk('lapse', 0), 0.0, 1.5);
  // FASE 3 — continuidade filamento↔proeminência: a MESMA estrutura
  // escura contra o disco (filamento, absorção) e vermelha além do
  // limbo (proeminência, emissão). Default 0 = gêmeos de absorção
  // invisíveis, frame e custo idênticos ao baseline.
  ctx.FPROM_K = knob('fprom', lk('fprom', 0), 0.0, 1.5);
  // FASE 4 — a coroa de verdade: coroa volumétrica raymarched (helmet
  // streamers emergindo da topologia aberta/fechada do MESMO campo de
  // cargas, densidade bakeada em sampler3D 64³). Default 0 = mesh
  // invisível, frame e custo idênticos ao baseline. Tier-gated: em
  // tiers sem passos de raymarch (low) o knob é no-op e o plano de
  // raias segue sozinho como fallback.
  ctx.CVOL_K = knob('cvol', lk('cvol', 0), 0.0, 1.5);
  // FASE 5 — "Erupção": CME de flux-rope. Em flare GRANDE a casca do
  // rope sobre a PIL perde equilíbrio e escapa: frente brilhante,
  // cavidade rarefeita e núcleo denso (a "CME de três partes" do LASCO,
  // ref-13), com brilho de espalhamento THOMSON — máximo no plano do
  // céu (evento no limbo), tênue de frente (CME "halo"), o mesmo peso
  // sin² da física. Default 0 = nenhum evento dispara, meshes
  // invisíveis, frame e custo idênticos ao baseline. Tier-gated
  // (cmestep=0 no low => knob no-op, como o cvol).
  ctx.CME_K = knob('cme', lk('cme', 0), 0.0, 1.5);
  // FASE 5 — profundidade de campo em close-up: bokeh da MESMA íris de
  // 6 lâminas do starburst da F1. CoC ANALÍTICO da geometria esfera/
  // câmera (sem readback de Z — convenção da íris analítica); em
  // enquadramento fit a abertura é ~0 e nada muda mesmo com knob alto.
  // Default 0 = ramo morto no composite, frame idêntico.
  ctx.DOF_K = knob('dof', lk('dof', 0), 0.0, 1.5);
  // FASE 6 — manchas de verdade: multiplicidade e proporção GONG via
  // manchas VIRTUAIS num uniform array SÓ do shader do disco (uSpots,
  // zero custo no bake) + recalibração dos raios das manchas reais.
  // Default 0 = loop pulado por gate uniforme e recalibração ×1.0 —
  // frame e custo idênticos ao baseline. No preset sunshine entra com
  // 1.0 (mediana do re-painel de juízes do B1-fix).
  ctx.SPOTS_K = knob('spots', lk('spots', 0), 0.0, 1.5);
  // FASE 5 — modo diretor (?director=1): sequência-atração
  // determinística coreografada POR CIMA dos hooks/knobs existentes
  // (ciclo, flare grande + CME, close-ups com foco raso, retirada
  // wide). Qualquer input do usuário devolve o controle. Sem a query,
  // nenhuma linha do modo roda — default intocado.
  ctx.DIRECTOR_ON = urlQ.director === '1';
  var RENDER_SCALE = (parseFloat(urlQ.scale) > 0)
    ? Math.min(2.0, Math.max(0.3, parseFloat(urlQ.scale))) : 1.0;

  // RNG PRÓPRIO (padrão loopRand): o sorteio "este flare solta CME?"
  // não pode deslocar o stream do srand nem o do loopRand
  var cmeRandState = DET ? ((((parseInt(urlQ.seed, 10) || 1) >>> 0) ^ 0x00C0E5ED) >>> 0)
                         : ((Math.random() * 4294967296) >>> 0);
  function cmeRand(){
    cmeRandState = (cmeRandState + 0x6D2B79F5) >>> 0;
    var t = cmeRandState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

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

  // RNG PRÓPRIO (FASE 6, mesmo padrão loopRand/cmeRand): lifecycle das
  // manchas virtuais — nascimento/tamanho/posição sorteiam AQUI e nunca
  // deslocam srand/cmeRand/loopRand (o stream do srand é sagrado).
  // Zero draws na criação: quem consome é surface/sun.js, do init em
  // diante. XOR próprio 0x59075EED ("spot seed"), distinto dos demais.
  var spotRandState = DET ? ((((parseInt(urlQ.seed, 10) || 1) >>> 0) ^ 0x59075EED) >>> 0)
                          : ((Math.random()*4294967296) >>> 0);
  function spotRand(){
    spotRandState = (spotRandState + 0x6D2B79F5) >>> 0;
    var t = spotRandState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // PR0 — ?diag=1: ctx.diagEvent nasce como função vazia pré-resolvida;
  // o debug/diag.js a substitui pela real SÓ com a query ligada. Os
  // pontos de evento chamam ctx.diagEvent('nome', primitivos) direto —
  // sem if, sem concat, sem alocação no modo normal.
  ctx.diagEvent = function(){};

  // superfície do domínio (imutáveis pós-init; mutáveis já escritos como ctx.*)
  ctx.urlQ = urlQ; ctx.DET = DET; ctx.DET_HOLD = DET_HOLD; ctx.srand = srand;
  ctx.knob = knob; ctx.lk = lk; ctx.LOOK = LOOK; ctx.LOOK_SUNSHINE = LOOK_SUNSHINE;
  ctx.RENDER_SCALE = RENDER_SCALE; ctx.cmeRand = cmeRand; ctx.loopRand = loopRand;
  ctx.spotRand = spotRand;
}

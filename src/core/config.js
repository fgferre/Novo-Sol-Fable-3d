// core/config.js — configuração via URL/localStorage, modo determinístico e
// os TRÊS streams de RNG (srand/cmeRand/loopRand), criados UMA vez aqui.
// Corpo movido verbatim de src/main.js; escalares mutáveis compartilhados
// (knobs etc.) vivem como ctx.* — nunca copiados para locais.

import { createControlState, getControlPreset, migrateSavedControls } from './controls.js';

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
  // Achado 11 (PR7) — deriva idle determinística. markInteraction() é o
  // relógio ÚNICO da última interação, escrito por todo listener de câmera
  // (controls.js) e por setView (solinfo.js). No modo normal continua
  // wall-clock (performance.now); no modo determinístico registra o FRAME
  // (ctx.detFrames) em vez do tempo real. A deriva idle no animate lê o mesmo
  // relógio: em ?det o gatilho vira frame-exato (frame 133) e para de depender
  // da velocidade da máquina — era o flake do A/B base-vs-base no desktop-fit.
  ctx.lastInteraction = 0;
  ctx.lastInteractionFrame = 0;
  ctx.markInteraction = DET
    ? function(){ ctx.lastInteractionFrame = ctx.detFrames; }
    : function(){ ctx.lastInteraction = performance.now(); };
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
  // ctx.DET precisa existir ANTES do createControlState: o default do
  // controle `cycle` é uma função de ctx (0 sob ?det=1 — QA congelado e
  // byte-idêntico; 1 no modo normal — o ciclo de 11 anos anda por
  // default). A reatribuição no fim do módulo é idempotente.
  ctx.DET = DET;
  ctx.savedKnobs = {};
  try { ctx.savedKnobs = JSON.parse(localStorage.getItem('solKnobs') || '{}') || {}; } catch(e){}
  var savedMigration = migrateSavedControls(ctx.savedKnobs);
  ctx.savedKnobs = savedMigration.values;
  if (savedMigration.changed){
    try { localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs)); } catch(e){}
  }
  var LOOK_SUNSHINE = getControlPreset();
  var LOOK = (urlQ.look === 'sunshine') ? LOOK_SUNSHINE : null;
  createControlState(ctx, { urlQ:urlQ, savedKnobs:ctx.savedKnobs,
    look:LOOK ? 'sunshine' : '' });
  var knob = ctx.knob;
  // Knobs cinematográficos (defaults = visual calibrado do LOOP-5; sem
  // query string NADA muda). speed comprime/expande o tempo SIMULADO de
  // forma coerente (rotação, deriva, ciclos, flares, sim) sem tocar na
  // resposta dos controles de câmera.
  ctx.TIME_SCALE = knob('speed');
  // ?look=sunshine: preset da camada cinematográfica (Sunshine 2007 —
  // halação, íris, lente); semeia DEFAULTS, então knob individual na
  // URL/painel continua tendo precedência. Sem o preset, tudo em 0.
  // valores do preset SEMPRE disponíveis (o painel da engrenagem tem um
  // botão "look Sunshine" que os aplica ao vivo, sem URL)
  var lk = ctx.lk;
  ctx.IDLE_CINE = urlQ.idle === '1' || (urlQ.idle === undefined && ctx.savedKnobs.idle == 1);
  ctx.EDU_K = knob('edu');
  var requestedLang = urlQ.lang || ctx.savedKnobs.lang || '';
  if (requestedLang !== 'pt' && requestedLang !== 'en'){
    var browserLang = '';
    try { browserLang = String(document.documentElement.lang || navigator.language || '').toLowerCase(); } catch(e){}
    requestedLang = browserLang.indexOf('en') === 0 ? 'en' : 'pt';
  }
  ctx.eduLang = requestedLang;
  // FASE 3 — o tempo da estrela: cycle liga o ciclo de 11 anos (0 = o
  // sol "de meio de ciclo" eterno de sempre; frame default intocado;
  // 0..1 define a profundidade). lapse é o time-lapse documental da
  // camada cinema: define apenas a velocidade do relógio do ciclo E o
  // tempo de vida das regiões ativas (só a maquinaria de manchas —
  // rotação, granulação e proeminências seguem no tempo normal, a
  // mesma honestidade de VFX de p-modes/convecção). lapse>0 com
  // cycle=0 liga o ciclo sozinho (modo documental de um toque).
  ctx.CYCLE_K = knob('cycle');
  ctx.LAPSE_K = knob('lapse');
  // FASE 3 — continuidade filamento↔proeminência: a MESMA estrutura
  // escura contra o disco (filamento, absorção) e vermelha além do
  // limbo (proeminência, emissão). Default 0 = gêmeos de absorção
  // invisíveis, frame e custo idênticos ao baseline.
  ctx.FPROM_K = knob('fprom');
  // FASE 4 — a coroa de verdade: coroa volumétrica raymarched (helmet
  // streamers emergindo da topologia aberta/fechada do MESMO campo de
  // cargas, densidade bakeada em sampler3D 64³). Default 0 = mesh
  // invisível, frame e custo idênticos ao baseline. Tier-gated: em
  // tiers sem passos de raymarch (low) o knob é no-op e o plano de
  // raias segue sozinho como fallback.
  ctx.CVOL_K = knob('cvol');
  // FASE 5 — "Erupção": CME de flux-rope. Em flare GRANDE a casca do
  // rope sobre a PIL perde equilíbrio e escapa: frente brilhante,
  // cavidade rarefeita e núcleo denso (a "CME de três partes" do LASCO,
  // ref-13), com brilho de espalhamento THOMSON — máximo no plano do
  // céu (evento no limbo), tênue de frente (CME "halo"), o mesmo peso
  // sin² da física. Default 0 = nenhum evento dispara, meshes
  // invisíveis, frame e custo idênticos ao baseline. Tier-gated
  // (cmestep=0 no low => knob no-op, como o cvol).
  ctx.CME_K = knob('cme');
  // FASE 5 — profundidade de campo em close-up: bokeh da MESMA íris de
  // 6 lâminas do starburst da F1. CoC ANALÍTICO da geometria esfera/
  // câmera (sem readback de Z — convenção da íris analítica); em
  // enquadramento fit a abertura é ~0 e nada muda mesmo com knob alto.
  // Default 0 = ramo morto no composite, frame idêntico.
  ctx.DOF_K = knob('dof');
  // FASE 6 — manchas de verdade: multiplicidade e proporção GONG via
  // manchas VIRTUAIS num uniform array SÓ do shader do disco (uSpots,
  // zero custo no bake) + recalibração dos raios das manchas reais.
  // Default 0 = loop pulado por gate uniforme e recalibração ×1.0 —
  // frame e custo idênticos ao baseline. No preset sunshine entra com
  // 1.0 (mediana do re-painel de juízes do B1-fix).
  ctx.SPOTS_K = knob('spots');
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
  // A camada educativa segue o mesmo contrato: eventos passam apenas
  // primitivos; fora de ?edu=1 esta chamada permanece vazia e barata.
  ctx.eduEvent = function(){};

  // superfície do domínio (imutáveis pós-init; mutáveis já escritos como ctx.*)
  ctx.urlQ = urlQ; ctx.DET = DET; ctx.DET_HOLD = DET_HOLD; ctx.srand = srand;
  ctx.knob = knob; ctx.lk = lk; ctx.LOOK = LOOK; ctx.LOOK_SUNSHINE = LOOK_SUNSHINE;
  ctx.RENDER_SCALE = RENDER_SCALE; ctx.cmeRand = cmeRand; ctx.loopRand = loopRand;
  ctx.spotRand = spotRand;
}

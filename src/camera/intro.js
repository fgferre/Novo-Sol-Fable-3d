// camera/intro.js — abertura cinematográfica do primeiro acesso (Série
// Museu, PR-5). Um único plano-sequência determinístico de ~5s: a câmera
// nasce em close-up sobre a granulação e recua com ease cinematográfico até
// o enquadramento fit; título/subtítulo/hint fazem fade-in ao final. NÃO usa
// o director — é um beat único, sem o overhead de beats/loops/overrides.
// Regras de inércia:
//  - sob ?det=1 a factory retorna ANTES de criar estado, classe CSS ou
//    escrita de storage — a paridade fica intacta por construção;
//  - só roda no PRIMEIRO acesso (flag `introSeen` em solKnobs, o mesmo
//    padrão do tourChip da visita); ?intro=0 desliga, ?intro=1 força
//    (QA/demonstração);
//  - prefers-reduced-motion abre direto no fit, mesmo com ?intro=1 —
//    acessibilidade vence a demonstração;
//  - qualquer gesto (pointer/wheel/tecla — os MESMOS listeners de
//    controls.js que chamam eduTourUserExit) pula imediatamente para o fit
//    e a abertura nunca mais toca a câmera. O tempo físico corre normal
//    durante o plano-sequência: é só câmera.
export function createIntro(ctx){
  if (ctx.DET) return;

  var DURATION = 5.2;   // segundos simulados de plano-sequência (rawDelta)
  var state = { active:false, t:0, startedAt:0 };

  // Os hooks de leitura existem sempre que a factory roda (mesmo quando a
  // abertura não vai rodar nesta sessão): o chip da visita e o QA consultam
  // sem guardas. Sob ?det nem estes existem — __solInfo responde
  // available:false e o assert barato do QA cobre a inércia.
  ctx.introActive = function(){ return state.active; };
  ctx.introInfo = function(){
    return { available:true, active:state.active, t:+state.t.toFixed(2) };
  };

  var reduced = false;
  try {
    reduced = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){}
  var q = ctx.urlQ.intro;
  var seen = !!(ctx.savedKnobs && ctx.savedKnobs.introSeen);
  var wants = q === '1' ? true : q === '0' ? false : !seen;
  if (!wants || reduced) return;

  // A abertura conta como vista já no início (padrão persistChip): quem a
  // interrompe com um gesto não é assediado com a mesma vinheta na volta.
  // PR-13: sob ?kiosk=1 nada persiste — introSeen não grava e a abertura
  // roda a cada RELOAD do quiosque (não a cada volta do loop): cada
  // visitante que chega a um aparelho recarregado ganha o plano-sequência.
  if (!ctx.KIOSK){
    try {
      ctx.savedKnobs.introSeen = true;
      localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs));
    } catch(e){}
  }

  // O chrome (título/subtítulo/hint) começa invisível e faz fade-in ao
  // final via transição CSS. As classes só são aplicadas QUANDO a abertura
  // roda: sem ela (det/retorno/reduced-motion) o CSS do index fica intocado.
  var ui = document.getElementById('ui') || document.body;
  var style = document.createElement('style');
  style.id = 'introStyle';
  style.textContent = [
    '#ui.introRun #title-block,#ui.introRun #hint{transition:opacity 1.4s ease}',
    '#ui.introVeil #title-block,#ui.introVeil #hint{opacity:0}'
  ].join('');
  document.head.appendChild(style);
  ui.classList.add('introRun');
  ui.classList.add('introVeil');

  // O hint tem um fade-out de 6s armado no init; escondido pela abertura
  // ele expiraria sem nunca ser lido — o relógio recomeça no reveal.
  if (ctx.hintHideTimer !== undefined) clearTimeout(ctx.hintHideTimer);

  function startDist(){
    return Math.max(ctx.minDist*1.15, ctx.fitDist*0.45);
  }
  // easeInOutCubic: demora um instante sobre a granulação, acelera e
  // assenta no fit sem overshoot — movimento de grua, não lerp linear.
  function ease(x){
    x = Math.max(0, Math.min(1, x));
    return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2;
  }
  function reveal(){
    ui.classList.remove('introVeil');
    if (ctx.hideHint) ctx.hintHideTimer = setTimeout(ctx.hideHint, 6000);
  }
  function finish(toFit){
    if (!state.active) return;
    state.active = false;
    ctx.introTick = null;   // custo zero por frame depois do beat único
    ctx.targetCamDist = ctx.fitDist;
    // Término natural assenta exato no fit; o pulo por gesto deixa o
    // camDist corrente e o zoom amortecido do animate faz o resto — a
    // abertura nunca disputa a câmera com a pessoa.
    if (toFit) ctx.camDist = ctx.fitDist;
    reveal();
  }
  ctx.introUserSkip = function(){ finish(false); };

  state.active = true;
  state.startedAt = performance.now();
  // O primeiro frame já nasce no close-up: nada de piscar o fit antes.
  ctx.camDist = ctx.targetCamDist = startDist();

  ctx.introTick = function(rawDelta){
    if (!state.active) return;
    // Autoria única da câmera: visita/diretor (QA pode ligá-los por hook)
    // ou qualquer interação marcada após o início encerram a abertura —
    // o mesmo relógio de interação do retorno suave da visita (tour.js).
    if (ctx.eduTourActive || (ctx.directorActive && ctx.directorActive()) ||
        ctx.lastInteraction > state.startedAt){ finish(false); return; }
    state.t += Math.max(0, rawDelta);
    if (state.t >= DURATION){ finish(true); return; }
    var p = ease(state.t/DURATION);
    var d0 = startDist();
    // camDist e alvo andam juntos: o zoom amortecido do animate vira no-op
    // e o enquadramento é exatamente a curva do ease, sem dupla filtragem.
    ctx.camDist = ctx.targetCamDist = d0 + (ctx.fitDist - d0)*p;
  };
}

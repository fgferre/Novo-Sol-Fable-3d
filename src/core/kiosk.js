// core/kiosk.js — modo quiosque (?kiosk=1, Série Museu PR-13): o arquivo
// único vira instalação de museu físico. Sem ninguém na frente, a visita
// guiada roda em loop sozinha, intercalada com a sessão de cinema; QUALQUER
// toque devolve o controle ao visitante (pelos mecanismos que já existem —
// eduTourUserExit/directorUserExit em controls.js) e o quiosque apenas
// espera nova inatividade para retomar o ciclo.
//
// Regras de inércia (as mesmas da camada edu):
//  - sob ?det=1 ou sem ?kiosk=1 a factory retorna ANTES de criar estado ou
//    tocar DOM — ctx.kioskTick fica undefined e o animate paga só um if
//    falsy por frame (paridade por construção);
//  - o quiosque NUNCA fabrica interação: ele lê ctx.lastInteraction (o
//    relógio único de controls.js) e dirige a visita/cinema pelos hooks
//    públicos (eduTourStart/eduTourNext/eduTourExit/directorStart).
//
// Persistência OFF: ctx.KIOSK (nascido em config.js) faz os pontos de
// gravação de solKnobs/solTier/coleção retornarem antes de gravar/ler —
// aparelho compartilhado, cada visitante recebe a experiência limpa; a
// coleção da sessão vive só em memória. Consequência desejada: introSeen
// não persiste e a abertura cinematográfica roda a cada reload do quiosque
// (mas NÃO a cada volta do loop — ela é da carga, não do ciclo).
//
// Relógios (segundos de parede via rawDelta, imunes a ?speed):
//  - KIOSK_IDLE_S   = 45  → inatividade antes de (re)começar a visita;
//  - KIOSK_STEP_S   = 26  → leitura por etapa pronta antes do auto-avanço;
//  - KIOSK_UNAVAIL_S = 8  → piso para etapa indisponível (o texto honesto
//    "indisponível" é curto — avança antes dos 26s, mas NUNCA antes de 8s);
//  - KIOSK_RESUME_S = 60  → visita abandonada em modo manual é encerrada e
//    o ciclo volta ao idle.
// Overrides de URL (?kioskidle=&kioskstep=&kioskresume=) são USO EXCLUSIVO
// DE QA (tools/qa-kiosk.js encurta os relógios); a instalação real usa os
// padrões acima.

export function createKiosk(ctx){
  if (ctx.DET || !ctx.KIOSK) return;

  function clockOf(key, fallback){
    var v = parseFloat(ctx.urlQ[key]);
    return (v > 0) ? v : fallback;
  }
  var IDLE_S    = clockOf('kioskidle', 45);
  var STEP_S    = clockOf('kioskstep', 26);
  var RESUME_S  = clockOf('kioskresume', 60);
  var UNAVAIL_S = Math.min(8, STEP_S);

  // ---------------------------------------------------------------
  // Distrações de operador desligadas: visitante de quiosque não configura.
  //  - gesto do HUD (segurar 1s, controls.js) fica inerte: o timer continua
  //    disparando, mas ctx.hudToggle agora é um no-op (?hud=1 na URL da
  //    instalação segue funcionando — é decisão do operador, não gesto);
  //  - a engrenagem some (hidden + display inline: o CSS do painel dá
  //    display:flex ao #knobBtn, que venceria o [hidden] do UA);
  //  - o chip da visita some via syncChip (tour.js lê ctx.KIOSK) — o
  //    quiosque JÁ conduz a visita, o convite seria redundante.
  // ---------------------------------------------------------------
  ctx.hudToggle = function(){ return ctx.hudOn; };
  var gear = document.getElementById('knobBtn');
  if (gear){ gear.hidden = true; gear.style.display = 'none'; }

  // Máquina de 3 modos. 'idle' espera IDLE_S sem interação; 'tour' conduz a
  // visita (auto-avanço só em modo assistido); 'cinema' espera a sequência
  // do diretor completar UMA volta (ou o visitante assumir) e volta ao idle.
  var mode = 'idle';
  var idleT = 0;      // s sem interação no idle
  var readyT = 0;     // s da etapa corrente em 'reading'
  var manualT = 0;    // s sem interação com a visita em modo manual
  var stepIndex = -1;
  var lastSeenInteraction = ctx.lastInteraction;
  var prevDirT = -1;

  // Interação = o relógio de controls.js andou desde o último frame. O
  // quiosque nunca escreve nesse relógio — só observa.
  function interacted(){
    if (ctx.lastInteraction !== lastSeenInteraction){
      lastSeenInteraction = ctx.lastInteraction;
      return true;
    }
    return false;
  }
  function toIdle(){ mode = 'idle'; idleT = 0; }

  function tick(rawDelta){
    var dt = Math.max(0, rawDelta);
    var touched = interacted();

    if (mode === 'idle'){
      // Palco ocupado por outra autoria (abertura cinematográfica da carga;
      // visita/cinema abertos por hook de QA): o relógio de atração espera.
      if ((ctx.introActive && ctx.introActive()) || ctx.eduTourActive ||
          (ctx.directorActive && ctx.directorActive())){ idleT = 0; return; }
      idleT = touched ? 0 : idleT + dt;
      if (idleT >= IDLE_S && ctx.eduTourStart){
        idleT = 0;
        ctx.eduTourStart();
        mode = 'tour'; stepIndex = -1; readyT = 0; manualT = 0;
      }
      return;
    }

    if (mode === 'tour'){
      var info = ctx.eduTourInfo ? ctx.eduTourInfo() : null;
      // Saída pelo botão do cartão/hook: o ciclo recomeça do idle.
      if (!info || !info.active){ toIdle(); return; }
      if (info.index !== stepIndex){ stepIndex = info.index; readyT = 0; }
      if (!info.assist){
        // O visitante assumiu a câmera (o mecanismo existente já devolveu o
        // controle) — o quiosque NUNCA avança uma visita em modo manual.
        // Abandonada por RESUME_S sem interação, a visita é encerrada e o
        // ciclo volta ao idle (que conta IDLE_S de novo antes de retomar).
        readyT = 0;
        manualT = touched ? 0 : manualT + dt;
        if (manualT >= RESUME_S){
          if (ctx.eduTourExit) ctx.eduTourExit('kiosk');
          toIdle();
        }
        return;
      }
      manualT = 0;
      // Interação em modo assistido (ex.: abrir "+ Ler" no cartão): a
      // pessoa está lendo — o relógio de leitura da etapa recomeça.
      if (touched){ readyT = 0; return; }
      if (info.phase === 'reading'){
        readyT += dt;
        var wait = (info.source && info.source.unavailable) ? UNAVAIL_S : STEP_S;
        if (readyT >= wait){
          readyT = 0;
          var last = info.index >= info.total - 1;
          if (ctx.eduTourNext) ctx.eduTourNext();
          if (last){
            // 10ª sala concluída (o next acima encerrou a visita com
            // 'complete') → sessão de cinema. O retorno suave de pose que o
            // end() arma converge em ~2s e cede ao diretor (o lerp do
            // restore é ~20x mais forte que o do beat B0) — transição
            // aceita: a visita devolve o quadro, o filme o toma.
            if (ctx.directorStart){
              ctx.directorStart();
              mode = 'cinema'; prevDirT = -1;
            } else toIdle();
          }
        }
      }
      return;
    }

    // mode === 'cinema'
    if (!(ctx.directorActive && ctx.directorActive())){
      // O visitante assumiu (dirT=-999 via directorUserExit) — volta ao
      // idle; enquanto houver atividade o idle não conta.
      toIdle(); return;
    }
    var t = ctx.dirT;
    if (prevDirT >= 0 && t < prevDirT - 1){
      // O relógio da sequência reciclou (t>=84 → 0): uma volta completa de
      // cinema. directorUserExit é a única saída pública — devolve câmera,
      // foco e overrides exatamente como um gesto faria.
      if (ctx.directorUserExit) ctx.directorUserExit();
      toIdle(); return;
    }
    prevDirT = t;
  }

  ctx.kioskTick = tick;
  // Introspecção p/ QA (window.__solInfo.kioskInfo em solinfo.js).
  ctx.kioskInfo = function(){
    return { available:true, mode:mode,
             idleT:+idleT.toFixed(2), readyT:+readyT.toFixed(2),
             manualT:+manualT.toFixed(2),
             clocks:{ idle:IDLE_S, step:STEP_S, resume:RESUME_S, unavail:UNAVAIL_S } };
  };
}

// debug/diag.js — diagnóstico opt-in (?diag=1): manifesto do ambiente
// coletado UMA vez (userAgent, GPU real via WEBGL_debug_renderer_info,
// versão WebGL, DPR, tier, drawing buffer, knobs ativos do painel) +
// ring limitado (128) de eventos estruturais com timestamp (resize,
// escala do auto-tune, ciclos de bake da cromosfera, ciclo/upload da
// coroa volumétrica, contexto WebGL perdido/restaurado).
// Sem ?diag=1 a factory retorna ANTES de tudo: ctx.diagEvent segue o
// no-op pré-resolvido do createConfig (função vazia — os pontos de
// evento pagam só a chamada, sem alocação nem concat), nenhum listener
// é registrado e nenhum manifesto é coletado — custo zero.

export function createDiag(ctx){
  if (ctx.urlQ.diag !== '1') return;

  var renderer = ctx.renderer;
  var RING = 128;
  var evts = new Array(RING);
  var evN = 0, evIdx = 0;
  // payloads a/b são PRIMITIVOS opcionais: os call sites só passam
  // leituras baratas (variável/propriedade) — objetos/arrays nascem
  // AQUI, onde só rodam com o diag ligado
  function diagEvent(name, a, b){
    var e = { t: +performance.now().toFixed(1), name: name };
    if (a !== undefined) e.data = (b !== undefined) ? [a, b] : a;
    evts[evIdx] = e;
    evIdx = (evIdx + 1) % RING;
    if (evN < RING) evN++;
  }
  ctx.diagEvent = diagEvent;

  // manifesto: coletado uma vez, na inicialização (o snapshot de knobs
  // é o MESMO objeto que o painel usa — __solInfo.knobs())
  var gl = renderer.getContext();
  var glRenderer = '', glVendor = '', glVersion = '';
  try {
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    glRenderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    glVendor = String(gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
    glVersion = String(gl.getParameter(gl.VERSION));
  } catch(e){}
  var manifest = {
    userAgent: navigator.userAgent,
    glRenderer: glRenderer,
    glVendor: glVendor,
    glVersion: glVersion,
    webgl2: !!(renderer.capabilities && renderer.capabilities.isWebGL2),
    dpr: window.devicePixelRatio || 1,
    pixelRatio: ctx.pixelRatio,
    tier: ctx.TIER,
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    knobs: (window.__solInfo && window.__solInfo.knobs) ? window.__solInfo.knobs() : null
  };

  // contexto WebGL perdido/restaurado — listeners SÓ existem com ?diag=1
  renderer.domElement.addEventListener('webglcontextlost', function(){
    diagEvent('webglcontextlost');
  });
  renderer.domElement.addEventListener('webglcontextrestored', function(){
    diagEvent('webglcontextrestored');
  });

  // leitura p/ o hook __solInfo.diagnostics(): eventos em ordem
  // cronológica (o ring é reconstruído a cada chamada — é QA, não frame)
  ctx.diagData = function(){
    var out = [];
    for (var i = 0; i < evN; i++)
      out.push(evts[(evIdx - evN + i + RING) % RING]);
    return { manifest: manifest, events: out };
  };

  console.info('[diag] manifesto:', manifest);
}

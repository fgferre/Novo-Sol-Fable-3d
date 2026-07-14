// debug/gpuprofile.js — timer de GPU opt-in (?profile=1) via
// EXT_disjoint_timer_query_webgl2: mede o tempo de GPU do frame inteiro
// (uma query em voo por vez, poll assíncrono, amostras descartadas em
// GPU_DISJOINT_EXT) numa janela deslizante de ~300 amostras.
// Sem ?profile=1 a factory retorna ANTES de tocar no GL: nenhuma query
// criada, nenhum overlay, nenhum timer — custo zero no modo normal
// (ctx.gpuFrameBegin/End ficam undefined e o animate só faz um if falsy).

export function createGpuProfile(ctx){
  if (ctx.urlQ.profile !== '1') return;   // guard: sem a query nada executa

  var renderer = ctx.renderer;
  var gl = renderer.getContext();
  var ext = null;
  try { ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch(e){}
  var supported = !!(ext && gl.createQuery);

  // ring de amostras (ms) — mesma família do perfFrameMs do core/perf.js
  var RING = 300;
  var ring = new Float32Array(RING);
  var ringN = 0, ringIdx = 0;
  var active = null;    // query aberta NESTE frame
  var pending = null;   // query fechada aguardando resultado (uma em voo)

  // início do frame: primeiro o poll assíncrono da query em voo — se o
  // resultado chegou, grava e libera a slot; só então abre uma nova
  function gpuFrameBegin(){
    if (!supported) return;
    if (pending){
      var disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      var avail = gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE);
      if (avail || disjoint){
        // disjoint (troca de clock/energia, outra aba pesada): a medição
        // atravessou um evento externo — amostra DESCARTADA por espec
        if (avail && !disjoint){
          ring[ringIdx] = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
          ringIdx = (ringIdx + 1) % RING;
          if (ringN < RING) ringN++;
        }
        gl.deleteQuery(pending);
        pending = null;
      } else return;   // ainda em voo: este frame fica sem medição
    }
    active = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
  }
  // fim do frame (depois do composite): fecha a query aberta
  function gpuFrameEnd(){
    if (!supported || !active) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending = active; active = null;
  }

  function gpuPerf(){
    if (!supported || !ringN)
      return { supported: supported, samples: 0, avgMs: 0, p95Ms: 0, worstMs: 0 };
    var a = Array.prototype.slice.call(ring, 0, ringN).sort(function(x, y){ return x - y; });
    var s = 0; for (var i = 0; i < ringN; i++) s += a[i];
    return { supported: true, samples: ringN,
             avgMs: +(s/ringN).toFixed(2),
             p95Ms: +a[Math.min(ringN-1, Math.floor(ringN*0.95))].toFixed(2),
             worstMs: +a[ringN-1].toFixed(2) };
  }

  // overlay mínimo legível por leigo (canto oposto ao HUD de perf)
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:40;' +
    'font:12px/1.5 ui-monospace,Menlo,monospace;color:#cfe;' +
    'background:rgba(0,10,20,0.6);padding:5px 9px;border-radius:6px;' +
    'pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  if (!supported){
    el.textContent = 'GPU timer indisponível';
  } else {
    el.textContent = 'GPU: medindo…';
    setInterval(function(){
      var p = gpuPerf();
      if (!p.samples) return;
      el.textContent = 'GPU avg ' + p.avgMs.toFixed(2) + ' ms · p95 ' +
        p.p95Ms.toFixed(2) + ' ms · pior ' + p.worstMs.toFixed(2) + ' ms';
    }, 1000);
  }

  ctx.gpuFrameBegin = gpuFrameBegin;
  ctx.gpuFrameEnd = gpuFrameEnd;
  ctx.gpuPerf = gpuPerf;
}

// ui/panel.js — painel de ajustes (drawer): sliders dos knobs, presets,
// tier, HUD, diretor e reset. Corpo verbatim; escreve nos ctx.*_K e
// uniforms dos domínios (superfícies prontas — penúltimo do init).

export function createPanel(ctx){
  var sunUniforms = ctx.sunUniforms, compUniforms = ctx.compUniforms,
      coronaRaysUniforms = ctx.coronaRaysUniforms, stars = ctx.stars,
      brightStars = ctx.brightStars, milkyWay = ctx.milkyWay,
      mwNebUniforms = ctx.mwNebUniforms, EXP0 = ctx.EXP0,
      BLOOM_BASE0 = ctx.BLOOM_BASE0, STARS_OP0 = ctx.STARS_OP0,
      BRIGHT_OP0 = ctx.BRIGHT_OP0, LOOK_SUNSHINE = ctx.LOOK_SUNSHINE,
      TIER = ctx.TIER, TIER_ORDER = ctx.TIER_ORDER, hudEl = ctx.hudEl,
      setHudState = ctx.setHudState, persistTier = ctx.persistTier,
      applyRecommendedTier = ctx.applyRecommendedTier;

  // ---------------------------------------------------------------
  // PAINEL DE AJUSTES (drawer): sliders para os knobs cinematográficos,
  // com persistência em localStorage — no iPhone via arquivo local não
  // há query string, então o painel é o caminho principal de ajuste.
  // Prioridade: URL > painel salvo > default. Design: vidro fosco com
  // acento solar, coerente com a estética da cena.
  // ---------------------------------------------------------------
  (function buildKnobPanel(){
    var css = document.createElement('style');
    css.textContent = [
      '#knobBtn{position:fixed;right:14px;bottom:14px;z-index:45;width:44px;height:44px;',
      ' border-radius:50%;border:1px solid rgba(255,170,90,.28);color:#ffb877;font-size:18px;',
      ' background:rgba(12,16,26,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      ' display:flex;align-items:center;justify-content:center;cursor:pointer;',
      ' transition:transform .5s cubic-bezier(.22,1,.36,1),background .3s;user-select:none;-webkit-user-select:none}',
      '#knobBtn:hover{background:rgba(40,28,16,.72)}',
      '#hint{margin-right:64px}',
      '#knobBtn.open{transform:rotate(120deg)}',
      '#knobPanel{position:fixed;top:0;right:0;height:100%;width:min(330px,86vw);z-index:44;',
      ' background:linear-gradient(165deg,rgba(15,18,28,.82),rgba(7,9,15,.90));',
      ' backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25);',
      ' border-left:1px solid rgba(255,165,80,.14);box-shadow:-28px 0 70px rgba(0,0,0,.5);',
      ' transform:translateX(106%);transition:transform .55s cubic-bezier(.22,1,.36,1);',
      ' overflow-y:auto;overscroll-behavior:contain;padding:24px 22px 96px;box-sizing:border-box;',
      ' color:#e9e4da;touch-action:pan-y;font-family:inherit}',
      '#knobPanel.open{transform:translateX(0)}',
      '#knobPanel h2{margin:0 0 2px;font-size:15px;font-weight:600;letter-spacing:.04em;color:#ffd9a8}',
      '#knobPanel .sub{font-size:10.5px;color:rgba(233,228,218,.42);margin:0 0 14px}',
      '#knobPanel .sec{margin:20px 0 6px;font-size:9.5px;font-weight:600;letter-spacing:.22em;',
      ' text-transform:uppercase;color:rgba(255,160,80,.55)}',
      '#knobPanel .row{margin:10px 0 2px}',
      '#knobPanel .lab{display:flex;justify-content:space-between;font-size:12px;color:rgba(233,228,218,.85)}',
      '#knobPanel .val{font-variant-numeric:tabular-nums;color:rgba(255,190,130,.9);font-size:11.5px}',
      '#knobPanel .state{min-height:13px;margin-top:-2px;font-size:9.5px;line-height:1.35;',
      ' color:rgba(233,228,218,.46)}',
      '#knobPanel .row.unavailable .lab{opacity:.52}',
      '#knobPanel .row.unavailable input{opacity:.45}',
      'input[type=range].kn{-webkit-appearance:none;appearance:none;width:100%;height:24px;',
      ' background:transparent;margin:0;display:block}',
      'input[type=range].kn::-webkit-slider-runnable-track{height:3px;border-radius:2px;',
      ' background:linear-gradient(90deg,#ff9a3c var(--f,50%),rgba(255,255,255,.13) var(--f,50%))}',
      'input[type=range].kn::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;',
      ' border-radius:50%;margin-top:-6px;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);',
      ' box-shadow:0 0 10px rgba(255,140,50,.55),0 1px 3px rgba(0,0,0,.6)}',
      'input[type=range].kn::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.13)}',
      'input[type=range].kn::-moz-range-progress{height:3px;border-radius:2px;background:#ff9a3c}',
      'input[type=range].kn::-moz-range-thumb{width:15px;height:15px;border-radius:50%;border:none;',
      ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);box-shadow:0 0 10px rgba(255,140,50,.55)}',
      '#knobPanel .switch{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}',
      '#knobPanel .sw{position:relative;width:40px;height:22px;border-radius:12px;cursor:pointer;',
      ' background:rgba(255,255,255,.14);transition:background .25s}',
      '#knobPanel .sw.on{background:rgba(255,140,50,.75)}',
      '#knobPanel .sw::after{content:"";position:absolute;top:2.5px;left:3px;width:17px;height:17px;',
      ' border-radius:50%;background:#f5efe6;transition:transform .25s cubic-bezier(.22,1,.36,1);',
      ' box-shadow:0 1px 3px rgba(0,0,0,.4)}',
      '#knobPanel .sw.on::after{transform:translateX(17px)}',
      '#knobReset{margin-top:22px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.3);background:transparent;color:#ffb877;font-size:12px;',
      ' letter-spacing:.05em;transition:background .25s}',
      '#knobReset:hover{background:rgba(255,140,50,.12)}',
      // botão do preset (mesma linguagem do reset, cheio de laranja)
      '#lookBtn,#dirBtn{margin-top:14px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.45);background:rgba(255,140,50,.16);color:#ffd9a8;',
      ' font-size:12px;letter-spacing:.05em;transition:background .25s}',
      '#lookBtn:hover,#dirBtn:hover{background:rgba(255,140,50,.28)}',
      '#dirBtn{margin-top:8px}',
      // seletor segmentado de tier (troca exige recarregar — decisão de boot)
      '#tierRow{display:flex;gap:6px;margin:8px 0 2px}',
      '#tierRow button{flex:1;padding:7px 0;border-radius:8px;cursor:pointer;font-size:11px;',
      ' border:1px solid rgba(255,170,90,.25);background:transparent;color:rgba(233,228,218,.75);',
      ' letter-spacing:.04em;transition:background .25s}',
      '#tierRow button.cur{background:rgba(255,140,50,.30);color:#ffd9a8;border-color:rgba(255,170,90,.55)}',
      '#tierNote{font-size:10px;color:rgba(233,228,218,.46);margin:4px 0 0}',
      '#tierApply{display:none;margin-top:7px;width:100%;padding:7px 0;border-radius:8px;cursor:pointer;',
      ' border:1px solid rgba(255,170,90,.32);background:rgba(255,140,50,.10);color:#ffd9a8;font-size:10.5px}'
    ].join('\n');
    document.head.appendChild(css);

    function saveKnob(k, v){
      try {
        ctx.savedKnobs[k] = v;
        localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs));
      } catch(e){}
    }
    var DEFS = [
      { sec: 'tempo' },
      { k:'speed', label:'Ritmo do tempo', lo:0.05, hi:2, step:0.05, dflt:1,
        get:function(){ return ctx.TIME_SCALE; }, set:function(v){ ctx.TIME_SCALE = v; } },
      { k:'pmode', label:'Oscilações (p-modes)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return sunUniforms.uPmode.value; },
        set:function(v){ sunUniforms.uPmode.value = v; } },
      { k:'cycle', label:'Ciclo de 11 anos', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CYCLE_K; }, set:function(v){ ctx.CYCLE_K = v; } },
      { k:'lapse', label:'Time-lapse do ciclo', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.LAPSE_K; }, set:function(v){ ctx.LAPSE_K = v; } },
      // FASE 6: multiplicidade/proporção das manchas (grupos como nas
      // refs GONG; a contagem acompanha a fase do ciclo)
      { k:'spots', label:'Manchas solares (grupos)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.SPOTS_K; }, set:function(v){ ctx.SPOTS_K = v; } },
      { sec: 'luz & cor' },
      { k:'bloom', label:'Bloom', lo:0, hi:2.5, step:0.05, dflt:1,
        get:function(){ return ctx.BLOOM_STRENGTH_BASE/BLOOM_BASE0; },
        set:function(v){ ctx.BLOOM_STRENGTH_BASE = BLOOM_BASE0*v; } },
      { k:'exposure', label:'Exposição', lo:0.5, hi:1.8, step:0.02, dflt:1,
        get:function(){ return compUniforms.uExposure.value/EXP0; },
        set:function(v){ compUniforms.uExposure.value = EXP0*v; } },
      { k:'plageglow', label:'Brilho das plages', lo:0, hi:1.2, step:0.05, dflt:0.35,
        get:function(){ return sunUniforms.uPlageEm.value; },
        set:function(v){ sunUniforms.uPlageEm.value = v; } },
      // Achado 4 (PR 11): default recalibrado — o mix de saturação opera
      // em linear desde a OETF única; 1.08 é o novo neutro calibrado
      { k:'sat', label:'Saturação', lo:0, hi:1.6, step:0.02, dflt:1.08,
        get:function(){ return compUniforms.uSat.value; },
        set:function(v){ compUniforms.uSat.value = v; } },
      { k:'vig', label:'Vinheta', lo:0, hi:1.2, step:0.05, dflt:0.55,
        get:function(){ return compUniforms.uVig.value; },
        set:function(v){ compUniforms.uVig.value = v; } },
      { k:'grain', label:'Grão de filme', lo:0, hi:4, step:0.1, dflt:1,
        get:function(){ return compUniforms.uGrain.value; },
        set:function(v){ compUniforms.uGrain.value = v; } },
      { sec: 'cinema' },
      { k:'veil', label:'Halação (glare)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.VEIL_BASE; }, set:function(v){ ctx.VEIL_BASE = v; } },
      { k:'streak', label:'Flare anamórfico', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.STREAK_K; }, set:function(v){ ctx.STREAK_K = v; } },
      { k:'burst', label:'Starburst (difração)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.BURST_K; }, set:function(v){ ctx.BURST_K = v; } },
      { k:'disp', label:'Bloom espectral (dispersão)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.DISP_K; }, set:function(v){ ctx.DISP_K = v; } },
      { k:'hal', label:'Halação quente (corpo negro)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.HAL_K; }, set:function(v){ ctx.HAL_K = v; } },
      { k:'adapt', label:'Olho (adaptação)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return ctx.ADAPT_K; }, set:function(v){ ctx.ADAPT_K = v; } },
      { k:'fringe', label:'Franja da lente', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFringe.value; },
        set:function(v){ compUniforms.uFringe.value = v; } },
      { k:'shimmer', label:'Calor no limbo', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return compUniforms.uShimmer.value; },
        set:function(v){ compUniforms.uShimmer.value = v; } },
      { k:'tone', label:'Grade Sunshine', lo:0, hi:1.2, step:0.05, dflt:0,
        get:function(){ return compUniforms.uTone.value; },
        set:function(v){ compUniforms.uTone.value = v; } },
      { k:'film', label:'Filme (ACES→AgX)', lo:0, hi:1, step:0.05, dflt:0,
        get:function(){ return compUniforms.uFilm.value; },
        set:function(v){ compUniforms.uFilm.value = v; } },
      { k:'hand', label:'Câmera de mão', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.HAND_K; }, set:function(v){ ctx.HAND_K = v; } },
      { k:'dof', label:'Foco raso (bokeh hex)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.DOF_K; }, set:function(v){ ctx.DOF_K = v; } },
      { sec: 'coroa' },
      { k:'halo', label:'Halo coronal', lo:0, hi:1.6, step:0.05, dflt:0.55,
        get:function(){ return coronaRaysUniforms.uHalo.value; },
        set:function(v){ coronaRaysUniforms.uHalo.value = v; } },
      { k:'ray', label:'Streamers', lo:0, hi:2.5, step:0.05, dflt:0.9,
        get:function(){ return coronaRaysUniforms.uRayBoost.value; },
        set:function(v){ coronaRaysUniforms.uRayBoost.value = v; } },
      { k:'cact', label:'Resposta à atividade', lo:0, hi:1.5, step:0.05, dflt:0.5,
        get:function(){ return coronaRaysUniforms.uActGain.value; },
        set:function(v){ coronaRaysUniforms.uActGain.value = v; } },
      { k:'cvol', label:'Coroa volumétrica (raymarch)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CVOL_K; }, set:function(v){ ctx.CVOL_K = v; },
        availability:function(){
          if (ctx.CVOL_STEPS <= 0) return 'indisponível nesta qualidade';
          if (ctx.cvolKilled) return 'desativada pelo ajuste automático';
          return '';
        } },
      { k:'cme', label:'CME (erupção)', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.CME_K; }, set:function(v){ ctx.CME_K = v; },
        availability:function(){
          if (ctx.CME_STEPS <= 0) return 'indisponível nesta qualidade';
          if (ctx.cmeKilled) return 'desativada pelo ajuste automático';
          return '';
        } },
      { k:'loops', label:'Loops coronais', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.LOOP_K; }, set:function(v){ ctx.LOOP_K = v; } },
      { k:'fprom', label:'Filamento ↔ proeminência', lo:0, hi:1.5, step:0.05, dflt:0,
        get:function(){ return ctx.FPROM_K; }, set:function(v){ ctx.FPROM_K = v; } },
      { sec: 'céu' },
      { k:'stars', label:'Estrelas', lo:0, hi:2, step:0.05, dflt:1,
        get:function(){ return stars.material.opacity/STARS_OP0; },
        set:function(v){ stars.material.opacity = Math.min(1, STARS_OP0*v);
                         brightStars.material.opacity = Math.min(1, BRIGHT_OP0*v); } },
      { k:'mw', label:'Via Láctea', lo:0, hi:1, step:0.02, dflt:0.62,
        get:function(){ return milkyWay.material.opacity; },
        set:function(v){ milkyWay.material.opacity = v; mwNebUniforms.uMW.value = v; } },
      { sec: 'câmera' }
    ];

    var panel = document.createElement('div');
    panel.id = 'knobPanel';
    var head = document.createElement('h2'); head.textContent = 'Ajustes';
    var sub = document.createElement('p'); sub.className = 'sub';
    sub.textContent = 'cena, luz e câmera · salvo neste aparelho';
    panel.appendChild(head); panel.appendChild(sub);

    var sliders = [];
    var sliderByKey = {};
    DEFS.forEach(function(d){
      if (d.sec){
        var s = document.createElement('div'); s.className = 'sec';
        s.textContent = d.sec; panel.appendChild(s); return;
      }
      var row = document.createElement('div'); row.className = 'row';
      var lab = document.createElement('div'); lab.className = 'lab';
      var name = document.createElement('span'); name.textContent = d.label;
      var val = document.createElement('span'); val.className = 'val';
      lab.appendChild(name); lab.appendChild(val);
      var inp = document.createElement('input');
      inp.type = 'range'; inp.className = 'kn';
      inp.min = d.lo; inp.max = d.hi; inp.step = d.step;
      function paint(v){
        val.textContent = (+v).toFixed(2);
        inp.style.setProperty('--f', (100*(v - d.lo)/(d.hi - d.lo)) + '%');
      }
      inp.value = d.get(); paint(inp.value);
      inp.addEventListener('input', function(){
        var v = parseFloat(inp.value);
        // Uma edição é uma tomada explícita de controle. O valor é lido
        // antes da saída, porque a restauração do diretor também sincroniza
        // o DOM e não pode apagar o gesto que acabou de acontecer.
        if (ctx.directorUserExit) ctx.directorUserExit();
        d.set(v); paint(v); saveKnob(d.k, v);
      });
      row.appendChild(lab); row.appendChild(inp);
      var state = document.createElement('div'); state.className = 'state';
      row.appendChild(state);
      panel.appendChild(row);
      var entry = { d: d, inp: inp, paint: paint, row: row, state: state };
      sliders.push(entry); sliderByKey[d.k] = entry;
    });

    function syncControlUI(keys){
      (keys || Object.keys(sliderByKey)).forEach(function(k){
        var s = sliderByKey[k]; if (!s) return;
        var v = s.d.get(); s.inp.value = v; s.paint(v);
      });
    }
    function refreshAvailability(){
      sliders.forEach(function(s){
        var msg = s.d.availability ? s.d.availability() : '';
        s.inp.disabled = !!msg;
        s.row.classList.toggle('unavailable', !!msg);
        s.state.textContent = msg;
      });
      refreshTierRecommendation();
    }
    ctx.syncControlUI = syncControlUI;
    ctx.onPerformanceStateChange = refreshAvailability;

    // switch da câmera idle cinematográfica
    var swRow = document.createElement('div'); swRow.className = 'switch';
    var swLab = document.createElement('span'); swLab.textContent = 'Câmera contemplativa';
    var sw = document.createElement('div'); sw.className = 'sw' + (ctx.IDLE_CINE ? ' on' : '');
    sw.addEventListener('click', function(){
      if (ctx.directorUserExit) ctx.directorUserExit();
      ctx.IDLE_CINE = !ctx.IDLE_CINE;
      sw.classList.toggle('on', ctx.IDLE_CINE);
      saveKnob('idle', ctx.IDLE_CINE ? 1 : 0);
    });
    swRow.appendChild(swLab); swRow.appendChild(sw);
    panel.appendChild(swRow);

    // ---- look ----------------------------------------------------
    // aplica o preset Sunshine AO VIVO pelos setters dos sliders (os
    // mesmos 14 pares do ?look=sunshine) — pedido do dono: nada de URL
    var secLook = document.createElement('div'); secLook.className = 'sec';
    secLook.textContent = 'look'; panel.appendChild(secLook);
    var lookBtn = document.createElement('button');
    lookBtn.id = 'lookBtn'; lookBtn.textContent = 'aplicar look Sunshine';
    lookBtn.addEventListener('click', function(){
      if (ctx.directorUserExit) ctx.directorUserExit();
      sliders.forEach(function(s){
        var v = LOOK_SUNSHINE[s.d.k];
        if (v === undefined) return;
        s.d.set(v); s.inp.value = v; s.paint(v); saveKnob(s.d.k, v);
      });
    });
    panel.appendChild(lookBtn);
    // FASE 5 — modo diretor SEM URL: a sequência-atração é controle
    // in-app como tudo o mais. O botão fecha o painel e entrega a
    // câmera ao diretor; qualquer arrasto/scroll/tecla devolve o
    // controle (e restaura os knobs emprestados).
    var dirBtn = document.createElement('button');
    dirBtn.id = 'dirBtn';
    dirBtn.textContent = '▶ modo diretor (sequência)';
    dirBtn.addEventListener('click', function(){
      ctx.directorStart();
      panel.classList.remove('open');
      btn.classList.remove('open');
    });
    panel.appendChild(dirBtn);

    // ---- diagnóstico ----------------------------------------------
    var secDiag = document.createElement('div'); secDiag.className = 'sec';
    secDiag.textContent = 'diagnóstico'; panel.appendChild(secDiag);
    var hudRow = document.createElement('div'); hudRow.className = 'switch';
    var hudLab = document.createElement('span'); hudLab.textContent = 'HUD de FPS';
    var hudSw = document.createElement('div'); hudSw.className = 'sw' + (ctx.hudOn ? ' on' : '');
    hudSw.addEventListener('click', function(){
      setHudState(!ctx.hudOn);
    });
    ctx.onHudStateChange = function(on){ hudSw.classList.toggle('on', on); };
    hudRow.appendChild(hudLab); hudRow.appendChild(hudSw);
    panel.appendChild(hudRow);

    // ---- qualidade (tier) ------------------------------------------
    // o tier dimensiona buffers/shaders no BOOT — trocar recarrega a
    // página; a escolha persiste em localStorage (solTier) e o botão
    // limpa qualquer ?tier= da URL para a persistência valer
    var secTier = document.createElement('div'); secTier.className = 'sec';
    secTier.textContent = 'qualidade'; panel.appendChild(secTier);
    var tierRow = document.createElement('div'); tierRow.id = 'tierRow';
    TIER_ORDER.forEach(function(t){
      var tb = document.createElement('button');
      tb.textContent = t;
      if (t === TIER) tb.className = 'cur';
      tb.addEventListener('click', function(){
        if (t === TIER) return;
        if (ctx.directorUserExit) ctx.directorUserExit();
        persistTier(t);
        var q = (location.search || '').replace(/^\?/, '').split('&')
          .filter(function(kv){ return kv && kv.indexOf('tier=') !== 0; }).join('&');
        location.href = location.pathname + (q ? '?' + q : '');
      });
      tierRow.appendChild(tb);
    });
    panel.appendChild(tierRow);
    var tierNote = document.createElement('p'); tierNote.id = 'tierNote';
    tierNote.textContent = 'trocar a qualidade recarrega a cena';
    panel.appendChild(tierNote);
    var tierApply = document.createElement('button'); tierApply.id = 'tierApply';
    tierApply.addEventListener('click', function(){
      if (!applyRecommendedTier()) return;
      var q = (location.search || '').replace(/^\?/, '').split('&')
        .filter(function(kv){ return kv && kv.indexOf('tier=') !== 0; }).join('&');
      location.href = location.pathname + (q ? '?' + q : '');
    });
    panel.appendChild(tierApply);
    function refreshTierRecommendation(){
      var t = ctx.recommendedTier;
      tierNote.textContent = t
        ? 'qualidade recomendada para a próxima carga: ' + t
        : 'trocar a qualidade recarrega a cena';
      tierApply.style.display = t ? 'block' : 'none';
      tierApply.textContent = t ? 'aplicar ' + t + ' e recarregar' : '';
    }
    refreshTierRecommendation();

    var reset = document.createElement('button');
    reset.id = 'knobReset'; reset.textContent = 'restaurar padrão';
    reset.addEventListener('click', function(){
      if (!window.confirm('Restaurar toda a sessão e recarregar a cena?')) return;
      if (ctx.directorUserExit) ctx.directorUserExit();
      setHudState(false);
      ctx.cmeKilled = false; ctx.cvolKilled = false; ctx.recommendedTier = null;
      try { localStorage.removeItem('solKnobs'); localStorage.removeItem('solTier'); } catch(e){}
      ctx.savedKnobs = {};
      var controlKeys = sliders.map(function(s){ return s.d.k; });
      var uiKeys = controlKeys.concat(['look','idle','director','hud','tier','tune','scale']);
      try {
        var target = new URL(location.href);
        uiKeys.forEach(function(k){ target.searchParams.delete(k); });
        location.replace(target.href);
      } catch(e){ location.reload(); }
    });
    panel.appendChild(reset);
    refreshAvailability();
    document.body.appendChild(panel);

    var btn = document.createElement('div');
    btn.id = 'knobBtn'; btn.title = 'ajustes';
    btn.textContent = '⚙';
    btn.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      if (open) refreshAvailability();
      // o ⚙ acompanha a borda do painel (não flutua sobre os controles)
      // e o HUD desliza para fora da área coberta — quem mexe em knobs
      // de custo é exatamente quem quer ver o fps
      var edge = 'calc(min(330px, 86vw) + 14px)';
      btn.style.right = open ? edge : '14px';
      hudEl.style.right = open ? 'calc(min(330px, 86vw) + 18px)' : '10px';
    });
    btn.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1), background .3s, right .55s cubic-bezier(.22,1,.36,1)';
    hudEl.style.transition = 'right .55s cubic-bezier(.22,1,.36,1)';
    document.body.appendChild(btn);
  })();
}

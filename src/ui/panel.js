// ui/panel.js — drawer de controles dirigido exclusivamente pelo schema
// central. O painel exibe o valor nominal; overrides/condições entram na
// linha curta de estado sem tomar o lugar do controle.

export function createPanel(ctx){
  var hudEl = ctx.hudEl, TIER = ctx.TIER, TIER_ORDER = ctx.TIER_ORDER;
  var defs = ctx.CONTROL_SCHEMA.filter(function(d){ return !d.hidden; });

  var css = document.createElement('style');
  css.textContent = [
    '#knobBtn{position:fixed;right:14px;bottom:14px;z-index:45;width:44px;height:44px;',
    ' border-radius:50%;border:1px solid rgba(255,170,90,.28);color:#ffb877;font-size:18px;',
    ' background:rgba(12,16,26,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
    ' display:flex;align-items:center;justify-content:center;cursor:pointer;',
    ' transition:transform .5s cubic-bezier(.22,1,.36,1),background .3s,right .55s cubic-bezier(.22,1,.36,1);',
    ' user-select:none;-webkit-user-select:none}',
    '#knobBtn:hover{background:rgba(40,28,16,.72)}#knobBtn.open{transform:rotate(120deg)}',
    '#hint{margin-right:64px}',
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
    '#knobPanel .state{font-size:9.5px;line-height:1.35;color:rgba(233,228,218,.48)}',
    '#knobPanel .state:empty{display:none}',
    '#knobPanel .rowAction{margin:3px 0 1px;padding:4px 9px;border-radius:7px;cursor:pointer;',
    ' border:1px solid rgba(255,170,90,.25);background:rgba(255,140,50,.08);color:#ffc891;font-size:10px}',
    '#knobPanel .rowAction:disabled{opacity:.38;cursor:default}#knobPanel .rowAction[hidden]{display:none}',
    '#knobPanel .row.unavailable .lab{opacity:.52}#knobPanel .row.unavailable input{opacity:.45}',
    'input[type=range].kn{-webkit-appearance:none;appearance:none;width:100%;height:24px;',
    ' background:transparent;margin:0;display:block}',
    'input[type=range].kn::-webkit-slider-runnable-track{height:3px;border-radius:2px;',
    ' background:linear-gradient(90deg,#ff9a3c var(--f,50%),rgba(255,255,255,.13) var(--f,50%))}',
    'input[type=range].kn::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;',
    ' border-radius:50%;margin-top:-6px;border:none;background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);',
    ' box-shadow:0 0 10px rgba(255,140,50,.55),0 1px 3px rgba(0,0,0,.6)}',
    'input[type=range].kn::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.13)}',
    'input[type=range].kn::-moz-range-progress{height:3px;border-radius:2px;background:#ff9a3c}',
    'input[type=range].kn::-moz-range-thumb{width:15px;height:15px;border-radius:50%;border:none;',
    ' background:radial-gradient(circle at 35% 35%,#ffdcae,#ff8a2a);box-shadow:0 0 10px rgba(255,140,50,.55)}',
    '#knobPanel .switch{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}',
    '#knobPanel .sw{position:relative;width:40px;height:22px;border:0;padding:0;border-radius:12px;cursor:pointer;',
    ' background:rgba(255,255,255,.14);transition:background .25s}',
    '#knobPanel .sw.on{background:rgba(255,140,50,.75)}',
    '#knobPanel .sw::after{content:"";position:absolute;top:2.5px;left:3px;width:17px;height:17px;',
    ' border-radius:50%;background:#f5efe6;transition:transform .25s cubic-bezier(.22,1,.36,1);',
    ' box-shadow:0 1px 3px rgba(0,0,0,.4)}#knobPanel .sw.on::after{transform:translateX(17px)}',
    '#knobReset{margin-top:22px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
    ' border:1px solid rgba(255,170,90,.3);background:transparent;color:#ffb877;font-size:12px;',
    ' letter-spacing:.05em;transition:background .25s}#knobReset:hover{background:rgba(255,140,50,.12)}',
    '#lookBtn,#dirBtn{margin-top:14px;width:100%;padding:9px 0;border-radius:9px;cursor:pointer;',
    ' border:1px solid rgba(255,170,90,.45);background:rgba(255,140,50,.16);color:#ffd9a8;',
    ' font-size:12px;letter-spacing:.05em;transition:background .25s}',
    '#lookBtn:hover,#dirBtn:hover{background:rgba(255,140,50,.28)}#dirBtn{margin-top:8px}',
    '#tierRow{display:flex;gap:6px;margin:8px 0 2px}',
    '#tierRow button{flex:1;padding:7px 0;border-radius:8px;cursor:pointer;font-size:11px;',
    ' border:1px solid rgba(255,170,90,.25);background:transparent;color:rgba(233,228,218,.75);',
    ' letter-spacing:.04em;transition:background .25s}',
    '#tierRow button.cur{background:rgba(255,140,50,.30);color:#ffd9a8;border-color:rgba(255,170,90,.55)}',
    '#tierNote{font-size:10px;color:rgba(233,228,218,.46);margin:4px 0 0}',
    '#tierApply{display:none;margin-top:7px;width:100%;padding:7px 0;border-radius:8px;cursor:pointer;',
    ' border:1px solid rgba(255,170,90,.32);background:rgba(255,140,50,.10);color:#ffd9a8;font-size:10.5px}',
    '#knobPanel button:focus-visible,#knobBtn:focus-visible,#knobPanel input:focus-visible{',
    ' outline:2px solid rgba(255,190,125,.9);outline-offset:3px}'
  ].join('\n');
  document.head.appendChild(css);

  var panel = document.createElement('div'); panel.id = 'knobPanel';
  panel.setAttribute('aria-label','Ajustes da cena'); panel.setAttribute('aria-hidden','true');
  panel.inert = true;
  var head = document.createElement('h2'); head.textContent = 'Ajustes';
  var sub = document.createElement('p'); sub.className = 'sub';
  sub.textContent = 'cena, luz e câmera · salvo neste aparelho';
  panel.appendChild(head); panel.appendChild(sub);

  var entries = Object.create(null), lastSection = '';
  defs.forEach(function(d){
    if (d.section !== lastSection){
      lastSection = d.section;
      var sec = document.createElement('div'); sec.className = 'sec'; sec.textContent = lastSection;
      panel.appendChild(sec);
    }
    var row = document.createElement('div'); row.className = 'row'; row.dataset.control = d.key;
    var lab = document.createElement('label'); lab.className = 'lab'; lab.htmlFor = 'control-' + d.key;
    var name = document.createElement('span'); name.textContent = d.label;
    var val = document.createElement('span'); val.className = 'val';
    lab.appendChild(name); lab.appendChild(val);
    var input = document.createElement('input');
    input.type = 'range'; input.className = 'kn'; input.id = 'control-' + d.key;
    input.min = d.min; input.max = d.max; input.step = d.step;
    var state = document.createElement('div'); state.className = 'state'; state.id = 'state-' + d.key;
    input.setAttribute('aria-describedby', state.id);
    function paint(v){
      val.textContent = (+v).toFixed(2);
      input.style.setProperty('--f', (100*(v-d.min)/(d.max-d.min)) + '%');
    }
    var initial = ctx.getControl(d.key); input.value = initial; paint(initial);
    input.addEventListener('input', function(){
      var v = parseFloat(input.value);
      if (ctx.directorUserExit) ctx.directorUserExit();
      ctx.setControl(d.key, v, { source:'user', persist:true });
    });
    row.appendChild(lab); row.appendChild(input); row.appendChild(state);
    var action=null;
    if(d.key==='burst'||d.key==='cme'||d.key==='dof'){
      action=document.createElement('button');action.type='button';action.className='rowAction';
      action.textContent=d.key==='dof'?'aproximar':'prévia';
      action.setAttribute('aria-label',d.key==='dof'?'aproximar para ativar foco raso':'prévia de '+d.label);
      action.addEventListener('click',function(){
        if(ctx.directorUserExit)ctx.directorUserExit();
        if(d.key==='dof')ctx.toggleFrame();
        else if(d.key==='burst'&&ctx.previewBurst)ctx.previewBurst();
        else if(d.key==='cme'&&ctx.previewCME)ctx.previewCME();
        refreshAvailability();
      });
      row.appendChild(action);
    }
    panel.appendChild(row);
    entries[d.key] = { def:d, row:row, input:input, state:state, action:action, paint:paint };
  });

  function stateMessage(info){
    if (!info) return '';
    if (info.reason === 'director-override') return 'efetivo ' + (+info.effective).toFixed(2) + ' durante o diretor';
    if (info.reason === 'tier-unavailable') return 'indisponível nesta qualidade';
    if (info.reason === 'autotune-disabled') return 'desativado pelo ajuste automático';
    if (info.reason === 'preparing') return 'preparando volume';
    if (info.reason === 'waiting-flare') return 'aguardando flare';
    if (info.reason === 'fit-framing') return 'sem efeito no enquadramento geral';
    if ((info.key === 'cycle' || info.key === 'lapse') && info.metrics.cycleOn){
      var seconds=info.metrics.duration, duration=seconds<90?Math.round(seconds)+' s':Math.round(seconds/60)+' min';
      return info.metrics.multiplier.toFixed(info.metrics.multiplier<10?1:0)+'× · ciclo em ~'+duration;
    }
    return '';
  }
  function previewMessage(reason){
    if(reason==='source-empty')return 'defina intensidade para a prévia';
    if(reason==='event-active')return 'evento em andamento';
    if(reason==='cooldown')return 'aguarde o rescaldo';
    if(reason==='not-visible')return 'nenhuma região visível';
    if(reason==='tier-unavailable')return 'indisponível nesta qualidade';
    if(reason==='autotune-disabled')return 'desativado pelo ajuste automático';
    return '';
  }
  function syncAction(key,e,info){
    if(!e.action)return;
    if(key==='dof'){
      var fit=info.reason==='fit-framing';e.action.hidden=!fit;e.action.disabled=!fit;return;
    }
    var state=key==='burst'?(ctx.canPreviewBurst&&ctx.canPreviewBurst()):(ctx.canPreviewCME&&ctx.canPreviewCME());
    if(!state){e.action.disabled=true;return;}
    e.action.hidden=false;e.action.disabled=!state.ok;
    if(!state.ok){
      var msg=previewMessage(state.reason);
      if(msg&&(!e.state.textContent||state.reason==='event-active'||state.reason==='cooldown'||state.reason==='not-visible'))
        e.state.textContent=msg;
    }
  }
  function syncEntry(key, info){
    var e = entries[key]; if (!e) return;
    info = info || ctx.getControlInfo(key);
    var v = info.nominal;
    e.input.value = v; e.paint(v);
    if (panel.classList.contains('open')){
      var hard = info.reason === 'tier-unavailable' || info.reason === 'autotune-disabled';
      e.input.disabled=hard; e.row.classList.toggle('unavailable',hard);
      e.state.textContent=stateMessage(info);
      syncAction(key,e,info);
    }
  }
  function syncControlUI(keys){ (keys || Object.keys(entries)).forEach(function(k){ syncEntry(k); }); }
  function refreshAvailability(){
    if (!panel.classList.contains('open')) return;
    Object.keys(entries).forEach(function(key){ syncEntry(key,ctx.getControlInfo(key)); });
    refreshTierRecommendation();
  }
  ctx.syncControlUI = syncControlUI;
  ctx.subscribeControls(function(key, info){ syncEntry(key, info); });
  ctx.onPerformanceStateChange = function(){ if(panel.classList.contains('open'))refreshAvailability(); };

  function saveIdle(){
    try { ctx.savedKnobs.idle = ctx.IDLE_CINE ? 1 : 0;
      localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs)); } catch(e){}
  }
  var idleRow=document.createElement('div'); idleRow.className='switch';
  var idleLabel=document.createElement('span'); idleLabel.textContent='Câmera contemplativa';
  var idleSwitch=document.createElement('button'); idleSwitch.className='sw'+(ctx.IDLE_CINE?' on':'');
  idleSwitch.type='button'; idleSwitch.setAttribute('role','switch'); idleSwitch.setAttribute('aria-label','Câmera contemplativa');
  function syncIdle(){ idleSwitch.classList.toggle('on',ctx.IDLE_CINE); idleSwitch.setAttribute('aria-checked',String(!!ctx.IDLE_CINE)); }
  syncIdle();
  idleSwitch.addEventListener('click',function(){ if(ctx.directorUserExit)ctx.directorUserExit(); ctx.IDLE_CINE=!ctx.IDLE_CINE; syncIdle(); saveIdle(); });
  idleRow.appendChild(idleLabel); idleRow.appendChild(idleSwitch); panel.appendChild(idleRow);

  var lookSec=document.createElement('div'); lookSec.className='sec'; lookSec.textContent='look'; panel.appendChild(lookSec);
  var lookBtn=document.createElement('button'); lookBtn.id='lookBtn'; lookBtn.textContent='aplicar look Sunshine';
  lookBtn.addEventListener('click',function(){ if(ctx.directorUserExit)ctx.directorUserExit(); ctx.applyControlPreset('sunshine'); });
  panel.appendChild(lookBtn);
  var dirBtn=document.createElement('button'); dirBtn.id='dirBtn'; dirBtn.textContent='▶ modo diretor (sequência)';
  dirBtn.addEventListener('click',function(){ ctx.directorStart(); setPanelOpen(false); }); panel.appendChild(dirBtn);

  var diagSec=document.createElement('div'); diagSec.className='sec'; diagSec.textContent='diagnóstico'; panel.appendChild(diagSec);
  var hudRow=document.createElement('div'); hudRow.className='switch';
  var hudLabel=document.createElement('span'); hudLabel.textContent='HUD de FPS';
  var hudSwitch=document.createElement('button'); hudSwitch.className='sw'; hudSwitch.type='button'; hudSwitch.setAttribute('role','switch'); hudSwitch.setAttribute('aria-label','HUD de FPS');
  function syncHud(on){ hudSwitch.classList.toggle('on',on); hudSwitch.setAttribute('aria-checked',String(!!on)); }
  syncHud(ctx.hudOn); hudSwitch.addEventListener('click',function(){ ctx.setHudState(!ctx.hudOn); });
  ctx.onHudStateChange=syncHud; hudRow.appendChild(hudLabel); hudRow.appendChild(hudSwitch); panel.appendChild(hudRow);

  var tierSec=document.createElement('div'); tierSec.className='sec'; tierSec.textContent='qualidade'; panel.appendChild(tierSec);
  var tierRow=document.createElement('div'); tierRow.id='tierRow';
  function reloadWithoutTier(){
    var q=(location.search||'').replace(/^\?/,'').split('&').filter(function(kv){return kv&&kv.indexOf('tier=')!==0;}).join('&');
    location.href=location.pathname+(q?'?'+q:'');
  }
  TIER_ORDER.forEach(function(t){
    var b=document.createElement('button'); b.textContent=t; if(t===TIER)b.className='cur';
    b.setAttribute('aria-pressed',String(t===TIER));
    b.addEventListener('click',function(){ if(t===TIER)return; if(ctx.directorUserExit)ctx.directorUserExit(); ctx.persistTier(t); reloadWithoutTier(); });
    tierRow.appendChild(b);
  });
  panel.appendChild(tierRow);
  var tierNote=document.createElement('p'); tierNote.id='tierNote'; panel.appendChild(tierNote);
  var tierApply=document.createElement('button'); tierApply.id='tierApply';
  tierApply.addEventListener('click',function(){ if(ctx.applyRecommendedTier())reloadWithoutTier(); }); panel.appendChild(tierApply);
  function refreshTierRecommendation(){
    var t=ctx.recommendedTier;
    tierNote.textContent=t?'qualidade recomendada para a próxima carga: '+t:'trocar a qualidade recarrega a cena';
    tierApply.style.display=t?'block':'none'; tierApply.textContent=t?'aplicar '+t+' e recarregar':'';
  }

  var reset=document.createElement('button'); reset.id='knobReset'; reset.textContent='restaurar padrão';
  reset.addEventListener('click',function(){
    if(!window.confirm('Restaurar toda a sessão e recarregar a cena?'))return;
    if(ctx.directorUserExit)ctx.directorUserExit(); ctx.setHudState(false);
    ctx.cmeKilled=false;ctx.cvolKilled=false;ctx.recommendedTier=null;
    try{localStorage.removeItem('solKnobs');localStorage.removeItem('solTier');}catch(e){}
    var keys=ctx.CONTROL_SCHEMA.map(function(d){return d.key;}).concat(['look','idle','director','hud','tier','tune','scale']);
    try{var target=new URL(location.href);keys.forEach(function(k){target.searchParams.delete(k);});location.replace(target.href);}catch(e){location.reload();}
  });
  panel.appendChild(reset); document.body.appendChild(panel);

  var gear=document.createElement('button'); gear.id='knobBtn'; gear.type='button'; gear.title='ajustes';
  gear.setAttribute('aria-label','abrir ajustes'); gear.setAttribute('aria-controls',panel.id); gear.setAttribute('aria-expanded','false'); gear.textContent='⚙';
  var stateTimer=0;
  function setPanelOpen(open){
    panel.classList.toggle('open',open);gear.classList.toggle('open',open);gear.setAttribute('aria-expanded',String(open));
    panel.setAttribute('aria-hidden',String(!open)); panel.inert=!open;
    gear.setAttribute('aria-label',open?'fechar ajustes':'abrir ajustes');
    gear.style.right=open?'calc(min(330px, 86vw) + 14px)':'14px';
    hudEl.style.right=open?'calc(min(330px, 86vw) + 18px)':'10px';
    clearInterval(stateTimer); stateTimer=0;
    if(open){ refreshAvailability(); stateTimer=setInterval(refreshAvailability,400); }
  }
  gear.addEventListener('click',function(){setPanelOpen(!panel.classList.contains('open'));});
  hudEl.style.transition='right .55s cubic-bezier(.22,1,.36,1)'; document.body.appendChild(gear);

  refreshTierRecommendation();
  ctx.controlPanel={ element:panel, gear:gear, entries:entries, refresh:refreshAvailability, setOpen:setPanelOpen };
}

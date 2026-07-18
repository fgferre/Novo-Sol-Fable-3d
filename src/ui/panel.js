// ui/panel.js — drawer de controles dirigido exclusivamente pelo schema
// central. O painel exibe o valor nominal; overrides/condições entram na
// linha curta de estado sem tomar o lugar do controle.

import { EDU_CONTENT } from '../edu/content.js';

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
    '#knobBtn.attention::after{content:"";position:absolute;top:4px;right:4px;width:7px;height:7px;',
    ' border-radius:50%;background:#ff9a3c;box-shadow:0 0 8px rgba(255,154,60,.9)}',
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
    '#knobPanel .rowAction+.rowAction{margin-left:6px}',
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
    '#knobPanel .choice{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:12px}',
    '#knobPanel .choiceBtns{display:flex;gap:4px;padding:2px;border-radius:9px;background:rgba(255,255,255,.07)}',
    '#knobPanel .choiceBtns button{min-width:42px;padding:5px 8px;border:0;border-radius:7px;cursor:pointer;',
    ' background:transparent;color:rgba(233,228,218,.62);font:600 10px/1 inherit;letter-spacing:.08em;transition:background .25s,color .25s}',
    '#knobPanel .choiceBtns button.cur{background:rgba(255,140,50,.30);color:#ffd9a8}',
    '#knobPanel .collectionToggle{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;',
    ' margin:8px 0 0;padding:8px 10px;border-radius:10px;cursor:pointer;text-align:left;',
    ' border:1px solid rgba(255,170,90,.28);background:rgba(255,140,50,.08);color:#ffd9a8;font:600 11px/1.25 inherit}',
    '#knobPanel .collectionToggle::after{content:"›";font-size:20px;line-height:1;transform:rotate(0);transition:transform .2s ease}',
    '#knobPanel .collectionToggle[aria-expanded="true"]::after{transform:rotate(90deg)}',
    '#knobPanel .collectionList{margin:7px 0 3px;border-left:1px solid rgba(255,170,90,.18);padding-left:8px}',
    '#knobPanel .collectionItem{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;',
    ' padding:7px 8px;margin:2px 0;border:0;border-radius:8px;cursor:pointer;text-align:left;background:transparent;color:#f4e9db;font:inherit}',
    '#knobPanel .collectionItem:hover{background:rgba(255,255,255,.06)}#knobPanel .collectionItem:disabled{cursor:default;color:rgba(233,228,218,.42)}',
    '#knobPanel .collectionItemTitle{font-size:11.5px;line-height:1.25}#knobPanel .collectionItemState{font-size:9.5px;line-height:1.2;color:rgba(255,190,130,.72);text-align:right}',
    '#knobPanel .collectionItem:disabled .collectionItemState{color:rgba(233,228,218,.34)}',
    '#knobPanel .collectionDetail{margin:8px 0 6px;padding:10px 11px;border-radius:9px;background:rgba(0,0,0,.20);border-top:1px solid rgba(255,179,103,.32)}',
    '#knobPanel .collectionDetail[hidden]{display:none}#knobPanel .collectionDetailHead{font-size:9.5px;font-weight:700;letter-spacing:.14em;color:#ffbf7d}',
    '#knobPanel .collectionDetailTerm{margin-top:4px;font-size:15px;line-height:1.12;color:#fff6e9}#knobPanel .collectionDetailBody{margin-top:6px;font-size:11px;line-height:1.45;color:rgba(255,242,225,.84)}',
    '#knobPanel .collectionClear{width:100%;min-height:44px;margin:7px 0 0;border:0;background:transparent;color:rgba(233,228,218,.50);font:11px/1 inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
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

  var panel = document.createElement('aside'); panel.id = 'knobPanel';
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','false');
  panel.setAttribute('aria-hidden','true'); panel.tabIndex=-1;
  panel.inert = true;
  var head = document.createElement('h2'); head.id='knobPanelTitle';head.textContent = 'Ajustes';
  panel.setAttribute('aria-labelledby',head.id);
  var sub = document.createElement('p'); sub.className = 'sub';
  sub.textContent = 'cena, luz e câmera · salvo neste aparelho';
  panel.appendChild(head); panel.appendChild(sub);

  if(!ctx.DET){
    var eduSec=document.createElement('div'); eduSec.className='sec'; eduSec.textContent='experiência'; panel.appendChild(eduSec);
    var eduRow=document.createElement('div'); eduRow.className='switch'; eduRow.id='eduSwitchRow';
    var eduLabel=document.createElement('span'); eduLabel.textContent='Descobertas educativas';
    var eduSwitch=document.createElement('button'); eduSwitch.className='sw'; eduSwitch.type='button';
    eduSwitch.setAttribute('role','switch'); eduSwitch.setAttribute('aria-label','Descobertas educativas');
    function syncEdu(on){ eduSwitch.classList.toggle('on',!!on); eduSwitch.setAttribute('aria-checked',String(!!on)); }
    syncEdu(ctx.getControl('edu')>.5);
    eduSwitch.addEventListener('click',function(){ ctx.setControl('edu',ctx.getControl('edu')>.5?0:1); });
    ctx.subscribeControls(function(key,info){ if(key==='edu')syncEdu(info.applied>.5); });
    eduRow.appendChild(eduLabel);eduRow.appendChild(eduSwitch);panel.appendChild(eduRow);

    var langRow=document.createElement('div'); langRow.className='choice'; langRow.id='eduLangRow';
    var langLabel=document.createElement('span'); langLabel.textContent='Idioma / Language';
    var langChoices=document.createElement('div'); langChoices.className='choiceBtns';
    langChoices.setAttribute('role','group');langChoices.setAttribute('aria-label','Idioma da experiência educativa');
    var langButtons={};
    ['pt','en'].forEach(function(code){
      var button=document.createElement('button');button.type='button';button.dataset.lang=code;
      button.id='edu-lang-'+code;button.textContent=code.toUpperCase();
      button.setAttribute('aria-label',code==='pt'?'usar português':'use English');
      button.addEventListener('click',function(){if(ctx.setEduLang)ctx.setEduLang(code);});
      langChoices.appendChild(button);langButtons[code]=button;
    });
    function syncLanguage(code){
      Object.keys(langButtons).forEach(function(key){
        var current=key===code;langButtons[key].classList.toggle('cur',current);
        langButtons[key].setAttribute('aria-pressed',String(current));
      });
    }
    var renderCollection=function(){};
    syncLanguage(ctx.eduLang==='en'?'en':'pt');
    ctx.onEduLanguageChange=function(code){ syncLanguage(code); renderCollection(); };
    langRow.appendChild(langLabel);langRow.appendChild(langChoices);panel.appendChild(langRow);

    // A coleção é deliberadamente uma leitura calma dentro dos ajustes: ela
    // não reaponta a câmera, não recria o fenômeno e não revela o que ainda
    // não foi observado. Cada botão útil tem área de toque de pelo menos 44px.
    if(ctx.eduCollectionInfo){
      var collectionSec=document.createElement('div'); collectionSec.className='sec'; collectionSec.id='eduCollectionSec'; panel.appendChild(collectionSec);
      var collectionRow=document.createElement('div'); collectionRow.id='eduCollectionRow';
      var collectionToggle=document.createElement('button'); collectionToggle.type='button'; collectionToggle.id='eduCollectionToggle'; collectionToggle.className='collectionToggle';
      var collectionList=document.createElement('div'); collectionList.id='eduCollectionList'; collectionList.hidden=true;
      collectionToggle.setAttribute('aria-expanded','false'); collectionToggle.setAttribute('aria-controls',collectionList.id);
      var collectionExpanded=false, collectionSelected='';
      var collectionReader=document.createElement('article'); collectionReader.id='eduCollectionReader'; collectionReader.className='collectionDetail'; collectionReader.hidden=true;
      collectionReader.tabIndex=-1; collectionReader.setAttribute('role','region'); collectionReader.setAttribute('aria-live','polite');
      var readerHead=document.createElement('div'); readerHead.className='collectionDetailHead';
      var readerTerm=document.createElement('div'); readerTerm.className='collectionDetailTerm';
      var readerBody=document.createElement('div'); readerBody.className='collectionDetailBody';
      collectionReader.appendChild(readerHead);collectionReader.appendChild(readerTerm);collectionReader.appendChild(readerBody);
      var collectionClear=document.createElement('button'); collectionClear.type='button'; collectionClear.id='eduCollectionClear'; collectionClear.className='collectionClear';
      function collectionText(){
        var en=ctx.eduLang==='en';
        return en ? {section:'collection',open:'Collection',of:'of',observed:'observed',notSeen:'Not observed yet',views:'views seen',clear:'Clear observed discoveries',confirm:'Clear the discoveries observed on this device? This cannot be undone.'} :
          {section:'coleção',open:'Coleção',of:'de',observed:'observadas',notSeen:'Ainda não observada',views:'vistas observadas',clear:'Limpar descobertas observadas',confirm:'Limpar as descobertas observadas neste aparelho? Esta ação não pode ser desfeita.'};
      }
      function collectionContentKey(id,item){
        if(id==='prominence') return item.views.filament && item.views.prominence ? 'prominenceFilament' : item.views.filament ? 'filament' : 'prominence';
        if(id==='cycle') return item.views.cycleMaximum && item.views.cycleMinimum ? 'cycle' : item.views.cycleMaximum ? 'cycleMaximum' : 'cycleMinimum';
        return id;
      }
      function collectionTerm(id,item,content){
        if(id==='prominence') return content.prominenceFilament.term;
        if(id==='cycle') return content.cycle.term;
        return content[collectionContentKey(id,item)].term;
      }
      renderCollection=function(){
        var info=ctx.eduCollectionInfo(), text=collectionText(), content=EDU_CONTENT[ctx.eduLang==='en'?'en':'pt'];
        collectionSec.textContent=text.section;
        collectionToggle.textContent=text.open+' · '+info.discoveredFamilies+' '+text.of+' '+info.totalFamilies+' '+text.observed;
        collectionToggle.setAttribute('aria-label',collectionToggle.textContent);
        collectionToggle.setAttribute('aria-expanded',String(collectionExpanded));
        collectionList.hidden=!collectionExpanded;
        collectionList.textContent='';
        info.order.forEach(function(id){
          var item=info.items[id], row=document.createElement('button'); row.type='button'; row.className='collectionItem';
          row.disabled=!item.seen; row.dataset.collection=id; row.id='eduCollectionItem-'+id;
          var title=document.createElement('span'); title.className='collectionItemTitle'; title.textContent=collectionTerm(id,item,content);
          var state=document.createElement('span'); state.className='collectionItemState';
          state.textContent=item.seen ? (item.totalViews>1 ? item.discoveredViews+'/'+item.totalViews+' '+text.views : text.observed) : text.notSeen;
          row.setAttribute('aria-label',title.textContent+'. '+state.textContent);
          row.appendChild(title);row.appendChild(state);
          row.addEventListener('click',function(){ collectionSelected=id; renderCollection(); collectionReader.focus(); });
          collectionList.appendChild(row);
        });
        if(collectionSelected&&info.items[collectionSelected]&&info.items[collectionSelected].seen){
          var selected=info.items[collectionSelected], key=collectionContentKey(collectionSelected,selected), detail=content[key];
          readerHead.textContent=detail.headline; readerTerm.textContent=detail.term; readerBody.textContent=detail.body;
          collectionReader.setAttribute('aria-label',detail.term);
          collectionReader.hidden=false;
        } else collectionReader.hidden=true;
        collectionList.appendChild(collectionReader);
        collectionClear.hidden=!collectionExpanded||info.discoveredFamilies===0;
        collectionClear.textContent=text.clear;
      };
      collectionToggle.addEventListener('click',function(){ collectionExpanded=!collectionExpanded; renderCollection(); });
      collectionClear.addEventListener('click',function(){
        var text=collectionText();
        if(window.confirm(text.confirm)){
          collectionSelected='';
          if(ctx.clearEduCollection)ctx.clearEduCollection();
          renderCollection();
        }
      });
      collectionRow.appendChild(collectionToggle);collectionRow.appendChild(collectionList);collectionRow.appendChild(collectionClear);panel.appendChild(collectionRow);
      ctx.onEduCollectionChange=function(){ renderCollection(); };
      renderCollection();
    }
  }

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
    var decimals=Math.abs(d.step*100-Math.round(d.step*100))>1e-6?3:2;
    function paint(v){
      v=+v;
      var shownDecimals=decimals;
      if(v!==0&&Math.abs(v)<Math.pow(10,-decimals))
        shownDecimals=Math.min(5,Math.max(decimals,Math.ceil(-Math.log10(Math.abs(v)))+1));
      val.textContent = v.toFixed(shownDecimals);
      input.setAttribute('aria-valuetext',val.textContent);
      input.style.setProperty('--f', (100*(v-d.min)/(d.max-d.min)) + '%');
    }
    var initial = ctx.getControl(d.key); input.value = initial; paint(initial);
    input.addEventListener('input', function(){
      var v = parseFloat(input.value);
      ctx.setControl(d.key, v, { source:'user', persist:true });
    });
    row.appendChild(lab); row.appendChild(input); row.appendChild(state);
    var action=null,action2=null;
    // prévias do ciclo (padrão Burst/CME): aceleram o relógio do ciclo
    // até o pico/fundo, seguram ~20 s e devolvem ao ritmo normal —
    // mesma física, tempo comprimido (activity.js)
    if(d.key==='cycle'){
      action=document.createElement('button');action.type='button';action.className='rowAction';
      action.textContent='máximo solar';
      action.setAttribute('aria-label','acelerar o ciclo até o máximo solar (prévia)');
      action.addEventListener('click',function(){
        if(ctx.previewSolarMax)ctx.previewSolarMax();
        refreshAvailability();
      });
      action2=document.createElement('button');action2.type='button';action2.className='rowAction';
      action2.textContent='mínimo solar';
      action2.setAttribute('aria-label','acelerar o ciclo até o mínimo solar (prévia)');
      action2.addEventListener('click',function(){
        if(ctx.previewSolarMin)ctx.previewSolarMin();
        refreshAvailability();
      });
      row.appendChild(action);row.appendChild(action2);
    }
    if(d.key==='burst'||d.key==='cme'||d.key==='cvol'||d.key==='dof'){
      action=document.createElement('button');action.type='button';action.className='rowAction';
      action.textContent=d.key==='dof'?'aproximar':d.key==='burst'?'disparar flare':d.key==='cme'?'ejetar CME':'reativar';
      action.setAttribute('aria-label',d.key==='dof'?'aproximar para ativar foco raso':
        d.key==='burst'?'disparar flare de prévia':d.key==='cme'?'ejetar CME de prévia':'reativar '+d.label);
      action.addEventListener('click',function(){
        var info=ctx.getControlInfo(d.key);
        if((d.key==='cme'||d.key==='cvol')&&info.reason==='autotune-disabled'){
          if(ctx.directorUserExit)ctx.directorUserExit();
          ctx.setPerformanceKill(d.key,false,{source:'user'});
        } else if(d.key==='dof'){
          if(ctx.directorUserExit)ctx.directorUserExit();ctx.toggleFrame();
        }
        else if(d.key==='burst'&&ctx.previewBurst)ctx.previewBurst();
        else if(d.key==='cme'&&ctx.previewCME)ctx.previewCME();
        refreshAvailability();
      });
      row.appendChild(action);
    }
    panel.appendChild(row);
    entries[d.key] = { def:d, row:row, input:input, state:state, action:action, action2:action2, paint:paint };
  });

  function stateMessage(info){
    if (!info) return '';
    if (info.reason === 'director-override') return 'efetivo ' + (+info.effective).toFixed(2) + ' durante o diretor';
    if (info.reason === 'tier-unavailable') return 'indisponível nesta qualidade';
    if (info.reason === 'autotune-disabled') return 'desativado pelo ajuste automático';
    if (info.reason === 'preparing') return 'preparando volume';
    if (info.reason === 'waiting-flare') return 'aguardando flare';
    if (info.reason === 'cooldown') return 'aguarde o rescaldo';
    if (info.reason === 'fit-framing') return 'sem efeito no enquadramento geral';
    if (info.reason === 'lapse-fallback') return 'profundidade automática: 100% pelo time-lapse';
    if ((info.key === 'cycle' || info.key === 'lapse') && info.metrics.cycleOn){
      var seconds=info.metrics.duration, duration=seconds<90?Math.round(seconds)+' s':Math.round(seconds/60)+' min';
      return info.metrics.multiplier.toFixed(info.metrics.multiplier<10?1:0)+'× · ciclo em ~'+duration;
    }
    if (info.key === 'grain' && info.metrics.amplitude8bit !== undefined)
      return '≈ ±'+info.metrics.amplitude8bit.toFixed(1).replace('.',',')+' níveis (8-bit)';
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
    if(key==='cycle'){
      var evState=ctx.canPreviewSolarMax&&ctx.canPreviewSolarMax();
      var evOk=!!(evState&&evState.ok);
      e.action.disabled=!evOk;if(e.action2)e.action2.disabled=!evOk;
      if(evState&&!evState.ok){
        var evMsg=previewMessage(evState.reason);
        if(evMsg&&(!e.state.textContent||evState.reason==='event-active'))e.state.textContent=evMsg;
      }
      return;
    }
    if(key==='dof'){
      var fit=info.reason==='fit-framing';e.action.hidden=!fit;e.action.disabled=!fit;return;
    }
    if((key==='cme'||key==='cvol')&&info.reason==='autotune-disabled'){
      e.action.hidden=false;e.action.disabled=false;e.action.textContent='reativar';
      e.action.setAttribute('aria-label','reativar '+e.def.label);return;
    }
    if(key==='cvol'){e.action.hidden=true;e.action.disabled=true;return;}
    e.action.textContent=key==='burst'?'disparar flare':'ejetar CME';
    e.action.setAttribute('aria-label',key==='burst'?'disparar flare de prévia':'ejetar CME de prévia');
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
  function refreshAvailability(){
    if (!panel.classList.contains('open')) return;
    Object.keys(entries).forEach(function(key){ syncEntry(key,ctx.getControlInfo(key)); });
    refreshTierRecommendation();
  }
  ctx.subscribeControls(function(key, info){
    if(!panel.classList.contains('open')&&info.reason==='director-override')return;
    syncEntry(key, info);
  });

  function saveIdle(){
    try { ctx.savedKnobs.idle = ctx.IDLE_CINE ? 1 : 0;
      localStorage.setItem('solKnobs', JSON.stringify(ctx.savedKnobs)); } catch(e){}
  }
  var idleRow=document.createElement('div'); idleRow.className='switch';
  var idleLabel=document.createElement('span'); idleLabel.textContent='Respiração contemplativa';
  var idleSwitch=document.createElement('button'); idleSwitch.className='sw'+(ctx.IDLE_CINE?' on':'');
  idleSwitch.type='button'; idleSwitch.setAttribute('role','switch'); idleSwitch.setAttribute('aria-label','Respiração contemplativa');
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
  var tierNote=document.createElement('p'); tierNote.id='tierNote';tierNote.setAttribute('aria-live','polite');panel.appendChild(tierNote);
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
    if(ctx.setPerformanceKill){ctx.setPerformanceKill('cme',false,{source:'reset',notify:false});ctx.setPerformanceKill('cvol',false,{source:'reset',notify:false});}
    ctx.recommendedTier=null;
    try{localStorage.removeItem('solKnobs');localStorage.removeItem('solTier');}catch(e){}
    var keys=ctx.CONTROL_SCHEMA.map(function(d){return d.key;}).concat(['look','idle','director','hud','tier','tune','scale']);
    try{var target=new URL(location.href);keys.forEach(function(k){target.searchParams.delete(k);});location.replace(target.href);}catch(e){location.reload();}
  });
  panel.appendChild(reset); document.body.appendChild(panel);

  var gear=document.createElement('button'); gear.id='knobBtn'; gear.type='button'; gear.title='ajustes';
  gear.setAttribute('aria-label','abrir ajustes'); gear.setAttribute('aria-controls',panel.id); gear.setAttribute('aria-expanded','false'); gear.textContent='⚙';
  var stateTimer=0;
  function performanceAttention(){
    var states=[];
    if(ctx.cmeKilled)states.push('CME desativada');
    if(ctx.cvolKilled)states.push('coroa volumétrica desativada');
    if(ctx.recommendedTier)states.push('qualidade '+ctx.recommendedTier+' recomendada');
    return states.join(', ');
  }
  function refreshPerformanceAttention(){
    if(!gear)return;
    var attention=performanceAttention(),open=panel.classList.contains('open');
    gear.classList.toggle('attention',!!attention);
    gear.title=attention?'ajustes — '+attention:'ajustes';
    gear.setAttribute('aria-label',(open?'fechar ajustes':'abrir ajustes')+(attention?' — atenção: '+attention:''));
  }
  function setPanelOpen(open){
    if(!open&&panel.contains(document.activeElement))gear.focus();
    panel.classList.toggle('open',open);gear.classList.toggle('open',open);gear.setAttribute('aria-expanded',String(open));
    panel.setAttribute('aria-hidden',String(!open)); panel.inert=!open;
    gear.style.right=open?'calc(min(330px, 86vw) + 14px)':'14px';
    hudEl.style.right=open?'calc(min(330px, 86vw) + 18px)':'10px';
    clearInterval(stateTimer); stateTimer=0;
    if(open){ refreshAvailability(); stateTimer=setInterval(refreshAvailability,400);requestAnimationFrame(function(){panel.focus();}); }
    refreshPerformanceAttention();
  }
  gear.addEventListener('click',function(){setPanelOpen(!panel.classList.contains('open'));});
  window.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&panel.classList.contains('open')){
      event.preventDefault();setPanelOpen(false);
    }
  });
  hudEl.style.transition='right .55s cubic-bezier(.22,1,.36,1)'; document.body.appendChild(gear);

  ctx.onPerformanceStateChange=function(){
    refreshPerformanceAttention();
    if(panel.classList.contains('open'))refreshAvailability();
  };
  refreshTierRecommendation();
  refreshPerformanceAttention();
}

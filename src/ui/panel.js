// ui/panel.js — drawer de controles dirigido exclusivamente pelo schema
// central. O painel exibe o valor nominal; overrides/condições entram na
// linha curta de estado sem tomar o lugar do controle.

import { EDU_CONTENT } from '../edu/content.js';
import { PANEL_STRINGS, CONTROL_LABELS_EN } from './strings.js';

export function createPanel(ctx){
  var hudEl = ctx.hudEl, TIER = ctx.TIER, TIER_ORDER = ctx.TIER_ORDER;
  var defs = ctx.CONTROL_SCHEMA.filter(function(d){ return !d.hidden; });

  // PR-11 — i18n completo do painel: TODA string visível passa pelo
  // resolvedor de idioma. Cada texto registra um aplicador em i18nApply;
  // trocar de idioma re-executa todos (re-render ao vivo, sem recriar DOM
  // nem perder estado de switches/sliders). O idioma vem de ctx.eduLang
  // (resolvido no config: URL > storage > navegador) — sob ?det o default
  // continua PT e nada muda.
  function panelLang(){ return ctx.eduLang === 'en' ? 'en' : 'pt'; }
  function S(){ return PANEL_STRINGS[panelLang()]; }
  function controlLabel(d){
    return panelLang() === 'en' ? (CONTROL_LABELS_EN[d.key] || d.label) : d.label;
  }
  var i18nApply = [];
  function reg(apply){ i18nApply.push(apply); apply(); }

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
    '#lookBtn,#dirBtn,#eduTourBtn{margin-top:14px;width:100%;min-height:44px;padding:9px 0;border-radius:9px;cursor:pointer;',
    ' border:1px solid rgba(255,170,90,.45);background:rgba(255,140,50,.16);color:#ffd9a8;',
    ' font-size:12px;letter-spacing:.05em;transition:background .25s}',
    '#lookBtn:hover,#dirBtn:hover,#eduTourBtn:hover{background:rgba(255,140,50,.28)}#dirBtn{margin-top:8px}#eduTourBtn{margin-top:3px}',
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
  var head = document.createElement('h2'); head.id='knobPanelTitle';
  panel.setAttribute('aria-labelledby',head.id);
  var sub = document.createElement('p'); sub.className = 'sub';
  reg(function(){ head.textContent = S().title; sub.textContent = S().subtitle; });
  // O painel declara o próprio lang: as leituras de acessibilidade seguem o
  // idioma renderizado mesmo quando o lang do documento (edu.js) diverge.
  reg(function(){ panel.setAttribute('lang', panelLang()==='en'?'en':'pt-BR'); });
  panel.appendChild(head); panel.appendChild(sub);

  if(!ctx.DET){
    var eduSec=document.createElement('div'); eduSec.className='sec'; panel.appendChild(eduSec);
    var eduRow=document.createElement('div'); eduRow.className='switch'; eduRow.id='eduSwitchRow';
    var eduLabel=document.createElement('span');
    var eduSwitch=document.createElement('button'); eduSwitch.className='sw'; eduSwitch.type='button';
    eduSwitch.setAttribute('role','switch');
    reg(function(){
      eduSec.textContent=S().sections['experiência'];
      eduLabel.textContent=S().eduSwitch;
      eduSwitch.setAttribute('aria-label',S().eduSwitch);
    });
    function syncEdu(on){ eduSwitch.classList.toggle('on',!!on); eduSwitch.setAttribute('aria-checked',String(!!on)); }
    syncEdu(ctx.getControl('edu')>.5);
    eduSwitch.addEventListener('click',function(){ ctx.setControl('edu',ctx.getControl('edu')>.5?0:1); });
    ctx.subscribeControls(function(key,info){ if(key==='edu')syncEdu(info.applied>.5); });
    eduRow.appendChild(eduLabel);eduRow.appendChild(eduSwitch);panel.appendChild(eduRow);

    // A visita guiada é opt-in e não substitui a exploração livre. Ela fica
    // junto da camada educativa, antes de idioma/coleção, para ser achada
    // por quem chega pelo celular sem precisar entender os sliders.
    var tourButton=document.createElement('button');tourButton.type='button';tourButton.id='eduTourBtn';
    tourButton.setAttribute('aria-pressed','false');
    function syncTour(info){
      var active=!!(info&&info.active);
      tourButton.textContent=active?S().tourActive:S().tourStart;
      tourButton.setAttribute('aria-pressed',String(active));
    }
    tourButton.addEventListener('click',function(){
      var info=ctx.eduTourInfo&&ctx.eduTourInfo();
      if(info&&info.active){setPanelOpen(false);return;}
      if(ctx.eduTourStart){ctx.eduTourStart();setPanelOpen(false);}
    });
    ctx.onEduTourChange=syncTour;syncTour(ctx.eduTourInfo&&ctx.eduTourInfo());panel.appendChild(tourButton);

    var langRow=document.createElement('div'); langRow.className='choice'; langRow.id='eduLangRow';
    var langLabel=document.createElement('span');
    var langChoices=document.createElement('div'); langChoices.className='choiceBtns';
    langChoices.setAttribute('role','group');
    reg(function(){
      langLabel.textContent=S().langLabel;
      langChoices.setAttribute('aria-label',S().langGroupAria);
    });
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
    ctx.onEduLanguageChange=function(code){ syncLanguage(code); renderCollection(); syncTour(ctx.eduTourInfo&&ctx.eduTourInfo()); };
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
      // PR-11: contador/aria/confirm da coleção vivem em PANEL_STRINGS
      // (chrome do painel); o CONTEÚDO das descobertas segue em EDU_CONTENT.
      function collectionText(){ return S().collection; }
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
      var sec = document.createElement('div'); sec.className = 'sec';
      (function(sectionName){
        reg(function(){ sec.textContent = S().sections[sectionName] || sectionName; });
      })(lastSection);
      panel.appendChild(sec);
    }
    var row = document.createElement('div'); row.className = 'row'; row.dataset.control = d.key;
    var lab = document.createElement('label'); lab.className = 'lab'; lab.htmlFor = 'control-' + d.key;
    var name = document.createElement('span');
    reg(function(){ name.textContent = controlLabel(d); });
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
      action.addEventListener('click',function(){
        if(ctx.previewSolarMax)ctx.previewSolarMax();
        refreshAvailability();
      });
      action2=document.createElement('button');action2.type='button';action2.className='rowAction';
      action2.addEventListener('click',function(){
        if(ctx.previewSolarMin)ctx.previewSolarMin();
        refreshAvailability();
      });
      (function(max,min){
        reg(function(){
          var a=S().actions;
          max.textContent=a.solarMax; max.setAttribute('aria-label',a.solarMaxAria);
          min.textContent=a.solarMin; min.setAttribute('aria-label',a.solarMinAria);
        });
      })(action,action2);
      row.appendChild(action);row.appendChild(action2);
    }
    if(d.key==='burst'||d.key==='cme'||d.key==='cvol'||d.key==='dof'){
      action=document.createElement('button');action.type='button';action.className='rowAction';
      (function(btn){
        reg(function(){
          var a=S().actions;
          btn.textContent=d.key==='dof'?a.approach:d.key==='burst'?a.flare:d.key==='cme'?a.cme:a.reactivate;
          btn.setAttribute('aria-label',d.key==='dof'?a.approachAria:
            d.key==='burst'?a.flareAria:d.key==='cme'?a.cmeAria:a.reactivateAria.replace('{label}',controlLabel(d)));
        });
      })(action);
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

  // Mensagens dinâmicas resolvem o idioma CORRENTE a cada chamada (S()):
  // o refresh de 400ms com o painel aberto já as re-renderiza ao vivo.
  function stateMessage(info){
    if (!info) return '';
    var s=S();
    if (info.reason === 'director-override')
      return s.state['director-override'].replace('{value}',(+info.effective).toFixed(2));
    if (s.state[info.reason]) return s.state[info.reason];
    if ((info.key === 'cycle' || info.key === 'lapse') && info.metrics.cycleOn){
      var seconds=info.metrics.duration, duration=seconds<90?Math.round(seconds)+' s':Math.round(seconds/60)+' min';
      return info.metrics.multiplier.toFixed(info.metrics.multiplier<10?1:0)+s.cycleIn+duration;
    }
    if (info.key === 'grain' && info.metrics.amplitude8bit !== undefined){
      var amplitude=info.metrics.amplitude8bit.toFixed(1);
      if (s.decimalComma) amplitude=amplitude.replace('.',',');
      return s.grainLevels.replace('{value}',amplitude);
    }
    return '';
  }
  function previewMessage(reason){
    return S().preview[reason] || '';
  }
  function blockActionForTour(btn,blocked){
    if(!btn)return;
    // PR-2: durante a visita guiada as prévias ficam indisponíveis — a
    // visita já coreografa flare/CME/ciclo e um disparo manual competiria
    // com a etapa em leitura. O refreshAvailability (400ms com o painel
    // aberto) desfaz o bloqueio assim que a visita termina.
    // PR-11: o desbloqueio compara contra o título dos DOIS idiomas — a
    // troca de língua entre bloquear e desbloquear não deixa tooltip órfão.
    if(blocked){btn.disabled=true;btn.title=S().tourBlocked;}
    else if(btn.title===PANEL_STRINGS.pt.tourBlocked||btn.title===PANEL_STRINGS.en.tourBlocked)btn.title='';
  }
  function syncAction(key,e,info){
    if(!e.action)return;
    var tourBlocked=!!(ctx.eduTourInfo&&ctx.eduTourInfo().active);
    if(key==='cycle'){
      var evState=ctx.canPreviewSolarMax&&ctx.canPreviewSolarMax();
      var evOk=!!(evState&&evState.ok);
      e.action.disabled=!evOk;if(e.action2)e.action2.disabled=!evOk;
      if(evState&&!evState.ok){
        var evMsg=previewMessage(evState.reason);
        if(evMsg&&(!e.state.textContent||evState.reason==='event-active'))e.state.textContent=evMsg;
      }
      blockActionForTour(e.action,tourBlocked);blockActionForTour(e.action2,tourBlocked);
      return;
    }
    if(key==='dof'){
      var fit=info.reason==='fit-framing';e.action.hidden=!fit;e.action.disabled=!fit;return;
    }
    if((key==='cme'||key==='cvol')&&info.reason==='autotune-disabled'){
      e.action.hidden=false;e.action.disabled=false;e.action.textContent=S().actions.reactivate;
      e.action.setAttribute('aria-label',S().actions.reactivateAria.replace('{label}',controlLabel(e.def)));return;
    }
    if(key==='cvol'){e.action.hidden=true;e.action.disabled=true;return;}
    e.action.textContent=key==='burst'?S().actions.flare:S().actions.cme;
    e.action.setAttribute('aria-label',key==='burst'?S().actions.flareAria:S().actions.cmeAria);
    var state=key==='burst'?(ctx.canPreviewBurst&&ctx.canPreviewBurst()):(ctx.canPreviewCME&&ctx.canPreviewCME());
    if(!state){e.action.disabled=true;return;}
    e.action.hidden=false;e.action.disabled=!state.ok;
    if(!state.ok){
      var msg=previewMessage(state.reason);
      if(msg&&(!e.state.textContent||state.reason==='event-active'||state.reason==='cooldown'||state.reason==='not-visible'))
        e.state.textContent=msg;
    }
    blockActionForTour(e.action,tourBlocked);
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
  var idleLabel=document.createElement('span');
  var idleSwitch=document.createElement('button'); idleSwitch.className='sw'+(ctx.IDLE_CINE?' on':'');
  idleSwitch.type='button'; idleSwitch.setAttribute('role','switch');
  reg(function(){
    idleLabel.textContent=S().idleSwitch;
    idleSwitch.setAttribute('aria-label',S().idleSwitch);
  });
  function syncIdle(){ idleSwitch.classList.toggle('on',ctx.IDLE_CINE); idleSwitch.setAttribute('aria-checked',String(!!ctx.IDLE_CINE)); }
  syncIdle();
  idleSwitch.addEventListener('click',function(){ if(ctx.directorUserExit)ctx.directorUserExit(); ctx.IDLE_CINE=!ctx.IDLE_CINE; syncIdle(); saveIdle(); });
  idleRow.appendChild(idleLabel); idleRow.appendChild(idleSwitch); panel.appendChild(idleRow);

  var lookSec=document.createElement('div'); lookSec.className='sec'; panel.appendChild(lookSec);
  var lookBtn=document.createElement('button'); lookBtn.id='lookBtn';
  lookBtn.addEventListener('click',function(){ if(ctx.directorUserExit)ctx.directorUserExit(); ctx.applyControlPreset('sunshine'); });
  panel.appendChild(lookBtn);
  var dirBtn=document.createElement('button'); dirBtn.id='dirBtn';
  dirBtn.addEventListener('click',function(){ ctx.directorStart(); setPanelOpen(false); }); panel.appendChild(dirBtn);
  reg(function(){
    lookSec.textContent=S().sections['look'];
    lookBtn.textContent=S().lookApply;
    dirBtn.textContent=S().director;
  });

  var diagSec=document.createElement('div'); diagSec.className='sec'; panel.appendChild(diagSec);
  var hudRow=document.createElement('div'); hudRow.className='switch';
  var hudLabel=document.createElement('span');
  var hudSwitch=document.createElement('button'); hudSwitch.className='sw'; hudSwitch.type='button'; hudSwitch.setAttribute('role','switch');
  reg(function(){
    diagSec.textContent=S().sections['diagnóstico'];
    hudLabel.textContent=S().hudSwitch;
    hudSwitch.setAttribute('aria-label',S().hudSwitch);
  });
  function syncHud(on){ hudSwitch.classList.toggle('on',on); hudSwitch.setAttribute('aria-checked',String(!!on)); }
  syncHud(ctx.hudOn); hudSwitch.addEventListener('click',function(){ ctx.setHudState(!ctx.hudOn); });
  ctx.onHudStateChange=syncHud; hudRow.appendChild(hudLabel); hudRow.appendChild(hudSwitch); panel.appendChild(hudRow);

  var tierSec=document.createElement('div'); tierSec.className='sec'; panel.appendChild(tierSec);
  reg(function(){ tierSec.textContent=S().sections['qualidade']; });
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
    var t=ctx.recommendedTier,s=S();
    tierNote.textContent=t?s.tierRecommended.replace('{tier}',t):s.tierReloadNote;
    tierApply.style.display=t?'block':'none'; tierApply.textContent=t?s.tierApply.replace('{tier}',t):'';
  }

  var reset=document.createElement('button'); reset.id='knobReset';
  reg(function(){ reset.textContent=S().reset; });
  reset.addEventListener('click',function(){
    if(!window.confirm(S().resetConfirm))return;
    if(ctx.directorUserExit)ctx.directorUserExit(); ctx.setHudState(false);
    if(ctx.setPerformanceKill){ctx.setPerformanceKill('cme',false,{source:'reset',notify:false});ctx.setPerformanceKill('cvol',false,{source:'reset',notify:false});}
    ctx.recommendedTier=null;
    try{localStorage.removeItem('solKnobs');localStorage.removeItem('solTier');}catch(e){}
    var keys=ctx.CONTROL_SCHEMA.map(function(d){return d.key;}).concat(['look','idle','director','hud','tier','tune','scale']);
    try{var target=new URL(location.href);keys.forEach(function(k){target.searchParams.delete(k);});location.replace(target.href);}catch(e){location.reload();}
  });
  panel.appendChild(reset); document.body.appendChild(panel);

  var gear=document.createElement('button'); gear.id='knobBtn'; gear.type='button'; gear.title=S().gearTitle;
  gear.setAttribute('aria-label',S().gearOpen); gear.setAttribute('aria-controls',panel.id); gear.setAttribute('aria-expanded','false'); gear.textContent='⚙';
  reg(function(){ gear.setAttribute('lang', panelLang()==='en'?'en':'pt-BR'); });
  var stateTimer=0;
  function performanceAttention(){
    var s=S(),states=[];
    if(ctx.cmeKilled)states.push(s.attention.cmeOff);
    if(ctx.cvolKilled)states.push(s.attention.cvolOff);
    if(ctx.recommendedTier)states.push(s.attention.tierRecommended.replace('{tier}',ctx.recommendedTier));
    return states.join(', ');
  }
  function refreshPerformanceAttention(){
    if(!gear)return;
    var s=S(),attention=performanceAttention(),open=panel.classList.contains('open');
    gear.classList.toggle('attention',!!attention);
    gear.title=attention?s.gearTitle+' — '+attention:s.gearTitle;
    gear.setAttribute('aria-label',(open?s.gearClose:s.gearOpen)+(attention?s.gearAttention+attention:''));
  }
  function setPanelOpen(open){
    if(!open&&panel.contains(document.activeElement))gear.focus();
    panel.classList.toggle('open',open);gear.classList.toggle('open',open);gear.setAttribute('aria-expanded',String(open));
    panel.setAttribute('aria-hidden',String(!open)); panel.inert=!open;
    gear.style.right=open?'calc(min(330px, 86vw) + 14px)':'14px';
    hudEl.style.right=open?'calc(min(330px, 86vw) + 18px)':'10px';
    clearInterval(stateTimer); stateTimer=0;
    if(open){ refreshAvailability(); stateTimer=setInterval(refreshAvailability,400);requestAnimationFrame(function(){panel.focus();}); }
    if(ctx.eduTourPanelChanged)ctx.eduTourPanelChanged(open);
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

  // PR-11 — engate no hook existente: onEduLanguageChange já pertencia ao
  // painel (seletor PT/EN + coleção + botão da visita). A re-renderização do
  // painel INTEIRO COMPÕE com esse handler em vez de substituí-lo; sob ?det
  // o handler anterior é undefined e o hook nunca dispara (setEduLang não
  // existe — a fábrica edu nem roda), então nada muda no determinístico.
  function applyPanelLanguage(){
    i18nApply.forEach(function(fn){ fn(); });
    refreshTierRecommendation();
    refreshPerformanceAttention();
    if(panel.classList.contains('open'))refreshAvailability();
  }
  var eduLanguageHandler=ctx.onEduLanguageChange;
  ctx.onEduLanguageChange=function(code){
    if(eduLanguageHandler)eduLanguageHandler(code);
    applyPanelLanguage();
  };
}

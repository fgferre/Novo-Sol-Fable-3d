// Visita guiada do Museu Solar. Diferente das descobertas espontâneas de
// edu.js, esta camada é voluntária, persistente e aceita toque. Ela só
// enquadra enquanto a pessoa permite: qualquer gesto devolve a câmera sem
// encerrar a leitura.

import * as THREE from 'three';
import { EDU_CONTENT } from './content.js';

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function lerpAngle(a,b,k){
  var d=b-a;
  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;
  return a+d*k;
}
function rectOf(el){
  if(!el)return {x:0,y:0,width:0,height:0};
  var r=el.getBoundingClientRect();
  return {x:r.x,y:r.y,width:r.width,height:r.height};
}

export function createEduTour(ctx){
  // A visita é intencionalmente ausente no modo determinístico. Além de não
  // criar DOM, não instala estado/tempo/câmera que pudesse alterar parity.
  if(ctx.DET)return;

  var ui=document.getElementById('ui')||document.body;
  var world=new THREE.Vector3(),aim=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),axisX=new THREE.Vector3(1,0,0);
  var side=new THREE.Vector3(),projected=new THREE.Vector3();
  var STEPS=[
    {id:'surface',copy:'surface',kind:'surface',aim:'wide'},
    {id:'active-region',copy:'activeRegion',kind:'spots',aim:'front'},
    {id:'loops',copy:'loops',kind:'loops',aim:'front'},
    {id:'flare',copy:'flareArcade',kind:'flare',aim:'front'},
    {id:'cme',copy:'cmeTour',kind:'cme',aim:'limb'},
    {id:'filament',copy:'filamentTour',kind:'filament',aim:'front'},
    {id:'prominence',copy:'prominenceTour',kind:'prominence',aim:'limb'},
    {id:'corona',copy:'corona',kind:'corona',aim:'wide'},
    {id:'maximum',copy:'maximum',kind:'cycleMaximum',aim:'wide'},
    {id:'minimum',copy:'minimum',kind:'cycleMinimum',aim:'wide'}
  ];
  var state={
    active:false,index:0,phase:'free',expanded:false,assist:true,manualReason:'',
    timeFactor:1,panelOpen:false,entered:0,fired:false,ready:false,recorded:false,
    source:{kind:'',sourceId:-1,generation:-1,physical:false,visible:false,unavailable:false},
    previous:null
  };
  // PR-2 — retorno suave da pose ao sair da visita em modo assistido. O
  // processamento vive no início de tick() (que o main chama sempre que
  // ctx.eduTourTick existe), então continua rodando depois de state.active
  // virar false.
  var restore={active:false,theta:0,phi:0,dist:0,startedAt:0};

  var style=document.createElement('style');
  style.id='eduTourStyle';
  style.textContent=[
    '#eduTour{position:fixed;inset:0;z-index:42;pointer-events:none;color:#fff4e7;font-family:inherit}',
    '#eduTour[hidden]{display:none}',
    '#eduTour .tour-card{position:absolute;left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));',
    ' bottom:max(72px,calc(env(safe-area-inset-bottom) + 58px));width:min(362px,calc(100vw - 28px));box-sizing:border-box;',
    ' padding:12px 13px 12px 14px;border:1px solid rgba(255,183,104,.42);border-left-color:rgba(255,198,137,.88);border-radius:13px;',
    ' background:linear-gradient(128deg,rgba(8,11,18,.94),rgba(17,15,18,.84));box-shadow:0 15px 38px rgba(0,0,0,.46);',
    ' backdrop-filter:blur(15px) saturate(1.2);-webkit-backdrop-filter:blur(15px) saturate(1.2);pointer-events:auto}',
    '#eduTour .tour-kicker{font-size:9px;font-weight:700;letter-spacing:.18em;color:#ffc17d}',
    '#eduTour .tour-progress{display:flex;gap:4px;margin:8px 0 9px}',
    '#eduTour .tour-dot{width:5px;height:5px;border-radius:999px;background:rgba(255,244,225,.24)}',
    '#eduTour .tour-dot.done{background:rgba(255,184,104,.72)}#eduTour .tour-dot.current{width:17px;background:#ffc17d}',
    '#eduTour .tour-term{font-size:19px;line-height:1.08;font-weight:560;letter-spacing:-.018em;color:#fff8ef}',
    '#eduTour .tour-headline{margin-top:4px;font-size:9px;line-height:1.25;font-weight:700;letter-spacing:.15em;color:rgba(255,197,131,.9)}',
    '#eduTour .tour-status{margin-top:8px;font-size:11px;line-height:1.38;color:rgba(255,239,219,.72)}',
    '#eduTour .tour-body{margin:10px 0 1px;font-size:13px;line-height:1.48;color:rgba(255,244,229,.92)}',
    '#eduTour .tour-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}',
    '#eduTour button{min-height:44px;padding:8px 10px;border:1px solid rgba(255,183,104,.34);border-radius:9px;cursor:pointer;',
    ' background:rgba(255,142,47,.12);color:#ffe0b9;font:600 11px/1.1 inherit;letter-spacing:.015em}',
    '#eduTour button.primary{background:rgba(255,142,47,.25);border-color:rgba(255,192,121,.64);color:#fff0dc}',
    '#eduTour button.quiet{background:transparent;color:rgba(255,235,212,.72)}#eduTour button[hidden],#eduTour .tour-body[hidden]{display:none}',
    '#eduTour button:disabled{opacity:.48;cursor:default}#eduTour button:focus-visible{outline:2px solid #ffe0ad;outline-offset:3px}',
    // Layout desktop só em janelas realmente altas: telefone deitado
    // (largo mas baixo) permanece no layout mobile, colado à base segura.
    '@media(min-width:720px) and (min-height:500px){#eduTour .tour-card{left:22px;right:auto;bottom:28px;width:330px}}',
    // Em paisagem de telefone o disco domina a altura da tela; um cartão
    // mais estreito na esquerda deixa o Sol visível ao lado do texto.
    '@media(min-width:720px) and (max-height:499px){#eduTour .tour-card{width:min(240px,calc(100vw - 28px))}}',
    '@media(prefers-reduced-motion:reduce){#eduTour .tour-card{backdrop-filter:none;-webkit-backdrop-filter:none}}',
    // Chip de palco: o convite à visita mora no palco, não na engrenagem.
    '#eduTourChip{position:fixed;left:50%;bottom:max(16px,calc(env(safe-area-inset-bottom) + 10px));transform:translate3d(-50%,0,0);',
    ' z-index:41;pointer-events:auto;min-height:44px;padding:10px 20px;border-radius:999px;cursor:pointer;',
    ' border:1px solid rgba(255,183,104,.5);background:linear-gradient(128deg,rgba(8,11,18,.9),rgba(17,15,18,.78));',
    ' color:#ffe0b9;font:600 13px/1.1 inherit;letter-spacing:.02em;box-shadow:0 10px 26px rgba(0,0,0,.45);',
    ' backdrop-filter:blur(12px) saturate(1.15);-webkit-backdrop-filter:blur(12px) saturate(1.15)}',
    '#eduTourChip[hidden]{display:none}',
    '#eduTourChip:hover{background:linear-gradient(128deg,rgba(20,16,14,.94),rgba(30,22,16,.84));border-color:rgba(255,198,137,.8)}',
    '#eduTourChip:focus-visible{outline:2px solid #ffe0ad;outline-offset:3px}',
    // O hint sobe enquanto o chip está no palco, para não disputarem a base.
    // 42px encaixa o hint na folga entre o cartão de descoberta (base em
    // innerHeight-92, ver placeLabel do edu.js) e o topo do chip (44px+16).
    '#ui:has(#eduTourChip:not([hidden])) #hint{margin-bottom:42px}'
  ].join('');
  document.head.appendChild(style);

  var root=document.createElement('section');
  root.id='eduTour';root.hidden=true;root.setAttribute('aria-label','Visita guiada do Museu Solar');
  var card=document.createElement('article');card.className='tour-card';card.setAttribute('role','region');card.setAttribute('aria-live','polite');
  var kicker=document.createElement('div');kicker.className='tour-kicker';
  var progress=document.createElement('div');progress.className='tour-progress';progress.setAttribute('aria-hidden','true');
  var term=document.createElement('div');term.className='tour-term';
  var headline=document.createElement('div');headline.className='tour-headline';
  var status=document.createElement('div');status.className='tour-status';
  var body=document.createElement('div');body.className='tour-body';
  var actions=document.createElement('div');actions.className='tour-actions';
  var expand=document.createElement('button');expand.type='button';expand.className='primary';expand.id='eduTourExpand';
  var next=document.createElement('button');next.type='button';next.className='primary';next.id='eduTourNext';
  // PR-5 — sessão de cinema: só existe na última sala, quando a etapa está
  // pronta. Encerra a visita e entrega ao director (que devolve a câmera em
  // qualquer input) — a saída da visita continua sendo o botão `next`/`exit`.
  var cinema=document.createElement('button');cinema.type='button';cinema.className='primary';cinema.id='eduTourCinema';
  cinema.hidden=true;
  var resume=document.createElement('button');resume.type='button';resume.className='quiet';resume.id='eduTourResume';
  var exit=document.createElement('button');exit.type='button';exit.className='quiet';exit.id='eduTourExit';
  actions.appendChild(expand);actions.appendChild(next);actions.appendChild(cinema);actions.appendChild(resume);actions.appendChild(exit);
  card.appendChild(kicker);card.appendChild(progress);card.appendChild(term);card.appendChild(headline);card.appendChild(status);card.appendChild(body);card.appendChild(actions);root.appendChild(card);ui.appendChild(root);

  // Chip de palco: o convite à visita fica visível no palco, fora da
  // engrenagem. Persistência honesta em solKnobs: some para sempre depois de
  // 2 sessões ignoradas ou da primeira visita iniciada — a engrenagem
  // continua oferecendo a visita para sempre.
  var chipState={seen:0,engaged:false};
  try{
    var savedChip=ctx.savedKnobs&&ctx.savedKnobs.tourChip;
    if(savedChip&&typeof savedChip==='object')chipState={seen:savedChip.seen>>>0,engaged:!!savedChip.engaged};
  }catch(e){}
  chipState.seen++;
  function persistChip(){
    try{ctx.savedKnobs.tourChip={seen:chipState.seen,engaged:chipState.engaged};
      localStorage.setItem('solKnobs',JSON.stringify(ctx.savedKnobs));}catch(e){}
  }
  persistChip();
  var chip=document.createElement('button');chip.type='button';chip.id='eduTourChip';
  ui.appendChild(chip);
  function chipCopy(){var t=copy();chip.textContent=t.chip;chip.setAttribute('aria-label',t.chipAria);}
  function syncChip(){
    // PR-5: a abertura cinematográfica segura o palco; o relógio de 700ms
    // abaixo devolve o chip logo após o plano-sequência terminar.
    chip.hidden=state.active||chipState.engaged||chipState.seen>2||!!(ctx.directorActive&&ctx.directorActive())
      ||!!(ctx.introActive&&ctx.introActive());
  }
  chipCopy();syncChip();
  chip.addEventListener('click',function(){start();});
  // O diretor liga/desliga fora do nosso fluxo; um relógio lento basta para
  // o chip ceder o palco à sessão de cinema e voltar depois.
  setInterval(syncChip,700);

  // PR-5 — halo de destaque da visita: o MESMO padrão do hotspot de edu.js
  // (canvas radial-gradient → CanvasTexture → SpriteMaterial aditivo com
  // profundidade, filho do sunMesh). Criado UMA vez; posicionado por etapa
  // na direção OBJECT-space da fonte real. eduTourActive já suprime o halo
  // da exploração livre (eduEvent retorna cedo e eduTick esconde o visual),
  // então nunca há dois destaques disputando a cena.
  var haloCanvas=document.createElement('canvas');
  haloCanvas.width=haloCanvas.height=128;
  var h2=haloCanvas.getContext('2d');
  var haloGrad=h2.createRadialGradient(64,64,25,64,64,62);
  haloGrad.addColorStop(0,'rgba(255,214,155,0)');
  haloGrad.addColorStop(.46,'rgba(255,196,112,.12)');
  haloGrad.addColorStop(.62,'rgba(255,174,80,.95)');
  haloGrad.addColorStop(.69,'rgba(255,128,38,.20)');
  haloGrad.addColorStop(1,'rgba(255,100,20,0)');
  h2.fillStyle=haloGrad;h2.fillRect(0,0,128,128);
  var haloTexture=new THREE.CanvasTexture(haloCanvas);
  var haloMaterial=new THREE.SpriteMaterial({map:haloTexture,color:0xffc080,transparent:true,
    opacity:0,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});
  var halo=new THREE.Sprite(haloMaterial);
  halo.visible=false;halo.renderOrder=8;
  ctx.sunMesh.add(halo);
  var haloDir=new THREE.Vector3();
  var reducedMotion=false;
  try{reducedMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){}

  function current(){return STEPS[state.index];}
  function lang(){return ctx.eduLang==='en'?'en':'pt';}
  function copy(){return EDU_CONTENT[lang()].tour;}
  function stateSnapshot(){
    var w=window.innerWidth,h=window.innerHeight,dist=Math.max(ctx.camDist,ctx.SUN_RADIUS*1.001);
    var half=(ctx.camera.fov||42)*Math.PI/360;
    var radius=Math.tan(Math.asin(Math.min(1,ctx.SUN_RADIUS/dist)))/Math.tan(half)*h*.5;
    var cardRect=rectOf(card);
    return {
      available:true,active:state.active,stepId:state.active?current().id:'',index:state.active?state.index:-1,total:STEPS.length,
      phase:state.phase,expanded:state.expanded,timeFactor:state.timeFactor,assist:state.assist,manualReason:state.manualReason,
      source:{kind:state.source.kind,sourceId:state.source.sourceId,generation:state.source.generation,physical:state.source.physical,
        visible:state.source.visible,unavailable:state.source.unavailable},
      cardRect:cardRect,diskRect:{x:w*.5-radius,y:h*.5-radius,width:radius*2,height:radius*2},
      safeRect:{x:14,y:70,width:w-28,height:Math.max(0,cardRect.y-86)},
      chip:{visible:!!(chip&&!chip.hidden),rect:rectOf(chip)},
      halo:{visible:!!halo.visible,opacity:haloMaterial.opacity},
      settled:state.ready&&(!state.assist||cameraSettled())
    };
  }
  function notify(){
    if(typeof ctx.onEduTourChange==='function'){
      try{ctx.onEduTourChange(stateSnapshot());}catch(e){ctx.eduFault('notify',e);}
    }
  }
  function paintProgress(){
    progress.textContent='';
    for(var i=0;i<STEPS.length;i++){
      var dot=document.createElement('span');dot.className='tour-dot'+(i<state.index?' done':i===state.index?' current':'');progress.appendChild(dot);
    }
  }
  var lastRenderKey='',lastProgressIndex=-1;
  function render(){
    // tick() chama render() todo frame, mas o cartão é aria-live: reescrever
    // textContent sem mudança real vira spam de mutações para VoiceOver e
    // lixo de DOM. A chave cobre TUDO que altera o output (root.hidden,
    // textos, estados e rótulos dos botões); chave igual ⇒ retorno cedo.
    var key=state.active
      ?'1|'+state.index+'|'+lang()+'|'+(state.expanded?1:0)+'|'+(state.ready?1:0)+'|'+state.phase
        +'|'+(state.source.unavailable?1:0)+'|'+(state.assist?1:0)+'|'+state.manualReason
      :'0';
    if(key===lastRenderKey)return;
    lastRenderKey=key;
    if(!state.active){root.hidden=true;return;}
    var t=copy(),step=current(),c=t[step.copy]||t.surface;
    root.hidden=false;root.lang=lang()==='en'?'en':'pt-BR';
    kicker.textContent=t.label+' · '+(state.index+1)+' '+t.of+' '+STEPS.length;
    term.textContent=c.term;headline.textContent=c.headline;body.textContent=c.body;body.hidden=!state.expanded;
    var message='';
    if(state.source.unavailable)message=t.unavailable;
    else if(state.phase==='preparing')message=t.preparing;
    else if(!state.assist)message=t.manual;
    else if(state.expanded)message=t.paused;
    status.textContent=message;status.hidden=!message;
    expand.textContent=(state.expanded?'− ':'+ ')+(state.expanded?t.hide:t.read);
    expand.setAttribute('aria-expanded',String(state.expanded));expand.setAttribute('aria-controls','eduTourBody');body.id='eduTourBody';
    expand.disabled=!state.ready;
    next.textContent=state.index===STEPS.length-1?t.exit:t.next;
    next.disabled=!state.ready&&!state.source.unavailable;
    // PR-5 — a última sala oferece a sessão de cinema quando está pronta.
    // A chave de memoização já cobre index/ready/idioma: nada extra aqui.
    cinema.hidden=!(state.index===STEPS.length-1&&state.ready);
    cinema.textContent=t.cinema;
    resume.hidden=state.assist;resume.textContent=t.resume;
    exit.textContent=t.exit;
    // Os pontos de progresso só dependem de index/total.
    if(state.index!==lastProgressIndex){lastProgressIndex=state.index;paintProgress();}
  }
  function factor(){
    if(!state.active)return 1;
    if(state.panelOpen||state.expanded)return 0;
    if(!state.ready)return 1;
    return .08;
  }
  function syncFactor(){state.timeFactor=factor();ctx.eduTourTimeFactor=state.timeFactor;}
  function clearOverrides(){if(ctx.clearControlOverrides)ctx.clearControlOverrides('edu-tour');}
  function setOverride(key,value){if(ctx.setControlOverride)ctx.setControlOverride('edu-tour',key,value);}
  function frontPair(){
    var best=-1,bestK=-1;
    for(var i=0;i<ctx.pairStates.length;i++){
      var ps=ctx.pairStates[i];
      var k=Math.min(Math.abs(ps.lead.w)/Math.max(.001,Math.abs(ps.baseQ)),Math.abs(ps.foll.w)/Math.max(.001,Math.abs(ps.baseQ)*.85));
      if(k>bestK){bestK=k;best=i;}
    }
    if(best<0)return false;
    var pair=ctx.pairStates[best],x=pair.lead.x+pair.foll.x,y=pair.lead.y+pair.foll.y,z=pair.lead.z+pair.foll.z,l=Math.sqrt(x*x+y*y+z*z)||1;
    state.source={kind:'active-region',sourceId:best,generation:pair.eduGeneration,physical:bestK>=.55,visible:false,unavailable:false};
    state.sourceDir=[x/l,y/l,z/l];return true;
  }
  function matureProm(){
    var best=-1,bestK=-1;
    for(var i=0;i<ctx.promStates.length;i++){
      var ps=ctx.promStates[i],k=(ps.env||0)*(ps.fieldK||0);
      if(k>bestK){bestK=k;best=i;}
    }
    if(best<0)return false;
    var p=ctx.promStates[best],d=p.meshes[0].userData.dir;
    state.source={kind:current().kind,sourceId:best,generation:p.eduGeneration,physical:bestK>.1,visible:false,unavailable:false};
    state.sourceDir=[d.x,d.y,d.z];return true;
  }
  function sourceWorld(out){
    var step=current();
    if(step.aim==='wide')return null;
    if(step.id==='filament'||step.id==='prominence'){
      var prom=ctx.promStates[state.source.sourceId];
      if(!prom)return null;
      return out.copy(prom.meshes[0].userData.dir).applyQuaternion(ctx.prominenceGroup.quaternion).normalize();
    }
    if(step.id==='flare')return out.copy(ctx.surfFlareDir).applyQuaternion(ctx.sunMesh.quaternion).normalize();
    if(step.id==='cme')return out.copy(ctx.cmeDir).applyQuaternion(ctx.sunMesh.quaternion).normalize();
    if(!state.sourceDir)return null;
    return out.set(state.sourceDir[0],state.sourceDir[1],state.sourceDir[2]).applyQuaternion(ctx.sunMesh.quaternion).normalize();
  }
  function cameraSettled(){
    // Com a rampa de entrada do cameraTick, o alvo de distância demora a
    // sair do lugar — comparar camDist só com targetCamDist deixava o
    // "settled" verdadeiro ANTES do enquadramento da visita abrir espaço
    // para o cartão (flagrado em paisagem: cartão sobre o disco). Assentado
    // de verdade = câmera E alvo convergidos à distância desejada da etapa.
    var want=state.assist?desiredDistance():ctx.targetCamDist;
    return Math.abs(ctx.camDist-want)<.05&&Math.abs(ctx.targetCamDist-want)<.05;
  }
  function hasAmbientLoop(){
    for(var i=0;i<ctx.loopStatesA.length;i++)if(ctx.loopStatesA[i].ok)return true;
    return false;
  }
  function desiredDistance(){
    // O cartão expandido cresce para cima no retrato. Abrimos espaço de
    // verdade (em vez de deixar o texto cobrir a borda do disco), e a câmera
    // volta ao enquadramento mais próximo quando a leitura é recolhida.
    var mobile=window.innerWidth<720;
    var factor=state.expanded?(mobile?1.85:1.42):(mobile?1.36:1.22);
    return Math.min(ctx.maxDist,ctx.fitDist*factor);
  }
  function sourceProjection(){
    var p=sourceWorld(projected);
    if(!p)return {visible:true,x:window.innerWidth*.5,y:window.innerHeight*.5};
    ctx.camera.updateMatrixWorld(true);ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert();
    p.multiplyScalar(ctx.SUN_RADIUS*1.02).project(ctx.camera);
    return {visible:p.z<1&&p.z>-1,x:(p.x*.5+.5)*window.innerWidth,y:(1-(p.y*.5+.5))*window.innerHeight};
  }
  function updateSourceVisibility(){
    // Os acessos profundos (uniforms de materiais que a simulação pode
    // recriar) ficam sob guarda: uma estrutura ausente marca a fonte como
    // não-física em vez de derrubar o tick da visita.
    try{
      var step=current(),p=sourceProjection();
      state.source.visible=!!p.visible;
      if(step.id==='flare')state.source.physical=ctx.surfFlareT<12&&ctx.surfFlareAmp>0;
      else if(step.id==='cme')state.source.physical=ctx.cmeT<900&&ctx.cmeT>0;
      else if(step.id==='loops')state.source.physical=hasAmbientLoop();
      else if(step.id==='filament'){
        var fil=ctx.promStates[state.source.sourceId];
        state.source.physical=!!(fil&&fil.flat&&fil.flat.visible&&fil.flat.material.uniforms.uAbsorb.value>.02);
      }else if(step.id==='prominence'){
        var prom=ctx.promStates[state.source.sourceId];
        state.source.physical=!!(prom&&Math.max(prom.meshes[0].material.uniforms.uIntensity.value,prom.meshes[1].material.uniforms.uIntensity.value)>.04);
      }else if(step.id==='corona')state.source.physical=!!ctx.coronaRays;
      else if(step.id==='maximum')state.source.physical=Math.abs(ctx.cyclePhase01-.5)<.04&&ctx.cycleAmpK>1.12;
      else if(step.id==='minimum')state.source.physical=(ctx.cyclePhase01<.04||ctx.cyclePhase01>.96)&&ctx.cycleAmpK<.5;
    }catch(e){state.source.physical=false;ctx.eduFault('source-visibility',e);}
  }
  function record(){
    if(state.recorded||!state.source.physical||!ctx.recordEduDiscovery)return;
    var id=current().id;
    if(id==='active-region')ctx.recordEduDiscovery('spots','spots');
    else if(id==='flare')ctx.recordEduDiscovery('flare','flare');
    else if(id==='cme')ctx.recordEduDiscovery('cme','cme');
    else if(id==='filament')ctx.recordEduDiscovery('prominence','filament');
    else if(id==='prominence')ctx.recordEduDiscovery('prominence','prominence');
    else if(id==='maximum')ctx.recordEduDiscovery('cycleMaximum','cycleMaximum');
    else if(id==='minimum')ctx.recordEduDiscovery('cycleMinimum','cycleMinimum');
    state.recorded=true;
  }
  function ready(){
    state.ready=true;state.phase=state.assist?'reading':'manual';updateSourceVisibility();record();syncFactor();render();notify();
  }
  function configure(){
    clearOverrides();
    if(ctx.cancelCycleEvent)ctx.cancelCycleEvent();
    state.entered=0;state.fired=false;state.ready=false;state.expanded=false;state.recorded=false;state.phase='preparing';
    state.source={kind:current().kind,sourceId:-1,generation:-1,physical:false,visible:false,unavailable:false};state.sourceDir=null;
    var id=current().id;
    if(id==='active-region'||id==='loops'||id==='flare'||id==='cme'){
      setOverride('spots',1);setOverride('plageglow',.82);frontPair();
      state.source.kind=current().kind;
    }
    if(id==='loops'||id==='flare'||id==='cme')setOverride('loops',.86);
    if(id==='flare')setOverride('burst',.55);
    if(id==='cme'){
      setOverride('burst',.55);setOverride('cme',.92);
      if(ctx.CME_STEPS<=0||ctx.cmeKilled)state.source.unavailable=true;
    }
    if(id==='filament'||id==='prominence'){setOverride('fprom',.9);matureProm();}
    if(id==='corona'){setOverride('halo',.9);setOverride('ray',1.15);setOverride('cact',.7);state.source.physical=!!ctx.coronaRays;}
    if(id==='maximum'||id==='minimum'){setOverride('cycle',1);state.source.kind=id==='maximum'?'cycleMaximum':'cycleMinimum';}
    if(id==='surface'){state.source.physical=!!ctx.sunMesh;}
    syncFactor();render();notify();
  }
  function canRun(fn,label){
    if(typeof fn!=='function')return null;
    // Uma falha de física não pode sumir em silêncio: o ring de telemetria
    // (core/config.js) registra e o QA cobra faults===0 no fim da visita.
    try{return fn();}catch(e){ctx.eduFault(label,e);return null;}
  }
  function tickStep(){
    var id=current().id;
    if(state.source.unavailable){if(state.entered>.15)ready();return;}
    if(id==='surface'||id==='corona'){
      if(state.entered>.22)ready();return;
    }
    if(id==='active-region'){
      if(state.source.sourceId>=0&&state.entered>.32)ready();return;
    }
    if(id==='loops'){
      // O mesh pode estar ligado antes de haver uma linha de campo traçada.
      // Só liberamos a narrativa depois de uma estrutura real existir.
      if(state.source.sourceId>=0&&ctx.LOOP_K>.01&&hasAmbientLoop())ready();
      else if(state.entered>15){state.source.unavailable=true;ready();}
      return;
    }
    if(id==='flare'){
      if(!state.fired&&state.entered>.28){
        var flare=canRun(ctx.canPreviewBurst,'can-preview-burst');
        if(flare&&flare.ok){var fired=canRun(ctx.previewBurst,'preview-burst');if(fired&&fired.ok){state.fired=true;state.source.kind='flare';state.source.physical=true;state.source.sourceId=state.source.sourceId<0?0:state.source.sourceId;}}
      }
      if(state.fired&&ctx.surfFlareT>.08&&ctx.surfFlareT<10)ready();return;
    }
    if(id==='cme'){
      if(!state.fired){
        var cme=canRun(ctx.canPreviewCME,'can-preview-cme');
        if(cme&&cme.ok){var launched=canRun(ctx.previewCME,'preview-cme');if(launched&&launched.ok){state.fired=true;state.source.kind='cme';state.source.physical=true;}}
      }
      if(state.fired&&ctx.cmeT>.18&&ctx.cmeT<10)ready();return;
    }
    if(id==='filament'||id==='prominence'){
      updateSourceVisibility();
      if(state.source.sourceId>=0&&state.source.physical&&state.source.visible)ready();
      else if(state.entered>15){state.source.unavailable=true;ready();}
      return;
    }
    if(id==='maximum'||id==='minimum'){
      if(!state.fired){
        var event=id==='maximum'?canRun(ctx.previewSolarMax,'preview-solar-max'):canRun(ctx.previewSolarMin,'preview-solar-min');
        if(event&&event.ok)state.fired=true;
      }
      var cycle=ctx.act&&ctx.act.cycleEventInfo?ctx.act.cycleEventInfo():null;
      if(state.fired&&cycle&&cycle.on&&cycle.state==='hold')ready();
    }
  }
  function start(){
    if(ctx.directorUserExit)ctx.directorUserExit();
    if(state.active)end('restart');
    state.active=true;state.index=0;state.assist=true;state.manualReason='';state.panelOpen=false;
    // Uma nova visita toma a câmera: qualquer retorno em andamento cessa e
    // a pose corrente (onde quer que o retorno tenha chegado) vira a nova
    // referência de restauração.
    restore.active=false;
    state.previous={theta:ctx.theta,phi:ctx.phi,targetCamDist:ctx.targetCamDist};
    ctx.eduTourActive=true;
    if(!chipState.engaged){chipState.engaged=true;persistChip();}
    syncChip();configure();
    return stateSnapshot();
  }
  function end(reason){
    if(!state.active)return false;
    clearOverrides();if(ctx.cancelCycleEvent)ctx.cancelCycleEvent();
    if(state.previous){
      if(state.assist){
        // A pessoa nunca tomou a câmera (saiu ainda assistida): devolvemos
        // a pose COMPLETA de onde a visita começou, suavemente, via tick().
        restore.active=true;restore.theta=state.previous.theta;restore.phi=state.previous.phi;
        restore.dist=state.previous.targetCamDist;restore.startedAt=performance.now();
      }else{
        // Quem explorou manualmente não é teleportado: só o zoom volta.
        ctx.targetCamDist=state.previous.targetCamDist;
      }
    }
    state.active=false;state.phase='free';state.expanded=false;state.ready=false;state.timeFactor=1;state.panelOpen=false;
    // PR-5: o tick não roda mais com a visita inativa — o halo apaga aqui.
    halo.visible=false;haloMaterial.opacity=0;
    ctx.eduTourActive=false;ctx.eduTourTimeFactor=1;root.hidden=true;syncChip();notify();
    return reason||true;
  }
  function nextStep(){
    if(!state.active)return false;
    if(!state.ready&&!state.source.unavailable)return false;
    if(state.index>=STEPS.length-1){end('complete');return true;}
    state.index++;state.assist=true;state.manualReason='';configure();return stateSnapshot();
  }
  function setExpanded(on){
    if(!state.active||!state.ready)return false;
    state.expanded=on===undefined?!state.expanded:!!on;
    // Atualiza o alvo no próprio gesto; o suavizador de câmera preserva a
    // transição, mas não espera um frame extra para abrir a área de leitura.
    if(state.assist)ctx.targetCamDist=desiredDistance();
    syncFactor();render();notify();return state.expanded;
  }
  function userExit(reason){
    if(!state.active||!state.assist)return false;
    state.assist=false;state.manualReason=reason||'gesture';state.phase='manual';syncFactor();render();notify();return true;
  }
  function resumeFrame(){
    if(!state.active)return false;
    state.assist=true;state.manualReason='';state.phase=state.ready?'reading':'preparing';render();notify();return true;
  }
  function panelChanged(open){
    if(!state.active)return;
    state.panelOpen=!!open;syncFactor();
  }
  function cameraTick(rawDelta){
    if(!state.active||!state.assist||state.panelOpen)return;
    var step=current(),k=1-Math.exp(-Math.max(0,rawDelta)*3.5);
    // PR-5 — envelope de entrada da etapa: nos primeiros ~0.9s após o
    // configure() o ganho sobe em ease-in (rampa quadrática sobre
    // state.entered) — a câmera ACELERA em direção ao alvo em vez de partir
    // no ganho máximo. Após a rampa, o comportamento é o histórico. O micro
    // push-in do cartão expandido continua via desiredDistance/targetCamDist
    // (o mesmo suavizador) e não é tocado aqui.
    var ramp=Math.min(1,state.entered/0.9);
    k*=ramp*ramp;
    ctx.targetCamDist+= (desiredDistance()-ctx.targetCamDist)*k;
    var target=sourceWorld(world);
    if(!target||step.aim==='wide')return;
    if(step.aim==='limb'){
      side.crossVectors(target,up);if(side.lengthSq()<.001)side.crossVectors(target,axisX);side.normalize();
      aim.copy(target).multiplyScalar(.12).addScaledVector(side,.993).normalize();
    }else aim.copy(target);
    var th=Math.atan2(aim.z,aim.x),ph=Math.acos(clamp(aim.y,-1,1));
    ctx.theta=lerpAngle(ctx.theta,th,k);ctx.phi+= (ph-ctx.phi)*k;ctx.phi=clamp(ctx.phi,.18,Math.PI-.18);ctx.thetaVel=0;ctx.phiVel=0;
  }
  // PR-5 — halo de destaque nas etapas com fonte local. Visível apenas com
  // etapa ativa, pronta, fonte disponível e mira ancorada (aim!=='wide' —
  // as salas globais surface/corona/maximum/minimum não têm "um lugar").
  // Guarda local (padrão updateSourceVisibility): estrutura ausente esconde
  // o halo e registra no ring, sem derrubar o tick da visita.
  function haloTick(){
    try{
      var step=current();
      var show=state.active&&state.ready&&!state.source.unavailable&&step.aim!=='wide';
      if(show){
        if(step.id==='filament'||step.id==='prominence'){
          var prom=ctx.promStates[state.source.sourceId];
          if(prom)haloDir.copy(prom.meshes[0].userData.dir);else show=false;
        }else if(step.id==='flare')haloDir.copy(ctx.surfFlareDir);
        else if(step.id==='cme')haloDir.copy(ctx.cmeDir);
        else if(state.sourceDir)haloDir.set(state.sourceDir[0],state.sourceDir[1],state.sourceDir[2]);
        else show=false;
      }
      halo.visible=!!show;
      if(!show){haloMaterial.opacity=0;return;}
      // CME: a âncora acompanha a FRENTE da ejeção (cmeDir a 1.2R), não um
      // ponto preso à superfície; nas demais, logo acima da fotosfera.
      var anchor=step.id==='cme'?ctx.SUN_RADIUS*1.2:ctx.SUN_RADIUS*1.03;
      halo.position.copy(haloDir).normalize().multiplyScalar(anchor);
      halo.scale.setScalar(ctx.SUN_RADIUS*.3);
      // Pulso de opacidade (padrão edu.js): presença viva sem gritar sobre
      // o texto; com prefers-reduced-motion o brilho fica estável.
      haloMaterial.opacity=reducedMotion?.5:.42+.16*Math.sin(state.entered*2.6);
    }catch(e){halo.visible=false;haloMaterial.opacity=0;ctx.eduFault('tour-halo',e);}
  }
  function restoreTick(rawDelta){
    // Qualquer gesto NOVO durante o retorno cancela na hora — nunca
    // disputamos a câmera com a pessoa. O clique de saída marca interação
    // ANTES do end(); por isso o cancelamento compara o relógio de
    // interação com o instante em que o retorno começou, em vez de uma
    // janela absoluta que abortaria o retorno no próprio clique de sair.
    if(ctx.lastInteraction>restore.startedAt){restore.active=false;return;}
    var k=1-Math.exp(-Math.max(0,rawDelta)*3.5);
    ctx.theta=lerpAngle(ctx.theta,restore.theta,k);
    ctx.phi+=(restore.phi-ctx.phi)*k;
    ctx.targetCamDist+=(restore.dist-ctx.targetCamDist)*k;
    var dTheta=Math.abs(lerpAngle(ctx.theta,restore.theta,1)-ctx.theta);
    if(dTheta<.01&&Math.abs(restore.phi-ctx.phi)<.01&&Math.abs(restore.dist-ctx.targetCamDist)<.01)restore.active=false;
  }
  function tick(rawDelta){
    if(restore.active)restoreTick(rawDelta);
    if(!state.active)return;
    if(state.panelOpen){render();return;}
    state.entered+=Math.max(0,rawDelta);
    if(!state.ready)tickStep();else{updateSourceVisibility();syncFactor();}
    haloTick();
    render();
  }

  // Os botões do cartão contam como interação real: seguram a deriva idle
  // (controls.js) sem tocar na pose. A marca vem ANTES do end() do exit —
  // assim ela nunca cancela o retorno suave que o próprio exit inicia.
  function markUser(){if(ctx.markUserInteraction)ctx.markUserInteraction();}
  expand.addEventListener('click',function(){markUser();setExpanded();});
  next.addEventListener('click',function(){markUser();nextStep();});
  exit.addEventListener('click',function(){markUser();end('user');});
  resume.addEventListener('click',function(){markUser();resumeFrame();});
  // PR-5 — sessão de cinema: encerra a visita e entrega ao director. O
  // retorno suave de pose que o end() arma é desligado — o director assume
  // a câmera JÁ, e duas autorias lerpando a mesma pose seria briga. O
  // director devolve o controle em qualquer input (directorUserExit).
  cinema.addEventListener('click',function(){
    if(!state.active||state.index!==STEPS.length-1||!state.ready)return;
    markUser();
    end('cinema');
    restore.active=false;
    if(ctx.directorStart)ctx.directorStart();
  });
  ctx.eduTourStart=start;ctx.eduTourNext=nextStep;ctx.eduTourExit=end;ctx.eduTourExpand=setExpanded;ctx.eduTourUserExit=userExit;
  ctx.eduTourResumeFrame=resumeFrame;ctx.eduTourPanelChanged=panelChanged;ctx.eduTourCameraTick=cameraTick;ctx.eduTourTick=tick;ctx.eduTourInfo=stateSnapshot;
  ctx.onEduTourLanguageChange=function(){chipCopy();render();notify();};ctx.eduTourTimeFactor=1;ctx.eduTourActive=false;
}

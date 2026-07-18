// QA da primeira fatia educativa: flare real, idioma, layout, oclusão,
// movimento reduzido e guarda absoluta do modo determinístico.
const path=require('path');
const{chromium}=require('playwright');
const htmlFile=process.argv[2]||'dist-single/index.html';
const base='file://'+path.resolve(htmlFile);
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}
function overlap(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function segmentDistance(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=dx*dx+dy*dy;if(d<.01)return Math.hypot(px-x1,py-y1);const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/d));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
async function frame(page){await page.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>resolve())));}
async function waitForLabelSettled(page){
  await page.waitForFunction(()=>{
    const item=window.__solInfo.eduInfo().active[0],label=document.querySelector('#edu .edu-label');
    if(!item||!item.visible||!label)return false;
    const target=label.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/);
    if(!target)return false;
    const rect=label.getBoundingClientRect();
    return Math.abs(rect.x-Number(target[1]))<1&&Math.abs(rect.y-Number(target[2]))<1;
  },null,{timeout:5000});
}
async function forceVisible(page){
  for(let i=0;i<4;i++){
    // startEvent verifica a visibilidade sincronicamente. Portanto a
    // câmera precisa chegar ao par magnético ANTES de forceFlarePair()
    // emitir o flare físico; mirar depois fazia o teste depender da
    // orientação aleatória do Sol no carregamento.
    await page.evaluate((n)=>{
      const dir=window.__solInfo.eduSpotRegion(n).dir,state=window.__solInfo.state();
      // É a mesma direção de ponto médio usada por forceFlarePair().
      // `dir` é local ao Sol; a âncora educativa aplica `rotY` antes de
      // medir a frente. A câmera precisa receber essa mesma direção mundo.
      window.__solInfo.setView(Math.atan2(dir[2],dir[0])-state.rotY,Math.acos(Math.max(-1,Math.min(1,dir[1]))),state.fitDist*1.3);
    },i);
    await frame(page);await frame(page);
    await page.evaluate((n)=>window.__solInfo.forceFlarePair(n),i);
    await frame(page);
    try{
      await page.waitForFunction(()=>{const info=window.__solInfo.eduInfo(),item=info.active[0];return !!(item&&item.type==='flare'&&item.visible);},null,{timeout:12000});
    }catch(_){continue;}
    const info=await page.evaluate(()=>window.__solInfo.eduInfo());
    if(info.active.length&&info.active[0].type==='flare'&&info.active[0].visible){
      // A duração da transição depende do compositor; esperamos a posição
      // DOM final, não um número arbitrário de milissegundos.
      await waitForLabelSettled(page);
      return {index:i,info};
    }
  }
  return null;
}
async function forceVisibleCme(page){
  for(let i=0;i<4;i++){
    await page.evaluate((n)=>{
      window.__solInfo.forceCME(n);
      // A fonte é real; a câmera apenas é posta no limbo dela, como a
      // própria prova visual de CME faz. Assim o teste não depende de uma
      // região aleatória estar no lado certo do Sol no carregamento.
      const state=window.__solInfo.state(),dir=window.__solInfo.cmeInfo().dir;
      const theta=Math.atan2(dir[2],dir[0]);
      window.__solInfo.setView(theta+Math.PI/2,Math.PI*.5,state.fitDist*1.35);
      window.__solInfo.setCmeClock(4);
    },i);
    await frame(page);
    // Não esperamos a animação CSS aqui: em SwiftShader, 700 ms podem
    // consumir a curta vida física da CME. O frame já confirma o estado
    // editorial e a fonte física no mesmo instante.
    const state=await page.evaluate(()=>({info:window.__solInfo.eduInfo(),cme:window.__solInfo.cmeInfo()}));
    const info=state.info;
    if(info.active.length&&info.active[0].type==='cme'&&info.active[0].visible){
      return {index:i,info,cme:state.cme};
    }
  }
  return null;
}
async function forceProminenceView(page,view){
  const count=await page.evaluate(()=>window.__solInfo.promLife().length);
  for(let i=0;i<count;i++){
    await page.evaluate(({i,view})=>{
      // Isola uma única estrutura física madura; não usamos eduEmit aqui.
      // A descoberta tem de nascer do ciclo real da proeminência/filamento.
      window.__solInfo.setControl('edu',0,{persist:false});
      const total=window.__solInfo.promLife().length;
      for(let j=0;j<total;j++)window.__solInfo.setPromLife(j,.01);
      window.__solInfo.setPromLife(i,.30);
      const dir=window.__solInfo.promLife()[i].dir,state=window.__solInfo.state();
      let theta=Math.atan2(dir[2],dir[0]),phi=Math.acos(Math.max(-1,Math.min(1,dir[1])));
      if(view==='prominence'){theta+=Math.PI/2;phi=Math.PI*.5;}
      window.__solInfo.setView(theta,phi,state.fitDist*1.3);
      window.__solInfo.setControl('edu',1,{persist:false});
    },{i,view});
    await frame(page);await frame(page);
    const state=await page.evaluate((i)=>{
      const info=window.__solInfo.eduInfo(),item=info.active[0];
      return {info,item,text:document.querySelector('.edu-label').textContent,
        physical:window.__solInfo.fpromInfo()[i],projection:window.__solInfo.projectProm(i)};
    },i);
    if(state.item&&state.item.type==='prominence'&&state.item.sourceId===i&&state.item.visible&&
      (view==='filament'?state.item.contentKey==='filament':state.item.contentKey==='prominence'))return {index:i,...state};
  }
  return null;
}
async function forceSpotDiscovery(page){
  await page.evaluate(()=>{
    window.__solInfo.setControl('edu',0,{persist:false});
    window.__solInfo.setRotSpeed(0);
    // Retira as proeminências da disputa: a fonte da prova deve ser a
    // região magnética real, não outra descoberta já madura.
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
    // Fica perto do pico para manter regiões fortes, mas fora da janela
    // editorial de máximo natural. Assim a prova isola manchas em vez de
    // competir com um cartão global de maior prioridade.
    window.__solInfo.setCyclePhase(.42,true);
  });
  await frame(page);
  for(let i=0;i<4;i++){
    const candidate=await page.evaluate((i)=>window.__solInfo.eduSpotRegion(i),i);
    if(candidate.strength<.70)continue;
    await page.evaluate(({i,dir})=>{
      const state=window.__solInfo.state();
      window.__solInfo.setView(Math.atan2(dir[2],dir[0]),Math.acos(Math.max(-1,Math.min(1,dir[1]))),state.fitDist*1.3);
      window.__solInfo.setControl('edu',1,{persist:false});
    },{i,dir:candidate.dir});
    await frame(page);await frame(page);
    const state=await page.evaluate((i)=>({spot:window.__solInfo.eduSpotRegion(i),info:window.__solInfo.eduInfo(),text:document.querySelector('.edu-label').textContent}),i);
    const item=state.info.active[0];
    if(item&&item.type==='spots'&&item.sourceId===i&&item.visible)return {index:i,item,...state};
  }
  return null;
}
async function forceCycleDiscovery(page,kind){
  const prepared=await page.evaluate((kind)=>{
    // A prova da descoberta natural não usa a prévia/hold. Ela posiciona o
    // relógio físico num estado legítimo do modelo e confirma que o emissor
    // reage a fase+amplitude mesmo sem cycleEvent.
    window.__solInfo.setControl('edu',0,{persist:false});
    window.__solInfo.setRotSpeed(0);
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
    window.__solInfo.setControl('spots',0,{persist:false});
    window.__solInfo.setCyclePhase(kind==='maximum'?.5:1,true);
    const cycle=window.__solInfo.cycleInfo();
    window.__solInfo.setControl('edu',1,{persist:false});
    return {cycle:cycle,info:window.__solInfo.eduInfo()};
  },kind);
  await frame(page);await frame(page);
  await page.waitForFunction((kind)=>{
    const cycle=window.__solInfo.cycleInfo();
    const atTarget=kind==='maximum' ? Math.abs(cycle.phase-.5)<.04 : cycle.phase<.04||cycle.phase>.96;
    const item=window.__solInfo.eduInfo().active[0];
    return !cycle.event.on&&atTarget&&item&&item.type===(kind==='maximum'?'cycleMaximum':'cycleMinimum')&&item.global&&item.visible;
  },kind,{timeout:30000});
  // A semântica já existe no frame anterior; aguarda apenas a transição de
  // entrada acabar antes de medir a posição editorial na tela.
  await page.waitForTimeout(700);
  return page.evaluate((prepared)=>({prepared:prepared,info:window.__solInfo.eduInfo(),cycle:window.__solInfo.cycleInfo(),text:document.querySelector('.edu-label').textContent}),prepared);
}
async function layoutState(page){
  return page.evaluate(()=>{
    const info=window.__solInfo.eduInfo(),a=info.active[0];
    function rect(sel){const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}
    const line=document.querySelector('#edu .edu-line');
    return {info,label:a&&a.labelRect,anchor:a&&a.anchor,title:rect('#title-block'),gear:rect('#knobBtn'),hint:rect('#hint'),
      line:line?{x1:+line.getAttribute('x1'),y1:+line.getAttribute('y1')}:null,
      intro:rect('#edu .edu-intro'),introVisible:!!document.querySelector('#edu .edu-intro.visible'),
      viewport:{width:innerWidth,height:innerHeight},lang:document.querySelector('#edu')&&document.querySelector('#edu').lang};
  });
}
(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];

  // Mesmo ?edu=1 não pode atravessar a guarda determinística.
  const det=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});
  det.setDefaultTimeout(180000);
  await det.addInitScript(()=>localStorage.setItem('solEduCollection.v1','{"sentinel":true}'));
  det.on('pageerror',(e)=>errors.push('[det] '+e.message));
  det.on('console',(m)=>{if(m.type()==='error')errors.push('[det] '+m.text());});
  await det.goto(base+'?det=1&seed=7&hold=2&tier=low&scale=0.25&edu=1');
  await det.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>4);
  const inert=await det.evaluate(()=>({info:__solInfo.eduInfo(),root:!!document.querySelector('#edu'),style:!!document.querySelector('#eduStyle'),
    panelSwitch:!!document.querySelector('#eduSwitchRow'),langControl:!!document.querySelector('#eduLangRow'),collectionRow:!!document.querySelector('#eduCollectionRow'),
    collection:__solInfo.eduCollectionInfo(),collectionStored:localStorage.getItem('solEduCollection.v1'),emit:__solInfo.eduEmit('flare'),force:__solInfo.forceFlarePair(0)}));
  check('det permanece totalmente sem camada educativa',!inert.info.enabled&&!inert.root&&!inert.style&&!inert.panelSwitch&&!inert.langControl&&!inert.collectionRow&&!inert.collection.available&&inert.collectionStored==='{"sentinel":true}'&&!inert.emit);
  await det.close();

  // GO-LIVE (série Museu, PR-3): a carga SEM parâmetros, num contexto
  // virgem de iPhone, chega com o museu de porta aberta — descobertas
  // ligadas, intro visível, chip da visita no palco. URL/storage seguem
  // vencendo: ?edu=0 desliga e storage desligado permanece desligado.
  const fresh=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const freshPage=await fresh.newPage();
  freshPage.setDefaultTimeout(240000);
  freshPage.on('pageerror',(e)=>errors.push('[fresh] '+e.message));
  freshPage.on('console',(m)=>{if(m.type()==='error')errors.push('[fresh] '+m.text());});
  await freshPage.goto(base);
  await freshPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo&&window.__solInfo.eduTourInfo);
  const arrival=await freshPage.evaluate(()=>({info:__solInfo.eduInfo(),rootHidden:document.querySelector('#edu')&&document.querySelector('#edu').hidden,
    introVisible:!!document.querySelector('#edu .edu-intro.visible'),chip:__solInfo.eduTourInfo().chip}));
  // Uma descoberta real pode disparar já nos primeiros segundos e ocupar o
  // lugar da intro — museu de porta aberta COM obra em exposição também
  // conta como recepção correta.
  check('carga sem parâmetros chega com descobertas ligadas e chip no palco',
    arrival.info.enabled&&arrival.rootHidden===false&&(arrival.introVisible||arrival.info.active.length>0)&&arrival.chip.visible,
    JSON.stringify({enabled:arrival.info.enabled,rootHidden:arrival.rootHidden,introVisible:arrival.introVisible,
      activeCount:arrival.info.active.length,chip:arrival.chip}));
  const optOut=await freshPage.evaluate(()=>{__solInfo.setControl('edu',0,{persist:false});return __solInfo.eduInfo().enabled;});
  check('desligar continua possível e imediato',optOut===false);
  await fresh.close();

  // Coleção: memória separada de solKnobs, gravada apenas após uma
  // descoberta física visível. O contexto isolado impede que itens de
  // cenários anteriores escondam uma regressão de persistência.
  const collectionContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  const collectionPage=await collectionContext.newPage();
  collectionPage.setDefaultTimeout(240000);
  collectionPage.on('pageerror',(e)=>errors.push('[collection] '+e.message));
  collectionPage.on('console',(m)=>{if(m.type()==='error')errors.push('[collection] '+m.text());});
  await collectionPage.goto(base+'?edu=0&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0');
  await collectionPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCollectionInfo);
  await collectionPage.evaluate(()=>{
    localStorage.setItem('solKnobs',JSON.stringify({qaSentinel:17}));
    __solInfo.clearEduCollection();__solInfo.setRotSpeed(0);
    // A coleção deste cenário mede apenas o flare. As proeminências são
    // reais e normalmente visíveis mesmo com fprom=0, então as deixamos
    // encerrar enquanto a experiência educativa ainda está desligada.
    for(let j=0;j<__solInfo.promLife().length;j++)__solInfo.setPromLife(j,.01);
  });
  await frame(collectionPage);await frame(collectionPage);
  const collectionStart=await collectionPage.evaluate(()=>({info:__solInfo.eduCollectionInfo(),store:localStorage.getItem('solEduCollection.v1')}));
  await collectionPage.evaluate(()=>__solInfo.forceFlarePair(0));
  await frame(collectionPage);
  const collectionHidden=await collectionPage.evaluate(()=>__solInfo.eduCollectionInfo());
  await collectionPage.evaluate(()=>__solInfo.setControl('edu',1,{persist:false}));
  const collectionFlare=await forceVisible(collectionPage);
  const collectionObserved=await collectionPage.evaluate(()=>({info:__solInfo.eduCollectionInfo(),store:localStorage.getItem('solEduCollection.v1')}));
  check('coleção só registra descoberta física já visível',collectionStart.info.discoveredFamilies===0&&collectionStart.store===null&&collectionHidden.discoveredFamilies===0&&!!collectionFlare&&collectionObserved.info.items.flare.seen&&!!collectionObserved.store);
  // Fecha a cena educativa antes de abrir o leitor: assim uma eventual
  // descoberta espontânea não mascara a garantia de que o leitor é estático.
  await collectionPage.evaluate(()=>__solInfo.setControl('edu',0,{persist:false}));
  await frame(collectionPage);
  await collectionPage.click('#knobBtn');await collectionPage.waitForTimeout(650);
  await collectionPage.click('#eduCollectionToggle');
  await collectionPage.click('#eduCollectionItem-flare');
  const collectionReaderPt=await collectionPage.evaluate(()=>{
    var toggle=document.querySelector('#eduCollectionToggle'), item=document.querySelector('#eduCollectionItem-flare'), reader=document.querySelector('#eduCollectionReader');
    return {expanded:toggle.getAttribute('aria-expanded'),text:reader.textContent,focus:document.activeElement.id,active:__solInfo.eduInfo().active.length,
      toggleH:toggle.getBoundingClientRect().height,itemH:item.getBoundingClientRect().height};
  });
  check('coleção relê sem recriar cartão ou âncora falsa',collectionReaderPt.expanded==='true'&&/Flare solar/.test(collectionReaderPt.text)&&collectionReaderPt.focus==='eduCollectionReader'&&collectionReaderPt.active===0&&collectionReaderPt.toggleH>=44&&collectionReaderPt.itemH>=44,JSON.stringify(collectionReaderPt));
  await collectionPage.click('#edu-lang-en');
  const collectionEnglish=await collectionPage.evaluate(()=>({text:document.querySelector('#eduCollectionReader').textContent,info:__solInfo.eduCollectionInfo()}));
  check('coleção troca a releitura para inglês sem duplicar descoberta',/Solar flare/.test(collectionEnglish.text)&&collectionEnglish.info.discoveredFamilies===1&&collectionEnglish.info.discoveredViews===1,JSON.stringify({text:collectionEnglish.text,info:collectionEnglish.info}));
  const collectionPersistedPage=await collectionContext.newPage();
  collectionPersistedPage.setDefaultTimeout(240000);
  await collectionPersistedPage.goto(base+'?edu=0&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0');
  await collectionPersistedPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCollectionInfo);
  const collectionPersisted=await collectionPersistedPage.evaluate(()=>({info:__solInfo.eduCollectionInfo(),active:__solInfo.eduInfo().active.length}));
  check('coleção persiste entre visitas sem reabrir um evento ao vivo',collectionPersisted.info.items.flare.seen&&collectionPersisted.active===0);
  await collectionPersistedPage.close();
  await collectionPage.setViewportSize({width:390,height:844});await frame(collectionPage);
  const collectionMobile=await collectionPage.evaluate(()=>({clearH:document.querySelector('#eduCollectionClear').getBoundingClientRect().height,clearVisible:!document.querySelector('#eduCollectionClear').hidden}));
  check('coleção mantém alvos de toque no iPhone',collectionMobile.clearVisible&&collectionMobile.clearH>=44,JSON.stringify(collectionMobile));
  const knobsBeforeClear=await collectionPage.evaluate(()=>localStorage.getItem('solKnobs'));
  collectionPage.once('dialog',(d)=>d.dismiss());await collectionPage.click('#eduCollectionClear');await collectionPage.waitForTimeout(80);
  const collectionKept=await collectionPage.evaluate(()=>__solInfo.eduCollectionInfo());
  collectionPage.once('dialog',(d)=>d.accept());await collectionPage.click('#eduCollectionClear');await collectionPage.waitForTimeout(80);
  const collectionCleared=await collectionPage.evaluate(()=>({info:__solInfo.eduCollectionInfo(),store:localStorage.getItem('solEduCollection.v1'),knobs:localStorage.getItem('solKnobs')}));
  check('limpar coleção pede confirmação e preserva ajustes',collectionKept.items.flare.seen&&collectionCleared.info.discoveredFamilies===0&&collectionCleared.store===null&&collectionCleared.knobs===knobsBeforeClear);
  await collectionContext.close();

  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  page.setDefaultTimeout(240000);
  page.on('pageerror',(e)=>errors.push('[edu] '+e.message));
  page.on('console',(m)=>{if(m.type()==='error')errors.push('[edu] '+m.text());});
  await page.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0');
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await page.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const fired=await forceVisible(page);
  check('flare físico canônico abre uma descoberta',!!fired, fired?'par '+fired.index:'nenhum par frontal');
  if(!fired)throw new Error('não foi possível criar flare educativo frontal');

  let state=await layoutState(page);
  const r=state.label,v=state.viewport,a=state.anchor;
  const inside=r&&r.x>=12&&r.y>=12&&r.x+r.width<=v.width-12&&r.y+r.height<=v.height-12;
  const clear=r&&a&&!(a.x>r.x-20&&a.x<r.x+r.width+20&&a.y>r.y-20&&a.y<r.y+r.height+20);
  const chromeClear=r&&![state.title,state.gear,state.hint].filter(Boolean).some((x)=>overlap(r,x));
  const lineAtAnchor=state.line&&Math.hypot(state.line.x1-a.x,state.line.y1-a.y)<=2;
  const item=state.info.active[0];
  const lineClearsSun=!item.connectorVisible||segmentDistance(item.disk.x,item.disk.y,item.anchor.x,item.anchor.y,item.lineEnd.x,item.lineEnd.y)>item.disk.r+6;
  check('layout desktop fica dentro da tela e não cobre o fenômeno',inside&&clear&&chromeClear&&lineAtAnchor&&lineClearsSun,JSON.stringify({r,a,line:item.connectorVisible}));

  const pt=await page.evaluate(()=>({text:document.querySelector('.edu-label').textContent,lang:__solInfo.eduInfo().lang,root:document.querySelector('#edu').lang,
    looseButton:!!document.querySelector('#edu .edu-lang')}));
  await page.click('#knobBtn');
  await page.waitForTimeout(650);
  await page.click('#edu-lang-en');
  const en=await page.evaluate(()=>{
    const langRow=document.querySelector('#knobPanel #eduLangRow'),firstControl=document.querySelector('#knobPanel .row');
    const rect=langRow&&langRow.getBoundingClientRect();
    return {text:document.querySelector('.edu-label').textContent,lang:__solInfo.eduInfo().lang,root:document.querySelector('#edu').lang,
      inMenu:!!langRow,atTop:!!(langRow&&firstControl&&(langRow.compareDocumentPosition(firstControl)&Node.DOCUMENT_POSITION_FOLLOWING)),
      visible:!!(rect&&rect.top>=0&&rect.bottom<=innerHeight),pressed:document.querySelector('#edu-lang-en').getAttribute('aria-pressed'),
      saved:JSON.parse(localStorage.getItem('solKnobs')||'{}').lang};
  });
  check('idioma fica no topo dos ajustes e troca a descoberta ao vivo',!pt.looseButton&&en.inMenu&&en.atTop&&en.visible&&en.pressed==='true'&&en.saved==='en'&&pt.lang==='pt'&&pt.root==='pt-BR'&&en.lang==='en'&&en.root==='en'&&pt.text!==en.text&&/Solar flare/.test(en.text),JSON.stringify(en));
  await page.click('#knobBtn');

  const original=await page.evaluate(()=>window.__solInfo.state());
  await page.evaluate((s)=>window.__solInfo.setView(s.theta+Math.PI,Math.PI-s.phi,s.camDist),original);
  await frame(page);
  const behind=await page.evaluate(()=>window.__solInfo.eduInfo());
  check('flare no lado oculto não recebe posição falsa',behind.active.length===1&&!behind.active[0].visible&&!behind.active[0].inFront);
  await page.evaluate((s)=>window.__solInfo.setView(s.theta,s.phi,s.camDist),original);
  await frame(page);
  const frontAgain=await page.evaluate(()=>window.__solInfo.eduInfo());
  check('descoberta reaparece sem novo evento ao voltar à frente',frontAgain.active.length===1&&frontAgain.active[0].visible);

  await page.setViewportSize({width:390,height:844});
  await frame(page);
  await waitForLabelSettled(page);
  state=await layoutState(page);
  const m=state.label,mv=state.viewport,ma=state.anchor;
  const mobileInside=m&&m.x>=12&&m.y>=12&&m.x+m.width<=mv.width-12&&m.y+m.height<=mv.height-12;
  const mobileClear=m&&ma&&!(ma.x>m.x-20&&ma.x<m.x+m.width+20&&ma.y>m.y-20&&ma.y<m.y+m.height+20)&&
    ![state.title,state.gear,state.hint].filter(Boolean).some((x)=>overlap(m,x))&&
    (!state.introVisible||!state.intro||!overlap(m,state.intro));
  check('layout portrait permanece legível e livre',mobileInside&&mobileClear,JSON.stringify({m,ma}));

  await page.evaluate(()=>window.__solInfo.setFlareClock(20));
  await frame(page);
  const ended=await page.evaluate(()=>window.__solInfo.eduInfo());
  check('descoberta encerra junto do evento',ended.active.length===0);
  await page.close();

  // CME vive em tier alto: deve nascer da mesma fonte física que o flare,
  // substituir sua narrativa quando a frente emerge e nunca existir no low.
  const lowCme=await browser.newPage({viewport:{width:640,height:420},deviceScaleFactor:1});
  lowCme.setDefaultTimeout(240000);
  lowCme.on('pageerror',(e)=>errors.push('[cme-low] '+e.message));
  lowCme.on('console',(m)=>{if(m.type()==='error')errors.push('[cme-low] '+m.text());});
  await lowCme.goto(base+'?edu=1&tier=low&scale=0.25&speed=0.05&cycle=0&cme=1');
  await lowCme.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await lowCme.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const lowLaunch=await lowCme.evaluate(()=>({forced:__solInfo.forceCME(0),cme:__solInfo.cmeInfo()}));
  await frame(lowCme);
  const lowEdu=await lowCme.evaluate(()=>({info:__solInfo.eduInfo(),collection:__solInfo.eduCollectionInfo()}));
  check('CME não inventa descoberta em tier sem geometria',!lowLaunch.forced&&lowLaunch.cme.steps===0&&!lowEdu.info.active.some((x)=>x.type==='cme')&&!lowEdu.info.queued.some((x)=>x.type==='cme')&&!lowEdu.collection.items.cme.seen);
  await lowCme.close();

  const cmePage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  cmePage.setDefaultTimeout(240000);
  cmePage.on('pageerror',(e)=>errors.push('[cme] '+e.message));
  cmePage.on('console',(m)=>{if(m.type()==='error')errors.push('[cme] '+m.text());});
  await cmePage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&cme=1');
  await cmePage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await cmePage.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const cmeFired=await forceVisibleCme(cmePage);
  const cmeState=await cmePage.evaluate(()=>({info:__solInfo.eduInfo(),text:document.querySelector('.edu-label').textContent,cme:__solInfo.cmeInfo(),collection:__solInfo.eduCollectionInfo()}));
  const cmeItem=cmeState.info.active[0];
  const cmeLineClear=cmeItem&&!cmeItem.connectorVisible||!!(cmeItem&&segmentDistance(cmeItem.disk.x,cmeItem.disk.y,cmeItem.anchor.x,cmeItem.anchor.y,cmeItem.lineEnd.x,cmeItem.lineEnd.y)>cmeItem.disk.r+6);
  check('CME física substitui o flare quando sua frente emerge',!!cmeFired&&!!cmeFired.cme.on&&cmeItem&&cmeItem.type==='cme'&&cmeItem.priority>90&&cmeItem.visible&&cmeState.collection.items.cme.seen&&/Ejeção de massa coronal/.test(cmeState.text)&&cmeLineClear,cmeItem?JSON.stringify({par:cmeFired?cmeFired.index:null,anchor:cmeItem.anchor,line:cmeItem.connectorVisible,cme:cmeState.cme,text:cmeState.text}):'sem CME');
  await cmePage.evaluate(()=>window.__solInfo.setCmeClock(20));
  await frame(cmePage);
  const cmeEnded=await cmePage.evaluate(()=>window.__solInfo.eduInfo());
  check('narrativa da CME encerra com a ejeção física',!cmeEnded.active.some((x)=>x.type==='cme'));
  await cmePage.close();

  // A mesma estrutura física recebe nomes diferentes conforme o fundo: o
  // filamento absorve sobre o disco; a proeminência emite além do limbo.
  const promPage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  promPage.setDefaultTimeout(240000);
  promPage.on('pageerror',(e)=>errors.push('[prom] '+e.message));
  promPage.on('console',(m)=>{if(m.type()==='error')errors.push('[prom] '+m.text());});
  await promPage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&fprom=1');
  await promPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await promPage.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const filament=await forceProminenceView(promPage,'filament');
  const filamentLineClear=filament&&!filament.item.connectorVisible||!!(filament&&segmentDistance(filament.item.disk.x,filament.item.disk.y,filament.item.anchor.x,filament.item.anchor.y,filament.item.lineEnd.x,filament.item.lineEnd.y)>filament.item.disk.r+6);
  check('filamento usa absorção física e uma única narrativa no disco',!!filament&&filament.info.limit===1&&filament.info.active.length===1&&filament.physical.absorb>=.055&&/Filamento solar/.test(filament.text)&&filamentLineClear,filament?JSON.stringify({slot:filament.index,absorb:filament.physical.absorb,key:filament.item.contentKey,line:filament.item.connectorVisible}):'nenhum filamento elegível');
  const prominence=await forceProminenceView(promPage,'prominence');
  const prominenceLineClear=prominence&&!prominence.item.connectorVisible||!!(prominence&&segmentDistance(prominence.item.disk.x,prominence.item.disk.y,prominence.item.anchor.x,prominence.item.anchor.y,prominence.item.lineEnd.x,prominence.item.lineEnd.y)>prominence.item.disk.r+6);
  check('proeminência usa emissão no limbo sem duplicar o filamento',!!prominence&&Math.max(...prominence.projection.uInt)>=.34&&/Proeminência solar/.test(prominence.text)&&prominenceLineClear,prominence?JSON.stringify({slot:prominence.index,uInt:prominence.projection.uInt,key:prominence.item.contentKey,line:prominence.item.connectorVisible}):'nenhuma proeminência elegível');
  const promEnglish=await promPage.evaluate(()=>{window.__solInfo.setLang('en');return{info:window.__solInfo.eduInfo(),text:document.querySelector('.edu-label').textContent};});
  check('a mesma estrutura troca corretamente para inglês',!!prominence&&promEnglish.info.active.length===1&&promEnglish.info.active[0].contentKey==='prominence'&&/Solar prominence/.test(promEnglish.text));
  if(prominence){
    await promPage.evaluate((i)=>{
      window.__solInfo.setLang('pt');
      const dir=window.__solInfo.promLife()[i].dir,state=window.__solInfo.state();
      window.__solInfo.setView(Math.atan2(dir[2],dir[0]),Math.acos(Math.max(-1,Math.min(1,dir[1]))),state.fitDist*1.3);
    },prominence.index);
    await frame(promPage);await frame(promPage);
  }
  const sameStructure=prominence?await promPage.evaluate((i)=>({info:window.__solInfo.eduInfo(),text:document.querySelector('.edu-label').textContent,physical:window.__solInfo.fpromInfo()[i]}),prominence.index):null;
  check('a câmera renomeia a mesma estrutura sem criar outro cartão',!!sameStructure&&sameStructure.info.active.length===1&&sameStructure.info.active[0].sourceId===prominence.index&&sameStructure.info.active[0].contentKey==='filament'&&sameStructure.physical.absorb>=.055&&/Filamento solar/.test(sameStructure.text));
  const promCollection=await promPage.evaluate(()=>__solInfo.eduCollectionInfo());
  check('coleção reconhece as duas vistas da mesma estrutura',!!filament&&!!prominence&&promCollection.items.prominence.discoveredViews===2);
  await promPage.close();

  const spotsPage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  spotsPage.setDefaultTimeout(240000);
  spotsPage.on('pageerror',(e)=>errors.push('[spots] '+e.message));
  spotsPage.on('console',(m)=>{if(m.type()==='error')errors.push('[spots] '+m.text());});
  // Começa desligado: a prova habilita a experiência só depois de preparar
  // a região ativa física no máximo do ciclo.
  await spotsPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1');
  await spotsPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduSpotRegion);
  const spots=await forceSpotDiscovery(spotsPage);
  const spotsLineClear=spots&&!spots.item.connectorVisible||!!(spots&&segmentDistance(spots.item.disk.x,spots.item.disk.y,spots.item.anchor.x,spots.item.anchor.y,spots.item.lineEnd.x,spots.item.lineEnd.y)>spots.item.disk.r+6);
  check('grupo de manchas vem da região magnética real',!!spots&&spots.spot.strength>=.70&&spots.item.generation===spots.spot.generation&&/Grupo de manchas solares/.test(spots.text)&&spotsLineClear,spots?JSON.stringify({slot:spots.index,generation:spots.spot.generation,strength:spots.spot.strength,line:spots.item.connectorVisible}):'nenhuma região ativa frontal');
  const spotsEnglish=await spotsPage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('grupo de manchas troca para inglês',!!spots&&/Sunspot group/.test(spotsEnglish));
  if(spots){
    await spotsPage.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
    await frame(spotsPage);await frame(spotsPage);
  }
  const spotsReplay=await spotsPage.evaluate(()=>window.__solInfo.eduInfo());
  check('o mesmo conceito de manchas não repete cartões na sessão',!!spots&&!spotsReplay.active.some((x)=>x.type==='spots'));
  const spotsCollection=await spotsPage.evaluate(()=>window.__solInfo.eduCollectionInfo());
  check('coleção registra o grupo de manchas observado',!!spots&&spotsCollection.items.spots.seen);
  await spotsPage.close();

  // Máximo e mínimo pertencem à mesma coleção local; usamos explicitamente
  // o mesmo contexto de navegador para provar que as duas vistas coexistem.
  const cycleCollectionContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  const maxPage=await cycleCollectionContext.newPage();
  maxPage.setDefaultTimeout(240000);
  maxPage.on('pageerror',(e)=>errors.push('[cycle-max] '+e.message));
  maxPage.on('console',(m)=>{if(m.type()==='error')errors.push('[cycle-max] '+m.text());});
  await maxPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1&fprom=0&cme=0');
  await maxPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.cycleInfo);
  const maximum=await forceCycleDiscovery(maxPage,'maximum');
  const maxItem=maximum&&maximum.info.active[0];
  const maxLayout=await layoutState(maxPage);
  const maxInside=maxLayout.label&&maxLayout.label.x>=12&&maxLayout.label.y>=12&&maxLayout.label.x+maxLayout.label.width<=maxLayout.viewport.width-12&&maxLayout.label.y+maxLayout.label.height<=maxLayout.viewport.height-12;
  const maxChromeClear=maxLayout.label&&[maxLayout.title,maxLayout.gear,maxLayout.hint].filter(Boolean).every((x)=>!overlap(maxLayout.label,x));
  check('máximo solar nasce também do ciclo natural',!!maximum&&!maximum.prepared.info.active.some((x)=>x.type==='cycleMaximum'||x.type==='cycleMinimum')&&!maximum.prepared.cycle.event.on&&!maximum.cycle.event.on&&Math.abs(maximum.cycle.phase-.5)<.04&&maximum.cycle.amp>1.12&&!!maxItem&&maxItem.global&&maxItem.anchor===null&&maxItem.lineEnd===null&&!maxItem.connectorVisible&&!maxItem.haloVisible&&!maxLayout.introVisible&&!maximum.info.queued.some((x)=>x.global)&&/Máximo solar/.test(maximum.text)&&maxInside&&maxChromeClear,maximum?JSON.stringify({phase:maximum.cycle.phase,amp:maximum.cycle.amp,global:maxItem&&maxItem.global,event:maximum.cycle.event.on}):'não chegou ao máximo');
  const maxCollection=await maxPage.evaluate(()=>__solInfo.eduCollectionInfo());
  check('coleção registra o máximo solar alcançado',maxCollection.items.cycle.views.cycleMaximum);
  const maxEnglish=await maxPage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('máximo solar troca para inglês sem criar nova descoberta',/Solar maximum/.test(maxEnglish)&&(await maxPage.evaluate(()=>window.__solInfo.eduInfo().active.length))===1);
  await maxPage.setViewportSize({width:390,height:844});
  await frame(maxPage);await maxPage.waitForTimeout(700);
  const maxMobile=await layoutState(maxPage);
  const maxMobileInside=maxMobile.label&&maxMobile.label.x>=12&&maxMobile.label.y>=12&&maxMobile.label.x+maxMobile.label.width<=maxMobile.viewport.width-12&&maxMobile.label.y+maxMobile.label.height<=maxMobile.viewport.height-12;
  const maxMobileClear=maxMobile.label&&[maxMobile.title,maxMobile.gear,maxMobile.hint].filter(Boolean).every((x)=>!overlap(maxMobile.label,x));
  check('cartão global do máximo permanece legível no iPhone',maxMobileInside&&maxMobileClear&&maxMobile.anchor===null&&!maxMobile.introVisible);
  await maxPage.close();

  const minPage=await cycleCollectionContext.newPage();
  minPage.setDefaultTimeout(240000);
  minPage.on('pageerror',(e)=>errors.push('[cycle-min] '+e.message));
  minPage.on('console',(m)=>{if(m.type()==='error')errors.push('[cycle-min] '+m.text());});
  await minPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1&fprom=0&cme=0');
  await minPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.cycleInfo);
  const minimum=await forceCycleDiscovery(minPage,'minimum');
  const minItem=minimum&&minimum.info.active[0];
  check('mínimo solar nasce do estado físico de baixa atividade',!!minimum&&!minimum.prepared.cycle.event.on&&!minimum.cycle.event.on&&(minimum.cycle.phase<.04||minimum.cycle.phase>.96)&&minimum.cycle.amp<.5&&!!minItem&&minItem.global&&/Mínimo solar/.test(minimum.text),minimum?JSON.stringify({phase:minimum.cycle.phase,amp:minimum.cycle.amp,global:minItem&&minItem.global,event:minimum.cycle.event.on}):'não chegou ao mínimo');
  const minCollection=await minPage.evaluate(()=>__solInfo.eduCollectionInfo());
  check('coleção registra o mínimo solar alcançado',minCollection.items.cycle.views.cycleMaximum&&minCollection.items.cycle.views.cycleMinimum);
  await minPage.close();
  await cycleCollectionContext.close();

  const reducedContext=await browser.newContext({viewport:{width:640,height:420},deviceScaleFactor:1,reducedMotion:'reduce'});
  const reduced=await reducedContext.newPage();
  reduced.setDefaultTimeout(240000);
  reduced.on('pageerror',(e)=>errors.push('[reduce] '+e.message));
  reduced.on('console',(m)=>{if(m.type()==='error')errors.push('[reduce] '+m.text());});
  await reduced.goto(base+'?edu=1&tier=low&scale=0.25&speed=0.05&cycle=0');
  await reduced.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await reduced.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const reducedFired=await forceVisible(reduced);
  const reducedInfo=await reduced.evaluate(()=>window.__solInfo.eduInfo());
  check('movimento reduzido preserva conteúdo sem pulso',!!reducedFired&&reducedInfo.reducedMotion&&reducedInfo.active[0].visible);
  await reducedContext.close();

  check('console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();browser=null;
  if(fails){console.log('QA EDU: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA EDU: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

// QA da primeira fatia educativa: flare real, idioma, layout, oclusão,
// movimento reduzido, guarda absoluta do modo determinístico e o gate da
// coroa por FÓTONS (PR-6): o knob `ray` precisa mudar luz de verdade no
// anel 1.15R–1.6R ao redor do disco.
const fs=require('fs');
const path=require('path');
const{chromium}=require('playwright');
const{PNG}=require('pngjs');
const htmlFile=process.argv[2]||'dist-single/index.html';
const base='file://'+path.resolve(htmlFile);
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}
function overlap(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function segmentDistance(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,d=dx*dx+dy*dy;if(d<.01)return Math.hypot(px-x1,py-y1);const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/d));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
async function frame(page){await page.evaluate(()=>new Promise((resolve)=>requestAnimationFrame(()=>resolve())));}
async function frames(page,n){for(let i=0;i<n;i++)await frame(page);}
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
  // A intro do go-live esvai por idade simulada; no ritmo do SwiftShader
  // isso leva vários segundos de relógio — esperamos ela sumir AQUI (com
  // folga) em vez de deixar a corrida chegar ao check de layout.
  await page.waitForFunction((kind)=>{
    const cycle=window.__solInfo.cycleInfo();
    const atTarget=kind==='maximum' ? Math.abs(cycle.phase-.5)<.04 : cycle.phase<.04||cycle.phase>.96;
    const item=window.__solInfo.eduInfo().active[0];
    const introGone=!document.querySelector('#edu .edu-intro.visible');
    return !cycle.event.on&&atTarget&&item&&item.type===(kind==='maximum'?'cycleMaximum':'cycleMinimum')&&item.global&&item.visible&&introGone;
  },kind,{timeout:60000});
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
    collection:__solInfo.eduCollectionInfo(),collectionStored:localStorage.getItem('solEduCollection.v1'),emit:__solInfo.eduEmit('flare'),force:__solInfo.forceFlarePair(0),
    intro:__solInfo.introInfo(),introStyle:!!document.querySelector('#introStyle'),cinemaBtn:!!document.querySelector('#eduTourCinema'),
    postcardBtn:!!document.querySelector('#postcardBtn'),postcard:__solInfo.lastPostcard(),celebration:__solInfo.eduCollectionCelebration()}));
  check('det permanece totalmente sem camada educativa',!inert.info.enabled&&!inert.root&&!inert.style&&!inert.panelSwitch&&!inert.langControl&&!inert.collectionRow&&!inert.collection.available&&inert.collectionStored==='{"sentinel":true}'&&!inert.emit);
  // PR-5 — abertura e sessão de cinema também ausentes sob det (fábricas
  // nem rodam: hook responde available:false e nenhum DOM/classe existe).
  check('det permanece sem abertura e sem sessão de cinema',
    !inert.intro.available&&!inert.intro.active&&!inert.introStyle&&!inert.cinemaBtn,JSON.stringify(inert.intro));
  // PR-12 — o botão do postal vive na seção experiência (ausente sob det) e
  // a celebração da coleção nem define hooks: tudo inerte por construção.
  check('det permanece sem postal e sem celebração de coleção',
    !inert.postcardBtn&&inert.postcard===null&&!inert.celebration.available&&!inert.celebration.pending,
    JSON.stringify({postcardBtn:inert.postcardBtn,celebration:inert.celebration}));
  await det.close();

  // GO-LIVE (série Museu, PR-3): a carga num contexto virgem de iPhone
  // chega com o museu de porta aberta — descobertas ligadas, intro visível,
  // chip da visita no palco. URL/storage seguem vencendo: ?edu=0 desliga e
  // storage desligado permanece desligado. intro=0 (PR-5): a abertura
  // cinematográfica esconderia o chip durante o plano-sequência — ela tem
  // prova própria em qa-edu-tour; aqui isolamos o go-live das descobertas.
  const fresh=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const freshPage=await fresh.newPage();
  freshPage.setDefaultTimeout(240000);
  freshPage.on('pageerror',(e)=>errors.push('[fresh] '+e.message));
  freshPage.on('console',(m)=>{if(m.type()==='error')errors.push('[fresh] '+m.text());});
  await freshPage.goto(base+'?intro=0');
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

  // GO-LIVE (PR-4) — chegada fresca: sem query de knobs e sem storage, o
  // visitante recebe o Sol COMPLETO (física + cinema acoplado a eventos) e a
  // estilização estática continua opt-in. ?scale=0.25 só reduz a resolução
  // do SwiftShader — não muda tier (high), defaults, draw calls nem o
  // orçamento dos loops.
  const museu=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  museu.setDefaultTimeout(300000);
  museu.on('pageerror',(e)=>errors.push('[museu] '+e.message));
  museu.on('console',(m)=>{if(m.type()==='error')errors.push('[museu] '+m.text());});
  await museu.goto(base+'?scale=0.25&intro=0');
  await museu.waitForFunction(()=>window.__solInfo&&window.__solInfo.perf&&window.__solInfo.perf().frames>2);
  const freshDefaults=await museu.evaluate(()=>{
    const on={spots:1,loops:0.55,fprom:0.55,cme:0.9,cvol:0.5,burst:0.55,adapt:0.55,disp:0.4,hal:0.45,shimmer:0.45};
    const off=['veil','streak','fringe','tone','film','hand','dof'];
    const bad=[];
    Object.keys(on).forEach((k)=>{const c=__solInfo.controls(k);
      if(Math.abs(c.nominal-on[k])>1e-9||c.source!=='default')bad.push(k+'='+c.nominal+'('+c.source+')');});
    off.forEach((k)=>{const c=__solInfo.controls(k);if(c.nominal!==0)bad.push(k+'='+c.nominal);});
    return {bad,tier:__solInfo.perf().tier};
  });
  check('museu: chegada fresca liga física e cinema de eventos, estilo segue opt-in',
    freshDefaults.bad.length===0,freshDefaults.bad.join(', ')||freshDefaults.tier);
  // A coroa volumétrica precisa DE FATO ficar pronta na chegada (bake real,
  // não só o knob) antes de medirmos o regime cheio de trabalho por frame.
  await museu.waitForFunction(()=>__solInfo.controls('cvol').metrics.ready===true,null,{timeout:300000});
  // Proxies de perf no CI (nada de FPS — SwiftShader não presta para isso):
  // draw calls por frame são função da ESTRUTURA da cena, não da máquina.
  // Medido no PR-4 (tier high, defaults museu, cvol pronto): 25–30 calls por
  // frame, pico 30 com flare+CME ativos → teto fixado em 38 (30 × 1,25).
  const freshPerf=[];
  for(let i=0;i<12;i++)freshPerf.push(await museu.evaluate(()=>new Promise((res)=>requestAnimationFrame(()=>res(window.__solInfo.perf().calls)))));
  const freshLoops=await museu.evaluate(()=>{const l=__solInfo.loopInfo();return {maxProbe:l.maxProbe,maxTrace:l.maxTrace,maxOps:l.maxOps};});
  check('museu: draw calls da chegada ficam sob o teto medido',Math.max(...freshPerf)<=38,freshPerf.join(','));
  check('museu: scheduler dos loops respeita o orçamento por frame',
    freshLoops.maxProbe<=1&&freshLoops.maxTrace<=1&&freshLoops.maxOps<=1,JSON.stringify(freshLoops));
  await museu.close();

  // Coleção: memória separada de solKnobs, gravada apenas após uma
  // descoberta física visível. O contexto isolado impede que itens de
  // cenários anteriores escondam uma regressão de persistência.
  const collectionContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  const collectionPage=await collectionContext.newPage();
  collectionPage.setDefaultTimeout(240000);
  collectionPage.on('pageerror',(e)=>errors.push('[collection] '+e.message));
  collectionPage.on('console',(m)=>{if(m.type()==='error')errors.push('[collection] '+m.text());});
  await collectionPage.goto(base+'?edu=0&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0&intro=0');
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
  await collectionPersistedPage.goto(base+'?edu=0&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0&intro=0');
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

  // ————— PR-12 · conclusão da coleção (cartão único por aparelho) —————
  // Semeia 10 famílias no store (todas MENOS flare) e observa a 11ª DE
  // VERDADE: um flare físico canônico. O registro da 11ª arma o latch em
  // collection.js; o emissor do animate abre o cartão GLOBAL prioridade 110
  // (que pode preemptar o próprio cartão do flare — comportamento desenhado:
  // nada compete com um evento que acontece uma vez na vida do aparelho),
  // persiste `celebrated:true` no MESMO store e nunca repete — nem no reload.
  const doneContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  await doneContext.addInitScript(()=>{
    // Semeia SÓ na primeira carga: o init script roda de novo no reload e
    // sobrescreveria o store persistido (flare + celebrated) — o alvo da
    // prova de persistência é justamente o que a página gravou.
    if(localStorage.getItem('solEduCollection.v1'))return;
    const families={surface:['surface'],granulation:['granulation'],spots:['spots'],loops:['loops'],
      cme:['cme'],prominence:['prominence','filament'],spicules:['spicules'],
      corona:['corona'],coronalHole:['coronalHole'],cycle:['cycleMaximum','cycleMinimum']};
    const items={};
    Object.keys(families).forEach((f)=>{items[f]={views:{}};families[f].forEach((v)=>{items[f].views[v]=true;});});
    localStorage.setItem('solEduCollection.v1',JSON.stringify({v:1,items}));
  });
  const donePage=await doneContext.newPage();
  donePage.setDefaultTimeout(240000);
  donePage.on('pageerror',(e)=>errors.push('[complete] '+e.message));
  donePage.on('console',(m)=>{if(m.type()==='error')errors.push('[complete] '+m.text());});
  await donePage.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0&intro=0');
  await donePage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCollectionCelebration&&window.__solInfo.eduInfo);
  await donePage.evaluate(()=>{
    window.__solInfo.setRotSpeed(0);
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
  });
  await frames(donePage,2);
  const doneStart=await donePage.evaluate(()=>({collection:__solInfo.eduCollectionInfo(),celebration:__solInfo.eduCollectionCelebration()}));
  check('conclusão: 10 de 11 famílias semeadas não armam a celebração',
    doneStart.collection.discoveredFamilies===10&&!doneStart.collection.complete&&
    doneStart.celebration.available&&!doneStart.celebration.pending&&!doneStart.celebration.celebrated,
    JSON.stringify({families:doneStart.collection.discoveredFamilies,celebration:doneStart.celebration}));
  // A 11ª família nasce de um flare físico visível (mesma mira do
  // forceVisible; aqui a espera é pelo REGISTRO na coleção, porque o cartão
  // do flare pode ser preemptado pelo cartão de conclusão no frame seguinte).
  let doneFlare=false;
  for(let i=0;i<4&&!doneFlare;i++){
    await donePage.evaluate((n)=>{
      const dir=window.__solInfo.eduSpotRegion(n).dir,state=window.__solInfo.state();
      window.__solInfo.setView(Math.atan2(dir[2],dir[0])-state.rotY,Math.acos(Math.max(-1,Math.min(1,dir[1]))),state.fitDist*1.3);
    },i);
    await frames(donePage,2);
    await donePage.evaluate((n)=>window.__solInfo.forceFlarePair(n),i);
    try{
      await donePage.waitForFunction(()=>window.__solInfo.eduCollectionInfo().items.flare.seen,null,{timeout:12000});
      doneFlare=true;
    }catch(_){}
  }
  check('conclusão: a 11ª família nasce de um flare físico visível',doneFlare);
  await donePage.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='collectionComplete'&&i.global&&i.visible);},null,{timeout:120000});
  const doneState=await donePage.evaluate(()=>({info:__solInfo.eduInfo(),celebration:__solInfo.eduCollectionCelebration(),
    collection:__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent,
    store:JSON.parse(localStorage.getItem('solEduCollection.v1'))}));
  const doneItem=doneState.info.active[0];
  check('conclusão: cartão global prioridade 110, texto sereno e celebrated persistido',
    !!doneItem&&doneItem.priority===110&&doneItem.global&&doneItem.anchor===null&&!doneItem.haloVisible&&!doneItem.connectorVisible&&
    doneState.collection.complete&&doneState.celebration.celebrated&&!doneState.celebration.pending&&
    doneState.store.celebrated===true&&/VOCÊ OBSERVOU O SOL INTEIRO/.test(doneState.text)&&/Coleção completa/.test(doneState.text),
    JSON.stringify({priority:doneItem&&doneItem.priority,celebrated:doneState.store.celebrated,text:doneState.text.slice(0,70)}));
  const doneEnglish=await donePage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('conclusão troca para inglês ao vivo',
    /YOU HAVE SEEN THE WHOLE SUN/.test(doneEnglish)&&/Collection complete/.test(doneEnglish),doneEnglish.slice(0,80));
  // Painel: a linha do estado completo aparece junto do contador "11 de 11".
  await donePage.evaluate(()=>window.__solInfo.setLang('pt'));
  await donePage.click('#knobBtn');await donePage.waitForTimeout(650);
  const donePanel=await donePage.evaluate(()=>{
    const line=document.querySelector('#eduCollectionComplete');
    return {present:!!line,hidden:!!(line&&line.hidden),text:line?line.textContent:'',
      toggle:document.querySelector('#eduCollectionToggle').textContent};
  });
  check('painel reflete a coleção completa (linha via strings.js)',
    donePanel.present&&!donePanel.hidden&&/Coleção completa/.test(donePanel.text)&&/11 de 11/.test(donePanel.toggle),
    JSON.stringify(donePanel));
  // Reload no MESMO contexto: celebrated sobrevive e o cartão não repete.
  const donePage2=await doneContext.newPage();
  donePage2.setDefaultTimeout(240000);
  donePage2.on('pageerror',(e)=>errors.push('[complete-reload] '+e.message));
  donePage2.on('console',(m)=>{if(m.type()==='error')errors.push('[complete-reload] '+m.text());});
  await donePage2.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&fprom=0&spots=0&cme=0&intro=0');
  await donePage2.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCollectionCelebration);
  await frames(donePage2,30);
  const doneReload=await donePage2.evaluate(()=>({celebration:__solInfo.eduCollectionCelebration(),
    collection:__solInfo.eduCollectionInfo(),info:__solInfo.eduInfo()}));
  check('conclusão: não repete após reload (celebrated sobrevive no aparelho)',
    doneReload.collection.complete&&doneReload.collection.celebrated&&doneReload.celebration.celebrated&&
    !doneReload.celebration.pending&&!doneReload.info.active.some((x)=>x.type==='collectionComplete'),
    JSON.stringify(doneReload.celebration));
  await doneContext.close();

  // ————— PR-12 · postal "guardar esta vista" —————
  // O clique captura o frame corrente (SEM preserveDrawingBuffer — os
  // atributos reais do contexto provam), compõe a faixa da marca num canvas
  // 2D offscreen e entrega por Web Share ou download. A prova decodifica o
  // PNG composto do hook white-box: dimensões idênticas ao drawing buffer,
  // peso real de imagem e a linha âmbar da faixa atravessando a base — e
  // ausente no topo (espaço).
  const postal=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});
  postal.setDefaultTimeout(240000);
  postal.on('pageerror',(e)=>errors.push('[postal] '+e.message));
  postal.on('console',(m)=>{if(m.type()==='error')errors.push('[postal] '+m.text());});
  let postalDownloadName=null;
  postal.on('download',(d)=>{postalDownloadName=d.suggestedFilename();});
  await postal.goto(base+'?edu=1&lang=pt&tier=low&scale=0.5&speed=0.05&cycle=0&intro=0');
  await postal.waitForFunction(()=>window.__solInfo&&window.__solInfo.lastPostcard&&document.querySelector('#postcardBtn'));
  const postalBefore=await postal.evaluate(()=>({last:__solInfo.lastPostcard(),attrs:__solInfo.glAttributes()}));
  check('postal: sem captura antes do clique e sem preserveDrawingBuffer',
    postalBefore.last===null&&!!postalBefore.attrs&&postalBefore.attrs.preserveDrawingBuffer===false,
    JSON.stringify(postalBefore.attrs));
  await postal.click('#knobBtn');await postal.waitForTimeout(650);
  await postal.click('#postcardBtn');
  // captura no fim do frame corrente + composição assíncrona (Image.onload
  // + toBlob); a entrega assenta o campo delivery por último.
  await postal.waitForFunction(()=>{const p=__solInfo.lastPostcard();return !!(p&&p.delivery);},null,{timeout:180000});
  const post=await postal.evaluate(()=>{const p=__solInfo.lastPostcard();
    return {width:p.width,height:p.height,bytes:p.bytes,delivery:p.delivery,dataURL:p.dataURL,size:__solInfo.perf().size};});
  check('postal: dimensões idênticas ao drawing buffer e peso de imagem real',
    post.width===post.size[0]&&post.height===post.size[1]&&post.bytes>10000,
    JSON.stringify({w:post.width,h:post.height,size:post.size,bytes:post.bytes}));
  const postalPng=PNG.sync.read(Buffer.from(post.dataURL.split(',')[1],'base64'));
  function warmRow(png,y){let n=0;for(let x=0;x<png.width;x++){const i=(y*png.width+x)*4;
    const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
    if(r>=200&&g>=120&&g<=210&&b<140&&r>g+40)n++;}return n;}
  // a mesma aritmética da composição (ui/postcard.js): a linha #ffaa5a
  // começa exatamente em h-band e tem ~5% da faixa de espessura
  const postalBand=Math.max(30,Math.round(postalPng.height*0.10));
  const postalLineY=postalPng.height-postalBand;
  let bandWarm=0;
  for(let y=postalLineY;y<Math.min(postalPng.height,postalLineY+Math.max(1,Math.round(postalBand*0.05)));y++)
    bandWarm=Math.max(bandWarm,warmRow(postalPng,y));
  let topWarm=0;
  for(let y=0;y<Math.min(8,postalPng.height);y++)topWarm=Math.max(topWarm,warmRow(postalPng,y));
  check('postal: faixa da marca composta na base e ausente no topo',
    bandWarm>postalPng.width*0.9&&topWarm<postalPng.width*0.05,
    JSON.stringify({bandWarm,topWarm,width:postalPng.width,band:postalBand}));
  check('postal: entrega por share ou download com o nome sol-postal.png',
    post.delivery==='share'||(post.delivery==='download'&&(postalDownloadName===null||postalDownloadName==='sol-postal.png')),
    JSON.stringify({delivery:post.delivery,download:postalDownloadName}));
  await postal.close();

  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  page.setDefaultTimeout(240000);
  page.on('pageerror',(e)=>errors.push('[edu] '+e.message));
  page.on('console',(m)=>{if(m.type()==='error')errors.push('[edu] '+m.text());});
  await page.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&intro=0');
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
  // PR-4: com os defaults do museu (spots/fprom ligados) o palco fica vivo —
  // outra descoberta física pode assumir o slot no mesmo frame. A prova
  // continua a mesma: o cartão do FLARE termina junto do evento físico.
  check('descoberta do flare encerra junto do evento',!ended.active.some((x)=>x.type==='flare'),
    JSON.stringify(ended.active.map((x)=>x.type)));
  await page.close();

  // CME vive em tier alto: deve nascer da mesma fonte física que o flare,
  // substituir sua narrativa quando a frente emerge e nunca existir no low.
  const lowCme=await browser.newPage({viewport:{width:640,height:420},deviceScaleFactor:1});
  lowCme.setDefaultTimeout(240000);
  lowCme.on('pageerror',(e)=>errors.push('[cme-low] '+e.message));
  lowCme.on('console',(m)=>{if(m.type()==='error')errors.push('[cme-low] '+m.text());});
  await lowCme.goto(base+'?edu=1&tier=low&scale=0.25&speed=0.05&cycle=0&cme=1&intro=0');
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
  await cmePage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&cme=1&intro=0');
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
  await promPage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&fprom=1&intro=0');
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
  await spotsPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1&intro=0');
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

  // ————— PR-8 · Onda 1: loops coronais espontâneos —————
  // O cartão nasce de uma linha de campo REALMENTE traçada (loopStatesA.ok,
  // via fonte única phenomena.loops) com o knob no DEFAULT do museu — a
  // página não pina `loops`. halo/ray/spots/fprom/cme/cycle ficam fora da
  // disputa para a prova isolar o emissor novo.
  const loopsPage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  loopsPage.setDefaultTimeout(300000);
  loopsPage.on('pageerror',(e)=>errors.push('[loops] '+e.message));
  loopsPage.on('console',(m)=>{if(m.type()==='error')errors.push('[loops] '+m.text());});
  await loopsPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&spots=0&fprom=0&cme=0&halo=0&ray=0&intro=0');
  await loopsPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduLoopAnchor);
  const loopsDefault=await loopsPage.evaluate(()=>{
    window.__solInfo.setRotSpeed(0);
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
    return window.__solInfo.controls('loops');
  });
  check('loops chegam LIGADOS por default (museu)',loopsDefault.nominal===0.55&&loopsDefault.source==='default',JSON.stringify({nominal:loopsDefault.nominal,source:loopsDefault.source}));
  // espera o traçador publicar uma linha real; a âncora educativa é a MESMA
  // semente do traçado que o emissor usa (fonte única).
  await loopsPage.waitForFunction(()=>window.__solInfo.loopInfo().amb>0,null,{timeout:300000});
  await loopsPage.waitForFunction(()=>!!window.__solInfo.eduLoopAnchor(),null,{timeout:120000});
  await loopsPage.evaluate(()=>{
    const a=window.__solInfo.eduLoopAnchor(),state=window.__solInfo.state();
    // salto de fase do QA (hook existente): o arco recém-nascido pula para o
    // platô do envelope — a prova não espera minutos de relógio simulado.
    window.__solInfo.setLoopLife(a.slot,.3);
    // mesma conversão de forceVisible: dir é local ao Sol, a âncora aplica rotY.
    window.__solInfo.setView(Math.atan2(a.dir[2],a.dir[0])-state.rotY,Math.acos(Math.max(-1,Math.min(1,a.dir[1]))),state.fitDist*1.3);
  });
  await frame(loopsPage);await frame(loopsPage);
  await loopsPage.evaluate(()=>window.__solInfo.setControl('edu',1,{persist:false}));
  await loopsPage.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='loops'&&i.visible);},null,{timeout:180000});
  await waitForLabelSettled(loopsPage);
  const loopsState=await loopsPage.evaluate(()=>({info:window.__solInfo.eduInfo(),anchor:window.__solInfo.eduLoopAnchor(),loop:window.__solInfo.loopInfo(),
    collection:window.__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent,viewport:{w:innerWidth,h:innerHeight}}));
  const loopsItem=loopsState.info.active[0];
  const loopsOnScreen=!!(loopsItem&&loopsItem.anchor&&loopsItem.anchor.x>=0&&loopsItem.anchor.x<=loopsState.viewport.w&&loopsItem.anchor.y>=0&&loopsItem.anchor.y<=loopsState.viewport.h);
  check('loops coronais: cartão espontâneo nasce de linha de campo real com âncora na tela',
    !!loopsItem&&loopsItem.type==='loops'&&loopsItem.visible&&loopsItem.haloVisible&&loopsOnScreen&&loopsState.loop.amb>0&&/Loops coronais/.test(loopsState.text),
    JSON.stringify({amb:loopsState.loop.amb,anchor:loopsItem&&loopsItem.anchor,halo:loopsItem&&loopsItem.haloVisible}));
  check('loops coronais: coleção registra a família nova',loopsState.collection.items.loops.seen&&loopsState.collection.items.loops.views.loops===true);
  const loopsEnglish=await loopsPage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('loops coronais trocam para inglês',/Coronal loops/.test(loopsEnglish));
  // uma explicação por sessão: religar a experiência não repete o cartão
  // nem duplica a coleção (idempotência do store).
  await loopsPage.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
  await frames(loopsPage,3);
  const loopsReplay=await loopsPage.evaluate(()=>({info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('loops coronais: uma explicação por sessão, sem duplicar coleção',
    !loopsReplay.info.active.some((x)=>x.type==='loops')&&loopsReplay.collection.items.loops.discoveredViews===1);
  await loopsPage.close();

  // Controle NEGATIVO: com ?loops=0 nenhuma linha é traçada — sem sinal
  // físico não existe âncora, cartão nem item de coleção.
  const loopsOff=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  loopsOff.setDefaultTimeout(240000);
  loopsOff.on('pageerror',(e)=>errors.push('[loops-neg] '+e.message));
  loopsOff.on('console',(m)=>{if(m.type()==='error')errors.push('[loops-neg] '+m.text());});
  await loopsOff.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&spots=0&fprom=0&cme=0&halo=0&ray=0&loops=0&intro=0');
  await loopsOff.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduLoopAnchor);
  await loopsOff.evaluate(()=>{window.__solInfo.setRotSpeed(0);for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);});
  await frames(loopsOff,30);
  const loopsNeg=await loopsOff.evaluate(()=>({loop:window.__solInfo.loopInfo(),anchor:window.__solInfo.eduLoopAnchor(),info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('loops=0 nunca emite: sem linha traçada, sem âncora, sem cartão, sem coleção',
    loopsNeg.loop.amb===0&&loopsNeg.anchor===null&&loopsNeg.info.enabled&&!loopsNeg.info.active.some((x)=>x.type==='loops')&&!loopsNeg.collection.items.loops.seen,
    JSON.stringify({amb:loopsNeg.loop.amb,anchor:loopsNeg.anchor,active:loopsNeg.info.active.map((x)=>x.type)}));
  await loopsOff.close();

  // ————— PR-8 · Onda 1: coroa espontânea (cartão GLOBAL) —————
  // halo/ray ficam nos DEFAULTS (0.55/0.9 — fótons reais no anel); tudo o
  // mais sai da disputa. O cartão só nasce após >8s CONTÍNUOS de fótons
  // (relógio branco: __solInfo.eduCoronaState) e sem âncora/halo/linha.
  const coronaPage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  coronaPage.setDefaultTimeout(300000);
  coronaPage.on('pageerror',(e)=>errors.push('[corona-edu] '+e.message));
  coronaPage.on('console',(m)=>{if(m.type()==='error')errors.push('[corona-edu] '+m.text());});
  await coronaPage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&spots=0&fprom=0&cme=0&loops=0&intro=0');
  await coronaPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCoronaState);
  const coronaEarly=await coronaPage.evaluate(()=>{
    window.__solInfo.setRotSpeed(0);
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
    return {state:window.__solInfo.eduCoronaState(),active:window.__solInfo.eduInfo().active.map((x)=>x.type)};
  });
  // A janela é respeitada: com o relógio ainda abaixo de 8s não pode haver
  // cartão de coroa (se a página demorou e t já passou de 8, o check vale).
  check('coroa: fótons presentes por default e janela de 8s respeitada',
    coronaEarly.state.photons&&(coronaEarly.state.t>=8||coronaEarly.active.indexOf('corona')===-1),
    JSON.stringify(coronaEarly));
  await coronaPage.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='corona'&&i.global&&i.visible);},null,{timeout:300000});
  const coronaState=await coronaPage.evaluate(()=>({info:window.__solInfo.eduInfo(),state:window.__solInfo.eduCoronaState(),
    collection:window.__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent}));
  const coronaItem=coronaState.info.active[0];
  check('coroa: cartão global após >8s de fótons, sem âncora/halo/linha',
    !!coronaItem&&coronaItem.type==='corona'&&coronaItem.global&&coronaItem.anchor===null&&coronaItem.lineEnd===null&&!coronaItem.haloVisible&&!coronaItem.connectorVisible&&
    coronaState.state.t>8&&coronaState.state.explained&&/Coroa e streamers/.test(coronaState.text),
    JSON.stringify({t:coronaState.state.t,global:coronaItem&&coronaItem.global,text:coronaState.text.slice(0,60)}));
  check('coroa: coleção registra a família nova',coronaState.collection.items.corona.seen&&coronaState.collection.items.corona.views.corona===true);
  const coronaEnglish=await coronaPage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('coroa troca para inglês',/Corona and streamers/.test(coronaEnglish));
  await coronaPage.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
  await frames(coronaPage,3);
  const coronaReplay=await coronaPage.evaluate(()=>({info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('coroa: uma explicação por sessão, sem duplicar coleção',
    !coronaReplay.info.active.some((x)=>x.type==='corona')&&coronaReplay.collection.items.corona.discoveredViews===1);
  await coronaPage.close();

  // Controle NEGATIVO: halo=0&ray=0 apaga os fótons do anel — o relógio de
  // 8s nunca inicia e o cartão nunca nasce.
  const coronaOff=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  coronaOff.setDefaultTimeout(240000);
  coronaOff.on('pageerror',(e)=>errors.push('[corona-neg] '+e.message));
  coronaOff.on('console',(m)=>{if(m.type()==='error')errors.push('[corona-neg] '+m.text());});
  await coronaOff.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&spots=0&fprom=0&cme=0&loops=0&halo=0&ray=0&intro=0');
  await coronaOff.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCoronaState);
  await coronaOff.evaluate(()=>{window.__solInfo.setRotSpeed(0);for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);});
  await frames(coronaOff,30);
  const coronaNeg=await coronaOff.evaluate(()=>({state:window.__solInfo.eduCoronaState(),info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('halo=0&ray=0 nunca emite coroa: sem fótons o relógio não anda',
    !coronaNeg.state.photons&&coronaNeg.state.t===0&&!coronaNeg.state.explained&&coronaNeg.info.enabled&&
    !coronaNeg.info.active.some((x)=>x.type==='corona')&&!coronaNeg.collection.items.corona.seen,
    JSON.stringify(coronaNeg.state));
  await coronaOff.close();

  // ————— PR-10 · Onda 3: buraco coronal —————
  // O sinal é o marcador SEMÂNTICO publicado pelo bake atômico do volume
  // coronal (fonte única: phenomena.corona.hole, hook white-box
  // __solInfo.eduCoronaHoleState). A física é dirigida pelo relógio do
  // ciclo: no MÍNIMO (setCyclePhase(1,true)) o dipolo polar satura e os
  // buracos polares são claros (strength alto); no MÁXIMO (fase .5) o
  // dipolo cruza zero e a coroa fica CHEIA (strength < corte — o mesmo
  // valor de PHEN_T.CORONA_HOLE_MIN). halo/ray/spots/fprom/cme/loops saem
  // da disputa; `cvol` fica no DEFAULT do museu (0.5) — a página não pina.
  const holePage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  holePage.setDefaultTimeout(300000);
  holePage.on('pageerror',(e)=>errors.push('[corona-hole] '+e.message));
  holePage.on('console',(m)=>{if(m.type()==='error')errors.push('[corona-hole] '+m.text());});
  // edu começa DESLIGADO: a página primeiro fixa o regime físico (fase do
  // ciclo + bake) e só então liga a experiência — sem isso, um bake da fase
  // default anterior ao setup poderia disputar o latch da sessão.
  await holePage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=0&fprom=0&cme=0&loops=0&halo=0&ray=0&intro=0');
  await holePage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCoronaHoleState);
  await holePage.evaluate(()=>{window.__solInfo.setRotSpeed(0);for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);});
  // NEGATIVO (regime que separa de verdade): MÁXIMO com coroa CHEIA — o
  // bake publica strength ABAIXO do corte (PHEN_T.CORONA_HOLE_MIN=0.40) e o
  // emissor nunca arma o relógio, mesmo com a câmera mirando a direção
  // publicada. Calibração medida (n=18 reseeds na fase .5): 0.105–0.331,
  // mediana ≈0.18 — mas uma minoria de seeds abre um buraco polar REAL
  // mesmo no máximo (cauda ~0.33, dir polar). Como o alvo do negativo é o
  // REGIME de coroa cheia (não um sorteio específico), reseeds sucessivos
  // fixam esse regime; 4 tentativas cobrem a cauda com folga.
  const holeMaxSamples=[];
  for(let hk=0;hk<4;hk++){
    const holeMaxTarget=await holePage.evaluate((k)=>{
      window.__solInfo.setCyclePhase(.5+2*k,true);
      return window.__solInfo.rebakeCorona().targetCycle;
    },hk);
    await holePage.waitForFunction((t)=>window.__solInfo.coronaInfo().cycles>=t,holeMaxTarget,{timeout:300000});
    holeMaxSamples.push(await holePage.evaluate(()=>+window.__solInfo.eduCoronaHoleState().strength.toFixed(4)));
    if(holeMaxSamples[holeMaxSamples.length-1]<.40)break;
  }
  await holePage.evaluate(()=>{
    const h=window.__solInfo.eduCoronaHoleState(),s=window.__solInfo.state();
    window.__solInfo.setView(Math.atan2(h.dir[2],h.dir[0])-s.rotY,Math.acos(Math.max(-1,Math.min(1,h.dir[1]))),s.fitDist*1.3);
    window.__solInfo.setControl('edu',1,{persist:false});
  });
  await frames(holePage,20);
  const holeMax=await holePage.evaluate(()=>({hole:window.__solInfo.eduCoronaHoleState(),corona:window.__solInfo.coronaInfo(),
    info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('buraco coronal: máximo com coroa cheia publica strength<corte e nunca emite',
    holeMax.hole.available&&holeMax.corona.ready&&holeMax.hole.strength<.40&&holeMax.hole.t===0&&!holeMax.hole.explained&&
    !holeMax.info.active.some((x)=>x.type==='coronalHole')&&!holeMax.collection.items.coronalHole.seen,
    JSON.stringify({samples:holeMaxSamples,t:holeMax.hole.t,cycles:holeMax.corona.cycles}));
  // POSITIVO: MÍNIMO do ciclo — buracos polares claros. O re-bake parte do
  // snapshot novo; o marcador publica strength acima do corte e a direção
  // aponta o polo unipolar.
  const holeMinTarget=await holePage.evaluate(()=>{
    window.__solInfo.setCyclePhase(1,true);
    return window.__solInfo.rebakeCorona().targetCycle;
  });
  await holePage.waitForFunction((t)=>window.__solInfo.coronaInfo().cycles>=t,holeMinTarget,{timeout:300000});
  const holeMinSignal=await holePage.evaluate(()=>window.__solInfo.eduCoronaHoleState());
  check('buraco coronal: mínimo publica marcador acima do corte (bake real)',
    holeMinSignal.available&&holeMinSignal.strength>.40&&holeMinSignal.generation>0,
    JSON.stringify({strength:holeMinSignal.strength,generation:holeMinSignal.generation,dir:holeMinSignal.dir.map((v)=>+v.toFixed(3))}));
  // câmera na direção publicada (mesma conversão de forceVisible: dir é
  // local ao Sol, a âncora aplica rotY) e sustentação >3s de parede — o
  // cartão LOCAL nasce com âncora coronal na tela. Um cartão global de
  // mínimo pode ocupar o palco primeiro (prioridade 65>56): o emissor
  // retenta a cada frame e o waitForFunction cobre a janela de leitura.
  await holePage.evaluate(()=>{
    const h=window.__solInfo.eduCoronaHoleState(),s=window.__solInfo.state();
    window.__solInfo.setView(Math.atan2(h.dir[2],h.dir[0])-s.rotY,Math.acos(Math.max(-1,Math.min(1,h.dir[1]))),s.fitDist*1.3);
  });
  await holePage.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='coronalHole'&&i.visible);},null,{timeout:300000});
  await waitForLabelSettled(holePage);
  const holeState=await holePage.evaluate(()=>({info:window.__solInfo.eduInfo(),hole:window.__solInfo.eduCoronaHoleState(),
    collection:window.__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent,viewport:{w:innerWidth,h:innerHeight}}));
  const holeItem=holeState.info.active[0];
  const holeOnScreen=!!(holeItem&&holeItem.anchor&&holeItem.anchor.x>=0&&holeItem.anchor.x<=holeState.viewport.w&&holeItem.anchor.y>=0&&holeItem.anchor.y<=holeState.viewport.h);
  check('buraco coronal: cartão LOCAL com âncora coronal na tela após >3s sustentados',
    !!holeItem&&holeItem.type==='coronalHole'&&!holeItem.global&&holeItem.visible&&holeItem.haloVisible&&holeOnScreen&&
    holeState.hole.t>3&&holeState.hole.explained&&/Buraco coronal/.test(holeState.text),
    JSON.stringify({t:holeState.hole.t,anchor:holeItem&&holeItem.anchor,halo:holeItem&&holeItem.haloVisible,text:holeState.text.slice(0,60)}));
  check('buraco coronal: coleção registra a família nova',
    holeState.collection.items.coronalHole.seen&&holeState.collection.items.coronalHole.views.coronalHole===true);
  const holeEnglish=await holePage.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('buraco coronal troca para inglês',/Coronal hole/.test(holeEnglish));
  // uma explicação por sessão: religar a experiência não repete o cartão
  // nem duplica a coleção — mesmo com o marcador ainda acima do corte.
  await holePage.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
  await frames(holePage,3);
  const holeReplay=await holePage.evaluate(()=>({info:window.__solInfo.eduInfo(),hole:window.__solInfo.eduCoronaHoleState(),collection:window.__solInfo.eduCollectionInfo()}));
  check('buraco coronal: uma explicação por sessão, sem duplicar coleção',
    holeReplay.hole.strength>.40&&holeReplay.hole.explained&&!holeReplay.info.active.some((x)=>x.type==='coronalHole')&&
    holeReplay.collection.items.coronalHole.discoveredViews===1,
    JSON.stringify({strength:holeReplay.hole.strength,active:holeReplay.info.active.map((x)=>x.type)}));
  await holePage.close();

  // Controle NEGATIVO: com ?cvol=0 o volume nunca baka nem desenha — sem a
  // região escura NA TELA não existe marcador disponível, relógio nem
  // cartão, mesmo no mínimo profundo com o dipolo saturado.
  const holeOff=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  holeOff.setDefaultTimeout(240000);
  holeOff.on('pageerror',(e)=>errors.push('[corona-hole-neg] '+e.message));
  holeOff.on('console',(m)=>{if(m.type()==='error')errors.push('[corona-hole-neg] '+m.text());});
  await holeOff.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=0&fprom=0&cme=0&loops=0&halo=0&ray=0&cvol=0&intro=0');
  await holeOff.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCoronaHoleState);
  await holeOff.evaluate(()=>{
    window.__solInfo.setRotSpeed(0);
    for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);
    window.__solInfo.setCyclePhase(1,true);
    // mira o polo norte (a direção default do marcador): nem mirando o
    // relógio anda sem volume na tela
    const s=window.__solInfo.state();
    window.__solInfo.setView(s.theta,0.18,s.fitDist*1.3);
  });
  await frames(holeOff,30);
  const holeNeg=await holeOff.evaluate(()=>({hole:window.__solInfo.eduCoronaHoleState(),corona:window.__solInfo.coronaInfo(),
    info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('cvol=0 nunca emite: marcador indisponível, relógio parado, sem cartão, sem coleção',
    !holeNeg.hole.available&&holeNeg.hole.strength===0&&holeNeg.hole.generation===0&&holeNeg.hole.t===0&&!holeNeg.hole.explained&&
    !holeNeg.corona.ready&&holeNeg.info.enabled&&!holeNeg.info.active.some((x)=>x.type==='coronalHole')&&
    !holeNeg.collection.items.coronalHole.seen,
    JSON.stringify({available:holeNeg.hole.available,strength:holeNeg.hole.strength,ready:holeNeg.corona.ready,t:holeNeg.hole.t}));
  await holeOff.close();

  // ————— PR-9 · Onda 2: granulação por APROXIMAÇÃO —————
  // Página DEFAULT do museu (nenhum knob de física pinado — só scale p/ o
  // SwiftShader, speed p/ acalmar eventos concorrentes e intro=0 como em
  // todas as provas). O cartão é recompensa pelo gesto: primeiro o controle
  // negativo (30s parado no fit, relógios white-box parados), depois o reset
  // ao afastar antes de 2s, e só então a descoberta. Calibração da distância
  // de prova (geometria real, 960×600): fit=2.996R ⇒ fitDist/1.8=1.66R
  // (>minDist 1.5R) dá closeness=1.8>1.6 e limbFraction≈1.96.
  const gran=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  gran.setDefaultTimeout(300000);
  gran.on('pageerror',(e)=>errors.push('[granulation] '+e.message));
  gran.on('console',(m)=>{if(m.type()==='error')errors.push('[granulation] '+m.text());});
  await gran.goto(base+'?scale=0.25&speed=0.05&intro=0');
  await gran.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCloseupState);
  await gran.evaluate(()=>{window.__solInfo.setRotSpeed(0);for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);});
  // NEGATIVO: sem o gesto de aproximar, 30s no enquadramento cheio NUNCA
  // armam os relógios nem emitem os cartões de aproximação (outras
  // descobertas do museu podem acontecer — não são o alvo deste check).
  await gran.waitForTimeout(30000);
  const closeupNeg=await gran.evaluate(()=>({closeup:window.__solInfo.eduCloseupState(),info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('aproximação: 30s no fit nunca emitem granulação/espículas (relógios parados)',
    closeupNeg.closeup.closeness<1.05&&closeupNeg.closeup.limbFraction<1.15&&
    closeupNeg.closeup.closeT===0&&closeupNeg.closeup.limbT===0&&
    !closeupNeg.closeup.granulationExplained&&!closeupNeg.closeup.spiculesExplained&&closeupNeg.info.enabled&&
    !closeupNeg.info.active.some((x)=>x.type==='granulation'||x.type==='spicules')&&
    !closeupNeg.collection.items.granulation.seen&&!closeupNeg.collection.items.spicules.seen,
    JSON.stringify(closeupNeg.closeup));
  // RESET: aproxima, deixa o relógio andar MENOS de 2s e afasta — o relógio
  // zera e nada foi emitido. A leitura e o afastamento acontecem no MESMO
  // evaluate (nenhum frame entre ler t<2 e afastar).
  await gran.evaluate(()=>{const s=window.__solInfo.state();window.__solInfo.setView(s.theta,s.phi,s.fitDist/1.8);});
  await gran.waitForFunction(()=>window.__solInfo.eduCloseupState().closeT>0.15,null,{timeout:120000});
  const granReset=await gran.evaluate(()=>{
    const before=window.__solInfo.eduCloseupState();
    const s=window.__solInfo.state();
    window.__solInfo.setView(s.theta,s.phi,s.fitDist);
    return before;
  });
  await frame(gran);await frame(gran);
  const granAfterReset=await gran.evaluate(()=>window.__solInfo.eduCloseupState());
  check('granulação: afastar antes de 2s reseta o relógio sem emitir',
    granReset.closeT>0&&granReset.closeT<2&&!granReset.granulationExplained&&
    granAfterReset.closeT===0&&!granAfterReset.granulationExplained,
    JSON.stringify({antes:granReset.closeT,depois:granAfterReset.closeT}));
  // POSITIVO: aproximação sustentada >2s abre o cartão GLOBAL (a granulação
  // está em todo lugar — sem âncora/halo/linha) e grava a coleção.
  const granApproach=await gran.evaluate(()=>{const s=window.__solInfo.state();window.__solInfo.setView(s.theta,s.phi,s.fitDist/1.8);return window.__solInfo.eduCloseupState();});
  check('granulação: distância de prova cruza o limiar de close-up',granApproach.closeness>1.6,'closeness='+granApproach.closeness.toFixed(3));
  await gran.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='granulation'&&i.global&&i.visible);},null,{timeout:180000});
  const granState=await gran.evaluate(()=>({info:window.__solInfo.eduInfo(),closeup:window.__solInfo.eduCloseupState(),
    collection:window.__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent}));
  const granItem=granState.info.active[0];
  check('granulação: cartão global após >2s sustentados, sem âncora/halo/linha',
    !!granItem&&granItem.type==='granulation'&&granItem.global&&granItem.anchor===null&&granItem.lineEnd===null&&
    !granItem.haloVisible&&!granItem.connectorVisible&&granState.closeup.closeT>2&&granState.closeup.granulationExplained&&
    /Granulação e fibrilas/.test(granState.text),
    JSON.stringify({closeT:granState.closeup.closeT,global:granItem&&granItem.global,text:granState.text.slice(0,60)}));
  check('granulação: coleção registra a família nova',granState.collection.items.granulation.seen&&granState.collection.items.granulation.views.granulation===true);
  const granEnglish=await gran.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('granulação troca para inglês',/Granulation and fibrils/.test(granEnglish));
  await gran.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
  await frames(gran,3);
  const granReplay=await gran.evaluate(()=>({info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo(),closeup:window.__solInfo.eduCloseupState()}));
  check('granulação: uma explicação por sessão mesmo continuando perto',
    granReplay.closeup.closeness>1.6&&!granReplay.info.active.some((x)=>x.type==='granulation')&&
    granReplay.collection.items.granulation.discoveredViews===1,
    JSON.stringify({closeness:granReplay.closeup.closeness,active:granReplay.info.active.map((x)=>x.type)}));
  await gran.close();

  // ————— PR-9 · Onda 2: espículas por MIRA NO LIMBO —————
  // Página default museu, distância INTERMEDIÁRIA: o disco estoura o quadro
  // (limbFraction>1.15) sem cruzar o limiar de close-up (closeness<1.6) —
  // isola o emissor de espículas e prova que o relógio de granulação nem
  // arma. Calibração (960×600): d=2.2R ⇒ limbFraction≈1.33, closeness≈1.36.
  const spic=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  spic.setDefaultTimeout(300000);
  spic.on('pageerror',(e)=>errors.push('[spicules] '+e.message));
  spic.on('console',(m)=>{if(m.type()==='error')errors.push('[spicules] '+m.text());});
  await spic.goto(base+'?scale=0.25&speed=0.05&intro=0');
  await spic.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduCloseupState);
  await spic.evaluate(()=>{window.__solInfo.setRotSpeed(0);for(let j=0;j<window.__solInfo.promLife().length;j++)window.__solInfo.setPromLife(j,.01);});
  await spic.evaluate(()=>{const s=window.__solInfo.state(),R=s.minDist/1.5;window.__solInfo.setView(s.theta,s.phi,2.2*R);});
  await frame(spic);
  const spicSignals=await spic.evaluate(()=>window.__solInfo.eduCloseupState());
  check('espículas: distância de prova cruza LIMB_FILL sem cruzar o close-up',
    spicSignals.limbFraction>1.15&&spicSignals.closeness<1.6,
    JSON.stringify({limbFraction:spicSignals.limbFraction,closeness:spicSignals.closeness}));
  // RESET: mirar o limbo por menos de 2s e afastar zera o relógio.
  await spic.waitForFunction(()=>window.__solInfo.eduCloseupState().limbT>0.15,null,{timeout:120000});
  const spicReset=await spic.evaluate(()=>{
    const before=window.__solInfo.eduCloseupState();
    const s=window.__solInfo.state();
    window.__solInfo.setView(s.theta,s.phi,s.fitDist);
    return before;
  });
  await frame(spic);await frame(spic);
  const spicAfterReset=await spic.evaluate(()=>window.__solInfo.eduCloseupState());
  check('espículas: afastar antes de 2s reseta o relógio sem emitir',
    spicReset.limbT>0&&spicReset.limbT<2&&!spicReset.spiculesExplained&&
    spicAfterReset.limbT===0&&!spicAfterReset.spiculesExplained,
    JSON.stringify({antes:spicReset.limbT,depois:spicAfterReset.limbT}));
  // NEGATIVO de honestidade: com a franja OCULTA (toggle de QA), mirar o
  // limbo não arma o relógio — o cartão jamais prometeria o que não está
  // desenhado.
  await spic.evaluate(()=>{window.__solInfo.toggle('spicules',false);const s=window.__solInfo.state(),R=s.minDist/1.5;window.__solInfo.setView(s.theta,s.phi,2.2*R);});
  await frames(spic,8);
  const spicHidden=await spic.evaluate(()=>({closeup:window.__solInfo.eduCloseupState(),toggles:window.__solInfo.perf().toggles}));
  check('espículas: franja oculta nunca arma o relógio (honestidade)',
    !spicHidden.toggles.spicules&&spicHidden.closeup.limbFraction>1.15&&spicHidden.closeup.limbT===0&&!spicHidden.closeup.spiculesExplained,
    JSON.stringify({limbT:spicHidden.closeup.limbT,limbFraction:spicHidden.closeup.limbFraction}));
  // POSITIVO: franja de volta, mira sustentada >2s ⇒ cartão GLOBAL (as
  // espículas são a franja INTEIRA — apontar uma seria mentira; decisão
  // documentada em edu.js/MUSEU_SOL_COBERTURA.md) + coleção.
  await spic.evaluate(()=>window.__solInfo.toggle('spicules',true));
  await spic.waitForFunction(()=>{const i=window.__solInfo.eduInfo().active[0];return !!(i&&i.type==='spicules'&&i.global&&i.visible);},null,{timeout:180000});
  const spicState=await spic.evaluate(()=>({info:window.__solInfo.eduInfo(),closeup:window.__solInfo.eduCloseupState(),
    collection:window.__solInfo.eduCollectionInfo(),text:document.querySelector('.edu-label').textContent}));
  const spicItem=spicState.info.active[0];
  check('espículas: cartão global após >2s de limbo no quadro, sem âncora/halo/linha',
    !!spicItem&&spicItem.type==='spicules'&&spicItem.global&&spicItem.anchor===null&&spicItem.lineEnd===null&&
    !spicItem.haloVisible&&!spicItem.connectorVisible&&spicState.closeup.limbT>2&&spicState.closeup.spiculesExplained&&
    /Espículas/.test(spicState.text),
    JSON.stringify({limbT:spicState.closeup.limbT,global:spicItem&&spicItem.global,text:spicState.text.slice(0,60)}));
  check('espículas: relógio de granulação nunca armou na distância de limbo',
    spicState.closeup.closeT===0&&!spicState.closeup.granulationExplained&&!spicState.collection.items.granulation.seen,
    JSON.stringify({closeT:spicState.closeup.closeT}));
  check('espículas: coleção registra a família nova',spicState.collection.items.spicules.seen&&spicState.collection.items.spicules.views.spicules===true);
  const spicEnglish=await spic.evaluate(()=>{window.__solInfo.setLang('en');return document.querySelector('.edu-label').textContent;});
  check('espículas trocam para inglês',/Spicules/.test(spicEnglish));
  await spic.evaluate(()=>{window.__solInfo.setControl('edu',0,{persist:false});window.__solInfo.setControl('edu',1,{persist:false});});
  await frames(spic,3);
  const spicReplay=await spic.evaluate(()=>({info:window.__solInfo.eduInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  check('espículas: uma explicação por sessão, sem duplicar coleção',
    !spicReplay.info.active.some((x)=>x.type==='spicules')&&spicReplay.collection.items.spicules.discoveredViews===1);
  await spic.close();

  // ————— PR-8 · surface via visita + painel "de 8" —————
  // Caminhada mínima (chip → etapa 1 → next → exit) num contexto virgem:
  // a etapa surface grava a família 'surface' (source.physical), repetir a
  // visita não duplica, e o painel da coleção mostra as 8 famílias.
  const surfaceContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  const surfacePage=await surfaceContext.newPage();
  surfacePage.setDefaultTimeout(240000);
  surfacePage.on('pageerror',(e)=>errors.push('[surface] '+e.message));
  surfacePage.on('console',(m)=>{if(m.type()==='error')errors.push('[surface] '+m.text());});
  await surfacePage.goto(base+'?edu=0&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&spots=0&fprom=0&cme=0&intro=0');
  await surfacePage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo&&window.__solInfo.eduCollectionInfo);
  const surfaceStart=await surfacePage.evaluate(()=>window.__solInfo.eduCollectionInfo());
  await surfacePage.click('#eduTourChip');
  await surfacePage.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&t.stepId==='surface'&&t.phase==='reading';});
  const surfaceReading=await surfacePage.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),collection:window.__solInfo.eduCollectionInfo()}));
  await surfacePage.click('#eduTourNext');
  await surfacePage.waitForFunction(()=>window.__solInfo.eduTourInfo().index===1);
  await surfacePage.click('#eduTourExit');
  await surfacePage.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const surfaceAfter=await surfacePage.evaluate(()=>window.__solInfo.eduCollectionInfo());
  check('visita mínima grava a fotosfera na coleção',
    surfaceStart.discoveredFamilies===0&&surfaceReading.tour.source.physical&&surfaceReading.collection.items.surface.seen&&
    surfaceAfter.items.surface.seen&&surfaceAfter.items.surface.discoveredViews===1,
    JSON.stringify({start:surfaceStart.discoveredFamilies,physical:surfaceReading.tour.source.physical,after:surfaceAfter.items.surface}));
  // repetir a caminhada não duplica a vista gravada
  await surfacePage.evaluate(()=>window.__solInfo.eduTourStart());
  await surfacePage.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&t.stepId==='surface'&&t.phase==='reading';});
  await surfacePage.evaluate(()=>window.__solInfo.eduTourExit());
  await surfacePage.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const surfaceRepeat=await surfacePage.evaluate(()=>window.__solInfo.eduCollectionInfo());
  check('repetir a visita não duplica a coleção',surfaceRepeat.items.surface.discoveredViews===1&&surfaceRepeat.totalFamilies===11);
  // painel: "N de 11" (PR-10), ordem narrativa e as famílias novas na lista
  await surfacePage.click('#knobBtn');await surfacePage.waitForTimeout(650);
  await surfacePage.click('#eduCollectionToggle');
  const surfacePanel=await surfacePage.evaluate(()=>{
    const info=window.__solInfo.eduCollectionInfo();
    const row=(id)=>{const e=document.querySelector('#eduCollectionItem-'+id);return e?{present:true,disabled:e.disabled,title:e.querySelector('.collectionItemTitle').textContent}:{present:false};};
    return {toggle:document.querySelector('#eduCollectionToggle').textContent,order:info.order.join(','),total:info.totalFamilies,
      surface:row('surface'),loops:row('loops'),corona:row('corona'),granulation:row('granulation'),spicules:row('spicules'),coronalHole:row('coronalHole')};
  });
  check('painel da coleção mostra "de 11" com as famílias novas listadas',
    / de 11 /.test(surfacePanel.toggle)&&surfacePanel.total===11&&
    surfacePanel.order==='surface,granulation,spots,loops,flare,cme,prominence,spicules,corona,coronalHole,cycle'&&
    surfacePanel.surface.present&&!surfacePanel.surface.disabled&&/Fotosfera e granulação/.test(surfacePanel.surface.title)&&
    surfacePanel.loops.present&&surfacePanel.loops.disabled&&/Loops coronais/.test(surfacePanel.loops.title)&&
    surfacePanel.corona.present&&surfacePanel.corona.disabled&&/Coroa e streamers/.test(surfacePanel.corona.title)&&
    surfacePanel.granulation.present&&surfacePanel.granulation.disabled&&/Granulação e fibrilas/.test(surfacePanel.granulation.title)&&
    surfacePanel.spicules.present&&surfacePanel.spicules.disabled&&/Espículas/.test(surfacePanel.spicules.title)&&
    surfacePanel.coronalHole.present&&surfacePanel.coronalHole.disabled&&/Buraco coronal/.test(surfacePanel.coronalHole.title),
    JSON.stringify(surfacePanel));
  await surfaceContext.close();

  // Máximo e mínimo pertencem à mesma coleção local; usamos explicitamente
  // o mesmo contexto de navegador para provar que as duas vistas coexistem.
  const cycleCollectionContext=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1});
  const maxPage=await cycleCollectionContext.newPage();
  maxPage.setDefaultTimeout(240000);
  maxPage.on('pageerror',(e)=>errors.push('[cycle-max] '+e.message));
  maxPage.on('console',(m)=>{if(m.type()==='error')errors.push('[cycle-max] '+m.text());});
  await maxPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1&fprom=0&cme=0&intro=0');
  await maxPage.waitForFunction(()=>window.__solInfo&&window.__solInfo.cycleInfo);
  const maximum=await forceCycleDiscovery(maxPage,'maximum');
  const maxItem=maximum&&maximum.info.active[0];
  const maxLayout=await layoutState(maxPage);
  const maxInside=maxLayout.label&&maxLayout.label.x>=12&&maxLayout.label.y>=12&&maxLayout.label.x+maxLayout.label.width<=maxLayout.viewport.width-12&&maxLayout.label.y+maxLayout.label.height<=maxLayout.viewport.height-12;
  const maxChromeClear=maxLayout.label&&[maxLayout.title,maxLayout.gear,maxLayout.hint].filter(Boolean).every((x)=>!overlap(maxLayout.label,x));
  // Cada condição nomeada no detail: um flake aqui precisa ser legível no
  // log do CI sem reproduzir localmente (lição do run 29663240288).
  const maxConds=maximum?{
    natural:!maximum.prepared.info.active.some((x)=>x.type==='cycleMaximum'||x.type==='cycleMinimum'),
    semEvento:!maximum.prepared.cycle.event.on&&!maximum.cycle.event.on,
    fase:Math.abs(maximum.cycle.phase-.5)<.04,amp:maximum.cycle.amp>1.12,
    global:!!maxItem&&maxItem.global&&maxItem.anchor===null&&maxItem.lineEnd===null,
    semConector:!!maxItem&&!maxItem.connectorVisible&&!maxItem.haloVisible,
    introSumiu:!maxLayout.introVisible,filaSemGlobal:!maximum.info.queued.some((x)=>x.global),
    texto:/Máximo solar/.test(maximum.text),dentro:maxInside,cromoLivre:maxChromeClear
  }:null;
  check('máximo solar nasce também do ciclo natural',!!maxConds&&Object.values(maxConds).every(Boolean),
    maxConds?JSON.stringify({falhas:Object.keys(maxConds).filter((k)=>!maxConds[k]),phase:maximum.cycle.phase,amp:maximum.cycle.amp}):'não chegou ao máximo');
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
  await minPage.goto(base+'?edu=0&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=1&spots=1&fprom=0&cme=0&intro=0');
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
  await reduced.goto(base+'?edu=1&tier=low&scale=0.25&speed=0.05&cycle=0&intro=0');
  await reduced.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await reduced.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const reducedFired=await forceVisible(reduced);
  const reducedInfo=await reduced.evaluate(()=>window.__solInfo.eduInfo());
  check('movimento reduzido preserva conteúdo sem pulso',!!reducedFired&&reducedInfo.reducedMotion&&reducedInfo.active[0].visible);
  await reducedContext.close();

  // ————— PR-6 · Gate de coroa por FÓTONS —————
  // A visita afirma "coroa e streamers" — este gate garante que o knob que
  // ela empresta (`ray`) produz LUZ mensurável, não só um objeto na cena.
  // Método (documentado): página det-estável (?det&hold — mesma família de
  // parâmetros do parity, frames congelados e reprodutíveis), dois
  // screenshots com ray=0 e ray=1.15 (o valor do override da visita),
  // amostragem do anel 1.15R–1.6R do disco (raio em px derivado do estado
  // real: R = minDist/1.5, mesma projeção do diskRect do tour; câmera
  // recuada a 5R para o anel caber na tela), luminância média LINEARIZADA
  // (fótons somam em linear, não em sRGB). Calibração medida neste gate
  // (SwiftShader, tier high, scale 0.25, viewport 640×640, seed 7, hold
  // 48, 112524 px amostrados): L(ray=0)=8.96e-3, L(ray=1.15)=1.08e-2 ⇒
  // razão = 1.207. Limiar 1.15: sob det a medida é bit-estável (variância
  // zero run-a-run) — qualquer regressão que apague os streamers cai a
  // ~1.00 e fica bem abaixo do limiar.
  const coronaOut='out/qa-edu-corona';
  fs.mkdirSync(coronaOut,{recursive:true});
  function ringLuminance(file,geom){
    function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
    const png=PNG.sync.read(fs.readFileSync(file));
    const cx=png.width*.5,cy=png.height*.5,r0=geom.radius*1.15,r1=geom.radius*1.6;
    let sum=0,n=0;
    for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
      const d=Math.hypot(x+.5-cx,y+.5-cy);
      if(d<r0||d>r1)continue;
      const i=(y*png.width+x)*4;
      sum+=0.2126*lin(png.data[i])+0.7152*lin(png.data[i+1])+0.0722*lin(png.data[i+2]);
      n++;
    }
    return {mean:n?sum/n:0,samples:n};
  }
  const photon=await browser.newPage({viewport:{width:640,height:640},deviceScaleFactor:1});
  photon.setDefaultTimeout(300000);
  photon.on('pageerror',(e)=>errors.push('[corona] '+e.message));
  photon.on('console',(m)=>{if(m.type()==='error')errors.push('[corona] '+m.text());});
  await photon.goto(base+'?det=1&seed=7&hold=48&tier=high&scale=0.25');
  await photon.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>51,null,{timeout:420000});
  // No fit o disco tem ~295px de raio em 640×640 — o anel 1.6R cairia fora
  // da tela. A câmera recua para 5R (ainda dentro de maxDist) e o raio em
  // px é recalculado do ESTADO REAL pós-clamp, nunca de uma constante.
  await photon.evaluate(()=>{const s=__solInfo.state(),R=s.minDist/1.5;__solInfo.setView(s.theta,s.phi,5*R);});
  const f0=await photon.evaluate(()=>window.__solInfo.frame);
  await photon.waitForFunction((f)=>window.__solInfo.frame>f+4,f0,{timeout:120000});
  const coronaGeom=await photon.evaluate(()=>{
    const s=__solInfo.state(),R=s.minDist/1.5,half=42*Math.PI/360;
    return {radius:Math.tan(Math.asin(Math.min(1,R/s.camDist)))/Math.tan(half)*innerHeight*.5,w:innerWidth,h:innerHeight};
  });
  await photon.evaluate(()=>__solInfo.setControl('ray',0,{persist:false}));
  await frame(photon);await frame(photon);
  const shotRay0=path.join(coronaOut,'ray0.png');
  await photon.screenshot({path:shotRay0});
  await photon.evaluate(()=>__solInfo.setControl('ray',1.15,{persist:false}));
  await frame(photon);await frame(photon);
  const shotRay115=path.join(coronaOut,'ray115.png');
  await photon.screenshot({path:shotRay115});
  const lum0=ringLuminance(shotRay0,coronaGeom),lum1=ringLuminance(shotRay115,coronaGeom);
  const coronaRatio=lum0.mean>0?lum1.mean/lum0.mean:Infinity;
  check('coroa responde a fótons no anel 1.15R–1.6R (razão > 1.15)',
    lum0.samples>1000&&coronaRatio>1.15,
    'razão='+coronaRatio.toFixed(3)+' L0='+lum0.mean.toExponential(3)+' L1='+lum1.mean.toExponential(3)+
    ' amostras='+lum0.samples+' raioDisco='+coronaGeom.radius.toFixed(1)+'px');
  await photon.close();

  check('console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();browser=null;
  if(fails){console.log('QA EDU: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA EDU: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

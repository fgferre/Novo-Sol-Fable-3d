// QA da Visita guiada do Museu Solar. A prova roda em ambiente de iPhone de
// verdade (UA Safari de iPhone, hasTouch, toques genuínos via page.tap e
// arrastes por eventos de TOQUE reais via CDP — Playwright não expõe
// down/move/up no touchscreen, então o Input.dispatchTouchEvent do Chromium
// é o caminho oficial), inicia pelo botão público e só aceita uma etapa
// quando tourInfo confirma fonte física, cartão e enquadramento juntos.
//
// PR-6 — a caminhada principal roda em tier=mid (o tier real de iPhone),
// com gates POR ETAPA (44px, pausa, overflow), paisagem completa, DPR3 e
// controles negativos. Modos (3º argumento --mode):
//   portrait  → abertura + retrato mid + DPR3 (até etapa 3) + negativos
//   landscape → caminhada completa em 844×390
//   dpr3full  → caminhada completa com deviceScaleFactor 3 (nightly)
//   en        → caminhada completa em inglês (nightly)
//   all       → portrait + landscape (default local)
const fs=require('fs');
const path=require('path');
const{chromium}=require('playwright');
const{PNG}=require('pngjs');

const htmlFile=process.argv[2]||'dist-single/index.html';
const outDir=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:'out/qa-tour';
function argOf(flag,dflt){const i=process.argv.indexOf(flag);return i>-1?process.argv[i+1]:dflt;}
const mode=argOf('--mode','all');
const base='file://'+path.resolve(htmlFile);
// UA real de Safari em iPhone (iOS 17): o app não lê UA para decidir nada,
// mas a prova declara o ambiente completo de um visitante de verdade.
const IPHONE_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const STEPS=['surface','active-region','loops','flare','cme','filament','prominence','corona','maximum','minimum'];
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}
function overlap(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function finiteRect(r){return r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;}
function big(r){return finiteRect(r)&&r.width>=44&&r.height>=44;}
function mobileCtx(extra){
  return browser.newContext(Object.assign({viewport:{width:390,height:844},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,userAgent:IPHONE_UA},extra||{}));
}
// Arraste por TOQUE genuíno (touchStart/Move/End do protocolo — vira
// PointerEvents pointerType 'touch' na página, o mesmo caminho do dedo).
async function touchDrag(page,x1,y1,x2,y2){
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1,id:1}]});
    for(let i=1;i<=3;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',
      touchPoints:[{x:x1+(x2-x1)*i/3,y:y1+(y2-y1)*i/3,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach().catch(()=>{});}
}
async function touchDragCanvas(page,dx,dy){
  const c=await page.locator('#canvas-container canvas').boundingBox();
  if(!c)return false;
  await touchDrag(page,c.x+c.width*.5,c.y+c.height*.5,c.x+c.width*.5+dx,c.y+c.height*.5+dy);
  return true;
}
async function waitStep(page,id){
  await page.waitForFunction((id)=>{const t=window.__solInfo.eduTourInfo();return t.active&&t.stepId===id&&t.settled;},id,{timeout:240000});
  return page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),cycle:window.__solInfo.cycleInfo(),
    flare:window.__solInfo.flareInfo(),cme:window.__solInfo.cmeInfo(),loops:window.__solInfo.loopInfo()}));
}
async function cardState(page){
  return page.evaluate(()=>{
    function r(sel){const e=document.querySelector(sel);if(!e)return null;const x=e.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height};}
    const cinemaBtn=document.querySelector('#eduTourCinema');
    const kicker=document.querySelector('#eduTour .tour-kicker');
    const status=document.querySelector('#eduTour .tour-status');
    return {tour:window.__solInfo.eduTourInfo(),card:r('#eduTour .tour-card'),expand:r('#eduTourExpand'),
      next:r('#eduTourNext'),gear:r('#knobBtn'),
      cinema:cinemaBtn&&!cinemaBtn.hidden?r('#eduTourCinema'):null,
      kicker:kicker?kicker.textContent:'',status:status?status.textContent:'',
      aria:document.querySelector('#eduTourExpand')&&document.querySelector('#eduTourExpand').getAttribute('aria-expanded'),
      bodyHidden:document.querySelector('#eduTourBody')&&document.querySelector('#eduTourBody').hidden};
  });
}

// ————— Contraste WCAG por screenshot (PR-6, item legibilidade) —————
// Medição documentada: o rect do cartão é amostrado no PNG (dsf=1 ⇒ px CSS
// = px da imagem); a luminância relativa WCAG (sRGB linearizado) de cada
// pixel entra num vetor e a MEDIANA é o estimador do fundo — o texto claro
// é minoria de pixels e não desloca a mediana. Razão exigida contra a cor
// de texto #fff8ef (L=0.943): ≥ 4.5 (AA para texto normal).
function relLum(r,g,b){
  function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
  return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
}
const TEXT_LUM=relLum(255,248,239);
function cardContrast(file,rect){
  const png=PNG.sync.read(fs.readFileSync(file));
  const x0=Math.max(0,Math.round(rect.x)),y0=Math.max(0,Math.round(rect.y));
  const x1=Math.min(png.width,Math.round(rect.x+rect.width)),y1=Math.min(png.height,Math.round(rect.y+rect.height));
  const lums=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*png.width+x)*4;lums.push(relLum(png.data[i],png.data[i+1],png.data[i+2]));}
  lums.sort((a,b)=>a-b);
  const bg=lums.length?lums[Math.floor(lums.length*.5)]:1;
  return {ratio:(TEXT_LUM+.05)/(bg+.05),bg:bg,samples:lums.length};
}

// ————— Runner parametrizado da caminhada (retrato/paisagem/DPR3/EN) —————
// opts: label, expandEach (abre o texto em TODA etapa p/ gate de overflow),
// pauseSteps (Set: dupla janela de relógio parado com cartão aberto),
// evidenceShots ({stepId:nomePng}), contrastCollapsed/contrastExpanded
// (stepId), fontGate (font-size ≥10px em todo texto do cartão),
// landscapeLayout (cartão estreito à esquerda por etapa), kickerRe (idioma),
// maxSteps (caminhada parcial), evidence (array), beforeNext/onStep (hooks).
async function walkTour(page,opts){
  const total=opts.maxSteps||STEPS.length;
  let fontChecked=false;
  for(let i=0;i<total;i++){
    const id=STEPS[i];
    const data=await waitStep(page,id);
    const ui=await cardState(page);
    const source=data.tour.source;
    const visible=source.physical&&source.visible&&!source.unavailable;
    const layout=finiteRect(ui.card)&&!overlap(ui.card,data.tour.diskRect)&&!overlap(ui.card,ui.gear);
    check('['+opts.label+'] etapa '+(i+1)+'/'+STEPS.length+' '+id+' usa fonte física visível',visible&&layout,
      JSON.stringify({source:source,card:ui.card,disk:data.tour.diskRect,cycle:data.cycle.phase}));
    // PR-6 — 44px POR ETAPA: os botões visíveis do cartão são tocáveis.
    const touch44=big(ui.expand)&&big(ui.next)&&(i<STEPS.length-1?true:!!ui.cinema&&big(ui.cinema));
    check('['+opts.label+'] '+id+': botões visíveis têm ≥44px',touch44,
      JSON.stringify({expand:ui.expand,next:ui.next,cinema:ui.cinema}));
    // PR-5 — halo da visita: aceso na etapa ancorada, apagado nas globais.
    if(id==='active-region')check('['+opts.label+'] halo destaca a fonte na etapa ancorada',
      data.tour.halo&&data.tour.halo.visible&&data.tour.halo.opacity>0,JSON.stringify(data.tour.halo));
    if(id==='surface'||id==='maximum')check('['+opts.label+'] halo apagado na etapa global '+id,
      data.tour.halo&&!data.tour.halo.visible,JSON.stringify(data.tour.halo));
    if(opts.landscapeLayout)check('['+opts.label+'] '+id+': cartão estreito à esquerda (layout mobile)',
      ui.card.width<700&&ui.card.x<=20&&!(Math.round(ui.card.width)===330&&Math.round(ui.card.x)===22),
      JSON.stringify(ui.card));
    if(i===0&&opts.kickerRe)check('['+opts.label+'] cartão fala o idioma pedido',opts.kickerRe.test(ui.kicker),ui.kicker);
    if(opts.contrastCollapsed===id){
      const shot=path.join(outDir,'contraste-recolhido-'+id+'.png');
      await page.screenshot({path:shot});
      const c=cardContrast(shot,ui.card);
      check('['+opts.label+'] contraste WCAG do cartão recolhido ≥4.5',c.ratio>=4.5,
        'razão='+c.ratio.toFixed(2)+' fundo(L mediana)='+c.bg.toFixed(4)+' amostras='+c.samples);
    }
    if(opts.evidenceShots&&opts.evidenceShots[id])
      await page.screenshot({path:path.join(outDir,opts.evidenceShots[id])});
    if(opts.expandEach){
      await page.tap('#eduTourExpand');
      await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.expanded&&t.timeFactor===0;});
      // PR-6 — overflow POR ETAPA: com o texto aberto a página não pode
      // rolar (vertical nem horizontal) e o cartão cabe inteiro na tela.
      const flow=await page.evaluate(()=>{
        const r=document.querySelector('#eduTour .tour-card').getBoundingClientRect();
        return {sh:document.body.scrollHeight,ch:document.body.clientHeight,
          sw:document.body.scrollWidth,cw:document.body.clientWidth,
          card:{x:r.x,y:r.y,w:r.width,h:r.height},vw:innerWidth,vh:innerHeight};
      });
      const noOverflow=flow.sh<=flow.ch+1&&flow.sw<=flow.cw+1&&flow.card.x>=0&&flow.card.y>=0&&
        flow.card.x+flow.card.w<=flow.vw+1&&flow.card.y+flow.card.h<=flow.vh+1;
      check('['+opts.label+'] '+id+': cartão expandido não estoura a tela',noOverflow,JSON.stringify(flow));
      if(opts.fontGate&&!fontChecked){
        fontChecked=true;
        const smallFonts=await page.evaluate(()=>{
          const bad=[];
          document.querySelectorAll('#eduTour .tour-card, #eduTour .tour-card *').forEach((el)=>{
            if(!el.textContent||!el.textContent.trim())return;
            const size=parseFloat(getComputedStyle(el).fontSize);
            if(size<10)bad.push((el.className||el.tagName)+'='+size);
          });
          return bad;
        });
        check('['+opts.label+'] todo texto do cartão tem font-size ≥10px',smallFonts.length===0,smallFonts.join(', '));
      }
      if(opts.pauseSteps&&opts.pauseSteps.has(id)){
        // Pausa de verdade: além de timeFactor 0, o relógio FÍSICO fica
        // parado numa dupla janela de tempo real (350ms de assentamento e
        // 700ms de medição), com a câmera assentada e o cartão fora do disco.
        await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo(),a=t.cardRect,b=t.diskRect;
          const clear=!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y);
          return t.timeFactor===0&&t.settled&&clear;});
        await page.waitForTimeout(350);
        const t0=await page.evaluate(()=>window.__solInfo.cycleInfo().time);
        await page.waitForTimeout(700);
        const paused=await page.evaluate(()=>({t:window.__solInfo.cycleInfo().time,f:window.__solInfo.eduTourInfo().timeFactor}));
        check('['+opts.label+'] '+id+': leitura aberta pausa o relógio físico',
          Math.abs(paused.t-t0)<1e-9&&paused.f===0,JSON.stringify({before:t0,after:paused.t,factor:paused.f}));
      }
      if(opts.contrastExpanded===id){
        const uiExp=await cardState(page);
        const shot=path.join(outDir,'contraste-expandido-'+id+'.png');
        await page.screenshot({path:shot});
        const c=cardContrast(shot,uiExp.card);
        check('['+opts.label+'] contraste WCAG do cartão expandido ≥4.5',c.ratio>=4.5,
          'razão='+c.ratio.toFixed(2)+' fundo(L mediana)='+c.bg.toFixed(4)+' amostras='+c.samples);
      }
      await page.tap('#eduTourExpand');
      await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return !t.expanded&&t.timeFactor===.08;});
      check('['+opts.label+'] '+id+': leitura recolhida corre a 8% do tempo',true);
    }else{
      check('['+opts.label+'] '+id+': leitura recolhida corre a 8% do tempo',ui.tour.timeFactor===.08,
        'timeFactor='+ui.tour.timeFactor);
    }
    if(opts.onStep)await opts.onStep(id,page,data,ui);
    if(opts.evidence)opts.evidence.push({step:id,index:data.tour.index,source:source,card:ui.card,disk:data.tour.diskRect,
      expand:ui.expand,next:ui.next,timeFactor:ui.tour.timeFactor,
      cycle:{phase:data.cycle.phase,amp:data.cycle.amp,event:data.cycle.event},flare:{t:data.flare.t,amp:data.flare.amp},
      cme:{t:data.cme.t,front:data.cme.front},loops:{amb:data.loops.amb,arc:data.loops.arc}});
    if(opts.beforeNext)await opts.beforeNext(id,page);
    if(i<total-1)await page.tap('#eduTourNext');
  }
}

// ————— Suíte retrato (gate qa-mobile) —————
async function portraitSuite(){
  // ————— PR-5 · Abertura cinematográfica —————
  // (a) primeiro acesso forçado (?intro=1, storage limpo): nasce ativa e em
  // close-up, o chip cede o palco, termina no fit, grava introSeen e o
  // retorno SEM ?intro chega direto no fit.
  const introErrors=[];
  const introCtx=await mobileCtx();
  const ip=await introCtx.newPage();ip.setDefaultTimeout(240000);
  ip.on('pageerror',(e)=>introErrors.push('[intro] '+e.message));ip.on('console',(m)=>{if(m.type()==='error')introErrors.push('[intro] '+m.text());});
  await ip.goto(base+'?intro=1&scale=0.25');
  await ip.waitForFunction(()=>window.__solInfo&&window.__solInfo.introInfo);
  const introStart=await ip.evaluate(()=>({intro:__solInfo.introInfo(),state:__solInfo.state(),chip:__solInfo.eduTourInfo().chip}));
  check('abertura começa ativa, em close-up e com o chip fora do palco',
    introStart.intro.available&&introStart.intro.active&&introStart.state.camDist<introStart.state.fitDist*.6&&!introStart.chip.visible,
    JSON.stringify({active:introStart.intro.active,camDist:+introStart.state.camDist.toFixed(3),fit:+introStart.state.fitDist.toFixed(3),chip:introStart.chip.visible}));
  await ip.waitForFunction(()=>!window.__solInfo.introInfo().active,null,{timeout:240000});
  await ip.waitForFunction(()=>window.__solInfo.eduTourInfo().chip.visible,null,{timeout:60000});
  const introEnd=await ip.evaluate(()=>({state:__solInfo.state(),chip:__solInfo.eduTourInfo().chip,
    seen:JSON.parse(localStorage.getItem('solKnobs')||'{}').introSeen}));
  check('abertura termina no fit, devolve o chip e grava introSeen',
    Math.abs(introEnd.state.camDist-introEnd.state.fitDist)<=introEnd.state.fitDist*.05&&introEnd.chip.visible&&introEnd.seen===true,
    JSON.stringify({camDist:+introEnd.state.camDist.toFixed(3),fit:+introEnd.state.fitDist.toFixed(3),seen:introEnd.seen}));
  await ip.goto(base+'?scale=0.25');
  await ip.waitForFunction(()=>window.__solInfo&&window.__solInfo.introInfo);
  const introReload=await ip.evaluate(()=>({intro:__solInfo.introInfo(),state:__solInfo.state()}));
  check('retorno sem ?intro chega direto no fit',
    !introReload.intro.active&&Math.abs(introReload.state.camDist-introReload.state.fitDist)<=introReload.state.fitDist*.05,
    JSON.stringify(introReload.intro));
  await introCtx.close();

  // (b) prefers-reduced-motion abre direto no fit mesmo com ?intro=1:
  // acessibilidade vence a demonstração.
  const reducedIntroCtx=await mobileCtx({reducedMotion:'reduce'});
  const rp=await reducedIntroCtx.newPage();rp.setDefaultTimeout(240000);
  await rp.goto(base+'?intro=1&scale=0.25');
  await rp.waitForFunction(()=>window.__solInfo&&window.__solInfo.introInfo);
  const reducedIntro=await rp.evaluate(()=>({intro:__solInfo.introInfo(),state:__solInfo.state()}));
  check('reduced-motion abre direto no fit mesmo com ?intro=1',
    !reducedIntro.intro.active&&Math.abs(reducedIntro.state.camDist-reducedIntro.state.fitDist)<=reducedIntro.state.fitDist*.05,
    JSON.stringify(reducedIntro.intro));
  await reducedIntroCtx.close();

  // (c) gesto de TOQUE no meio da abertura pula direto — os mesmos
  // listeners de câmera que devolvem o controle na visita/diretor.
  const skipCtx=await mobileCtx();
  const sp=await skipCtx.newPage();sp.setDefaultTimeout(240000);
  await sp.goto(base+'?intro=1&scale=0.25');
  await sp.waitForFunction(()=>window.__solInfo&&window.__solInfo.introInfo&&window.__solInfo.introInfo().active);
  await touchDragCanvas(sp,24,10);
  const skipped=await sp.evaluate(()=>window.__solInfo.introInfo());
  check('gesto de toque no meio da abertura pula direto',!skipped.active,JSON.stringify(skipped));
  await skipCtx.close();
  check('console permanece limpo na abertura',introErrors.length===0,introErrors.slice(0,3).join(' | '));

  const context=await mobileCtx();
  const page=await context.newPage();page.setDefaultTimeout(240000);
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  // speed=3 só comprime o relógio da prova; cada capítulo continua usando
  // os emissores físicos de produção e o cartão reduz/pausa esse ritmo.
  // PR-6: tier=mid — o tier REAL de um iPhone (Apple GPU + toque). Todos
  // os capítulos precisam de fonte física legítima também nele (cvol tem
  // cstep 22 em mid; cme tem cmestep 16): etapa indisponível em mid = FALHA.
  await page.goto(base+'?edu=1&lang=pt&tier=mid&scale=0.25&speed=3&cycle=1&intro=0');
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo);

  // PR-1 — porta e placa: a marca é única e o convite à visita vive no
  // palco. O chip precisa ser visível, tocável (≥44px), não cobrir o disco,
  // iniciar a visita, ceder o palco e não insistir depois da 1ª visita.
  const chrome=await page.evaluate(()=>({title:document.querySelector('#title-block h1').textContent,
    subtitle:document.querySelector('#title-block p').textContent,
    tour:window.__solInfo.eduTourInfo()}));
  check('marca única "SOL — uma estrela viva" no palco',/SOL/.test(chrome.title)&&/estrela viva/.test(chrome.subtitle),
    JSON.stringify({title:chrome.title,subtitle:chrome.subtitle}));
  check('chip da visita é visível, tocável e não cobre o disco',
    chrome.tour.chip.visible&&chrome.tour.chip.rect.height>=44&&chrome.tour.chip.rect.width>=44&&!overlap(chrome.tour.chip.rect,chrome.tour.diskRect),
    JSON.stringify(chrome.tour.chip));
  // PR-2 — restauração suave da pose: registramos theta/phi ANTES da visita
  // iniciada pelo chip (toque genuíno), deixamos a etapa de abertura
  // assentar, saímos no meio e provamos que a câmera volta sozinha.
  const poseBefore=await page.evaluate(()=>window.__solInfo.state());
  await page.tap('#eduTourChip');
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  const chipStart=await page.evaluate(()=>window.__solInfo.eduTourInfo().chip);
  check('chip inicia a visita e cede o palco',!chipStart.visible,JSON.stringify(chipStart));
  await waitStep(page,'surface');
  await page.tap('#eduTourExit');await page.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const chipAfter=await page.evaluate(()=>window.__solInfo.eduTourInfo().chip);
  check('depois da primeira visita o chip não volta a insistir',!chipAfter.visible,JSON.stringify(chipAfter));
  await page.waitForTimeout(2000);
  const poseAfter=await page.evaluate(()=>window.__solInfo.state());
  check('sair no meio devolve a pose suavemente à de entrada',
    Math.abs(poseAfter.theta-poseBefore.theta)<0.05&&Math.abs(poseAfter.phi-poseBefore.phi)<0.05,
    JSON.stringify({before:{theta:+poseBefore.theta.toFixed(4),phi:+poseBefore.phi.toFixed(4)},
      after:{theta:+poseAfter.theta.toFixed(4),phi:+poseAfter.phi.toFixed(4)}}));

  await page.tap('#knobBtn');await page.tap('#eduTourBtn');
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);

  const evidence=[];
  const first=await waitStep(page,'surface');
  let ui=await cardState(page);
  const initialSafe=finiteRect(ui.card)&&big(ui.expand)&&
    ui.aria==='false'&&ui.bodyHidden&&!overlap(ui.card,first.tour.diskRect)&&!overlap(ui.card,ui.gear);
  check('iPhone inicia com cartão recolhido, tocável e sem cobrir o Sol',initialSafe,JSON.stringify({card:ui.card,button:ui.expand,disk:first.tour.diskRect}));
  // PR-5 — a sessão de cinema pertence só à última sala.
  const cinemaEarly=await page.evaluate(()=>{const b=document.querySelector('#eduTourCinema');return {present:!!b,hidden:b?b.hidden:null};});
  check('sessão de cinema não é oferecida antes da última sala',cinemaEarly.present&&cinemaEarly.hidden===true,JSON.stringify(cinemaEarly));

  // Um arraste DE TOQUE não encerra a narrativa nem puxa a câmera de volta.
  // A pessoa recebe controle e pode pedir o reenquadramento de novo.
  await touchDragCanvas(page,30,12);
  await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&!t.assist&&t.phase==='manual';});
  const manual=await cardState(page);
  check('gesto de toque devolve a câmera sem encerrar a etapa',manual.tour.active&&!manual.tour.assist&&manual.tour.stepId==='surface',JSON.stringify({phase:manual.tour.phase,reason:manual.tour.manualReason}));
  await page.tap('#eduTourResume');await page.waitForFunction(()=>window.__solInfo.eduTourInfo().assist);

  // PR-6 — caminhada principal em tier=mid com gates por etapa. A pausa com
  // cartão aberto e relógio físico parado é provada em TRÊS etapas
  // representativas (global, evento episódico, evento de ciclo); nas demais
  // o gate barato: overflow do cartão aberto + 8% do tempo na leitura
  // recolhida. Antes da coroa, halo/ray são ZERADOS pelo visitante — a
  // etapa precisa re-iluminar por override (fótons de verdade), nunca
  // passar no escuro.
  await walkTour(page,{label:'retrato-mid',expandEach:true,
    pauseSteps:new Set(['surface','cme','maximum']),
    contrastCollapsed:'surface',contrastExpanded:'flare',
    evidenceShots:{'active-region':'etapa2-active-region.png','cme':'etapa5-cme.png'},
    fontGate:true,kickerRe:/VISITA GUIADA/,evidence:evidence,
    beforeNext:async(id,p)=>{
      if(id==='prominence')await p.evaluate(()=>{
        __solInfo.setControl('halo',0,{persist:false});
        __solInfo.setControl('ray',0,{persist:false});
      });
    },
    onStep:async(id,p)=>{
      if(id==='corona'){
        const cor=await p.evaluate(()=>({halo:__solInfo.knobs().halo,ray:__solInfo.knobs().ray,
          tour:__solInfo.eduTourInfo()}));
        check('coroa re-ilumina por override mesmo com halo/ray zerados pelo visitante',
          cor.halo>0&&cor.ray>0&&cor.tour.source.physical&&!cor.tour.source.unavailable,
          JSON.stringify({halo:cor.halo,ray:cor.ray,unavailable:cor.tour.source.unavailable}));
      }
    }});
  fs.writeFileSync(path.join(outDir,'evidence.json'),JSON.stringify({viewport:{width:390,height:844},tier:'mid',
    userAgent:IPHONE_UA,steps:evidence,errors:errors},null,2));

  // PR-5 — sessão de cinema: a última sala oferece o botão (tocável ≥44px);
  // tocar encerra a visita e entrega ao director; um gesto de toque devolve
  // o controle e o fim é limpo (nenhum empréstimo da visita OU do diretor).
  const cinemaUi=await page.evaluate(()=>{const b=document.querySelector('#eduTourCinema');if(!b)return null;
    const r=b.getBoundingClientRect();return {hidden:b.hidden,width:r.width,height:r.height,text:b.textContent};});
  check('última sala oferece a sessão de cinema tocável',!!cinemaUi&&!cinemaUi.hidden&&cinemaUi.width>=44&&cinemaUi.height>=44,JSON.stringify(cinemaUi));
  await page.tap('#eduTourCinema');
  await page.waitForFunction(()=>window.__solInfo.directorInfo().active&&!window.__solInfo.eduTourInfo().active);
  const cinemaState=await page.evaluate(()=>({director:window.__solInfo.directorInfo(),tour:window.__solInfo.eduTourInfo()}));
  check('cinema encerra a visita e entrega a câmera ao diretor',cinemaState.director.active&&!cinemaState.tour.active,
    JSON.stringify(cinemaState.director));
  await touchDragCanvas(page,26,10);
  await page.waitForFunction(()=>!window.__solInfo.directorInfo().active);
  const finished=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),cycle:window.__solInfo.cycleInfo(),
    director:window.__solInfo.directorInfo(),spots:window.__solInfo.controls('spots'),cme:window.__solInfo.controls('cme'),
    loops:window.__solInfo.controls('loops'),dof:window.__solInfo.controls('dof')}));
  check('fim limpo: modo livre sem empréstimos da visita nem do diretor',
    !finished.tour.active&&!finished.director.active&&!finished.cycle.event.on&&
    !finished.spots.overrideOwner&&!finished.cme.overrideOwner&&!finished.loops.overrideOwner&&!finished.dof.overrideOwner,
    JSON.stringify({spots:finished.spots.overrideOwner,cme:finished.cme.overrideOwner,loops:finished.loops.overrideOwner,
      dof:finished.dof.overrideOwner,cycle:finished.cycle.event.on}));
  check('console permanece limpo na visita',errors.length===0,errors.slice(0,3).join(' | '));
  // PR-2 — telemetria: nenhuma exceção de física pode ter sido engolida em
  // silêncio durante a caminhada inteira (ring agregado em core/config.js).
  const health=await page.evaluate(()=>window.__solInfo.eduHealth());
  check('nenhuma falha de física engolida',health.faults.length===0,JSON.stringify(health.faults.slice(0,4)));
  fs.writeFileSync(path.join(outDir,'evidence.json'),JSON.stringify({viewport:{width:390,height:844},tier:'mid',
    userAgent:IPHONE_UA,steps:evidence,errors:errors},null,2));
  await context.close();

  // ————— PR-6 · DPR3 (gate curto: carga + visita até a etapa 3) —————
  // O iPhone declara deviceScaleFactor 3; o produto CAPA o DPR de render em
  // 2 nos tiers móveis (dprCap) e multiplica por ?scale — a prova afirma a
  // transação de display coerente (dpr efetivo = min(3,cap)·scale·degrau,
  // dims físicas = css·dpr) e ZERO realloc de attachments com o app parado.
  // A caminhada completa em DPR3 custa ~4× e mora no nightly (--mode dpr3full).
  const dprCtx=await mobileCtx({deviceScaleFactor:3});
  const dp=await dprCtx.newPage();dp.setDefaultTimeout(240000);
  const dprErrors=[];dp.on('pageerror',(e)=>dprErrors.push('[dpr3] '+e.message));dp.on('console',(m)=>{if(m.type()==='error')dprErrors.push('[dpr3] '+m.text());});
  await dp.goto(base+'?edu=1&lang=pt&tier=mid&scale=0.25&speed=3&cycle=1&intro=0');
  await dp.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo&&window.__solInfo.perf&&window.__solInfo.perf().frames>4);
  const ri=await dp.evaluate(()=>({ri:__solInfo.resizeInfo(),steps:[1,0.85,0.7]}));
  // ?scale=0.25 é CLAMPADO a 0.3 pelo produto (config.js: RENDER_SCALE em
  // [0.3, 2.0]) — o baseDpr esperado deriva do valor aplicado, não do pedido.
  const expectedBase=Math.min(3,ri.ri.dprCap)*Math.max(0.3,0.25);
  const dprCohere=ri.ri.dprCap===2&&Math.abs(ri.ri.baseDpr-expectedBase)<1e-9&&
    Math.abs(ri.ri.dpr-ri.ri.baseDpr*ri.steps[ri.ri.scaleIdx])<1e-9&&
    Math.abs(ri.ri.physW-ri.ri.cssW*ri.ri.dpr)<=1&&Math.abs(ri.ri.physH-ri.ri.cssH*ri.ri.dpr)<=1&&!ri.ri.dirty;
  check('[dpr3] DPR efetivo coerente (cap 2 × scale, dims físicas = css·dpr)',dprCohere,JSON.stringify(ri.ri));
  const re0=await dp.evaluate(()=>({reallocs:__solInfo.resizeInfo().reallocs}));
  await dp.evaluate(()=>new Promise((res)=>{let n=0;(function f(){if(++n>=6)return res();requestAnimationFrame(f);})();}));
  const re1=await dp.evaluate(()=>__solInfo.resizeInfo());
  check('[dpr3] nenhum realloc por frame com o display estável',re1.reallocs===re0.reallocs,
    JSON.stringify({antes:re0.reallocs,depois:re1.reallocs}));
  await dp.tap('#eduTourChip');
  await dp.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  await walkTour(dp,{label:'dpr3',maxSteps:3,expandEach:false});
  check('console permanece limpo no DPR3',dprErrors.length===0,dprErrors.slice(0,3).join(' | '));
  await dprCtx.close();

  // ————— PR-6 · Controles negativos por gate —————
  // Fecha o loophole "physical = !!objeto": quando a física NÃO pode
  // existir, a etapa precisa dizer isso com o texto honesto (t.unavailable).
  //   cme  → tier=low tem cmestep=0: indisponível por construção.
  //   loops→ ?loops=0 sozinho NÃO basta: a visita re-liga por override (é o
  //          contrato dela — liga o que precisa e devolve no fim; o mesmo
  //          vale para spots/halo). A ausência GENUÍNA vem do kill do
  //          subsistema (subToggle.loops, o A/B do perf): sem tracer, nunca
  //          nasce um loop real e a etapa assume o indisponível.
  //   corona→ com o subsistema apagado desde o boot, o gate por fótons novo
  //          (uHalo/uRayBoost>0 + mesh no draw) marca indisponível; o ramo
  //          "override re-ilumina com halo/ray zerados" é provado na
  //          caminhada principal acima.
  const negCtx=await mobileCtx();
  const np=await negCtx.newPage();np.setDefaultTimeout(240000);
  const negErrors=[];np.on('pageerror',(e)=>negErrors.push('[neg] '+e.message));np.on('console',(m)=>{if(m.type()==='error')negErrors.push('[neg] '+m.text());});
  await np.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=3&cycle=1&intro=0&loops=0&cvol=0&cme=0');
  await np.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo);
  await np.evaluate(()=>{__solInfo.toggle('loops',false);__solInfo.toggle('corona',false);__solInfo.eduTourStart();});
  const negSteps=['surface','active-region','loops','flare','cme','filament','prominence','corona'];
  for(const id of negSteps){
    await waitStep(np,id);
    if(id==='loops'||id==='cme'||id==='corona'){
      const st=await np.evaluate(()=>({tour:__solInfo.eduTourInfo(),
        status:(document.querySelector('#eduTour .tour-status')||{textContent:''}).textContent}));
      check('[negativo] '+id+' sem física reporta indisponível com texto honesto',
        st.tour.source.unavailable===true&&/qualidade alta/.test(st.status)&&/simulado/.test(st.status),
        JSON.stringify({unavailable:st.tour.source.unavailable,physical:st.tour.source.physical,status:st.status}));
    }
    if(id!=='corona')await np.evaluate(()=>__solInfo.eduTourNext());
  }
  await np.evaluate(()=>__solInfo.eduTourExit());
  await np.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const negClean=await np.evaluate(()=>({spots:__solInfo.controls('spots').overrideOwner,
    loops:__solInfo.controls('loops').overrideOwner,halo:__solInfo.controls('halo').overrideOwner,
    ray:__solInfo.controls('ray').overrideOwner}));
  check('[negativo] sair devolve todos os empréstimos',
    !negClean.spots&&!negClean.loops&&!negClean.halo&&!negClean.ray,JSON.stringify(negClean));
  check('console permanece limpo nos negativos',negErrors.length===0,negErrors.slice(0,3).join(' | '));
  await negCtx.close();
}

// ————— Suíte paisagem (gate qa-landscape): caminhada COMPLETA 844×390 —————
async function landscapeSuite(){
  const land=await mobileCtx({viewport:{width:844,height:390}});
  const lp=await land.newPage();lp.setDefaultTimeout(240000);
  const errors=[];lp.on('pageerror',(e)=>errors.push('[paisagem] '+e.message));lp.on('console',(m)=>{if(m.type()==='error')errors.push('[paisagem] '+m.text());});
  await lp.goto(base+'?edu=1&lang=pt&tier=mid&scale=0.25&speed=3&cycle=1&intro=0');
  await lp.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo&&window.__solInfo.eduTourInfo().chip.visible);
  await lp.tap('#eduTourChip');
  await lp.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  await walkTour(lp,{label:'paisagem',expandEach:false,landscapeLayout:true,kickerRe:/VISITA GUIADA/});
  await lp.tap('#eduTourExit');
  await lp.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const health=await lp.evaluate(()=>window.__solInfo.eduHealth());
  check('[paisagem] nenhuma falha de física engolida',health.faults.length===0,JSON.stringify(health.faults.slice(0,4)));
  check('[paisagem] console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  fs.writeFileSync(path.join(outDir,'evidence-landscape.json'),JSON.stringify({viewport:{width:844,height:390},
    tier:'mid',errors:errors},null,2));
  await land.close();
}

// ————— Nightly: caminhada completa em DPR3 —————
async function dpr3FullSuite(){
  const ctx=await mobileCtx({deviceScaleFactor:3});
  const p=await ctx.newPage();p.setDefaultTimeout(240000);
  const errors=[];p.on('pageerror',(e)=>errors.push('[dpr3full] '+e.message));p.on('console',(m)=>{if(m.type()==='error')errors.push('[dpr3full] '+m.text());});
  await p.goto(base+'?edu=1&lang=pt&tier=mid&scale=0.25&speed=3&cycle=1&intro=0');
  await p.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo&&window.__solInfo.eduTourInfo().chip.visible);
  await p.tap('#eduTourChip');
  await p.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  await walkTour(p,{label:'dpr3full',expandEach:true,kickerRe:/VISITA GUIADA/});
  const ri=await p.evaluate(()=>__solInfo.resizeInfo());
  check('[dpr3full] display coerente ao fim da caminhada (cap 2, sem pendências)',
    ri.dprCap===2&&!ri.dirty,JSON.stringify(ri));
  check('[dpr3full] console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await ctx.close();
}

// ————— Nightly: caminhada completa em inglês —————
async function englishSuite(){
  const ctx=await mobileCtx();
  const p=await ctx.newPage();p.setDefaultTimeout(240000);
  const errors=[];p.on('pageerror',(e)=>errors.push('[en] '+e.message));p.on('console',(m)=>{if(m.type()==='error')errors.push('[en] '+m.text());});
  await p.goto(base+'?edu=1&lang=en&tier=mid&scale=0.25&speed=3&cycle=1&intro=0');
  await p.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo&&window.__solInfo.eduTourInfo().chip.visible);
  await p.tap('#eduTourChip');
  await p.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  await walkTour(p,{label:'en',expandEach:true,kickerRe:/GUIDED VISIT/});
  const lang=await p.evaluate(()=>({root:document.querySelector('#eduTour').lang}));
  check('[en] cartão declara lang=en para VoiceOver',lang.root==='en',JSON.stringify(lang));
  check('[en] console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await ctx.close();
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  if(mode==='portrait'||mode==='all')await portraitSuite();
  if(mode==='landscape'||mode==='all')await landscapeSuite();
  if(mode==='dpr3full')await dpr3FullSuite();
  if(mode==='en')await englishSuite();
  await browser.close();browser=null;
  if(fails){console.log('QA TOUR ('+mode+'): '+fails+' FALHA(S)');process.exitCode=1;}
  else console.log('QA TOUR ('+mode+'): tudo verde · evidência em '+outDir);
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

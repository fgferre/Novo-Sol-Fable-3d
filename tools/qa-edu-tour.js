// QA da Visita guiada do Museu Solar. A prova roda no viewport de iPhone,
// inicia pelo botão público e só aceita uma etapa quando tourInfo confirma a
// fonte física, o cartão e o enquadramento juntos.
const fs=require('fs');
const path=require('path');
const{chromium}=require('playwright');

const htmlFile=process.argv[2]||'dist-single/index.html';
const outDir=process.argv[3]||'out/qa-tour';
const base='file://'+path.resolve(htmlFile);
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}
function overlap(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function finiteRect(r){return r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;}
async function waitStep(page,id){
  await page.waitForFunction((id)=>{const t=window.__solInfo.eduTourInfo();return t.active&&t.stepId===id&&t.settled;},id,{timeout:240000});
  return page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),cycle:window.__solInfo.cycleInfo(),
    flare:window.__solInfo.flareInfo(),cme:window.__solInfo.cmeInfo(),loops:window.__solInfo.loopInfo()}));
}
async function cardState(page){
  return page.evaluate(()=>{
    function r(sel){const e=document.querySelector(sel);if(!e)return null;const x=e.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height};}
    return {tour:window.__solInfo.eduTourInfo(),card:r('#eduTour .tour-card'),expand:r('#eduTourExpand'),gear:r('#knobBtn'),
      aria:document.querySelector('#eduTourExpand')&&document.querySelector('#eduTourExpand').getAttribute('aria-expanded'),
      bodyHidden:document.querySelector('#eduTourBody')&&document.querySelector('#eduTourBody').hidden};
  });
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(240000);
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  // speed=3 só comprime o relógio da prova; cada capítulo continua usando
  // os emissores físicos de produção e o cartão reduz/pausa esse ritmo.
  await page.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=3&cycle=1');
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
  // iniciada pelo chip, deixamos a etapa de abertura assentar, saímos no
  // meio e provamos que a câmera volta sozinha (sem teleporte) à pose de
  // entrada. O mesmo fluxo cobre o contrato do chip (cede/não insiste).
  const poseBefore=await page.evaluate(()=>window.__solInfo.state());
  await page.click('#eduTourChip');
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  const chipStart=await page.evaluate(()=>window.__solInfo.eduTourInfo().chip);
  check('chip inicia a visita e cede o palco',!chipStart.visible,JSON.stringify(chipStart));
  await waitStep(page,'surface');
  await page.click('#eduTourExit');await page.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const chipAfter=await page.evaluate(()=>window.__solInfo.eduTourInfo().chip);
  check('depois da primeira visita o chip não volta a insistir',!chipAfter.visible,JSON.stringify(chipAfter));
  await page.waitForTimeout(2000);
  const poseAfter=await page.evaluate(()=>window.__solInfo.state());
  check('sair no meio devolve a pose suavemente à de entrada',
    Math.abs(poseAfter.theta-poseBefore.theta)<0.05&&Math.abs(poseAfter.phi-poseBefore.phi)<0.05,
    JSON.stringify({before:{theta:+poseBefore.theta.toFixed(4),phi:+poseBefore.phi.toFixed(4)},
      after:{theta:+poseAfter.theta.toFixed(4),phi:+poseAfter.phi.toFixed(4)}}));

  await page.click('#knobBtn');await page.click('#eduTourBtn');
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);

  const evidence=[];
  let first=await waitStep(page,'surface');
  let ui=await cardState(page);
  const initialSafe=finiteRect(ui.card)&&finiteRect(ui.expand)&&ui.expand.height>=44&&ui.expand.width>=44&&
    ui.aria==='false'&&ui.bodyHidden&&!overlap(ui.card,first.tour.diskRect)&&!overlap(ui.card,ui.gear);
  check('iPhone inicia com cartão recolhido, tocável e sem cobrir o Sol',initialSafe,JSON.stringify({card:ui.card,button:ui.expand,disk:first.tour.diskRect}));

  await page.click('#eduTourExpand');await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo(),a=t.cardRect,b=t.diskRect;const clear=!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y);return t.timeFactor===0&&t.settled&&clear;});
  // O clique pode atravessar um frame já em voo. Medimos DEPOIS desse
  // frame e em seguida por uma nova janela de tempo para provar o pause.
  await page.waitForTimeout(350);const beforePause=await page.evaluate(()=>window.__solInfo.cycleInfo().time);
  await page.waitForTimeout(700);
  ui=await cardState(page);const afterPause=await page.evaluate(()=>window.__solInfo.cycleInfo().time);
  check('botão + abre o texto, afasta o Sol e pausa o tempo físico',ui.aria==='true'&&!ui.bodyHidden&&!overlap(ui.card,ui.tour.diskRect)&&Math.abs(afterPause-beforePause)<1e-9&&ui.tour.timeFactor===0,JSON.stringify({beforePause,afterPause,factor:ui.tour.timeFactor,card:ui.card,disk:ui.tour.diskRect}));
  await page.click('#eduTourExpand');

  // Um arraste não encerra a narrativa nem puxa a câmera de volta. A pessoa
  // recebe controle e pode pedir explicitamente o reenquadramento de novo.
  const canvas=await page.locator('#canvas-container canvas').boundingBox();
  if(canvas){
    await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.mouse.down();
    await page.mouse.move(canvas.x+canvas.width*.5+30,canvas.y+canvas.height*.5+12,{steps:3});await page.mouse.up();
  }
  await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&!t.assist&&t.phase==='manual';});
  let manual=await cardState(page);
  check('gesto devolve a câmera sem encerrar a etapa',manual.tour.active&&!manual.tour.assist&&manual.tour.stepId==='surface',JSON.stringify({phase:manual.tour.phase,reason:manual.tour.manualReason}));
  await page.click('#eduTourResume');await page.waitForFunction(()=>window.__solInfo.eduTourInfo().assist);

  const steps=['surface','active-region','loops','flare','cme','filament','prominence','corona','maximum','minimum'];
  for(let i=0;i<steps.length;i++){
    const id=steps[i];
    const data=await waitStep(page,id);
    ui=await cardState(page);
    const source=data.tour.source;
    const visible=source.physical&&source.visible&&!source.unavailable;
    const layout=finiteRect(ui.card)&&!overlap(ui.card,data.tour.diskRect)&&!overlap(ui.card,ui.gear);
    check('etapa '+(i+1)+'/'+steps.length+' '+id+' usa fonte física visível',visible&&layout,
      JSON.stringify({source:source,card:ui.card,disk:data.tour.diskRect,cycle:data.cycle.phase}));
    evidence.push({step:id,index:data.tour.index,source:source,card:ui.card,disk:data.tour.diskRect,
      cycle:{phase:data.cycle.phase,amp:data.cycle.amp,event:data.cycle.event},flare:{t:data.flare.t,amp:data.flare.amp},
      cme:{t:data.cme.t,front:data.cme.front},loops:{amb:data.loops.amb,arc:data.loops.arc}});
    if(i<steps.length-1)await page.click('#eduTourNext');
  }

  await page.click('#eduTourExit');await page.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const finished=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),cycle:window.__solInfo.cycleInfo(),
    spots:window.__solInfo.controls('spots'),cme:window.__solInfo.controls('cme'),loops:window.__solInfo.controls('loops')}));
  check('sair devolve o modo livre e limpa os empréstimos temporários',!finished.tour.active&&!finished.cycle.event.on&&
    !finished.spots.overrideOwner&&!finished.cme.overrideOwner&&!finished.loops.overrideOwner,JSON.stringify(finished));
  check('console permanece limpo na visita',errors.length===0,errors.slice(0,3).join(' | '));
  // PR-2 — telemetria: nenhuma exceção de física pode ter sido engolida em
  // silêncio durante a caminhada inteira (ring agregado em core/config.js).
  const health=await page.evaluate(()=>window.__solInfo.eduHealth());
  check('nenhuma falha de física engolida',health.faults.length===0,JSON.stringify(health.faults.slice(0,4)));
  fs.writeFileSync(path.join(outDir,'evidence.json'),JSON.stringify({viewport:{width:390,height:844},steps:evidence,errors:errors},null,2));

  // PR-2 — paisagem de telefone (844×390): o cartão precisa usar o layout
  // mobile (nunca o desktop de width 330/left 22) e ficar fora do disco.
  const land=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const lp=await land.newPage();lp.setDefaultTimeout(240000);
  await lp.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=3&cycle=1');
  await lp.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduTourInfo);
  await lp.evaluate(()=>window.__solInfo.eduTourStart());
  await lp.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&t.stepId==='surface'&&t.settled;});
  const landUi=await lp.evaluate(()=>{
    const e=document.querySelector('#eduTour .tour-card'),r=e.getBoundingClientRect();
    return {card:{x:r.x,y:r.y,width:r.width,height:r.height},disk:window.__solInfo.eduTourInfo().diskRect};
  });
  check('paisagem usa o layout mobile do cartão',
    landUi.card.width<700&&landUi.card.x<=20&&!(Math.round(landUi.card.width)===330&&Math.round(landUi.card.x)===22),
    JSON.stringify(landUi.card));
  check('paisagem mantém o cartão fora do disco',!overlap(landUi.card,landUi.disk),JSON.stringify(landUi));
  await land.close();

  await context.close();await browser.close();browser=null;
  if(fails){console.log('QA TOUR: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA TOUR: tudo verde · evidência em '+path.join(outDir,'evidence.json'));
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

// QA do modo quiosque (Série Museu PR-13). A prova roda num "tablet de
// museu" (viewport 768×1024, toque real via CDP — o mesmo caminho do dedo
// de qa-edu-tour.js) com os relógios do quiosque ENCURTADOS por query de QA
// (?kioskidle=3&kioskstep=4&kioskresume=6 — overrides de USO EXCLUSIVO DE
// QA, documentados em src/core/kiosk.js; a instalação real usa 45/26/60).
//
// Provas:
//  (a) sem NENHUMA interação, a visita inicia sozinha após o idle;
//  (b) as etapas avançam sozinhas (kiosk chama eduTourNext quando prontas);
//  (c) um gesto de toque para o auto-avanço e devolve o controle (a visita
//      fica em manual e o índice NÃO anda);
//  (d) manual abandonado (kioskresume s sem interação) → a visita encerra e
//      o ciclo retoma: a visita REINICIA sozinha da sala 1;
//  (—) 10ª sala concluída → o quiosque dispara a sessão de cinema; uma
//      volta completa do diretor (directorSkip acelera) devolve ao idle e a
//      visita recomeça — o loop eterno fecha;
//  (e) engrenagem oculta, chip da visita oculto e gesto do HUD inerte;
//  (f) localStorage permanece VAZIO ao fim (persistência OFF provada; a
//      coleção da sessão vive só em memória — discoveredViews > 0);
//  (g) NEGATIVO: sem ?kiosk=1 (mesmo com os overrides de relógio na URL)
//      nada disso acontece — sem auto-start, engrenagem/chip visíveis, o
//      gesto do HUD FUNCIONA (controle de que o harness dispara o gesto) e
//      solKnobs volta a persistir; sob ?det=1&kiosk=1 o quiosque nem existe.
const fs=require('fs');
const path=require('path');
const{chromium}=require('playwright');

const htmlFile=process.argv[2]||'dist-single/index.html';
const outDir=process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:'out/qa-kiosk';
const base='file://'+path.resolve(htmlFile);
// Tablet genérico de museu (iPad Safari): o app não lê UA — é declaração
// honesta do ambiente da instalação.
const TABLET_UA='Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const KIOSK_Q='?kiosk=1&lang=pt&tier=mid&scale=0.3&speed=3&intro=0&kioskidle=3&kioskstep=4&kioskresume=6';
const PLAIN_Q='?lang=pt&tier=mid&scale=0.3&speed=3&intro=0&kioskidle=3&kioskstep=4&kioskresume=6';

let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}
function tabletCtx(){
  return browser.newContext({viewport:{width:768,height:1024},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,userAgent:TABLET_UA});
}
// Toque genuíno via CDP (Input.dispatchTouchEvent — vira PointerEvents
// pointerType 'touch' na página, o caminho do dedo de verdade).
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
// Gesto do HUD de controls.js: dedo PARADO ~1s (o timer de 1000ms dispara
// com o toque ainda no chão e sem movimento >9px).
async function touchHold(page,ms){
  const c=await page.locator('#canvas-container canvas').boundingBox();
  if(!c)return false;
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:c.x+c.width*.5,y:c.y+c.height*.5,id:1}]});
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach().catch(()=>{});}
  return true;
}
function operatorState(page){
  return page.evaluate(()=>{
    const gear=document.getElementById('knobBtn');
    const chip=document.getElementById('eduTourChip');
    const hud=document.getElementById('perfHud');
    return {gearHidden:!!gear&&gear.hidden,gearDisplay:gear?getComputedStyle(gear).display:'',
      chipHidden:!!chip&&chip.hidden,hudDisplay:hud?getComputedStyle(hud).display:'',
      kiosk:window.__solInfo.kioskInfo()};
  });
}

// ————— Suíte principal: o ciclo de atração completo em ?kiosk=1 —————
async function kioskSuite(){
  const context=await tabletCtx();
  const page=await context.newPage();page.setDefaultTimeout(240000);
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  const evidence={url:KIOSK_Q,events:[]};
  await page.goto(base+KIOSK_Q);
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.kioskInfo&&window.__solInfo.kioskInfo().available);

  // (e) distrações de operador desligadas + gesto do HUD inerte. O toque
  // parado de 1.4s marca interação — por isso vem ANTES da espera do idle.
  const op0=await operatorState(page);
  check('(e) engrenagem oculta no quiosque',op0.gearHidden&&op0.gearDisplay==='none',JSON.stringify({hidden:op0.gearHidden,display:op0.gearDisplay}));
  check('(e) chip da visita oculto no quiosque',op0.chipHidden,JSON.stringify({chipHidden:op0.chipHidden}));
  await touchHold(page,1400);
  const opHold=await operatorState(page);
  check('(e) segurar 1s NÃO abre o HUD (gesto inerte)',opHold.hudDisplay==='none',JSON.stringify({hudDisplay:opHold.hudDisplay}));

  // (a) auto-start: nenhum clique/toque daqui em diante — a visita precisa
  // nascer sozinha depois de kioskidle segundos de inatividade.
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  const started=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('(a) visita inicia sozinha após o idle',started.tour.active&&started.tour.assist&&started.kiosk.mode==='tour',
    JSON.stringify({stepId:started.tour.stepId,assist:started.tour.assist,mode:started.kiosk.mode}));
  evidence.events.push({event:'auto-start',kiosk:started.kiosk});

  // (b) auto-avanço: a etapa 2 chega sem nenhum input.
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().index>=1);
  const advanced=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('(b) etapas avançam sozinhas (kioskstep s de leitura)',advanced.tour.index>=1&&advanced.tour.assist&&advanced.kiosk.mode==='tour',
    JSON.stringify({index:advanced.tour.index,stepId:advanced.tour.stepId}));
  evidence.events.push({event:'auto-advance',index:advanced.tour.index});

  // (c) um gesto devolve o controle e PARA o auto-avanço: a visita fica em
  // manual e o índice não anda (checado numa janela curta — abaixo do
  // kioskresume de 6s que encerraria a visita abandonada).
  await touchDragCanvas(page,40,16);
  await page.waitForFunction(()=>{const t=window.__solInfo.eduTourInfo();return t.active&&!t.assist;});
  const manual0=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  await page.waitForTimeout(3000);
  const manual1=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('(c) gesto devolve o controle sem encerrar a etapa',manual0.tour.active&&!manual0.tour.assist&&manual0.tour.phase==='manual',
    JSON.stringify({phase:manual0.tour.phase,reason:manual0.tour.manualReason}));
  check('(c) em manual o quiosque NÃO avança etapa',manual1.tour.active&&!manual1.tour.assist&&manual1.tour.index===manual0.tour.index,
    JSON.stringify({antes:manual0.tour.index,depois:manual1.tour.index,mode:manual1.kiosk.mode}));
  evidence.events.push({event:'manual',index:manual0.tour.index});

  // (d) manual abandonado por kioskresume s → a visita encerra e o ciclo
  // retoma: depois de kioskidle s de inatividade a visita REINICIA sozinha.
  await page.waitForFunction(()=>!window.__solInfo.eduTourInfo().active);
  const exited=await page.evaluate(()=>window.__solInfo.kioskInfo());
  check('(d) visita abandonada em manual é encerrada pelo quiosque',exited.mode==='idle',JSON.stringify(exited));
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  const resumed=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('(d) o ciclo retoma: a visita reinicia sozinha da sala 1',
    resumed.tour.active&&resumed.tour.index===0&&resumed.tour.assist&&resumed.kiosk.mode==='tour',
    JSON.stringify({index:resumed.tour.index,mode:resumed.kiosk.mode}));
  evidence.events.push({event:'cycle-resumed',kiosk:resumed.kiosk});

  // Caminho até a 10ª sala: o QA adianta as salas 1-9 pelo hook público
  // (eduTourNext quando pronta — o auto-avanço por relógio já foi provado
  // em (b); repetir 10×26s aqui só queimaria wall-clock de CI). O ÚLTIMO
  // avanço fica com o quiosque: só ele pode concluir a sala 10 e disparar o
  // cinema — é exatamente o que a espera abaixo prova.
  await page.waitForFunction(()=>{
    const t=window.__solInfo.eduTourInfo();
    if(!t.active)return false;
    if(t.index>=9)return true;
    if(t.phase==='reading'||(t.source&&t.source.unavailable))window.__solInfo.eduTourNext();
    return false;
  },null,{polling:250});
  await page.waitForFunction(()=>window.__solInfo.directorInfo().active&&!window.__solInfo.eduTourInfo().active);
  const cinema=await page.evaluate(()=>({director:window.__solInfo.directorInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('10ª sala concluída → quiosque dispara a sessão de cinema',
    cinema.director.active&&cinema.kiosk.mode==='cinema',JSON.stringify({t:cinema.director.t,mode:cinema.kiosk.mode}));
  evidence.events.push({event:'cinema',director:cinema.director});
  await page.screenshot({path:path.join(outDir,'cinema.png')});

  // Volta completa do diretor (acelerada por directorSkip — a mesma
  // sequência, sem esperar 84s simulados): o quiosque detecta a reciclagem
  // do relógio, encerra a sessão e volta ao idle; o loop eterno fecha com a
  // visita reiniciando sozinha.
  await page.evaluate(()=>window.__solInfo.directorSkip(83));
  await page.waitForFunction(()=>!window.__solInfo.directorInfo().active);
  const afterCinema=await page.evaluate(()=>window.__solInfo.kioskInfo());
  check('volta completa do cinema devolve ao idle',afterCinema.mode==='idle',JSON.stringify(afterCinema));
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().active);
  const loop=await page.evaluate(()=>({tour:window.__solInfo.eduTourInfo(),kiosk:window.__solInfo.kioskInfo()}));
  check('loop eterno: depois do cinema a visita recomeça sozinha',
    loop.tour.active&&loop.tour.index===0&&loop.kiosk.mode==='tour',JSON.stringify({index:loop.tour.index,mode:loop.kiosk.mode}));
  evidence.events.push({event:'loop-closed',kiosk:loop.kiosk});

  // (f) persistência OFF provada: DEPOIS de abertura de sessão, visita
  // completa (10 salas gravadas na COLEÇÃO EM MEMÓRIA), troca de etapas,
  // cinema e reinício — o localStorage segue completamente VAZIO.
  const storage=await page.evaluate(()=>({n:localStorage.length,
    knobs:localStorage.getItem('solKnobs'),tier:localStorage.getItem('solTier'),
    coll:localStorage.getItem('solEduCollection.v1'),
    views:window.__solInfo.eduCollectionInfo().discoveredViews}));
  check('(f) localStorage permanece VAZIO ao fim',storage.n===0&&storage.knobs===null&&storage.tier===null&&storage.coll===null,
    JSON.stringify({length:storage.n}));
  check('(f) a coleção da sessão vive em memória (visita gravou vistas)',storage.views>0,'views='+storage.views);

  const health=await page.evaluate(()=>window.__solInfo.eduHealth());
  check('nenhuma falha engolida no ciclo do quiosque',health.faults.length===0,JSON.stringify(health.faults.slice(0,4)));
  check('console permanece limpo no quiosque',errors.length===0,errors.slice(0,3).join(' | '));
  fs.writeFileSync(path.join(outDir,'evidence.json'),JSON.stringify({viewport:{width:768,height:1024},
    userAgent:TABLET_UA,evidence:evidence,errors:errors},null,2));
  await context.close();
}

// ————— (g) Negativo: sem ?kiosk=1 nada disso acontece —————
async function negativeSuite(){
  const context=await tabletCtx();
  const page=await context.newPage();page.setDefaultTimeout(240000);
  const errors=[];page.on('pageerror',(e)=>errors.push('[neg] '+e.message));page.on('console',(m)=>{if(m.type()==='error')errors.push('[neg] '+m.text());});
  await page.goto(base+PLAIN_Q);
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.kioskInfo);
  const boot=await operatorState(page);
  check('(g) sem ?kiosk=1 o hook responde available:false',boot.kiosk.available===false,JSON.stringify(boot.kiosk));
  check('(g) engrenagem visível fora do quiosque',!boot.gearHidden&&boot.gearDisplay!=='none',JSON.stringify({hidden:boot.gearHidden,display:boot.gearDisplay}));
  await page.waitForFunction(()=>window.__solInfo.eduTourInfo().chip.visible);
  check('(g) chip da visita visível fora do quiosque',true);
  // Os overrides de relógio na URL não vazam: 12s de parede (4× o kioskidle
  // de QA) sem interação e NENHUMA visita começa sozinha.
  await page.waitForTimeout(12000);
  const still=await page.evaluate(()=>window.__solInfo.eduTourInfo().active);
  check('(g) sem ?kiosk=1 a visita NÃO inicia sozinha',still===false,'active='+still);
  // Controle do gesto do HUD: o MESMO toque parado que ficou inerte no
  // quiosque LIGA o HUD aqui — prova que o harness dispara o gesto real.
  await touchHold(page,1400);
  await page.waitForFunction(()=>{const h=document.getElementById('perfHud');return h&&getComputedStyle(h).display==='block';});
  check('(g) fora do quiosque o gesto de segurar 1s abre o HUD (controle)',true);
  // Controle da persistência: fora do quiosque o solKnobs volta a existir
  // (o contador do chip da visita grava no boot) — o VAZIO de (f) é efeito
  // do quiosque, não do harness.
  const knobs=await page.evaluate(()=>localStorage.getItem('solKnobs'));
  check('(g) fora do quiosque a persistência volta (solKnobs existe)',knobs!==null,String(knobs).slice(0,60));
  check('(g) console permanece limpo no negativo',errors.length===0,errors.slice(0,3).join(' | '));
  await context.close();
}

// ————— (g2) Sob ?det=1 o quiosque nem existe (mesmo com ?kiosk=1) —————
async function detSuite(){
  const context=await tabletCtx();
  const page=await context.newPage();page.setDefaultTimeout(240000);
  await page.goto(base+'?det=1&kiosk=1&scale=0.3');
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.kioskInfo);
  const det=await page.evaluate(()=>{
    const gear=document.getElementById('knobBtn');
    return {kiosk:window.__solInfo.kioskInfo(),gearHidden:!!gear&&gear.hidden};
  });
  check('(g) sob ?det=1&kiosk=1 o quiosque é inerte por construção',
    det.kiosk.available===false&&!det.gearHidden,JSON.stringify(det));
  await context.close();
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await kioskSuite();
  await negativeSuite();
  await detSuite();
  await browser.close();browser=null;
  if(fails){console.log('QA KIOSK: '+fails+' FALHA(S)');process.exitCode=1;}
  else console.log('QA KIOSK: tudo verde · evidência em '+outDir);
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

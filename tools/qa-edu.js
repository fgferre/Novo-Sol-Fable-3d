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
async function forceVisible(page){
  for(let i=0;i<4;i++){
    await page.evaluate((n)=>window.__solInfo.forceFlarePair(n),i);
    await frame(page);
    const info=await page.evaluate(()=>window.__solInfo.eduInfo());
    if(info.active.length&&info.active[0].visible){
      // Aguarda a entrada editorial (máx. 650 ms) assentar antes de medir
      // colisões; o estado semântico já estava ativo no frame anterior.
      await page.waitForTimeout(700);
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
async function layoutState(page){
  return page.evaluate(()=>{
    const info=window.__solInfo.eduInfo(),a=info.active[0];
    function rect(sel){const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}
    const line=document.querySelector('#edu .edu-line');
    return {info,label:a&&a.labelRect,anchor:a&&a.anchor,title:rect('#title-block'),gear:rect('#knobBtn'),hint:rect('#hint'),
      line:line?{x1:+line.getAttribute('x1'),y1:+line.getAttribute('y1')}:null,
      viewport:{width:innerWidth,height:innerHeight},lang:document.querySelector('#edu')&&document.querySelector('#edu').lang};
  });
}
(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];

  // Mesmo ?edu=1 não pode atravessar a guarda determinística.
  const det=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});
  det.setDefaultTimeout(180000);
  det.on('pageerror',(e)=>errors.push('[det] '+e.message));
  det.on('console',(m)=>{if(m.type()==='error')errors.push('[det] '+m.text());});
  await det.goto(base+'?det=1&seed=7&hold=2&tier=low&scale=0.25&edu=1');
  await det.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>4);
  const inert=await det.evaluate(()=>({info:__solInfo.eduInfo(),root:!!document.querySelector('#edu'),style:!!document.querySelector('#eduStyle'),
    panelSwitch:!!document.querySelector('#eduSwitchRow'),langControl:!!document.querySelector('#eduLangRow'),emit:__solInfo.eduEmit('flare'),force:__solInfo.forceFlarePair(0)}));
  check('det permanece totalmente sem camada educativa',!inert.info.enabled&&!inert.root&&!inert.style&&!inert.panelSwitch&&!inert.langControl&&!inert.emit);
  await det.close();

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
  await page.waitForTimeout(700);
  state=await layoutState(page);
  const m=state.label,mv=state.viewport,ma=state.anchor;
  const mobileInside=m&&m.x>=12&&m.y>=12&&m.x+m.width<=mv.width-12&&m.y+m.height<=mv.height-12;
  const mobileClear=m&&ma&&!(ma.x>m.x-20&&ma.x<m.x+m.width+20&&ma.y>m.y-20&&ma.y<m.y+m.height+20)&&
    ![state.title,state.gear,state.hint].filter(Boolean).some((x)=>overlap(m,x));
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
  const lowEdu=await lowCme.evaluate(()=>__solInfo.eduInfo());
  check('CME não inventa descoberta em tier sem geometria',!lowLaunch.forced&&lowLaunch.cme.steps===0&&!lowEdu.active.some((x)=>x.type==='cme')&&!lowEdu.queued.some((x)=>x.type==='cme'));
  await lowCme.close();

  const cmePage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  cmePage.setDefaultTimeout(240000);
  cmePage.on('pageerror',(e)=>errors.push('[cme] '+e.message));
  cmePage.on('console',(m)=>{if(m.type()==='error')errors.push('[cme] '+m.text());});
  await cmePage.goto(base+'?edu=1&lang=pt&tier=high&scale=0.25&speed=0.05&cycle=0&cme=1');
  await cmePage.waitForFunction(()=>window.__solInfo&&window.__solInfo.eduInfo);
  await cmePage.evaluate(()=>window.__solInfo.setRotSpeed(0));
  const cmeFired=await forceVisibleCme(cmePage);
  const cmeState=await cmePage.evaluate(()=>({info:__solInfo.eduInfo(),text:document.querySelector('.edu-label').textContent,cme:__solInfo.cmeInfo()}));
  const cmeItem=cmeState.info.active[0];
  const cmeLineClear=cmeItem&&!cmeItem.connectorVisible||!!(cmeItem&&segmentDistance(cmeItem.disk.x,cmeItem.disk.y,cmeItem.anchor.x,cmeItem.anchor.y,cmeItem.lineEnd.x,cmeItem.lineEnd.y)>cmeItem.disk.r+6);
  check('CME física substitui o flare quando sua frente emerge',!!cmeFired&&!!cmeFired.cme.on&&cmeItem&&cmeItem.type==='cme'&&cmeItem.priority>90&&cmeItem.visible&&/Ejeção de massa coronal/.test(cmeState.text)&&cmeLineClear,cmeItem?JSON.stringify({par:cmeFired?cmeFired.index:null,anchor:cmeItem.anchor,line:cmeItem.connectorVisible,cme:cmeState.cme,text:cmeState.text}):'sem CME');
  await cmePage.evaluate(()=>window.__solInfo.setCmeClock(20));
  await frame(cmePage);
  const cmeEnded=await cmePage.evaluate(()=>window.__solInfo.eduInfo());
  check('narrativa da CME encerra com a ejeção física',!cmeEnded.active.some((x)=>x.type==='cme'));
  await cmePage.close();

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

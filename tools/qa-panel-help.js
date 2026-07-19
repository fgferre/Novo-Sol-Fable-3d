// PR-14 · ajuda "?" em todos os controles do painel. Provas:
//   (a) completude — TODA linha renderizada tem o "?" (35 sliders do schema
//       + 11 itens de chrome = 46) e ZERO console.warn('[help] …');
//   (b) desktop — mouseenter abre o tooltip com as três seções (o que faz /
//       o que você vê / nota ☉ quando houver), mouseleave fecha;
//   (c) teclado — foco não abre sozinho; Enter alterna; Esc fecha só o tooltip;
//   (d) touch (hasTouch) — long-press ~450 ms via CDP abre e sobrevive ao
//       soltar sobre o "?"; tap fora fecha; tap simples TAMBÉM abre (bônus
//       documentado de acessibilidade — o long-press é o pedido literal);
//   (e) PT→EN — o conteúdo do tooltip dos sentinelas (cycle, burst, tier) e
//       os aria-labels dos "?" trocam de idioma;
//   (f) o tooltip nunca estoura o viewport em 960×600 nem em 390×844.
// Um ÚNICO elemento role=tooltip compartilhado — nunca um por linha.
const path=require('path');
const{chromium}=require('playwright');
const htmlFile=process.argv[2]||'dist-single/index.html';
const base='file://'+path.resolve(htmlFile);
const QUERY='?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&intro=0';
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}

const CHROME_KEYS=['switch-edu','btn-tour','btn-postcard','btn-lang','collection',
  'switch-idle','btn-look','btn-director','switch-hud','tier','btn-reset'];

function trackPage(page,tag,errors,helpWarns){
  page.setDefaultTimeout(240000);
  page.on('pageerror',(e)=>errors.push('['+tag+'] '+e.message));
  page.on('console',(m)=>{
    if(m.type()==='error')errors.push('['+tag+'] '+m.text());
    if(m.type()==='warning'&&m.text().indexOf('[help]')>=0)helpWarns.push('['+tag+'] '+m.text());
  });
}
async function boot(page){
  await page.goto(base+QUERY);
  await page.waitForFunction(()=>window.__solInfo&&document.querySelector('#knobBtn'));
}
const readTip=()=>({
  hidden:document.querySelector('#helpTip').hidden,
  what:document.querySelector('#helpTip .helpWhat').textContent,
  visualHead:document.querySelector('#helpTip .helpVisualHead').textContent,
  visual:document.querySelector('#helpTip .helpVisualBody').textContent,
  eduHidden:document.querySelector('#helpTip .helpEdu').hidden,
  edu:document.querySelector('#helpTip .helpEdu').textContent,
  rect:(r=>({x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}))(document.querySelector('#helpTip').getBoundingClientRect()),
  vw:window.innerWidth,vh:window.innerHeight,
  describedBy:(document.querySelector('.helpBtn[aria-describedby="helpTip"]')||{}).dataset?
    document.querySelector('.helpBtn[aria-describedby="helpTip"]').dataset.helpKey:'',
});
function inViewport(t){return t.rect.x>=0&&t.rect.y>=0&&t.rect.right<=t.vw&&t.rect.bottom<=t.vh&&t.rect.w>0&&t.rect.h>0;}

(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[],helpWarns=[];

  // ————— desktop 960×600 —————
  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  trackPage(page,'desktop',errors,helpWarns);
  await boot(page);
  await page.click('#knobBtn');
  await page.waitForFunction(()=>document.querySelector('#knobBtn').getAttribute('aria-expanded')==='true');

  // (a) completude: walk do DOM — cada linha renderizada tem o seu "?".
  const audit=await page.evaluate((chromeKeys)=>{
    const missing=[];
    const rows=Array.from(document.querySelectorAll('#knobPanel .row[data-control]'));
    rows.forEach((r)=>{if(!r.querySelector('.helpBtn'))missing.push('row:'+r.dataset.control);});
    Array.from(document.querySelectorAll('#knobPanel .switch,#knobPanel .choice')).forEach((r,i)=>{
      if(!r.querySelector('.helpBtn'))missing.push('linha-switch/choice #'+i);
    });
    ['eduTourBtn','postcardBtn','lookBtn','dirBtn','knobReset','eduCollectionToggle'].forEach((id)=>{
      const el=document.getElementById(id);
      if(!el)missing.push('ausente:#'+id);
      else{
        const wrap=el.closest('.helpRow');
        if(!wrap||!wrap.querySelector('.helpBtn'))missing.push('btn:#'+id);
      }
    });
    chromeKeys.forEach((k)=>{if(!document.querySelector('#knobPanel .helpBtn[data-help-key="'+k+'"]'))missing.push('chrome:'+k);});
    const keys=Array.from(document.querySelectorAll('#knobPanel .helpBtn')).map((b)=>b.dataset.helpKey);
    const dup=keys.filter((k,i)=>keys.indexOf(k)!==i);
    const btn=document.querySelector('#knobPanel .helpBtn[data-help-key="cycle"]');
    const hit=btn.getBoundingClientRect();
    return {missing,dup,total:keys.length,rows:rows.length,
      tooltips:document.querySelectorAll('[role="tooltip"]').length,
      hit:{w:hit.width,h:hit.height},
      ariaPt:btn.getAttribute('aria-label')};
  },CHROME_KEYS);
  check('completude: toda linha renderizada tem o "?"',audit.missing.length===0,audit.missing.slice(0,8).join(' | '));
  check('completude: 35 sliders + 11 itens de chrome = 46 ajudas, sem duplicata',
    audit.total===audit.rows+CHROME_KEYS.length&&audit.rows===35&&audit.dup.length===0,
    JSON.stringify({total:audit.total,rows:audit.rows,dup:audit.dup}));
  check('um ÚNICO tooltip compartilhado (role=tooltip)',audit.tooltips===1,String(audit.tooltips));
  check('hit area do "?" ≥32px',audit.hit.w>=32&&audit.hit.h>=32,JSON.stringify(audit.hit));
  check('aria-label PT do "?" ("explicação: …")',audit.ariaPt==='explicação: Profundidade do ciclo',audit.ariaPt);

  // (b) desktop hover: abre com as seções, mouseleave fecha.
  await page.hover('.helpBtn[data-help-key="cycle"]');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  const cyclePt=await page.evaluate(readTip);
  check('hover: tooltip com "o que faz" e "o que você vê"',
    cyclePt.what.length>20&&cyclePt.visual.length>20&&cyclePt.visualHead==='o que você vê',
    JSON.stringify({what:cyclePt.what.slice(0,30),head:cyclePt.visualHead}));
  check('hover: nota educativa do ciclo presente com prefixo ☉',
    !cyclePt.eduHidden&&cyclePt.edu.indexOf('☉')===0&&cyclePt.edu.indexOf('11 anos')>0,cyclePt.edu.slice(0,40));
  check('hover: aria-describedby aponta ao tooltip aberto',cyclePt.describedBy==='cycle',cyclePt.describedBy);
  check('hover: tooltip dentro do viewport 960×600',inViewport(cyclePt),JSON.stringify(cyclePt.rect));
  await page.mouse.move(200,80);
  await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);
  check('mouseleave fecha o tooltip',true);

  // controle sem nota educativa: seção ☉ oculta.
  await page.hover('.helpBtn[data-help-key="exposure"]');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  const expTip=await page.evaluate(readTip);
  check('controle sem física a ensinar esconde a seção ☉',expTip.eduHidden&&expTip.edu==='',JSON.stringify({hidden:expTip.eduHidden}));
  await page.mouse.move(200,80);
  await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);

  // (f) extremos do scroll no desktop: primeiro slider e último botão.
  await page.hover('.helpBtn[data-help-key="speed"]');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  const speedTip=await page.evaluate(readTip);
  check('viewport 960×600: tooltip do primeiro slider cabe inteiro',inViewport(speedTip),JSON.stringify(speedTip.rect));
  await page.hover('.helpBtn[data-help-key="btn-reset"]');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden&&
    document.querySelector('.helpBtn[aria-describedby="helpTip"]').dataset.helpKey==='btn-reset');
  const resetTip=await page.evaluate(readTip);
  check('viewport 960×600: tooltip do fim do painel cabe inteiro',inViewport(resetTip),JSON.stringify(resetTip.rect));
  await page.mouse.move(200,80);
  await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);

  // (c) teclado: foco NÃO abre sozinho (o Tab do drawer não pode ter um
  // tooltip roubando o Esc do contrato do painel — qa-control-state);
  // Enter alterna; Esc com tooltip aberto fecha SÓ o tooltip.
  await page.locator('.helpBtn[data-help-key="burst"]').scrollIntoViewIfNeeded();
  await page.locator('.helpBtn[data-help-key="burst"]').focus();
  await page.waitForTimeout(250);
  const focusIdle=await page.evaluate(()=>document.querySelector('#helpTip').hidden);
  check('teclado: foco sozinho NÃO abre a ajuda (Tab limpo pelo drawer)',focusIdle===true,String(focusIdle));
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  const burstPt=await page.evaluate(readTip);
  check('teclado: Enter abre a ajuda do controle focado',burstPt.describedBy==='burst',burstPt.describedBy);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);
  const afterEsc=await page.evaluate(()=>document.querySelector('#knobBtn').getAttribute('aria-expanded'));
  check('teclado: Esc fecha o tooltip e o drawer PERMANECE aberto',afterEsc==='true',afterEsc);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);
  check('teclado: Enter alterna (abre e fecha) a ajuda',true);

  // (e) PT→EN: conteúdo dos sentinelas e aria-labels trocam.
  const grabTip=async(key)=>{
    await page.hover('.helpBtn[data-help-key="'+key+'"]');
    await page.waitForFunction((k)=>{
      const b=document.querySelector('.helpBtn[aria-describedby="helpTip"]');
      return !document.querySelector('#helpTip').hidden&&b&&b.dataset.helpKey===k;
    },key);
    const t=await page.evaluate(readTip);
    await page.mouse.move(200,80);
    await page.waitForFunction(()=>document.querySelector('#helpTip').hidden);
    return t;
  };
  const ptTips={cycle:cyclePt,burst:burstPt,tier:await grabTip('tier')};
  await page.click('#edu-lang-en');
  await page.waitForFunction(()=>document.querySelector('#knobPanelTitle').textContent==='Settings');
  const enTips={cycle:await grabTip('cycle'),burst:await grabTip('burst'),tier:await grabTip('tier')};
  ['cycle','burst','tier'].forEach((k)=>{
    const pt=ptTips[k],en=enTips[k];
    check('PT→EN: tooltip de "'+k+'" muda de idioma',
      pt.what.length>10&&en.what.length>10&&pt.what!==en.what&&pt.visual!==en.visual&&
      en.visualHead==='what you see',
      JSON.stringify({pt:pt.what.slice(0,24),en:en.what.slice(0,24)}));
  });
  check('PT→EN: nota ☉ dos sentinelas segue o idioma',
    enTips.cycle.edu.indexOf('☉')===0&&enTips.cycle.edu.indexOf('11-year')>0&&enTips.burst.edu.indexOf('one star, one state')>0,
    enTips.cycle.edu.slice(0,40));
  const ariaEn=await page.evaluate(()=>({
    cycle:document.querySelector('.helpBtn[data-help-key="cycle"]').getAttribute('aria-label'),
    tier:document.querySelector('.helpBtn[data-help-key="tier"]').getAttribute('aria-label'),
  }));
  check('PT→EN: aria-labels dos "?" trocam ("explanation: …")',
    ariaEn.cycle==='explanation: Cycle depth'&&ariaEn.tier==='explanation: quality',JSON.stringify(ariaEn));
  await page.close();

  // ————— touch 390×844 (hasTouch) —————
  const touchCtx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:1});
  const tpage=await touchCtx.newPage();
  trackPage(tpage,'touch',errors,helpWarns);
  await boot(tpage);
  await tpage.tap('#knobBtn');
  await tpage.waitForFunction(()=>document.querySelector('#knobBtn').getAttribute('aria-expanded')==='true');
  await tpage.waitForTimeout(700); // drawer termina o slide (transform .55s)

  // (d) long-press ~450 ms via CDP (toque genuíno do Chromium).
  const cdp=await touchCtx.newCDPSession(tpage);
  const box=await tpage.locator('.helpBtn[data-help-key="spots"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await tpage.waitForFunction(()=>!document.querySelector('#helpTip').hidden,null,{timeout:8000});
  const heldOpen=await tpage.evaluate(readTip);
  check('touch: long-press no "?" abre o tooltip',heldOpen.describedBy==='spots',heldOpen.describedBy);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await tpage.waitForTimeout(250);
  const afterRelease=await tpage.evaluate(readTip);
  check('touch: soltar SOBRE o "?" mantém o tooltip aberto',!afterRelease.hidden,JSON.stringify({hidden:afterRelease.hidden}));
  check('viewport 390×844: tooltip do long-press cabe inteiro',inViewport(afterRelease),JSON.stringify(afterRelease.rect));
  await tpage.tap('#knobPanelTitle');
  await tpage.waitForFunction(()=>document.querySelector('#helpTip').hidden);
  check('touch: tocar fora fecha',true);

  // tap simples também abre (bônus documentado) + extremo inferior do scroll.
  await tpage.locator('.helpBtn[data-help-key="btn-reset"]').scrollIntoViewIfNeeded();
  await tpage.waitForTimeout(350); // o scroll-close tem carência de 250 ms pós-abertura
  await tpage.tap('.helpBtn[data-help-key="btn-reset"]');
  await tpage.waitForFunction(()=>!document.querySelector('#helpTip').hidden);
  const tapTip=await tpage.evaluate(readTip);
  check('touch: tap simples no "?" também abre',tapTip.describedBy==='btn-reset',tapTip.describedBy);
  check('viewport 390×844: tooltip do fim do painel cabe inteiro',inViewport(tapTip),JSON.stringify(tapTip.rect));
  await tpage.tap('#knobPanelTitle');
  await tpage.waitForFunction(()=>document.querySelector('#helpTip').hidden);
  await touchCtx.close();

  // (a) zero warnings de completude + console limpo, nas DUAS páginas.
  check('zero console.warn("[help] sem ajuda")',helpWarns.length===0,helpWarns.slice(0,4).join(' | '));
  check('console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();browser=null;
  if(fails){console.log('QA PANEL HELP: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA PANEL HELP: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

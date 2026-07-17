// QA das ações de prévia Burst/CME e do gate acionável do DOF.
const path=require('path');const{chromium}=require('playwright');
const htmlFile=process.argv[2]||'dist-single/index.html';const base='file://'+path.resolve(htmlFile);
let fails=0,browser;function check(n,ok,d){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+n+(d?'  ('+d+')':''));}
(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:1});page.setDefaultTimeout(420000);
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  async function open(q){await page.goto(base+'?det=1&seed=7&hold=100&tier=mid&scale=0.3'+(q?'&'+q:''));await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>5);}

  await open('burst=0&cme=0&dof=1');await page.click('#knobBtn');
  const zero=await page.evaluate(()=>({b:__solInfo.previewAvailability('burst'),c:__solInfo.previewAvailability('cme'),
    bb:document.querySelector('[data-control="burst"] .rowAction').disabled,
    cb:document.querySelector('[data-control="cme"] .rowAction').disabled,
    dof:__solInfo.controls('dof'),di:document.querySelector('#control-dof').disabled,
    da:document.querySelector('[data-control="dof"] .rowAction').hidden}));
  check('previews ficam indisponíveis em intensidade zero',zero.b.reason==='source-empty'&&zero.c.reason==='source-empty'&&zero.bb&&zero.cb);
  check('DOF no fit continua editável e oferece aproximar',zero.dof.reason==='fit-framing'&&!zero.di&&!zero.da);

  await open('burst=1');
  const burstWait=await page.evaluate(()=>({info:__solInfo.controls('burst'),avail:__solInfo.previewAvailability('burst')}));
  check('Burst aguarda flare sem bloquear prévia',burstWait.info.reason==='waiting-flare'&&burstWait.avail.ok&&burstWait.avail.facing>0);
  const burst=await page.evaluate(()=>__solInfo.previewBurst());
  const burstAgain=await page.evaluate(()=>__solInfo.previewBurst());
  const bf=await page.evaluate(()=>__solInfo.frame);await page.waitForFunction((f)=>__solInfo.frame>f+3,bf);
  const flare=await page.evaluate(()=>({flare:__solInfo.flareInfo(),stored:localStorage.length}));
  check('prévia Burst usa flare físico e intensidade nominal',burst.ok&&burst.amp===1&&flare.flare.hdr>0&&flare.flare.burst>0&&flare.stored===0,
    'hdr '+flare.flare.hdr.toFixed(2)+' burst '+flare.flare.burst.toFixed(2));
  check('Burst não reinicia evento já ativo',!burstAgain.ok&&burstAgain.reason==='event-active');

  await open('cme=1');
  const cmeWait=await page.evaluate(()=>({info:__solInfo.controls('cme'),avail:__solInfo.previewAvailability('cme')}));
  check('CME escolhe região visível próxima ao limbo',cmeWait.info.reason==='waiting-flare'&&cmeWait.avail.ok&&cmeWait.avail.facing>0&&cmeWait.avail.thomson>0.9,
    JSON.stringify(cmeWait.avail));
  const first=await page.evaluate(()=>__solInfo.previewCME());
  const second=await page.evaluate(()=>__solInfo.previewCME());
  const cmeInfo=await page.evaluate(()=>__solInfo.cmeInfo());
  check('prévia CME lança caminho físico com nominal',first.ok&&first.amp===1&&cmeInfo.on&&cmeInfo.count===1&&cmeInfo.knob===1);
  check('CME ativo não reinicia',!second.ok&&second.reason==='event-active'&&cmeInfo.count===1);
  await page.evaluate(()=>__solInfo.setCmeClock(18));
  const cf=await page.evaluate(()=>__solInfo.frame);await page.waitForFunction((f)=>__solInfo.frame>f+2,cf);
  const cooldown=await page.evaluate(()=>__solInfo.previewAvailability('cme'));
  check('rescaldo expõe cooldown',!cooldown.ok&&cooldown.reason==='cooldown');

  await open('cme=1');
  const killed=await page.evaluate(()=>{__solInfo.setAutoTuneKill('cme',true);return __solInfo.previewAvailability('cme');});
  check('prévia CME respeita kill-switch',!killed.ok&&killed.reason==='autotune-disabled');
  await open('tier=low&cme=1');
  const low=await page.evaluate(()=>__solInfo.previewAvailability('cme'));
  check('prévia CME respeita tier',!low.ok&&low.reason==='tier-unavailable');

  await open('dof=1');await page.click('#knobBtn');
  const before=await page.evaluate(()=>__solInfo.state());
  await page.click('[data-control="dof"] .rowAction');
  const afterClick=await page.evaluate(()=>__solInfo.state());
  const expectedClose=Math.max(before.minDist*1.12,before.fitDist*0.42);
  check('ação aproximar reutiliza o target de close-up',Math.abs(afterClick.targetCamDist-expectedClose)<1e-8,
    afterClick.targetCamDist.toFixed(3)+' esperado '+expectedClose.toFixed(3));
  // O alvo acima prova que a ação reutilizou toggleFrame. Para testar o gate
  // sem pagar dezenas de frames SwiftShader, o hook de QA assenta a câmera
  // exatamente nesse mesmo alvo e deixa o pipeline processar dois frames.
  const df=await page.evaluate(()=>{const s=__solInfo.state();__solInfo.setView(s.theta,s.phi,s.targetCamDist);return __solInfo.frame;});
  await page.waitForFunction((f)=>__solInfo.frame>f+2,df);
  await page.waitForTimeout(450);
  const close=await page.evaluate(()=>({info:__solInfo.controls('dof'),hidden:document.querySelector('[data-control="dof"] .rowAction').hidden}));
  check('DOF fica efetivo no close-up e ação some',close.info.active&&close.info.effective===1&&close.info.metrics.runtime>0&&!close.info.reason&&close.hidden);

  check('console sem erros',errors.length===0,errors.slice(0,3).join(' | '));await browser.close();
  if(fails){console.log('QA EVENTOS: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA EVENTOS: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

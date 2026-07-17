// QA dos controles temporais separados: profundidade, multiplicador,
// duração, easing e override transitório do diretor.
const path=require('path');
const {chromium}=require('playwright');
const htmlFile=process.argv[2]||'dist-single/index.html';
const base='file://'+path.resolve(htmlFile);
let fails=0,browser;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}

(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:800,height:520},deviceScaleFactor:1});
  page.setDefaultTimeout(420000);
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'?det=1&seed=23&hold=1000&tier=high&scale=1');
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>4);

  const initial=await page.evaluate(()=>({cycle:__solInfo.controls('cycle'),lapse:__solInfo.controls('lapse'),info:__solInfo.cycleInfo()}));
  check('ranges temporais são 0–1',initial.cycle.min===0&&initial.cycle.max===1&&initial.lapse.min===0&&initial.lapse.max===1);
  check('default mantém ciclo inerte',initial.info.depth===0&&initial.info.multiplier===1&&initial.info.time===0&&initial.info.warp===0);

  const natural=await page.evaluate(()=>{__solInfo.setControl('cycle',0.5);__solInfo.setControl('lapse',0);__solInfo.setCyclePhase(0.35);return {f:__solInfo.frame,t:__solInfo.cycleInfo().time};});
  await page.waitForFunction((f)=>__solInfo.frame>f+5,natural.f);
  const naturalEnd=await page.evaluate(()=>({f:__solInfo.frame,info:__solInfo.cycleInfo()}));
  const naturalRate=(naturalEnd.info.time-natural.t)/(naturalEnd.f-natural.f);
  check('cycle controla profundidade e relógio natural fica em 1×',
    naturalEnd.info.depth===0.5&&naturalEnd.info.multiplier===1&&Math.abs(naturalRate-1/60)<1e-5,
    'depth '+naturalEnd.info.depth+' · '+naturalRate.toFixed(5)+'/frame');

  await page.evaluate(()=>{__solInfo.setControl('cycle',0);__solInfo.setControl('lapse',0.05);__solInfo.setCyclePhase(0.35);});
  const first=await page.evaluate(()=>__solInfo.cycleInfo());
  check('menor lapse ativa profundidade completa e fecha em poucos minutos',
    first.depth===1&&first.multiplier>9&&first.multiplier<10&&first.duration>120&&first.duration<240&&first.easing===1,
    first.multiplier.toFixed(2)+'× · '+first.duration.toFixed(1)+'s');

  const combined=await page.evaluate(()=>{
    __solInfo.setControl('lapse',0.4);
    return [0,0.25,0.75,1].map((cycle)=>{
      __solInfo.setControl('cycle',cycle);
      const state=__solInfo.controls('cycle'),info=__solInfo.cycleInfo();
      return {cycle,depth:info.depth,effective:state.effective,reason:state.reason};
    });
  });
  check('cycle positivo conserva autoridade mesmo com lapse ativo',
    combined[0].depth===1&&combined[0].reason==='lapse-fallback'&&
    combined.slice(1).every((x)=>x.depth===x.cycle&&x.effective===x.cycle),JSON.stringify(combined));

  const fastStart=await page.evaluate(()=>{__solInfo.setControl('lapse',1);__solInfo.setCyclePhase(0.35);return {f:__solInfo.frame,t:__solInfo.cycleInfo().time};});
  await page.waitForFunction((f)=>__solInfo.frame>f+5,fastStart.f);
  const fastEnd=await page.evaluate(()=>({f:__solInfo.frame,info:__solInfo.cycleInfo()}));
  const fastRate=(fastEnd.info.time-fastStart.t)/(fastEnd.f-fastStart.f);
  check('lapse máximo chega a 40× e ciclo dura ~45s',
    fastEnd.info.multiplier===40&&Math.abs(fastEnd.info.duration-45)<1e-8&&Math.abs(fastRate-40/60)<1e-4,
    fastEnd.info.multiplier+'× · '+fastEnd.info.duration+'s');

  await page.click('#knobBtn');
  await page.waitForTimeout(450);
  const ui=await page.textContent('#state-lapse');
  check('painel mostra multiplicador e duração estimada',/40×/.test(ui)&&/45 s/.test(ui),ui);
  await page.evaluate(()=>__solInfo.setControl('cycle',0));
  const cycleUi=await page.evaluate(()=>({text:document.querySelector('#state-cycle').textContent,state:__solInfo.controls('cycle')}));
  check('fallback de lapse é explícito no estado efetivo',
    cycleUi.state.reason==='lapse-fallback'&&cycleUi.state.effective===1&&/100%/.test(cycleUi.text),cycleUi.text);

  const beat=await page.evaluate(()=>{
    __solInfo.setControl('lapse',0.2);__solInfo.directorStart();__solInfo.directorSkip(68);
    return __solInfo.frame;
  });
  await page.waitForFunction((f)=>__solInfo.frame>f+2,beat);
  const overridden=await page.evaluate(()=>__solInfo.controls('lapse'));
  check('beat B5 usa override sem alterar nominal',
    overridden.nominal===0.2&&overridden.applied>0.8&&overridden.reason==='director-override');
  const settle=await page.evaluate(()=>{__solInfo.directorSkip(78);return __solInfo.frame;});
  await page.waitForFunction((f)=>__solInfo.frame>f+2,settle);
  const restored=await page.evaluate(()=>__solInfo.controls('lapse'));
  check('saída do beat restaura applied ao nominal',restored.nominal===0.2&&restored.applied===0.2&&!restored.overrideOwner);

  check('console sem erros',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();
  browser=null;
  if(fails){console.log('QA TEMPO: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA TEMPO: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

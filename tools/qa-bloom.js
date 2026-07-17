// QA perceptivo-numérico do Bloom: readback reduzido sob demanda para
// cobertura do bright-pass, energia composta e raio do espalhamento.
const path = require('path');
const { chromium } = require('playwright');
const htmlFile = process.argv[2] || 'dist-single/index.html';
const base = 'file://' + path.resolve(htmlFile);
let fails = 0, browser;
function check(name, ok, detail){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
}

(async () => {
  browser = await chromium.launch({
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport:{ width:640, height:400 }, deviceScaleFactor:1 });
  page.setDefaultTimeout(420000);
  const errors=[];
  page.on('pageerror',(e)=>errors.push(e.message));
  page.on('console',(m)=>{ if(m.type()==='error')errors.push(m.text()); });
  await page.goto(base+'?det=1&seed=17&hold=20&tier=high&scale=1');
  await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>24);

  async function setAndMeasure(key,value,settle=2){
    await page.evaluate(([k,v])=>window.__solInfo.setControl(k,v),[key,value]);
    const f=await page.evaluate(()=>window.__solInfo.frame);
    await page.waitForFunction(([f,n])=>window.__solInfo.frame>f+n,[f,settle]);
    return page.evaluate(()=>window.__solInfo.bloomInfo());
  }

  const defaults=await page.evaluate(()=>({
    info:window.__solInfo.bloomInfo(),
    controls:['bloom','bloomth','bloomknee','bloomspread'].map((k)=>window.__solInfo.controls(k)),
  }));
  check('quatro controles e defaults canônicos expostos',
    defaults.controls[0].min===0&&defaults.controls[0].max===3&&defaults.controls[0].default===1&&
    defaults.controls[1].min===0.2&&defaults.controls[1].max===2&&
    defaults.controls[2].min===0&&defaults.controls[2].max===0.6&&defaults.controls[2].default===0.3&&
    defaults.controls[3].min===0.5&&defaults.controls[3].max===2.5&&defaults.controls[3].default===1);

  const intensity=[];
  for(const v of [0,1,3])intensity.push(await setAndMeasure('bloom',v));
  check('intensidade preserva 1× e ganha autoridade 5× no topo',
    intensity[0].energy===0&&intensity[1].energy>0&&intensity[2].gain===5&&
    intensity[2].energy>intensity[1].energy*4.9,
    intensity.map((x)=>x.energy).join(' → '));

  await setAndMeasure('bloom',1);
  await setAndMeasure('bloomknee',0.3);
  const threshold=[];
  for(const v of [0.2,defaults.controls[1].default,2])threshold.push(await setAndMeasure('bloomth',v));
  check('threshold reduz cobertura e energia do bright-pass',
    threshold[0].coverage>threshold[1].coverage&&threshold[1].coverage>threshold[2].coverage&&
    threshold[0].brightEnergy>threshold[1].brightEnergy&&threshold[2].brightEnergy===0,
    threshold.map((x)=>x.coverage).join(' → '));

  await setAndMeasure('bloomth',0.2);
  const knee=[];
  for(const v of [0,0.3,0.6])knee.push(await setAndMeasure('bloomknee',v));
  check('knee zero é corte duro e a suavização reduz energia progressivamente',
    knee[0].brightEnergy>knee[1].brightEnergy&&knee[1].brightEnergy>knee[2].brightEnergy,
    knee.map((x)=>x.brightEnergy).join(' → '));

  await setAndMeasure('bloomknee',0.3);
  const spread=[];
  for(const v of [0.5,1,2.5])spread.push(await setAndMeasure('bloomspread',v,3));
  check('spread aumenta raio sem alterar a cobertura de entrada',
    spread[2].radius>spread[1].radius&&spread[1].radius>spread[0].radius&&
    spread[0].coverage===spread[1].coverage&&spread[1].coverage===spread[2].coverage,
    spread.map((x)=>x.radius).join(' → '));

  check('métricas são finitas e sob demanda',
    [...intensity,...threshold,...knee,...spread].every((m)=>
      ['coverage','brightEnergy','energy','radius'].every((k)=>Number.isFinite(m[k]))));
  check('console sem erros',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();
  browser=null;
  if(fails){console.log('QA BLOOM: '+fails+' FALHA(S)');process.exitCode=1;}
  else console.log('QA BLOOM: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

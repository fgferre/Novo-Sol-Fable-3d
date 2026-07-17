// QA temporal dos efeitos sutis. Compara sequências determinísticas em
// instantes equivalentes; nenhuma conclusão depende de um frame isolado.
const fs=require('fs');
const path=require('path');
const {PNG}=require('pngjs');
const pixelmatch=require('pixelmatch');
const {chromium}=require('playwright');

const htmlFile=process.argv[2]||'dist-single/index.html';
const outDir=path.resolve(process.argv[3]||'qa-subtle');
const base='file://'+path.resolve(htmlFile);
fs.mkdirSync(outDir,{recursive:true});

let fails=0,browser;
function check(name,ok,detail){
  if(!ok)fails++;
  console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));
}
function diffCount(a,b){
  const pa=PNG.sync.read(a),pb=PNG.sync.read(b);
  if(pa.width!==pb.width||pa.height!==pb.height)return Infinity;
  return pixelmatch(pa.data,pb.data,null,pa.width,pa.height,{threshold:0.08});
}

(async()=>{
  try{
    browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:480,height:320},deviceScaleFactor:1});
    page.setDefaultTimeout(420000);
    const errors=[];
    page.on('pageerror',(e)=>errors.push(e.message));
    page.on('console',(m)=>{if(m.type()==='error')errors.push(m.text());});

    async function open(extra){
      await page.goto(base+'?det=1&seed=29&tier=low&scale=0.25&hold=72&'+extra);
      await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>5);
      await page.evaluate(()=>{
        ['sim','bake','bloom','spicules','corona','prominences','stars','loops'].forEach((k)=>__solInfo.toggle(k,false));
      });
    }
    async function shotAt(frame,name){
      await page.waitForFunction((f)=>__solInfo.frame>=f,frame);
      const buf=await page.screenshot();
      fs.writeFileSync(path.join(outDir,name+'.png'),buf);
      return buf;
    }

    await open('grain=0&pmode=0&hand=0');
    const grain=await page.evaluate(()=>{
      const vals=[0,0.25,1,4];
      return vals.map((v)=>{__solInfo.setControl('grain',v);return __solInfo.controls('grain');});
    });
    check('grão usa sqrt abaixo de 1',grain[1].nominal===0.25&&grain[1].metrics.runtime===0.5&&grain[1].metrics.gain===0.5);
    check('grão preserva default e fica linear acima de 1',grain[2].metrics.runtime===1&&grain[3].metrics.runtime===4);
    check('grão expõe amplitude aproximada em 8-bit',grain[0].metrics.amplitude8bit===0&&grain[2].metrics.amplitude8bit===0.8&&grain[3].metrics.amplitude8bit===3.2);
    await page.click('#knobBtn');
    const grainUi=await page.textContent('#state-grain');
    const handLabel=await page.textContent('[data-control="hand"] .lab span');
    check('UI mostra amplitude do grão',/3,2 níveis/.test(grainUi),grainUi);
    check('câmera usa o novo nome',handLabel.trim()==='Micro-movimento de câmera',handLabel.trim());

    const pmode=await page.evaluate(()=>{
      __solInfo.setControl('pmode',1);const on=__solInfo.controls('pmode');
      __solInfo.setControl('pmode',0);const off=__solInfo.controls('pmode');
      return {on,off};
    });
    check('p-mode dobra limites de deslocamento e brilho',
      Math.abs(pmode.on.metrics.displacementLimit-0.0088)<1e-12&&Math.abs(pmode.on.metrics.brightnessLimit-0.11)<1e-12);
    check('p-mode zero permanece no-op',pmode.off.metrics.runtime===0&&pmode.off.metrics.displacementLimit===0&&pmode.off.metrics.brightnessLimit===0);

    const frames=[18,36,54],offShots=[];
    await open('grain=0&pmode=0&hand=0');
    for(const f of frames)offShots.push(await shotAt(f,'subtle-off-'+f));

    await open('grain=0&pmode=1&hand=1');
    const onShots=[],samples=[];
    for(const f of frames){
      await page.waitForFunction((target)=>__solInfo.frame>=target,f);
      samples.push(await page.evaluate(()=>({state:__solInfo.state(),hand:__solInfo.controls('hand'),pmode:__solInfo.controls('pmode')})));
      onShots.push(await shotAt(f,'subtle-on-'+f));
    }
    const matched=onShots.map((buf,i)=>diffCount(offShots[i],buf));
    check('sequência p-mode/micro-movimento altera todos os instantes equivalentes',matched.every((n)=>n>100),matched.join(', ')+' px');
    check('métricas temporais variam ao longo da sequência',
      new Set(samples.map((s)=>s.hand.metrics.thetaOffset.toFixed(8)+':'+s.hand.metrics.phiOffset.toFixed(8))).size===samples.length);
    check('micro-movimento não altera theta/phi reais',
      samples.every((s)=>s.state.theta===samples[0].state.theta&&s.state.phi===samples[0].state.phi));
    check('offsets respeitam os limites declarados',samples.every((s)=>
      Math.abs(s.hand.metrics.thetaOffset)<=s.hand.metrics.maxTheta+1e-12&&
      Math.abs(s.hand.metrics.phiOffset)<=s.hand.metrics.maxPhi+1e-12));
    check('console sem erros',errors.length===0,errors.slice(0,3).join(' | '));
  } finally {
    if(browser)await browser.close();
  }
  if(fails){console.log('QA EFEITOS SUTIS: '+fails+' FALHA(S)');process.exitCode=1;}
  else console.log('QA EFEITOS SUTIS: tudo verde');
})().catch((e)=>{console.error(e);process.exitCode=2;});

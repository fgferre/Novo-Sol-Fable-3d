// Gate focado para contratos visuais/responsivos que não aparecem em lint:
//  - round-trip de orientação preserva o zoom lógico mesmo sob clamp;
//  - drawer mobile mantém painel/botão dentro do viewport e silencia o chrome;
//  - uma região magnética só muda de lugar com carga exatamente zero.
// Uso: node tools/qa-visual-integrity.js [dist-single/index.html] [outDir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const htmlFile = process.argv[2] || 'dist-single/index.html';
const outDir = process.argv[3] || 'out/visual-integrity';
const base = 'file://' + path.resolve(htmlFile);
let fails = 0;

function check(name, ok, info){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info === undefined ? '' : '  (' + info + ')'));
}
function closeTo(a, b, eps){ return Math.abs(a-b) <= eps; }
function dirDistance(a, b){
  const dx=a[0]-b[0],dy=a[1]-b[1],dz=a[2]-b[2];
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

(async () => {
  fs.mkdirSync(outDir, { recursive:true });
  const errors = [];
  const browser = await chromium.launch({
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  try {
    // Layout final determinístico: além de validar a preferência de
    // acessibilidade, evita que o render SwiftShader atrase o relógio das
    // transições CSS por dezenas de segundos.
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror',(e)=>errors.push('pageerror: '+e.message));
    page.on('console',(m)=>{if(m.type()==='error')errors.push('console: '+m.text());});
    await page.goto(base+'?det=1&seed=7&hold=20&tier=low&scale=.25');
    await page.waitForFunction(()=>window.__solInfo&&window.__solInfo.frame>8);

    async function frames(n){
      const f=await page.evaluate(()=>window.__solInfo.frame);
      await page.waitForFunction((goal)=>window.__solInfo.frame>goal,f+n);
    }
    async function resize(width,height){
      await page.setViewportSize({width,height});
      await page.waitForFunction(([w,h])=>{
        const r=window.__solInfo.resizeInfo();return r.cssW===w&&r.cssH===h;
      },[width,height]);
    }

    // Uma razão 0.34 cabe em portrait, mas cai abaixo de minDist em landscape.
    await page.evaluate(()=>{const s=window.__solInfo.state();window.__solInfo.setView(s.theta,s.phi,s.fitDist*.34);});
    await frames(2);
    const portraitBefore=await page.evaluate(()=>window.__solInfo.state());
    await resize(844,390);
    const landscape=await page.evaluate(()=>window.__solInfo.state());
    await resize(390,844);
    const portraitAfter=await page.evaluate(()=>window.__solInfo.state());
    check('orientação: landscape aplica o limite físico mínimo',
      closeTo(landscape.camDist,landscape.minDist,1e-6)&&closeTo(landscape.targetCamDist,landscape.minDist,1e-6),
      JSON.stringify({cam:+landscape.camDist.toFixed(4),min:+landscape.minDist.toFixed(4)}));
    check('orientação: round-trip restaura o zoom lógico do usuário',
      closeTo(portraitAfter.camDist,portraitBefore.camDist,1e-6)&&closeTo(portraitAfter.targetCamDist,portraitBefore.targetCamDist,1e-6),
      JSON.stringify({antes:+portraitBefore.camDist.toFixed(4),depois:+portraitAfter.camDist.toFixed(4)}));

    await resize(360,800);
    await page.click('#knobBtn');
    await page.evaluate(()=>document.querySelector('#knobPanel').getBoundingClientRect().x);
    const mobile=await page.evaluate(()=>{
      const rect=(s)=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,right:r.right,width:r.width};};
      return {viewport:innerWidth,panel:rect('#knobPanel'),gear:rect('#knobBtn'),
        titleOpacity:+getComputedStyle(document.querySelector('#title-block')).opacity,
        hintOpacity:+getComputedStyle(document.querySelector('#hint')).opacity,
        rootOpen:document.documentElement.classList.contains('knob-panel-open')};
    });
    await page.screenshot({path:path.join(outDir,'mobile-panel.png')});
    check('drawer mobile: painel e botão de fechar permanecem no viewport',
      mobile.panel.x>=0&&mobile.panel.right<=mobile.viewport+.5&&mobile.gear.x>=0&&mobile.gear.right<=mobile.viewport+.5,
      JSON.stringify(mobile));
    check('drawer mobile: título e dica não vazam sob o vidro',
      mobile.rootOpen&&mobile.titleOpacity===0&&mobile.hintOpacity===0,
      JSON.stringify({title:mobile.titleOpacity,hint:mobile.hintOpacity}));
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.querySelector('#knobPanel').getBoundingClientRect().x);
    const closed=await page.evaluate(()=>({title:+getComputedStyle(document.querySelector('#title-block')).opacity,
      hint:+getComputedStyle(document.querySelector('#hint')).opacity,focus:document.activeElement.id,
      rootOpen:document.documentElement.classList.contains('knob-panel-open')}));
    check('drawer mobile: fechar restaura chrome e foco',
      closed.title===1&&closed.hint===.5&&closed.focus==='knobBtn'&&!closed.rootOpen,JSON.stringify(closed));

    // No frame anterior ao renascimento o envelope já está praticamente zero;
    // no frame que troca a posição, a carga deve ser zero exato.
    await page.evaluate(()=>window.__solInfo.setRegionLife(0,.899));
    await frames(2);
    const dying=await page.evaluate(()=>window.__solInfo.regionLife()[0]);
    await page.evaluate(()=>window.__solInfo.setRegionLife(0,.905));
    await frames(2);
    const reborn=await page.evaluate(()=>window.__solInfo.regionLife()[0]);
    const moved=dirDistance(dying.dir,reborn.dir);
    check('região magnética: relocação ocorre com carga zero',
      reborn.generation===dying.generation+1&&Math.abs(reborn.w)<=1e-12&&moved>.05,
      JSON.stringify({geracao:[dying.generation,reborn.generation],w:reborn.w,mov:+moved.toFixed(4)}));
    check('região magnética: morte aproxima força continuamente de zero',
      Math.abs(dying.w/dying.baseQ)<.001,
      JSON.stringify({x:+dying.x.toFixed(4),ratio:+Math.abs(dying.w/dying.baseQ).toExponential(2)}));

    await context.close();
  } finally {
    await browser.close();
  }
  if (errors.length){ errors.forEach((e)=>console.log(e)); fails+=errors.length; }
  console.log(fails ? 'QA VISUAL INTEGRITY: '+fails+' FALHA(S)' : 'QA VISUAL INTEGRITY: tudo verde');
  process.exitCode=fails?1:0;
})().catch((e)=>{console.error(e);process.exit(1);});

// PR-11 · i18n completo do painel: trocar PT↔EN pelo seletor PÚBLICO varre o
// painel INTEIRO — título, subtítulo, seções, labels dos sliders, botões de
// ação, switches, mensagens de estado por reason-code, tooltips e aria — sem
// deixar string residual do idioma anterior.
//
// Método: walk de TODOS os nós de texto de #knobPanel e #knobBtn (INCLUSIVE
// ocultos — um botão escondido com texto no idioma errado reapareceria
// errado) + aria-label + title de cada elemento. Sentinelas em PARES PT↔EN
// provam (a) presença no idioma corrente, (b) ausência do idioma anterior,
// (c) reversibilidade ao voltar a PT. Pares escolhidos sem colisão de
// substring cruzada (ex.: 'coroa' não ocorre em 'corona'; o par
// coroa↔corona é skipAbsence porque 'corona' ocorre em 'Loops coronais').
// As arias 'usar português'/'use English' ficam DELIBERADAMENTE cada uma na
// própria língua (rótulo do idioma-alvo) e não entram nas sentinelas.
const path=require('path');
const{chromium}=require('playwright');
const htmlFile=process.argv[2]||'dist-single/index.html';
const base='file://'+path.resolve(htmlFile);
let browser,fails=0;
function check(name,ok,detail){if(!ok)fails++;console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  ('+detail+')':''));}

// [pt, en, opções] — enSkipAbsence: o lado EN não entra no check de ausência
// em PT (colisão de substring legítima).
const SENTINELS=[
  ['Ajustes','Settings'],
  ['ajustes','settings'],
  ['cena, luz e câmera','scene, light & camera'],
  ['Descobertas educativas','Educational discoveries'],
  ['começar visita guiada','start guided visit'],
  ['Idioma da experiência educativa','Language of the educational experience'],
  ['Ritmo do tempo','Time flow'],
  ['Oscilações (p-modes)','Oscillations (p-modes)'],
  ['Profundidade do ciclo','Cycle depth'],
  ['Velocidade do ciclo','Cycle speed'],
  ['Manchas solares (grupos)','Sunspots (groups)'],
  ['luz & cor','light & color'],
  ['Grão de filme','Film grain'],
  ['máximo solar','solar maximum'],
  ['mínimo solar','solar minimum'],
  ['disparar flare','trigger flare'],
  ['ejetar CME','launch CME'],
  ['aproximar','move closer'],
  ['reativar','reactivate'],
  ['indisponível nesta qualidade','unavailable at this quality'],
  ['coroa','corona',{enSkipAbsence:true}],
  ['céu','sky'],
  ['Respiração contemplativa','Contemplative drift'],
  ['aplicar look Sunshine','apply Sunshine look'],
  ['modo diretor (sequência)','director mode (sequence)'],
  ['diagnóstico','diagnostics'],
  ['HUD de FPS','FPS HUD'],
  ['qualidade','quality'],
  ['trocar a qualidade recarrega a cena','changing quality reloads the scene'],
  ['restaurar padrão','restore defaults'],
  ['fechar ajustes','close settings'],
  ['coleção','collection'],
  ['Ainda não observada','Not observed yet'],
  ['Limpar descobertas observadas','Clear observed discoveries'],
  // PR-12: postal na seção experiência.
  ['Guardar esta vista','Save this view'],
];
function present(capture,needle){return capture.some((s)=>s.indexOf(needle)>=0);}
function missing(capture,side){
  return SENTINELS.filter((p)=>!present(capture,p[side==='pt'?0:1])).map((p)=>p[side==='pt'?0:1]);
}
function residual(capture,side){
  const out=[];
  SENTINELS.forEach((p)=>{
    if(side==='en'&&p[2]&&p[2].enSkipAbsence)return;
    const needle=p[side==='pt'?0:1];
    capture.forEach((s)=>{if(s.indexOf(needle)>=0)out.push(needle+' ⇐ "'+s.slice(0,60)+'"');});
  });
  return out;
}

(async()=>{
  browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];
  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  page.setDefaultTimeout(240000);
  page.on('pageerror',(e)=>errors.push('[i18n] '+e.message));
  page.on('console',(m)=>{if(m.type()==='error')errors.push('[i18n] '+m.text());});
  // tier=low: painel completo (o schema é estático) + reason-codes de tier
  // ('indisponível nesta qualidade' em cme/cvol) de graça para a prova das
  // mensagens de estado; scale só barateia o SwiftShader.
  await page.goto(base+'?edu=1&lang=pt&tier=low&scale=0.25&speed=0.05&cycle=0&intro=0');
  await page.waitForFunction(()=>window.__solInfo&&document.querySelector('#knobBtn')&&document.querySelector('#edu-lang-en'));
  await page.click('#knobBtn');
  await page.waitForFunction(()=>document.querySelector('#knobBtn').getAttribute('aria-expanded')==='true');
  await page.click('#eduCollectionToggle');
  await page.waitForFunction(()=>document.querySelector('#eduCollectionToggle').getAttribute('aria-expanded')==='true');

  const collect=()=>page.evaluate(()=>{
    const out=new Set();
    const push=(s)=>{if(s){s=String(s).replace(/\s+/g,' ').trim();if(s)out.add(s);}};
    ['#knobPanel','#knobBtn'].forEach((sel)=>{
      const root=document.querySelector(sel);
      if(!root)return;
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let node;while((node=walker.nextNode()))push(node.nodeValue);
      [root].concat(Array.from(root.querySelectorAll('*'))).forEach((el)=>{
        push(el.getAttribute&&el.getAttribute('aria-label'));
        push(el.title);
      });
    });
    return Array.from(out);
  });

  // ————— PT de partida —————
  const pt1=await collect();
  const pt1Missing=missing(pt1,'pt');
  check('PT: todas as sentinelas visíveis no painel aberto',pt1Missing.length===0,pt1Missing.slice(0,6).join(' | '));
  const pt1Residual=residual(pt1,'en');
  check('PT: nenhuma sentinela EN presente',pt1Residual.length===0,pt1Residual.slice(0,4).join(' | '));
  const stateCmePt=await page.evaluate(()=>document.querySelector('#state-cme').textContent);
  check('PT: reason-code tier-unavailable renderiza em português',stateCmePt==='indisponível nesta qualidade',stateCmePt);

  // ————— troca AO VIVO para EN pelo botão público —————
  await page.click('#edu-lang-en');
  await page.waitForFunction(()=>document.querySelector('#knobPanelTitle').textContent==='Settings');
  const en=await collect();
  const enResidual=residual(en,'pt');
  check('EN: nenhuma string PT residual da lista de sentinelas',enResidual.length===0,enResidual.slice(0,4).join(' | '));
  const enMissing=missing(en,'en');
  check('EN: todas as sentinelas EN presentes',enMissing.length===0,enMissing.slice(0,6).join(' | '));
  const enMeta=await page.evaluate(()=>({
    doc:document.documentElement.lang,
    panel:document.querySelector('#knobPanel').getAttribute('lang'),
    gearAria:document.querySelector('#knobBtn').getAttribute('aria-label'),
    stateCme:document.querySelector('#state-cme').textContent,
  }));
  check('EN: lang do documento e do painel acompanham a troca',
    enMeta.doc==='en'&&enMeta.panel==='en',JSON.stringify(enMeta));
  check('EN: gear e mensagem de estado dinâmica trocam juntos',
    enMeta.gearAria==='close settings'&&enMeta.stateCme==='unavailable at this quality',JSON.stringify(enMeta));
  // confirm() do reset também troca (string fora do DOM — só via diálogo)
  const dialogPromise=new Promise((resolve)=>page.once('dialog',async(d)=>{
    const message=d.message();await d.dismiss();resolve(message);
  }));
  const [dialogMessage]=await Promise.all([dialogPromise,page.click('#knobReset')]);
  check('EN: diálogo de reset usa a string inglesa',
    dialogMessage==='Restore the whole session and reload the scene?',dialogMessage);

  // ————— volta a PT: reversível, sem resíduo EN —————
  await page.click('#edu-lang-pt');
  await page.waitForFunction(()=>document.querySelector('#knobPanelTitle').textContent==='Ajustes');
  const pt2=await collect();
  const pt2Missing=missing(pt2,'pt');
  check('PT de volta: todas as sentinelas restauradas',pt2Missing.length===0,pt2Missing.slice(0,6).join(' | '));
  const pt2Residual=residual(pt2,'en');
  check('PT de volta: nenhuma sentinela EN residual',pt2Residual.length===0,pt2Residual.slice(0,4).join(' | '));
  const backMeta=await page.evaluate(()=>({doc:document.documentElement.lang,panel:document.querySelector('#knobPanel').getAttribute('lang')}));
  check('PT de volta: lang do documento e do painel restaurados',
    backMeta.doc==='pt-BR'&&backMeta.panel==='pt-BR',JSON.stringify(backMeta));
  await page.close();

  // ————— chegada JÁ em EN: primeiro render (inclusive #loading) —————
  // O texto estático do index.html segue PT como fallback no-JS; main.js o
  // troca para o idioma resolvido antes do boot pesado.
  const enPage=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  enPage.setDefaultTimeout(240000);
  enPage.on('pageerror',(e)=>errors.push('[i18n-en] '+e.message));
  enPage.on('console',(m)=>{if(m.type()==='error')errors.push('[i18n-en] '+m.text());});
  await enPage.goto(base+'?edu=1&lang=en&tier=low&scale=0.25&speed=0.05&cycle=0&intro=0');
  await enPage.waitForFunction(()=>window.__solInfo&&document.querySelector('#knobBtn'));
  const enArrival=await enPage.evaluate(()=>({
    loading:document.querySelector('#loading').textContent,
    title:document.querySelector('#knobPanelTitle').textContent,
    gearTitle:document.querySelector('#knobBtn').title,
    gearAria:document.querySelector('#knobBtn').getAttribute('aria-label'),
  }));
  check('chegada em EN: #loading e painel nascem em inglês',
    enArrival.loading==='initializing simulation…'&&enArrival.title==='Settings'&&
    enArrival.gearTitle==='settings'&&enArrival.gearAria==='open settings',JSON.stringify(enArrival));
  await enPage.close();

  check('console permanece limpo',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close();browser=null;
  if(fails){console.log('QA PANEL I18N: '+fails+' FALHA(S)');process.exitCode=1;}else console.log('QA PANEL I18N: tudo verde');
})().catch(async(e)=>{console.error(e);if(browser)await browser.close();process.exitCode=2;});

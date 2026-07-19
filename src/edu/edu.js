// Primeira fatia da experiência educativa: um flare real ganha um hotspot
// Three.js e uma explicação editorial estacionada na margem. A fábrica sai
// antes de qualquer DOM/GPU sob ?det=1.

import * as THREE from 'three';
import { EDU_CONTENT } from './content.js';

export function createEdu(ctx){
  if (ctx.DET) return;

  var ui = document.getElementById('ui') || document.body;
  var title = document.querySelector('#title-block h1');
  var subtitle = document.querySelector('#title-block p');
  var hint = document.getElementById('hint');

  var style = document.createElement('style');
  style.id = 'eduStyle';
  style.textContent = [
    '#edu{position:fixed;inset:0;z-index:20;pointer-events:none;color:#fff2df;font-family:inherit;overflow:hidden}',
    '#edu[hidden]{display:none}',
    '#edu .edu-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '#edu .edu-line{stroke:rgba(255,190,125,.78);stroke-width:1;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px rgba(255,135,45,.55));transition:opacity .22s ease}',
    '#edu .edu-label{position:absolute;left:0;top:0;width:min(310px,calc(100vw - 40px));padding:13px 18px 14px 17px;',
    ' background:linear-gradient(90deg,rgba(7,9,15,.92),rgba(7,9,15,.76));',
    ' border-left:1px solid rgba(255,179,103,.72);text-shadow:0 1px 5px rgba(0,0,0,.9);',
    ' opacity:0;transform:translate3d(-30vw,-30vh,0);transition:opacity .32s ease,transform .52s cubic-bezier(.22,1,.36,1);will-change:transform,opacity}',
    '#edu .edu-label.visible{opacity:1}',
    '#edu .edu-label.global{border-left:0;border-top:1px solid rgba(255,179,103,.72);',
    ' background:linear-gradient(90deg,rgba(7,9,15,.94),rgba(7,9,15,.80))}',
    '#edu .edu-headline{font-size:11px;line-height:1.25;font-weight:700;letter-spacing:.16em;color:#ffbf7d}',
    '#edu .edu-term{margin-top:5px;font-size:22px;line-height:1.05;font-weight:540;letter-spacing:-.015em;color:#fff6e9}',
    '#edu .edu-body{margin-top:8px;max-width:28em;font-size:14px;line-height:1.5;color:rgba(255,242,225,.92)}',
    '#edu .edu-intro{position:absolute;left:50%;bottom:max(68px,calc(env(safe-area-inset-bottom) + 56px));max-width:calc(100vw - 60px);transform:translate3d(-50%,8px,0);',
    ' font-size:13px;letter-spacing:.035em;color:rgba(255,239,218,.82);text-align:center;text-shadow:0 2px 10px #000;',
    ' opacity:0;transition:opacity .55s ease,transform .7s cubic-bezier(.22,1,.36,1)}',
    '#edu .edu-intro.visible{opacity:1;transform:translate3d(-50%,0,0)}',
    '#edu .edu-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;',
    ' overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
    // Telefone deitado (largo mas baixo) também usa o layout mobile.
    '@media(max-width:719px),(max-height:499px){#edu .edu-label{width:calc(100vw - 40px);padding:12px 15px 13px}',
    '#edu .edu-term{font-size:19px}#edu .edu-body{font-size:13px;line-height:1.48}',
    '#edu .edu-intro{bottom:max(108px,calc(env(safe-area-inset-bottom) + 96px));font-size:12px}}',
    '@media(prefers-reduced-motion:reduce){#edu .edu-label,#edu .edu-intro{transition:opacity .15s linear!important}',
    '#edu .edu-line{transition:opacity .15s linear!important}}'
  ].join('');
  document.head.appendChild(style);

  var root = document.createElement('section');
  root.id = 'edu';
  root.hidden = true;
  root.setAttribute('aria-label','Descobertas sobre o Sol');

  var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','edu-lines');
  svg.setAttribute('aria-hidden','true');
  var line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('class','edu-line');
  line.style.opacity = '0';
  svg.appendChild(line);

  var label = document.createElement('article');
  label.className = 'edu-label';
  label.setAttribute('aria-hidden','true');
  var headline = document.createElement('div'); headline.className = 'edu-headline';
  var term = document.createElement('div'); term.className = 'edu-term';
  var body = document.createElement('div'); body.className = 'edu-body';
  label.appendChild(headline); label.appendChild(term); label.appendChild(body);

  var intro = document.createElement('div'); intro.className = 'edu-intro'; intro.setAttribute('aria-hidden','true');
  var live = document.createElement('div'); live.className = 'edu-sr';
  live.setAttribute('role','status'); live.setAttribute('aria-live','polite'); live.setAttribute('aria-atomic','true');
  root.appendChild(svg); root.appendChild(label); root.appendChild(intro); root.appendChild(live);
  ui.appendChild(root);

  // Hotspot GPU: sprite aditivo com profundidade, ancorado no mesmo ponto
  // object-space do flare. O DOM apenas explica; o destaque pertence à cena.
  var haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  var h2 = haloCanvas.getContext('2d');
  var grad = h2.createRadialGradient(64,64,25,64,64,62);
  grad.addColorStop(0,'rgba(255,214,155,0)');
  grad.addColorStop(.46,'rgba(255,196,112,.12)');
  grad.addColorStop(.62,'rgba(255,174,80,.95)');
  grad.addColorStop(.69,'rgba(255,128,38,.20)');
  grad.addColorStop(1,'rgba(255,100,20,0)');
  h2.fillStyle = grad; h2.fillRect(0,0,128,128);
  var haloTexture = new THREE.CanvasTexture(haloCanvas);
  var haloMaterial = new THREE.SpriteMaterial({map:haloTexture,color:0xffc080,transparent:true,
    opacity:0,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});
  var halo = new THREE.Sprite(haloMaterial);
  halo.visible = false; halo.renderOrder = 8;
  ctx.sunMesh.add(halo);

  // O motor começa com uma narrativa por vez: uma CME pode substituir o
  // flare que a originou, sem empilhar caixas sobre a estrela. A mesma
  // estrutura será usada pelas próximas famílias (proeminências e manchas).
  var eventDir = new THREE.Vector3(0,0,1);
  var worldDir = new THREE.Vector3();
  var worldPos = new THREE.Vector3();
  var projected = new THREE.Vector3();
  var sunProjected = new THREE.Vector3();
  var camDir = new THREE.Vector3();
  var active = false, visible = false, inFront = false, eventType = 'flare', eventGlobal = false;
  var eventSourceId = -1, eventSourceGeneration = -1, eventContentKey = 'flare';
  var recordedDiscoveryKey = '';
  var age = 0, introAge = 0, sinceEvent = 99;
  var anchorX = 0, anchorY = 0, labelX = 0, labelY = 0;
  var labelW = 300, labelH = 108, side = 'right', layoutDirty = true;
  var anchorDistance = ctx.SUN_RADIUS * 1.018;
  var diskX = 0, diskY = 0, diskRadius = 0, connectorVisible = false;
  var lineEndX = 0, lineEndY = 0;
  var pendingCme = false, pendingCmeAge = 0, pendingCmeSalience = 1;
  var pendingCmeDir = new THREE.Vector3(0,0,1);
  var pendingProm = false, pendingPromAge = 0, pendingPromSalience = 1;
  var pendingPromDir = new THREE.Vector3(0,0,1);
  var pendingPromSourceId = -1, pendingPromGeneration = -1;
  var lang = ctx.eduLang === 'en' ? 'en' : 'pt';
  var enabled = ctx.EDU_K > 0.5;
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reducedMotion = !!(reduceQuery && reduceQuery.matches);

  function copy(){ return EDU_CONTENT[lang] || EDU_CONTENT.pt; }
  function contentKeyFor(type,sourceId){
    if (type !== 'prominence') return type;
    var mode = ctx.promEduModes ? ctx.promEduModes[sourceId] : 1;
    return mode === 3 ? 'prominenceFilament' : mode === 2 ? 'filament' : 'prominence';
  }
  function eventCopy(){ return copy()[eventContentKey] || copy().flare; }
  function rememberCurrentDiscovery(){
    // A coleção recebe apenas uma descoberta que já venceu a geometria e a
    // leitura visual. O marcador local evita trabalho por frame; o store
    // também é idempotente entre visitas e entre fontes equivalentes.
    var key = eventType + '|' + eventContentKey;
    if (recordedDiscoveryKey === key) return;
    recordedDiscoveryKey = key;
    if (ctx.recordEduDiscovery) ctx.recordEduDiscovery(eventType,eventContentKey);
  }
  // PR-8: a coroa também é GLOBAL (envolve o disco inteiro — sem âncora nem
  // halo, como máximo/mínimo), mas com prioridade 55: ela nunca rouba a
  // leitura de um fenômeno localizado; espera o palco vazio.
  // PR-9: granulação e espículas são GLOBAIS por decisão consciente — a
  // granulação está em toda a superfície e as espículas são a franja INTEIRA
  // do limbo; ancorar uma célula/jato específico seria apontar algo que o
  // shader não individualiza (mentira de museu). Prioridades 58/57: abaixo
  // de loops (60), acima só da coroa — recompensas de aproximação nunca
  // roubam a leitura de um evento localizado.
  // PR-10: o buraco coronal é LOCAL (halo + linha) — a região unipolar tem
  // direção real publicada pelo bake; a âncora vive a 1.35R, DENTRO da coroa
  // volumétrica (o buraco é uma janela na coroa, não um ponto da superfície).
  // Prioridade 56: entre espículas (57) e coroa (55) — nunca rouba a leitura
  // de um evento localizado de plasma.
  // PR-12: a conclusão da coleção é GLOBAL (fala do Sol inteiro, não de um
  // ponto) e tem prioridade 110 — acima de tudo, inclusive da CME: acontece
  // uma vez na vida do aparelho e nunca é interrompida depois de aberta.
  function isGlobal(type){ return type === 'cycleMaximum' || type === 'cycleMinimum' || type === 'corona' || type === 'granulation' || type === 'spicules' || type === 'collectionComplete'; }
  function eventPriority(type){ return type === 'collectionComplete' ? 110 : type === 'cme' ? 100 : type === 'flare' ? 90 : type === 'prominence' ? 70 : type === 'granulation' ? 58 : type === 'spicules' ? 57 : type === 'coronalHole' ? 56 : type === 'corona' ? 55 : isGlobal(type) ? 65 : 60; }
  function syncChrome(){
    // Marca única "SOL — uma estrela viva": ligar/desligar descobertas não
    // rebrandiza a página; só o idioma muda o chrome.
    var c = copy();
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    if (title) title.textContent = '☉ ' + c.brand;
    if (subtitle) subtitle.textContent = c.brandTag;
    if (hint) hint.textContent = ctx.hasTouch ? c.touchHint : c.desktopHint;
  }
  function renderEvent(){
    var eventText = eventCopy();
    headline.textContent = eventText.headline;
    term.textContent = eventText.term;
    body.textContent = eventText.body;
  }
  function syncEventContent(){
    var next = contentKeyFor(eventType,eventSourceId);
    if (next === eventContentKey) return false;
    eventContentKey = next;
    renderEvent();
    layoutDirty = true;
    if (active){
      var text = eventCopy();
      live.textContent = text.term + '. ' + text.body;
    }
    return true;
  }
  function renderLanguage(){
    var c = copy();
    renderEvent();
    intro.textContent = c.intro;
    root.setAttribute('lang',lang === 'en' ? 'en' : 'pt-BR');
    root.setAttribute('aria-label',lang === 'en' ? 'Discoveries about the Sun' : 'Descobertas sobre o Sol');
    layoutDirty = true;
    syncChrome();
  }
  function setLanguage(next){
    if (next !== 'pt' && next !== 'en') return false;
    lang = next; ctx.eduLang = next;
    // PR-13: quiosque não persiste idioma — a instalação fixa via ?lang=.
    if (!ctx.KIOSK){
      try { ctx.savedKnobs.lang = next; localStorage.setItem('solKnobs',JSON.stringify(ctx.savedKnobs)); } catch(e){}
    }
    renderLanguage();
    if (active){
      var activeText = eventCopy();
      live.textContent = activeText.term + '. ' + activeText.body;
    }
    if (ctx.onEduLanguageChange) ctx.onEduLanguageChange(lang);
    if (ctx.onEduTourLanguageChange) ctx.onEduTourLanguageChange(lang);
    return lang;
  }

  function setEnabled(on){
    enabled = !!on;
    root.hidden = !enabled;
    if (enabled){ introAge = 0; intro.classList.add('visible'); }
    else {
      intro.classList.remove('visible'); label.classList.remove('visible'); line.style.opacity='0';
      halo.visible = false; visible = false; active = false; eventGlobal = false; inFront = false; connectorVisible = false;
      label.classList.remove('global'); pendingCme = false; pendingProm = false; live.textContent = '';
    }
    syncChrome();
  }

  function measure(){
    labelW = label.offsetWidth || Math.min(310,window.innerWidth-40);
    labelH = label.offsetHeight || 108;
    layoutDirty = false;
  }

  function projectAnchor(){
    // updateCamera() acabou de alterar a pose; project() precisa das matrizes
    // desta mesma pose, não das que o renderer publicou no frame anterior.
    ctx.camera.updateMatrixWorld(true);
    ctx.camera.matrixWorldInverse.copy(ctx.camera.matrixWorld).invert();
    worldDir.copy(eventDir).applyQuaternion(ctx.sunMesh.quaternion).normalize();
    camDir.copy(ctx.camera.position).normalize();
    var facing = worldDir.dot(camDir);
    // Para um ponto na superfície visto de distância finita, o horizonte é
    // R/D (não zero). Isso impede uma linha apontando através da estrela.
    var horizon = ctx.SUN_RADIUS / Math.max(ctx.camera.position.length(),ctx.SUN_RADIUS*1.001);
    // CME não é um ponto preso à superfície: acompanha a frente física
    // da ejeção. Ela só ganha narrativa quando já saiu visualmente do
    // disco, evitando sugerir uma nuvem que ainda não pode ser vista.
    var cmeGeom = null, promMode = 0, promOutside = false;
    if (eventType === 'cme' && ctx.cmeGeomAt && ctx.cmeT < 900){
      cmeGeom = ctx.cmeGeomAt(ctx.cmeT);
      anchorDistance = ctx.SUN_RADIUS * Math.max(1.045,cmeGeom.cx + cmeGeom.rho*.55);
    } else if (eventType === 'prominence') {
      promMode = ctx.promEduModes ? ctx.promEduModes[eventSourceId] : 1;
      var promHeight = ctx.promEduHeights ? ctx.promEduHeights[eventSourceId] : 0;
      promOutside = promMode !== 2;
      anchorDistance = promOutside
        ? ctx.SUN_RADIUS + Math.max(ctx.SUN_RADIUS*.035,promHeight || ctx.SUN_RADIUS*.10)
        : ctx.SUN_RADIUS * 1.006;
    } else if (eventType === 'coronalHole') {
      // PR-10: a janela do campo aberto vive na COROA — âncora a 1.35R,
      // sobre a região rarefeita do volume, nunca presa à fotosfera.
      anchorDistance = ctx.SUN_RADIUS * 1.35;
    } else anchorDistance = ctx.SUN_RADIUS * 1.018;
    if (eventType === 'cme') inFront = facing > -0.08;
    else if ((eventType === 'prominence' && promOutside) || eventType === 'coronalHole') {
      // O ápice elevado pode continuar visível um pouco além do horizonte
      // da superfície; o limiar vem da tangência da linha de visada com a
      // esfera solar, não de um simples teste de profundidade NDC.
      // PR-10: vale igualmente para a âncora coronal a 1.35R.
      var limbAllowance = Math.sqrt(Math.max(0,1-(ctx.SUN_RADIUS/anchorDistance)*(ctx.SUN_RADIUS/anchorDistance)));
      inFront = facing > -limbAllowance + .012;
    } else inFront = facing > horizon + .012;
    worldPos.copy(worldDir).multiplyScalar(anchorDistance);
    projected.copy(worldPos).project(ctx.camera);
    anchorX = (projected.x * .5 + .5) * window.innerWidth;
    anchorY = (1 - (projected.y * .5 + .5)) * window.innerHeight;
    sunProjected.set(0,0,0).project(ctx.camera);
    diskX = (sunProjected.x * .5 + .5) * window.innerWidth;
    diskY = (1 - (sunProjected.y * .5 + .5)) * window.innerHeight;
    var halfFov = ctx.camera.fov * Math.PI / 360;
    var ang = Math.asin(Math.min(1,ctx.SUN_RADIUS / Math.max(ctx.camera.position.length(),ctx.SUN_RADIUS*1.001)));
    diskRadius = .5 * window.innerHeight * Math.tan(ang) / Math.tan(halfFov);
    if (eventType === 'cme'){
      var fromDisk = Math.hypot(anchorX-diskX,anchorY-diskY);
      inFront = inFront && !!cmeGeom && ctx.cmeT > .35 && fromDisk > diskRadius*.92;
    } else if (eventType === 'prominence' && promOutside) {
      // A explicação de proeminência só abre quando seu ápice emerge de
      // verdade além da borda; sobre o disco, o nome correto é filamento.
      var promFromDisk = Math.hypot(anchorX-diskX,anchorY-diskY);
      inFront = inFront && promFromDisk > diskRadius*.93;
    }
    var nearViewport = anchorX > -16 && anchorX < window.innerWidth+16 && anchorY > -16 && anchorY < window.innerHeight+16;
    // Para a CME, a âncora precisa estar de fato dentro da tela: uma frente
    // que já saiu alguns pixels pelo lado não merece manter uma narrativa
    // aparentemente solta na margem.
    var cmeOnScreen = eventType !== 'cme' || (anchorX >= 0 && anchorX <= window.innerWidth && anchorY >= 0 && anchorY <= window.innerHeight);
    return inFront && projected.z > -1 && projected.z < 1 && nearViewport && cmeOnScreen;
  }

  function distanceToSegment(px,py,x1,y1,x2,y2){
    var dx=x2-x1,dy=y2-y1,den=dx*dx+dy*dy;
    if (den < .01) return Math.hypot(px-x1,py-y1);
    var t=((px-x1)*dx+(py-y1)*dy)/den;
    t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
  }

  function paintConnector(endX,endY){
    // Uma linha é permitida só quando o segmento inteiro fica fora do
    // disco. Isso preserva a ligação espacial sem "cortar" o Sol na tela.
    connectorVisible = distanceToSegment(diskX,diskY,anchorX,anchorY,endX,endY) > diskRadius + 7;
    lineEndX = endX; lineEndY = endY;
    line.setAttribute('x1',anchorX.toFixed(1)); line.setAttribute('y1',anchorY.toFixed(1));
    line.setAttribute('x2',endX.toFixed(1)); line.setAttribute('y2',endY.toFixed(1));
    line.style.opacity = visible && connectorVisible ? '1' : '0';
  }

  function placeLabel(){
    if (layoutDirty) measure();
    var w = window.innerWidth, h = window.innerHeight;
    if (w < 720){
      labelX = 20;
      labelY = anchorY > h*.58 ? 92 : Math.max(92,h-labelH-92);
    } else {
      if (side === 'right' && anchorX < w*.40) side = 'left';
      else if (side === 'left' && anchorX > w*.60) side = 'right';
      labelX = side === 'right' ? w-labelW-28 : 28;
      labelY = Math.max(96,Math.min(h-labelH-96,anchorY-labelH*.34));
      if (anchorX > labelX-20 && anchorX < labelX+labelW+20 &&
          anchorY > labelY-20 && anchorY < labelY+labelH+20){
        side = side === 'right' ? 'left' : 'right';
        labelX = side === 'right' ? w-labelW-28 : 28;
      }
    }
    label.style.transform = 'translate3d('+Math.round(labelX)+'px,'+Math.round(labelY)+'px,0)';
    var endX = side === 'right' || w < 720 ? labelX : labelX+labelW;
    var endY = labelY + Math.min(labelH*.50,56);
    if (w < 720){
      endX = Math.max(labelX+20,Math.min(labelX+labelW-20,anchorX));
      endY = anchorY > h*.58 ? labelY+labelH : labelY;
    }
    paintConnector(endX,endY);
  }

  function placeGlobalLabel(){
    if (layoutDirty) measure();
    labelX = window.innerWidth < 720 ? 20 : 28;
    // Fica abaixo da identidade do museu, não preso a qualquer ponto do
    // Sol. O ciclo é uma escala global, não um evento localizado.
    labelY = window.innerWidth < 720 ? 96 : 94;
    label.style.transform = 'translate3d('+Math.round(labelX)+'px,'+Math.round(labelY)+'px,0)';
    connectorVisible = false;
    line.style.opacity = '0';
  }

  function showVisual(){
    if (visible) return;
    // A mensagem de boas-vindas é só onboarding. Assim que existe uma
    // descoberta real, ela sai de cena para nunca disputar leitura — em
    // especial no retrato estreito de iPhone.
    intro.classList.remove('visible');
    visible = true; label.classList.add('visible'); line.style.opacity='0'; halo.visible = !eventGlobal;
  }
  function hideVisual(){
    if (!visible) return;
    visible = false; connectorVisible = false; label.classList.remove('visible'); line.style.opacity='0'; halo.visible = false;
  }
  function finishEvent(){ active = false; eventGlobal = false; label.classList.remove('global'); hideVisual(); live.textContent = ''; }

  function startEvent(type,x,y,z,salience,sourceId,generation){
    if (!enabled) return false;
    var source = sourceId == null ? -1 : (sourceId|0);
    var sourceGeneration = generation == null ? -1 : (generation|0);
    if (active){
      if (eventType === type && eventSourceId === source && eventSourceGeneration === sourceGeneration) return true;
      if (eventPriority(type) <= eventPriority(eventType)) return false;
    }
    var oldX=eventDir.x, oldY=eventDir.y, oldZ=eventDir.z, oldDistance=anchorDistance;
    eventDir.set(+x || 0,+y || 0,+z || 0);
    if (eventDir.lengthSq() < .5) return false;
    eventDir.normalize();
    var previousType = eventType, previousSource = eventSourceId;
    var previousGeneration = eventSourceGeneration, previousContent = eventContentKey, previousGlobal = eventGlobal;
    var previousRecorded = recordedDiscoveryKey;
    eventType = type;
    eventSourceId = source; eventSourceGeneration = sourceGeneration;
    eventContentKey = contentKeyFor(type,source);
    recordedDiscoveryKey = '';
    eventGlobal = false; label.classList.remove('global');
    // Um flare no lado oculto não inicia uma legenda; uma CME fica na
    // fila até a frente real emergir além do limbo.
    if (!projectAnchor()){
      eventType = previousType; eventSourceId = previousSource;
      eventSourceGeneration = previousGeneration; eventContentKey = previousContent;
      recordedDiscoveryKey = previousRecorded;
      eventGlobal = previousGlobal; if (previousGlobal) label.classList.add('global');
      eventDir.set(oldX,oldY,oldZ); anchorDistance = oldDistance;
      return false;
    }
    halo.position.copy(eventDir).multiplyScalar(anchorDistance);
    active = true; visible = false; age = 0; sinceEvent = 0;
    side = anchorX >= window.innerWidth*.5 ? 'right' : 'left';
    layoutDirty = true;
    renderEvent();
    var text = eventCopy();
    live.textContent = text.term + '. ' + text.body;
    if (visible) halo.visible = true;
    showVisual(); placeLabel(); rememberCurrentDiscovery();
    return true;
  }

  function startFlare(x,y,z,salience){ return startEvent('flare',x,y,z,salience,-1,-1); }

  function queueCme(x,y,z,salience){
    if (!enabled) return false;
    pendingCmeDir.set(+x || 0,+y || 0,+z || 0);
    if (pendingCmeDir.lengthSq() < .5) return false;
    pendingCmeDir.normalize(); pendingCme = true; pendingCmeAge = 0;
    pendingCmeSalience = salience || 1;
    return true;
  }

  function promotePendingCme(){
    if (!pendingCme) return;
    if (ctx.cmeT >= 900 || pendingCmeAge > 18){ pendingCme = false; return; }
    if (active && eventType === 'cme'){ pendingCme = false; return; }
    if (startEvent('cme',pendingCmeDir.x,pendingCmeDir.y,pendingCmeDir.z,pendingCmeSalience,-1,-1)) pendingCme = false;
  }

  function queueProminence(x,y,z,salience,sourceId,generation){
    if (!enabled) return false;
    var source = sourceId == null ? -1 : (sourceId|0);
    var sourceGeneration = generation == null ? -1 : (generation|0);
    if (active){
      if (eventType === 'prominence' && eventSourceId === source && eventSourceGeneration === sourceGeneration) return true;
      // Uma descoberta de prioridade maior está em leitura. Guardamos uma
      // única estrutura real para depois, sem empilhar cartões sobre o Sol.
      if (eventPriority('prominence') <= eventPriority(eventType)){
        if (pendingProm) return pendingPromSourceId === source && pendingPromGeneration === sourceGeneration;
        pendingPromDir.set(+x || 0,+y || 0,+z || 0);
        if (pendingPromDir.lengthSq() < .5) return false;
        pendingPromDir.normalize(); pendingProm = true; pendingPromAge = 0;
        pendingPromSalience = salience || 1;
        pendingPromSourceId = source; pendingPromGeneration = sourceGeneration;
        return true;
      }
    }
    // Sem competição, só aceitamos a estrutura quando ela está realmente
    // visível na vista atual. O emissor físico tenta de novo no próximo frame.
    return startEvent('prominence',x,y,z,salience,source,sourceGeneration);
  }

  function promotePendingProminence(){
    if (!pendingProm) return;
    if (pendingPromAge > 14){ pendingProm = false; return; }
    if (active && eventPriority('prominence') <= eventPriority(eventType)) return;
    if (startEvent('prominence',pendingPromDir.x,pendingPromDir.y,pendingPromDir.z,pendingPromSalience,pendingPromSourceId,pendingPromGeneration)) pendingProm = false;
  }

  function startGlobalEvent(type,salience,sourceId){
    if (!enabled) return false;
    var source = sourceId == null ? -1 : (sourceId|0);
    if (active){
      if (eventGlobal && eventType === type && eventSourceId === source) return true;
      if (eventPriority(type) <= eventPriority(eventType)) return false;
      hideVisual();
    }
    eventType = type; eventSourceId = source; eventSourceGeneration = -1;
    eventContentKey = contentKeyFor(type,source); eventGlobal = true;
    recordedDiscoveryKey = '';
    // Máximo e mínimo descrevem o Sol inteiro: não herdam âncora, halo
    // ou estado de visibilidade do fenômeno local que acabaram de suceder.
    inFront = false; connectorVisible = false; halo.visible = false;
    active = true; visible = false; age = 0; sinceEvent = 0;
    layoutDirty = true; label.classList.add('global');
    // Mesmo se uma descoberta local estava temporariamente oculta, a
    // chegada do estado global encerra o onboarding por completo.
    intro.classList.remove('visible');
    renderEvent();
    var text = eventCopy();
    live.textContent = text.term + '. ' + text.body;
    showVisual(); placeGlobalLabel(); rememberCurrentDiscovery();
    return true;
  }

  ctx.eduEvent = function(name,a,b,c,d,e,f){
    // A visita guiada tem um cartão persistente próprio. Suprimir o cartão
    // espontâneo enquanto ela está ativa evita duas narrativas concorrendo
    // no mesmo iPhone; o fenômeno físico continua exatamente o mesmo.
    if (ctx.eduTourActive) return false;
    if (name === 'flare') return startFlare(a,b,c,d);
    if (name === 'cme') return queueCme(a,b,c,d);
    if (name === 'prominence') return queueProminence(a,b,c,d,e,f);
    if (name === 'spots') return startEvent('spots',a,b,c,d,e,f);
    // PR-8: loops usam o MESMO caminho local de manchas (halo + linha na
    // âncora real); a coroa usa o caminho global (sem âncora — o fenômeno é
    // o anel inteiro em volta do disco).
    if (name === 'loops') return startEvent('loops',a,b,c,d,e,f);
    // PR-10: buraco coronal é LOCAL — halo + linha na âncora coronal (1.35R,
    // ramo próprio do projectAnchor); a direção vem do marcador do bake.
    if (name === 'coronalHole') return startEvent('coronalHole',a,b,c,d,e,f);
    if (name === 'corona') return startGlobalEvent(name,d,e);
    // PR-9: descobertas por aproximação — globais (ver isGlobal). O emissor
    // de main.js retenta no frame seguinte se o palco estiver ocupado.
    if (name === 'granulation' || name === 'spicules') return startGlobalEvent(name,d,e);
    // PR-12: conclusão da coleção — global, prioridade 110 (assume o palco
    // de qualquer cartão em leitura); o latch em collection.js só desarma
    // quando esta chamada aceita, então o emissor retenta a cada frame.
    if (name === 'collectionComplete') return startGlobalEvent(name,d,e);
    // Um estado global vale somente enquanto ele está acontecendo. Ao
    // contrário de uma CME que emerge, máximo/mínimo não fica em fila:
    // o emissor físico tentará de novo no próximo frame ainda em hold.
    if (name === 'cycleMaximum' || name === 'cycleMinimum') return startGlobalEvent(name,d,e);
    return false;
  };
  ctx.eduEmit = function(name,opts){
    opts = opts || {};
    var fallback = name === 'cme' && ctx.cmeDir ? ctx.cmeDir : ctx.surfFlareDir;
    var d = opts.dir || (fallback ? [fallback.x,fallback.y,fallback.z] : [0,0,1]);
    return ctx.eduEvent(name,d[0],d[1],d[2],opts.salience || 1,opts.sourceId,opts.generation);
  };
  ctx.setEduLang = setLanguage;

  ctx.eduTick = function(rawDelta){
    if (!enabled) return;
    // A visita guiada tem narrativa E halo próprios. Esconder só o DOM
    // deixava o hotspot 3D de um evento em leitura congelado na cena
    // (PR-5): hideVisual() apaga também o sprite; quando a visita termina,
    // um evento ainda vivo reabre normalmente pelo showVisual do tick.
    if (ctx.eduTourActive){ root.hidden = true; hideVisual(); return; }
    if (root.hidden) root.hidden = false;
    sinceEvent += rawDelta;
    if (pendingCme){
      pendingCmeAge += rawDelta;
      promotePendingCme();
    }
    if (pendingProm){
      pendingPromAge += rawDelta;
      promotePendingProminence();
    }
    if (introAge < 5){
      introAge += rawDelta;
      if (introAge > 3.8) intro.classList.remove('visible');
    }
    if (!active) return;
    age += rawDelta;
    if (eventGlobal){
      // PR-12: o cartão de conclusão tem corpo mais longo e acontece uma vez
      // na vida do aparelho — janela de leitura maior que a dos globais comuns.
      if (age > (eventType === 'collectionComplete' ? 14 : 10)){ finishEvent(); return; }
      // Defesa adicional contra qualquer reaplicação assíncrona do switch:
      // uma descoberta global não divide a leitura com o onboarding.
      intro.classList.remove('visible');
      syncEventContent();
      showVisual(); placeGlobalLabel();
      return;
    }
    if (eventType === 'cme'){
      if (age > 16 || ctx.cmeT >= 900 || ctx.cmeT > 18){ finishEvent(); return; }
    } else if (eventType === 'prominence' || eventType === 'spots' || eventType === 'loops' || eventType === 'coronalHole') {
      // PR-8: loops entram na janela conceitual de manchas/proeminências —
      // o ramo do flare abaixo amarra a vida do cartão a surfFlareT, que
      // não descreve um arco ambiente. PR-10: o buraco coronal também é uma
      // estrutura de vida longa — mesma janela de leitura.
      if (age > 9.5){ finishEvent(); return; }
    } else if (age > 7.5 || ctx.surfFlareT > 12){ finishEvent(); return; }
    syncEventContent();
    var canShow = projectAnchor();
    if (!canShow){ hideVisual(); return; }
    halo.position.copy(eventDir).multiplyScalar(anchorDistance);
    showVisual(); placeLabel(); rememberCurrentDiscovery();
    var pulse = reducedMotion ? 1 : 1 + .16*Math.sin(age*7.5)*Math.exp(-age*.22);
    var haloScale = eventType === 'cme' ? .72 : eventType === 'coronalHole' ? .62 : eventType === 'prominence' ? .56 : eventType === 'spots' || eventType === 'loops' ? .52 : .48;
    halo.scale.setScalar(haloScale*pulse);
    haloMaterial.opacity = reducedMotion ? .62 : Math.max(.32,(eventType === 'cme' ? .72 : .80)-age*.045);
  };

  ctx.eduInfo = function(){
    var rect = visible ? label.getBoundingClientRect() : {x:labelX,y:labelY,width:labelW,height:labelH};
    var queued = [];
    if (pendingCme) queued.push({type:'cme',age:pendingCmeAge});
    if (pendingProm) queued.push({type:'prominence',age:pendingPromAge,sourceId:pendingPromSourceId,generation:pendingPromGeneration});
    return { available:true, enabled:enabled, lang:lang, reducedMotion:reducedMotion, limit:1,
      queued:queued,
      active:active ? [{type:eventType,priority:eventPriority(eventType),visible:visible,inFront:eventGlobal ? false : inFront,phase:age<.65?'enter':'reading',
        global:eventGlobal,haloVisible:halo.visible,
        anchor:eventGlobal ? null : {x:anchorX,y:anchorY},labelRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        lineEnd:eventGlobal ? null : {x:lineEndX,y:lineEndY},disk:eventGlobal ? null : {x:diskX,y:diskY,r:diskRadius},
        connectorVisible:eventGlobal ? false : connectorVisible,contentKey:eventContentKey,sourceId:eventSourceId,generation:eventSourceGeneration}] : [] };
  };

  if (reduceQuery){
    var onReduceChange = function(e){ reducedMotion = !!e.matches; };
    try { reduceQuery.addEventListener('change',onReduceChange); } catch(e){ try { reduceQuery.addListener(onReduceChange); } catch(_){} }
  }
  window.addEventListener('resize',function(){ layoutDirty = true; });
  ctx.subscribeControls(function(key,info){ if (key === 'edu') setEnabled(info.applied > .5); });
  renderLanguage();
  setEnabled(enabled);
}

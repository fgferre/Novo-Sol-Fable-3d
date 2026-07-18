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
  var originalChrome = {
    title:title ? title.textContent : '',
    subtitle:subtitle ? subtitle.textContent : '',
    hint:hint ? hint.textContent : ''
  };

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
    '#edu .edu-headline{font-size:11px;line-height:1.25;font-weight:700;letter-spacing:.16em;color:#ffbf7d}',
    '#edu .edu-term{margin-top:5px;font-size:22px;line-height:1.05;font-weight:540;letter-spacing:-.015em;color:#fff6e9}',
    '#edu .edu-body{margin-top:8px;max-width:28em;font-size:14px;line-height:1.5;color:rgba(255,242,225,.92)}',
    '#edu .edu-intro{position:absolute;left:50%;bottom:68px;max-width:calc(100vw - 60px);transform:translate3d(-50%,8px,0);',
    ' font-size:13px;letter-spacing:.035em;color:rgba(255,239,218,.82);text-align:center;text-shadow:0 2px 10px #000;',
    ' opacity:0;transition:opacity .55s ease,transform .7s cubic-bezier(.22,1,.36,1)}',
    '#edu .edu-intro.visible{opacity:1;transform:translate3d(-50%,0,0)}',
    '#edu .edu-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;',
    ' overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}',
    '@media(max-width:719px){#edu .edu-label{width:calc(100vw - 40px);padding:12px 15px 13px}',
    '#edu .edu-term{font-size:19px}#edu .edu-body{font-size:13px;line-height:1.48}#edu .edu-intro{bottom:108px;font-size:12px}}',
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
  var active = false, visible = false, inFront = false, eventType = 'flare';
  var eventSourceId = -1, eventSourceGeneration = -1, eventContentKey = 'flare';
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
  function eventPriority(type){ return type === 'cme' ? 100 : type === 'flare' ? 90 : 70; }
  function syncChrome(){
    var c = copy();
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    if (enabled){
      if (title) title.textContent = '☉ ' + c.brand;
      if (subtitle) subtitle.textContent = c.brandTag;
      if (hint) hint.textContent = ctx.hasTouch ? c.touchHint : c.desktopHint;
    } else {
      if (title) title.textContent = originalChrome.title;
      if (subtitle) subtitle.textContent = originalChrome.subtitle;
      if (hint) hint.textContent = originalChrome.hint;
    }
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
    try { ctx.savedKnobs.lang = next; localStorage.setItem('solKnobs',JSON.stringify(ctx.savedKnobs)); } catch(e){}
    renderLanguage();
    if (active){
      var activeText = eventCopy();
      live.textContent = activeText.term + '. ' + activeText.body;
    }
    if (ctx.onEduLanguageChange) ctx.onEduLanguageChange(lang);
    return lang;
  }

  function setEnabled(on){
    enabled = !!on;
    root.hidden = !enabled;
    if (enabled){ introAge = 0; intro.classList.add('visible'); }
    else {
      intro.classList.remove('visible'); label.classList.remove('visible'); line.style.opacity='0';
      halo.visible = false; visible = false; active = false; pendingCme = false; pendingProm = false; live.textContent = '';
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
    } else anchorDistance = ctx.SUN_RADIUS * 1.018;
    if (eventType === 'cme') inFront = facing > -0.08;
    else if (eventType === 'prominence' && promOutside) {
      // O ápice elevado pode continuar visível um pouco além do horizonte
      // da superfície; o limiar vem da tangência da linha de visada com a
      // esfera solar, não de um simples teste de profundidade NDC.
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

  function showVisual(){
    if (visible) return;
    // A mensagem de boas-vindas é só onboarding. Assim que existe uma
    // descoberta real, ela sai de cena para nunca disputar leitura — em
    // especial no retrato estreito de iPhone.
    intro.classList.remove('visible');
    visible = true; label.classList.add('visible'); line.style.opacity='0'; halo.visible = true;
  }
  function hideVisual(){
    if (!visible) return;
    visible = false; connectorVisible = false; label.classList.remove('visible'); line.style.opacity='0'; halo.visible = false;
  }
  function finishEvent(){ active = false; hideVisual(); live.textContent = ''; }

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
    var previousGeneration = eventSourceGeneration, previousContent = eventContentKey;
    eventType = type;
    eventSourceId = source; eventSourceGeneration = sourceGeneration;
    eventContentKey = contentKeyFor(type,source);
    // Um flare no lado oculto não inicia uma legenda; uma CME fica na
    // fila até a frente real emergir além do limbo.
    if (!projectAnchor()){
      eventType = previousType; eventSourceId = previousSource;
      eventSourceGeneration = previousGeneration; eventContentKey = previousContent;
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
    showVisual(); placeLabel();
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

  ctx.eduEvent = function(name,a,b,c,d,e,f){
    if (name === 'flare') return startFlare(a,b,c,d);
    if (name === 'cme') return queueCme(a,b,c,d);
    if (name === 'prominence') return queueProminence(a,b,c,d,e,f);
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
    if (eventType === 'cme'){
      if (age > 16 || ctx.cmeT >= 900 || ctx.cmeT > 18){ finishEvent(); return; }
    } else if (eventType === 'prominence') {
      if (age > 9.5){ finishEvent(); return; }
    } else if (age > 7.5 || ctx.surfFlareT > 12){ finishEvent(); return; }
    syncEventContent();
    var canShow = projectAnchor();
    if (!canShow){ hideVisual(); return; }
    halo.position.copy(eventDir).multiplyScalar(anchorDistance);
    showVisual(); placeLabel();
    var pulse = reducedMotion ? 1 : 1 + .16*Math.sin(age*7.5)*Math.exp(-age*.22);
    var haloScale = eventType === 'cme' ? .72 : eventType === 'prominence' ? .56 : .48;
    halo.scale.setScalar(haloScale*pulse);
    haloMaterial.opacity = reducedMotion ? .62 : Math.max(.32,(eventType === 'cme' ? .72 : .80)-age*.045);
  };

  ctx.eduInfo = function(){
    var rect = visible ? label.getBoundingClientRect() : {x:labelX,y:labelY,width:labelW,height:labelH};
    return { available:true, enabled:enabled, lang:lang, reducedMotion:reducedMotion, limit:1,
      queued:(pendingCme ? [{type:'cme',age:pendingCmeAge}] : []).concat(pendingProm ? [{type:'prominence',age:pendingPromAge,sourceId:pendingPromSourceId,generation:pendingPromGeneration}] : []),
      active:active ? [{type:eventType,priority:eventPriority(eventType),visible:visible,inFront:inFront,phase:age<.65?'enter':'reading',
        anchor:{x:anchorX,y:anchorY},labelRect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        lineEnd:{x:lineEndX,y:lineEndY},disk:{x:diskX,y:diskY,r:diskRadius},
        connectorVisible:connectorVisible,contentKey:eventContentKey,sourceId:eventSourceId,generation:eventSourceGeneration}] : [] };
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

// core/controls.js — contrato único dos controles escalares. O schema
// dirige boot (URL/storage/preset/default), painel, runtime, overrides e QA.

function def(section, key, label, min, max, step, dflt, apply, extra){
  var out = Object.assign({ section:section, key:key, label:label, min:min, max:max,
    range:[min,max], step:step, default:dflt, setter:apply,
    condition:alwaysAvailable }, extra || {});
  if (!out.metrics) out.metrics = function(ctx){
    return { runtime:apply.read ? apply.read(ctx) : undefined };
  };
  return out;
}

function alwaysAvailable(ctx, v){ return { effective:v, active:true, reason:'' }; }
function setCtx(name){
  var fn=function(ctx, v){ ctx[name] = v; };
  fn.read=function(ctx){ return ctx[name]; };
  return fn;
}
function setUniform(group, name){
  var fn=function(ctx, v){ if (ctx[group] && ctx[group][name]) ctx[group][name].value = v; };
  fn.read=function(ctx){ return ctx[group] && ctx[group][name] ? ctx[group][name].value : undefined; };
  return fn;
}
export const CONTROL_SCHEMA_VERSION = 2;

function finiteNumber(value){
  value = Number(value);
  return Number.isFinite(value) ? value : null;
}

// solKnobs existia antes de o contrato dos controles ganhar versão. A
// migração preserva ganhos e o relógio anterior onde o range novo permite,
// não apenas o número salvo. O easing temporal segue deliberadamente a lei
// nova derivada do multiplicador e, portanto, não é bit-idêntico ao legado.
// Objetos vazios recebem o marcador em memória, mas só serão persistidos
// quando o usuário realmente mudar algum ajuste.
export function migrateSavedControls(input){
  var saved = {};
  if (input && typeof input === 'object' && !Array.isArray(input))
    Object.keys(input).forEach(function(key){ saved[key] = input[key]; });
  var fromVersion = Math.max(0, parseInt(saved.__schemaVersion, 10) || 0);
  if (fromVersion >= CONTROL_SCHEMA_VERSION)
    return { values:saved, changed:false, fromVersion:fromVersion };

  var hadState = Object.keys(saved).some(function(key){ return key !== '__schemaVersion'; });
  var value = finiteNumber(saved.bloom);
  if (value !== null && value > 1) saved.bloom = 1 + (value - 1)/2;
  value = finiteNumber(saved.pmode);
  if (value !== null) saved.pmode = value/2;
  value = finiteNumber(saved.hand);
  if (value !== null) saved.hand = value/2;
  value = finiteNumber(saved.grain);
  if (value !== null && value > 0 && value < 1) saved.grain = value*value;

  var oldCycle = finiteNumber(saved.cycle), oldLapse = finiteNumber(saved.lapse);
  if (oldCycle !== null || oldLapse !== null){
    oldCycle = Math.max(0, oldCycle === null ? 0 : oldCycle);
    oldLapse = Math.max(0, oldLapse === null ? 0 : oldLapse);
    var oldMultiplier = Math.max(1, oldCycle) + 26*oldLapse;
    saved.cycle = Math.min(1, oldCycle);
    saved.lapse = oldMultiplier > 1 ? Math.min(1, Math.pow((oldMultiplier - 1)/39, 2)) : 0;
  }
  saved.__schemaVersion = CONTROL_SCHEMA_VERSION;
  return { values:saved, changed:hadState, fromVersion:fromVersion };
}

export function bloomGain(v){ return v <= 1 ? v : 1 + 2*(v - 1); }
function bloomStrength(ctx, v){
  if (ctx.BLOOM_BASE0 !== undefined) ctx.BLOOM_STRENGTH_BASE = ctx.BLOOM_BASE0 * bloomGain(v);
}
function exposure(ctx, v){
  if (ctx.compUniforms && ctx.EXP0 !== undefined) ctx.compUniforms.uExposure.value = ctx.EXP0 * v;
}
function bloomThreshold(ctx, v){
  ctx.BLOOM_THRESHOLD = v;
  if (ctx.thresholdUniforms) ctx.thresholdUniforms.uThreshold.value = v;
}
function bloomKnee(ctx, v){
  ctx.BLOOM_KNEE = v;
  if (ctx.thresholdUniforms) ctx.thresholdUniforms.uKnee.value = v;
}
function bloomSpread(ctx, v){
  ctx.BLOOM_SPREAD = v;
  if (ctx.downsampleUniforms) ctx.downsampleUniforms.uSpread.value = v;
  if (ctx.upsampleUniforms) ctx.upsampleUniforms.uSpread.value = v;
}
export function starOpacities(v, normalBase, brightBase){
  var normal, bright;
  if (v <= 1){
    normal = normalBase * v;
    bright = brightBase * v;
  } else {
    var t = Math.min(1, v - 1);
    normal = normalBase + (1 - normalBase) * t;
    bright = brightBase + (1 - brightBase) * t;
  }
  return { normal:normal, bright:bright };
}
function stars(ctx, v){
  if (!ctx.stars || !ctx.brightStars) return;
  var opacity = starOpacities(v, ctx.STARS_OP0, ctx.BRIGHT_OP0);
  ctx.stars.material.opacity = opacity.normal;
  ctx.brightStars.material.opacity = opacity.bright;
}
function milkyWay(ctx, v){
  if (ctx.milkyWay) ctx.milkyWay.material.opacity = v;
  if (ctx.mwNebUniforms) ctx.mwNebUniforms.uMW.value = v;
}
export function grainGain(v){
  v = Math.max(0, v);
  return v < 1 ? Math.sqrt(v) : v;
}
function grain(ctx, v){
  if (ctx.compUniforms) ctx.compUniforms.uGrain.value = grainGain(v);
}
bloomStrength.read=function(ctx){ return ctx.BLOOM_STRENGTH_BASE; };
exposure.read=function(ctx){ return ctx.compUniforms ? ctx.compUniforms.uExposure.value : undefined; };
bloomThreshold.read=function(ctx){ return ctx.thresholdUniforms ? ctx.thresholdUniforms.uThreshold.value : ctx.BLOOM_THRESHOLD; };
bloomKnee.read=function(ctx){ return ctx.thresholdUniforms ? ctx.thresholdUniforms.uKnee.value : ctx.BLOOM_KNEE; };
bloomSpread.read=function(ctx){ return ctx.downsampleUniforms ? ctx.downsampleUniforms.uSpread.value : ctx.BLOOM_SPREAD; };
stars.read=function(ctx){ return ctx.stars ? ctx.stars.material.opacity : undefined; };
milkyWay.read=function(ctx){ return ctx.milkyWay ? ctx.milkyWay.material.opacity : undefined; };
grain.read=function(ctx){ return ctx.compUniforms ? ctx.compUniforms.uGrain.value : undefined; };

function cvolCondition(ctx, v){
  if (ctx.CVOL_STEPS <= 0) return { effective:0, active:false, reason:'tier-unavailable' };
  if (ctx.cvolKilled) return { effective:0, active:false, reason:'autotune-disabled' };
  if (v <= 0.001) return { effective:0, active:false, reason:'source-empty' };
  if (!ctx.cvolReady) return { effective:0, active:false, reason:'preparing' };
  return { effective:v, active:true, reason:'' };
}
function cmeCondition(ctx, v){
  if (ctx.CME_STEPS <= 0) return { effective:0, active:false, reason:'tier-unavailable' };
  if (ctx.cmeKilled) return { effective:0, active:false, reason:'autotune-disabled' };
  if (v <= 0.001) return { effective:0, active:false, reason:'source-empty' };
  if (ctx.cmeT < 900) return { effective:v, active:true, reason:'' };
  if (ctx.cmeCooldown > 0) return { effective:0, active:false, reason:'cooldown' };
  return { effective:0, active:false, reason:'waiting-flare' };
}
function burstCondition(ctx, v){
  if (v <= 0.001) return { effective:0, active:false, reason:'source-empty' };
  if (!(ctx.lastFlareHDR > 0.004)) return { effective:0, active:false, reason:'waiting-flare' };
  return { effective:v, active:true, reason:'' };
}
function dofCondition(ctx, v){
  if (v <= 0.001) return { effective:0, active:false, reason:'source-empty' };
  if (!ctx.compUniforms || ctx.compUniforms.uDof.value <= 0.0008)
    return { effective:0, active:false, reason:'fit-framing' };
  return { effective:v, active:true, reason:'' };
}
export function cycleMultiplierFor(lapse){
  return lapse > 0 ? 1+39*Math.sqrt(Math.min(1,Math.max(0,lapse))) : 1;
}
export function cycleEasingFor(multiplier){
  return Math.min(1, Math.max(0, (multiplier - 1)/8));
}
export function cycleDepthFor(cycle, lapse){
  if (cycle > 0.001) return Math.min(1, Math.max(0, cycle));
  return lapse > 0 ? 1 : 0;
}
function cycleCondition(ctx, v){
  if (v <= 0.001 && ctx.LAPSE_K > 0)
    return { effective:1, active:true, reason:'lapse-fallback' };
  return v > 0.001 ? { effective:v, active:true, reason:'' }
                   : { effective:0, active:false, reason:'source-empty' };
}
function lapseCondition(ctx, v){
  return v > 0 ? { effective:v, active:true, reason:'' }
                   : { effective:0, active:false, reason:'source-empty' };
}
function timeMetrics(ctx, runtime){
  var mul=cycleMultiplierFor(ctx.LAPSE_K),period=ctx.act ? ctx.act.CYCLE_PERIOD : 1800;
  return { runtime:runtime, multiplier:mul,
    duration:period/(mul*Math.max(0.05,ctx.TIME_SCALE || 1)),
    easing:cycleEasingFor(mul), depth:cycleDepthFor(ctx.CYCLE_K,ctx.LAPSE_K),
    cycleOn:ctx.CYCLE_K>0.001||ctx.LAPSE_K>0 };
}

export const CONTROL_SCHEMA = [
  // Camada educativa espacial. Fica fora do drawer de sliders e ganha um
  // switch próprio. GO-LIVE (série Museu, PR-3): no modo normal as
  // descobertas nascem LIGADAS — o museu recebe de porta aberta. Sob ?det
  // o default volta a 0 e a fábrica nem constrói (paridade por construção,
  // mesmo padrão det-aware do `cycle` abaixo). URL e storage continuam
  // vencendo o default: quem desligou permanece desligado.
  def('experiência','edu','Descobertas educativas',0,1,1,
    function(ctx){ return ctx.DET ? 0 : 1; },setCtx('EDU_K'),{hidden:true}),
  def('tempo','speed','Ritmo do tempo',0.05,3,0.05,1,setCtx('TIME_SCALE')),
  def('tempo','pmode','Oscilações (p-modes)',0,1,0.025,0,setUniform('sunUniforms','uPmode'),{
    metrics:function(ctx, v){ return { runtime:ctx.sunUniforms ? ctx.sunUniforms.uPmode.value : 0,
      displacementLimit:0.0088*v, brightnessLimit:0.11*v }; }}),
  // default do ciclo: no modo NORMAL a estrela vive o ciclo de 11 anos
  // por inteiro (profundidade 1, período natural ~1800 un ≈ 30 min a
  // speed=1); sob ?det=1 o default volta a 0 — relógio congelado em
  // amp=1.0, QA determinístico byte-idêntico por construção. URL e
  // storage continuam vencendo o default (ensure() do store).
  def('tempo','cycle','Profundidade do ciclo',0,1,0.05,
    function(ctx){ return ctx.DET ? 0 : 1; },setCtx('CYCLE_K'),{condition:cycleCondition,
    metrics:function(ctx){ return timeMetrics(ctx,ctx.CYCLE_K); }}),
  def('tempo','lapse','Velocidade do ciclo',0,1,0.05,0,setCtx('LAPSE_K'),{condition:lapseCondition,
    metrics:function(ctx){ return timeMetrics(ctx,ctx.LAPSE_K); }}),
  def('tempo','spots','Manchas solares (grupos)',0,1.5,0.05,0,setCtx('SPOTS_K'),{preset:1}),

  def('luz & cor','bloom','Bloom',0,3,0.025,1,bloomStrength,{preset:1.075,
    metrics:function(ctx){ return { runtime:ctx.BLOOM_STRENGTH_BASE, gain:bloomGain(ctx.getAppliedControl('bloom')) }; }}),
  def('luz & cor','bloomth','Threshold do Bloom',0.2,2,0.02,
    function(ctx){ return ctx.isHDR ? 0.72 : 0.82; },bloomThreshold),
  def('luz & cor','bloomknee','Suavidade do Bloom',0,0.6,0.02,0.3,bloomKnee),
  def('luz & cor','bloomspread','Espalhamento do Bloom',0.5,2.5,0.05,1,bloomSpread),
  def('luz & cor','exposure','Exposição',0.3,2.5,0.02,1,exposure,{preset:1.08}),
  def('luz & cor','plageglow','Brilho das plages',0,1.5,0.05,0.35,setUniform('sunUniforms','uPlageEm')),
  def('luz & cor','sat','Saturação',0,2,0.02,1.08,setUniform('compUniforms','uSat')),
  def('luz & cor','vig','Vinheta',0,1.5,0.05,0.55,setUniform('compUniforms','uVig'),{preset:0.85}),
  def('luz & cor','grain','Grão de filme',0,5,0.01,1,grain,{preset:1.7,
    metrics:function(ctx, v){ var gain=grainGain(v); return {
      runtime:ctx.compUniforms ? ctx.compUniforms.uGrain.value : gain,
      gain:gain, amplitude8bit:0.8*gain }; }}),

  def('cinema','veil','Halação (glare)',0,1.5,0.05,0,setCtx('VEIL_BASE'),{preset:0.85}),
  def('cinema','streak','Flare anamórfico',0,1.5,0.05,0,setCtx('STREAK_K'),{preset:0.65}),
  def('cinema','burst','Starburst (difração)',0,1.5,0.05,0,setCtx('BURST_K'),{preset:0.55,condition:burstCondition}),
  def('cinema','disp','Bloom espectral (dispersão)',0,1.5,0.05,0,setCtx('DISP_K'),{preset:0.40}),
  def('cinema','hal','Halação quente (corpo negro)',0,1.5,0.05,0,setCtx('HAL_K'),{preset:0.45}),
  def('cinema','adapt','Olho (adaptação)',0,1,0.05,0,setCtx('ADAPT_K'),{preset:0.55}),
  def('cinema','fringe','Franja da lente',0,1.5,0.05,0,setUniform('compUniforms','uFringe'),{preset:0.35}),
  def('cinema','shimmer','Calor no limbo',0,1.5,0.05,0,setUniform('compUniforms','uShimmer'),{preset:0.45}),
  def('cinema','tone','Grade Sunshine',0,1.2,0.05,0,setUniform('compUniforms','uTone'),{preset:0.65}),
  def('cinema','film','Filme (ACES→AgX)',0,1,0.05,0,setUniform('compUniforms','uFilm')),
  def('cinema','hand','Micro-movimento de câmera',0,1.5,0.025,0,setCtx('HAND_K'),{
    metrics:function(ctx, v){ return { runtime:ctx.HAND_K,
      thetaOffset:ctx.handThetaOffset || 0, phiOffset:ctx.handPhiOffset || 0,
      maxTheta:0.0146*v, maxPhi:0.011*v }; }}),
  def('cinema','dof','Foco raso (bokeh hex)',0,1.5,0.05,0,setCtx('DOF_K'),{preset:0.5,condition:dofCondition,
    metrics:function(ctx){ return { runtime:ctx.compUniforms ? ctx.compUniforms.uDof.value : 0,
      focus:ctx.compUniforms ? ctx.compUniforms.uDofFocus.value : 0 }; }}),

  def('coroa','halo','Halo coronal',0,2,0.05,0.55,setUniform('coronaRaysUniforms','uHalo')),
  def('coroa','ray','Streamers',0,3,0.05,0.9,setUniform('coronaRaysUniforms','uRayBoost')),
  def('coroa','cact','Resposta à atividade',0,2,0.05,0.5,setUniform('coronaRaysUniforms','uActGain')),
  def('coroa','cvol','Coroa volumétrica (raymarch)',0,1.5,0.05,0,setCtx('CVOL_K'),{preset:0.5,condition:cvolCondition,
    metrics:function(ctx){ return { runtime:ctx.CVOL_K, ready:!!ctx.cvolReady, cycles:ctx.cvolCycles || 0 }; }}),
  def('coroa','cme','CME (erupção)',0,1.5,0.05,0,setCtx('CME_K'),{preset:0.9,condition:cmeCondition,
    metrics:function(ctx){ return { runtime:ctx.CME_K, event:ctx.cmeT < 900, cooldown:ctx.cmeCooldown || 0 }; }}),
  def('coroa','loops','Loops coronais',0,1.5,0.05,0,setCtx('LOOP_K'),{preset:0.55}),
  def('coroa','fprom','Absorção de filamentos',0,1,0.05,0,setCtx('FPROM_K'),{preset:0.55}),

  def('céu','stars','Estrelas',0,2,0.05,1,stars,{metrics:function(ctx){
    return { runtime:ctx.stars ? ctx.stars.material.opacity : undefined,
      bright:ctx.brightStars ? ctx.brightStars.material.opacity : undefined };
  }}),
  def('céu','mw','Via Láctea',0,1,0.02,0.62,milkyWay)
];

const BY_KEY = Object.create(null);
CONTROL_SCHEMA.forEach(function(d){ BY_KEY[d.key] = d; });

export function getControlPreset(){
  var out = {};
  CONTROL_SCHEMA.forEach(function(d){ if (d.preset !== undefined) out[d.key] = d.preset; });
  return out;
}

export function createControlState(ctx, options){
  options = options || {};
  var urlQ = options.urlQ || {};
  var saved = options.savedKnobs || {};
  var usePreset = options.look === 'sunshine';
  var records = Object.create(null);
  var listeners = [];

  function defaultOf(d){ return typeof d.default === 'function' ? d.default(ctx) : d.default; }
  function clamp(d, value){
    value = parseFloat(value);
    if (value !== value) value = defaultOf(d);
    return Math.min(d.max, Math.max(d.min, value));
  }
  function ensure(key){
    if (records[key]) return records[key];
    var d = BY_KEY[key];
    if (!d) throw new Error('controle desconhecido: ' + key);
    var raw, source;
    if (urlQ[key] !== undefined && parseFloat(urlQ[key]) === parseFloat(urlQ[key])){
      raw = urlQ[key]; source = 'url';
    } else if (saved[key] !== undefined && parseFloat(saved[key]) === parseFloat(saved[key])){
      raw = saved[key]; source = 'storage';
    } else if (usePreset && d.preset !== undefined){
      raw = d.preset; source = 'preset';
    } else {
      raw = defaultOf(d); source = 'default';
    }
    records[key] = { nominal:clamp(d, raw), applied:0, source:source, override:null };
    records[key].applied = records[key].nominal;
    return records[key];
  }
  function evaluated(d, r){
    var state;
    try { state = d.condition(ctx, r.applied, r.nominal) || {}; }
    catch(e){ state = {}; }
    var reason = state.reason || '';
    // Tier e kill-switch vencem qualquer override. Nos demais casos a UI
    // precisa dizer que o diretor está aplicando um valor transitório.
    if (r.override && reason !== 'tier-unavailable' && reason !== 'autotune-disabled')
      reason = 'director-override';
    var metrics = {};
    try { metrics = d.metrics(ctx, r.applied, r.nominal) || {}; } catch(e){}
    return { effective:state.effective === undefined ? r.applied : state.effective,
      active:state.active === undefined ? true : !!state.active,
      reason:reason, metrics:metrics };
  }
  function info(key){
    var d = BY_KEY[key], r = ensure(key);
    var ev = evaluated(d, r);
    return { key:key, nominal:r.nominal, applied:r.applied, effective:ev.effective,
      active:ev.active, reason:ev.reason, source:r.source, metrics:ev.metrics,
      overrideOwner:r.override ? r.override.owner : '', min:d.min, max:d.max,
      step:d.step, default:defaultOf(d), label:d.label, section:d.section };
  }
  function notify(key){
    var snapshot = info(key);
    listeners.slice().forEach(function(fn){ fn(key, snapshot); });
  }
  function apply(key){
    var d = BY_KEY[key], r = ensure(key);
    r.applied = r.override ? r.override.value : r.nominal;
    d.setter(ctx, r.applied);
    notify(key);
    return r.applied;
  }
  function persist(){
    try { localStorage.setItem('solKnobs', JSON.stringify(saved)); } catch(e){}
  }
  function setControl(key, value, opts){
    opts = opts || {};
    var d = BY_KEY[key]; if (!d) return false;
    if (opts.stopDirector !== false && ctx.directorUserExit) ctx.directorUserExit();
    var r = ensure(key);
    r.nominal = clamp(d, value);
    r.source = opts.source || 'user';
    if (opts.persist !== false){ saved[key] = r.nominal; if (!opts.deferPersist) persist(); }
    apply(key);
    return r.nominal;
  }
  function setControls(values, opts){
    opts = opts || {};
    Object.keys(values || {}).forEach(function(key){
      if (!BY_KEY[key]) return;
      setControl(key, values[key], { source:opts.source || 'user',
        persist:opts.persist !== false, deferPersist:true });
    });
    if (opts.persist !== false) persist();
  }
  function setOverride(owner, key, value){
    var d = BY_KEY[key]; if (!d) return false;
    var r = ensure(key);
    var next = clamp(d, value);
    if (r.override && r.override.owner === owner && r.override.value === next)
      return r.applied;
    r.override = { owner:owner, value:next };
    return apply(key);
  }
  function clearOverrides(owner){
    CONTROL_SCHEMA.forEach(function(d){
      var r = ensure(d.key);
      if (r.override && r.override.owner === owner){ r.override = null; apply(d.key); }
    });
  }
  function clearOverride(owner, key){
    var d=BY_KEY[key]; if(!d)return false;
    var r=ensure(key);
    if(r.override&&r.override.owner===owner){r.override=null;apply(key);}
    return r.applied;
  }
  function subscribe(fn){
    listeners.push(fn);
    return function(){ var i=listeners.indexOf(fn); if (i>=0) listeners.splice(i,1); };
  }
  function activate(){ CONTROL_SCHEMA.forEach(function(d){ apply(d.key); }); }
  function applyPreset(name){
    if (name !== 'sunshine') return false;
    setControls(getControlPreset(), { source:'preset', persist:true });
    return true;
  }

  ctx.CONTROL_SCHEMA = CONTROL_SCHEMA;
  ctx.getControl = function(key){ return ensure(key).nominal; };
  ctx.getAppliedControl = function(key){ return ensure(key).applied; };
  ctx.getControlInfo = info;
  ctx.getControlsInfo = function(){
    var out = {}; CONTROL_SCHEMA.forEach(function(d){ out[d.key] = info(d.key); }); return out;
  };
  ctx.setControl = setControl; ctx.setControls = setControls;
  ctx.setControlOverride = setOverride; ctx.clearControlOverride = clearOverride;
  ctx.clearControlOverrides = clearOverrides;
  ctx.subscribeControls = subscribe; ctx.activateControlTargets = activate;
  ctx.applyControlPreset = applyPreset;
  ctx.knob = function(name){ return ensure(name).nominal; };
  ctx.lk = function(name, base){ return usePreset && BY_KEY[name] && BY_KEY[name].preset !== undefined ? BY_KEY[name].preset : base; };
}

// core/controls.js — contrato único dos controles escalares. O schema
// dirige boot (URL/storage/preset/default), painel, runtime, overrides e QA.

function def(section, key, label, min, max, step, dflt, apply, extra){
  return Object.assign({ section:section, key:key, label:label, min:min, max:max,
    step:step, default:dflt, apply:apply }, extra || {});
}

function setCtx(name){ return function(ctx, v){ ctx[name] = v; }; }
function setUniform(group, name){
  return function(ctx, v){ if (ctx[group] && ctx[group][name]) ctx[group][name].value = v; };
}
function bloomStrength(ctx, v){
  if (ctx.BLOOM_BASE0 !== undefined) ctx.BLOOM_STRENGTH_BASE = ctx.BLOOM_BASE0 * v;
}
function exposure(ctx, v){
  if (ctx.compUniforms && ctx.EXP0 !== undefined) ctx.compUniforms.uExposure.value = ctx.EXP0 * v;
}
function bloomThreshold(ctx, v){
  ctx.BLOOM_THRESHOLD = v;
  if (ctx.thresholdUniforms) ctx.thresholdUniforms.uThreshold.value = v;
}
function stars(ctx, v){
  if (!ctx.stars || !ctx.brightStars) return;
  var normal, bright;
  if (v <= 1){
    normal = ctx.STARS_OP0 * v;
    bright = ctx.BRIGHT_OP0 * v;
  } else {
    var t = Math.min(1, v - 1);
    normal = ctx.STARS_OP0 + (1 - ctx.STARS_OP0) * t;
    bright = ctx.BRIGHT_OP0 + (1 - ctx.BRIGHT_OP0) * t;
  }
  ctx.stars.material.opacity = normal;
  ctx.brightStars.material.opacity = bright;
}
function milkyWay(ctx, v){
  if (ctx.milkyWay) ctx.milkyWay.material.opacity = v;
  if (ctx.mwNebUniforms) ctx.mwNebUniforms.uMW.value = v;
}

export const CONTROL_SCHEMA = [
  def('tempo','speed','Ritmo do tempo',0.05,3,0.05,1,setCtx('TIME_SCALE')),
  def('tempo','pmode','Oscilações (p-modes)',0,1,0.05,0,setUniform('sunUniforms','uPmode')),
  def('tempo','cycle','Ciclo de 11 anos',0,1.5,0.05,0,setCtx('CYCLE_K')),
  def('tempo','lapse','Time-lapse do ciclo',0,1.5,0.05,0,setCtx('LAPSE_K')),
  def('tempo','spots','Manchas solares (grupos)',0,1.5,0.05,0,setCtx('SPOTS_K'),{preset:1}),

  def('luz & cor','bloom','Bloom',0,3,0.05,1,bloomStrength,{preset:1.15}),
  def('luz & cor','bloomth','Threshold do Bloom',0.2,2,0.02,
    function(ctx){ return ctx.isHDR ? 0.72 : 0.82; },bloomThreshold,{hidden:true}),
  def('luz & cor','exposure','Exposição',0.3,2.5,0.02,1,exposure,{preset:1.08}),
  def('luz & cor','plageglow','Brilho das plages',0,1.5,0.05,0.35,setUniform('sunUniforms','uPlageEm')),
  def('luz & cor','sat','Saturação',0,2,0.02,1.08,setUniform('compUniforms','uSat')),
  def('luz & cor','vig','Vinheta',0,1.5,0.05,0.55,setUniform('compUniforms','uVig'),{preset:0.85}),
  def('luz & cor','grain','Grão de filme',0,5,0.1,1,setUniform('compUniforms','uGrain'),{preset:1.7}),

  def('cinema','veil','Halação (glare)',0,1.5,0.05,0,setCtx('VEIL_BASE'),{preset:0.85}),
  def('cinema','streak','Flare anamórfico',0,1.5,0.05,0,setCtx('STREAK_K'),{preset:0.65}),
  def('cinema','burst','Starburst (difração)',0,1.5,0.05,0,setCtx('BURST_K'),{preset:0.55}),
  def('cinema','disp','Bloom espectral (dispersão)',0,1.5,0.05,0,setCtx('DISP_K'),{preset:0.40}),
  def('cinema','hal','Halação quente (corpo negro)',0,1.5,0.05,0,setCtx('HAL_K'),{preset:0.45}),
  def('cinema','adapt','Olho (adaptação)',0,1,0.05,0,setCtx('ADAPT_K'),{preset:0.55}),
  def('cinema','fringe','Franja da lente',0,1.5,0.05,0,setUniform('compUniforms','uFringe'),{preset:0.35}),
  def('cinema','shimmer','Calor no limbo',0,1.5,0.05,0,setUniform('compUniforms','uShimmer'),{preset:0.45}),
  def('cinema','tone','Grade Sunshine',0,1.2,0.05,0,setUniform('compUniforms','uTone'),{preset:0.65}),
  def('cinema','film','Filme (ACES→AgX)',0,1,0.05,0,setUniform('compUniforms','uFilm')),
  def('cinema','hand','Câmera de mão',0,1.5,0.05,0,setCtx('HAND_K')),
  def('cinema','dof','Foco raso (bokeh hex)',0,1.5,0.05,0,setCtx('DOF_K'),{preset:0.5}),

  def('coroa','halo','Halo coronal',0,2,0.05,0.55,setUniform('coronaRaysUniforms','uHalo')),
  def('coroa','ray','Streamers',0,3,0.05,0.9,setUniform('coronaRaysUniforms','uRayBoost')),
  def('coroa','cact','Resposta à atividade',0,2,0.05,0.5,setUniform('coronaRaysUniforms','uActGain')),
  def('coroa','cvol','Coroa volumétrica (raymarch)',0,1.5,0.05,0,setCtx('CVOL_K'),{preset:0.5}),
  def('coroa','cme','CME (erupção)',0,1.5,0.05,0,setCtx('CME_K'),{preset:0.9}),
  def('coroa','loops','Loops coronais',0,1.5,0.05,0,setCtx('LOOP_K'),{preset:0.55}),
  def('coroa','fprom','Absorção de filamentos',0,1,0.05,0,setCtx('FPROM_K'),{preset:0.55}),

  def('céu','stars','Estrelas',0,2,0.05,1,stars),
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
  function info(key){
    var d = BY_KEY[key], r = ensure(key);
    return { key:key, nominal:r.nominal, applied:r.applied, source:r.source,
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
    d.apply(ctx, r.applied);
    notify(key);
    return r.applied;
  }
  function persist(){
    try { localStorage.setItem('solKnobs', JSON.stringify(saved)); } catch(e){}
  }
  function setControl(key, value, opts){
    opts = opts || {};
    var d = BY_KEY[key]; if (!d) return false;
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
    r.override = { owner:owner, value:clamp(d, value) };
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
  ctx.setControl = setControl; ctx.setControls = setControls;
  ctx.setControlOverride = setOverride; ctx.clearControlOverride = clearOverride;
  ctx.clearControlOverrides = clearOverrides;
  ctx.subscribeControls = subscribe; ctx.activateControlTargets = activate;
  ctx.applyControlPreset = applyPreset;
  ctx.knob = function(name){ return ensure(name).nominal; };
  ctx.lk = function(name, base){ return usePreset && BY_KEY[name] && BY_KEY[name].preset !== undefined ? BY_KEY[name].preset : base; };
}

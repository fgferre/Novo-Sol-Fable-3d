// Coleção persistente do Museu Solar. Este módulo não decide se algo foi
// realmente visto: o motor educativo deve chamar recordEduDiscovery somente
// depois de a narrativa ter passado pela projeção e aparecido na tela. Assim,
// a coleção representa descobertas, não simples tentativas do simulador.
//
// O armazenamento é propositalmente sem texto de interface. Chaves de família
// e de vista são estáveis entre idiomas; o painel escolhe os rótulos PT/EN.

var STORAGE_KEY = 'solEduCollection.v1';
// PR-8 — 5→8 famílias, SEM bump de versão: a mudança é aditiva por
// construção (normalizedState só copia pares família/vista conhecidos, e um
// store antigo simplesmente não tem as famílias novas — elas nascem "ainda
// não observadas"). A ordem é a narrativa da visita guiada: da camada que se
// enxerga primeiro até o ritmo de 11 anos.
// PR-9 — 8→10 (mesma regra aditiva): granulation entra logo após surface (o
// close-up da mesma camada) e spicules após prominence (a franja do limbo,
// vizinha das estruturas de borda).
// PR-10 — 10→11 (mesma regra aditiva): coronalHole logo após corona — a
// janela escura é uma leitura da própria coroa volumétrica.
var VERSION = 1;
var ORDER = ['surface','granulation','spots','loops','flare','cme','prominence','spicules','corona','coronalHole','cycle'];
var FAMILIES = {
  surface:['surface'],
  granulation:['granulation'],
  spots:['spots'],
  loops:['loops'],
  flare:['flare'],
  cme:['cme'],
  prominence:['prominence','filament'],
  spicules:['spicules'],
  corona:['corona'],
  coronalHole:['coronalHole'],
  cycle:['cycleMaximum','cycleMinimum']
};

function blankState(){
  return {v:VERSION,order:ORDER.slice(),items:{}};
}

function storageForBrowser(){
  // A simulação também roda em testes e em contextos onde localStorage pode
  // estar bloqueado. Ler a coleção nunca pode impedir a cena de iniciar.
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch(e){}
  return null;
}

function isKnownView(family,view){
  return !!(FAMILIES[family] && FAMILIES[family].indexOf(view) !== -1);
}

function normalizedState(raw){
  var next = blankState();
  if (!raw || raw.v !== VERSION || !raw.items || typeof raw.items !== 'object') return next;
  ORDER.forEach(function(family){
    var source = raw.items[family];
    if (!source || !source.views || typeof source.views !== 'object') return;
    FAMILIES[family].forEach(function(view){
      if (source.views[view] === true){
        if (!next.items[family]) next.items[family] = {views:{}};
        next.items[family].views[view] = true;
      }
    });
  });
  return next;
}

function loadState(storage){
  if (!storage) return blankState();
  try {
    var raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizedState(JSON.parse(raw)) : blankState();
  } catch(e){
    return blankState();
  }
}

function mergeState(target, incoming){
  // Duas abas podem descobrir fenômenos diferentes antes de uma delas ser
  // fechada. Unir as vistas verdadeiras antes de salvar evita que uma gravação
  // tardia apague a descoberta da outra.
  ORDER.forEach(function(family){
    var source = incoming.items[family];
    if (!source || !source.views) return;
    FAMILIES[family].forEach(function(view){
      if (!source.views[view]) return;
      if (!target.items[family]) target.items[family] = {views:{}};
      target.items[family].views[view] = true;
    });
  });
  return target;
}

function discoveryFor(type,contentKey){
  // O tipo descreve o emissor físico; contentKey descreve a vista que foi
  // apresentada. Aceitamos ambos para que o ciclo (global) e proeminências
  // (cuja cópia muda com a câmera) usem a mesma API pequena.
  var key = contentKey || type;
  if (type === 'flare') return {family:'flare',views:['flare']};
  if (type === 'cme') return {family:'cme',views:['cme']};
  if (type === 'spots') return {family:'spots',views:['spots']};
  // PR-8/PR-9: famílias de vista única — o tipo do emissor É a família.
  if (type === 'surface') return {family:'surface',views:['surface']};
  if (type === 'granulation') return {family:'granulation',views:['granulation']};
  if (type === 'loops') return {family:'loops',views:['loops']};
  if (type === 'spicules') return {family:'spicules',views:['spicules']};
  if (type === 'corona') return {family:'corona',views:['corona']};
  if (type === 'coronalHole') return {family:'coronalHole',views:['coronalHole']};
  if (type === 'cycleMaximum') return {family:'cycle',views:['cycleMaximum']};
  if (type === 'cycleMinimum') return {family:'cycle',views:['cycleMinimum']};
  if (type === 'cycle'){
    if (key === 'cycleMaximum') return {family:'cycle',views:['cycleMaximum']};
    if (key === 'cycleMinimum') return {family:'cycle',views:['cycleMinimum']};
    return null;
  }
  if (type === 'prominence'){
    // Na transição junto ao limbo, a explicação combina os dois nomes; a
    // pessoa observou as duas leituras legítimas da mesma estrutura.
    return {family:'prominence',views:key === 'filament' ? ['filament'] : key === 'prominenceFilament' ? ['prominence','filament'] : ['prominence']};
  }
  // O fallback facilita importações/migrações que guardaram só a chave de
  // conteúdo, mas não deixa contentKey trocar a família de um emissor válido.
  if (key === 'flare') return {family:'flare',views:['flare']};
  if (key === 'cme') return {family:'cme',views:['cme']};
  if (key === 'spots') return {family:'spots',views:['spots']};
  if (key === 'surface') return {family:'surface',views:['surface']};
  if (key === 'granulation') return {family:'granulation',views:['granulation']};
  if (key === 'loops') return {family:'loops',views:['loops']};
  if (key === 'spicules') return {family:'spicules',views:['spicules']};
  if (key === 'corona') return {family:'corona',views:['corona']};
  if (key === 'coronalHole') return {family:'coronalHole',views:['coronalHole']};
  if (key === 'cycleMaximum') return {family:'cycle',views:['cycleMaximum']};
  if (key === 'cycleMinimum') return {family:'cycle',views:['cycleMinimum']};
  if (key === 'prominence' || key === 'filament' || key === 'prominenceFilament'){
    return {family:'prominence',views:key === 'filament' ? ['filament'] : key === 'prominenceFilament' ? ['prominence','filament'] : ['prominence']};
  }
  return null;
}

function emptyInfo(){
  return Object.freeze({available:false,version:VERSION,order:Object.freeze([]),totalFamilies:0,
    discoveredFamilies:0,totalViews:0,discoveredViews:0,complete:false,items:Object.freeze({})});
}

export function createEduCollection(ctx){
  // ?det=1 exige ausência de efeitos persistentes. As funções são inertes
  // para que consumidores possam chamá-las sem condicionais extras, mas não
  // existe estado de sessão, leitura nem escrita em localStorage.
  if (ctx.DET){
    var detInfo = emptyInfo();
    ctx.eduCollectionInfo = function(){ return detInfo; };
    ctx.recordEduDiscovery = function(){ return false; };
    ctx.clearEduCollection = function(){ return false; };
    return;
  }

  var storage = storageForBrowser();
  var state = loadState(storage);

  function refreshFromStorage(){
    if (storage) mergeState(state,loadState(storage));
  }

  function hasView(family,view){
    return !!(state.items[family] && state.items[family].views && state.items[family].views[view]);
  }

  function snapshot(){
    refreshFromStorage();
    var items = {};
    var discoveredFamilies = 0, discoveredViews = 0, totalViews = 0;
    ORDER.forEach(function(family){
      var views = {}, seen = false, found = 0;
      FAMILIES[family].forEach(function(view){
        var present = hasView(family,view);
        views[view] = present;
        totalViews++;
        if (present){ found++; discoveredViews++; seen = true; }
      });
      if (seen) discoveredFamilies++;
      items[family] = {seen:seen,views:views,discoveredViews:found,totalViews:FAMILIES[family].length};
    });
    return {
      available:true,
      version:VERSION,
      order:ORDER.slice(),
      totalFamilies:ORDER.length,
      discoveredFamilies:discoveredFamilies,
      totalViews:totalViews,
      discoveredViews:discoveredViews,
      complete:discoveredViews === totalViews,
      items:items
    };
  }

  function save(){
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY,JSON.stringify(state));
      return true;
    } catch(e){
      return false;
    }
  }

  function notify(){
    // O painel pode instalar/trocar este callback depois da fábrica. Erros de
    // interface não podem interromper o loop de renderização.
    if (typeof ctx.onEduCollectionChange !== 'function') return;
    try { ctx.onEduCollectionChange(snapshot()); } catch(e){}
  }

  ctx.eduCollectionInfo = snapshot;

  ctx.recordEduDiscovery = function(type,contentKey){
    refreshFromStorage();
    var discovery = discoveryFor(type,contentKey);
    if (!discovery) return false;
    var changed = false;
    discovery.views.forEach(function(view){
      if (!isKnownView(discovery.family,view) || hasView(discovery.family,view)) return;
      if (!state.items[discovery.family]) state.items[discovery.family] = {views:{}};
      state.items[discovery.family].views[view] = true;
      changed = true;
    });
    // Idempotência é importante: o mesmo cartão pode permanecer na tela por
    // muitos frames, mas uma descoberta só deve alterar a coleção uma vez.
    if (!changed) return false;
    save();
    notify();
    return true;
  };

  ctx.clearEduCollection = function(){
    refreshFromStorage();
    var hadDiscoveries = false;
    ORDER.forEach(function(family){
      FAMILIES[family].forEach(function(view){ if (hasView(family,view)) hadDiscoveries = true; });
    });
    if (!hadDiscoveries){
      // Também descarta uma carga antiga/corrompida quando a pessoa pede
      // limpeza, sem fingir que a coleção visível mudou.
      if (storage){ try { storage.removeItem(STORAGE_KEY); } catch(e){} }
      return false;
    }
    state = blankState();
    // Remover em vez de gravar um objeto vazio deixa a próxima visita com o
    // estado inicial e não escreve nada antes de uma ação explícita do usuário.
    if (storage){ try { storage.removeItem(STORAGE_KEY); } catch(e){} }
    notify();
    return true;
  };
}

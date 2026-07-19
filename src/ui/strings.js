// ui/strings.js — fonte única das strings do PAINEL (PR-11 da série Museu).
// Decisão do dono: "mude para EN: absolutamente tudo muda" — o painel inteiro
// troca de idioma junto com o seletor PT/EN da camada educativa.
//
// Regras deste módulo:
// - PT continua sendo a língua-fonte. Os campos `label` do CONTROL_SCHEMA
//   (core/controls.js) NÃO mudam: vários QA e o __solInfo leem `.label` como
//   contrato; o painel resolve o idioma NA RENDERIZAÇÃO via CONTROL_LABELS_EN.
// - Templates usam {placeholders} substituídos por String.replace no painel —
//   nada de motor de template.
// - As strings PT são byte-idênticas às que o painel sempre exibiu (os QA
//   qa-control-state/qa-edu asseveram várias delas em det/default).

export const PANEL_STRINGS = {
  pt: {
    title: 'Ajustes',
    subtitle: 'cena, luz e câmera · salvo neste aparelho',
    loading: 'inicializando simulação…',
    sections: {
      'experiência': 'experiência',
      'tempo': 'tempo',
      'luz & cor': 'luz & cor',
      'cinema': 'cinema',
      'coroa': 'coroa',
      'céu': 'céu',
      'look': 'look',
      'diagnóstico': 'diagnóstico',
      'qualidade': 'qualidade'
    },
    eduSwitch: 'Descobertas educativas',
    tourStart: 'começar visita guiada',
    tourActive: 'visita guiada em andamento',
    langLabel: 'Idioma / Language',
    langGroupAria: 'Idioma da experiência educativa',
    collection: {
      section: 'coleção',
      open: 'Coleção',
      of: 'de',
      observed: 'observadas',
      notSeen: 'Ainda não observada',
      views: 'vistas observadas',
      clear: 'Limpar descobertas observadas',
      confirm: 'Limpar as descobertas observadas neste aparelho? Esta ação não pode ser desfeita.',
      // PR-12: linha serena do estado completo (11 de 11 famílias).
      complete: 'Coleção completa — você observou o Sol inteiro'
    },
    // PR-12 — postal: o botão vive na seção experiência; a marca da faixa
    // segue o chrome do museu (brand + brandTag da língua corrente).
    postcard: {
      button: 'Guardar esta vista',
      buttonAria: 'Guardar esta vista do Sol como imagem',
      brand: '☉ SOL — uma estrela viva'
    },
    state: {
      'director-override': 'efetivo {value} durante o diretor',
      'tier-unavailable': 'indisponível nesta qualidade',
      'autotune-disabled': 'desativado pelo ajuste automático',
      'preparing': 'preparando volume',
      'waiting-flare': 'aguardando flare',
      'cooldown': 'aguarde o rescaldo',
      'fit-framing': 'sem efeito no enquadramento geral',
      'lapse-fallback': 'profundidade automática: 100% pelo time-lapse'
    },
    preview: {
      'source-empty': 'defina intensidade para a prévia',
      'event-active': 'evento em andamento',
      'cooldown': 'aguarde o rescaldo',
      'not-visible': 'nenhuma região visível',
      'tier-unavailable': 'indisponível nesta qualidade',
      'autotune-disabled': 'desativado pelo ajuste automático'
    },
    cycleIn: '× · ciclo em ~',
    grainLevels: '≈ ±{value} níveis (8-bit)',
    decimalComma: true,
    actions: {
      solarMax: 'máximo solar',
      solarMaxAria: 'acelerar o ciclo até o máximo solar (prévia)',
      solarMin: 'mínimo solar',
      solarMinAria: 'acelerar o ciclo até o mínimo solar (prévia)',
      approach: 'aproximar',
      approachAria: 'aproximar para ativar foco raso',
      flare: 'disparar flare',
      flareAria: 'disparar flare de prévia',
      cme: 'ejetar CME',
      cmeAria: 'ejetar CME de prévia',
      reactivate: 'reativar',
      reactivateAria: 'reativar {label}'
    },
    tourBlocked: 'indisponível durante a visita guiada',
    idleSwitch: 'Respiração contemplativa',
    hudSwitch: 'HUD de FPS',
    lookApply: 'aplicar look Sunshine',
    director: '▶ modo diretor (sequência)',
    tierReloadNote: 'trocar a qualidade recarrega a cena',
    tierRecommended: 'qualidade recomendada para a próxima carga: {tier}',
    tierApply: 'aplicar {tier} e recarregar',
    reset: 'restaurar padrão',
    resetConfirm: 'Restaurar toda a sessão e recarregar a cena?',
    gearTitle: 'ajustes',
    gearOpen: 'abrir ajustes',
    gearClose: 'fechar ajustes',
    gearAttention: ' — atenção: ',
    attention: {
      cmeOff: 'CME desativada',
      cvolOff: 'coroa volumétrica desativada',
      tierRecommended: 'qualidade {tier} recomendada'
    }
  },
  en: {
    title: 'Settings',
    subtitle: 'scene, light & camera · saved on this device',
    loading: 'initializing simulation…',
    sections: {
      'experiência': 'experience',
      'tempo': 'time',
      'luz & cor': 'light & color',
      'cinema': 'cinema',
      'coroa': 'corona',
      'céu': 'sky',
      'look': 'look',
      'diagnóstico': 'diagnostics',
      'qualidade': 'quality'
    },
    eduSwitch: 'Educational discoveries',
    tourStart: 'start guided visit',
    tourActive: 'guided visit in progress',
    langLabel: 'Idioma / Language',
    langGroupAria: 'Language of the educational experience',
    collection: {
      section: 'collection',
      open: 'Collection',
      of: 'of',
      observed: 'observed',
      notSeen: 'Not observed yet',
      views: 'views seen',
      clear: 'Clear observed discoveries',
      confirm: 'Clear the discoveries observed on this device? This cannot be undone.',
      // PR-12: serene complete-state line (11 of 11 families).
      complete: 'Collection complete — you have seen the whole Sun'
    },
    // PR-12 — postcard (see PT note).
    postcard: {
      button: 'Save this view',
      buttonAria: 'Save this view of the Sun as an image',
      brand: '☉ SOL — a living star'
    },
    state: {
      'director-override': 'effective {value} while the director runs',
      'tier-unavailable': 'unavailable at this quality',
      'autotune-disabled': 'disabled by auto-tuning',
      'preparing': 'preparing the volume',
      'waiting-flare': 'waiting for a flare',
      'cooldown': 'wait for the afterglow',
      'fit-framing': 'no effect in the wide framing',
      'lapse-fallback': 'automatic depth: 100% from the time-lapse'
    },
    preview: {
      'source-empty': 'set an intensity for the preview',
      'event-active': 'event in progress',
      'cooldown': 'wait for the afterglow',
      'not-visible': 'no visible region',
      'tier-unavailable': 'unavailable at this quality',
      'autotune-disabled': 'disabled by auto-tuning'
    },
    cycleIn: '× · cycle in ~',
    grainLevels: '≈ ±{value} levels (8-bit)',
    decimalComma: false,
    actions: {
      solarMax: 'solar maximum',
      solarMaxAria: 'accelerate the cycle to solar maximum (preview)',
      solarMin: 'solar minimum',
      solarMinAria: 'accelerate the cycle to solar minimum (preview)',
      approach: 'move closer',
      approachAria: 'move closer to enable shallow focus',
      flare: 'trigger flare',
      flareAria: 'trigger a preview flare',
      cme: 'launch CME',
      cmeAria: 'launch a preview CME',
      reactivate: 'reactivate',
      reactivateAria: 'reactivate {label}'
    },
    tourBlocked: 'unavailable during the guided visit',
    idleSwitch: 'Contemplative drift',
    hudSwitch: 'FPS HUD',
    lookApply: 'apply Sunshine look',
    director: '▶ director mode (sequence)',
    tierReloadNote: 'changing quality reloads the scene',
    tierRecommended: 'recommended quality for the next load: {tier}',
    tierApply: 'apply {tier} and reload',
    reset: 'restore defaults',
    resetConfirm: 'Restore the whole session and reload the scene?',
    gearTitle: 'settings',
    gearOpen: 'open settings',
    gearClose: 'close settings',
    gearAttention: ' — attention: ',
    attention: {
      cmeOff: 'CME disabled',
      cvolOff: 'volumetric corona disabled',
      tierRecommended: 'quality {tier} recommended'
    }
  }
};

// Labels EN dos sliders, key → label (o `label` PT do CONTROL_SCHEMA segue
// sendo a fonte default; o painel resolve
// `lang==='en' ? CONTROL_LABELS_EN[key]||label : label` ao renderizar).
export const CONTROL_LABELS_EN = {
  edu: 'Educational discoveries',
  speed: 'Time flow',
  pmode: 'Oscillations (p-modes)',
  cycle: 'Cycle depth',
  lapse: 'Cycle speed',
  spots: 'Sunspots (groups)',
  bloom: 'Bloom',
  bloomth: 'Bloom threshold',
  bloomknee: 'Bloom softness',
  bloomspread: 'Bloom spread',
  exposure: 'Exposure',
  plageglow: 'Plage glow',
  sat: 'Saturation',
  vig: 'Vignette',
  grain: 'Film grain',
  veil: 'Halation (glare)',
  streak: 'Anamorphic flare',
  burst: 'Starburst (diffraction)',
  disp: 'Spectral bloom (dispersion)',
  hal: 'Warm halation (blackbody)',
  adapt: 'Eye (adaptation)',
  fringe: 'Lens fringing',
  shimmer: 'Limb heat shimmer',
  tone: 'Sunshine grade',
  film: 'Film (ACES→AgX)',
  hand: 'Handheld micro-movement',
  dof: 'Shallow focus (hex bokeh)',
  halo: 'Coronal halo',
  ray: 'Streamers',
  cact: 'Activity response',
  cvol: 'Volumetric corona (raymarch)',
  cme: 'CME (eruption)',
  loops: 'Coronal loops',
  fprom: 'Filament absorption',
  stars: 'Stars',
  mw: 'Milky Way'
};

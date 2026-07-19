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
    // PR-14 — ajuda "?": aria do botão e micro-título da seção "o que você vê".
    helpAria: 'explicação: {label}',
    helpVisualHead: 'o que você vê',
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
    // PR-14 — "?" help: button aria + "what you see" micro-heading.
    helpAria: 'explanation: {label}',
    helpVisualHead: 'what you see',
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

// PR-14 — ajuda "?" ao lado de cada controle do painel. Cada entrada tem:
//   what   → o que o controle faz (1-2 frases, sem jargão);
//   visual → UMA frase concreta e observável ("suba e X acontece");
//   edu    → opcional, só onde há física real a ensinar (prefixo ☉ na UI).
// Chaves = keys visíveis do CONTROL_SCHEMA + o chrome do painel
// ('switch-*', 'btn-*', 'collection', 'tier'). DECISÃO: as ações inline
// (disparar flare, ejetar CME, máximo/mínimo solar, aproximar, reativar)
// HERDAM a ajuda da linha do knob — o texto do knob cita o botão quando
// existe. A completude é cobrada em código: o painel emite console.warn
// ('[help] sem ajuda: <key>') para qualquer linha sem entrada, e
// tools/qa-panel-help.js cobra zero warnings; tools/lint-content.js cobra
// paridade PT↔EN (mesmas chaves, desvio de tamanho ≤50% por campo).
export const HELP = {
  pt: {
    speed: {
      what: 'Controla o andamento do tempo da simulação inteira.',
      visual: 'Suba e tudo acelera junto: o fervilhar da superfície, os arcos e as erupções.'
    },
    pmode: {
      what: 'Liga as oscilações globais da superfície, os chamados modos-p.',
      visual: 'No alto, o disco inteiro pulsa devagar, como uma respiração.',
      edu: 'O Sol vibra como um sino em milhões de tons; medindo essas ondas, a heliossismologia enxerga o interior da estrela.'
    },
    cycle: {
      what: 'Define o quanto a atividade varia entre o mínimo e o máximo do ciclo solar. Os botões de prévia aceleram até cada extremo.',
      visual: 'No fundo do ciclo o disco fica quase limpo; no topo, coberto de manchas e erupções.',
      edu: 'O Sol vive um ciclo de ~11 anos: as manchas se multiplicam, minguam e o campo magnético troca os polos.'
    },
    lapse: {
      what: 'Comprime o ciclo solar num time-lapse: quanto mais alto, mais rápido a estrela percorre mínimo e máximo.',
      visual: 'Suba e veja manchas florescerem e sumirem em ondas, em poucos minutos.'
    },
    spots: {
      what: 'Regula a força dos grupos de manchas na superfície.',
      visual: 'Suba e as manchas ganham grupos maiores, cercadas por véus claros (plages).',
      edu: 'Manchas são regiões onde o campo magnético trava o calor que sobe: ~1.500 °C mais frias que a vizinhança — por isso escuras.'
    },
    bloom: {
      what: 'Intensidade do transbordo de luz das áreas mais brilhantes.',
      visual: 'Suba e o clarão em volta do disco cresce e amacia.'
    },
    bloomth: {
      what: 'Define a partir de que brilho a luz começa a transbordar.',
      visual: 'Baixe e até regiões médias passam a brilhar; suba e só o núcleo mais intenso transborda.'
    },
    bloomknee: {
      what: 'Suaviza a fronteira entre o que transborda luz e o que não.',
      visual: 'Mais alto, o clarão entra gradual, sem borda dura.'
    },
    bloomspread: {
      what: 'Controla até onde o clarão se espalha a partir da fonte.',
      visual: 'Suba e o halo de luz alcança mais longe do disco.'
    },
    exposure: {
      what: 'Exposição da câmera: quanta luz entra na imagem.',
      visual: 'A cena inteira clareia ou escurece, como abrir ou fechar o diafragma.'
    },
    plageglow: {
      what: 'Reforça o brilho das plages, os véus claros ao redor das manchas.',
      visual: 'Suba e as regiões em volta das manchas acendem.',
      edu: 'Plages são campos magnéticos mais brandos que aquecem a atmosfera baixa — companheiras luminosas de quase toda mancha.'
    },
    sat: {
      what: 'Saturação: a vivacidade das cores da imagem.',
      visual: 'No zero a cena vira quase preto e branco; no alto, os laranjas queimam.'
    },
    vig: {
      what: 'Vinheta: escurecimento suave dos cantos do quadro.',
      visual: 'Suba e as bordas da tela escurecem, concentrando o olhar no Sol.'
    },
    grain: {
      what: 'Grão de filme: a textura granulada de película fotográfica.',
      visual: 'Suba e a imagem ganha um chuvisco fino, como filme antigo.'
    },
    veil: {
      what: 'Halação: um véu de luz difusa por cima da cena.',
      visual: 'Suba e um leve nevoeiro luminoso lava a imagem inteira.'
    },
    streak: {
      what: 'Flare anamórfico: o risco horizontal de luz das lentes de cinema.',
      visual: 'Suba e um traço de luz cruza a tela a partir dos pontos mais brilhantes.'
    },
    burst: {
      what: 'Starburst: pontas de estrela que nascem quando um flare estoura. O botão da linha provoca um flare para você ver.',
      visual: 'Quando vier um flare, raios de luz em estrela varrem a tela por alguns segundos.',
      edu: 'As pontas vêm da difração no diafragma de uma câmera — e aqui só aparecem quando a estrela realmente entra em erupção: uma estrela, um estado.'
    },
    disp: {
      what: 'Dispersão espectral: o clarão se separa de leve nas cores do arco-íris.',
      visual: 'Nos momentos brilhantes, franjas de cor surgem na borda da luz.'
    },
    hal: {
      what: 'Halação quente: o clarão ganha o tom alaranjado de metal em brasa.',
      visual: 'Nos flares, a luz estoura com um anel quente cor de brasa.',
      edu: 'A cor segue a física do corpo negro: quanto mais quente a fonte, mais o brilho desliza do vermelho ao branco-azulado.'
    },
    adapt: {
      what: 'Olho: a exposição reage aos clarões como uma pupila.',
      visual: 'Depois de um flare, a cena escurece por um instante e respira de volta.'
    },
    fringe: {
      what: 'Franja da lente: aberração de cor nas bordas de alto contraste.',
      visual: 'Suba e os contornos ganham fios finos de verde e magenta.'
    },
    shimmer: {
      what: 'Tremulação de calor na borda do disco, como ar quente sobre asfalto.',
      visual: 'Olhe a borda do disco: ela ondula de leve, feito miragem.'
    },
    tone: {
      what: 'Grade de cor inspirada no filme Sunshine: sombras frias, altas luzes queimadas.',
      visual: 'Suba e a imagem inteira ganha um acabamento de cinema, mais quente e dramático.'
    },
    film: {
      what: 'Mistura a curva de cor entre dois padrões de cinema digital (ACES e AgX).',
      visual: 'Deslize e o contraste rola diferente: as altas luzes seguram mais detalhe.'
    },
    hand: {
      what: 'Micro-movimento de câmera na mão, como num documentário.',
      visual: 'Suba e o enquadramento balança de leve — vivo, nunca parado.'
    },
    dof: {
      what: 'Foco raso: desfoque de profundidade quando a câmera chega perto. O botão da linha leva você até lá.',
      visual: 'De perto, o que sai do plano de foco derrete em discos hexagonais de luz.'
    },
    halo: {
      what: 'Brilho difuso da coroa, a atmosfera externa do Sol.',
      visual: 'Suba e um halo perolado envolve o disco.',
      edu: 'A coroa só aparece a olho nu em eclipses totais — o disco é um milhão de vezes mais brilhante que ela.'
    },
    ray: {
      what: 'Streamers: os raios longos e afilados da coroa.',
      visual: 'Suba e pétalas de luz se esticam para longe do disco.',
      edu: 'Streamers são o vento solar penteado pelo campo magnético — o desenho que fotógrafos caçam em cada eclipse.'
    },
    cact: {
      what: 'O quanto a coroa responde ao estado de atividade da estrela.',
      visual: 'No máximo do ciclo, com este alto, a coroa incha e se agita visivelmente.'
    },
    cvol: {
      what: 'Coroa volumétrica: a atmosfera externa como um volume 3D atravessado pela luz.',
      visual: 'A coroa ganha corpo e profundidade — gire e o desenho muda com o ângulo.',
      edu: 'Repare nas regiões escuras: são buracos coronais, onde o campo magnético se abre e deixa escapar o vento solar rápido.'
    },
    cme: {
      what: 'Força das ejeções de massa coronal, bolhas de plasma lançadas após flares fortes. O botão da linha dispara uma prévia.',
      visual: 'Depois de um flare forte, uma bolha de plasma se desprende e atravessa a coroa.',
      edu: 'Uma CME real carrega bilhões de toneladas de plasma; quando atinge a Terra, acende auroras e sacode redes elétricas.'
    },
    loops: {
      what: 'Loops coronais: arcos de plasma presos nas linhas do campo magnético.',
      visual: 'Arcos finos e luminosos desenham pontes sobre as regiões ativas.',
      edu: 'Cada arco é um tubo de plasma a ~1 milhão de graus, escorado por magnetismo — o Sol desenhando as próprias linhas de campo.'
    },
    fprom: {
      what: 'Absorção dos filamentos: fios de plasma frio vistos contra o disco.',
      visual: 'Serpentes escuras cruzam o disco; na borda, os mesmos fios brilham.',
      edu: 'Filamento e proeminência são a mesma estrutura: escura contra o disco, incandescente contra o fundo do espaço.'
    },
    stars: {
      what: 'Brilho das estrelas de fundo.',
      visual: 'Suba e o campo estelar acende ao redor do Sol.'
    },
    mw: {
      what: 'Presença da Via Láctea ao fundo.',
      visual: 'Suba e a faixa enevoada da galáxia atravessa o fundo.'
    },
    'switch-edu': {
      what: 'Liga os cartões de descoberta: quando algo acontece no Sol, um cartão nomeia e explica.',
      visual: 'Em um ou dois minutos, um cartão surge apontando um fenômeno na cena.'
    },
    'switch-idle': {
      what: 'Deriva contemplativa: sem toques, a câmera passa a vagar sozinha, bem devagar.',
      visual: 'Solte tudo por alguns segundos e o enquadramento começa a deslizar.'
    },
    'switch-hud': {
      what: 'Mostra o medidor de quadros por segundo, para diagnóstico.',
      visual: 'Um contador discreto de FPS aparece no canto da tela.'
    },
    'btn-tour': {
      what: 'Uma visita guiada por dez salas: a câmera viaja de fenômeno em fenômeno com um texto curto por parada.',
      visual: 'O painel fecha e a primeira sala começa; toque para avançar no seu ritmo.'
    },
    'btn-lang': {
      what: 'Troca o idioma de toda a experiência entre português e inglês.',
      visual: 'Painel, cartões e visita mudam de língua na hora.'
    },
    collection: {
      what: 'Sua coleção de descobertas: tudo o que você já observou, família por família.',
      visual: 'Abra para ver o placar; toque numa família observada para reler o texto.'
    },
    'btn-postcard': {
      what: 'Guarda a vista atual como um postal: a imagem exata da tela, com a marca do museu.',
      visual: 'O aparelho oferece compartilhar ou salvar a imagem do SEU Sol.'
    },
    'btn-look': {
      what: 'Aplica de uma vez o visual inspirado no filme Sunshine: vários ajustes de cinema mudam juntos.',
      visual: 'A cena ganha na hora um acabamento mais quente e dramático.'
    },
    'btn-director': {
      what: 'Modo diretor: uma sequência automática de planos de câmera, como um pequeno filme.',
      visual: 'O painel fecha e a câmera encadeia enquadramentos sozinha; qualquer toque devolve o controle.'
    },
    tier: {
      what: 'Nível de qualidade gráfica. Trocar recarrega a cena no nível novo.',
      visual: 'Níveis altos ligam a atmosfera volumétrica e as erupções completas; baixos priorizam fluidez.'
    },
    'btn-reset': {
      what: 'Restaura tudo ao padrão de fábrica: ajustes, qualidade e estados salvos neste aparelho.',
      visual: 'A cena recarrega limpa, como na primeira visita.'
    }
  },
  en: {
    speed: {
      what: 'Sets the pace of time for the whole simulation.',
      visual: 'Raise it and everything speeds up together: the churning surface, the arcs, the eruptions.'
    },
    pmode: {
      what: 'Turns on the global surface oscillations known as p-modes.',
      visual: 'Turned up, the whole disk pulses slowly, like breathing.',
      edu: 'The Sun rings like a bell in millions of tones; by reading those waves, helioseismology sees inside the star.'
    },
    cycle: {
      what: 'Sets how much activity swings between the minimum and maximum of the solar cycle. The preview buttons rush to each extreme.',
      visual: 'At the cycle floor the disk is almost clean; at the peak it is covered in spots and eruptions.',
      edu: 'The Sun lives an ~11-year cycle: sunspots multiply, fade away, and the magnetic field swaps its poles.'
    },
    lapse: {
      what: 'Compresses the solar cycle into a time-lapse: the higher, the faster the star sweeps from minimum to maximum.',
      visual: 'Raise it and watch spots bloom and vanish in waves, within minutes.'
    },
    spots: {
      what: 'Sets the strength of the sunspot groups on the surface.',
      visual: 'Raise it and the spots grow into larger groups, wrapped in bright veils (plages).',
      edu: 'Sunspots are regions where the magnetic field blocks the rising heat: ~1,500 °C cooler than their surroundings — hence the dark look.'
    },
    bloom: {
      what: 'Strength of the light spill from the brightest areas.',
      visual: 'Raise it and the glow around the disk grows and softens.'
    },
    bloomth: {
      what: 'Sets the brightness level at which light starts to spill over.',
      visual: 'Lower it and even mid-bright regions start to glow; raise it and only the fiercest core spills.'
    },
    bloomknee: {
      what: 'Softens the boundary between what spills light and what does not.',
      visual: 'Higher up, the glow eases in gradually, with no hard edge.'
    },
    bloomspread: {
      what: 'Controls how far the glow spreads from its source.',
      visual: 'Raise it and the halo of light reaches farther from the disk.'
    },
    exposure: {
      what: 'Camera exposure: how much light enters the image.',
      visual: 'The whole scene brightens or darkens, like opening or closing the aperture.'
    },
    plageglow: {
      what: 'Boosts the glow of plages, the bright veils around sunspots.',
      visual: 'Raise it and the regions around the spots light up.',
      edu: 'Plages are milder magnetic fields that heat the low atmosphere — the luminous companions of nearly every sunspot.'
    },
    sat: {
      what: 'Saturation: how vivid the colors of the image are.',
      visual: 'At zero the scene turns almost black and white; high up, the oranges burn.'
    },
    vig: {
      what: 'Vignette: a soft darkening of the frame corners.',
      visual: 'Raise it and the screen edges darken, drawing the eye to the Sun.'
    },
    grain: {
      what: 'Film grain: the speckled texture of photographic film.',
      visual: 'Raise it and the image picks up a fine drizzle, like old film stock.'
    },
    veil: {
      what: 'Halation: a veil of diffuse light over the scene.',
      visual: 'Raise it and a faint luminous mist washes the whole image.'
    },
    streak: {
      what: 'Anamorphic flare: the horizontal streak of light from cinema lenses.',
      visual: 'Raise it and a stripe of light crosses the screen from the brightest points.'
    },
    burst: {
      what: 'Starburst: star-shaped spikes born when a flare erupts. The button on this line fires a flare so you can watch.',
      visual: 'When a flare comes, star-like rays of light sweep the screen for a few seconds.',
      edu: 'The spikes come from diffraction in a camera aperture — and here they only appear when the star truly erupts: one star, one state.'
    },
    disp: {
      what: 'Spectral dispersion: the glare splits slightly into rainbow colors.',
      visual: 'In bright moments, fringes of color appear at the edge of the light.'
    },
    hal: {
      what: 'Warm halation: the glare takes on the orange tone of glowing metal.',
      visual: 'During flares, the light blooms with a hot, ember-colored ring.',
      edu: 'The color follows blackbody physics: the hotter the source, the more its glow slides from red toward blue-white.'
    },
    adapt: {
      what: 'Eye: the exposure reacts to bright bursts like a pupil.',
      visual: 'After a flare, the scene darkens for a moment and breathes back.'
    },
    fringe: {
      what: 'Lens fringing: color aberration along high-contrast edges.',
      visual: 'Raise it and outlines pick up thin threads of green and magenta.'
    },
    shimmer: {
      what: 'Heat shimmer at the edge of the disk, like hot air over asphalt.',
      visual: 'Watch the edge of the disk: it ripples gently, like a mirage.'
    },
    tone: {
      what: 'Color grade inspired by the film Sunshine: cool shadows, scorched highlights.',
      visual: 'Raise it and the whole image takes on a warmer, more dramatic cinema finish.'
    },
    film: {
      what: 'Blends the color curve between two digital-cinema standards (ACES and AgX).',
      visual: 'Slide it and contrast rolls off differently: highlights hold more detail.'
    },
    hand: {
      what: 'Handheld camera micro-movement, documentary style.',
      visual: 'Raise it and the framing sways gently — alive, never still.'
    },
    dof: {
      what: 'Shallow focus: depth blur once the camera gets close. The button on this line takes you there.',
      visual: 'Up close, whatever leaves the focal plane melts into hexagonal discs of light.'
    },
    halo: {
      what: 'Diffuse glow of the corona, the outer atmosphere of the Sun.',
      visual: 'Raise it and a pearly halo wraps the disk.',
      edu: 'To the naked eye the corona only shows during total eclipses — the disk outshines it a million times over.'
    },
    ray: {
      what: 'Streamers: the long, tapering rays of the corona.',
      visual: 'Raise it and petals of light stretch far from the disk.',
      edu: 'Streamers are the solar wind combed by the magnetic field — the shapes photographers chase at every eclipse.'
    },
    cact: {
      what: 'How strongly the corona responds to the activity state of the star.',
      visual: 'At cycle maximum, with this high, the corona swells and stirs visibly.'
    },
    cvol: {
      what: 'Volumetric corona: the outer atmosphere as a 3D volume that light travels through.',
      visual: 'The corona gains body and depth — orbit around and the shape shifts with the angle.',
      edu: 'Notice the dark regions: those are coronal holes, where the magnetic field opens up and lets the fast solar wind escape.'
    },
    cme: {
      what: 'Strength of coronal mass ejections, plasma bubbles hurled out after strong flares. The button on this line fires a preview.',
      visual: 'After a strong flare, a bubble of plasma breaks free and crosses the corona.',
      edu: 'A real CME carries billions of tons of plasma; when it reaches Earth, it lights auroras and rattles power grids.'
    },
    loops: {
      what: 'Coronal loops: arcs of plasma caught in the magnetic field lines.',
      visual: 'Thin, luminous arcs draw bridges over the active regions.',
      edu: 'Each arc is a tube of plasma near a million degrees, held up by magnetism — the Sun tracing its own field lines.'
    },
    fprom: {
      what: 'Filament absorption: threads of cool plasma seen against the disk.',
      visual: 'Dark snakes cross the disk; at the edge, the same threads glow.',
      edu: 'Filament and prominence are the same structure: dark against the disk, incandescent against the black of space.'
    },
    stars: {
      what: 'Brightness of the background stars.',
      visual: 'Raise it and the star field lights up around the Sun.'
    },
    mw: {
      what: 'Presence of the Milky Way behind the scene.',
      visual: 'Raise it and the hazy band of the galaxy stretches across the backdrop.'
    },
    'switch-edu': {
      what: 'Turns on discovery cards: when something happens on the Sun, a card names it and explains.',
      visual: 'Within a minute or two, a card appears pointing at a phenomenon in the scene.'
    },
    'switch-idle': {
      what: 'Contemplative drift: hands off, the camera starts to wander on its own, very slowly.',
      visual: 'Let go for a few seconds and the framing begins to glide.'
    },
    'switch-hud': {
      what: 'Shows the frames-per-second meter, for diagnostics.',
      visual: 'A discreet FPS counter appears in the corner of the screen.'
    },
    'btn-tour': {
      what: 'A guided visit through ten rooms: the camera travels from phenomenon to phenomenon with a short text per stop.',
      visual: 'The panel closes and the first room begins; tap to advance at your own pace.'
    },
    'btn-lang': {
      what: 'Switches the language of the whole experience between Portuguese and English.',
      visual: 'Panel, cards and the visit change language instantly.'
    },
    collection: {
      what: 'Your collection of discoveries: everything you have already observed, family by family.',
      visual: 'Open it to see the tally; tap an observed family to read its text again.'
    },
    'btn-postcard': {
      what: 'Saves the current view as a postcard: the exact image on screen, with the museum mark.',
      visual: 'Your device offers to share or save the image of YOUR Sun.'
    },
    'btn-look': {
      what: 'Applies the look inspired by the film Sunshine in one go: several cinema settings change together.',
      visual: 'The scene instantly takes on a warmer, more dramatic finish.'
    },
    'btn-director': {
      what: 'Director mode: an automatic sequence of camera shots, like a short film.',
      visual: 'The panel closes and the camera chains framings on its own; any touch hands control back.'
    },
    tier: {
      what: 'Graphics quality level. Switching reloads the scene at the new level.',
      visual: 'High levels enable the volumetric atmosphere and full eruptions; low ones favor smoothness.'
    },
    'btn-reset': {
      what: 'Restores everything to factory defaults: settings, quality and states saved on this device.',
      visual: 'The scene reloads clean, as on your very first visit.'
    }
  }
};

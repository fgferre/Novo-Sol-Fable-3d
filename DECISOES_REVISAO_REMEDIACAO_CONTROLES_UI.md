# Decisões após a revisão da remediação dos controles

Este registro acompanha `REVISAO_REMEDIACAO_CONTROLES_UI.md`. Ele separa defeitos
confirmados de escolhas deliberadas para que comentários, relatórios ou testes não
substituam a leitura do código executável.

## Correções aceitas

- `cycle` volta a controlar a profundidade quando `lapse` está ativo. O fallback de
  profundidade completa só ocorre em `cycle=0` e fica explícito no estado da UI.
- `solKnobs` passa a ter versão. O primeiro carregamento de um objeto sem versão
  migra Bloom, p-mode, grão, micro-movimento e a dupla `cycle/lapse` pela resposta
  efetiva prioritária antiga, e não pela igualdade numérica. Em tempo, preserva o
  multiplicador até o teto novo de 40×; o easing passa para a lei nova do plano.
- O cooldown de CME entra no estado efetivo. Prévias validam antes de encerrar o
  diretor, não reiniciam um flare de superfície e escolhem apenas regiões maduras.
- A intensidade nominal de Burst/CME é aplicada uma vez. A prévia cria um evento
  físico canônico e o consumidor óptico/plasmático aplica o knob.
- O estado de degradação do auto-tune ganha indicador discreto na engrenagem e ação
  pública de reativação para CME/CVOL.
- A curva do grão é usada já na construção do pipeline; fórmulas temporais e de
  opacidade das estrelas têm uma implementação compartilhada.
- O drawer recebe semântica, nome acessível, Escape e restauração de foco.
- A cobertura de Bloom passa a observar também o framebuffer final pós-ACES.

## Decisões mantidas

- `loops` continua sendo o controle mestre de loops ambientes e arcadas. `0` sem
  arcadas no default é intencional. O preset Sunshine permanece em `0,55`; alterar
  esse valor ou introduzir um piso não linear exigiria um gate visual comparativo.
- Kills e recomendação de tier do auto-tune continuam restritos à sessão. Persistir
  uma degradação causada por carga transitória criaria um estado ruim difícil de
  diagnosticar. Somente a confirmação “aplicar e recarregar” persiste o tier.
- `bloomspread` continua afetando downsample e, com dispersão, os taps cromáticos de
  upsample. A interação é real; a alegação de artefato/undersampling não foi provada.
  O QA cobre a matriz com e sem dispersão antes de qualquer recalibração física.

## Fora deste patch

Os itens R9 de telemetria ampliada e uma reorganização “básico/avançado” são backlog,
não defeitos bloqueantes. Acrescentar fila técnica de loops ou uma descrição longa a
cada slider aumentaria ruído no painel sem melhorar a ação principal. A próxima
revisão visual pode reconsiderar hierarquia e presets com capturas comparáveis.

## Limite conhecido da migração

Antes deste patch não havia marcador de versão. Portanto, todo `solKnobs` sem versão
é tratado como legado. Isso privilegia usuários de versões anteriores, que são a base
instalada duradoura; valores salvos na curta janela entre a remediação e esta correção
também serão migrados uma vez. O antigo extremo de 40,5× é limitado ao teto canônico
de 40×. Para preservar velocidades antigas de `cycle>1`, o `lapse` migrado pode ficar
temporariamente fora da grade de `0,05`; o valor continua legível com precisão adaptativa
e volta à grade na primeira edição do slider. Depois de `__schemaVersion: 2`, o processo
é idempotente.

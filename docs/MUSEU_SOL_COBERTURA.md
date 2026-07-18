# Museu Solar — cobertura e regra de qualidade

Este documento separa duas experiências que coexistem:

- **Exploração livre:** descobertas curtas que aparecem quando o fenômeno acontece por conta própria.
- **Visita guiada:** roteiro voluntário, com um cartão recolhível por vez, enquadramento assistido e tempo reduzido para leitura.

O modo determinístico (`?det=1`) não cria nenhuma das duas camadas.

## O que a visita já demonstra

| Etapa | O visitante vê | Fonte física usada | Prova automática no iPhone |
|---|---|---|---|
| 1 | Fotosfera e granulação | disco e simulação de convecção já renderizados | cartão não cobre o disco |
| 2 | Manchas escuras e plages claras | região magnética bipolar real | região, geração e visibilidade |
| 3 | Loops coronais | traçador de linhas de campo; só libera depois de um loop real | `loopStatesA.ok` |
| 4 | Flare e arcada pós-flare | emissor canônico do flare e arcada | relógio e fonte do flare |
| 5 | CME | prévia física da CME depois do rescaldo do flare | frente de CME emergida |
| 6 | Filamento | absorção real sobre o disco | uniform de absorção físico |
| 7 | Proeminência | emissão real no limbo | intensidade física da estrutura |
| 8 | Coroa e streamers | raios/halo coronais da cena | camada coronal presente |
| 9 | Máximo solar | relógio físico acelerado até fase 0,5 | fase, amplitude e `hold` reais |
| 10 | Mínimo solar | relógio físico acelerado até fase 0/1 | fase, amplitude e `hold` reais |

Em todas as etapas, a prova `npm run qa:tour` verifica viewport de 390×844, cartão recolhido, botão `+` de ao menos 44 px, pausa do relógio durante a leitura, gesto que devolve a câmera, ausência de colisão cartão/disco e limpeza dos overrides ao sair. Ela grava a evidência em `out/qa-tour/evidence.json`.

## O que também foi corrigido na exploração livre

Máximo e mínimo agora podem gerar explicação no curso natural do ciclo. Antes eles só apareciam durante a prévia do painel; a prova `npm run qa:edu` confirma que o cartão nasce de fase/amplitude físicas sem `cycleEvent` ativo.

## Lacunas assumidas — não vender como pronto ainda

Estas partes visuais existem, mas ainda não têm a cadeia completa “fonte identificável → texto PT/EN → coleção → prova iPhone”:

| Família | Próximo trabalho necessário |
|---|---|
| Buracos coronais e plumas | expor um marcador semântico no volume coronal antes de criar um cartão |
| Espículas | escolher um ponto de interesse no limbo e testar sua legibilidade no celular |
| Granulação detalhada, cromosfera e fibrilas | criar uma vista de aproximação, em vez de tentar apontar uma célula aleatória |
| P-modes | tratar como experimento de laboratório avançado, não como descoberta automática |
| Áudio reativo | continua fora desta entrega; precisa de controle explícito e ativação por gesto |

## Regra para ampliar o acervo

Nenhum novo item entra na visita ou na coleção apenas porque existe um slider. Ele precisa, nesta ordem:

1. sinal físico ou geometria real identificável;
2. condição de visibilidade no enquadramento;
3. explicação curta em português e inglês;
4. item de coleção somente após a observação;
5. prova automatizada em 390×844 e aceite visual em iPhone real.

Isso mantém a experiência com padrão de museu: a interface não promete um fenômeno que a pessoa não está, de fato, vendo.

# Referência — Simulação 3D do Sol

Este diretório guarda o arquivo base do projeto, usado como referência para as próximas etapas de desenvolvimento.

- **`sol3d.html`** — arquivo base da simulação (detalhes abaixo).
- **`images/`** — referências de imagem: astrofotografias solares em H-alpha e o render atual da simulação, documentadas em `images/README.md`.

## `sol3d.html`

Simulação 3D do Sol totalmente autocontida em um único arquivo HTML (~650 KB). Basta abrir no navegador — não há dependências externas nem build.

### O que ele contém

- **Three.js r128** minificado, embutido inline (primeiro bloco `<script>`).
- **Código da simulação** (segundo bloco `<script>`), incluindo:
  - Shaders GLSL customizados: ruído simplex 3D (Ashima Arts) + fBm e ruído celular (Worley) para reproduzir a granulação da fotosfera solar.
  - Convecção fotosférica simulada em tempo real via render targets (textura de simulação).
  - Proeminências solares, campo de estrelas e pós-processamento com bloom multinível.
  - Controles de órbita: arrastar para girar, scroll para aproximar.
- **Qualidade adaptativa**: detecta telas pequenas / toque (`pointer: coarse`) e reduz oitavas de ruído, segmentos da esfera, resolução da simulação, contagem de estrelas e níveis de bloom para manter fluidez em aparelhos fracos.
- Interface em português (título, dica de uso e tela de carregamento) com mensagens de erro amigáveis quando WebGL não está disponível.

### Como usar como referência

O arquivo é o ponto de partida do projeto: as próximas etapas devem evoluir a partir dele (por exemplo, modularizar o código, extrair os shaders, atualizar o Three.js ou adicionar novas camadas físicas). Mantenha este arquivo intacto como registro da versão original.

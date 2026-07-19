# Checklist iPhone — 5 minutos, sem números

Roteiro manual para o dono validar o museu num iPhone de verdade. Nenhum
passo pede julgamento técnico: é sempre "veja X; se não vir, me avise com
print". O QA automatizado já prova tudo em pixels — este checklist confirma
o que só um aparelho real mostra (toque de dedo de verdade, tela OLED,
Safari de verdade).

**Endereço:** o site publicado no GitHub Pages
(`https://fgferre.github.io/Novo-Sol-Fable-3d/`).

---

1. **Abra o site no Safari do iPhone em aba anônima** (aba anônima = visita
   de primeira vez, sem memória). A abertura cinematográfica roda sozinha:
   um plano-sequência que revela o Sol. Um toque na tela pula direto.
   - *Se falhar* (tela preta, abertura não roda, toque não pula): me avise
     com um print e diga o modelo do iPhone.

2. **Só observe por 2 minutos, sem tocar.** Manchas escuras com regiões
   claras ao redor, arcos magnéticos e a coroa aparecem sozinhos. Quando
   vier um flare, a tela explode num starburst e o brilho "respira" como um
   olho se adaptando. Um cartão de descoberta aparece sozinho explicando o
   que acabou de acontecer.
   - *Se falhar* (nada acontece em 2 min, nenhum cartão aparece): me avise
     com um print da tela.

3. **Toque em "▶ Visita guiada"** (o botão na base da tela). Um cartão
   aparece embaixo — o texto deve ser legível com o braço esticado, sem
   apertar os olhos. Toque em "+ Ler": o texto completo abre, o Sol se
   afasta para dar espaço e o movimento congela enquanto você lê.
   - *Se falhar* (texto pequeno demais, cartão cobrindo o Sol, o Sol
     continua se mexendo com o texto aberto): print, por favor.

4. **Arraste o dedo pela tela durante uma etapa.** A câmera obedece o seu
   dedo na hora, o cartão avisa que você assumiu o controle, e o botão
   "Retomar enquadramento" traz a moldura de volta quando você quiser.
   - *Se falhar* (câmera briga com o dedo, aviso não aparece, botão não
     devolve o enquadramento): print.

5. **Vire o telefone de lado numa etapa qualquer.** O cartão fica estreito,
   encostado à esquerda, e o Sol continua visível ao lado do texto.
   - *Se falhar* (cartão gigante cobrindo tudo, texto cortado): print na
     horizontal.

6. **Complete as 10 salas** tocando "Continuar". Na última sala aparece
   "▶ Sessão de cinema" — toque: a visita termina em grande estilo, com a
   câmera passeando sozinha. Um arraste devolve o controle a você.
   - *Se falhar* (visita trava numa sala, botão de cinema não aparece,
     cinema não devolve o controle): me diga em QUAL sala parou + print.

7. **Abra a engrenagem (canto da tela) → Coleção.** Os fenômenos que você
   observou estão marcados. Feche o Safari por completo, abra o site de
   novo (aba normal): as marcas continuam lá.
   - *Se falhar* (coleção vazia depois de tudo que você viu, ou zerada ao
     reabrir): print da coleção.

8. **Opcional:** adicione `?hud=1` ao endereço e me diga o número grande
   que aparece no canto (é o ritmo de quadros). Não precisa interpretar —
   só me dizer o número.
   - *Se falhar* (número não aparece): sem problema, pule.

9. **Opcional (modo quiosque, num tablet se tiver):** abra o site com
   `?kiosk=1&lang=pt` no fim do endereço e deixe o aparelho quieto na mesa.
   Em menos de 1 minuto a visita guiada começa SOZINHA e vai trocando de
   sala sem ninguém tocar; ao fim das 10 salas, a câmera passeia sozinha
   (sessão de cinema) e depois tudo recomeça. Toque na tela a qualquer
   momento: o controle é seu; largue o aparelho de novo e o loop volta.
   Repare que a engrenagem ⚙ some — no quiosque ninguém configura nada.
   - *Se falhar* (visita não começa sozinha, toque não devolve o controle,
     loop não volta): print + em que passo parou.

---

Qualquer coisa estranha fora do roteiro (aviso de erro, tela congelada,
aquecimento forte, bateria despencando): print + uma frase do que estava
fazendo. Isso vira teste automatizado para nunca mais regredir.

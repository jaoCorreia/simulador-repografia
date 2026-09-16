# Simulador de Repografia

Jogo 3D em primeira pessoa feito com Three.js e Vite. Você trabalha numa repografia e precisa vencer seis pedidos, de 12 a 300 folhas, usando um grampeador que claramente não foi projetado para isso.

## Executar

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm run dev
```

Abra http://127.0.0.1:5180. O servidor fica restrito à própria máquina.

```sh
npm test       # Regras, progressão, erros, pausa e pontuação
npm run build # Gera dist/
npm run preview # Prévia do build em http://127.0.0.1:4180
```

## Lobby: a mesa é sua

Entre na firma antes de bater o ponto. Os nove objetos da mesa podem ser selecionados pela cena ou pela lista **Objetos da firma**: grampeador, papéis, caneca com pires, porta-lápis, bloco, lápis, borracha, carimbo e bandeja.

- **Clique e arraste:** selecione e reorganize os objetos sobre a mesa.
- **Q / E** ou roda do mouse: gire o objeto selecionado.
- **F:** pegue para examinar de perto; aperte novamente para devolver.
- **G:** arremesse. O objeto quebra ao atingir a mesa ou o chão.
- **X:** quebre o objeto em fragmentos com física.
- **Enter / Espaço:** use o objeto (beber café, escrever, apagar, carimbar, trocar recado ou organizar papéis).
- **Esc:** devolva e solte a seleção.

**Arrumar a mesa** restaura todos os objetos e suas posições. Para iniciar o expediente, clique no **relógio de ponto fixado na parede**, abaixo da placa da repografia. O cartão entra, recebe o carimbo e sai; depois da confirmação, os desafios começam e a mesa é restaurada automaticamente. Também é possível selecionar o relógio em **Objetos da firma** e pressionar Enter. Usar o grampeador no lobby apenas testa o mecanismo. Pegar, reorganizar, lançar e quebrar são permitidos somente no lobby. Durante os pedidos, cliques e teclas voltam aos controles do grampeador.

A caneca tem parede interna, café rebaixado, alça aberta e estampa que acompanha sua curvatura. As mãos são translúcidas e aparecem só enquanto você aperta o grampeador; não aparecem no lobby.

## Como jogar os pedidos

1. **Alinhamento:** use as setas esquerda e direita para levar o marcador até a faixa verde. Confirme com Espaço ou com o botão Alinhar.
2. **Pressão:** aperte Espaço repetidamente, clique na mesa ou use o botão Apertar. A pressão cai devagar se você parar; segurar a tecla não produz vários apertos.
3. **Destravamento:** a partir do segundo pedido o grampeador emperra. Digite a sequência exibida de A, D, W e S; também é possível tocar nos botões das letras.
4. **Golpe final:** quando a pressão chegar a 100%, espere o marcador entrar na faixa verde e aperte novamente. Há um breve intervalo de preparação para evitar que o último aperto de força conte como um erro de precisão.

Mova o mouse para olhar ao redor da mesa. Esc pausa. Enter entra no lobby na tela inicial, avança um pedido concluído ou repete um pedido perdido. Som e instruções ficam no canto superior direito. Os controles na tela permitem jogar sem teclado.

Cada pedido tem três tentativas e um prazo. Errar o alinhamento, a sequência ou o golpe final custa uma tentativa. Se as tentativas ou o tempo acabarem, repita somente o pedido atual, preservando as folhas e pontos dos anteriores. A pontuação considera volume, tempo restante, precisão e tentativas preservadas. O recorde e a preferência de áudio são salvos apenas neste navegador.

O turno completo soma **682 folhas**. A câmera fica na bancada, na posição do funcionário; não há movimentação pelo escritório.

## Projeto

- `src/world.js`: cena, iluminação, objetos procedurais e animação do grampeador.
- `src/time-clock.js`: relógio de ponto da parede, cartão, alavanca e registro de entrada.
- `src/lobby.js`: seleção, movimento, ações, arremesso, quebra e restauração dos objetos.
- `src/lobby-ui.js` e `src/lobby.css`: interface e controles do lobby.
- `src/mug.js`: modelo de cerâmica, café, estampa curva e pires.
- `src/hands.js`: mãos translúcidas com dedos articulados, visíveis durante os apertos.
- `src/game.js`: regras e máquina de estados, independentes da interface.
- `src/main.js`: controles, interface, áudio sintetizado e recorde local.
- `src/style.css`: interface e adaptação de telas menores.
- `tests/game.test.js`: testes de progressão e casos de erro.
- `tests/lobby.test.js`: limites da mesa, bloqueio fora do lobby, escala, colisão e restauração.

Os modelos, texturas e sons são gerados pelo código. As fontes são distribuídas junto ao build. O jogo não usa API, conta de usuário ou assets remotos em tempo de execução. É necessário um navegador com WebGL e aceleração gráfica.

## Áudios do jogo

Os efeitos em `public/audio/` foram gerados com ElevenLabs: grampeador, travamento, papel, relógio de ponto, café, carimbo, lápis, borracha, objetos e confirmações. O ambiente de escritório toca discretamente depois da primeira interação. Os arquivos são locais: jogar não faz chamadas à ElevenLabs nem consome créditos. O botão de som silencia também o ambiente; pausa, ajuda e aba oculta interrompem a reprodução.

A chave `ELEVENLABS` fica no `.env` da raiz, fora do Git e do código entregue ao navegador. Para outra instalação, copie `.env.example` para `.env` e preencha a chave. Não use prefixo `VITE_`.

```sh
npm run audio:generate -- --dry-run
npm run audio:generate
# Regenerar somente um efeito (consome créditos novamente):
npm run audio:generate -- --only stapler-press --force
```

Os prompts estão em `scripts/audio-catalog.mjs`. O gerador salva a procedência e os hashes em `public/audio/manifest.json`, pula arquivos já concluídos e permite retomar uma execução parcial. Nenhuma geração é feita durante `dev`, `build` ou `test`. API utilizada: [Sound Effects da ElevenLabs](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

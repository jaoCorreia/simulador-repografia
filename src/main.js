import './style.css';
import { createWorld } from './world.js';
import { StaplerGame, ORDERS } from './game.js';
import { createLobbyUI } from './lobby-ui.js';
import { createGameAudio } from './audio.js';

const $ = (selector) => document.querySelector(selector);
const game = new StaplerGame();
const canvas = $('#scene');
const icons = {
  sound: '<svg viewBox="0 0 24 24"><path d="M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  help: '<svg viewBox="0 0 24 24"><path d="M8 8a4 4 0 0 1 8 0c0 3-4 3-4 6m0 3v2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
  staple: '<svg viewBox="0 0 32 32"><path d="m7 12 20 4-2 5-20-4 2-5Zm0 11h20v4H7zm4-12V7h4v5"/></svg>',
};
let highScore = 0;
let muted = false;
try { highScore = Number(localStorage.getItem('repografia.recorde')) || 0; muted = localStorage.getItem('repografia.silencio') === 'true'; } catch { /* Storage is optional. */ }
const audio = createGameAudio({ muted });
void audio.preload();
function sound(kind) {
  syncAudioState();
  audio.play(kind);
}

$('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Simulador de Repografia — início" data-action="home">${icons.staple}<span>REPOGRAFIA<span class="brand-sub">EST. 1998 · FIRMA & FILHOS</span></span></a>
    <div class="shift"><span class="status-dot"></span><span id="shift-label">MAIS UM DIA NA FIRMA</span></div>
    <nav class="toolbar" aria-label="Opções do jogo">
      <span class="best">RECORDE <b id="best-score">${highScore.toLocaleString('pt-BR')}</b></span>
      <button class="icon-button" data-action="sound" aria-label="${muted ? 'Ativar som' : 'Silenciar som'}" title="Som">${icons[muted ? 'mute' : 'sound']}</button>
      <button class="icon-button" data-action="help" aria-label="Como jogar" title="Como jogar">${icons.help}</button>
      <button class="icon-button" id="pause-button" data-action="pause" aria-label="Pausar jogo" title="Pausar (Esc)" hidden>${icons.pause}</button>
    </nav>
  </header>
  <main>
    <section id="welcome" class="welcome">
      <span class="eyebrow"><span class="mini-line"></span> UM SIMULADOR DE TRABALHO DURO</span>
      <h1>simulador de<br><em>repografia.</em></h1>
      <p class="intro">Você. Uma pilha de papel.<br>Um grampeador com limites.</p>
      <p class="description">Explore sua mesa, faça uma bagunça e bata o ponto.<br>Depois, é você contra a papelada.</p>
      <button class="primary-button" data-action="enter-lobby">Entrar na firma ${icons.arrow}<kbd>ENTER</kbd></button>
      <div class="menu-details"><span>LOBBY INTERATIVO</span><i></i><span>6 PEDIDOS</span><i></i><span>ZERO CAFÉ EXTRA</span></div>
      <div class="tutorial-strip"><div><b>01</b><span>Alinhe<br>as folhas</span></div><div><b>02</b><span>Aperte<br>sem dó</span></div><div><b>03</b><span>Acerte<br>o grampo</span></div></div>
    </section>
    <div id="desk-caption" class="desk-caption"><span class="caption-dot"></span><div>O VALENTE Nº 04<small>Grampeador de mesa · patrimônio da firma</small></div></div>
    <section id="hud" class="hud" hidden>
      <aside class="order-card">
        <div class="receipt-top"><span>ORDEM DE SERVIÇO</span><span id="order-number">001</span></div>
        <div class="order-client" id="order-client"></div>
        <h2 id="order-title"></h2>
        <p id="order-subtitle"></p>
        <div class="paper-count"><strong id="paper-count">12</strong><span>FOLHAS<br>DE UMA VEZ</span></div>
        <div class="receipt-bottom"><span>TENTATIVAS <b id="mistakes">● ● ●</b></span><span id="order-time">00:40</span></div>
      </aside>
      <aside class="stats-card"><div><span>PAPÉIS GRAMPEADOS</span><strong id="total-papers">0</strong></div><div class="score-row"><span>PONTOS</span><strong id="score">0</strong></div><div id="order-progress" class="order-progress"></div></aside>
      <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
      <div class="crosshair" aria-hidden="true"></div>
      <section id="challenge" class="challenge" aria-label="Desafio atual"></section>
    </section>
    <section id="result" class="result-wrap" hidden></section>
    <section id="pause-overlay" class="modal-backdrop" hidden><div class="modal pause-modal" role="dialog" aria-modal="true" aria-label="Jogo pausado"><span class="eyebrow">INTERVALO DA FIRMA</span><h2>Um cafezinho?</h2><p>A papelada pode esperar um pouco.</p><button class="primary-button" data-action="pause">Voltar à mesa ${icons.arrow}</button><button class="text-button" data-action="restart">Recomeçar expediente</button><button class="text-button" data-action="enter-lobby">Encerrar turno e ir ao lobby</button></div></section>
    <section id="help-overlay" class="modal-backdrop" hidden><div class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><span class="eyebrow">MANUAL DO FUNCIONÁRIO</span><h2 id="help-title">O segredo é a pressão.</h2><div class="help-row"><kbd>←</kbd><kbd>→</kbd><p><b>Alinhe a pilha.</b> Leve o marcador para a faixa verde e confirme com Espaço.</p></div><div class="help-row"><kbd>ESPAÇO</kbd><p><b>Faça força.</b> Aperte repetidamente. Você também pode clicar na mesa ou no botão.</p></div><div class="help-row"><kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><p><b>Destrave.</b> Digite a sequência indicada quando o grampeador emperrar.</p></div><div class="help-row"><kbd>ESPAÇO</kbd><p><b>Finalize.</b> Aperte quando o marcador passar pela zona verde.</p></div><div class="help-note"><b>No lobby:</b> arraste para reorganizar, Q/E para girar, F para pegar, G para arremessar e X para quebrar. O relógio de ponto na parede inicia o expediente e restaura a mesa.<br><br>Mova o mouse para olhar ao redor · Esc para pausar.<br>Teclas seguradas não contam como vários apertos.</div><button class="primary-button" data-action="close-help">Entendi, chefe ${icons.arrow}</button></div></section>
  </main>
  <footer class="footer"><span id="footer-left">PAPELARIA VIRTUAL · ESFORÇO REAL</span><span id="footer-right"><span class="key-mini">↔</span> MOVA O MOUSE PARA OLHAR</span></footer>
  <div id="loading" class="loading"><span class="spinner"></span> Abrindo a firma…</div>
`;

let world;
try { world = createWorld(canvas); $('#loading').hidden = true; }
catch (error) {
  console.error(error);
  $('#loading').innerHTML = '<div>Não foi possível abrir a cena 3D.<br><small>Ative a aceleração gráfica do navegador e recarregue a página.</small><br><button onclick="location.reload()">Tentar novamente</button></div>';
}

const activePhases = ['align', 'press', 'jam', 'timing'];
let sessionScreen = 'welcome';
let lastPanel = '';
let lastOverlay = '';
let look = { x: 0, y: 0 };
let pressPulse = 0;
let celebration = 0;
let elapsed = 0;
let feedbackTimer = 0;
let helpWasPaused = false;
let helpOpen = false;
let previousFocus;
const keysDown = new Set();
const lobbyUI = createLobbyUI({ world, canvas, onStart: start, sound });
const formatTime = (t) => { const seconds = Math.ceil(Math.max(0, t)); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; };
const codeLabel = (code) => code.replace('Key', '');

function syncAudioState() {
  audio.setPaused(document.hidden || helpOpen || (sessionScreen === 'game' && game.state.paused));
  audio.setAmbience(sessionScreen === 'lobby' || sessionScreen === 'game');
}
function unlockAudio(event) {
  if (!event.isTrusted || event.repeat) return;
  void audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
window.addEventListener('pagehide', () => audio.setPaused(true));
window.addEventListener('pageshow', syncAudioState);


function flash(message, bad = false) {
  $('#feedback').textContent = message;
  $('#feedback').className = `feedback visible${bad ? ' bad' : ''}`;
  feedbackTimer = 2;
}
function saveBest() {
  if (game.state.score <= highScore) return;
  highScore = game.state.score;
  $('#best-score').textContent = highScore.toLocaleString('pt-BR');
  try { localStorage.setItem('repografia.recorde', String(highScore)); } catch { /* Optional. */ }
}
function start() {
  lobbyUI.leave();
  sessionScreen = 'game';
  game.start();
  look = { x: 0, y: 0 };
  lastPanel = ''; lastOverlay = ''; pressPulse = 0;
  keysDown.clear();
  syncAudioState();
}
function enterLobby() {
  if (sessionScreen === 'lobby') return;
  if (sessionScreen === 'game' && activePhases.includes(game.state.phase) && !game.state.paused) game.togglePause();
  saveBest();
  sessionScreen = 'lobby';
  lastOverlay = ''; pressPulse = 0;
  look = { x: 0, y: 0 };
  keysDown.clear();
  lobbyUI.enter();
  sound('key');
}
function showHelp() {
  if (helpOpen) return;
  previousFocus = document.activeElement;
  helpWasPaused = game.state.paused;
  if (sessionScreen === 'game' && activePhases.includes(game.state.phase) && !helpWasPaused) game.togglePause();
  helpOpen = true;
  syncAudioState();
  lobbyUI.setBlocked(true);
  $('#help-overlay').hidden = false;
  $('[data-action="close-help"]').focus();
}
function closeHelp() {
  helpOpen = false;
  lobbyUI.setBlocked(false);
  $('#help-overlay').hidden = true;
  if (sessionScreen === 'game' && activePhases.includes(game.state.phase) && game.state.paused && !helpWasPaused) game.togglePause();
  previousFocus?.focus();
  syncAudioState();
}
function handleAction(action, button) {
  if (action === 'sound') {
    muted = !muted;
    audio.setMuted(muted);
    button.innerHTML = icons[muted ? 'mute' : 'sound'];
    button.setAttribute('aria-label', muted ? 'Ativar som' : 'Silenciar som');
    try { localStorage.setItem('repografia.silencio', String(muted)); } catch { /* Optional. */ }
    if (!muted) sound('key');
    return;
  }
  if (action === 'help') return showHelp();
  if (action === 'close-help') return closeHelp();
  if (helpOpen) return;
  if (action === 'enter-lobby') return enterLobby();
  if (action === 'restart') return start();
  if (action === 'pause') { game.togglePause(); return; }
  if (action === 'next') { game.next(); return; }
  if (action === 'retry') { game.retry(); return; }
  if (action === 'press') { game.press(); return; }
  if (action === 'left') { game.align(-.08); return; }
  if (action === 'right') { game.align(.08); return; }
  if (action?.startsWith('key:')) { game.hitKey(action.slice(4)); return; }
  if (action === 'home') { if (sessionScreen === 'game' && activePhases.includes(game.state.phase) && !game.state.paused) game.togglePause(); else if (sessionScreen !== 'welcome') enterLobby(); }
}
$('#app').addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  handleAction(button.dataset.action, button);
  syncAudioState();
  if (!helpOpen && (sessionScreen !== 'game' || !game.state.paused)) button.blur();
});
canvas.addEventListener('pointerdown', (event) => { if (event.button === 0 && !helpOpen && sessionScreen === 'game') game.press(); });
window.addEventListener('pointermove', (event) => { if (sessionScreen === 'lobby' && (lobbyUI.isDragging() || lobbyUI.isHolding())) return; look.x = (event.clientX / innerWidth - .5) * 2; look.y = (event.clientY / innerHeight - .5) * 2; });
window.addEventListener('keydown', (event) => {
  const modal = helpOpen ? $('#help-overlay') : sessionScreen === 'game' && game.state.paused ? $('#pause-overlay') : null;
  if (event.code === 'Tab' && modal) {
    const buttons = [...modal.querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement);
    event.preventDefault();
    buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    return;
  }
  const focusedControl = event.target.closest?.('button, a');
  if (focusedControl && ['Enter', 'Space'].includes(event.code)) {
    if (event.repeat) event.preventDefault();
    return;
  }
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  if (event.repeat || keysDown.has(event.code)) return;
  keysDown.add(event.code);
  if (event.code === 'Escape') { if (helpOpen) closeHelp(); else if (sessionScreen === 'lobby') lobbyUI.key(event); else if (sessionScreen === 'game') game.togglePause(); return; }
  if (helpOpen) return;
  if (sessionScreen === 'lobby') { lobbyUI.key(event); return; }
  if (sessionScreen === 'welcome') { if (event.code === 'Enter') enterLobby(); return; }
  if (event.code === 'Enter') {
    if (game.state.phase === 'menu' || game.state.phase === 'complete') enterLobby();
    else if (game.state.phase === 'success') game.next();
    else if (game.state.phase === 'gameover') game.retry();
    else if (game.state.paused) game.togglePause();
    return;
  }
  if (event.code === 'Space') game.press();
  else if (event.code === 'ArrowLeft') game.align(-.08);
  else if (event.code === 'ArrowRight') game.align(.08);
  else if (game.state.phase === 'jam') game.hitKey(event.code);
});
window.addEventListener('keydown', syncAudioState);
window.addEventListener('keyup', (event) => keysDown.delete(event.code));
function autoPause() {
  keysDown.clear();
  if (sessionScreen === 'game' && activePhases.includes(game.state.phase) && !game.state.paused) game.togglePause();
  syncAudioState();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); syncAudioState(); });
window.addEventListener('resize', () => world?.resize());

function renderChallenge(state) {
  const signature = `${state.phase}:${state.orderIndex}:${state.jamIndex}`;
  if (signature === lastPanel) return;
  lastPanel = signature;
  const step = state.phase === 'align' ? '01' : state.phase === 'timing' ? '03' : '02';
  const header = (label, title, subtitle) => `<div class="challenge-top"><span class="step-label">${step} / 03 <i></i> ${label}</span><span class="phase-dots"><i class="${step === '01' ? 'current' : 'done'}"></i><i class="${step === '02' ? 'current' : step === '03' ? 'done' : ''}"></i><i class="${step === '03' ? 'current' : ''}"></i></span></div><h2>${title}</h2><p>${subtitle}</p>`;
  let html = '';
  if (state.phase === 'align') {
    html = `${header('PREPARAÇÃO', 'Tudo começa pelo alinhamento.', 'Leve a pilha até a marca verde.')}<div class="align-meter"><span class="align-target"></span><span id="alignment-marker" class="meter-marker"></span><span class="center-line"></span></div><div class="challenge-controls"><div class="arrow-buttons"><button data-action="left" aria-label="Mover folhas para a esquerda">←</button><button data-action="right" aria-label="Mover folhas para a direita">→</button><span>AJUSTAR</span></div><button class="action-button" data-action="press">Alinhar <kbd>ESPAÇO</kbd></button></div>`;
  } else if (state.phase === 'press') {
    html = `${header('FORÇA BRUTA', 'Agora, aperte sem dó.', 'Cliques rápidos ou Espaço. Não deixe a pressão cair.')}<div class="force-label"><span>PRESSÃO DO GRAMPEADOR</span><strong><span id="force-value">0</span><small>%</small></strong></div><div class="force-meter"><span id="force-fill"></span><i></i><i></i><i></i></div><button class="action-button wide press-button" data-action="press">APERTAR ${icons.staple}<kbd>ESPAÇO / CLIQUE</kbd></button>`;
  } else if (state.phase === 'jam') {
    html = `${header('PEQUENO IMPREVISTO', 'Emperrou. Claro que emperrou.', 'Aperte as teclas na ordem para soltar o mecanismo.')}<div class="jam-sequence">${state.jamSequence.map((key, index) => `<button data-action="key:${key}" class="jam-key ${index < state.jamIndex ? 'completed' : index === state.jamIndex ? 'active' : ''}" aria-label="Tecla ${codeLabel(key)}">${index < state.jamIndex ? '✓' : codeLabel(key)}</button>`).join('')}</div><div class="jam-caption"><span class="status-dot"></span> A FIRMA CONFIA NO SEU TALENTO</div>`;
  } else if (state.phase === 'timing') {
    html = `${header('GOLPE FINAL', 'É tudo uma questão de timing.', 'Aperte quando o marcador estiver na faixa verde.')}<div class="timing-meter"><span class="timing-target" style="left:${state.timingZone.start * 100}%;width:${(state.timingZone.end - state.timingZone.start) * 100}%"></span><span id="timing-marker" class="meter-marker"></span></div><button id="staple-button" class="action-button wide" data-action="press">GRAMPEAR ${icons.arrow}<kbd>ESPAÇO / CLIQUE</kbd></button>`;
  }
  $('#challenge').innerHTML = html;
  $('#challenge').classList.toggle('jammed', state.phase === 'jam');
}
function renderOverlay(state) {
  const signature = `${sessionScreen}:${state.phase}:${state.orderIndex}`;
  if (signature === lastOverlay) return;
  lastOverlay = signature;
  const menu = sessionScreen === 'welcome';
  const inLobby = sessionScreen === 'lobby';
  const isResult = sessionScreen === 'game' && ['success', 'gameover', 'complete'].includes(state.phase);
  $('#welcome').hidden = !menu;
  $('#desk-caption').hidden = !menu;
  $('#hud').hidden = menu || inLobby || isResult;
  $('#result').hidden = !isResult;
  $('#pause-button').hidden = sessionScreen !== 'game' || !activePhases.includes(state.phase);
  document.body.classList.toggle('in-menu', menu);
  document.body.classList.toggle('in-result', isResult);
  document.body.classList.toggle('in-lobby', inLobby);
  if (isResult && state.phase === 'success') {
    $('#result').innerHTML = `<div class="result-card"><div class="stamp">GRAMPEADO</div><span class="eyebrow">ORDEM ${String(state.orderIndex + 1).padStart(3, '0')} · CONCLUÍDA</span><h2>${state.order.papers} folhas.<br><em>Um só grampo.</em></h2><p>${typeof state.lastGrade === 'string' && state.lastGrade ? state.lastGrade : 'A firma reconhece o seu esforço.'}</p><div class="result-stats"><div><strong>${state.totalPapers}</strong><span>FOLHAS NO TURNO</span></div><div><strong>${state.score.toLocaleString('pt-BR')}</strong><span>PONTOS</span></div></div><button class="primary-button" data-action="next">${state.orderIndex === ORDERS.length - 1 ? 'Encerrar expediente' : 'Próximo pedido'} ${icons.arrow}<kbd>ENTER</kbd></button><small>${state.orderIndex < ORDERS.length - 1 ? 'Boa notícia: chegou mais papel.' : 'Você merece aquele café.'}</small></div>`;
  } else if (isResult && state.phase === 'gameover') {
    $('#result').innerHTML = `<div class="result-card"><div class="stamp rejected">RETRABALHO</div><span class="eyebrow">ACONTECE NAS MELHORES FIRMAS</span><h2>O papel venceu.<br><em>Por enquanto.</em></h2><p>${state.timer <= 0 ? 'O prazo acabou antes do último grampo.' : 'Três tentativas. A pilha continua solta.'}<br>Seus pedidos anteriores estão garantidos.</p><button class="primary-button" data-action="retry">Tentar este pedido ${icons.arrow}<kbd>ENTER</kbd></button><button class="text-button" data-action="enter-lobby">Voltar ao lobby</button></div>`;
  } else if (isResult && state.phase === 'complete') {
    saveBest();
    $('#result').innerHTML = `<div class="result-card"><div class="stamp">PROMOVIDO</div><span class="eyebrow">EXPEDIENTE ENCERRADO</span><h2>Lenda da<br><em>repografia.</em></h2><p>Seis pedidos. Um grampeador sobrevivente.<br>Seu nome vai para o mural da firma.</p><div class="result-stats"><div><strong>${state.totalPapers}</strong><span>FOLHAS GRAMPEADAS</span></div><div><strong>${state.score.toLocaleString('pt-BR')}</strong><span>PONTOS</span></div></div><button class="primary-button" data-action="enter-lobby">Voltar ao relógio de ponto ${icons.arrow}<kbd>ENTER</kbd></button><button class="text-button" data-action="enter-lobby">Voltar ao lobby</button><small>RECORDE DA FIRMA · ${highScore.toLocaleString('pt-BR')} PONTOS</small></div>`;
  }
  $('#shift-label').textContent = inLobby ? 'LOBBY · MESA LIVRE' : menu ? 'MAIS UM DIA NA FIRMA' : state.phase === 'complete' ? 'FUNCIONÁRIO DO MÊS' : `TURNO 01 · PEDIDO ${String(state.orderIndex + 1).padStart(2, '0')} / 06`;
  $('#footer-left').textContent = inLobby ? 'A FIRMA ABRE QUANDO VOCÊ QUISER' : menu ? 'PAPELARIA VIRTUAL · ESFORÇO REAL' : 'GRAMPEADOR Nº 04 · CAPACIDADE RECOMENDADA: 20 FOLHAS';
  $('#footer-right').innerHTML = inLobby ? '<span class="key-mini">ESC</span> SOLTAR OBJETO <span class="footer-separator">/</span> MESA LIVRE, SEM PRAZO' : menu ? '<span class="key-mini">↔</span> MOVA O MOUSE PARA OLHAR' : '<span class="key-mini">ESC</span> PAUSAR <span class="footer-separator">/</span> CLIQUE OU ESPAÇO PARA APERTAR';
  if (sessionScreen === 'game' && state.order) {
    $('#order-number').textContent = String(state.orderIndex + 1).padStart(3, '0');
    $('#order-title').textContent = state.order.title;
    $('#order-client').textContent = state.order.client;
    $('#order-subtitle').textContent = state.order.subtitle;
    $('#paper-count').textContent = state.order.papers;
    $('#order-progress').innerHTML = ORDERS.map((order, index) => `<span class="${index < state.orderIndex ? 'done' : index === state.orderIndex ? 'current' : ''}" title="Pedido ${index + 1}: ${order.papers} folhas">${String(index + 1).padStart(2, '0')}</span>`).join('');
  }
}
function updateUI(state) {
  renderOverlay(state);
  if (sessionScreen === 'game') renderChallenge(state);
  $('#pause-overlay').hidden = sessionScreen !== 'game' || !state.paused || helpOpen;
  if (sessionScreen !== 'game') return;
  if (!activePhases.includes(state.phase)) return;
  $('#order-time').textContent = formatTime(state.timer);
  $('#order-time').classList.toggle('urgent', state.timer < 10);
  $('#mistakes').textContent = Array.from({ length: 3 }, (_, i) => i < state.mistakes ? '●' : '○').join(' ');
  $('#total-papers').textContent = state.totalPapers;
  $('#score').textContent = state.score.toLocaleString('pt-BR');
  const alignment = $('#alignment-marker');
  if (alignment) alignment.style.left = `${(state.alignment + 1) * 50}%`;
  const forceFill = $('#force-fill');
  if (forceFill) { forceFill.style.width = `${state.force}%`; $('#force-value').textContent = Math.floor(state.force); }
  const timing = $('#timing-marker');
  if (timing) {
    timing.style.left = `${state.timingPosition * 100}%`;
    $('#staple-button').disabled = state.timingReadyIn > 0;
    $('#challenge p').textContent = state.timingReadyIn > 0 ? 'Pressão máxima. Prepare o golpe final…' : 'Aperte quando o marcador estiver na faixa verde.';
  }
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, .05);
  lastTime = now;
  elapsed += dt;
  syncAudioState();
  if (sessionScreen === 'game') game.tick(dt);
  const events = game.consumeEvents();
  for (const event of events) {
    const kind = typeof event === 'string' ? event : event.kind || event.type;
    sound(kind);
    if (kind === 'press') pressPulse = 1;
    if (kind === 'success') { celebration = 1; saveBest(); }
    if (kind === 'error') flash(game.state.hint || 'Ops! Ajuste e tente de novo.', true);
    if (kind === 'jam') flash('Mecanismo travado. Resolva a sequência!');
    if (kind === 'align') flash('Pilha alinhada. Pode fazer força.');
  }
  pressPulse = Math.max(0, pressPulse - dt * 5);
  celebration = Math.max(0, celebration - dt * .30);
  feedbackTimer -= dt;
  if (feedbackTimer <= 0) $('#feedback').classList.remove('visible');
  const s = game.state;
  world?.update(dt, { phase: sessionScreen === 'lobby' ? 'lobby' : sessionScreen === 'welcome' ? 'menu' : s.phase, force: sessionScreen === 'game' ? s.force : 0, papers: sessionScreen === 'game' ? s.order?.papers || 12 : 12, alignment: sessionScreen === 'game' ? s.alignment : 0, pressPulse, celebration, lookX: look.x, lookY: look.y, elapsed, jammed: s.phase === 'jam' });
  lobbyUI.tick(dt);
  updateUI(s);
  requestAnimationFrame(frame);
}
updateUI(game.state);
requestAnimationFrame(frame);

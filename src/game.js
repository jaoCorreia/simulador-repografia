const ACTIVE_PHASES = new Set(['align', 'press', 'jam', 'timing']);
const INITIAL_ALIGNMENTS = [0.58, -0.66, 0.74, -0.82, 0.88, -0.94];
const TIMING_GRACE_SECONDS = 0.55;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const ORDERS = Object.freeze([
  { papers: 12, title: 'AQUECIMENTO', client: 'Recepção', subtitle: 'Só umas folhinhas. Você consegue.', timeLimit: 40, forceGain: 9.1, forceDecay: 0.65, timingSpeed: 0.64, timingWidth: 0.32, jamSequence: [] },
  { papers: 30, title: 'REUNIÃO ÀS NOVE', client: 'Administrativo', subtitle: 'Trinta páginas. Nenhuma desculpa.', timeLimit: 45, forceGain: 7, forceDecay: 0.8, timingSpeed: 0.72, timingWidth: 0.28, jamSequence: ['KeyA', 'KeyD'] },
  { papers: 60, title: 'TCC SEM REVISÃO', client: 'Estudante desesperado', subtitle: 'A entrega é hoje. A bibliografia também conta.', timeLimit: 50, forceGain: 5.8, forceDecay: 0.95, timingSpeed: 0.82, timingWidth: 0.24, jamSequence: ['KeyA', 'KeyD', 'KeyW'] },
  { papers: 100, title: 'A BUROCRACIA', client: 'Setor de protocolos', subtitle: 'Cem páginas para solicitar mais papel.', timeLimit: 55, forceGain: 4.6, forceDecay: 1.1, timingSpeed: 0.92, timingWidth: 0.2, jamSequence: ['KeyA', 'KeyD', 'KeyW', 'KeyS'] },
  { papers: 180, title: 'URGENTE PARA ONTEM', client: 'Diretoria', subtitle: 'O grampeador não foi consultado.', timeLimit: 60, forceGain: 3.8, forceDecay: 1.25, timingSpeed: 1, timingWidth: 0.16, jamSequence: ['KeyD', 'KeyA', 'KeyW', 'KeyD', 'KeyS'] },
  { papers: 300, title: 'O ÚLTIMO GRAMPO', client: 'Chefe da repografia', subtitle: 'Trezentas páginas. Um grampo. Uma lenda.', timeLimit: 65, forceGain: 3.25, forceDecay: 1.4, timingSpeed: 1.08, timingWidth: 0.13, jamSequence: ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyD', 'KeyA'] },
].map((order) => Object.freeze({ ...order, jamSequence: Object.freeze(order.jamSequence) })));

/** Pure, deterministic rules. Input debouncing and rendering belong to the caller. */
export class StaplerGame {
  constructor() {
    this._events = [];
    this._resetRun();
    this.state.phase = 'menu';
  }

  _resetRun() {
    this.state = {
      phase: 'menu', paused: false, orderIndex: 0, order: ORDERS[0],
      force: 0, alignment: INITIAL_ALIGNMENTS[0], timer: ORDERS[0].timeLimit,
      totalTime: 0, score: 0, totalPapers: 0, mistakes: 3, combo: 0,
      presses: 0, completedOrders: 0, timingPosition: 0, timingReadyIn: 0,
      timingZone: { start: 0.34, end: 0.66 }, jamSequence: [], jamIndex: 0,
      hint: 'Seu turno na repografia começa agora.', lastGrade: null,
    };
    this._jamCleared = false;
    this._timingClock = 0;
    this._pressGap = Infinity;
    this._alignmentQuality = 0;
  }

  _emit(type, detail = {}) {
    this._events.push({ type, ...detail });
  }

  _beginOrder(index) {
    const order = ORDERS[index];
    Object.assign(this.state, {
      phase: 'align', paused: false, orderIndex: index, order,
      force: 0, alignment: INITIAL_ALIGNMENTS[index], timer: order.timeLimit,
      mistakes: 3, combo: 0, presses: 0, timingPosition: 0, timingReadyIn: 0,
      timingZone: { start: 0.5 - order.timingWidth / 2, end: 0.5 + order.timingWidth / 2 },
      jamSequence: [...order.jamSequence], jamIndex: 0,
      hint: 'Use ← e → para alinhar o papel. Espaço ou clique para confirmar.',
      lastGrade: null,
    });
    this._jamCleared = order.jamSequence.length === 0;
    this._timingClock = 0;
    this._pressGap = Infinity;
    this._alignmentQuality = 0;
    this._emit('start', { orderIndex: index });
  }

  start() {
    this._events = [];
    this._resetRun();
    this._beginOrder(0);
  }

  next() {
    if (this.state.paused || this.state.phase !== 'success') return;
    if (this.state.orderIndex === ORDERS.length - 1) {
      this.state.phase = 'complete';
      this.state.hint = 'Turno encerrado. Você é uma lenda da repografia.';
      this._emit('complete', { score: this.state.score, papers: this.state.totalPapers });
      return;
    }
    this._beginOrder(this.state.orderIndex + 1);
  }

  retry() {
    if (this.state.paused || this.state.phase !== 'gameover') return;
    this._beginOrder(this.state.orderIndex);
  }

  togglePause() {
    if (!ACTIVE_PHASES.has(this.state.phase)) return;
    this.state.paused = !this.state.paused;
  }

  align(delta) {
    if (this.state.paused || this.state.phase !== 'align' || !Number.isFinite(delta)) return;
    this.state.alignment = clamp(this.state.alignment + delta, -1, 1);
    this.state.hint = Math.abs(this.state.alignment) <= 0.14
      ? 'Papel alinhado! Aperte Espaço ou clique para confirmar.'
      : 'Use ← e → para trazer o papel até o centro.';
  }

  press() {
    const state = this.state;
    if (state.paused) return;

    if (state.phase === 'align') {
      if (Math.abs(state.alignment) > 0.14) {
        this._error('O papel ficou torto! Alinhe com ← e → antes de apertar.');
        return;
      }
      this._alignmentQuality = 1 - Math.abs(state.alignment) / 0.14;
      state.phase = 'press';
      state.hint = 'Aperte Espaço ou clique repetidamente. Faça pressão!';
      this._emit('align', { alignment: state.alignment });
      return;
    }

    if (state.phase === 'press') {
      state.presses += 1;
      state.combo = this._pressGap <= 0.65 ? state.combo + 1 : 1;
      this._pressGap = 0;
      state.force = Math.min(100, state.force + state.order.forceGain);
      this._emit('press', { force: state.force, combo: state.combo });
      if (!this._jamCleared && state.force >= 45) {
        state.phase = 'jam';
        state.jamIndex = 0;
        state.hint = 'Travou! Digite a sequência indicada para destravar.';
        this._emit('jam', { sequence: [...state.jamSequence] });
      } else if (state.force >= 100) {
        state.phase = 'timing';
        state.timingPosition = 0;
        state.timingReadyIn = TIMING_GRACE_SECONDS;
        this._timingClock = 0;
        state.hint = 'Agora! Aperte quando o marcador estiver na faixa verde.';
      }
      return;
    }

    if (state.phase === 'timing') {
      // Allow players to stop mashing before the precision challenge starts.
      if (state.timingReadyIn > 0) return;
      const { start, end } = state.timingZone;
      if (state.timingPosition >= start && state.timingPosition <= end) {
        this._succeed();
      } else {
        this._error('Quase! Recupere a pressão e acerte a faixa verde.');
        if (state.phase !== 'gameover') {
          state.phase = 'press';
          state.force = 68;
          state.combo = 0;
          this._pressGap = Infinity;
        }
      }
    }
  }

  hitKey(code) {
    const state = this.state;
    if (state.paused || state.phase !== 'jam') return;
    // Arrow keys, Escape, modifiers, and space may be used by the surrounding UI.
    if (!['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(code)) return;
    if (code !== state.jamSequence[state.jamIndex]) {
      state.jamIndex = 0;
      this._error('Tecla errada! A sequência voltou ao início.');
      return;
    }
    state.jamIndex += 1;
    this._emit('key', { code, index: state.jamIndex });
    if (state.jamIndex === state.jamSequence.length) {
      this._jamCleared = true;
      state.phase = 'press';
      state.combo = 0;
      this._pressGap = Infinity;
      state.hint = 'Destravou! Continue apertando até encher a pressão.';
    } else {
      state.hint = 'Isso! Continue a sequência para destravar.';
    }
  }

  tick(dt) {
    const state = this.state;
    if (state.paused || !ACTIVE_PHASES.has(state.phase) || !Number.isFinite(dt) || dt <= 0) return;
    const elapsed = Math.min(dt, state.timer);
    state.totalTime += elapsed;
    state.timer = Math.max(0, state.timer - elapsed);
    this._pressGap += elapsed;
    if (state.timer <= 0) {
      this._fail('O tempo acabou! O cliente está esperando.');
      return;
    }
    if (state.phase === 'press') {
      state.force = Math.max(0, state.force - state.order.forceDecay * elapsed);
      if (this._pressGap > 0.65) state.combo = 0;
    }
    if (state.phase === 'timing') {
      const graceElapsed = Math.min(elapsed, state.timingReadyIn);
      state.timingReadyIn = Math.max(0, state.timingReadyIn - graceElapsed);
      this._timingClock += (elapsed - graceElapsed) * state.order.timingSpeed;
      const cycle = this._timingClock % 2;
      state.timingPosition = cycle <= 1 ? cycle : 2 - cycle;
    }
  }

  _error(hint) {
    this.state.mistakes -= 1;
    this.state.combo = 0;
    this.state.hint = hint;
    this._emit('error', { remaining: this.state.mistakes, hint });
    if (this.state.mistakes <= 0) this._fail('Três erros. Respire fundo e tente este pedido de novo.');
  }

  _fail(hint) {
    this.state.phase = 'gameover';
    this.state.hint = hint;
    this._emit('gameover', { hint });
  }

  _succeed() {
    const state = this.state;
    const timingQuality = 1 - Math.abs(state.timingPosition - 0.5) / (state.order.timingWidth / 2);
    const cleanOrder = state.mistakes === 3;
    const grade = cleanOrder && timingQuality >= 0.55 ? 'PERFEITO' : cleanOrder ? 'CAPRICHADO' : 'APROVADO';
    const earned = state.order.papers * 10 + Math.ceil(state.timer * 5)
      + Math.round(this._alignmentQuality * 100) + state.mistakes * 60 + Math.round(timingQuality * 150);
    state.phase = 'success';
    state.force = 100;
    state.lastGrade = grade;
    state.score += earned;
    state.totalPapers += state.order.papers;
    state.completedOrders += 1;
    state.hint = `${state.order.papers} folhas grampeadas. Serviço feito!`;
    this._emit('success', { grade, score: earned, totalScore: state.score, papers: state.order.papers });
  }

  consumeEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }
}

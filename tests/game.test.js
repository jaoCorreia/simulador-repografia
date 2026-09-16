import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDERS, StaplerGame } from '../src/game.js';

function alignPaper(game) {
  game.align(-game.state.alignment);
  game.press();
  assert.equal(game.state.phase, 'press');
}

function reachTiming(game) {
  let safety = 0;
  while (game.state.phase !== 'timing' && safety++ < 100) {
    if (game.state.phase === 'jam') {
      for (const code of game.state.jamSequence) {
        game.tick(0.35);
        game.hitKey(code);
      }
    } else {
      assert.equal(game.state.phase, 'press');
      game.tick(0.25);
      game.press();
    }
  }
  assert.equal(game.state.phase, 'timing');
}

function completeOrder(game) {
  alignPaper(game);
  reachTiming(game);
  game.tick(game.state.timingReadyIn + 0.5 / game.state.order.timingSpeed);
  game.press();
  assert.equal(game.state.phase, 'success');
}

test('all six orders are reachable at four presses per second', () => {
  const game = new StaplerGame();
  assert.equal(game.state.phase, 'menu');
  game.start();
  for (let i = 0; i < ORDERS.length; i += 1) {
    assert.equal(game.state.orderIndex, i);
    completeOrder(game);
    assert.equal(game.state.completedOrders, i + 1);
    assert.ok(game.state.timer > 0);
    assert.equal(game.state.lastGrade, 'PERFEITO');
    game.next();
  }
  assert.equal(game.state.phase, 'complete');
  assert.equal(game.state.totalPapers, 682);
  assert.equal(game.state.completedOrders, 6);
  assert.ok(game.state.score > 6820);
  assert.equal(game.consumeEvents().filter((event) => event.type === 'jam').length, 5);
});

test('alignment mistakes fail the order and retry preserves previously earned work', () => {
  const game = new StaplerGame();
  game.start();
  completeOrder(game);
  const earned = { score: game.state.score, totalPapers: game.state.totalPapers, completedOrders: game.state.completedOrders };
  game.next();
  game.tick(1);
  game.press();
  game.press();
  game.press();
  assert.equal(game.state.phase, 'gameover');
  assert.equal(game.state.mistakes, 0);
  game.retry();
  assert.equal(game.state.phase, 'align');
  assert.equal(game.state.orderIndex, 1);
  assert.equal(game.state.mistakes, 3);
  for (const [key, value] of Object.entries(earned)) assert.equal(game.state[key], value);
  completeOrder(game);
  assert.equal(game.state.totalPapers, 42);
  assert.equal(game.state.completedOrders, 2);
  game.press();
  assert.equal(game.state.totalPapers, 42, 'duplicate presses cannot award a finished order twice');
});

test('pause freezes every active stage and rejects gameplay inputs', () => {
  const game = new StaplerGame();
  game.start();
  const verifyFrozen = () => {
    game.togglePause();
    const snapshot = structuredClone(game.state);
    game.align(-game.state.alignment);
    game.press();
    game.hitKey('KeyA');
    game.tick(999);
    game.next();
    game.retry();
    assert.deepEqual(game.state, snapshot);
    game.togglePause();
  };
  verifyFrozen();
  alignPaper(game);
  verifyFrozen();
  reachTiming(game);
  verifyFrozen();
  game.tick(game.state.timingReadyIn + 0.5 / game.state.order.timingSpeed);
  game.press();
  game.next();
  alignPaper(game);
  while (game.state.phase === 'press') game.press();
  assert.equal(game.state.phase, 'jam');
  verifyFrozen();
});

test('jam errors restart the sequence, keep force, and can recover once', () => {
  const game = new StaplerGame();
  game.start();
  completeOrder(game);
  game.next();
  alignPaper(game);
  while (game.state.phase === 'press') game.press();
  assert.equal(game.state.phase, 'jam');
  const force = game.state.force;
  game.hitKey('Space');
  assert.equal(game.state.mistakes, 3, 'non-challenge keys do not consume an error');
  game.hitKey('KeyA');
  assert.equal(game.state.jamIndex, 1);
  game.hitKey('KeyA');
  assert.equal(game.state.jamIndex, 0);
  assert.equal(game.state.mistakes, 2);
  game.tick(3);
  assert.equal(game.state.force, force, 'the clamp holds pressure while clearing a jam');
  game.hitKey('KeyA');
  game.hitKey('KeyD');
  assert.equal(game.state.phase, 'press');
  reachTiming(game);
  game.tick(game.state.timingReadyIn);
  game.press(); // marker starts outside the zone
  assert.equal(game.state.phase, 'press');
  reachTiming(game);
  assert.equal(game.consumeEvents().filter((event) => event.type === 'jam').length, 1);
});

test('a mistimed staple retains pressure and costs one error, a later hit succeeds', () => {
  const game = new StaplerGame();
  game.start();
  alignPaper(game);
  reachTiming(game);
  game.tick(game.state.timingReadyIn);
  game.press();
  assert.equal(game.state.mistakes, 2);
  assert.equal(game.state.phase, 'press');
  assert.equal(game.state.force, 68);
  assert.equal(game.state.totalPapers, 0);
  reachTiming(game);
  game.tick(game.state.timingReadyIn + 0.5 / game.state.order.timingSpeed);
  game.press();
  assert.equal(game.state.phase, 'success');
  assert.equal(game.state.lastGrade, 'APROVADO');
  assert.equal(game.state.totalPapers, 12);
});

test('timeouts stop the clock at zero without awarding work', () => {
  const game = new StaplerGame();
  game.start();
  game.tick(1000);
  assert.equal(game.state.phase, 'gameover');
  assert.equal(game.state.timer, 0);
  assert.equal(game.state.totalTime, ORDERS[0].timeLimit);
  assert.equal(game.state.score, 0);
  game.tick(1000);
  assert.equal(game.state.totalTime, ORDERS[0].timeLimit);
  game.retry();
  assert.equal(game.state.timer, ORDERS[0].timeLimit);
  assert.equal(game.state.phase, 'align');
});

test('restart resets the campaign; event reads drain the queue', () => {
  const game = new StaplerGame();
  game.start();
  completeOrder(game);
  assert.ok(game.consumeEvents().some((event) => event.type === 'success'));
  assert.deepEqual(game.consumeEvents(), []);
  game.start();
  assert.equal(game.state.score, 0);
  assert.equal(game.state.totalTime, 0);
  assert.equal(game.state.totalPapers, 0);
  assert.equal(game.state.completedOrders, 0);
  assert.equal(game.state.orderIndex, 0);
  assert.deepEqual(game.consumeEvents(), [{ type: 'start', orderIndex: 0 }]);
});

test('timing uses an oscillating marker and invalid deltas never corrupt state', () => {
  const game = new StaplerGame();
  game.start();
  const alignment = game.state.alignment;
  game.align(NaN);
  assert.equal(game.state.alignment, alignment);
  const timer = game.state.timer;
  game.tick(Infinity);
  game.tick(-1);
  assert.equal(game.state.timer, timer);
  alignPaper(game);
  reachTiming(game);
  game.tick(game.state.timingReadyIn + 1.5 / game.state.order.timingSpeed);
  assert.ok(Math.abs(game.state.timingPosition - 0.5) < 1e-10);
  game.press();
  assert.equal(game.state.phase, 'success');
});

test('timing grace ignores carried taps while the order timer keeps running', () => {
  const game = new StaplerGame();
  game.start();
  alignPaper(game);
  // Eleven immediate taps fill the first order; the twelfth must not punish mashing.
  for (let i = 0; i < 12; i += 1) game.press();
  assert.equal(game.state.phase, 'timing');
  assert.equal(game.state.mistakes, 3);
  assert.equal(game.state.presses, 11);
  assert.equal(game.state.timingReadyIn, 0.55);
  const timer = game.state.timer;
  game.tick(0.3);
  game.press();
  assert.equal(game.state.phase, 'timing');
  assert.equal(game.state.mistakes, 3);
  assert.equal(game.state.timingPosition, 0);
  assert.ok(Math.abs(game.state.timer - (timer - 0.3)) < 1e-10);
  game.tick(game.state.timingReadyIn);
  assert.equal(game.state.timingReadyIn, 0);
  game.press();
  assert.equal(game.state.phase, 'press', 'an actual early timing press still fails after grace');
  assert.equal(game.state.mistakes, 2);
});

test('a tick crossing the grace boundary moves the marker only for its remaining time', () => {
  const game = new StaplerGame();
  game.start();
  alignPaper(game);
  reachTiming(game);
  game.tick(0.3);
  game.tick(game.state.timingReadyIn + 0.2);
  assert.equal(game.state.timingReadyIn, 0);
  assert.ok(Math.abs(game.state.timingPosition - 0.2 * game.state.order.timingSpeed) < 1e-10);
});

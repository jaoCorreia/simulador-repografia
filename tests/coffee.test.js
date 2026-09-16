import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CUP_FLUID, retainedCapacity, liquidPlaneLevel, createFluidState, stepFluid, sipFluid, resetFluid, coffeeImpact, createCoffee } from '../src/coffee.js';

const degrees = angle => angle * Math.PI / 180;
const near = (a, b, tolerance = 1e-10) => assert(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('a fuller cup spills at a smaller tilt, while upright and modest angles retain it', () => {
  assert.equal(retainedCapacity(0), 1);
  assert.equal(retainedCapacity(degrees(10)), 1);
  const full = createFluidState(), half = createFluidState();
  sipFluid(half, .5);
  assert(stepFluid(full, .2, { tilt: degrees(30) }) > 0);
  assert.equal(stepFluid(half, .2, { tilt: degrees(30) }), 0);
  assert(stepFluid(half, .2, { tilt: degrees(70) }) > 0);
});

test('capacity decreases continuously toward zero on its side and upside down', () => {
  let previous = 1;
  for (let angle = 0; angle <= 180; angle++) {
    const capacity = retainedCapacity(degrees(angle));
    assert(capacity <= previous + 1e-12); assert(capacity >= 0); previous = capacity;
  }
  assert.equal(retainedCapacity(Math.PI / 2), 0);
  assert.equal(retainedCapacity(Math.PI), 0);
});

test('drained volume is independent of fixed-pose frame subdivision', () => {
  const coarse = createFluidState(), fine = createFluidState();
  stepFluid(coarse, .8, { tilt: degrees(58) });
  for (let frame = 0; frame < 80; frame++) stepFluid(fine, .01, { tilt: degrees(58) });
  near(coarse.fill, fine.fill); near(coarse.spilled, fine.spilled);
});

test('sipping, pouring and breaking conserve all of the original coffee', () => {
  const state = createFluidState();
  sipFluid(state, .23); stepFluid(state, .3, { tilt: degrees(67) }); sipFluid(state, .08);
  near(state.fill + state.spilled + state.consumed, 1);
  stepFluid(state, .01, { broken: true });
  assert.equal(state.fill, 0); assert(state.empty);
  near(state.spilled + state.consumed, 1);
  assert.equal(stepFluid(state, 1, { broken: true }), 0);
});

test('an inverted cup empties, refuses negative sips, and resets completely', () => {
  const state = createFluidState();
  stepFluid(state, 3, { tilt: Math.PI });
  assert.equal(state.fill, 0); assert.equal(sipFluid(state), 0); assert.equal(sipFluid(state, -1), 0);
  resetFluid(state); assert.deepEqual(state, createFluidState());
});

test('pause and invalid frame durations cannot drain or corrupt volume', () => {
  const state = createFluidState();
  const expected = { ...state };
  for (const dt of [NaN, Infinity, -1, 0]) assert.equal(stepFluid(state, dt, { tilt: Math.PI }), 0);
  stepFluid(state, 5, { enabled: false, broken: true });
  assert.deepEqual(state, expected);
  assert(Number.isFinite(retainedCapacity(NaN)));
});

test('liquid planes remain finite at upright, sideways and inverted orientations', () => {
  near(liquidPlaneLevel(1, { x: 0, y: 1, z: 0 }), CUP_FLUID.initialSurface, 1e-6);
  for (const y of [-1, -.01, 0, .01, 1]) for (const fill of [.01, .5, 1]) {
    const level = liquidPlaneLevel(fill, { x: Math.sqrt(1 - y * y), y, z: 0 });
    assert(Number.isFinite(level)); assert(Math.abs(level) < 1);
  }
});

test('a falling stream lands on the desk only inside its footprint', () => {
  assert.equal(coffeeImpact({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }).y, -.04);
  assert.equal(coffeeImpact({ x: 8, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }).y, -1.77);
  assert.equal(coffeeImpact({ x: 0, y: -.4, z: 0 }, { x: 0, y: 0, z: 0 }).y, -1.77);
});

test('rendered pouring uses bounded liquid, persistent puddles and one start event', () => {
  const scene = new THREE.Scene(), cup = new THREE.Group(), anchor = new THREE.Group();
  anchor.name = 'coffee'; cup.add(anchor); scene.add(cup); cup.position.set(1, 2, 0);
  const materials = [];
  const coffee = createCoffee({ scene, cup, mat(color, options) { const material = new THREE.MeshStandardMaterial({ color, ...options }); materials.push(material); return material; } });
  cup.rotation.z = degrees(70);
  coffee.update(1 / 60, { enabled: true });
  const surface = cup.getObjectByName('coffee-surface');
  const positions = surface.geometry.attributes.position;
  for (let i = 0; i < surface.geometry.drawRange.count; i++) {
    assert(Math.hypot(positions.getX(i), positions.getZ(i)) <= .347);
    assert(positions.getY(i) >= .160 && positions.getY(i) <= .846);
  }
  for (let frame = 0; frame < 120; frame++) coffee.update(1 / 60, { enabled: true });
  assert(coffee.getState().spilled > .5);
  assert.equal(coffee.consumeEvents().filter(event => event.type === 'pour').length, 1);
  assert(scene.getObjectByName('coffee-puddle'));
  const paused = coffee.getState(); coffee.update(.5, { enabled: false }); assert.deepEqual(coffee.getState(), paused);
  cup.rotation.z = 0; coffee.reset();
  assert.equal(coffee.getState().fill, 1); assert(!scene.getObjectByName('coffee-puddle'));
  coffee.dispose(); materials.forEach(material => material.dispose());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boundToDesk, createLobby } from '../src/lobby.js';

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0);
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ color: '#a87352' }));
  object.position.y = .46; scene.add(object);
  let used = 0;
  const lobby = createLobby({ scene, camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) }, items: [{ id: 'mug', name: 'Caneca', object, action: 'sip', message: 'Café!', onUse: () => { used++; } }] });
  return { lobby, scene, object, get used() { return used; } };
}

function timeclockFixture(response = { action: 'clock-in', duration: 1.7, message: 'Ponto registrado.' }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  const object = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.3, .28), new THREE.MeshStandardMaterial({ color: '#9dac9c' }));
  object.position.set(1.2, 2.4, -5.7);
  scene.add(object);
  camera.position.set(0, 4, 8);
  camera.lookAt(object.position);
  camera.updateMatrixWorld();
  let used = 0;
  const lobby = createLobby({
    scene, camera,
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
    items: [{
      id: 'timeclock', name: 'Relógio de ponto', object, action: 'clock-in',
      actionLabel: 'Bater o ponto', fixed: true, directUse: true,
      onUse: () => { used += 1; return response; },
    }],
  });
  return { lobby, scene, object, get used() { return used; } };
}

function captureTransform(object) {
  return { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() };
}

function assertTransformUnchanged(object, original) {
  assert.ok(object.position.equals(original.position), 'wall fixture position must remain fixed');
  assert.ok(object.quaternion.equals(original.quaternion), 'wall fixture orientation must remain fixed');
  assert.ok(object.scale.equals(original.scale), 'wall fixture size must remain fixed');
}

test('all lobby input mutations stay disabled during the game', () => {
  const f = fixture();
  const home = f.object.position.clone();
  f.lobby.select('mug'); f.lobby.beginDrag(500, 500); f.lobby.drag(800, 800);
  f.lobby.rotate(1); f.lobby.pickUp(); f.lobby.breakSelected(); f.lobby.throwSelected(); f.lobby.useSelected();
  assert.equal(f.lobby.getSelected(), null);
  assert.equal(f.lobby.getItems()[0].broken, false);
  assert.equal(f.used, 0);
  assert.ok(f.object.position.equals(home));
  f.lobby.dispose();
});

test('breaking excludes the prop and reset restores visibility and geometry transforms', () => {
  const f = fixture();
  const initialCount = f.scene.children.length;
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.rotate(.8); f.lobby.breakSelected();
  assert.equal(f.lobby.getItems()[0].broken, true);
  assert.equal(f.object.visible, false);
  assert.equal(f.lobby.getSelected(), null);
  assert.equal(f.lobby.select('mug'), null);
  assert.ok(f.scene.children.length >= initialCount + 18);
  f.lobby.reset();
  assert.equal(f.lobby.getItems()[0].broken, false);
  assert.equal(f.object.visible, true);
  assert.ok(Math.abs(f.object.rotation.y) < .0001);
  assert.equal(f.scene.children.length, initialCount);
  f.lobby.dispose();
});

test('held props shrink to examination size and disabling returns them to the desk', () => {
  const f = fixture();
  const home = f.object.position.clone();
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  for (let i = 0; i < 20; i++) f.lobby.update(.05);
  assert.equal(f.lobby.getSelected().held, true);
  assert.ok(f.object.scale.x < 1);
  assert.ok(!f.object.position.equals(home));
  f.lobby.setEnabled(false);
  assert.ok(f.object.position.equals(home));
  assert.equal(f.object.scale.x, 1);
  assert.equal(f.lobby.getSelected(), null);
  f.lobby.dispose();
});

test('throwing follows a flight before impact shatters the prop', () => {
  const f = fixture();
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.throwSelected();
  assert.equal(f.lobby.getItems()[0].broken, false);
  f.lobby.update(.05);
  assert.ok(f.object.position.y > .46);
  for (let i = 0; i < 180; i++) f.lobby.update(.05);
  assert.equal(f.lobby.getItems()[0].broken, true);
  f.lobby.dispose();
});

test('bounds contain the entire rotated footprint at every desk edge', () => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3));
  object.rotation.y = .6;
  object.position.set(12, .5, 9); object.updateMatrixWorld();
  const before = new THREE.Box3().setFromObject(object);
  object.position.copy(boundToDesk(object.position, before)); object.updateMatrixWorld();
  const after = new THREE.Box3().setFromObject(object);
  assert.ok(after.max.x <= 6.92 + .00001);
  assert.ok(after.max.z <= 4.1 + .00001);
  object.position.set(-12, .5, -9); object.updateMatrixWorld();
  object.position.copy(boundToDesk(object.position, new THREE.Box3().setFromObject(object))); object.updateMatrixWorld();
  const other = new THREE.Box3().setFromObject(object);
  assert.ok(other.min.x >= -6.92 - .00001);
  assert.ok(other.min.z >= -3.74 - .00001);
  object.geometry.dispose(); object.material.dispose();
});

test('fixed timeclock is selectable by inventory and raycast, with direct-use metadata', () => {
  const f = timeclockFixture();
  try {
    f.lobby.setEnabled(true);
    const selected = f.lobby.select('timeclock');
    assert.equal(selected.id, 'timeclock');
    assert.equal(selected.fixed, true);
    assert.equal(selected.directUse, true);
    assert.equal(f.lobby.getItems()[0].fixed, true);
    assert.equal(f.lobby.getItems()[0].directUse, true);
    f.lobby.deselect();
    const hit = f.lobby.beginDrag(500, 500);
    assert.equal(hit?.id, 'timeclock');
    assert.equal(hit.fixed, true);
    assert.equal(hit.directUse, true);
    assert.equal(f.used, 0, 'selection alone must not clock in before the UI requests use');
  } finally {
    f.lobby.dispose();
  }
});

const forbiddenClockActions = {
  drag(lobby) { lobby.beginDrag(500, 500); lobby.drag(870, 830); lobby.endDrag(); },
  rotate(lobby) { lobby.rotate(Math.PI / 3); },
  pickUp(lobby) { lobby.pickUp(); },
  throw(lobby) { lobby.throwSelected(); },
  break(lobby) { lobby.breakSelected(); },
};

for (const [name, mutate] of Object.entries(forbiddenClockActions)) {
  test(`fixed timeclock rejects ${name} and remains available for clocking in`, () => {
    const f = timeclockFixture();
    try {
      const original = captureTransform(f.object);
      f.lobby.setEnabled(true);
      f.lobby.select('timeclock');
      mutate(f.lobby);
      for (let i = 0; i < 40; i += 1) f.lobby.update(.05);
      assertTransformUnchanged(f.object, original);
      assert.equal(f.object.visible, true);
      assert.equal(f.lobby.getItems()[0].broken, false);
      assert.equal(f.lobby.getSelected()?.id, 'timeclock');
      assert.equal(f.lobby.getSelected().held, false);
      assert.equal(f.lobby.useSelected()?.action, 'clock-in');
      assert.equal(f.used, 1);
    } finally {
      f.lobby.dispose();
    }
  });
}

test('clock-in forwards its duration and message without moving the fixed wall fixture', () => {
  const f = timeclockFixture();
  try {
    const original = captureTransform(f.object);
    f.lobby.setEnabled(true);
    f.lobby.select('timeclock');
    const result = f.lobby.useSelected();
    assert.equal(f.used, 1);
    assert.equal(result.action, 'clock-in');
    assert.equal(result.duration, 1.7, 'the UI needs the animation duration before beginning orders');
    assert.equal(result.message, 'Ponto registrado.');
    for (let i = 0; i < 40; i += 1) {
      f.lobby.update(.05);
      assertTransformUnchanged(f.object, original);
    }
    assert.equal(f.lobby.getItems()[0].broken, false);
  } finally {
    f.lobby.dispose();
  }
});

test('timeclock onUse can reject clock-in without triggering an animation or start action', () => {
  const f = timeclockFixture({ action: 'feedback', message: 'Aguarde' });
  try {
    const original = captureTransform(f.object);
    f.lobby.setEnabled(true);
    f.lobby.select('timeclock');
    const result = f.lobby.useSelected();
    assert.equal(f.used, 1);
    assert.equal(result.action, 'feedback');
    assert.equal(result.message, 'Aguarde');
    assert.equal(result.duration, undefined);
    for (let i = 0; i < 20; i += 1) {
      f.lobby.update(.05);
      assertTransformUnchanged(f.object, original);
    }
  } finally {
    f.lobby.dispose();
  }
});

test('disabled lobby cannot trigger timeclock callbacks, including after previous selection', () => {
  const f = timeclockFixture();
  try {
    assert.equal(f.lobby.select('timeclock'), null);
    assert.equal(f.lobby.beginDrag(500, 500), null);
    assert.equal(f.lobby.useSelected(), null);
    assert.equal(f.used, 0);
    f.lobby.setEnabled(true);
    f.lobby.select('timeclock');
    f.lobby.setEnabled(false);
    assert.equal(f.lobby.getSelected(), null);
    assert.equal(f.lobby.useSelected(), null);
    assert.equal(f.used, 0);
    assert.equal(f.lobby.getItems()[0].broken, false);
  } finally {
    f.lobby.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boundToDesk, createLobby } from '../src/lobby.js';

function fixture(options = {}, additional = []) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  camera.position.set(0, 5, 8); camera.lookAt(0, 0, 0);
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshStandardMaterial({ color: '#a87352' }));
  object.position.y = .46; scene.add(object);
  for (const item of additional) scene.add(item.object);
  let used = 0;
  const lobby = createLobby({ scene, camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) }, items: [{ id: 'mug', name: 'Caneca', object, action: 'sip', message: 'Café!', onUse: () => { used++; }, ...options }, ...additional] });
  return { lobby, scene, object, camera, get used() { return used; } };
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
  f.lobby.moveHeld(600, 100); f.lobby.adjustHoldDistance(-3); f.lobby.dropSelected();
  assert.equal(f.lobby.getSelected(), null);
  assert.equal(f.lobby.getItems()[0].broken, false);
  assert.equal(f.used, 0);
  assert.ok(f.object.position.equals(home));
  assert.deepEqual(f.lobby.consumeEvents(), []);
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

test('carrying preserves actual prop size and disabling restores the home state', () => {
  const f = fixture();
  const home = f.object.position.clone();
  const initialDistance = f.camera.position.distanceTo(home);
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  for (let i = 0; i < 20; i++) f.lobby.update(.05);
  assert.equal(f.lobby.getSelected().held, true);
  assert.equal(f.object.scale.x, 1);
  assert.equal(f.lobby.getSelected().holdingMode, 'carry');
  assert.ok(f.camera.position.distanceTo(f.object.position) < initialDistance - 1, 'carrying brings the full-size prop closer to the player');
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
  const impacts = f.lobby.consumeEvents();
  assert.ok(impacts.some(event => event.type === 'impact' && event.id === 'mug' && event.broke));
  assert.deepEqual(f.lobby.consumeEvents(), []);
  f.lobby.dispose();
});

test('pointer drag picks up at real scale and springs through all three dimensions without teleporting', () => {
  const f = fixture({ fragile: false });
  f.lobby.setEnabled(true);
  const home = f.object.position.clone();
  const item = f.lobby.beginDrag(500, 500);
  assert.equal(item.id, 'mug');
  assert.equal(item.held, true);
  assert.equal(item.holdingMode, 'drag');
  f.lobby.drag(650, 350);
  assert.ok(f.object.position.equals(home), 'mouse input changes the spring target, not the object position directly');
  for (let i = 0; i < 25; i += 1) f.lobby.update(.02);
  assert.ok(f.object.position.x > home.x + .5);
  assert.ok(f.object.position.y > home.y + .5);
  assert.ok(Math.abs(f.object.position.z - home.z) > .1);
  assert.deepEqual(f.object.scale.toArray(), [1, 1, 1]);
  const oldDistance = f.lobby.getSelected().distance;
  const beforeDepth = f.object.position.clone();
  f.lobby.adjustHoldDistance(-1.5);
  for (let i = 0; i < 30; i += 1) f.lobby.update(.02);
  assert.ok(f.lobby.getSelected().distance < oldDistance - 1.4);
  assert.ok(f.object.position.distanceTo(beforeDepth) > .6);
  f.lobby.endDrag();
  assert.equal(f.lobby.getSelected().held, false);
  assert.equal(f.lobby.getSelected().holdingMode, null);
  f.lobby.dispose();
});

test('releasing a moving grab preserves inertia instead of returning to its old location', () => {
  const f = fixture({ fragile: false });
  f.lobby.setEnabled(true);
  f.lobby.beginDrag(500, 500);
  f.lobby.drag(700, 330);
  f.lobby.update(.05);
  const releasePosition = f.object.position.clone();
  f.lobby.endDrag();
  assert.ok(f.object.position.equals(releasePosition), 'release must not teleport');
  f.lobby.update(.05);
  assert.ok(f.object.position.x > releasePosition.x + .05, 'the existing sideways velocity continues after release');
  assert.equal(f.object.scale.x, 1);
  f.lobby.dispose();
});

test('ordinary ceramic drops land at their new location, survive and emit a contact sound event', () => {
  const f = fixture();
  f.lobby.setEnabled(true);
  f.lobby.beginDrag(500, 500);
  f.lobby.drag(650, 430);
  for (let i = 0; i < 100; i += 1) f.lobby.update(.02);
  const droppedAt = f.object.position.clone();
  f.lobby.dropSelected();
  assert.ok(f.object.position.equals(droppedAt));
  for (let i = 0; i < 200; i += 1) f.lobby.update(.02);
  assert.equal(f.lobby.getItems()[0].broken, false);
  assert.ok(f.object.position.x > .6);
  assert.ok(Math.abs(f.object.position.y - .46) < .015);
  assert.equal(f.lobby.getSelected().moving, false);
  const contacts = f.lobby.consumeEvents();
  assert.ok(contacts.some(event => event.type === 'impact' && !event.broke));
  assert.ok(contacts.every(event => !event.broke));
  f.lobby.dispose();
});

test('a high ceramic drop can break and marks that same impact to avoid duplicate audio', () => {
  const f = fixture();
  f.lobby.setEnabled(true);
  f.lobby.select('mug'); f.lobby.pickUp();
  f.lobby.moveHeld(500, 80);
  for (let i = 0; i < 100; i += 1) f.lobby.update(.02);
  assert.ok(f.object.position.y > 2.8);
  f.lobby.dropSelected();
  for (let i = 0; i < 200; i += 1) f.lobby.update(.02);
  assert.equal(f.lobby.getItems()[0].broken, true);
  const brokenImpact = f.lobby.consumeEvents().filter(event => event.broke);
  assert.equal(brokenImpact.length, 1);
  assert.equal(brokenImpact[0].id, 'mug');
  assert.ok(brokenImpact[0].intensity > .5 && brokenImpact[0].intensity <= 1);
  f.lobby.dispose();
});

test('rotation while held is preserved and the rotated lower bound rests on the desk', () => {
  const f = fixture({ fragile: false });
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  f.lobby.rotate(Math.PI / 4, 'x');
  f.lobby.rotate(.2, 'z');
  for (let i = 0; i < 80; i += 1) f.lobby.update(.02);
  const tilted = f.object.quaternion.clone();
  assert.ok(Math.abs(f.object.rotation.x) > .5);
  f.lobby.dropSelected();
  for (let i = 0; i < 160; i += 1) f.lobby.update(.02);
  assert.ok(f.object.quaternion.angleTo(tilted) < .025);
  const box = new THREE.Box3().setFromObject(f.object);
  assert.ok(Math.abs(box.min.y - (-.04)) < .01, 'ground support must use the rotated bounding box');
  assert.ok(f.object.position.y > .9);
  f.lobby.dispose();
});

test('held use preserves the spring grip and exposes object-specific status', () => {
  const f = fixture({ getStatus: () => ({ liquidFill: 72, spilling: true }) });
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  f.lobby.moveHeld(550, 420);
  for (let i = 0; i < 40; i += 1) f.lobby.update(.02);
  const before = captureTransform(f.object);
  f.lobby.useSelected();
  assert.equal(f.used, 1);
  assertTransformUnchanged(f.object, before);
  assert.equal(f.lobby.getSelected().held, true);
  assert.equal(f.lobby.getSelected().holdingMode, 'carry');
  assert.equal(f.lobby.getSelected().liquidFill, 72);
  assert.equal(f.lobby.getSelected().spilling, true);
  f.lobby.dispose();
});

test('help pause freezes active physics and selection changes release the carried prop physically', () => {
  const neighbor = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial());
  neighbor.position.set(-3, .21, 0);
  const f = fixture({ fragile: false }, [{ id: 'neighbor', object: neighbor }]);
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  f.lobby.moveHeld(600, 350);
  f.lobby.update(.05);
  f.lobby.setPaused(true);
  const frozen = captureTransform(f.object);
  f.lobby.moveHeld(900, 100); f.lobby.rotate(1, 'x'); f.lobby.adjustHoldDistance(-4); f.lobby.update(.1);
  assertTransformUnchanged(f.object, frozen);
  f.lobby.setPaused(false);
  const releasedAt = f.object.position.clone();
  f.lobby.select('neighbor');
  assert.ok(f.object.position.equals(releasedAt));
  assert.equal(f.lobby.getItems()[0].held, false);
  f.lobby.update(.05);
  assert.ok(f.object.position.distanceTo(releasedAt) > .02);
  f.lobby.dispose();
});

test('moving props push nearby movable props through basic body contacts', () => {
  const neighbor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  neighbor.position.set(2.5, .46, 0);
  const f = fixture({ fragile: false, mass: 2 }, [{ id: 'neighbor', object: neighbor, mass: .5, fragile: false }]);
  f.lobby.setEnabled(true); f.lobby.beginDrag(500, 500);
  f.lobby.drag(720, 470);
  for (let i = 0; i < 100; i += 1) f.lobby.update(.02);
  assert.ok(neighbor.position.x > 2.7, 'a lighter desk object is displaced by the moving grab');
  assert.equal(f.lobby.getItems()[1].broken, false);
  f.lobby.dispose();
});

test('props can leave the desk and settle on the floor while staying inside room bounds', () => {
  const f = fixture({ fragile: false });
  f.lobby.setEnabled(true); f.lobby.select('mug'); f.lobby.pickUp();
  f.lobby.moveHeld(1300, 400);
  f.lobby.adjustHoldDistance(100);
  for (let i = 0; i < 100; i += 1) f.lobby.update(.02);
  const heldBox = new THREE.Box3().setFromObject(f.object);
  assert.ok(heldBox.max.x <= 8.35 + .001);
  assert.ok(f.object.position.x > 6.92, 'the desk edge does not glue an airborne prop to the tabletop');
  f.lobby.dropSelected();
  for (let i = 0; i < 250; i += 1) f.lobby.update(.02);
  const floorBox = new THREE.Box3().setFromObject(f.object);
  assert.ok(Math.abs(floorBox.min.y - (-1.77)) < .01);
  assert.equal(f.lobby.getItems()[0].broken, false);
  f.lobby.dispose();
});

test('normal carry pickup of the offset scene mug lifts clear of the desk without breaking props', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  camera.position.set(5.15, 5.65, 9.2);
  camera.lookAt(.35, .48, -.05);
  const material = new THREE.MeshStandardMaterial();
  const mug = new THREE.Mesh(new THREE.BoxGeometry(.8, .85, .8), material);
  mug.position.set(4.6, .385, -.72);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .08, 16), material);
  saucer.position.set(4.6, 0, -.72);
  const papers = new THREE.Mesh(new THREE.BoxGeometry(2.97, .14, 3.76), material);
  papers.position.set(1.05, .06, 2.3);
  scene.add(mug, saucer, papers);
  const lobby = createLobby({ scene, camera,
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) },
    items: [{ id: 'mug', object: mug, fragile: true, mass: .45, breakThreshold: 6 },
      { id: 'saucer', object: saucer, fragile: true, mass: .22 }, { id: 'papers', object: papers }],
  });
  lobby.setEnabled(true); lobby.select('mug'); lobby.pickUp(500, 500);
  for (let i = 0; i < 50; i += 1) lobby.update(.02);
  assert.equal(lobby.getSelected()?.held, true);
  assert.equal(lobby.getSelected().holdingMode, 'carry');
  assert.ok(lobby.getItems().every(item => !item.broken));
  assert.ok(mug.position.y > 1.2, 'the pickup clears the desk before travelling toward the player');
  assert.ok(camera.position.distanceTo(mug.position) < 7.7);
  assert.ok(mug.position.z < 4.1, 'the default carry position stays above the visible front of the desk');
  assert.deepEqual(mug.scale.toArray(), [1, 1, 1]);
  assert.ok(lobby.consumeEvents().every(event => !event.broke));
  lobby.dispose();
});

test('constraint acceleration cannot shatter a held ceramic even against the room boundary', () => {
  const f = fixture();
  f.lobby.setEnabled(true); f.lobby.beginDrag(500, 500);
  f.lobby.drag(3000, -500);
  for (let i = 0; i < 70; i += 1) f.lobby.update(.02);
  assert.equal(f.lobby.getItems()[0].broken, false);
  assert.equal(f.lobby.getSelected().held, true);
  assert.ok(f.lobby.consumeEvents().every(event => !event.broke));
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

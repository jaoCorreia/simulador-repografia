import * as THREE from 'three';
import { ROOM, pullToward, contactBetween } from './lobby-physics.js';

const DESK = { minX: -6.92, maxX: 6.92, minZ: -3.74, maxZ: 4.1, y: -.04 };
const FLOOR = -1.77;

/** Keep the whole rotated footprint on the desk, rather than only its origin. */
export function boundToDesk(position, box, desk = DESK) {
  const next = position.clone();
  const minX = desk.minX + position.x - box.min.x;
  const maxX = desk.maxX - box.max.x + position.x;
  const minZ = desk.minZ + position.z - box.min.z;
  const maxZ = desk.maxZ - box.max.z + position.z;
  next.x = minX > maxX ? (minX + maxX) / 2 : THREE.MathUtils.clamp(next.x, minX, maxX);
  next.z = minZ > maxZ ? (minZ + maxZ) / 2 : THREE.MathUtils.clamp(next.z, minZ, maxZ);
  return next;
}

/** Real-scale spring grabbing and lightweight contact physics, isolated to the lobby. */
export function createLobby({ scene, camera, canvas, items }) {
  let enabled = false, paused = false, selected = null, hovered = null, held = null, grab = null;
  let dragging = false, elapsed = 0;
  const events = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const bounds = new THREE.Box3();
  const direction = new THREE.Vector3();
  const records = items.map(definition => {
    const object = definition.object;
    const transforms = [];
    object.traverse(child => transforms.push({ child, position: child.position.clone(), quaternion: child.quaternion.clone(), scale: child.scale.clone(), visible: child.visible }));
    const fragile = definition.fragile ?? ['mug', 'saucer'].includes(definition.id);
    return { ...definition, object, fragile, mass: Math.max(.2, definition.mass || 1),
      breakThreshold: definition.breakThreshold ?? (fragile ? 6 : 11), broken: false,
      motion: false, forceful: false, animation: null, transforms, velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(), box: new THREE.Box3(), restTime: 0, lastImpact: -Infinity,
      home: { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() } };
  });
  const ignoredInitialOverlaps = new Set();
  const fragments = [];
  const fragmentMaterials = new Set();
  const shardGeometries = [new THREE.TetrahedronGeometry(1), new THREE.DodecahedronGeometry(1, 0), new THREE.BoxGeometry(1, 1, 1)];
  const selectionOutline = new THREE.Box3Helper(new THREE.Box3(), '#e1b34e');
  selectionOutline.material.transparent = true;
  selectionOutline.material.opacity = .4;
  selectionOutline.material.depthTest = false;
  selectionOutline.renderOrder = 20;
  selectionOutline.visible = false;
  scene.add(selectionOutline);

  function worldPosition(record) { return record.object.getWorldPosition(new THREE.Vector3()); }
  function place(record, position) {
    record.object.position.copy(record.object.parent ? record.object.parent.worldToLocal(position.clone()) : position);
    record.object.updateMatrixWorld(true);
  }
  function boxOf(record) {
    record.object.updateMatrixWorld(true);
    return record.box.setFromObject(record.object);
  }
  function metadata(record) {
    return record ? { ...record.getStatus?.(), id: record.id, name: record.name, description: record.description,
      actionLabel: record.actionLabel, broken: record.broken, held: held === record,
      holdingMode: held === record ? grab?.mode || null : null,
      distance: held === record ? Math.round(grab.distance * 100) / 100 : null,
      moving: !!record.motion, fixed: !!record.fixed, directUse: !!record.directUse } : null;
  }
  function pointRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return true;
  }
  function hit(clientX, clientY) {
    if (!pointRay(clientX, clientY)) return null;
    scene.updateMatrixWorld(true);
    const candidates = records.filter(item => !item.broken);
    for (const collision of raycaster.intersectObjects(candidates.map(item => item.object), true)) {
      let object = collision.object;
      while (object) {
        const record = candidates.find(item => item.object === object);
        if (record) return { record, point: collision.point, distance: collision.distance };
        object = object.parent;
      }
    }
    return null;
  }
  function stopAnimation(record) {
    if (!record?.animation) return;
    record.animation.object.position.copy(record.animation.position);
    record.animation.object.quaternion.copy(record.animation.quaternion);
    record.animation = null;
  }
  function release() {
    if (!held) return;
    held.motion = true;
    held.restTime = 0;
    held.velocity.clampLength(0, 10);
    held = null; grab = null; dragging = false;
  }
  function choose(record) {
    if (held && held !== record) release();
    stopAnimation(selected);
    selected = record;
    hovered = null;
    return metadata(record);
  }
  function clearFragments() {
    for (const fragment of fragments) scene.remove(fragment.object);
    fragments.length = 0;
    for (const material of fragmentMaterials) material.dispose();
    fragmentMaterials.clear();
  }
  function rememberInitialOverlaps() {
    ignoredInitialOverlaps.clear();
    records.forEach(boxOf);
    for (let a = 0; a < records.length; a += 1) for (let b = a + 1; b < records.length; b += 1) {
      if (records[a].box.intersectsBox(records[b].box)) ignoredInitialOverlaps.add(`${a}:${b}`);
    }
  }
  function reset() {
    held = selected = hovered = grab = null;
    dragging = false;
    events.length = 0;
    for (const item of records) {
      item.broken = false; item.motion = false; item.animation = null; item.forceful = false; item.restTime = 0; item.lastImpact = -Infinity;
      item.velocity.set(0, 0, 0); item.angularVelocity.set(0, 0, 0);
      for (const transform of item.transforms) {
        transform.child.position.copy(transform.position);
        transform.child.quaternion.copy(transform.quaternion);
        transform.child.scale.copy(transform.scale);
        transform.child.visible = transform.visible;
      }
      item.onReset?.();
    }
    clearFragments();
    selectionOutline.visible = false;
    rememberInitialOverlaps();
  }
  function shatter(item, impact = new THREE.Vector3()) {
    stopAnimation(item);
    item.object.updateMatrixWorld(true);
    bounds.setFromObject(item.object);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const palette = [];
    item.object.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material?.color && !palette.some(color => color.equals(material.color))) palette.push(material.color.clone());
    });
    const shardPalette = palette.slice(0, 5).map(color => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: .77 });
      fragmentMaterials.add(material);
      return material;
    });
    const count = item.id === 'papers' ? 28 : 24;
    for (let i = 0; i < count; i++) {
      const material = shardPalette[i % shardPalette.length];
      const object = new THREE.Mesh(shardGeometries[item.id === 'papers' ? 2 : i % shardGeometries.length], material);
      const span = Math.max(.09, Math.min(.3, size.length() / 9));
      object.scale.set(span * (.65 + Math.random()), item.id === 'papers' ? .016 : span * (.35 + Math.random() * .65), span * (.6 + Math.random()));
      object.position.copy(center).add(new THREE.Vector3((Math.random() - .5) * size.x * .7, (Math.random() - .5) * size.y * .6, (Math.random() - .5) * size.z * .7));
      object.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      object.castShadow = object.receiveShadow = true;
      scene.add(object);
      fragments.push({ object, velocity: new THREE.Vector3((Math.random() - .5) * 4 + impact.x * .2, 1.3 + Math.random() * 2.5, (Math.random() - .5) * 4 + impact.z * .2), spin: new THREE.Vector3(Math.random() * 7 - 3.5, Math.random() * 7 - 3.5, Math.random() * 7 - 3.5), settled: false, age: 0 });
    }
    item.object.visible = false; item.broken = true; item.motion = false;
    item.velocity.set(0, 0, 0); item.angularVelocity.set(0, 0, 0);
    if (held === item) { held = null; grab = null; }
    if (selected === item) selected = null;
    if (hovered === item) hovered = null;
    dragging = false;
    selectionOutline.visible = false;
  }

  function groundAt(position) {
    return position.x > DESK.minX && position.x < DESK.maxX && position.z > DESK.minZ && position.z < DESK.maxZ ? DESK.y : FLOOR;
  }
  function impact(item, speed, allowBreak = true) {
    if (item.fixed || item.broken || speed < .65) return;
    // Spring corrections are player input, not a physically thrown impact.
    const broke = allowBreak && held !== item && ((item.fragile && speed >= item.breakThreshold)
      || (item.forceful && speed >= Math.min(item.breakThreshold, 5.6)));
    if (broke || elapsed - item.lastImpact > .16) {
      events.push({ type: 'impact', id: item.id, intensity: Math.min(1, speed / 10), broke });
      if (events.length > 32) events.shift();
      item.lastImpact = elapsed;
    }
    if (broke) shatter(item, item.velocity.clone());
  }
  function projectTarget() {
    if (!grab || !held || !pointRay(grab.x, grab.y)) return;
    grab.target.copy(raycaster.ray.at(grab.distance, new THREE.Vector3()));
    const origin = worldPosition(held);
    const contact = held.object.localToWorld(grab.localContact.clone());
    grab.target.add(origin.sub(contact));
    grab.target.y += .12;
    if (grab.mode === 'carry' && grab.age < .7) {
      const travel = THREE.MathUtils.smoothstep(grab.age, .16, .7);
      grab.target.x = THREE.MathUtils.lerp(grab.start.x, grab.target.x, travel);
      grab.target.z = THREE.MathUtils.lerp(grab.start.z, grab.target.z, travel);
      const raised = Math.max(grab.start.y + .75, grab.target.y);
      grab.target.y = THREE.MathUtils.lerp(raised, grab.target.y, THREE.MathUtils.smoothstep(grab.age, .42, .7));
    }
    grab.target.x = THREE.MathUtils.clamp(grab.target.x, ROOM.minX, ROOM.maxX);
    grab.target.z = THREE.MathUtils.clamp(grab.target.z, ROOM.minZ, ROOM.maxZ);
    grab.target.y = THREE.MathUtils.clamp(grab.target.y, FLOOR + .1, ROOM.maxY);
  }
  function startHold(item, mode, clientX, clientY, collision = null) {
    stopAnimation(item);
    if (held && held !== item) release();
    const origin = worldPosition(item);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      camera.updateMatrixWorld();
      const projected = origin.clone().project(camera);
      const rect = canvas.getBoundingClientRect();
      clientX = rect.left + (projected.x + 1) * rect.width / 2;
      clientY = rect.top + (1 - projected.y) * rect.height / 2;
    }
    if (!pointRay(clientX, clientY)) return;
    const contact = collision?.point || origin;
    const contactDistance = collision?.distance ?? origin.distanceTo(raycaster.ray.origin);
    const size = boxOf(item).getSize(new THREE.Vector3());
    const distance = mode === 'carry'
      ? Math.min(contactDistance, Math.max(7, size.length() * 1.6 + 1))
      : contactDistance;
    held = item; selected = item; dragging = mode === 'drag';
    item.motion = true; item.forceful = false; item.restTime = 0;
    grab = { mode, x: clientX, y: clientY, distance, age: 0, start: origin.clone(), minDistance: Math.max(1.4, size.length() * .65),
      target: origin.clone(), localContact: item.object.worldToLocal(contact.clone()), orientation: item.object.quaternion.clone() };
    projectTarget();
  }
  function constrainToRoom(item) {
    const box = boxOf(item);
    const position = worldPosition(item);
    for (const axis of ['x', 'z']) {
      const lower = ROOM[axis === 'x' ? 'minX' : 'minZ'];
      const upper = ROOM[axis === 'x' ? 'maxX' : 'maxZ'];
      let displacement = 0;
      if (box.min[axis] < lower) displacement = lower - box.min[axis];
      else if (box.max[axis] > upper) displacement = upper - box.max[axis];
      if (displacement) {
        const speed = Math.abs(item.velocity[axis]);
        position[axis] += displacement;
        item.velocity[axis] *= -.25;
        place(item, position);
        impact(item, speed);
        if (item.broken) return;
      }
    }
    if (box.max.y > ROOM.maxY) {
      position.y -= box.max.y - ROOM.maxY;
      place(item, position);
      item.velocity.y = Math.min(0, item.velocity.y);
    }
  }
  function groundContact(item, dt) {
    const box = boxOf(item);
    const position = worldPosition(item);
    const ground = groundAt(position);
    if (box.min.y > ground + .001) { item.restTime = 0; return; }
    const speed = Math.max(0, -item.velocity.y);
    position.y += ground - box.min.y;
    place(item, position);
    const impactSpeed = Math.hypot(speed, item.forceful ? Math.hypot(item.velocity.x, item.velocity.z) * .9 : 0);
    impact(item, impactSpeed);
    if (item.broken) return;
    if (item.velocity.y < 0) item.velocity.y = speed > 1.1 ? speed * .22 : 0;
    item.velocity.x *= Math.exp(-dt * 9);
    item.velocity.z *= Math.exp(-dt * 9);
    item.angularVelocity.multiplyScalar(Math.exp(-dt * 11));
    if (held === item) return;
    if (item.velocity.lengthSq() < .008 && item.angularVelocity.lengthSq() < .02) item.restTime += dt;
    else item.restTime = 0;
    if (item.restTime > .22) {
      item.motion = false; item.forceful = false;
      item.velocity.set(0, 0, 0); item.angularVelocity.set(0, 0, 0);
    }
  }
  function bodyContacts() {
    const normalVelocity = new THREE.Vector3();
    records.filter(item => !item.broken).forEach(boxOf);
    for (let a = 0; a < records.length; a += 1) for (let b = a + 1; b < records.length; b += 1) {
      const first = records[a], second = records[b];
      if (first.broken || second.broken || (!first.motion && !second.motion)) continue;
      const key = `${a}:${b}`;
      if (ignoredInitialOverlaps.has(key)) {
        if (!first.box.intersectsBox(second.box)) ignoredInitialOverlaps.delete(key);
        else continue;
      }
      const contact = contactBetween(first.box, second.box);
      if (!contact) continue;
      const invA = first.fixed ? 0 : (held === first ? .18 : 1) / first.mass;
      const invB = second.fixed ? 0 : (held === second ? .18 : 1) / second.mass;
      const total = invA + invB;
      if (!total) continue;
      const { normal, depth } = contact;
      if (invA) { place(first, worldPosition(first).addScaledVector(normal, (depth + .001) * invA / total)); first.motion = true; }
      if (invB) { place(second, worldPosition(second).addScaledVector(normal, -(depth + .001) * invB / total)); second.motion = true; }
      const closing = -normalVelocity.copy(first.velocity).sub(second.velocity).dot(normal);
      if (closing > 0) {
        const impulse = closing * 1.18 / total;
        first.velocity.addScaledVector(normal, impulse * invA);
        second.velocity.addScaledVector(normal, -impulse * invB);
        const freeImpact = held !== first && held !== second;
        if (invA) impact(first, closing, freeImpact);
        if (invB) impact(second, closing, freeImpact);
      }
      if (!first.broken) boxOf(first);
      if (!second.broken) boxOf(second);
    }
  }
  function animate(item, dt) {
    const animation = item.animation;
    animation.time += dt;
    const progress = Math.min(1, animation.time / animation.duration);
    const wave = Math.sin(progress * Math.PI);
    const object = animation.object;
    object.position.copy(animation.position); object.quaternion.copy(animation.quaternion);
    if (animation.kind === 'sip') { object.position.y += wave * .45; object.rotateZ(-wave * .52); }
    else if (animation.kind === 'stamp') object.position.y += Math.sin(Math.min(1, progress * 1.8) * Math.PI) * .55;
    else if (animation.kind === 'shuffle' || animation.kind === 'sort') { object.position.y += wave * .16; object.rotateY(Math.sin(progress * Math.PI * 4) * .065 * wave); }
    else if (animation.kind === 'write' || animation.kind === 'erase') { object.position.x += Math.sin(progress * Math.PI * 8) * .13 * wave; object.position.y += wave * .09; }
    else { object.position.y += wave * .13; object.rotateZ(Math.sin(progress * Math.PI * 5) * .07 * wave); }
    if (progress === 1) stopAnimation(item);
  }
  function update(dt) {
    if (!enabled || paused || !Number.isFinite(dt) || dt <= 0) return;
    dt = THREE.MathUtils.clamp(dt, 0, .1);
    elapsed += dt;
    const steps = Math.ceil(dt / (1 / 120));
    const step = dt / steps;
    for (let substep = 0; substep < steps; substep += 1) {
      for (const item of records) {
        if (item.fixed || item.broken || item.animation || !item.motion) continue;
        if (held === item) {
          grab.age += step;
          const before = item.object.quaternion.clone();
          item.object.quaternion.slerp(grab.orientation, 1 - Math.exp(-step * 22));
          const difference = item.object.quaternion.clone().multiply(before.invert()).normalize();
          const angle = 2 * Math.acos(THREE.MathUtils.clamp(difference.w, -1, 1));
          const sine = Math.sqrt(Math.max(0, 1 - difference.w * difference.w));
          item.angularVelocity.set(difference.x, difference.y, difference.z).multiplyScalar(sine > .0001 ? angle / sine / step : 0).clampLength(0, 7);
          projectTarget();
          place(item, pullToward(worldPosition(item), grab.target, item.velocity, item.mass, step));
        } else {
          item.velocity.y -= 9.8 * step;
          item.velocity.multiplyScalar(Math.exp(-step * .16));
          place(item, worldPosition(item).addScaledVector(item.velocity, step));
          const speed = item.angularVelocity.length();
          if (speed > .001) item.object.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(item.angularVelocity.clone().normalize(), speed * step));
          item.angularVelocity.multiplyScalar(Math.exp(-step * .55));
        }
        constrainToRoom(item);
        if (!item.broken) groundContact(item, step);
      }
      bodyContacts();
    }
    for (const item of records) if (item.animation) animate(item, dt);
    for (const fragment of fragments) {
      if (fragment.settled) continue;
      fragment.age += dt; fragment.velocity.y -= 9.8 * dt;
      fragment.object.position.addScaledVector(fragment.velocity, dt);
      fragment.object.rotation.x += fragment.spin.x * dt; fragment.object.rotation.y += fragment.spin.y * dt; fragment.object.rotation.z += fragment.spin.z * dt;
      const ground = groundAt(fragment.object.position) + fragment.object.scale.y * .32;
      if (fragment.object.position.y <= ground && fragment.velocity.y < 0) {
        fragment.object.position.y = ground; fragment.velocity.y *= -.32;
        fragment.velocity.x *= .67; fragment.velocity.z *= .67; fragment.spin.multiplyScalar(.58);
        if (Math.abs(fragment.velocity.y) < .16 || fragment.age > 7) fragment.settled = true;
      }
    }
    const outlined = selected || hovered;
    selectionOutline.visible = !!outlined && !outlined.broken && outlined !== held;
    if (selectionOutline.visible) {
      selectionOutline.box.copy(boxOf(outlined)).expandByScalar(.04);
      selectionOutline.material.opacity = selected ? .5 : .3;
    }
  }
  rememberInitialOverlaps();

  return {
    getItems: () => records.map(metadata),
    getSelected: () => metadata(selected),
    isEnabled: () => enabled,
    setEnabled(value) { if (!value) reset(); enabled = !!value; paused = false; },
    setPaused(value) { paused = !!value; },
    consumeEvents() { return events.splice(0); },
    hover(clientX, clientY) {
      if (!enabled || paused) return null;
      hovered = held ? null : hit(clientX, clientY)?.record || null;
      return metadata(hovered);
    },
    beginDrag(clientX, clientY) {
      if (!enabled || paused) return null;
      const collision = hit(clientX, clientY);
      if (!collision) { choose(null); return null; }
      const item = collision.record;
      choose(item);
      if (!item.fixed) startHold(item, 'drag', clientX, clientY, collision);
      return metadata(item);
    },
    drag(clientX, clientY) { if (enabled && !paused && held && grab.mode === 'drag') { grab.x = clientX; grab.y = clientY; projectTarget(); } },
    moveHeld(clientX, clientY) { if (enabled && !paused && held) { grab.x = clientX; grab.y = clientY; projectTarget(); } },
    adjustHoldDistance(delta) {
      if (!enabled || paused || !held || !Number.isFinite(delta)) return;
      grab.distance = THREE.MathUtils.clamp(grab.distance + delta, grab.minDistance, 17);
      projectTarget();
    },
    endDrag() { if (enabled && grab?.mode === 'drag') release(); dragging = false; },
    select(id) {
      if (!enabled || paused) return null;
      const item = records.find(record => record.id === id && !record.broken);
      return item ? choose(item) : null;
    },
    rotate(deltaRadians, axis = 'y') {
      if (!enabled || paused || !selected || selected.fixed || !Number.isFinite(deltaRadians) || !['x', 'y', 'z'].includes(axis)) return;
      stopAnimation(selected);
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), deltaRadians);
      if (held === selected) grab.orientation.premultiply(rotation);
      else { selected.object.quaternion.premultiply(rotation); selected.motion = true; selected.restTime = 0; }
    },
    pickUp(clientX, clientY) {
      if (!enabled || paused || !selected || selected.fixed) return;
      if (held === selected) { release(); return; }
      startHold(selected, 'carry', clientX, clientY);
    },
    dropSelected() { if (enabled && !paused) release(); },
    throwSelected() {
      if (!enabled || paused || !selected || selected.fixed) return;
      const item = selected;
      stopAnimation(item);
      const velocity = item.velocity.clone();
      if (held === item) release();
      camera.getWorldDirection(direction);
      item.velocity.copy(direction).multiplyScalar(8.2).addScaledVector(velocity, .5);
      item.velocity.y = Math.max(2.6, item.velocity.y + 5.2);
      item.angularVelocity.set(2.3, 1.1, 1.5);
      item.motion = true; item.forceful = true; item.restTime = 0;
      selected = hovered = null;
      return { message: `${item.name} voando!`, kind: 'throw' };
    },
    breakSelected() {
      if (!enabled || paused || !selected || selected.fixed) return;
      const item = selected; shatter(item);
      return { message: `${item.name} em pedaços. A mesa pode ser restaurada.`, kind: 'break' };
    },
    useSelected() {
      if (!enabled || paused || !selected) return null;
      const item = selected;
      if (item.fixed || item.action === 'clock-in') return item.onUse?.() || { action: 'feedback', message: item.message || '' };
      stopAnimation(item);
      const feedback = item.onUse?.() || {};
      if (held !== item && !item.motion && feedback.action !== 'feedback') {
        const object = item.actionObject || item.object;
        item.animation = { object, time: 0, duration: item.action === 'sip' ? 1.25 : .85, kind: item.action, position: object.position.clone(), quaternion: object.quaternion.clone() };
      }
      return { action: 'feedback', kind: item.action, message: item.message || '', ...feedback };
    },
    reset,
    deselect() { if (enabled && !paused) { release(); choose(null); } },
    update,
    dispose() {
      reset(); scene.remove(selectionOutline);
      selectionOutline.geometry.dispose(); selectionOutline.material.dispose();
      for (const geometry of shardGeometries) geometry.dispose();
    },
  };
}

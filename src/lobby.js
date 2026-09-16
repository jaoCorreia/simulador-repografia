import * as THREE from 'three';

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

/** Scene interaction is deliberately isolated from the stapling game's input. */
export function createLobby({ scene, camera, canvas, items }) {
  let enabled = false, selected = null, hovered = null, dragging = false, held = null;
  let elapsed = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK.y);
  const dragOffset = new THREE.Vector3();
  const rayPoint = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const direction = new THREE.Vector3();
  const records = items.map(definition => {
    const object = definition.object;
    const transforms = [];
    object.traverse(child => transforms.push({ child, position: child.position.clone(), quaternion: child.quaternion.clone(), scale: child.scale.clone(), visible: child.visible }));
    return { ...definition, object, broken: false, motion: null, animation: null, transforms,
      home: { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() } };
  });
  const fragments = [];
  const fragmentMaterials = new Set();
  const shardGeometries = [new THREE.TetrahedronGeometry(1), new THREE.DodecahedronGeometry(1, 0), new THREE.BoxGeometry(1, 1, 1)];
  const selectionOutline = new THREE.Box3Helper(new THREE.Box3(), '#e1b34e');
  selectionOutline.material.transparent = true;
  selectionOutline.material.opacity = .85;
  selectionOutline.material.depthTest = false;
  selectionOutline.renderOrder = 20;
  selectionOutline.visible = false;
  scene.add(selectionOutline);

  function metadata(record) {
    return record ? { id: record.id, name: record.name, description: record.description,
      actionLabel: record.actionLabel, broken: record.broken, held: held === record, fixed: !!record.fixed, directUse: !!record.directUse } : null;
  }
  function pointRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    return true;
  }
  function hit(clientX, clientY) {
    if (!pointRay(clientX, clientY)) return null;
    scene.updateMatrixWorld(true);
    const candidates = records.filter(item => !item.broken && !item.motion);
    const hits = raycaster.intersectObjects(candidates.map(item => item.object), true);
    for (const collision of hits) {
      let object = collision.object;
      while (object) {
        const record = candidates.find(item => item.object === object);
        if (record) return record;
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
  function fitOnDesk(record) {
    record.object.updateMatrixWorld(true);
    bounds.setFromObject(record.object);
    record.object.position.copy(boundToDesk(record.object.position, bounds));
  }
  function putDown() {
    if (!held) return;
    const item = held;
    stopAnimation(item);
    item.object.position.copy(item.tablePosition);
    item.object.quaternion.copy(item.tableQuaternion);
    item.object.scale.copy(item.home.scale);
    held = null;
    fitOnDesk(item);
  }
  function choose(record) {
    dragging = false;
    if (held && held !== record) putDown();
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
  function reset() {
    held = selected = hovered = null;
    dragging = false;
    for (const item of records) {
      item.broken = false; item.motion = null; item.animation = null;
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
    item.object.visible = false; item.broken = true; item.motion = null;
    if (held === item) held = null;
    if (selected === item) selected = null;
    if (hovered === item) hovered = null;
    dragging = false;
    selectionOutline.visible = false;
  }
  function groundAt(position) {
    return position.x > DESK.minX && position.x < DESK.maxX && position.z > DESK.minZ && position.z < DESK.maxZ ? DESK.y : FLOOR;
  }
  function update(dt) {
    if (!enabled) return;
    dt = THREE.MathUtils.clamp(dt, 0, .05);
    elapsed += dt;
    if (held) {
      camera.getWorldDirection(direction);
      const target = camera.position.clone().addScaledVector(direction, 3.35);
      target.y -= .22;
      held.object.position.lerp(target, 1 - Math.exp(-dt * 13));
    }
    for (const item of records) {
      if (item.motion) {
        const motion = item.motion;
        motion.velocity.y -= 9.8 * dt;
        item.object.position.addScaledVector(motion.velocity, dt);
        item.object.rotateX(dt * 2.3); item.object.rotateZ(dt * 1.2);
        const ground = groundAt(item.object.position);
        if (item.object.position.y - motion.bottomOffset <= ground && motion.velocity.y < 0) {
          item.object.position.y = ground + motion.bottomOffset;
          shatter(item, motion.velocity);
        }
      } else if (item.animation) {
        const animation = item.animation;
        animation.time += dt;
        const progress = Math.min(1, animation.time / animation.duration);
        const wave = Math.sin(progress * Math.PI);
        const object = animation.object;
        object.position.copy(animation.position);
        object.quaternion.copy(animation.quaternion);
        if (animation.kind === 'sip') { object.position.y += wave * .45; object.rotateZ(-wave * .52); }
        else if (animation.kind === 'stamp') object.position.y += Math.sin(Math.min(1, progress * 1.8) * Math.PI) * .55;
        else if (animation.kind === 'shuffle' || animation.kind === 'sort') { object.position.y += wave * .16; object.rotateY(Math.sin(progress * Math.PI * 4) * .065 * wave); }
        else if (animation.kind === 'write' || animation.kind === 'erase') { object.position.x += Math.sin(progress * Math.PI * 8) * .13 * wave; object.position.y += wave * .09; }
        else { object.position.y += wave * .13; object.rotateZ(Math.sin(progress * Math.PI * 5) * .07 * wave); }
        if (progress === 1) stopAnimation(item);
      }
    }
    for (const fragment of fragments) {
      if (fragment.settled) continue;
      fragment.age += dt;
      fragment.velocity.y -= 9.8 * dt;
      fragment.object.position.addScaledVector(fragment.velocity, dt);
      fragment.object.rotation.x += fragment.spin.x * dt;
      fragment.object.rotation.y += fragment.spin.y * dt;
      fragment.object.rotation.z += fragment.spin.z * dt;
      const ground = groundAt(fragment.object.position) + fragment.object.scale.y * .32;
      if (fragment.object.position.y <= ground && fragment.velocity.y < 0) {
        fragment.object.position.y = ground;
        fragment.velocity.y *= -.32;
        fragment.velocity.x *= .67; fragment.velocity.z *= .67; fragment.spin.multiplyScalar(.58);
        if (Math.abs(fragment.velocity.y) < .16 || fragment.age > 7) fragment.settled = true;
      }
    }
    const outlined = selected || hovered;
    selectionOutline.visible = !!outlined && !outlined.broken && !outlined.motion;
    if (selectionOutline.visible) {
      outlined.object.updateMatrixWorld(true);
      selectionOutline.box.setFromObject(outlined.object).expandByScalar(.04);
      selectionOutline.material.opacity = selected ? .85 : .42;
    }
  }

  return {
    getItems: () => records.map(metadata),
    getSelected: () => metadata(selected),
    isEnabled: () => enabled,
    setEnabled(value) {
      if (!value) { putDown(); stopAnimation(selected); dragging = false; selected = hovered = null; selectionOutline.visible = false; }
      enabled = !!value;
    },
    hover(clientX, clientY) {
      if (!enabled) return null;
      hovered = dragging || held ? null : hit(clientX, clientY);
      return metadata(hovered);
    },
    beginDrag(clientX, clientY) {
      if (!enabled) return null;
      const item = hit(clientX, clientY);
      if (!item) { choose(null); return null; }
      choose(item);
      if (item.fixed) return metadata(item);
      if (held) putDown();
      if (raycaster.ray.intersectPlane(dragPlane, rayPoint)) {
        dragOffset.copy(item.object.position).sub(rayPoint);
        dragging = true;
      }
      return metadata(item);
    },
    drag(clientX, clientY) {
      if (!enabled || !dragging || !selected || selected.fixed || !pointRay(clientX, clientY)) return;
      if (raycaster.ray.intersectPlane(dragPlane, rayPoint)) {
        selected.object.position.x = rayPoint.x + dragOffset.x;
        selected.object.position.z = rayPoint.z + dragOffset.z;
        fitOnDesk(selected);
      }
    },
    endDrag() { if (enabled) dragging = false; },
    select(id) {
      if (!enabled) return null;
      const item = records.find(record => record.id === id && !record.broken && !record.motion);
      return item ? choose(item) : null;
    },
    rotate(deltaRadians) {
      if (!enabled || !selected || selected.fixed || !Number.isFinite(deltaRadians)) return;
      stopAnimation(selected);
      selected.object.rotateY(deltaRadians);
      if (held) selected.tableQuaternion.copy(selected.object.quaternion);
      else fitOnDesk(selected);
    },
    pickUp() {
      if (!enabled || !selected || selected.fixed) return;
      dragging = false; stopAnimation(selected);
      if (held) { putDown(); return; }
      held = selected;
      held.tablePosition = held.object.position.clone();
      held.tableQuaternion = held.object.quaternion.clone();
      held.object.updateMatrixWorld(true);
      const size = bounds.setFromObject(held.object).getSize(new THREE.Vector3());
      held.object.scale.multiplyScalar(Math.min(1, 1.35 / Math.max(size.x, size.y, size.z)));
    },
    throwSelected() {
      if (!enabled || !selected || selected.fixed) return;
      const item = selected;
      stopAnimation(item);
      item.object.scale.copy(item.home.scale);
      item.object.updateMatrixWorld(true);
      bounds.setFromObject(item.object);
      const bottomOffset = item.object.position.y - bounds.min.y;
      camera.getWorldDirection(direction);
      const velocity = direction.clone().multiplyScalar(4.8);
      velocity.y = 4.6;
      item.object.position.y = Math.max(item.object.position.y, DESK.y + bottomOffset + .15);
      item.motion = { velocity, bottomOffset };
      selected = hovered = held = null; dragging = false;
      return { message: `${item.name} voando!`, kind: 'throw' };
    },
    breakSelected() {
      if (!enabled || !selected || selected.fixed) return;
      const item = selected;
      shatter(item);
      return { message: `${item.name} em pedaços. A mesa pode ser restaurada.`, kind: 'break' };
    },
    useSelected() {
      if (!enabled || !selected) return null;
      const item = selected;
      if (item.fixed || item.action === 'clock-in') return item.onUse?.() || { action: 'feedback', message: item.message || '' };
      if (held) putDown();
      stopAnimation(item);
      const feedback = item.onUse?.() || {};
      const object = item.actionObject || item.object;
      item.animation = { object, time: 0, duration: item.action === 'sip' ? 1.25 : .85, kind: item.action, position: object.position.clone(), quaternion: object.quaternion.clone() };
      return { action: 'feedback', kind: item.action, message: feedback.message || item.message };
    },
    reset,
    deselect() { if (enabled) { putDown(); choose(null); } },
    update,
    dispose() {
      reset();
      scene.remove(selectionOutline);
      selectionOutline.geometry.dispose(); selectionOutline.material.dispose();
      for (const geometry of shardGeometries) geometry.dispose();
    },
  };
}

import * as THREE from 'three';

export const CUP_FLUID = Object.freeze({ radius: .344, bottom: .16, rim: .846, initialSurface: .755 });
const INITIAL_HEIGHT = CUP_FLUID.initialSurface - CUP_FLUID.bottom;
const HEIGHT = CUP_FLUID.rim - CUP_FLUID.bottom;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const strips = Array.from({ length: 64 }, (_, index) => {
  const x = -1 + (index + .5) * 2 / 64;
  return { x: x * CUP_FLUID.radius, weight: Math.sqrt(1 - x * x) };
});
const stripWeight = strips.reduce((sum, strip) => sum + strip.weight, 0);

/** Fraction of the original drink retained below the lowest rim at this tilt. */
export function retainedCapacity(tilt) {
  const angle = clamp(finite(tilt), 0, Math.PI);
  if (angle >= Math.PI / 2) return 0;
  const slope = Math.tan(angle);
  let retained = 0;
  for (const { x, weight } of strips) retained += clamp(HEIGHT - slope * (CUP_FLUID.radius + x), 0, HEIGHT) * weight;
  return clamp(retained / stripWeight / INITIAL_HEIGHT);
}

/** Height of a world-level surface, expressed as a plane in the cup's coordinates. */
export function liquidPlaneLevel(fill, normal) {
  const amount = clamp(finite(fill));
  const ny = clamp(finite(normal.y, 1), -1, 1);
  const radial = Math.hypot(finite(normal.x), finite(normal.z));
  const low = Math.min(ny * CUP_FLUID.bottom, ny * CUP_FLUID.rim) - radial * CUP_FLUID.radius;
  const high = Math.max(ny * CUP_FLUID.bottom, ny * CUP_FLUID.rim) + radial * CUP_FLUID.radius;
  let a = low, b = high;
  for (let iteration = 0; iteration < 23; iteration++) {
    const level = (a + b) / 2;
    let volume = 0;
    for (const { x, weight } of strips) {
      const cutoff = Math.abs(ny) < 1e-6 ? (level >= radial * x ? HEIGHT : 0) : clamp((level - radial * x) / ny - CUP_FLUID.bottom, 0, HEIGHT);
      volume += (ny < -1e-6 ? HEIGHT - cutoff : cutoff) * weight;
    }
    if (volume / stripWeight / INITIAL_HEIGHT < amount) a = level; else b = level;
  }
  return (a + b) / 2;
}

export function createFluidState() { return { fill: 1, spilled: 0, consumed: 0, spilling: false, empty: false }; }
export function resetFluid(state) { Object.assign(state, createFluidState()); return state; }
export function sipFluid(state, amount = .13) {
  const consumed = Math.min(state.fill, Math.max(0, finite(amount)));
  state.fill -= consumed; state.consumed += consumed; state.empty = state.fill <= 1e-6;
  if (state.empty) state.spilling = false;
  return consumed;
}
/** Exponential drainage is invariant to frame subdivision for a fixed orientation. */
export function stepFluid(state, dt, { tilt = 0, enabled = true, broken = false } = {}) {
  const seconds = Math.max(0, finite(dt));
  if (!enabled || !seconds) return 0;
  const before = state.fill;
  if (broken) state.fill = 0;
  else {
    const angle = clamp(finite(tilt), 0, Math.PI);
    const capacity = retainedCapacity(angle);
    const excess = Math.max(0, state.fill - capacity);
    const rate = 3.6 + 4.4 * Math.sin(Math.min(angle, Math.PI / 2));
    state.fill -= excess * -Math.expm1(-rate * seconds);
    if (state.fill < 1e-5 && capacity === 0) state.fill = 0;
  }
  const amount = Math.max(0, before - state.fill);
  state.spilled += amount;
  state.spilling = !broken && amount > 1e-7 && state.fill > 0;
  state.empty = state.fill <= 1e-6;
  return amount;
}

const DESK = { minX: -6.92, maxX: 6.92, minZ: -3.74, maxZ: 4.1, y: -.04 };
export function coffeeImpact(position, velocity) {
  function intersect(y) {
    const height = Math.max(0, finite(position.y) - y);
    const vy = finite(velocity.y);
    const time = Math.max(0, (vy + Math.sqrt(vy * vy + 19.6 * height)) / 9.8);
    return { x: finite(position.x) + finite(velocity.x) * time, y, z: finite(position.z) + finite(velocity.z) * time, time };
  }
  const desk = intersect(DESK.y);
  if (position.y >= DESK.y && desk.x >= DESK.minX && desk.x <= DESK.maxX && desk.z >= DESK.minZ && desk.z <= DESK.maxZ) return desk;
  return intersect(-1.77);
}

export function createCoffee({ scene, cup, mat }) {
  const state = createFluidState();
  const events = [];
  const coffee = cup.getObjectByName('coffee');
  // The original mesh is a placeholder; the dynamic surface is clipped to the cavity.
  coffee.clear(); coffee.position.set(0, 0, 0);
  const liquidMaterial = mat('#2c140a', { roughness: .18, metalness: .015, side: THREE.DoubleSide });
  const spillMaterial = mat('#42200f', { roughness: .24, transparent: true, opacity: .94, depthWrite: false, side: THREE.DoubleSide });
  const surfaceGeometry = new THREE.BufferGeometry();
  const surfacePositions = new Float32Array(900 * 3);
  surfaceGeometry.setAttribute('position', new THREE.BufferAttribute(surfacePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const surface = new THREE.Mesh(surfaceGeometry, liquidMaterial); surface.name = 'coffee-surface'; surface.frustumCulled = false;
  surface.receiveShadow = true; coffee.add(surface);
  const effects = new THREE.Group(); effects.name = 'coffee-spills'; scene.add(effects);
  const streamGeometry = new THREE.CylinderGeometry(1, 1, 1, 9, 1, true);
  const streamSegments = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(streamGeometry, liquidMaterial); mesh.visible = false; effects.add(mesh); return mesh;
  });
  const dropGeometry = new THREE.SphereGeometry(1, 9, 7);
  const drops = Array.from({ length: 64 }, () => {
    const mesh = new THREE.Mesh(dropGeometry, liquidMaterial); mesh.visible = false; effects.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), life: 0 };
  });
  const puddles = [], pendingImpacts = [];
  let dropCursor = 0, dropBudget = 0, phase = 0, initialized = false;
  let pouring = false, stoppedFor = 1, broke = false, emptyNotified = false;
  const worldPosition = new THREE.Vector3(), previousPosition = new THREE.Vector3(), velocity = new THREE.Vector3(), previousVelocity = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion(), inverseQuaternion = new THREE.Quaternion();
  const normal = new THREE.Vector3(), gravityNormal = new THREE.Vector3(), outward = new THREE.Vector3(), spout = new THREE.Vector3(), streamVelocity = new THREE.Vector3();
  const slosh = new THREE.Vector2(), sloshVelocity = new THREE.Vector2();
  const up = new THREE.Vector3(0, 1, 0), pointA = new THREE.Vector3(), pointB = new THREE.Vector3(), direction = new THREE.Vector3();
  const surfaceRings = [[.161, .251], [.205, .286], [.414, .316], [.777, .344], [.845, .346]].map(([y, radius]) =>
    Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2) * radius, y, Math.sin(i / 64 * Math.PI * 2) * radius)));

  function drawSurface() {
    cup.updateWorldMatrix(true, false);
    cup.getWorldQuaternion(worldQuaternion); inverseQuaternion.copy(worldQuaternion).invert();
    normal.set(slosh.x, 1, slosh.y).normalize().applyQuaternion(inverseQuaternion);
    const level = liquidPlaneLevel(state.fill, normal);
    const points = [];
    function cross(a, b) {
      const da = normal.dot(a) - level, db = normal.dot(b) - level;
      if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) points.push(a.clone().lerp(b, da / (da - db)));
    }
    for (let ring = 0; ring < surfaceRings.length; ring++) {
      for (let i = 0; i < 64; i++) {
        cross(surfaceRings[ring][i], surfaceRings[ring][(i + 1) % 64]);
        if (ring + 1 < surfaceRings.length) cross(surfaceRings[ring][i], surfaceRings[ring + 1][i]);
      }
    }
    surface.visible = state.fill > 1e-5 && points.length >= 3 && !broke;
    if (!surface.visible) return;
    const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
    const tangent = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < .8 ? up : new THREE.Vector3(1, 0, 0)).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
    points.sort((a, b) => Math.atan2(a.clone().sub(center).dot(bitangent), a.clone().sub(center).dot(tangent)) - Math.atan2(b.clone().sub(center).dot(bitangent), b.clone().sub(center).dot(tangent)));
    let index = 0;
    for (let i = 0; i < points.length; i++) for (const point of [center, points[i], points[(i + 1) % points.length]]) {
      surfacePositions[index++] = point.x; surfacePositions[index++] = point.y; surfacePositions[index++] = point.z;
    }
    surfaceGeometry.setDrawRange(0, index / 3);
    surfaceGeometry.attributes.position.needsUpdate = true;
    surfaceGeometry.computeVertexNormals();
  }

  function newPuddle(impact) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 9), 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geometry, spillMaterial); mesh.frustumCulled = false; mesh.renderOrder = 2;
    mesh.name = 'coffee-puddle'; effects.add(mesh);
    const flecks = Array.from({ length: 7 }, (_, i) => {
      const drop = new THREE.Mesh(new THREE.CircleGeometry(1, 12), spillMaterial);
      drop.rotation.x = -Math.PI / 2; drop.renderOrder = 2; effects.add(drop); return drop;
    });
    const result = { x: impact.x, z: impact.z, y: impact.y, amount: 0, radius: .025, mesh, flecks, seed: puddles.length + 1 };
    puddles.push(result); return result;
  }
  function addPuddle(impact, amount) {
    if (amount <= 0) return;
    let puddle = puddles.find(item => item.y === impact.y && Math.hypot(item.x - impact.x, item.z - impact.z) < .34);
    if (!puddle && puddles.length < 28) puddle = newPuddle(impact);
    if (!puddle) puddle = puddles.filter(item => item.y === impact.y).sort((a, b) => Math.hypot(a.x - impact.x, a.z - impact.z) - Math.hypot(b.x - impact.x, b.z - impact.z))[0] || puddles[0];
    puddle.amount += amount;
    puddle.radius = .027 + Math.sqrt(puddle.amount) * .94;
    const y = puddle.y + .007, positions = puddle.mesh.geometry.attributes.position;
    function edge(i) {
      const theta = i / 48 * Math.PI * 2;
      const radius = puddle.radius * (1 + .07 * Math.sin(theta * 5 + puddle.seed) + .035 * Math.cos(theta * 9));
      let x = puddle.x + Math.cos(theta) * radius, z = puddle.z + Math.sin(theta) * radius;
      if (puddle.y === DESK.y) { x = clamp(x, DESK.minX + .008, DESK.maxX - .008); z = clamp(z, DESK.minZ + .008, DESK.maxZ - .008); }
      return [x, y, z];
    }
    for (let i = 0; i < 48; i++) {
      const a = edge(i), b = edge(i + 1), offset = i * 9;
      positions.array.set([puddle.x, y, puddle.z, ...a, ...b], offset);
    }
    positions.needsUpdate = true; puddle.mesh.geometry.computeVertexNormals();
    puddle.flecks.forEach((fleck, i) => {
      const angle = i * 2.4 + puddle.seed;
      const distance = puddle.radius * (1.15 + (i % 3) * .13);
      const x = puddle.x + Math.cos(angle) * distance, z = puddle.z + Math.sin(angle) * distance;
      fleck.visible = puddle.amount > .012 && (puddle.y !== DESK.y || (x > DESK.minX && x < DESK.maxX && z > DESK.minZ && z < DESK.maxZ));
      fleck.position.set(x, y + .001, z); fleck.scale.setScalar(Math.min(.057, puddle.radius * (.06 + i % 3 * .02)));
    });
  }
  function spawnDrop(position, initialVelocity, amount = .018) {
    const drop = drops[dropCursor++ % drops.length];
    drop.mesh.visible = true; drop.mesh.position.copy(position); drop.velocity.copy(initialVelocity); drop.life = 2.5;
    drop.mesh.scale.set(amount, amount * 1.35, amount);
  }
  function trackSpout() {
    gravityNormal.copy(up).applyQuaternion(inverseQuaternion);
    const radial = Math.hypot(gravityNormal.x, gravityNormal.z);
    outward.set(radial > 1e-4 ? -gravityNormal.x / radial : 0, 0, radial > 1e-4 ? -gravityNormal.z / radial : 1);
    spout.copy(outward).multiplyScalar(.371); spout.y = .852; cup.localToWorld(spout);
    outward.applyQuaternion(worldQuaternion);
    streamVelocity.copy(velocity).clampLength(0, 3).multiplyScalar(.23).addScaledVector(outward, .42);
    streamVelocity.y = Math.min(.2, streamVelocity.y) - .12;
  }
  function pathAt(time, result) { return result.copy(spout).addScaledVector(streamVelocity, time).addScaledVector(up, -4.9 * time * time); }
  function drawStream(amount, dt) {
    const impact = coffeeImpact(spout, streamVelocity);
    const radius = clamp(Math.sqrt(amount / Math.max(dt, .001)) * .038, .009, .034);
    for (let i = 0; i < streamSegments.length; i++) {
      const segment = streamSegments[i];
      pathAt(impact.time * i / streamSegments.length, pointA); pathAt(impact.time * (i + 1) / streamSegments.length, pointB);
      direction.copy(pointB).sub(pointA);
      segment.visible = direction.lengthSq() > 1e-8;
      segment.position.copy(pointA).add(pointB).multiplyScalar(.5);
      segment.scale.set(radius * (1 - i * .025), direction.length() + .005, radius * (1 - i * .025));
      segment.quaternion.setFromUnitVectors(up, direction.normalize());
    }
    pendingImpacts.push({ ...impact, delay: impact.time, amount });
    dropBudget += amount * 160;
    while (dropBudget >= 1) {
      dropBudget--;
      pointA.copy(streamVelocity); pointA.x += Math.sin(phase * 31) * .09; pointA.z += Math.cos(phase * 29) * .09;
      spawnDrop(spout, pointA, radius * .8); phase += .11;
    }
  }
  function splash(amount) {
    cup.localToWorld(pointA.set(0, .36, 0));
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.4;
      pointB.set(Math.sin(angle) * (1 + i % 3 * .3), .8 + i % 4 * .24, Math.cos(angle) * (1 + i % 3 * .3));
      spawnDrop(pointA, pointB, .025 + i % 3 * .007);
      const impact = coffeeImpact(pointA, pointB); pendingImpacts.push({ ...impact, delay: impact.time, amount: amount / 16 });
    }
  }
  function update(dt, { enabled = false, broken = false } = {}) {
    if (!enabled) return;
    const elapsedSeconds = Math.max(0, finite(dt));
    const seconds = Math.min(elapsedSeconds, .25);
    if (!seconds) return;
    phase += seconds;
    cup.updateWorldMatrix(true, false); cup.getWorldPosition(worldPosition);
    if (!initialized) { previousPosition.copy(worldPosition); initialized = true; }
    velocity.copy(worldPosition).sub(previousPosition).multiplyScalar(1 / seconds).clampLength(0, 10);
    const ax = clamp((velocity.x - previousVelocity.x) / seconds, -9, 9), az = clamp((velocity.z - previousVelocity.z) / seconds, -9, 9);
    const steps = Math.max(1, Math.ceil(seconds / .016));
    for (let i = 0; i < steps; i++) {
      const h = seconds / steps;
      sloshVelocity.x += (-slosh.x * 34 - sloshVelocity.x * 8 - ax * .6) * h;
      sloshVelocity.y += (-slosh.y * 34 - sloshVelocity.y * 8 - az * .6) * h;
      slosh.addScaledVector(sloshVelocity, h); slosh.clampScalar(-.16, .16);
    }
    previousVelocity.copy(velocity); previousPosition.copy(worldPosition);
    cup.getWorldQuaternion(worldQuaternion); inverseQuaternion.copy(worldQuaternion).invert();
    gravityNormal.copy(up).applyQuaternion(inverseQuaternion);
    const amount = stepFluid(state, elapsedSeconds, { tilt: Math.acos(clamp(gravityNormal.y, -1, 1)), broken });
    const flowing = state.spilling && amount / seconds > .00015;
    if (flowing && !pouring && stoppedFor >= .3) { events.push({ type: 'pour' }); pouring = true; }
    if (flowing) stoppedFor = 0; else { stoppedFor += seconds; if (stoppedFor >= .3) pouring = false; }
    if (state.empty && !emptyNotified && !broken) { events.push({ type: 'empty' }); emptyNotified = true; }
    streamSegments.forEach(segment => { segment.visible = false; });
    if (broken && !broke && amount > 0) splash(amount);
    broke = broken;
    if (flowing && !broken) { trackSpout(); drawStream(amount, seconds); }
    else if (amount > 0 && !broken) { trackSpout(); const impact = coffeeImpact(spout, streamVelocity); pendingImpacts.push({ ...impact, delay: impact.time, amount }); }
    for (let i = pendingImpacts.length - 1; i >= 0; i--) {
      pendingImpacts[i].delay -= seconds;
      if (pendingImpacts[i].delay <= 0) { addPuddle(pendingImpacts[i], pendingImpacts[i].amount); pendingImpacts.splice(i, 1); }
    }
    for (const drop of drops) {
      if (!drop.mesh.visible) continue;
      drop.life -= seconds; drop.velocity.y -= 9.8 * seconds;
      drop.mesh.position.addScaledVector(drop.velocity, seconds);
      const p = drop.mesh.position;
      const ground = p.x >= DESK.minX && p.x <= DESK.maxX && p.z >= DESK.minZ && p.z <= DESK.maxZ ? DESK.y : -1.77;
      if (drop.life <= 0 || p.y < ground) drop.mesh.visible = false;
    }
    drawSurface();
  }
  function reset() {
    resetFluid(state); events.length = pendingImpacts.length = 0;
    for (const puddle of puddles) {
      effects.remove(puddle.mesh); puddle.mesh.geometry.dispose();
      for (const fleck of puddle.flecks) { effects.remove(fleck); fleck.geometry.dispose(); }
    }
    puddles.length = 0; drops.forEach(drop => { drop.mesh.visible = false; }); streamSegments.forEach(segment => { segment.visible = false; });
    initialized = pouring = broke = emptyNotified = false; stoppedFor = 1; dropBudget = 0;
    slosh.set(0, 0); sloshVelocity.set(0, 0); velocity.set(0, 0, 0); previousVelocity.set(0, 0, 0);
    drawSurface();
  }
  function sip() {
    const amount = sipFluid(state);
    drawSurface();
    if (!amount) return { message: 'A caneca está vazia. Arrume a mesa para preparar outro café.' };
    if (state.empty && !emptyNotified) { events.push({ type: 'empty' }); emptyNotified = true; }
    return { message: 'Um gole de café. Agora sim!' };
  }
  function dispose() {
    reset(); scene.remove(effects); coffee.remove(surface);
    surfaceGeometry.dispose(); streamGeometry.dispose(); dropGeometry.dispose();
  }
  drawSurface();
  return { state, update, sip, reset, dispose, getState: () => ({ ...state }), consumeEvents: () => events.splice(0) };
}

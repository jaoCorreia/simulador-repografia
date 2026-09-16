import * as THREE from 'three';

export const ROOM = { minX: -8.35, maxX: 8.35, minZ: -5.7, maxZ: 6.4, maxY: 6.8 };

/** Critically damped point spring, integrated in short steps by the caller. */
export function pullToward(position, target, velocity, mass, dt) {
  const stiffness = 115 / Math.pow(Math.max(.2, mass), .25);
  const damping = 2 * Math.sqrt(stiffness) * .93;
  velocity.addScaledVector(target.clone().sub(position), stiffness * dt);
  velocity.multiplyScalar(Math.exp(-damping * dt));
  velocity.clampLength(0, 11);
  return position.addScaledVector(velocity, dt);
}

/** Return a shallowest-axis separation normal and penetration for two AABBs. */
export function contactBetween(a, b) {
  if (!a.intersectsBox(b)) return null;
  const centerA = a.getCenter(new THREE.Vector3());
  const centerB = b.getCenter(new THREE.Vector3());
  let axis = 'x';
  let depth = Infinity;
  for (const candidate of ['x', 'y', 'z']) {
    const overlap = Math.min(a.max[candidate] - b.min[candidate], b.max[candidate] - a.min[candidate]);
    if (overlap <= .001) return null;
    if (overlap < depth) { depth = overlap; axis = candidate; }
  }
  const normal = new THREE.Vector3();
  normal[axis] = centerA[axis] >= centerB[axis] ? 1 : -1;
  return { normal, depth };
}

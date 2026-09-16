import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const point = (x, y, z) => new THREE.Vector3(x, y, z);

/** A continuous oval skin surface, avoiding separate floating capsule joints. */
function skinTube(curve, radii, segments = 24, sides = 16, fade = () => 1) {
  const positions = [];
  const colors = [];
  const indices = [];
  const right = new THREE.Vector3();
  const vertical = new THREE.Vector3();
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    right.crossVectors(tangent, UP).normalize();
    vertical.crossVectors(right, tangent).normalize();
    const [width, height] = radii(t);
    for (let j = 0; j <= sides; j += 1) {
      const angle = j / sides * Math.PI * 2;
      const vertex = center.clone()
        .addScaledVector(right, Math.cos(angle) * width)
        .addScaledVector(vertical, Math.sin(angle) * height);
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(1, 1, 1, fade(t));
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  for (const end of [0, 1]) {
    const center = curve.getPoint(end);
    const index = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    colors.push(1, 1, 1, fade(end));
    const offset = end * segments * (sides + 1);
    for (let j = 0; j < sides; j += 1) {
      if (end === 0) indices.push(index, offset + j, offset + j + 1);
      else indices.push(index, offset + j + 1, offset + j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Three supports RGBA vertex colors; the fourth component softly erases the forearm ends.
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function profile(t, stops) {
  const segment = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  const blend = t * (stops.length - 1) - segment;
  return [lerp(stops[segment][0], stops[segment + 1][0], blend), lerp(stops[segment][1], stops[segment + 1][1], blend)];
}

/** Hands live in the stapler's local space, including when parent is a copied rig. */
export function createHands({ parent, mat }) {
  const rig = new THREE.Group();
  rig.name = 'translucent-pressing-hands';
  rig.visible = false;
  parent.add(rig);
  const geometries = new Set();
  const skins = [];
  let visibility = 0;
  let pressWindow = 0;

  const material = (color, opacity, extra = {}) => {
    const result = mat(color, {
      transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      roughness: 0.64, metalness: 0, vertexColors: true,
      emissive: '#a6bbab', emissiveIntensity: 0.07, ...extra,
    });
    skins.push({ material: result, opacity });
    return result;
  };
  const skin = material('#e5eadb', 0.48);
  const nails = material('#f5f2df', 0.24, { vertexColors: false, roughness: 0.4 });

  function addMesh(geometry, meshMaterial, target = rig) {
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    target.add(mesh);
    geometries.add(geometry);
    return mesh;
  }

  function makeHand(mirror = false) {
    const hand = new THREE.Group();
    if (mirror) hand.scale.x = -1;
    rig.add(hand);
    const palmCurve = new THREE.LineCurve3(point(0, 0, 0.33), point(0, 0, -0.3));
    const palmProfile = [[0.16, 0.064], [0.205, 0.072], [0.275, 0.088], [0.305, 0.083], [0.29, 0.073], [0.235, 0.059]];
    addMesh(skinTube(palmCurve, (t) => profile(t, palmProfile), 30, 24), skin, hand);

    const fingerRoots = [-0.215, -0.07, 0.085, 0.225];
    const lengths = [0.51, 0.59, 0.55, 0.425];
    const widths = [0.066, 0.071, 0.068, 0.056];
    const curls = [];
    fingerRoots.forEach((x, index) => {
      const length = lengths[index];
      const width = widths[index];
      const finger = new THREE.Group();
      finger.position.set(x, 0, -0.235);
      finger.rotation.y = (index - 1.5) * -0.035;
      hand.add(finger);
      curls.push(finger);
      const curve = new THREE.CatmullRomCurve3([
        point(0, 0, 0.045), point(0, 0.012, -length * 0.28),
        point(0, -0.017, -length * 0.64), point(0, -0.067, -length),
      ]);
      addMesh(skinTube(curve, (t) => {
        const knuckle = 1 + 0.07 * Math.exp(-(((t - 0.34) / 0.09) ** 2))
          + 0.04 * Math.exp(-(((t - 0.68) / 0.07) ** 2));
        const roundedTip = t > 0.88 ? Math.sqrt(Math.max(0.022, 1 - ((t - 0.88) / 0.12) ** 2)) : 1;
        const radius = width * lerp(1, 0.72, t) * knuckle * roundedTip;
        return [radius, radius * 0.86];
      }, 30, 14), skin, finger);
      const nail = addMesh(new RoundedBoxGeometry(width * 1.02, 0.009, length * 0.19, 3, 0.004), nails, finger);
      nail.position.set(0, -0.019, -length * 0.85);
      nail.rotation.x = -0.2;
    });

    // The thenar curve grows from the side of the palm and bends around the handle.
    const thumbCurve = new THREE.CatmullRomCurve3([
      point(-0.19, -0.004, 0.13), point(-0.315, -0.018, 0.015),
      point(-0.4, -0.059, -0.14), point(-0.385, -0.095, -0.345),
    ]);
    addMesh(skinTube(thumbCurve, (t) => {
      const tip = t > 0.86 ? Math.sqrt(Math.max(0.022, 1 - ((t - 0.86) / 0.14) ** 2)) : 1;
      return [lerp(0.105, 0.063, t) * tip, lerp(0.083, 0.052, t) * tip];
    }, 28, 16), skin, hand);
    const thumbNail = addMesh(new RoundedBoxGeometry(0.075, 0.008, 0.105, 3, 0.0035), nails, hand);
    thumbNail.position.set(-0.393, -0.045, -0.267);
    thumbNail.rotation.x = -0.14;
    return { group: hand, curls };
  }

  const right = makeHand();
  const left = makeHand(true);
  left.group.scale.multiplyScalar(0.96);
  left.group.rotation.y = -0.2;

  function armCurve(wrist, elbow, tangent) {
    return new THREE.CubicBezierCurve3(
      wrist, wrist.clone().addScaledVector(tangent, 0.7),
      elbow.clone().lerp(wrist, 0.33).add(point(0, 0.04, 0)), elbow,
    );
  }
  function forearmGeometry(wrist, elbow, tangent) {
    return skinTube(armCurve(wrist, elbow, tangent), (t) => [lerp(0.16, 0.255, t), lerp(0.064, 0.15, Math.sqrt(t))], 26, 20,
      (t) => 1 - THREE.MathUtils.smoothstep(t, 0.45, 1));
  }
  const rightArm = addMesh(forearmGeometry(point(0, 0, 0), point(1, 0, 3), point(0, 0, 1)), skin);
  const leftArm = addMesh(forearmGeometry(point(0, 0, 0), point(-1, 0, 3), point(0, 0, 1)), skin);
  const wristPoint = point(0, 0, 0.32);
  const wrist = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const elbowRight = point(1.35, 0.6, 4.6);
  const elbowLeft = point(-3, 0.05, 4.8);

  function updateArm(mesh, hand, elbow) {
    hand.updateMatrix();
    wrist.copy(wristPoint).applyMatrix4(hand.matrix);
    tangent.set(0, 0, 1).transformDirection(hand.matrix);
    const geometry = forearmGeometry(wrist, elbow, tangent);
    // Reuse GPU buffers; every pose has the same topology.
    mesh.geometry.attributes.position.copy(geometry.attributes.position);
    mesh.geometry.attributes.normal.copy(geometry.attributes.normal);
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    geometry.dispose();
  }

  function update(dt, visual = {}) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const pulse = clamp(visual.pressPulse || 0, 0, 1);
    const allowedPhase = visual.phase === 'press' || visual.phase === 'timing';
    pressWindow = allowedPhase && pulse > 0.025 ? .28 : Math.max(0, pressWindow - dt);
    const pressing = allowedPhase && pressWindow > 0;
    if (!allowedPhase) { visibility = 0; pressWindow = 0; }
    const speed = pressing ? 24 : 13;
    visibility = lerp(visibility, pressing ? 1 : 0, 1 - Math.exp(-dt * speed));
    if (!pressing && visibility < 0.005) visibility = 0;
    rig.visible = visibility > 0;
    for (const entry of skins) entry.material.opacity = entry.opacity * visibility;
    if (!rig.visible) return;

    const angle = Number.isFinite(visual.angle) ? visual.angle : -0.25;
    const bundleHeight = visual.bundleHeight || 0.1;
    right.group.position.set(0.04, 0.43 + 0.28 * Math.cos(angle) - 2.05 * Math.sin(angle) + 0.13 - pulse * 0.009, 1.1);
    right.group.rotation.set(angle, 0.04, pulse * -0.012);
    const leftContactHeight = Math.max(0.35 + bundleHeight * 0.4, 0.3 + bundleHeight);
    left.group.position.set(-1.77 + (visual.alignment || 0) * 0.035, leftContactHeight - pulse * 0.006, 2.0);
    left.group.rotation.x = -0.055 - pulse * 0.014;
    right.curls.forEach((finger, index) => { finger.rotation.x = -pulse * (0.025 + index * 0.005); });
    left.curls.forEach((finger) => { finger.rotation.x = -pulse * 0.012; });
    updateArm(rightArm, right.group, elbowRight);
    updateArm(leftArm, left.group, elbowLeft);
  }

  function dispose() {
    rig.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    // Materials were registered by mat() and remain owned by the surrounding world.
  }

  return { update, dispose };
}

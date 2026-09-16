import * as THREE from 'three';

/** A hollow ceramic mug and saucer. All materials/textures use the world's registry. */
export function createMug({ mat, canvasTexture }) {
  const mug = new THREE.Group();
  mug.name = 'mug';
  mug.userData = { kind: 'mug', movable: true, breakable: true };
  const cup = new THREE.Group();
  cup.name = 'cup';
  mug.add(cup);
  const terracotta = mat('#b96545', { roughness: .29, metalness: 0 });
  const cream = mat('#f1dfbf', { roughness: .25, metalness: 0 });

  function add(geometry, material, name, parent = cup) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function curvePoints(points, end, control, segments = 6) {
    const start = points[points.length - 1];
    const next = control
      ? new THREE.QuadraticBezierCurve(start, new THREE.Vector2(...control), new THREE.Vector2(...end)).getPoints(segments)
      : [start, new THREE.Vector2(...end)];
    points.push(...next.slice(1));
  }

  // A closed ceramic cross-section: outside bottom -> rim -> inside floor.
  // The rounded lip and inner wall are part of the same mesh, not a floating ring.
  const profile = [new THREE.Vector2(0, .079), new THREE.Vector2(.251, .079)];
  curvePoints(profile, [.292, .098], [.283, .078]);
  curvePoints(profile, [.320, .161], [.316, .111]);
  curvePoints(profile, [.355, .426], [.334, .275], 12);
  curvePoints(profile, [.385, .774], [.378, .627], 14);
  curvePoints(profile, [.390, .835], [.391, .816]);
  const creamStart = profile.length - 1;
  const exteriorProfile = profile.map(point => point.clone());
  curvePoints(profile, [.374, .870], [.395, .866], 8);
  curvePoints(profile, [.351, .845], [.350, .876], 8);
  curvePoints(profile, [.349, .777], [.349, .821], 6);
  curvePoints(profile, [.321, .414], [.344, .620], 14);
  curvePoints(profile, [.291, .205], [.311, .267], 10);
  curvePoints(profile, [.255, .160], [.284, .163], 8);
  curvePoints(profile, [0, .160], [.213, .156], 8);
  const bodyGeometry = new THREE.LatheGeometry(profile, 80);
  bodyGeometry.clearGroups();
  const segmentIndices = (profile.length - 1) * 6;
  for (let slice = 0; slice < 80; slice++) {
    bodyGeometry.addGroup(slice * segmentIndices, creamStart * 6, 0);
    bodyGeometry.addGroup(slice * segmentIndices + creamStart * 6, segmentIndices - creamStart * 6, 1);
  }
  add(bodyGeometry, [terracotta, cream], 'cup-body');

  // Dynamic liquid is supplied by createCoffee; this anchor stays in cup coordinates.
  const coffee = new THREE.Group();
  coffee.name = 'coffee';
  coffee.userData = { kind: 'liquid', fullHeight: .755, emptyHeight: .175 };
  cup.add(coffee);

  // An open C, ending inside the OUTER ceramic skin at two attachment pads.
  // Its endpoints never cross the inner wall or create a ring through the drink.
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.405, .710, 0),
    new THREE.Vector3(.491, .719, 0),
    new THREE.Vector3(.626, .638, 0),
    new THREE.Vector3(.656, .487, 0),
    new THREE.Vector3(.608, .336, 0),
    new THREE.Vector3(.467, .271, 0),
    new THREE.Vector3(.369, .307, 0),
  ], false, 'centripetal');
  add(new THREE.TubeGeometry(handleCurve, 64, .056, 16, false), terracotta, 'cup-handle');
  const upperJoin = add(new THREE.SphereGeometry(.077, 32, 20), terracotta, 'handle-upper-join');
  upperJoin.position.set(.411, .706, 0); upperJoin.scale.set(.66, .89, .84);
  const lowerJoin = add(new THREE.SphereGeometry(.075, 32, 20), terracotta, 'handle-lower-join');
  lowerJoin.position.set(.368, .312, 0); lowerJoin.scale.set(.67, .85, .82);

  // Quiet cream typography printed directly around the curved ceramic surface.
  const labelTexture = canvasTexture(768, 256, ctx => {
    ctx.clearRect(0, 0, 768, 256);
    ctx.fillStyle = '#f5e7ca';
    ctx.font = '600 150px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAFÉ', 384, 135);
  });
  const labelMaterial = mat('#ffffff', {
    map: labelTexture, transparent: true, alphaTest: .025, depthWrite: false,
    roughness: .38, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  function outerRadius(y) {
    for (let i = 1; i < exteriorProfile.length; i++) {
      const a = exteriorProfile[i - 1], b = exteriorProfile[i];
      if (a.y <= y && b.y >= y && b.y > a.y) return THREE.MathUtils.lerp(a.x, b.x, (y - a.y) / (b.y - a.y));
    }
    return .355;
  }
  const columns = 40, rows = 8, vertices = [], normals = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, y = .370 + v * .182;
    const radius = outerRadius(y) + .0012;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, angle = .10 + (u - .5) * 1.42;
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      normals.push(Math.sin(angle), 0, Math.cos(angle));
      uvs.push(u, v);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const decalGeometry = new THREE.BufferGeometry();
  decalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  decalGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  decalGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  decalGeometry.setIndex(indices);
  const label = add(decalGeometry, labelMaterial, 'cup-lettering');
  label.castShadow = false;
  label.renderOrder = 1;

  // A shallow recessed saucer, modelled as one solid profile with a rolled edge.
  const saucerProfile = [new THREE.Vector2(0, 0), new THREE.Vector2(.405, 0)];
  curvePoints(saucerProfile, [.544, .034], [.501, 0], 8);
  curvePoints(saucerProfile, [.616, .069], [.590, .051], 8);
  curvePoints(saucerProfile, [.599, .102], [.638, .100], 8);
  curvePoints(saucerProfile, [.509, .089], [.558, .105], 8);
  curvePoints(saucerProfile, [.384, .067], [.434, .066], 10);
  curvePoints(saucerProfile, [.307, .077], [.337, .077], 8);
  curvePoints(saucerProfile, [0, .077], [.223, .077], 8);
  const saucer = add(new THREE.LatheGeometry(saucerProfile, 80), cream, 'saucer', mug);
  saucer.userData.kind = 'saucer';
  return mug;
}

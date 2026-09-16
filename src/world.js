import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createLobby } from './lobby.js';
import { createMug } from './mug.js';
import { createCoffee } from './coffee.js';
import { createHands } from './hands.js';
import { createTimeClock } from './time-clock.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export function createWorld(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d8d6ba');
  scene.fog = new THREE.Fog('#dad7bd', 16, 36);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 65);
  const cameraHome = new THREE.Vector3(5.15, 5.65, 9.2);
  const cameraTarget = new THREE.Vector3(.35, .48, -.05);
  camera.position.copy(cameraHome);
  camera.lookAt(cameraTarget);

  const materials = [];
  const textures = [];
  const mat = (color, options = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .78, ...options });
    materials.push(material);
    return material;
  };
  const M = {
    wall: mat('#e7e1c9'), sage: mat('#879b80'), trim: mat('#d7d4b9'),
    desk: mat('#c79159'), darkWood: mat('#63432f'), paper: mat('#fffaf0'), paperEdge: mat('#e3dccb'),
    green: mat('#126658', { roughness: .28, metalness: .12 }), greenLight: mat('#257666', { roughness: .31 }),
    greenDark: mat('#0a3a35', { roughness: .48 }), rubber: mat('#252d29', { roughness: .95 }),
    steel: mat('#c1c6be', { metalness: .8, roughness: .3 }), gold: mat('#d5aa57', { metalness: .65, roughness: .34 }),
    cream: mat('#ede5d0'), black: mat('#293430'),
    terracotta: mat('#bc6445'), blue: mat('#657f89'), yellow: mat('#e6c668'),
  };

  function mesh(geometry, material, parent = scene, x = 0, y = 0, z = 0, shadows = true) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = shadows;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(w, h, d, material, x = 0, y = 0, z = 0, parent = scene, radius = 0) {
    return mesh(radius ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  function cylinder(rt, rb, h, material, x = 0, y = 0, z = 0, parent = scene, seg = 32) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, parent, x, y, z);
  }
  function sphere(r, material, x = 0, y = 0, z = 0, parent = scene) {
    return mesh(new THREE.SphereGeometry(r, 20, 12), material, parent, x, y, z);
  }
  function rod(a, b, radius, material, parent = scene, radiusEnd = radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const vector = end.clone().sub(start);
    const result = cylinder(radiusEnd, radius, vector.length(), material, 0, 0, 0, parent, 20);
    result.position.copy(start.add(end).multiplyScalar(.5));
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    return result;
  }
  function canvasTexture(w, h, draw) {
    const element = document.createElement('canvas');
    element.width = w; element.height = h;
    const ctx = element.getContext('2d');
    draw(ctx, w, h);
    const texture = new THREE.CanvasTexture(element);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    textures.push(texture);
    return texture;
  }
  function textBoard(text, subtitle, w, h, background, ink, x, y, z, parent = scene) {
    const texture = canvasTexture(1024, Math.round(1024 * h / w), (ctx, width, height) => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = ink; ctx.textAlign = 'center';
      const fitFont = (label, weight, size) => {
        ctx.font = `${weight} ${size}px sans-serif`;
        const fitted = Math.min(size, size * (width * .87) / Math.max(1, ctx.measureText(label).width));
        ctx.font = `${weight} ${Math.floor(fitted)}px sans-serif`;
      };
      fitFont(text, 700, Math.floor(height * (subtitle ? .3 : .42)));
      ctx.fillText(text, width / 2, height * (subtitle ? .48 : .65));
      if (subtitle) {
        fitFont(subtitle, 500, Math.floor(height * .12));
        ctx.fillText(subtitle, width / 2, height * .76);
      }
    });
    return mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', { map: texture, roughness: .9 }), parent, x, y, z, false);
  }

  // An old, sunlit copy shop. Every surface is built locally.
  const hemisphere = new THREE.HemisphereLight('#fff4d7', '#637463', 2.45);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffe4ac', 4.0);
  sun.position.set(-6, 10, 4); sun.target.position.set(1, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 10, bottom: -9, near: .1, far: 30 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#f4f2dc', .6); fill.position.set(5, 5, -3); scene.add(fill);

  box(20, 10, .25, M.wall, 0, 4, -6.4);
  box(20, 2.35, .29, M.sage, 0, .4, -6.2);
  box(20, .07, .35, M.trim, 0, 1.62, -6.12);
  box(.25, 11, 22, M.wall, -8, 4, -1);
  box(20, .2, 24, mat('#bfb69c'), 0, -1.9, 0);
  const tiles = new THREE.GridHelper(20, 16, '#a89d86', '#b0a78e'); tiles.position.y = -1.79; scene.add(tiles);

  // Left-hand window with deep reveals and Venetian blinds.
  const windowGroup = new THREE.Group(); windowGroup.position.set(-5.65, 3.2, -6.04); scene.add(windowGroup);
  box(4.2, 4.8, .12, M.trim, 0, 0, -.06, windowGroup, .025);
  const sky = mat('#c5d7d0', { emissive: '#b2cbbf', emissiveIntensity: .5, roughness: 1 });
  box(3.88, 4.43, .08, sky, 0, 0, .04, windowGroup);
  box(.1, 4.6, .22, M.cream, 0, 0, .12, windowGroup);
  box(4.35, .18, .58, M.cream, 0, -2.28, .15, windowGroup, .035);
  for (let i = 0; i < 13; i++) {
    const slat = box(3.91, .09, .26, M.cream, 0, 2.06 - i * .255, .24, windowGroup, .02);
    slat.rotation.x = -.3;
  }
  rod([-1.25, -1.25, .35], [-1.25, 2.1, .35], .012, M.cream, windowGroup);
  rod([1.25, -1.25, .35], [1.25, 2.1, .35], .012, M.cream, windowGroup);
  rod([2.02, -.4, .31], [2.02, 2.1, .31], .018, M.darkWood, windowGroup);

  textBoard('REPOGRAFIA', 'CÓPIAS  ·  IMPRESSÕES  ·  ENCADERNAÇÕES', 4.35, 1.2, '#e9e0bf', '#3e6658', -.3, 4.03, -6.02);
  box(4.53, 1.38, .12, M.darkWood, -.3, 4.03, -6.14, scene, .025);
  // A wall clock and a faded notice.
  const clockFace = cylinder(.52, .52, .085, M.cream, 4.15, 3.96, -6.04);
  clockFace.rotation.x = Math.PI / 2;
  const clockRing = mesh(new THREE.TorusGeometry(.53, .038, 10, 48), M.greenDark, scene, 4.15, 3.96, -5.985);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU;
    const tick = box(.025, .065, .01, M.greenDark, 4.15 + Math.sin(angle) * .42, 3.96 + Math.cos(angle) * .42, -5.985);
    tick.rotation.z = -angle;
  }
  const clockHand1 = box(.029, .32, .015, M.greenDark, 4.15 - .09, 3.96 + .1, -5.97); clockHand1.rotation.z = .78;
  const clockHand2 = box(.021, .4, .016, M.greenDark, 4.15 + .15, 3.96 + .065, -5.95); clockHand2.rotation.z = -1.16;
  sphere(.035, M.gold, 4.15, 3.96, -5.92);
  textBoard('HOJE TEM CAFÉ', 'e trabalho até acabar o papel.', 1.45, .78, '#ded0a3', '#4b5943', 2.45, 2.48, -6.02);

  const timeClock = createTimeClock({ mat, canvasTexture });
  timeClock.object.position.set(-.8, 2.2, -5.94);
  scene.add(timeClock.object);

  // Furniture in the shop behind the workbench.
  box(10.7, .14, 1.72, M.darkWood, 1.1, -.18, -4.78, scene, .045);
  box(10.4, 1.38, 1.4, M.sage, 1.1, -.94, -4.83, scene, .03);
  for (let x = -3.2; x <= 5.8; x += 1.8) {
    box(1.65, 1.2, .09, M.trim, x, -.92, -4.09, scene, .018);
    box(.4, .06, .08, M.darkWood, x, -.45, -3.99, scene, .02);
  }
  // Printer, with scanner lid, paper output and status display.
  const printer = new THREE.Group(); printer.position.set(3.65, -.04, -4.73); scene.add(printer);
  box(2.65, 1.39, 1.47, M.cream, 0, .68, 0, printer, .12);
  box(2.73, .17, 1.52, M.black, 0, 1.39, -.02, printer, .055);
  box(2.68, .12, 1.44, M.cream, 0, 1.52, -.05, printer, .05);
  box(1.66, .24, .11, M.black, -.12, .73, .745, printer, .035);
  box(1.78, .06, .86, M.trim, -.12, .58, 1.05, printer, .025);
  box(1.4, .018, .84, M.paper, -.08, .62, 1.12, printer);
  box(.55, .29, .04, M.black, .8, 1.12, .74, printer, .025);
  box(.38, .14, .01, mat('#8ead97', { emissive: '#638574', emissiveIntensity: .5 }), .8, 1.15, .769, printer);
  sphere(.035, mat('#b9cd6c', { emissive: '#b9cd6c', emissiveIntensity: .7 }), 1.12, 1.13, .77, printer);
  for (let i = 0; i < 7; i++) box(.015, .25, .02, M.trim, -.9 + i * .13, .26, .746, printer);

  const binders = [M.terracotta, M.greenDark, M.blue, M.cream, M.green, M.yellow];
  box(3.1, .09, 1, M.darkWood, -.65, 1.13, -5.22);
  box(.09, 1.27, 1, M.darkWood, -2.15, .52, -5.22);
  box(.09, 1.27, 1, M.darkWood, .85, .52, -5.22);
  for (let i = 0; i < 9; i++) {
    box(.23, .98 + Math.sin(i) * .06, .77, binders[i % binders.length], -1.92 + i * .29, .55, -5.17, scene, .02);
    box(.12, .32, .011, M.paper, -1.92 + i * .29, .66, -4.775, scene, .007);
    const hole = cylinder(.036, .036, .014, M.black, -1.92 + i * .29, .21, -4.765, scene, 16); hole.rotation.x = Math.PI / 2;
  }

  // Woodgrain texture is intentionally quiet at playing distance.
  const woodTexture = canvasTexture(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#c89763'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      const y = (i * 41.29) % h;
      ctx.strokeStyle = i % 3 ? 'rgba(111,69,35,.08)' : 'rgba(255,228,177,.13)';
      ctx.lineWidth = .6 + i % 3;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * .33, y + Math.sin(i) * 5, w * .65, y + Math.cos(i) * 7, w, y + Math.sin(i * 3) * 3); ctx.stroke();
    }
  });
  const deskMaterial = mat('#ffffff', { map: woodTexture, roughness: .68 });
  box(14.2, .24, 8.2, deskMaterial, 0, -.17, .2, scene, .085);
  box(14.2, .08, 8.2, M.darkWood, 0, -.325, .2, scene, .03);
  // Soft diagonal sunlight patches evoke the window at the left of the player.
  const lightPatchMat = mat('#ffe5aa', { transparent: true, opacity: .13, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const patch = mesh(new THREE.PlaneGeometry(8, .24), lightPatchMat, scene, -2.8, -.042, -.5 + i * .52, false);
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = -.37;
  }

  // Desk accessories: in-tray, bound documents, mug and stationery.
  const tray = new THREE.Group(); tray.position.set(-3.75, .04, -1.18); tray.rotation.y = -.12; scene.add(tray);
  box(2.28, .07, 2.82, M.greenDark, 0, 0, 0, tray, .035);
  for (const x of [-1.12, 1.12]) box(.045, .24, 2.8, M.greenDark, x, .115, 0, tray, .015);
  box(2.27, .22, .055, M.greenDark, 0, .12, -1.36, tray);
  for (let i = 0; i < 5; i++) {
    const paper = box(2.02, .047, 2.57, i === 4 ? M.cream : M.paper, Math.sin(i) * .027, .07 + i * .05, .06, tray, .007);
    paper.rotation.y = i === 4 ? -.025 : .008 * i;
  }
  const topDoc = canvasTexture(512, 700, (ctx, w, h) => {
    ctx.fillStyle = '#f9f5e7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#748275'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('ORDEM DE SERVIÇO', 48, 78);
    ctx.fillStyle = '#a9aaa0';
    for (let i = 0; i < 15; i++) ctx.fillRect(48, 135 + i * 28, 300 + (i % 3) * 20, i === 4 ? 4 : 2);
    ctx.strokeStyle = '#819187'; ctx.strokeRect(48, 585, 405, 65);
  });
  const trayDoc = mesh(new THREE.PlaneGeometry(1.98, 2.49), mat('#fff', { map: topDoc }), tray, 0, .333, .07, false); trayDoc.rotation.x = -Math.PI / 2;

  const mug = createMug({ mat, canvasTexture });
  mug.position.set(4.6, -.05, -.72); scene.add(mug);
  const saucer = mug.getObjectByName('saucer');
  scene.updateMatrixWorld(true);
  scene.attach(saucer);
  const coffee = createCoffee({ scene, cup: mug.getObjectByName('cup'), mat });

  const pencilPot = new THREE.Group(); pencilPot.position.set(4.38, 0, -2.62); scene.add(pencilPot);
  cylinder(.34, .28, .71, M.greenDark, 0, .36, 0, pencilPot);
  for (let i = 0; i < 7; i++) {
    const px = Math.sin(i * 2.4) * .2, pz = Math.cos(i * 2.4) * .2;
    rod([px, .32, pz], [px + Math.sin(i) * .19, 1.27 + (i % 3) * .14, pz], .028, [M.yellow, M.terracotta, M.blue][i % 3], pencilPot);
  }
  const sticky = new THREE.Group(); sticky.position.set(3.35, .03, -.85); sticky.rotation.y = -.2; scene.add(sticky);
  box(.94, .105, .9, M.yellow, 0, 0, 0, sticky, .01);
  let noteIndex = 0, scribbled = false;
  const notes = ['CAFÉ + PAPEL', 'SEM PRESSA!', 'FALTA GRAMPO'];
  const noteTexture = canvasTexture(384, 384, (ctx, w, h) => { ctx.fillStyle = '#e6c668'; ctx.fillRect(0, 0, w, h); });
  function redrawNote() {
    const ctx = noteTexture.image.getContext('2d');
    ctx.fillStyle = '#e6c668'; ctx.fillRect(0, 0, 384, 384);
    ctx.fillStyle = '#5f6249'; ctx.font = 'bold 33px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(notes[noteIndex], 192, 96);
    ctx.font = '23px sans-serif'; ctx.fillText('lembrete do dia', 192, 140);
    if (scribbled) {
      ctx.strokeStyle = '#45576b'; ctx.lineWidth = 5; ctx.beginPath();
      ctx.arc(192, 250, 58, 0, TAU); ctx.moveTo(164, 239); ctx.lineTo(167, 245);
      ctx.moveTo(216, 239); ctx.lineTo(219, 245); ctx.moveTo(165, 270); ctx.quadraticCurveTo(192, 298, 221, 267); ctx.stroke();
    }
    noteTexture.needsUpdate = true;
  }
  redrawNote();
  const noteFace = mesh(new THREE.PlaneGeometry(.91, .87), mat('#fff', { map: noteTexture }), sticky, 0, .055, 0, false); noteFace.rotation.x = -Math.PI / 2;
  const pencil = new THREE.Group(); pencil.position.set(-2.23, .025, 1.79); scene.add(pencil);
  rod([.33, 0, -.71], [-.25, 0, .5], .037, M.yellow, pencil);
  rod([-.25, 0, .5], [-.35, 0, .71], .035, M.darkWood, pencil, .003);
  const eraser = box(.56, .19, .33, M.cream, -2.56, .055, 2.7, scene, .025); eraser.rotation.y = -.18;
  // Rubber stamp.
  const stamp = new THREE.Group(); stamp.position.set(-1.05, .035, -1.35); scene.add(stamp);
  box(.85, .09, .55, M.darkWood, 0, .045, 0, stamp, .04);
  cylinder(.15, .24, .42, M.terracotta, 0, .295, 0, stamp);
  sphere(.22, M.darkWood, 0, .505, 0, stamp);

  // Hero prop. Hinge is physically placed at the back of the stapler.
  const hero = new THREE.Group(); hero.position.set(1.05, .03, .42); hero.rotation.y = -.16; scene.add(hero);
  box(.99, .10, 2.85, M.rubber, 0, .02, -.17, hero, .055);
  box(1.08, .25, 2.8, M.green, 0, .18, -.17, hero, .13);
  box(.89, .058, 2.49, M.greenLight, 0, .312, -.08, hero, .027);
  box(.49, .04, .49, M.steel, 0, .356, .86, hero, .055);
  box(.24, .012, .055, M.black, 0, .38, .86, hero, .008);
  box(.24, .012, .055, M.black, 0, .38, .97, hero, .008);
  const hinge = cylinder(.15, .15, 1.14, M.steel, 0, .43, -1.28, hero); hinge.rotation.z = Math.PI / 2;
  for (const x of [-.56, .56]) {
    const cap = cylinder(.107, .107, .018, M.greenDark, x, .43, -1.28, hero, 24); cap.rotation.z = Math.PI / 2;
    const screw = cylinder(.042, .042, .024, M.steel, x * 1.02, .43, -1.28, hero, 16); screw.rotation.z = Math.PI / 2;
  }
  const arm = new THREE.Group(); arm.position.set(0, .43, -1.28); hero.add(arm);
  box(.81, .10, 2.57, M.steel, 0, -.045, 1.21, arm, .035);
  box(.91, .33, 2.7, M.green, 0, .125, 1.18, arm, .16);
  box(.73, .08, 2.24, M.greenLight, 0, .3, 1.14, arm, .06);
  box(.93, .31, .37, M.green, 0, .1, 2.35, arm, .095);
  box(.62, .075, .14, M.steel, 0, -.12, 2.42, arm, .02);
  const brand = textBoard('PRESSA', 'INDÚSTRIA BRASILEIRA', .56, .27, '#ccb778', '#28453c', 0, .35, 1.02, arm);
  brand.rotation.x = -Math.PI / 2;
  const springCurve = [];
  for (let i = 0; i <= 70; i++) { const a = i / 70 * TAU * 6; springCurve.push(new THREE.Vector3(Math.sin(a) * .075, Math.cos(a) * .075 + .035, .13 + i / 70 * .53)); }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springCurve), 100, .012, 5, false), M.steel, arm);

  // Keep a visible section of the bundle inside the stapler's mouth. The stack
  // remains on the base while its front half extends toward the player.
  const PAPER_HOME_Y = .19;
  const PAPER_HOME_Z = 1.58;
  const STAPLE_PLATE_Z = .86;
  const paperStack = new THREE.Group(); paperStack.position.set(0, PAPER_HOME_Y, PAPER_HOME_Z); hero.add(paperStack);
  const paperSheets = [];
  for (let i = 0; i < 24; i++) {
    const sheet = box(2.97, .018, 3.76, i % 5 === 0 ? M.paperEdge : M.paper, 0, 0, 0, paperStack, .009);
    paperSheets.push(sheet);
  }
  const printedPageTexture = canvasTexture(768, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#fffcf2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#527667'; ctx.font = 'bold 43px sans-serif'; ctx.fillText('RELATÓRIO', 70, 135);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#8e978d'; ctx.fillText('DEPARTAMENTO DE COISAS IMPORTANTES', 70, 175);
    ctx.fillStyle = '#d4dbce'; ctx.fillRect(70, 213, 624, 3);
    for (let i = 0; i < 17; i++) { ctx.fillStyle = i % 6 === 0 ? '#b7c1b4' : '#dde0d5'; ctx.fillRect(70, 276 + i * 26, i % 5 === 3 ? 436 : 622, i % 6 === 0 ? 5 : 3); }
    ctx.fillStyle = '#eff0e5'; ctx.fillRect(70, 766, 621, 138);
    ctx.fillStyle = '#bcc8b8'; for (let i = 0; i < 7; i++) ctx.fillRect(101 + i * 77, 861 - i % 4 * 19, 37, 26 + i % 4 * 19);
    ctx.fillStyle = '#a0aa9b'; ctx.font = '16px sans-serif'; ctx.fillText('CÓPIA 01    /    FAVOR GRAMPEAR', 70, 960);
  });
  const printedPage = mesh(new THREE.PlaneGeometry(2.93, 3.72), mat('#fff', { map: printedPageTexture, roughness: .93 }), paperStack, 0, .45, 0, false);
  printedPage.rotation.x = -Math.PI / 2;
  const staple = new THREE.Group(); paperStack.add(staple); staple.position.set(0, .5, STAPLE_PLATE_Z - PAPER_HOME_Z);
  rod([-.2, 0, 0], [.2, 0, 0], .018, M.steel, staple);
  rod([-.2, 0, 0], [-.2, -.075, 0], .018, M.steel, staple);
  rod([.2, 0, 0], [.2, -.075, 0], .018, M.steel, staple);
  staple.visible = false;

  const stampTexture = canvasTexture(512, 180, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h); ctx.strokeStyle = '#ac4b3b'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#ac4b3b'; ctx.font = 'bold 70px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('RECEBIDO', w / 2, 112);
  });
  const stampMark = mesh(new THREE.PlaneGeometry(1.14, .4), mat('#fff', { map: stampTexture, transparent: true, depthWrite: false }), paperStack, .54, .5, .74, false);
  stampMark.rotation.set(-Math.PI / 2, 0, -.12); stampMark.visible = false;
  scene.updateMatrixWorld(true);
  scene.attach(paperStack);
  const paperLocalPosition = new THREE.Vector3();
  const paperLocalQuaternion = new THREE.Quaternion();
  const paperLocalRotation = new THREE.Euler();
  // Hands live outside the selectable props and only appear during a game press.
  const handsRig = new THREE.Group(); scene.add(handsRig);
  const hands = createHands({ parent: handsRig, mat });

  // Sparse airborne paper dust in the afternoon light.
  const dustCount = 70;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = Math.sin(i * 34.3) * 6;
    dustPositions[i * 3 + 1] = .7 + ((i * 1.73) % 4.5);
    dustPositions[i * 3 + 2] = Math.cos(i * 17.7) * 5 - 1;
  }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({ color: '#fff3d0', size: .022, transparent: true, opacity: .5, depthWrite: false, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeometry, dustMaterial); scene.add(dust);

  let width = 1, height = 1, smoothForce = 0, smoothPulse = 0, smoothAlignment = 0, time = 0;
  let previousPapers = -1, lobby = null, staplerTestRemaining = 0;
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width || window.innerWidth);
    height = Math.max(1, bounds.height || window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width / height < .9 ? 60 : width / height < 1.25 ? 49 : 43;
    camera.updateProjectionMatrix();
  }
  function update(dt, visual = {}) {
    const fluidDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    dt = Math.min(Number.isFinite(dt) ? dt : .016, .06);
    time = visual.elapsed ?? time + dt;
    const phase = visual.phase || 'menu';
    const isMenu = phase === 'menu' || phase === 'lobby';
    const inLobby = lobby?.isEnabled() || false;
    const targetForce = clamp((visual.force || 0) / 100, 0, 1);
    smoothForce = lerp(smoothForce, targetForce, 1 - Math.exp(-dt * 10));
    smoothPulse = lerp(smoothPulse, clamp(visual.pressPulse || 0, 0, 1), 1 - Math.exp(-dt * 22));
    smoothAlignment = lerp(smoothAlignment, visual.alignment || 0, 1 - Math.exp(-dt * 9));
    const papers = Math.max(1, visual.papers || 12);
    const bundleHeight = .05 + Math.sqrt(papers / 300) * .43;
    if (papers !== previousPapers) {
      for (let i = 0; i < paperSheets.length; i++) {
        const sheet = paperSheets[i];
        sheet.position.y = i / (paperSheets.length - 1) * bundleHeight;
        sheet.scale.y = Math.max(.8, bundleHeight / paperSheets.length / .018);
        sheet.position.x = Math.sin(i * 1.89) * .012;
        sheet.position.z = Math.cos(i * 2.17) * .014;
      }
      printedPage.position.y = bundleHeight + .014;
      staple.position.y = bundleHeight + .035;
      stampMark.position.y = bundleHeight + .018;
      previousPapers = papers;
    }
    const alignment = phase === 'align' ? smoothAlignment : smoothAlignment * .2;
    if (!inLobby) {
      hero.updateMatrixWorld(true);
      paperLocalPosition.set(alignment * .22, PAPER_HOME_Y, PAPER_HOME_Z);
      paperStack.position.copy(hero.localToWorld(paperLocalPosition));
      paperLocalQuaternion.setFromEuler(paperLocalRotation.set(0, alignment * .07, 0));
      paperStack.quaternion.copy(hero.quaternion).multiply(paperLocalQuaternion);
    }
    staplerTestRemaining = Math.max(0, staplerTestRemaining - dt);
    const testStroke = inLobby && staplerTestRemaining > 0 ? Math.sin((1 - staplerTestRemaining / .55) * Math.PI) : 0;
    const compression = clamp(smoothForce * .69 + smoothPulse * .40 + testStroke, 0, 1);
    const restAngle = -.35 - bundleHeight * .12;
    const closedAngle = -(bundleHeight - .04) / 2.55;
    let angle = lerp(restAngle, closedAngle, compression);
    if (phase === 'success' || phase === 'complete') angle = closedAngle;
    if (phase === 'jam' || visual.jammed) angle += Math.sin(time * 48) * .006;
    arm.rotation.x = angle;
    staple.visible = phase === 'success' || phase === 'complete';
    const lookX = clamp(visual.lookX || 0, -1, 1), lookY = clamp(visual.lookY || 0, -1, 1);
    const shake = phase === 'jam' ? Math.sin(time * 43) * .012 : smoothPulse * Math.sin(time * 32) * .022;
    camera.position.x = cameraHome.x + lookX * .16 + shake;
    camera.position.y = cameraHome.y - lookY * .12 + Math.sin(time * .72) * .008;
    camera.position.z = cameraHome.z + (isMenu ? .15 : 0);
    camera.lookAt(cameraTarget.x + lookX * .045, cameraTarget.y - lookY * .025, cameraTarget.z);
    handsRig.position.copy(hero.position); handsRig.quaternion.copy(hero.quaternion);
    hands.update(dt, { ...visual, phase: inLobby ? 'lobby' : phase, angle, bundleHeight, alignment, elapsed: time });
    lobby?.update(dt);
    const mugStatus = lobby?.getItems().find(item => item.id === 'mug');
    coffee.update(fluidDt, { enabled: inLobby && !visual.paused, broken: !!mugStatus?.broken, held: !!mugStatus?.held });
    timeClock.update(dt);
    dust.rotation.y = time * .012;
    dust.position.y = Math.sin(time * .23) * .12;
    renderer.render(scene, camera);
  }
  function dispose() {
    lobby?.dispose();
    hands.dispose();
    coffee.dispose();
    const geometries = new Set();
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    dustMaterial.dispose();
    renderer.dispose();
  }
  resize();
  update(0, { phase: 'menu', papers: 12 });
  lobby = createLobby({ scene, camera, canvas, items: [
    { id: 'stapler', name: 'Grampeador', description: 'O veterano da repografia. Experimente apertar antes do expediente.', actionLabel: 'Testar grampeador', object: hero, action: 'test-stapler', message: 'Grampeador pronto. Bata o ponto na parede para começar.', onUse() { staplerTestRemaining = .55; }, onReset() { staplerTestRemaining = 0; } },
    { id: 'papers', name: 'Pilha de papéis', description: 'Relatórios esperando um grampo. Experimente embaralhar as folhas.', actionLabel: 'Embaralhar', object: paperStack, action: 'shuffle', message: 'As folhas estão embaralhadas. Ninguém vai perceber.', onUse() {
      paperSheets.forEach((sheet, i) => { sheet.rotation.y = Math.sin(i * 2.3 + time) * .045; });
    } },
    { id: 'mug', name: 'Caneca de café', description: 'Pegue e incline a caneca para derramar o café. O pires fica na mesa.', actionLabel: 'Tomar café', object: mug, actionObject: mug.getObjectByName('cup'), action: 'sip', fragile: true, breakThreshold: 6, mass: .45,
      getStatus() { const status = coffee.getState(); return { liquidFill: Math.round(status.fill * 100), spilling: status.spilling }; },
      onUse() { return coffee.sip(); }, onReset() { coffee.reset(); } },
    { id: 'saucer', name: 'Pires de cerâmica', description: 'Um apoio para a caneca. Cuidado: a cerâmica pode quebrar numa queda forte.', actionLabel: 'Examinar pires', object: saucer, action: 'inspect', fragile: true, breakThreshold: 6, mass: .22, message: 'Um pires de cerâmica esmaltada, companheiro da caneca.' },
    { id: 'pencils', name: 'Porta-lápis', description: 'Lápis e canetas prontos para mais um expediente.', actionLabel: 'Chacoalhar', object: pencilPot, action: 'rattle', message: 'Tem uma caneta boa aí no meio. Provavelmente.' },
    { id: 'sticky', name: 'Bloco de lembretes', description: 'Troque o recado ou use o lápis para desenhar nele.', actionLabel: 'Próximo recado', object: sticky, action: 'note', message: 'Lembrete atualizado.', onUse() { noteIndex = (noteIndex + 1) % notes.length; redrawNote(); }, onReset() { noteIndex = 0; scribbled = false; redrawNote(); } },
    { id: 'pencil', name: 'Lápis', description: 'Um lápis para dar personalidade aos lembretes.', actionLabel: 'Rabiscar lembrete', object: pencil, action: 'write', message: 'Um sorriso no bloco para alegrar o expediente.', onUse() {
      if (lobby.getItems().find(item => item.id === 'sticky').broken) return { message: 'Restaure o bloco antes de escrever nele.' };
      scribbled = true; redrawNote();
    } },
    { id: 'eraser', name: 'Borracha', description: 'Apaga o desenho do bloco e permite começar de novo.', actionLabel: 'Apagar rabisco', object: eraser, action: 'erase', message: 'Rabisco apagado. Ideias novas são bem-vindas.', onUse() { scribbled = false; redrawNote(); } },
    { id: 'stamp', name: 'Carimbo', description: 'Uma batida e o relatório está oficialmente recebido.', actionLabel: 'Carimbar relatório', object: stamp, action: 'stamp', message: 'RECEBIDO! O relatório ganhou seu carimbo.', onUse() {
      if (lobby.getItems().find(item => item.id === 'papers').broken) return { message: 'Restaure os papéis antes de carimbar.' };
      stampMark.visible = true;
    } },
    { id: 'tray', name: 'Bandeja de documentos', description: 'Organize os documentos ou mude a bandeja de lugar.', actionLabel: 'Organizar documentos', object: tray, action: 'sort', message: 'Documentos alinhados. A mesa agradece.', onUse() { trayDoc.rotation.z = 0; } },
    { id: 'timeclock', name: 'Relógio de ponto', description: 'Insira o cartão para começar o expediente.', actionLabel: 'Bater o ponto', object: timeClock.object, fixed: true, directUse: true, action: 'clock-in', onUse() {
      const accepted = timeClock.punch();
      return accepted ? { action: 'clock-in', duration: 1.7, message: 'Registrando entrada…' } : { action: 'feedback', message: 'Aguarde o registro.' };
    }, onReset() { timeClock.reset(); } },
  ] });
  return { update, resize, dispose, lobby, coffee };
}

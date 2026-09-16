import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Wall-mounted punch clock. The world owns disposal through its material registry. */
export function createTimeClock({ mat, canvasTexture }) {
  const object = new THREE.Group();
  object.name = 'time-clock';
  const cream = mat('#e8ddbf', { roughness: .43, metalness: .08 });
  const green = mat('#225f50', { roughness: .35, metalness: .22 });
  const dark = mat('#20392f', { roughness: .62 });
  const metal = mat('#b8b69a', { roughness: .35, metalness: .72 });
  const paper = mat('#f5edd3', { roughness: .95 });
  const lampMaterial = mat('#507847', { roughness: .22, emissive: '#81cb61', emissiveIntensity: .12 });
  function mesh(geometry, material, name, x = 0, y = 0, z = 0, parent = object) {
    const result = new THREE.Mesh(geometry, material);
    result.name = name; result.position.set(x, y, z);
    result.castShadow = result.receiveShadow = true;
    parent.add(result);
    return result;
  }
  function box(w, h, d, material, name, x = 0, y = 0, z = 0, radius = .025, parent = object) {
    return mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, name, x, y, z, parent);
  }
  function face(texture, w, h, name, x, y, z, parent = object) {
    const result = mesh(new THREE.PlaneGeometry(w, h), mat('#ffffff', { map: texture, roughness: .73 }), name, x, y, z, parent);
    result.castShadow = false;
    return result;
  }
  function printed(text, width, height, background, color, size = 90) {
    return canvasTexture(width, height, ctx => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = color; ctx.font = `700 ${size}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, width / 2, height / 2 + 2, width * .89);
    });
  }

  box(1.49, 1.52, .13, dark, 'mounting-plate', 0, 0, -.15, .05);
  box(1.44, 1.48, .36, cream, 'clock-housing', 0, 0, 0, .095);
  box(1.34, .49, .045, green, 'green-front-panel', 0, -.455, .187, .035);
  // A recessed opening at the top: the casing naturally hides the inserted card.
  box(.85, .023, .135, metal, 'card-slot-bezel', 0, .748, .005, .014);
  box(.73, .014, .034, dark, 'card-slot', 0, .765, .005, .006);

  face(printed('PONTO', 768, 150, '#e8ddbf', '#285846', 110), 1.12, .218, 'ponto-label', 0, .526, .183);
  box(1.14, .47, .052, dark, 'time-display-frame', 0, .187, .195, .025);
  const timeTexture = canvasTexture(900, 320, (ctx, w, h) => {
    ctx.fillStyle = '#263b32'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f0e1b9'; ctx.font = '700 255px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('08:00', w / 2, h * .52);
    ctx.fillStyle = 'rgba(10,28,19,.24)'; ctx.fillRect(0, h * .5, w, 3);
  });
  face(timeTexture, 1.028, .366, 'time-0800', 0, .187, .223);

  let statusContext;
  const statusTexture = canvasTexture(1024, 200, (ctx) => { statusContext = ctx; });
  box(1.12, .23, .034, dark, 'status-frame', 0, -.201, .206, .02);
  face(statusTexture, 1.058, .178, 'live-status', 0, -.201, .225);
  let currentStatus = '';
  function showStatus(message, received = false) {
    if (message === currentStatus) return;
    currentStatus = message;
    statusContext.fillStyle = received ? '#cfdfb7' : '#e6deb9';
    statusContext.fillRect(0, 0, 1024, 200);
    statusContext.fillStyle = received ? '#225a3a' : '#345344';
    statusContext.font = '700 112px sans-serif';
    statusContext.textAlign = 'center'; statusContext.textBaseline = 'middle';
    statusContext.fillText(message, 512, 102, 940);
    statusTexture.needsUpdate = true;
  }
  showStatus('BATA O PONTO');
  face(printed('ENTRADA', 512, 110, '#225f50', '#efe2bb', 76), .57, .122, 'entrada-label', -.18, -.481, .212);
  const lampRing = mesh(new THREE.CylinderGeometry(.097, .097, .035, 32), metal, 'lamp-rim', .465, -.458, .225);
  lampRing.rotation.x = Math.PI / 2;
  const lamp = mesh(new THREE.SphereGeometry(.076, 28, 16), lampMaterial, 'entry-lamp', .465, -.458, .251);
  lamp.scale.z = .36;
  for (const x of [-.588, .588]) {
    for (const y of [-.64, .63]) {
      const screw = mesh(new THREE.CylinderGeometry(.025, .025, .012, 16), metal, 'case-screw', x, y, .197);
      screw.rotation.x = Math.PI / 2;
      box(.029, .006, .004, dark, 'screw-slot', x, y, .205, .001);
    }
  }
  for (let i = 0; i < 4; i++) box(.011, .14, .022, dark, 'side-vent', .723, -.21 + i * .05, -.05, .003);

  const lever = new THREE.Group(); lever.name = 'stamp-lever'; lever.position.set(.716, .105, .015); object.add(lever);
  const axle = mesh(new THREE.CylinderGeometry(.066, .066, .16, 24), metal, 'lever-axle', .04, 0, 0, lever); axle.rotation.z = Math.PI / 2;
  const stem = mesh(new THREE.CylinderGeometry(.026, .026, .31, 20), metal, 'lever-stem', .125, -.07, .11, lever); stem.rotation.x = -.63;
  const knob = mesh(new THREE.SphereGeometry(.09, 28, 16), green, 'lever-knob', .125, -.197, .203, lever); knob.scale.set(1.12, 1, 1);

  // Thin physical cardstock slides through the top slot, behind the front housing.
  const card = new THREE.Group(); card.name = 'time-card'; card.position.set(0, .77, .004); object.add(card);
  box(.65, .65, .014, paper, 'time-card-paper', 0, 0, 0, .018, card);
  let cardContext;
  const cardTexture = canvasTexture(520, 560, ctx => { cardContext = ctx; });
  function drawCard(received = false) {
    const ctx = cardContext;
    ctx.fillStyle = '#f5edd3'; ctx.fillRect(0, 0, 520, 560);
    ctx.fillStyle = '#3d6553'; ctx.textAlign = 'center'; ctx.font = '700 56px sans-serif'; ctx.fillText('CARTÃO', 260, 76);
    ctx.font = '500 27px sans-serif'; ctx.fillText('FUNCIONÁRIO 001', 260, 123);
    ctx.strokeStyle = '#b1b697'; ctx.lineWidth = 3;
    for (let y = 174; y < 540; y += 62) { ctx.beginPath(); ctx.moveTo(35, y); ctx.lineTo(485, y); ctx.stroke(); }
    ctx.font = '500 24px monospace'; ctx.fillText('DIA     ENTRADA    SAÍDA', 260, 160);
    if (received) {
      ctx.save(); ctx.translate(260, 242); ctx.rotate(-.075); ctx.strokeStyle = '#357247'; ctx.fillStyle = '#357247';
      ctx.lineWidth = 5; ctx.strokeRect(-208, -45, 416, 88);
      ctx.font = '700 51px sans-serif'; ctx.fillText('RECEBIDO', 0, 13); ctx.restore();
      ctx.font = '700 39px monospace'; ctx.fillText('01      08:00      —', 260, 323);
    }
    cardTexture.needsUpdate = true;
  }
  drawCard();
  face(cardTexture, .624, .622, 'time-card-print', 0, 0, .009, card);

  let elapsed = 0, active = false, recorded = false, stamped = false;
  const ease = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function punch() {
    if (active || recorded) return false;
    active = true; elapsed = 0; stamped = false;
    showStatus('INSERINDO…');
    return true;
  }
  function update(dt) {
    if (!active) return;
    elapsed += THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    if (elapsed < .48) {
      card.position.y = THREE.MathUtils.lerp(.77, .465, ease(elapsed / .48));
    } else if (elapsed < 1.03) {
      card.position.y = .465;
      showStatus('REGISTRANDO…');
      lever.rotation.x = -.53 * Math.sin(ease((elapsed - .48) / .55) * Math.PI);
      if (elapsed >= .78 && !stamped) {
        stamped = true; drawCard(true); lampMaterial.emissiveIntensity = 1.6;
        lampMaterial.color.set('#a4d77b');
      }
    } else {
      card.position.y = THREE.MathUtils.lerp(.465, .77, ease((elapsed - 1.03) / .57));
      lever.rotation.x = 0;
      showStatus('RECEBIDO', true);
    }
    if (elapsed >= 1.6) {
      active = false; recorded = true;
      card.position.y = .77;
      lampMaterial.emissiveIntensity = .85;
    }
  }
  function reset() {
    elapsed = 0; active = recorded = stamped = false;
    card.position.set(0, .77, .004); lever.rotation.x = 0;
    lampMaterial.color.set('#507847'); lampMaterial.emissiveIntensity = .12;
    drawCard(); showStatus('BATA O PONTO');
  }
  return { object, punch, update, reset };
}

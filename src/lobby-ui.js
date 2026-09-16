import './lobby.css';
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createLobbyUI({ world, canvas, onStart, sound }) {
  const section = document.createElement('section');
  section.id = 'lobby'; section.className = 'lobby'; section.hidden = true;
  section.innerHTML = `
    <aside class="lobby-intro"><span class="eyebrow"><span class="status-dot"></span> ANTES DO EXPEDIENTE</span><h2>A mesa é sua.</h2><p>Pegue, vire, solte. Sinta o peso.<br>Cuidado com o café.</p><span class="lobby-count" id="lobby-count"></span></aside>
    <div class="lobby-actions"><button class="lobby-reset" data-lobby-action="reset" title="Restaurar objetos, encher o café e limpar a mesa">↺ <span>Arrumar a mesa</span></button><span class="wall-clock-direction">◷ <span>Seu expediente começa<br>no relógio de ponto da parede.</span></span></div>
    <aside id="object-card" class="object-card" hidden>
      <div class="object-card-top"><span id="object-category">OBJETO DA MESA</span><button data-lobby-action="deselect" class="object-close" aria-label="Soltar e fechar objeto selecionado">×</button></div>
      <h2 id="object-name"></h2><p id="object-description"></p>
      <div class="object-status"><span class="status-dot"></span><span id="object-status">SOBRE A MESA</span></div>
      <div id="coffee-level" class="coffee-level" hidden><div><span>CAFÉ NA CANECA</span><strong id="coffee-value">100%</strong></div><div class="coffee-track"><span id="coffee-fill"></span></div><small id="coffee-hint">Incline para derramar.</small></div>
      <button class="object-use" id="object-use" data-lobby-action="use"></button>
      <div class="object-buttons"><button id="object-pick" data-lobby-action="pick">Pegar <kbd>F</kbd></button><button data-lobby-action="throw">Arremessar <kbd>G</kbd></button></div>
      <div class="object-tilt"><span>INCLINAR</span><button data-lobby-action="tilt-forward" aria-label="Inclinar objeto para frente">↶ <kbd>R</kbd></button><button data-lobby-action="tilt-back" aria-label="Inclinar objeto para trás">↷ <kbd>T</kbd></button><span class="tilt-tip">ou botão direito + arraste</span></div>
      <div class="object-rotation"><span>GIRAR</span><button data-lobby-action="rotate-left" aria-label="Girar objeto para a esquerda">↶ <kbd>Q</kbd></button><button data-lobby-action="rotate-right" aria-label="Girar objeto para a direita">↷ <kbd>E</kbd></button><button class="break-button" data-lobby-action="break">Quebrar <kbd>X</kbd></button></div>
      <span class="object-help">Segure e arraste para levantar. Solte para deixar cair.</span>
    </aside>
    <div id="grab-cursor" class="grab-cursor" hidden aria-hidden="true"><span></span></div>
    <div id="carry-hint" class="carry-hint" hidden><span class="carry-dot"></span><strong id="carry-name"></strong><span><kbd>RODA</kbd> aproximar / afastar</span><span><kbd>DIREITO + ARRASTE</kbd> girar</span><span id="carry-release"></span></div>
    <div id="lobby-hover" class="lobby-hover" hidden></div>
    <div id="lobby-toast" class="lobby-toast" role="status" aria-live="polite"></div>
    <div class="lobby-inventory"><button data-lobby-action="inventory" id="inventory-toggle" aria-expanded="false">☷ <span>Objetos da firma</span><span class="inventory-arrow">⌃</span></button><div id="inventory-items" class="inventory-items" hidden></div></div>
    <div class="lobby-instructions"><span><kbd>SEGURE + ARRASTE</kbd> pegar</span><span><kbd>F</kbd> segurar / soltar</span><span><kbd>R</kbd><kbd>T</kbd> inclinar</span><span class="destruction-note">Movimente, derrame e quebre — só no lobby.</span></div>`;
  document.querySelector('main').append(section);
  const el = id => section.querySelector(`#${id}`);
  const controller = world?.lobby;
  const turningKeys = new Map([['KeyQ', ['y', -1]], ['KeyE', ['y', 1]], ['KeyR', ['x', -1]], ['KeyT', ['x', 1]], ['KeyZ', ['z', -1]], ['KeyC', ['z', 1]]]);
  const heldKeys = new Set();
  let enabled = false, blocked = false, dragging = false, rotating = false, pointerId = null;
  let pointer = { x: innerWidth / 2, y: innerHeight / 2 }, rotationPointer = { ...pointer };
  let lastSignature = '', lastInventory = '', toastTime = 0, clockingLeft = 0, pourSoundIn = 0;
  let previousBroken = new Set();

  function available() { return enabled && !blocked && clockingLeft <= 0 && controller; }
  function toast(message, danger = false) {
    el('lobby-toast').textContent = message;
    el('lobby-toast').className = `lobby-toast visible${danger ? ' danger' : ''}`;
    toastTime = 3;
  }
  function enter() {
    enabled = true; blocked = false; clockingLeft = 0; pourSoundIn = 0;
    section.classList.remove('clocking-in'); section.inert = false; section.hidden = false;
    lastSignature = lastInventory = '';
    controller?.setPaused?.(false); controller?.setEnabled(true);
    previousBroken = new Set(controller?.getItems().filter(item => item.broken).map(item => item.id) || []);
    tick(0);
  }
  function endDrag() {
    dragging = rotating = false;
    controller?.endDrag();
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    canvas.style.cursor = enabled && controller?.getSelected()?.held ? 'none' : '';
  }
  function leave() {
    clockingLeft = 0; heldKeys.clear(); endDrag();
    controller?.reset(); controller?.setEnabled(false); controller?.setPaused?.(false);
    enabled = false; section.hidden = true; section.inert = false;
    section.classList.remove('clocking-in', 'holding-object');
    el('lobby-hover').hidden = el('grab-cursor').hidden = el('carry-hint').hidden = true;
    el('lobby-toast').className = 'lobby-toast'; el('lobby-toast').textContent = ''; toastTime = 0;
    canvas.style.cursor = '';
  }
  function act(action, id) {
    if (!available()) return;
    if (action === 'reset') { heldKeys.clear(); endDrag(); controller.reset(); toast('Mesa limpa, café cheio. Como se nada tivesse acontecido.'); sound('key'); return; }
    if (action === 'inventory') {
      const open = el('inventory-items').hidden;
      el('inventory-items').hidden = !open; el('inventory-toggle').setAttribute('aria-expanded', String(open)); return;
    }
    if (action === 'select') {
      endDrag(); controller.select(id);
      el('inventory-items').hidden = true; el('inventory-toggle').setAttribute('aria-expanded', 'false'); sound('key'); return;
    }
    if (action === 'deselect') { heldKeys.clear(); endDrag(); controller.deselect(); return; }
    const selected = controller.getSelected();
    if (!selected || selected.broken || (selected.fixed && action !== 'use')) return;
    if (action === 'pick') {
      if (selected.held) { controller.dropSelected(); endDrag(); }
      else { endDrag(); controller.pickUp(pointer.x, pointer.y); sound('pick'); }
    } else if (action === 'throw') {
      // Release pointer capture without dropping the held object before applying the throw.
      dragging = rotating = false; controller.throwSelected(); endDrag(); sound('throw');
    } else if (action === 'break') {
      dragging = rotating = false; controller.breakSelected(); endDrag(); toast(`${selected.name}: fora de serviço.`, true);
    } else if (action === 'rotate-left') controller.rotate(-Math.PI / 12, 'y');
    else if (action === 'rotate-right') controller.rotate(Math.PI / 12, 'y');
    else if (action === 'tilt-forward' || action === 'tilt-back') {
      if (!selected.held) { controller.pickUp(pointer.x, pointer.y); sound('pick'); }
      controller.rotate(action === 'tilt-forward' ? -.28 : .28, 'x');
    } else if (action === 'use') {
      const result = controller.useSelected();
      if (result?.action === 'clock-in') {
        clockingLeft = Math.max(.1, result.duration || 1.7); heldKeys.clear();
        section.inert = true; section.classList.add('clocking-in'); endDrag();
        el('lobby-hover').hidden = true; toast(result.message || 'Registrando entrada…');
        el('object-use').textContent = 'Registrando entrada…'; sound('clock-in');
      } else if (result?.message) { toast(result.message); sound(result.kind || 'key'); }
    }
  }
  section.addEventListener('click', event => {
    const button = event.target.closest('[data-lobby-action]');
    if (button) { act(button.dataset.lobbyAction, button.dataset.item); button.blur(); }
  });
  canvas.addEventListener('contextmenu', event => { if (enabled) event.preventDefault(); });
  canvas.addEventListener('pointerdown', event => {
    if (!available() || ![0, 2].includes(event.button)) return;
    event.preventDefault();
    pointer = { x: event.clientX, y: event.clientY };
    if (event.button === 2) {
      let selected = controller.getSelected();
      if (!selected) {
        const hit = controller.hover(event.clientX, event.clientY);
        if (hit) selected = controller.select(hit.id);
      }
      if (!selected || selected.fixed || selected.broken) return;
      if (!selected.held) { controller.pickUp(pointer.x, pointer.y); sound('pick'); }
      rotating = true; rotationPointer = { ...pointer };
    } else {
      const held = controller.getSelected();
      if (held?.held && held.holdingMode === 'carry') { controller.dropSelected(); canvas.style.cursor = ''; return; }
      const hit = controller.beginDrag(event.clientX, event.clientY);
      if (hit?.directUse) { act('use'); return; }
      if (hit?.fixed) { canvas.style.cursor = 'pointer'; return; }
      if (!hit) { controller.deselect(); return; }
      dragging = true; sound('pick');
    }
    pointerId = event.pointerId; canvas.setPointerCapture(pointerId); canvas.style.cursor = 'none'; el('lobby-hover').hidden = true;
  });
  canvas.addEventListener('pointermove', event => {
    if (!available()) return;
    const leftDown = !!(event.buttons & 1), rightDown = !!(event.buttons & 2);
    if (dragging && !leftDown) { endDrag(); return; }
    if (rightDown && !rotating && controller.getSelected()?.held) {
      rotating = true; rotationPointer = { x: event.clientX, y: event.clientY };
    }
    if (rotating && !rightDown) rotating = false;
    if (rotating) {
      controller.rotate((event.clientX - rotationPointer.x) * .008, 'y');
      controller.rotate((event.clientY - rotationPointer.y) * .008, 'x');
      rotationPointer = { x: event.clientX, y: event.clientY }; return;
    }
    pointer = { x: event.clientX, y: event.clientY };
    if (dragging) { controller.drag(pointer.x, pointer.y); return; }
    if (controller.getSelected()?.held) { controller.moveHeld(pointer.x, pointer.y); el('lobby-hover').hidden = true; canvas.style.cursor = 'none'; return; }
    const hovered = controller.hover(pointer.x, pointer.y), label = el('lobby-hover');
    label.hidden = !hovered;
    if (hovered) {
      label.textContent = `${hovered.name} · ${hovered.directUse ? 'clique para bater o ponto' : hovered.fixed ? 'clique para usar' : 'segure para pegar'}`;
      label.style.left = `${Math.max(15, Math.min(pointer.x + 18, innerWidth - 270))}px`;
      label.style.top = `${Math.min(pointer.y + 22, innerHeight - 80)}px`;
    }
    canvas.style.cursor = hovered ? hovered.fixed ? 'pointer' : 'grab' : '';
  });
  canvas.addEventListener('pointerup', event => {
    if (event.button === 2 && rotating) { rotating = false; if (!dragging) endDrag(); }
    else if (event.button === 0) endDrag();
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', () => { dragging = rotating = false; pointerId = null; controller?.endDrag(); });
  canvas.addEventListener('pointerleave', () => { if (!dragging && !rotating) { el('lobby-hover').hidden = true; controller?.hover(-1000, -1000); } });
  canvas.addEventListener('wheel', event => {
    if (!available() || !controller.getSelected()?.held) return;
    event.preventDefault();
    controller.adjustHoldDistance(clamp(event.deltaY * .007, -1, 1));
  }, { passive: false });
  const clearKeys = () => heldKeys.clear();
  window.addEventListener('blur', () => { clearKeys(); endDrag(); controller?.dropSelected(); });
  window.addEventListener('keyup', event => heldKeys.delete(event.code));

  function key(event) {
    if (!available()) return;
    if (turningKeys.has(event.code)) {
      const selected = controller.getSelected();
      if (selected && !selected.fixed) {
        if (!selected.held && ['KeyR', 'KeyT', 'KeyZ', 'KeyC'].includes(event.code)) { controller.pickUp(pointer.x, pointer.y); sound('pick'); }
        const [axis, sign] = turningKeys.get(event.code);
        controller.rotate(sign * .10, axis); heldKeys.add(event.code);
      }
    } else if (event.code === 'Escape') { heldKeys.clear(); endDrag(); controller.deselect(); el('inventory-items').hidden = true; el('inventory-toggle').setAttribute('aria-expanded', 'false'); }
    else if (event.code === 'KeyF') act('pick');
    else if (event.code === 'KeyG') act('throw');
    else if (event.code === 'KeyX') act('break');
    else if (event.code === 'Enter' || event.code === 'Space') act('use');
  }
  function tick(dt) {
    if (!enabled || blocked || !controller) return;
    if (clockingLeft > 0) {
      clockingLeft = Math.max(0, clockingLeft - dt);
      if (clockingLeft === 0) { sound('clocked'); onStart(); return; }
    } else {
      for (const code of heldKeys) { const [axis, sign] = turningKeys.get(code); controller.rotate(sign * dt * 1.7, axis); }
    }
    for (const impact of controller.consumeEvents?.() || []) {
      if (impact.type === 'impact' && !impact.broke) sound(impact.id === 'papers' || impact.id === 'sticky' ? 'shuffle' : 'put');
    }
    pourSoundIn -= dt;
    const fluid = world.coffee?.getState();
    if (fluid?.spilling && pourSoundIn <= 0) { sound('pour'); pourSoundIn = 1.25; }
    if (!fluid?.spilling) pourSoundIn = 0;
    for (const event of world.coffee?.consumeEvents() || []) {
      if (event.type === 'empty') toast('Acabou o café. Arrumar a mesa enche a caneca novamente.');
    }
    toastTime -= dt;
    if (toastTime <= 0) el('lobby-toast').classList.remove('visible');
    const items = controller.getItems(), broken = items.filter(item => item.broken).length;
    const newBreaks = items.filter(item => item.broken && !previousBroken.has(item.id));
    for (const item of newBreaks) sound(['mug', 'saucer'].includes(item.id) ? 'break' : ['papers', 'sticky'].includes(item.id) ? 'shuffle' : item.id === 'stapler' ? 'jam' : 'rattle');
    if (newBreaks.length && toastTime <= 0) toast('Ops. Ainda bem que só vale no lobby.', true);
    previousBroken = new Set(items.filter(item => item.broken).map(item => item.id));
    const item = controller.getSelected(), holding = !!item?.held;
    section.classList.toggle('holding-object', holding);
    el('grab-cursor').hidden = el('carry-hint').hidden = !holding || clockingLeft > 0;
    if (holding) {
      el('grab-cursor').style.left = `${pointer.x}px`; el('grab-cursor').style.top = `${pointer.y}px`;
      el('carry-name').textContent = item.name;
      el('carry-release').innerHTML = item.holdingMode === 'drag' ? 'Solte o clique para deixar cair' : '<kbd>F / CLIQUE</kbd> soltar · <kbd>G</kbd> arremessar';
    }
    const signature = JSON.stringify(item && { id:item.id, held:item.held, fixed:item.fixed, moving:item.moving });
    if (signature !== lastSignature) {
      lastSignature = signature; el('object-card').hidden = !item;
      if (item) {
        el('object-name').textContent = item.name; el('object-description').textContent = item.description;
        el('object-use').innerHTML = clockingLeft > 0 ? 'Registrando entrada…' : `${escapeHTML(item.actionLabel || 'Usar objeto')} <kbd>ENTER</kbd>`;
        el('object-pick').innerHTML = `${item.held ? 'Soltar' : 'Pegar'} <kbd>F</kbd>`;
        el('object-status').textContent = item.fixed ? 'FIXADO NA PAREDE' : item.held ? 'NA SUA MÃO · TAMANHO REAL' : item.moving ? 'EM MOVIMENTO' : 'PRONTO PARA PEGAR';
        el('object-category').textContent = item.fixed ? 'ENTRADA DO EXPEDIENTE' : 'OBJETO DA MESA';
        section.querySelector('.object-buttons').hidden = section.querySelector('.object-rotation').hidden = section.querySelector('.object-tilt').hidden = item.fixed;
        el('coffee-level').hidden = item.id !== 'mug';
        section.querySelector('.object-help').textContent = item.fixed ? 'O cartão registra sua entrada antes dos pedidos.' : item.held ? 'R/T inclinam · Q/E giram · Z/C viram de lado.' : 'Segure e arraste para levantar. Solte para deixar cair.';
      }
    }
    if (item?.id === 'mug') {
      const fill = item.liquidFill ?? Math.round((fluid?.fill ?? 1) * 100);
      el('coffee-fill').style.width = `${fill}%`; el('coffee-value').textContent = `${fill}%`;
      el('coffee-hint').textContent = fluid?.spilling ? 'Derramando…' : fill <= 0 ? 'Caneca vazia.' : 'Incline com R/T ou botão direito para derramar.';
      el('coffee-level').classList.toggle('spilling', !!fluid?.spilling);
    }
    const inventorySignature = items.map(item => `${item.id}:${item.broken}`).join('|');
    if (inventorySignature !== lastInventory) {
      lastInventory = inventorySignature;
      const deskItems = items.filter(item => !item.fixed);
      el('lobby-count').textContent = broken ? `${deskItems.length - broken} INTACTOS · ${broken} FORA DE SERVIÇO` : `${String(deskItems.length).padStart(2, '0')} OBJETOS PARA DESCOBRIR`;
      el('inventory-items').innerHTML = items.map((item, i) => `<button data-lobby-action="select" data-item="${escapeHTML(item.id)}" ${item.broken ? 'disabled' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${escapeHTML(item.name)}<small>${item.fixed ? 'PAREDE' : item.broken ? 'QUEBRADO' : '↗'}</small></button>`).join('');
    }
  }
  function setBlocked(value) {
    blocked = value; heldKeys.clear(); section.inert = value || clockingLeft > 0;
    if (value) { endDrag(); el('lobby-hover').hidden = el('grab-cursor').hidden = true; }
    controller?.setPaused?.(value);
  }
  return { enter, leave, tick, key, setBlocked, isDragging: () => dragging || rotating, isHolding: () => !!controller?.getSelected()?.held };
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

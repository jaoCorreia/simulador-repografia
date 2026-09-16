import './lobby.css';
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createLobbyUI({ world, canvas, onStart, sound }) {
  const section = document.createElement('section');
  section.id = 'lobby';
  section.className = 'lobby';
  section.hidden = true;
  section.innerHTML = `
    <aside class="lobby-intro"><span class="eyebrow"><span class="status-dot"></span> ANTES DO EXPEDIENTE</span><h2>A mesa é sua.</h2><p>Explore e reorganize a mesa.<br>Para começar, use o ponto na parede.</p><span class="lobby-count" id="lobby-count">09 OBJETOS PARA DESCOBRIR</span></aside>
    <div class="lobby-actions"><button class="lobby-reset" data-lobby-action="reset" title="Restaurar posição e consertar todos os objetos">↺ <span>Arrumar a mesa</span></button><span class="wall-clock-direction">◷ <span>Seu expediente começa<br>no relógio de ponto da parede.</span></span></div>
    <aside id="object-card" class="object-card" hidden>
      <div class="object-card-top"><span id="object-category">OBJETO DA MESA</span><button data-lobby-action="deselect" class="object-close" aria-label="Fechar objeto selecionado">×</button></div>
      <h2 id="object-name"></h2><p id="object-description"></p>
      <div class="object-status"><span class="status-dot"></span><span id="object-status">SOBRE A MESA</span></div>
      <button class="object-use" id="object-use" data-lobby-action="use"></button>
      <div class="object-buttons"><button id="object-pick" data-lobby-action="pick">Pegar <kbd>F</kbd></button><button data-lobby-action="throw">Arremessar <kbd>G</kbd></button></div>
      <div class="object-rotation"><span>GIRAR</span><button data-lobby-action="rotate-left" aria-label="Girar objeto para a esquerda">↶ <kbd>Q</kbd></button><button data-lobby-action="rotate-right" aria-label="Girar objeto para a direita">↷ <kbd>E</kbd></button><button class="break-button" data-lobby-action="break">Quebrar <kbd>X</kbd></button></div>
      <span class="object-help">Arraste o objeto na mesa para movê-lo.</span>
    </aside>
    <div id="lobby-hover" class="lobby-hover" hidden></div>
    <div id="lobby-toast" class="lobby-toast" role="status" aria-live="polite"></div>
    <div class="lobby-inventory"><button data-lobby-action="inventory" id="inventory-toggle" aria-expanded="false">☷ <span>Objetos da firma</span><span class="inventory-arrow">⌃</span></button><div id="inventory-items" class="inventory-items" hidden></div></div>
    <div class="lobby-instructions"><span><kbd>CLIQUE</kbd> selecionar</span><span><kbd>ARRASTE</kbd> mover</span><span><kbd>Q</kbd><kbd>E</kbd> girar</span><span class="destruction-note">Quebrar só vale no lobby.</span></div>
  `;
  document.querySelector('main').append(section);
  const el = (id) => section.querySelector(`#${id}`);
  let enabled = false;
  let blocked = false;
  let dragging = false;
  let pointerId = null;
  let pointer = {x: 0, y: 0};
  let lastSignature = '';
  let lastInventory = '';
  let toastTime = 0;
  let previousBroken = new Set();
  let clockingLeft = 0;
  const controller = world?.lobby;

  function toast(message, danger = false) {
    el('lobby-toast').textContent = message;
    el('lobby-toast').className = `lobby-toast visible${danger ? ' danger' : ''}`;
    toastTime = 3;
  }
  function enter() {
    enabled = true;
    clockingLeft = 0;
    section.classList.remove('clocking-in');
    blocked = false;
    section.inert = false;
    section.hidden = false;
    lastSignature = '';
    lastInventory = '';
    controller?.setEnabled(true);
    previousBroken = new Set(controller?.getItems().filter((item) => item.broken).map((item) => item.id) || []);
    tick(0);
  }
  function endDrag() {
    if (dragging && enabled && !blocked) sound('put');
    dragging = false;
    controller?.endDrag();
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    canvas.style.cursor = enabled ? 'grab' : '';
  }
  function leave() {
    clockingLeft = 0;
    section.inert = false;
    section.classList.remove('clocking-in');
    endDrag();
    controller?.reset();
    controller?.setEnabled(false);
    enabled = false;
    section.hidden = true;
    el('lobby-hover').hidden = true;
    el('lobby-toast').className = 'lobby-toast';
    el('lobby-toast').textContent = '';
    toastTime = 0;
    canvas.style.cursor = '';
  }
  function act(action, id) {
    if (!enabled || blocked || clockingLeft > 0 || !controller) return;
    if (action === 'reset') { endDrag(); controller.reset(); toast('Tudo consertado. Tudo no lugar. Ninguém viu nada.'); sound('key'); return; }
    if (action === 'inventory') {
      const open = el('inventory-items').hidden;
      el('inventory-items').hidden = !open;
      el('inventory-toggle').setAttribute('aria-expanded', String(open));
      return;
    }
    if (action === 'select') {
      controller.select(id);
      el('inventory-items').hidden = true;
      el('inventory-toggle').setAttribute('aria-expanded', 'false');
      sound('key');
      return;
    }
    if (action === 'deselect') { endDrag(); controller.deselect(); return; }
    const selected = controller.getSelected();
    if (!selected || selected.broken || (selected.fixed && action !== 'use')) return;
    if (action === 'pick') { endDrag(); controller.pickUp(); sound(selected.held ? 'put' : 'pick'); }
    else if (action === 'throw') { endDrag(); controller.throwSelected(); toast('Lá vai!'); sound('throw'); }
    else if (action === 'break') { endDrag(); controller.breakSelected(); toast(`${selected.name}: fora de serviço.`, true); }
    else if (action === 'rotate-left') controller.rotate(-Math.PI / 12);
    else if (action === 'rotate-right') controller.rotate(Math.PI / 12);
    else if (action === 'use') {
      const result = controller.useSelected();
      if (result?.action === 'clock-in') {
        clockingLeft = Math.max(.1, result.duration || 1.7);
        section.inert = true;
        section.classList.add('clocking-in');
        endDrag();
        el('lobby-hover').hidden = true;
        toast(result.message || 'Registrando entrada…');
        el('object-use').textContent = 'Registrando entrada…';
        sound('clock-in');
      } else if (result?.message) { toast(result.message); sound(result.kind || 'key'); }
    }
  }
  section.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lobby-action]');
    if (!button) return;
    act(button.dataset.lobbyAction, button.dataset.item);
    button.blur();
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!enabled || blocked || clockingLeft > 0 || event.button !== 0 || !controller) return;
    event.preventDefault();
    pointer = {x: event.clientX, y: event.clientY};
    const hit = controller.beginDrag(event.clientX, event.clientY);
    if (hit?.directUse) { act('use'); return; }
    if (hit?.fixed) { canvas.style.cursor = 'pointer'; return; }
    if (hit) {
      dragging = true;
      pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
      canvas.style.cursor = 'grabbing';
      el('lobby-hover').hidden = true;
      sound('key');
    } else { controller.deselect(); }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!enabled || blocked || clockingLeft > 0 || !controller) return;
    pointer = {x: event.clientX, y: event.clientY};
    if (dragging) { controller.drag(event.clientX, event.clientY); return; }
    const hovered = controller.hover(event.clientX, event.clientY);
    const label = el('lobby-hover');
    label.hidden = !hovered;
    if (hovered) {
      label.textContent = `${hovered.name} · ${hovered.directUse ? 'clique para bater o ponto' : hovered.fixed ? 'clique para usar' : 'clique e arraste'}`;
      label.style.left = `${Math.max(15, Math.min(event.clientX + 18, innerWidth - 240))}px`;
      label.style.top = `${Math.min(event.clientY + 22, innerHeight - 80)}px`;
    }
    canvas.style.cursor = hovered ? hovered.fixed ? 'pointer' : 'grab' : '';
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', () => { dragging = false; pointerId = null; });
  canvas.addEventListener('pointerleave', () => { if (!dragging) { el('lobby-hover').hidden = true; controller?.hover(-1000, -1000); } });
  canvas.addEventListener('wheel', (event) => {
    if (!enabled || blocked || clockingLeft > 0 || !controller?.getSelected()) return;
    event.preventDefault();
    controller.rotate(Math.sign(event.deltaY) * Math.PI / 18);
  }, { passive: false });
  window.addEventListener('blur', endDrag);

  function key(event) {
    if (!enabled || blocked || clockingLeft > 0) return;
    if (event.code === 'Escape') { endDrag(); controller?.deselect(); el('inventory-items').hidden = true; el('inventory-toggle').setAttribute('aria-expanded', 'false'); }
    else if (event.code === 'KeyQ') act('rotate-left');
    else if (event.code === 'KeyE') act('rotate-right');
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
    }
    toastTime -= dt;
    if (toastTime <= 0) el('lobby-toast').classList.remove('visible');
    const items = controller.getItems();
    const broken = items.filter((item) => item.broken).length;
    const newBreaks = items.filter((item) => item.broken && !previousBroken.has(item.id));
    for (const item of newBreaks) {
      sound(item.id === 'mug' ? 'break' : ['papers', 'sticky'].includes(item.id) ? 'shuffle' : item.id === 'stapler' ? 'jam' : 'rattle');
    }
    if (newBreaks.length && toastTime <= 0) toast('Ops. Ainda bem que só vale no lobby.', true);
    previousBroken = new Set(items.filter((item) => item.broken).map((item) => item.id));
    const item = controller.getSelected();
    const signature = JSON.stringify(item);
    if (signature !== lastSignature) {
      lastSignature = signature;
      el('object-card').hidden = !item;
      if (item) {
        el('object-name').textContent = item.name;
        el('object-description').textContent = item.description;
        el('object-use').innerHTML = clockingLeft > 0 ? 'Registrando entrada…' : `${escapeHTML(item.actionLabel || 'Usar objeto')} <kbd>ENTER</kbd>`;
        el('object-pick').innerHTML = `${item.held ? 'Devolver' : 'Pegar'} <kbd>F</kbd>`;
        el('object-status').textContent = item.fixed ? 'FIXADO NA PAREDE' : item.held ? 'FORA DA MESA · GIRE PARA EXAMINAR' : 'SOBRE A MESA';
        el('object-category').textContent = item.fixed ? 'ENTRADA DO EXPEDIENTE' : 'OBJETO DA MESA';
        section.querySelector('.object-buttons').hidden = item.fixed;
        section.querySelector('.object-rotation').hidden = item.fixed;
        section.querySelector('.object-help').textContent = item.fixed ? 'O cartão registra sua entrada antes dos pedidos.' : 'Arraste o objeto na mesa para movê-lo.';
      }
    }
    const inventorySignature = items.map((item) => `${item.id}:${item.broken}`).join('|');
    if (inventorySignature !== lastInventory) {
      lastInventory = inventorySignature;
      const deskItems = items.filter((item) => !item.fixed);
      el('lobby-count').textContent = broken ? `${deskItems.length - broken} INTACTOS · ${broken} FORA DE SERVIÇO` : `${String(deskItems.length).padStart(2, '0')} OBJETOS PARA DESCOBRIR`;
      el('inventory-items').innerHTML = items.map((item, index) => `<button data-lobby-action="select" data-item="${escapeHTML(item.id)}" ${item.broken ? 'disabled' : ''}><span>${String(index + 1).padStart(2, '0')}</span>${escapeHTML(item.name)}<small>${item.fixed ? 'PAREDE' : item.broken ? 'QUEBRADO' : '↗'}</small></button>`).join('');
    }
  }
  function setBlocked(value) { blocked = value; section.inert = value || clockingLeft > 0; if (value) { endDrag(); el('lobby-hover').hidden = true; } }
  return { enter, leave, tick, key, setBlocked, isDragging: () => dragging, isHolding: () => !!controller?.getSelected()?.held };
}

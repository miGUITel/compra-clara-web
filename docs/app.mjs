import { normalize, sortedItems, addItem, availableSuggestions, listText, validState } from './logic.mjs';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const storageKey = 'compra-clara-mobile-test-v1';
let data, state, filter = 'all', editId = null, selectedProduct = null, toastTimer, view = 'lista', canSave = true;
const isoDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const plusDays = (day, count) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };
const formatDay = (day, long = false) => new Intl.DateTimeFormat('es-ES', { weekday: long ? 'long' : 'short', day: 'numeric', ...(long ? { month: 'long' } : {}), timeZone: 'Europe/Madrid' }).format(new Date(day + 'T12:00:00Z'));
const sectionName = id => data.sections.find(s => s[0] === id)?.[1] || 'Sin sección';
const products = () => data.products;
const productFor = id => products().find(p => p.id === id) || state.items.find(i => i.id === id);
function makeState() {
  const day = isoDay();
  return { schemaVersion: 1, showSections: false, tripDate: day, nextDate: plusDays(day, 3), items: data.initialList.map(id => ({ ...data.products.find(p => p.id === id), done: false, source: 'manual' })), snoozed: [], excludedIds: [], feedback: [] };
}
function notify(message, error = false) {
  clearTimeout(toastTimer); const toast = $('#toast'); toast.textContent = message; toast.classList.toggle('error', error); toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 7000 : 3300);
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); canSave = true; }
  catch { canSave = false; notify('No se puede guardar aquí. Descarga una copia antes de cerrar.', true); }
  $('#save-status').textContent = canSave ? 'Guardado en este dispositivo' : 'Sin guardar · descarga una copia';
  return canSave;
}
function record(type, item, extra = {}) { state.feedback.push({ type, productId: item.id, name: item.name, date: new Date().toISOString(), ...extra }); }
function switchView(next) {
  if (!['lista', 'propuestas', 'preferencias'].includes(next)) next = 'lista';
  view = next;
  $$('.view').forEach(el => { el.hidden = el.id !== 'view-' + next; });
  $$('.navigation button').forEach(button => { if (button.dataset.view === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('.mobile-add').hidden = next === 'preferencias';
  history.replaceState(null, '', '#' + next); window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderList() {
  const items = sortedItems(state, products());
  const total = items.length, done = items.filter(i => i.done).length, percent = total ? Math.round(done / total * 100) : 0;
  $('#total-count').textContent = total; $('#pending-count').textContent = total - done;
  $('#progress-label').textContent = `${done} de ${total} productos comprados`;
  $('#progress-percent').textContent = `${percent} %`; $('#progress-fill').style.width = `${percent}%`;
  $('#list-subtitle').textContent = done === total && total ? '¡Lista completada! Ya lo tienes todo.' : total ? `${total - done} productos por revisar o comprar` : 'Empieza añadiendo lo que necesitas';
  $('#clear-done').hidden = done === 0;
  const visible = items.filter(i => filter === 'all' || (filter === 'done' ? i.done : !i.done));
  let html = '', lastSection;
  for (const item of visible) {
    if (state.showSections && item.section !== lastSection) { html += `<div class="section-heading"><span class="section-number">${escape(item.section.padStart(2,'0'))}</span>${escape(sectionName(item.section))}<span class="section-line"></span></div>`; lastSection = item.section; }
    html += `<div class="product-row ${item.done ? 'done' : ''}" data-item="${escape(item.id)}"><button class="product-check" data-toggle="${escape(item.id)}" aria-pressed="${item.done}" aria-label="${item.done ? 'Marcar pendiente' : 'Marcar comprado'}: ${escape(item.name)}"><span class="checkbox-mark">${icon('check')}</span></button><button class="product-info" data-edit="${escape(item.id)}" aria-label="Editar ${escape(item.name)}"><span class="product-name">${escape(item.name)}</span>${item.source === 'suggestion' ? '<span class="product-origin">Propuesta añadida por ti</span>' : ''}${item.provisional ? '<span class="product-origin">Ubicación provisional</span>' : ''}</button><button class="quantity-button" data-edit="${escape(item.id)}" aria-label="Cantidad de ${escape(item.name)}: ${escape(item.quantity)}">${escape(item.quantity)}</button><button class="row-more" data-edit="${escape(item.id)}" aria-label="Opciones de ${escape(item.name)}">${icon('more')}</button></div>`;
  }
  if (!visible.length) {
    const text = filter === 'done' ? ['Todavía no has marcado productos', 'Toca la casilla de un producto cuando lo hayas comprado.'] : filter === 'pending' && total ? ['¡Todo comprado!', 'Has completado esta lista.'] : ['Un buen comienzo', 'Añade tus productos o revisa las propuestas.'];
    html = `<div class="empty-state"><div class="empty-symbol">${filter === 'pending' && total ? '✓' : '🧺'}</div><h3>${text[0]}</h3><p>${text[1]}</p></div>`;
  }
  $('#shopping-list').innerHTML = html;
  $('#trip-label').textContent = `${state.tripDate === isoDay() ? 'Hoy · ' : ''}${formatDay(state.tripDate)}`;
  $('#next-trip-label').textContent = formatDay(state.nextDate, true);
}
function renderSuggestions() {
  const suggestions = availableSuggestions(data, state);
  const pending = suggestions.filter(s => !state.items.some(i => i.id === s.id));
  $('#nav-count').textContent = pending.length; $('#nav-count').hidden = !pending.length;
  $('#sidebar-suggestions').innerHTML = pending.slice(0,3).map(s => { const p = productFor(s.id); return `<div class="mini-suggestion"><span class="food-icon" aria-hidden="true">${p.emoji}</span><div><strong>${escape(p.name)}</strong><small>${escape(s.short)}</small></div><button class="mini-add" data-suggest="${escape(s.id)}" aria-label="Añadir ${escape(p.name)}">${icon('plus')}</button></div>`; }).join('') || '<p class="suggestion-note">Todas revisadas. Tu lista está lista para salir.</p>';
  $('#proposal-grid').innerHTML = suggestions.map(s => {
    const p = productFor(s.id), inList = state.items.some(i => i.id === p.id);
    return `<article class="proposal-card"><div class="proposal-top"><span class="proposal-emoji" aria-hidden="true">${p.emoji}</span><span class="proposal-section">Sección ${escape(p.section)}</span></div><h2>${escape(p.name)}</h2><p class="proposal-quantity">${escape(p.quantity)} · Cantidad editable</p><p class="proposal-reason">${escape(s.reason)}</p><div class="proposal-actions">${inList ? `<span class="added-label">${icon('check')} Ya está en tu lista</span><button class="have-button" data-edit="${escape(p.id)}">Editar</button>` : `<button class="button secondary" data-suggest="${escape(p.id)}">${icon('plus')} Añadir</button><button class="have-button" data-have="${escape(p.id)}">Tengo</button>`}</div></article>`;
  }).join('') || '<div class="empty-state"><h3>Todas las propuestas revisadas</h3><p>Puedes volver a mostrar las que has apartado.</p></div>';
  $('#add-all').disabled = !pending.length;
  $('#snoozed-area').hidden = !state.snoozed.length;
  $('#snoozed-label').textContent = `${state.snoozed.length} propuestas apartadas porque todavía tienes.`;
}
function renderSettings() {
  const excluded = [...data.excluded, ...state.excludedIds.map(id => productFor(id)?.name || state.feedback.find(f => f.productId === id)?.name).filter(Boolean)];
  $('#exclusions').innerHTML = [...new Set(excluded)].map(name => `<span>${escape(name)}</span>`).join('');
  $('#route-list').innerHTML = data.sections.map(([id, name]) => `<div class="route-item"><span class="section-number">${escape(id.padStart(2,'0'))}</span><span>${escape(name)}</span></div>`).join('');
  $('#feedback-count').textContent = `${state.feedback.length} correcciones registradas en esta demo.`;
}
function render() {
  document.body.classList.toggle('hide-sections', !state.showSections);
  $('#toggle-sections').setAttribute('aria-pressed', String(state.showSections));
  renderList(); renderSuggestions(); renderSettings();
}
function openProduct(id = null) {
  editId = id; selectedProduct = id ? productFor(id) : null;
  const item = id ? state.items.find(i => i.id === id) : null;
  $('#product-form').reset(); $('#product-matches').hidden = true; $('#product-name').setAttribute('aria-expanded','false');
  $('#product-dialog-title').textContent = id ? 'Un pequeño ajuste' : 'Añadir producto';
  $('#product-kicker').textContent = id ? 'TU LISTA, TUS REGLAS' : 'A TU LISTA';
  $('#product-submit').textContent = id ? 'Guardar cambios' : 'Añadir a mi lista';
  $('#product-name').value = item?.name || ''; $('#product-qty').value = item?.quantity || '1 unidad';
  $('#product-section').value = item?.section || '16'; $('#edit-actions').hidden = !item;
  $('#product-dialog').showModal(); setTimeout(() => (id ? $('#product-qty') : $('#product-name')).focus(), 20);
}
function suggest(id) {
  if (state.items.some(i => i.id === id)) { notify('Ya está en tu lista. Puedes ajustar su cantidad.'); return; }
  const p = productFor(id); addItem(state, p, p.quantity, 'suggestion'); record('suggestion-added', p);
  const saved = save(); render(); if (saved) notify(`${p.name}: añadido a tu lista`);
}
function have(id) {
  const item = productFor(id); record('still-have', item);
  if (!state.snoozed.includes(id)) state.snoozed.push(id);
  state.items = state.items.filter(i => i.id !== id);
  const saved = save(); render(); if (saved) notify('Anotado: todavía tienes. Se aparta de esta compra.');
}
function openDates() { $('#trip-date').value = state.tripDate; $('#next-date').value = state.nextDate; $('#next-date').min = plusDays(state.tripDate, 1); $('#next-date').setCustomValidity(''); $('#dates-dialog').showModal(); }
function closeDialog(event) { event.target.closest('dialog').close(); }
function download() {
  const blob = new Blob([JSON.stringify({ ...state, demo: true, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `compra-clara-${state.tripDate}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bind() {
  document.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.view) switchView(b.dataset.view);
    if (b.classList.contains('add-open')) openProduct();
    if (b.classList.contains('close-dialog')) closeDialog(event);
    if (b.dataset.filter) { filter = b.dataset.filter; $$('[data-filter]').forEach(el => { const selected = el === b; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); }); renderList(); }
    if (b.dataset.toggle) { const item = state.items.find(i => i.id === b.dataset.toggle); item.done = !item.done; save(); render(); }
    if (b.dataset.edit) openProduct(b.dataset.edit);
    if (b.dataset.suggest) suggest(b.dataset.suggest);
    if (b.dataset.have) have(b.dataset.have);
    if (b.dataset.choose) {
      selectedProduct = productFor(b.dataset.choose); $('#product-name').value = selectedProduct.name; $('#product-qty').value = selectedProduct.quantity; $('#product-section').value = selectedProduct.section;
      $('#product-matches').hidden = true; $('#product-name').setAttribute('aria-expanded','false'); $('#product-qty').focus();
    }
  });
  $('.brand').addEventListener('click', event => { event.preventDefault(); switchView('lista'); });
  $('#product-name').addEventListener('input', () => {
    selectedProduct = null; const query = normalize($('#product-name').value);
    const matches = query.length ? products().filter(p => !state.excludedIds.includes(p.id) && [p.name, ...(p.aliases || [])].some(n => normalize(n).includes(query))).slice(0,5) : [];
    $('#product-matches').innerHTML = matches.map(p => `<button type="button" data-choose="${escape(p.id)}"><span>${escape(p.name)}</span><small>Sección ${escape(p.section)}</small></button>`).join('');
    $('#product-matches').hidden = !matches.length; $('#product-name').setAttribute('aria-expanded', String(!!matches.length));
  });
  $('#product-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('#product-name').value.trim(), quantity = $('#product-qty').value.trim(), section = $('#product-section').value;
    if (!name || !quantity) { notify('Escribe un producto y una cantidad.', true); return; }
    if (data.excluded.some(n => normalize(n) === normalize(name))) { notify('Ese producto está excluido de tus compras.', true); return; }
    if (editId) {
      const item = state.items.find(i => i.id === editId); if (!item) return;
      const duplicate = state.items.find(i => i.id !== editId && normalize(i.name) === normalize(name));
      if (duplicate) { notify('Ese producto ya está en otra fila. Ajusta allí su cantidad.', true); return; }
      record('edited', item, { before: { name: item.name, quantity: item.quantity, section: item.section }, after: { name, quantity, section } }); Object.assign(item, { name, quantity, section });
    } else {
      const known = selectedProduct || products().find(p => [p.name, ...(p.aliases || [])].some(n => normalize(n) === normalize(name)));
      if (known && state.excludedIds.includes(known.id)) { notify('Lo habías marcado como «Ya no lo compro». Restablece la demo para recuperarlo.', true); return; }
      const p = known ? { ...known, name: known.name, section: selectedProduct ? section : known.section } : { id: `custom-${crypto.randomUUID()}`, name, section };
      addItem(state, p, quantity, 'manual'); record('manual-added', p, { quantity });
    }
    const saved = save(); render(); $('#product-dialog').close(); if (saved) notify(editId ? 'Cambios guardados' : 'Producto añadido a tu lista');
  });
  $('#have-product').addEventListener('click', () => { have(editId); $('#product-dialog').close(); });
  $('#remove-product').addEventListener('click', () => { const item = state.items.find(i => i.id === editId); record('removed-from-list', item); state.items = state.items.filter(i => i.id !== editId); const saved = save(); render(); $('#product-dialog').close(); if (saved) notify('Retirado de esta lista'); });
  $('#exclude-product').addEventListener('click', () => {
    const item = state.items.find(i => i.id === editId); if (!confirm(`¿Dejar de proponer «${item.name}»? También se quitará de esta lista.`)) return;
    record('no-longer-buy', item); if (!state.excludedIds.includes(item.id)) state.excludedIds.push(item.id); state.items = state.items.filter(i => i.id !== item.id); const saved = save(); render(); $('#product-dialog').close(); if (saved) notify('Anotado: ya no se propondrá este producto');
  });
  $('#date-button').addEventListener('click', openDates); $('#next-trip-button').addEventListener('click', openDates);
  $('#trip-date').addEventListener('change', () => { if ($('#trip-date').value) $('#next-date').min = plusDays($('#trip-date').value,1); $('#next-date').setCustomValidity(''); });
  $('#next-date').addEventListener('change', () => $('#next-date').setCustomValidity(''));
  $('#dates-form').addEventListener('submit', event => {
    event.preventDefault(); if ($('#next-date').value <= $('#trip-date').value) { $('#next-date').setCustomValidity('La siguiente visita debe ser posterior a esta compra.'); $('#next-date').reportValidity(); return; }
    state.tripDate = $('#trip-date').value; state.nextDate = $('#next-date').value; const saved = save(); renderList(); $('#dates-dialog').close(); if (saved) notify('Fechas guardadas');
  });
  $('#copy-list').addEventListener('click', async () => {
    const text = listText(state, products()); if (!text) { notify('No quedan productos pendientes para copiar.'); return; }
    try { await navigator.clipboard.writeText(text); notify('Lista pendiente copiada, por orden de sección'); }
    catch { $('#copy-text').value = text; $('#copy-dialog').showModal(); $('#copy-text').select(); }
  });
  $('#clear-done').addEventListener('click', () => { const n = state.items.filter(i => i.done).length; if (!confirm(`¿Retirar ${n} productos comprados de esta lista?`)) return; state.items.filter(i => i.done).forEach(i => { record('purchased', i, { quantity: i.quantity }); if (!state.snoozed.includes(i.id)) state.snoozed.push(i.id); }); state.items = state.items.filter(i => !i.done); save(); render(); });
  $('#add-all').addEventListener('click', () => {
    const pending = availableSuggestions(data, state).filter(s => !state.items.some(i => i.id === s.id));
    pending.forEach(s => { const p = productFor(s.id); addItem(state, p, p.quantity, 'suggestion'); record('suggestion-added', p); }); const saved = save(); render(); if (saved) notify(`${pending.length} propuestas añadidas. Revisa sus cantidades.`);
  });
  $('#restore-suggestions').addEventListener('click', () => { state.snoozed = []; save(); render(); });
  $('#toggle-sections').addEventListener('click', () => {
    state.showSections = !state.showSections;
    save(); render();
  });
  $('#export-data').addEventListener('click', download);
  $('#reset-demo').addEventListener('click', () => { if (!confirm('¿Volver a los datos iniciales de la demo? Se borrarán la lista y las correcciones de este navegador. Puedes descargar una copia antes.')) return; state = makeState(); save(); render(); notify('Demo restablecida'); });
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
  window.addEventListener('storage', event => { if (event.key === storageKey) notify('La lista ha cambiado en otra pestaña. Descarga tus cambios antes de recargar.', true); });
}
try {
  const response = await fetch('./data.json'); if (!response.ok) throw new Error('Data unavailable'); data = await response.json();
  let raw = null; try { raw = localStorage.getItem(storageKey); } catch { canSave = false; }
  if (raw) { try { const parsed = JSON.parse(raw); if (validState(parsed, data)) state = parsed; else notify('La copia guardada no es válida. Se muestran los datos iniciales.', true); } catch { notify('No se pudo recuperar la copia guardada.',true); } }
  state ||= makeState();
  state.showSections = state.showSections === true;
  $('#product-section').innerHTML = data.sections.map(([id, name]) => `<option value="${escape(id)}">${escape(id)} · ${escape(name)}</option>`).join('');
  bind(); render(); switchView(location.hash.slice(1));
  if (!canSave) { $('#save-status').textContent = 'Sin guardado local disponible'; notify('Este navegador no permite guardar. Puedes descargar una copia.', true); }
} catch (error) {
  $('#shopping-list').innerHTML = '<div class="empty-state"><h3>No se pudo abrir la demo</h3><p>Comprueba tu conexión y vuelve a cargar esta página.</p></div>';
  notify('No se pudieron cargar los datos de ejemplo. Vuelve a cargar la página.', true);
}

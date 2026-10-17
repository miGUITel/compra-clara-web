import { normalize, sortedItems, addItem, availableSuggestions, listText, validState } from './logic.mjs?v=0.3';
import { GithubStore } from './github-store.mjs?v=0.3.1';
import { PrivateSession } from './private-session.mjs?v=0.3.1';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const storageKey = 'compra-clara-mobile-test-v1';
let demoData, session = null, connecting = false, pendingRemote = null, syncError = '';
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
  if (session) { session.changed(state); renderConnection(); return false; }
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
  $('#sidebar-suggestions').innerHTML = pending.slice(0,3).map(s => { const p = productFor(s.id); return `<div class="mini-suggestion"><span class="food-icon" aria-hidden="true">${escape(p.emoji || '🛒')}</span><div><strong>${escape(p.name)}</strong><small>${escape(s.short)}</small></div><button class="mini-add" data-suggest="${escape(s.id)}" aria-label="Añadir ${escape(p.name)}">${icon('plus')}</button></div>`; }).join('') || '<p class="suggestion-note">Todas revisadas. Tu lista está lista para salir.</p>';
  $('#proposal-grid').innerHTML = suggestions.map(s => {
    const p = productFor(s.id), inList = state.items.some(i => i.id === p.id);
    return `<article class="proposal-card"><div class="proposal-top"><span class="proposal-emoji" aria-hidden="true">${escape(p.emoji || '🛒')}</span><span class="proposal-section">Sección ${escape(p.section)}</span></div><h2>${escape(p.name)}</h2><p class="proposal-quantity">${escape(p.quantity || 'Indica cantidad')} · Editable</p><p class="proposal-reason">${escape(s.reason)}</p><div class="proposal-actions">${inList ? `<span class="added-label">${icon('check')} Ya está en tu lista</span><button class="have-button" data-edit="${escape(p.id)}">Editar</button>` : `<button class="button secondary" data-suggest="${escape(p.id)}">${icon('plus')} Añadir</button><button class="have-button" data-have="${escape(p.id)}">Tengo</button>`}</div></article>`;
  }).join('') || '<div class="empty-state"><h3>Todas las propuestas revisadas</h3><p>Puedes volver a mostrar las que has apartado.</p></div>';
  $('#add-all').disabled = !pending.some(s => productFor(s.id).quantity);
  $('#snoozed-area').hidden = !state.snoozed.length;
  $('#snoozed-label').textContent = `${state.snoozed.length} propuestas apartadas porque todavía tienes.`;
}
function renderSettings() {
  const rules = data.rules || [
    { title:'Añade y marca productos', detail:'En la demo, la lista se guarda en este navegador.' },
    { title:'Muestra u oculta secciones', detail:'El botón Secciones conserva el orden del supermercado.' },
    { title:'Conecta tus datos', detail:'Usa el botón Conectar para cargar el repositorio privado.' }
  ];
  $('#rules-title').textContent = session ? 'Tus preferencias' : 'Pruebas en el móvil';
  $('#rules-summary').textContent = session ? (data.products.length + ' productos · Fuente: ' + (data.source.referenceDate || 'revisión previa')) : 'Productos ficticios para probar la interfaz.';
  $('#rule-list').innerHTML = rules.map((r,i) => '<li><span class="rule-icon">' + String(i+1).padStart(2,'0') + '</span><div><strong>' + escape(r.title) + '</strong><small>' + escape(r.detail) + '</small></div></li>').join('');
  $('#proposal-notice').textContent = data.notice || 'Estas propuestas son ficticias. Sirven para probar la app y no se basan en tu historial de compras.';
  $('.suggestion-note').textContent = session ? 'Candidatos revisados; comprueba lo que tienes.' : 'Ejemplos de reposición; comprueba lo que tienes.';
  $('#details-title').textContent = session ? 'Tu lista compartida' : 'Acerca de la demo';
  $('#details-copy').textContent = session ? 'Los cambios quedan pendientes hasta que pulses Guardar en GitHub. En otro dispositivo, conecta y pulsa Actualizar para recuperar la última lista. Recargar o cerrar termina esta sesión y descarta los cambios que no hayas guardado.' : 'La demo utiliza productos ficticios y conserva sus cambios en este navegador. Conecta para usar tus datos privados.';
  $('#reset-demo').hidden = !!session;
  $('#data-footer').textContent = session ? 'Datos privados · GitHub · v0.3' : 'Demo 0.3 · Guardado en este dispositivo';
  const excluded = [...data.excluded, ...state.excludedIds.map(id => productFor(id)?.name || state.feedback.find(f => f.productId === id)?.name).filter(Boolean)];
  $('#exclusions').innerHTML = [...new Set(excluded)].map(name => `<span>${escape(name)}</span>`).join('');
  $('#route-list').innerHTML = data.sections.map(([id, name]) => `<div class="route-item"><span class="section-number">${escape(id.padStart(2,'0'))}</span><span>${escape(name)}</span></div>`).join('');
  $('#feedback-count').textContent = `${state.feedback.length} correcciones registradas en esta lista.`;
}
function render() {
  $('#product-section').innerHTML = data.sections.map(([id,name]) => `<option value="${escape(id)}">${escape(id)} · ${escape(name)}</option>`).join('');
  document.body.classList.toggle('hide-sections', !state.showSections);
  $('#toggle-sections').setAttribute('aria-pressed', String(state.showSections));
  renderList(); renderSuggestions(); renderSettings(); renderConnection();
}
function openProduct(id = null) {
  editId = id; selectedProduct = id ? productFor(id) : null;
  const item = id ? state.items.find(i => i.id === id) : null;
  $('#product-form').reset(); $('#product-matches').hidden = true; $('#product-name').setAttribute('aria-expanded','false');
  $('#product-dialog-title').textContent = id ? 'Un pequeño ajuste' : 'Añadir producto';
  $('#product-kicker').textContent = id ? 'TU LISTA, TUS REGLAS' : 'A TU LISTA';
  $('#product-submit').textContent = id ? 'Guardar cambios' : 'Añadir a mi lista';
  $('#product-name').value = item?.name || ''; $('#product-qty').value = item?.quantity || (session ? '' : '1 unidad');
  $('#product-section').value = item?.section || '16'; $('#edit-actions').hidden = !item;
  $('#product-dialog').showModal(); setTimeout(() => (id ? $('#product-qty') : $('#product-name')).focus(), 20);
}
function suggest(id) {
  if (state.items.some(i => i.id === id)) { notify('Ya está en tu lista. Puedes ajustar su cantidad.'); return; }
  const p = productFor(id);
  if (!p.quantity) {
    openProduct(); selectedProduct = p;
    $('#product-name').value = p.name; $('#product-qty').value = ''; $('#product-section').value = p.section;
    $('#product-qty').focus(); return;
  }
  addItem(state, p, p.quantity, 'suggestion'); record('suggestion-added', p);
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
  const blob = new Blob([JSON.stringify({ ...state, demo: !session, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `compra-clara-${state.tripDate}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bind() {
  document.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if ((connecting || session?.busy) && !b.dataset.view && !b.classList.contains('close-dialog')) return;
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
    event.preventDefault(); if (connecting || session?.busy) return; const name = $('#product-name').value.trim(), quantity = $('#product-qty').value.trim(), section = $('#product-section').value;
    if (!name || !quantity) { notify('Escribe un producto y una cantidad.', true); return; }
    if (data.excluded.some(n => normalize(n) === normalize(name))) { notify('Ese producto está excluido de tus compras.', true); return; }
    if (editId) {
      const item = state.items.find(i => i.id === editId); if (!item) return;
      const duplicate = state.items.find(i => i.id !== editId && normalize(i.name) === normalize(name));
      if (duplicate) { notify('Ese producto ya está en otra fila. Ajusta allí su cantidad.', true); return; }
      record('edited', item, { before: { name: item.name, quantity: item.quantity, section: item.section }, after: { name, quantity, section } }); Object.assign(item, { name, quantity, section });
    } else {
      const known = selectedProduct || products().find(p => [p.name, ...(p.aliases || [])].some(n => normalize(n) === normalize(name)));
      if (known && state.excludedIds.includes(known.id)) { notify('Lo habías marcado como «Ya no lo compro». Puedes revisar tus exclusiones en Preferencias.', true); return; }
      if (session && !known && state.items.some(i => normalize(i.name) === normalize(name))) { notify('Ese producto ya está en la lista. Edita su cantidad.', true); return; }
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
    event.preventDefault(); if (connecting || session?.busy) return; if ($('#next-date').value <= $('#trip-date').value) { $('#next-date').setCustomValidity('La siguiente visita debe ser posterior a esta compra.'); $('#next-date').reportValidity(); return; }
    state.tripDate = $('#trip-date').value; state.nextDate = $('#next-date').value; const saved = save(); renderList(); $('#dates-dialog').close(); if (saved) notify('Fechas guardadas');
  });
  $('#copy-list').addEventListener('click', async () => {
    const text = listText(state, products()); if (!text) { notify('No quedan productos pendientes para copiar.'); return; }
    try { await navigator.clipboard.writeText(text); notify('Lista pendiente copiada, por orden de sección'); }
    catch { $('#copy-text').value = text; $('#copy-dialog').showModal(); $('#copy-text').select(); }
  });
  $('#clear-done').addEventListener('click', () => { const n = state.items.filter(i => i.done).length; if (!confirm(`¿Retirar ${n} productos comprados de esta lista?`)) return; state.items.filter(i => i.done).forEach(i => { record('purchased', i, { quantity: i.quantity }); if (!state.snoozed.includes(i.id)) state.snoozed.push(i.id); }); state.items = state.items.filter(i => !i.done); save(); render(); });
  $('#add-all').addEventListener('click', () => {
    const pending = availableSuggestions(data, state).filter(s => !state.items.some(i => i.id === s.id) && productFor(s.id).quantity);
    pending.forEach(s => { const p = productFor(s.id); addItem(state, p, p.quantity, 'suggestion'); record('suggestion-added', p); }); const saved = save(); render(); if (saved) notify(`${pending.length} propuestas añadidas. Revisa sus cantidades.`);
  });
  $('#restore-suggestions').addEventListener('click', () => { state.snoozed = []; save(); render(); });
  $('#toggle-sections').addEventListener('click', () => {
    state.showSections = !state.showSections;
    save(); render();
  });
  $('#export-data').addEventListener('click', download);
  $('#reset-demo').addEventListener('click', () => { if (!confirm('¿Volver a los datos iniciales de la demo? Se borrarán la lista y las correcciones de este navegador. Puedes descargar una copia antes.')) return; state = makeState(); save(); render(); notify('Demo restablecida'); });
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (connecting || session?.busy) return; if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
  window.addEventListener('beforeunload', event => { if (session?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => { if (!session && event.key === storageKey) notify('La lista ha cambiado en otra pestaña. Descarga tus cambios antes de recargar.', true); });
}
let demoStateCache = null;
function renderConnection() {
  const busy = connecting || !!session?.busy;
  $('#app-main').inert = busy;
  $('#app-main').setAttribute('aria-busy', String(busy));
  $('#connection-open').disabled = busy;
  $('#connection-open').textContent = session ? 'Conectado' : 'Conectar';
  $('#connect-submit').disabled = busy;
  $('#connect-submit').textContent = connecting ? 'Conectando…' : 'Conectar';
  $('#github-token').disabled = busy;
  $$('#connect-dialog .close-dialog').forEach(b => { b.disabled = busy; });
  $('#connect-settings').hidden = !!session;
  $('#disconnect-github').hidden = !session;
  $('#sync-panel').hidden = !session;
  $('#connection-detail').textContent = session ? 'Conectado a miGUITel/compra-clara-datos. Guardar en GitHub publica la lista para tus otros dispositivos.' : 'Conecta para cargar tu catálogo, preferencias y lista compartida desde el repositorio privado.';
  if (!session) return;
  $('#save-github').disabled = busy || !session.dirty || session.blocked;
  $('#refresh-github').disabled = busy;
  $('#refresh-github').textContent = session.blocked || session.dirty ? 'Revisar GitHub' : 'Actualizar';
  const message = busy ? 'Consultando GitHub…' : syncError || (session.blocked ? 'Guardado bloqueado: revisa GitHub.' : session.dirty ? 'Tienes cambios sin guardar.' : 'Lista guardada en GitHub.');
  $('#sync-status').textContent = message;
  $('#sync-panel').classList.toggle('sync-warning', !!syncError || session.blocked);
  $('#save-status').textContent = session.dirty ? 'Cambios pendientes en esta sesión' : 'Guardado en GitHub';
}
function selectSessionData() {
  data = session.data; state = session.state; state.showSections = state.showSections === true;
  render();
}
function reviewMarkup(value) {
  return sortedItems(value, pendingRemote.data.products).map(i => '<li>' + (i.done ? '✓ ' : '') + escape(i.name) + ' — ' + escape(i.quantity) + '</li>').join('') || '<li>Lista vacía</li>';
}
async function refreshPrivate() {
  if (!session || session.busy) return;
  syncError = '';
  try {
    const reading = session.review(); renderConnection();
    const remote = await reading;
    if (session.dirty || session.blocked) {
      pendingRemote = remote;
      $('#local-review').innerHTML = reviewMarkup(state);
      $('#remote-review').innerHTML = reviewMarkup(remote.state);
      $('#local-review-meta').textContent = `Compra: ${state.tripDate} · Siguiente visita: ${state.nextDate}`;
      $('#remote-review-meta').textContent = `Compra: ${remote.state.tripDate} · Siguiente visita: ${remote.state.nextDate}`;
      $('#review-dialog').showModal();
    } else { session.accept(remote); selectSessionData(); notify('Lista y referencias actualizadas desde GitHub'); }
  } catch (error) { syncError = error.message; notify(syncError, true); }
  finally { renderConnection(); }
}
function bindConnection() {
  const open = () => {
    if (session) { switchView('preferencias'); return; }
    $('#connect-error').hidden = true; $('#github-token').value = '';
    $('#connect-dialog').showModal(); $('#github-token').focus();
  };
  $('#connection-open').addEventListener('click', open);
  $('#connect-settings').addEventListener('click', open);
  $('#connect-dialog').addEventListener('cancel', event => { if (connecting) event.preventDefault(); });
  $('#connect-dialog').addEventListener('close', () => { $('#github-token').value = ''; });
  $('#connect-form').addEventListener('submit', async event => {
    event.preventDefault(); if (connecting || session) return;
    let token = $('#github-token').value.trim();
    $('#github-token').value = '';
    if (!token) { $('#connect-error').textContent = 'Introduce un token de GitHub.'; $('#connect-error').hidden = false; return; }
    const candidate = new PrivateSession(new GithubStore({ token })); token = '';
    connecting = true; $('#connect-error').hidden = true; renderConnection();
    try {
      await candidate.connect();
      demoStateCache = JSON.parse(JSON.stringify(state));
      session = candidate; syncError = ''; filter = 'all';
      $$('[data-filter]').forEach(b => { const selected = b.dataset.filter === 'all'; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); });
      selectSessionData(); $('#connect-dialog').close(); switchView('lista');
      notify('Datos privados cargados desde GitHub');
    } catch (error) {
      candidate.dispose(); $('#connect-error').textContent = error.message; $('#connect-error').hidden = false;
    } finally { connecting = false; renderConnection(); }
  });
  $('#save-github').addEventListener('click', async () => {
    if (!session || session.busy || !session.dirty || session.blocked) return;
    syncError = '';
    try {
      const saving = session.save(); renderConnection(); await saving;
      state = session.state; render(); notify('Lista guardada y verificada en GitHub');
    } catch (error) { syncError = error.message; notify(syncError, true); }
    finally { renderConnection(); }
  });
  $('#refresh-github').addEventListener('click', refreshPrivate);
  $('#review-download').addEventListener('click', download);
  $('#use-remote').addEventListener('click', () => {
    if (!pendingRemote || !session || session.busy) return;
    session.accept(pendingRemote); pendingRemote = null; syncError = '';
    selectSessionData(); $('#review-dialog').close(); notify('Versión de GitHub cargada');
  });
  $('#review-dialog').addEventListener('close', () => { pendingRemote = null; $('#local-review').replaceChildren(); $('#remote-review').replaceChildren(); $('#local-review-meta').textContent = ''; $('#remote-review-meta').textContent = ''; });
  $('#disconnect-github').addEventListener('click', () => {
    if (!session || session.busy) return;
    if (session.dirty && !confirm('Hay cambios sin guardar. Cancela y descarga una copia si quieres conservarlos. ¿Desconectar y descartar este borrador?')) return;
    session.dispose(); session = null; pendingRemote = null; selectedProduct = null; editId = null; syncError = '';
    data = demoData; state = demoStateCache || makeState(); demoStateCache = null;
    $('#product-form').reset(); $('#dates-form').reset(); $('#copy-text').value = '';
    $('#product-matches').replaceChildren(); $('#product-matches').hidden = true;
    $$('dialog').forEach(d => { if (d.open) d.close(); });
    render(); $('#save-status').textContent = 'Demo guardada en este dispositivo';
    notify('Desconectado. Se muestran de nuevo los datos de ejemplo.');
  });
}
try {
  const response = await fetch('./data.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Data unavailable'); data = await response.json(); demoData = data;
  let raw = null; try { raw = localStorage.getItem(storageKey); } catch { canSave = false; }
  if (raw) { try { const parsed = JSON.parse(raw); if (validState(parsed, data)) state = parsed; else notify('La copia guardada no es válida. Se muestran los datos iniciales.', true); } catch { notify('No se pudo recuperar la copia guardada.',true); } }
  state ||= makeState();
  state.showSections = state.showSections === true;
  $('#product-section').innerHTML = data.sections.map(([id, name]) => `<option value="${escape(id)}">${escape(id)} · ${escape(name)}</option>`).join('');
  bind(); bindConnection(); render(); switchView(location.hash.slice(1));
  if (!canSave) { $('#save-status').textContent = 'Sin guardado local disponible'; notify('Este navegador no permite guardar. Puedes descargar una copia.', true); }
} catch (error) {
  $('#shopping-list').innerHTML = '<div class="empty-state"><h3>No se pudo abrir la demo</h3><p>Comprueba tu conexión y vuelve a cargar esta página.</p></div>';
  notify('No se pudieron cargar los datos de ejemplo. Vuelve a cargar la página.', true);
}

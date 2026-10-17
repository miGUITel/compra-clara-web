export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function sortedItems(state, products) {
  const byId = new Map(products.map(p => [p.id, p]));
  return state.items.map(item => ({ ...byId.get(item.id), ...item }))
    .sort((a, b) => Number(a.section) - Number(b.section) || a.name.localeCompare(b.name, 'es'));
}
export function combineQuantities(first, second) {
  const parse = value => String(value).trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  const a = parse(first), b = parse(second);
  if (a && b && normalize(a[2]) === normalize(b[2])) {
    const quantity = Math.round((Number(a[1].replace(',', '.')) + Number(b[1].replace(',', '.'))) * 1000) / 1000;
    return `${String(quantity).replace('.', ',')}${a[2] ? ' ' + a[2] : ''}`;
  }
  return first === second ? `${first} + ${second}` : `${first} + ${second}`;
}
export function addItem(state, product, quantity, source = 'manual') {
  const existing = state.items.find(i => i.id === product.id || normalize(i.name) === normalize(product.name));
  if (existing) {
    existing.quantity = combineQuantities(existing.quantity, quantity);
    existing.done = false;
    return existing;
  }
  const item = { id: product.id, name: product.name, section: product.section, quantity, done: false, source };
  state.items.push(item);
  return item;
}
export function availableSuggestions(data, state) {
  return data.suggestions.filter(s => !state.excludedIds.includes(s.id) && !state.snoozed.includes(s.id));
}
export function listText(state, products) {
  return sortedItems(state, products).filter(i => !i.done).map(i => `${i.name} - ${i.quantity}`).join('\n');
}
export function validState(value, data) {
  const sections = new Set(data.sections.map(s => s[0]));
  const date = str => typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(Date.parse(str));
  return value?.schemaVersion === 1 && (value.showSections === undefined || typeof value.showSections === 'boolean') && Array.isArray(value.items)
    && value.items.every(i => i && typeof i.id === 'string' && typeof i.name === 'string' && i.name.trim() && i.name.length <= 100 && sections.has(i.section) && typeof i.quantity === 'string' && i.quantity.length <= 100 && typeof i.done === 'boolean')
    && new Set(value.items.map(i => i.id)).size === value.items.length
    && ['snoozed','excludedIds','feedback'].every(k => Array.isArray(value[k]))
    && ['snoozed','excludedIds'].every(k => value[k].every(id => typeof id === 'string'))
    && date(value.tripDate) && date(value.nextDate) && value.nextDate > value.tripDate;
}

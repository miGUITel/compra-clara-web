import { validState } from './logic.mjs?v=0.4.1';
import { validatePlanner, validatePlanningState } from './planner.mjs?v=0.4.1';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 1000) => typeof v === 'string' && v.length <= max;
const nonempty = (v, max = 1000) => text(v,max) && !!v.trim();
const unique = values => new Set(values).size === values.length;
export const clone = value => JSON.parse(JSON.stringify(value));
export function assembleData(catalog, rules, proposals) {
  if (!object(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.sections) || !catalog.sections.length
    || !catalog.sections.every(s => Array.isArray(s) && s.length === 2 && /^\d+(?:\.\d+)?$/.test(s[0]) && nonempty(s[1],100))
    || !unique(catalog.sections.map(s=>s[0]))) throw new Error('El catálogo tiene secciones no válidas.');
  const sections = new Set(catalog.sections.map(s=>s[0]));
  if (!Array.isArray(catalog.products) || !catalog.products.length || catalog.products.length > 2000
    || !catalog.products.every(p => object(p) && nonempty(p.id,100) && nonempty(p.name,100) && sections.has(p.section)
      && text(p.quantity,100) && text(p.emoji,30) && (p.aliases === undefined || Array.isArray(p.aliases) && p.aliases.every(a=>nonempty(a,100))))
    || !unique(catalog.products.map(p=>p.id))) throw new Error('El catálogo tiene productos no válidos.');
  const ids = new Set(catalog.products.map(p=>p.id));
  if (!object(rules) || rules.schemaVersion !== 1 || !Array.isArray(rules.excluded) || !rules.excluded.every(n=>nonempty(n,100))
    || !Array.isArray(rules.excludedIds) || !rules.excludedIds.every(id=>nonempty(id,100))
    || !Array.isArray(rules.displayRules) || !rules.displayRules.every(r=>object(r) && nonempty(r.title,150) && text(r.detail,1000))) throw new Error('Las reglas no son válidas.');
  if (catalog.products.some(p=>rules.excludedIds.includes(p.id))) throw new Error('Un identificador retirado aparece activo en el catálogo.');
  if (!object(proposals) || proposals.schemaVersion !== 1 || !Array.isArray(proposals.suggestions)
    || !proposals.suggestions.every(s=>object(s) && ids.has(s.id) && !rules.excludedIds.includes(s.id) && nonempty(s.reason,2000) && text(s.short,200))
    || !unique(proposals.suggestions.map(s=>s.id)) || !nonempty(proposals.notice,2000)) throw new Error('Las propuestas no son válidas.');
  return { schemaVersion:1, sections:clone(catalog.sections), products:clone(catalog.products), initialList:[],
    excluded:clone(rules.excluded), reservedIds:clone(rules.excludedIds), suggestions:clone(proposals.suggestions),
    rules:clone(rules.displayRules), notice:proposals.notice, source:clone(catalog.source || {}),
    reviewDate:proposals.reviewDate || '', ticketsCutoff:proposals.ticketsCutoff || '',
    planner:validatePlanner(proposals.planner,catalog.products,rules.excludedIds) };
}
export function validatePrivateState(state, data) {
  if (!validState(state,data) || !validatePlanningState(state) || state.listId !== 'compra-principal' || state.demo === true
    || state.items.some(i=>data.reservedIds.includes(i.id))
    || state.feedback.length > 20000 || !state.feedback.every(f=>object(f) && nonempty(f.type,100) && nonempty(f.productId,100) && text(f.name,100) && nonempty(f.date,50))) {
    throw new Error('La lista privada no tiene un formato válido. Se conserva el borrador anterior.');
  }
  return state;
}

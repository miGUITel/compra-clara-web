import { normalize } from './logic.mjs?v=0.4';

const DAY = 86400000;
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;
export function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + 'T12:00:00Z'))
    && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
}
const stamp = day => Date.parse(day + 'T12:00:00Z');
export const weekday = day => new Date(day + 'T12:00:00Z').getUTCDay();
export function addDays(day, count) {
  if (!isDay(day) || !Number.isInteger(count)) throw new Error('Fecha no válida.');
  return new Date(stamp(day) + count * DAY).toISOString().slice(0,10);
}
export const monday = day => addDays(day, -((weekday(day) + 6) % 7));
export function nextWeekday(day, target, includeToday = true) {
  const offset = (target - weekday(day) + 7) % 7;
  return addDays(day, offset || (includeToday ? 0 : 7));
}
export function nextVisit(day) {
  const tuesday = nextWeekday(day,2,false), friday = nextWeekday(day,5,false);
  return tuesday < friday ? tuesday : friday;
}
export function cycleWeek(day, anchor) {
  const elapsed = Math.round((stamp(monday(day)) - stamp(monday(anchor.date))) / (7 * DAY));
  return ((anchor.week - 1 + elapsed) % 4 + 4) % 4 + 1;
}

// Planning data is optional so older private documents remain readable.
export function validatePlanner(planner, products, reservedIds = []) {
  if (planner === undefined) return undefined;
  const ids = new Set(products.map(p=>p.id));
  const entry = value => object(value) && ids.has(value.id) && !reservedIds.includes(value.id)
    && text(value.reason) && !!value.reason.trim()
    && (value.quantity === undefined || text(value.quantity,100));
  if (!object(planner) || planner.version !== 1 || !isDay(planner.anchor?.date)
    || weekday(planner.anchor.date) !== 1 || !Number.isInteger(planner.anchor.week)
    || planner.anchor.week < 1 || planner.anchor.week > 4 || !text(planner.notice)
    || !Array.isArray(planner.templates) || planner.templates.length !== 8
    || !planner.templates.every(t=>object(t) && Number.isInteger(t.week) && t.week>=1 && t.week<=4
      && [2,5].includes(t.day) && text(t.label,150) && !!t.label.trim()
      && Array.isArray(t.entries) && t.entries.length<=300 && t.entries.every(entry)
      && new Set(t.entries.map(e=>e.id)).size===t.entries.length
      && Array.isArray(t.notes) && t.notes.every(n=>text(n)))
    || new Set(planner.templates.map(t=>`${t.week}-${t.day}`)).size !== 8
    || !Array.isArray(planner.habits) || !planner.habits.every(h=>entry(h)
      && ['habit','replenishment'].includes(h.kind)
      && (h.intervalDays===undefined || Number.isInteger(h.intervalDays)&&h.intervalDays>0&&h.intervalDays<=365))
    || new Set(planner.habits.map(h=>h.id)).size!==planner.habits.length) {
    throw new Error('Las ocho compras base no tienen un formato válido. Se conserva la lista anterior.');
  }
  return clone(planner);
}
export function validatePlanningState(state) {
  if (state.cycleAnchor !== undefined && (!object(state.cycleAnchor) || !isDay(state.cycleAnchor.date)
    || weekday(state.cycleAnchor.date)!==1 || !Number.isInteger(state.cycleAnchor.week)
    || state.cycleAnchor.week<1 || state.cycleAnchor.week>4)) return false;
  if (state.deferredUntil !== undefined && (!object(state.deferredUntil)
    || Object.entries(state.deferredUntil).length>2000
    || !Object.entries(state.deferredUntil).every(([id,day])=>id.length>0&&id.length<=100&&isDay(day)))) return false;
  if (state.plan !== undefined && (!object(state.plan) || state.plan.version!==1
    || !isDay(state.plan.tripDate) || !isDay(state.plan.nextDate) || state.plan.nextDate<=state.plan.tripDate
    || !Number.isInteger(state.plan.week) || state.plan.week<1 || state.plan.week>4
    || !text(state.plan.generatedAt,50) || !Array.isArray(state.plan.templates)
    || !state.plan.templates.every(t=>text(t,150)))) return false;
  return true;
}
function purchasedOn(state,id) {
  let latest = '';
  for (const event of state.feedback || []) {
    if (event.productId!==id) continue;
    if (event.type==='purchase-unmarked') latest='';
    if (['purchased','purchase-marked','bought-elsewhere'].includes(event.type)) {
      const day = event.purchaseDate || event.tripDate || event.date?.slice(0,10);
      if (isDay(day) && day>latest) latest=day;
    }
  }
  return latest;
}
function baseBefore(day) {
  let date=day;
  while (![2,5].includes(weekday(date))) date=addDays(date,-1);
  return date;
}
export function proposePurchase(data, state, options) {
  const planner=data.planner;
  if (!planner) throw new Error('No hay compras base disponibles. Conecta o actualiza los datos de GitHub.');
  const {tripDate,nextDate,week,retireDone=false}=options;
  if (!isDay(tripDate)||!isDay(nextDate)||nextDate<=tripDate
    || (stamp(nextDate)-stamp(tripDate))/DAY>28) throw new Error('Elige una siguiente visita entre 1 y 28 días después.');
  const anchor=week===undefined ? (state.cycleAnchor||planner.anchor) : {date:monday(tripDate),week};
  if (!Number.isInteger(anchor.week)||anchor.week<1||anchor.week>4) throw new Error('Elige una semana de 1 a 4.');
  const byId=new Map(data.products.map(p=>[p.id,p]));
  const candidates=new Map(), templates=[], notes=[];
  const add=(entry,kind,origin)=>{
    const product=byId.get(entry.id);
    if (!product || data.reservedIds?.includes(entry.id) || state.excludedIds.includes(entry.id)
      || (state.deferredUntil?.[entry.id] && state.deferredUntil[entry.id]>=tripDate)
      || (tripDate===state.tripDate && state.snoozed.includes(entry.id))) return;
    const existing=state.items.find(i=>(!retireDone||!i.done)
      && (i.id===entry.id || normalize(i.name)===normalize(product.name)));
    const previous=candidates.get(entry.id);
    const reason=entry.reason+(origin ? ` · ${origin}` : '');
    if (previous) {
      if (!previous.reasons.includes(reason)) previous.reasons.push(reason);
      if (kind==='menu') previous.kind='menu';
      return;
    }
    candidates.set(entry.id,{id:entry.id,name:product.name,section:product.section,
      quantity:entry.quantity ?? product.quantity ?? '',kind,reasons:[reason],
      existing:!!existing,done:!!existing?.done});
  };
  let date=baseBefore(tripDate);
  while (date<nextDate) {
    const w=cycleWeek(date,anchor),d=weekday(date);
    const template=planner.templates.find(t=>t.week===w&&t.day===d);
    templates.push(template.label);
    template.entries.forEach(e=>add(e,'menu',template.label));
    notes.push(...template.notes);
    date=nextVisit(date);
  }
  planner.habits.forEach(h=>{
    const bought=purchasedOn(state,h.id);
    // An interval is a buying pattern, never a stock estimate. It only filters
    // optional habitual/replenishment candidates; menu ingredients stay visible.
    if (h.intervalDays && bought && bought<=tripDate
      && (stamp(nextDate)-stamp(bought))/DAY<h.intervalDays) return;
    add(h,h.kind,'');
  });
  const items=[...candidates.values()].sort((a,b)=>Number(a.section)-Number(b.section)||a.name.localeCompare(b.name,'es'));
  return {tripDate,nextDate,week:cycleWeek(tripDate,anchor),anchor:clone(anchor),retireDone,
    templates:[...new Set(templates)],notes:[...new Set(notes)],items,
    reviewDate:data.reviewDate||'',notice:planner.notice};
}
export function applyPurchase(state, proposal, selectedIds, now=new Date().toISOString()) {
  const result=clone(state),selected=new Set(selectedIds),added=[];
  const record=(type,item,extra={})=>result.feedback.push({type,productId:item.id,name:item.name,date:now,...extra});
  if (proposal.retireDone) {
    result.items.filter(i=>i.done).forEach(i=>record('purchased',i,{quantity:i.quantity,
      tripDate:state.tripDate,purchaseDate:i.boughtOn||state.tripDate}));
    result.items=result.items.filter(i=>!i.done);
  }
  if (result.tripDate!==proposal.tripDate) result.snoozed=[];
  result.tripDate=proposal.tripDate;result.nextDate=proposal.nextDate;
  result.cycleAnchor=clone(proposal.anchor);
  for (const candidate of proposal.items) {
    if (!selected.has(candidate.id) || candidate.existing || result.excludedIds.includes(candidate.id)
      || (result.deferredUntil?.[candidate.id] && result.deferredUntil[candidate.id]>=proposal.tripDate)
      || result.snoozed.includes(candidate.id)
      || result.items.some(i=>i.id===candidate.id||normalize(i.name)===normalize(candidate.name))) continue;
    const item={id:candidate.id,name:candidate.name,section:candidate.section,
      quantity:candidate.quantity||'Por confirmar',needsQuantity:!candidate.quantity,
      done:false,source:'planned',reason:candidate.reasons.join('\n')};
    result.items.push(item);added.push(item);
    record('planned-added',item,{quantity:item.quantity,tripDate:proposal.tripDate});
  }
  result.plan={version:1,tripDate:proposal.tripDate,nextDate:proposal.nextDate,week:proposal.week,
    templates:clone(proposal.templates),generatedAt:now,reviewDate:proposal.reviewDate};
  return {state:result,added};
}

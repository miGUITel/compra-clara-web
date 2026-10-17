import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDay, addDays, monday, cycleWeek, nextVisit, nextWeekday, validatePlanner,
  validatePlanningState, proposePurchase, applyPurchase } from '../docs/planner.mjs?v=0.4';

const fixture=()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../docs/data.json',import.meta.url),'utf8'));
 data.reservedIds=[];
 const state={schemaVersion:1,tripDate:'2026-10-17',nextDate:'2026-10-20',items:[],snoozed:[],excludedIds:[],feedback:[],extension:{keep:true}};
 return {data,state};
};
const options={tripDate:'2026-10-20',nextDate:'2026-10-23'};
test('cycle repeats every four weeks, across months, years and dates before anchor',()=>{
 const anchor={date:'2026-10-12',week:3};
 assert.equal(cycleWeek('2026-10-17',anchor),3);
 assert.equal(cycleWeek('2026-10-20',anchor),4);
 assert.equal(cycleWeek('2026-10-26',anchor),1);
 assert.equal(cycleWeek('2026-10-11',anchor),2);
 assert.equal(cycleWeek('2027-01-04',anchor),3);
 assert.equal(monday('2026-10-25'),'2026-10-19');
 assert.equal(addDays('2026-10-24',2),'2026-10-26');
});
test('presets include today; next visit is strictly later, on Tuesday or Friday',()=>{
 assert.equal(nextWeekday('2026-10-20',2),'2026-10-20');
 assert.equal(nextWeekday('2026-10-20',2,false),'2026-10-27');
 assert.equal(nextVisit('2026-10-20'),'2026-10-23');
 assert.equal(nextVisit('2026-10-23'),'2026-10-27');
 assert.equal(nextVisit('2026-10-24'),'2026-10-27');
});
test('Tuesday base excludes Friday; extending the horizon combines bases without duplicate products',()=>{
 const {data,state}=fixture();
 const normal=proposePurchase(data,state,options);
 assert.deepEqual(normal.templates,['Semana 2 · martes']);
 const long=proposePurchase(data,state,{...options,nextDate:'2026-10-27'});
 assert.deepEqual(long.templates,['Semana 2 · martes','Semana 2 · viernes']);
 assert.equal(new Set(long.items.map(i=>i.id)).size,long.items.length);
});
test('delayed Saturday and Monday use the previous Friday base across a week boundary',()=>{
 const {data,state}=fixture();
 for(const tripDate of ['2026-10-17','2026-10-19']) {
   const p=proposePurchase(data,state,{tripDate,nextDate:'2026-10-20'});
   assert.deepEqual(p.templates,['Semana 1 · viernes']);
 }
});
test('manual cycle correction is used for this purchase and subsequent weeks',()=>{
 const {data,state}=fixture();
 const p=proposePurchase(data,state,{...options,week:4});
 const applied=applyPurchase(state,p,[]).state;
 assert.equal(applied.cycleAnchor.date,'2026-10-19');
 assert.equal(cycleWeek('2026-10-27',applied.cycleAnchor),1);
 assert.deepEqual(proposePurchase(data,applied,{tripDate:'2026-10-27',nextDate:'2026-10-30'}).templates,['Semana 1 · martes']);
});
test('application is idempotent and preserves manual products, quantities, bought flags and extensions',()=>{
 const {data,state}=fixture();
 state.items=[{...data.products.find(p=>p.id==='ejemplo-garbanzos'),quantity:'7 botes',done:true,source:'manual'},
 {id:'custom-note',name:'Otra tienda',section:'16',quantity:'2 unidades',done:false,source:'manual'}];
 const original=structuredClone(state),p=proposePurchase(data,state,options);
 const once=applyPurchase(state,p,p.items.map(i=>i.id),'2026-10-17T20:00:00Z');
 const twice=applyPurchase(once.state,p,p.items.map(i=>i.id),'2026-10-17T20:00:00Z');
 assert.deepEqual(state,original);assert.equal(twice.added.length,0);
 assert.deepEqual(twice.state.items,once.state.items);
 assert.equal(once.state.items.find(i=>i.id==='ejemplo-garbanzos').quantity,'7 botes');
 assert.equal(once.state.items.find(i=>i.id==='ejemplo-garbanzos').done,true);
 assert.deepEqual(once.state.extension,{keep:true});
 assert.ok(once.state.items.some(i=>i.id==='custom-note'));
});
test('a custom product with the same normalized name is not duplicated',()=>{
 const {data,state}=fixture();
 state.items.push({id:'custom-yogur',name:'YOGUR NATURAL',section:'8',quantity:'12 unidades',done:false});
 const p=proposePurchase(data,state,options),r=applyPurchase(state,p,p.items.map(i=>i.id));
 assert.equal(r.state.items.filter(i=>i.name.toLowerCase()==='yogur natural').length,1);
 assert.equal(r.state.items.find(i=>i.id==='custom-yogur').quantity,'12 unidades');
});
test('unknown quantity is explicitly pending and never invented from a generic unit',()=>{
 const {data,state}=fixture();
 data.products.find(i=>i.id==='ejemplo-huevos').quantity='';
 const p=proposePurchase(data,state,options),r=applyPurchase(state,p,['ejemplo-huevos']);
 assert.equal(r.state.items[0].quantity,'Por confirmar');assert.equal(r.state.items[0].needsQuantity,true);
});
test('permanent exclusions and dated postponements apply; have is scoped to the active trip',()=>{
 const {data,state}=fixture();state.tripDate=options.tripDate;
 data.planner.habits.push({id:'ejemplo-huevos',kind:'habit',reason:'Habitual de prueba'});
 state.excludedIds=['ejemplo-garbanzos'];state.snoozed=['ejemplo-huevos'];
 state.deferredUntil={'ejemplo-yogur':'2026-10-23'};
 const p=proposePurchase(data,state,options);
 for(const id of ['ejemplo-garbanzos','ejemplo-huevos','ejemplo-yogur'])assert.ok(!p.items.some(i=>i.id===id));
 const later=proposePurchase(data,state,{tripDate:'2026-10-24',nextDate:'2026-10-27'});
 assert.ok(later.items.some(i=>i.id==='ejemplo-yogur'));
 assert.ok(later.items.some(i=>i.id==='ejemplo-huevos'));
 const applied=applyPurchase(state,later,[]).state;assert.deepEqual(applied.snoozed,[]);
});
test('recent purchases filter optional habits until the horizon; menu candidates remain available',()=>{
 const {data,state}=fixture();
 state.feedback=[{type:'purchase-marked',productId:'ejemplo-yogur',date:'2026-10-19T09:00:00Z',purchaseDate:'2026-10-19'}];
 assert.ok(!proposePurchase(data,state,options).items.some(i=>i.id==='ejemplo-yogur'));
 assert.ok(proposePurchase(data,state,{...options,nextDate:'2026-10-27'}).items.some(i=>i.id==='ejemplo-yogur'));
 data.planner.templates.find(t=>t.week===2&&t.day===2).entries.push({id:'ejemplo-yogur',reason:'Ingrediente del menú de prueba'});
 assert.ok(proposePurchase(data,state,options).items.some(i=>i.id==='ejemplo-yogur'));
 state.feedback.push({type:'purchase-unmarked',productId:'ejemplo-yogur',date:'2026-10-19T10:00:00Z'});
 data.planner.templates.find(t=>t.week===2&&t.day===2).entries.pop();
 assert.ok(proposePurchase(data,state,options).items.some(i=>i.id==='ejemplo-yogur'));
});
test('archiving purchased rows requires the explicit option and keeps pending custom rows',()=>{
 const {data,state}=fixture();state.items=[{...data.products[0],done:true,boughtOn:'2026-10-17'},
 {id:'custom-x',name:'Pendiente manual',section:'16',quantity:'1',done:false}];
 const p=proposePurchase(data,state,{...options,retireDone:true});
 const r=applyPurchase(state,p,[]).state;
 assert.ok(!r.items.some(i=>i.done));assert.equal(r.items[0].id,'custom-x');
 assert.equal(r.feedback[0].type,'purchased');assert.equal(r.feedback[0].purchaseDate,'2026-10-17');
});
test('data validation rejects missing bases, unknown products, duplicate entries and impossible dates',()=>{
 const {data,state}=fixture();assert.ok(validatePlanner(data.planner,data.products));
 for(const mutate of [p=>p.templates.pop(),p=>p.templates[0].entries.push({id:'missing',reason:'x'}),
 p=>p.templates[0].entries.push(p.templates[0].entries[0]),p=>p.anchor.date='2026-02-30']){
   const bad=structuredClone(data.planner);mutate(bad);assert.throws(()=>validatePlanner(bad,data.products));
 }
 assert.equal(isDay('2026-02-30'),false);
 assert.throws(()=>proposePurchase(data,state,{...options,nextDate:options.tripDate}));
 assert.throws(()=>proposePurchase(data,state,{...options,nextDate:'2026-12-01'}));
 assert.equal(validatePlanningState({...state,cycleAnchor:{date:'2026-10-20',week:2}}),false);
 assert.equal(validatePlanningState({...state,deferredUntil:{x:'2026-02-30'}}),false);
 assert.equal(validatePlanner(undefined,data.products),undefined);
});

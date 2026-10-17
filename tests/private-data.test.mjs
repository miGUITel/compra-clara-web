import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GithubStore, encodeJson, decodeJson } from '../docs/github-store.mjs?v=0.4.1';
import { PrivateSession } from '../docs/private-session.mjs?v=0.4.1';
import { assembleData, validatePrivateState, clone } from '../docs/data-model.mjs?v=0.4.1';
import { sortedItems, validState } from '../docs/logic.mjs?v=0.4.1';
import { proposePurchase, applyPurchase } from '../docs/planner.mjs?v=0.4.1';

const sha=value=>createHash('sha1').update(JSON.stringify(value)).digest('hex');
const fixtures=()=>({
  'catalogo.json':{schemaVersion:1,sections:[['3','Carne'],['3.1','Especias'],['4','Pescado']],products:[{id:'a',name:'Producto Á',section:'3',quantity:'1 unidad',emoji:'🛒'},{id:'b',name:'Producto B',section:'3.1',quantity:'',emoji:'🧂'}]},
  'reglas.json':{schemaVersion:1,excluded:['Producto retirado'],excludedIds:['retirado'],displayRules:[{title:'Regla confirmada',detail:'Texto literal <b>sin HTML</b>'}]},
  'propuestas.json':{schemaVersion:1,notice:'Propuestas revisables.',suggestions:[{id:'a',reason:'Ejemplo sintético.',short:'Prueba'}]},
  'estado.json':{schemaVersion:1,listId:'compra-principal',showSections:false,tripDate:'2026-10-17',nextDate:'2026-10-20',items:[],snoozed:[],excludedIds:[],feedback:[],extension:{preserve:true}}
});
function fakeGithub() {
  let docs=fixtures(),counter=0,head=sha({docs,counter});
  const versions=new Map([[head,clone(docs)]]);
  const calls=[];
  const server={fault:null,calls,get docs(){return clone(docs);},get head(){return head;},
    externalChange(change){change(docs);head=sha({docs,counter:++counter});versions.set(head,clone(docs));},
    async fetch(url,options){
      const u=new URL(url),method=options.method||'GET';
      assert.equal(u.origin,'https://api.github.com');
      assert.equal(options.headers.Authorization,'Bearer test-only-token');
      assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
      assert.ok(!u.href.includes('test-only-token'));
      calls.push({path:u.pathname,ref:u.searchParams.get('ref'),method,body:options.body});
      const reply=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>clone(value)});
      if(server.fault==='read-denied'&&method==='GET')return reply(401,{});
      if(u.pathname.endsWith('/git/ref/heads/main'))return reply(200,{object:{type:'commit',sha:head}});
      const file=u.pathname.split('/contents/')[1];
      assert.ok(['catalogo.json','reglas.json','propuestas.json','estado.json'].includes(file));
      if(method==='GET'){
        if(server.fault==='confirm-fails'&&calls.some(c=>c.method==='PUT'))return reply(500,{});
        const version=versions.get(u.searchParams.get('ref'));
        if(!version)return reply(404,{});
        return reply(200,{type:'file',path:file,encoding:'base64',sha:sha(version[file]),content:encodeJson(version[file])});
      }
      assert.equal(method,'PUT');assert.equal(file,'estado.json');
      const body=JSON.parse(options.body);
      assert.equal(body.branch,'main');assert.ok(!('force' in body));
      if(server.fault==='denied')return reply(403,{});
      if(server.fault==='server-error')return reply(502,{});
      if(server.fault==='network-before')throw new Error('Connection lost');
      if(body.sha!==sha(docs[file]))return reply(409,{});
      server.externalChange(current=>{current[file]=decodeJson(body.content);});
      if(server.fault==='response-lost')throw new Error('Connection lost after write');
      if(server.fault==='bad-ack')return reply(200,{});
      return reply(200,{content:{sha:sha(docs[file])},commit:{sha:head}});
    }};
  return server;
}
async function connected(server){const session=new PrivateSession(new GithubStore({token:'test-only-token',fetchImpl:server.fetch}));await session.connect();return session;}

test('eight bases load in a private snapshot and an applied plan survives a verified save',async()=>{
  const server=fakeGithub();
  server.externalChange(docs=>{
    docs['propuestas.json'].planner={version:1,anchor:{date:'2026-10-12',week:3},notice:'Datos de prueba.',habits:[],
      templates:Array.from({length:4},(_,i)=>[2,5].map(day=>({week:i+1,day,label:`Semana ${i+1} día ${day}`,
        entries:[{id:'a',reason:'Ingrediente de prueba'},{id:'b',reason:'Cantidad pendiente de prueba'}],notes:[]}))).flat()};
  });
  const original=server.docs,s=await connected(server);
  const p=proposePurchase(s.data,s.state,{tripDate:'2026-10-20',nextDate:'2026-10-23'});
  const applied=applyPurchase(s.state,p,p.items.map(i=>i.id));s.changed(applied.state);
  await s.save();
  assert.equal(s.state.items.length,2);assert.equal(s.state.items.find(i=>i.id==='b').needsQuantity,true);
  assert.equal(s.state.plan.week,4);assert.equal(s.state.cycleAnchor.week,3);
  for(const file of ['catalogo.json','reglas.json','propuestas.json'])assert.deepEqual(server.docs[file],original[file]);
  assert.ok(server.calls.filter(c=>c.method==='PUT').every(c=>c.path.endsWith('/estado.json')));
  assert.deepEqual(s.state,server.docs['estado.json']);
});
function add(session,name='Nuevo producto') {session.state.items.push({id:'custom-test',name,section:'3.1',quantity:'2 unidades',done:false,source:'manual'});session.changed(session.state);}

test('Unicode and literal markup survive UTF-8 encoding',()=>{
  const value={name:'Jamón 🧀',note:'<img src=x onerror=alert(1)>',text:'línea\nsegunda'};
  assert.deepEqual(decodeJson(encodeJson(value)),value);
});
test('browser fetch is invoked with the global receiver',async()=>{
  const store=new GithubStore({token:'test-only-token',fetchImpl:function(){assert.equal(this,globalThis);return Promise.resolve({ok:false,status:401});}});
  await assert.rejects(store.readSnapshot(),e=>e.code==='HTTP_401');
});
test('one coherent snapshot pins all four reads to the same commit',async()=>{
  const server=fakeGithub(),s=await connected(server);
  assert.equal(s.state.items.length,0);assert.equal(s.dirty,false);
  const files=server.calls.filter(c=>c.path.includes('/contents/'));
  assert.equal(files.length,4);assert.ok(files.every(c=>c.ref===server.head));
});
test('explicit save changes only estado.json, uses original SHA, confirms readback and preserves extensions',async()=>{
  const server=fakeGithub(),original=server.docs,s=await connected(server),originalSha=s.sha;
  add(s,'Café <literal> 🛒');await s.save();
  assert.equal(s.dirty,false);assert.equal(s.state.items[0].name,'Café <literal> 🛒');
  assert.deepEqual(server.docs['estado.json'].extension,{preserve:true});
  for(const file of ['catalogo.json','reglas.json','propuestas.json'])assert.deepEqual(server.docs[file],original[file]);
  const writes=server.calls.filter(c=>c.method==='PUT');assert.equal(writes.length,1);assert.equal(JSON.parse(writes[0].body).sha,originalSha);
  assert.equal(server.calls.at(-1).ref,s.commit);
});
test('two devices cannot silently overwrite each other; the stale draft survives',async()=>{
  const server=fakeGithub(),a=await connected(server),b=await connected(server);
  add(a,'Cambio del móvil');await a.save();add(b,'Cambio del portátil');
  const draft=clone(b.state);
  await assert.rejects(b.save(),e=>e.code==='CONFLICT');
  assert.equal(b.blocked,true);assert.equal(b.dirty,true);assert.deepEqual(b.state,draft);
  assert.equal(server.docs['estado.json'].items[0].name,'Cambio del móvil');
  const count=server.calls.length;await assert.rejects(b.save(),e=>e.code==='BLOCKED');assert.equal(server.calls.length,count);
});
test('review keeps the local draft until an explicit acceptance',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s,'Borrador local');
  server.externalChange(d=>{d['estado.json'].items=[{id:'remote',name:'Remoto',section:'4',quantity:'1',done:true}];});
  const draft=clone(s.state),remote=await s.review();assert.deepEqual(s.state,draft);assert.equal(s.dirty,true);
  s.accept(remote);assert.equal(s.state.items[0].name,'Remoto');assert.equal(s.dirty,false);assert.equal(s.blocked,false);
});
for(const fault of ['network-before','response-lost','server-error','bad-ack','confirm-fails']) {
  test(`uncertain save ${fault} preserves draft and forbids automatic resend`,async()=>{
    const server=fakeGithub(),s=await connected(server);add(s);const draft=clone(s.state);server.fault=fault;
    await assert.rejects(s.save(),e=>e.code==='SAVE_UNKNOWN');
    assert.deepEqual(s.state,draft);assert.equal(s.blocked,true);assert.equal(s.dirty,true);assert.equal(s.busy,false);
    assert.equal(server.calls.filter(c=>c.method==='PUT').length,1);
    const count=server.calls.length;await assert.rejects(s.save(),e=>e.code==='BLOCKED');assert.equal(server.calls.length,count);
  });
}
test('a lost successful response can be recovered by reading GitHub, without another PUT',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s);server.fault='response-lost';await assert.rejects(s.save());
  server.fault=null;const remote=await s.review();assert.equal(remote.state.items[0].name,'Nuevo producto');s.accept(remote);
  assert.equal(s.dirty,false);assert.equal(server.calls.filter(c=>c.method==='PUT').length,1);
});
test('denied write keeps draft; no automatic retries',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s);server.fault='denied';await assert.rejects(s.save(),e=>e.code==='HTTP_403');
  assert.equal(s.dirty,true);assert.equal(server.calls.filter(c=>c.method==='PUT').length,1);
});
test('failed refresh leaves the existing state, SHA and dirty flag untouched',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s);const draft=clone(s.state),version=s.sha;server.fault='read-denied';
  await assert.rejects(s.review(),e=>e.code==='HTTP_401');assert.deepEqual(s.state,draft);assert.equal(s.sha,version);assert.equal(s.dirty,true);
});
test('invalid incoming reference data cannot replace a valid current state',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s);const draft=clone(s.state);
  server.externalChange(d=>{d['propuestas.json'].suggestions[0].id='unknown';});
  await assert.rejects(s.review());assert.deepEqual(s.state,draft);
});
test('private state refuses a demo document and impossible dates before sending',async()=>{
  const server=fakeGithub(),s=await connected(server);s.state.demo=true;s.dirty=true;
  await assert.rejects(s.save());assert.equal(server.calls.filter(c=>c.method==='PUT').length,0);
  const f=fixtures(),data=assembleData(f['catalogo.json'],f['reglas.json'],f['propuestas.json']);
  const invalid={...f['estado.json'],tripDate:'2026-02-31',nextDate:'2026-03-05'};assert.equal(validState(invalid,data),false);
});
test('reserved IDs cannot reappear and ambiguous/duplicate catalogs are rejected',()=>{
  const f=fixtures();f['catalogo.json'].products[0].id='retirado';assert.throws(()=>assembleData(f['catalogo.json'],f['reglas.json'],f['propuestas.json']));
  const g=fixtures();g['catalogo.json'].products.push(clone(g['catalogo.json'].products[0]));assert.throws(()=>assembleData(g['catalogo.json'],g['reglas.json'],g['propuestas.json']));
});
test('unknown document fields and custom products remain valid without becoming catalog entries',()=>{
  const f=fixtures(),data=assembleData(f['catalogo.json'],f['reglas.json'],f['propuestas.json']);
  const state=f['estado.json'];state.items=[{id:'custom',name:'Nuevo',section:'3',quantity:'1',done:false,other:{preserve:true}}];
  validatePrivateState(state,data);assert.equal(data.products.length,2);assert.deepEqual(state.items[0].other,{preserve:true});
});
test('route order places 3.1 between 3 and 4',()=>{
  const state={items:[{id:'c',name:'C',section:'4'},{id:'b',name:'B',section:'3.1'},{id:'a',name:'A',section:'3'}]};assert.deepEqual(sortedItems(state,[]).map(i=>i.section),['3','3.1','4']);
});
test('dispose removes the credential and loaded documents',async()=>{
  const server=fakeGithub(),store=new GithubStore({token:'test-only-token',fetchImpl:server.fetch}),s=new PrivateSession(store);await s.connect();
  assert.ok(!JSON.stringify(store).includes('test-only-token'));s.dispose();assert.equal(s.state,null);assert.equal(s.data,null);
  const count=server.calls.length;await assert.rejects(store.readSnapshot(),e=>e.code==='DISCONNECTED');assert.equal(server.calls.length,count);
});
test('a second save is blocked while the first is awaiting a response',async()=>{
  const server=fakeGithub(),s=await connected(server);add(s);
  const first=s.save();await assert.rejects(s.save(),e=>e.code==='BLOCKED');await first;
  assert.equal(server.calls.filter(c=>c.method==='PUT').length,1);
});

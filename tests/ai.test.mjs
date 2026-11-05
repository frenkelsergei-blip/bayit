import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterAIContext,normalizeAITools,applyAIPlan,undoAIPlan} from '../shared/ai-contract.mjs';
import {createLocalAIServer} from '../server/local-ai.mjs';
const catalog=JSON.parse(await readFile(new URL('../design-system/bayit-icons.json',import.meta.url))),members=[{id:'parent',name:'Parent',role:'parent'},{id:'child',name:'Child',role:'child'},{id:'other',name:'Other',role:'parent'}],icon=catalog[0].id;
const context=(extra={})=>filterAIContext({actorId:'parent',members,today:'2026-11-04',records:[],...extra});
const shop=(title,extra={})=>({kind:'shopping.add',title,quantity:1,unit:'items',quantityMode:'ensure',group:'Other',icon,listId:'week',...extra});
const plan=(actions,extra={})=>({id:'operation-1',actorId:'parent',scope:'family',actions,...extra});
const fresh=()=>({shopping:[],tasks:[],events:[]});
test('context excludes another person’s private records, even for a parent',()=>{
 const records=[{id:'secret',title:'secret',ownerId:'child',visibility:'private'},{id:'shared',ownerId:'child',visibility:'family'},{id:'selected',ownerId:'other',visibility:'selected',allowedIds:['child']},{id:'mine',ownerId:'parent',visibility:'private'}];
 assert.deepEqual(context({records}).records.map(r=>r.id),['shared']);assert.deepEqual(context({records,scope:'private'}).records.map(r=>r.id),['mine']);
});
test('unknown tools and child task assignments are rejected',()=>{
 assert.throws(()=>normalizeAITools([{type:'tool_use',name:'delete_everything'}],context(),catalog,'op'),/unsupported/);
 assert.throws(()=>normalizeAITools([{type:'tool_use',name:'prepare_tasks',input:{tasks:[{title:'do',memberIds:['parent']}]}}],context({actorId:'child'}),catalog,'op'),/themselves/);
});
test('answers only retain IDs supplied in accessible context',()=>{
 const result=normalizeAITools([{type:'tool_use',name:'answer_from_records',input:{answer:'Hello',source_ids:['secret','shared']}}],context({records:[{id:'shared',visibility:'family',ownerId:'other'}]}),catalog,'op');assert.deepEqual(result.sourceIds,['shared']);
});
test('shopping duplicate handling is atomic and idempotent, including duplicates within one request',()=>{
 const data=fresh(),p=plan([shop('Milk'),shop('milk'),shop('Tomatoes')]);const receipt=applyAIPlan(data,p,'parent',members,catalog);assert.equal(data.shopping.length,2);assert.equal(receipt.skipped,1);applyAIPlan(data,p,'parent',members,catalog);assert.equal(data.shopping.length,2);
 const before=structuredClone(data);assert.throws(()=>applyAIPlan(data,plan([shop('Rice'),shop('Bad',{icon:'unknown'})],{id:'broken'}),'parent',members,catalog));assert.deepEqual(data,before);
});
test('shared updates retain the original owner and do not widen selected visibility',()=>{
 const data=fresh();data.shopping=[{id:'one',title:'Milk',quantity:'2 items',quantityValue:2,unit:'items',ownerId:'other',visibility:'family',done:false},{id:'two',title:'Rice',quantity:'1 items',ownerId:'other',visibility:'selected',allowedIds:['parent'],done:false}];applyAIPlan(data,plan([shop('Milk',{quantity:3,quantityMode:'set'}),shop('Rice')]),'parent',members,catalog);assert.equal(data.shopping[0].ownerId,'other');assert.equal(data.shopping[1].visibility,'selected');assert.equal(data.shopping.length,3);
});
test('undo preserves a subsequent user edit, and rejects a different user',()=>{
 const data=fresh();applyAIPlan(data,plan([shop('Milk'),shop('Rice')]),'parent',members,catalog);data.shopping[1].title='Brown rice';assert.throws(()=>undoAIPlan(data,'operation-1','other'));const result=undoAIPlan(data,'operation-1','parent');assert.equal(result.restored,1);assert.equal(result.preserved,1);assert.equal(data.shopping[0].title,'Brown rice');
});
test('events, tasks and private ownership validate before committing',()=>{
 const data=fresh(),p=plan([{kind:'event.create',title:'Dinner',date:'2026-11-05',time:'18:30',durationMinutes:60,memberIds:['parent'],icon},{kind:'task.create',title:'Plants',date:'2026-11-06',time:'',memberIds:['parent'],repeat:'once',icon}],{scope:'private'});applyAIPlan(data,p,'parent',members,catalog);assert.equal(data.events[0].visibility,'private');assert.equal(data.tasks[0].xp,0);assert.equal(data.tasks[0].ownerId,'parent');
 assert.throws(()=>applyAIPlan(fresh(),plan([{...p.actions[0],date:'2026-02-31'}]),'parent',members,catalog));
});
test('local relay tests credentials, enumerates models, prunes data and never returns a key',async t=>{
 const calls=[],secret='fixture-key-do-not-save',server=createLocalAIServer({fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('/models')?{data:[{id:'test-model',display_name:'Test model'}]}:{content:[{type:'tool_use',name:'prepare_shopping_items',input:{items:[{name:'Milk',iconId:icon}]}}],usage:{input_tokens:10,output_tokens:20}}),{status:200,headers:{'Content-Type':'application/json'}})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,origin='http://127.0.0.1:4173')=>fetch(base+'/api/ai/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request('credentials',{apiKey:secret},'https://hostile.example')).status,403);
 const connected=await(await request('credentials',{apiKey:secret})).json();assert.equal(connected.connected,true);assert.ok(!JSON.stringify(connected).includes(secret));assert.equal(connected.model,'');
 assert.equal((await request('model',{model:'made-up'})).status,400);await request('model',{model:'test-model'});
 const result=await(await request('chat',{question:'Add milk',context:context({records:[{id:'secret-record',title:'hidden',ownerId:'child',visibility:'private'}]})})).json();assert.equal(result.live,true);assert.equal(result.plan.actions[0].title,'Milk');assert.ok(!calls.at(-1).options.body.includes('secret-record'));assert.ok(!JSON.stringify(result).includes(secret));
});
test('failed provider verification never reports a connected state',async t=>{
 const server=createLocalAIServer({fetchImpl:async()=>new Response('{}',{status:401})});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;const response=await fetch(base+'/api/ai/credentials',{method:'POST',headers:{Origin:'http://127.0.0.1:4173','Content-Type':'application/json'},body:JSON.stringify({apiKey:'invalid-fixture-key'})});assert.equal(response.status,400);const status=await(await fetch(base+'/api/ai/status')).json();assert.equal(status.connected,false);assert.equal(status.hasKey,false);
});
test('AI creates a named list with its items atomically, then undoes both',()=>{
 const data=fresh(),proposal=normalizeAITools([{type:'tool_use',name:'prepare_shopping_lists',input:{lists:[{name:'Weekend groceries',items:[{name:'Tomatoes',quantity:2,unit:'kg',iconId:icon},{name:'Milk',iconId:icon}]}]}}],context(),catalog,'new-list-operation').plan;assert.equal(proposal.actions.length,3);const receipt=applyAIPlan(data,proposal,'parent',members,catalog),list=data.shoppingLists.find(l=>l.name==='Weekend groceries');assert.ok(list);assert.equal(data.shopping.filter(i=>i.listId===list.id).length,2);assert.equal(data.shopping[0].visibility,list.visibility);undoAIPlan(data,proposal.id,'parent');assert.ok(!data.shoppingLists.some(l=>l.id===list.id));assert.equal(data.shopping.length,0);assert.equal(receipt.status,'undone');
});
test('AI cannot add to a completed list or widen selected-list visibility',()=>{
 const data=fresh();data.shoppingLists=[{id:'week',name:'Week',status:'completed',ownerId:'parent',visibility:'family',allowedIds:[]}];assert.throws(()=>applyAIPlan(data,plan([shop('Milk')]),'parent',members,catalog),/active list/);data.shoppingLists[0]={...data.shoppingLists[0],status:'active',visibility:'selected',allowedIds:['parent','child']};applyAIPlan(data,plan([shop('Milk')]),'parent',members,catalog);assert.equal(data.shopping[0].visibility,'selected');assert.deepEqual(data.shopping[0].allowedIds,['parent','child']);
});

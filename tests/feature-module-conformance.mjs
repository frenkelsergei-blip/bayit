// Feature-module conformance suite: what every feature module must pass (docs/feature-module-contract.md).
// Not a test file on its own. tests/feature-modules.test.mjs runs it over every installed module, and each module's
// own package test runs it on itself after `bayit-extension.mjs apply`:
//   import {runModuleConformance} from './feature-module-conformance.mjs';
//   runModuleConformance('lending');
// Everything is generated from the manifest, with fictional members only. It imports Bayit from this copy
// (../app/cloud, ../shared), so it checks the code that will actually run.
import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {blankState,visibleState,applyChanges,diffState} from '../app/cloud/state.mjs';
import {MODULES,moduleById,moduleProblem,moduleReadable,moduleWritable,MODULE_LIMITS,LATER,keptModules,moduleExport,dropModuleData} from '../shared/feature-modules.mjs';
import {featureById,featureDefaults,featureContext,routeAllowed,deliveryView,FEATURE_MAPPINGS} from '../shared/features.mjs';
import {extKey,recordList} from '../shared/record-paths.mjs';
import {offlineSnapshot,applyQueued,pendingKeys,needsConnection} from '../shared/offline-sync.mjs';
import {rebaseChanges} from '../shared/change-merge.mjs';
import {accessibleExport} from '../shared/access-export.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
export const PEOPLE={parent:'cf-parent',adult:'cf-adult',other:'cf-other',child:'cf-child'};
const ROLE={[PEOPLE.parent]:'parent',[PEOPLE.adult]:'adult',[PEOPLE.other]:'adult',[PEOPLE.child]:'child'};
const T0='2026-11-10T09:00:00.000Z';

// ---- generated values ----------------------------------------------------------------------------------------
export function sampleValue(def){
 switch(def.type){
  case 'text':return 'Sample'.slice(0,def.max??300);
  case 'longtext':return 'A longer sample.'.slice(0,def.max??20000);
  case 'number':return Math.min(def.max??1,Math.max(def.min??1,1));
  case 'integer':return Math.min(def.max??1,Math.max(Math.ceil(def.min??1),1));
  case 'boolean':return true;
  case 'date':return '2026-11-10';
  case 'time':return '09:30';
  case 'enum':return def.values[0];
  case 'people':return [PEOPLE.parent];
  case 'tags':return ['sample'];
  case 'ref':return '';
  case 'object':return Object.fromEntries(Object.entries(def.fields).map(([k,d])=>[k,sampleValue(d)]));
 }
}
const WRONG={text:5,longtext:5,number:'x',integer:1.5,boolean:'yes',date:'tomorrow',time:'25:00',enum:'__not_an_option__',people:['cf-stranger'],tags:'sample',ref:'cf-missing',object:'x'};
export function sampleRecord(module,collection,{id,owner=PEOPLE.parent,visibility='family',allowedIds=[]}={}){
 const fields=module.collections[collection].fields;
 return {id,ownerId:owner,visibility,allowedIds,createdAt:T0,createdBy:owner,...Object.fromEntries(Object.entries(fields).map(([k,d])=>[k,sampleValue(d)]))};
}
// A household with a parent, two other adults and a child, the module's feature on.
export function household(module,{on=true}={}){
 const s=blankState('cf-home','Conformance home',{id:PEOPLE.parent,name:'Parent',role:'parent'});
 s.members=Object.entries(ROLE).map(([id,role])=>({id,name:id,he:id,role,color:'blue'}));
 for(const m of s.members)s.profiles[m.id]??={name:m.id,he:m.id,xp:0};
 s.preferences.features={...featureDefaults(),[module.id]:on};
 return s;
}
const role=id=>ROLE[id]||'adult';
const put=(state,actor,key,value)=>applyChanges(state,[{collection:key,id:value.id,value,before:null}],actor,role(actor));
const ids=(visible,module,c)=>(visible.extensions?.[module.id]?.[c]||[]).map(r=>r.id).sort();

// ---- the suite -----------------------------------------------------------------------------------------------
export function runModuleConformance(moduleId,{screens='app/src/extensions/screens.jsx'}={}){
 const module=moduleById(moduleId);
 describe('feature module "'+moduleId+'" conformance',()=>{
  test('manifest: registered, valid, same id as its feature, x/<id> routes, audience matches, nothing from later versions',()=>{
   assert.ok(module,'"'+moduleId+'" is registered in shared/extensions/modules.mjs');
   assert.equal(moduleProblem(module),'');
   const f=featureById(moduleId);assert.ok(f,'a feature with the same id');
   assert.ok(f.routes.every(r=>r==='x/'+moduleId||r.startsWith('x/'+moduleId+'/')));
   assert.equal(!!f.adult,module.audience==='adults');
   for(const key of FEATURE_MAPPINGS)if(key!=='routes')assert.ok(!f[key]?.length,'the feature maps no '+key);
   for(const key of LATER)assert.ok(!(key in module),'no "'+key+'" in v1');
   for(const c of Object.values(module.collections))for(const key of LATER)assert.ok(!(key in c),'no "'+key+'" on a collection in v1');
  });

  test('v1 limits: a manifest asking for outside addresses or a later surface is refused',()=>{
   const plain={...module};delete plain.childrenMay;if(module.audience==='everyone')plain.childrenMay=module.childrenMay;
   for(const key of ['outbound','origins','today','widgets','reminders','telegram','statistics','ai','secrets','files','tables','routes'])assert.match(moduleProblem({...plain,[key]:key==='outbound'?['https://example.com']:true}),/not available to feature modules in the first version/,key);
   const c=Object.keys(module.collections)[0];
   assert.match(moduleProblem({...plain,collections:{...module.collections,[c]:{...module.collections[c],reminders:{date:'x'}}}}),/not available in the first version/);
   assert.match(moduleProblem({...plain,collections:{...module.collections,[c]:{...module.collections[c],assignees:true}}}),/assignees come later/);
   const f=featureById(moduleId);
   for(const key of ['widgets','stats','telegram','aiTools','aiSources','reminders','notificationCategories'])assert.match(moduleProblem(plain,[],{...f,[key]:['cf-'+key]}),new RegExp('maps '+key),key);
   assert.match(moduleProblem(plain,[],{...f,routes:[''+moduleId]}),/routes must be "x\//);
   assert.match(moduleProblem(plain,[],{...f,adult:module.audience!=='adults'}),/adult/);
  });

  for(const c of Object.keys(module?.collections||{}))test('schema of "'+c+'": a valid record is accepted, anything undeclared or malformed is refused',()=>{
   const key=extKey(moduleId,c),def=module.collections[c],s=household(module);
   const ok=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-ok'}));
   assert.equal(recordList(ok,key).length,1);
   const refused=(value,re,why)=>assert.throws(()=>put(s,PEOPLE.parent,key,value),re,why);
   refused({...sampleRecord(module,c,{id:'cf-1'}),cfUndeclared:'x'},/Unsupported .* field: cfUndeclared/,'unknown field');
   refused(JSON.parse(JSON.stringify(sampleRecord(module,c,{id:'cf-2'})).replace(/^\{/,'{"cfNested":{"__proto__":{"x":1}},')),/Invalid field|Unsupported/,'forbidden key at depth 2');
   refused({...sampleRecord(module,c,{id:'cf-3'}),$where:'x'},/Invalid field/,'$ key');
   refused(sampleRecord(module,c,{id:'cf:4'}),/record id|Unsupported record change/,'an id with ":"');
   refused(sampleRecord(module,c,{id:'cf-5',visibility:'everyone'}),/visibility/,'bad visibility');
   refused(sampleRecord(module,c,{id:'cf-6',visibility:'selected',allowedIds:['cf-stranger']}),/visibility/,'selected stranger');
   refused({...sampleRecord(module,c,{id:'cf-7'}),ownerId:PEOPLE.adult},/ownership/,'creating a record in someone else’s name');
   for(const [name,f]of Object.entries(def.fields)){
    refused({...sampleRecord(module,c,{id:'cf-w-'+name}),[name]:WRONG[f.type]},/Choose|Unsupported|private or unavailable/,'wrong type for '+name);
    if(f.required){const r=sampleRecord(module,c,{id:'cf-r-'+name});delete r[name];refused(r,/Choose a value/,'missing required '+name)}
    if(f.type==='text')refused({...sampleRecord(module,c,{id:'cf-l-'+name}),[name]:'x'.repeat((f.max??300)+1)},/Choose text/,'too-long '+name);
   }
   const long=Object.entries(def.fields).find(([,f])=>f.type==='longtext'&&(f.max??20000)>=MODULE_LIMITS.recordBytes-100);
   if(long)refused({...sampleRecord(module,c,{id:'cf-big'}),[long[0]]:'x'.repeat(MODULE_LIMITS.recordBytes)},/too large|Choose text/,'a record over 20 KB');
   // maxRecords: a full list refuses one more.
   const full=household(module),max=def.maxRecords??MODULE_LIMITS.defaultMaxRecords;
   full.extensions={[moduleId]:{[c]:Array.from({length:max},(_,i)=>({...sampleRecord(module,c,{id:'cf-f'+i}),...(i?{}:{})}))}};
   if(JSON.stringify(full.extensions).length<(module.maxBytes??MODULE_LIMITS.defaultMaxBytes))assert.throws(()=>put(full,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-one-more'})),/full/,'maxRecords+1');
  });

  test('access: private, family and selected records reach exactly the right people; children follow the audience',()=>{
   let s=household(module);const P=PEOPLE.parent,A=PEOPLE.adult,B=PEOPLE.other,C=PEOPLE.child;
   for(const c of Object.keys(module.collections)){const key=extKey(moduleId,c);
    s=put(s,P,key,sampleRecord(module,c,{id:'cf-private',visibility:'private'}));
    s=put(s,P,key,sampleRecord(module,c,{id:'cf-family',visibility:'family'}));
    s=put(s,P,key,sampleRecord(module,c,{id:'cf-selected',visibility:'selected',allowedIds:[A]}));
   }
   for(const c of Object.keys(module.collections)){
    assert.deepEqual(ids(visibleState(s,P),module,c),['cf-family','cf-private','cf-selected'],'owner sees all');
    assert.deepEqual(ids(visibleState(s,A),module,c),['cf-family','cf-selected'],'selected adult');
    assert.deepEqual(ids(visibleState(s,B),module,c),['cf-family'],'adult outside the selection');
    if(moduleReadable(module,'child'))assert.deepEqual(ids(visibleState(s,C),module,c),['cf-family'],'child sees family records');
    else assert.equal(visibleState(s,C).extensions?.[moduleId],undefined,'an adults-only (or childrenMay "none") module sends nothing to a child');
    assert.equal(visibleState(s,'cf-outsider').extensions,undefined,'someone outside the household gets nothing');
   }
   const c=Object.keys(module.collections)[0],key=extKey(moduleId,c),family=recordList(s,key).find(r=>r.id==='cf-family'),priv=recordList(s,key).find(r=>r.id==='cf-private');
   assert.throws(()=>put(s,A,key,{...family,visibility:'private'}),/Only the owner changes sharing|Only the owner/,'a non-owner cannot change sharing');
   assert.throws(()=>applyChanges(s,[{collection:key,id:'cf-family',delete:true,before:family}],A,'adult'),/Only the owner can remove/);
   assert.throws(()=>put(s,B,key,{...priv,[Object.keys(module.collections[c].fields)[0]]:priv[Object.keys(module.collections[c].fields)[0]]}),/private/,'a non-viewer cannot touch a private record');
   if(module.collections[c].edit==='owner')assert.throws(()=>put(s,A,key,{...family,updatedAt:T0}),/Only the owner edits/);
   else assert.throws(()=>put(s,A,key,{...family,updatedAt:T0}),/permitted editor/,'policy edit needs the owner’s permission');
   const childRecord=sampleRecord(module,c,{id:'cf-kid',owner:C});if(Object.values(module.collections[c].fields).some(f=>f.type==='people'))for(const [k,f]of Object.entries(module.collections[c].fields))if(f.type==='people')childRecord[k]=[C];
   if(moduleWritable(module,'child'))assert.equal(recordList(put(s,C,key,childRecord),key).some(r=>r.id==='cf-kid'),true,'a child may add records');
   else assert.throws(()=>put(s,C,key,childRecord),/adult accounts|parent manages/,'a child cannot write');
  });

  test('no leak paths: removed modules, undeclared lists and fields never reach a device; off features drop out of delivery; export holds only what the member sees',()=>{
   let s=household(module);const c=Object.keys(module.collections)[0],key=extKey(moduleId,c);
   s=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-family'}));
   s=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-private',visibility:'private'}));
   s.extensions[moduleId].cfUndeclaredList=[sampleRecord(module,c,{id:'cf-hidden-list'})];
   s.extensions[moduleId][c][0].cfUndeclaredField='secret';
   s.extensions['cf-removed-module']={items:[{id:'cf-ghost',ownerId:PEOPLE.parent,visibility:'family',allowedIds:[],title:'Ghost'}]};
   const v=visibleState(s,PEOPLE.other),text=JSON.stringify(v);
   assert.doesNotMatch(text,/cf-ghost|cf-removed-module|cfUndeclaredList|cf-hidden-list|cfUndeclaredField|cf-private/);
   // Feature hidden by this person: delivery (Telegram, Push, AI context) drops the module; storage is untouched.
   const hidden=structuredClone(s);hidden.preferences.featuresByUser={[PEOPLE.other]:{hidden:[moduleId]}};
   const stored=JSON.stringify(hidden.extensions);
   assert.equal(deliveryView(visibleState(hidden,PEOPLE.other),PEOPLE.other).extensions?.[moduleId],undefined);
   assert.ok(deliveryView(visibleState(s,PEOPLE.other),PEOPLE.other).extensions[moduleId],'kept while on');
   assert.equal(JSON.stringify(hidden.extensions),stored);
   // Export (Settings › General › Download my data) is built from the member's own visible copy.
   const exported=JSON.stringify(accessibleExport(v,PEOPLE.other,list=>list));
   assert.match(exported,/cf-family/);assert.doesNotMatch(exported,/cf-private|cf-ghost/);
   // Bayit AI, reminders, Push, Telegram, Statistics and suggestions do not read module data in v1.
   for(const f of ['app/cloud/assistant.mjs','app/cloud/bayit-ai.mjs','app/cloud/reminders.mjs','app/cloud/push.mjs','app/cloud/telegram.mjs','app/cloud/telegram-format.mjs','app/cloud/channel-delivery.mjs','app/cloud/home-suggestions.mjs','shared/ai-contract.mjs','shared/ai-actions.mjs','app/src/statistics.js','app/src/statistics-view.jsx'])
    if(existsSync(join(ROOT,f)))assert.doesNotMatch(readFileSync(join(ROOT,f),'utf8'),/\.extensions\b|\bextensions\[|['"`]ext:/,f+' must not read feature-module data in v1');
  });

  test('feature off: writes refused, the route closes, everything is back when it is on again',()=>{
   const c=Object.keys(module.collections)[0],key=extKey(moduleId,c);let s=household(module);
   s=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-family'}));
   const off=structuredClone(s);off.preferences.features[moduleId]=false;
   assert.throws(()=>put(off,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-new'})),/turned off/);
   assert.equal(routeAllowed(featureContext(off.preferences,PEOPLE.parent,'parent',off),'x/'+moduleId),false);
   assert.equal(deliveryView(visibleState(off,PEOPLE.parent),PEOPLE.parent).extensions?.[moduleId],undefined);
   assert.deepEqual(recordList(off,key).map(r=>r.id),['cf-family'],'nothing deleted');
   const on=structuredClone(off);on.preferences.features[moduleId]=true;
   assert.equal(routeAllowed(featureContext(on.preferences,PEOPLE.parent,'parent',on),'x/'+moduleId),true);
   assert.deepEqual(ids(visibleState(put(on,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-new'})),PEOPLE.parent),module,c),['cf-family','cf-new']);
   if(module.audience==='adults')assert.equal(routeAllowed(featureContext(on.preferences,PEOPLE.child,'child',on),'x/'+moduleId),false,'adults-only: no route for a child');
  });

  test('offline and merge: diff, queue, pending keys, conflicts and the offline rule work for module records',()=>{
   const c=Object.keys(module.collections)[0],key=extKey(moduleId,c),first=Object.keys(module.collections[c].fields)[0];
   let s=household(module);s=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-family'}));
   const before=visibleState(s,PEOPLE.parent),after=structuredClone(before),rec=after.extensions[moduleId][c][0];
   rec.updatedAt='2026-11-10T10:00:00.000Z';
   const ops=diffState(before,after);
   assert.deepEqual(ops.map(o=>[o.collection,o.id]),[[key,'cf-family']],'diffState emits an ext op');
   assert.equal(recordList(applyChanges(s,ops,PEOPLE.parent,'parent'),key)[0].updatedAt,'2026-11-10T10:00:00.000Z');
   const queued=applyQueued(before,[{changes:ops}]);assert.equal(recordList(queued,key)[0].updatedAt,'2026-11-10T10:00:00.000Z');
   assert.ok(pendingKeys([{changes:ops}]).has(key+':cf-family'));
   // Another device changed the same record: an unrelated field merges, the same field and sharing conflict.
   const server=structuredClone(before);recordList(server,key)[0].createdAt='2026-11-09T09:00:00.000Z';
   assert.equal(rebaseChanges(ops,server)[0].value.createdAt,'2026-11-09T09:00:00.000Z','independent fields merge');
   const same=structuredClone(before);recordList(same,key)[0].updatedAt='2026-11-10T11:00:00.000Z';
   assert.throws(()=>rebaseChanges(ops,same),e=>e.code==='EDIT_CONFLICT');
   const shared=structuredClone(before);recordList(shared,key)[0].visibility='private';
   assert.throws(()=>rebaseChanges(ops,shared),e=>e.code==='EDIT_CONFLICT');
   const snap=offlineSnapshot(before);
   if(module.offline)assert.equal(snap.extensions[moduleId][c].length,1);else assert.deepEqual(snap.extensions[moduleId],{},'offline:false is never stored on the device');
   assert.equal(needsConnection('x',moduleId),module.offline===false);
   assert.equal(rec[first]!==undefined,true);
  });

  test('removal: data of a module that is not installed stays stored byte for byte, is never served, and a parent can download then delete it',()=>{
   const c=Object.keys(module.collections)[0],key=extKey(moduleId,c);let s=household(module);
   s=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-family'}));
   s.extensions['cf-removed-module']={items:[{id:'cf-ghost',ownerId:PEOPLE.parent,visibility:'family',allowedIds:[],title:'Ghost'},{id:'cf-ghost-private',ownerId:PEOPLE.adult,visibility:'private',allowedIds:[],title:'Private ghost'}]};
   const kept=JSON.stringify(s.extensions['cf-removed-module']);
   const next=put(s,PEOPLE.parent,key,sampleRecord(module,c,{id:'cf-other'}));
   assert.equal(JSON.stringify(next.extensions['cf-removed-module']),kept,'other saves keep it byte-identical');
   assert.throws(()=>applyChanges(next,[{collection:'ext:cf-removed-module/items',id:'cf-ghost',delete:true}],PEOPLE.parent,'parent'),/Unsupported record change/,'no writes to a removed module');
   // Names: a write keeps the module's display names with its data, so they are known after removal; never sent to devices.
   const f=featureById(moduleId);
   assert.deepEqual(next.extensions[moduleId].$name,{en:f.en,he:f.he},'display names kept with the data');
   assert.doesNotMatch(JSON.stringify(visibleState(next,PEOPLE.parent).extensions||{}),/\$name/,'names stay on the server');
   assert.deepEqual(keptModules(next).find(k=>k.id===moduleId).name,{en:f.en,he:f.he});
   assert.equal(keptModules(next).find(k=>k.id==='cf-removed-module').name,null,'no name was ever saved: the screen falls back to the id');
   const named=structuredClone(next);named.extensions['cf-removed-module'].$name={en:'Board-game nights',he:'ערבי משחקים'};
   assert.deepEqual(keptModules(named).find(k=>k.id==='cf-removed-module').name,{en:'Board-game nights',he:'ערבי משחקים'},'a removed module keeps its saved names');
   assert.equal(moduleExport(named,'cf-removed-module',PEOPLE.parent).name.he,'ערבי משחקים');
   assert.deepEqual(applyChanges(named,[],PEOPLE.parent,'parent').extensions['cf-removed-module'].$name.en,'Board-game nights','kept byte for byte');
   assert.equal(keptModules(next,PEOPLE.parent).find(k=>k.id==='cf-removed-module').privateOthers,1,'delete warning: one other person kept a private record (count only)');
   assert.equal(keptModules(next,PEOPLE.adult).find(k=>k.id==='cf-removed-module').privateOthers,0);
   assert.deepEqual(keptModules(next).map(k=>[k.id,k.installed]),[['cf-removed-module',false],[moduleId,true]].sort((a,b)=>a[0].localeCompare(b[0])));
   const copy=moduleExport(next,'cf-removed-module',PEOPLE.parent);
   assert.deepEqual(copy.records.items.map(r=>r.id),['cf-ghost'],'the parent downloads what they may see, never another adult’s private record');
   assert.throws(()=>moduleExport(next,'cf-removed-module',PEOPLE.child),/adult accounts/);
   assert.throws(()=>dropModuleData(next,'cf-removed-module',{role:'adult',confirm:'cf-removed-module'}),/parent/);
   assert.throws(()=>dropModuleData(next,'cf-removed-module',{role:'parent',confirm:'other'}),/Confirm/);
   const dropped=dropModuleData(next,'cf-removed-module',{role:'parent',confirm:'cf-removed-module'});
   assert.equal(dropped.extensions['cf-removed-module'],undefined);assert.ok(dropped.extensions[moduleId],'other modules untouched');
  });

  test('screen: registered with the same id, loads lazily and renders in Hebrew and English',async()=>{
   const file=join(ROOT,screens);assert.ok(existsSync(file),screens+' exists');
   const req=createRequire(join(ROOT,'app/package.json')),esbuild=req('esbuild');
   const dir=mkdtempSync(join(tmpdir(),'bayit-module-screen-')),out=join(dir,'screen.mjs');
   try{
    await esbuild.build({stdin:{contents:`export {EXTRA_SCREENS} from ${JSON.stringify(file)};export {default as React} from 'react';export {renderToString} from 'react-dom/server';`,resolveDir:join(ROOT,'app'),loader:'jsx'},bundle:true,platform:'node',format:'esm',outfile:out,jsx:'automatic',loader:{'.css':'empty','.png':'empty','.svg':'empty','.jsx':'jsx','.js':'jsx'},logLevel:'silent',banner:{js:"import {createRequire as cfRequire} from 'node:module';const require=cfRequire(import.meta.url);"}});
    const {EXTRA_SCREENS,React,renderToString}=await import(pathToFileURL(out).href);
    const entry=EXTRA_SCREENS.find(e=>e.id===moduleId);assert.ok(entry,'a screen entry with id "'+moduleId+'"');
    for(const e of EXTRA_SCREENS)assert.ok(moduleById(e.id),'screen "'+e.id+'" belongs to an installed module');
    assert.equal(typeof entry.load,'function','load: ()=>import(…) keeps the screen in its own chunk');
    const loaded=await entry.load(),Screen=loaded.default||loaded.Screen;assert.equal(typeof Screen,'function');
    const s=household(module),c=Object.keys(module.collections)[0];s.extensions={[moduleId]:{[c]:[sampleRecord(module,c,{id:'cf-family'})]}};
    const stub=name=>({children,title,text})=>React.createElement('div',{'data-ui':name},title,text,children);
    const ui=Object.fromEntries(['Heading','Button','Badge','Tabs','Avatar','Icon','Week','Checkbox','DetailPanel','CalendarView','Select','Scope','MonthCalendar','Empty','RecordAccess','PersonChip'].map(n=>[n,stub(n)]));
    for(const lang of ['he','en']){
     const visible=visibleState(s,PEOPLE.parent),T=(en,he)=>lang==='he'?he:en;
     const app={data:visible,user:PEOPLE.parent,lang,T,members:visible.members,member:id=>visible.members.find(m=>m.id===id),visible:l=>l,update:()=>Promise.resolve(),go:()=>{},notify:()=>{}};
     const html=renderToString(React.createElement(Screen,{app,ui,module,view:'',records:col=>recordList(visible,extKey(moduleId,col))||[],create:(col,fields)=>({...fields}),save:()=>Promise.resolve(),remove:()=>Promise.resolve()}));
     assert.ok(html.length>0,lang+' renders');
    }
   }finally{rmSync(dir,{recursive:true,force:true})}
  });
 });
}

// Every module installed in this copy.
export const installedModuleIds=()=>MODULES.map(m=>m.id);

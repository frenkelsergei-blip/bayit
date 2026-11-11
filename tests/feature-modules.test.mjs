// Feature modules (Modular Bayit, work package 2.5; docs/feature-module-contract.md).
// 1. Every module installed in this copy passes the conformance suite (none ship upstream).
// 2. The seam's own rules: paths, registry refusals, the shipped local files are empty.
// 3. End to end on a scratch COPY, never this folder: the "Lent & borrowed" fixture is applied with
//    app/scripts/bayit-extension.mjs (which runs its package test: the conformance suite on a real module), then the
//    real server (worker.mjs bundled, SQLite as on the Docker host) is driven over HTTP with fictional households:
//    a child, another household, removal (data kept, not served), reinstall (served again), a parent's download and
//    deliberate delete. Remove restores the copy byte for byte.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,existsSync,rmSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runModuleConformance,installedModuleIds} from './feature-module-conformance.mjs';
import {extKey,parseExtKey,recordList,setRecordList,extKeys,validExtId,putRecord,dropRecord} from '../shared/record-paths.mjs';
import {MODULES,moduleProblem,newModuleRecord} from '../shared/feature-modules.mjs';
import {joinRegistry} from '../shared/extension-registry.mjs';
import {routeFeature} from '../shared/features.mjs';
import {readPackage,CLIENT_REGISTRIES} from '../app/scripts/bayit-extension.mjs';
import {LOCAL_REGISTRIES,emptyRegistry} from '../app/scripts/local-registries.mjs';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {blankState} from '../app/cloud/state.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),src=p=>readFileSync(join(root,p),'utf8');
const FIXTURE=join(root,'tests/fixtures/extensions/bayit-add-lending');
const scratch=mkdtempSync(join(tmpdir(),'bayit-feature-modules-'));
after(()=>rmSync(scratch,{recursive:true,force:true}));

for(const id of installedModuleIds())runModuleConformance(id);

test('upstream ships no feature module: the local files are empty and the fixture is not registered',{skip:JSON.parse(src('shared/extensions/installed.json')).length>0&&'this copy has extensions installed (shared/extensions/installed.json)'},()=>{
 assert.equal(MODULES.length,0);
 assert.equal(src('shared/extensions/modules.mjs'),emptyRegistry(LOCAL_REGISTRIES.find(r=>r.seam==='modules')));
 assert.match(src('app/src/extensions/screens.jsx'),/^export const EXTRA_SCREENS=\[\];$/m);
 for(const f of ['shared/extensions/features.mjs','shared/extensions/modules.mjs','app/src/extensions/screens.jsx','shared/extensions/installed.json'])assert.doesNotMatch(src(f),/lending/,f);
 // The test-only sample never reaches the shipped app (user, 2026-11-10): no file outside tests/ names it.
 const walk=d=>readdirSync(join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'||e.name==='dist'?[]:walk(d+'/'+e.name)):[d+'/'+e.name]);
 for(const f of [...walk('app/src'),...walk('shared'),...walk('app/cloud'),...walk('app/public').filter(f=>/\.(js|json|html|webmanifest)$/.test(f))])assert.doesNotMatch(readFileSync(join(root,f),'utf8'),/\blending\b|LENDING_|Lent & borrowed/,f+' must not mention the test-only sample');
});

test('menu concept A (2026-11-10): installed modules are places like any other, so they appear in More and can be pinned',()=>{
 const app=src('app/src/App.jsx');
 assert.match(app,/const places=\[.*\.\.\.extensionPlaces\(routeOn,lang\)\]\.filter\(\(\[key\]\)=>routeOn\(key\)\);/);
 assert.match(src('app/src/connections-hub.jsx'),/<KeptExtensionData a=\{a\}\/>/,'kept data lives in Settings › Storage');
});

test('record paths: ext keys, slices and safe ids',()=>{
 assert.equal(extKey('lending','items'),'ext:lending/items');
 assert.deepEqual(parseExtKey('ext:lending/items'),{module:'lending',collection:'items'});
 for(const bad of ['tasks','ext:Lending/items','ext:lending/items/x','ext:lending/__proto__','ext:lending/constructor ','ext:../items','ext:l/items'])assert.equal(parseExtKey(bad),null,bad);
 const s={tasks:[]};setRecordList(s,'ext:lending/items',[{id:'a'}]);
 assert.deepEqual(recordList(s,'ext:lending/items'),[{id:'a'}]);assert.equal(recordList(s,'tasks'),s.tasks);
 assert.equal(recordList({extensions:{lending:{}}},'ext:lending/toString'),undefined,'no inherited properties');
 putRecord(s,'ext:lending/items',{id:'b'});putRecord(s,'ext:lending/items',{id:'a',x:1});dropRecord(s,'ext:lending/items','b');
 assert.deepEqual(s.extensions.lending.items,[{id:'a',x:1}]);
 assert.deepEqual(extKeys({extensions:{lending:{items:[],bad:{},'Bad Name':[]},x:[]}}),['ext:lending/items']);
 for(const id of ['a','A-b_9'])assert.ok(validExtId(id));for(const id of ['','a:b','a/b','a b','x'.repeat(141)])assert.ok(!validExtId(id),id);
 const r=newModuleRecord({title:'Drill'},{actorId:'p',now:'2026-11-10T00:00:00.000Z'});
 assert.equal(r.visibility,'private');assert.equal(r.ownerId,'p');assert.ok(validExtId(r.id));
});

test('the module registry refuses bad manifests when it loads, naming the module',()=>{
 const feature={id:'chores',group:'home',icon:'Broom',defaultOn:false,en:'Chores',he:'מטלות',description:{en:'x',he:'x'},routes:['x/chores']};
 const good={id:'chores',version:1,audience:'everyone',childrenMay:'write',offline:true,collections:{swaps:{edit:'owner',label:'title',fields:{title:{type:'text',required:true}}}}};
 const check=f=>m=>moduleProblem(m,[],f);
 assert.equal(check(feature)(good),'');
 assert.throws(()=>joinRegistry('feature module',[],[good,good],check(feature)),/feature module "chores": this id is already registered/);
 const bad=(m,re,f=feature)=>assert.throws(()=>joinRegistry('feature module',[],[m],check(f)),re);
 bad({...good,version:2},/version must be 1/);
 bad({...good,audience:'kids'},/audience/);
 bad({...good,outbound:['https://api.example.com']},/"outbound" is not available to feature modules in the first version/);
 bad({...good,collections:{swaps:{...good.collections.swaps,fields:{title:{type:'html'}}}}},/unknown type "html"/);
 bad({...good,collections:{swaps:{...good.collections.swaps,fields:{ownerId:{type:'text'}}}}},/core fields/);
 bad({...good,collections:{swaps:{...good.collections.swaps,maxRecords:5000}}},/maxRecords/);
 bad({...good,maxBytes:10_000_000},/maxBytes/);
 bad(good,/needs a feature with the same id/,null);
 bad({...good,audience:'adults',childrenMay:undefined},/adult:true/);
 bad(good,/routes must be "x\/chores"/,{...feature,routes:['chores']});
 bad(good,/maps widgets/,{...feature,widgets:['chores']});
 // Core routes can never take the module namespace.
 assert.equal(routeFeature('x/nothing-installed'),null);
});

test('the extension tool knows the seam: modules are a local registry, screens a client registry, and module packages are strict',()=>{
 assert.ok(LOCAL_REGISTRIES.some(r=>r.seam==='modules'&&r.file==='shared/extensions/modules.mjs'));
 assert.ok(CLIENT_REGISTRIES.some(r=>r.seam==='screens'&&r.file==='app/src/extensions/screens.jsx'));
 const m=readPackage(FIXTURE);assert.equal(m.seam,'modules');assert.deepEqual(m.outbound,[]);
 const variant=edit=>{const dir=join(scratch,'pkg-'+Math.random().toString(36).slice(2));cpSync(FIXTURE,dir,{recursive:true});const f=join(dir,'extension.json'),j=JSON.parse(readFileSync(f,'utf8'));edit(j);writeFileSync(f,JSON.stringify(j));return dir};
 assert.throws(()=>readPackage(variant(j=>{j.outbound=['https://api.example.com']})),/may not contact outside services/);
 assert.throws(()=>readPackage(variant(j=>{j.registry=j.registry.filter(l=>l.seam!=='screens')})),/needs a screens line/);
 assert.throws(()=>readPackage(variant(j=>{j.registry[1].id='other'})),/needs a modules line|only its own/);
});

// ---- end to end on a scratch copy ---------------------------------------------------------------------------
let n=0;
function copy(){
 const dir=join(scratch,'copy-'+(++n));
 cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});
 for(const d of ['cloud','scripts','host','src'])cpSync(join(root,'app',d),join(dir,'app',d),{recursive:true});
 cpSync(join(root,'app/package.json'),join(dir,'app/package.json'));
 cpSync(join(root,'design-system/bayit-icons.json'),join(dir,'design-system/bayit-icons.json'));
 for(const r of [...LOCAL_REGISTRIES,...CLIENT_REGISTRIES])if(existsSync(join(dir,r.file)))writeFileSync(join(dir,r.file),r.client?`export const ${r.name}=[];\n`:emptyRegistry(r));
 writeFileSync(join(dir,'shared/extensions/installed.json'),'[]\n');
 // A family's copy has its installed extensions' files; the scratch copy starts as upstream ships it, without them.
 for(const f of JSON.parse(readFileSync(join(root,'shared/extensions/installed.json'),'utf8')).flatMap(x=>x?.files||[]))rmSync(join(dir,f),{force:true});
 symlinkSync(join(root,'app/node_modules'),join(dir,'app/node_modules'));
 mkdirSync(join(dir,'tests'));cpSync(join(root,'tests/feature-module-conformance.mjs'),join(dir,'tests/feature-module-conformance.mjs'));
 return dir;
}
function tree(dir){
 const out={};
 const walk=rel=>{for(const e of readdirSync(join(dir,rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name;if(p==='app/node_modules')continue;if(e.isDirectory())walk(p);else out[p]=createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')}};
 walk('');return out;
}
const tool=(dir,...args)=>spawnSync(process.execPath,[join(dir,'app/scripts/bayit-extension.mjs'),...args,'--root',dir],{encoding:'utf8',cwd:dir,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='NODE_TEST_CONTEXT'))});
const ok=(r,label)=>assert.equal(r.status,0,label+':\n'+r.stdout+r.stderr);
let bundles=0;
async function server(dir){
 const req=createRequire(join(root,'app/package.json')),out=join(scratch,'worker-'+(++bundles)+'.mjs');
 await req('esbuild').build({entryPoints:[join(dir,'app/cloud/worker.mjs')],outfile:out,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'silent',banner:{js:"import {createRequire as fixtureRequire} from 'node:module';const require=fixtureRequire(import.meta.url);"}});
 return (await import(pathToFileURL(out).href)).default;
}

test('Lent & borrowed: apply, serve over HTTP with the privacy rules, remove (kept, hidden), reinstall (back), download, delete',async()=>{
 const dir=copy(),before=tree(dir);
 // Apply: copies the files, adds the three registry lines and runs the package test (the conformance suite).
 ok(tool(dir,'apply',FIXTURE),'apply');
 assert.match(readFileSync(join(dir,'shared/extensions/modules.mjs'),'utf8'),/^import \{LENDING_MODULE as ext_lending_1\} from '\.\/lending\.mjs'; \/\/ bayit-extension: lending$/m);
 assert.match(readFileSync(join(dir,'app/src/extensions/screens.jsx'),'utf8'),/^export const EXTRA_SCREENS=\[ext_lending_2\];$/m);
 ok(tool(dir,'check'),'check');
 const installed=JSON.parse(readFileSync(join(dir,'shared/extensions/installed.json'),'utf8'));
 assert.deepEqual(installed[0].entries,{features:['lending'],modules:['lending']});

 // One database for the whole story; three server builds of the same copy (installed, removed, reinstalled).
 const DB=openD1(':memory:');migrate(DB,join(dir,'app/cloud/migrations'));
 const origin='http://127.0.0.1:55811',now=new Date().toISOString();
 const people=[{id:'p',role:'parent'},{id:'a',role:'adult'},{id:'c',role:'child'}];
 const home=blankState('home','Fictional home',{id:'p',name:'Parent',role:'parent'});home.members=people.map(m=>({...m,name:m.id,he:m.id,color:'blue'}));for(const m of people)home.profiles[m.id]??={name:m.id,he:m.id,xp:0};
 home.preferences.features={...home.preferences.features,lending:true};
 const other=blankState('other','Other home',{id:'o',name:'Other',role:'parent'});
 for(const u of [...people,{id:'o'}])await DB.batch([DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind(u.id,u.id,u.id+'@example.test'),DB.prepare('INSERT INTO sessions(id,sessionToken,userId,expires) VALUES(?,?,?,?)').bind('s-'+u.id,'t-'+u.id,u.id,new Date(Date.now()+86400000).toISOString())]);
 await DB.batch([DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('home','Fictional home','p',now),DB.prepare('INSERT INTO households VALUES(?,?,?,?)').bind('other','Other home','o',now),
  ...people.map(m=>DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('home',m.id,m.id,m.role,now)),DB.prepare('INSERT INTO memberships VALUES(?,?,?,?,?)').bind('other','o','o','parent',now),
  DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('home',JSON.stringify(home)),DB.prepare('INSERT INTO household_data VALUES(?,?,0)').bind('other',JSON.stringify(other))]);
 const env={DB,AUTH_SECRET:'synthetic-feature-module-secret',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',APP_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),BAYIT_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('fixture')}};
 const call=async(worker,actor,path,{method='GET',body,household='home'}={})=>{const r=await worker.fetch(new Request(origin+path,{method,headers:{Cookie:'authjs.session-token=t-'+actor,Origin:origin,'X-Bayit-Household':household,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);return {status:r.status,body:await r.json().catch(()=>null)}};
 const state=async(worker,actor,household='home')=>call(worker,actor,'/api/households/'+household+'/state',{household});
 const change=async(worker,actor,changes)=>{const s=await state(worker,actor);return call(worker,actor,'/api/households/home/changes',{method:'POST',body:{baseRevision:s.body.revision,changes}})};
 const rec=(id,owner,visibility,extra={})=>({id,ownerId:owner,visibility,allowedIds:visibility==='selected'?['a']:[],createdAt:now.slice(0,19)+'.000Z',createdBy:owner,title:'Item '+id,direction:'lent',returned:false,...extra});
 const op=value=>({collection:'ext:lending/items',id:value.id,value,before:null});
 const items=r=>(r.body?.data?.extensions?.lending?.items||[]).map(x=>x.id).sort();

 const installedServer=await server(dir);
 let r=await change(installedServer,'p',[op(rec('p-family','p','family')),op(rec('p-private','p','private')),op(rec('p-selected','p','selected'))]);
 assert.equal(r.status,200,JSON.stringify(r.body));
 r=await change(installedServer,'a',[op(rec('a-private','a','private'))]);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(items(await state(installedServer,'p')),['p-family','p-private','p-selected']);
 assert.deepEqual(items(await state(installedServer,'a')),['a-private','p-family','p-selected']);
 assert.deepEqual(items(await state(installedServer,'c')),['p-family'],'a child reads family records only');
 r=await change(installedServer,'c',[op(rec('c-new','c','family'))]);assert.ok(r.status>=400,'a child cannot add (childrenMay: read)');assert.match(r.body.error,/parent manages/);
 r=await change(installedServer,'a',[op({...rec('p-private','p','private'),title:'Taken'})]);assert.equal(r.status,403,'another adult cannot touch a private record');
 r=await change(installedServer,'a',[{collection:'ext:lending/items',id:'p-family',delete:true}]);assert.equal(r.status,403);
 r=await change(installedServer,'p',[op({...rec('p-x','p','family'),secret:'x'})]);assert.equal(r.status,400,'undeclared fields are refused');
 // Another household: no access to this one, and its own copy never holds this household's records.
 assert.equal((await state(installedServer,'o','home')).status,403);
 const otherState=await state(installedServer,'o','other');assert.equal(otherState.status,200);assert.doesNotMatch(JSON.stringify(otherState.body),/p-family|a-private/);
 assert.equal((await call(installedServer,'o','/api/households/home/extensions/lending/export',{household:'home'})).status,403);
 // Feature off for the family: writes refused, data kept.
 const stored=async()=>JSON.parse((await DB.prepare('SELECT state FROM household_data WHERE household_id=?').bind('home').first()).state);
 r=await change(installedServer,'p',[{collection:'preferences',id:'features',value:{...(await state(installedServer,'p')).body.data.preferences.features,lending:false}}]);assert.equal(r.status,200,JSON.stringify(r.body));
 r=await change(installedServer,'p',[op(rec('p-off','p','family'))]);assert.equal(r.status,400);assert.match(r.body.error,/turned off/);
 r=await change(installedServer,'p',[{collection:'preferences',id:'features',value:{...(await state(installedServer,'p')).body.data.preferences.features,lending:true}}]);assert.equal(r.status,200);
 assert.equal((await stored()).extensions.lending.items.length,4);

 // Remove the extension's code: the copy is byte-identical to before, the data stays stored and is not served.
 ok(tool(dir,'remove','lending'),'remove');
 assert.deepEqual(tree(dir),before,'remove leaves the copy exactly as it was');
 const removedServer=await server(dir);
 for(const who of ['p','a','c'])assert.equal((await state(removedServer,who)).body.data.extensions,undefined,who+' gets nothing from a removed module');
 assert.equal((await stored()).extensions.lending.items.length,4,'still stored');
 const keptBytes=JSON.stringify((await stored()).extensions.lending);
 r=await change(removedServer,'p',[{collection:'tasks',id:'t1',value:{id:'t1',ownerId:'p',visibility:'family',allowedIds:[],title:'Unrelated save'},before:null}]);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(JSON.stringify((await stored()).extensions.lending),keptBytes,'unrelated saves keep it byte for byte');
 r=await change(removedServer,'p',[op(rec('p-ghost','p','family'))]);assert.equal(r.status,400,'no writes to a removed module');
 r=await call(removedServer,'p','/api/households/home/extensions');assert.equal(r.status,200);assert.deepEqual(r.body.kept.map(k=>[k.id,k.installed,k.privateOthers]),[['lending',false,1]],'one other adult has a private record in it: a count only');
 assert.deepEqual(r.body.kept[0].name,{en:'Lent & borrowed',he:'השאלות'},'the removed extension is still known by its own name');
 assert.doesNotMatch(JSON.stringify(r.body),/a-private|Item a-private/,'the list never reveals what others kept');
 assert.equal((await call(removedServer,'a','/api/households/home/extensions')).status,403,'only parents list kept data');

 // Reinstall: everything is served again, with the same rules.
 ok(tool(dir,'apply',FIXTURE),'apply again');
 const againServer=await server(dir);
 assert.deepEqual(items(await state(againServer,'p')),['p-family','p-private','p-selected']);
 assert.deepEqual(items(await state(againServer,'c')),['p-family']);

 // Download, then a deliberate delete: parents only, recent sign-in, named twice, revision-checked.
 r=await call(againServer,'p','/api/households/home/extensions/lending/export');assert.equal(r.status,200);
 assert.deepEqual(r.body.records.items.map(x=>x.id).sort(),['p-family','p-private','p-selected'],'the parent’s download holds what the parent may see, not another adult’s private record');
 assert.equal((await call(againServer,'c','/api/households/home/extensions/lending/export')).status,200,'a child may download what a module for everyone shows them');
 const del=async(who,body)=>call(againServer,who,'/api/households/home/extensions/lending/delete',{method:'POST',body});
 const revision=(await state(againServer,'p')).body.revision;
 assert.equal((await del('a',{confirm:'lending',baseRevision:revision})).status,403);
 assert.equal((await del('p',{confirm:'wrong',baseRevision:revision})).status,400);
 assert.equal((await del('p',{confirm:'lending',baseRevision:revision-1})).status,409);
 await DB.prepare('UPDATE session_auth SET authenticated_at=0 WHERE session_token=?').bind('t-p').run();
 r=await del('p',{confirm:'lending',baseRevision:revision});assert.equal(r.status,403);assert.equal(r.body.code,'REAUTH_REQUIRED');
 await DB.prepare('UPDATE session_auth SET authenticated_at=? WHERE session_token=?').bind(Date.now(),'t-p').run();
 r=await del('p',{confirm:'lending',baseRevision:revision});assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await stored()).extensions,undefined,'deleted');
 assert.deepEqual(items(await state(againServer,'p')),[]);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM security_audit WHERE household_id='home' AND resource_id='ext:lending'").first()).n,1,'audited');
 ok(tool(dir,'remove','lending'),'remove again');assert.deepEqual(tree(dir),before);
 DB.close();
});

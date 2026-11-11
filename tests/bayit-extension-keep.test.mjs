// Updating Bayit keeps installed extensions (work package 3.5; app/scripts/bayit-extension-keep.mjs, bayit-update skill).
// Every test works on scratch COPIES with the two fixture extensions (a statement format and a feature module) and runs
// this folder's tool with --root, the way the bayit-update skill runs the NEW version's tool on an older copy.
import {describe,test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,existsSync,rmSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CLIENT_REGISTRIES} from '../app/scripts/bayit-extension.mjs';
import {LOCAL_REGISTRIES,emptyRegistry} from '../app/scripts/local-registries.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const BANK=join(root,'tests/fixtures/extensions/bayit-add-example-bank'),LENDING=join(root,'tests/fixtures/extensions/bayit-add-lending');
const scratch=mkdtempSync(join(tmpdir(),'bayit-keep-'));
after(()=>rmSync(scratch,{recursive:true,force:true}));
let n=0;
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='NODE_TEST_CONTEXT'));
// Asynchronous, so the tests below (each on its own copies) run at the same time.
const tool=(dir,...args)=>new Promise(done=>{const child=spawn(process.execPath,[join(root,'app/scripts/bayit-extension.mjs'),...args,'--root',dir],{cwd:dir,env});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('close',status=>done({status,stdout,stderr}))});
const ok=(r,label)=>assert.equal(r.status,0,label+':\n'+r.stdout+r.stderr);
const read=(dir,p)=>readFileSync(join(dir,p),'utf8');
const installed=dir=>JSON.parse(read(dir,'shared/extensions/installed.json'));

// A copy as upstream ships it (empty local registries), then with both fixtures applied.
function copy(){
 const dir=join(scratch,'copy-'+(++n));
 cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});
 for(const d of ['cloud','scripts','host','src'])cpSync(join(root,'app',d),join(dir,'app',d),{recursive:true});
 cpSync(join(root,'app/package.json'),join(dir,'app/package.json'));
 cpSync(join(root,'design-system/bayit-icons.json'),join(dir,'design-system/bayit-icons.json'));
 for(const r of [...LOCAL_REGISTRIES,...CLIENT_REGISTRIES])if(existsSync(join(dir,r.file)))writeFileSync(join(dir,r.file),r.client?`export const ${r.name}=[];\n`:emptyRegistry(r));
 writeFileSync(join(dir,'shared/extensions/installed.json'),'[]\n');
 // A family's copy has its installed extensions' files; the scratch copy starts as upstream ships it, without them.
 for(const f of JSON.parse(read(root,'shared/extensions/installed.json')).flatMap(x=>x?.files||[]))rmSync(join(dir,f),{force:true});
 symlinkSync(join(root,'app/node_modules'),join(dir,'app/node_modules'));
 mkdirSync(join(dir,'tests'));cpSync(join(root,'tests/feature-module-conformance.mjs'),join(dir,'tests/feature-module-conformance.mjs'));
 return dir;
}
async function withExtensions(){
 const dir=copy();
 // The bank package lives in the family's own local-extensions/ folder, which a fresh download does not have.
 cpSync(BANK,join(dir,'local-extensions/example-bank'),{recursive:true});
 // --no-tests: their own tests run once restore re-applies them, which is what these tests are about.
 ok(await tool(dir,'apply',join(dir,'local-extensions/example-bank'),'--no-tests'),'apply bank');
 ok(await tool(dir,'apply',LENDING,'--no-tests'),'apply lending');
 return dir;
}
function tree(dir){
 const out={};
 const walk=rel=>{for(const e of readdirSync(join(dir,rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name;if(p==='app/node_modules')continue;if(e.isDirectory())walk(p);else out[p]=createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')}};
 walk('');return out;
}
// What an upstream release does to a copy: a new version, a core change, and new wording in the EMPTY local
// registry files (including the comment line right above the list, which made `git stash pop` conflict).
function upstreamUpdate(dir,version='1.99.0'){
 const pj=JSON.parse(read(dir,'app/package.json'));pj.version=version;writeFileSync(join(dir,'app/package.json'),JSON.stringify(pj,null,2)+'\n');
 writeFileSync(join(dir,'shared/features.mjs'),read(dir,'shared/features.mjs')+'\n// '+version+': a core change.\n');
 for(const r of [...LOCAL_REGISTRIES,...CLIENT_REGISTRIES]){const p=join(dir,r.file);if(!existsSync(p))continue;
  const text=read(dir,r.file);assert.match(text,new RegExp('^export const '+r.name+'=\\[\\];$','m'),r.file+' is empty before an update');
  writeFileSync(p,'// Local registry, wording of '+version+'.\n'+text.replace(/^export const/m,'// (changed in '+version+')\nexport const'));}
}
const fresh=()=>join(scratch,'kept-'+(++n));

describe('updating Bayit keeps installed extensions',{concurrency:true},()=>{
 test('keep, update, restore: both extensions come back into the NEW registry files, byte for byte, and pass',async()=>{
 const dir=await withExtensions(),records=installed(dir),files=Object.fromEntries(records.flatMap(x=>x.files).map(f=>[f,read(dir,f)]));
 const kept=fresh();
 const k=await tool(dir,'keep',kept);ok(k,'keep');assert.match(k.stdout,/Kept example-bank 1\.0\.0, lending 1\.0\.0/);
 // Taken out: the local files are as upstream ships them, so a git pull or download meets no local change.
 assert.deepEqual(installed(dir),[]);
 for(const f of Object.keys(files))assert.equal(existsSync(join(dir,f)),false,f+' is out of the copy');
 for(const r of LOCAL_REGISTRIES)if(existsSync(join(dir,r.file)))assert.equal(read(dir,r.file),emptyRegistry(r),r.file+' is back to the shipped empty file');
 assert.ok(existsSync(join(kept,'keep.json'))&&existsSync(join(kept,'sources/example-bank/extension.json')),'records, files and the family’s own package are kept');
 assert.equal(JSON.parse(readFileSync(join(kept,'keep.json'),'utf8')).bayit,JSON.parse(read(root,'app/package.json')).version);

 upstreamUpdate(dir);
 const r=await tool(dir,'restore',kept);ok(r,'restore');
 assert.match(r.stdout,/Back in place on Bayit 1\.99\.0: example-bank, lending\. Their tests passed/);
 assert.deepEqual(installed(dir),records,'the install records are exactly the original ones');
 for(const [f,text] of Object.entries(files))assert.equal(read(dir,f),text,f+' restored byte for byte');
 const modules=read(dir,'shared/extensions/modules.mjs');
 assert.match(modules,/wording of 1\.99\.0/,'the new upstream wording is kept');
 assert.match(modules,/^import \{LENDING_MODULE as ext_lending_1\} from '\.\/lending\.mjs'; \/\/ bayit-extension: lending$/m);
 assert.match(modules,/^export const EXTRA_MODULES=\[ext_lending_1\];$/m);
 ok(await tool(dir,'check'),'check after restore');
 // Restoring twice changes nothing.
 const once=tree(dir);const again=await tool(dir,'restore',kept);ok(again,'restore again');assert.match(again.stdout,/Already in place: example-bank, lending/);assert.deepEqual(tree(dir),once);
});

 test('a fresh download: the family’s own package folder comes back too',async()=>{
 const old=await withExtensions(),kept=fresh();ok(await tool(old,'keep',kept),'keep');
 const dir=copy();upstreamUpdate(dir);// the new download: no local-extensions/, empty registries
 ok(await tool(dir,'restore',kept),'restore');
 assert.deepEqual(installed(dir).map(x=>x.id),['example-bank','lending']);
 assert.ok(existsSync(join(dir,'local-extensions/example-bank/extension.json')));
 const c=await tool(dir,'check');ok(c,'check');assert.doesNotMatch(c.stdout,/package folder .* is gone/);
});

 test('an extension that no longer fits is left out whole, the rest is restored, and going back brings it back',async()=>{
 const dir=await withExtensions(),kept=fresh();ok(await tool(dir,'keep',kept),'keep');
 const features=read(dir,'shared/features.mjs'),pj=read(dir,'app/package.json');
 upstreamUpdate(dir,'2.0.0');
 // Bayit 2.0.0 has a stricter feature check that the lending module does not meet.
 const strict=read(dir,'shared/features.mjs').replace("joinRegistry('feature',CORE_FEATURES,EXTRA_FEATURES,featureProblem)","joinRegistry('feature',CORE_FEATURES,EXTRA_FEATURES,(e,all)=>e.id==='lending'?'needs a summary field (Bayit 2.0.0).':featureProblem(e,all))");
 assert.notEqual(strict,read(dir,'shared/features.mjs'));writeFileSync(join(dir,'shared/features.mjs'),strict);
 const r=await tool(dir,'restore',kept);
 assert.equal(r.status,1,'restore reports the misfit');
 assert.match(r.stdout,/Back in place on Bayit 2\.0\.0: example-bank\./);
 assert.match(r.stdout,/"lending" 1\.0\.0 does not fit Bayit 2\.0\.0 and was left out:\n.*needs a summary field/);
 assert.match(r.stdout,/Do not deploy\. Nothing live has changed yet\. Choose one:/);
 assert.match(r.stdout,/1\. Keep Bayit \d+\.\d+\.\d+ for now: put the folder of the old copy back, then run: node app\/scripts\/bayit-extension\.mjs restore /);
 assert.match(r.stdout,/2\. Update without "lending": its saved records stay stored and hidden/);
 assert.match(r.stdout,/3\. Ask its author/);
 // Not half-applied: the copy loads and checks clean, with no trace of lending.
 assert.deepEqual(installed(dir).map(x=>x.id),['example-bank']);
 assert.equal(existsSync(join(dir,'shared/extensions/lending.mjs')),false);
 assert.doesNotMatch(read(dir,'shared/extensions/modules.mjs')+read(dir,'shared/extensions/features.mjs')+read(dir,'app/src/extensions/screens.jsx'),/lending/);
 ok(await tool(dir,'check'),'check without lending');
 // Choice 1: back to the old code, restore again.
 writeFileSync(join(dir,'shared/features.mjs'),features);writeFileSync(join(dir,'app/package.json'),pj);
 const back=await tool(dir,'restore',kept);ok(back,'restore on the old version');
 assert.match(back.stdout,/Back in place on Bayit [\d.]+: lending\./);assert.match(back.stdout,/Already in place: example-bank\./);
 ok(await tool(dir,'check'),'check');
});

 test('a partial update (registry lines lost, files left behind) is repaired; a file the new Bayit owns is not overwritten',async()=>{
 const dir=await withExtensions(),kept=fresh();
 // Keep first, then put the copy into the state "git checkout -- ." leaves: files there, lines and records gone.
 const files=installed(dir).flatMap(x=>x.files).map(f=>[f,read(dir,f)]);
 ok(await tool(dir,'keep',kept),'keep');
 for(const [f,text] of files){mkdirSync(dirname(join(dir,f)),{recursive:true});writeFileSync(join(dir,f),text)}
 ok(await tool(dir,'restore',kept),'restore over leftovers');ok(await tool(dir,'check'),'check');
 // Now the new Bayit ships its own file where the bank extension's file was.
 const d2=await withExtensions(),k2=fresh();ok(await tool(d2,'keep',k2),'keep');
 writeFileSync(join(d2,'shared/extensions/example-bank.mjs'),'export const CORE_THING=1;\n');
 const r=await tool(d2,'restore',k2);assert.equal(r.status,1);
 assert.match(r.stdout,/"example-bank" 1\.0\.0 does not fit [\s\S]* has its own file at shared\/extensions\/example-bank\.mjs/);
 assert.equal(read(d2,'shared/extensions/example-bank.mjs'),'export const CORE_THING=1;\n','never overwritten');
 assert.match(r.stdout,/Back in place on Bayit [\d.]+: lending\./);
});

 test('a file the family edited stays edited and is still reported as edited',async()=>{
 const dir=await withExtensions(),kept=fresh(),f='shared/extensions/example-bank.mjs';
 writeFileSync(join(dir,f),read(dir,f)+'// our own note\n');
 assert.match((await tool(dir,'check')).stdout,/example-bank.*was changed after it was applied/);
 ok(await tool(dir,'keep',kept),'keep');upstreamUpdate(dir);ok(await tool(dir,'restore',kept),'restore');
 assert.match(read(dir,f),/our own note/);
 assert.match((await tool(dir,'check')).stdout,/example-bank.*was changed after it was applied/);
});

 test('keep refuses a folder inside the copy, a folder in use, and a copy with problems, and changes nothing',async()=>{
 const dir=await withExtensions(),before=tree(dir);
 let r=await tool(dir,'keep',join(dir,'kept'));assert.equal(r.status,1);assert.match(r.stderr,/outside this copy/);
 const used=fresh();mkdirSync(used);writeFileSync(join(used,'x'),'');
 r=await tool(dir,'keep',used);assert.equal(r.status,1);assert.match(r.stderr,/not empty/);
 rmSync(join(dir,'tests/extension-lending.test.mjs'));const broken=tree(dir);
 r=await tool(dir,'keep',fresh());assert.equal(r.status,1);assert.match(r.stderr,/have problems, so nothing was kept or changed[\s\S]*extension-lending\.test\.mjs is missing/);
 assert.deepEqual(tree(dir),broken);
 assert.notDeepEqual(before,broken);
 r=await tool(dir,'restore',fresh());assert.equal(r.status,1);assert.match(r.stderr,/no keep\.json/);
});

 test('no extensions installed: keep and restore are harmless no-ops',async()=>{
 const dir=copy(),before=tree(dir),kept=fresh();
 const k=await tool(dir,'keep',kept);ok(k,'keep');assert.match(k.stdout,/No extensions installed; nothing to keep/);
 const r=await tool(dir,'restore',kept);ok(r,'restore');assert.match(r.stdout,/No extensions were kept/);
 assert.deepEqual(tree(dir),before);
});
});

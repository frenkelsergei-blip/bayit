// Extension packages (Modular Bayit, work package 3.1, docs/extension-skills.md): app/scripts/bayit-extension.mjs
// applies, removes and checks them. Every test works in a temporary copy, never in this folder.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,existsSync,rmSync,readdirSync,symlinkSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {allowedPath} from '../app/scripts/bayit-extension.mjs';
import {LOCAL_REGISTRIES,emptyRegistry} from '../app/scripts/local-registries.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),src=p=>readFileSync(join(root,p),'utf8');
const scratch=mkdtempSync(join(tmpdir(),'bayit-extension-skills-'));
process.on('exit',()=>rmSync(scratch,{recursive:true,force:true}));
const EXAMPLE=join(root,'tests/fixtures/extensions/bayit-add-example-bank');
const TEMPLATES={'ai-providers':join(root,'.agents/skills/bayit-add-ai-provider/template'),'statement-formats':join(root,'.agents/skills/bayit-add-statement-format/template')};
let n=0;

// The parts of Bayit the registries and the script need; node_modules is linked, not copied.
function copy(){
 const dir=join(scratch,'copy-'+(++n));
 cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});
 for(const d of ['cloud','scripts'])cpSync(join(root,'app',d),join(dir,'app',d),{recursive:true});
 cpSync(join(root,'app/package.json'),join(dir,'app/package.json'));
 // Start from empty local registries, as upstream ships them, also when this folder has extensions installed.
 for(const r of LOCAL_REGISTRIES)if(existsSync(join(dir,r.file)))writeFileSync(join(dir,r.file),emptyRegistry(r));
 writeFileSync(join(dir,'shared/extensions/installed.json'),'[]\n');
 // A family's copy has its installed extensions' files; the scratch copy starts as upstream ships it, without them.
 for(const f of JSON.parse(readFileSync(join(root,'shared/extensions/installed.json'),'utf8')).flatMap(x=>x?.files||[]))rmSync(join(dir,f),{force:true});
 symlinkSync(join(root,'app/node_modules'),join(dir,'app/node_modules'));
 mkdirSync(join(dir,'tests'));
 return dir;
}
// Every file (and empty folder) in a copy with its hash, to prove a tree is exactly as it was.
function tree(dir){
 const out={};
 const walk=rel=>{const entries=readdirSync(join(dir,rel),{withFileTypes:true});if(!entries.length&&rel)out[rel+'/']='(empty folder)';
  for(const e of entries){const p=rel?rel+'/'+e.name:e.name;if(p==='app/node_modules')continue;if(e.isSymbolicLink())out[p]='(link)';else if(e.isDirectory())walk(p);else out[p]=createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')}};
 walk('');return out;
}
const run=(dir,...args)=>spawnSync(process.execPath,[join(dir,'app/scripts/bayit-extension.mjs'),...args],{encoding:'utf8',cwd:dir});
const ok=(r,label)=>assert.equal(r.status,0,label+':\n'+r.stdout+r.stderr);
const installed=dir=>JSON.parse(readFileSync(join(dir,'shared/extensions/installed.json'),'utf8'));
// A package to change: a copy of the example in the scratch folder.
function pkg(edit,from=EXAMPLE){
 const dir=join(scratch,'pkg-'+(++n));cpSync(from,dir,{recursive:true});
 const file=join(dir,'extension.json'),m=JSON.parse(readFileSync(file,'utf8'));
 const next=edit?edit(m,dir)??m:m;writeFileSync(file,JSON.stringify(next,null,1));return dir;
}
// Load a copy's registries in a fresh process (each copy is its own module graph).
const formats=dir=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(join(dir,'shared/finance-parse.mjs'))});console.log(JSON.stringify(m.STATEMENT_FORMATS))`]).toString());

test('the example extension applies, passes the registry checks and its tests, and removes to a clean tree',()=>{
 const dir=copy(),before=tree(dir);
 ok(run(dir,'apply',EXAMPLE),'apply');
 assert.ok(existsSync(join(dir,'shared/extensions/example-bank.mjs'))&&existsSync(join(dir,'tests/extension-example-bank.test.mjs')));
 const reg=readFileSync(join(dir,'shared/extensions/statement-formats.mjs'),'utf8');
 assert.match(reg,/^import \{EXAMPLE_BANK as ext_example_bank\} from '\.\/example-bank\.mjs'; \/\/ bayit-extension: example-bank$/m);
 assert.match(reg,/^export const EXTRA_STATEMENT_FORMATS=\[ext_example_bank\];$/m);
 assert.deepEqual(formats(dir),['leumi','max','example-bank']);
 const [record]=installed(dir);
 assert.equal(record.id,'example-bank');assert.equal(record.version,'1.0.0');assert.deepEqual(record.entries,{'statement-formats':['example-bank']});
 assert.deepEqual(record.files,['shared/extensions/example-bank.mjs','tests/extension-example-bank.test.mjs']);
 assert.deepEqual(Object.keys(record.hashes),record.files);assert.deepEqual(record.outbound,[]);
 const check=run(dir,'check');ok(check,'check');assert.match(check.stdout,/example-bank 1\.0\.0 · statement-formats: example-bank/);
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 ok(spawnSync(process.execPath,['--test','tests/extension-example-bank.test.mjs'],{cwd:dir,encoding:'utf8',env}),'its tests in the copy');
 ok(run(dir,'remove','example-bank'),'remove');
 assert.deepEqual(tree(dir),before);
 ok(run(dir,'check'),'check after remove');
});

test('apply refuses to overwrite an existing file and leaves the copy as it was',()=>{
 const dir=copy();mkdirSync(join(dir,'tests'),{recursive:true});writeFileSync(join(dir,'tests/extension-example-bank.test.mjs'),'// mine\n');
 const before=tree(dir),r=run(dir,'apply',EXAMPLE);
 assert.equal(r.status,1);assert.match(r.stderr,/tests\/extension-example-bank\.test\.mjs already exists\. Bayit never overwrites a file/);
 assert.deepEqual(tree(dir),before);
});

test('apply refuses paths outside the declared extension folders',()=>{
 for(const [bad,why] of [['../evil.mjs',/plain relative path/],['/etc/evil.mjs',/plain relative path/],['shared/extensions/../features.mjs',/plain relative path/],
  ['app/src/App.jsx',/outside the extension folders/],['shared/finance.mjs',/outside the extension folders/],['shared/extensions/statement-formats.mjs',/local registry file/],
  ['shared/extensions/installed.json',/local registry file/],['shared/extensions/other-bank.mjs',/must be named example-bank/],['tests/finance.test.mjs',/outside the extension folders/],['tests/sub/extension-example-bank.test.mjs',/outside/]]){
  assert.match(allowedPath('example-bank',bad),why,bad);
  const dir=copy(),before=tree(dir),r=run(dir,'apply',pkg(m=>{m.files=[...m.files,bad]}));
  assert.equal(r.status,1,bad);assert.match(r.stderr,/extension\.json: file/,bad);assert.deepEqual(tree(dir),before,bad);
 }
 for(const good of ['shared/extensions/example-bank.mjs','shared/extensions/example-bank-rules.mjs','app/cloud/extensions/example-bank/adapter.mjs','app/src/extensions/example-bank-panel.jsx','tests/extension-example-bank-more.test.mjs','tests/fixtures/extension-example-bank/rows.json'])assert.equal(allowedPath('example-bank',good),'',good);
});

test('apply refuses undeclared payload files, links in the package and links out of the copy',()=>{
 let dir=copy(),before=tree(dir);
 let r=run(dir,'apply',pkg((m,d)=>{writeFileSync(join(d,'payload/shared/extensions/example-bank-extra.mjs'),'export {};\n')}));
 assert.equal(r.status,1);assert.match(r.stderr,/payload\/shared\/extensions\/example-bank-extra\.mjs, which extension\.json does not declare/);assert.deepEqual(tree(dir),before);
 r=run(dir,'apply',pkg((m,d)=>{const f=join(d,'payload/shared/extensions/example-bank.mjs');rmSync(f);symlinkSync(join(root,'shared/finance.mjs'),f)}));
 assert.equal(r.status,1);assert.match(r.stderr,/must be a regular file, not a link/);assert.deepEqual(tree(dir),before);
 // A folder inside the copy that links elsewhere: writing through it would leave the copy.
 dir=copy();const outside=join(scratch,'outside-'+n);mkdirSync(outside);symlinkSync(outside,join(dir,'shared/extensions/example-bank'));before=tree(dir);
 r=run(dir,'apply',pkg((m,d)=>{mkdirSync(join(d,'payload/shared/extensions/example-bank'));writeFileSync(join(d,'payload/shared/extensions/example-bank/x.mjs'),'export {};\n');m.files.push('shared/extensions/example-bank/x.mjs')}));
 assert.equal(r.status,1);assert.match(r.stderr,/outside this copy of Bayit/);assert.deepEqual(readdirSync(outside),[]);assert.deepEqual(tree(dir),before);
});

test('a package that fails the registry check or its own tests is rolled back completely',()=>{
 const dir=copy(),before=tree(dir);
 // The entry's id in the code differs from the one extension.json records.
 let r=run(dir,'apply',pkg(m=>{m.registry[0].id='other-bank'}));
 assert.equal(r.status,1);assert.match(r.stderr,/did not pass, so nothing was changed/);assert.match(r.stderr,/"other-bank"|example-bank/);assert.deepEqual(tree(dir),before);
 // A core id is never replaced.
 r=run(dir,'apply',pkg((m,d)=>{const f=join(d,'payload/shared/extensions/example-bank.mjs');writeFileSync(f,readFileSync(f,'utf8').replace("id:'example-bank'","id:'max'"));m.registry[0].id='max'}));
 assert.equal(r.status,1);assert.match(r.stderr,/already registered/);assert.deepEqual(tree(dir),before);
 // Its tests fail.
 r=run(dir,'apply',pkg((m,d)=>{const f=join(d,'tests/extension-example-bank.test.mjs');writeFileSync(f,readFileSync(f,'utf8').replace("'0042'","'9999'"))}));
 assert.equal(r.status,1);assert.match(r.stderr,/its tests failed/);assert.deepEqual(tree(dir),before);
 // A Bayit that is too old, a dependency that is not pinned in app/package.json, a malformed manifest.
 r=run(dir,'apply',pkg(m=>{m.minBayit='99.0.0'}));assert.match(r.stderr,/needs Bayit 99\.0\.0 or newer/);
 r=run(dir,'apply',pkg(m=>{m.dependencies={'left-pad':'1.3.0'}}));assert.match(r.stderr,/npm install --save-exact left-pad@1\.3\.0/);
 r=run(dir,'apply',pkg(m=>{m.dependencies={'left-pad':'^1.3.0'}}));assert.match(r.stderr,/pinned to an exact version/);
 r=run(dir,'apply',pkg(m=>{m.outbound=['http://api.example.com']}));assert.match(r.stderr,/exact https origin/);
 r=run(dir,'apply',pkg(m=>{delete m.name.he}));assert.match(r.stderr,/English and Hebrew/);
 assert.deepEqual(tree(dir),before);
});

test('two extensions on the same seam coexist and each removes only itself',()=>{
 const dir=copy(),before=tree(dir);
 ok(run(dir,'apply',EXAMPLE),'apply example');ok(run(dir,'apply',TEMPLATES['statement-formats']),'apply template');
 assert.deepEqual(formats(dir),['leumi','max','example-bank','my-bank']);
 assert.match(readFileSync(join(dir,'shared/extensions/statement-formats.mjs'),'utf8'),/=\[ext_example_bank,ext_my_bank\];/);
 let r=run(dir,'apply',EXAMPLE);assert.equal(r.status,1);assert.match(r.stderr,/already installed \(version 1\.0\.0\)/);
 ok(run(dir,'remove','example-bank'),'remove example');
 assert.deepEqual(formats(dir),['leumi','max','my-bank']);assert.deepEqual(installed(dir).map(x=>x.id),['my-bank']);
 ok(run(dir,'check'),'check with one left');
 ok(run(dir,'remove','my-bank'),'remove template');assert.deepEqual(tree(dir),before);
 r=run(dir,'remove','my-bank');assert.equal(r.status,1);assert.match(r.stderr,/"my-bank" is not installed/);
});

test('update replaces a version in place; remove keeps files the person changed unless forced',()=>{
 const dir=copy(),before=tree(dir);ok(run(dir,'apply',EXAMPLE),'apply');
 const v2=pkg((m,d)=>{m.version='1.1.0';const f=join(d,'payload/shared/extensions/example-bank.mjs');writeFileSync(f,readFileSync(f,'utf8')+'// 1.1.0\n')});
 let r=run(dir,'apply',v2,'--update');ok(r,'update');assert.match(r.stdout,/Updated example-bank 1\.1\.0 \(was 1\.0\.0\)/);
 assert.equal(installed(dir)[0].version,'1.1.0');assert.match(readFileSync(join(dir,'shared/extensions/example-bank.mjs'),'utf8'),/\/\/ 1\.1\.0/);
 assert.equal((readFileSync(join(dir,'shared/extensions/statement-formats.mjs'),'utf8').match(/bayit-extension: example-bank/g)||[]).length,1);
 // A broken update leaves 1.1.0 exactly as it was.
 const mid=tree(dir);r=run(dir,'apply',pkg(m=>{m.version='1.2.0';m.registry[0].export='NOPE'},v2),'--update');assert.equal(r.status,1);assert.deepEqual(tree(dir),mid);
 // The person edited a payload file: remove and update stop, check notes it, --force removes.
 writeFileSync(join(dir,'shared/extensions/example-bank.mjs'),readFileSync(join(dir,'shared/extensions/example-bank.mjs'),'utf8')+'// mine\n');
 r=run(dir,'remove','example-bank');assert.equal(r.status,1);assert.match(r.stderr,/changed since "example-bank" was applied: shared\/extensions\/example-bank\.mjs/);
 assert.match(run(dir,'check').stdout,/example-bank\.mjs was changed after it was applied/);
 ok(run(dir,'remove','example-bank','--force'),'forced remove');assert.deepEqual(tree(dir),before);
});

test('remove is refused when it would break another extension',()=>{
 // An extension that imports another one's file; the registries then fail to load without it.
 const dir=copy();ok(run(dir,'apply',EXAMPLE),'apply');
 const dependent=pkg((m,d)=>{
  m.id='dependent-bank';m.name={en:'Dependent',he:'תלוי'};m.files=['shared/extensions/dependent-bank.mjs'];m.registry=[{seam:'statement-formats',id:'dependent-bank',file:'shared/extensions/dependent-bank.mjs',export:'DEPENDENT'}];
  rmSync(join(d,'payload'),{recursive:true});rmSync(join(d,'tests'),{recursive:true});mkdirSync(join(d,'payload/shared/extensions'),{recursive:true});
  writeFileSync(join(d,'payload/shared/extensions/dependent-bank.mjs'),"import {EXAMPLE_BANK} from './example-bank.mjs';\nexport const DEPENDENT={...EXAMPLE_BANK,id:'dependent-bank',detect:()=>false};\n");
 });
 ok(run(dir,'apply',dependent),'apply dependent');const before=tree(dir);
 const r=run(dir,'remove','example-bank');assert.equal(r.status,1);assert.match(r.stderr,/would break this copy, so nothing was changed/);assert.deepEqual(tree(dir),before);
});

test('the generator templates are well-formed extensions that apply and remove cleanly',()=>{
 for(const [seam,template] of Object.entries(TEMPLATES)){
  const dir=copy(),before=tree(dir);
  ok(run(dir,'apply',template),'apply '+seam);
  const [record]=installed(dir);assert.equal(record.seam,seam);
  ok(run(dir,'check'),'check '+seam);
  ok(run(dir,'remove',record.id),'remove '+seam);assert.deepEqual(tree(dir),before,seam);
 }
});

test('extension skills follow the package format',()=>{
 const skills=join(root,'.agents/skills');
 for(const name of readdirSync(skills).filter(s=>s.startsWith('bayit-add-'))){
  const dir=join(skills,name),skill=readFileSync(join(dir,'SKILL.md'),'utf8');
  assert.ok(existsSync(join(dir,'REMOVE.md')),name+' needs REMOVE.md');
  assert.ok(skill.split('\n').length<500,name+'/SKILL.md must stay under 500 lines');
  assert.match(skill,/^---\nname: /,name);
  // A fixed extension is the package itself; a generator keeps a template package that must apply.
  const pkgDir=existsSync(join(dir,'extension.json'))?dir:existsSync(join(dir,'template/extension.json'))?join(dir,'template'):null;
  if(pkgDir){assert.match(skill,/bayit-extension\.mjs apply/,name);for(const f of ['SKILL.md','REMOVE.md'])assert.ok(existsSync(join(pkgDir,f)),name+': '+relative(dir,join(pkgDir,f)))}
  else assert.match(skill,/no local registry|Seams still missing/i,name+' has no package; it must say which seam is missing');
 }
 const doc=src('docs/extension-skills.md'),readme=src('.agents/skills/README.md');
 for(const words of ['apply <package-folder>','--update','remove <id>','--force','check','installed.json','REMOVE.md','extension.json','payload/','local-extensions/','Seams still missing'])assert.ok(doc.includes(words),'docs/extension-skills.md mentions '+words);
 assert.match(readme,/docs\/extension-skills\.md/);assert.match(readme,/Operational/i);assert.match(readme,/Extension/);
});

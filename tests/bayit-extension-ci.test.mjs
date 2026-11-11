// The apply-and-remove check (work package 3.3; app/scripts/bayit-extension-ci.mjs, `npm run test:extensions`).
// The whole check runs in CI (.github/workflows/extensions.yml); here: which packages it finds, the clean copy, the
// trace comparison, and one real package plus the negative fixture checked end to end. Skipped inside the check's own
// test-suite run, which would otherwise start the check again.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,existsSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {packages,cleanCopy,tree,difference,checkPackage} from '../app/scripts/bayit-extension-ci.mjs';
import {LOCAL_REGISTRIES,emptyRegistry} from '../app/scripts/local-registries.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const skip=process.env.BAYIT_EXTENSION_CI==='1'&&'inside the apply-and-remove check itself';
const scratch=mkdtempSync(join(tmpdir(),'bayit-extension-ci-test-'));
after(()=>rmSync(scratch,{recursive:true,force:true}));

test('finds every shipped package and the negative fixture',{skip},()=>{
 const list=packages(root),names=list.map(p=>p.name);
 for(const n of ['.agents/skills/bayit-add-ai-provider/template','.agents/skills/bayit-add-statement-format/template','tests/fixtures/extensions/bayit-add-example-bank','tests/fixtures/extensions/bayit-add-lending'])assert.ok(names.includes(n),n);
 assert.deepEqual(list.filter(p=>p.expect==='fail').map(p=>p.name),['tests/fixtures/extensions/negative/bayit-add-core-editor']);
 assert.equal(JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).scripts['test:extensions'],'node scripts/bayit-extension-ci.mjs');
 assert.ok(existsSync(join(root,'.github/workflows/extensions.yml'))||!existsSync(join(root,'work')),'the workflow is prepared');
});

test('the clean copy is this repository as upstream ships it, with heavy folders linked',{skip},()=>{
 const dir=join(scratch,'clean');cleanCopy(root,dir);
 for(const r of LOCAL_REGISTRIES)if(existsSync(join(dir,r.file)))assert.equal(readFileSync(join(dir,r.file),'utf8'),emptyRegistry(r),r.file);
 assert.equal(readFileSync(join(dir,'shared/extensions/installed.json'),'utf8'),'[]\n');
 assert.ok(lstatSync(join(dir,'app/node_modules')).isSymbolicLink());
 for(const p of ['work','concept','app/dist','.git'])assert.equal(existsSync(join(dir,p)),false,p+' is not copied');
 assert.ok(existsSync(join(dir,'app/scripts/bayit-extension.mjs'))&&existsSync(join(dir,'tests/feature-module-conformance.mjs')));
});

test('a trace is any added, changed or removed file or empty folder; the .wrangler cache is not one',{skip},()=>{
 const dir=join(scratch,'trace');mkdirSync(join(dir,'a'),{recursive:true});writeFileSync(join(dir,'a/f'),'1');const before=tree(dir);
 mkdirSync(join(dir,'.wrangler/cache'),{recursive:true});writeFileSync(join(dir,'.wrangler/cache/cf.json'),'{}');
 assert.deepEqual(difference(before,tree(dir)),[]);
 writeFileSync(join(dir,'a/f'),'2');mkdirSync(join(dir,'b'));writeFileSync(join(dir,'c'),'');
 assert.deepEqual(difference(before,tree(dir)),['added b/','added c','changed a/f']);
});

test('a real package passes; the negative fixture is caught editing a core file',{skip},async()=>{
 const list=packages(root),pick=n=>list.find(p=>p.name.endsWith(n));
 const [good,bad]=await Promise.all([checkPackage(root,pick('bayit-add-example-bank'),{scratch}),checkPackage(root,pick('bayit-add-core-editor'),{scratch})]);
 assert.equal(good.ok,true,good.step+': '+good.detail);assert.equal(good.step,null);
 assert.equal(bad.ok,true,'the negative fixture must fail');assert.equal(bad.step,'no trace');
 assert.match(bad.detail,/changed shared\/features\.mjs/);
});

// The bayit-new-extension scaffold (Modular Bayit, work package 3.2): app/scripts/bayit-new-extension.mjs writes a
// complete extension package per seam from .agents/skills/bayit-new-extension/templates/. Each package is valid for
// apply, its conformance test passes from the start, its behaviour test fails until the TODOs are filled in, and
// apply refuses it until then without changing anything. Every step works in a temporary copy, never in this folder.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,existsSync,rmSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {scaffold,KINDS,NOT_YET,TEMPLATES} from '../app/scripts/bayit-new-extension.mjs';
import {readPackage,CLIENT_REGISTRIES} from '../app/scripts/bayit-extension.mjs';
import {LOCAL_REGISTRIES,emptyRegistry} from '../app/scripts/local-registries.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const scratch=mkdtempSync(join(tmpdir(),'bayit-new-extension-'));
process.on('exit',()=>rmSync(scratch,{recursive:true,force:true}));
let n=0;
const HE={'ai-provider':'ספק בדיקה','statement-format':'בנק בדיקה',speech:'תמלול בדיקה',signin:'כניסת בדיקה',connection:'חיבור בדיקה',feature:'מסך בדיקה'};

// The parts of Bayit the registries, the script and the package tests need; node_modules is linked, not copied.
function copy(){
 const dir=join(scratch,'copy-'+(++n));
 cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});
 for(const d of ['cloud','scripts','host'])cpSync(join(root,'app',d),join(dir,'app',d),{recursive:true});
 cpSync(join(root,'app/src'),join(dir,'app/src'),{recursive:true}); // feature modules: the server state code imports app/src helpers
 cpSync(join(root,'design-system/bayit-icons.json'),join(dir,'design-system/bayit-icons.json'));
 cpSync(join(root,'app/package.json'),join(dir,'app/package.json'));
 for(const r of [...LOCAL_REGISTRIES,...CLIENT_REGISTRIES])if(existsSync(join(dir,r.file)))writeFileSync(join(dir,r.file),r.client?`export const ${r.name}=[];\n`:emptyRegistry(r));
 writeFileSync(join(dir,'shared/extensions/installed.json'),'[]\n');
 symlinkSync(join(root,'app/node_modules'),join(dir,'app/node_modules'));
 mkdirSync(join(dir,'tests'));cpSync(join(root,'tests/feature-module-conformance.mjs'),join(dir,'tests/feature-module-conformance.mjs'));
 return dir;
}
function tree(dir){
 const out={};
 const walk=rel=>{for(const e of readdirSync(join(dir,rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name;if(p==='app/node_modules')continue;if(e.isDirectory())walk(p);else out[p]=createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')}};
 walk('');return out;
}
const tool=(dir,...args)=>spawnSync(process.execPath,[join(dir,'app/scripts/bayit-extension.mjs'),...args,'--root',dir],{encoding:'utf8',cwd:dir});
const setOutbound=(pkg,list)=>{const f=join(pkg,'extension.json'),m=JSON.parse(readFileSync(f,'utf8'));m.outbound=list;writeFileSync(f,JSON.stringify(m,null,1))};

test('every kind scaffolds a valid package with no template tokens left and its TODOs listed',()=>{
 for(const kind of Object.keys(KINDS)){
  const id='try-'+kind.replace(/[^a-z]/g,'').slice(0,12),out=join(scratch,'pkg-'+(++n));
  const r=scaffold(root,kind,id,{name:'Try '+kind,he:HE[kind],out});
  const m=readPackage(out);
  assert.equal(m.id,id);assert.equal(m.seam,KINDS[kind].seam);
  assert.equal(m.minBayit,JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).version);
  for(const f of r.files)assert.doesNotMatch(readFileSync(join(out,f),'utf8'),/__(ID|EXPORT|ENV|NAME_EN|NAME_HE|MIN_BAYIT)__/,kind+': '+f);
  for(const f of ['SKILL.md','REMOVE.md','extension.json',`tests/extension-${id}.test.mjs`])assert.ok(r.files.includes(f),kind+' has '+f);
  assert.match(readFileSync(join(out,'SKILL.md'),'utf8'),new RegExp('^---\\nname: bayit-add-'+id+'\\ndescription: '),kind+': SKILL.md front matter');
  assert.ok(r.todos.length>0,kind+' lists what to fill in');
 }
 assert.ok(existsSync(TEMPLATES));
});

test('it refuses what it cannot do, honestly',()=>{
 const out=()=>join(scratch,'pkg-'+(++n));
 assert.throws(()=>scaffold(root,'ai-provider','openai',{he:'א',out:out()}),/already a ai-providers entry/);
 assert.throws(()=>scaffold(root,'connection','telegram',{he:'א',out:out()}),/already a connections entry/);
 assert.throws(()=>scaffold(root,'ai-provider','Bad_Id',{he:'א',out:out()}),/lowercase/);
 assert.throws(()=>scaffold(root,'ai-provider','fine-id',{out:out()}),/Hebrew name/);
 assert.throws(()=>scaffold(root,'ai-provider','fine-id',{name:'Say "hi"',he:'א',out:out()}),/quotes/);
 for(const kind of Object.keys(NOT_YET))assert.throws(()=>scaffold(root,kind,'fine-id',{he:'א',out:out()}),new RegExp(kind+' cannot be scaffolded yet'));
 assert.throws(()=>scaffold(root,'channels','fine-id',{he:'א',out:out()}),/channel cannot be scaffolded yet.*channel-contract/);
 const taken=out();mkdirSync(taken);writeFileSync(join(taken,'keep.txt'),'mine');
 assert.throws(()=>scaffold(root,'speech','fine-id',{he:'א',out:taken}),/already exists/);
 assert.equal(readFileSync(join(taken,'keep.txt'),'utf8'),'mine');
});

test('the command line prints the seams, writes a package and the next steps',()=>{
 const cli=(...a)=>spawnSync(process.execPath,[join(root,'app/scripts/bayit-new-extension.mjs'),...a],{encoding:'utf8',cwd:root});
 const seams=cli('seams');assert.equal(seams.status,0);for(const k of [...Object.keys(KINDS),'feature','channel','host'])assert.match(seams.stdout,new RegExp('\\n  '+k+' '));
 const out=join(scratch,'pkg-'+(++n)),r=cli('statement-format','try-bank','--name','Try Bank','--he','בנק ניסיון','--out',out);
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Fill in every TODO\(bayit\)/);assert.match(r.stdout,/bayit-extension\.mjs apply /);
 assert.equal(readPackage(out).name.he,'בנק ניסיון');
 const bad=cli('host','x','--he','א');assert.equal(bad.status,1);assert.match(bad.stderr,/host-contract/);
});

// One copy per kind: apply refuses the unfinished package and leaves the copy exactly as it was; with the registry
// lines only (--no-tests) it applies, its conformance test passes and its behaviour test fails; remove restores it.
for(const kind of Object.keys(KINDS))test(kind+': unfinished packages are refused cleanly; conformance passes, behaviour fails until filled in',()=>{
 const dir=copy(),before=tree(dir),id='try-'+kind.replace(/[^a-z]/g,'').slice(0,12),pkg=join(scratch,'pkg-'+(++n));
 scaffold(root,kind,id,{name:'Try '+kind,he:HE[kind],out:pkg});
 const m=readPackage(pkg);
 if(m.outbound.length){
  const r=tool(dir,'apply',pkg);assert.equal(r.status,1);assert.match(r.stderr,/placeholder https:\/\/[^ ]*\.invalid/);
  assert.deepEqual(tree(dir),before,'nothing changed');
  setOutbound(pkg,['https://api.'+id+'.example']);
 }
 const refused=tool(dir,'apply',pkg);
 assert.equal(refused.status,1,refused.stdout);assert.match(refused.stderr,/did not pass, so nothing was changed[\s\S]*Not written yet/);
 assert.deepEqual(tree(dir),before,'a refused apply leaves the copy exactly as it was');
 const applied=tool(dir,'apply',pkg,'--no-tests');assert.equal(applied.status,0,applied.stderr);
 assert.equal(tool(dir,'check').status,0);
 const run=spawnSync(process.execPath,['--test','--test-reporter=tap',`tests/extension-${id}.test.mjs`],{encoding:'utf8',cwd:dir,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='NODE_TEST_CONTEXT'))});
 const results=[...run.stdout.matchAll(/^(not ok|ok) \d+ - (.*)$/gm)].map(x=>[x[1],x[2]]);
 assert.equal(results[0]?.[0],'ok','the conformance test passes from the start: '+results[0]?.[1]+'\n'+run.stdout.slice(0,1500));
 assert.ok(results.slice(1).some(([s])=>s==='not ok'),'a behaviour test fails until the TODOs are filled in');
 const removed=tool(dir,'remove',id);assert.equal(removed.status,0,removed.stderr);
 assert.deepEqual(tree(dir),before,'remove leaves the copy exactly as it was');
});

// Client registries (connection panels) are checked without a browser: the imported name must exist and the JSX parse.
test('apply refuses a connection panel that does not export its name or does not parse, and rolls back',()=>{
 const dir=copy(),before=tree(dir),pkg=join(scratch,'pkg-'+(++n)),file=join(pkg,'payload/app/src/extensions/try-panel-panel.jsx');
 scaffold(root,'connection','try-panel',{he:'חיבור',out:pkg});
 const good=readFileSync(file,'utf8');
 writeFileSync(file,good.replace('export const TRY_PANEL_PANEL=','const TRY_PANEL_PANEL='));
 let r=tool(dir,'apply',pkg,'--no-tests');assert.equal(r.status,1);assert.match(r.stderr,/try-panel-panel\.jsx does not export TRY_PANEL_PANEL/);
 assert.deepEqual(tree(dir),before);
 writeFileSync(file,good.replace('</FormSection>;','</FormSection;'));
 r=tool(dir,'apply',pkg,'--no-tests');assert.equal(r.status,1);assert.match(r.stderr,/does not parse/);
 assert.deepEqual(tree(dir),before);
});

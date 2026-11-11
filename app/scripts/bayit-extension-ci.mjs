#!/usr/bin/env node
// Apply-and-remove check for every extension package shipped in this repository (work package 3.3).
//   cd app && npm run test:extensions                    the whole check, as CI runs it
//   node app/scripts/bayit-extension-ci.mjs [--quick] [--jobs N] [--only <name>] [--root <repo>]
// For each package (the generator templates in .agents/skills/bayit-add-*/template, any fixed skill with its own
// extension.json, and tests/fixtures/extensions/*), in parallel: copy this repository into a clean scratch folder (local
// registries empty, as upstream ships them) → apply (which runs the package's own tests) → check → remove → the folder
// must be byte-identical to before, empty folders included. Then (not with --quick) all of them together in one clean
// copy → check → the whole test suite once → remove all → byte-identical again. Each negative fixture in
// tests/fixtures/extensions/negative/ must FAIL one of the steps; the check fails if one passes.
// Heavy folders no extension may write to (node_modules, app/public, docs, assets) are linked, not copied.
import {readFileSync,writeFileSync,existsSync,mkdtempSync,mkdirSync,cpSync,rmSync,readdirSync,symlinkSync,readlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {tmpdir,availableParallelism} from 'node:os';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOCAL_REGISTRIES,INSTALLED_FILE,emptyRegistry} from './local-registries.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const LINKED=['app/node_modules','app/public','docs','assets'];
const SKIPPED=new Set(['.git','work','concept','node_modules','dist','.wrangler','local-extensions','.DS_Store']);
const CLIENT=[{file:'app/src/extensions/connection-panels.jsx',name:'EXTRA_CONNECTION_PANELS'},{file:'app/src/extensions/screens.jsx',name:'EXTRA_SCREENS'}];

// Every package the repository ships, and the negative fixtures that must fail.
export function packages(root){
 const out=[],skills=join(root,'.agents/skills');
 for(const name of existsSync(skills)?readdirSync(skills).filter(s=>s.startsWith('bayit-add-')).sort():[]){
  for(const dir of [join(skills,name),join(skills,name,'template')])if(existsSync(join(dir,'extension.json')))out.push({name:relative(root,dir).split(sep).join('/'),dir,expect:'pass'});
 }
 const fixtures=join(root,'tests/fixtures/extensions');
 for(const name of existsSync(fixtures)?readdirSync(fixtures).sort():[])if(existsSync(join(fixtures,name,'extension.json')))out.push({name:'tests/fixtures/extensions/'+name,dir:join(fixtures,name),expect:'pass'});
 const negative=join(fixtures,'negative');
 for(const name of existsSync(negative)?readdirSync(negative).sort():[])if(existsSync(join(negative,name,'extension.json')))out.push({name:'tests/fixtures/extensions/negative/'+name,dir:join(negative,name),expect:'fail'});
 return out;
}

// A clean copy: this repository without its installed extensions, local registries empty.
export function cleanCopy(root,into){
 mkdirSync(into,{recursive:true});
 const walk=rel=>{for(const e of readdirSync(join(root,rel),{withFileTypes:true})){
  const p=rel?rel+'/'+e.name:e.name;
  if(SKIPPED.has(e.name)&&!LINKED.includes(p))continue;
  if(LINKED.includes(p)){if(existsSync(join(root,p)))symlinkSync(join(root,p),join(into,p));continue}
  if(e.isSymbolicLink()){symlinkSync(readlinkSync(join(root,p)),join(into,p));continue}
  if(e.isDirectory()){mkdirSync(join(into,p));walk(p)}else cpSync(join(root,p),join(into,p));
 }};
 walk('');
 let installed=[];try{installed=JSON.parse(readFileSync(join(root,INSTALLED_FILE),'utf8'))}catch{}
 for(const f of (Array.isArray(installed)?installed:[]).flatMap(x=>x?.files||[]))rmSync(join(into,f),{force:true});
 for(const r of LOCAL_REGISTRIES)if(existsSync(join(into,r.file)))writeFileSync(join(into,r.file),emptyRegistry(r));
 for(const r of CLIENT)if(existsSync(join(into,r.file))&&!new RegExp('^export const '+r.name+'=\\[\\];$','m').test(readFileSync(join(into,r.file),'utf8')))writeFileSync(join(into,r.file),`export const ${r.name}=[];\n`);
 writeFileSync(join(into,INSTALLED_FILE),'[]\n');
}

// Every file with its hash, every empty folder and every link: what "no trace" is compared on. .wrangler/ is the
// local Cloudflare cache the core suite writes (ignored by git), not something an extension leaves.
const IGNORED=new Set(['.wrangler']);
export function tree(dir){
 const out={};
 const walk=rel=>{const entries=readdirSync(join(dir,rel),{withFileTypes:true}).filter(e=>!IGNORED.has(e.name));if(!entries.length&&rel)out[rel+'/']='(empty folder)';
  for(const e of entries){const p=rel?rel+'/'+e.name:e.name;if(e.isSymbolicLink())out[p]='(link)';else if(e.isDirectory())walk(p);else out[p]=createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')}};
 walk('');return out;
}
export function difference(a,b){
 const out=[];
 for(const k of Object.keys(b))if(!(k in a))out.push('added '+k);else if(a[k]!==b[k])out.push('changed '+k);
 for(const k of Object.keys(a))if(!(k in b))out.push('removed '+k);
 return out.sort();
}

const run=(cmd,args,{cwd,env})=>new Promise(done=>{
 const child=spawn(cmd,args,{cwd,env});let output='';
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 child.on('close',status=>done({status,output}));
});
const tail=(text,n=12)=>text.trim().split('\n').filter(l=>!/ExperimentalWarning|--trace-warnings/.test(l)).slice(-n).join('\n');
const ciEnv=()=>{const env={...process.env,BAYIT_EXTENSION_CI:'1'};delete env.NODE_TEST_CONTEXT;return env};
const seconds=since=>Math.round((Date.now()-since)/100)/10;

// Applies packages one after another to a fresh clean copy, optionally runs the whole suite, removes them in reverse
// order and compares the tree. Returns {step, detail} for the first failure, or null.
async function cycle(root,dir,list,{suite}){
 const env=ciEnv(),tool=(...args)=>run(process.execPath,[join(dir,'app/scripts/bayit-extension.mjs'),...args,'--root',dir],{cwd:dir,env});
 const ids=[];let failed=null;
 cleanCopy(root,dir);
 const before=tree(dir);
 for(const pkg of list){const r=await tool('apply',pkg.dir);if(r.status!==0){failed={step:'apply',detail:(list.length>1?pkg.name+': ':'')+tail(r.output)};break}ids.push(JSON.parse(readFileSync(join(dir,INSTALLED_FILE),'utf8')).at(-1).id)}
 if(!failed){const r=await tool('check');if(r.status!==0)failed={step:'check',detail:tail(r.output)}}
 if(!failed&&suite){
  const files=readdirSync(join(dir,'tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
  const r=await run(process.execPath,['--test','--test-reporter=dot',...files],{cwd:dir,env});
  if(r.status!==0)failed={step:'test suite',detail:tail(r.output.slice(r.output.indexOf('Failed tests:')>=0?r.output.indexOf('Failed tests:'):0),30)};
 }
 for(const id of ids.reverse()){const r=await tool('remove',id,'--force');if(r.status!==0&&!failed)failed={step:'remove',detail:id+': '+tail(r.output)}}
 if(!failed){const diff=difference(before,tree(dir));if(diff.length)failed={step:'no trace',detail:'the copy differs from before apply:\n'+diff.slice(0,20).join('\n')}}
 return failed;
}

// One package alone: apply (which runs its own tests) → check → remove → no trace. ok means it behaved as expected.
export async function checkPackage(root,pkg,{scratch}){
 const started=Date.now(),dir=mkdtempSync(join(scratch,'copy-'));let failed=null;
 try{failed=await cycle(root,dir,[pkg],{suite:false})}catch(e){failed={step:'copy',detail:String(e?.stack||e)}}
 finally{rmSync(dir,{recursive:true,force:true})}
 return {name:pkg.name,expect:pkg.expect,ok:pkg.expect==='pass'?!failed:!!failed,step:failed?.step||null,detail:failed?.detail||'',seconds:seconds(started)};
}

// 1. every package alone, in parallel; 2. (unless quick) every passing package together in one copy, with the whole
// test suite, so each one is checked against all of Bayit's tests and against the others, then removed without a trace.
export async function checkAll(root,{quick=false,jobs=Math.max(1,Math.min(4,Math.floor(availableParallelism()/2))),only=null,log=console.log}={}){
 root=resolve(root);
 const list=packages(root).filter(p=>!only||p.name.includes(only));
 const scratch=mkdtempSync(join(tmpdir(),'bayit-extension-ci-'));const results=[];
 try{
  let next=0;
  await Promise.all(Array.from({length:Math.min(jobs,list.length)},async()=>{
   while(next<list.length){const pkg=list[next++];const r=await checkPackage(root,pkg,{scratch});results.push(r);
    log((r.ok?'✓ ':'✗ ')+r.name+(r.expect==='fail'?(r.step?' failed at "'+r.step+'", as it must':' passed, but it must fail'):r.step?' failed at "'+r.step+'"':' applies, checks, passes its own tests and removes without a trace')+' ('+r.seconds+' s)');
    if(r.detail)log('  '+r.detail.split('\n').join('\n  '));}
  }));
  const together=list.filter(p=>p.expect==='pass'&&results.find(r=>r.name===p.name)?.ok);
  if(!quick&&together.length){
   const started=Date.now(),dir=mkdtempSync(join(scratch,'together-'));let failed=null;
   try{failed=await cycle(root,dir,together,{suite:true})}catch(e){failed={step:'copy',detail:String(e?.stack||e)}}
   const r={name:'all '+together.length+' together with the whole test suite',expect:'pass',ok:!failed,step:failed?.step||null,detail:failed?.detail||'',seconds:seconds(started)};results.push(r);
   log((r.ok?'✓ ':'✗ ')+r.name+(r.ok?': applied, checked, suite green, removed without a trace':' failed at "'+r.step+'"')+' ('+r.seconds+' s)');
   if(r.detail)log('  '+r.detail.split('\n').join('\n  '));
  }
 }finally{rmSync(scratch,{recursive:true,force:true})}
 return results;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=f=>{const i=args.indexOf(f);return i>=0?args[i+1]:null};
 const root=value('--root')||join(HERE,'../..'),started=Date.now();
 const results=await checkAll(root,{quick:args.includes('--quick'),jobs:Number(value('--jobs'))||undefined,only:value('--only')});
 const bad=results.filter(r=>!r.ok);
 console.log((bad.length?'✗ ':'✓ ')+results.filter(r=>r.ok).length+' of '+results.length+' package(s) behaved as expected in '+Math.round((Date.now()-started)/1000)+' s.');
 if(!results.length){console.error('No extension packages found.');process.exit(1)}
 process.exit(bad.length?1:0);
}

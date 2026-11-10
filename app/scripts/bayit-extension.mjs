#!/usr/bin/env node
// Applies, removes and checks Bayit extension packages (docs/extension-skills.md).
//   node app/scripts/bayit-extension.mjs apply <package-folder> [--update] [--no-tests]
//   node app/scripts/bayit-extension.mjs remove <id> [--force]
//   node app/scripts/bayit-extension.mjs check
// Options: --root <folder> works on another copy of Bayit (default: the copy this script belongs to).
// Apply copies the package's files, adds its lines to the LOCAL registry files only, records it in
// shared/extensions/installed.json, then loads the registries and runs the package's tests. Anything that fails
// is rolled back, so a copy is either fully applied or exactly as it was. It never overwrites an existing file and
// never writes outside the paths extension.json declares; remove reverses apply byte for byte.
import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync,lstatSync,readdirSync,realpathSync,rmdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve,relative,posix,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOCAL_REGISTRIES,INSTALLED_FILE} from './local-registries.mjs';

// The core module that joins each local registry; loading it runs the same checks core entries pass.
export const SEAM_MODULES={features:'shared/features.mjs','ai-providers':'shared/ai-providers.mjs',speech:'app/cloud/speech.mjs',signin:'app/cloud/signin-methods.mjs','statement-formats':'shared/finance-parse.mjs',connections:'shared/connections.mjs'};
// Folders an extension may write into; files there must be named after the extension (see allowedPath).
export const EXTENSION_DIRS=['shared/extensions','app/cloud/extensions','app/src/extensions'];
const MARK=' // bayit-extension: ';
const ID=/^[a-z][a-z0-9-]{1,39}$/,SEMVER=/^\d+\.\d+\.\d+$/,IDENT=/^[A-Za-z_$][A-Za-z0-9_$]*$/;

class Refusal extends Error{}
const refuse=message=>{throw new Refusal(message)};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cmpVersion=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0};
const registryOf=seam=>LOCAL_REGISTRIES.find(r=>r.seam===seam);

// A declared path is a plain relative path inside an extension folder, named after the extension:
//   <dir>/<id>.<ext>, <dir>/<id>-<anything>, <dir>/<id>/<anything>  (dir: shared|app/cloud|app/src /extensions)
//   tests/extension-<id>.test.mjs, tests/extension-<id>-<name>.test.mjs, tests/fixtures/extension-<id>/<anything>
// Local registry files and installed.json are never files of an extension: apply edits them line by line.
export function allowedPath(id,path){
 if(typeof path!=='string'||!path||path.length>200||!/^[A-Za-z0-9._/-]+$/.test(path))return 'use letters, digits, ".", "_", "-" and "/" only';
 if(path.startsWith('/')||path.split('/').some(s=>s===''||s==='.'||s==='..')||posix.normalize(path)!==path)return 'must be a plain relative path without "..", "." or "//"';
 if(LOCAL_REGISTRIES.some(r=>r.file===path)||path===INSTALLED_FILE)return 'is a local registry file; declare a registry line instead';
 const name=path.split('/').pop();
 for(const dir of EXTENSION_DIRS)if(path.startsWith(dir+'/')){
  const rest=path.slice(dir.length+1),first=rest.split('/')[0];
  if(rest.includes('/')?first===id:(name.startsWith(id+'.')||name.startsWith(id+'-')))return '';
  return 'files in '+dir+'/ must be named '+id+'.<ext>, '+id+'-<name> or sit in '+dir+'/'+id+'/';
 }
 if(path===`tests/extension-${id}.test.mjs`||path.startsWith(`tests/extension-${id}-`)&&path.endsWith('.test.mjs')&&!path.slice(6).includes('/'))return '';
 if(path.startsWith(`tests/fixtures/extension-${id}/`))return '';
 return 'is outside the extension folders ('+EXTENSION_DIRS.join(', ')+', tests/extension-'+id+'*.test.mjs, tests/fixtures/extension-'+id+'/)';
}

// Reads and validates <package>/extension.json; returns the manifest with resolved sources.
export function readPackage(pkgDir){
 const dir=resolve(pkgDir),file=join(dir,'extension.json');
 if(!existsSync(file))refuse(dir+' has no extension.json.');
 let m;try{m=JSON.parse(readFileSync(file,'utf8'))}catch(e){refuse('extension.json is not valid JSON: '+e.message)}
 if(!m||typeof m!=='object'||Array.isArray(m))refuse('extension.json must be an object.');
 const where='extension.json: ';
 if(typeof m.id!=='string'||!ID.test(m.id))refuse(where+'id must be 2-40 lowercase letters, digits or "-", starting with a letter.');
 if(typeof m.version!=='string'||!SEMVER.test(m.version))refuse(where+'version must look like 1.0.0.');
 if(!m.name||typeof m.name.en!=='string'||!m.name.en.trim()||typeof m.name.he!=='string'||!m.name.he.trim())refuse(where+'name needs English and Hebrew ({"en":…,"he":…}).');
 if(typeof m.minBayit!=='string'||!SEMVER.test(m.minBayit))refuse(where+'minBayit must be a Bayit version like 1.56.0.');
 if(!registryOf(m.seam))refuse(where+'seam must be one of '+LOCAL_REGISTRIES.map(r=>r.seam).join(', ')+'.');
 if(!Array.isArray(m.files)||!m.files.length)refuse(where+'files must list every file the extension adds.');
 const files=new Set();
 for(const f of m.files){const problem=allowedPath(m.id,f);if(problem)refuse(where+'file "'+f+'" '+problem+'.');if(files.has(f))refuse(where+'file "'+f+'" is listed twice.');files.add(f)}
 if(!Array.isArray(m.registry)||!m.registry.length)refuse(where+'registry must list at least one registry line.');
 const lines=m.registry.map((r,i)=>{
  if(!r||!registryOf(r.seam))refuse(where+'registry['+i+'].seam must be one of '+LOCAL_REGISTRIES.map(x=>x.seam).join(', ')+'.');
  if(typeof r.id!=='string'||!/^[a-z][a-z0-9_-]{1,39}$/.test(r.id))refuse(where+'registry['+i+'].id must be the registry entry id.');
  if(!files.has(r.file)||!/\.m?jsx?$/.test(r.file))refuse(where+'registry['+i+'].file must be one of the listed .mjs/.js/.jsx files.');
  if(typeof r.export!=='string'||!IDENT.test(r.export)||r.export==='default')refuse(where+'registry['+i+'].export must be the name the file exports.');
  return {seam:r.seam,id:r.id,file:r.file,export:r.export};
 });
 if(!lines.some(l=>l.seam===m.seam))refuse(where+'seam "'+m.seam+'" must be the seam of at least one registry line.');
 for(const l of lines)if(lines.filter(x=>x.seam===l.seam&&x.id===l.id).length>1)refuse(where+'registry entry '+l.seam+' "'+l.id+'" is listed twice.');
 const outbound=m.outbound??[];
 if(!Array.isArray(outbound))refuse(where+'outbound must be a list of https origins.');
 for(const o of outbound){let u;try{u=new URL(o)}catch{u=null}if(!u||u.protocol!=='https:'||u.origin!==o)refuse(where+'outbound "'+o+'" must be an exact https origin such as https://api.example.com.')}
 const dependencies=m.dependencies??{};
 if(!dependencies||typeof dependencies!=='object'||Array.isArray(dependencies))refuse(where+'dependencies must be an object of exact versions.');
 for(const [name,v] of Object.entries(dependencies))if(!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)||typeof v!=='string'||!SEMVER.test(v))refuse(where+'dependency "'+name+'" must be pinned to an exact version like 1.2.3.');
 // Sources: tests/… comes from the package's tests/ folder, everything else from payload/.
 const source=f=>f.startsWith('tests/')?join(dir,f):join(dir,'payload',f);
 for(const f of files){const p=source(f);if(!existsSync(p))refuse('The package is missing '+relative(dir,p)+' (declared in files).');const st=lstatSync(p);if(!st.isFile()||st.isSymbolicLink())refuse(relative(dir,p)+' must be a regular file, not a link or folder.')}
 // Nothing undeclared may sit in payload/ or tests/: what you see in extension.json is all that is copied.
 const walk=(base,prefix)=>!existsSync(base)?[]:readdirSync(base,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!e.isSymbolicLink()?walk(join(base,e.name),prefix+e.name+'/'):[prefix+e.name]);
 for(const f of [...walk(join(dir,'payload'),''),...walk(join(dir,'tests'),'tests/')])if(!files.has(f)&&!/(^|\/)\.DS_Store$/.test(f))refuse('The package has '+(f.startsWith('tests/')?f:'payload/'+f)+', which extension.json does not declare.');
 return {...m,outbound,dependencies,registry:lines,dir,source};
}

// --- small transaction: snapshot every path we may touch, restore all of them on failure -----------------------
function transaction(root){
 const saved=new Map(),made=[];
 return {
  save(path){if(!saved.has(path))saved.set(path,existsSync(join(root,path))?readFileSync(join(root,path)):null)},
  mkdirs(path){const parts=dirname(path).split('/');let cur='';for(const p of parts){cur=cur?cur+'/'+p:p;if(!existsSync(join(root,cur))){mkdirSync(join(root,cur));made.push(cur)}}},
  rollback(){
   for(const [path,bytes] of saved){const p=join(root,path);if(bytes===null)rmSync(p,{force:true});else{mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes)}}
   for(const d of made.reverse())try{rmdirSync(join(root,d))}catch{}
  },
 };
}

// The real location must stay inside the copy: a linked folder on the way out is refused.
function insideRoot(root,path){
 const real=realpathSync(root);let probe=join(root,path);
 while(!existsSync(probe))probe=dirname(probe);
 const r=realpathSync(probe);
 if(r!==real&&!r.startsWith(real+sep))refuse(path+' would be written outside this copy of Bayit (through a link).');
}

const readInstalled=root=>{const p=join(root,INSTALLED_FILE);if(!existsSync(p))refuse(INSTALLED_FILE+' is missing. Restore it with the content [] .');let v;try{v=JSON.parse(readFileSync(p,'utf8'))}catch{refuse(INSTALLED_FILE+' is not valid JSON.')}if(!Array.isArray(v))refuse(INSTALLED_FILE+' must be a list.');return v};
const writeInstalled=(root,list)=>writeFileSync(join(root,INSTALLED_FILE),list.length?JSON.stringify(list,null,1)+'\n':'[]\n');
const bayitVersion=root=>JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).version;
const alias=(id,i)=>'ext_'+id.replace(/-/g,'_')+(i?'_'+i:'');

// Edits one local registry file: add or remove this extension's import lines and their names in the list.
function editRegistry(root,seam,change){
 const r=registryOf(seam),p=join(root,r.file);
 if(!existsSync(p))refuse(r.file+' is missing; this Bayit has no '+seam+' seam yet (or restore the file empty).');
 const text=readFileSync(p,'utf8'),lines=text.split('\n'),re=new RegExp('^export const '+r.name+'=\\[(.*)\\];\\s*$');
 const at=lines.map((l,i)=>re.test(l)?i:-1).filter(i=>i>=0);
 if(at.length!==1)refuse(r.file+' must keep its list on one line, "export const '+r.name+'=[…];". Restore that shape, then try again.');
 const inner=re.exec(lines[at[0]])[1].trim(),names=inner?inner.split(',').map(s=>s.trim()):[];
 if(names.some(n=>!IDENT.test(n)))refuse(r.file+' has entries written by hand; keep only names imported above the list.');
 const next=change({lines,names,exportLine:at[0]});
 writeFileSync(p,next.lines.join('\n').replace(new RegExp('^export const '+r.name+'=\\[.*\\];','m'),'export const '+r.name+'=['+next.names.join(',')+'];'));
}
function addLines(root,pkg,lines){
 const bySeam=Map.groupBy?Map.groupBy(lines,l=>l.seam):lines.reduce((m,l)=>m.set(l.seam,[...(m.get(l.seam)||[]),l]),new Map());
 for(const [seam,list] of bySeam)editRegistry(root,seam,({lines:text,names,exportLine})=>{
  const imports=list.map(l=>{
   if(names.includes(l.alias)||text.some(t=>new RegExp('\\b'+l.alias+'\\b').test(t)))refuse(registryOf(seam).file+' already uses the name '+l.alias+'.');
   let spec=posix.relative(posix.dirname(registryOf(seam).file),l.file);if(!spec.startsWith('.'))spec='./'+spec;
   return `import {${l.export} as ${l.alias}} from '${spec}';${MARK}${pkg.id}`;
  });
  return {lines:[...text.slice(0,exportLine),...imports,...text.slice(exportLine)],names:[...names,...list.map(l=>l.alias)]};
 });
}
function removeLines(root,id,lines){
 for(const seam of new Set(lines.map(l=>l.seam)))editRegistry(root,seam,({lines:text,names})=>{
  const aliases=lines.filter(l=>l.seam===seam).map(l=>l.alias);
  return {lines:text.filter(t=>!t.endsWith(MARK+id)),names:names.filter(n=>!aliases.includes(n))};
 });
}

// Loads every touched core registry plus bayit-doctor's report in a fresh Node, so module caches never hide a problem.
export function verify(root,{seams=Object.keys(SEAM_MODULES),tests=[]}={}){
 const mods=seams.map(s=>SEAM_MODULES[s]).filter(m=>m&&existsSync(join(root,m)));
 const code=`const root=process.argv[1];const {pathToFileURL}=await import('node:url');const {join}=await import('node:path');
 for(const m of ${JSON.stringify(mods)})await import(pathToFileURL(join(root,m)).href);
 const {extensionReport}=await import(pathToFileURL(join(root,'app/scripts/local-registries.mjs')).href);
 const r=await extensionReport(root);if(r.problems.length){console.error(r.problems.join('\\n'));process.exit(1)}`;
 const load=spawnSync(process.execPath,['--input-type=module','-e',code,root],{encoding:'utf8',cwd:root});
 if(load.status!==0)return (load.stderr||load.stdout).trim().split('\n').filter(l=>!/^\s+at |^Node\.js v|^$/.test(l)).slice(0,8).join('\n')||'the registries did not load';
 if(tests.length){const env={...process.env};delete env.NODE_TEST_CONTEXT;// run as a test run of its own, also when called from inside one
  const run=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8',cwd:root,env});if(run.status!==0)return 'its tests failed:\n'+(run.stdout+run.stderr).split('\n').filter(l=>/^not ok|^# (pass|fail)|Error|expected|actual/.test(l.trim())).slice(0,12).join('\n')}
 return '';
}

function removeSteps(root,tx,record,{force}){
 const changed=[];
 for(const f of record.files||[]){const p=join(root,f);if(existsSync(p)&&record.hashes?.[f]&&sha(readFileSync(p))!==record.hashes[f])changed.push(f)}
 if(changed.length&&!force)refuse('These files changed since "'+record.id+'" was applied: '+changed.join(', ')+'. Keep a copy of your changes, then remove with --force.');
 for(const f of record.files||[]){tx.save(f);insideRoot(root,f);rmSync(join(root,f),{force:true})}
 for(const r of new Set((record.registry||[]).map(l=>registryOf(l.seam)?.file).filter(Boolean)))tx.save(r);
 removeLines(root,record.id,record.registry||[]);
 // Folders the extension's files emptied go too, but never the extension folders themselves.
 const keep=new Set([...EXTENSION_DIRS,'tests','tests/fixtures','app/cloud','app/src','app','shared','.']);
 for(const f of record.files||[]){let d=posix.dirname(f);while(!keep.has(d)){try{rmdirSync(join(root,d))}catch{break}d=posix.dirname(d)}}
}

export function apply(root,pkgDir,{update=false,runTests=true,log=console.log}={}){
 root=resolve(root);const pkg=readPackage(pkgDir),installed=readInstalled(root),current=installed.find(x=>x?.id===pkg.id);
 if(current&&!update)refuse('"'+pkg.id+'" is already installed (version '+current.version+'). To replace it with version '+pkg.version+', apply with --update.');
 if(!current&&update)refuse('"'+pkg.id+'" is not installed, so there is nothing to update. Apply without --update.');
 const version=bayitVersion(root);if(cmpVersion(version,pkg.minBayit)<0)refuse('"'+pkg.id+'" needs Bayit '+pkg.minBayit+' or newer; this copy is '+version+'. Update Bayit first (bayit-update).');
 const pj=JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')),have={...pj.devDependencies,...pj.dependencies};
 const missing=Object.entries(pkg.dependencies).filter(([n,v])=>have[n]!==v);
 if(missing.length)refuse('"'+pkg.id+'" needs exact versions that app/package.json does not have. After the person agrees, run: cd app && npm install --save-exact '+missing.map(([n,v])=>n+'@'+v).join(' ')+' — then apply again.');
 const lines=pkg.registry.map((l,i)=>({...l,alias:alias(pkg.id,i)}));
 const others=installed.filter(x=>x?.id!==pkg.id);
 for(const f of pkg.files){const owner=others.find(x=>(x.files||[]).includes(f));if(owner)refuse(f+' already belongs to the extension "'+owner.id+'".')}
 const tx=transaction(root);
 try{
  tx.save(INSTALLED_FILE);
  if(current)removeSteps(root,tx,current,{force:false});
  for(const f of pkg.files){insideRoot(root,f);if(existsSync(join(root,f)))refuse(f+' already exists. Bayit never overwrites a file: move it away or remove the extension that owns it, then apply again.')}
  for(const l of lines)tx.save(registryOf(l.seam).file);
  for(const f of pkg.files){tx.save(f);tx.mkdirs(f);copyFileSync(pkg.source(f),join(root,f))}
  addLines(root,pkg,lines);
  const record={id:pkg.id,version:pkg.version,name:pkg.name,seam:pkg.seam,source:relative(root,pkg.dir).split(sep).join('/'),minBayit:pkg.minBayit,
   entries:Object.fromEntries([...new Set(lines.map(l=>l.seam))].map(s=>[s,lines.filter(l=>l.seam===s).map(l=>l.id)])),
   files:[...pkg.files],hashes:Object.fromEntries(pkg.files.map(f=>[f,sha(readFileSync(join(root,f)))])),
   registry:lines.map(({seam,id,file,export:e,alias:a})=>({seam,id,file,export:e,alias:a})),outbound:pkg.outbound,dependencies:pkg.dependencies};
  writeInstalled(root,[...others,record]);
  const problem=verify(root,{seams:[...new Set([...lines.map(l=>l.seam),...(current?.registry||[]).map(l=>l.seam)])],tests:runTests?pkg.files.filter(f=>/^tests\/[^/]+\.test\.mjs$/.test(f)):[]});
  if(problem)refuse('"'+pkg.id+'" did not pass, so nothing was changed:\n'+problem);
  log((current?'Updated ':'Applied ')+pkg.id+' '+pkg.version+(current?' (was '+current.version+')':'')+': '+pkg.files.length+' file(s), '+lines.map(l=>l.seam+' "'+l.id+'"').join(', ')+'.');
  if(pkg.outbound.length)log('It calls: '+pkg.outbound.join(', '));
  return record;
 }catch(e){tx.rollback();throw e}
}

export function remove(root,id,{force=false,log=console.log}={}){
 root=resolve(root);const installed=readInstalled(root),record=installed.find(x=>x?.id===id);
 if(!record)refuse('"'+id+'" is not installed. Installed: '+(installed.map(x=>x?.id).join(', ')||'none')+'.');
 const tx=transaction(root);
 try{
  tx.save(INSTALLED_FILE);removeSteps(root,tx,record,{force});
  writeInstalled(root,installed.filter(x=>x!==record));
  const problem=verify(root,{seams:[...new Set((record.registry||[]).map(l=>l.seam))]});
  if(problem)refuse('Removing "'+id+'" would break this copy, so nothing was changed (another extension may depend on it):\n'+problem);
  log('Removed '+id+' '+record.version+'.'+(Object.keys(record.dependencies||{}).length?' Its packages ('+Object.keys(record.dependencies).join(', ')+') stay in app/package.json; remove them only if nothing else uses them.':''));
  return record;
 }catch(e){tx.rollback();throw e}
}

// Everything bayit-doctor reports, plus what only the install record knows: changed files, missing lines, versions.
export function check(root){
 root=resolve(root);const problems=[],notes=[];let installed=[];
 try{installed=readInstalled(root)}catch(e){return {problems:[e.message],notes}}
 const version=bayitVersion(root);
 for(const x of installed){
  if(!x?.id)continue;
  if(x.minBayit&&cmpVersion(version,x.minBayit)<0)problems.push('"'+x.id+'" needs Bayit '+x.minBayit+'; this copy is '+version+'.');
  for(const f of x.files||[])if(existsSync(join(root,f))&&x.hashes?.[f]&&sha(readFileSync(join(root,f)))!==x.hashes[f])notes.push('"'+x.id+'": '+f+' was changed after it was applied.');
  for(const l of x.registry||[]){const r=registryOf(l.seam);if(!r||!existsSync(join(root,r.file))||!readFileSync(join(root,r.file),'utf8').split('\n').some(t=>t.endsWith(MARK+x.id)&&t.includes(' as '+l.alias+'}')))problems.push('"'+x.id+'": its line in '+(r?.file||l.seam)+' is missing. Re-apply its package with --update, or remove it.')}
  if(x.source&&!existsSync(join(root,x.source,'extension.json')))notes.push('"'+x.id+'": its package folder '+x.source+' is gone; keep a copy so it can be updated or re-applied.');
 }
 const problem=verify(root);if(problem)problems.push(...problem.split('\n'));
 return {installed,problems,notes};
}

// realpath: a temporary folder may be reached through a link (/var → /private/var on macOS).
if(process.argv[1]&&existsSync(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const args=process.argv.slice(2),flag=f=>{const i=args.indexOf(f);if(i<0)return false;args.splice(i,1);return true};
 const ri=args.indexOf('--root');let root=join(dirname(fileURLToPath(import.meta.url)),'../..');if(ri>=0){root=args[ri+1];args.splice(ri,2)}
 const update=flag('--update'),force=flag('--force'),noTests=flag('--no-tests'),[cmd,arg]=args;
 try{
  if(cmd==='apply'&&arg)apply(root,arg,{update,runTests:!noTests});
  else if(cmd==='remove'&&arg)remove(root,arg,{force});
  else if(cmd==='check'){const r=check(root);for(const x of r.installed)console.log('✓ '+x.id+' '+x.version+' · '+Object.entries(x.entries||{}).map(([s,ids])=>s+': '+ids.join(', ')).join(' · '));if(!r.installed.length)console.log('No extensions installed.');for(const n of r.notes)console.log('! '+n);for(const p of r.problems)console.error('✗ '+p);process.exit(r.problems.length?1:0)}
  else{console.error('Usage: bayit-extension.mjs apply <package-folder> [--update] [--no-tests] | remove <id> [--force] | check   [--root <folder>]');process.exit(2)}
 }catch(e){if(e instanceof Refusal){console.error(e.message);process.exit(1)}throw e}
}

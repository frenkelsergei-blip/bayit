// Keeps installed extensions safe across a Bayit update (work package 3.5; .agents/skills/bayit-update).
//   node app/scripts/bayit-extension.mjs keep <folder>      before updating
//   node app/scripts/bayit-extension.mjs restore <folder>   after updating (or to go back)
// keep copies every installed extension (its install record, its files as they are now, its package folder when that
// lives in the copy) into <folder> OUTSIDE the copy, then takes the extensions out with `remove`, so the local
// registry files and installed.json are exactly as upstream shipped them and any update path (git pull, a fresh
// download, a Docker rebuild) meets a clean tree.
// restore re-applies each kept extension, in install order, to whatever Bayit version is now in the copy: its kept
// files byte for byte and its registry lines regenerated in the NEW registry files, through `apply`, which loads the
// new core registries and runs the extension's own tests (for a feature module, the conformance suite) and rolls an
// extension back completely when it does not fit. Nothing here touches the database or stored household data.
// `tools` is {apply, remove, check} from bayit-extension.mjs, which loads this file for its keep/restore commands
// (passed in rather than imported, so the two files do not import each other).
import {readFileSync,writeFileSync,existsSync,mkdirSync,mkdtempSync,cpSync,rmSync,readdirSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {INSTALLED_FILE} from './local-registries.mjs';

export const KEEP_FILE='keep.json';
class KeepRefusal extends Error{}
const refuse=message=>{throw new KeepRefusal(message)};
export const isKeepRefusal=e=>e instanceof KeepRefusal;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=root=>JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).version;
const installedOf=root=>{try{const v=JSON.parse(readFileSync(join(root,INSTALLED_FILE),'utf8'));return Array.isArray(v)?v:[]}catch{return []}};
const real=p=>{let probe=resolve(p);const rest=[];while(!existsSync(probe)){rest.unshift(probe.slice(dirname(probe).length+1));probe=dirname(probe)}return join(realpathSync(probe),...rest)};
const inside=(root,p)=>{const r=real(root),q=real(p);return q===r||q.startsWith(r+sep)};
// A package folder kept with the extension: only one that lives in this copy and is the family's own (local-extensions/).
const ownSource=x=>typeof x.source==='string'&&/^local-extensions\/[a-z][a-z0-9-]{1,39}$/.test(x.source);
function gitHead(root){
 if(!existsSync(join(root,'.git')))return null;
 const r=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});return r.status===0?r.stdout.trim():null;
}

// Copies the installed extensions into <folder> and takes them out of the copy. Refuses on a copy whose extensions
// have problems: fix those first, so what is kept is a working state.
export function keep(root,folder,{tools,log=console.log}={}){
 const {remove,check}=tools;
 root=resolve(root);folder=resolve(folder);
 if(inside(root,folder))refuse('Keep the extensions in a folder outside this copy of Bayit (an update may replace the whole copy), for example ../bayit-kept-extensions.');
 if(existsSync(folder)&&readdirSync(folder).length)refuse(folder+' is not empty. Choose a new folder, so an earlier keep is never overwritten.');
 const before=check(root);
 if(before.problems.length)refuse('The installed extensions have problems, so nothing was kept or changed. Fix these first (bayit-extension.mjs check):\n'+before.problems.join('\n'));
 const installed=installedOf(root);
 mkdirSync(join(folder,'files'),{recursive:true});
 for(const x of installed){
  for(const f of x.files||[])cpSync(join(root,f),join(folder,'files',f));
  if(ownSource(x)&&existsSync(join(root,x.source,'extension.json')))cpSync(join(root,x.source),join(folder,'sources',x.id),{recursive:true});
 }
 const record={keptAt:new Date().toISOString(),bayit:version(root),git:gitHead(root),installed};
 writeFileSync(join(folder,KEEP_FILE),JSON.stringify(record,null,1)+'\n');
 // Prove the folder is complete before anything is taken out of the copy.
 for(const x of installed)for(const f of x.files||[])if(sha(readFileSync(join(folder,'files',f)))!==sha(readFileSync(join(root,f))))refuse('Could not copy '+f+' completely; nothing was taken out.');
 for(const x of [...installed].reverse())remove(root,x.id,{force:true,log:()=>{}});
 log(installed.length?'Kept '+installed.map(x=>x.id+' '+x.version).join(', ')+' in '+folder+' and took '+(installed.length>1?'them':'it')+' out of this copy (Bayit '+record.bayit+'). Your saved records are not touched.':'No extensions installed; nothing to keep. ('+folder+' records that.)');
 return record;
}

// A package for `apply`, built from a kept record and its kept files.
function packageFrom(folder,x,into){
 const dir=join(into,x.id);
 const manifest={id:x.id,version:x.version,name:x.name,seam:x.seam,minBayit:x.minBayit,files:x.files,
  registry:(x.registry||[]).map(({seam,id,file,export:e})=>({seam,id,file,export:e})),outbound:x.outbound||[],dependencies:x.dependencies||{}};
 mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'extension.json'),JSON.stringify(manifest,null,1));
 for(const f of x.files||[])cpSync(join(folder,'files',f),join(dir,f.startsWith('tests/')?f:join('payload',f)));
 return dir;
}

// Re-applies every kept extension to the Bayit now in the copy. Returns {restored, already, unfit:[{id,version,reason}], problems}.
export function restore(root,folder,{tools,log=console.log}={}){
 const {apply,check}=tools;
 root=resolve(root);folder=resolve(folder);
 const file=join(folder,KEEP_FILE);if(!existsSync(file))refuse(folder+' has no '+KEEP_FILE+'; it is not a folder written by "keep".');
 const kept=JSON.parse(readFileSync(file,'utf8'));
 const now=version(root),scratch=mkdtempSync(join(tmpdir(),'bayit-restore-'));
 const restored=[],already=[],unfit=[];
 try{
  for(const x of kept.installed){
   const current=installedOf(root).find(y=>y?.id===x.id);
   if(current){
    if(current.version===x.version&&!check(root).problems.some(p=>p.includes('"'+x.id+'"'))){already.push(x.id);continue}
    unfit.push({id:x.id,version:x.version,reason:'this copy already has "'+x.id+'" '+current.version+' installed; remove it first if you want the kept '+x.version+' back.'});continue;
   }
   if(ownSource(x)&&!existsSync(join(root,x.source))&&existsSync(join(folder,'sources',x.id)))cpSync(join(folder,'sources',x.id),join(root,x.source),{recursive:true});
   // A file left behind by an earlier, partial update is removed when it is exactly the kept one; anything else at
   // that path now belongs to the new Bayit, and the extension does not fit.
   const clash=(x.files||[]).filter(f=>existsSync(join(root,f))&&sha(readFileSync(join(root,f)))!==sha(readFileSync(join(folder,'files',f))));
   if(clash.length){unfit.push({id:x.id,version:x.version,reason:'Bayit '+now+' has its own file at '+clash.join(', ')+'.'});continue}
   const leftovers=(x.files||[]).filter(f=>existsSync(join(root,f)));
   for(const f of leftovers)rmSync(join(root,f));
   try{apply(root,packageFrom(folder,x,scratch),{log:()=>{}})}
   catch(e){
    for(const f of leftovers)if(!existsSync(join(root,f))){mkdirSync(dirname(join(root,f)),{recursive:true});cpSync(join(folder,'files',f),join(root,f))}
    unfit.push({id:x.id,version:x.version,reason:plain(e.message)});continue;
   }
   // Put the original record back: same lines and names, the original source, and the hashes from the first apply,
   // so `check` still notices files the family edited.
   const list=installedOf(root),i=list.findIndex(y=>y?.id===x.id);
   if(i>=0&&JSON.stringify(list[i].registry)===JSON.stringify(x.registry)){list[i]=x;writeFileSync(join(root,INSTALLED_FILE),JSON.stringify(list,null,1)+'\n')}
   restored.push(x.id);
  }
 }finally{rmSync(scratch,{recursive:true,force:true})}
 const after=check(root);
 log(report({kept,now,restored,already,unfit,problems:after.problems,folder}));
 return {restored,already,unfit,problems:after.problems};
}

// The reason without the loader's file paths, source excerpts and carets: the error lines when there are any.
const plain=message=>{
 const lines=String(message).replace(/^"[^"]+" did not pass, so nothing was changed:\n/,'').split('\n');
 const errors=lines.filter(l=>/^\s*(\w*Error|Bayit [a-z-]+ "): /.test(l)||/^\s*Error: /.test(l)).map(l=>l.trim().replace(/^\w*Error: /,''));
 return (errors.length?errors:lines.filter(l=>!/^\s*(file:\/\/|\^+\s*$)/.test(l))).join('\n');
};
// Plain words for the family (through their agent): what came back, what does not fit and the three choices.
export function report({kept,now,restored,already,unfit,problems,folder}){
 const out=[];
 if(!kept.installed.length)out.push('No extensions were kept, so there is nothing to bring back.');
 if(restored.length)out.push('Back in place on Bayit '+now+': '+restored.join(', ')+'. Their tests passed on this version.');
 if(already.length)out.push('Already in place: '+already.join(', ')+'.');
 for(const u of unfit)out.push('✗ "'+u.id+'" '+u.version+' does not fit Bayit '+now+' and was left out:\n  '+u.reason.split('\n').join('\n  '));
 for(const p of problems)out.push('✗ '+p);
 if(unfit.length||problems.length){
  const back=kept.git?'git reset --hard '+kept.git:'put the folder of the old copy back';
  out.push('Do not deploy. Nothing live has changed yet. Choose one:\n'+
   '  1. Keep Bayit '+kept.bayit+' for now: '+back+', then run: node app/scripts/bayit-extension.mjs restore '+folder+'\n'+
   '  2. Update without '+(unfit.map(u=>'"'+u.id+'"').join(', ')||'it')+': its saved records stay stored and hidden, and come back when a version that fits is installed.\n'+
   '  3. Ask its author for a version that fits Bayit '+now+' (send them the message above), and keep Bayit '+kept.bayit+' meanwhile (choice 1).');
 }
 return out.join('\n');
}


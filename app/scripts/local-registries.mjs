#!/usr/bin/env node
// The local extension registries: files upstream Bayit ships empty and never edits (docs/extensions-registry.md).
// Used by bayit-doctor, tests/extensions.test.mjs and work/export-public.sh, so the list lives in one place.
//   node app/scripts/local-registries.mjs private-paths <repo>  print the local files and every file installed.json lists
//   node app/scripts/local-registries.mjs ensure-empty <copy>   create missing local files empty in <copy>; fail
//                                                               (never overwrite) when one there has entries
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const header=what=>`// Local registry: ${what} added by installed extensions (docs/extensions-registry.md).\n// Upstream Bayit ships this list empty and never edits this file, so updates never conflict with your extensions.\n`;
// seam: the key an installed.json record uses in "entries". optional: another work package creates the file;
// it is checked only when it exists.
export const LOCAL_REGISTRIES=[
 {seam:'features',file:'shared/extensions/features.mjs',name:'EXTRA_FEATURES',what:'features'},
 {seam:'ai-providers',file:'shared/extensions/ai-providers.mjs',name:'EXTRA_AI_PROVIDERS',what:'AI providers'},
 {seam:'speech',file:'app/cloud/extensions/speech.mjs',name:'EXTRA_SPEECH',what:'speech-to-text providers'},
 {seam:'signin',file:'app/cloud/extensions/signin.mjs',name:'EXTRA_SIGNIN',what:'sign-in methods'},
 {seam:'channels',file:'app/cloud/extensions/channels.mjs',name:'EXTRA_CHANNELS',what:'messaging channels'},
 {seam:'statement-formats',file:'shared/extensions/statement-formats.mjs',name:'EXTRA_STATEMENT_FORMATS',what:'bank and card statement formats'},
 {seam:'connections',file:'shared/extensions/connections.mjs',name:'EXTRA_CONNECTIONS',what:'connections',optional:true},
 {seam:'modules',file:'shared/extensions/modules.mjs',name:'EXTRA_MODULES',what:'feature modules'},
];
export const INSTALLED_FILE='shared/extensions/installed.json';
export const emptyRegistry=r=>header(r.what)+`export const ${r.name}=[];\n`;

// Empty means: nothing but comments and `export const NAME=[];`.
export function registryIsEmpty(r,text){
 const code=text.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('').replace(/\s+/g,'');
 return code===`exportconst${r.name}=[];`;
}
export function installedIsEmpty(text){try{const v=JSON.parse(text);return Array.isArray(v)&&v.length===0}catch{return false}}

// Every local file in a tree: [{file, exists, empty}].
export function localFiles(root){
 const out=[];
 for(const r of LOCAL_REGISTRIES){const p=join(root,r.file);if(!existsSync(p)){if(!r.optional)out.push({...r,exists:false,empty:false});continue}out.push({...r,exists:true,empty:registryIsEmpty(r,readFileSync(p,'utf8'))})}
 const p=join(root,INSTALLED_FILE);out.push({seam:'installed',file:INSTALLED_FILE,exists:existsSync(p),empty:existsSync(p)&&installedIsEmpty(readFileSync(p,'utf8'))});
 return out;
}

// What a tree has installed and registered, for bayit-doctor: problems are strings a person can act on.
export async function extensionReport(root){
 const problems=[],registered=[];let installed=[];
 const p=join(root,INSTALLED_FILE);
 if(!existsSync(p))problems.push(INSTALLED_FILE+' is missing. Restore it with the content [] .');
 else{try{installed=JSON.parse(readFileSync(p,'utf8'));if(!Array.isArray(installed)){problems.push(INSTALLED_FILE+' must be a list.');installed=[]}}catch{problems.push(INSTALLED_FILE+' is not valid JSON.')}}
 for(const r of LOCAL_REGISTRIES){
  const file=join(root,r.file);if(!existsSync(file)){if(!r.optional)problems.push(r.file+' is missing. Restore it empty: '+JSON.stringify(emptyRegistry(r).trim().split('\n').pop()));continue}
  let list;try{list=(await import(pathToFileURL(file).href))[r.name]}catch(e){problems.push(r.file+' could not be loaded: '+e.message);continue}
  if(!Array.isArray(list)){problems.push(r.file+' must export '+r.name+' as a list.');continue}
  for(const entry of list)registered.push({seam:r.seam,id:entry?.id});
 }
 for(const {seam,id} of registered)if(!installed.some(x=>x?.entries?.[seam]?.includes(id)))problems.push('The '+seam+' entry "'+id+'" is not recorded in '+INSTALLED_FILE+'. Reinstall its extension, or remove the line by hand.');
 for(const x of installed){
  if(!x||typeof x.id!=='string'){problems.push(INSTALLED_FILE+' has a record without an id.');continue}
  for(const [seam,ids] of Object.entries(x.entries||{}))for(const id of ids||[])if(!registered.some(e=>e.seam===seam&&e.id===id))problems.push('Extension "'+x.id+'" is recorded but its '+seam+' entry "'+id+'" is missing. Re-apply its skill, or follow its REMOVE.md.');
  for(const f of x.files||[])if(!existsSync(join(root,f)))problems.push('Extension "'+x.id+'" is recorded but its file '+f+' is missing.');
 }
 return {installed,registered,problems};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [cmd,dir]=process.argv.slice(2);if(!dir||!['private-paths','ensure-empty'].includes(cmd)){console.error('Usage: local-registries.mjs private-paths|ensure-empty <folder>');process.exit(2)}
 const root=resolve(dir);
 if(cmd==='private-paths'){
  let installed=[];try{installed=JSON.parse(readFileSync(join(root,INSTALLED_FILE),'utf8'))}catch{}
  const files=[...LOCAL_REGISTRIES.map(r=>r.file),INSTALLED_FILE,...(Array.isArray(installed)?installed.flatMap(x=>Array.isArray(x?.files)?x.files:[]):[])];
  console.log([...new Set(files.filter(f=>typeof f==='string'&&!f.includes('..')))].join('\n'));
 }else{
  // Optional registries are created once the project this script belongs to has them.
  const own=join(dirname(fileURLToPath(import.meta.url)),'../..');
  for(const r of [...LOCAL_REGISTRIES.filter(r=>!r.optional||existsSync(join(own,r.file))),{file:INSTALLED_FILE}]){const p=join(root,r.file);if(existsSync(p))continue;mkdirSync(dirname(p),{recursive:true});writeFileSync(p,r.name?emptyRegistry(r):'[]\n')}
  const full=localFiles(root).filter(f=>f.exists&&!f.empty);
  for(const f of full)console.error('The copy at '+root+' has entries in '+f.file+'.');
  if(full.length){console.error('Not overwriting them. A public copy must ship these files empty: move the entries into an extension skill first.');process.exit(1)}
 }
}

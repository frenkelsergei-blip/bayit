#!/usr/bin/env node
// Scaffolds a new Bayit extension package (docs/extension-skills.md) for one seam, from the templates of the
// bayit-new-extension skill (.agents/skills/bayit-new-extension/templates/<kind>/).
//   node app/scripts/bayit-new-extension.mjs seams
//   node app/scripts/bayit-new-extension.mjs <kind> <id> [--name "English name"] [--he "שם בעברית"] [--out <folder>]
// kind: ai-provider | statement-format | speech | signin | connection | feature   (or the seam key, e.g. ai-providers)
// Default output: local-extensions/<id>/ in this copy. Options: --root <folder> works on another copy of Bayit.
// The package it writes is complete and valid for `bayit-extension.mjs apply`, with every registry line and file
// declared. Its behaviour test FAILS on purpose until the TODO(bayit) spots are filled in, so `apply` (which runs the
// package's tests) refuses an unfinished extension. The conformance test passes from the start.
import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readPackage,SEAM_MODULES} from './bayit-extension.mjs';
import {INSTALLED_FILE} from './local-registries.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
export const TEMPLATES=join(HERE,'../../.agents/skills/bayit-new-extension/templates');

// What can be scaffolded today. `list` is the core registry export whose ids a new id must not reuse.
export const KINDS={
 'ai-provider':{seam:'ai-providers',list:'AI_PROVIDERS',what:'an AI model or service the family can choose in the AI window',contract:'docs/extensions-registry.md (AI providers), shared/ai-providers.mjs',generator:'bayit-add-ai-provider'},
 'statement-format':{seam:'statement-formats',list:'STATEMENT_FORMATS',what:'reading another bank or card statement PDF in Expenses',contract:'shared/finance-parse.mjs (parseLeumi / parseMax shape)',generator:'bayit-add-statement-format'},
 speech:{seam:'speech',list:'SPEECH_REGISTRY',what:'another speech-to-text service for voice messages',contract:'the comment at the top of app/cloud/speech.mjs; tests/speech-providers.test.mjs'},
 signin:{seam:'signin',list:'SIGNIN_METHODS',what:'another way to sign in (an OAuth / OpenID provider through Auth.js)',contract:'docs/sign-in-methods.md; tests/signin-methods.test.mjs',review:true},
 connection:{seam:'connections',list:'CONNECTIONS',what:'a card in Settings > Accounts & connections with a guide and a panel',contract:'the comment at the top of shared/connections.mjs; app/src/extensions/connection-panels.jsx'},
 // A feature module's id is also a feature id, so it may not reuse any feature (core or installed).
 feature:{seam:'modules',list:'FEATURE_IDS',from:'shared/features.mjs',what:'a whole screen with its own records (a feature module; no outside services, Today, reminders, Telegram or AI yet)',contract:'docs/feature-module-contract.md; tests/feature-module-conformance.mjs'},
};
// Seams people ask for that cannot be scaffolded yet, with the honest reason and where to look.
export const NOT_YET={
 channel:{doc:'docs/channel-contract.md',why:'Messaging channels (WhatsApp, Signal, …): the channel contract (work package 2.3) and its local registry exist, but a working channel still needs core changes the contract lists under "Not part of the seam yet" (recent sign-in for its link endpoints, member removal, key rotation, commands). Write one by hand against docs/channel-contract.md and tests/channel-conformance.mjs, or wait for the second channel (4.3) to shape the scaffold.'},
 host:{doc:'docs/host-contract.md',why:'A host is not an extension: it is another way to run the whole server (like app/host for Docker). Follow docs/host-contract.md and run tests/host-conformance.mjs against it; it lives in its own folder or repository, not in a local registry.'},
 'today-widget':{doc:'docs/extension-skills.md (Seams still missing)',why:'Today widgets have no local registry yet; bayit-add-today-widget explains the core-change path.'},
};
const ALIASES={'ai-providers':'ai-provider',ai:'ai-provider','statement-formats':'statement-format',statement:'statement-format',bank:'statement-format','sign-in':'signin',connections:'connection',features:'feature','feature-module':'feature',channels:'channel',hosts:'host'};
export const kindOf=name=>ALIASES[name]||name;

class Refusal extends Error{}
const refuse=message=>{throw new Refusal(message)};
const ID=/^[a-z][a-z0-9-]{1,39}$/;
const upper=id=>id.toUpperCase().replace(/-/g,'_');

// The ids already taken in this copy: core and installed entries of the seam, and installed extension ids.
function takenIds(root,kind){
 const k=KINDS[kind],module=k.from||SEAM_MODULES[k.seam];
 const code=`const m=await import(${JSON.stringify(join(root,module))});const l=m[${JSON.stringify(k.list)}];console.log(JSON.stringify(l.map(x=>typeof x==='string'?x:x.id)))`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',cwd:root});
 let ids=[];try{ids=JSON.parse(run.stdout)}catch{}
 let installed=[];try{installed=JSON.parse(readFileSync(join(root,INSTALLED_FILE),'utf8')).map(x=>x?.id)}catch{}
 return {entries:ids,extensions:installed};
}

// Writes the package. Returns {dir, files, todos}.
export function scaffold(root,kindName,id,{name,he,out}={}){
 root=resolve(root);const kind=kindOf(kindName);
 if(NOT_YET[kind])refuse(kind+' cannot be scaffolded yet. '+NOT_YET[kind].why+' See '+NOT_YET[kind].doc+'.');
 if(!KINDS[kind])refuse('Unknown kind "'+kindName+'". Choose one of: '+Object.keys(KINDS).join(', ')+'.');
 if(typeof id!=='string'||!ID.test(id))refuse('The id must be 2-40 lowercase letters, digits or "-", starting with a letter (for example "acme-bank").');
 const taken=takenIds(root,kind);
 if(taken.entries.includes(id))refuse('"'+id+'" is already a '+KINDS[kind].seam+' entry in this copy. Pick another id.');
 if(taken.extensions.includes(id))refuse('An extension "'+id+'" is already installed. Pick another id.');
 const minBayit=JSON.parse(readFileSync(join(root,'app/package.json'),'utf8')).version;
 const nameEn=(name||id.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')).trim();
 if(typeof he!=='string'||!/[\u0590-\u05FF]/.test(he))refuse('Give the Hebrew name too, with --he "…" (every extension ships Hebrew and English).');
 if(/["\\'`\n]/.test(nameEn+he))refuse('Names may not contain quotes, backslashes or line breaks.');
 const tokens={__ID__:id,__EXPORT__:upper(id),__ENV__:upper(id),__NAME_EN__:nameEn,__NAME_HE__:he.trim(),__MIN_BAYIT__:minBayit};
 const fill=text=>text.replace(/__(ID|EXPORT|ENV|NAME_EN|NAME_HE|MIN_BAYIT)__/g,t=>tokens[t]);
 const dir=resolve(out||join(root,'local-extensions',id));
 if(existsSync(dir)&&readdirSync(dir).length)refuse(dir+' already exists and is not empty. Choose another --out, or move it away.');
 const from=join(TEMPLATES,kind),files=[];
 const walk=rel=>readdirSync(join(from,rel),{withFileTypes:true}).forEach(e=>{const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())walk(p);else if(e.name!=='.DS_Store')files.push(p)});
 walk('');
 const written=[];
 try{
  for(const f of files){const target=join(dir,fill(f));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,fill(readFileSync(join(from,f),'utf8')));written.push(fill(f))}
  readPackage(dir);// the same validation apply runs
 }catch(e){rmSync(dir,{recursive:true,force:true});throw e}
 const todos=written.flatMap(f=>readFileSync(join(dir,f),'utf8').split('\n').map((l,i)=>l.includes('TODO(bayit)')?f+':'+(i+1)+'  '+l.trim().replace(/^.*?TODO\(bayit\):?\s*/,'').replace(/\s*-->$/,''):null).filter(Boolean));
 return {dir,kind,files:written.sort(),todos};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),opt=f=>{const i=args.indexOf(f);if(i<0)return undefined;const v=args[i+1];args.splice(i,2);return v};
 let root=join(HERE,'../..');const r=opt('--root');if(r)root=r;
 const name=opt('--name'),he=opt('--he'),out=opt('--out'),[cmd,id]=args;
 try{
  if(cmd==='seams'||!cmd){
   console.log('Can be scaffolded now:');for(const [k,v] of Object.entries(KINDS))console.log('  '+k.padEnd(17)+v.what+(v.review?' (needs a security review)':'')+'\n  '+''.padEnd(17)+'contract: '+v.contract);
   console.log('\nNot yet:');for(const [k,v] of Object.entries(NOT_YET))console.log('  '+k.padEnd(17)+v.why+'\n  '+''.padEnd(17)+'see '+v.doc+(k==='channel'&&existsSync(join(root,v.doc))?' (it exists now: read it)':''));
   if(!cmd)process.exit(2);
  }else{
   if(!id)refuse('Usage: bayit-new-extension.mjs <kind> <id> [--name "English"] [--he "עברית"] [--out <folder>] [--root <copy>]');
   const res=scaffold(root,cmd,id,{name,he,out}),rel=relative(resolve(root),res.dir).split(sep).join('/'),at=rel.startsWith('..')?res.dir:rel;
   console.log('Wrote '+res.kind+' extension "'+id+'" to '+at+'/:');for(const f of res.files)console.log('  '+f);
   console.log('\nFill in every TODO(bayit) ('+res.todos.length+'):');for(const t of res.todos)console.log('  '+t);
   console.log('\nIts behaviour test fails until they are filled in, so apply refuses it until then. Next:\n  node app/scripts/bayit-extension.mjs apply '+at+'\n  node app/scripts/bayit-extension.mjs check\n  node app/scripts/bayit-extension.mjs remove '+id);
  }
 }catch(e){if(e instanceof Refusal){console.error(e.message);process.exit(1)}throw e}
}

#!/usr/bin/env node
// Points this copy of Bayit at YOUR Cloudflare resources. Edits only names and IDs, never secrets.
//   node scripts/bayit-configure.mjs --project my-bayit --database-id <id> [--database bayit-home] [--bucket bayit-home-files] [--origin https://my-bayit.pages.dev]
// Files changed: wrangler.jsonc, wrangler.worker.jsonc, wrangler.cron.jsonc, package.json (deploy scripts).
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const app=join(dirname(fileURLToPath(import.meta.url)),'..');
const args=Object.fromEntries(process.argv.slice(2).join(' ').split(/\s+--/).map(s=>s.replace(/^--/,'').trim()).filter(Boolean).map(s=>{const [k,...v]=s.split(/[\s=]+/);return [k,v.join(' ')]}));
const project=args.project,databaseId=args['database-id'],database=args.database||'bayit-home',bucket=args.bucket||'bayit-home-files',origin=(args.origin||(project?'https://'+project+'.pages.dev':'')).replace(/\/$/,'');
if(!project&&!databaseId&&!args.origin){console.log(readFileSync(fileURLToPath(import.meta.url),'utf8').split('\n').slice(1,5).join('\n').replace(/\/\/ ?/g,''));process.exit(1)}
if(project&&!/^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/.test(project))throw new Error('The Pages project name must use lowercase letters, digits and dashes.');
if(databaseId&&!/^[0-9a-f-]{36}$/i.test(databaseId))throw new Error('The D1 database_id is the UUID printed by `wrangler d1 create`.');
if(origin&&!/^https:\/\/[a-z0-9.-]+$/i.test(origin))throw new Error('The origin must look like https://name.pages.dev or your own https domain.');

const changed=[];
const readJSONC=file=>readFileSync(file,'utf8');
// wrangler.jsonc / wrangler.worker.jsonc are plain JSON; edit them structurally.
for(const name of ['wrangler.jsonc','wrangler.worker.jsonc']){
 const file=join(app,name);if(!existsSync(file))continue;const config=JSON.parse(readJSONC(file));
 if(project&&name==='wrangler.jsonc')config.name=project;
 for(const d of config.d1_databases||[]){if(databaseId)d.database_id=databaseId;d.database_name=database}
 for(const b of config.r2_buckets||[])b.bucket_name=bucket;
 if(project)config.services=[...(config.services||[]).filter(s=>s.binding!=='PDF_READER'),{binding:'PDF_READER',service:project+'-pdf'}];
 writeFileSync(file,JSON.stringify(config,null,2)+'\n');changed.push(name);
}
const pdfFile=join(app,'wrangler.pdf.jsonc');if(project&&existsSync(pdfFile)){const config=JSON.parse(readJSONC(pdfFile));config.name=project+'-pdf';writeFileSync(pdfFile,JSON.stringify(config,null,2)+'\n');changed.push('wrangler.pdf.jsonc')}
// The scheduler config has comments, so only its BAYIT_ORIGIN value is replaced.
const cron=join(app,'wrangler.cron.jsonc');
if(origin&&existsSync(cron)){const s=readFileSync(cron,'utf8'),next=s.replace(/("BAYIT_ORIGIN"\s*:\s*")[^"]*(")/,'$1'+origin+'$2');if(next!==s){writeFileSync(cron,next);changed.push('wrangler.cron.jsonc')}}
const pkgFile=join(app,'package.json');
if(project){const pkg=JSON.parse(readFileSync(pkgFile,'utf8'));pkg.scripts['deploy:cloud']=pkg.scripts['deploy:cloud'].replace(/--project-name \S+/,'--project-name '+project);writeFileSync(pkgFile,JSON.stringify(pkg,null,2)+'\n');changed.push('package.json')}
// Database name is also used in the migration commands people copy from the docs; print the ones for this setup.
console.log('Updated: '+changed.join(', '));
console.log('Project: '+(project||'(unchanged)')+' · Database: '+database+(databaseId?' ('+databaseId+')':'')+' · Bucket: '+bucket+(origin?' · Address: '+origin:''));
console.log('Next: npx wrangler d1 migrations apply '+database+' --remote');

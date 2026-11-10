#!/usr/bin/env node
// Checks a Bayit installation and says what is missing, without printing any secret.
//   node scripts/bayit-doctor.mjs --cloudflare [--origin https://my-bayit.pages.dev]
//   node scripts/bayit-doctor.mjs --docker [--origin http://localhost:8080]
// Exit code 0 when nothing blocks sign-in; 1 when something needs fixing.
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {extensionReport} from './local-registries.mjs';

const app=join(dirname(fileURLToPath(import.meta.url)),'..'),root=join(app,'..');
const argv=process.argv.slice(2),mode=argv.includes('--docker')?'docker':'cloudflare',flag=n=>{const i=argv.indexOf('--'+n);return i>=0?argv[i+1]:''};
let failed=0;const ok=m=>console.log('  ✔ '+m),bad=(m,fix)=>{failed++;console.log('  ✖ '+m+(fix?'\n      → '+fix:''))},note=m=>console.log('  • '+m);
const run=(cmd,args,opts={})=>{try{return execFileSync(cmd,args,{cwd:app,stdio:['ignore','pipe','pipe'],timeout:60000,...opts}).toString()}catch(e){return null}};
const local=JSON.parse(readFileSync(join(app,'package.json'),'utf8'));
const env=(()=>{const f=join(root,'.env');if(!existsSync(f))return null;return Object.fromEntries(readFileSync(f,'utf8').split('\n').filter(l=>/^\s*[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}))})();

console.log('Bayit doctor · '+mode+' · this copy is version '+local.version+'\n');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major>22||major===22&&minor>=13)ok('Node.js '+process.versions.node);else bad('Node.js '+process.versions.node+' is too old','Install Node.js 22.13 or newer (24 LTS recommended).');

// Installed extensions (shared/extensions/installed.json) against what the local registries actually contain.
console.log('\nExtensions');
const ext=await extensionReport(root);
if(!ext.installed.length&&!ext.registered.length)note('No extensions installed.');
for(const x of ext.installed)if(x?.id)ok('Extension '+x.id+(x.version?' '+x.version:'')+Object.entries(x.entries||{}).map(([seam,ids])=>' · '+seam+': '+(ids||[]).join(', ')).join(''));
for(const problem of ext.problems)bad(problem);
let origin=flag('origin');
if(mode==='cloudflare'){
 console.log('\nCloudflare');
 const wr=JSON.parse(readFileSync(join(app,'wrangler.jsonc'),'utf8')),db=wr.d1_databases?.[0];
 if(!db?.database_id||db.database_id.includes('<'))bad('wrangler.jsonc has no D1 database_id','Run `npx wrangler d1 create bayit-home`, then `node scripts/bayit-configure.mjs --project <name> --database-id <id>`.');else ok('D1 database configured: '+db.database_name);
 const project=(local.scripts['deploy:cloud'].match(/--project-name (\S+)/)||[])[1];note('Pages project: '+project);
 const cron=readFileSync(join(app,'wrangler.cron.jsonc'),'utf8').match(/"BAYIT_ORIGIN"\s*:\s*"([^"]*)"/)?.[1]||'';
 if(cron.includes('<'))bad('wrangler.cron.jsonc still has a placeholder BAYIT_ORIGIN','Run `node scripts/bayit-configure.mjs --origin https://<project>.pages.dev` (needed only for Telegram reminders).');else ok('Reminder scheduler points to '+cron);
 // Only check an address this copy was configured for (or one passed with --origin), never a guess.
 const configured=db?.database_id&&!db.database_id.includes('<');
 origin=origin||(configured&&!cron.includes('<')?cron:'');
 const who=run('npx',['wrangler','whoami']);
 if(!who||/not authenticated|You are not logged in/i.test(who))bad('wrangler is not logged in','Run `npx wrangler login`.');else{ok('wrangler is logged in');
  if(db?.database_id&&!db.database_id.includes('<')){const list=run('npx',['wrangler','d1','migrations','list',db.database_name,'--remote']);if(list===null)bad('Could not read remote migrations','Check that the D1 database exists in this Cloudflare account.');else if(/No migrations to apply/i.test(list))ok('Database schema is up to date');else bad('Database migrations are waiting','Run `npx wrangler d1 migrations apply '+db.database_name+' --remote` before deploying.')}
  if(project){const secrets=run('npx',['wrangler','pages','secret','list','--project-name',project]);if(secrets===null)bad('Could not list Pages secrets for '+project,'Create the project with `npx wrangler pages project create '+project+'`.');else for(const name of ['AUTH_SECRET','APP_ENCRYPTION_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']){if(secrets.includes(name))ok('Secret '+name+' is set');else bad('Secret '+name+' is missing','Run `npx wrangler pages secret put '+name+' --project-name '+project+'`.')}
   const secretsList=secrets||'';if(!secretsList.includes('REMINDER_CRON_SECRET'))note('REMINDER_CRON_SECRET is not set (only needed for Telegram reminders).')}
 }
}else{
 console.log('\nDocker');
 const dv=run('docker',['version','--format','{{.Server.Version}}']);if(dv)ok('Docker engine '+dv.trim());else bad('Docker is not running','Start Docker (Docker Desktop on Mac/Windows, or `sudo systemctl start docker`).');
 if(!env)bad('No .env file in the repository root','Run `cp .env.example .env` and fill it in.');else{
  origin=origin||env.BAYIT_ORIGIN||'http://localhost:'+(env.BAYIT_PORT||8080);
  ok('.env found · BAYIT_ORIGIN '+(env.BAYIT_ORIGIN||'(not set)'));
  if(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)ok('Google sign-in values are set');else bad('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are empty','Create a Web OAuth client and add '+(env.BAYIT_ORIGIN||'<BAYIT_ORIGIN>')+'/api/auth/callback/google as redirect URI. The demo works without them.');
  if(env.BAYIT_ORIGIN&&!env.BAYIT_ORIGIN.startsWith('https://'))note('BAYIT_ORIGIN is not https: Google sign-in and Telegram need a public https address (Caddy profile or a tunnel).');
 }
 const ps=run('docker',['compose','ps','--format','{{.Service}} {{.State}} {{.Health}}'],{cwd:root});if(ps&&/bayit running/.test(ps))ok('Container: '+ps.trim().split('\n').find(l=>l.startsWith('bayit')));else bad('The bayit container is not running','Run `docker compose up -d --build` in the repository root.');
}

console.log('\nThe running site');
if(!origin)note('No site address yet. Configure this copy first, or pass --origin <your address>.');else{
 try{
  const health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(15000)});if(!health.ok)throw new Error('HTTP '+health.status);ok(origin+' answers');
  const config=await (await fetch(origin+'/api/config',{signal:AbortSignal.timeout(15000)})).json();
  if(config.storage?.connected)ok('Household storage connected');else bad('Storage is not connected','Check the D1/R2 bindings (Cloudflare) or the data volume (Docker).');
  if(config.auth?.configured)ok('Google sign-in is configured');else bad('Google sign-in is off','Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET, then redeploy/restart.');
  const v=await (await fetch(origin+'/version.json?t='+Date.now(),{signal:AbortSignal.timeout(15000)})).json();
  if(v.version===local.version)ok('Running version '+v.version+' (build '+v.buildId+')');else note('Running version '+v.version+', this copy is '+local.version+'. Deploy/rebuild to update.');
 }catch(e){bad('Could not reach '+origin+' ('+e.message+')',mode==='docker'?'Start the container, or check the port and BAYIT_ORIGIN.':'Deploy with `npm run deploy:cloud`.')}
}
console.log('\n'+(failed?failed+' thing(s) to fix.':'Everything needed for sign-in is in place. Connect AI, Telegram and RiseUp in Settings → Accounts & connections.'));
process.exit(failed?1:0);

// Packages Bayit for Node.js / Docker: one bundled server file, the built client and the database migrations.
// Run after `npm run build:cloud`. Output: dist/host/{server.mjs,public/,migrations/}.
import {cp,rm,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {buildPolicy} from '../scripts/security-policy.mjs';
const csp=await buildPolicy();
await rm('dist/host',{recursive:true,force:true});await mkdir('dist/host',{recursive:true});
await build({entryPoints:['host/node-server.mjs'],outfile:'dist/host/server.mjs',bundle:true,format:'esm',platform:'node',target:'node22',minify:true,define:{__BAYIT_CSP__:JSON.stringify(csp)},
 banner:{js:"import {createRequire as __bayitRequire} from 'node:module';const require=__bayitRequire(import.meta.url);"}});
await build({entryPoints:['host/pdf-parser-worker.mjs'],outfile:'dist/host/pdf-parser-worker.mjs',bundle:true,format:'esm',platform:'node',target:'node22',banner:{js:"import {createRequire as readerRequire} from 'node:module';const require=readerRequire(import.meta.url);"}});
await cp('dist/client','dist/host/public',{recursive:true});
await build({entryPoints:['host/backup-cli.mjs'],outfile:'dist/host/backup-cli.mjs',bundle:true,format:'esm',platform:'node',target:'node22'});
await build({entryPoints:['host/rotate-credentials-cli.mjs'],outfile:'dist/host/rotate-credentials-cli.mjs',bundle:true,format:'esm',platform:'node',target:'node22'});
await build({entryPoints:['host/recovery-cli.mjs'],outfile:'dist/host/recovery-cli.mjs',bundle:true,format:'esm',platform:'node',target:'node22'}); // passkey operator recovery code
await cp('cloud/migrations','dist/host/migrations',{recursive:true});
console.log('Prepared dist/host for Node.js and Docker.');

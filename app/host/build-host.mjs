// Packages Bayit for Node.js / Docker: one bundled server file, the built client and the database migrations.
// Run after `npm run build:cloud`. Output: dist/host/{server.mjs,public/,migrations/}.
import {cp,rm,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('dist/host',{recursive:true,force:true});await mkdir('dist/host',{recursive:true});
await build({entryPoints:['host/node-server.mjs'],outfile:'dist/host/server.mjs',bundle:true,format:'esm',platform:'node',target:'node22',minify:true,
 banner:{js:"import {createRequire as __bayitRequire} from 'node:module';const require=__bayitRequire(import.meta.url);"}});
await cp('dist/client','dist/host/public',{recursive:true});
await cp('cloud/migrations','dist/host/migrations',{recursive:true});
console.log('Prepared dist/host for Node.js and Docker.');

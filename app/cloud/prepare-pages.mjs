import {cp,rm,writeFile} from 'node:fs/promises';import {build} from 'esbuild';
import {buildPolicy} from '../scripts/security-policy.mjs';
const csp=await buildPolicy();
await rm('dist/pages',{recursive:true,force:true});await cp('dist/client','dist/pages',{recursive:true});
await build({entryPoints:['cloud/worker.mjs'],outfile:'dist/pages/_worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',define:{__BAYIT_CSP__:JSON.stringify(csp)},external:['node:*'],minify:true});
await writeFile('dist/pages/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
await writeFile('dist/pages/_headers','/*\n  Content-Security-Policy: '+csp+'\n  Strict-Transport-Security: max-age=31536000\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(self), geolocation=()\n');
console.log('Prepared standalone Cloudflare Pages app and same-origin API.');

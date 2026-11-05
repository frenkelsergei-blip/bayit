import {rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:new URL('..',import.meta.url),env:{...process.env,VITE_BAYIT_CLOUD:'1'},stdio:'inherit'});if(build.status!==0)process.exit(build.status||1);rmSync(new URL('../dist/client/assets/icons/openmoji/png72',import.meta.url),{recursive:true,force:true});
const prepare=spawnSync(process.execPath,['scripts/prepare-sites-build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'inherit'});process.exit(prepare.status||0);

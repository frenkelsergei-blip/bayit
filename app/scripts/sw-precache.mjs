// Build step for offline support: writes this build's id and the files to precache into dist/client/sw.js,
// so every deploy installs a new service worker with its own cache (see public/sw.js).
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';

// Always-needed files from public/ that are not referenced by a content hash.
const STATIC=[
 '/assets/shell-20261107/boot-splash.js','/assets/shell-20261107/sketch-renderer.js',
 '/assets/shell-20261107/paper-cream-small.png','/assets/shell-20261107/paper-cobalt-small.png','/assets/shell-20261107/paper-yellow-small.png',
 '/assets/shell-20261107/brand-light.png','/assets/shell-20261107/brand-dark.png','/assets/shell-20261107/default-family-landscape-small.png',
 '/assets/brand-selected-20261107/logo-light-alpha.png','/assets/brand-selected-20261107/logo-dark-alpha.png','/assets/brand-selected-20261107/mark-light.png','/assets/brand-selected-20261107/mark-dark.png',
 '/assets/brand-selected-20261107/favicon-32.png','/assets/brand-selected-20261107/app-icon-180.png','/assets/brand-selected-20261107/app-icon-192.png','/assets/brand-selected-20261107/notification-badge-96.png',
 '/assets/generated/title-underline-clean.png','/assets/generated/title-rays.png',
 ...[240,480,720].map(w=>'/assets/generated/title-underline-clean-'+w+'.png'),...[48,96,144].map(w=>'/assets/generated/title-rays-'+w+'.png'),
 '/assets/fonts/heebo/font.woff2','/assets/fonts/nunitosans/font.woff2',
];
// Large optional code for online-only features (barcode rendering, insurance file reading) is cached on first use instead.
const SKIP=/(?:bwip-js|\.worker)-/;

export function precacheList(outDir,bundleFiles){
 const index=readFileSync(path.join(outDir,'index.html'),'utf8');
 const fromIndex=[...index.matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map(m=>m[1]);
 const built=bundleFiles.filter(f=>/\.(?:js|css|woff2?)$/.test(f)&&!SKIP.test(f)).map(f=>'/'+f);
 return [...new Set(['/',...fromIndex,...built,...STATIC.filter(f=>existsSync(path.join(outDir,f)))])];
}

export function swPrecache({buildId}){
 let outDir='dist/client';
 return {
  name:'bayit-sw-precache',apply:'build',
  configResolved(config){outDir=path.resolve(config.root,config.build.outDir)},
  writeBundle(_options,bundle){
   const sw=path.join(outDir,'sw.js');if(!existsSync(sw))return;
   const list=precacheList(outDir,Object.keys(bundle));
   const source=readFileSync(sw,'utf8').replace("'__BAYIT_BUILD__'",JSON.stringify(buildId)).replace('self.__BAYIT_PRECACHE__||[]',JSON.stringify(list));
   writeFileSync(sw,source);
  },
 };
}

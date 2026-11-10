// Bayit service worker: opens the app without a connection, shows Web Push notifications and opens the
// right screen when one is tapped.
// Offline (2026-11-09): the build writes its own file list and build id below, so every deploy installs a new
// worker with its own cache. Pages are network-first (a new deploy is picked up as soon as the network
// answers); built files with a content hash are cache-first; household data (/api) and /version.json are
// never cached here (the app keeps its own device copy, see app/src/offline-store.js).
const BUILD='__BAYIT_BUILD__';
const PRECACHE=self.__BAYIT_PRECACHE__||[];
const SHELL='bayit-shell-'+BUILD,RUNTIME='bayit-runtime-v1',RUNTIME_LIMIT=900,NAVIGATION_TIMEOUT=4000;
const hashed=path=>/^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/.test(path);
const neverCache=path=>path.startsWith('/api/')||path==='/version.json'||path==='/sw.js';

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  // The page itself must be cached; a missing optional file never blocks the install.
  const shell=await fetch(new Request('/',{cache:'reload',credentials:'same-origin'}));if(!shell.ok)throw Error('Shell unavailable');await cache.put('/',shell);
  await Promise.allSettled(PRECACHE.filter(url=>url!=='/').map(async url=>{const response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));if(response.ok)await cache.put(url,response)}));
  await self.skipWaiting();
 })());
});

self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('bayit-shell-')&&key!==SHELL)await caches.delete(key);
 await self.clients.claim();
})()));

async function trimRuntime(){const cache=await caches.open(RUNTIME),keys=await cache.keys();for(const request of keys.slice(0,Math.max(0,keys.length-RUNTIME_LIMIT)))await cache.delete(request)}

async function navigate(event){
 const cache=await caches.open(SHELL);
 const network=fetch(event.request).then(response=>{if(response.ok&&response.type==='basic')cache.put('/',response.clone()).catch(()=>{});return response});
 // A slow network falls back to the cached app after a few seconds; the fresh copy is still stored when it arrives.
 const timeout=new Promise(resolve=>setTimeout(resolve,NAVIGATION_TIMEOUT));
 try{const first=await Promise.race([network,timeout]);if(first)return first}catch{}
 const cached=await cache.match('/');if(cached){event.waitUntil(network.catch(()=>{}));return cached}
 return network;
}
async function cacheFirst(request){
 const cached=await caches.match(request,{ignoreSearch:false});if(cached)return cached;
 let response;try{response=await fetch(request)}catch(error){if(request.destination==='image')return emptyImage();throw error}
 if(response.ok&&response.type==='basic'){const cache=await caches.open(SHELL);cache.put(request,response.clone()).catch(()=>{})}return response;
}
// A picture never loaded while online can't be shown offline: answer with an empty image instead of a broken-image mark.
const EMPTY_PNG=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const emptyImage=()=>new Response(EMPTY_PNG,{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
async function staleWhileRevalidate(event){
 const cache=await caches.open(RUNTIME),cached=await caches.match(event.request);
 const network=fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'){cache.put(event.request,response.clone()).then(trimRuntime).catch(()=>{})}return response});
 if(cached){event.waitUntil(network.catch(()=>{}));return cached}
 return network.catch(error=>{if(event.request.destination==='image')return emptyImage();throw error});
}

self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin||neverCache(url.pathname))return;
 if(request.mode==='navigate'){event.respondWith(navigate(event));return}
 if(hashed(url.pathname)){event.respondWith(cacheFirst(request));return}
 if(url.pathname.startsWith('/assets/')||PRECACHE.includes(url.pathname+url.search)||url.pathname==='/manifest.webmanifest')event.respondWith(staleWhileRevalidate(event));
});

// The app tells the worker which pictures the current screen already loaded, so they show offline too.
self.addEventListener('message',event=>{
 if(event.data?.type!=='bayit-cache-urls'||!Array.isArray(event.data.urls))return;
 // Six at a time, so a short visit is enough to keep a screen's pictures.
 event.waitUntil((async()=>{const cache=await caches.open(RUNTIME),queue=[...new Set(event.data.urls.slice(0,400))];const one=async raw=>{try{const url=new URL(raw,self.location.origin);if(url.origin!==self.location.origin||!url.pathname.startsWith('/assets/')||await caches.match(url.href))return;const response=await fetch(url.href);if(response.ok)await cache.put(url.href,response)}catch{}};await Promise.all(Array.from({length:6},async()=>{while(queue.length)await one(queue.shift())}));await trimRuntime()})());
});

// Background Sync, where the browser has it (not iPhone Safari): wake an open app to send queued changes.
// The app also retries by itself on reconnect, focus and a timer, so nothing depends on this.
self.addEventListener('sync',event=>{
 if(event.tag!=='bayit-queue')return;
 event.waitUntil(self.clients.matchAll({type:'window'}).then(list=>list.forEach(c=>c.postMessage({type:'bayit-flush'}))));
});

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{}}catch{data={title:'Bayit',body:event.data?.text()||''}}
 const title=data.title||'Bayit';
 event.waitUntil(self.registration.showNotification(title,{body:data.body||'',tag:data.tag||undefined,renotify:!!data.tag,icon:'/assets/brand-selected-20261107/app-icon-192.png',badge:'/assets/brand-selected-20261107/notification-badge-96.png',lang:/[֐-׿]/.test(title+(data.body||''))?'he':'en',dir:'auto',data:{url:typeof data.url==='string'&&data.url.startsWith('#')?data.url:'#today'}}));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL('/'+(event.notification.data?.url||'#today'),self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.focus();try{await client.navigate(target)}catch{client.postMessage({type:'bayit-open',url:event.notification.data?.url})}return}}
  await self.clients.openWindow(target);
 })());
});

// The browser rotated this device's push address: tell the app so it can re-register on next open.
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list.forEach(c=>c.postMessage({type:'bayit-push-changed'}))));
});

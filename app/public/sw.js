// Bayit service worker: shows Web Push notifications and opens the right screen when one is tapped.
// It deliberately has no fetch handler and caches nothing, so app updates are never held back.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{}}catch{data={title:'Bayit',body:event.data?.text()||''}}
 const title=data.title||'Bayit';
 event.waitUntil(self.registration.showNotification(title,{body:data.body||'',tag:data.tag||undefined,renotify:!!data.tag,icon:'/app-icon-192.png',badge:'/app-icon-192.png',lang:/[֐-׿]/.test(title+(data.body||''))?'he':'en',dir:'auto',data:{url:typeof data.url==='string'&&data.url.startsWith('#')?data.url:'#today'}}));
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

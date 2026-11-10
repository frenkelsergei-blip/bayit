// Connection state shared by the sync client and the offline UI (banner, pending marks, online-only pages).
// "Offline" means the household server can't be reached right now: no network, or requests time out.
const hasWindow=typeof window!=='undefined';
let state={reachable:typeof navigator!=='undefined'?navigator.onLine!==false:true,syncedAt:0,fromSnapshot:false,pending:new Set(),queued:0,conflicts:[]};
const listeners=new Set(),transitions=new Set();
const publish=next=>{const was=state.reachable;state={...state,...next};listeners.forEach(fn=>fn());if(!was&&state.reachable)transitions.forEach(fn=>{try{fn()}catch{}})};

export const network={
 get:()=>state,
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 // Called when the connection comes back (a request succeeded after failures, or the browser's online event).
 onReconnect(fn){transitions.add(fn);return()=>transitions.delete(fn)},
 reachable(){if(!state.reachable)publish({reachable:true})},
 unreachable(){if(state.reachable)publish({reachable:false})},
 synced(at=Date.now()){publish({syncedAt:at,fromSnapshot:false,reachable:true})},
 booted({syncedAt,fromSnapshot}){publish({syncedAt:syncedAt||0,fromSnapshot:!!fromSnapshot,reachable:!fromSnapshot&&state.reachable})},
 queue({pending,queued,conflicts}){publish({pending,queued,conflicts})},
 reset(){state={...state,syncedAt:0,fromSnapshot:false,pending:new Set(),queued:0,conflicts:[]};listeners.forEach(fn=>fn())},
};
// The browser's own signal is a hint only (iPhone Safari reports "online" on captive Wi-Fi); requests decide.
if(hasWindow){window.addEventListener('offline',()=>network.unreachable());window.addEventListener('online',()=>transitions.forEach(fn=>{try{fn()}catch{}}))}
if(hasWindow&&typeof document!=='undefined')network.subscribe(()=>{document.documentElement.dataset.network=state.reachable&&!state.fromSnapshot?'online':'offline'});

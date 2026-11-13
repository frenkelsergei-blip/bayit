// Finishing a shop and the shopping history (owner's choice B, 2026-11-12: "a new list for each shop").
// The list keeps its id and owner (planned shops, Telegram /shopping, favourites, rhythm and "My shopping" point at it)
// and becomes the new, empty list. What was bought moves to a SHOP: an archived list record { shopOf: <list id> } owned
// by whoever finished, shared with the same people. A shop is the history entry; it never appears in the list strip.
// Undo moves everything back and removes the shop. Pure functions, shared by the app and the tests.
import {canAccessList} from './shopping-lists.mjs';

export const isShop=l=>!!l?.shopOf;
// A shop someone STARTED (the shopping flow, 2026-11-12): a record { shopOf, status:'shopping', startedBy, startedAt } owned by
// whoever pressed Start or answered "Yes, I am shopping". Only that starts "X is shopping" for the family and Telegram; a
// plain tick is a plain tick. It ends when a shop of the same list is finished after it, when its owner stops it, or after
// OPEN_MS (a shop nobody finished does not say "shopping now" forever).
// Idle (owner report 2026-11-12: a Start pressed by mistake said "You are shopping" for hours): with the list's items, a shop
// is open only until IDLE_MS after its start or its last tick, whichever is later. When it lapses the list simply shows
// Planning again; ticks stay ticks. Without items (older callers) only OPEN_MS applies.
export const OPEN_MS=12*3600e3,IDLE_MS=90*60e3;
export const isOpenShop=l=>isShop(l)&&l.status==='shopping';
export function lastActivity(shop,items,listId){
 let last=Date.parse(shop.startedAt);for(const i of items||[])if((i.listId||'week')===listId&&i.done&&i.boughtAt){const t=Date.parse(i.boughtAt);if(t>last)last=t}return last;
}
export function openShopOf(lists,listId,now=Date.now(),items){
 const all=lists||[],done=all.filter(l=>isShop(l)&&l.status==='archived'&&l.shopOf===listId);
 return all.filter(l=>isOpenShop(l)&&l.shopOf===listId&&now-Date.parse(l.startedAt)<OPEN_MS&&(!items||now-lastActivity(l,items,listId)<IDLE_MS)&&!done.some(s=>String(s.archivedAt)>=String(l.startedAt)))
  .sort((x,y)=>String(y.startedAt).localeCompare(String(x.startedAt)))[0]||null;
}
const at=(i,listId)=>(i.listId||'week')===listId;

// The people of a shop: the same as its list, owned by the person who finished it.
function shopAudience(list,actorId){
 if(list.visibility==='family')return {visibility:'family',allowedIds:[]};
 if(list.visibility==='private')return {visibility:'private',allowedIds:[]};
 return {visibility:'selected',allowedIds:[...new Set([list.ownerId,...(list.allowedIds||[])])].filter(id=>id&&id!==actorId)};
}

function usable(data,listId,actorId){
 const list=(data.shoppingLists||[]).find(l=>l.id===listId);
 if(!list||isShop(list)||list.status!=='active'||!canAccessList(list,actorId)||list.visibility==='private'&&list.ownerId!==actorId)throw Error('This shopping list is unavailable.');
 return list;
}
// Start (or join) the shop of a list. Someone already shopping: nothing new is made, the second person is shown as joining.
export function startShop(data,{listId,actorId,shopId,now=new Date().toISOString()}){
 const list=usable(data,listId,actorId),open=openShopOf(data.shoppingLists,listId,Date.parse(now),data.shopping);if(open)return open;
 prune(data,actorId,now);
 const shop={id:shopId,name:list.name,he:list.he||list.name,ownerId:actorId,...shopAudience(list,actorId),status:'shopping',shopOf:list.id,startedBy:actorId,startedAt:now,createdAt:now};
 data.shoppingLists.push(shop);return shop;
}
// Stop a started shop without finishing it ("I'm not shopping", 2026-11-12): nothing goes to History and ticks stay plain
// ticks. The record stays as status 'stopped' (stop time in updatedAt) so Telegram can tell whoever heard "X is shopping
// now" that it ended; the starter's stopped records older than a day are removed on the next start or stop.
export function stopShop(data,shopId,actorId,now=new Date().toISOString()){
 const shop=(data.shoppingLists||[]).find(l=>l.id===shopId);if(!isOpenShop(shop)||shop.ownerId!==actorId)throw Error('Only the person who started this shop can stop it.');
 shop.status='stopped';shop.updatedAt=now;prune(data,actorId,now);
}
function prune(data,actorId,now){
 data.shoppingLists=(data.shoppingLists||[]).filter(l=>!(isShop(l)&&l.status==='stopped'&&l.ownerId===actorId&&Date.parse(now)-Date.parse(l.updatedAt||l.startedAt)>864e5));
}

// keepLeft (default): what was not bought stays on the list for next time; otherwise it goes into the shop as "left".
// A shop this person started becomes the finished shop (same record); otherwise a new one is made, starting when the shop did.
export function finishShop(data,{listId,actorId,shopId,now=new Date().toISOString(),keepLeft=true}){
 const list=usable(data,listId,actorId);
 const items=(data.shopping||[]).filter(i=>at(i,listId)),bought=items.filter(i=>i.done),left=items.filter(i=>!i.done);
 if(!bought.length)throw Error('Nothing was bought yet.');
 const open=openShopOf(data.shoppingLists,listId,Date.parse(now),data.shopping),first=bought.map(i=>i.boughtAt).filter(Boolean).sort()[0]||now;
 const started=open&&open.startedAt<first?open.startedAt:first,mine=open&&open.ownerId===actorId?open:null;
 const shop=mine||{id:shopId,name:list.name,he:list.he||list.name,ownerId:actorId,...shopAudience(list,actorId),shopOf:list.id,createdAt:now};
 Object.assign(shop,{status:'archived',archivedAt:now,finishedBy:actorId,startedAt:started,leftCount:left.length});
 if(!mine)data.shoppingLists.push(shop);
 for(const i of keepLeft?bought:items)i.listId=shop.id;
 // A receipt photographed during this shop belongs to it.
 for(const r of data.receipts||[])if(r.listId===listId&&(r.createdAt||'')>=started&&r.ownerId===actorId)r.listId=shop.id;
 return {shop,bought:bought.length,left:left.length};
}

// Undo: only the person who finished it. Everything goes back exactly; the shop record is removed.
export function undoShop(data,shopId,actorId,reopenId=null){
 const shop=(data.shoppingLists||[]).find(l=>l.id===shopId);
 if(!isShop(shop)||shop.status!=='archived'||shop.ownerId!==actorId)throw Error('Only the person who finished this shop can undo it.');
 for(const i of data.shopping||[])if(i.listId===shopId){i.listId=shop.shopOf;i.restoredFrom=shopId}
 for(const r of data.receipts||[])if(r.listId===shopId)r.listId=shop.shopOf;
 data.shoppingLists=data.shoppingLists.filter(l=>l.id!==shopId);
 // A shop that was started goes back to "shopping" (a new record: the finished one must be deleted for its items to move back).
 if(shop.startedBy&&reopenId)data.shoppingLists.push({id:reopenId,name:shop.name,he:shop.he,ownerId:shop.ownerId,visibility:shop.visibility,allowedIds:shop.allowedIds||[],status:'shopping',shopOf:shop.shopOf,startedBy:shop.startedBy,startedAt:shop.startedAt,createdAt:shop.createdAt});
 return shop;
}

// The history of one list (or of all lists: listId null), newest first. Paged: the window shows PAGE at a time ("Show more").
export const PAGE=20;
export function shopsOf(lists,listId){return (lists||[]).filter(l=>isShop(l)&&l.status==='archived'&&(listId==null||l.shopOf===listId)).sort((a,b)=>String(b.archivedAt).localeCompare(String(a.archivedAt)))}
export function shopSummary(shop,{shopping=[],receipts=[]}){
 const items=shopping.filter(i=>i.listId===shop.id),bought=items.filter(i=>i.done),left=items.filter(i=>!i.done);
 const receipt=receipts.filter(r=>r.listId===shop.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
 return {bought,left,leftCount:shop.leftCount??left.length,receipt,total:receipt?.total??null};
}

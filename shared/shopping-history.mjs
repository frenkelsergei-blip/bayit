// Finishing a shop and the shopping history (owner's choice B, 2026-11-12: "a new list for each shop").
// The list keeps its id and owner (planned shops, Telegram /shopping, favourites, rhythm and "My shopping" point at it)
// and becomes the new, empty list. What was bought moves to a SHOP: an archived list record { shopOf: <list id> } owned
// by whoever finished, shared with the same people. A shop is the history entry; it never appears in the list strip.
// Undo moves everything back and removes the shop. Pure functions, shared by the app and the tests.
import {canAccessList} from './shopping-lists.mjs';

export const isShop=l=>!!l?.shopOf;
const at=(i,listId)=>(i.listId||'week')===listId;

// The people of a shop: the same as its list, owned by the person who finished it.
function shopAudience(list,actorId){
 if(list.visibility==='family')return {visibility:'family',allowedIds:[]};
 if(list.visibility==='private')return {visibility:'private',allowedIds:[]};
 return {visibility:'selected',allowedIds:[...new Set([list.ownerId,...(list.allowedIds||[])])].filter(id=>id&&id!==actorId)};
}

// keepLeft (default): what was not bought stays on the list for next time; otherwise it goes into the shop as "left".
export function finishShop(data,{listId,actorId,shopId,now=new Date().toISOString(),keepLeft=true}){
 const list=(data.shoppingLists||[]).find(l=>l.id===listId);
 if(!list||isShop(list)||list.status!=='active'||!canAccessList(list,actorId))throw Error('This shopping list is unavailable.');
 const items=(data.shopping||[]).filter(i=>at(i,listId)),bought=items.filter(i=>i.done),left=items.filter(i=>!i.done);
 if(!bought.length)throw Error('Nothing was bought yet.');
 if(list.visibility==='private'&&list.ownerId!==actorId)throw Error('This shopping list is unavailable.');
 const started=bought.map(i=>i.boughtAt).filter(Boolean).sort()[0]||now;
 const shop={id:shopId,name:list.name,he:list.he||list.name,ownerId:actorId,...shopAudience(list,actorId),status:'archived',shopOf:list.id,
  archivedAt:now,finishedBy:actorId,startedAt:started,leftCount:left.length,createdAt:now};
 data.shoppingLists.push(shop);
 for(const i of keepLeft?bought:items)i.listId=shopId;
 // A receipt photographed during this shop belongs to it.
 for(const r of data.receipts||[])if(r.listId===listId&&(r.createdAt||'')>=started&&r.ownerId===actorId)r.listId=shopId;
 return {shop,bought:bought.length,left:left.length};
}

// Undo: only the person who finished it. Everything goes back exactly; the shop record is removed.
export function undoShop(data,shopId,actorId){
 const shop=(data.shoppingLists||[]).find(l=>l.id===shopId);
 if(!isShop(shop)||shop.ownerId!==actorId)throw Error('Only the person who finished this shop can undo it.');
 for(const i of data.shopping||[])if(i.listId===shopId){i.listId=shop.shopOf;i.restoredFrom=shopId}
 for(const r of data.receipts||[])if(r.listId===shopId)r.listId=shop.shopOf;
 data.shoppingLists=data.shoppingLists.filter(l=>l.id!==shopId);
 return shop;
}

// The history of one list, newest first. Paged: the window shows PAGE at a time ("Show more").
export const PAGE=20;
export function shopsOf(lists,listId){return (lists||[]).filter(l=>isShop(l)&&l.shopOf===listId).sort((a,b)=>String(b.archivedAt).localeCompare(String(a.archivedAt)))}
export function shopSummary(shop,{shopping=[],receipts=[]}){
 const items=shopping.filter(i=>i.listId===shop.id),bought=items.filter(i=>i.done),left=items.filter(i=>!i.done);
 const receipt=receipts.filter(r=>r.listId===shop.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
 return {bought,left,leftCount:shop.leftCount??left.length,receipt,total:receipt?.total??null};
}

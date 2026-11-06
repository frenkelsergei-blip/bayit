import {matchItem,words} from './item-dictionary.mjs';
import {canAccessList,createShoppingList} from './shopping-lists.mjs';
export const shoppingIdentity=name=>matchItem(name).key||words(name).join(' ');
const audience=r=>r.visibility==='family'?'family':r.visibility==='private'?'private:'+r.ownerId:'selected:'+Array.from(new Set([r.ownerId,...(r.allowedIds||[])])).sort().join(',');
export function shoppingTarget(data,source,actor,{preferredId,name='Home essentials'}={}){
 data.shoppingLists??=[];data.shopping??=[];
 const compatible=l=>l.status==='active'&&canAccessList(l,actor)&&audience(l)===audience(source);
 const preferred=data.shoppingLists.find(l=>l.id===(preferredId||data.preferences?.activeShoppingListByUser?.[actor])&&compatible(l));
 return preferred||data.shoppingLists.find(compatible)||createShoppingList(data,{id:crypto.randomUUID(),name,ownerId:actor,visibility:source.visibility||'family',allowedIds:source.visibility==='selected'?Array.from(new Set([source.ownerId,...(source.allowedIds||[])])).filter(id=>id&&id!==actor):[]});
}
export function transferShoppingItems(data,items,source,actor,options){
 const list=shoppingTarget(data,source,actor,options);data.preferences??={};data.preferences.activeShoppingListByUser={...data.preferences.activeShoppingListByUser,[actor]:list.id};let added=0,skipped=0;
 for(const item of items){const title=String(item.title||item.name||'').trim();if(!title)continue;const key=shoppingIdentity(title);
  if(data.shopping.some(r=>r.listId===list.id&&!r.done&&shoppingIdentity(r.title)===key)){skipped++;continue}
  const match=matchItem(title),quantityValue=Number(item.quantityValue??item.quantity)||1,unit=item.unit||'items';
  data.shopping.push({id:crypto.randomUUID(),title,he:item.he||title,icon:item.icon||match.icon,quantityValue,quantity:quantityValue+' '+unit,unit,group:item.group||match.group,memberId:actor,ownerId:actor,visibility:list.visibility,allowedIds:list.allowedIds||[],listId:list.id,done:false});added++;
 }
 return {added,skipped,listId:list.id};
}

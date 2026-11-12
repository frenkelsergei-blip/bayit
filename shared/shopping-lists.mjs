export const canAccessList=(list,actor)=>list.ownerId===actor||list.visibility==='family'||list.visibility==='selected'&&(list.allowedIds||[]).includes(actor);
// Deleting (2026-11-11). An item: its owner, or anyone who may use its list and see the item, the same people who tick
// it off and edit it; a private item stays with its owner. A list: its owner only, and each person's own "My shopping"
// list is permanent (it is recreated for every member), so it can be emptied but not deleted.
export const personalShoppingListId=memberId=>'private-'+memberId+'-week';
export function canDeleteShoppingItem(item,lists,actorId){
 if(!item)return false;if(item.ownerId===actorId)return true;if(item.visibility==='private'||!canAccessList(item,actorId))return false;
 const list=(lists||[]).find(l=>l.id===(item.listId||'week'));return !list||canAccessList(list,actorId);
}
export const canDeleteShoppingList=(list,actorId)=>!!list&&list.ownerId===actorId&&list.id!==personalShoppingListId(list.ownerId);
export function upgradeShoppingLists(data,members){
 const owner=members.find(m=>m.role==='parent')?.id||members[0]?.id;
 if(!Array.isArray(data.shoppingLists))data.shoppingLists=[['week','This week','השבוע'],['school','School supplies','ציוד לבית הספר'],['home','Household','לבית']].map(([id,name,he])=>({id,name,he,ownerId:owner,visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-04T00:00:00Z'}));
 for(const item of data.shopping||[]){if(item.visibility==='private'&&['week','school','home'].includes(item.listId||'week'))item.listId='private-'+item.ownerId+'-'+(item.listId||'week');const listId=item.listId||'week';if(!data.shoppingLists.some(l=>l.id===listId))data.shoppingLists.push({id:listId,name:item.visibility==='private'?'My shopping':'Shopping list',he:item.visibility==='private'?'הקניות שלי':'רשימת קניות',ownerId:item.ownerId||owner,visibility:item.visibility||'family',allowedIds:item.allowedIds||[],status:'active',createdAt:'2026-11-04T00:00:00Z'})}
 for(const member of members){const id='private-'+member.id+'-week';if(!data.shoppingLists.some(l=>l.id===id))data.shoppingLists.push({id,name:'My shopping',he:'הקניות שלי',ownerId:member.id,visibility:'private',allowedIds:[],status:'active',createdAt:'2026-11-04T00:00:00Z'})}
 return data;
}
export function createShoppingList(data,{id,name,ownerId,visibility='family',allowedIds=[]}){
 const title=String(name||'').trim().slice(0,60);if(!title||!['family','private','selected'].includes(visibility))throw Error('Enter a list name and visibility.');if(visibility==='selected'&&!allowedIds.length)throw Error('Choose who can access the list.');if(data.shoppingLists.some(l=>l.id===id))throw Error('This list already exists.');const list={id,name:title,he:title,ownerId,visibility,allowedIds:visibility==='selected'?[...allowedIds]:[],status:'active',createdAt:new Date().toISOString()};data.shoppingLists.push(list);return list;
}
export function reuseShoppingList(data,listId,{id,actorId,name,remainingOnly=false}){
 const list=data.shoppingLists.find(l=>l.id===listId);if(!list||!canAccessList(list,actorId))throw Error('This list is unavailable.');const next=createShoppingList(data,{id,name:name||list.name+' · new trip',ownerId:actorId,visibility:list.visibility,allowedIds:list.allowedIds});let n=0;for(const item of data.shopping.filter(i=>(i.listId||'week')===listId&&canAccessList(i,actorId)&&(!remainingOnly||!i.done))){data.shopping.push({...structuredClone(item),id:id+'-item-'+n++,listId:id,ownerId:actorId,visibility:next.visibility,allowedIds:next.allowedIds,done:false,boughtAt:null,boughtBy:null,aiOperationId:undefined})}return next;
}

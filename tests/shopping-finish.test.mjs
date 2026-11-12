// A list where everything is ticked can be finished (owner report 2026-11-12): only the app's own last tick finishes a
// shop, so a list ticked before 1.71.0, or whose last item was ticked from Telegram, the assistant or an offline edit,
// stayed full with no way to close it. Fictional family; server rules via applyChanges.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finishShop,shopSummary} from '../shared/shopping-history.mjs';
import {blankState,applyChanges,diffState,visibleState} from '../app/cloud/state.mjs';

const members=[{id:'daniel',name:'Daniel',role:'parent'},{id:'hila',name:'Hila',role:'parent'}];
const item=(id,extra={})=>({id,title:id,he:id,listId:'home',quantity:'1 items',quantityValue:1,unit:'items',icon:'1F6D2',group:'Other',memberId:'daniel',ownerId:'daniel',visibility:'family',allowedIds:[],done:true,boughtAt:'2026-11-12T08:10:00Z',boughtBy:'daniel',createdAt:'2026-11-11T08:00:00Z',createdBy:'daniel',...extra});
function home(){const d=blankState('h','Home',members[0]);d.members=members;d.profiles.hila={name:'Hila'};
 d.shoppingLists.push({id:'home',name:'Frenkel',he:'פרנקל',ownerId:'daniel',visibility:'family',allowedIds:[],status:'active',createdAt:'2026-11-01T00:00:00Z'});
 d.shopping=[item('bread'),item('milk',{boughtAt:'2026-11-12T08:20:00Z'})];
 d.receipts=[{id:'r1',title:'Receipt',ownerId:'daniel',visibility:'family',allowedIds:[],listId:'home',store:'x',total:20,currency:'ILS',shopDate:'2026-11-12',lines:[],createdAt:'2026-11-12T09:00:00Z'}];
 return applyChanges(d,[],'daniel','parent')}
const send=(state,actor,change)=>{const before=visibleState(state,actor),after=structuredClone(before);change(after);return applyChanges(state,diffState(before,after),actor,'parent')};

test('a fully ticked list finishes into a shop, with the receipt saved after the first tick',()=>{
 const next=send(home(),'daniel',d=>finishShop(d,{listId:'home',actorId:'daniel',shopId:'shop-1',now:'2026-11-12T12:00:00Z'}));
 const shop=next.shoppingLists.find(l=>l.id==='shop-1');assert.equal(shop.leftCount,0);assert.equal(shop.startedAt,'2026-11-12T08:10:00Z');
 assert.equal(next.shopping.filter(i=>i.listId==='home').length,0,'the list is empty and ready');
 const s=shopSummary(shop,next);assert.equal(s.bought.length,2);assert.equal(s.receipt.id,'r1');
});

test('a list that ended fully ticked (Telegram, assistant, offline, or before 1.72) asks "Finished shopping?"',()=>{
 const view=readFileSync(new URL('../app/src/shopping-view.jsx',import.meta.url),'utf8');
 assert.match(view,/:done>0&&left===0\?<AllTickedLine/);
 assert.match(readFileSync(new URL('../app/src/shopping-smart.jsx',import.meta.url),'utf8'),/'Everything is ticked\. Finished shopping\?','הכול סומן\. סיימת לקנות\?'/);
});

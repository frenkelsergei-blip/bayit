import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
import {canEditContent,validateEditAccess} from '../../shared/permissions.mjs';
import {canSee} from '../src/data.js';
import {upgradeShoppingLists,canAccessList} from '../../shared/shopping-lists.mjs';
import {completeTask,completionState,occursOn} from '../src/domain.js';
export const collections=['tasks','events','notes','shopping','history','purchases','documents','contacts','shoppingLists','meals','expenses','pantry','bills'];
const personalMaps=['appearanceByUser','todayByUser','privateGoals','suggestionsByUser','activeShoppingListByUser'];
const sharedPreferences=['householdName','familyPhoto','weekStarts','palette','familyChallenge','goals','inventory','maintenanceDate','maintenanceRepeat','shoppingCategories','turnOverrides','turnInterval','monthlyBudget'];
const personalFlat=['aiSources','reminder','notifications','quietStart','quietEnd','smartSuggestions','maxSuggestions','parentUpdates','milkWeekly','privacyDefaults'];
const profilePublic=['name','he','photo','displayMode','badgeIcon','character','equipped','xp','color','birthday','birthdayInCalendar'];
const text=(v,n=300)=>typeof v==='string'?v.trim().slice(0,n):'';
const equal=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
export function blankState(householdId,name,member){return upgradeShoppingLists({householdId,members:[member],profiles:{[member.id]:{name:member.name,he:member.name,photo:member.avatar||'',displayMode:member.avatar?'photo':'icon',badgeIcon:'1F3E0',xp:0}},preferences:{householdName:name,weekStarts:'0',palette:'classic',reminder:10},...Object.fromEntries(collections.map(k=>[k,[]])),shoppingLists:[{id:'week',name:'This week',he:'השבוע',ownerId:member.id,visibility:'family',allowedIds:[],status:'active',createdAt:new Date().toISOString()}],history:[],purchases:[],favoriteIcons:[],customIcons:[],acceptedSuggestions:[],dismissedSuggestions:[],aiOperations:{}},[member])}
export function hydrateMembers(state,accounts){
 const children=(state.members||[]).filter(m=>m.role==='child'&&!accounts.some(a=>a.member_id===m.id));state.members=[...accounts.map(a=>({id:a.member_id,name:state.profiles[a.member_id]?.name||a.name||'Family member',he:state.profiles[a.member_id]?.he||a.name||'בן משפחה',role:a.role,color:state.profiles[a.member_id]?.color||a.color||'lilac',avatar:a.image||'',accountLinked:true})),...children.map(m=>({...m,accountLinked:false}))];
 for(const a of accounts)state.profiles[a.member_id]??={name:a.name||'Family member',he:a.name||'בן משפחה',photo:a.image||'',displayMode:a.image?'photo':'icon',badgeIcon:'1F3E0',xp:0};return upgradeShoppingLists(state,state.members)
}
export function visibleState(state,actorId){
 const result=structuredClone(state),lists=(state.shoppingLists||[]).filter(l=>canAccessList(l,actorId));
 for(const key of collections)result[key]=['expenses','bills'].includes(key)&&state.members.find(m=>m.id===actorId)?.role==='child'?[]:(state[key]||[]).filter(r=>canSee(r,actorId)&&(!r.listId||lists.some(l=>l.id===r.listId)));
 result.profiles=Object.fromEntries(state.members.map(m=>[m.id,m.id===actorId?structuredClone(state.profiles[m.id]||{}):Object.fromEntries(profilePublic.filter(k=>state.profiles[m.id]?.[k]!==undefined).map(k=>[k,state.profiles[m.id][k]]))]));
 result.preferences=Object.fromEntries(sharedPreferences.filter(k=>state.preferences?.[k]!==undefined).map(k=>[k,state.preferences[k]]));
 Object.assign(result.preferences,state.preferences?.personalByUser?.[actorId]||{});
 for(const key of personalMaps)if(state.preferences?.[key]?.[actorId]!==undefined)result.preferences[key]={[actorId]:state.preferences[key][actorId]};
 if(result.preferences.turnOverrides){const names=new Set(result.tasks.filter(t=>t.routine).map(t=>t.title));result.preferences.turnOverrides=Object.fromEntries(Object.entries(result.preferences.turnOverrides).filter(([key])=>names.has(key.split('|').slice(1).join('|'))))}
 result.customIcons=(state.customIcons||[]).filter(r=>canSee(r,actorId));result.aiOperations=Object.fromEntries(Object.entries(state.aiOperations||{}).filter(([,r])=>r.ownerId===actorId));
 result.favoriteIcons=state.profiles[actorId]?.favoriteIcons||[];return result;
}
export function diffState(before,after){
 const ops=[];for(const collection of collections){const old=new Map((before[collection]||[]).map(r=>[r.id,r])),next=new Map((after[collection]||[]).map(r=>[r.id,r]));for(const [id,value]of next)if(!equal(old.get(id),value))ops.push({collection,id,value});for(const [id]of old)if(!next.has(id))ops.push({collection,id,delete:true})}
 for(const key of ['profiles','preferences','aiOperations'])for(const id of new Set([...Object.keys(before[key]||{}),...Object.keys(after[key]||{})]))if(!equal(before[key]?.[id],after[key]?.[id]))ops.push({collection:key,id,value:after[key]?.[id]});
 if(!equal(before.members,after.members))ops.push({collection:'members',value:after.members});if(!equal(before.customIcons,after.customIcons))ops.push({collection:'customIcons',value:after.customIcons});if(!equal(before.favoriteIcons,after.favoriteIcons))ops.push({collection:'favorites',value:after.favoriteIcons});return ops;
}
export function applyChanges(state,ops,actorId,role){
 if(!Array.isArray(ops)||ops.length>250)throw Error('Too many changes in one request.');const next=structuredClone(state),parent=role==='parent',memberIds=new Set(state.members.map(m=>m.id)),derivedHistory=[],xpDeltas=new Map();
 const priority={members:0,shoppingLists:1,tasks:2,profiles:4};
 for(const op of [...ops].sort((a,b)=>(priority[a.collection]??3)-(priority[b.collection]??3))){
  if(['__proto__','constructor','prototype'].includes(op.id))throw Error('Invalid identifier.');
  if(op.collection==='preferences'){
   if(personalFlat.includes(op.id)){next.preferences.personalByUser={...next.preferences.personalByUser,[actorId]:{...next.preferences.personalByUser?.[actorId],[op.id]:op.value}};continue}
   if(personalMaps.includes(op.id)){const value=op.value?.[actorId];next.preferences[op.id]={...next.preferences[op.id],[actorId]:value};continue}
   if(!sharedPreferences.includes(op.id))continue;if(!parent&&['householdName','familyPhoto','goals','familyChallenge','turnOverrides','turnInterval','monthlyBudget'].includes(op.id))throw Error('A parent manages this household setting.');if(op.id==='turnOverrides'){const names=new Set(state.tasks.filter(t=>canSee(t,actorId)&&t.routine).map(t=>t.title));const valid=Object.entries(op.value||{}).filter(([key])=>names.has(key.split('|').slice(1).join('|')));next.preferences.turnOverrides={...next.preferences.turnOverrides,...Object.fromEntries(valid)}}else next.preferences[op.id]=op.value;continue;
  }
  if(op.collection==='profiles'){
   const member=next.members.find(m=>m.id===op.id);if(!member||op.id!==actorId&&!(parent&&member.role==='child'))throw Error('This profile is private.');const value=structuredClone(op.value||{});if(value.equipped==='cape'&&(next.profiles[op.id]?.xp||0)<400)throw Error('Reach level 5 to equip the moon cape.');delete value.xp;next.profiles[op.id]={...next.profiles[op.id],...value};continue;
  }
  if(op.collection==='members'){
   if(!parent)throw Error('A parent manages child profiles.');const children=(op.value||[]).filter(m=>!state.members.some(old=>old.id===m.id));if(children.length>20||children.some(m=>m.role!=='child'))throw Error('Adults join with an invitation and their own account.');for(const child of children){if(!/^[0-9a-f-]{36}$/i.test(child.id)||!text(child.name,80))throw Error('Invalid child profile.');next.members.push({...child,role:'child'});next.profiles[child.id]={name:child.name,he:child.he||child.name,xp:0,displayMode:'pixel',character:'itai'};memberIds.add(child.id)}continue;
  }
  if(op.collection==='favorites'){next.profiles[actorId].favoriteIcons=(op.value||[]).slice(0,300);continue}
  if(op.collection==='customIcons'){const mine=(op.value||[]).filter(i=>i.ownerId===actorId);next.customIcons=[...(next.customIcons||[]).filter(i=>i.ownerId!==actorId),...mine.map(i=>({...i,ownerId:actorId,visibility:'private',allowedIds:[]}))];continue}
  if(op.collection==='aiOperations'){if(op.value?.ownerId!==actorId)throw Error('This AI receipt belongs to someone else.');next.aiOperations={...next.aiOperations,[op.id]:op.value};continue}
  if(!collections.includes(op.collection)||!text(op.id,140))throw Error('Unsupported record change.');const list=next[op.collection]||[],index=list.findIndex(r=>r.id===op.id),old=index>=0?list[index]:null,value=structuredClone(op.value||{});
  if(old&&!canSee(old,actorId))throw Error('This record is private.');
  if(op.collection==='history'||op.collection==='purchases')continue; // Derived from the corresponding task/item change below.
  if(op.delete){if(!old||old.ownerId!==actorId&&!(op.collection==='shopping'&&old.visibility==='family'))throw Error('Only the owner can remove this record.');list.splice(index,1);continue}
  if(value.id!==op.id||value.ownerId!==(old?.ownerId||actorId))throw Error('Record ownership cannot be changed.');
  if(!['private','family','selected'].includes(value.visibility)||value.visibility==='selected'&&(!Array.isArray(value.allowedIds)||!value.allowedIds.length||value.allowedIds.some(id=>!memberIds.has(id))))throw Error('Choose valid visibility and people.');
  if(old&&old.ownerId!==actorId&&(!equal(old.visibility,value.visibility)||!equal(old.allowedIds||[],value.allowedIds||[])||!equal(old.editPolicy,value.editPolicy)||!equal(old.editorIds||[],value.editorIds||[])))throw Error('Only the owner changes sharing.');
  if(value.memberId&&!memberIds.has(value.memberId)||value.memberIds?.some(id=>!memberIds.has(id)))throw Error('A family member is invalid.');
  if(role==='child'&&op.collection==='tasks'&&value.memberId!==actorId)throw Error('Children assign tasks only to themselves.');
  if(['documents','contacts','meals','shoppingLists','expenses','bills'].includes(op.collection)&&old&&old.ownerId!==actorId)throw Error('Only the owner edits this record.');
  if(['events','notes'].includes(op.collection)){validateEditAccess(value,memberIds);if(old&&!canEditContent(old,actorId,state.members,op.collection==='notes'?'note':'event'))throw Error('Only the owner or a permitted editor can edit this record.');}
  if(['expenses','bills'].includes(op.collection)){if(role==='child')throw Error('Expenses are available to adult accounts.');if(!Number.isFinite(value.amount)||value.amount<=0||value.amount>100000000)throw Error('Choose a valid expense amount.');}
  if(op.collection==='pantry'){if(!text(value.title,160)||!Number.isFinite(value.quantityValue)||value.quantityValue<0||!Number.isFinite(value.minimum)||value.minimum<0)throw Error('Choose valid inventory quantities.');value.updatedBy=actorId;value.updatedAt=new Date().toISOString();}
  if(op.collection==='shopping'){
   const target=(next.shoppingLists||[]).find(l=>l.id===(value.listId||'week'));if(!target||!canAccessList(target,actorId))throw Error('This shopping list is unavailable.');if(target.visibility==='private'&&value.visibility!=='private'||target.visibility==='selected'&&(value.visibility==='family'||value.allowedIds.some(id=>!target.allowedIds.includes(id)&&id!==target.ownerId)))throw Error('An item cannot be shared more widely than its list.');if(!text(value.title,160)||!Number.isFinite(value.quantityValue||parseFloat(value.quantity))||Number(value.quantityValue||parseFloat(value.quantity))<=0)throw Error('Invalid shopping item.');
   if(value.done!==!!old?.done){value.boughtAt=value.done?new Date().toISOString():null;value.boughtBy=value.done?actorId:null;next.purchases.push({...value,purchaseId:crypto.randomUUID(),date:new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})})}
  }
  if(op.collection==='tasks'){
   if(!parent){value.xp=old?.xp||0;value.parentConfirm=old?.parentConfirm||false;value.routine=old?.routine||false;if(old&&(old.routine||old.ownerId!==actorId)){const permitted=new Set(['done','completedAt','completions']);for(const key of Object.keys(value))if(!permitted.has(key)&&!equal(value[key],old[key]))throw Error('A parent manages routine details.')}}
   value.xp=Math.min(100,Math.max(0,Number(value.xp)||0));if(old){const changedDates=Object.keys(value.completions||{}).filter(date=>!equal(old.completions?.[date],value.completions[date]));if(changedDates.length>1)throw Error('Update one completion at a time.');if(!changedDates.length){if(value.done!==old.done&&!(value.done===false&&old.done===undefined))throw Error('Use the activity completion control to update this task.');value.done=old.done;value.completedAt=old.completedAt;value.completions=old.completions;}for(const date of changedDates){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!occursOn(old,date)||date>new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})||!parent&&(old.memberId!==actorId||date!==new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})))throw Error('This task belongs to another person.');const authoritative=structuredClone(old),time=new Date().toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit'}),result=completeTask(authoritative,{date,actorId,actorRole:parent?'parent':'child',time,instant:new Date().toISOString()});if(!result.changed||result.state!==value.completions[date].state)throw Error('The completion state changed. Refresh and retry.');value.completions=authoritative.completions;value.done=authoritative.done;value.completedAt=authoritative.completedAt;if(old.visibility==='family'&&value.visibility==='family')xpDeltas.set(old.memberId,(xpDeltas.get(old.memberId)||0)+result.xpDelta);derivedHistory.push({id:crypto.randomUUID(),taskId:old.id,title:old.title,he:old.he,memberId:old.memberId,date,time,done:result.state==='done',state:result.state,ownerId:old.ownerId,visibility:old.visibility,allowedIds:old.allowedIds||[],xp:old.xp||0,icon:old.icon,actorId})}}
  }
  if(index<0)list.push(value);else list[index]=value;next[op.collection]=list;
 }
 next.history=[...derivedHistory,...(next.history||[])];for(const [id,delta]of xpDeltas)if(next.profiles[id])next.profiles[id].xp=Math.max(0,(next.profiles[id].xp||0)+delta);
 if(new TextEncoder().encode(JSON.stringify(next)).byteLength>1_600_000)throw Error('This household has reached its current storage limit. Export or reduce large attachments.');return next;
}

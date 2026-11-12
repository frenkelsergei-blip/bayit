import {taskAssignedTo,taskMemberIds} from '../../shared/task-assignment.mjs';
import {syncBirthday,birthdayEventId} from '../src/birthdays.js';
import {recordMaintenanceService} from '../../shared/maintenance-service.mjs';
import {validateEventTime} from '../../shared/event-time.mjs';
import {normalizeIngredients} from '../../shared/meal-ingredients.mjs';
import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
import {normalizeLocation} from '../../shared/locations.mjs';
import {validateFinancePlans,validateFinancePreferences} from '../../shared/finance-goals.mjs';
import {canEditContent,validateEditAccess} from '../../shared/permissions.mjs';
import {canSee} from '../src/data.js';
import {AUDIENCE_COLLECTIONS,canSeeRecord,normalizeStateAudience,assignedTo,enforceAudience} from '../../shared/record-audience.mjs';
import {changeNoticesFor,pruneChangeNotices} from '../../shared/change-notices.mjs';
import {upgradeShoppingLists,canAccessList,canDeleteShoppingItem} from '../../shared/shopping-lists.mjs';
import {taskFitsList,validateTaskList} from '../../shared/task-lists.mjs';
import {completeTask,completionState,occursOn} from '../src/domain.js';
import {applyHeroCommand,publicHero} from '../../shared/hero-home.mjs';
import {receiptFilter} from '../../shared/private-snapshots.mjs';
import {validateInsurancePolicy} from '../../shared/insurance.mjs';
import {resolveFeatures} from '../../shared/features.mjs';
import {visibleModules,applyModuleOp} from '../../shared/feature-modules.mjs';
import {extKeys,parseExtKey,recordList} from '../../shared/record-paths.mjs';
import {boundedValue,validateRecord,validateProfile,safePhoto,displayable,imageData,validatePreference} from '../../shared/state-validation.mjs';
export const collections=['tasks','events','notes','shopping','history','purchases','documents','contacts','shoppingLists','meals','expenses','pantry','bills','taskLists','places','insurances','shoppingMarks','favourites','receipts'];
const personalMaps=['featuresByUser','appearanceByUser','todayByUser','privateGoals','suggestionsByUser','activeShoppingListByUser','shoppingByUser'];
const sharedPreferences=['features','familyProfile','householdName','familyPhoto','weekStarts','palette','familyChallenge','goals','inventory','maintenanceDate','maintenanceRepeat','shoppingCategories','turnOverrides','turnInterval','monthlyBudget'];
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
 state=normalizeStateAudience(state); // Assignees always see their records (assignment and visibility model, 2026-11-08).
 const result=structuredClone(state),lists=(state.shoppingLists||[]).filter(l=>canAccessList(l,actorId)),taskLists=(state.taskLists||[]).filter(l=>canAccessList(l,actorId));
 delete result.insuranceIdentityVaults; // Server-only encrypted, actor-scoped ID matching; never sync to clients/AI.
 delete result.extensions; // Feature modules: rebuilt from scratch below (installed modules, declared lists, this member's records only).
 for(const key of collections)result[key]=['expenses','bills','insurances','receipts'].includes(key)&&state.members.find(m=>m.id===actorId)?.role==='child'?[]:(result[key]||[]).filter(r=>displayable(r,key)&&canSeeRecord(r,actorId,key)&&(!r.listId||(key==='tasks'?taskLists:lists).some(l=>l.id===r.listId)||key==='tasks'&&assignedTo(r,actorId,key)&&delete r.listId));
 for(const [derived,source,reference]of [['history','tasks','taskId'],['purchases','shopping','id']])result[derived]=result[derived].filter(r=>{const original=(state[source]||[]).find(s=>s.id===r[reference]);return original?(result[source]||[]).some(s=>s.id===original.id):r.ownerId===actorId});
 for(const key of ['notes','events','expenses'])for(const record of result[key])record.date??='';
 for(const document of result.documents)delete document.sampleUrl;
 for(const task of result.tasks)if(task.ownerId!==actorId){for(const [field,collection]of [['contactId','contacts'],['documentId','documents']])if(task[field]&&!result[collection].some(r=>r.id===task[field]&&!r.deletedAt))delete task[field];}
 // A policy link never publishes a private payment's identifier or a hidden document relationship.
 const documentIds=new Set(result.documents.filter(d=>!d.deletedAt).map(d=>d.id));
 for(const policy of result.insurances)if(policy.ownerId!==actorId){delete policy.paymentIds;policy.documentIds=(policy.documentIds||[]).filter(id=>documentIds.has(id));if(policy.sourceDocumentIds)policy.sourceDocumentIds=policy.sourceDocumentIds.filter(id=>documentIds.has(id));}
 result.profiles=Object.fromEntries(state.members.map(m=>{const profile=state.profiles[m.id]||{},own=m.id===actorId,managesChild=m.role==='child'&&state.members.find(p=>p.id===actorId)?.role==='parent',view=own?structuredClone(profile):Object.fromEntries(profilePublic.filter(k=>profile[k]!==undefined).map(k=>[k,profile[k]]));if(profile.hero)view.hero=own||managesChild?structuredClone(profile.hero):publicHero(profile);return [m.id,view]}));
 result.preferences=Object.fromEntries(sharedPreferences.filter(k=>state.preferences?.[k]!==undefined).map(k=>[k,state.preferences[k]]));
 result.preferences.features=resolveFeatures(state.preferences?.features,state); // Existing households without a saved choice keep what they use (features registry, 2026-11-09).
 if(state.members.find(m=>m.id===actorId)?.role==='child')delete result.preferences.monthlyBudget;
 for(const m of result.members){for(const key of ['name','he'])if(typeof m[key]!=='string')m[key]='Family member';try{m.avatar=safePhoto(m.avatar,{accountImage:m.accountLinked?m.avatar:''})}catch{delete m.avatar}const profile=result.profiles[m.id];for(const key of ['name','he','displayMode','character','equipped','color','locale','birthday'])if(profile[key]!==undefined&&typeof profile[key]!=='string')delete profile[key];try{result.profiles[m.id].photo=safePhoto(result.profiles[m.id].photo,{accountImage:m.avatar})}catch{delete result.profiles[m.id].photo}}
 try{if(result.preferences.familyPhoto)result.preferences.familyPhoto=safePhoto(result.preferences.familyPhoto)}catch{delete result.preferences.familyPhoto}
 Object.assign(result.preferences,state.preferences?.personalByUser?.[actorId]||{});
 for(const key of personalMaps)if(state.preferences?.[key]?.[actorId]!==undefined)result.preferences[key]={[actorId]:state.preferences[key][actorId]};
 if(result.preferences.turnOverrides){const names=new Set(result.tasks.filter(t=>t.routine).map(t=>t.title));result.preferences.turnOverrides=Object.fromEntries(Object.entries(result.preferences.turnOverrides).filter(([key])=>names.has(key.split('|').slice(1).join('|'))))}
 result.customIcons=(state.customIcons||[]).filter(r=>canSee(r,actorId));const maySeeReceipt=receiptFilter(state,result,collections,actorId);result.aiOperations=Object.fromEntries(Object.entries(state.aiOperations||{}).filter(([,r])=>maySeeReceipt(r)));
 result.changeNotices=(state.changeNotices||[]).filter(n=>n.recipientId===actorId); // Each person reads only their own change notices.
 result.favoriteIcons=state.profiles[actorId]?.favoriteIcons||[];
 {const extensions=visibleModules(state,actorId);if(Object.keys(extensions).length)result.extensions=extensions;}
 return result;
}
export function diffState(before,after){
 const ops=[];for(const collection of collections){const old=new Map((before[collection]||[]).map(r=>[r.id,r])),next=new Map((after[collection]||[]).map(r=>[r.id,r]));for(const [id,value]of next)if(!equal(old.get(id),value))ops.push({collection,id,value,before:old.get(id)??null});for(const [id]of old)if(!next.has(id))ops.push({collection,id,delete:true,before:old.get(id)})}
 for(const key of ['profiles','preferences','aiOperations'])for(const id of new Set([...Object.keys(before[key]||{}),...Object.keys(after[key]||{})]))if(!equal(before[key]?.[id],after[key]?.[id]))ops.push({collection:key,id,value:after[key]?.[id],before:before[key]?.[id]??null});
 for(const key of new Set([...extKeys(before),...extKeys(after)])){const old=new Map((recordList(before,key)||[]).map(r=>[r.id,r])),next=new Map((recordList(after,key)||[]).map(r=>[r.id,r]));for(const [id,value]of next)if(!equal(old.get(id),value))ops.push({collection:key,id,value,before:old.get(id)??null});for(const [id]of old)if(!next.has(id))ops.push({collection:key,id,delete:true,before:old.get(id)})}
 if(!equal(before.members,after.members))ops.push({collection:'members',value:after.members,before:before.members});if(!equal(before.customIcons,after.customIcons))ops.push({collection:'customIcons',value:after.customIcons,before:before.customIcons});if(!equal(before.favoriteIcons,after.favoriteIcons))ops.push({collection:'favorites',value:after.favoriteIcons,before:before.favoriteIcons});return ops;
}
export function applyChanges(state,ops,actorId,role){
 state=normalizeStateAudience(state); // Older records are stored in their consistent form on the next save.
 if(!Array.isArray(ops)||ops.length>250)throw Error('Too many changes in one request.');const next=structuredClone(state),parent=role==='parent',memberIds=new Set(state.members.map(m=>m.id)),derivedHistory=[],xpDeltas=new Map();
 const cascaded=new Set(); // Items removed with their shopping list; a separate delete for them in the same request is then a no-op.
 const birthdayProfiles=new Set(ops.filter(op=>op.collection==='profiles'&&op.value?.birthday!==undefined).map(op=>op.id));
 const priority={members:0,shoppingLists:1,taskLists:1,tasks:2,profiles:4};
 for(const op of [...ops].sort((a,b)=>(priority[a.collection]??3)-(priority[b.collection]??3))){
  boundedValue(op);
  if(['__proto__','constructor','prototype'].includes(op.id))throw Error('Invalid identifier.');
  if(op.collection==='preferences'){
   validatePreference(op.id,op.value);
   if(op.id==='familyPhoto')safePhoto(op.value);
   if(personalFlat.includes(op.id)){next.preferences.personalByUser={...next.preferences.personalByUser,[actorId]:{...next.preferences.personalByUser?.[actorId],[op.id]:op.value}};continue}
   if(personalMaps.includes(op.id)){const value=op.value?.[actorId];next.preferences[op.id]={...next.preferences[op.id],[actorId]:value};continue}
   if(!sharedPreferences.includes(op.id))continue;if(!parent&&['features','familyProfile','householdName','familyPhoto','goals','familyChallenge','turnOverrides','turnInterval','monthlyBudget'].includes(op.id))throw Error('A parent manages this household setting.');if(op.id==='turnOverrides'){const names=new Set(state.tasks.filter(t=>canSeeRecord(t,actorId,"tasks")&&t.routine).map(t=>t.title));const valid=Object.entries(op.value||{}).filter(([key])=>names.has(key.split('|').slice(1).join('|')));next.preferences.turnOverrides={...next.preferences.turnOverrides,...Object.fromEntries(valid)}}else next.preferences[op.id]=op.value;continue;
  }
  if(op.collection==='profiles'){
   const member=next.members.find(m=>m.id===op.id);if(!member||op.id!==actorId&&!(parent&&member.role==='child'))throw Error('This profile is private.');const value=structuredClone(op.value||{}),command=value.heroRequest;if(op.id!==actorId&&['notificationPrefs','financePlans','financeNotifications','documentCategories','pinnedRecords'].some(k=>value[k]!==undefined))throw Error('Personal preferences belong to this profile’s own account.');validateProfile(value,member);if(value.pinnedRecords){const existing=new Set((next.profiles[actorId]?.pinnedRecords||[]).map(p=>p.collection+':'+p.id)),accessible=visibleState(next,actorId);for(const pin of value.pinnedRecords)if(!existing.has(pin.collection+':'+pin.id)&&!accessible[pin.collection]?.some(r=>r.id===pin.id&&!r.deletedAt))throw Error('This record is private or unavailable.');}if(value.notificationPrefs?.categories?.finance!==undefined)validateFinancePreferences(value.notificationPrefs.categories.finance);if(value.financePlans!==undefined){if(member.role==='child'||op.id!==actorId)throw Error('Adults manage only their own money goals.');validateFinancePlans(value.financePlans)}delete value.heroRequest;delete value.hero;delete value.xp;if(command){if(member.role!=='child')throw Error('Choose a child hero.');next.profiles[op.id]=applyHeroCommand(next.profiles[op.id]||{},command);delete value.equipped}else{if(value.equipped==='cape'&&(next.profiles[op.id]?.xp||0)<400)throw Error('Reach level 5 to equip the moon cape.');if(next.profiles[op.id]?.hero)delete value.equipped}next.profiles[op.id]={...next.profiles[op.id],...value};if(birthdayProfiles.has(op.id)){const birthday=next.events.find(e=>e.id===birthdayEventId(op.id));if(!birthday||canEditContent(birthday,actorId,next.members,'event'))syncBirthday(next,op.id,{name:next.profiles[op.id].name||member.name,birthday:value.birthday,inCalendar:value.birthdayInCalendar!==false,color:value.color||member.color,ownerId:actorId})}continue;
  }
  if(op.collection==='members'){
   if(!parent)throw Error('A parent manages child profiles.');const children=(op.value||[]).filter(m=>!state.members.some(old=>old.id===m.id));if(next.members.length+children.length>40||children.length>20||children.some(m=>m.role!=='child'))throw Error('Adults join with an invitation and their own account.');for(const child of children){if(memberIds.has(child.id)||!/^[0-9a-f-]{36}$/i.test(child.id)||!text(child.name,80))throw Error('Invalid child profile.');if(typeof child.he!=='string'&&child.he!==undefined||typeof child.color!=='string'&&child.color!==undefined)throw Error('Choose valid child details.');next.members.push({id:child.id,name:child.name,he:child.he||child.name,color:child.color||'blue',role:'child'});next.profiles[child.id]={name:child.name,he:child.he||child.name,xp:0,displayMode:'pixel',character:'itai'};memberIds.add(child.id)}continue;
  }
  if(op.collection==='favorites'){if(!Array.isArray(op.value)||op.value.length>300||op.value.some(v=>typeof v!=='string'||v.length>180))throw Error('Choose valid favorite icons.');next.profiles[actorId].favoriteIcons=(op.value||[]).slice(0,300);continue}
  if(op.collection==='customIcons'){for(const icon of op.value||[])if(icon.ownerId===actorId&&!imageData(icon.src,{png:true}))throw Error('Upload a small PNG or JPEG icon.');const mine=(op.value||[]).filter(i=>i.ownerId===actorId);next.customIcons=[...(next.customIcons||[]).filter(i=>i.ownerId!==actorId),...mine.map(i=>({...i,ownerId:actorId,visibility:'private',allowedIds:[]}))];continue}
  if(op.collection==='aiOperations'){const existing=next.aiOperations?.[op.id];if(op.value?.ownerId!==actorId||(existing&&existing.ownerId!==actorId))throw Error('This AI receipt belongs to someone else.');next.aiOperations={...next.aiOperations,[op.id]:op.value};continue}
  if(parseExtKey(op.collection)){applyModuleOp(next,op,{state,actorId,role,memberIds,members:state.members,canEditContent,validateEditAccess});continue} // feature modules (shared/feature-modules.mjs)
  if(op.collection==='events'&&[...birthdayProfiles].some(id=>op.id===birthdayEventId(id)))continue; // The profile branch synchronizes birthdays without widening hidden audiences.
  if(!collections.includes(op.collection)||!text(op.id,140))throw Error('Unsupported record change.');const list=next[op.collection]||[],index=list.findIndex(r=>r.id===op.id),old=index>=0?list[index]:null,value=structuredClone(op.value||{});
  if(old&&!canSeeRecord(old,actorId,op.collection))throw Error('This record is private.');
  if(op.collection==='insurances'&&role==='child')throw Error('Insurance is available to adult accounts.');
  if(op.collection==='history'||op.collection==='purchases')continue; // Derived from the corresponding task/item change below.
  if(op.delete){if(!old&&cascaded.has(op.collection+':'+op.id))continue;if(!old||old.ownerId!==actorId&&!(op.collection==='shopping'&&canDeleteShoppingItem(old,next.shoppingLists,actorId))&&!(op.collection==='shoppingMarks'&&old.visibility!=='private')&&!(op.collection==='favourites'&&(parent||old.memberId===actorId)))throw Error('Only the owner can remove this record.');if(op.collection==='taskLists')for(const t of next.tasks||[])if(t.listId===op.id)delete t.listId;
   // A deleted shopping list takes its items with it (also ones its owner cannot see), or they would bring the list back
   // as an unnamed one; shopping trips keep their task and lose the link.
   if(op.collection==='shoppingLists'){next.shopping=(next.shopping||[]).filter(i=>(i.listId||'week')!==op.id||!cascaded.add('shopping:'+i.id));for(const t of next.tasks||[])if(t.shoppingListId===op.id)delete t.shoppingListId}
   list.splice(index,1);continue}
  if(value.id!==op.id||value.ownerId!==(old?.ownerId||actorId))throw Error('Record ownership cannot be changed.');validateRecord(op.collection,value);
  if(AUDIENCE_COLLECTIONS.includes(op.collection)&&op.collection!=='history'){const fixed=enforceAudience(op.collection,value,{old,actorId,members:next.members,memberIds,taskLists:next.taskLists,shoppingLists:next.shoppingLists});value.visibility=fixed.visibility;value.allowedIds=fixed.allowedIds}
  if(!['private','family','selected'].includes(value.visibility)||value.visibility==='selected'&&(!Array.isArray(value.allowedIds)||!value.allowedIds.length||value.allowedIds.some(id=>!memberIds.has(id))))throw Error('Choose valid visibility and people.');
  if(old&&old.ownerId!==actorId&&(!equal(old.visibility,value.visibility)||!equal(old.allowedIds||[],value.allowedIds||[])||!equal(old.editPolicy,value.editPolicy)||!equal(old.editorIds||[],value.editorIds||[])))throw Error('Only the owner changes sharing.');
  if(value.memberId&&!memberIds.has(value.memberId)||value.memberIds?.some(id=>!memberIds.has(id)))throw Error('A family member is invalid.');
  if(op.collection==='tasks'&&value.memberIds!==undefined){if(!value.memberIds.length||new Set(value.memberIds).size!==value.memberIds.length||value.memberId!==value.memberIds[0]||value.routine&&value.memberIds.length!==1)throw Error('Choose valid task assignees.');}
  if(role==='child'&&op.collection==='tasks'&&(!old||!equal(taskMemberIds(value),taskMemberIds(old)))&&taskMemberIds(value).some(id=>id!==actorId))throw Error('Children assign tasks only to themselves.');
  if(['documents','contacts','meals','shoppingLists','expenses','bills','taskLists','places','insurances'].includes(op.collection)&&old&&old.ownerId!==actorId)throw Error('Only the owner edits this record.');
  if(op.collection==='insurances')validateInsurancePolicy(value,memberIds,new Set(next.members.filter(m=>m.role!=='child').map(m=>m.id)));
  if(['events','tasks','places'].includes(op.collection)){const location=normalizeLocation(value.location);if(location){if(typeof value.location!=='string')value.location=location}else delete value.location;if(op.collection==='places'&&!location)throw Error('Choose a location to save.');}
  if(op.collection==='taskLists')validateTaskList(value,memberIds);
  if(op.collection==='events')validateEventTime(value);
  if(op.collection==='meals'){if((value.ingredients||[]).length>100)throw Error('Use up to 100 ingredients.');value.ingredients=normalizeIngredients(value.ingredients||[])}
  if(['events','notes'].includes(op.collection)){validateEditAccess(value,memberIds);if(old&&!canEditContent(old,actorId,state.members,op.collection==='notes'?'note':'event'))throw Error('Only the owner or a permitted editor can edit this record.');}
  if(['expenses','bills'].includes(op.collection)){if(role==='child')throw Error('Expenses are available to adult accounts.');if(!Number.isFinite(value.amount)||value.amount<=0||value.amount>100000000)throw Error('Choose a valid expense amount.');if(op.collection==='expenses'&&value.flow!==undefined&&!['expense','income','savings'].includes(value.flow))throw Error('Choose income or expense.');}
  if(op.collection==='pantry'){if(!text(value.title,160)||!Number.isFinite(value.quantityValue)||value.quantityValue<0||!Number.isFinite(value.minimum)||value.minimum<0)throw Error('Choose valid inventory quantities.');value.updatedBy=actorId;value.updatedAt=new Date().toISOString();}
  // Smarter shopping (2026-11-11): marks are "already bought", "not this time" and "stop suggesting"; favourites are each
  // person's likes and "doesn't eat". A child only asks (status requested) for itself; a parent decides. Receipts: adults only.
  if(op.collection==='shoppingMarks'||op.collection==='receipts'){const target=(next.shoppingLists||[]).find(l=>l.id===value.listId);if(!target||!canAccessList(target,actorId))throw Error('This shopping list is unavailable.');if(target.visibility==='private'&&value.visibility!=='private'||target.visibility==='selected'&&value.visibility==='family')throw Error('This cannot be shared more widely than its list.');
   if(op.collection==='shoppingMarks'&&!['bought','later','stop'].includes(value.kind))throw Error('Choose a valid answer.');
   if(op.collection==='receipts'){if(role==='child')throw Error('Receipts are available to adult accounts.');if(value.total!=null&&(!Number.isFinite(value.total)||value.total<0||value.total>10000000))throw Error('Choose a valid total.');if(value.lines!=null&&(!Array.isArray(value.lines)||value.lines.length>200||value.lines.some(l=>!l||typeof l!=='object'||typeof l.raw!=='string'||l.raw.length>200||l.price!=null&&!Number.isFinite(l.price))))throw Error('Choose valid receipt lines.');}
   if(!old){value.createdAt=new Date().toISOString();value.createdBy=actorId}}
  if(op.collection==='favourites'){if(!['likes','avoid'].includes(value.kind)||!['approved','requested'].includes(value.status)||!memberIds.has(value.memberId))throw Error('Choose a valid favourite.');
   if(role==='child'&&(value.memberId!==actorId||(old?value.status==='approved'&&old.status!=='approved':value.status!=='requested')))throw Error('A parent approves what a child asks for.');
   if(old&&old.ownerId!==actorId){if(!parent||Object.keys({...old,...value}).some(k=>!['status','decidedBy','decidedAt','updatedAt'].includes(k)&&JSON.stringify(old[k])!==JSON.stringify(value[k])))throw Error('Only a parent decides on a request.');value.decidedBy=actorId;value.decidedAt=new Date().toISOString()}
   if(!old){value.createdAt=new Date().toISOString();value.createdBy=actorId}}
  if(op.collection==='shopping'){
    if(!old){value.createdAt=new Date().toISOString();value.createdBy=actorId}else{value.createdAt=old.createdAt;value.createdBy=old.createdBy}
   const target=(next.shoppingLists||[]).find(l=>l.id===(value.listId||'week'));if(!target||!canAccessList(target,actorId))throw Error('This shopping list is unavailable.');if(target.visibility==='private'&&value.visibility!=='private'||target.visibility==='selected'&&(value.visibility==='family'||value.allowedIds.some(id=>!target.allowedIds.includes(id)&&id!==target.ownerId)))throw Error('An item cannot be shared more widely than its list.');if(!text(value.title,160)||!Number.isFinite(value.quantityValue||parseFloat(value.quantity))||Number(value.quantityValue||parseFloat(value.quantity))<=0)throw Error('Invalid shopping item.');
   if(value.done!==!!old?.done){value.boughtAt=value.done?new Date().toISOString():null;value.boughtBy=value.done?actorId:null;next.purchases.push({...value,purchaseId:crypto.randomUUID(),date:new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})})}
  }
  if(op.collection==='tasks'){
   // Visible projections omit private link IDs. Preserve them during another permitted
   // person's edit/service command, rather than treating redaction as a removal.
   if(old?.ownerId!==actorId)for(const [field,collection]of [['contactId','contacts'],['documentId','documents']])if(old?.[field]&&value[field]===undefined&&!(next[collection]||[]).some(r=>r.id===old[field]&&!r.deletedAt&&canSee(r,actorId)))value[field]=old[field];
   for(const [field,collection]of [['contactId','contacts'],['documentId','documents']])if(value[field]&&value[field]!==old?.[field]&&!(next[collection]||[]).some(r=>r.id===value[field]&&!r.deletedAt&&canSee(r,actorId)))throw Error('This linked record is private or unavailable.');
   if(value.serviceRequest){
    if(!old||old.category!=='maintenance'||!(parent||old.ownerId===actorId||old.memberId===actorId))throw Error('This maintenance task belongs to another person.');
    const command=value.serviceRequest;
    if(old.serviceHistory?.some(r=>r.id===command.id))continue;
    const plain={...value};delete plain.serviceRequest;if(!equal(plain,old))throw Error('Record service separately from editing the task.');
    const result=recordMaintenanceService(old,command,actorId,{today:new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})});
    list[index]=result;next[op.collection]=list;derivedHistory.push({id:crypto.randomUUID(),taskId:old.id,title:old.title,he:old.he,memberId:old.memberId,memberIds:taskMemberIds(old),date:command.date,time:new Date().toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit'}),done:true,state:'done',ownerId:old.ownerId,visibility:old.visibility,allowedIds:old.allowedIds||[],xp:0,icon:old.icon,actorId});continue;
   }
   if(!equal(value.serviceHistory,old?.serviceHistory)||!equal(value.nextServiceDate,old?.nextServiceDate))throw Error('Use the maintenance service control to record service.');
   if(value.listId&&!taskFitsList(value,(next.taskLists||[]).find(l=>l.id===value.listId)))throw Error('This task list is unavailable.');
   if(value.shoppingListId&&!taskFitsList(value,(next.shoppingLists||[]).find(l=>l.id===value.shoppingListId)))throw Error('This shopping list is unavailable.');
   if(!parent){value.xp=old?.xp||0;value.parentConfirm=old?.parentConfirm||false;value.routine=old?.routine||false;if(old&&(old.routine||old.ownerId!==actorId)){const permitted=new Set(['done','completedAt','completions']);
    // An assigned child may tick the existing steps of their task (same steps, same order, only "done" changes).
    const stepsTicked=(next,prev)=>Array.isArray(next)&&Array.isArray(prev)&&next.length===prev.length&&next.every((s,i)=>s&&prev[i]&&s.id===prev[i].id&&s.title===prev[i].title&&Object.keys(s).every(k=>k==='done'||equal(s[k],prev[i][k]))&&Object.keys(prev[i]).every(k=>k in s||k==='done'));
    const assigned=taskAssignedTo(old,actorId);
    for(const key of Object.keys(value))if(!permitted.has(key)&&!equal(value[key],old[key])&&!(['xp','parentConfirm','routine'].includes(key)&&!value[key]&&!old[key])&&!(key==='subtasks'&&assigned&&stepsTicked(value[key],old[key])))throw Error('A parent manages routine details.')}}
   value.xp=Math.min(100,Math.max(0,Number(value.xp)||0));if(old){const changedDates=Object.keys(value.completions||{}).filter(date=>!equal(old.completions?.[date],value.completions[date]));if(changedDates.length>1)throw Error('Update one completion at a time.');if(!changedDates.length){if(value.done!==old.done&&!(value.done===false&&old.done===undefined))throw Error('Use the activity completion control to update this task.');value.done=old.done;value.completedAt=old.completedAt;value.completions=old.completions;}for(const date of changedDates){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!(occursOn(old,date)||!old.date&&date===new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE}))||date>new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})||!parent&&(!taskAssignedTo(old,actorId)||date!==new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE})))throw Error('This task belongs to another person.');const authoritative=structuredClone(old),time=new Date().toLocaleTimeString('en-GB',{timeZone:HOME_TIMEZONE,hour:'2-digit',minute:'2-digit'}),result=completeTask(authoritative,{date,actorId,actorRole:parent?'parent':'child',time,instant:new Date().toISOString()});if(!result.changed||result.state!==value.completions[date].state)throw Error('The completion state changed. Refresh and retry.');value.completions=authoritative.completions;value.done=authoritative.done;value.completedAt=authoritative.completedAt;if(old.visibility==='family'&&value.visibility==='family')xpDeltas.set(old.memberId,(xpDeltas.get(old.memberId)||0)+result.xpDelta);derivedHistory.push({id:crypto.randomUUID(),taskId:old.id,title:old.title,he:old.he,memberId:old.memberId,memberIds:taskMemberIds(old),date,time,done:result.state==='done',state:result.state,ownerId:old.ownerId,visibility:old.visibility,allowedIds:old.allowedIds||[],xp:old.xp||0,icon:old.icon,actorId})}}
  }
  if(index<0)list.push(value);else list[index]=value;next[op.collection]=list;
 }
 // Changes to things assigned to someone else (deleted, moved, renamed, new place, person removed): one notice per
 // recipient, read only by that recipient (visibleState). The actor's own copy is silent (corrects sent reminders).
 {const notices=changeNoticesFor(state,next,actorId,canSeeRecord);if(notices.length||state.changeNotices?.length)next.changeNotices=pruneChangeNotices([...(state.changeNotices||[]),...notices]);}
 next.history=[...derivedHistory,...(next.history||[])];for(const [id,delta]of xpDeltas)if(next.profiles[id])next.profiles[id].xp=Math.max(0,(next.profiles[id].xp||0)+delta);
 if(new TextEncoder().encode(JSON.stringify(next)).byteLength>1_600_000)throw Error('This household has reached its current storage limit. Export or reduce large attachments.');return next;
}

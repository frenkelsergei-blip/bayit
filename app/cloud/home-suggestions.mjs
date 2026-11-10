import {deliveryView} from '../../shared/features.mjs';
import {bodyJSON, fail, hash, json, localDate, localTime} from './util.mjs';
import {commitAsMember, loadHousehold} from './assistant.mjs';
import {visibleState} from './state.mjs';
import {listPrivateVouchers} from './vouchers.mjs';
import {planningCandidates} from '../../shared/home-suggestions.mjs';
import {assignTaskPeople} from '../../shared/task-assignment.mjs';
import {completeTask} from '../src/domain.js';
import {suggestedAvailableMember} from './google-calendar.mjs';
import {voucherLink} from './voucher-delivery.mjs';

const read = (env,home,owner) => env.DB.prepare('SELECT * FROM home_suggestions WHERE household_id=? AND owner_id=?').bind(home,owner).first();
async function candidates(env,home,owner,actor) {
 // Features registry (2026-11-09): task suggestions only while Tasks is on, voucher suggestions only while Vouchers is on.
 const today=localDate(),now=localTime(),visible=deliveryView(visibleState(home.state,actor),actor);
 const source=planningCandidates(visible.features.on('tasks')?visible.tasks||[]:[],visible.features.on('vouchers')?await listPrivateVouchers(env,home.id,owner):[],actor,today).filter(({kind,record})=>kind!=='pickup'||record.time>now);
 return Promise.all(source.map(async item=>{
  const {kind,record}=item;
  const key=await hash(JSON.stringify([kind,record.id,record.date,record.time,record.title,record.he,record.expiresOn,record.balanceCents]));
  return {...item,key};
 }));
}

async function refresh(env,home,owner,actor) {
 const now=Date.now(),current=await candidates(env,home,owner,actor);
 const pickup=current.find(item=>item.kind==='pickup'), snapshot=[];
 if (pickup) {
  const ids=home.state.members.filter(member=>member.role!=='child').map(member=>member.id);
  const candidate=await suggestedAvailableMember(env,home,pickup.record.date,pickup.record.time,ids).catch(()=>null);
  if (candidate) snapshot.push({key:pickup.key,candidate,checkedAt:now});
 }
 await env.DB.prepare('UPDATE home_suggestions SET snapshot=?,next_at=? WHERE household_id=? AND owner_id=? AND enabled=1')
  .bind(JSON.stringify(snapshot),now+600000,home.id,owner).run();
}

export async function generateDueSuggestions(env,deadline) {
 const due=(await env.DB.prepare("SELECT s.household_id,s.owner_id,m.member_id FROM home_suggestions s JOIN memberships m ON m.household_id=s.household_id AND m.user_id=s.owner_id WHERE s.enabled=1 AND s.next_at<=? ORDER BY s.next_at LIMIT 2").bind(Date.now()).all()).results;
 let processed=0;
 for (const entry of due) {
  if (Date.now()+10000>=deadline) break;
  try {await refresh(env,await loadHousehold(env,entry.household_id),entry.owner_id,entry.member_id);processed++;}
  catch {await env.DB.prepare('UPDATE home_suggestions SET next_at=? WHERE household_id=? AND owner_id=?').bind(Date.now()+900000,entry.household_id,entry.owner_id).run();}
 }
 return processed;
}

export async function handleHomeSuggestions(request,env,home,action) {
 const owner=home.membership.user_id,actor=home.membership.member_id;
 if (!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='home_suggestions'").first()) return json({available:false,enabled:false,items:[]});
 const stored=await read(env,home.id,owner);
 if (action==='preferences' && request.method==='POST') {
  const body=await bodyJSON(request,1000);
  await env.DB.prepare("INSERT INTO home_suggestions(household_id,owner_id,enabled) VALUES(?,?,?) ON CONFLICT(household_id,owner_id) DO UPDATE SET enabled=excluded.enabled,next_at=0,snapshot='[]'")
   .bind(home.id,owner,body.enabled===true?1:0).run();
  return json({enabled:body.enabled===true});
 }
 if (!stored?.enabled) return json({available:true,enabled:false,items:[]});
 const marks=JSON.parse(stored.marks||'{}'),now=Date.now();
 const eligible=(await candidates(env,home,owner,actor)).filter(item=>!(marks[item.key]>now));
 if (action==='list' && request.method==='GET') {
  const snapshot=JSON.parse(stored.snapshot||'[]'),items=[];
  for (const {kind,record,key} of eligible.slice(0,3)) {
   const hint=snapshot.find(item=>item.key===key&&item.checkedAt>now-900000);
   const consent=hint&&await env.DB.prepare("SELECT 1 AS ok FROM google_calendar_connections c JOIN memberships m ON m.household_id=c.household_id AND m.user_id=c.owner_id WHERE c.household_id=? AND c.sharing=1 AND m.member_id=?").bind(home.id,hint.candidate).first();
   items.push({key,kind,id:record.id,title:record.title||record.he,he:record.he,date:record.date||record.expiresOn,time:record.time||'',candidate:consent?hint.candidate:null,
    ...(kind==='voucher'?{url:voucherLink(home.id,record.id)}:{})});
  }
  return json({available:true,enabled:true,items});
 }
 if (action!=='apply'||request.method!=='POST') throw fail('Unknown suggestion action.',404);
 const body=await bodyJSON(request,2000),item=eligible.find(item=>item.key===body.key);
 if (!item) throw fail('This suggestion has changed. Refresh and review it again.',409);
 if (['dismiss','later'].includes(body.change)) {
  const current=Object.fromEntries(Object.entries(marks).filter(([,until])=>until>now).slice(-60));
  current[item.key]=now+(body.change==='later'?3*3600000:30*86400000);
  const result=await env.DB.prepare('UPDATE home_suggestions SET marks=? WHERE household_id=? AND owner_id=? AND marks=? AND enabled=1').bind(JSON.stringify(current),home.id,owner,stored.marks).run();
  if (!result.meta.changes) throw fail('Suggestions changed. Try again.',409);
  return json({updated:true});
 }
 if (body.change==='assign' && item.kind==='pickup') {
  const member=home.state.members.find(member=>member.id===body.memberId&&member.role!=='child');
  if (!member||home.membership.role==='child') throw fail('Choose an adult.',403);
  if (body.suggested===true && await suggestedAvailableMember(env,home,item.record.date,item.record.time,[member.id])!==member.id) throw fail('Availability changed. Choose an assignee manually.',409);
 } else if (body.change!=='done'||item.kind!=='stale') throw fail('Choose an available action.',400);
 await commitAsMember(env,home,actor,data=>{
  const task=data.tasks.find(record=>record.id===item.record.id);
  if (body.change==='assign') assignTaskPeople(task,[body.memberId]);
  else completeTask(task,{date:task.date,actorId:actor,actorRole:home.membership.role,time:localTime(),instant:Date.now()});
 });
 return json({updated:true});
}

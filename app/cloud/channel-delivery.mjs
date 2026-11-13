// Scheduled delivery for every messaging channel (Modular Bayit work package 2.3, docs/channel-contract.md).
// Core decides what is due, for whom and when, and sends each message at most once; the channel only renders a
// planned message in its own format and sends it. Every message is planned from deliveryView(visibleState(state,
// recipient), recipient), the same access rules as the app, so a channel never sees what its reader may not.
// Moved from telegram.mjs deliverReminders without changing what is sent, in which order, or the stored records.
import {localDate,localTime} from './util.mjs';
import {deliveryView} from '../../shared/features.mjs';
import {loadHousehold,roleOf} from './assistant.mjs';
import {visibleState} from './state.mjs';
import {financeDeliveryMessages} from './finance-goals.mjs';
import {insuranceAlerts} from '../../shared/insurance-lifecycle.mjs';
import {voucherDeliveryMessages} from './voucher-delivery.mjs';
import {bayitAIDeliveryMessages} from './bayit-ai.mjs';
import {shopUpdates} from '../../shared/shopping-rhythm.mjs';
import {dueReminders,digestDue,approvalRequests,childUpdates,taskDoneUpdates,overdueAlerts,notificationPrefs,inQuietHours,snoozeStillDue,reminderMatchesOccurrence,changeUpdates} from './reminders.mjs';

export const MAX_PER_MEMBER_TICK=10;
const cut=(value,max)=>value.length>max?value.slice(0,max-1)+'…':value;
const languageOf=(state,memberId,fallback)=>state.profiles?.[memberId]?.locale||fallback||'he';

// The planned messages for one person, in sending order: [{key, type, …}] (types: docs/channel-contract.md).
// Corrections of reminders already sent are done here, in this order, through the channel's optional correct().
async function plan(env,channel,ctx,{home,childPrefs,snoozes,now,deadline,summary}){
 const d=channel.delivery,{householdId,memberId,role,visible,lang,date,time,recipient,connection}=ctx,members=home.state.members;
 const prefs=notificationPrefs(home.state.profiles[memberId]),quiet=inQuietHours(time,prefs.quietStart,prefs.quietEnd),outbox=[];
 // A snoozed reminder the person asked for goes first, so the per-tick limit never drops it after it was claimed.
 for(const snooze of snoozes.filter(s=>s.memberId===memberId)){
  const item=snooze.item,record=(item.kind==='event'?visible.events:visible.tasks).find(r=>r.id===item.id);
  await d.snoozeSent(env,snooze.id,now);
  // Re-checked against the item as it is now: moved, deleted, done, no longer visible or already started → not sent.
  if(!snoozeStillDue(item,record,memberId,{date,time})){summary.suppressed++;continue}
  outbox.push({key:'snooze:'+snooze.id,type:'reminder',snoozed:true,item:{...item,record,time:record.time||(item.kind==='maintenance'?time:'')}});
 }
 // Changes to things assigned to this person, by someone else; then silent corrections of reminders already sent.
 const changes=changeUpdates(visible,memberId,{time,now:now.getTime()});
 for(const burst of changes.messages)outbox.push({key:burst.key,type:'change',burst});
 if(d.correct)for(const burst of changes.corrections){if(Date.now()>=deadline)break;const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,?,?,'sent',?)").bind(householdId,memberId,channel.id,'fix:'+burst.key,now.getTime()).run();if(claim.meta.changes)summary.corrected=(summary.corrected||0)+await d.correct(env,connection,recipient,burst,ctx)}
 for(const item of dueReminders(visible,memberId,{date,time}))if(!reminderMatchesOccurrence(item,{date,time}))summary.suppressed++;else outbox.push({key:item.key,type:'reminder',item});
 const digest=digestDue(visible,memberId,{date,time});if(digest)outbox.push({key:digest.key,type:'digest'});
 // While someone shops (2026-11-11): what others add goes to the shopper; the others hear once that a shop began.
 if(!quiet&&visible.features.on('shopping'))for(const m of shopUpdates(visible,memberId,{now:now.getTime(),role}))outbox.push(m);
 const updates=quiet?[]:childUpdates(visible,memberId,{date,time},role,childPrefs),reported=new Set(updates.map(u=>u.entry.taskId+':'+u.entry.date));
 if(!quiet){
  for(const request of approvalRequests(visible,memberId,{date},role))outbox.push({key:request.key,type:'approval',task:request.task,by:members.find(m=>m.id===request.task.memberId)});
  for(const alert of overdueAlerts(visible,memberId,{date,time}))outbox.push({key:alert.key,type:'overdue',alert});
  for(const update of updates)outbox.push({key:update.key,type:'completed',task:update.entry,by:members.find(m=>m.id===update.entry.memberId)});
 }
 for(const u of taskDoneUpdates(visible,memberId,{date})){const own=notificationPrefs(visible.profiles?.[memberId],u.task.routine?'routines':'tasks');if(!inQuietHours(time,own.quietStart,own.quietEnd)&&!reported.has(u.task.id+':'+u.date))outbox.push({key:u.key,type:'completed',task:u.task,by:members.find(m=>m.id===u.actorId)})}
 if(visible.features.on('expenses'))try{for(const message of await financeDeliveryMessages(env,home,memberId,{date,time,channel:channel.id}))outbox.push({key:message.key,type:'finance',message})}catch{summary.failed++}
 // בית AI digest (2026-11-10): only for adults who chose this channel, outside quiet hours, while Ask AI and Expenses are on.
 try{for(const message of await bayitAIDeliveryMessages(env,home,memberId,{date,time,channel:channel.id}))outbox.push({key:message.key,type:'bayit-ai',message})}catch{summary.failed++}
 if(visible.features.on('insurance'))for(const message of insuranceAlerts(visible,memberId,{date,time,channel:channel.id,lang}))outbox.push({key:message.key,type:'insurance',message});
 if(visible.features.on('vouchers'))try{for(const message of await voucherDeliveryMessages(env,home,memberId,{date,time,channel:channel.id}))outbox.push({key:message.key,type:'voucher',message})}catch{summary.failed++}
 return outbox;
}

// One tick for the given channels (core first, then extensions). Returns the summary the scheduler reports.
export async function deliverChannels(env,now,channels,{deadline=Date.now()+45000,origin=env.BAYIT_ORIGIN}={}){
 const date=localDate(now),time=localTime(now),summary={households:0,sent:0,failed:0,suppressed:0};
 for(const channel of channels){const d=channel.delivery;
  for(const target of await d.targets(env)){if(Date.now()>=deadline)break;
   const householdId=target.householdId,recipients=await d.recipients(env,target);if(!recipients.length)continue;summary.households++;
   let connection,home;try{connection=await d.open(env,target);home=await loadHousehold(env,householdId)}catch{summary.failed++;continue}
   if(d.prepare)try{await d.prepare(env,connection)}catch{}
   // Only the yes/no "Update parents" choice of each child is shared with parents' delivery.
   const childPrefs=Object.fromEntries(home.state.members.filter(m=>m.role==='child').map(m=>[m.id,notificationPrefs(home.state.profiles[m.id]).parentUpdates!==false]));
   const snoozes=d.dueSnoozes?await d.dueSnoozes(env,target,now):[];
   for(const recipient of recipients){if(Date.now()>=deadline)break;
    const memberId=recipient.memberId,role=roleOf(home.state,memberId);if(!role)continue;
    const visible=deliveryView(visibleState(home.state,memberId),memberId);if(!visible.features.on(channel.feature))continue;
    const lang=languageOf(home.state,memberId),nameOf=id=>{const m=home.state.members.find(x=>x.id===id);return lang==='he'?m?.he||m?.name:m?.name};
    const ctx={env,connection,recipient,householdId,memberId,role,lang,date,time,origin,visible,members:home.state.members,nameOf};
    const outbox=await plan(env,channel,ctx,{home,childPrefs,snoozes,now,deadline,summary});
    for(const message of outbox.slice(0,MAX_PER_MEMBER_TICK)){if(Date.now()>=deadline)break;
     // A follow-up ("X is not shopping after all") goes only to people who really got the message it follows.
     if(message.requires&&!(await env.DB.prepare("SELECT 1 FROM notification_deliveries WHERE household_id=? AND member_id=? AND channel=? AND delivery_key=? AND status='sent'").bind(householdId,memberId,channel.id,message.requires).first()))continue;
     const claim=await env.DB.prepare("INSERT OR IGNORE INTO notification_deliveries(household_id,member_id,channel,delivery_key,status,created_at) VALUES(?,?,?,?,'sending',?)").bind(householdId,memberId,channel.id,message.key,now.getTime()).run();if(!claim.meta.changes)continue;
     const mark=(status,detail='')=>env.DB.prepare("UPDATE notification_deliveries SET status=?,detail=? WHERE household_id=? AND member_id=? AND channel=? AND delivery_key=?").bind(status,detail,householdId,memberId,channel.id,message.key).run();
     try{const sent=await d.send(env,connection,recipient,await d.render(message,ctx),lang);await mark('sent',sent?.messageId?'m:'+sent.messageId:'');summary.sent++} // The message id lets a later change correct this reminder.
     catch(error){summary.failed++;
      if(error.transient)await env.DB.prepare("DELETE FROM notification_deliveries WHERE household_id=? AND member_id=? AND channel=? AND delivery_key=?").bind(householdId,memberId,channel.id,message.key).run();
      else{await mark('failed',cut(String(error.message||''),200));if(error.blocked){await d.blocked(env,householdId,memberId);break}}}
    }
   }
  }
 }
 const at=now.getTime();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO service_heartbeats(name,at,detail) VALUES('reminders',?,?) ON CONFLICT(name) DO UPDATE SET at=excluded.at,detail=excluded.detail").bind(at,JSON.stringify(summary)),
  env.DB.prepare("DELETE FROM notification_deliveries WHERE created_at<? AND delivery_key NOT LIKE 'insurance:%'").bind(at-40*86400000),
  ...channels.flatMap(channel=>channel.delivery.cleanup(env,at))
 ]);
 return {ok:true,date,time,...summary};
}

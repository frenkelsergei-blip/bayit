import {canSee} from '../src/data.js';
import {fail,localDate,localTime} from './util.mjs';
import {manualMoneyRow} from '../../shared/money-records.mjs';
import {hasFinanceGoals,inFinanceScope,moneyGoalReport,goalMessages,financePrefs,weeklyGoalMessage} from '../../shared/finance-goals.mjs';

export function reportsFromFinance(data,state,memberId,date){
 const profile=state.profiles?.[memberId]||{},manual=(state.expenses||[]).filter(e=>canSee(e,memberId)).map(e=>manualMoneyRow(e)),all=[...(data.transactions||[]),...manual],reports={};
 for(const scope of ['family','private']){
  const rows=all.filter(t=>inFinanceScope(t,scope)),imports=(data.imports||[]).filter(i=>inFinanceScope(i,scope)),connections=(data.connections||[]).filter(c=>inFinanceScope(c,scope));
  const complete=new Set(rows.filter(t=>t.source==='riseup'&&t.month<date.slice(0,7)).map(t=>t.month));
  for(const item of imports.filter(i=>i.kind==='bank')){const months=[...new Set(rows.map(t=>(t.month||t.date.slice(0,7))))];for(const month of months){const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);if(item.periodFrom<=month+'-01'&&item.periodTo>=last)complete.add(month);}}
  const groups=(data.groups||[]).filter(g=>inFinanceScope(g,scope));
  const bills=(state.bills||[]).filter(b=>canSee(b,memberId)&&inFinanceScope(b,scope));
  const report=moneyGoalReport(rows,groups,profile.financePlans?.[scope],{date,completeMonths:[...complete],bills});
  const stamps=[...imports.map(i=>Number(i.appliedAt)||0),...connections.map(c=>Number(c.lastSyncAt)||0)].filter(Boolean),asOf=stamps.length?Math.max(...stamps):null;
  report.asOf=asOf;report.stale=asOf!==null&&Date.parse(date+'T23:59:59Z')-asOf>3*86400000;
  // An old upstream snapshot must not trigger a fresh-looking prediction warning.
  if(report.stale)report.alerts=report.alerts.filter(a=>a.type!=='remaining');
  reports[scope]=report;
 }
 return reports;
}
export async function financeGoalsFor(env,home,memberId,{date=localDate(),time=localTime(),data}={}){
 if(!home.state.members?.some(m=>m.id===memberId&&m.role!=='child'))throw fail('Money goals are available to adult accounts.',403);
 const profile=home.state.profiles?.[memberId]||{};
 if(!hasFinanceGoals(profile))return {reports:{},messages:[]};
 if(!data){const {visibleFinance}=await import('./finance.mjs');data=await visibleFinance(env,home,memberId)}
 const reports=reportsFromFinance(data,home.state,memberId,date),lang=profile.locale||'he';
 const messages=['family','private'].flatMap(scope=>profile.financePlans?.[scope]?goalMessages(reports[scope],scope,lang):[]),prefs=financePrefs(profile);
 if(prefs.weeklySummary===true&&time>=(prefs.weeklyTime||'12:00'))for(const scope of ['family','private'])if(profile.financePlans?.[scope]){const summary=weeklyGoalMessage(reports[scope],scope,lang,{date,weekday:prefs.weeklyDay??5});if(summary)messages.push(summary);}
 return {reports,messages};
}
export async function financeDeliveryMessages(env,home,memberId,{date,time,channel}){
 const profile=home.state.profiles?.[memberId],prefs=financePrefs(profile);
 if(!hasFinanceGoals(profile)||prefs.enabled===false||prefs[channel]!==true||!home.state.members?.some(m=>m.id===memberId&&m.role!=='child'))return [];
 const {inQuietHours}=await import('./reminders.mjs');if(inQuietHours(time,prefs.quietStart||'20:30',prefs.quietEnd||'07:00'))return [];
 const {minutes}=await import('./reminders.mjs'),at=minutes(prefs.weeklyTime||'12:00'),now=minutes(time);
 return (await financeGoalsFor(env,home,memberId,{date,time})).messages.filter(m=>!m.financeDigest||at!==null&&now!==null&&now>=at&&now<=at+60);
}

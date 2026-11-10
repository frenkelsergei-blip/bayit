import {base64, bodyJSON, decryptKey, encryptKey, fail, hash, json, random} from './util.mjs';
import {boundedJSON, externalFetch} from './outbound.mjs';
import {commitAsMember, loadHousehold} from './assistant.mjs';
import {exportGoogleEvent, googleEventFields, isFreeBusyFree, localEventTime} from '../../shared/google-calendar.mjs';
import {lease} from './leases.mjs';

const scope = name => 'https://www.googleapis.com/auth/calendar.'+name;
const scopes = {availability:[scope('freebusy')],read:[scope('calendarlist.readonly'),scope('events.readonly')],write:[scope('app.created')]};
const tokenURL = 'https://oauth2.googleapis.com/token';
const calendarURL = 'https://www.googleapis.com/calendar/v3';
const callbackPath = '/api/google-calendar/callback';
const eventFields = 'id,summary,start,end,status';
const ready = env => !!(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.APP_ENCRYPTION_KEY);
const encoded = value => encodeURIComponent(value);
const permissions = row => (row?.scopes || '').split(' ');
export const googleCalendarAAD = (home,user) => JSON.stringify(['google-calendar',home,user]);
export const googleOAuthAAD = state => JSON.stringify(['google-calendar-oauth',state]);
const oauthReturn = (url,home,status) => new Response(null,{status:303,headers:{Location:url.origin+'/#settings/connections?open=google-calendar&'+new URLSearchParams({home,calendar:status}),'Referrer-Policy':'no-referrer','Cache-Control':'no-store'}});
const connection = (env,home,user) => env.DB.prepare('SELECT * FROM google_calendar_connections WHERE household_id=? AND owner_id=?').bind(home,user).first();
const can = (row,mode) => scopes[mode].every(required=>permissions(row).includes(required));
const busyBody = (timeMin,timeMax) => ({timeMin,timeMax,items:[{id:'primary'}]});
const readLink = (env,home,user,id) => env.DB.prepare('SELECT * FROM google_calendar_links WHERE household_id=? AND owner_id=? AND event_id=?').bind(home,user,id).first();
const call = async (env,url,options) => {
 const response = await externalFetch(env,url,{...options,signal:AbortSignal.timeout(7000)});
 const result = await boundedJSON(response,750_000);
 if (!response.ok) throw Object.assign(fail('Google Calendar could not complete the request.',502),{providerStatus:response.status});
 return result;
};
const tokenRequest = (env,body) => call(env,tokenURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
  client_id:env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET,...body
 }).toString()});
const requestCalendar = (env,access,path,method='GET',body) => call(env,calendarURL+path,{
 method,headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined
});
const accessFor = async (env,row) => {
 if (!row) throw fail('Connect Google Calendar first.',409);
 const refresh_token = await decryptKey(row.ciphertext,env,googleCalendarAAD(row.household_id,row.owner_id));
 const result = await tokenRequest(env,{grant_type:'refresh_token',refresh_token});
 if (!result.access_token) throw fail('Reconnect Google Calendar.',409);
 return result.access_token;
};
const value = (text,length=256) => typeof text === 'string' && text.length<=length ? text : '';

export async function googleCalendarCallback(request,env,user) {
 const url = new URL(request.url);
 const state = url.searchParams.get('state') || '';
 if (request.method!=='GET' || !ready(env) || !/^[\w-]{30,60}$/.test(state)) throw fail('Calendar connection expired.',400);
 const key = await hash(state);
 const item = await env.DB.prepare('DELETE FROM google_calendar_oauth WHERE state_hash=? AND owner_id=? AND expires_at>? RETURNING *')
  .bind(key,user.id,Date.now()).first();
 if (!item) throw fail('Calendar connection expired.',400);
 const home = item.household_id;
 try {
  const member = await env.DB.prepare('SELECT role FROM memberships WHERE household_id=? AND user_id=?').bind(home,user.id).first();
  if (!member || member.role === 'child' || url.searchParams.has('error')) return oauthReturn(url,home,'cancelled');
  const {verifier,requested} = JSON.parse(await decryptKey(item.ciphertext,env,googleOAuthAAD(key)));
  const code = url.searchParams.get('code');
  if (!code) return oauthReturn(url,home,'cancelled');
  const token = await tokenRequest(env,{grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:url.origin+callbackPath});
  const granted = String(token.scope || '').split(' ');
  if (!token.refresh_token || !token.access_token || !requested.every(scope=>granted.includes(scope))) throw fail('Google did not grant the selected permissions.');
  const start = new Date().toISOString(), end = new Date(Date.now()+300000).toISOString();
  const busy = await requestCalendar(env,token.access_token,'/freeBusy','POST',busyBody(start,end));
  if (isFreeBusyFree(busy,start,end) === null) throw fail('The primary calendar could not be read.');
  const ciphertext = await encryptKey(token.refresh_token,env,googleCalendarAAD(home,user.id));
  const saved = await env.DB.prepare("INSERT OR IGNORE INTO google_calendar_connections(household_id,owner_id,ciphertext,scopes) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM memberships WHERE household_id=? AND user_id=? AND role<>'child')")
   .bind(home,user.id,ciphertext,requested.join(' '),home,user.id).run();
  if (!saved.meta.changes) throw fail('The Calendar connection changed.');
  return oauthReturn(url,home,'connected');
 } catch {return oauthReturn(url,home,'failed');}
}

export async function handleGoogleCalendar(request,env,home,action) {
 const url = new URL(request.url),method = request.method;
 const user = home.membership.user_id, actor = home.membership.member_id, household = home.id;
 if (home.membership.role==='child') throw fail('Calendar connections are available to adults.',403);
 if (!ready(env) && action==='status' && method==='GET') return json({available:false,connected:false});
 if (!ready(env)) throw fail('Configure Google Calendar on this installation.',503);
 const row = await connection(env,household,user);
 if (action==='status' && method==='GET') {
  const links = (await env.DB.prepare('SELECT event_id,direction,status,checked_at FROM google_calendar_links WHERE household_id=? AND owner_id=? ORDER BY checked_at DESC LIMIT 100').bind(household,user).all()).results;
  return json({available:true,connected:!!row,read:can(row,'read'),write:can(row,'write'),sharing:!!row?.sharing,links});
 }
 if (action==='connect' && method==='POST') {
  if (row) throw fail('Disconnect Google Calendar before changing its permissions.',409);
  const body = await bodyJSON(request,2000);
  const requested = [...scopes.availability,...(body.read===true?scopes.read:[]),...(body.write===true?scopes.write:[])];
  const state = random(), verifier = random(48), key = await hash(state);
  const challenge = base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const ciphertext = await encryptKey(JSON.stringify({verifier,requested}),env,googleOAuthAAD(key));
  await env.DB.batch([
   env.DB.prepare('DELETE FROM google_calendar_oauth WHERE expires_at<? OR (household_id=? AND owner_id=?)').bind(Date.now(),household,user),
   env.DB.prepare('INSERT INTO google_calendar_oauth VALUES (?,?,?,?,?)').bind(key,household,user,ciphertext,Date.now()+600000)
  ]);
  const params = new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,redirect_uri:url.origin+callbackPath,response_type:'code',
   scope:requested.join(' '),state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'});
  return json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
 }
 if (action==='disconnect' && method==='POST') {
  await env.DB.batch([
   env.DB.prepare('DELETE FROM google_calendar_oauth WHERE household_id=? AND owner_id=?').bind(household,user),
   env.DB.prepare('DELETE FROM google_calendar_links WHERE household_id=? AND owner_id=?').bind(household,user),
   env.DB.prepare('DELETE FROM google_calendar_connections WHERE household_id=? AND owner_id=?').bind(household,user)
  ]);
  if (row) try {
   const token = await decryptKey(row.ciphertext,env,googleCalendarAAD(household,user));
   const response = await externalFetch(env,'https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}).toString(),signal:AbortSignal.timeout(5000)});
   await response.body?.cancel();
  } catch {}
  return json({connected:false});
 }
 if (!row) throw fail('Connect Google Calendar first.',409);
 if (action==='sharing' && method==='POST') {
  const body = await bodyJSON(request,2000);
  await env.DB.prepare('UPDATE google_calendar_connections SET sharing=? WHERE household_id=? AND owner_id=?').bind(body.enabled===true?1:0,household,user).run();
  return json({sharing:body.enabled===true});
 }
 if (action==='calendars' && method==='GET') {
  if (!can(row,'read')) throw fail('Allow reading selected Google events first.',403);
  const page = value(url.searchParams.get('page'),2000),access = await accessFor(env,row);
  const data = await requestCalendar(env,access,'/users/me/calendarList?'+new URLSearchParams({maxResults:'100',minAccessRole:'reader',fields:'nextPageToken,items(id,summary,summaryOverride,primary)',...(page?{pageToken:page}:{})}));
  return json({calendars:(data.items || []).map(item=>({id:item.id,title:item.summaryOverride||item.summary,primary:!!item.primary})),next:data.nextPageToken||''});
 }
 if (action==='events' && method==='GET') {
  if (!can(row,'read')) throw fail('Allow reading selected Google events first.',403);
  const calendar = value(url.searchParams.get('calendar')),page = value(url.searchParams.get('page'),3000);
  if (!calendar) throw fail('Choose a calendar.');
  const cursor = new URLSearchParams(page);
  const timeMin = page ? cursor.get('from') : new Date(Date.now()-86400000).toISOString();
  const pageToken = cursor.get('token');
  if (page && (!pageToken || !timeMin || !Number.isFinite(Date.parse(timeMin)))) throw fail('Open this calendar again to refresh the event list.');
  const access = await accessFor(env,row);
  const data = await requestCalendar(env,access,'/calendars/'+encoded(calendar)+'/events?'+new URLSearchParams({singleEvents:'true',orderBy:'startTime',maxResults:'35',
   timeMin,fields:'nextPageToken,items('+eventFields+')',...(pageToken?{pageToken}:{})}));
  return json({events:(data.items||[]).flatMap(item=>{const fields=googleEventFields(item);return fields?[{id:item.id,...fields}]:[];}),
   next:data.nextPageToken?new URLSearchParams({from:timeMin,token:data.nextPageToken}).toString():''});
 }
 if (action==='unlink' && method==='POST') {
  const body = await bodyJSON(request,2000),id = value(body.id);
  const release = await lease(env,'google-event:'+household+':'+user+':'+id,30000);
  if (!release) throw fail('This event is syncing. Try again shortly.',409);
  try {
   await env.DB.prepare('DELETE FROM google_calendar_links WHERE household_id=? AND owner_id=? AND event_id=?').bind(household,user,id).run();
   return json({unlinked:true});
  } finally {await release();}
 }
 if (action==='import' && method==='POST') {
  if (!can(row,'read')) throw fail('Allow reading selected Google events first.',403);
  const body = await bodyJSON(request,4000), calendar = value(body.calendar), remote = value(body.remote);
  if (!calendar || !remote) throw fail('Choose one event to import.');
  const access = await accessFor(env,row);
  const fields = await readEventFields(env,access,eventPath(calendar,remote));
  if (!fields) throw fail('This event is unavailable or spans multiple days.',422);
  const id = 'gcal-'+(await hash(JSON.stringify([user,calendar,remote]))).slice(0,34);
  const {result} = await commitAsMember(env,home,actor,data=>{
   if (!data.events.some(item=>item.id===id)) data.events.push({...fields,id,ownerId:actor,he:fields.title,repeat:'once',visibility:'private',allowedIds:[],memberIds:[actor],color:'lilac',editPolicy:'owner',editorIds:[]});
   return id;
  });
  if (body.follow===true) await env.DB.prepare("INSERT OR IGNORE INTO google_calendar_links(household_id,owner_id,event_id,direction,calendar_id,remote_id,last_key,status,checked_at,next_at) VALUES(?,?,?,'import',?,?,?,'synced',?,?)")
   .bind(household,user,id,calendar,remote,JSON.stringify(fields),Date.now(),Date.now()+300000).run();
  return json({id:result});
 }
 if (action==='export' && method==='POST') {
  if (!can(row,'write')) throw fail('Allow creating a Bayit calendar first.',403);
  const body = await bodyJSON(request,2000),id = value(body.id);
  const item = home.state.events.find(event=>event.id===id&&event.ownerId===actor);
  if (!item || !exportGoogleEvent(item)) throw fail('Choose a single, non-recurring event you own.',422);
  const remote = 'bayit'+(await hash(JSON.stringify([household,user,id]))).slice(0,38);
  const calendar = await exportCalendar(env,row);
  await env.DB.prepare("INSERT OR IGNORE INTO google_calendar_links(household_id,owner_id,event_id,direction,calendar_id,remote_id) VALUES(?,?,?,'export',?,?)").bind(household,user,id,calendar,remote).run();
  const link = await readLink(env,household,user,id);
  if (link?.direction!=='export') throw fail('Disconnect this event’s Google source before exporting.',409);
  const status = await syncCalendarLink(env,link);
  return json({status});
 }
 if (action==='sync' && method==='POST') {
  const body = await bodyJSON(request,2000);
  const link = await readLink(env,household,user,value(body.id));
  if (!link) throw fail('This link is unavailable.',404);
  return json({status:await syncCalendarLink(env,link)});
 }
 throw fail('Unknown Calendar operation.',404);
}

async function exportCalendar(env,row) {
 if (row.output_calendar) return row.output_calendar;
 const release = await lease(env,'google-calendar-create:'+row.household_id+':'+row.owner_id);
 if (!release) throw fail('The Bayit calendar is being set up. Try again.',409);
 try {
  const current = await connection(env,row.household_id,row.owner_id);
  if (current?.output_calendar) return current.output_calendar;
  const access = await accessFor(env,current);
  const created = await requestCalendar(env,access,'/calendars','POST',{summary:'Bayit'});
  if (!created.id) throw fail('Google did not return a calendar identifier.',502);
  const saved = await env.DB.prepare('UPDATE google_calendar_connections SET output_calendar=? WHERE household_id=? AND owner_id=? AND ciphertext=?')
   .bind(created.id,row.household_id,row.owner_id,current.ciphertext).run();
  if (!saved.meta.changes) throw fail('The Calendar connection changed.',409);
  return created.id;
 } finally {await release();}
}

const eventPath = (calendar,id='') => '/calendars/'+encoded(calendar)+'/events'+(id?'/'+encoded(id):'');
const readEventFields = async (env,access,path) => googleEventFields(await requestCalendar(env,access,path+'?fields='+eventFields));
export async function syncCalendarLink(env,link) {
 const release = await lease(env,'google-event:'+link.household_id+':'+link.owner_id+':'+link.event_id,30000);
 if (!release) return 'pending';
 const update = async (status,last=link.last_key) => {
  await env.DB.prepare('UPDATE google_calendar_links SET status=?,last_key=?,checked_at=?,next_at=? WHERE household_id=? AND owner_id=? AND event_id=? AND direction=? AND calendar_id=? AND remote_id=?')
   .bind(status,last,Date.now(),Date.now()+(status==='synced'?300000:900000),link.household_id,link.owner_id,link.event_id,link.direction,link.calendar_id,link.remote_id).run();
  return status;
 };
 try {
  const current = await readLink(env,link.household_id,link.owner_id,link.event_id);
  if (!current || current.direction!==link.direction || current.calendar_id!==link.calendar_id || current.remote_id!==link.remote_id) return 'paused';
  link = current;
  const member = await env.DB.prepare('SELECT member_id,role FROM memberships WHERE household_id=? AND user_id=?').bind(link.household_id,link.owner_id).first();
  const row = await connection(env,link.household_id,link.owner_id);
  if (!member || member.role==='child' || !can(row,link.direction==='export'?'write':'read')) return update('paused');
  const home = await loadHousehold(env,link.household_id);
  const event = home.state.events.find(item=>item.id===link.event_id&&item.ownerId===member.member_id&&!item.deletedAt);
  if (!event) return update('unavailable');
  const path = eventPath(link.calendar_id,link.remote_id);
  if (link.direction==='import') {
   const access = await accessFor(env,row), fields = await readEventFields(env,access,path);
   if (!fields) return update('unavailable');
   const key = JSON.stringify(fields);
   if (key!==link.last_key) await commitAsMember(env,home,member.member_id,data=>{
    const record = data.events.find(item=>item.id===event.id);
    Object.assign(record,fields,{he:fields.title});
   });
   return update('synced',key);
  }
  const fields = exportGoogleEvent(event);
  if (!fields) return update('unavailable');
  const key = JSON.stringify(fields);
  if (key===link.last_key) return update('synced',key);
  const access = await accessFor(env,row);
  if (link.last_key) await requestCalendar(env,access,path+'?sendUpdates=none','PATCH',fields);
  else {
   try {await requestCalendar(env,access,eventPath(link.calendar_id)+'?sendUpdates=none','POST',{...fields,id:link.remote_id});}
   catch (error) {if (error.providerStatus!==409) throw error;await requestCalendar(env,access,path+'?sendUpdates=none','PATCH',fields);}
  }
  return update('synced',key);
 } catch (error) {return update([404,410].includes(error.providerStatus)?'unavailable':'error');}
 finally {await release();}
}

export async function syncDueGoogleCalendar(env,deadline) {
 if (!ready(env)) return 0;
 const rows = (await env.DB.prepare('SELECT * FROM google_calendar_links WHERE next_at<=? ORDER BY next_at LIMIT 2').bind(Date.now()).all()).results;
 let count=0;
 for (const row of rows) {if (Date.now()+7500>=deadline) break;await syncCalendarLink(env,row);count++;}
 return count;
}

export async function suggestedAvailableMember(env,home,day,time,ids) {
 if (!ready(env)) return null;
 const start=localEventTime(day,time);
 if (!start) return null;
 const end = new Date(Date.parse(start)+30*60000).toISOString();
 const rows = (await env.DB.prepare("SELECT c.*,m.member_id FROM google_calendar_connections c JOIN memberships m ON m.household_id=c.household_id AND m.user_id=c.owner_id WHERE c.household_id=? AND c.sharing=1 AND m.role<>'child'").bind(home.id).all()).results;
 const candidates=rows.filter(row=>ids.includes(row.member_id)&&can(row,'availability')).slice(0,3);
 const results=await Promise.all(candidates.map(async row=>{
  try {
   const access=await accessFor(env,row),busy=await requestCalendar(env,access,'/freeBusy','POST',busyBody(start,end));
   return isFreeBusyFree(busy,start,end)===true?row.member_id:null;
  } catch {return null;}
 }));
 return results.find(Boolean) || null;
}

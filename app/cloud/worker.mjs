import {featureDefaults} from '../../shared/features.mjs';
import {authReady,authConfig,authHandler,sessionFor} from './auth.mjs';
import {signInChoices} from './signin-methods.mjs';
import {canSee} from '../src/data.js';
import {blankState,visibleState,applyChanges} from './state.mjs';import {appliedOperation,commitOperation} from './client-ops.mjs';
import {json,fail,random,hash,bodyJSON,encryptKey,decryptKey} from './util.mjs';
import {loadHousehold,runAssistant} from './assistant.mjs';
import {listModels,providerBase} from './ai-providers.mjs';
import {AI_PROVIDERS,AI_PROVIDER,providerName} from '../../shared/ai-providers.mjs';
import {channelForHook,channelForAPI} from './channels.mjs';
import {runReminderTick} from './scheduler.mjs';
import {handleFinanceAPI} from './finance.mjs';
import {handleDocumentAnalysis} from './document-analysis.mjs';
import {handleReceiptAnalysis} from './receipt-analysis.mjs';
import {handleNoteAnalysis} from './note-analysis.mjs';
import {handleInsuranceReview} from './insurance-review.mjs';
import {handleAIUsage} from './ai-usage.mjs';
import {handleInsuranceIdentities} from './insurance-identities.mjs';
import {handleVouchers} from './vouchers.mjs';
import {handleMessagePlan} from './message-plan.mjs';
import {googleCalendarCallback,handleGoogleCalendar} from './google-calendar.mjs';
import {handleHomeSuggestions} from './home-suggestions.mjs';
import {handleBayitAI} from './bayit-ai.mjs';
import {handleVoice} from './voice.mjs';
import {handleAIHistory,saveTurn} from './ai-history.mjs';
import {handleFamilyManagement} from './family-management.mjs';
import {handleKidsParent} from './kids-parent.mjs';
import {handlePushAPI} from './push.mjs';
import {handleFiles} from './files.mjs';
import {handleMapsAPI} from './maps.mjs';
import {invitationPermit,canCreateHousehold,registrationStatus} from './registration.mjs';
import {requireRecent,limit,ownSessions,audit,audited,ownAudit} from './security.mjs';
import {securitySchemaReady,REQUIRED_MIGRATION} from './schema-ready.mjs';
import {withPDFSlot} from './pdf-budget.mjs';
import {rotateStoredCredentials} from './credential-rotation.mjs';
import {lease} from './leases.mjs';
import {sameDigest} from './util.mjs';
import {securityHeaders} from './security-headers.mjs';
import {authorizeChildInvitation} from './child-identity.mjs';
import {joinHousehold} from './family-join.mjs';
import {handlePasskeys,passkeyRegistration,passkeysOn,relyingParty} from './passkeys.mjs';
import {recoveryInvitation} from './passkey-recovery.mjs';
import {MODULE_DATA_PATH,handleModuleData} from './feature-module-data.mjs';
async function household(env,user,id){const membership=await env.DB.prepare('SELECT * FROM memberships WHERE household_id=? AND user_id=?').bind(id,user.id).first();if(!membership)throw fail('This household is unavailable.',403);return {...await loadHousehold(env,id),membership}}
async function chosenHousehold(request,env,user,id){let selected=id||request.headers.get('X-Bayit-Household');if(!selected)selected=(await env.DB.prepare('SELECT household_id FROM memberships WHERE user_id=? ORDER BY created_at LIMIT 1').bind(user.id).first())?.household_id;if(!selected)throw fail('Create or join a household first.',409);return household(env,user,selected)}
// Settings → AI: each household chooses its provider and stores its own key (encrypted, never returned).
async function handleAI(request,env,user,home,path){
 const actorId=home.membership.member_id,parent=home.membership.role==='parent',action=path.split('/').at(-1);
 if(action==='insurance-review')return handleInsuranceReview(request,env,home);
 const stored=await env.DB.prepare('SELECT * FROM household_secrets WHERE household_id=?').bind(home.id).first();
 const providerAllowed=r=>{try{if(r?.provider==='custom')providerBase(env,'custom',r.base_url||'');return true}catch{return false}};
 const status=r=>({available:!!env.APP_ENCRYPTION_KEY,provider:r?.provider||'anthropic',providerName:providerName(r?.provider||'anthropic'),baseUrl:(r?.provider==='custom'&&providerAllowed(r)&&r?.base_url)||'',blockedByPolicy:!providerAllowed(r),connected:!!r?.ciphertext&&!!r?.verified&&providerAllowed(r),hasKey:!!r?.ciphertext,model:r?.model||'',models:JSON.parse(r?.models||'[]'),keyStorage:'encrypted-server-storage',mode:'cloud',canManage:parent,providers:AI_PROVIDERS.map(({id,name,company,keyHint,keysUrl})=>({id,name,company,keyHint,keysUrl}))});
 if(action==='status'&&request.method==='GET')return json(status(stored));
 if(action==='credentials'&&request.method==='DELETE'){if(!parent)throw fail('A parent manages the household AI connection.',403);await env.DB.prepare('DELETE FROM household_secrets WHERE household_id=?').bind(home.id).run();return json(status(null))}
 const body=await bodyJSON(request,190000);
 if(['credentials','test','model'].includes(action)&&!parent)throw fail('A parent manages the household AI connection.',403);
 if(action==='credentials'){
  const provider=AI_PROVIDER[body.provider]?body.provider:'anthropic',candidate=typeof body.apiKey==='string'?body.apiKey.trim():'',baseUrl=provider==='custom'?String(body.baseUrl||'').trim().slice(0,300):'';
  if(candidate.length<8||candidate.length>2000)throw fail('Enter a valid API key for '+providerName(provider)+'.');
  providerBase(env,provider,baseUrl);
  const models=await listModels(env,{provider,key:candidate,baseUrl}),ciphertext=await encryptKey(candidate,env,home.id);
  await env.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider,base_url) VALUES(?,?,?,?,1,?,?) ON CONFLICT(household_id) DO UPDATE SET ciphertext=excluded.ciphertext,model=excluded.model,models=excluded.models,verified=1,provider=excluded.provider,base_url=excluded.base_url').bind(home.id,ciphertext,'',JSON.stringify(models),provider,baseUrl||null).run();
  return json(status({ciphertext,models:JSON.stringify(models),verified:1,provider,base_url:baseUrl}));
 }
 if(!stored?.ciphertext)throw fail('Connect your household’s AI provider first.',409);
 if(action==='model'){if(!JSON.parse(stored.models||'[]').some(m=>m.id===body.model))throw fail('Choose an available model.');await env.DB.prepare('UPDATE household_secrets SET model=? WHERE household_id=?').bind(body.model,home.id).run();return json(status({...stored,model:body.model}))}
 if(action==='test'){const key=await decryptKey(stored.ciphertext,env,home.id),models=await listModels(env,{provider:stored.provider||'anthropic',key,baseUrl:stored.base_url||''});await env.DB.prepare('UPDATE household_secrets SET models=?,verified=1 WHERE household_id=?').bind(JSON.stringify(models),home.id).run();return json(status({...stored,models:JSON.stringify(models),verified:1}))}
 if(action!=='chat')throw fail('Unknown AI endpoint.',404);
 const result=await runAssistant(env,{home,actorId,role:home.membership.role,question:body.question,turns:body.turns,scope:body.context?.scope,language:body.context?.language});
 // בית AI history (2026-11-10): kept for the asker only, when the app sends a conversation id.
 const seq=await saveTurn(env,home,actorId,{conversationId:body.conversationId,question:body.question,result,scope:body.context?.scope,voice:body.voice}).catch(()=>null);
 return json(seq?{...result,conversationId:body.conversationId,seq}:result)
}
async function handle(request,env){const url=new URL(request.url),path=url.pathname;
 if(path==='/api/health'){const ready=await securitySchemaReady(env);return json({ok:ready,service:'bayit',storage:!!env.DB,...(!ready?{code:'SCHEMA_UPDATE_REQUIRED',requiredMigration:REQUIRED_MIGRATION}:{})},ready?200:503)}
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(path==='/api/config'){const ready=await securitySchemaReady(env),session=ready?await sessionFor(request,env):null;return json({mode:'cloud',installation:{ready,updateRequired:!ready,requiredMigration:!ready?REQUIRED_MIGRATION:null},registration:ready?{...await registrationStatus(env),...await passkeyRegistration(env)}:{mode:'private',setupRequired:false,setup:'none'},passkeys:{enabled:passkeysOn(env),address:!!relyingParty(env)},auth:{enabled:ready&&authReady(env),configured:authReady(env),authenticated:!!session},signIn:{methods:authReady(env)?signInChoices(env):[]},google:{configured:authReady(env)},familySharing:{enabled:authReady(env)&&!!env.DB},storage:{provider:'cloudflare-d1',connected:!!env.DB,files:!!env.FILES},publicOrigin:url.origin})}
 if(!await securitySchemaReady(env))throw Object.assign(fail('The installation owner must finish the database update. No changes were saved.',503),{code:'SCHEMA_UPDATE_REQUIRED'});
 // Messaging channels (channels.mjs, docs/channel-contract.md): the inbound webhook verifies its own request.
 {const channel=channelForHook(path);if(channel&&request.method==='POST')return channel.webhook(request,env,path.slice(channel.hookPath.length))}
 if(path==='/api/internal/reminders'&&request.method==='POST')return runReminderTick(request,env);
 if(path==='/api/internal/rotate-credentials'&&request.method==='POST'){const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');if((env.REMINDER_CRON_SECRET||'').length<24||!token||!sameDigest(await hash(token),await hash(env.REMINDER_CRON_SECRET)))throw fail('Unauthorized.',401);await limit(env,'credential-rotation',{max:3,period:86400000});const release=await lease(env,'reminder-tick');if(!release)throw fail('Another maintenance operation is running. Try again shortly.',409);try{return json(await audited(env,{actor:'installation-operator',action:'session.credentials'},()=>rotateStoredCredentials(env)))}finally{await release()}}
 if(path==='/api/registration/invitation')return invitationPermit(request,env);
 if(path.startsWith('/api/passkeys/'))return handlePasskeys(request,env,{sessionFor}); // passkey ceremonies (passkeys.mjs); signed-in steps check the session there
 if(path.startsWith('/api/auth/')){if(!authReady(env))return json({error:'Sign-in is awaiting the owner’s setup.'},503);return authHandler(request,env)}
 if(!authReady(env))throw fail('Sign-in is awaiting the owner’s setup.',503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==url.origin)throw fail('Request origin is not allowed.',403);
 const session=await sessionFor(request,env);if(!session)throw fail('Sign in to Bayit first.',401);const user=session.user;if(!['GET','HEAD'].includes(request.method))await limit(env,'api:'+user.id);
 if(!['GET','HEAD'].includes(request.method)){if(path.startsWith('/api/ai/')){await limit(env,'ai-minute:'+user.id,{max:10});await limit(env,'ai-day:'+user.id,{max:60,period:86400000})}
  // Reading an already connected account does not change credentials or permissions.
  // Keep this exception exact: every connection mutation still needs recent Google authentication.
  const existingRiseupSync=request.method==='POST'&&path==='/api/finance/connections/riseup/sync';
  if(!existingRiseupSync&&(/^\/api\/family\/(invitations|members)/.test(path)||/\/api\/(ai|telegram|maps|finance)\/(credentials|connect|disconnect|links|link|speech|model)/.test(path)))await requireRecent(request,env,user)
 }
 if(path==='/api/security/sessions')return ownSessions(request,env,user);
 if(path==='/api/security/events'&&request.method==='GET')return ownAudit(env,user,await chosenHousehold(request,env,user));
 if(path==='/api/session'){const memberships=(await env.DB.prepare('SELECT m.household_id AS id,m.member_id AS actorId,m.role,h.name FROM memberships m JOIN households h ON h.id=m.household_id WHERE m.user_id=? ORDER BY m.created_at').bind(user.id).all()).results;return json({user,memberships})}
 if(path==='/api/households'&&request.method==='POST'){const householdLimit=await canCreateHousehold(env,user);const body=await bodyJSON(request),name=String(body.name||'').trim().slice(0,80);if(!name)throw fail('Choose a household name.');const id=crypto.randomUUID(),now=new Date().toISOString(),member={id:user.id,name:user.name||'Parent',he:user.name||'הורה',role:'parent',color:'blue',avatar:user.image||''},state=blankState(id,name,member);state.preferences.features=featureDefaults();state.preferences.familyProfile={answers:{},pending:true};/* A new family starts with the Core 5 (features registry, 2026-11-09). */const created=await env.DB.batch([env.DB.prepare('INSERT INTO households(id,name,created_by,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM households)<?').bind(id,name,user.id,now,householdLimit),env.DB.prepare('INSERT INTO memberships(household_id,user_id,member_id,role,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM households WHERE id=?)').bind(id,user.id,user.id,'parent',now,id),env.DB.prepare('INSERT INTO household_data(household_id,state,revision) SELECT ?,?,0 WHERE EXISTS(SELECT 1 FROM households WHERE id=?)').bind(id,JSON.stringify(state),id)]);if(!created[0].meta.changes)throw fail('This installation has reached its configured household limit.',409);await audit(env,{home:id,actor:user.id,action:'household.create'}).catch(()=>{});return json({id},201)}
 if(/^\/api\/family\/(invitations|members)(\/[^/]+)?$/.test(path)&&request.method!=='POST'){const home=await chosenHousehold(request,env,user);return audited(env,{home:home.id,actor:user.id,action:'family.members'},()=>handleFamilyManagement(request,env,home))}
 if(path==='/api/family/invitations/recovery'&&request.method==='POST'){if(!passkeysOn(env)||!relyingParty(env))throw fail('Unknown endpoint.',404);return recoveryInvitation(request,env,user,await chosenHousehold(request,env,user))} // passkey recovery link (404 while passkeys are off or impossible here, review finding 8) with a 24-hour hold (passkey-recovery.mjs)
 if(path==='/api/family/invitations'&&request.method==='POST'){const body=await bodyJSON(request),home=await chosenHousehold(request,env,user,body.householdId);if(home.membership.role!=='parent')throw fail('A parent can invite new members.',403);const role=['parent','adult','child'].includes(body.role)?body.role:'adult',expiresAt=Date.now()+Math.min(14,Math.max(1,Number(body.expiresInDays)||7))*86400000,token=random();let childId=null;if(role==='child'&&body.memberId){const child=home.state.members.find(m=>m.id===body.memberId&&m.role==='child'),linked=await env.DB.prepare('SELECT user_id FROM memberships WHERE household_id=? AND member_id=?').bind(home.id,body.memberId).first();if(!child||linked)throw fail('Choose an unlinked child profile.',400);await authorizeChildInvitation(env,home,child.id);childId=child.id}await limit(env,'invites:'+home.id,{max:20,period:86400000});if(home.state.members.length>=40)throw fail('This household has reached its member limit.',409);await env.DB.prepare('INSERT INTO invitations(token_hash,household_id,role,created_by,expires_at,member_id) VALUES(?,?,?,?,?,?)').bind(await hash(token),home.id,role,user.id,expiresAt,childId).run();return json({url:url.origin+'/#join?invite='+token,expiresAt:new Date(expiresAt).toISOString()},201)}
 if(path==='/api/family/join'&&request.method==='POST'){const body=await bodyJSON(request),tokenHash=await hash(String(body.token||''));return json({id:(await joinHousehold(env,user,tokenHash)).id})} // one join for every sign-in method (family-join.mjs)
 if(/^\/api\/insurance\/identities(?:\/lookup)?$/.test(path)){const home=await chosenHousehold(request,env,user);return request.method==='GET'||path.endsWith('/lookup')?handleInsuranceIdentities(request,env,home):audited(env,{home:home.id,actor:home.membership.member_id,action:'state.change'},()=>handleInsuranceIdentities(request,env,home))}
 if(path==='/api/shopping/receipt'){await limit(env,'ai-minute:'+user.id,{max:10});await limit(env,'ai-day:'+user.id,{max:60,period:86400000});return handleReceiptAnalysis(request,env,await chosenHousehold(request,env,user))}
 if(path==='/api/shopping/note'){await limit(env,'ai-minute:'+user.id,{max:10});await limit(env,'ai-day:'+user.id,{max:60,period:86400000});return handleNoteAnalysis(request,env,await chosenHousehold(request,env,user))}
 if(path==='/api/documents/analyze'){await limit(env,'ai-minute:'+user.id,{max:10});await limit(env,'ai-day:'+user.id,{max:60,period:86400000});return handleDocumentAnalysis(request,env,await chosenHousehold(request,env,user))}
 if(path==='/api/vouchers'||path.startsWith('/api/vouchers/'))return handleVouchers(request,env,await chosenHousehold(request,env,user),path);
 if(path==='/api/message-plan/extract'||path==='/api/message-plan/apply')return handleMessagePlan(request,env,await chosenHousehold(request,env,user),path.split('/').at(-1));
 if(path==='/api/google-calendar/callback')return googleCalendarCallback(request,env,user);
 if(path.startsWith('/api/home-suggestions/'))return handleHomeSuggestions(request,env,await chosenHousehold(request,env,user),path.split('/').at(-1));
 if(path==='/api/ai-history'||path.startsWith('/api/ai-history/'))return handleAIHistory(request,env,await chosenHousehold(request,env,user),path); // בית AI history (2026-11-10)
 if(path==='/api/voice'||path==='/api/voice/transcribe'){if(request.method==='POST')await limit(env,'voice-minute:'+user.id,{max:8});return handleVoice(request,env,await chosenHousehold(request,env,user),path)} // בית AI voice (2026-11-10)
 if(path==='/api/bayit-ai'||path.startsWith('/api/bayit-ai/'))return handleBayitAI(request,env,await chosenHousehold(request,env,user),path); // בית AI recommendations (2026-11-10)
 if(path.startsWith('/api/google-calendar/')){
  const action=path.split('/').at(-1);
  if(request.method==='POST'&&['connect','sharing','disconnect'].includes(action))await requireRecent(request,env,user);
  return handleGoogleCalendar(request,env,await chosenHousehold(request,env,user),action);
 }
 if(path.startsWith('/api/files/'))return handleFiles(request,env,await chosenHousehold(request,env,user),decodeURIComponent(path.slice('/api/files/'.length)));
 const match=path.match(/^\/api\/households\/([^/]+)\/(state|changes)$/);if(match){
 // The 5-second poll usually ends in 304: answer it from the membership and the revision alone, without loading and
 // parsing the whole household (CPU on the 10 ms tier, 2026-11-12). Same membership rule and message as household().
 if(match[2]==='state'&&request.method==='GET'&&request.headers.get('If-None-Match')){if(!await env.DB.prepare('SELECT 1 FROM memberships WHERE household_id=? AND user_id=?').bind(match[1],user.id).first())throw fail('This household is unavailable.',403);const current=await env.DB.prepare('SELECT revision FROM household_data WHERE household_id=?').bind(match[1]).first();if(current&&request.headers.get('If-None-Match')==='"'+current.revision+'"')return new Response(null,{status:304,headers:{ETag:'"'+current.revision+'"','Cache-Control':'private, no-store'}})}
 const home=await chosenHousehold(request,env,user,match[1]),actor=home.membership.member_id;if(match[2]==='state'&&request.method==='GET'){if(request.headers.get('If-None-Match')==='"'+home.revision+'"')return new Response(null,{status:304,headers:{ETag:'"'+home.revision+'"','Cache-Control':'private, no-store'}});return json({data:visibleState(home.state,actor),revision:home.revision,actorId:actor,role:home.membership.role})}if(match[2]==='changes'&&request.method==='POST'){const body=await bodyJSON(request,700000);if(await appliedOperation(env,home.id,actor,body.clientOpId))return json({data:visibleState(home.state,actor),revision:home.revision,actorId:actor,duplicate:true});if(body.baseRevision!==home.revision)throw fail('This household changed on another device. Refresh before retrying.',409);for(const op of body.changes||[]){if(['documents','receipts'].includes(op.collection)&&!op.delete&&op.value?.fileId){const old=(home.state[op.collection]||[]).find(d=>d.id===op.id);if(old?.fileId!==op.value.fileId){const file=await env.DB.prepare('SELECT owner_id FROM files WHERE id=? AND household_id=? AND deleting_at IS NULL').bind(op.value.fileId,home.id).first();if(file?.owner_id!==actor)throw fail('Upload your own file before attaching it.',403)}}}let next;try{next=applyChanges(home.state,body.changes,actor,home.membership.role)}catch(error){throw fail(error.message,/private|owner|parent|belong|assign|invitation|profile/i.test(error.message)?403:400)}const stored=JSON.stringify(next); // serialised once: CPU on the 10 ms tier (2026-11-12)
 const result=await commitOperation(env,env.DB.prepare('UPDATE household_data SET state=?,revision=revision+1 WHERE household_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM json_each(?, \'$.documents\') d WHERE json_extract(d.value,\'$.fileId\') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM files f WHERE f.id=json_extract(d.value,\'$.fileId\') AND f.household_id=? AND f.deleting_at IS NULL)) AND NOT EXISTS(SELECT 1 FROM json_each(?, \'$.receipts\') r WHERE json_extract(r.value,\'$.fileId\') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM files f WHERE f.id=json_extract(r.value,\'$.fileId\') AND f.household_id=? AND f.deleting_at IS NULL))').bind(stored,home.id,home.revision,stored,home.id,stored,home.id),{householdId:home.id,memberId:actor,opId:body.clientOpId,revision:home.revision+1});if(!result.meta.changes)throw fail('This household changed on another device. Refresh before retrying.',409);if(next.preferences.householdName!==home.state.preferences.householdName)await env.DB.prepare('UPDATE households SET name=? WHERE id=?').bind(next.preferences.householdName,home.id).run();await audit(env,{home:home.id,actor,action:'state.change'}).catch(()=>{});return json({data:visibleState(next,actor),revision:home.revision+1,actorId:actor})}}
 if(path.startsWith('/api/finance/')){const home=await chosenHousehold(request,env,user);return ['GET','HEAD'].includes(request.method)?handleFinanceAPI(request,env,home,path,url):audited(env,{home:home.id,actor:user.id,action:'finance.'+path.split('/')[3]},()=>request.headers.get('Content-Type')?.startsWith('application/pdf')&&home.membership.role!=='child'?withPDFSlot(env,()=>handleFinanceAPI(request,env,home,path,url)):handleFinanceAPI(request,env,home,path,url))}
 {const channel=channelForAPI(path);if(channel){const home=await chosenHousehold(request,env,user);return ['GET','HEAD'].includes(request.method)?channel.api(request,env,user,home,path,url):audited(env,{home:home.id,actor:user.id,action:channel.id+'.'+path.split('/')[3]},()=>channel.api(request,env,user,home,path,url))}}
 if(path.startsWith('/api/maps/')){const home=await chosenHousehold(request,env,user,path.endsWith('/embed')?url.searchParams.get('householdId'):undefined);return ['GET','HEAD'].includes(request.method)?handleMapsAPI(request,env,home,path,url):audited(env,{home:home.id,actor:user.id,action:'maps.credentials'},()=>handleMapsAPI(request,env,home,path,url))}
 if(path.startsWith('/api/kids-parent/'))return handleKidsParent(request,env,user,await chosenHousehold(request,env,user),path,url);
 if(path.startsWith('/api/push/'))return handlePushAPI(request,env,user,await chosenHousehold(request,env,user),path);
 // AI usage, credit and runway (parents only). Outside /api/ai/ so saving the credit does not count as an AI request.
 if(/^\/api\/ai-usage(\/(credit|prices))?$/.test(path)){const home=await chosenHousehold(request,env,user);return ['GET','HEAD'].includes(request.method)?handleAIUsage(request,env,home,path):audited(env,{home:home.id,actor:user.id,action:'ai.preferences'},()=>handleAIUsage(request,env,home,path))}
 if(path.startsWith('/api/ai/')){const home=await chosenHousehold(request,env,user);return ['GET','HEAD'].includes(request.method)?handleAI(request,env,user,home,path):audited(env,{home:home.id,actor:user.id,action:'ai.'+path.split('/')[3]},()=>handleAI(request,env,user,home,path))}
 {const m=path.match(MODULE_DATA_PATH);if(m)return handleModuleData(request,env,user,await chosenHousehold(request,env,user,m[1]),m)} // feature-module data kept, download, delete (feature-module-data.mjs)
 throw fail('Unknown endpoint.',404);
}
export default {async fetch(request,env){let response,errorRetryAt=null;try{response=await handle(request,env)}catch(error){if(error.code==='RISEUP_RETRY_LATER'&&Number.isFinite(error.retryAt))errorRetryAt=error.retryAt;response=json({error:error.status?error.message:'The server could not complete this request. No changes were confirmed.',...(error.code?{code:error.code}:{}),...(error.code==='RISEUP_RETRY_LATER'&&Number.isFinite(error.retryAt)?{retryAt:error.retryAt}:{})},error.status||500)}const headers=securityHeaders(new Headers(response.headers),new URL(request.url));if(errorRetryAt)headers.set('Retry-After',String(Math.max(1,Math.ceil((errorRetryAt-Date.now())/1000))));return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}};

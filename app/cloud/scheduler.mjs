// The once-a-minute tick (Cloudflare cron Worker reminder-cron.mjs, or the Docker host's built-in timer).
// Moved unchanged from telegram.mjs (Modular Bayit 2.3): it delivers every messaging channel (channels.mjs), then
// Push and the other due jobs. Only the scheduler secret may start it, and a lease keeps two ticks from overlapping.
import {json,hash,sameDigest} from './util.mjs';
import {lease,maintenance} from './security.mjs';
import {deliverChannelReminders} from './channels.mjs';
import {deliverPush} from './push.mjs';
import {refreshDueConnections} from './riseup.mjs';
import {syncDueGoogleCalendar} from './google-calendar.mjs';
import {generateDueSuggestions} from './home-suggestions.mjs';
import {runDueBayitAI} from './bayit-ai.mjs';

export async function runReminderTick(request,env){
 const supplied=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!env.REMINDER_CRON_SECRET||!supplied||!sameDigest(await hash(supplied),await hash(env.REMINDER_CRON_SECRET)))return json({error:'Unauthorized.'},401);
 const release=await lease(env,'reminder-tick');if(!release)return json({ok:true,skipped:'another tick is running'});
 try{await maintenance(env);const deadline=Date.now()+45000,result=await deliverChannelReminders(env,new Date(),{deadline,origin:new URL(request.url).origin});
 try{result.push=await deliverPush(env,new Date(),{deadline})}catch{result.push={failed:1}}
 // The same minute tick refreshes each optional finance connection (RiseUp) about once an hour.
 try{result.financeSynced=Date.now()<deadline?await refreshDueConnections(env,new Date(),1):0}catch{result.financeSynced=0}
 try{result.calendarSynced=await syncDueGoogleCalendar(env,deadline)}catch{result.calendarSynced=0}
 try{result.suggestionsPrepared=await generateDueSuggestions(env,deadline)}catch{result.suggestionsPrepared=0}
 try{result.bayitAI=Date.now()<deadline?await runDueBayitAI(env,deadline):0}catch{result.bayitAI=0}
 return json(result);}finally{await release()}
}

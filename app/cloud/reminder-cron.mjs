// Companion Worker: Cloudflare Pages cannot run on a schedule, so this Worker wakes once a minute
// and asks the Pages app to deliver due reminders. It holds no household data or bot tokens;
// it only knows the app origin and the shared REMINDER_CRON_SECRET.
async function tick(env){
 if(!env.BAYIT_ORIGIN||!env.REMINDER_CRON_SECRET){console.error('Bayit reminders: BAYIT_ORIGIN or REMINDER_CRON_SECRET is missing.');return}
 const response=await fetch(new URL('/api/internal/reminders',env.BAYIT_ORIGIN),{method:'POST',headers:{Authorization:'Bearer '+env.REMINDER_CRON_SECRET},signal:AbortSignal.timeout(25000)});
 if(!response.ok)console.error('Bayit reminders: tick failed with',response.status);
}
export default {
 scheduled(controller,env,ctx){ctx.waitUntil(tick(env))},
 fetch(){return new Response('Not found',{status:404})}
};

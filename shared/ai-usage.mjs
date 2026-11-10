// AI usage, spend and credit runway for Settings › Accounts & connections (parents only).
// Pure functions shared by the server (app/cloud/ai-usage.mjs), the settings panel and the tests.
// Amounts are integer micro-dollars (US$ × 1,000,000). Everything here is an ESTIMATE of Bayit's own use, built from
// the token counts each provider returned and shared/ai-pricing.mjs; the provider's billing page is the real balance.

// What a call was for. Unknown values are stored as 'other'.
export const AI_FEATURES=['assistant','telegram','document','insurance','finance','providers','recommendations','other'];
export const aiFeature=v=>AI_FEATURES.includes(v)?v:'other';

// Fewer tracked days than this and the average daily spend (and so the runway) is not shown.
export const MIN_RUNWAY_DAYS=7;
export const WINDOW_DAYS=30;

const DAY=86400000;
const isDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'));
export const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
export const daysBetween=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/DAY);
const int=v=>Number.isFinite(+v)?Math.round(+v):0;

// First local day the usage query needs: the earlier of the 30-day window and the start of this month.
export function usageWindowStart(today){const windowStart=addDays(today,-(WINDOW_DAYS-1)),month=today.slice(0,8)+'01';return month<windowStart?month:windowStart}

// Validates a parent's credit entry. Returns {amountMicros,since} or throws an Error with a user-facing message.
export function parseCreditInput(body,today,providers=[]){
 const provider=String(body?.provider||'');
 if(!providers.includes(provider))throw new Error('Choose the AI provider this credit belongs to.');
 const amount=typeof body?.amountUsd==='string'?Number(body.amountUsd.replace(',','.')):Number(body?.amountUsd);
 if(!Number.isFinite(amount)||amount<0||amount>100000)throw new Error('Enter the credit in US dollars, between 0 and 100,000.');
 const since=String(body?.since||'');
 if(!isDay(since))throw new Error('Choose the date you checked the balance.');
 if(since>today)throw new Error('The balance date cannot be in the future.');
 if(since<'2020-01-01')throw new Error('Choose a more recent balance date.');
 return {provider,amountMicros:Math.round(amount*1e6),since};
}

// rows: grouped ledger rows {day,memberId,feature,provider,model,calls,inputTokens,outputTokens,cacheReadTokens,
//   cacheWriteTokens,costMicros (priced calls only),unpricedCalls}, covering at least usageWindowStart(today).
// credits: [{provider,amountMicros,since,updatedAt}], one per provider account a parent entered.
// sinceCredit: {[provider]:{costMicros,unpricedCalls,calls}} for that provider's calls on or after its credit date.
// firstDay: the household's first recorded call; firstDays: {[provider]:first call with that provider}.
// currentProvider: the provider connected now; its credit is `balance`, every credit is in `balances`.
const trackedFrom=(first,windowStart,today)=>first&&isDay(first)&&first<=today?Math.min(WINDOW_DAYS,daysBetween(first>windowStart?first:windowStart,today)+1):0;
export function aiUsageSummary({rows=[],credits=[],sinceCredit={},firstDay=null,firstDays={},currentProvider=null,today}){
 const windowStart=addDays(today,-(WINDOW_DAYS-1)),monthStart=today.slice(0,8)+'01';
 const blank=()=>({costMicros:0,calls:0,unpricedCalls:0,tokens:0});
 const add=(t,r)=>{t.costMicros+=int(r.costMicros);t.calls+=int(r.calls);t.unpricedCalls+=int(r.unpricedCalls);t.tokens+=int(r.inputTokens)+int(r.outputTokens)+int(r.cacheReadTokens)+int(r.cacheWriteTokens);return t};
 const group=(map,key,seed)=>map.get(key)||map.set(key,{...seed,...blank()}).get(key);
 const month=blank(),window=blank(),daily=new Map(),people=new Map(),features=new Map(),models=new Map(),providers=new Map();
 for(let i=0;i<WINDOW_DAYS;i++)daily.set(addDays(windowStart,i),blank());
 for(const r of rows){
  if(!isDay(r.day)||r.day>today)continue;
  if(r.day>=monthStart)add(month,r);
  if(r.day<windowStart)continue;
  add(window,r);add(daily.get(r.day),r);
  const provider=String(r.provider||''),model=String(r.model||'');
  add(group(people,String(r.memberId||''),{memberId:String(r.memberId||'')}),r);
  add(group(features,aiFeature(r.feature),{feature:aiFeature(r.feature)}),r);
  add(group(providers,provider,{provider}),r);
  const m=group(models,provider+'|'+model,{provider,model,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0});
  add(m,r);m.inputTokens+=int(r.inputTokens);m.outputTokens+=int(r.outputTokens);m.cacheReadTokens+=int(r.cacheReadTokens);m.cacheWriteTokens+=int(r.cacheWriteTokens);
 }
 const byCost=(a,b)=>b.costMicros-a.costMicros||b.calls-a.calls;
 // Days the ledger has been recording, inside the 30-day window. The average uses only those days, so a household that
 // started tracking last week is not averaged over 30.
 const trackedDays=trackedFrom(firstDay,windowStart,today),enoughData=trackedDays>=MIN_RUNWAY_DAYS;
 const averageDailyMicros=enoughData?Math.round(window.costMicros/trackedDays):null;
 // Each provider account has its own credit, spend and runway (a household may switch providers or models).
 const balances=credits.filter(c=>c&&isDay(c.since)&&c.provider).map(credit=>{
  const spent=int(sinceCredit[credit.provider]?.costMicros),remaining=int(credit.amountMicros)-spent,days=trackedFrom(firstDays[credit.provider],windowStart,today),enough=days>=MIN_RUNWAY_DAYS;
  const avg=enough?Math.round((providers.get(credit.provider)?.costMicros||0)/days):null;
  const runwayDays=remaining<=0?0:!enough||!avg?null:Math.floor(remaining/avg);
  return {provider:credit.provider,amountMicros:int(credit.amountMicros),since:credit.since,updatedAt:credit.updatedAt||null,spentMicros:spent,remainingMicros:remaining,unpricedCalls:int(sinceCredit[credit.provider]?.unpricedCalls),calls:int(sinceCredit[credit.provider]?.calls),trackedDays:days,enoughData:enough,averageDailyMicros:avg,runwayDays,runoutDay:runwayDays>0?addDays(today,runwayDays):null,noRecentSpend:enough&&remaining>0&&!avg};
 }).sort((a,b)=>(b.provider===currentProvider)-(a.provider===currentProvider)||a.provider.localeCompare(b.provider));
 return {
  today,windowStart,monthStart,month,window,
  daily:[...daily].map(([date,t])=>({date,costMicros:t.costMicros,calls:t.calls,unpricedCalls:t.unpricedCalls})),
  byPerson:[...people.values()].sort(byCost),byFeature:[...features.values()].sort(byCost),byModel:[...models.values()].sort(byCost),byProvider:[...providers.values()].sort(byCost),
  firstDay:firstDay||null,trackedDays,enoughData,averageDailyMicros,
  balances,balance:balances.find(b=>b.provider===currentProvider)||null
 };
}

// Money for display: dollars with cents, and a few more digits for amounts under a dollar (AI calls are cheap).
// One format in both languages ("$0.274"), as provider billing pages show it; Hebrew text wraps it in an LTR isolate.
const USD_DIGITS=[2,3,4].map(d=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:d,maximumFractionDigits:d}));
export function formatUSD(micros){
 const dollars=int(micros)/1e6,abs=Math.abs(dollars);
 return USD_DIGITS[abs===0||abs>=1?0:abs<0.01?2:1].format(dollars);
}
// A price per million tokens: "$0.10", "$0.125", "$2.50".
export const formatRate=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:3}).format(+v||0);

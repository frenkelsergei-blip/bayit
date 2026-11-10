// AI usage ledger: records every AI provider call that returned tokens (any provider: Claude, OpenAI/Codex, Gemini,
// Grok or a custom OpenAI-compatible endpoint), and serves the parents-only usage, prices, credit and runway
// (Settings › Accounts & connections). Never stores prompt or answer text.
// Deploy order: until migration 0012_ai_calls.sql is applied, recording is skipped silently and the summary reports
// that tracking is not ready. The daily request limit (ai_usage) is unchanged and lives with each feature.
import {generate} from './ai-providers.mjs';
import {bodyJSON,fail,json,localDate} from './util.mjs';
import {aiCallPricing,resolvePrice,parsePriceInput,normalizeModel,PRICES_CHECKED} from '../../shared/ai-pricing.mjs';
import {aiFeature,aiUsageSummary,usageWindowStart,parseCreditInput} from '../../shared/ai-usage.mjs';
import {AI_PROVIDER} from '../../shared/ai-providers.mjs';

const tokens=v=>Number.isFinite(+v)&&+v>0?Math.round(+v):0;
const PROVIDERS=Object.keys(AI_PROVIDER);
const overrideRow=r=>({id:r.id,provider:r.provider,model:r.model,input:r.input_per_m,output:r.output_per_m,cacheRead:r.cache_read_per_m,cacheWrite:r.cache_write_per_m,active:!!r.active,effectiveFrom:r.effective_from,createdAt:r.created_at,createdBy:r.created_by});
async function overridesFor(env,householdId,provider,model){
 const sql='SELECT * FROM ai_price_overrides WHERE household_id=?'+(provider?' AND provider=? AND model=?':'')+' ORDER BY effective_from,id';
 return ((await env.DB.prepare(sql).bind(...(provider?[householdId,provider,normalizeModel(model)]:[householdId])).all()).results||[]).map(overrideRow);
}

// Records one call. Failures (missing table during a deploy, a busy database) never break the AI feature itself.
export async function recordAICall(env,{householdId,memberId,feature,provider,model,usage,ok=true,now=new Date()}){
 const u={inputTokens:tokens(usage?.inputTokens),outputTokens:tokens(usage?.outputTokens),cacheReadTokens:tokens(usage?.cacheReadTokens),cacheWriteTokens:tokens(usage?.cacheWriteTokens)};
 if(!householdId||!memberId||!env?.DB?.prepare||!(u.inputTokens+u.outputTokens+u.cacheReadTokens+u.cacheWriteTokens))return false;
 try{
  const day=localDate(now),overrides=await overridesFor(env,householdId,provider,model).catch(()=>[]);
  const {costMicros,priceVersion}=aiCallPricing({provider,model,day,overrides,...u});
  await env.DB.prepare('INSERT INTO ai_calls(household_id,member_id,ts,day,feature,provider,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_micros,price_version,ok) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(householdId,memberId,now.toISOString(),day,aiFeature(feature),String(provider||'').slice(0,40),String(model||'').slice(0,200),u.inputTokens,u.outputTokens,u.cacheReadTokens,u.cacheWriteTokens,costMicros,priceVersion,ok?1:0).run();
  return true;
 }catch{return false}
}

// Every AI feature calls the provider through this: it records the billed tokens as soon as the provider answers,
// before the feature checks the reply, so a reply the app later refuses (truncated, unreadable) is still counted.
// meta: {householdId,memberId,feature}; request: the generate() request including provider/model/key.
export async function trackedGenerate(env,meta,request){
 const base={...meta,provider:request.provider,model:request.model};
 let result;
 try{result=await generate(env,request)}
 catch(error){if(error?.usage)await recordAICall(env,{...base,usage:error.usage,ok:false});throw error}
 await recordAICall(env,{...base,usage:result.usage,ok:!result.truncated});
 return result;
}

const parentOnly=home=>{if(home.membership.role!=='parent')throw fail('Only parents can see AI usage, prices and credit.',403)};
const SUMS='COUNT(*) AS calls,SUM(input_tokens) AS inputTokens,SUM(output_tokens) AS outputTokens,SUM(cache_read_tokens) AS cacheReadTokens,SUM(cache_write_tokens) AS cacheWriteTokens,SUM(COALESCE(cost_micros,0)) AS costMicros,SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END) AS unpricedCalls';

// Price hints from the connected provider's own model list (OpenRouter-style /models). Only a suggestion for the
// parent's price form; never applied on its own and never replaces a parent's price.
function hintsFrom(secret){try{return Object.fromEntries(JSON.parse(secret?.models||'[]').filter(m=>m.pricing).map(m=>[normalizeModel(m.id),m.pricing]))}catch{return {}}}

export async function aiUsageFor(env,home,today=localDate()){
 const db=env.DB;let rows,firstDay,firstDays,credits,sinceCredit={},recent,models,overrides;
 try{
  rows=(await db.prepare('SELECT day,member_id AS memberId,feature,provider,model,'+SUMS+' FROM ai_calls WHERE household_id=? AND day>=? GROUP BY day,member_id,feature,provider,model').bind(home.id,usageWindowStart(today)).all()).results||[];
  const firsts=(await db.prepare('SELECT provider,MIN(day) AS day FROM ai_calls WHERE household_id=? GROUP BY provider').bind(home.id).all()).results||[];
  firstDays=Object.fromEntries(firsts.map(r=>[r.provider,r.day]));firstDay=firsts.map(r=>r.day).sort()[0]||null;
  credits=((await db.prepare('SELECT provider,amount_micros,since,updated_at FROM ai_credit WHERE household_id=?').bind(home.id).all()).results||[]).map(c=>({provider:c.provider,amountMicros:c.amount_micros,since:c.since,updatedAt:c.updated_at}));
  for(const c of credits)sinceCredit[c.provider]=await db.prepare('SELECT COUNT(*) AS calls,SUM(COALESCE(cost_micros,0)) AS costMicros,SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END) AS unpricedCalls FROM ai_calls WHERE household_id=? AND provider=? AND day>=?').bind(home.id,c.provider,c.since).first();
  recent=((await db.prepare('SELECT id,ts,member_id,feature,provider,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_micros,price_version,ok FROM ai_calls WHERE household_id=? ORDER BY id DESC LIMIT 20').bind(home.id).all()).results||[])
   .map(r=>({id:r.id,ts:r.ts,memberId:r.member_id,feature:r.feature,provider:r.provider,model:r.model,inputTokens:r.input_tokens,outputTokens:r.output_tokens,cacheReadTokens:r.cache_read_tokens,cacheWriteTokens:r.cache_write_tokens,costMicros:r.cost_micros,priceVersion:r.price_version,ok:!!r.ok}));
  models=(await db.prepare('SELECT provider,model,COUNT(*) AS calls,SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END) AS unpricedCalls,MIN(CASE WHEN cost_micros IS NULL THEN day END) AS firstUnpricedDay,MAX(day) AS lastDay FROM ai_calls WHERE household_id=? GROUP BY provider,model ORDER BY lastDay DESC LIMIT 40').bind(home.id).all()).results||[];
  overrides=await overridesFor(env,home.id);
 }catch{return {ready:false,today}}
 const secret=await db.prepare('SELECT provider,model,models FROM household_secrets WHERE household_id=?').bind(home.id).first().catch(()=>null);
 const provider=secret?.provider||null,hints=hintsFrom(secret);
 if(provider&&secret?.model&&!models.some(m=>m.provider===provider&&normalizeModel(m.model)===normalizeModel(secret.model)))models.unshift({provider,model:secret.model,calls:0,unpricedCalls:0,firstUnpricedDay:null,lastDay:null});
 // Each model's price today, its household price history and a provider hint for the price form.
 const prices=models.map(m=>{const now=resolvePrice({provider:m.provider,model:m.model,day:today,overrides});return {...m,current:now?{source:now.source,version:now.version,...now.rates}:null,history:overrides.filter(o=>o.provider===m.provider&&o.model===normalizeModel(m.model)),hint:m.provider===provider?hints[normalizeModel(m.model)]||null:null}});
 return {ready:true,...aiUsageSummary({rows,credits,sinceCredit,firstDay,firstDays,currentProvider:provider,today}),recent,models:prices,pricesChecked:PRICES_CHECKED,provider,model:secret?.model||null,billingUrls:Object.fromEntries(PROVIDERS.map(id=>[id,AI_PROVIDER[id].billingUrl||null]))};
}

// Prices the calls of one provider/model that were recorded WITHOUT a price, on or after `from`, with the prices now
// in effect for their day. Calls that already have a cost are never changed.
async function priceUnpricedCalls(env,householdId,provider,model,from){
 const overrides=await overridesFor(env,householdId,provider,model);
 const rows=(await env.DB.prepare('SELECT id,day,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens FROM ai_calls WHERE household_id=? AND provider=? AND lower(model)=? AND day>=? AND cost_micros IS NULL ORDER BY id LIMIT 5000').bind(householdId,provider,model,from).all()).results||[];
 const updates=rows.map(r=>({id:r.id,...aiCallPricing({provider,model,day:r.day,overrides,inputTokens:r.input_tokens,outputTokens:r.output_tokens,cacheReadTokens:r.cache_read_tokens,cacheWriteTokens:r.cache_write_tokens})})).filter(u=>u.costMicros!==null);
 for(let i=0;i<updates.length;i+=200)await env.DB.batch(updates.slice(i,i+200).map(u=>env.DB.prepare('UPDATE ai_calls SET cost_micros=?,price_version=? WHERE id=? AND household_id=? AND cost_micros IS NULL').bind(u.costMicros,u.priceVersion,u.id,householdId)));
 return updates.length;
}

// GET /api/ai-usage: summary. PUT/DELETE /api/ai-usage/credit {provider,amountUsd,since}: one provider's credit.
// POST /api/ai-usage/prices {provider,model,input,output,cacheRead?,cacheWrite?,effectiveFrom,active?,priceUnpriced?}:
// a new version of the household's own price for a model. Parents only.
export async function handleAIUsage(request,env,home,path='/api/ai-usage'){
 parentOnly(home);
 const today=localDate(),action=path.replace(/^\/api\/ai-usage\/?/,''),actor=home.membership.member_id;
 if(!action&&(request.method==='GET'||request.method==='HEAD'))return json(await aiUsageFor(env,home,today));
 if(action==='credit'&&request.method==='PUT'){
  let credit;try{credit=parseCreditInput(await bodyJSON(request,2000),today,PROVIDERS)}catch(error){if(error.status)throw error;throw fail(error.message)}
  try{await env.DB.prepare('INSERT INTO ai_credit(household_id,provider,amount_micros,since,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(household_id,provider) DO UPDATE SET amount_micros=excluded.amount_micros,since=excluded.since,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(home.id,credit.provider,credit.amountMicros,credit.since,new Date().toISOString(),actor).run()}
  catch{throw fail('The installation owner must finish the database update before credit can be saved. Nothing was saved.',503)}
  return json(await aiUsageFor(env,home,today));
 }
 if(action==='credit'&&request.method==='DELETE'){
  const provider=String((await bodyJSON(request,500)).provider||'');if(!PROVIDERS.includes(provider))throw fail('Choose the AI provider.');
  try{await env.DB.prepare('DELETE FROM ai_credit WHERE household_id=? AND provider=?').bind(home.id,provider).run()}catch{throw fail('The credit could not be removed. Try again.',503)}
  return json(await aiUsageFor(env,home,today));
 }
 if(action==='prices'&&request.method==='POST'){
  const body=await bodyJSON(request,3000);let price;
  try{price=parsePriceInput(body,today);if(!PROVIDERS.includes(price.provider))throw new Error('Choose the AI provider.')}catch(error){if(error.status)throw error;throw fail(error.message)}
  try{await env.DB.prepare('INSERT INTO ai_price_overrides(household_id,provider,model,input_per_m,output_per_m,cache_read_per_m,cache_write_per_m,active,effective_from,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(home.id,price.provider,price.model,price.input,price.output,price.cacheRead,price.cacheWrite,price.active?1:0,price.effectiveFrom,new Date().toISOString(),actor).run()}
  catch{throw fail('The installation owner must finish the database update before prices can be saved. Nothing was saved.',503)}
  // Only by the parent's explicit choice, and only calls that have no cost yet.
  const priced=body.priceUnpriced===true&&price.active?await priceUnpricedCalls(env,home.id,price.provider,price.model,price.effectiveFrom):0;
  return json({...await aiUsageFor(env,home,today),priced});
 }
 throw fail('Method not allowed.',405);
}

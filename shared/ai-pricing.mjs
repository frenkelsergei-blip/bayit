// AI provider prices for Bayit's usage estimate: US$ per 1 million tokens, standard (non-batch) tier.
// Checked on the providers' own pricing pages on PRICES_CHECKED; update the date with every change:
//   Anthropic  https://platform.claude.com/docs/en/about-claude/pricing
//   OpenAI     https://developers.openai.com/api/docs/pricing
//   Gemini     https://aistudio.google.com/docs/pricing
//   xAI        https://docs.x.ai/docs/models
// A model that is not listed here (and every custom endpoint, whose prices we cannot know) shows tokens only. Never
// guess a price. cacheWrite is the shortest cache-write price (Anthropic 5 minutes, OpenAI 30 minutes); null where the
// provider has none. Cost is computed once, when the call is recorded, so later price changes do not rewrite history.
//
// tiers: a higher price for the WHOLE request once its prompt (input + cache reads + cache writes) is over `over`
// tokens, as each provider's page describes it (xAI: "reaches 200k", so over 199,999).
// changes: a price that takes effect on a known future date (UTC day), e.g. announced Gemini increases.
export const PRICES_CHECKED='2026-11-09';

const p=(input,output,cacheRead=null,cacheWrite=null,extra={})=>({input,output,cacheRead,cacheWrite,...extra});
const over=(tokens,input,output,cacheRead=null,cacheWrite=null)=>({over:tokens,input,output,cacheRead,cacheWrite});

export const AI_PRICES={
 anthropic:{
  'claude-fable-5-1':p(10,50,0.25,12.5),
  'claude-opus-5-5':p(4,20,0.2,5),
  'claude-sonnet-5-5':p(2,10,0.1,2.5),
  'claude-haiku-5-5':p(0.1,0.5,0.01,0.125,{tiers:[over(100000,0.5,2.5,0.05,0.625)]}),
  'claude-fable-5':p(10,50,1,12.5),
  'claude-opus-5':p(5,25,0.5,6.25),
  'claude-opus-4-8':p(5,25,0.5,6.25),
  'claude-opus-4-7':p(5,25,0.5,6.25),
  'claude-opus-4-6':p(5,25,0.5,6.25),
  'claude-opus-4-5':p(5,25,0.5,6.25),
  'claude-sonnet-5':p(2,10,0.2,2.5),
  'claude-sonnet-4-6':p(3,15,0.3,3.75),
  'claude-sonnet-4-5':p(3,15,0.3,3.75),
  'claude-haiku-4-5':p(1,5,0.1,1.25)
 },
 openai:{
  'gpt-6-astra':p(10,50,1,12.5,{tiers:[over(272000,20,75,2,25)]}),
  'gpt-6.1-sol':p(2,10,0.1,2.5,{tiers:[over(272000,4,15,0.2,5)]}),
  'gpt-6.1-terra':p(1,5,0.05,1.25,{tiers:[over(272000,2,7.5,0.1,2.5)]}),
  'gpt-6-sol':p(2,10,0.2,2.5,{tiers:[over(272000,4,15,0.4,5)]}),
  'gpt-6-luna':p(0.1,0.5,0.01,0.125,{tiers:[over(272000,0.2,0.75,0.02,0.25)]}),
  'gpt-5.6-sol':p(4,20,0.4,5,{tiers:[over(272000,8,30,0.8,10)]}),
  'gpt-5.6-terra':p(2,12,0.2,2.5,{tiers:[over(272000,4,18,0.4,5)]}),
  'gpt-5.6-luna':p(0.2,1.2,0.02,0.25,{tiers:[over(272000,0.4,1.8,0.04,0.5)]}),
  'gpt-5.5':p(5,30,0.5,null,{tiers:[over(272000,10,45,1)]}),
  'gpt-5.5-pro':p(30,180,null,null,{tiers:[over(272000,60,270)]}),
  'gpt-5.4':p(2.5,15,0.25,null,{tiers:[over(272000,5,22.5,0.5)]}),
  'gpt-5.4-pro':p(30,180,null,null,{tiers:[over(272000,60,270)]}),
  'gpt-5.4-mini':p(0.75,4.5,0.075),
  'gpt-5.4-nano':p(0.2,1.25,0.02),
  'gpt-5.3-codex':p(1.75,14,0.175),
  'gpt-5.2':p(1.75,14,0.175),
  'gpt-5.2-pro':p(21,168),
  'gpt-5.1':p(1.25,10,0.125),
  'gpt-5':p(1.25,10,0.125),
  'gpt-5-mini':p(0.25,2,0.025),
  'gpt-5-nano':p(0.05,0.4,0.005),
  'gpt-5-pro':p(15,120),
  'gpt-4.1':p(2,8,0.5),
  'gpt-4.1-mini':p(0.4,1.6,0.1),
  'gpt-4o':p(2.5,10,1.25),
  'gpt-4o-mini':p(0.15,0.6,0.075),
  'gpt-4o-mini-transcribe':p(1.25,5), // voice messages (app/cloud/speech-household-ai.mjs); checked 2026-11-10
  'o3':p(2,8,0.5),
  'o3-pro':p(20,80)
 },
 gemini:{
  'gemini-4-argon':p(2,10,0.1,null,{changes:[{from:'2026-12-01',...p(4,20,0.2)}]}),
  'gemini-3.8-flash':p(0.75,3.75,0.075,null,{changes:[{from:'2027-01-01',...p(1.5,7.5,0.15)}]}),
  'gemini-3.6-flash':p(0.75,3.75,0.075,null,{changes:[{from:'2027-01-01',...p(1.5,7.5,0.15)}]}),
  'gemini-3.5-flash-lite':p(0.3,2.5,0.03),
  'gemini-3.1-flash-lite':p(0.25,1.5,0.025),
  'gemini-3-flash-preview':p(0.5,3,0.05),
  'gemini-3.1-pro-preview':p(2,12,0.2,null,{tiers:[over(200000,4,18,0.4)]}),
  'gemini-3.1-pro-preview-customtools':p(2,12,0.2,null,{tiers:[over(200000,4,18,0.4)]}),
  'gemini-2.5-pro':p(1.25,10,0.125,null,{tiers:[over(200000,2.5,15,0.25)]}),
  'gemini-2.5-flash':p(0.3,2.5,0.03),
  'gemini-2.5-flash-lite':p(0.1,0.4,0.01)
 },
 xai:{
  'grok-4.7':p(2,6,0.5,null,{tiers:[over(199999,4,12,1)]}),
  'grok-4.6':p(2,6,0.5,null,{tiers:[over(199999,4,12,1)]}),
  'grok-4.5':p(2,6,0.3,null,{tiers:[over(199999,4,12,0.6)]}),
  'grok-4.3':p(1.25,2.5,0.2,null,{tiers:[over(199999,2.5,5,0.4)]}),
  'grok-4.20-0309-reasoning':p(1.25,2.5,0.2,null,{tiers:[over(199999,2.5,5,0.4)]}),
  'grok-4.20-0309-non-reasoning':p(1.25,2.5,0.2,null,{tiers:[over(199999,2.5,5,0.4)]}),
  'grok-4.20-multi-agent-0309':p(1.25,2.5,0.2,null,{tiers:[over(199999,2.5,5,0.4)]}),
  'grok-build-0.1':p(1,2,0.2,null,{tiers:[over(199999,2,4,0.4)]})
 }
};

// A listed id, or a listed id followed by a release date or "-latest" (claude-haiku-4-5-20251001, gpt-5.5-2026-04-23,
// grok-4.7-latest). Any other suffix (e.g. -mini, -preview-05-20) is a different model and stays unknown.
const SUFFIX=/^-(\d{8}|\d{4}-\d{2}-\d{2}|latest)$/;
export function priceFor(provider,model){
 const table=AI_PRICES[provider];if(!table||typeof model!=='string')return null;
 const id=normalizeModel(model);if(!id)return null;
 if(Object.hasOwn(table,id))return {id,...table[id]};
 const base=Object.keys(table).filter(k=>id.startsWith(k)&&SUFFIX.test(id.slice(k.length))).sort((a,b)=>b.length-a.length)[0];
 return base?{id:base,...table[base]}:null;
}

// The rates that applied on `day` (YYYY-MM-DD, UTC) for a prompt of `promptTokens`.
export function ratesFor(price,{day,promptTokens=0}={}){
 let rates=price;for(const c of price.changes||[])if(day&&day>=c.from)rates={...rates,...c,tiers:c.tiers||rates.tiers};
 const tier=(rates.tiers||[]).filter(t=>promptTokens>t.over).sort((a,b)=>b.over-a.over)[0];
 return tier?{...rates,...tier}:rates;
}

// Tokens × rates (US$ per million) = integer micro-dollars. A cache price the provider does not list is billed at the
// normal input rate rather than as free.
function costOf(r,{input,output,read,write}){return Math.round(input*r.input+output*r.output+read*(r.cacheRead??r.input)+write*(r.cacheWrite??r.input))}
const tokenCounts=({inputTokens=0,outputTokens=0,cacheReadTokens=0,cacheWriteTokens=0})=>{const n=v=>Number.isFinite(+v)&&+v>0?+v:0;return {input:n(inputTokens),output:n(outputTokens),read:n(cacheReadTokens),write:n(cacheWriteTokens)}};
export const normalizeModel=model=>String(model||'').trim().toLowerCase().replace(/^models\//,'');

// Which price applies to a call on `day`, and its version, so a later price change never rewrites recorded spend:
// 1. a parent's own price for this provider and model (Settings › AI), the latest version in effect on that day;
//    a parent can also stop using their price (active:false), which brings back Bayit's list from that day;
// 2. Bayit's shipped list (version "bayit:<date checked or date of an announced change>").
// Returns {rates,version,source:'household'|'bayit'} or null (unknown: tokens only).
export function resolvePrice({provider,model,day=new Date().toISOString().slice(0,10),overrides=[],promptTokens=0}){
 const id=normalizeModel(model);
 const own=overrides.filter(o=>o.provider===provider&&normalizeModel(o.model)===id&&o.effectiveFrom<=day)
  .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||String(b.createdAt||'').localeCompare(String(a.createdAt||''))||(+b.id||0)-(+a.id||0))[0];
 if(own&&own.active!==false)return {rates:{input:+own.input,output:+own.output,cacheRead:own.cacheRead??null,cacheWrite:own.cacheWrite??null},version:'household:'+own.id,source:'household'};
 const price=priceFor(provider,model);if(!price)return null;
 const changed=(price.changes||[]).filter(c=>day>=c.from).map(c=>c.from).sort().at(-1);
 return {rates:ratesFor(price,{day,promptTokens}),version:'bayit:'+(changed||PRICES_CHECKED),source:'bayit'};
}

// Cost of one call: {costMicros,priceVersion,priceSource}; costMicros null when no price is known.
export function aiCallPricing({provider,model,day=new Date().toISOString().slice(0,10),overrides=[],...usage}){
 const t=tokenCounts(usage),resolved=resolvePrice({provider,model,day,overrides,promptTokens:t.input+t.read+t.write});
 return resolved?{costMicros:costOf(resolved.rates,t),priceVersion:resolved.version,priceSource:resolved.source}:{costMicros:null,priceVersion:null,priceSource:null};
}

// Cost in micro-dollars from Bayit's shipped list only, or null when the model is not listed.
export function aiCallCost({provider,model,day=new Date().toISOString().slice(0,10),...usage}){return aiCallPricing({provider,model,day,...usage}).costMicros}

// Validates a parent's own price (US$ per million tokens). Throws an Error with a user-facing message.
export function parsePriceInput(body,today){
 const num=(v,label,optional)=>{if(optional&&(v===undefined||v===null||v===''))return null;const n=typeof v==='string'?Number(v.replace(',','.')):Number(v);if(!Number.isFinite(n)||n<0||n>10000)throw new Error('Enter the '+label+' price in US$ per million tokens, between 0 and 10,000.');return n};
 const provider=String(body?.provider||''),model=normalizeModel(body?.model);
 if(!/^[a-z0-9-]{2,40}$/.test(provider))throw new Error('Choose the AI provider.');
 if(!model||model.length>200)throw new Error('Choose the model.');
 const effectiveFrom=String(body?.effectiveFrom||today);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||Number.isNaN(Date.parse(effectiveFrom+'T12:00:00Z')))throw new Error('Choose the date this price applies from.');
 if(effectiveFrom>today)throw new Error('The price cannot start in the future.');
 if(body?.active===false)return {provider,model,effectiveFrom,active:false,input:null,output:null,cacheRead:null,cacheWrite:null};
 return {provider,model,effectiveFrom,active:true,input:num(body?.input,'input'),output:num(body?.output,'output'),cacheRead:num(body?.cacheRead,'cache read',true),cacheWrite:num(body?.cacheWrite,'cache write',true)};
}

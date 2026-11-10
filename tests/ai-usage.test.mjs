// AI usage ledger, price table, credit and runway (Settings › Accounts & connections, parents only).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openD1,migrate} from '../app/host/d1-sqlite.mjs';
import {generate} from '../app/cloud/ai-providers.mjs';
import {recordAICall,trackedGenerate,handleAIUsage,aiUsageFor} from '../app/cloud/ai-usage.mjs';
import {aiCallCost,aiCallPricing,resolvePrice,parsePriceInput,priceFor,ratesFor,AI_PRICES,PRICES_CHECKED} from '../shared/ai-pricing.mjs';
import {listModels} from '../app/cloud/ai-providers.mjs';
import {aiUsageSummary,parseCreditInput,usageWindowStart,addDays,formatUSD,aiFeature} from '../shared/ai-usage.mjs';
import {localDate} from '../app/cloud/util.mjs';

const stub=reply=>{globalThis.fetch=async()=>new Response(JSON.stringify(reply),{status:200,headers:{'Content-Type':'application/json'}})};
async function fixture(){
 const DB=openD1(':memory:');migrate(DB,new URL('../app/cloud/migrations',import.meta.url).pathname);
 await DB.prepare('INSERT INTO users(id,name,email) VALUES(?,?,?)').bind('account','Parent','usage@example.invalid').run();
 await DB.prepare('INSERT INTO households(id,name,created_by,created_at) VALUES(?,?,?,?)').bind('home','Test','account','2026-11-01').run();
 return {DB,env:{DB}};
}
const asMember=(role,member_id='parent')=>({id:'home',membership:{role,member_id}});
const call=(env,home,method='GET',body,path='/api/ai-usage')=>handleAIUsage(new Request('http://local'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),env,home,path);

test('price table: Haiku 5.5 uses the verified prices, the whole request moves to the long-prompt tier above 100K',()=>{
 assert.match(PRICES_CHECKED,/^\d{4}-\d{2}-\d{2}$/);
 const haiku=priceFor('anthropic','claude-haiku-5-5');
 assert.deepEqual([haiku.input,haiku.output,haiku.cacheRead,haiku.cacheWrite],[0.1,0.5,0.01,0.125]);
 // 20,000 in × $0.10/M + 800 out × $0.50/M = $0.0024 = 2,400 micro-dollars.
 assert.equal(aiCallCost({provider:'anthropic',model:'claude-haiku-5-5',inputTokens:20000,outputTokens:800}),2400);
 // Exactly 100,000 prompt tokens is still the base tier; one more moves every token to $0.50 / $2.50.
 assert.equal(aiCallCost({provider:'anthropic',model:'claude-haiku-5-5',inputTokens:100000,outputTokens:1000}),10000+500);
 assert.equal(aiCallCost({provider:'anthropic',model:'claude-haiku-5-5',inputTokens:100001,outputTokens:1000}),Math.round(100001*0.5+1000*2.5));
 // Cache reads and writes count toward the threshold and use the tier's cache prices.
 assert.equal(aiCallCost({provider:'anthropic',model:'claude-haiku-5-5',inputTokens:10000,cacheReadTokens:95000,cacheWriteTokens:0,outputTokens:0}),Math.round(10000*0.5+95000*0.05));
 assert.equal(aiCallCost({provider:'anthropic',model:'claude-haiku-5-5',inputTokens:1000,cacheReadTokens:2000,cacheWriteTokens:4000,outputTokens:0}),Math.round(1000*0.1+2000*0.01+4000*0.125));
});

test('price table: dated ids match their model, other variants and custom endpoints stay unknown (tokens only)',()=>{
 assert.equal(priceFor('anthropic','claude-haiku-5-5-20261001').id,'claude-haiku-5-5');
 assert.equal(priceFor('anthropic','claude-haiku-4-5-20251001').input,1);
 assert.equal(priceFor('openai','gpt-5.5-2026-04-23').id,'gpt-5.5');
 assert.equal(priceFor('xai','grok-4.7-latest').id,'grok-4.7');
 assert.equal(priceFor('gemini','models/gemini-2.5-flash').id,'gemini-2.5-flash');
 // gpt-5-mini is its own entry, not gpt-5 with a suffix; an unlisted variant is unknown, never guessed.
 assert.equal(priceFor('openai','gpt-5-mini').input,0.25);
 assert.equal(priceFor('openai','gpt-5-turbo-experimental'),null);
 assert.equal(priceFor('anthropic','claude-haiku-5-5-preview'),null);
 assert.equal(aiCallCost({provider:'custom',model:'claude-haiku-5-5',inputTokens:1000,outputTokens:10}),null);
 assert.equal(aiCallCost({provider:'anthropic',model:'some-new-model',inputTokens:1000}),null);
 for(const [provider,models]of Object.entries(AI_PRICES))for(const [id,price]of Object.entries(models)){
  assert.ok(price.input>0&&price.output>0,provider+' '+id+' has input and output prices');
  for(const t of price.tiers||[])assert.ok(t.over>0&&t.input>price.input,provider+' '+id+' tier is higher');
 }
});

test('price table: announced price changes apply from their date; xAI bills the whole request at 200K',()=>{
 const argon=priceFor('gemini','gemini-4-argon');
 assert.equal(ratesFor(argon,{day:'2026-11-30'}).input,2);assert.equal(ratesFor(argon,{day:'2026-12-01'}).input,4);
 assert.equal(aiCallCost({provider:'gemini',model:'gemini-4-argon',inputTokens:1000,day:'2026-12-02'}),4000);
 assert.equal(aiCallCost({provider:'xai',model:'grok-4.7',inputTokens:199999,outputTokens:0}),Math.round(199999*2));
 assert.equal(aiCallCost({provider:'xai',model:'grok-4.7',inputTokens:200000,outputTokens:0}),Math.round(200000*4));
});

test('generate() returns cache tokens for every provider format and keeps billed usage on a failed reply',async()=>{
 stub({content:[{type:'text',text:'ok'}],stop_reason:'end_turn',usage:{input_tokens:50,output_tokens:6,cache_read_input_tokens:900,cache_creation_input_tokens:120}});
 assert.deepEqual((await generate({},{provider:'anthropic',key:'k',model:'claude-haiku-5-5',system:'S',prompt:'P'})).usage,{inputTokens:50,outputTokens:6,cacheReadTokens:900,cacheWriteTokens:120});
 stub({status:'completed',output:[],usage:{input_tokens:1000,output_tokens:20,input_tokens_details:{cached_tokens:600}}});
 assert.deepEqual((await generate({},{provider:'openai',key:'k',model:'gpt-5',system:'S',prompt:'P'})).usage,{inputTokens:400,outputTokens:20,cacheReadTokens:600,cacheWriteTokens:0});
 // Chat format: cached prompt tokens split out; thinking tokens left out of completion_tokens are recovered from the total.
 stub({choices:[{finish_reason:'stop',message:{content:'hi'}}],usage:{prompt_tokens:300,completion_tokens:10,total_tokens:350,prompt_tokens_details:{cached_tokens:100}}});
 assert.deepEqual((await generate({},{provider:'gemini',key:'k',model:'gemini-2.5-flash',system:'S',prompt:'P'})).usage,{inputTokens:200,outputTokens:50,cacheReadTokens:100,cacheWriteTokens:0});
 stub({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{function:{name:'x',arguments:'{broken'}}]}}],usage:{prompt_tokens:80,completion_tokens:9}});
 await assert.rejects(generate({},{provider:'xai',key:'k',model:'grok-4.7',system:'S',prompt:'P'}),e=>/unreadable tool call/.test(e.message)&&e.usage.inputTokens===80&&e.usage.outputTokens===9);
});

test('recordAICall stores tokens and cost, never text, and is skipped silently before the migration',async()=>{
 const f=await fixture(),now=new Date('2026-11-09T10:00:00Z');
 assert.equal(await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',usage:{inputTokens:20000,outputTokens:800},now}),true);
 assert.equal(await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'weird',provider:'custom',model:'local',usage:{inputTokens:10,outputTokens:5},now}),true);
 assert.equal(await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',usage:{inputTokens:0,outputTokens:0},now}),false);
 const rows=(await f.DB.prepare('SELECT * FROM ai_calls ORDER BY id').all()).results;
 assert.equal(rows.length,2);assert.equal(rows[0].cost_micros,2400);assert.equal(rows[0].day,localDate(now));assert.equal(rows[1].cost_micros,null);assert.equal(rows[1].feature,'other');
 assert.deepEqual(Object.keys(rows[0]).sort(),['cache_read_tokens','cache_write_tokens','cost_micros','day','feature','household_id','id','input_tokens','member_id','model','ok','output_tokens','price_version','provider','ts'].sort());
 const old=openD1(':memory:');
 assert.equal(await recordAICall({DB:old},{householdId:'home',memberId:'parent',feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',usage:{inputTokens:5,outputTokens:5}}),false);
 assert.deepEqual(await aiUsageFor({DB:old},asMember('parent'),'2026-11-09'),{ready:false,today:'2026-11-09'});
});

test('trackedGenerate records truncated and unreadable replies, because the provider billed them',async()=>{
 const f=await fixture(),meta={householdId:'home',memberId:'parent',feature:'document'};
 stub({content:[],stop_reason:'max_tokens',usage:{input_tokens:1000,output_tokens:2200}});
 const result=await trackedGenerate(f.env,meta,{provider:'anthropic',key:'k',model:'claude-haiku-5-5',system:'S',prompt:'P'});assert.equal(result.truncated,true);
 stub({choices:[{message:{tool_calls:[{function:{name:'x',arguments:'{'}}]}}],usage:{prompt_tokens:40,completion_tokens:4}});
 await assert.rejects(trackedGenerate(f.env,{...meta,feature:'telegram'},{provider:'xai',key:'k',model:'grok-4.7',system:'S',prompt:'P'}));
 globalThis.fetch=async()=>new Response('{}',{status:401});
 await assert.rejects(trackedGenerate(f.env,meta,{provider:'anthropic',key:'k',model:'claude-haiku-5-5',system:'S',prompt:'P'}),/rejected the API key/);
 const rows=(await f.DB.prepare('SELECT feature,ok,input_tokens,output_tokens,cost_micros FROM ai_calls ORDER BY id').all()).results;
 assert.deepEqual(rows,[{feature:'document',ok:0,input_tokens:1000,output_tokens:2200,cost_micros:1000*0.1+2200*0.5},{feature:'telegram',ok:0,input_tokens:40,output_tokens:4,cost_micros:Math.round(40*2+4*6)}]);
});

test('every AI feature goes through trackedGenerate (no direct generate calls outside the adapter)',async()=>{
 const {readFile,readdir}=await import('node:fs/promises'),dir=new URL('../app/cloud/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.mjs')&&!['ai-providers.mjs','ai-usage.mjs'].includes(n))){
  const source=await readFile(new URL(name,dir),'utf8');
  assert.doesNotMatch(source,/(^|[^A-Za-z.])generate\(env/,name+' calls generate() directly');
 }
});

const row=(day,memberId,costMicros,o={})=>({day,memberId,feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',calls:1,inputTokens:1000,outputTokens:100,cacheReadTokens:0,cacheWriteTokens:0,costMicros,unpricedCalls:0,...o});

test('summary: month, 30-day chart, per person and feature, and no runway with fewer than 7 days of data',()=>{
 const today='2026-11-09';
 const s=aiUsageSummary({today,firstDay:'2026-11-05',firstDays:{anthropic:'2026-11-05'},currentProvider:'anthropic',rows:[row('2026-11-05','a',1000),row('2026-11-09','b',3000,{feature:'telegram'}),row('2026-11-09','a',500,{calls:2})],credits:[{provider:'anthropic',amountMicros:100e6,since:'2026-11-01'}],sinceCredit:{anthropic:{costMicros:4500,calls:4,unpricedCalls:0}}});
 assert.equal(s.daily.length,30);assert.equal(s.daily.at(-1).date,today);assert.equal(s.daily.at(-1).costMicros,3500);assert.equal(s.daily[0].date,'2026-10-11');
 assert.equal(s.month.costMicros,4500);assert.equal(s.month.calls,4);
 assert.deepEqual(s.byPerson.map(p=>[p.memberId,p.costMicros,p.calls]),[['b',3000,1],['a',1500,3]]);
 assert.deepEqual(s.byFeature.map(f=>f.feature),['telegram','assistant']);
 assert.equal(s.trackedDays,5);assert.equal(s.enoughData,false);assert.equal(s.averageDailyMicros,null);
 assert.equal(s.balance.remainingMicros,100e6-4500);assert.equal(s.balance.runwayDays,null);
});

test('summary: runway = remaining ÷ average daily spend over the recorded days of the last 30',()=>{
 const today='2026-11-30',rows=[];for(let i=0;i<10;i++)rows.push(row(addDays(today,-i),'a',200000));
 // 10 tracked days × $0.20 = $2.00 → $0.20 a day; $10 credit, $2 spent → $8 left → 40 days.
 const credit=(amountMicros,first)=>({credits:[{provider:'anthropic',amountMicros,since:'2026-11-01'}],sinceCredit:{anthropic:{costMicros:2e6}},firstDays:{anthropic:first},currentProvider:'anthropic'});
 const s=aiUsageSummary({today,firstDay:addDays(today,-9),rows,...credit(10e6,addDays(today,-9))});
 assert.equal(s.trackedDays,10);assert.equal(s.enoughData,true);assert.equal(s.averageDailyMicros,200000);
 assert.equal(s.balance.remainingMicros,8e6);assert.equal(s.balance.runwayDays,40);assert.equal(s.balance.runoutDay,'2027-01-09');
 // A household tracking for months averages over 30 days, not since the beginning.
 const long=aiUsageSummary({today,firstDay:'2026-01-01',rows,...credit(10e6,'2026-01-01')});
 assert.equal(long.trackedDays,30);assert.equal(long.averageDailyMicros,Math.round(2e6/30));assert.equal(long.balance.averageDailyMicros,Math.round(2e6/30));
 // Used up, no credit, and unpriced calls.
 assert.equal(aiUsageSummary({today,firstDay:'2026-01-01',rows,...credit(1e6,'2026-01-01')}).balance.runwayDays,0);
 assert.equal(aiUsageSummary({today,firstDay:'2026-01-01',rows}).balance,null);
 const unknown=aiUsageSummary({today,firstDay:'2026-11-30',rows:[row(today,'a',0,{provider:'custom',model:'llama',unpricedCalls:1})]});
 assert.equal(unknown.byModel[0].unpricedCalls,1);assert.equal(unknown.window.costMicros,0);
 // Before the month starts in the 30-day window the query starts at the earlier date.
 assert.equal(usageWindowStart('2026-11-30'),'2026-11-01');assert.equal(usageWindowStart('2026-11-09'),'2026-10-11');
});

test('credit input validation and display formatting',()=>{
 const P=['anthropic','openai'],c=(body)=>parseCreditInput({provider:'openai',...body},'2026-11-09',P);
 assert.deepEqual(c({amountUsd:'100',since:'2026-11-01'}),{provider:'openai',amountMicros:100e6,since:'2026-11-01'});
 assert.deepEqual(c({amountUsd:'12,50',since:'2026-11-09'}),{provider:'openai',amountMicros:12.5e6,since:'2026-11-09'});
 assert.throws(()=>c({amountUsd:-1,since:'2026-11-01'}),/between 0 and 100,000/);
 assert.throws(()=>c({amountUsd:'ten',since:'2026-11-01'}),/US dollars/);
 assert.throws(()=>c({amountUsd:10,since:'2026-11-10'}),/future/);
 assert.throws(()=>c({amountUsd:10,since:'2026-13-01'}),/date/);
 assert.throws(()=>parseCreditInput({provider:'mystery',amountUsd:10,since:'2026-11-01'},'2026-11-09',P),/provider/);
 assert.equal(formatUSD(100e6),'$100.00');assert.equal(formatUSD(2400),'$0.0024');assert.equal(formatUSD(240000),'$0.240');assert.equal(formatUSD(0),'$0.00');
 assert.equal(aiFeature('assistant'),'assistant');assert.equal(aiFeature('<script>'),'other');
});

test('usage API: parents only; credit is per provider, so switching providers keeps each account apart',async()=>{
 const f=await fixture(),today=localDate();
 await f.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider) VALUES(?,?,?,?,1,?)').bind('home','x','claude-haiku-5-5','[]','anthropic').run();
 await recordAICall(f.env,{householdId:'home',memberId:'kid',feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',usage:{inputTokens:20000,outputTokens:800}});
 await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'document',provider:'openai',model:'gpt-5.4-mini',usage:{inputTokens:10000,outputTokens:1000}});
 for(const role of ['child','adult'])await assert.rejects(call(f.env,asMember(role,'x')),e=>e.status===403);
 await assert.rejects(call(f.env,asMember('child','kid'),'PUT',{provider:'anthropic',amountUsd:5,since:today},'/api/ai-usage/credit'),e=>e.status===403);
 let body=await (await call(f.env,asMember('parent'))).json();
 assert.equal(body.ready,true);assert.equal(body.balance,null);assert.equal(body.month.costMicros,2400+Math.round(10000*0.75+1000*4.5));
 assert.deepEqual(body.byProvider.map(p=>p.provider).sort(),['anthropic','openai']);assert.equal(body.recent.length,2);assert.equal(body.recent[0].provider,'openai');assert.equal(body.recent[0].priceVersion,'bayit:'+PRICES_CHECKED);
 assert.ok(body.billingUrls.openai.startsWith('https://'));
 await assert.rejects(call(f.env,asMember('parent'),'PUT',{provider:'anthropic',amountUsd:5,since:'2999-01-01'},'/api/ai-usage/credit'),e=>e.status===400&&/future/.test(e.message));
 body=await (await call(f.env,asMember('parent'),'PUT',{provider:'anthropic',amountUsd:'100',since:today},'/api/ai-usage/credit')).json();
 assert.equal(body.balance.provider,'anthropic');assert.equal(body.balance.spentMicros,2400);assert.equal(body.balance.remainingMicros,100e6-2400);assert.equal(body.balance.runwayDays,null);
 body=await (await call(f.env,asMember('parent'),'PUT',{provider:'openai',amountUsd:'20',since:today},'/api/ai-usage/credit')).json();
 assert.equal(body.balances.length,2);assert.equal(body.balances[0].provider,'anthropic');assert.equal(body.balances[1].spentMicros,Math.round(10000*0.75+1000*4.5));
 assert.equal((await f.DB.prepare('SELECT updated_by FROM ai_credit WHERE provider=?').bind('openai').first()).updated_by,'parent');
 body=await (await call(f.env,asMember('parent'),'DELETE',{provider:'anthropic'},'/api/ai-usage/credit')).json();assert.equal(body.balance,null);assert.equal(body.balances.length,1);
});

test('prices are versioned: each call keeps the price it was recorded with, and new prices never rewrite past spend',()=>{
 const own=[{id:7,provider:'anthropic',model:'claude-haiku-5-5',input:0.2,output:1,effectiveFrom:'2026-11-20',createdAt:'2026-11-20T08:00:00Z'}];
 const before=aiCallPricing({provider:'anthropic',model:'claude-haiku-5-5',day:'2026-11-19',overrides:own,inputTokens:1000,outputTokens:100});
 const after=aiCallPricing({provider:'anthropic',model:'claude-haiku-5-5',day:'2026-11-20',overrides:own,inputTokens:1000,outputTokens:100});
 assert.deepEqual(before,{costMicros:150,priceVersion:'bayit:'+PRICES_CHECKED,priceSource:'bayit'});
 assert.deepEqual(after,{costMicros:300,priceVersion:'household:7',priceSource:'household'});
 // A later version wins from its date; stopping the household price brings back Bayit's list.
 const more=[...own,{id:8,provider:'anthropic',model:'claude-haiku-5-5',active:false,effectiveFrom:'2026-11-25'}];
 assert.equal(resolvePrice({provider:'anthropic',model:'claude-haiku-5-5',day:'2026-11-26',overrides:more}).source,'bayit');
 assert.equal(resolvePrice({provider:'gemini',model:'gemini-4-argon',day:'2026-12-02'}).version,'bayit:2026-12-01');
 // Unknown model: no price until a parent enters one.
 assert.equal(resolvePrice({provider:'custom',model:'llama-4-scout',day:'2026-11-20'}),null);
 assert.equal(aiCallPricing({provider:'custom',model:'Llama-4-Scout',day:'2026-11-20',overrides:[{id:9,provider:'custom',model:'llama-4-scout',input:0.1,output:0.3,effectiveFrom:'2026-11-01'}],inputTokens:1e6,outputTokens:0}).costMicros,100000);
 assert.throws(()=>parsePriceInput({provider:'custom',model:'m',input:'x',output:1},'2026-11-09'),/input price/);
 assert.throws(()=>parsePriceInput({provider:'custom',model:'m',input:1,output:1,effectiveFrom:'2026-12-01'},'2026-11-09'),/future/);
 assert.deepEqual(parsePriceInput({provider:'custom',model:' M ',input:'0,5',output:'2',cacheRead:''},'2026-11-09'),{provider:'custom',model:'m',effectiveFrom:'2026-11-09',active:true,input:0.5,output:2,cacheRead:null,cacheWrite:null});
});

test('a parent price applies to new calls; earlier unpriced calls are priced only by explicit choice, priced calls never change',async()=>{
 const f=await fixture(),today=localDate(),yesterday=addDays(today,-1),at=d=>new Date(d+'T09:00:00Z');
 await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'custom',model:'llama-4-scout',usage:{inputTokens:1e6,outputTokens:0},now:at(yesterday)});
 await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'anthropic',model:'claude-haiku-5-5',usage:{inputTokens:1000,outputTokens:0},now:at(yesterday)});
 let body=await (await call(f.env,asMember('parent'))).json();
 const llama=body.models.find(m=>m.model==='llama-4-scout');assert.equal(llama.current,null);assert.equal(llama.unpricedCalls,1);assert.equal(llama.firstUnpricedDay,yesterday);
 await assert.rejects(call(f.env,asMember('adult','x'),'POST',{provider:'custom',model:'llama-4-scout',input:1,output:1},'/api/ai-usage/prices'),e=>e.status===403);
 // Without the choice, the earlier call stays unpriced.
 body=await (await call(f.env,asMember('parent'),'POST',{provider:'custom',model:'llama-4-scout',input:0.2,output:0.6,effectiveFrom:yesterday},'/api/ai-usage/prices')).json();
 assert.equal(body.priced,0);assert.equal((await f.DB.prepare("SELECT cost_micros FROM ai_calls WHERE model='llama-4-scout'").first()).cost_micros,null);
 assert.equal(body.models.find(m=>m.model==='llama-4-scout').current.source,'household');
 // New calls use it, with the version recorded.
 await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'custom',model:'llama-4-scout',usage:{inputTokens:1e6,outputTokens:0}});
 const fresh=await f.DB.prepare("SELECT cost_micros,price_version FROM ai_calls WHERE model='llama-4-scout' ORDER BY id DESC").first();
 assert.equal(fresh.cost_micros,200000);assert.match(fresh.price_version,/^household:\d+$/);
 // A new version with the explicit choice prices only the unpriced call; a parent price for a listed model never reprices it.
 body=await (await call(f.env,asMember('parent'),'POST',{provider:'custom',model:'llama-4-scout',input:0.3,output:0.6,effectiveFrom:yesterday,priceUnpriced:true},'/api/ai-usage/prices')).json();
 assert.equal(body.priced,1);
 const all=(await f.DB.prepare("SELECT cost_micros FROM ai_calls WHERE model='llama-4-scout' ORDER BY id").all()).results.map(r=>r.cost_micros);assert.deepEqual(all,[300000,200000]);
 await call(f.env,asMember('parent'),'POST',{provider:'anthropic',model:'claude-haiku-5-5',input:9,output:9,effectiveFrom:yesterday,priceUnpriced:true},'/api/ai-usage/prices');
 assert.equal((await f.DB.prepare("SELECT cost_micros FROM ai_calls WHERE model='claude-haiku-5-5'").first()).cost_micros,100);
 body=await (await call(f.env,asMember('parent'))).json();assert.equal(body.models.find(m=>m.model==='llama-4-scout').history.length,2);
});

test('price hints from an OpenAI-compatible model list are kept as suggestions only',async()=>{
 stub({data:[{id:'meta/llama-4',name:'Llama 4',pricing:{prompt:'0.0000002',completion:'0.0000006',input_cache_read:'0.00000005'}},{id:'free/model',pricing:{prompt:'nope'}}]});
 const models=await listModels({},{provider:'custom',key:'k',baseUrl:'https://openrouter.ai/api/v1'});
 assert.deepEqual(models.find(m=>m.id==='meta/llama-4').pricing,{input:0.2,output:0.6,cacheRead:0.05,cacheWrite:null});
 assert.equal(models.find(m=>m.id==='free/model').pricing,undefined);
 const f=await fixture();
 await f.DB.prepare('INSERT INTO household_secrets(household_id,ciphertext,model,models,verified,provider,base_url) VALUES(?,?,?,?,1,?,?)').bind('home','x','meta/llama-4',JSON.stringify(models),'custom','https://openrouter.ai/api/v1').run();
 await recordAICall(f.env,{householdId:'home',memberId:'parent',feature:'assistant',provider:'custom',model:'meta/llama-4',usage:{inputTokens:500,outputTokens:50}});
 const body=await (await call(f.env,asMember('parent'))).json(),m=body.models.find(x=>x.model==='meta/llama-4');
 assert.equal(m.hint.input,0.2);assert.equal(m.current,null);assert.equal(body.recent[0].costMicros,null);
});

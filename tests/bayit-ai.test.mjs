import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyFindings,findingTitle,findingWhy,findingDelta,evidenceRoute,audienceFor,levelFor,suppressKey,cleanSettings,cleanPrefs,digestDue,digestText,findingsAIContext,cleanFindingsAI,expired} from '../shared/bayit-ai.mjs';

// Fictional household rows (agorot, negative = money out). Today is 2026-11-10.
const today='2026-11-10';
const months=['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];
let n=0;const row=(month,day,description,shekels,extra={})=>({id:'r'+(++n),date:month+'-'+String(day).padStart(2,'0'),description,amount:-Math.round(shekels*100),category:'utilities',source:'max',account:'4821',kind:'card',...extra});
function base(){
 n=0;const rows=[];
 for(const m of months.slice(0,8))rows.push(row(m,10,'CELLCOM 052-5550101',89));
 rows.push(row('2026-11',10,'סלקום ישראל בע"מ',129));
 // Electricity varies with the season and jumps in winter: never a price-jump finding.
 [389,402,395,398,410,388,391,396,455].forEach((v,i)=>rows.push(row(months[i],4,'חברת החשמל לישראל בע"מ',v,{source:'leumi',account:'0457',kind:'bank'})));
 // Netflix every month for long; Disney+ new since September.
 for(const m of months)rows.push(row(m,15,'NETFLIX.COM',54.9,{category:'subscriptions'}));
 for(const m of ['2026-09','2026-10','2026-11'])rows.push(row(m,3,'DISNEY PLUS',39.9,{category:'subscriptions'}));
 // A real double charge, and a TV in instalments, and a supermarket.
 rows.push(row('2026-11',7,'WOLT',142,{category:'dining',time:'20:41'}),row('2026-11',7,'WOLT',142,{category:'dining',time:'20:45'}));
 for(const [i,m]of ['2026-09','2026-10','2026-11'].entries())rows.push(row(m,20,'KSP מחשבים',400,{category:'shopping',installmentN:i+1,installmentOf:10}));
 rows.push(row('2026-11',8,'שופרסל דיל',412.4,{category:'groceries'}));
 return rows;
}

test('finds the Cellcom price jump, the new Disney+ charge and the Wolt double charge, and nothing else',()=>{
 const found=moneyFindings(base(),{today});
 assert.deepEqual(found.map(f=>f.kind).sort(),['dup','jump','new']);
 const jump=found.find(f=>f.kind==='jump'),fresh=found.find(f=>f.kind==='new'),dup=found.find(f=>f.kind==='dup');
 assert.equal(jump.providerKey,'p:cellcom');assert.equal(jump.previous,8900);assert.equal(jump.amount,12900);assert.equal(jump.percent,45);assert.equal(jump.steadyMonths,8);assert.equal(jump.level,3);
 assert.equal(jump.history.length,6);assert.equal(jump.history.at(-1).amount,12900);
 assert.equal(fresh.providerKey,'p:disney');assert.equal(fresh.firstMonth,'2026-09');assert.equal(fresh.charges,3);assert.equal(fresh.amount,3990);
 assert.deepEqual(fresh.alsoPaying.map(x=>x.en),['Netflix']);
 assert.equal(dup.amount,14200);assert.deepEqual(dup.dates,['2026-11-07','2026-11-07']);assert.equal(dup.rowIds.length,2);
});

test('electricity, water and other variable bills never trigger a price jump',()=>{
 const found=moneyFindings(base(),{today});
 assert.ok(!found.some(f=>/electric|חשמל/i.test(f.name.en+f.name.he)));
});

test('a price that moves a little, or a short history, is not a jump',()=>{
 n=0;const small=months.map((m,i)=>row(m,10,'CELLCOM',i===8?93:89));
 assert.equal(moneyFindings(small,{today}).length,0,'+4.5% is below the 8% threshold');
 const unstable=months.map((m,i)=>row(m,10,'CELLCOM',[89,99,79,89,95,82,89,90,129][i]));
 assert.equal(moneyFindings(unstable,{today}).filter(f=>f.kind==='jump').length,0,'an unstable series is not a stable charge');
 const short=['2026-09','2026-10','2026-11'].map((m,i)=>row(m,10,'CELLCOM',i===2?129:89));
 assert.equal(moneyFindings(short,{today}).filter(f=>f.kind==='jump').length,0);
});

test('a new charge is not "new" when the imports simply start there',()=>{
 n=0;const rows=['2026-09','2026-10','2026-11'].map(m=>row(m,3,'DISNEY PLUS',39.9,{category:'subscriptions'}));
 assert.equal(moneyFindings(rows,{today}).length,0);
});

test('two phone lines with the same price every month are not a double charge',()=>{
 n=0;const rows=[];for(const m of months){rows.push(row(m,12,'PARTNER 054',49,{category:'utilities'}),row(m,12,'PARTNER 054',49,{category:'utilities'}))}
 assert.equal(moneyFindings(rows,{today}).filter(f=>f.kind==='dup').length,0);
});

test('"Not relevant" suppresses that kind for that provider only',()=>{
 const all=moneyFindings(base(),{today}),jump=all.find(f=>f.kind==='jump');
 const after=moneyFindings(base(),{today,suppressed:new Set([suppressKey(jump)])});
 assert.deepEqual(after.map(f=>f.kind).sort(),['dup','new']);
});

test('finding ids are stable across runs, so a finding is never opened twice',()=>{
 const a=moneyFindings(base(),{today}).map(f=>f.id).sort(),b=moneyFindings(base(),{today:'2026-11-12'}).map(f=>f.id).sort();
 assert.deepEqual(a,b);
 // After "OK" the family keeps paying 129: no new jump finding next month.
 const rows=base();rows.push(row('2026-12',10,'CELLCOM',129));
 assert.equal(moneyFindings(rows,{today:'2026-12-11'}).filter(f=>f.kind==='jump').length,0);
});

test('the card holder checks; a shared account goes to every adult; private rows only to their owner',()=>{
 const memberOf=t=>t.source==='max'?'hila':null;
 const found=moneyFindings(base(),{today,memberOf}),jump=found.find(f=>f.kind==='jump');
 assert.equal(jump.holder,'hila');
 assert.deepEqual(audienceFor(jump,{adults:['dan','hila'],scope:'family'}),{viewers:['dan','hila'],assignees:['hila']});
 assert.deepEqual(audienceFor({...jump,holder:null},{adults:['dan','hila'],scope:'family'}),{viewers:['dan','hila'],assignees:['dan','hila']});
 assert.deepEqual(audienceFor(jump,{adults:['dan','hila'],scope:'private',ownerId:'dan'}),{viewers:['dan'],assignees:['dan']});
});

test('words in Hebrew and English, with the evidence link to Who we pay',()=>{
 const found=moneyFindings(base(),{today}),jump=found.find(f=>f.kind==='jump'),fresh=found.find(f=>f.kind==='new'),dup=found.find(f=>f.kind==='dup');
 assert.equal(findingTitle(jump,'en'),'Cellcom went up to ₪129');
 assert.match(findingTitle(jump,'he'),/סלקום עלה ל־.*₪129/);
 assert.match(findingWhy(jump,'he')[0],/8 חודשים שילמתם .*₪89.*ובנובמבר .*₪129.* \(\+45%\)/);
 assert.match(findingWhy(jump,'en')[1],/₪480 a year/);
 assert.match(findingWhy(fresh,'en')[1],/You also pay Netflix/);
 assert.match(findingWhy(dup,'en')[0],/Two identical charges of ₪142 on Nov 7/);
 assert.equal(findingDelta(jump),'+₪40');assert.equal(findingDelta(dup),'₪142 ×2');
 assert.equal(evidenceRoute(jump),'household/expenses?view=providers&provider=p%3Acellcom&month=2026-11');
 assert.equal(evidenceRoute(dup,'private'),'household/expenses?month=2026-11&scope=private');
});

test('AI priority follows the yearly amount',()=>{
 assert.equal(levelFor('jump',4000),3);assert.equal(levelFor('new',3990),2);assert.equal(levelFor('new',500),1);assert.equal(levelFor('dup',14200),2);assert.equal(levelFor('dup',25000),3);
});

test('the AI sees provider names, areas and amounts only, and may only reword listed findings',()=>{
 const found=moneyFindings(base(),{today,memberOf:()=> 'hila'}),ctx=findingsAIContext(found);
 const text=JSON.stringify(ctx);
 assert.ok(!/4821|0457|hila|max|leumi|r\d+|WOLT|CELLCOM 052/.test(text),text);
 const clean=cleanFindingsAI({findings:[{id:found[0].id,he:'<b>שורה</b>',en:'A line'},{id:'other',en:'x'}]},found);
 assert.deepEqual(Object.keys(clean),[found[0].id]);assert.equal(clean[found[0].id].he,'bשורה/b');
});

test('settings and personal notification choices are cleaned; a digest is due once, at the chosen time, outside quiet hours',()=>{
 assert.deepEqual(cleanSettings({enabled:true,frequency:'hourly',areas:{money:false}}),{enabled:true,areas:{money:false},frequency:'daily'});
 assert.deepEqual(cleanPrefs({digest:'daily',time:'25:00',push:1,telegram:true}),{digest:'daily',time:'09:00',push:false,telegram:true,weekday:0});
 const p={digest:'daily',time:'09:00'};
 assert.equal(digestDue(p,{date:today,time:'08:59',weekday:2}),null);
 assert.equal(digestDue(p,{date:today,time:'09:00',weekday:2}),'bai-digest:d:'+today);
 assert.equal(digestDue(p,{date:today,time:'09:30',weekday:2,quiet:true}),null);
 assert.equal(digestDue({digest:'weekly',time:'09:00',weekday:0},{date:today,time:'10:00',weekday:2}),null);
 assert.equal(digestDue({digest:'off'},{date:today,time:'10:00',weekday:2}),null);
 const d=digestText(moneyFindings(base(),{today}),'he');assert.equal(d.title,'בית AI מציע לבדוק 3 דברים');assert.equal(d.lines.length,3);
});

test('open findings expire quietly after 30 days',()=>{
 const now=Date.parse('2026-11-10T12:00Z');assert.equal(expired(now-29*86400000,now),false);assert.equal(expired(now-31*86400000,now),true);
});

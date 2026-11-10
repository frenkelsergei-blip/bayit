import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whoWePay,providerOf,cleanProviderName,providerHighlights,cleanProviderSettings,providerAIContext,cleanProviderAI,providerFingerprint} from '../shared/providers.mjs';

// Fictional household: six months of card and bank rows, the last month partly loaded.
const MONTHS=['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'];
let n=0;
const row=(month,day,description,shekels,{kind='card',account='4821',category='utilities',standingOrder=false,source='max',memberId='daniel',visibility='family'}={})=>({id:'t'+(++n),source,account,kind,date:month+'-'+String(day).padStart(2,'0'),month,description,amount:-Math.round(shekels*100),category,standingOrder,memberId,visibility});
function sample(){
 n=0;const rows=[];
 for(const m of MONTHS.slice(0,5)){
  rows.push(row(m,10,'CELLCOM 03-1234567',129));                                     // Cellcom on the card
  rows.push(row(m,12,'סלקום ישראל בע"מ',20,{kind:'bank',source:'leumi',account:''})); // a second Cellcom line from the bank
  rows.push(row(m,14,'NETFLIX.COM',54.9,{category:'subscriptions'}));
  rows.push(row(m,27,'DISNEY PLUS',39.9,{category:'subscriptions',account:'7730'}));
  rows.push(row(m,3,'שופרסל דיל',900,{category:'groceries'}));                       // groceries are never a provider
  rows.push(row(m,1,'הראל חברה לביטוח',236,{kind:'bank',source:'leumi',account:'',category:'insurance',standingOrder:true}));
  rows.push(row(m,20,'PAYPAL *KOOKOO MUSIC',19.9,{category:'subscriptions'}));       // unknown merchant
 }
 for(const m of ['2026-07','2026-09'])rows.push(row(m,4,'חברת החשמל לישראל בע"מ',546,{kind:'bank',source:'leumi',account:'',standingOrder:true}));
 rows.push(row('2026-11',4,'חברת החשמל לישראל בע"מ',612,{kind:'bank',source:'leumi',account:'',standingOrder:true}));
 for(const m of MONTHS.slice(0,3))rows.push(row(m,5,'HOLMES PLACE TLV',289,{category:'leisure'}));   // stopped after August
 rows.push(row('2026-11',2,'פז תחנת דלק',250,{category:'car'}));                     // one-off, not recurring
 return rows;
}
const policies=[
 {id:'pol-harel',insurer:'הראל חברה לביטוח בע"מ',type:'health',premiumCents:23600,premiumPeriod:'monthly',currency:'ILS',status:'active',memberIds:['daniel','hila'],endDate:'2027-03-31'},
 {id:'pol-migdal',insurer:'מגדל חברה לביטוח',type:'car',premiumCents:372000,premiumPeriod:'yearly',currency:'ILS',status:'active',memberIds:['hila'],endDate:'2026-12-15'},
 {id:'pol-old',insurer:'כלל ביטוח',type:'home',premiumCents:9500,premiumPeriod:'monthly',currency:'ILS',status:'cancelled'}
];

test('messy statement names resolve to one known provider with both names',()=>{
 for(const d of ['CELLCOM 03-1234567','סלקום ישראל בע"מ','Cellcom Israel'])assert.equal(providerOf(d,'utilities').key,'p:cellcom');
 assert.deepEqual(providerOf('חברת החשמל לישראל בע"מ','utilities').name,{en:'Israel Electric',he:'חברת החשמל'});
 assert.equal(providerOf('סלקום אנרגיה','utilities').area,'electricity');
 assert.equal(providerOf('הוט מובייל','utilities').key,'p:hot-mobile');
 assert.equal(providerOf('YES PLANET','leisure').known,false,'a cinema is not the yes TV provider');
 assert.equal(providerOf('עיריית תל אביב-יפו ארנונה','taxes').area,'arnona');
 assert.equal(providerOf('מי אביבים 2010 בע"מ','utilities').area,'water');
 assert.equal(providerOf('הראל חברה לביטוח','insurance').key,'ins:harel');
 assert.equal(cleanProviderName('PAYPAL *KOOKOO MUSIC 4029357733'),'Paypal Kookoo Music');
 assert.equal(cleanProviderName('מי אביבים 2010 בע"מ'),'מי אביבים');
});

test('recurring rows become providers grouped by area, without groceries or one-off spending',()=>{
 const s=whoWePay(sample(),{today:'2026-11-04'});
 const cellcom=s.providers.find(p=>p.key==='p:cellcom');
 assert.equal(cellcom.entries.length,2,'card and bank lines join one provider');
 assert.equal(cellcom.monthly,14900);
 assert.equal(cellcom.payment.kind,'card');assert.equal(cellcom.payment.account,'4821');
 assert.ok(!s.providers.some(p=>/שופרסל|דלק/.test(p.entries[0]?.description||'')));
 const iec=s.providers.find(p=>p.key==='p:iec');
 assert.equal(iec.period,2);assert.equal(iec.payment.kind,'standing');assert.equal(iec.changePercent,12);
 assert.equal(iec.monthly,27300,'a bill every two months counts half per month');
 assert.equal(iec.next,'2027-01-04');
 assert.deepEqual(s.groups.map(g=>g.id),['home','comm','ins','subs']);
 assert.equal(s.total,s.groups.reduce((n,g)=>n+g.monthly,0));
});

test('a provider whose statement name changes month to month is still monthly',()=>{
 n=0;const rows=MONTHS.slice(0,5).map((m,i)=>row(m,10,i%2?'סלקום ישראל בע"מ':'CELLCOM 03-1234567',129));
 const p=whoWePay(rows,{today:'2026-11-04'}).providers.find(x=>x.key==='p:cellcom');
 assert.equal(p.period,1);assert.equal(p.monthly,12900);assert.equal(p.entries.length,1);
 assert.deepEqual(p.entries[0].names.sort(),['CELLCOM 03-1234567','סלקום ישראל בע"מ'].sort());
});

test('a provider that stopped charging is listed as ended and left out of the monthly total',()=>{
 const s=whoWePay(sample(),{today:'2026-11-04'});
 assert.ok(!s.providers.some(p=>p.key==='p:holmes'));
 const gym=s.ended.find(p=>p.key==='p:holmes');assert.ok(gym);assert.equal(gym.lastSeen,'2026-08');
});

test('insurance policies join the insurer paid in the statements and are never counted twice',()=>{
 const s=whoWePay(sample(),{policies,today:'2026-11-04'});
 const harel=s.providers.filter(p=>p.area==='insurance'&&p.name.en==='Harel');
 assert.equal(harel.length,1);assert.equal(harel[0].monthly,23600,'the statement amount, not statement + premium');
 assert.deepEqual(harel[0].types,['health']);assert.deepEqual(harel[0].memberIds,['daniel','hila']);
 const migdal=s.providers.find(p=>p.key==='ins:migdal');
 assert.equal(migdal.monthly,31000);assert.equal(migdal.payment.kind,'policy');assert.equal(migdal.source,'insurance');
 assert.ok(!s.providers.some(p=>p.key==='ins:clal'),'cancelled policies are not paid');
 assert.ok(providerHighlights(s,{today:'2026-11-04'}).some(h=>h.kind==='renewal'&&h.key==='ins:migdal'));
});

test('the family can rename, merge, hide and add providers, and AI labels never override them',()=>{
 const rows=sample(),base=whoWePay(rows,{today:'2026-11-04'}),music=base.providers.find(p=>!p.known);
 assert.match(music.key,/^m:/);
 const settings=cleanProviderSettings({
  aiLabels:{[music.key]:{name:'KooKoo',area:'music'},'p:netflix':{name:'Hijacked'}},
  providers:{'p:disney':{mergeInto:'p:netflix'},'p:iec':{name:'Electricity (IEC)',memberIds:['hila']},'ins:harel':{hidden:true}},
  added:[{id:'vaad',name:'Building committee',area:'building',amount:25000,period:1,how:'cash'}]
 });
 assert.deepEqual(settings.aiLabels,{[music.key]:{name:'KooKoo',area:'music'}},'AI may only label unknown merchants');
 const s=whoWePay(rows,{settings,today:'2026-11-04'});
 assert.equal(s.providers.find(p=>p.key===music.key).name.en,'KooKoo');
 assert.equal(s.providers.find(p=>p.key===music.key).area,'music');
 const netflix=s.providers.find(p=>p.key==='p:netflix');assert.equal(netflix.name.en,'Netflix');
 assert.equal(netflix.entries.length,2);assert.equal(netflix.merged[0].key,'p:disney');assert.ok(!s.providers.some(p=>p.key==='p:disney'));
 assert.equal(s.providers.find(p=>p.key==='p:iec').name.he,'Electricity (IEC)');
 assert.deepEqual(s.providers.find(p=>p.key==='p:iec').memberIds,['hila']);
 assert.ok(!s.providers.some(p=>p.key==='ins:harel'));assert.ok(s.hidden.some(p=>p.key==='ins:harel'));
 const vaad=s.providers.find(p=>p.key==='add:vaad');assert.equal(vaad.monthly,25000);assert.equal(vaad.payment.kind,'cash');assert.equal(vaad.area,'building');
 const renamedAI=whoWePay(rows,{settings:{...settings,providers:{...settings.providers,[music.key]:{name:'Kids music app'}}},today:'2026-11-04'});
 assert.equal(renamedAI.providers.find(p=>p.key===music.key).name.en,'Kids music app','the family rename wins over the AI label');
});

test('highlights name price rises and two providers for the same thing',()=>{
 const h=providerHighlights(whoWePay(sample(),{today:'2026-11-04'}),{today:'2026-11-04'});
 assert.ok(h.some(x=>x.kind==='up'&&x.key==='p:iec'&&x.percent===12));
 const same=h.find(x=>x.kind==='same'&&x.area==='streaming');assert.deepEqual(same.names.map(x=>x.en).sort(),['Disney+','Netflix']);
});

test('settings from a browser are bounded and validated',()=>{
 const s=cleanProviderSettings({providers:{'p:x':{name:'x'.repeat(200),area:'nope',hidden:'yes',memberIds:['ok','bad id!']},'javascript:alert(1)':{name:'x'},'p:y':{mergeInto:'p:y'}},added:[{id:'a1',name:'',area:'tv'},{id:'a2',name:'Gardener',amount:-5,period:7,how:'crypto'}],aiLabels:{'p:cellcom':{name:'x'}}});
 assert.deepEqual(Object.keys(s.providers),['p:x']);assert.equal(s.providers['p:x'].name.length,60);assert.equal(s.providers['p:x'].area,undefined);
 assert.equal(s.providers['p:x'].hidden,undefined);assert.deepEqual(s.providers['p:x'].memberIds,['ok']);
 assert.equal(s.added.length,1);assert.deepEqual([s.added[0].amount,s.added[0].period,s.added[0].how],[0,1,'other']);
 assert.deepEqual(s.aiLabels,{});
});

test('the AI context has names, areas and shekels only, and AI output is filtered',()=>{
 const summary=whoWePay(sample(),{policies,today:'2026-11-04'}),context=JSON.stringify(providerAIContext(summary));
 assert.doesNotMatch(context,/4821|7730|daniel|hila|leumi|max/);
 assert.match(context,/KOOKOO/,'unknown merchants are sent for labelling');
 assert.doesNotMatch(context,/CELLCOM 03/,'known providers are sent by their clean name');
 const unknown=summary.providers.find(p=>!p.known).key;
 const out=cleanProviderAI({labels:[{key:unknown,name:'KooKoo',area:'music'},{key:'p:cellcom',name:'Evil'},{key:'m:missing',name:'X'}],points:['One',' ','x'.repeat(500),'Three','Four','Five']},summary);
 assert.deepEqual(Object.keys(out.labels),[unknown]);assert.equal(out.points.length,4);assert.equal(out.points[1].length,240);
});

test('the fingerprint changes when an amount changes',()=>{
 const rows=sample(),a=providerFingerprint(whoWePay(rows,{today:'2026-11-04'}));
 assert.equal(a,providerFingerprint(whoWePay(rows,{today:'2026-11-04'})));
 rows.push(row('2026-11',10,'CELLCOM 03-1234567',129));rows.push(row('2026-12',10,'CELLCOM 03-1234567',179));
 assert.notEqual(a,providerFingerprint(whoWePay(rows,{today:'2026-12-14'})));
});

// Second pass, user feedback 2026-11-10.
test('electricity from a phone company is electricity, never that company’s phone bill', ()=>{
 for(const d of ["סלקום אנרג'י בע\"מ",'סלקום אנרג׳י','CELLCOM ENERGY LTD','סלקום אנרגיה'])assert.deepEqual([providerOf(d,'utilities').key,providerOf(d,'utilities').area],['p:cellcom-energy','electricity'],d);
 assert.equal(providerOf('פרטנר פאוור','utilities').area,'electricity');
 assert.equal(providerOf("הוט אנרג'י",'utilities').area,'electricity');
 assert.equal(providerOf('סלקום ישראל בע"מ','utilities').key,'p:cellcom');
 n=0;const rows=[];
 for(const m of MONTHS.slice(0,5))rows.push(row(m,10,'CELLCOM 052-5550101',129));
 for(const m of MONTHS)rows.push(row(m,18,"סלקום אנרג'י בע\"מ",310,{kind:'bank',source:'leumi',account:''}));
 const s=whoWePay(rows),phone=s.providers.find(p=>p.key==='p:cellcom'),power=s.providers.find(p=>p.key==='p:cellcom-energy');
 assert.equal(phone.monthly,12900);assert.equal(phone.area,'mobile');
 assert.equal(power.monthly,31000);assert.equal(power.area,'electricity');
 assert.deepEqual(s.groups.map(g=>g.id),['home','comm']);
});

test('shops and purchases paid in instalments are not providers', ()=>{
 n=0;const rows=[];
 // A laptop from KSP in 12 payments, filed by RiseUp under "electricity" (מוצרי חשמל) → utilities.
 MONTHS.forEach((m,i)=>rows.push({...row(m,9,'KSP מחשבים',350,{category:'utilities'}),installmentN:i+1,installmentOf:12}));
 MONTHS.forEach(m=>rows.push(row(m,11,'מחסני חשמל',220,{category:'utilities'})));
 // A sofa in 10 payments from an unknown shop: instalments of one purchase.
 MONTHS.forEach((m,i)=>rows.push({...row(m,15,'רהיטי השרון',400,{category:'home'}),installmentN:i+1,installmentOf:10}));
 // A school class paid in instalments is a fixed payment for the family.
 MONTHS.forEach((m,i)=>rows.push({...row(m,20,'חוג רובוטיקה',180,{category:'kids'}),installmentN:i+1,installmentOf:10}));
 // A phone bought from Cellcom in instalments is still paid to Cellcom.
 MONTHS.forEach((m,i)=>rows.push({...row(m,10,'סלקום תשלומים',45,{category:'utilities'}),installmentN:i+1,installmentOf:36}));
 const keys=whoWePay(rows).providers.map(p=>p.key).sort();
 assert.deepEqual(keys,['m:חוגרובוטיקה','p:cellcom']);
 assert.equal(providerOf('KSP','utilities').area,'utility');// providerOf names it; whoWePay leaves it out
});

test('unknown merchants get an area from their category, not "home bill" by default', ()=>{
 assert.equal(providerOf('מנקה - העברה','home').area,'services');
 assert.equal(providerOf('פיזיותרפיה גבעתיים','health').area,'health');
 assert.equal(providerOf('דמי ניהול חשבון','fees').area,'bank');
 assert.equal(providerOf('לתת עמותה','gifts').area,'donations');
 assert.equal(providerOf('נקסט אנרג׳י','utilities').area,'electricity');
 assert.equal(providerOf('MACCABI TEL AVIV FC','leisure').area,'gym');
});

test('each provider carries its payment history, newest month first, merged entries included', ()=>{
 const s=whoWePay(sample()),cellcom=s.providers.find(p=>p.key==='p:cellcom');
 assert.deepEqual(cellcom.history.map(m=>m.month),['2026-10','2026-09','2026-08','2026-07','2026-06']);
 assert.equal(cellcom.history[0].amount,14900);assert.equal(cellcom.history[0].payments.length,2);
 assert.ok(cellcom.history.every(m=>m.payments.every(x=>/^t\d+$/.test(x.id))));
 assert.equal(cellcom.paid,5*14900);
 const merged=whoWePay(sample(),{settings:{providers:{'m:paypalkookoomusic':{mergeInto:'p:netflix'}}}}).providers.find(p=>p.key==='p:netflix');
 assert.equal(merged.history[0].payments.length,2);
 // The AI context never gets the history.
 assert.ok(!JSON.stringify(providerAIContext(s)).includes('"payments"'));
});

test('a past month shows the picture at the end of that month', ()=>{
 const now=whoWePay(sample(),{policies,today:'2026-11-09'}),aug=whoWePay(sample(),{policies,today:'2026-08-31',until:'2026-08'});
 assert.equal(aug.month,'2026-08');
 assert.ok(aug.providers.some(p=>p.key==='p:holmes'),'the gym was still paid in August');
 assert.ok(!now.providers.some(p=>p.key==='p:holmes'));
 assert.ok(aug.providers.find(p=>p.key==='p:cellcom').history.every(m=>m.month<='2026-08'));
 assert.ok(!aug.providers.some(p=>p.history?.some(m=>m.month>'2026-08')));
});

test('the area list keeps the page order, every area belongs to a group, and changing the area is kept', async ()=>{
 const {PROVIDER_AREAS,PROVIDER_GROUPS}=await import('../shared/providers.mjs');
 const order=PROVIDER_GROUPS.map(g=>g.id),groups=PROVIDER_AREAS.map(a=>order.indexOf(a.group));
 assert.ok(groups.every((g,i)=>g>=0&&(i===0||g>=groups[i-1])),'areas are listed group by group');
 assert.equal(PROVIDER_AREAS.filter(a=>a.group==='home').at(-1).id,'utility');
 const s=whoWePay(sample(),{settings:cleanProviderSettings({providers:{'p:cellcom-energy':{area:'electricity'},'p:netflix':{area:'tv'}}})});
 assert.equal(s.providers.find(p=>p.key==='p:netflix').area,'tv');
 assert.ok(s.groups.find(g=>g.id==='comm').providers.some(p=>p.key==='p:netflix'));
});

test('by company: one Cellcom with its mobile, internet and energy, each keeping its area, same total as by area', ()=>{
 n=0;const rows=[];
 for(const m of MONTHS.slice(0,5)){rows.push(row(m,10,'CELLCOM 052-5550101',129));rows.push(row(m,15,'סלקום פייבר',99));rows.push(row(m,14,'NETFLIX.COM',54.9,{category:'subscriptions'}))}
 for(const m of MONTHS)rows.push(row(m,18,"סלקום אנרג'י בע\"מ",310,{kind:'bank',source:'leumi',account:''}));
 for(const m of MONTHS.slice(0,5)){rows.push(row(m,3,'APPLE.COM/BILL ICLOUD',11.9,{category:'subscriptions'}));rows.push(row(m,4,'YOUTUBE PREMIUM',23.9,{category:'subscriptions'}))}
 const s=whoWePay(rows,{settings:{providers:{'p:cellcom':{name:'הטלפון של דניאל'}}}}),cellcom=s.companies.find(c=>c.id==='c:cellcom');
 assert.deepEqual(cellcom.providers.map(p=>[p.key,p.area]),[['p:cellcom-energy','electricity'],['p:cellcom','mobile'],['p:cellcom-internet','internet']]);
 assert.equal(cellcom.monthly,31000+12900+9900);assert.deepEqual(cellcom.name,{en:'Cellcom',he:'סלקום'},'a renamed service stays under its company');
 assert.equal(s.companies[0].id,'c:cellcom','companies with several services first');
 assert.ok(s.companies.slice(1).every((c,i,l)=>!i||l[i-1].monthly>=c.monthly),'then by amount');
 assert.equal(s.companies.reduce((n,c)=>n+c.monthly,0),s.total);
 assert.equal(s.companies.flatMap(c=>c.providers).length,s.count);
 assert.ok(s.companies.find(c=>c.id==='c:google'),'YouTube is Google');
 assert.ok(s.companies.find(c=>c.id==='p:netflix'),'a one-service company keeps the provider key');
 assert.ok(s.groups.find(g=>g.id==='home').providers.some(p=>p.key==='p:cellcom-energy'),'by area, Cellcom Energy is still under Home');
});

test('variable bills are marked', async ()=>{
 const {PROVIDER_AREA,VARIABLE_AREAS}=await import('../shared/providers.mjs');
 assert.deepEqual([...VARIABLE_AREAS].sort(),['arnona','electricity','gas','water']);
 assert.equal(PROVIDER_AREA.electricity.variable,true);assert.ok(!PROVIDER_AREA.mobile.variable);
});

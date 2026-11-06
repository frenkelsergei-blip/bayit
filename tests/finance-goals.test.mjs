import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moneyGoalReport,goalMessages,validateFinancePlans,validateFinancePreferences,weeklyGoalMessage} from '../shared/finance-goals.mjs';
import {reportsFromFinance,financeGoalsFor,financeDeliveryMessages} from '../app/cloud/finance-goals.mjs';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';

const tx=(id,date,amount,category='groceries',extra={})=>({id,date,chargeDate:date,description:category+' '+id,category,amount,kind:'bank',source:'leumi',ownerId:'one',visibility:'family',...extra});
const options={date:'2026-11-23',completeMonths:['2026-09','2026-10']};
test('limits warn at the configured threshold, escalate once per stage and include refunds',()=>{
 const plan={expenseLimit:100000,warningPercent:80},rows=[tx('a','2026-11-02',-85000)];
 const warning=moneyGoalReport(rows,[],plan,options);assert.equal(warning.alerts[0].level,'warning');assert.equal(warning.available,15000);
 const more=moneyGoalReport([...rows,tx('b','2026-11-22',-20000)],[],plan,options);assert.equal(more.alerts[0].level,'exceeded');assert.equal(more.available,0);
 assert.notEqual(goalMessages(warning,'family')[0].id,goalMessages(more,'family')[0].id);
 const refund=moneyGoalReport([...rows,tx('refund','2026-11-22',10000,'groceries',{kind:'card'})],[],plan,options);assert.equal(refund.current.expenses,75000);assert.equal(refund.alerts.length,0);
});
test('cash remaining and savings transfers are separate and a transfer is deducted only once',()=>{
 const rows=[tx('income','2026-11-01',1000000,'salary'),tx('spend','2026-11-02',-700000),tx('saving','2026-11-04',-200000,'savings')];
 const report=moneyGoalReport(rows,[],{remainingGoal:200000,savingsGoal:200000},{date:'2026-11-30'});
 assert.equal(report.current.savings,200000);assert.equal(report.current.expenses,700000);assert.equal(report.expectedRemaining,100000);
 assert.ok(report.alerts.some(a=>a.type==='remaining'&&a.target-a.value===100000));assert.ok(!report.alerts.some(a=>a.type==='savings'));
 const withdrawn=moneyGoalReport([...rows,tx('withdrawal','2026-11-29',300000,'savings')],[],{savingsGoal:200000},{date:'2026-11-30'});assert.equal(withdrawn.current.savings,-100000);assert.equal(withdrawn.expectedRemaining,400000);assert.match(goalMessages(withdrawn,'family','en').find(m=>m.key.includes(':savings:')).detail,/-/);
});
test('missing history and income do not become a fabricated month-end warning',()=>{
 const r=moneyGoalReport([tx('a','2026-11-02',-40000)],[],{remainingGoal:200000},{date:'2026-11-06'});
 assert.equal(r.expectedRemaining,null);assert.equal(r.confidence,'insufficient');assert.ok(!r.alerts.some(a=>a.type==='remaining'));
});
test('savings-transfer reminders wait for the last week and do not count an available balance',()=>{
 const rows=[tx('salary','2026-11-01',1000000,'salary')],plan={savingsGoal:200000};
 assert.ok(!moneyGoalReport(rows,[],plan,{date:'2026-11-06'}).alerts.some(a=>a.type==='savings'));
 assert.ok(moneyGoalReport(rows,[],plan,{date:'2026-11-25'}).alerts.some(a=>a.type==='savings'));
});
test('category limits are independent and historical income is an estimate, not a recorded credit',()=>{
 const rows=[tx('sep','2026-09-01',1000000,'salary'),tx('oct','2026-10-01',1000000,'salary'),tx('nov','2026-11-02',-85000)];
 const report=moneyGoalReport(rows,[],{categoryLimits:{groceries:100000}},options);
 assert.equal(report.current.income,0);assert.equal(report.expectedIncome,1000000);assert.ok(report.alerts.some(a=>a.type==='category'&&a.level==='warning'));
});
test('known bills are reserved and an already recorded bill is not reserved again',()=>{
 const bill={id:'rent',title:'Rent',date:'2026-10-28',amount:2000,repeat:'monthly',paidDates:[]},rows=[tx('income','2026-11-01',1000000,'salary'),tx('spend','2026-11-02',-10000)];
 const report=moneyGoalReport(rows,[],{remainingGoal:200000},{date:'2026-11-23',bills:[bill]});assert.equal(report.knownBillsLeft,200000);
 const paid=moneyGoalReport([...rows,tx('rent','2026-11-20',-200000,'home',{billId:'rent'})],[],{},{date:'2026-11-23',bills:[bill]});assert.equal(paid.knownBillsLeft,0);
});
test('available spending reserves both pending bills and the unmet savings-transfer target',()=>{
 const rows=[tx('income','2026-11-01',1000000,'salary'),tx('spend','2026-11-02',-100000)];
 const bill={id:'rent',title:'Rent',date:'2026-11-28',amount:2000,repeat:'once'};
 const r=moneyGoalReport(rows,[],{expenseLimit:900000,remainingGoal:200000,savingsGoal:200000},{date:'2026-11-23',bills:[bill]});
 assert.equal(r.available,300000); // income - spent - bill - savings goal - remainder goal
 const onlyLimit=moneyGoalReport(rows,[],{expenseLimit:900000},{date:'2026-11-23',bills:[bill]});assert.equal(onlyLimit.available,600000);
});
test('ordinary merchant visits remain variable spending and covered card payments are not counted twice',()=>{
 const rows=[tx('salary','2026-11-01',1000000,'salary'),...['09','10','11'].map(m=>tx('shop'+m,'2026-'+m+'-02',-100000,'groceries',{description:'Same supermarket'})),tx('card-bank','2026-11-02',-50000,'cards',{kind:'card_payment',cardIssuer:'max'}),tx('card-detail','2026-11-01',-50000,'shopping',{source:'max',kind:'card',account:'1234',chargeDate:'2026-11-02'})];
 const report=moneyGoalReport(rows,[{issuer:'max',card:'1234',chargeDate:'2026-11-02',total:50000}],{expenseLimit:300000},{date:'2026-11-15',completeMonths:['2026-09','2026-10']});
 assert.equal(report.current.expenses,150000);assert.ok(report.variableLeft>0);assert.equal(report.knownBillsLeft,0);
});
test('weekly summaries use seven charge/value dates across a month boundary and a stable delivery key',()=>{
 const rows=[tx('old','2026-10-20',-99900),tx('last-month','2026-10-30',-10000),tx('current','2026-11-02',-20000),tx('saved','2026-11-03',-5000,'savings')],report=moneyGoalReport(rows,[],{expenseLimit:100000},{date:'2026-11-05'});
 assert.equal(report.lastWeek.expenses,30000);assert.equal(report.lastWeek.savings,5000);
 assert.equal(weeklyGoalMessage(report,'family','en',{date:'2026-11-05',weekday:5}),null);
 const message=weeklyGoalMessage(report,'family','en',{date:'2026-11-05',weekday:4});assert.match(message.detail,/300/);assert.equal(message.key,'finance:digest:family:2026-11-05');
});
test('the weekly inbox summary waits for the selected local weekday and time',async()=>{
 const state={members:[{id:'one',role:'parent'}],profiles:{one:{financePlans:{family:{expenseLimit:10000}},notificationPrefs:{categories:{finance:{weeklySummary:true,weeklyDay:1,weeklyTime:'12:30'}}}}},expenses:[],bills:[]},data={transactions:[tx('shop','2026-11-23',-1000)],groups:[],imports:[],connections:[]};
 const get=(date,time)=>financeGoalsFor({}, {state},'one',{date,time,data}).then(r=>r.messages.filter(m=>m.financeDigest));
 assert.equal((await get('2026-11-23','12:29')).length,0);assert.equal((await get('2026-11-23','12:30')).length,1);assert.equal((await get('2026-11-24','13:00')).length,0);
});
test('server reports exclude private records of other adults and keep own private alerts out of shared scope',()=>{
 const state={members:[{id:'one',role:'parent'},{id:'two',role:'parent'}],profiles:{one:{financePlans:{family:{expenseLimit:100000},private:{expenseLimit:100000}}}},expenses:[],bills:[]};
 // The server finance read has already authorized its rows. This fixture reproduces that authorized response.
 const data={transactions:[tx('shared','2026-11-01',-10000),tx('own','2026-11-01',-90000,'groceries',{visibility:'private'})],imports:[],connections:[],groups:[]};
 const reports=reportsFromFinance(data,state,'one','2026-11-23');assert.equal(reports.family.current.expenses,10000);assert.equal(reports.private.current.expenses,90000);
 assert.equal(reports.family.alerts.length,0);assert.equal(reports.private.alerts[0].type,'spending');
});
test('goal amounts and categories validate, another adult cannot edit them and children cannot create them',()=>{
 assert.throws(()=>validateFinancePreferences({weeklyDay:7}),/day/);assert.throws(()=>validateFinancePreferences({weeklyTime:'25:00'}),/time/);assert.throws(()=>validateFinancePreferences({push:'true'}),/preferences/);
 assert.throws(()=>validateFinancePlans({family:{expenseLimit:NaN}}),/amount/);assert.throws(()=>validateFinancePlans({family:{categoryLimits:{salary:100}}}),/category/);
 const state=blankState('home','Home',{id:'one',name:'One',role:'parent'});state.members.push({id:'two',role:'parent'},{id:'kid',role:'child'});state.profiles.two={};state.profiles.kid={};
 const plans={private:{expenseLimit:100000,remainingGoal:200000,savingsGoal:200000}};
 const saved=applyChanges(state,[{collection:'profiles',id:'one',value:{financePlans:plans}}],'one','parent');assert.deepEqual(saved.profiles.one.financePlans,plans);
 assert.equal(visibleState(saved,'two').profiles.one.financePlans,undefined);
 assert.throws(()=>applyChanges(state,[{collection:'profiles',id:'two',value:{financePlans:plans}}],'one','parent'),/private/);
 assert.throws(()=>applyChanges(state,[{collection:'profiles',id:'kid',value:{financePlans:plans}}],'kid','child'),/Adults/);
});
test('external channels are opt-in, honor quiet hours and skip children before reading finance data',async()=>{
 const home={state:{members:[{id:'one',role:'parent'},{id:'kid',role:'child'}],profiles:{}}};home.state.profiles.one={financePlans:{family:{expenseLimit:10000}}};home.state.profiles.kid={financePlans:{family:{expenseLimit:10000}}};
 assert.deepEqual(await financeDeliveryMessages({},home,'one',{date:'2026-11-23',time:'12:00',channel:'push'}),[]);
 home.state.profiles.one.notificationPrefs={categories:{finance:{push:true}}};assert.deepEqual(await financeDeliveryMessages({},home,'one',{date:'2026-11-23',time:'23:00',channel:'push'}),[]);
 assert.deepEqual(await financeDeliveryMessages({},home,'kid',{date:'2026-11-23',time:'12:00',channel:'push'}),[]);
 await assert.rejects(financeGoalsFor({},home,'kid'),/adult/);
});
test('finance push uses real D1 source filtering and sends once at warning, then once at exceeded',async()=>{
 const {openD1,migrate}=await import('../app/host/d1-sqlite.mjs'),{deliverPush}=await import('../app/cloud/push.mjs');
 const {mkdtempSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const db=openD1(join(mkdtempSync(join(tmpdir(),'bayit-finance-goals-')),'db.sqlite'));migrate(db,new URL('../app/cloud/migrations',import.meta.url).pathname);
 const env={DB:db,APP_ENCRYPTION_KEY:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 await db.prepare("INSERT INTO users(id,name,email) VALUES('account-one','One','one@example.invalid')").run();await db.prepare("INSERT INTO sessions(id,sessionToken,userId,expires) VALUES('session-one','fixture-push-session','account-one','2027-11-23T12:00:00Z')").run();await db.prepare("INSERT INTO memberships(household_id,user_id,member_id,role,created_at) VALUES('home','account-one','one','parent','2026-11-01')").run();
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 await db.prepare('INSERT INTO push_subscriptions(endpoint_hash,household_id,member_id,endpoint,p256dh,auth,created_at,session_id) VALUES(?,?,?,?,?,?,?,?)').bind('phone','home','one','https://fcm.googleapis.com/fcm/send/fictional-device',Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),0,'session-one').run();
 await (await import('./fixtures/security-session.mjs')).bindTestSession(db,'home','one');const state=blankState('home','Home',{id:'one',name:'One',role:'parent'});state.members.push({id:'two',role:'parent'});
 state.profiles.one.financePlans={family:{expenseLimit:10000}};state.profiles.one.notificationPrefs={categories:{finance:{push:true,telegram:false}}};
 const manual=(id,amount,ownerId='one',visibility='family')=>({id,title:id,date:'2026-11-23',amount,category:'Groceries',ownerId,memberId:ownerId,visibility,allowedIds:[]});
 state.expenses=[manual('shared',90),manual('other-secret',999999,'two','private'),manual('own-private',999999,'one','private')];
 const home={id:'home',state},now=new Date('2026-11-23T10:00:00Z'),calls=[],fetcher=async(url,init)=>{calls.push({url,init});return new Response('',{status:201})};
 const status=await financeGoalsFor(env,home,'one',{date:'2026-11-23'});assert.equal(status.reports.family.current.expenses,9000);assert.equal(status.messages.length,1);
 assert.equal((await deliverPush(env,now,{fetcher,loadHome:async()=>home})).sent,1);assert.equal(calls.length,1);
 await deliverPush(env,now,{fetcher,loadHome:async()=>home});assert.equal(calls.length,1);
 state.expenses.push(manual('more',20));assert.equal((await deliverPush(env,now,{fetcher,loadHome:async()=>home})).sent,1);assert.equal(calls.length,2);
 await deliverPush(env,now,{fetcher,loadHome:async()=>home});assert.equal(calls.length,2);
 state.profiles.one.notificationPrefs.categories.finance.enabled=false;state.expenses.push(manual('even-more',100));await deliverPush(env,now,{fetcher,loadHome:async()=>home});assert.equal(calls.length,2);
 Object.assign(state.profiles.one.notificationPrefs.categories.finance,{enabled:true,weeklySummary:true,weeklyDay:1,weeklyTime:'12:00'});await deliverPush(env,new Date('2026-11-23T09:00:00Z'),{fetcher,loadHome:async()=>home});assert.equal(calls.length,2);await deliverPush(env,now,{fetcher,loadHome:async()=>home});assert.equal(calls.length,3);await deliverPush(env,now,{fetcher,loadHome:async()=>home});assert.equal(calls.length,3);
});

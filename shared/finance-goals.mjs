// Money goals use integer agorot. A projected cash remainder is separate from recorded savings transfers.
// Every caller supplies only records authorized for the recipient, narrowed to a single sharing scope.
import {CATEGORY,flowOf,monthOf,monthSummary,recurringPayments,forecast,normalizeName,shiftMonth,linkCardPayments} from './finance.mjs';

export const GOAL_DEFAULTS={expenseLimit:0,remainingGoal:0,savingsGoal:0,expectedIncome:0,warningPercent:80,categoryLimits:{},priceAlerts:true};
const MAX=10_000_000_000;
export function validateFinancePlans(plans){
 if(!plans||typeof plans!=='object'||Array.isArray(plans))throw Error('Choose valid money goals.');
 for(const [scope,plan]of Object.entries(plans)){
  if(!['family','private'].includes(scope)||!plan||typeof plan!=='object'||Array.isArray(plan))throw Error('Choose a valid money-goal scope.');
  for(const key of ['expenseLimit','remainingGoal','savingsGoal','expectedIncome'])if(plan[key]!==undefined&&(!Number.isSafeInteger(plan[key])||plan[key]<0||plan[key]>MAX))throw Error('Choose a valid goal amount.');
  if(plan.warningPercent!==undefined&&(!Number.isInteger(plan.warningPercent)||plan.warningPercent<50||plan.warningPercent>95))throw Error('Choose a warning between 50% and 95%.');
  if(plan.priceAlerts!==undefined&&typeof plan.priceAlerts!=='boolean')throw Error('Choose a valid price-alert preference.');
  if(plan.categoryLimits!==undefined){if(!plan.categoryLimits||typeof plan.categoryLimits!=='object'||Array.isArray(plan.categoryLimits))throw Error('Choose valid category limits.');for(const [key,value]of Object.entries(plan.categoryLimits))if(!CATEGORY[key]||flowOf(key)!=='expense'||!Number.isSafeInteger(value)||value<0||value>MAX)throw Error('Choose a valid category limit.');}
 }
 return plans;
}
export function validateFinancePreferences(prefs){
 if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))throw Error('Choose valid finance notification preferences.');
 for(const key of ['enabled','inApp','push','telegram','weeklySummary'])if(prefs[key]!==undefined&&typeof prefs[key]!=='boolean')throw Error('Choose valid finance notification preferences.');
 if(prefs.weeklyDay!==undefined&&(!Number.isInteger(prefs.weeklyDay)||prefs.weeklyDay<0||prefs.weeklyDay>6))throw Error('Choose a valid weekly summary day.');
 if(prefs.weeklyTime!==undefined&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(prefs.weeklyTime))throw Error('Choose a valid weekly summary time.');
 return prefs;
}
export const hasFinanceGoals=profile=>profile?.notificationPrefs?.categories?.finance?.weeklySummary===true||Object.values(profile?.financePlans||{}).some(p=>p&&(p.expenseLimit||p.remainingGoal||p.savingsGoal||Object.values(p.categoryLimits||{}).some(Number)||p.priceAlerts));
export const financePrefs=profile=>({enabled:true,inApp:true,push:false,telegram:false,...profile?.notificationPrefs,...profile?.notificationPrefs?.categories?.finance});
export const inFinanceScope=(record,scope)=>scope==='private'?record.visibility==='private':record.visibility!=='private';
const median=values=>{const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length?v.length%2?v[i]:Math.round((v[i-1]+v[i])/2):0};
const recKey=t=>t.source+'|'+normalizeName(t.description);

export function moneyGoalReport(rows,groups,plan={}, {date,month=date?.slice(0,7),completeMonths=[],bills=[]}={}){
 const p={...GOAL_DEFAULTS,...plan},current=monthSummary(rows,groups,month),todayMonth=date.slice(0,7),historical=month<todayMonth;
 const daysInMonth=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
 const day=historical?daysInMonth:month===todayMonth?Number(date.slice(8)):0,daysLeft=Math.max(0,daysInMonth-day);
 const history=[1,2,3].map(i=>shiftMonth(month,-i)).filter(m=>completeMonths.includes(m)).map(m=>monthSummary(rows,groups,m)).filter(s=>s.count>0);
 const fixedCategories=new Set(['insurance','utilities','mortgage','subscriptions','fees','taxes','savings']);
 const priorRows=rows.filter(t=>monthOf(t)<month),recurring=recurringPayments(rows.filter(t=>monthOf(t)<=month)).filter(r=>fixedCategories.has(r.category)||r.standingOrder||r.installmentsLeft!==null);
 const projected=forecast(priorRows,groups,month),recurringKeys=new Set(recurring.map(r=>r.key)),covered=linkCardPayments(rows,groups);
 const actualVariable=rows.filter(t=>monthOf(t)===month&&(t.kind!=='card_payment'||!covered.has(t.id))&&flowOf(t.category)==='expense'&&!(t.amount>0&&t.kind==='bank')&&!recurringKeys.has(recKey(t))).reduce((n,t)=>n-t.amount,0);
 const due=projected.due.filter(r=>recurringKeys.has(r.key)&&!r.months.includes(month)&&!rows.some(t=>monthOf(t)===month&&recKey(t)===r.key));
 let fixedLeft=due.filter(r=>flowOf(r.category)==='expense').reduce((n,r)=>n+r.typical,0),savingsLeft=due.filter(r=>flowOf(r.category)==='savings').reduce((n,r)=>n+r.typical,0);
 // Explicit household bills without a recorded payment are known commitments, not inferred spending.
 for(const bill of bills){const paid=bill.paidDates||[],dateInMonth=bill.repeat==='monthly'&&bill.date.slice(0,7)<=month?month+'-'+String(Math.min(daysInMonth,Number(bill.date.slice(8)))).padStart(2,'0'):bill.date;
  if(dateInMonth.slice(0,7)!==month||paid.includes(dateInMonth)||rows.some(t=>t.billId===bill.id&&monthOf(t)===month)||recurring.some(r=>normalizeName(r.description)===normalizeName(bill.title)))continue;
  fixedLeft+=Math.round(Number(bill.amount)*100);
 }
 const expectedIncome=historical?current.income:Math.max(current.income,p.expectedIncome||median(history.map(s=>s.income)));
 const estimatedEveryday=history.length>=2?median(history.map(s=>Math.max(0,s.expenses-rows.filter(t=>monthOf(t)===s.month&&t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)==='expense'&&recurringKeys.has(recKey(t))).reduce((n,t)=>n-t.amount,0)))):null;
 const pace=day>=7?Math.max(0,actualVariable)/day:null;
 const variableLeft=historical?0:estimatedEveryday!==null?Math.round(Math.max(estimatedEveryday/daysInMonth,pace||0)*daysLeft):pace!==null?Math.round(pace*daysLeft):null;
 const canProject=historical||month===todayMonth&&current.count>0&&expectedIncome>0&&variableLeft!==null;
 if(historical){fixedLeft=0;savingsLeft=0;}
 const expectedExpenses=canProject?current.expenses+fixedLeft+(variableLeft||0):null;
 const expectedSavings=canProject?current.savings+savingsLeft:null;
 const expectedRemaining=canProject?expectedIncome-expectedExpenses-expectedSavings:null;
 const headroom=[];if(p.expenseLimit>0)headroom.push(p.expenseLimit-current.expenses-fixedLeft);
 const reservedSavings=Math.max(savingsLeft,Math.max(0,p.savingsGoal-current.savings));
 if((p.remainingGoal>0||p.savingsGoal>0)&&canProject)headroom.push(expectedIncome-current.expenses-current.savings-fixedLeft-reservedSavings-p.remainingGoal);
 const available=headroom.length&&!historical&&month===todayMonth?Math.max(0,Math.min(...headroom)):null;
 const alerts=[],add=(type,level,value,target,category)=>alerts.push({type,level,value,target,...(category?{category}:{})});
 const limitAlert=(type,value,target,category)=>{if(!(target>0))return;if(value>=target)add(type,'exceeded',value,target,category);else if(value>=target*p.warningPercent/100)add(type,'warning',value,target,category)};
 if(current.count){limitAlert('spending',current.expenses,p.expenseLimit);for(const [category,target]of Object.entries(p.categoryLimits||{}))limitAlert('category',current.byCategory.find(c=>c.category===category)?.amount||0,target,category);}
 if(p.remainingGoal>0&&expectedRemaining!==null){if(expectedRemaining<p.remainingGoal)add('remaining','exceeded',expectedRemaining,p.remainingGoal);else if(expectedRemaining<=p.remainingGoal*(2-p.warningPercent/100))add('remaining','warning',expectedRemaining,p.remainingGoal);}
 if(current.count&&p.savingsGoal>0&&current.savings<p.savingsGoal&&(historical||daysLeft<=7))add('savings',historical||daysLeft===0?'exceeded':'warning',current.savings,p.savingsGoal);
 if(p.priceAlerts)for(const r of recurring.filter(r=>flowOf(r.category)==='expense'&&r.months.includes(month)&&r.changePercent>=10))alerts.push({type:'price',level:'warning',value:r.last,target:Math.round(r.last/(1+r.changePercent/100)),merchant:r.description,changePercent:r.changePercent});
 const from=new Date(Date.parse(date+'T12:00Z')-6*86400000).toISOString().slice(0,10),weekRows=rows.filter(t=>{const day=t.kind==='card'?t.chargeDate||t.date:t.date;return day>=from&&day<=date}),weekMonths=[...new Set(weekRows.map(monthOf))];
 const lastWeek=weekMonths.map(m=>monthSummary(weekRows,groups,m)).reduce((a,s)=>({from,to:date,income:a.income+s.income,expenses:a.expenses+s.expenses,savings:a.savings+s.savings}),{from,to:date,income:0,expenses:0,savings:0});
 return {month,plan:p,current,expectedIncome,expectedExpenses,expectedSavings,expectedRemaining,knownBillsLeft:fixedLeft,variableLeft,available,weekly:available===null?null:Math.round(available/Math.max(1,daysLeft)*Math.min(7,Math.max(1,daysLeft))),daysLeft,historical,confidence:historical?'recorded':!canProject?'insufficient':history.length>=2?'history':'pace',historyMonths:history.length,alerts,lastWeek};
}

export function weeklyGoalMessage(report,scope,lang,{date,weekday=5}={}){
 if(new Date(date+'T12:00Z').getUTCDay()!==Number(weekday))return null;
 const he=lang==='he',T=(en,hebrew)=>he?hebrew:en,money=n=>'\u2066'+new Intl.NumberFormat(he?'he-IL':'en-US',{style:'currency',currency:'ILS',maximumFractionDigits:2}).format(n/100)+'\u2069',key='finance:digest:'+scope+':'+date,week=report.lastWeek;
 const title=(scope==='private'?T('Private','פרטי'):T('Shared','משותף'))+' · '+T('Your weekly money summary','הסיכום הכספי השבועי');
 const detail=week.from+'–'+week.to+' · '+T('Income ','הכנסות ')+money(week.income)+' · '+T('Spending ','הוצאות ')+money(week.expenses)+' · '+T('Savings transfers ','הפקדות לחיסכון ')+money(week.savings)+(report.expectedRemaining!==null?' · '+T('Projected month-end remainder ','יתרה צפויה לסוף החודש ')+money(report.expectedRemaining):'');
 return {id:key,key,title,detail,body:detail,date,kind:'finance',financeDigest:true,icon:'1F4C8',target:'household/expenses?scope='+scope+'&month='+report.month,url:'#household/expenses?scope='+scope+'&month='+report.month,tag:key};
}

export function goalMessages(report,scope,lang='he'){
 const he=lang==='he',T=(en,hebrew)=>he?hebrew:en,money=n=>'\u2066'+new Intl.NumberFormat(he?'he-IL':'en-US',{style:'currency',currency:'ILS',maximumFractionDigits:2}).format(n/100)+'\u2069';
 return report.alerts.map(alert=>{
  const label=scope==='private'?T('Private','פרטי'):T('Shared','משותף'),category=he?CATEGORY[alert.category]?.he:CATEGORY[alert.category]?.en;
  let title,detail;
  if(alert.type==='spending'||alert.type==='category'){title=alert.type==='category'?T('Category budget: ','תקציב לקטגוריה: ')+category:T('Monthly spending limit','תקרת ההוצאות החודשית');detail=T('Recorded ','נרשמו ')+money(alert.value)+T(' of ',' מתוך ')+money(alert.target)+T('. Remaining: ','. נותרו במסגרת: ')+money(Math.max(0,alert.target-alert.value));}
  if(alert.type==='remaining'){title=T('Month-end balance goal','יעד היתרה לסוף החודש');detail=T('Goal ','יעד ')+money(alert.target)+T('; projected remainder ','; צפי ליתרה ')+money(alert.value)+(alert.value<alert.target?T('; gap ','; פער ')+money(alert.target-alert.value):T('; approaching your goal boundary.','; מתקרבים לגבול היעד.'));}
  if(alert.type==='savings'){title=T('Savings transfers goal','יעד ההפקדות לחיסכון');detail=T('Recorded transfers ','הפקדות שתועדו ')+money(alert.value)+T(' of ',' מתוך ')+money(alert.target)+T('; still to transfer ','; נותרו להפקדה ')+money(Math.max(0,alert.target-alert.value));}
  if(alert.type==='price'){title=T('A recurring payment increased','חיוב חודשי גדל');detail=alert.merchant+' · '+money(alert.value)+' · +'+alert.changePercent+'% '+T('vs its previous recorded month','לעומת החודש הקודם שתועד');}
  const key=['finance',scope,report.month,alert.type,alert.category||alert.merchant||'',alert.level,alert.target].join(':');
  return {id:key,key,title:label+' · '+title,detail,body:detail,date:report.month+'-01',kind:'finance',level:alert.level,icon:alert.type==='savings'?'1F4C8':'1F4B0',target:'household/expenses?scope='+scope+'&month='+report.month,url:'#household/expenses?scope='+scope+'&month='+report.month,tag:key};
 });
}

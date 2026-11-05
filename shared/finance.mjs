// Household money model shared by the server (imports, Telegram, AI context) and the Money page.
// Amounts are integers in agorot; negative = money out. A month is "YYYY-MM" in cash-flow terms:
// bank rows by their date, card purchases by the date the card company charged the bank.

export const CATEGORIES=[
 {id:'groceries',en:'Groceries',he:'סופר ומכולת',icon:'bayit-pixel-vegetable-basket',color:'#F6C343'},
 {id:'dining',en:'Eating out',he:'מסעדות ובתי קפה',icon:'bayit-pixel-dinner-plate',color:'#F28B66'},
 {id:'car',en:'Car & fuel',he:'רכב ודלק',icon:'bayit-activities-car',color:'#4C6FFF'},
 {id:'health',en:'Health & pharmacy',he:'בריאות ופארם',icon:'bayit-activities-medicine',color:'#3FB68B'},
 {id:'insurance',en:'Insurance',he:'ביטוחים',icon:'1F6E1',color:'#7B61FF'},
 {id:'utilities',en:'Phone & utilities',he:'תקשורת וחשבונות',icon:'1F4A1',color:'#00A3C4'},
 {id:'home',en:'Home',he:'לבית',icon:'bayit-activities-family-house',color:'#C98A4B'},
 {id:'kids',en:'Kids & education',he:'ילדים וחינוך',icon:'bayit-activities-backpack',color:'#FF8FB1'},
 {id:'subscriptions',en:'Digital & subscriptions',he:'מנויים ודיגיטל',icon:'1F4BB',color:'#5B8DEF'},
 {id:'leisure',en:'Leisure & sport',he:'פנאי וספורט',icon:'bayit-activities-football',color:'#9AD45B'},
 {id:'shopping',en:'Shopping',he:'קניות',icon:'bayit-activities-folded-shirt',color:'#E0A3FF'},
 {id:'gifts',en:'Gifts & donations',he:'מתנות ותרומות',icon:'bayit-activities-gift',color:'#FF6F91'},
 {id:'mortgage',en:'Mortgage & rent',he:'משכנתא ושכירות',icon:'bayit-pixel-blue-house',color:'#1D3B8B'},
 {id:'taxes',en:'Taxes & national insurance',he:'מסים וביטוח לאומי',icon:'1F3DB',color:'#8C93A8'},
 {id:'fees',en:'Bank fees',he:'עמלות בנק',icon:'1F3E6',color:'#B0B7C9'},
 {id:'transfers',en:'Transfers & cheques',he:'העברות וצ׳קים',icon:'1F4B8',color:'#A4A9B8'},
 {id:'cards',en:'Card charges without details',he:'חיובי כרטיס ללא פירוט',icon:'1F4B3',color:'#CDD1DC'},
 {id:'other',en:'Other',he:'אחר',icon:'1F9FE',color:'#D8DCE6'},
 // Money in and savings are separate from spending.
 {id:'salary',en:'Salary',he:'משכורת',icon:'1F4BC',color:'#2FA86B',flow:'income'},
 {id:'benefits',en:'Allowances & refunds',he:'קצבאות והחזרים',icon:'1F9D2',color:'#6CCB97',flow:'income'},
 {id:'income',en:'Other income',he:'הכנסה אחרת',icon:'1F4B0',color:'#9DDCB8',flow:'income'},
 {id:'savings',en:'Savings & pension',he:'חיסכון ופנסיה',icon:'1F4C8',color:'#FFB547',flow:'savings'}
];
export const CATEGORY=Object.fromEntries(CATEGORIES.map(c=>[c.id,c]));
export const flowOf=category=>CATEGORY[category]?.flow||'expense';

// Ordered: the first match wins (insurance before car/health, pharmacy before groceries).
const RULES=[
 ['savings',/השתלמו|השתלמות|קופ"?ג|קופת גמל|פנסיה|גמל|אנליסט|מיטב|אלטשולר/],
 ['mortgage',/משכנת|שכירות|שכ"ד/],
 ['taxes',/ביטוח לאומי|בטוח לאומי|מס הכנסה|מס-הכנסה|ארנונה|רשות המסים|מועצה|עיריית|מ\s*\.\s*מ\s*\./],
 ['insurance',/ביטוח|הפניקס|הראל|מגדל|כלל ביט|AIG|ליברה|איי\.?די\.?איי|ג'י-ביטוח|9 מיליון|שומרה|מנורה ב/i],
 ['health',/פארם|בריאו|כללית|מכבי|מאוחדת|לאומית|פיזיו|רופא|מרפא|אופטיק|שיניים/],
 ['groceries',/סופר|מרקט|שופרסל|רמי לוי|ויקטורי|יוחננוף|מגה|חצי חינם|אושר עד|סיטונאות|החמנייה|מאפי|ירקות|שוק|טיב טעם|יינות ביתן|קצב/],
 ['car',/אגרת רי|רישוי|פז |סונול|דור אלון|טן |yellow|מנטה|רכב|מוסך|טסט|חניה|פנגו|כביש 6|דיזול|צמיגים|החישוק/i],
 ['dining',/קפה|שווארמה|מקדונלד|מקודנלד|פיצה|מסעד|בורגר|סושי|ארומה|גלידה|wolt|ten bis|תן ביס|החבית|פלאפל/i],
 ['utilities',/סלקום|פרטנר|בזק|הוט|yes|חשמל|מים|גז|אנרג'י|פוינטר|גולן|019|012|טיוי/i],
 ['subscriptions',/anthropic|openai|netlify|google|apple\.com|itunes|netflix|spotify|higgsfield|tripo|animoto|microsoft|adobe|github|dropbox|canva|amazon prime|disney/i],
 ['leisure',/zumba|כושר|ספורט|פיס|לוטו|סינמה|קולנוע|תיאטרון|מוזיאון|ספא/i],
 ['kids',/אגודת הגיל|הגיל הרך|גן |מעון|צהרון|חוג|אנגלית|בית ספר|תלמוד|ספרים/],
 ['home',/ikea|איקאה|ace|מקס סטוק|מקס תל|הום סנטר|טמבור|ריהוט|חשמל וחוצה|נגרות/i],
 ['shopping',/קיי אס פי|ksp|באג|זארה|zara|h&m|קסטרו|פוקס|תפוז|שופ|אמזון|amazon|aliexpress|עלי אקספרס|shein/i],
 ['gifts',/להושיט יד|תרומ|עיגול|מתנה/],
 ['fees',/עמל|מסלול בסיסי|דמי ניהול|עמ\./],
 ['transfers',/העברה|^שיק$|bit|ביט|פייבוקס|paybox/i]
];
export const CARD_ISSUERS=[['max',/מקס איט|max it/i],['isracard',/ישראכרט/],['cal',/כאל|כרטיסי אשראי לישראל/],['amex',/אמריקן אקספרס/],['diners',/דיינרס/],['leumicard',/לאומי קארד/]];
export const normalizeName=value=>String(value||'').toLowerCase().replace(/[\d*#.\-"'׳״]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80);

// Category for a description; learned household rules (normalized name → category) come first.
export function categorize(description,{credit=false,rules={}}={}){
 const key=normalizeName(description);if(rules[key])return rules[key];
 if(credit){if(/קצבת|ביטוח לאומי|מס-הכנסה החז|מס הכנסה החז|החזר|רבית זכות|ריבית זכות/.test(description))return 'benefits';return 'income'}
 for(const [category,pattern]of RULES)if(pattern.test(description))return category;
 return 'other';
}

// Normalizes a parsed statement (shared/finance-parse.mjs) into storable rows. Bank credits of 3,000 ₪ or
// more that are not allowances are treated as salary; the user can change any category later.
export function rowsFromStatement(statement,{rules={}}={}){
 const rows=[];
 if(statement.kind==='bank'){
  for(const t of statement.transactions){
   const issuer=CARD_ISSUERS.find(([,p])=>p.test(t.description))?.[0],credit=t.amount>0;
   let category=issuer&&!credit?'cards':categorize(t.description,{credit,rules});
   if(credit&&category==='income'&&t.amount>=300000)category='salary';
   rows.push({source:statement.issuer,account:t.account,date:t.date,chargeDate:t.date,description:t.description,amount:t.amount,currency:'ILS',category,kind:issuer&&!credit?'card_payment':'bank',cardIssuer:issuer||null,balance:t.balance,seq:t.seq});
  }
 }else{
  for(const card of statement.cards)for(const t of card.transactions){
   rows.push({source:statement.issuer,account:card.last4,holder:card.holder,date:t.date,chargeDate:t.chargeDate,description:t.merchant,amount:-t.charge,currency:t.currency,originalAmount:t.originalAmount??null,category:categorize(t.merchant,{rules}),kind:'card',installmentN:t.installment?.n||null,installmentOf:t.installment?.of||null,standingOrder:!!t.standingOrder,foreign:!!t.foreign,fee:t.fee||0});
  }
 }
 // Identical rows in one file (two equal charges on the same day) are told apart by their order.
 const seen=new Map();for(const r of rows){const key=[r.source,r.account,r.date,r.chargeDate,r.amount,r.description].join('|'),n=seen.get(key)||0;seen.set(key,n+1);r.dupIndex=n}
 return rows;
}
export const fingerprintText=r=>[r.source,r.account,r.date,r.chargeDate,r.amount,r.description,r.dupIndex||0].join('|');

// Charge groups printed by the card company (one per card per charge date). A bank card payment that equals a
// group's total within a few days is "covered": its purchases are already counted, so the payment is not.
export function groupsFromStatement(statement){
 if(statement.kind!=='card')return [];
 return statement.cards.flatMap(card=>card.groups.map(g=>({issuer:statement.issuer,card:card.last4,kind:g.kind,chargeDate:g.chargeDate,total:g.total})));
}
const days=(a,b)=>Math.abs(Date.parse(a+'T12:00Z')-Date.parse(b+'T12:00Z'))/86400000;
export function linkCardPayments(transactions,groups){
 const used=new Set(),links=new Map();
 for(const t of transactions.filter(t=>t.kind==='card_payment').sort((a,b)=>a.date.localeCompare(b.date))){
  const g=groups.find((g,i)=>!used.has(i)&&g.issuer===t.cardIssuer&&g.total===-t.amount&&days(g.chargeDate,t.date)<=4);
  if(g){used.add(groups.indexOf(g));links.set(t.id,g)}
 }
 return links;
}
// A row's month: the stored cash-flow month (statements and RiseUp), else card charge date or bank date.
export const monthOf=t=>t.month||(t.kind==='card'?t.chargeDate||t.date:t.date).slice(0,7);
export const shiftMonth=(month,delta)=>{const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,7)};

// One month's picture. Card purchases count when charged; covered card payments are skipped to avoid double counting.
export function monthSummary(transactions,groups,month){
 const links=linkCardPayments(transactions,groups),rows=transactions.filter(t=>monthOf(t)===month),byCategory={};
 let income=0,expenses=0,savings=0,covered=0,uncovered=0;
 for(const t of rows){
  if(t.kind==='card_payment'&&links.has(t.id)){covered+=-t.amount;continue}
  const flow=flowOf(t.category);
  if(flow==='income'){income+=t.amount;continue}
  if(flow==='savings'){savings+=-t.amount;continue}
  if(t.amount>0&&t.kind==='bank'){income+=t.amount;continue}
  if(t.kind==='card_payment')uncovered+=-t.amount;
  expenses+=-t.amount;byCategory[t.category]=(byCategory[t.category]||0)+(-t.amount);
 }
 const balanceRow=transactions.filter(t=>t.balance!=null&&t.date.slice(0,7)<=month).sort((a,b)=>b.date.localeCompare(a.date)||(a.seq??0)-(b.seq??0))[0];
 return {month,income,expenses,savings,net:income-expenses-savings,byCategory:Object.entries(byCategory).filter(([,v])=>v!==0).sort((a,b)=>b[1]-a[1]).map(([category,amount])=>({category,amount})),coveredCardPayments:covered,uncoveredCardPayments:uncovered,count:rows.length,bankBalance:balanceRow?{date:balanceRow.date,amount:balanceRow.balance}:null};
}

// Payments that repeat monthly or every two months (for example electricity), found from at least two months of history.
export function recurringPayments(transactions,{until}={}){
 const groups=new Map();
 for(const t of transactions){
  if(t.amount>=0||t.kind==='card_payment')continue;
  const key=t.source+'|'+normalizeName(t.description);(groups.get(key)||groups.set(key,[]).get(key)).push(t);
 }
 const result=[];
 for(const [key,list]of groups){
  const byMonth=new Map();for(const t of list){const m=monthOf(t);byMonth.set(m,(byMonth.get(m)||0)+(-t.amount))}
  const months=[...byMonth.keys()].sort();if(months.length<2&&!list.some(t=>t.standingOrder||t.installmentOf))continue;
  const gaps=months.slice(1).map((m,i)=>monthsBetween(months[i],m)),period=gaps.length?median(gaps):1;if(period>2)continue;
  const amounts=months.map(m=>byMonth.get(m)),typical=median(amounts.slice(-3)),last=amounts.at(-1),previous=amounts.at(-2);
  const spread=Math.max(...amounts)-Math.min(...amounts);if(amounts.length>=2&&spread>typical*0.6&&!list.some(t=>t.standingOrder))continue;
  const sample=list.at(-1),lastMonth=months.at(-1),nextMonth=shiftMonth(lastMonth,period),installmentsLeft=sample.installmentOf?sample.installmentOf-sample.installmentN:null;
  if(installmentsLeft===0)continue;
  result.push({key,description:sample.description,category:sample.category,source:sample.source,period,months,typical,last,changePercent:previous?Math.round((last-previous)/previous*100):0,nextMonth,nextDay:Number(sample.date.slice(8,10)),installmentsLeft,standingOrder:list.some(t=>t.standingOrder)});
 }
 return result.filter(r=>!until||r.nextMonth>shiftMonth(until,-1)).sort((a,b)=>b.typical-a.typical);
}
function monthsBetween(a,b){const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return (by-ay)*12+bm-am}
function median(values){const v=[...values].sort((a,b)=>a-b);if(!v.length)return 0;const m=Math.floor(v.length/2);return v.length%2?v[m]:Math.round((v[m-1]+v[m])/2)}

// Expected picture for a target month (usually the current or next one): recurring bills that fall in it, plus the
// median everyday spending of the three months before it.
export function forecast(transactions,groups,target){
 const recurring=recurringPayments(transactions),due=recurring.filter(r=>r.months[0]<target&&monthsBetween(r.months.at(-1),target)>0&&monthsBetween(r.months.at(-1),target)%r.period===0&&(r.installmentsLeft==null||monthsBetween(r.months.at(-1),target)<=r.installmentsLeft)||r.months.includes(target));
 const recent=[1,2,3].map(i=>monthSummary(transactions,groups,shiftMonth(target,-i))).filter(s=>s.count>0);
 const next=target;
 // Everyday spending = the month's expenses (including card charges without details) minus its recurring bills.
 const recurringKeys=new Set(recurring.map(r=>r.key)),variable=recent.map(s=>s.expenses-transactions.filter(t=>monthOf(t)===s.month&&t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)==='expense'&&recurringKeys.has(t.source+'|'+normalizeName(t.description))).reduce((n,t)=>n-t.amount,0));
 const bills=due.filter(r=>flowOf(r.category)==='expense').reduce((n,r)=>n+r.typical,0),saving=due.filter(r=>flowOf(r.category)==='savings').reduce((n,r)=>n+r.typical,0);
 const income=recent.length?median(recent.map(s=>s.income)):0,everyday=variable.length?median(variable):0;
 return {month:next,income,bills,everyday,savings:saving,expenses:bills+everyday,net:income-bills-everyday-saving,basedOnMonths:recent.length,due};
}

// Aggregates only: what the AI tips feature may see (no account numbers, card digits or raw statement rows).
export function insightContext(transactions,groups,month){
 const months=[0,1,2,3,4,5].map(i=>monthSummary(transactions,groups,shiftMonth(month,-i))).filter(s=>s.count>0).reverse();
 const merchants=new Map();for(const t of transactions.filter(t=>monthOf(t)>=shiftMonth(month,-2)&&monthOf(t)<=month&&t.amount<0&&t.kind!=='card_payment')){const k=normalizeName(t.description);merchants.set(k,{name:t.description,category:t.category,total:(merchants.get(k)?.total||0)-t.amount,count:(merchants.get(k)?.count||0)+1})}
 const shekels=v=>Math.round(v/100);
 return {currency:'ILS',month,months:months.map(s=>({month:s.month,income:shekels(s.income),expenses:shekels(s.expenses),savings:shekels(s.savings),byCategory:s.byCategory.map(c=>({category:CATEGORY[c.category]?.en||c.category,amount:shekels(c.amount)}))})),recurring:recurringPayments(transactions).slice(0,25).map(r=>({name:r.description,category:CATEGORY[r.category]?.en,everyMonths:r.period,typical:shekels(r.typical),last:shekels(r.last),changePercent:r.changePercent})),topMerchantsLast3Months:[...merchants.values()].sort((a,b)=>b.total-a.total).slice(0,15).map(m=>({name:m.name,category:CATEGORY[m.category]?.en,total:shekels(m.total),purchases:m.count})),forecast:(f=>({month:f.month,income:shekels(f.income),bills:shekels(f.bills),everyday:shekels(f.everyday),savings:shekels(f.savings)}))(forecast(transactions,groups,month))};
}

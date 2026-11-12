// Fictional money rows shaped like the owner's real data (2026-11-12 report "fuel shows in Transactions but not in
// Who we pay"): three months from RiseUp, the last one in progress, several fuel stations with weekly fill-ups, a car
// insurance, plus groceries, eating out, shopping, home bills and transfers. All names and amounts are invented.
// rows(months, {today}) returns finance rows in the client shape (amounts in agorot, negative = out).
export function fixtureRows(months,{today}={}){
 const out=[];let n=0;
 const add=(month,day,description,shekels,category,{kind='card',account='4821',standing=false,installmentN=null,installmentOf=null}={})=>{
  const date=month+'-'+String(day).padStart(2,'0');if(today&&date>today)return;
  out.push({id:'fx'+(++n),importId:'riseup:fixture',ownerId:'OWNER',visibility:'family',source:'riseup',account,memberId:'OWNER',date,chargeDate:date,month,description,amount:-Math.round(shekels*100),currency:'ILS',category,kind,standingOrder:standing,installmentN,installmentOf,foreign:false});
 };
 const income=(month,day,description,shekels,category)=>{const date=month+'-'+String(day).padStart(2,'0');if(today&&date>today)return;out.push({id:'fx'+(++n),importId:'riseup:fixture',ownerId:'OWNER',visibility:'family',source:'riseup',account:'',memberId:'OWNER',date,chargeDate:date,month,description,amount:Math.round(shekels*100),currency:'ILS',category,kind:'bank',standingOrder:false,foreign:false})};
 months.forEach((m,i)=>{
  income(m,1,'משכורת חברת הדוגמה',15000,'salary');income(m,10,'משכורת סטודיו לדוגמה',9000,'salary');
  add(m,2,'משכנתא בנק לדוגמה',3700,'mortgage',{kind:'bank',account:'',standing:true});
  add(m,3,'העברה לחשבון חיסכון',1000,'savings',{kind:'bank',account:'',standing:true});
  add(m,5,'העברה לבעל המקצוע',[2500,3100,2500][i%3],'transfers',{kind:'bank',account:''});
  add(m,6,'תרומה קבועה לעמותה',600,'gifts',{kind:'bank',account:'',standing:true});
  // Car & fuel: one station almost every week (different amounts), another now and then, car insurance monthly.
  [3,10,17,24].forEach((d,j)=>add(m,d,'תחנת דלק הגליל',[250,310,280,330,270,300][(i+j)%6],'car'));
  if(i!==1)add(m,14,'תחנת דלק השדרה',[180,240,210][i%3],'car',{account:'7730'});
  if(i===1)add(m,6,'תחנת דלק הפינה',220,'car',{account:'7730'});
  if(i===1)add(m,1,'אגרת נסיעה לדוגמה',45,'car');
  add(m,28,'ביטוח רכב לדוגמה',260,'car',{standing:true});
  if(i===2)add(m,1,'מוסך השכונה',750,'car');
  // Home bills and subscriptions that repeat.
  add(m,4,'חברת החשמל',[480,520,520][i%3],'utilities',{kind:'bank',account:'',standing:true});
  add(m,10,'חברת סלולר לדוגמה',120,'utilities');add(m,12,'מים לדוגמה',[70,80,80][i%3],'utilities');
  add(m,8,'קופת חולים',[310,310,310][i%3],'health',{kind:'bank',account:'',standing:true});
  add(m,15,'STREAMING SERVICE',45,'subscriptions');add(m,16,'CLOUD STORAGE',15,'subscriptions');
  add(m,20,'חוג ציור',280,'kids');add(m,22,'מכון כושר',150,'leisure');
  // Everyday spending: many shops, different each month.
  ['סופר השכונה','מרקט לדוגמה','ירקות ופירות','מאפיית הכפר'].forEach((s,j)=>[5,12,19,26].forEach(d=>add(m,d+j%2,s,[120,70,95,45,160,80][(d+j+i)%6],'groceries')));
  ['קפה הכיכר','פיצה לדוגמה','שווארמה טובה'].forEach((s,j)=>add(m,7+j*6,s,[60,110,85][(i+j)%3],'dining'));
  ['חנות בגדים','חנות צעצועים'].forEach((s,j)=>add(m,11+j*7,s,[200,140,300][(i+j)%3],'shopping'));
  add(m,18,'בית מרקחת',[90,120,60][i%3],'health');
  add(m,25,'שונות ללא פירוט',[300,900,200][i%3],'other');
 });
 return out;
}

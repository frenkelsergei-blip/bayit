// Exact parsers for the statement formats Bayit supports today: Bank Leumi account statements ("דף חשבון")
// and Max credit card statements ("פירוט החיובים בחשבון"). Input is positioned text rows (app/cloud/statement-pdf.mjs).
// All amounts are integers in agorot. Negative = money out. Every parser returns its own reconciliation checks.

const AMOUNT=/^-?[\d,]+\.\d{2}$/;
export const cents=value=>{const n=Math.round(Number(String(value).replace(/,/g,''))*100);return Number.isFinite(n)?n:null};
const isAmount=s=>AMOUNT.test(s);
const dmy=s=>{let m=/^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s);if(m)return '20'+m[3]+'-'+m[2]+'-'+m[1];m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);return m?m[3]+'-'+m[2]+'-'+m[1]:null};
const near=(items,x,tolerance=30)=>items.filter(i=>Math.abs(i.x-x)<=tolerance).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
const has=(row,...words)=>words.every(w=>row.items.some(i=>i.s.includes(w))||row.text.includes(w));
const last4=value=>String(value||'').replace(/\D/g,'').slice(-4);

export function detectFormat(rows){
 const text=rows.slice(0,40).map(r=>r.text).join('\n');
 if(text.includes('דף חשבון')&&rows.some(r=>has(r,'סוג תנועה')))return 'leumi';
 if(/max\.co\.il/i.test(text)||rows.some(r=>has(r,'פירוט','החיובים','לתאריך')))return 'max';
 return null;
}

export function parseStatement(rows){
 const format=detectFormat(rows);
 if(format==='leumi')return parseLeumi(rows);
 if(format==='max')return parseMax(rows);
 throw Object.assign(Error('This statement format is not supported yet. Bayit currently reads Bank Leumi account statements and Max card statements (PDF).'),{status:422});
}

// ---------- Bank Leumi ----------
export function parseLeumi(rows){
 const result={issuer:'leumi',kind:'bank',account:'',period:{from:'',to:''},transactions:[],checks:[]};
 let creditX=null,debitX=null;
 for(const row of rows){
  if(has(row,'מספר חשבון')){const number=row.items.map(i=>i.s).find(s=>/\d{3}-\d{5,}/.test(s));if(number)result.account=last4(number)}
  if(has(row,'לתקופה')){const dates=row.items.map(i=>dmy(i.s)).filter(Boolean);if(dates.length>=2)result.period={from:dates[0]<dates[1]?dates[0]:dates[1],to:dates[0]<dates[1]?dates[1]:dates[0]}}
  if(has(row,'סוג תנועה')){creditX=row.items.find(i=>i.s==='זכות')?.x??creditX;debitX=row.items.find(i=>i.s==='חובה')?.x??debitX;continue}
  const date=dmy(row.items[0]?.s);if(!date||creditX===null||debitX===null)continue;
  const amounts=row.items.filter(i=>isAmount(i.s));if(amounts.length<2)continue;
  const balance=amounts.reduce((a,b)=>a.x<b.x?a:b),amount=amounts.filter(i=>i!==balance).reduce((a,b)=>a.x>b.x?a:b);
  const credit=Math.abs(amount.x-creditX)<Math.abs(amount.x-debitX);
  const description=row.items.slice(1).filter(i=>i.x>Math.max(amount.x,creditX)+20&&i.s!=='₪').map(i=>i.s).join(' ').trim();
  result.transactions.push({date,description,amount:(credit?1:-1)*Math.abs(cents(amount.s)),balance:cents(balance.s),account:result.account});
 }
 // Sign check: each row's previous balance (balance − amount) must be another row's balance, except the earliest.
 const balances=new Set(result.transactions.map(t=>t.balance)),unmatched=result.transactions.filter(t=>!balances.has(t.balance-t.amount));
 result.checks.push({id:'leumi-balance-chain',ok:result.transactions.length>0&&unmatched.length<=1,detail:{rows:result.transactions.length,unmatched:unmatched.length}});
 const latest=result.transactions[0];if(latest)result.closingBalance={date:latest.date,amount:latest.balance};
 result.transactions.forEach((t,i)=>{t.seq=i});
 return result;
}

// ---------- Max ----------
export function parseMax(rows){
 const result={issuer:'max',kind:'card',statementDate:'',cards:[],checks:[]};
 let card=null,section=null,cols=null,pendingForeign=[],lastTx=null;
 const startCard=row=>{const number=row.items.find(i=>/^\d{4}$/.test(i.s));card={last4:number?.s||'',holder:'',transactions:[],groups:[]};result.cards.push(card);section=null;cols=null};
 for(let index=0;index<rows.length;index++){
  const row=rows[index],first=row.items[0]?.s||'';
  if(!result.statementDate&&has(row,'פירוט','לתאריך')){const d=row.items.map(i=>dmy(i.s)).find(Boolean);if(d)result.statementDate=d}
  if(has(row,'לכרטיס','שמסתיים')){startCard(row);continue}
  if(card&&!card.holder&&row.items[0]?.s==='ע"ש'){card.holder=row.items.slice(1).map(i=>i.s).join(' ');continue}
  if(!card)continue;
  if(has(row,'עסקות','בחו"ל')){section='foreign';cols=null;continue}
  if(has(row,'עסקות','בארץ')){section='domestic';cols=null;continue}
  if(section==='foreign'&&has(row,'המרה')){const sums=row.items.filter(i=>i.s==='סכום');cols={orig:Math.max(...sums.map(i=>i.x)),charge:Math.min(...sums.map(i=>i.x)),rate:row.items.find(i=>i.s==='המרה')?.x,chargeDate:row.items.find(i=>i.s==='החיוב')?.x,fee:row.items.find(i=>i.s==='עמלת')?.x,date:row.items.find(i=>i.s==='תאריך')?.x};continue}
  if(section==='domestic'&&has(row,'סוג','הערות')){const sums=row.items.filter(i=>i.s==='סכום');cols={type:row.items.find(i=>i.s==='סוג').x,txn:Math.max(...sums.map(i=>i.x)),charge:Math.min(...sums.map(i=>i.x)),notes:row.items.find(i=>i.s==='הערות').x,date:row.items.find(i=>i.s==='תאריך')?.x};continue}
  if(!cols)continue;
  if(first==='סה"כ'&&has(row,'חיובים','בתאריך')){
   const date=row.items.map(i=>dmy(i.s)).find(Boolean),amount=row.items.filter(i=>isAmount(i.s)).at(-1);
   if(section==='foreign'){const total=cents(amount?.s);for(const t of pendingForeign)t.chargeDate=date;card.groups.push({kind:'foreign',chargeDate:date,total,computed:pendingForeign.reduce((n,t)=>n+t.charge,0)});pendingForeign=[]}
   else card.groups.push({kind:'domestic',chargeDate:date,total:cents(amount?.s),computed:card.transactions.filter(t=>!t.foreign).reduce((n,t)=>n+t.charge,0)});
   lastTx=null;continue;
  }
  const dateItem=row.items.find(i=>dmy(i.s)&&Math.abs(i.x-(cols.date??497))<=25);
  if(!dateItem){
   // Wrapped merchant names continue on the next line inside the merchant column.
   if(lastTx&&section==='domestic'&&!row.items.some(i=>isAmount(i.s))){const extra=row.items.filter(i=>i.x>cols.type+30&&i.x<dateItemX(lastTx)).map(i=>i.s).join(' ');if(extra&&!isAmount(extra))lastTx.merchant=(lastTx.merchant+' '+extra).trim()}
   continue;
  }
  const date=dmy(dateItem.s);
  if(section==='domestic'){
   const merchantItems=row.items.filter(i=>i.x<dateItem.x-3&&i.x>cols.type+25),type=near(row.items,cols.type,25)?.s||'',amountItems=row.items.filter(i=>isAmount(i.s));
   const chargeItem=near(amountItems,cols.charge,22),txnItem=amountItems.find(i=>i!==chargeItem&&Math.abs(i.x-cols.txn)<=22);
   // The notes column only; the page's side banner (x < notes - 70) is not part of the transaction.
   const notes=row.items.filter(i=>i.x<cols.charge-15&&i.x>cols.notes-70&&!isAmount(i.s)).map(i=>i.s).join(' ').trim();
   if(!chargeItem)continue;
   const installment=/תשלום\s+(\d+)\s+מתוך\s+(\d+)/.exec(notes+' '+(rows[index+1]?.text||''));
   const tx={date,merchant:merchantItems.map(i=>i.s).join(' ').trim(),type:{'רגילה':'regular','תשלומים':'installments','קרדיט':'credit'}[type]||'regular',amount:txnItem?cents(txnItem.s):cents(chargeItem.s),charge:cents(chargeItem.s),foreign:false,currency:'ILS',standingOrder:/הוראת\s*קבע|קבע\s*הוראת/.test(notes),note:notes.slice(0,120),card:card.last4,_x:dateItem.x};
   if(installment)tx.installment={n:Number(installment[1]),of:Number(installment[2])};
   card.transactions.push(tx);lastTx=tx;
  }else{
   const amountItems=row.items.filter(i=>isAmount(i.s)),orig=near(amountItems,cols.orig,20),charge=near(amountItems,cols.charge,25),fee=cols.fee?near(amountItems.filter(i=>i!==orig&&i!==charge),cols.fee,15):null;
   const symbol=row.items.find(i=>['₪','$','€','£'].includes(i.s)&&orig&&i.x<orig.x&&i.x>orig.x-20)?.s||'₪';
   const nameItems=row.items.filter(i=>i.x<dateItem.x-3&&i.x>(orig?.x??cols.orig)+5&&!isAmount(i.s)),name=nameItems.filter(i=>i.x<=440).map(i=>i.s).join(' ').trim()||nameItems.map(i=>i.s).join(' ').trim();
   if(!charge)continue;
   const tx={date,merchant:name,type:'regular',amount:charge?cents(charge.s):0,charge:cents(charge.s),foreign:true,currency:{'₪':'ILS','$':'USD','€':'EUR','£':'GBP'}[symbol],originalAmount:orig?cents(orig.s):null,fee:fee?cents(fee.s):0,standingOrder:false,note:'',card:card.last4};
   card.transactions.push(tx);pendingForeign.push(tx);lastTx=null;
  }
 }
 for(const c of result.cards){
  for(const t of c.transactions){if(!t.chargeDate)t.chargeDate=c.groups.find(g=>g.kind==='domestic')?.chargeDate||result.statementDate;delete t._x}
  for(const g of c.groups)result.checks.push({id:'max-'+c.last4+'-'+g.kind+'-'+g.chargeDate,ok:g.total===g.computed,detail:{card:c.last4,kind:g.kind,chargeDate:g.chargeDate,printed:g.total,computed:g.computed}});
 }
 result.checks.push({id:'max-cards',ok:result.cards.length>0&&result.cards.every(c=>c.transactions.length>0||c.groups.length>0),detail:{cards:result.cards.length}});
 return result;
}
function dateItemX(tx){return (tx&&tx._x)||497}

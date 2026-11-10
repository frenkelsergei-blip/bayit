// Statement format "My Bank" (extension my-bank, docs/extension-skills.md).
// Input: positioned text rows from app/cloud/statement-pdf.mjs, each {text, items:[{s, x}]}.
// Output: the shape of parseLeumi (kind 'bank') or parseMax (kind 'card') in shared/finance-parse.mjs.
// Amounts are integers in agorot/cents, negative for money out. Columns come from the header row's x-positions,
// never from text order. Every printed total gets a check; a failing check shows in the import preview.
const AMOUNT=/^-?[\d,]+\.\d{2}$/,cents=s=>Math.round(Number(String(s).replace(/,/g,''))*100);
const dmy=s=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s||'');return m?m[3]+'-'+m[2]+'-'+m[1]:null};
const near=(items,x)=>items.filter(i=>Math.abs(i.x-x)<=30).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
export const MY_BANK={
 id:'my-bank',
 name:'My Bank',
 // A marker only this bank prints near the top: its name or the statement title.
 detect:rows=>rows.slice(0,40).some(r=>r.text.includes('MY BANK ACCOUNT STATEMENT')),
 parse(rows){
  const result={issuer:'my-bank',kind:'bank',account:'',period:{from:'',to:''},transactions:[],checks:[]};
  let cols=null,closing=null;
  for(const row of rows){
   const find=w=>row.items.find(i=>i.s===w)?.x;
   if(row.text.includes('Account no.'))result.account=(row.items.map(i=>i.s).find(s=>/\d{4,}/.test(s))||'').replace(/\D/g,'').slice(-4);
   if(find('Date')!==undefined&&find('Amount')!==undefined){cols={amount:find('Amount'),balance:find('Balance')};continue}
   if(row.text.startsWith('Closing balance')){const a=row.items.find(i=>AMOUNT.test(i.s));if(a)closing=cents(a.s)}
   const date=dmy(row.items[0]?.s);if(!date||!cols)continue;
   const amount=near(row.items,cols.amount),balance=near(row.items,cols.balance);
   if(!amount||!balance||!AMOUNT.test(amount.s)||!AMOUNT.test(balance.s))continue;
   const description=row.items.slice(1).filter(i=>i!==amount&&i!==balance).map(i=>i.s).join(' ').trim();
   result.transactions.push({date,description,amount:cents(amount.s),balance:cents(balance.s),account:result.account});
  }
  const t=result.transactions;
  if(t.length)result.period={from:t[0].date,to:t.at(-1).date};
  result.checks.push({id:'my-bank-balance-chain',ok:t.length>0&&t.every((x,i)=>i===0||t[i-1].balance+x.amount===x.balance),detail:{rows:t.length}});
  result.checks.push({id:'my-bank-closing-balance',ok:closing!==null&&t.at(-1)?.balance===closing,detail:{printed:closing,computed:t.at(-1)?.balance??null}});
  if(t.length)result.closingBalance={date:t.at(-1).date,amount:t.at(-1).balance};
  t.forEach((x,i)=>{x.seq=i});
  return result;
 },
};

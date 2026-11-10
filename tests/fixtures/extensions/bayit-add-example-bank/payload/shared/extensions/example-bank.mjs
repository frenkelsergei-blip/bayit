// Statement format for the fictional "Bayit Example Bank" (extension example-bank, docs/extension-skills.md).
// Rows come from app/cloud/statement-pdf.mjs: {text, items:[{s, x}]}. Amounts are integers in agorot/cents,
// negative for money out. Layout: a title row, then "YYYY-MM-DD  description…  amount  balance" rows, then
// "Closing balance  N". The checks reconcile the running balance and the printed closing balance.
const AMOUNT=/^-?\d+(\.\d{2})?$/,cents=s=>Math.round(Number(s)*100);
export const EXAMPLE_BANK={
 id:'example-bank',
 name:'Bayit Example Bank',
 detect:rows=>rows.slice(0,5).some(r=>r.text.includes('BAYIT EXAMPLE BANK STATEMENT')),
 parse(rows){
  const result={issuer:'example-bank',kind:'bank',account:'',period:{from:'',to:''},transactions:[],checks:[]};
  let closing=null;
  for(const row of rows){
   const words=row.items.map(i=>i.s);
   if(words[0]==='Account'&&/^\d{4}$/.test(words[1]||''))result.account=words[1];
   if(row.text.startsWith('Closing balance')&&AMOUNT.test(words.at(-1)))closing=cents(words.at(-1));
   if(!/^\d{4}-\d{2}-\d{2}$/.test(words[0]||'')||words.length<4||!AMOUNT.test(words.at(-1))||!AMOUNT.test(words.at(-2)))continue;
   result.transactions.push({date:words[0],description:words.slice(1,-2).join(' '),amount:cents(words.at(-2)),balance:cents(words.at(-1)),account:result.account});
  }
  const t=result.transactions;
  if(t.length)result.period={from:t[0].date,to:t.at(-1).date};
  const chain=t.every((x,i)=>i===0||t[i-1].balance+x.amount===x.balance);
  result.checks.push({id:'example-bank-balance-chain',ok:t.length>0&&chain,detail:{rows:t.length}});
  result.checks.push({id:'example-bank-closing-balance',ok:closing!==null&&t.length>0&&t.at(-1).balance===closing,detail:{printed:closing,computed:t.at(-1)?.balance??null}});
  if(t.length)result.closingBalance={date:t.at(-1).date,amount:t.at(-1).balance};
  t.forEach((x,i)=>{x.seq=i});
  return result;
 },
};

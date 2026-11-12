// Shopping receipts (2026-11-11, concept C round 2): a photographed receipt, read by the household's own AI provider
// as a DRAFT, checked by a person, then saved as a `receipts` record (adults only). Prices exist only for receipts the
// family photographed; a statement gives totals per shop, never item prices. Pure functions, shared by server and app.
import {productKey} from './shopping-rhythm.mjs';
import {CATEGORY} from './finance.mjs';

export const receiptTool={name:'read_receipt',description:'Read one shop receipt into its lines. Only what is printed; unreadable values stay absent.',
 input_schema:{type:'object',additionalProperties:false,required:['store','lines'],properties:{
  store:{type:'string',description:'Shop name and branch as printed'},date:{type:'string',description:'YYYY-MM-DD if printed'},time:{type:'string',description:'HH:MM if printed'},
  total:{type:'number',description:'Total paid, as printed'},currency:{type:'string'},
  lines:{type:'array',maxItems:150,items:{type:'object',additionalProperties:false,required:['raw','price'],properties:{
   raw:{type:'string',description:'The line exactly as printed'},name:{type:'string',description:'Plain product name in the receipt language, e.g. "עגבניות שרי"'},
   quantity:{type:'number'},unit:{type:'string',enum:['items','kg']},unitPrice:{type:'number'},price:{type:'number',description:'Line total'}}}}}}};

const num=(v,max=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?Math.round(v*100)/100:undefined;
const str=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):'';
export function normalizeReceipt(value){
 if(!value||!Array.isArray(value.lines)||value.lines.length>150)throw Error('Invalid receipt.');
 const lines=value.lines.map(l=>{const raw=str(l?.raw,200),price=num(l?.price,100000);if(!raw||price===undefined)return null;const name=str(l.name,80)||raw;
  return {raw,name,key:productKey({title:name}),quantity:num(l.quantity,10000)??1,unit:l.unit==='kg'?'kg':'items',unitPrice:num(l.unitPrice,100000),price}}).filter(Boolean);
 if(!lines.length)throw Error('No receipt lines were read.');
 const sum=Math.round(lines.reduce((s,l)=>s+l.price,0)*100)/100,total=num(value.total);
 return {store:str(value.store,120),date:/^\d{4}-\d{2}-\d{2}$/.test(value.date||'')?value.date:'',time:/^\d{2}:\d{2}$/.test(value.time||'')?value.time:'',
  total:total??sum,sum,currency:str(value.currency,8)||'ILS',lines,checked:total===undefined||Math.abs(total-sum)<=Math.max(1,total*.02)};
}

// Which list item each line belongs to: the same product key; otherwise left for a person to confirm once ("Correct?").
// A confirmed line is saved with confirmed:true; the next receipt with the same printed text takes that name without
// asking again (2026-11-12). `memory` comes from rememberedNames over the receipts this adult can already see.
export const rawKey=raw=>String(raw||'').toLowerCase().replace(/[\s"'`׳״.,*\-]+/g,' ').trim();
export function rememberedNames(receipts){
 const m=new Map();for(const r of [...(receipts||[])].sort((x,y)=>String(x.createdAt||'').localeCompare(String(y.createdAt||''))))for(const l of r.lines||[])if(l?.confirmed&&l.raw&&l.name)m.set(rawKey(l.raw),{name:l.name,key:l.key||productKey({title:l.name})});
 return m;
}
export function matchLines(lines,items,memory=new Map()){
 const keys=new Map(items.map(i=>[productKey(i),i]));
 return lines.map(l=>{const known=memory.get(rawKey(l.raw)),line=known?{...l,name:known.name,key:known.key,confirmed:true}:l;
  return {...line,itemId:keys.get(line.key)?.id||null,onList:keys.has(line.key),sure:Boolean(known)||keys.has(line.key)}});
}

// Price history of one product from saved receipts (newest first), with the cheapest, the dearest and per shop.
export function priceHistory(receipts,key){
 const rows=[];for(const r of receipts)for(const l of r.lines||[])if(l.key===key&&l.price>0){const per=l.unitPrice??(l.quantity>0?Math.round(l.price/l.quantity*100)/100:l.price);rows.push({date:r.shopDate||r.date||'',store:r.store||'',price:l.price,per,unit:l.unit||'items'})}
 rows.sort((a,b)=>b.date.localeCompare(a.date));if(!rows.length)return null;
 const by=(f)=>rows.reduce((x,y)=>f(y.per,x.per)?y:x);
 const stores=[...new Set(rows.map(r=>r.store))].map(store=>{const s=rows.filter(r=>r.store===store);return {store,count:s.length,average:Math.round(s.reduce((t,r)=>t+r.per,0)/s.length*100)/100}});
 return {rows,cheapest:by((a,b)=>a<b),dearest:by((a,b)=>a>b),last:rows[0],stores};
}

// Supermarket spending from statements: this month to date against the same days last month (amounts in agorot,
// negative = money out, as in shared/finance.mjs). "updatedTo" is the newest imported row, so a missing week is visible.
export function groceriesMonth(transactions,today){
 const rows=(transactions||[]).filter(t=>t.category==='groceries'&&Number(t.amount)<0&&t.date);
 if(!rows.length)return null;
 const month=today.slice(0,7),day=today.slice(8,10),last=new Date(Date.parse(month+'-01T12:00:00Z')-86400000).toISOString().slice(0,7);
 const sum=list=>Math.round(-list.reduce((s,t)=>s+Number(t.amount),0))/100;
 return {thisMonth:sum(rows.filter(t=>t.date.slice(0,7)===month&&t.date<=today)),lastMonthToDate:sum(rows.filter(t=>t.date.slice(0,7)===last&&t.date.slice(8,10)<=day)),updatedTo:rows.map(t=>t.date).sort().at(-1),label:CATEGORY.groceries};
}

// The statement row that is probably this receipt: a groceries row on the same day or the next, same amount (±1 ₪).
export function matchExpense(receipt,transactions){
 if(!receipt?.total||!receipt.date)return null;const day=Date.parse(receipt.date+'T12:00:00Z');
 return (transactions||[]).find(t=>Number(t.amount)<0&&Math.abs(-Number(t.amount)/100-receipt.total)<=1&&t.date&&Math.abs(Date.parse(t.date+'T12:00:00Z')-day)<=86400000)||null;
}

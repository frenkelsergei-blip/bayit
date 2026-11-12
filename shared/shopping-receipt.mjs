// Shopping receipts (2026-11-11, concept C round 2): a photographed receipt, read by the household's own AI provider
// as a DRAFT, checked by a person, then saved as a `receipts` record (adults only). Prices exist only for receipts the
// family photographed; a statement gives totals per shop, never item prices. Pure functions, shared by server and app.
import {productKey} from './shopping-rhythm.mjs';
import {CATEGORY} from './finance.mjs';

export const receiptTool={name:'read_receipt',description:'Read one shop receipt into its lines. Only what is printed; unreadable values stay absent.',
 input_schema:{type:'object',additionalProperties:false,required:['store','lines'],properties:{
  store:{type:'string',description:'Shop name and branch as printed'},date:{type:'string',description:'YYYY-MM-DD if printed'},time:{type:'string',description:'HH:MM if printed'},
  total:{type:'number',description:'What the goods cost: the total after item and whole-receipt discounts, before any payment. Never the amount left to pay after vouchers or meal cards, and never one card\'s charge'},
  subtotal:{type:'number',description:'The printed subtotal of the lines, e.g. "סיכום ביניים", if printed'},
  discount:{type:'number',description:'A discount on the whole receipt that lowers what the goods cost and is NOT already a line (e.g. a coupon on the bill). Positive number'},
  payments:{type:'array',maxItems:10,description:'How it was paid, if printed',items:{type:'object',additionalProperties:false,required:['method','amount'],properties:{
   method:{type:'string',enum:['card','cash','meal card','voucher','gift card','points','other']},amount:{type:'number',description:'Positive amount paid this way'}}}},
  charged:{type:'number',description:'The amount left to pay by card or cash after vouchers and meal cards, e.g. "לתשלום", if printed'},
  currency:{type:'string'},
  lines:{type:'array',maxItems:150,items:{type:'object',additionalProperties:false,required:['raw','price'],properties:{
   raw:{type:'string',description:'The line exactly as printed'},name:{type:'string',description:'Plain product name in the receipt language, e.g. "עגבניות שרי"'},
   quantity:{type:'number'},unit:{type:'string',enum:['items','kg']},unitPrice:{type:'number'},price:{type:'number',description:'Line total; negative for a discount, offset or return line printed with a minus sign'},
   y:{type:'number',description:'Where this line is on the photo, from 0 (top of the receipt) to 1 (bottom), approximate'}}}}}}};

// What the receipt cost (owner report 2026-11-12): a receipt paid partly by meal card (Cibus) was saved with only the part
// charged to the credit card instead of what the shop cost. The rule does not depend on the model: the total is
// what the lines add up to (item discounts included, as negative lines), less a whole-receipt discount, when that sum
// matches a printed total or subtotal, or matches what was charged once vouchers and meal cards are taken off. Vouchers,
// meal cards (Cibus, Ten Bis, "תו"), gift cards and points are how it was paid, never a reduction of the total.
export const VOUCHER_METHODS=['meal card','voucher','gift card','points'];

const num=(v,max=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?Math.round(v*100)/100:undefined;
const signed=(v,max)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max?Math.round(v*100)/100:undefined;
const cents=v=>Math.round(v*100)/100;
const str=(v,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):'';
export function normalizeReceipt(value){
 if(!value||!Array.isArray(value.lines)||value.lines.length>150)throw Error('Invalid receipt.');
 // A negative line (a line discount, a packaging offset) belongs to the product above it: that product's price is what was paid.
 const lines=[];let sum=0;
 for(const l of value.lines){const raw=str(l?.raw,200),price=signed(l?.price,100000);if(!raw||price===undefined)continue;sum+=price;
  if(price<0){const product=[...lines].reverse().find(x=>x.price+price>=0);if(product){product.price=cents(product.price+price);product.discount=cents((product.discount||0)-price)}continue}
  const name=str(l.name,80)||raw,y=typeof l.y==='number'&&l.y>=0&&l.y<=1?Math.round(l.y*1000)/1000:undefined;lines.push({raw,name,key:productKey({title:name}),quantity:num(l.quantity,10000)??1,unit:l.unit==='kg'?'kg':'items',unitPrice:num(l.unitPrice,100000),price,...(y!==undefined?{y}:{})})}
 if(!lines.length)throw Error('No receipt lines were read.');
 sum=cents(sum);const printed=[num(value.total),num(value.subtotal)].filter(v=>v!==undefined),discount=num(value.discount)||0;
 const payments=(Array.isArray(value.payments)?value.payments:[]).slice(0,10).map(p=>({method:VOUCHER_METHODS.includes(p?.method)||['card','cash','other'].includes(p?.method)?p.method:'other',amount:num(p?.amount)})).filter(p=>p.amount);
 const other=cents(payments.filter(p=>VOUCHER_METHODS.includes(p.method)).reduce((s,p)=>s+p.amount,0)),rest=payments.filter(p=>!VOUCHER_METHODS.includes(p.method));
 const charged=num(value.charged)??(other&&rest.length?cents(rest.reduce((s,p)=>s+p.amount,0)):undefined);
 const near=(x,y)=>Math.abs(x-y)<=Math.max(.05,Math.min(1,y*.005));
 const total=[...(discount?[cents(sum-discount)]:[]),sum].find(c=>printed.some(p=>near(p,c))||other>0&&charged!==undefined&&near(cents(c-other),charged));
 const chosen=total??num(value.subtotal)??num(value.total)??sum;
 return {store:str(value.store,120),date:/^\d{4}-\d{2}-\d{2}$/.test(value.date||'')?value.date:'',time:/^\d{2}:\d{2}$/.test(value.time||'')?value.time:'',
  total:chosen,sum,currency:str(value.currency,8)||'ILS',lines,checked:total!==undefined||!printed.length&&!other,
  // How it was paid, kept only when part was paid by meal card or voucher (adults only, like the receipt itself).
  ...(other>0&&total!==undefined?{paidOther:other,charged:charged??cents(total-other)}:{})};
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

// Which product a receipt line is, for prices over time (owner report 2026-11-12: kebab, hamburgers and picanha were one
// "beef" row, portobello and champignon one "mushrooms" row). The printed barcode when there is one, otherwise the printed
// text without prices and shop codes; never the list item, icon or category the line was matched to. Computed when read,
// so receipts saved before need no repair.
export function productId(line){
 const raw=String(line?.raw||''),code=raw.match(/(?:^|\D)(\d{7,14})(?!\d)(?![.,]\d)/);if(code)return 'c:'+code[1];
 const text=rawKey(raw.replace(/-?\d+[.,]\d+/g,' ').replace(/\b\d{4,}\b/g,' '));return text?'n:'+text:'k:'+(line?.key||'');
}
// "Per kg" only for a line that was really weighed (a printed price per kg, or a weight other than 1); a pack ("1 kg"
// frozen kebab, 2 hamburgers) is its pack price. A line discount is in the line's price, so a weighed line's per-kg price
// is what was paid per kg.
export const weighed=l=>l?.unit==='kg'&&(l.unitPrice>0||l.quantity>0&&l.quantity!==1);
const perOf=l=>weighed(l)?(l.discount||!(l.unitPrice>0)?Math.round(l.price/l.quantity*100)/100:l.unitPrice):l.price;
// Price history of one product (productId) from saved receipts (newest first), with the cheapest, the dearest and per shop.
export function priceHistory(receipts,id){
 const rows=[];for(const r of receipts)for(const l of r.lines||[])if(productId(l)===id&&l.price>0)rows.push({date:r.shopDate||r.date||'',store:r.store||'',price:l.price,per:perOf(l),unit:weighed(l)?'kg':'items',name:l.name||''});
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
 // A statement row is what the card was charged: after a meal card or voucher that is `charged`, not the total.
 const amount=receipt?.charged??receipt?.total;if(!amount||!receipt.date)return null;const day=Date.parse(receipt.date+'T12:00:00Z');
 return (transactions||[]).find(t=>Number(t.amount)<0&&Math.abs(-Number(t.amount)/100-amount)<=1&&t.date&&Math.abs(Date.parse(t.date+'T12:00:00Z')-day)<=86400000)||null;
}

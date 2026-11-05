// RiseUp connection (optional). RiseUp is a licensed Israeli financial-information service that already connects
// banks and card companies (Leumi, Max, Isracard, ...). Each adult connects their own RiseUp account with a
// read-only Personal Access Token. Everything RiseUp-specific lives in this file: when RiseUp changes its
// external API, update RISEUP_API_VERSION, the mapping below and tests/riseup.test.mjs, then release.
// API reference: the official @riseup-oss/mcp package (MIT), https://github.com/riseup-oss/mcp
import {fail,hash,encryptKey,decryptKey,localDate,loopbackOr} from './util.mjs';
import {categorize,normalizeName,CATEGORY} from '../../shared/finance.mjs';

export const RISEUP_API_VERSION='external-api, matching @riseup-oss/mcp 0.7.0';
const BASE='https://input.riseup.co.il',TOKENS_URL='https://input.riseup.co.il/developer/tokens',PREFIX='riseup_pat_';
const aad=(householdId,memberId)=>'riseup:'+householdId+':'+memberId;

async function riseupGet(env,token,path){
 const base=loopbackOr(env.RISEUP_TEST_ORIGIN,BASE);let response;
 try{response=await fetch(base+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(30000)})}
 catch{throw Object.assign(fail('RiseUp could not be reached. Nothing was changed.',502),{transient:true})}
 if(response.status===401)throw fail('RiseUp rejected the token. It may have been revoked; create a new one at '+TOKENS_URL+'.',400);
 if(response.status===403){let need='';try{const b=await response.json();need=b.required?' ('+b.required+')':''}catch{}throw Object.assign(fail('This RiseUp token is missing a permission'+need+'. Create a token with “תקציב” (budget) selected.',400),{scope:true})}
 if(!response.ok)throw Object.assign(fail('RiseUp returned an error ('+response.status+'). Nothing was changed.',502),{transient:response.status>=500||response.status===429});
 return response.json();
}

// RiseUp category labels and expense types (Hebrew) mapped to Bayit categories. Anything unknown falls back to Bayit's own rules.
const CATEGORY_MAP=[
 // Order matters: "מסעדות" (restaurants) must win before taxes, and taxes match whole words only ("מס" is also the start of other words).
 ['savings',/חיסכון|פנסיה|גמל|השתלמות|השקע/],['mortgage',/משכנת|שכירות|שכר דירה|דיור/],['dining',/מסעד|בתי קפה|אוכל בחוץ|משלוחי אוכל|בילוי.*אוכל/],['taxes',/(^|\s)(מס|מסים|מיסים|ארנונה)($|\s)|מס הכנסה|ביטוח לאומי|אגר/],
 ['insurance',/ביטוח/],['health',/בריאות|פארם|רפוא|קופת חולים|תרופות/],['groceries',/מזון|סופר|מכולת|קניות לבית/],
 ['car',/רכב|דלק|תחבורה|חניה|כביש/],['utilities',/חשמל|מים|גז|תקשורת|סלולר|אינטרנט|טלוויזיה|חשבונות/],['kids',/ילדים|חינוך|גן|צהרון|חוגים|בית ספר/],
 ['subscriptions',/מנוי|דיגיטל|אפליקציות|סטרימינג/],['leisure',/פנאי|ספורט|בילוי|תרבות|חופש|נופש|טיול/],['home',/בית|ריהוט|תחזוקה|ניקיון/],
 ['shopping',/ביגוד|הנעלה|קניות|אופנה|אלקטרוניקה/],['gifts',/מתנ|תרומ/],['fees',/עמל/],['transfers',/העבר|מזומן|ביט|פייבוקס|צ׳ק|צ'ק|שיק/]
];
export function riseupCategory(t,rules={}){
 const key=normalizeName(t.businessName);if(rules[key])return rules[key];
 const label=[t.categoryType==='other'?'':t.categoryLabel,t.expenseType].filter(Boolean).join(' ');
 if(t.isIncome){if(/משכורת|שכר/.test(label))return 'salary';if(/קצב|החזר|ביטוח לאומי|מענק/.test(label))return 'benefits';return categorize(t.businessName,{credit:true,rules})}
 for(const [category,pattern]of CATEGORY_MAP)if(pattern.test(label))return category;
 return categorize(t.businessName||'',{rules});
}

// One RiseUp transaction as a Bayit money row. RiseUp's own cashflow month is kept, so card payments are never double counted.
export function rowFromRiseup(t,rules={}){
 const amount=Math.round(Math.abs(Number(t.amount)||0)*100),day=v=>v?String(v).slice(0,10):null;
 const category=riseupCategory(t,rules),date=day(t.transactionDate)||(t.cashflowDate+'-01');
 return {source:'riseup',externalId:String(t.transactionId),account:t.accountNumberHash||'',accountLabel:t.accountNickname||t.source||'',sourceType:t.sourceType||'',date,chargeDate:day(t.billingDate)||date,month:t.cashflowDate||date.slice(0,7),description:String(t.businessName||t.paymentAppAddressee||'').trim().slice(0,160)||'—',amount:t.isIncome?amount:-amount,category,kind:t.sourceType==='creditCard'?'card':'bank',standingOrder:t.actualType==='fixed'||!!t.commitmentId,installmentN:t.isInstallment?Number(t.installmentNumber)||null:null,installmentOf:t.isInstallment?Number(t.totalNumberOfInstallments||t.totalNumberOfPayments)||null:null,excluded:!!t.isExcluded};
}

const monthsBack=(n,now=new Date())=>{const [y,m]=localDate(now).slice(0,7).split('-').map(Number);return Array.from({length:n},(_,i)=>new Date(Date.UTC(y,m-1-i,1)).toISOString().slice(0,7))};

// Pull the chosen months, upsert by RiseUp's transaction id, drop rows RiseUp no longer has (or excludes), keep Bayit category edits.
export async function syncRiseup(env,{householdId,memberId,token,visibility,allowedIds,months=3,adults=[]},now=new Date()){
 const rules=Object.fromEntries((await env.DB.prepare('SELECT name_key,category FROM finance_rules WHERE household_id=?').bind(householdId).all()).results.map(r=>[r.name_key,r.category]));
 const importId='riseup:'+memberId,allowed=JSON.stringify(allowedIds||[]),stamp=now.getTime();let count=0;
 const owners=new Set(adults);
 for(const month of monthsBack(Math.max(1,Math.min(12,months)),now)){
  const data=await riseupGet(env,token,'/api/external/transactions?cashflowMonth='+month);
  const rows=(data.transactions||[]).map(t=>rowFromRiseup(t,rules)),keep=[];
  const statements=[];
  for(const r of rows){
   if(r.excluded)continue;const fingerprint=await hash(householdId+'|riseup|'+memberId+'|'+r.externalId);keep.push(fingerprint);count++;
   statements.push(env.DB.prepare(`INSERT INTO finance_transactions(id,household_id,import_id,owner_id,visibility,allowed_ids,source,account,member_id,date,charge_date,month,description,name_key,amount,currency,category,kind,card_issuer,installment_n,installment_of,standing_order,foreign_tx,fingerprint,created_at) VALUES(?,?,?,?,?,?,'riseup',?,?,?,?,?,?,?,?,'ILS',?,?,?,?,?,?,0,?,?)
     ON CONFLICT(household_id,fingerprint) DO UPDATE SET category=CASE WHEN finance_transactions.category='taxes' AND excluded.category!='taxes' THEN excluded.category ELSE finance_transactions.category END,visibility=excluded.visibility,allowed_ids=excluded.allowed_ids,account=excluded.account,date=excluded.date,charge_date=excluded.charge_date,month=excluded.month,description=excluded.description,name_key=excluded.name_key,amount=excluded.amount,kind=excluded.kind,card_issuer=excluded.card_issuer,installment_n=excluded.installment_n,installment_of=excluded.installment_of,standing_order=excluded.standing_order`).bind(crypto.randomUUID(),householdId,importId,memberId,visibility,allowed,r.account,owners.has(memberId)?memberId:null,r.date,r.chargeDate,r.month,r.description,normalizeName(r.description),r.amount,r.category,r.kind,r.accountLabel||null,r.installmentN,r.installmentOf,r.standingOrder?1:0,fingerprint,stamp));
  }
  // An empty month is left alone (a RiseUp hiccup must not wipe a month); otherwise rows RiseUp no longer returns are removed.
  if(keep.length)statements.push(env.DB.prepare("DELETE FROM finance_transactions WHERE household_id=? AND import_id=? AND month=? AND fingerprint NOT IN ("+keep.map(()=>'?').join(',')+")").bind(householdId,importId,month,...keep));
  for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
 }
 let balances=null;try{balances=(await riseupGet(env,token,'/api/external/balances/current')).balances||null}catch(e){if(!e.scope)throw e}
 return {count,balances:balances?balances.map(b=>({source:b.source,label:b.accountNickname||b.source,account:b.accountNumberHash,balance:Math.round(Number(b.balance)*100),lastUpdated:b.lastUpdated})):null};
}

// "Both parents" means every adult in the home, now and later (see sharing() in finance.mjs).
const sharingFor=(adults,memberId,visibility)=>visibility==='private'?{visibility:'private',allowed:[]}:{visibility:'family',allowed:[]};

export async function connectRiseup(env,{home,memberId,adults,token,visibility,months,preferOverStatements=true}){
 token=String(token||'').trim();if(!token.startsWith(PREFIX)||token.length<20||token.length>400)throw fail('Paste the RiseUp token (it starts with riseup_pat_).');
 const share=sharingFor(adults,memberId,visibility),monthsN=Math.max(1,Math.min(12,Number(months)||3));
 const result=await syncRiseup(env,{householdId:home.id,memberId,token,visibility:share.visibility,allowedIds:share.allowed,months:monthsN,adults});
 const ciphertext=await encryptKey(token,env,aad(home.id,memberId)),now=Date.now();
 await env.DB.prepare(`INSERT INTO finance_connections(household_id,member_id,provider,ciphertext,scopes,visibility,allowed_ids,months_back,prefer_over_statements,status,last_error,last_sync_at,last_count,balances,created_at) VALUES(?,?,'riseup',?,?,?,?,?,?,'ok',NULL,?,?,?,?)
  ON CONFLICT(household_id,member_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,scopes=excluded.scopes,visibility=excluded.visibility,allowed_ids=excluded.allowed_ids,months_back=excluded.months_back,prefer_over_statements=excluded.prefer_over_statements,status='ok',last_error=NULL,last_sync_at=excluded.last_sync_at,last_count=excluded.last_count,balances=excluded.balances`).bind(home.id,memberId,ciphertext,JSON.stringify(result.balances?['budget:read','balances:read']:['budget:read']),share.visibility,JSON.stringify(share.allowed),monthsN,preferOverStatements?1:0,now,result.count,result.balances?JSON.stringify(result.balances):null,now).run();
 return result;
}

export async function syncConnection(env,row,adults){
 const token=await decryptKey(row.ciphertext,env,aad(row.household_id,row.member_id));
 try{
  const result=await syncRiseup(env,{householdId:row.household_id,memberId:row.member_id,token,visibility:row.visibility,allowedIds:JSON.parse(row.allowed_ids||'[]'),months:row.months_back,adults});
  await env.DB.prepare("UPDATE finance_connections SET status='ok',last_error=NULL,last_sync_at=?,last_count=?,balances=COALESCE(?,balances) WHERE household_id=? AND member_id=? AND provider='riseup'").bind(Date.now(),result.count,result.balances?JSON.stringify(result.balances):null,row.household_id,row.member_id).run();
  return result;
 }catch(error){
  await env.DB.prepare("UPDATE finance_connections SET status=?,last_error=? WHERE household_id=? AND member_id=? AND provider='riseup'").bind(error.transient?'retrying':'error',String(error.message).slice(0,240),row.household_id,row.member_id).run();
  throw error;
 }
}

// Daily refresh from the scheduler: at most a couple of connections per minute tick. A connection that failed
// temporarily waits an hour before the next try; one that needs the owner's attention (revoked token) is not retried.
export async function refreshDueConnections(env,now=new Date(),limit=2){
 const t=now.getTime(),due=(await env.DB.prepare("SELECT * FROM finance_connections WHERE provider='riseup' AND status!='error' AND (last_sync_at IS NULL OR last_sync_at<?) AND (last_attempt_at IS NULL OR last_attempt_at<?) ORDER BY last_sync_at LIMIT ?").bind(t-20*3600000,t-3600000,limit).all()).results;
 let synced=0;for(const row of due){
  const adults=(await env.DB.prepare("SELECT member_id FROM memberships WHERE household_id=? AND role!='child'").bind(row.household_id).all()).results.map(r=>r.member_id);
  if(!adults.includes(row.member_id)){await env.DB.prepare("UPDATE finance_connections SET status='error',last_error=? WHERE household_id=? AND member_id=? AND provider='riseup'").bind('The person who connected RiseUp is no longer an adult member of this home.',row.household_id,row.member_id).run();continue}
  await env.DB.prepare("UPDATE finance_connections SET last_attempt_at=? WHERE household_id=? AND member_id=? AND provider='riseup'").bind(t,row.household_id,row.member_id).run();
  try{await syncConnection(env,row,adults);synced++}catch{}
 }
 return synced;
}

export {TOKENS_URL as RISEUP_TOKENS_URL};

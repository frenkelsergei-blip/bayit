// Payment sources: which card or bank account a money row came from, whatever the import path
// (RiseUp, a PDF statement, or recorded by hand). Pure functions, shared by the app, the server and tests.
//
// What each path stores (finance_transactions):
//  - PDF statement: source = parser id ('max' | 'leumi'), account = last 4 digits ('' when the statement does not say),
//    kind = 'card' | 'bank' | 'card_payment' (a bank row paying a card; card_issuer = the card company).
//  - RiseUp: source = 'riseup', account = RiseUp's opaque 6-character account code (NOT digits), kind = 'card' | 'bank'.
//    card_issuer = RiseUp's institution id ('max', 'leumiBank', 'poalim'…); account_label = the nickname the person set
//    in RiseUp (migration 0018). Rows synced before 0018 have card_issuer = nickname || institution id.
//  - Manual: source = 'manual'; an optional paymentSource names the source key it was paid with.
// The issuer is recognised from any of these texts. An unknown institution (another country, a new bank, a wallet)
// still becomes its own source with a neutral look, so nothing depends on a hand-made list.

// Israeli issuers. Colours are approximate brand colours for original, simple marks (never the issuer's logo).
// mark: short text drawn on the mark; motif: the mark's accent shape.
export const ISSUERS=[
 {id:'max',kind:'card',en:'Max',he:'מקס',mark:'max',bg:'#0E1B3D',accent:'#19C3B4',motif:'arc',match:/(^|[^a-z])max([^a-z]|$)|מקס|leumi ?card|leumicard|לאומי ?קארד/i},
 {id:'isracard',kind:'card',en:'Isracard',he:'ישראכרט',mark:'IC',bg:'#042A59',accent:'#E2231A',motif:'stripe',match:/isra ?card|ישראכרט/i},
 {id:'cal',kind:'card',en:'Cal',he:'כאל',mark:'cal',bg:'#0A4573',accent:'#00B6AD',motif:'wave',match:/visa ?cal|(^|[^a-z])cal([^a-z]|$)|כאל|ויזה כאל/i},
 {id:'amex',kind:'card',en:'American Express',he:'אמריקן אקספרס',mark:'AX',bg:'#016FD0',accent:'#9FD3FF',motif:'ring',match:/amex|american ?express|אמריקן ?אקספרס/i},
 {id:'diners',kind:'card',en:'Diners',he:'דיינרס',mark:'DC',bg:'#123E7A',accent:'#7FB2E5',motif:'dot',match:/diners|דיינרס/i},
 // "Beinleumi" / "הבינלאומי" contain leumi / לאומי, and "Leumi Card" is Max: the lookarounds keep them apart.
 {id:'leumi',kind:'bank',en:'Bank Leumi',he:'בנק לאומי',mark:'ל',bg:'#0B67B2',accent:'#5EC8F2',motif:'arc',match:/(?<!bein)leumi(?! ?card)|(?<!בינ)לאומי(?! ?קארד)/i},
 {id:'hapoalim',kind:'bank',en:'Bank Hapoalim',he:'בנק הפועלים',mark:'פ',bg:'#C8102E',accent:'#FFB3B8',motif:'stripe',match:/poalim|הפועלים/i},
 {id:'discount',kind:'bank',en:'Discount Bank',he:'בנק דיסקונט',mark:'ד',bg:'#00703C',accent:'#8FD694',motif:'wave',match:/discount|דיסקונט/i},
 {id:'mizrahi',kind:'bank',en:'Mizrahi-Tefahot',he:'מזרחי טפחות',mark:'מ',bg:'#E2620C',accent:'#FFD2A8',motif:'ring',match:/mizrahi|tefahot|מזרחי|טפחות/i},
 {id:'fibi',kind:'bank',en:'First International',he:'הבינלאומי',mark:'ב',bg:'#1F3A73',accent:'#E7B651',motif:'dot',match:/beinleumi|first ?international|fibi|הבינלאומי/i},
 {id:'mercantile',kind:'bank',en:'Mercantile',he:'מרכנתיל',mark:'מר',bg:'#2A4D9B',accent:'#F05A5A',motif:'stripe',match:/mercantile|מרכנתיל/i},
 {id:'jerusalem',kind:'bank',en:'Bank of Jerusalem',he:'בנק ירושלים',mark:'י',bg:'#5B2C83',accent:'#D2B5F0',motif:'arc',match:/jerusalem|ירושלים/i},
 {id:'massad',kind:'bank',en:'Massad',he:'מסד',mark:'מס',bg:'#2E6F8E',accent:'#A7DCEB',motif:'wave',match:/massad|(^|\s)מסד/i},
 {id:'yahav',kind:'bank',en:'Yahav',he:'יהב',mark:'יה',bg:'#1C5F5A',accent:'#9EE0D6',motif:'ring',match:/yahav|יהב/i},
 {id:'otsar',kind:'bank',en:'Otsar Ha-Hayal',he:'אוצר החייל',mark:'או',bg:'#3B4A2A',accent:'#C9D79A',motif:'dot',match:/otsar|אוצר החייל/i},
 {id:'onezero',kind:'bank',en:'One Zero',he:'וואן זירו',mark:'01',bg:'#111111',accent:'#B8F25A',motif:'ring',match:/one ?zero|onezero|וואן ?זירו/i},
 {id:'pepper',kind:'bank',en:'Pepper',he:'פפר',mark:'P',bg:'#E4002B',accent:'#FFC2CC',motif:'dot',match:/pepper|פפר/i},
];
const BY_ID=Object.fromEntries(ISSUERS.map(i=>[i.id,i]));
// Neutral looks for anything not in the list (another country, a wallet, an unknown nickname, a manual entry).
export const GENERIC={card:{bg:'#3C4257',accent:'#AEB6CC',motif:'arc'},bank:{bg:'#46506A',accent:'#C3CAE0',motif:'stripe'},manual:{bg:'#6B5E4E',accent:'#F2D9A8',motif:'dot'}};

export const issuerById=id=>BY_ID[id]||null;
// The issuer named by any text (a RiseUp institution id, a nickname, a statement header). Null when not recognised.
export function issuerOf(...texts){
 const text=texts.filter(Boolean).join(' ');if(!text)return null;
 for(const issuer of ISSUERS)if(issuer.match.test(text))return issuer.id;
 return null;
}
// Four digits written in a nickname ("Max 4821", "הכרטיס של הילה 1234") are taken as the card ending.
export const digitsIn=text=>{const m=/(?:^|\D)(\d{4})(?!\d)/.exec(String(text||''));return m?m[1]:null};
const idLike=text=>/^[a-z][a-zA-Z]*$/.test(String(text||'')); // 'leumiBank', 'poalim': an institution id, not a person's label

// One money row → its raw payment source (before the family's choices and merging).
export function sourceOf(t){
 if(!t)return null;
 if(t.source==='manual'){
  const paid=t.paymentSource||(/^(riseup:|[a-z]+:)/.test(String(t.payment||''))?t.payment:null);
  if(paid)return {key:String(paid),kind:null,issuer:null,label:null,last4:null,via:'manual',memberId:t.memberId||null};
  return {key:'manual:'+(t.memberId||'unknown'),kind:'manual',issuer:null,label:null,last4:null,via:'manual',memberId:t.memberId||null};
 }
 if(t.source==='riseup'){
  const named=String(t.cardIssuer||'').trim(),nick=String(t.accountLabel||'').trim()||(idLike(named)?'':named);
  const issuer=issuerOf(idLike(named)?named:'')||issuerOf(nick)||issuerOf(named),kind=t.kind==='card'?'card':'bank';
  return {key:'riseup:'+(String(t.account||'')||nick.toLowerCase()||named.toLowerCase()||'unknown'),kind,issuer,label:nick||null,last4:digitsIn(nick),via:'riseup',memberId:t.memberId||null};
 }
 const issuer=BY_ID[t.source]?t.source:issuerOf(t.source,t.cardIssuer),kind=issuer?BY_ID[issuer].kind:(t.kind==='card'?'card':'bank');
 const account=String(t.account||''),last4=/^\d{4}$/.test(account)?account:null;
 return {key:(issuer||String(t.source||'other').toLowerCase())+':'+(account||'unknown'),kind,issuer,label:issuer?null:(t.cardIssuer||t.source||null),last4,via:'statement',memberId:t.memberId||null};
}

// ---- Inference (round 2, 2026-11-10): RiseUp never sends card endings or holders, and the person who connected
// RiseUp is not the cardholder. A RiseUp card therefore starts unassigned, and only safe evidence fills it in:
//  1. statement: the same purchases (date + amount) appear on an imported statement card, which prints its ending and
//     carries the family's "Whose card?" answer. At least two matches and a clear winner are required.
//  2. nickname: four digits written in the RiseUp nickname are the ending; a household member's name in it is the owner.
// Digits are never invented; nothing is saved until someone confirms in Cards & accounts.
const sig=t=>String(t.date||'').slice(0,10)+'|'+Math.abs(Math.round(Number(t.amount)||0));
const majority=list=>{const m=new Map();for(const t of list)if(t.memberId)m.set(t.memberId,(m.get(t.memberId)||0)+1);return [...m].sort((a,b)=>b[1]-a[1])[0]?.[0]||null};
const PREFIX=/^[שלהבומכ](?=[א-ת]{2,})/;
const tokens=text=>String(text||'').toLowerCase().split(/[^\p{L}\p{N}']+/u).map(w=>w.replace(/'s$/,'').replace(/'$/,'')).filter(Boolean);
// The one household member whose name appears in a nickname ("הכרטיס של שני", "Shani's Max"), or null.
export function ownerFromLabel(label,members=[]){
 const words=tokens(label);if(!words.length)return null;
 const hits=members.filter(m=>(m.names||[]).filter(Boolean).some(n=>{const name=String(n).toLowerCase().trim();if(name.length<2)return false;return words.some(w=>w===name||w.replace(PREFIX,'')===name)}));
 return hits.length===1?hits[0].id:null;
}
export function inferSources(rows,members=[]){
 const groups=new Map();
 for(const t of rows||[]){const s=sourceOf(t);if(!s||s.via==='manual')continue;let g=groups.get(s.key);if(!g){g={s,rows:[]};groups.set(s.key,g)}g.rows.push(t);if(!g.s.issuer&&s.issuer)g.s={...g.s,issuer:s.issuer}}
 const statements=[...groups.values()].filter(g=>g.s.via==='statement'&&g.s.last4&&g.s.kind==='card');
 const claims=[];
 for(const g of groups.values()){
  if(g.s.via!=='riseup'||g.s.kind!=='card'||g.s.last4)continue;
  const mine=g.rows.map(sig),scores=statements.filter(c=>!g.s.issuer||!c.s.issuer||g.s.issuer===c.s.issuer).map(c=>{const bag=new Map();for(const x of c.rows.map(sig))bag.set(x,(bag.get(x)||0)+1);let n=0;for(const x of mine)if(bag.get(x)){n++;bag.set(x,bag.get(x)-1)}return {c,n}}).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  if(scores[0]?.n>=2&&(!scores[1]||scores[0].n>=2*scores[1].n))claims.push({key:g.s.key,c:scores[0].c,n:scores[0].n});
 }
 const out=new Map(),taken=new Map();
 for(const x of claims.sort((a,b)=>b.n-a.n)){if(taken.has(x.c.s.key))continue;taken.set(x.c.s.key,x.key);out.set(x.key,{key:x.key,last4:x.c.s.last4,ownerId:majority(x.c.rows),reason:'statement',matches:x.n})}
 for(const g of groups.values()){
  if(g.s.via!=='riseup'||!g.s.label)continue;const had=out.get(g.s.key)||{key:g.s.key},owner=ownerFromLabel(g.s.label,members);
  const next={...had};if(!next.last4&&g.s.last4){next.last4=g.s.last4;next.reason=next.reason||'nickname'}if(!next.ownerId&&owner){next.ownerId=owner;next.ownerReason='nickname';next.reason=next.reason||'nickname'}
  if(next.last4||next.ownerId)out.set(g.s.key,next);
 }
 return [...out.values()];
}

// All sources in these rows, merged and resolved with the family's saved choices.
// saved: [{key (raw), last4, ownerId, shared (true|false|null), label}] from finance_sources.
// options.inferred: suggestions from inferSources (the server sends ones that need rows the client may not have);
// options.members: [{id, names}] for nickname inference here. Saved choices always win over inferred ones.
// A RiseUp card whose ending is known (saved, inferred or in its nickname) merges with the statement card of the same
// issuer and ending, so the two import paths become one card.
// Owner: the saved choice; otherwise a bank account is shared, a statement card belongs to "Whose card?", and a RiseUp
// card is unassigned (`unassigned`) unless inference names its owner (`inferred.owner`).
export function paymentSources(rows,saved=[],{inferred=[],members=[]}={}){
 const choices=new Map((saved||[]).map(s=>[s.key,s])),raw=new Map(),guess=new Map();
 for(const x of [...inferSources(rows,members),...(inferred||[])])guess.set(x.key,{...(guess.get(x.key)||{}),...Object.fromEntries(Object.entries(x).filter(([,v])=>v!=null))});
 for(const t of rows||[]){const s=sourceOf(t);if(!s)continue;let r=raw.get(s.key);if(!r){r={...s,members:new Map(),vias:new Set(),count:0};raw.set(s.key,r)}
  r.count++;r.vias.add(s.via);
  // Only a statement's "Whose card?" and a recorded entry's person say whose a source is; RiseUp's member is the connector.
  if(s.memberId&&s.via!=='riseup')r.members.set(s.memberId,(r.members.get(s.memberId)||0)+1);
  if(!r.kind&&s.kind)r.kind=s.kind;if(!r.issuer&&s.issuer)r.issuer=s.issuer;if(!r.label&&s.label)r.label=s.label;if(!r.last4&&s.last4)r.last4=s.last4}
 // A manual entry may name a source that no imported row has (yet): keep it as an unknown source.
 const merged=new Map(),canonical=new Map();
 for(const r of raw.values()){
  const c=choices.get(r.key)||{},g=guess.get(r.key)||{},savedEnding=/^\d{4}$/.test(c.last4||''),inferredEnding=!savedEnding&&!r.last4&&/^\d{4}$/.test(g.last4||'');
  const last4=savedEnding?c.last4:r.last4||(inferredEnding?g.last4:null),kind=r.kind;
  const key=r.kind==='manual'?r.key:(r.issuer&&last4?r.issuer+':'+last4:r.key);canonical.set(r.key,key);
  const top=[...r.members].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  let m=merged.get(key);if(!m){m={key,keys:[],kind,issuer:r.issuer,label:null,last4,ownerId:null,shared:null,unassigned:false,inferred:{},via:[],count:0,_owner:null,_ownerVia:null};merged.set(key,m)}
  m.keys.push(r.key);m.count+=r.count;for(const v of r.vias)if(!m.via.includes(v))m.via.push(v);
  if(!m.kind||(kind==='card'&&m.kind==='bank'))m.kind=kind||m.kind;if(!m.issuer&&r.issuer)m.issuer=r.issuer;if(!m.last4&&last4)m.last4=last4;
  if(inferredEnding)m.inferred.last4=g.reason||'statement';
  m.label=c.label||m.label||r.label;
  if(c.shared===true||c.shared===1)m.shared=true;else if((c.shared===false||c.shared===0)&&m.shared!==true)m.shared=false;
  if(c.ownerId)m.ownerId=c.ownerId;
  // A statement without its card number cannot say whose card it is: those rows keep their own person (ownerOfRow).
  if(top&&!r.key.endsWith(':unknown')&&!m._owner){m._owner=top;m._ownerVia=r.vias.has('statement')?'statement':'manual'}
  if(!c.ownerId&&g.ownerId&&!m._inferredOwner){m._inferredOwner=g.ownerId;m._inferredOwnerWhy=g.ownerReason||g.reason}
 }
 const list=[...merged.values()].map(({_owner,_ownerVia,_inferredOwner,_inferredOwnerWhy,...m})=>{
  if(!m.kind)m.kind='card';
  if(m.kind==='manual')return {...m,ownerId:m.ownerId||_owner,shared:false};
  if(m.shared===null)m.shared=m.kind==='bank'&&!m.ownerId;
  if(m.shared)return {...m,ownerId:null};
  if(!m.ownerId&&_owner)m.ownerId=_owner;
  if(!m.ownerId&&_inferredOwner){m.ownerId=_inferredOwner;m.inferred.owner=_inferredOwnerWhy||'statement'}
  if(!m.ownerId)m.unassigned=true;
  return m;
 }).sort((a,b)=>rank(a)-rank(b)||String(a.issuer||a.label||'').localeCompare(String(b.issuer||b.label||''))||String(a.last4||'').localeCompare(String(b.last4||'')));
 const byKey=new Map(list.map(s=>[s.key,s]));
 const keyOf=t=>{const s=sourceOf(t);return s?canonical.get(s.key)||s.key:null};
 return {list,byKey,keyOf,of:t=>byKey.get(keyOf(t))||null,canonical};
}
const rank=s=>s.kind==='card'?0:s.kind==='bank'?1:2;

// People first: each adult with their cards and accounts, then "Shared" (joint accounts, shared cards, former members'
// sources), then "Unassigned" (cards nobody has claimed yet; the app asks whose they are).
export function sourceGroups(index,memberIds=[]){
 const groups=memberIds.map(id=>({id,sources:index.list.filter(s=>!s.shared&&s.ownerId===id)})).filter(g=>g.sources.length);
 const shared=index.list.filter(s=>s.shared||(s.ownerId&&!memberIds.includes(s.ownerId)));
 const unassigned=index.list.filter(s=>!s.shared&&!s.ownerId);
 return [...groups,...(shared.length?[{id:'shared',sources:shared}]:[]),...(unassigned.length?[{id:'unassigned',sources:unassigned}]:[])];
}
// OR within the chosen sources; an empty choice means every row.
export const matchesSources=(t,index,chosen)=>!chosen||!chosen.length||chosen.includes(index.keyOf(t));
// Who a row belongs to for person filters: the source's owner; null when shared or not yet assigned. Only rows of a
// statement without its card number (and recorded entries) fall back to their own person; RiseUp's member is never used.
export const ownerOfRow=(t,index)=>{const s=index.of(t);if(!s)return t.source==='riseup'?null:(t.memberId||null);if(s.shared)return null;return s.ownerId??(t.source==='riseup'?null:(t.memberId||null))};
// Household members for nickname inference: id plus every name they go by (app profile names, Hebrew and English).
export const memberNames=(members=[],profiles={})=>members.filter(m=>m.role!=='child').map(m=>({id:m.id,names:[m.name,m.he,profiles?.[m.id]?.name,profiles?.[m.id]?.he].filter(Boolean)}));

export function issuerLabel(id,lang='en'){const i=BY_ID[id];return i?(lang==='he'?i.he:i.en):null}
// "Max", "Bank Leumi", the nickname, or a neutral name.
export function sourceName(s,lang='en'){
 if(!s)return lang==='he'?'מקור לא ידוע':'Unknown source';
 if(s.kind==='manual')return lang==='he'?'נרשם ידנית':'Recorded manually';
 return issuerLabel(s.issuer,lang)||s.label||(s.kind==='bank'?(lang==='he'?'חשבון בנק':'Bank account'):(lang==='he'?'כרטיס':'Card'));
}
export const sourceDigits=s=>s?.last4?'••'+s.last4:'';
// The colours and mark of a source: the issuer's, or a neutral look with the first letter of its name.
export function sourceLook(s){
 const i=s&&BY_ID[s.issuer];if(i)return {bg:i.bg,accent:i.accent,motif:i.motif,mark:i.mark,generic:false};
 const g=GENERIC[s?.kind]||GENERIC.card;return {...g,mark:null,generic:true};
}

// Monthly spending (agorot, positive) per source key by transaction month ('YYYY-MM', like the Statistics chart), from rows that carry
// `spent` (see household-money-statistics). Rows of other months are ignored.
export function monthlyBySource(rows,index,months){
 const at=new Map(months.map((m,i)=>[m,i])),out=new Map();
 for(const r of rows){const i=at.get(String(r.date||r.month||'').slice(0,7));if(i===undefined)continue;const k=index.keyOf(r);if(!out.has(k))out.set(k,months.map(()=>0));out.get(k)[i]+=r.spent}
 return out;
}

// ---- Issuer-level helpers (kept for the simple filter and tests) ----
export function issuerKey(t){const s=sourceOf(t);return s.kind==='manual'?'manual':s.issuer||('other:'+(s.label||'unknown').toLowerCase())}
export function issuerOptions(rows,lang='en'){
 const counts=new Map();for(const t of rows){const k=issuerKey(t);counts.set(k,(counts.get(k)||0)+1)}
 const order=k=>k==='manual'?3:k.startsWith('other:')?2:BY_ID[k].kind==='card'?0:1;
 return [...counts].map(([id,count])=>({id,count,label:id==='manual'?(lang==='he'?'נרשם ידנית':'Recorded manually'):issuerLabel(id,lang)||rows.map(sourceOf).find(s=>!s.issuer&&('other:'+(s.label||'unknown').toLowerCase())===id)?.label||(lang==='he'?'מקור אחר':'Other source')})).sort((a,b)=>order(a.id)-order(b.id)||a.label.localeCompare(b.label,lang));
}
export const matchesIssuers=(t,chosen)=>!chosen||!chosen.length||chosen.includes(issuerKey(t));

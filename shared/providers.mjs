// "Who we pay": one entry per provider (Cellcom, FreeTV, Israel Electric…) built from recurring payments in the
// money records, active insurance policies and the family's own corrections. Amounts are integer agorot.
// Deterministic rules come first; an optional AI pass only labels merchants the rules do not know, and the family's
// own renames, merges, hides and hand-added providers always win. Callers pass only rows the viewer may see.
import {recurringPayments,normalizeName,flowOf,monthOf,shiftMonth} from './finance.mjs';
import {merchantKey} from './money-records.mjs';
import {insurerKey,monthlyPremium,policyStatus,INSURANCE_TYPES} from './insurance.mjs';

// Areas say what a provider is for; groups are the headings on the page.
export const PROVIDER_GROUPS=[
 {id:'home',en:'Home',he:'הבית',color:'#C98A4B'},
 {id:'comm',en:'Phone, TV & internet',he:'תקשורת',color:'#00A3C4'},
 {id:'ins',en:'Insurance & health',he:'ביטוח ובריאות',color:'#7B61FF'},
 {id:'subs',en:'Subscriptions & apps',he:'מנויים ואפליקציות',color:'#F2B33D'},
 {id:'other',en:'Other fixed payments',he:'תשלומים קבועים נוספים',color:'#8C93A8'}
];
// In each group the order people expect (user feedback 2026-11-10): the big home bills first, "other" last.
export const PROVIDER_AREAS=[
 ['housing','Mortgage & rent','משכנתא ושכירות','bayit-pixel-blue-house','home'],['arnona','Arnona','ארנונה','1F3DB','home'],['electricity','Electricity','חשמל','1F4A1','home'],
 ['water','Water','מים','1F4A7','home'],['gas','Cooking gas','גז','1F525','home'],['building','Building committee','ועד בית','1F3E2','home'],['services','Home services','שירותים לבית','1F9F9','home'],['utility','Other home bill','חשבון אחר לבית','1F9FE','home'],
 ['mobile','Mobile','סלולר','1F4F1','comm'],['internet','Internet','אינטרנט','1F310','comm'],['tv','TV','טלוויזיה','1F4FA','comm'],['landline','Landline','טלפון קווי','260E','comm'],
 ['healthfund','Health fund','קופת חולים','1F3E5','ins'],['insurance','Insurance','ביטוח','1F6E1','ins'],['health','Health & care','בריאות וטיפולים','1FA7A','ins'],
 ['streaming','Streaming','סטרימינג','1F3AC','subs'],['music','Music','מוזיקה','1F3B5','subs'],['cloud','Cloud & apps','ענן ואפליקציות','2601','subs'],['software','AI & software','AI ותוכנה','1F4BB','subs'],['news','News','חדשות','1F4F0','subs'],['gym','Gym & sport','כושר וספורט','1F3CB','subs'],
 ['kids','Kids & education','ילדים וחינוך','bayit-activities-backpack','other'],['car','Car','רכב','1F697','other'],['loan','Loans','הלוואות','1F3E6','other'],['savings','Savings & pension','חיסכון ופנסיה','1F4C8','other'],['taxes','Taxes','מסים','1F3DB','other'],['bank','Bank fees','עמלות בנק','1F4B3','other'],['donations','Donations','תרומות','1F49D','other'],['other','Other','אחר','1F9FE','other']
].map(([id,en,he,icon,group])=>({id,en,he,icon,group}));
// Bills that change with use or season (a rise there is not a price change).
export const VARIABLE_AREAS=new Set(['electricity','water','gas','arnona']);
for(const a of PROVIDER_AREAS)if(VARIABLE_AREAS.has(a.id))a.variable=true;
export const PROVIDER_AREA=Object.fromEntries(PROVIDER_AREAS.map(a=>[a.id,a]));
export const PAYMENT_KINDS=['card','standing','bank','manual','policy','cash','other'];
export const PROVIDER_PERIODS=[1,2,3,6,12];

// Known providers: [id, English, Hebrew, area, pattern]. Order matters: the first match wins
// (Cellcom Energy before Cellcom, HOT Mobile before HOT, private electricity before gas companies).
// Private electricity suppliers come first: their statement lines start with a phone company's name
// ("סלקום אנרג'י", "פרטנר פאוור", "הוט אנרג'י") and must never count as that company's mobile or TV bill.
const KNOWN=[
 ['cellcom-energy','Cellcom Energy','סלקום אנרג׳י','electricity',/סלקום\s*(אנרג|חשמל)|cellcom\s*(energ|power|electric)/i],
 ['partner-power','Partner Power','פרטנר פאוור','electricity',/פרטנר\s*(פאוו?ר|חשמל|אנרג)|partner\s*(power|energ|electric)/i],
 ['hot-energy','HOT Energy','הוט אנרג׳י','electricity',/הוט\s*(אנרג|חשמל)|hot\s*(energ|power|electric)/i],
 ['bezeq-energy','Bezeq Energy','בזק אנרג׳י','electricity',/בזק\s*(אנרג|חשמל)|bezeq\s*(energ|power|electric)/i],
 ['super-power','Super Power','סופר פאוור','electricity',/סופר\s*פאוו?ר|super\s*power/i],
 ['electra-power','Electra Power','אלקטרה פאוור','electricity',/אלקטרה\s*פאוו?ר|electra\s*power/i],
 ['pazgas-power','Pazgas Electricity','פזגז חשמל','electricity',/פזגז\s*חשמל/],
 ['amisragas-power','Amisragas Electricity','אמישראגז חשמל','electricity',/אמישראגז\s*חשמל/],
 ['iec','Israel Electric','חברת החשמל','electricity',/חברת\s*החשמל|חשמל\s*לישראל|חח["״']?י|israel\s*electric|(^|[^a-z])iec([^a-z]|$)/i],
 ['cellcom-tv','Cellcom TV','סלקום TV','tv',/סלקום\s*(tv|טי\s*וי)|cellcom\s*tv/i],
 ['cellcom-internet','Cellcom Internet','סלקום אינטרנט','internet',/סלקום\s*(פייבר|סיבים|אינטרנט|נט(?![\u05d0-\u05ea]))|cellcom\s*(fiber|fibre|internet|net\b)/i],
 ['partner-internet','Partner Internet','פרטנר אינטרנט','internet',/פרטנר\s*(פייבר|סיבים|אינטרנט)|partner\s*(fiber|fibre|internet)/i],
 ['partner-tv','Partner TV','פרטנר TV','tv',/פרטנר\s*(tv|טי\s*וי)|partner\s*tv/i],
 ['cellcom','Cellcom','סלקום','mobile',/סלקום|cellcom/i],
 ['partner','Partner','פרטנר','mobile',/פרטנר|partner\s*(comm|tik)|^partner\b/i],
 ['pelephone','Pelephone','פלאפון','mobile',/פלאפון|pelephone/i],
 ['hot-mobile','HOT Mobile','הוט מובייל','mobile',/הוט\s*מובייל|hot\s*mobile/i],
 ['hot-net','HOT Net','הוט נט','internet',/הוט\s*נט|hot\s*net/i],
 ['hot','HOT','הוט','tv',/(^|[\s'"])הוט(\s|$)|(^|[^a-z])hot\s*(tv|telecom|cable)|^hot$/i],
 ['golan','Golan Telecom','גולן טלקום','mobile',/גולן\s*טלקום|golan\s*telecom/i],
 ['we4g','We4G','We4G','mobile',/we\s*4\s*g|012\s*מובייל/i],
 ['019','019 Mobile','019 מובייל','mobile',/019\s*(מובייל|mobile)/i],
 ['rami-levy-comm','Rami Levy Communications','רמי לוי תקשורת','mobile',/רמי\s*לוי\s*(תקשורת|תיקשורת)/],
 ['bezeq-int','Bezeq International','בזק בינלאומי','internet',/בזק\s*בינלאומי|bezeq\s*int/i],
 ['bezeq','Bezeq','בזק','internet',/בזק|bezeq/i],
 ['unlimited','Unlimited','אנלימיטד','internet',/אנלימיטד|unlimited\s*(isp|internet)/i],
 ['yes','yes','yes','tv',/(^|[^a-z])yes(?!\s*planet)([^a-z]|$)|די\s*בי\s*אס|(^|\s)יס(?!\s*פלאנט)(\s|$)/i],
 ['sting','STINGTV','סטינג','tv',/סטינג|sting\s*tv/i],
 ['freetv','FreeTV','FreeTV','tv',/free\s*tv|פרי\s*טי\s*וי|פריטיוי/i],
 ['netflix','Netflix','Netflix','streaming',/netflix|נטפליקס/i],
 ['disney','Disney+','Disney+','streaming',/disney|דיסני/i],
 ['prime-video','Prime Video','Prime Video','streaming',/prime\s*video|amazon\s*prime/i],
 ['youtube','YouTube Premium','YouTube Premium','streaming',/youtube|יוטיוב/i],
 ['apple-tv','Apple TV+','Apple TV+','streaming',/apple\s*tv/i],
 ['spotify','Spotify','Spotify','music',/spotify|ספוטיפיי/i],
 ['apple-music','Apple Music','Apple Music','music',/apple\s*music/i],
 ['icloud','iCloud+','iCloud+','cloud',/icloud/i],
 ['apple','Apple','Apple','cloud',/apple\.com|itunes|(^|[^a-z])apple([^a-z]|$)/i],
 ['google-one','Google One','Google One','cloud',/google\s*(one|storage)/i],
 ['google','Google','Google','cloud',/google/i],
 ['dropbox','Dropbox','Dropbox','cloud',/dropbox/i],
 ['microsoft','Microsoft 365','Microsoft 365','software',/microsoft|office\s*365|xbox/i],
 ['adobe','Adobe','Adobe','software',/adobe/i],
 ['canva','Canva','Canva','software',/canva/i],
 ['chatgpt','ChatGPT','ChatGPT','software',/openai|chatgpt/i],
 ['claude','Claude','Claude','software',/anthropic|claude\.ai/i],
 ['github','GitHub','GitHub','software',/github/i],
 ['supergas','Supergas','סופרגז','gas',/סופרגז|super\s*gas/i],
 ['amisragas','Amisragas','אמישראגז','gas',/אמישראגז|amisragas/i],
 ['pazgas','Pazgas','פזגז','gas',/פזגז|paz\s*gas/i],
 ['dorgas','Dor Gas','דור גז','gas',/דור\s*גז|dor\s*gas/i],
 ['maccabi','Maccabi','מכבי','healthfund',/מכבי\s*(שירותי|שרותי|מגן|זהב|שלי)|maccabi\s*(health|sherut|zahav|magen)/i],
 ['clalit','Clalit','כללית','healthfund',/כללית\s*(שירותי|מושלם|פלטינום)|clalit/i],
 ['meuhedet','Meuhedet','מאוחדת','healthfund',/מאוחדת|meuhedet/i],
 ['leumit','Leumit','לאומית','healthfund',/לאומית\s*(שירותי|זהב|כסף)|leumit/i],
 ['holmes','Holmes Place','הולמס פלייס','gym',/הולמס|holmes/i],
 ['go-active','GO Active','גו אקטיב','gym',/גו\s*אקטיב|go\s*active/i],
 ['pango','Pango','פנגו','car',/פנגו|pango/i],
 ['building','Building committee','ועד בית','building',/ועד\s*(ה)?בית/],
 // Municipalities (arnona) and water companies of the largest cities; others keep their statement name.
 ['city-tlv','Tel Aviv-Yafo Municipality','עיריית תל אביב-יפו','arnona',/עירי(י)?ת\s*(תל[\s-]*אביב|ת["״]א)/],
 ['city-jlm','Jerusalem Municipality','עיריית ירושלים','arnona',/עירי(י)?ת\s*ירושלים/],
 ['city-haifa','Haifa Municipality','עיריית חיפה','arnona',/עירי(י)?ת\s*חיפה/],
 ['city-rg','Ramat Gan Municipality','עיריית רמת גן','arnona',/עירי(י)?ת\s*רמת[\s-]*גן/],
 ['city-rishon','Rishon LeZion Municipality','עיריית ראשון לציון','arnona',/עירי(י)?ת\s*ראשון/],
 ['city-pt','Petah Tikva Municipality','עיריית פתח תקווה','arnona',/עירי(י)?ת\s*פתח[\s-]*תקו/],
 ['city-netanya','Netanya Municipality','עיריית נתניה','arnona',/עירי(י)?ת\s*נתניה/],
 ['city-bs','Be’er Sheva Municipality','עיריית באר שבע','arnona',/עירי(י)?ת\s*באר[\s-]*שבע/],
 ['city-modiin','Modi’in Municipality','עיריית מודיעין','arnona',/עירי(י)?ת\s*מודיעין/],
 ['city-raanana','Ra’anana Municipality','עיריית רעננה','arnona',/עירי(י)?ת\s*רעננה/],
 ['mei-avivim','Mei Avivim','מי אביבים','water',/מי\s*אביבים/],
 ['hagihon','Hagihon','הגיחון','water',/הגיחון|hagihon/i],
 ['mei-carmel','Mei Carmel','מי כרמל','water',/מי\s*כרמל/],
 ['mei-sheva','Mei Sheva','מי שבע','water',/מי\s*שבע/],
 ['mei-raanana','Mei Ra’anana','מי רעננה','water',/מי\s*רעננה/],
 ['mei-netanya','Mei Netanya','מי נתניה','water',/מי\s*נתניה/]
];
// Companies that sell several services: by company, Cellcom's mobile, internet, TV and energy are one card, while each
// service keeps its own area (Cellcom Energy stays electricity). Others are a company of their own.
const COMPANY_OF={'cellcom-energy':'cellcom','cellcom-tv':'cellcom','cellcom-internet':'cellcom',cellcom:'cellcom','partner-power':'partner','partner-tv':'partner','partner-internet':'partner',partner:'partner','hot-energy':'hot','hot-mobile':'hot','hot-net':'hot',hot:'hot','bezeq-energy':'bezeq',bezeq:'bezeq','pazgas-power':'pazgas',pazgas:'pazgas','amisragas-power':'amisragas',amisragas:'amisragas',icloud:'apple','apple-music':'apple','apple-tv':'apple',apple:'apple','google-one':'google',youtube:'google',google:'google'};
const COMPANIES={cellcom:['Cellcom','סלקום'],partner:['Partner','פרטנר'],hot:['HOT','הוט'],bezeq:['Bezeq','בזק'],pazgas:['Pazgas','פזגז'],amisragas:['Amisragas','אמישראגז'],apple:['Apple','Apple'],google:['Google','Google']};
export const companyOf=p=>{const id=p.key.startsWith('p:')?COMPANY_OF[p.key.slice(2)]:null;return id?{id:'c:'+id,name:{en:COMPANIES[id][0],he:COMPANIES[id][1]}}:{id:p.key,name:p.name}};
const INSURERS={harel:['Harel','הראל'],phoenix:['Phoenix','הפניקס'],migdal:['Migdal','מגדל'],clal:['Clal','כלל'],menora:['Menora','מנורה'],aig:['AIG','AIG'],direct:['IDI Direct','ביטוח ישיר'],ayalon:['Ayalon','איילון'],libra:['Libra','ליברה'],shomera:['Shomera','שומרה'],hachshara:['Hachshara','הכשרה'],shlomo:['Shlomo','שלמה ביטוח'],bittuh9:['9 Million','9 מיליון'],'we-sure':['Wesure','ווישור']};
// Spending that is not a provider: groceries, eating out, shopping and card totals without details.
const NOT_PROVIDERS=new Set(['groceries','dining','shopping','cards']);
// Shops are not providers (user report 2026-11-10: a KSP purchase showed under Home as a home bill, because RiseUp
// files electronics under "חשמל" and paying in instalments looks monthly). A shop counts only when it is a real
// standing order with no instalments.
const RETAIL=/(^|[^a-z])ksp([^a-z]|$)|קי(י)?\s*\.?\s*אס\s*\.?\s*פי|איבורי|ivory|(^|\s)באג(\s|$)|באג\s*מולטי|bug\s*multi|מחסני\s*(ה)?חשמל|machsanei|שקם\s*אלקטרי|shekem|idigital|איי\s*דיגיטל|apple\s*store|אופיס\s*דיפו|office\s*depot|טרקלין\s*חשמל|פיינגו|payngo|מוצרי\s*חשמל|אלקטרוניק|electronics|מחשבים|computers|(^|\s)ikea|איקאה|הום\s*סנטר|home\s*center|(^|\s)ace(\s|$)|מקס\s*סטוק|max\s*stock|זארה|zara|קסטרו|castro|(^|\s)פוקס(\s|$)|terminal\s*x|טרמינל\s*איקס|amazon(?!\s*prime)|אמזון(?!\s*פריים)|aliexpress|עלי\s*אקספרס|shein|temu|ebay/i;
export const isRetail=description=>RETAIL.test(String(description||''));
// Instalments of a purchase are one purchase paid in parts, not a provider, except for things that are fixed
// payments anyway (school and classes, a car, health care, insurance, a mortgage, savings, taxes).
const INSTALMENTS_COUNT=new Set(['kids','car','health','insurance','mortgage','savings','taxes']);
const CATEGORY_AREA={utilities:'utility',subscriptions:'cloud',insurance:'insurance',leisure:'gym',mortgage:'housing',kids:'kids',savings:'savings',health:'health',car:'car',taxes:'taxes',home:'services',fees:'bank',gifts:'donations'};

// A readable name from a statement line: no company suffixes, long numbers, phone numbers or stars.
export function cleanProviderName(description){
 let s=String(description||'').normalize('NFKC').replace(/[*#|_]+/g,' ')
  .replace(/בע["״'׳]{0,2}מ|\bltd\.?|\binc\.?|\bllc\b|\bco\.il\b|\.com\b|www\./gi,' ')
  .replace(/הו["״]?ק|הוראת\s*קבע|תשלום\s*(עבור|ל)?|חיוב\s*(עבור|ל)?/g,' ')
  .replace(/\+?\d[\d\- ]{4,}\d/g,' ').replace(/(^|\s)\d+(?=\s|$)/g,' ').replace(/(^|\s)ארנונה(?=\s|$)/g,' ').replace(/\s+[\-–]\s*$/,'').replace(/\s+/g,' ').trim();
 if(/^[A-Z0-9 .&+'-]+$/.test(s)&&/[A-Z]{3}/.test(s))s=s.toLowerCase().replace(/(^|\s)([a-z])/g,(m,a,b)=>a+b.toUpperCase());
 return s.slice(0,60)||String(description||'').trim().slice(0,60);
}

// Which provider a statement line belongs to. Known providers get a stable key and both names; other lines
// in provider-like categories get a cleaned merchant name and an area from their category.
export function providerOf(description,category='other'){
 const text=String(description||'');
 for(const [id,en,he,area,pattern]of KNOWN)if(pattern.test(text))return {key:'p:'+id,name:{en,he},area,known:true};
 const insurer=insurerKey(text);
 if(INSURERS[insurer]&&(category==='insurance'||/ביטוח|insur/i.test(text)||category==='health'))return {key:'ins:'+insurer,name:{en:INSURERS[insurer][0],he:INSURERS[insurer][1]},area:'insurance',known:true};
 let area=CATEGORY_AREA[category]||'other';
 if(/ארנונה|עירי(י)?ת|מועצה\s*(מקומית|אזורית)|municipality/i.test(text))area='arnona';
 else if(/^מי\s+[א-ת]|תאגיד\s*(ה)?מים|מקורות|water\s*(corp|co)/i.test(text))area='water';
 else if(/אנרג['׳]?י|אנרגיה|חברת\s*(ה)?חשמל|ספק\s*חשמל|electric(ity)?\s*(co|supply|company)|energy/i.test(text)&&['utilities','other'].includes(category))area='electricity';
 else if(/תקשורת|סלולר|מובייל|mobile|telecom/i.test(text)&&['utilities','other'].includes(category))area='mobile';
 else if(/אינטרנט|internet|fiber|סיבים/i.test(text)&&['utilities','other'].includes(category))area='internet';
 const name=cleanProviderName(text);
 return {key:'m:'+(merchantKey(name)||merchantKey(text)),name:{en:name,he:name},area,known:false};
}

const isoDay=(month,day)=>{const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return month+'-'+String(Math.min(Math.max(1,day||1),last)).padStart(2,'0')};
const monthsBetween=(a,b)=>{const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return (by-ay)*12+bm-am};
const perMonth=(amount,period)=>Math.round(amount/(period||1));
const paymentOf=(sample,entry)=>entry.standingOrder||/הו["״]?ק|הוראת\s*קבע/.test(sample.description||'')?{kind:'standing',account:sample.kind==='card'?sample.account||'':''}:sample.kind==='card'?{kind:'card',account:sample.account||''}:sample.kind==='manual'?{kind:'manual',account:''}:{kind:'bank',account:''};

// The full picture. settings: {providers:{[key]:{name,area,hidden,mergeInto,memberIds}},added:[…],aiLabels:{[key]:{name,area}}}.
// until ("YYYY-MM", optional): the picture as it was at the end of that month, from the rows up to it.
export function whoWePay(rows,{policies=[],settings={},today,until}={}){
 if(until)rows=rows.filter(t=>t&&monthOf(t)<=until);
 const out=rows.filter(t=>t&&t.amount<0&&t.kind!=='card_payment'&&flowOf(t.category)!=='income');
 const latest=[...new Set(rows.map(monthOf))].sort().at(-1)||(today||'').slice(0,7);
 const now=today||latest+'-01';
 // A known provider's lines count as one series whatever spelling the statement used that month ("CELLCOM 03-…" one
 // month, "סלקום ישראל בע"מ" the next), so monthly payments are not mistaken for two bills every two months.
 const canon=new Map(),series=out.map(t=>{if(isRetail(t.description))return t;const who=providerOf(t.description,t.category);if(!who.known)return t;const d='⟨'+who.key+'⟩';canon.set(d,who);return {...t,rawDescription:t.description,description:d}});
 const notProvider=r=>{const raw=r.description.startsWith('⟨')?'':r.description;
  if(NOT_PROVIDERS.has(r.category))return true;
  if(isRetail(raw))return !(r.standingOrder&&r.installmentsLeft==null);
  return !canon.has(r.description)&&r.installmentsLeft!=null&&!INSTALMENTS_COUNT.has(r.category)};
 const recurring=recurringPayments(series).filter(r=>!notProvider(r));
 // recurringPayments groups by source + normalized description; find each group's latest row and statement names.
 // Each group's rows are kept as its payment history (id, date, month, amount), so the page can list them and open
 // them in Transactions.
 const latestRow=new Map(),names=new Map(),paid=new Map();for(const t of series){const k=t.source+'|'+normalizeName(t.description),old=latestRow.get(k);if(!old||t.date>old.date)latestRow.set(k,t);(names.get(k)||names.set(k,new Set()).get(k)).add(t.rawDescription||t.description);(paid.get(k)||paid.set(k,[]).get(k)).push({id:t.id??null,date:t.date,month:monthOf(t),amount:-t.amount,description:t.rawDescription||t.description,installmentN:t.installmentN??null,installmentOf:t.installmentOf??null})}
 const map=new Map(),add=(key,base)=>{if(!map.has(key))map.set(key,{key,name:base.name,area:base.area,known:!!base.known,entries:[],policies:[],memberIds:[],origin:base.origin||'statements'});return map.get(key)};
 for(const r of recurring){
  const sample=latestRow.get(r.key)||{},who=canon.get(r.description)||providerOf(r.description,r.category),p=add(who.key,who);
  const stale=r.nextMonth<latest&&monthsBetween(r.nextMonth,latest)>=1;
  p.entries.push({key:r.key,description:sample.rawDescription||r.description,names:[...(names.get(r.key)||[])],category:r.category,source:r.source,period:r.period,typical:r.typical,last:r.last,changePercent:r.changePercent,months:r.months,nextMonth:r.nextMonth,nextDay:r.nextDay,standingOrder:r.standingOrder,installmentsLeft:r.installmentsLeft,payment:paymentOf(sample,r),memberId:sample.memberId||null,stale,payments:paid.get(r.key)||[]});
 }
 // Insurance policies: joined to the insurer already paid in the statements, otherwise listed from the policy.
 for(const policy of policies.filter(p=>p&&!p.deletedAt&&['active','unknown'].includes(policyStatus(p,now)))){
  const ik=insurerKey(policy.insurer);if(!ik)continue;
  const paid=[...map.values()].find(p=>p.area==='insurance'&&p.entries.some(e=>insurerKey(e.description)===ik));
  const p=paid||add('ins:'+ik,{name:INSURERS[ik]?{en:INSURERS[ik][0],he:INSURERS[ik][1]}:{en:cleanProviderName(policy.insurer),he:cleanProviderName(policy.insurer)},area:'insurance',known:!!INSURERS[ik],origin:'insurance'});
  p.policies.push({id:policy.id,type:policy.type||'other',monthly:monthlyPremium(policy),endDate:policy.endDate||'',memberIds:policy.memberIds||[]});
  for(const id of policy.memberIds||[])if(!p.memberIds.includes(id))p.memberIds.push(id);
 }
 // Optional AI labels, only for merchants the rules did not recognise.
 for(const [key,label]of Object.entries(settings.aiLabels||{})){const p=map.get(key);if(!p||p.known)continue;if(label.name)p.name={en:label.name,he:label.name};if(PROVIDER_AREA[label.area])p.area=label.area}
 // The family's corrections: rename, change area, who it is for, hide, merge.
 const own=settings.providers||{};
 for(const [key,o]of Object.entries(own)){const p=map.get(key);if(!p)continue;if(o.name){p.autoName=p.name;p.name={en:o.name,he:o.name};p.renamed=true}if(PROVIDER_AREA[o.area])p.area=o.area;if(Array.isArray(o.memberIds))p.memberIds=[...o.memberIds];if(o.hidden)p.hidden=true}
 for(const [key,o]of Object.entries(own)){
  const from=map.get(key),into=map.get(o.mergeInto);if(!from||!into||from===into||own[o.mergeInto]?.mergeInto)continue;
  into.entries.push(...from.entries);into.policies.push(...from.policies);for(const id of from.memberIds)if(!into.memberIds.includes(id))into.memberIds.push(id);
  (into.merged||(into.merged=[])).push({key,name:from.name});map.delete(key);
 }
 // Providers the family added by hand (paid in cash, from another account, not in the statements yet).
 for(const a of settings.added||[]){
  const p=add('add:'+a.id,{name:{en:a.name,he:a.name},area:PROVIDER_AREA[a.area]?a.area:'other',origin:'manual'});
  p.manual={...a};p.memberIds=[...(a.memberIds||[])];if(own['add:'+a.id]?.hidden)p.hidden=true;
 }
 const providers=[...map.values()].map(p=>finish(p,latest)).filter(p=>p.entries.length||p.policies.length||p.manual);
 const visible=providers.filter(p=>!p.hidden&&!p.ended),groups=PROVIDER_GROUPS.map(g=>{const list=visible.filter(p=>PROVIDER_AREA[p.area].group===g.id).sort((a,b)=>(b.monthly??-1)-(a.monthly??-1));return {...g,providers:list,monthly:list.reduce((n,p)=>n+(p.monthly||0),0)}}).filter(g=>g.providers.length);
 // By company: the same providers (so the same total), one entry per company with its services; companies with
 // several services first (what the user asked to see), then by amount.
 const byCompany=new Map();for(const p of visible){const c=companyOf(p);p.company=c;const e=byCompany.get(c.id)||byCompany.set(c.id,{id:c.id,name:c.name,providers:[],monthly:0}).get(c.id);e.providers.push(p);e.monthly+=p.monthly||0}
 const companies=[...byCompany.values()].map(c=>({...c,providers:c.providers.sort((a,b)=>(b.monthly??-1)-(a.monthly??-1)),areas:[...new Set(c.providers.map(p=>p.area))]})).sort((a,b)=>(b.providers.length>1)-(a.providers.length>1)||b.monthly-a.monthly);
 return {month:latest,providers:visible,groups,companies,total:groups.reduce((n,g)=>n+g.monthly,0),count:visible.length,unknownAmounts:visible.filter(p=>p.monthly==null).length,hidden:providers.filter(p=>p.hidden),ended:providers.filter(p=>p.ended&&!p.hidden)};
}

function finish(p,latest){
 const live=p.entries.filter(e=>!e.stale),main=[...live].sort((a,b)=>perMonth(b.typical,b.period)-perMonth(a.typical,a.period))[0];
 let monthly=live.reduce((n,e)=>n+perMonth(e.typical,e.period),0),payment=main?.payment||null,period=main?.period||1,next=null,changePercent=main?.changePercent||0,source=p.origin;
 if(main){next=[...live].map(e=>isoDay(e.nextMonth,e.nextDay)).sort()[0]}
 if(!live.length&&p.policies.length){const known=p.policies.map(x=>x.monthly).filter(v=>v!=null);monthly=known.length?known.reduce((n,v)=>n+v,0):null;payment={kind:'policy',account:''};period=1;source='insurance'}
 if(p.manual){const m=p.manual;monthly=perMonth(m.amount||0,m.period||1);payment={kind:m.how||'other',account:''};period=m.period||1;next=m.nextDate||null;source='manual'}
 const installmentsLeft=live.map(e=>e.installmentsLeft).filter(v=>v!=null).sort((a,b)=>a-b)[0]??null;
 const ended=!live.length&&!p.policies.length&&!p.manual;
 // Payment history, newest month first: every charge of every statement name combined into this provider.
 const byMonth=new Map();for(const x of p.entries.flatMap(e=>e.payments||[])){const m=byMonth.get(x.month)||{month:x.month,amount:0,payments:[]};m.amount+=x.amount;m.payments.push(x);byMonth.set(x.month,m)}
 const history=[...byMonth.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({...m,payments:m.payments.sort((a,b)=>b.date.localeCompare(a.date))}));
 return {...p,monthly,payment,period,next,changePercent,installmentsLeft,source,ended,history,paid:history.reduce((n,m)=>n+m.amount,0),lastSeen:ended?p.entries.map(e=>e.months.at(-1)).sort().at(-1):null,
  types:[...new Set(p.policies.map(x=>x.type))],policyEnds:p.policies.map(x=>x.endDate).filter(Boolean).sort()[0]||'',firstMonth:p.entries.flatMap(e=>e.months).sort()[0]||null};
}

// Short, concrete things worth a look, without AI: price rises, two providers for the same thing, payments ending,
// new providers. The page turns these into sentences in the viewer's language.
export function providerHighlights(summary,{today}={}){
 const list=[],soon=today?new Date(Date.parse(today+'T12:00Z')+60*864e5).toISOString().slice(0,10):'';
 for(const p of summary.providers.filter(p=>p.changePercent>=5&&p.monthly).sort((a,b)=>b.changePercent-a.changePercent).slice(0,2))list.push({kind:'up',key:p.key,name:p.name,percent:p.changePercent});
 for(const area of ['streaming','music','mobile','internet','tv','gym','cloud']){const same=summary.providers.filter(p=>p.area===area);if(same.length>1)list.push({kind:'same',area,names:same.map(p=>p.name),monthly:same.reduce((n,p)=>n+(p.monthly||0),0)})}
 for(const p of summary.providers){if(p.installmentsLeft!=null&&p.installmentsLeft<=3)list.push({kind:'ending',key:p.key,name:p.name,left:p.installmentsLeft});else if(soon&&p.policyEnds&&p.policyEnds<=soon&&p.policyEnds>=today)list.push({kind:'renewal',key:p.key,name:p.name,date:p.policyEnds})}
 for(const p of summary.providers.filter(p=>p.firstMonth&&summary.month&&monthsBetween(p.firstMonth,summary.month)<=1&&p.entries.length))list.push({kind:'new',key:p.key,name:p.name,monthly:p.monthly});
 return list.slice(0,5);
}

// Settings arrive from a browser: keep only known fields, bounded sizes and valid values.
const text=(v,max=60)=>typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max):'';
const ids=v=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&/^[\w-]{1,64}$/.test(x)))].slice(0,20):undefined;
const keyOk=k=>typeof k==='string'&&/^(p|m|ins|add):[\p{L}\p{N}_-]{1,80}$/u.test(k);
export function cleanProviderSettings(value={}){
 const providers={};
 for(const [k,o]of Object.entries(value?.providers||{}).slice(0,300)){if(!keyOk(k)||!o||typeof o!=='object')continue;const c={};const name=text(o.name);if(name)c.name=name;if(PROVIDER_AREA[o.area])c.area=o.area;if(o.hidden===true)c.hidden=true;if(keyOk(o.mergeInto)&&o.mergeInto!==k)c.mergeInto=o.mergeInto;const m=ids(o.memberIds);if(m)c.memberIds=m;if(Object.keys(c).length)providers[k]=c}
 const added=(Array.isArray(value?.added)?value.added:[]).slice(0,100).map(a=>({id:text(a?.id,40).replace(/[^\w-]/g,''),name:text(a?.name),area:PROVIDER_AREA[a?.area]?a.area:'other',amount:Number.isSafeInteger(a?.amount)&&a.amount>=0&&a.amount<=1e9?a.amount:0,period:PROVIDER_PERIODS.includes(a?.period)?a.period:1,how:PAYMENT_KINDS.includes(a?.how)?a.how:'other',nextDate:/^\d{4}-\d{2}-\d{2}$/.test(a?.nextDate||'')?a.nextDate:'',memberIds:ids(a?.memberIds)||[],note:text(a?.note,200)})).filter(a=>a.id&&a.name);
 const aiLabels={};for(const [k,l]of Object.entries(value?.aiLabels||{}).slice(0,200)){if(!k.startsWith('m:')||!keyOk(k))continue;const name=text(l?.name);if(name||PROVIDER_AREA[l?.area])aiLabels[k]={...(name?{name}:{}),...(PROVIDER_AREA[l?.area]?{area:l.area}:{})}}
 return {providers,added,aiLabels};
}

// What the optional AI step may see: provider names, areas and monthly shekels, and for merchants the rules do
// not know, their statement names. Never card digits, accounts, people or raw rows.
export function providerAIContext(summary){
 const sh=v=>v==null?null:Math.round(v/100);
 return {currency:'ILS',month:summary.month,totalPerMonth:sh(summary.total),
  groups:summary.groups.map(g=>({group:g.en,perMonth:sh(g.monthly),providers:g.providers.map(p=>({key:p.key,name:p.name.en,area:p.area,perMonth:sh(p.monthly),everyMonths:p.period,changePercent:p.changePercent||0,...(p.known||p.renamed?{}:{statementNames:[...new Set(p.entries.flatMap(e=>e.names?.length?e.names:[e.description]))].slice(0,3)})}))}))};
}
// Accepts only labels for listed, unrecognised merchants and a few short sentences.
export function cleanProviderAI(output,summary){
 const unknown=new Set(summary.providers.filter(p=>!p.known&&!p.renamed&&p.key.startsWith('m:')).map(p=>p.key)),labels={};
 for(const l of Array.isArray(output?.labels)?output.labels.slice(0,100):[]){if(!unknown.has(l?.key))continue;const name=text(l.name);if(name||PROVIDER_AREA[l.area])labels[l.key]={...(name?{name}:{}),...(PROVIDER_AREA[l.area]?{area:l.area}:{})}}
 const points=(Array.isArray(output?.points)?output.points:[]).map(p=>text(p,240)).filter(Boolean).slice(0,4);
 return {labels,points};
}
// Changes when the providers or their amounts change, so a stored AI summary can say it is out of date.
export function providerFingerprint(summary){
 const s=summary.providers.map(p=>p.key+'='+(p.monthly??'?')).sort().join(';');let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36);
}
export const providerName=(p,lang)=>lang==='he'?p.name.he:p.name.en;
export const areaLabel=(area,lang)=>lang==='he'?PROVIDER_AREA[area]?.he:PROVIDER_AREA[area]?.en;
export const insuranceTypeLabel=(type,lang)=>{const t=INSURANCE_TYPES.find(([id])=>id===type);return t?(lang==='he'?t[2]:t[1]):''};
export {shiftMonth};

// Icon picker search over the Bayit icon catalog, in Hebrew and English.
// Text is compared without case, niqqud, geresh/gershayim or quotes, and with final letters folded (ט״ו = ט"ו = טו),
// so "חנוכה", "Hanukkah", "מסיבה", "party" and "פסח" find the right drawings. A Hebrew word with a leading ו/ה/ב/ל/מ/ש/כ
// (בחנוכה, והמסיבה) is also tried without it, ranked after direct matches.
const NIQQUD=/[֑-ׇ]/g,MARKS=/[״"׳'`־_.,:;!?()\/\\-]/g,FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
export const normalizeIconText=text=>String(text||'').toLowerCase().replace(NIQQUD,'').replace(MARKS,c=>c==='״'||c==='"'||c==='׳'||c==="'"?'':' ').replace(/[ךםןףץ]/g,c=>FINAL[c]).replace(/\s+/g,' ').trim();
const cache=new WeakMap();
function fields(item){let f=cache.get(item);if(!f){f={name:normalizeIconText(item.name),he:normalizeIconText(item.he),label:normalizeIconText(item.label),hay:normalizeIconText([item.tags,item.group,item.groupHe,item.name,item.he].join(' '))};cache.set(item,f)}return f}
// Rank: 0 exact name · 1 a whole word (or phrase) of the name or the keywords · 3 a name word starts with it · 4 the name
// contains it · 5 the keywords contain it · 6 every typed word somewhere; -1 no match. Ties keep catalog order. Whole words
// outrank prefixes, so "פסח" finds matzah (keyword פסח) before Easter (פסחא), and "חנוכה" lists the menorah first.
export function iconScore(item,q){
 if(!q)return 0;const f=fields(item),names=[f.name,f.he,f.label].filter(Boolean),word=t=>(' '+t+' ').includes(' '+q+' ');
 if(names.includes(q))return 0;if(names.some(word)||word(f.hay))return 1;
 if(names.some(n=>n.split(' ').some(w=>w.startsWith(q))))return 3;if(names.some(n=>n.includes(q)))return 4;
 if(f.hay.includes(q))return 5;const words=q.split(' ');return words.length>1&&words.every(w=>f.hay.includes(w))?6:-1;
}
const prefixed=q=>/^[א-ת]/.test(q)?[q.match(/^(וה|ול|וב|ומ|ש|כש)/)?.[0],q[0]].filter(p=>p&&/^[והבלמשכ]+$/.test(p)&&q.length-p.length>=3).map(p=>q.slice(p.length)):[];
export function searchIcons(items,query){
 const q=normalizeIconText(query);if(!q)return items;const tries=[q,...new Set(prefixed(q))],out=[];
 items.forEach((item,index)=>{let best=-1;tries.forEach((t,k)=>{const s=iconScore(item,t);if(s>=0&&(best<0||s+k*10<best))best=s+k*10});if(best>=0)out.push([best,index,item])});
 return out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(r=>r[2]);
}
// Recently chosen icons on this device (codes, newest first). Best effort: storage may be unavailable.
const RECENT='bayit-recent-icons';
export function readRecentIcons(storage=globalThis.localStorage){try{const list=JSON.parse(storage?.getItem(RECENT)||'[]');return Array.isArray(list)?list.filter(x=>typeof x==='string'&&x&&!x.startsWith('data:')).slice(0,12):[]}catch{return []}}
export function rememberIcon(code,storage=globalThis.localStorage){if(typeof code!=='string'||!code||code.startsWith('data:'))return readRecentIcons(storage);const next=[code,...readRecentIcons(storage).filter(x=>x!==code)].slice(0,12);try{storage?.setItem(RECENT,JSON.stringify(next))}catch{}return next}

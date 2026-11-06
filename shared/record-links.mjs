// A link identifies the original record; it contains no title, note, address or access token.
export function recordLink(base,{householdId,kind,id,date}){
 if(!householdId||!id||!['event','task'].includes(kind))throw Error('Choose an original household record.');
 const url=new URL(base);if(!['http:','https:'].includes(url.protocol))throw Error('Choose an app address.');
 url.search='';const params=new URLSearchParams({home:householdId,[kind]:id});
 if(/^\d{4}-\d{2}-\d{2}$/.test(date||''))params.set('date',date);
 url.hash=(kind==='event'?'calendar':'tasks')+'?'+params;return url.href;
}
export function linkedHousehold(hash){const id=new URLSearchParams(String(hash||'').split('?')[1]||'').get('home');return id&&id.length<=140?id:''}

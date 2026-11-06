// Persist user-written text and a Google Place ID only. Provider addresses/coordinates stay transient.
const limits={label:240,address:300,placeId:256};
export function normalizeLocation(value){
 if(value==null||value==='')return null;
 if(typeof value==='string')value={label:value};
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(limits,k)))throw Error('Choose a valid location.');
 const result={};
 for(const [key,max] of Object.entries(limits)){
  if(value[key]==null||value[key]==='')continue;
  if(typeof value[key]!=='string'||value[key].length>max||/[\u0000-\u001f\u007f]/.test(value[key]))throw Error('Choose a valid location.');
  const text=value[key].trim();if(text)result[key]=text;
 }
 if(result.placeId&&!/^[A-Za-z0-9_-]{1,256}$/.test(result.placeId))throw Error('Choose a valid map place.');
 return Object.keys(result).length?result:null;
}
export function locationOf(record){try{return normalizeLocation(record?.location)}catch{return null}}
export function mapsLink(location){
 const place=normalizeLocation(location);if(!place?.placeId&&!place?.address)return '';
 const url=new URL('https://www.google.com/maps/search/');url.searchParams.set('api','1');
 url.searchParams.set('query',place.address||place.label||place.placeId);
 if(place.placeId)url.searchParams.set('query_place_id',place.placeId);
 return url.href;
}
export function samePlace(a,b){return ['label','address','placeId'].every(k=>(a?.[k]||'')===(b?.[k]||''))}

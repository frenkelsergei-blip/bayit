export const PIN_COLLECTIONS=['documents','pantry','meals','tasks','events','notes'];
export const pinKey=pin=>pin.collection+':'+pin.id;
export function validatePins(pins){
 if(!Array.isArray(pins)||pins.length>100||pins.some(p=>!p||typeof p!=='object'||Object.keys(p).some(k=>!['collection','id'].includes(k))||!PIN_COLLECTIONS.includes(p.collection)||typeof p.id!=='string'||!p.id||p.id.length>180)||new Set(pins.map(pinKey)).size!==pins.length)throw Error('Choose valid personal pins.');
}
export function visiblePins(state,actor,visible){return (state.profiles?.[actor]?.pinnedRecords||[]).flatMap(pin=>{const record=(visible[pin.collection]||[]).find(r=>r.id===pin.id&&!r.deletedAt);return record?[{...pin,record}]:[]})}
export function recordRoute(collection,record){
 if(collection==='documents')return 'household/documents?doc='+encodeURIComponent(record.id);
 if(collection==='pantry')return 'household/pantry?item='+encodeURIComponent(record.id);
 if(collection==='meals')return 'household/meals?meal='+encodeURIComponent(record.id);
 if(collection==='tasks')return record.category==='maintenance'?'household/maintenance?task='+encodeURIComponent(record.id):'tasks?task='+encodeURIComponent(record.id)+(record.date?'&date='+record.date:'');
 return collection==='events'?'calendar?event='+encodeURIComponent(record.id)+(record.date?'&date='+record.date:''):(record.visibility==='private'?'mine/notes':'journal')+'?note='+encodeURIComponent(record.id);
}

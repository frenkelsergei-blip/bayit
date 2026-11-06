// Receipts can contain old record snapshots. Revocation also hides those snapshots, including after deletion.
export function receiptFilter(state,visible,collections,actor){
 const index=new Map();for(const collection of collections)for(const record of state[collection]||[]){if(!record?.ownerId||!record.id)continue;const key=JSON.stringify([record.ownerId,record.id]);if(!index.has(key))index.set(key,[]);index.get(key).push({collection,record})}
 const allowed=new Set(collections.flatMap(c=>(visible[c]||[]).map(r=>JSON.stringify([c,r.ownerId,r.id]))));
 return receipt=>{
  if(receipt?.ownerId!==actor)return false;let count=0;
  const visit=value=>{
   if(++count>16000)return false;if(!value||typeof value!=='object')return true;
   if(value.id&&value.ownerId&&value.visibility){const matches=index.get(JSON.stringify([value.ownerId,value.id]));if(matches?matches.some(({collection,record})=>!allowed.has(JSON.stringify([collection,record.ownerId,record.id]))):value.ownerId!==actor)return false}
   return Object.values(value).every(visit);
  };return visit(receipt);
 };
}

const DAY=86400000;
export function upgradeDemo(data){
 if(data.demoHistoryVersion===2||data.householdId&&data.householdId!=='demo')return data;
 const remaining={itai:16,noa:14,daniel:12,hila:14},types=[['Brush teeth','צחצוח שיניים','1FAA5',20],['Pack bag','אריזת תיק','1F392',16],['Wash dishes','שטיפת כלים','1F37D',12],['Other chores','מטלות נוספות','1F9F9',8]],members=['itai','noa','daniel','hila'],reserved=[['brush','itai',types[0]],['bag','itai',types[1]],['noa-brush','noa',types[0]],['noa-bag','noa',types[1]]],history=[];let sequence=0,memberCursor=0,typeCursor=0;
 [5,7,8,9,10,11,10].forEach((count,day)=>{const date=new Date(Date.UTC(2026,9,29)+day*DAY).toISOString().slice(0,10);for(let index=0;index<count;index++){
 let memberId,type,taskId;if(day===6&&index<4){[taskId,memberId,type]=reserved[index]}else{while(!remaining[members[memberCursor%4]])memberCursor++;memberId=members[memberCursor++%4];remaining[memberId]--;while(!types[typeCursor%4][3])typeCursor++;type=types[typeCursor++%4];type[3]--;taskId='sample-task-'+sequence}
 history.push({id:'sample-history-'+sequence++,taskId,title:type[0],he:type[1],icon:type[2],memberId,actorId:memberId,date,time:day===6&&index<4?['08:05','08:10','08:12','08:14'][index]:(7+index%13).toString().padStart(2,'0')+':'+(index*7%60).toString().padStart(2,'0'),done:true,state:'done',xp:10,ownerId:'daniel',visibility:'family',allowedIds:[],sample:true});
 }});
 data.history=[...(data.history||[]),...history.reverse()];
 const products=[['Milk','חלב','1F95B','Dairy',8],['Eggs','ביצים','1F95A','Dairy',6],['Tomatoes','עגבניות','1F345','Produce',5],['Apples','תפוחים','1F34E','Produce',4],['Cucumbers','מלפפונים','1F952','Produce',3],['Bread','לחם','1F35E','Pantry',7],['Olive oil','שמן זית','1FAD2','Pantry',4],['Rice','אורז','1F35A','Pantry',5],['Cleaning supplies','חומרי ניקוי','1F9FC','Household',6]],purchases=[];let product=0,n=0;
 [6,7,10,8,9,8].forEach((count,day)=>{const date=['2026-10-08','2026-10-13','2026-10-18','2026-10-23','2026-10-29','2026-11-03'][day];for(let i=0;i<count;i++){while(products[product][4]===0)product++;const [title,he,icon,group]=products[product];products[product][4]--;purchases.push({id:'sample-purchase-'+n,purchaseId:'sample-purchase-'+n++,title,he,icon,group,date,done:true,quantity:'1',memberId:members[i%4],ownerId:'daniel',visibility:'family',allowedIds:[],sample:true})}});
 data.purchases=[...purchases,...(data.purchases||[])];
 data.expenses=(data.expenses||[]).map(e=>({...e,ownerId:e.ownerId||e.memberId||'daniel',visibility:e.visibility||'selected',allowedIds:e.allowedIds||['daniel','hila'].filter(id=>id!==(e.ownerId||e.memberId))}));
 data.customIcons=(data.customIcons||[]).map(i=>({...i,ownerId:i.ownerId||'daniel',visibility:i.visibility||'private',allowedIds:i.allowedIds||[]}));
 data.demoHistoryVersion=2;return data;
}

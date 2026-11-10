// Fictional money rows and a short answered history for the demo household's בית AI only (no real data; the demo
// ledger and Who we pay keep their own samples). Months are relative to the demo day, so the same shared rules
// find a price jump (Cellcom), a new subscription (Disney+) and a double charge (Wolt).
const shift=(m,d)=>{const [y,mo]=m.split('-').map(Number),x=new Date(Date.UTC(y,mo-1+d,1));return x.toISOString().slice(0,7)};
export function demoMoneyRows(today){
 const now=today.slice(0,7),months=Array.from({length:9},(_,i)=>shift(now,i-8)),rows=[];let n=0;
 const add=(month,day,description,shekels,extra={})=>rows.push({id:'demo-bai-'+(++n),date:month+'-'+String(day).padStart(2,'0'),description,amount:-Math.round(shekels*100),category:'utilities',source:'isracard',account:'5512',kind:'card',visibility:'family',...extra});
 const day=Math.max(1,Number(today.slice(8,10))-1);
 months.forEach((m,i)=>{
  add(m,Math.min(day,10),'CELLCOM 052-5550101',i===8?129:89);
  add(m,Math.min(day,4),'חברת החשמל לישראל בע"מ',[389,402,395,398,410,388,391,396,455][i],{source:'leumi',account:'0457',kind:'bank'});
  add(m,Math.min(day,2),'NETFLIX.COM',54.9,{category:'subscriptions',source:'max',account:'4821'});
 });
 for(const m of months.slice(-3))add(m,Math.min(day,3),'DISNEY PLUS',39.9,{category:'subscriptions',source:'max',account:'4821'});
 add(now,day,'WOLT',142,{category:'dining',source:'max',account:'4821',time:'20:41'});add(now,day,'WOLT',142,{category:'dining',source:'max',account:'4821',time:'20:45'});
 return rows;
}
// Earlier recommendations the family already answered (for the "Checked" history).
export function demoHistory(today,adults,now){
 const m=shift(today.slice(0,7),-1),m2=shift(today.slice(0,7),-2),[x,y]=[adults[0],adults[1]||adults[0]];
 const hist=(id,kind,name,area,f,status,by,daysAgo,level)=>({id,scopeKey:'family',kind,area:'money',providerKey:'p:'+id,level,status,createdAt:now-(daysAgo+2)*86400000,answeredAt:now-daysAgo*86400000,answeredBy:by,taskId:null,assignees:[by],finding:{id,kind,area:'money',providerKey:'p:'+id,name,providerArea:area,level,...f},aiText:null});
 return [
  hist('spotify','jump',{en:'Spotify',he:'Spotify'},'music',{month:m,amount:2390,previous:1990,percent:20,steadyMonths:6,yearly:4800,history:[[m2,1990],[m,2390]].map(([month,amount])=>({month,amount}))},'ok',x,6,2),
  hist('holmes','new',{en:'Holmes Place',he:'הולמס פלייס'},'gym',{month:m,firstMonth:m2,amount:24900,charges:2,yearly:298800,history:[[m2,24900],[m,24900]].map(([month,amount])=>({month,amount}))},'action',y,9,3),
  hist('yes-planet','dup',{en:'Yes Planet',he:'יס פלאנט'},'other',{month:m2,amount:9600,dates:[m2+'-14',m2+'-14'],description:'YES PLANET',yearly:9600},'dismissed',x,30,2)
 ];
}

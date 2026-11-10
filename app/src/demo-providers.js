// Fictional sample money rows for the demo household's "Who we pay" view only (not the demo ledger, so other
// screens keep their sample numbers). Six months up to the demo date, with the messy statement names real
// imports have, so the grouping, price-rise and "two streaming services" notes show as they would at home.
const PAYMENTS=[ // statement name, ₪, day, months back that are charged, card (or '' for bank), category, standing order
 [['CELLCOM 052-5550101','סלקום ישראל בע"מ'],129,10,[6,5,4,3,2,1],'4821','utilities'],
 [['סלקום ישראל בע"מ'],20,12,[6,5,4,3,2,1],'','utilities'],
 [['CELLCOM FIBER','סלקום פייבר'],99,15,[6,5,4,3,2,1],'4821','utilities'], // Cellcom's internet: one company, two services
 [['FREETV.CO.IL'],49,22,[6,5,4,3,2,1],'4821','subscriptions'],
 [['חברת החשמל לישראל בע"מ'],546,4,[6,4,2],'','utilities',true],
 [['חברת החשמל לישראל בע"מ'],612,4,[0],'','utilities',true],
 [['עיריית תל אביב-יפו ארנונה'],690,1,[5,3,1],'','taxes',true],
 [['מי אביבים 2010 בע"מ'],180,18,[6,4,2],'4821','utilities'],
 [['סופרגז חברה ישראלית'],85,20,[6,5,4,3,2,1],'4821','utilities'],
 [['הראל חברה לביטוח בע"מ'],236,1,[6,5,4,3,2,1,0],'','insurance',true],
 [['מגדל ביטוח רכב'],310,12,[6,5,4,3,2,1],'7730','insurance'],
 [['הפניקס ביטוח דירה'],95,1,[6,5,4,3,2,1,0],'','insurance',true],
 [['NETFLIX.COM','Netflix.com Amsterdam'],54.9,14,[6,5,4,3,2,1],'4821','subscriptions'],
 [['DISNEY PLUS'],39.9,27,[6,5,4,3,2,1],'7730','subscriptions'],
 [['SPOTIFY P1A2B3C4'],29.9,8,[6,5,4,3,2,1],'4821','subscriptions'],
 [['APPLE.COM/BILL ICLOUD'],11.9,3,[6,5,4,3,2,1,0],'4821','subscriptions'],
 [['HOLMES PLACE TLV'],289,5,[6,5,4,3,2,1],'7730','leisure'],
 [['STINGTV IL'],29.9,9,[6,5,4],'4821','subscriptions'], // cancelled in the summer: shown as stopped
 [['קופיקס'],25,2,[6,5],'4821','dining'] // a café twice is not a provider
];
const shift=(month,delta)=>{const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1-delta,1));return d.toISOString().slice(0,7)};
export function demoProviderRows(today){
 const month=today.slice(0,7),day=Number(today.slice(8,10)),rows=[];let n=0;
 for(const [names,shekels,charge,back,card,category,standingOrder=false] of PAYMENTS)for(const b of back){
  if(b===0&&charge>day)continue; // this month's charge has not happened yet
  const m=shift(month,b),date=m+'-'+String(charge).padStart(2,'0');
  rows.push({id:'demo-provider-'+(++n),source:card?'max':'leumi',account:card,kind:card?'card':'bank',date,chargeDate:date,month:m,description:names[b%names.length],amount:-Math.round(shekels*100),currency:'ILS',category,standingOrder,memberId:card==='7730'?'hila':'daniel',ownerId:'daniel',visibility:'family',allowedIds:[],sample:true});
 }
 return rows;
}
// Who each sample provider is for, as a family would set it.
export const demoProviderSettings=lang=>({providers:{'p:holmes':{memberIds:['hila']},'p:cellcom':{memberIds:['daniel','hila']},'ins:migdal':{memberIds:['hila']}},added:[{id:'vaad',name:lang==='he'?'ועד בית':'Building committee',area:'building',amount:25000,period:1,how:'cash',nextDate:'',memberIds:[],note:''}],aiLabels:{}});

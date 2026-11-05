import {HOME_TIMEZONE} from '../../shared/home-config.mjs';
const cloudDate=(typeof window==='undefined'||import.meta.env?.VITE_BAYIT_CLOUD==='1')&&!(typeof window!=='undefined'&&new URLSearchParams(location.search).get('demo')==='1');
export const anchor=cloudDate?new Date().toLocaleDateString('en-CA',{timeZone:HOME_TIMEZONE}):'2026-11-04';
export const members=[
{id:'daniel',name:'Daniel',he:'דניאל',role:'parent',color:'blue',avatar:'avatar-daniel.png'},
{id:'hila',name:'Hila',he:'הילה',role:'parent',color:'peach',avatar:'avatar-hila.png'},
{id:'noa',name:'Noa',he:'נועה',role:'child',color:'lilac',avatar:'avatar-noa.png'},
{id:'itai',name:'Itai',he:'איתי',role:'child',color:'yellow',avatar:'avatar-itai.png'}];
const shared={visibility:'family',ownerId:'daniel',allowedIds:[]};
export const seed={
profiles:{daniel:{name:'Daniel',he:'דניאל'},hila:{name:'Hila',he:'הילה'},noa:{name:'Noa',he:'נועה',xp:340,equipped:''},itai:{name:'Itai',he:'איתי',xp:380,equipped:''}},
tasks:[
{id:'groceries',title:'Milk, eggs & bread',he:'חלב, ביצים ולחם',memberId:'daniel',icon:'1F6D2',done:false,kind:'shopping',date:anchor,...shared},
{id:'ride',title:'Arrange a ride for Noa',he:'לתאם הסעה לנועה',memberId:'daniel',icon:'1F697',done:false,date:anchor,...shared},
{id:'plants',title:'Water the plants',he:'להשקות את העציצים',memberId:'hila',icon:'1FAB4',done:false,repeat:'Daily',date:anchor,time:'18:00',...shared},
{id:'brush',title:'Brush my teeth',he:'צחצוח שיניים',memberId:'itai',icon:'1FAA5',done:true,xp:10,time:'08:05',date:anchor,routine:true,...shared},
{id:'bag',title:'Pack my school bag',he:'לארוז תיק לבית הספר',memberId:'itai',icon:'1F392',done:true,xp:10,time:'08:10',date:anchor,routine:true,...shared},
{id:'shower',title:'Take a shower',he:'מקלחת',memberId:'itai',icon:'1F6BF',done:false,xp:10,time:'19:00',date:anchor,routine:true,...shared},
{id:'toys',title:'Tidy up my toys',he:'לסדר את הצעצועים',memberId:'itai',icon:'1F9F8',done:false,xp:10,time:'19:30',date:anchor,routine:true,...shared},
{id:'noa-brush',title:'Brush my teeth',he:'צחצוח שיניים',memberId:'noa',icon:'1FAA5',done:true,xp:10,time:'08:12',date:anchor,routine:true,...shared},
{id:'noa-bag',title:'Pack my school bag',he:'לארוז תיק לבית הספר',memberId:'noa',icon:'1F392',done:true,xp:10,time:'08:14',date:anchor,routine:true,...shared},
{id:'noa-shower',title:'Take a shower',he:'מקלחת',memberId:'noa',icon:'1F6BF',done:false,xp:10,time:'19:15',date:anchor,routine:true,...shared},
{id:'noa-toys',title:'Tidy up my toys',he:'לסדר את הצעצועים',memberId:'noa',icon:'1F9F8',done:false,xp:10,time:'19:45',date:anchor,routine:true,...shared}],
events:[
{id:'swim',title:'Swimming · Noa',he:'חוג שחייה · נועה',date:'2026-11-01',time:'16:00',memberIds:['noa'],icon:'1F3CA',color:'lilac',...shared},
{id:'monday',title:'Family dinner',he:'ארוחת ערב משפחתית',date:'2026-11-02',time:'18:30',memberIds:['daniel','hila','noa','itai'],icon:'1F37D',color:'peach',...shared},
{id:'tue-shop',title:'Shopping for the week',he:'קניות לשבוע',date:'2026-11-03',time:'17:30',memberIds:['daniel'],icon:'1F6D2',color:'green',...shared},
{id:'home',title:'Itai is staying home',he:'איתי בבית',date:anchor,time:'08:00',memberIds:['itai'],note:'Not feeling well this morning.',noteHe:'לא הרגיש טוב הבוקר.',icon:'1F3E0',color:'peach',...shared},
{id:'doctor',title:'Pediatrician · Itai',he:'רופא ילדים · איתי',date:anchor,time:'16:30',memberIds:['itai','daniel'],note:'Not feeling well this morning.',noteHe:'לא הרגיש טוב הבוקר.',icon:'1FA7A',color:'lilac',...shared},
{id:'dinner',title:'Family dinner',he:'ארוחת ערב',date:anchor,time:'18:00',memberIds:['daniel','hila','noa','itai'],icon:'1F37D',color:'green',...shared},
{id:'thursday',title:'Family dinner',he:'ארוחה משפחתית',date:'2026-11-05',time:'18:00',memberIds:['daniel','hila','noa','itai'],icon:'1F37D',color:'yellow',...shared},
{id:'friday',title:'Groceries for the weekend',he:'קניות לסוף השבוע',date:'2026-11-06',time:'10:00',memberIds:['daniel'],icon:'1F6D2',color:'lilac',...shared},
{id:'outing',title:'Family outing',he:'טיול משפחתי',date:'2026-11-07',time:'11:00',memberIds:['daniel','hila','noa','itai'],icon:'1F333',color:'green',...shared},
{id:'reading',title:'Reading time',he:'זמן קריאה',date:anchor,time:'20:30',memberIds:['daniel'],icon:'1F4D6',color:'lilac',ownerId:'daniel',visibility:'private',allowedIds:[]}],
shopping:[
{id:'tomatoes',title:'Tomatoes',he:'עגבניות',quantity:'2 kg',group:'Produce',icon:'1F345',done:false,...shared},
{id:'cucumbers',title:'Cucumbers',he:'מלפפונים',quantity:'1 kg',group:'Produce',icon:'1F952',done:false,...shared},
{id:'apples',title:'Apples',he:'תפוחים',quantity:'6',group:'Produce',icon:'1F34E',done:true,...shared},
{id:'milk',title:'Milk',he:'חלב',quantity:'2 bottles',group:'Dairy',icon:'1F95B',done:false,...shared},
{id:'eggs',title:'Eggs',he:'ביצים',quantity:'12',group:'Dairy',icon:'1F95A',done:true,...shared},
{id:'oil',title:'Olive oil',he:'שמן זית',quantity:'1 bottle',group:'Pantry',icon:'1FAD2',done:false,...shared},
{id:'bread',title:'Bread',he:'לחם',quantity:'2 loaves',group:'Pantry',icon:'1F35E',done:false,...shared}],
notes:[
{id:'sick-today',title:'Itai is staying home',he:'איתי נשאר היום בבית',text:'Not feeling well this morning. Update the kindergarten.',textHe:'לא הרגיש טוב בבוקר. לעדכן את הגן.',date:anchor,time:'08:00',memberId:'itai',...shared},
{id:'sick-oct',title:'Itai stayed home',he:'איתי נשאר בבית',text:'Not feeling well today. Stayed home from kindergarten.',textHe:'לא הרגיש טוב היום. נשאר בבית ולא הלך לגן.',date:'2026-10-21',time:'08:15',memberId:'itai',...shared},
{id:'private-daniel',title:'Birthday ideas',he:'רעיונות ליום ההולדת',text:'A picnic in the park and a chocolate cake. Prepare a guest list together.',textHe:'פיקניק בפארק ועוגת שוקולד. להכין יחד רשימת מוזמנים.',date:anchor,memberId:'daniel',ownerId:'daniel',visibility:'private',allowedIds:[]},
{id:'private-itai',title:'My story ideas',he:'הרעיונות שלי לסיפור',text:'An explorer and a tiny dragon in a blue house.',textHe:'הרפתקן ודרקון קטן בבית כחול.',date:anchor,memberId:'itai',ownerId:'itai',visibility:'private',allowedIds:[]}],
history:[],favoriteIcons:['1F6BF','1FAA5','1F37D','1F392','1FAB4','1F9F8'],
preferences:{smartSuggestions:true,maxSuggestions:2,quietStart:'20:30',quietEnd:'07:00',reminder:10,notifications:true,parentUpdates:true},
customIcons:[],acceptedSuggestions:[],dismissedSuggestions:[],
expenses:[{id:'e1',title:'Groceries',he:'קניות',amount:420,date:'2026-11-01',memberId:'daniel'},{id:'e2',title:'Electricity',he:'חשמל',amount:580,date:'2026-11-02',memberId:'hila'},{id:'e3',title:'Internet',he:'אינטרנט',amount:120,date:'2026-11-03',memberId:'daniel'},{id:'e4',title:'Cleaning supplies',he:'חומרי ניקוי',amount:80,date:anchor,memberId:'hila'}]};
export function canSee(item,userId){return item.ownerId===userId||item.visibility==='family'||(item.visibility==='selected'&&(item.allowedIds||[]).includes(userId));}
export const member=(id)=>members.find(m=>m.id===id)||members[0];
export const weekdaysEn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const weekdaysHe=['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];


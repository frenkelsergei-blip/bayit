// Original generated Bayit PNGs. Prices are virtual stars, never money.
const pixel=name=>'/assets/icons/bayit/pixel/'+name+'-256.png';
const extra=name=>'/assets/generated/hero-home/'+name+'.png';
const item=(id,en,he,category,slot,price,level=1,icon=id,more={})=>({id,en,he,category,slot,price,level,image:pixel(icon),...more});
export const HERO_ITEMS=[
 item('apple','Crunchy apple','תפוח פריך','food',null,2,1,'apple',{nutrition:25}),
 item('bread','Fresh bread','לחם טרי','food',null,2,1,'bread',{nutrition:30}),
 item('milk','Glass of milk','כוס חלב','food',null,2,1,'milk-carton',{nutrition:20}),
 item('rice','Warm rice','אורז חם','food',null,3,1,'rice-bag',{nutrition:40}),
 item('vegetables','Vegetable basket','סל ירקות','food',null,3,1,'vegetable-basket',{nutrition:35}),
 item('dinner','Homemade dinner','ארוחה ביתית','food',null,4,1,'dinner-plate',{nutrition:50}),
 item('cap','Blue cap','כובע כחול','gear','hat',0,1,'blue-cap'),
 item('cape','Moon cape','גלימת ירח','gear','outfit',0,5,'moon-cape'),
 item('wizard','Star wizard hat','כובע קוסמים','gear','hat',16,2,'star-wizard-hat'),
 ...[
  ['crown','Royal crown','כתר מלכותי',24,3],['pirate','Star pirate hat','כובע פיראט הכוכבים',18,2],
  ['space','Space helmet','קסדת חלל',32,4],['explorer','Explorer hat','כובע הרפתקאות',12,1],
  ['flowers','Flower crown','זר פרחים',16,2],['robot','Robot helmet','קסדת רובוט',28,3],
  ['headphones','Music headphones','אוזניות מוזיקה',20,2],
 ].map(([id,en,he,price,level])=>item(id,en,he,'gear','hat',price,level,id,{image:extra(id)})),
 item('lantern','Explorer lantern','עששית הרפתקאות','gear','hand',10,1,'lantern'),
 item('shield','Wooden shield','מגן עץ','gear','hand',16,2,'wooden-shield'),
 ...[
  ['wand','Star wand','שרביט כוכבים',20,2],['magnifier','Mystery magnifier','זכוכית מגדלת',10,1],
  ['kite','Sunny kite','עפיפון שמשי',14,1],['paintbrush','Artist brush','מכחול אומנים',14,1],
  ['telescope','Little telescope','טלסקופ קטן',22,3],
 ].map(([id,en,he,price,level])=>item(id,en,he,'gear','hand',price,level,id,{image:extra(id)})),
 item('heart','Heart pin','סיכת לב','gear','badge',6,1,'heart-badge'),
 item('sun','Sun pin','סיכת שמש','gear','badge',8,1,'sun-badge'),
 item('moon','Moon pin','סיכת ירח','gear','badge',10,2,'moon-badge'),
 item('helper','Helping hand','יד עוזרת','gear','badge',10,2,'helping-hand-badge'),
 item('gold','Golden medal','מדליית זהב','gear','badge',28,4,'gold-medal'),
 item('silver','Silver medal','מדליית כסף','gear','badge',18,3,'silver-medal'),
 item('bronze','Bronze medal','מדליית ארד','gear','badge',12,2,'bronze-medal'),
 item('dog','Friendly puppy','כלבלב חבר','pets','pet',18,1,'dog'),
 item('cat','Little kitten','חתלתול קטן','pets','pet',18,1,'cat'),
 item('rabbit','Fluffy rabbit','ארנבון רך','pets','pet',22,2,'rabbit'),
 item('bird','Blue bird','ציפור כחולה','pets','pet',24,2,'bird'),
 item('dragon','Tiny dragon','דרקון קטן','pets','pet',45,5,'tiny-friendly-dragon'),
 ...[
  ['plant','Leafy friend','חבר ירוק',6,'houseplant'],['flowers-pot','Happy flowers','פרחים שמחים',8,'flowerpot'],
  ['tree','A tree by the window','עץ ליד החלון',14,'tree'],['books','Reading corner','פינת קריאה',10,'reading-book'],
  ['pencils','Art corner','פינת יצירה',8,'pencil-cup'],['toybox','Treasure chest','תיבת אוצר',14,'toy-chest'],
  ['puzzle','Puzzle time','זמן פאזל',8,'puzzle'],['ball','My football','הכדור שלי',8,'football'],
  ['bike','Adventure bicycle','אופני הרפתקאות',22,'bicycle'],['trophy','Little trophy','גביע קטן',22,'trophy'],
  ['gift','A lovely gift','מתנה קטנה',12,'gift-box'],['watering','Little watering can','משפך קטן',6,'watering-can'],
  ['clock','Sunny alarm clock','שעון בוקר',8,'alarm-clock'],['calendar','My little calendar','לוח שנה קטן',6,'calendar'],['dollhouse','Little dollhouse','בית בובות קטן',16,'blue-house'],
 ].map(([id,en,he,price,icon])=>item(id,en,he,'room','decor',price,1,icon)),
 ...[
  ['bounce','Happy bounce','קפיצה שמחה',0,1,'yellow-star'],['dance','Happy dance','ריקוד שמח',8,1,'musical-note'],
  ['twirl','Little twirl','סיבוב קטן',12,2,'smiling-sun'],['float','Moon float','ריחוף ירח',24,3,'moon-badge'],
  ['hop','Bunny hop','קפיצת ארנב',10,1,'rabbit'],['hero','Hero pose','תנוחת גיבור',16,2,'wooden-shield'],
  ['wiggle','Silly wiggle','נענוע מצחיק',8,1,'puzzle'],['starburst','Star party','מסיבת כוכבים',28,4,'yellow-star'],
  ['heartburst','Hearts everywhere','גשם של לבבות',22,3,'heart-badge'],['music','Music time','זמן מוזיקה',18,2,'musical-note'],
 ].map(([id,en,he,price,level,icon])=>item(id,en,he,'moves','motion',price,level,icon)),
];
export const HERO_BY_ID=Object.freeze(Object.assign(Object.create(null),Object.fromEntries(HERO_ITEMS.map(i=>[i.id,i]))));
export const HERO_SLOTS=['hat','outfit','hand','badge','pet','decor','motion'];
export const HERO_CATEGORIES=[['all','Everything','הכול'],['food','Food','אוכל'],['gear','Accessories','אביזרים'],['pets','Companions','חברים'],['room','Room','לחדר'],['moves','Moves','תנועות']];
export const HERO_STARTER_STARS=12;
export const HERO_XP_PER_STAR=10;

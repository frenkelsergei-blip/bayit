import {test} from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
import {matchItem,findItem,iconSearch,iconIdsFor,stem,words,ITEMS,SHOPPING_CATEGORIES,SHOPPING_CATEGORY_KEYS,dictionarySize} from '../shared/item-dictionary.mjs';
const root=new URL('../app/public',import.meta.url).pathname;
const catalog=JSON.parse(readFileSync(new URL('../app/public/assets/icons/catalog.json',import.meta.url)));
const resolvable=icon=>catalog.some(i=>i.id===icon||i.aliases?.includes(icon))||existsSync(root+'/assets/icons/openmoji/svg/'+icon+'.svg');
const cucumber='bayit-groceries-cucumber';

test('cucumber in Hebrew and English, singular and plural, with ה־ prefix and niqqud',()=>{
 for(const text of ['מלפפון','מלפפונים','המלפפונים','cucumber','Cucumbers','  מלפפון  ','מְלָפְפוֹן','2 מלפפונים','מלפפוני בייבי'])assert.deepEqual([text,matchItem(text).icon,matchItem(text).group],[text,cucumber,'Produce']);
});
test('common Hebrew items get their own icon and category',()=>{
 const cases={'עגבניות':['bayit-groceries-tomatoes','Produce'],'עגבנייה':['bayit-groceries-tomatoes','Produce'],'חלב':['bayit-groceries-milk-carton','Dairy'],'ביצים':['bayit-groceries-eggs','Dairy'],'קוטג׳':['bayit-groceries-cheese','Dairy'],"קוטג'":['bayit-groceries-cheese','Dairy'],'לחם':['bayit-groceries-bread','Bakery'],'פיתות':['bayit-groceries-pita','Bakery'],'שמן זית':['bayit-groceries-olive-oil','Pantry'],'תפו"א':['bayit-groceries-potato','Produce'],'תפוחי אדמה':['bayit-groceries-potato','Produce'],'חזה עוף':['bayit-groceries-chicken','Meat & fish'],'נייר טואלט':['bayit-groceries-toilet-paper','Household'],'משחת שיניים':['bayit-activities-toothpaste','Personal care'],'חיתולים':['1F9F7','Baby'],'אוכל לחתול':['bayit-activities-pet-food','Pets'],'גלידה':['1F368','Frozen'],'בירה':['1F37A','Drinks'],'במבה':['1F95C','Snacks'],'צ׳יפס':['1F35F','Frozen']};
 for(const [text,[icon,group]] of Object.entries(cases))assert.deepEqual([text,matchItem(text).icon,matchItem(text).group],[text,icon,group]);
});
test('longer phrases win over single words',()=>{
 assert.equal(findItem('מלפפונים חמוצים').key,'pickles');assert.equal(findItem('פלפל שחור').key,'salt');assert.equal(findItem('פלפל').key,'pepper');
 assert.equal(findItem('olive oil').key,'olive-oil');assert.equal(findItem('ice cream').key,'ice-cream');assert.equal(findItem('מיץ תפוזים').key,'juice');assert.equal(findItem('עוגת יום הולדת').key,'birthday-cake');
});
test('head noun: first word in Hebrew, last word in English',()=>{
 assert.equal(findItem('שוקולד חלב').key,'chocolate');assert.equal(findItem('almond milk').key,'milk');assert.equal(findItem('chocolate milk').key,'chocolate-milk');assert.equal(findItem('milk chocolate').key,'chocolate');
});
test('English plurals and capitals',()=>{
 for(const [text,key] of [['Tomatoes','tomato'],['potatoes','potato'],['cherries','cherries'],['Cherry tomatoes','tomato'],['eggs','eggs'],['Bananas','banana'],['hummus','chickpeas'],['dish soap','dish-soap']])assert.equal(findItem(text)?.key,key,text);
});
test('similar Hebrew words stay apart',()=>{for(const [text,key] of [['עוגיות','cookies'],['עוגה','cake'],['סוכריות','candy'],['סוכר','sugar'],['מרכך','shampoo'],['מרכך כביסה','laundry-detergent'],['בייגל','bagel'],['בייגלה','pretzel'],['עגבניה','tomato'],['קיווי','kiwi'],['קיוי','kiwi']])assert.equal(findItem(text)?.key,key,text)});
test('unknown words fall back to the cart in Other',()=>{assert.deepEqual(matchItem('xyzzy'),{icon:'1F6D2',group:'Other',key:null});assert.deepEqual(matchItem(''),{icon:'1F6D2',group:'Other',key:null})});
test('stems are shared by spellings',()=>{assert.equal(stem('עגבניות'),stem('עגבנייה'));assert.equal(stem('מלפפונים'),stem('מלפפון'));assert.equal(stem('tomatoes'),stem('tomato'));assert.deepEqual(words('קוטג׳ 5%'),['קוטג','5%'])});
test('coverage: at least 150 items, every icon is a real asset and every group a built-in category',()=>{
 assert.ok(ITEMS.length>=150,'items: '+ITEMS.length);assert.ok(dictionarySize().names>=1000);
 for(const [key,icon,group,en,he] of ITEMS){assert.ok(resolvable(icon),key+' icon '+icon);assert.ok(SHOPPING_CATEGORY_KEYS.includes(group),key+' group '+group);assert.ok(en.length&&he.length,key)}
 for(const [,he,icon] of SHOPPING_CATEGORIES){assert.ok(he);assert.ok(resolvable(icon),icon)}
 const keys=ITEMS.map(i=>i[0]);assert.equal(new Set(keys).size,keys.length);
});
test('icon search finds icons by Hebrew or English words and partial text',()=>{
 assert.equal(iconSearch('מלפפון')[0].icon,cucumber);assert.equal(iconSearch('cucum')[0].icon,cucumber);assert.ok(iconIdsFor('מלפ').has(cucumber));
 assert.ok(iconIdsFor('גבינה').has('bayit-groceries-cheese'));assert.ok(iconIdsFor('soap').has('bayit-activities-soap'));assert.equal(iconSearch('').length,0);
});

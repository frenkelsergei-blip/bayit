// Bayit icon catalog and picker search (2026-11-10: the generated "life" set for events, holidays and everyday tasks).
import {test} from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
import {searchIcons,normalizeIconText,readRecentIcons,rememberIcon} from '../shared/icon-search.mjs';
const pub=new URL('../app/public',import.meta.url).pathname,read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const catalog=read('../app/public/assets/icons/catalog.json'),bundled=read('../design-system/bayit-icons.json');
const picker=catalog.filter(i=>i.collection!=='pixel'),ids=(q,n=12)=>searchIcons(picker,q).slice(0,n).map(i=>i.id);
const life=catalog.filter(i=>i.collection==='life'),has=id=>catalog.some(i=>i.id===id);

test('the bundled default catalog is the published one',()=>assert.deepEqual(bundled,catalog));
test('ids are unique, every file exists, and an OpenMoji code belongs to at most one drawing',()=>{
 assert.equal(new Set(catalog.map(i=>i.id)).size,catalog.length);
 const filesOf=i=>i.files||(i.collection==='life'?Object.fromEntries([64,128,256].map(n=>[n,'/assets/icons/bayit/life/'+i.id.slice(11)+'-'+n+'.png'])):{});
 for(const i of catalog)for(const [size,file] of Object.entries(filesOf(i)))assert.ok(existsSync(pub+file),i.id+' '+size);
 const aliases=catalog.flatMap(i=>i.aliases||[]);assert.equal(new Set(aliases).size,aliases.length);
});
test('every new icon has English and Hebrew names, a bilingual category; its three sizes exist (checked above)',()=>{
 assert.ok(life.length>=300,'life icons: '+life.length);
 for(const i of life){assert.match(i.id,/^bayit-life-[a-z0-9-]+$/);assert.ok(i.name&&/[א-ת]/.test(i.he),i.id);assert.ok(i.group&&/[א-ת]/.test(i.groupHe),i.id);assert.equal(i.files,undefined,'life files follow from the id')}
 assert.ok(catalog.length>=450,'catalog: '+catalog.length);
});
test('the general defaults exist and lead the picker',()=>{
 for(const slug of ['celebration','holiday','event','party','birthday-kid','birthday-adult','family-gathering','religious-holiday','trip'])assert.ok(has('bayit-life-'+slug),slug);
 assert.equal(picker[0].id,'bayit-life-celebration');
});
test('parties and birthdays in Hebrew and English',()=>{
 for(const q of ['מסיבה','party','Party'])assert.ok(ids(q,3).includes('bayit-life-party'),q);
 for(const q of ['יום הולדת','birthday'])assert.ok(ids(q).some(id=>/birthday/.test(id)),q);
});
test('Jewish holidays',()=>{
 const cases={'חנוכה':['menorah','dreidel','sufganiyah'],'Hanukkah':['menorah','dreidel'],'בחנוכה':['menorah'],'פסח':['matzah','seder-plate'],'passover':['matzah'],
  'ראש השנה':['shofar','apple-honey'],'יום כיפור':['synagogue'],'סוכות':['sukkah','four-species'],'פורים':['hamantash','purim-mask'],'ט״ו בשבט':['almond-blossom'],'ט"ו בשבט':['almond-blossom'],
  'טו בשבט':['almond-blossom'],'שבועות':['wheat-sheaf','cheesecake'],'ל״ג בעומר':['bonfire'],'לג בעומר':['bonfire'],'יום העצמאות':['israel-flag'],'שבת':['shabbat-candles']};
 for(const [q,want] of Object.entries(cases)){const got=ids(q,20);for(const w of want)assert.ok(got.includes('bayit-life-'+w),q+' → '+w)}
});
test('Christian, Muslim and other holidays',()=>{
 const cases={'Christmas':'christmas-tree','חג המולד':'christmas-tree','Easter':'easter-eggs','רמדאן':'ramadan-lantern','Ramadan':'ramadan-lantern','עיד אל פיטר':'eid-al-fitr','Diwali':'diwali','סילבסטר':'new-years-eve'};
 for(const [q,w] of Object.entries(cases))assert.ok(ids(q,8).includes('bayit-life-'+w),q+' → '+w);
});
test('a holiday without its own drawing falls back to the general Holiday icon',()=>{
 for(const q of ['Thanksgiving','Holi','סיגד','תשעה באב'])assert.ok(ids(q,6).includes('bayit-life-holiday'),q);
});
test('everyday themes',()=>{
 const cases={'ילד חולה':'sick-day','רופא שיניים':'tooth','טיסה':'airplane','flight':'airplane','טסט':'car-test','מילואים':'reserve-duty','וטרינר':'vet','חשבון חשמל':'electricity','גשם':'rain','אסיפת הורים':'teacher-apple'};
 for(const [q,w] of Object.entries(cases))assert.ok(ids(q,8).includes('bayit-life-'+w),q+' → '+w);
});
test('search text ignores case, niqqud, quotes and final letters',()=>{
 assert.equal(normalizeIconText('  ט״ו   בשבט '),'טו בשבט');assert.equal(normalizeIconText('PARTY'),'party');assert.equal(normalizeIconText('חֲנוּכָּה'),'חנוכה');assert.equal(normalizeIconText('בלון'),'בלונ');
 assert.deepEqual(searchIcons(picker,'   '),picker);
});
test('recent icons: newest first, no duplicates, at most 12, never an uploaded image, survives broken storage',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 for(let n=0;n<15;n++)rememberIcon('bayit-life-'+n,storage);rememberIcon('bayit-life-3',storage);rememberIcon('data:image/png;base64,xx',storage);
 const list=readRecentIcons(storage);assert.equal(list.length,12);assert.equal(list[0],'bayit-life-3');assert.equal(new Set(list).size,12);
 const broken={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}};assert.deepEqual(readRecentIcons(broken),[]);assert.deepEqual(rememberIcon('x',broken),['x']);
});

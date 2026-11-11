// Features registry (user decision 2026-11-09): one source of truth for which features a family and each person use.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEATURES,FEATURE_IDS,NEUTRAL_ROUTES,NEUTRAL_WIDGETS,featureDefaults,inferFeatures,resolveFeatures,validateFeatures,validateFeaturesByUser,featureOn,featureContext,routeFeature,routeAllowed,widgetFeature,statsFeature,telegramFeature,aiToolFeature,actionFeature,recordFeature,deliveryView,stateFeatureContext} from '../shared/features.mjs';
import {blankState,visibleState,applyChanges} from '../app/cloud/state.mjs';
import {pushMessages} from '../app/cloud/push.mjs';
import {aiTools} from '../shared/ai-contract.mjs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const members=[{id:'mom',name:'Mom',role:'parent'},{id:'dad',name:'Dad',role:'adult'},{id:'kid',name:'Kid',role:'child'}];
function home(features){
 const d=blankState('home','Fictional household',members[0]);d.members=structuredClone(members);
 for(const m of members)d.profiles[m.id]={name:m.name,locale:'en'};
 if(features)d.preferences.features=features;
 return d;
}

// ---- Coverage: a new route, widget, tab, command or AI tool must be mapped to a feature (or listed as neutral).
test('every app route, Household tab and Kids/Settings page belongs to a feature or is neutral',()=>{
 const app=src('app/src/App.jsx');
 const routes=[...app.match(/const routes=\[(.*?)\];/)[1].matchAll(/\['(\w+)'/g)].map(m=>m[1]);
 assert.ok(routes.length>=9);
 for(const r of [...routes,'mine'])assert.ok(routeFeature(r),'route '+r+' has no feature in shared/features.mjs');
 const household=[...app.match(/function Household\(.*?sections=\[(.*?)\]\.filter/s)[1].matchAll(/\["(\w+)",a\.T/g)].map(m=>m[1]);
 assert.ok(household.includes('expenses')&&household.includes('meals'));
 for(const tab of household)assert.notEqual(routeFeature('household/'+tab),'household','Household tab '+tab+' has no feature');
 const switchRoots=[...app.match(/const subview=\(\)=>\{(.*?)\};/s)[1].matchAll(/root==='(\w+)'/g)].map(m=>m[1]);
 // 'x' is the feature-module namespace: x/<id> belongs to that module's own feature (tests/feature-modules.test.mjs).
 for(const r of switchRoots)assert.ok(routeFeature(r)||NEUTRAL_ROUTES.includes(r)||r==='x','route '+r+' is neither a feature nor neutral');
});

test('every Today widget, Statistics tab, Telegram command and AI tool is mapped',()=>{
 const app=src('app/src/App.jsx'),today=app.match(/available=\{\[(.*?)\]\.filter/s)[1];
 const household=JSON.parse(src('app/src/household-widgets.jsx').match(/HOUSEHOLD_WIDGETS=(\[.*?\])/)[1].replace(/'/g,'"'));
 const widgets=[...new Set([...today.replace(/[!=]==?'\w+'/g,'').matchAll(/'(\w+)'/g)].map(m=>m[1]).concat(household))];
 for(const w of widgets)assert.ok(widgetFeature(w)||NEUTRAL_WIDGETS.includes(w),'Today widget '+w+' has no feature');
 const tabs=[...src('app/src/statistics-view.jsx').match(/const TABS=\[(.*?)\];/)[1].matchAll(/\['(\w+)',/g)].map(m=>m[1]);
 for(const t of tabs)assert.ok(statsFeature(t),'Statistics tab '+t+' has no feature');
 const commands=[...src('app/cloud/telegram.mjs').match(/const COMMANDS=\{en:\[(.*?)\]\],/s)[1].matchAll(/\['(\w+)',/g)].map(m=>m[1]);
 for(const c of commands)assert.ok(telegramFeature(c),'Telegram command /'+c+' has no feature');
 for(const t of aiTools)assert.ok(aiToolFeature(t.name),'AI tool '+t.name+' has no feature');
 for(const kind of ['task.create','event.create','shopping.add','shopping.list.create','note.create','expense.create'])assert.ok(actionFeature({kind}),kind);
 assert.equal(actionFeature({kind:'task.create',routine:true}),'kids');
});

test('registry entries are complete and bilingual',()=>{
 assert.equal(new Set(FEATURE_IDS).size,FEATURE_IDS.length);
 for(const f of FEATURES){assert.ok(f.en&&f.he&&f.description?.en&&f.description?.he&&f.icon&&f.group,f.id)}
 assert.ok(featureById_today());
 function featureById_today(){return FEATURES.find(f=>f.id==='today').always}
});

// ---- Defaults and existing households
test('a new family starts with the Core 5; everything else is offered',()=>{
 const d=featureDefaults();
 assert.deepEqual(Object.keys(d).filter(k=>d[k]).sort(),['calendar','mine','shopping','tasks','today']);
 assert.equal(src('app/cloud/worker.mjs').includes('state.preferences.features=featureDefaults()'),true);
});

test('an existing family keeps what it uses after the update and loses only empty features',()=>{
 const d=home();d.notes=[{id:'n',title:'Note'}];d.tasks=[{id:'r',title:'Brush',routine:true,memberId:'kid'}];d.preferences.inventory=[{id:'p'}];
 const f=resolveFeatures(undefined,d);
 for(const id of ['today','tasks','calendar','shopping','mine','journal','kids','pantry','expenses','vouchers','statistics','ai','telegram'])assert.equal(f[id],true,id);
 for(const id of ['insurance','documents','maintenance','meals'])assert.equal(f[id],false,id);
 // The resolved choice reaches every member through visibleState, the same for everyone.
 assert.deepEqual(visibleState(d,'dad').preferences.features,f);
});

test('a saved choice wins, Today is always on, and new registry ids use their default',()=>{
 const f=resolveFeatures({kids:false,today:false,tasks:true});
 assert.equal(f.today,true);assert.equal(f.kids,false);assert.equal(f.journal,false);assert.equal(f.tasks,true);
 assert.throws(()=>validateFeatures({today:false}));assert.throws(()=>validateFeatures({nope:true}));assert.throws(()=>validateFeatures({kids:'yes'}));
 assert.throws(()=>validateFeaturesByUser({mom:{hidden:['today']}}));validateFeaturesByUser({mom:{hidden:['kids']}});
});

// ---- Who decides
test('only a parent changes the family features; each person hides only in their own app',()=>{
 const d=home(featureDefaults());
 assert.throws(()=>applyChanges(d,[{collection:'preferences',id:'features',value:{...featureDefaults(),kids:true}}],'dad','adult'),/parent/);
 const next=applyChanges(d,[{collection:'preferences',id:'features',value:{...featureDefaults(),kids:true}}],'mom','parent');
 assert.equal(next.preferences.features.kids,true);
 const hidden=applyChanges(next,[{collection:'preferences',id:'featuresByUser',value:{dad:{hidden:['calendar']},mom:{hidden:['tasks']}}}],'dad','adult');
 assert.deepEqual(hidden.preferences.featuresByUser,{dad:{hidden:['calendar']}},'a person can never change someone else’s choice');
 assert.equal(visibleState(hidden,'mom').preferences.featuresByUser,undefined,'another person’s hidden list is private');
 const dad=stateFeatureContext(hidden,'dad'),mom=stateFeatureContext(hidden,'mom');
 assert.equal(dad.on('calendar'),false);assert.equal(mom.on('calendar'),true);
});

test('off means gone from every route, including Kids pages and the Household page when all tabs are off',()=>{
 const off={...featureDefaults(),kids:false};
 const ctx=featureContext({features:off},'mom','parent');
 for(const r of ['kids','kids/hero','kids/new','settings/kids','journal','ai','ai/suggestions','statistics','household','household/meals'])assert.equal(routeAllowed(ctx,r),false,r);
 for(const r of ['today','settings','settings/features','profile','tasks/new','calendar','mine'])assert.equal(routeAllowed(ctx,r),true,r);
 const withMeals=featureContext({features:{...off,meals:true}},'mom','parent');
 assert.equal(routeAllowed(withMeals,'household'),true);assert.equal(routeAllowed(withMeals,'household/expenses'),false);
 // Adult-only features stay adult-only even when the family uses them.
 assert.equal(featureOn({family:{...off,expenses:true},role:'child'},'expenses'),false);
});

// ---- Server delivery: Telegram/Push/reminders/AI read a feature-filtered view; stored data is untouched.
test('kids off removes routines from reminders and AI context, and turning it back on restores them',()=>{
 const d=home({...featureDefaults(),kids:false});
 d.tasks=[{id:'routine',title:'Brush teeth',routine:true,ownerId:'mom',visibility:'family',allowedIds:[],memberId:'mom',memberIds:['mom'],date:'2026-11-12',time:'08:00',repeat:'once',reminders:[10]},
  {id:'chore',title:'Laundry',ownerId:'mom',visibility:'family',allowedIds:[],memberId:'mom',memberIds:['mom'],date:'2026-11-12',time:'08:00',repeat:'once',reminders:[10]}];
 const view=deliveryView(visibleState(d,'mom'),'mom');
 assert.deepEqual(view.tasks.map(t=>t.id),['chore']);
 const keys=()=>pushMessages(d,'mom',{date:'2026-11-12',time:'07:50'},'parent').map(m=>m.key).join(' ');
 assert.doesNotMatch(keys(),/routine/);assert.match(keys(),/chore/);
 assert.equal(d.tasks.length,2,'data is never deleted');
 d.preferences.features.kids=true;
 assert.match(keys(),/routine/);
});

test('calendar hidden by one person stops only that person’s event reminders',()=>{
 const d=home(featureDefaults());d.preferences.featuresByUser={dad:{hidden:['calendar']}};
 d.events=[{id:'dentist',title:'Dentist',ownerId:'mom',visibility:'family',allowedIds:[],memberIds:['mom','dad'],date:'2026-11-12',time:'16:30',repeat:'once',reminders:[10]}];
 assert.ok(pushMessages(d,'mom',{date:'2026-11-12',time:'16:20'},'parent').some(m=>m.key.startsWith('event:dentist')));
 assert.ok(!pushMessages(d,'dad',{date:'2026-11-12',time:'16:20'},'adult').some(m=>m.key.startsWith('event:dentist')));
});

test('journal off keeps one’s own private notes for My space only',()=>{
 const ctx=featureContext({features:{...featureDefaults(),journal:false}},'mom','parent');
 const view=deliveryView({preferences:{features:ctx.family},members,notes:[{id:'own',visibility:'private',ownerId:'mom'},{id:'family',visibility:'family',ownerId:'mom'}]},'mom');
 assert.deepEqual(view.notes.map(n=>n.id),['own']);
 assert.equal(recordFeature('tasks',{category:'maintenance'}),'maintenance');
});

test('server code paths are wired to the registry',()=>{
 const telegram=src('app/cloud/telegram.mjs'),delivery=src('app/cloud/channel-delivery.mjs'),assistant=src('app/cloud/assistant.mjs'),push=src('app/cloud/push.mjs');
 assert.match(telegram,/if\(cmd!=='stop'&&!features\.on\('telegram'\)\)/);
 assert.match(telegram,/telegramCallbackFeature\(payload\.type\)/);
 // Scheduled delivery moved to core (channel-delivery.mjs, Modular Bayit 2.3); Telegram declares its feature there.
 assert.match(delivery,/if\(!visible\.features\.on\(channel\.feature\)\)continue/);
 assert.match(telegram,/feature:'telegram',/);
 assert.match(assistant,/if\(!visible\.features\.on\('ai'\)\)throw fail/);
 assert.match(assistant,/aiTools\.filter\(t=>\{const f=aiToolFeature\(t\.name\)/);
 assert.match(push,/deliveryView\(visibleState\(state,memberId\),memberId\)/);
 assert.doesNotMatch(telegram,/[^(]visibleState\(home\.state,memberId\)[^,]/,'every Telegram read goes through deliveryView');
 assert.doesNotMatch(delivery,/[^(]visibleState\(home\.state,memberId\)[^,]/,'every channel delivery read goes through deliveryView');
});

test('the app gates places, routes, Today, Statistics and links through the registry',()=>{
 const app=src('app/src/App.jsx');
 assert.match(app,/if\(!routeOn\(routePath\)\)return <FeatureOff/);
 assert.match(app,/\.filter\(\(\[key\]\)=>routeOn\(key\)\);/);
 assert.match(app,/widgetOrder=order\.filter\(key=>key!=='ai'&&widgetOn\(a,key\)\)/);
 assert.match(app,/\["features",a\.T\('Features','תכונות'\)/);
 assert.match(src('app/src/statistics-view.jsx'),/statsFeature\(id\)/);
});

// ---- First-run setup (questions → suggestions → connect → done)
import {SETUP_QUESTIONS,questionsFor,suggestFeatures,normalizeFamilyProfile,familyProfileSummary} from '../shared/family-setup.mjs';
import {SETUP_GUIDES} from '../shared/setup-guides.mjs';
test('setup questions skip what does not apply and suggest features with a reason',()=>{
 assert.ok(SETUP_QUESTIONS.length>=12&&SETUP_QUESTIONS.length<=15);
 assert.ok(!questionsFor({who:'couple'}).some(q=>q.id==='kidsUse'));assert.ok(questionsFor({who:'kids'}).some(q=>q.id==='kidsUse'));
 const s=suggestFeatures({who:'kids',kidsUse:'own',money:'bank',insurance:'yes',food:['pantry'],reminders:['telegram'],ai:'no'});
 for(const id of ['today','tasks','calendar','shopping','mine','kids','expenses','insurance','documents','pantry','telegram'])assert.equal(s.features[id],true,id);
 for(const id of ['meals','journal','ai','statistics','maintenance','vouchers'])assert.equal(s.features[id],false,id);
 for(const id of ['kids','expenses','insurance','pantry','telegram'])assert.ok(s.reasons[id]?.en&&s.reasons[id]?.he,id);
 assert.deepEqual(suggestFeatures({}).features,featureDefaults(),'skipping the questions gives the Core 5');
 for(const q of SETUP_QUESTIONS)for(const o of q.options)assert.ok(o[2]&&o[3],q.id+'/'+o[0]);
 for(const [id,g] of Object.entries(SETUP_GUIDES)){assert.ok(g.en&&g.he&&g.why.en&&g.why.he&&g.steps.length,id);for(const step of g.steps)for(const action of step.slice(2))assert.ok(action.link?.startsWith('https://')||action.card||action.route,id)}
});
test('setup answers are validated, parent-only, and summarised for the AI without names',()=>{
 assert.throws(()=>normalizeFamilyProfile({answers:{who:'aliens'}}));assert.throws(()=>normalizeFamilyProfile({answers:{busy:'money'}}));
 assert.deepEqual(normalizeFamilyProfile({answers:{who:'kids',extra:'x'},pending:true}),{answers:{who:'kids'},pending:true});
 const d=home(featureDefaults()),value={answers:{who:'kids'},completedAt:'2026-11-09T10:00:00.000Z'};
 assert.throws(()=>applyChanges(d,[{collection:'preferences',id:'familyProfile',value}],'dad','adult'),/parent/);
 assert.deepEqual(applyChanges(d,[{collection:'preferences',id:'familyProfile',value}],'mom','parent').preferences.familyProfile,value);
 assert.equal(familyProfileSummary({answers:{who:'kids',money:'bank'}}),'Who lives at home? A family with kids · Do you want to follow the family budget? Yes, from our bank and cards');
 const worker=src('app/cloud/worker.mjs');assert.match(worker,/state\.preferences\.familyProfile=\{answers:\{\},pending:true\}/);
 assert.match(src('app/cloud/assistant.mjs'),/familyProfileSummary\(home\.state\.preferences\?\.familyProfile/);
});

test('Connections cards, Today suggestions and Who we pay follow the registry',()=>{
 assert.match(src('app/src/connections-hub.jsx'),/cards=allCards\.filter\(c=>!c\.feature\|\|a\.features\?\.on\(c\.feature\)!==false\)/);// feature per connection: shared/connections.mjs, tests/connections.test.mjs
 assert.match(src('app/src/home-suggestions.jsx'),/item\.kind==='voucher'\?featureOn\('vouchers'\):featureOn\('tasks'\)/);
 assert.match(src('app/cloud/home-suggestions.mjs'),/visible\.features\.on\('vouchers'\)\?await listPrivateVouchers/);
 assert.match(src('app/cloud/providers.mjs'),/if\(!stateFeatureContext\(home\.state,actorId\)\.on\('ai'\)\)/);
 const view=src('app/src/providers-view.jsx');assert.match(view,/a\.features\?\.on\('ai'\)===false\|\|autoAsked/);assert.match(view,/a\.features\?\.on\('ai'\)!==false&&<button type="button" className="control-button who-pay-ai"/);
});

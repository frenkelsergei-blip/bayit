// Connection registry (Modular Bayit, work packages 1.2 and 1.3): Settings › Accounts & connections (concept A) and
// first-run setup's guides come from shared/connections.mjs; live status and panels stay in the client, keyed by id.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CONNECTIONS,CONNECTION_GROUPS,CONNECTION_IDS,connectionProblem,connectionGuides} from '../shared/connections.mjs';
import {EXTRA_CONNECTIONS} from '../shared/extensions/connections.mjs';
import {SETUP_GUIDES} from '../shared/setup-guides.mjs';
import {FEATURE_IDS} from '../shared/features.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..'),src=p=>readFileSync(join(root,p),'utf8');
const both=o=>typeof o?.en==='string'&&o.en.trim()&&typeof o?.he==='string'&&o.he.trim();
const CORE=['ai','telegram','family','maps','google-calendar','riseup','account','storage'];

test('every connection has both languages, a known group, a valid feature and a guide with steps',()=>{
 assert.deepEqual(CONNECTION_IDS.slice(0,CORE.length),CORE,'core connections keep their order');
 assert.equal(new Set(CONNECTION_IDS).size,CONNECTION_IDS.length);
 for(const g of CONNECTION_GROUPS)assert.ok(g.id&&g.icon&&g.tone&&both(g.name),g.id);
 for(const c of CONNECTIONS){
  assert.equal(connectionProblem(c,CONNECTIONS),'',c.id);
  assert.ok(both(c.name)&&both(c.description),c.id+' needs English and Hebrew');
  assert.ok(CONNECTION_GROUPS.some(g=>g.id===c.group),c.id+' group');
  assert.ok(['household','person'].includes(c.manage),c.id+' manage');
  if(c.feature!==undefined)assert.ok(FEATURE_IDS.includes(c.feature),c.id+' feature '+c.feature);
  if(c.group==='about'){assert.ok(both(c.action),c.id+' about rows have one link');if(!c.guide)continue}
  assert.ok(both(c.guide)&&both(c.guide.why)&&c.guide.steps.length,c.id+' guide');
  for(const step of c.guide.steps){assert.ok(both(step[0])&&both(step[1]),c.id+' step');for(const x of step.slice(2))assert.ok(both(x)&&(x.link?.startsWith('https://')||x.card||x.route),c.id+' action')}
 }
 // Cards whose feature is off disappear; children never see the money and personal-calendar cards.
 const by=Object.fromEntries(CONNECTIONS.map(c=>[c.id,c]));
 assert.deepEqual(Object.fromEntries(CONNECTIONS.filter(c=>c.feature).map(c=>[c.id,c.feature])),{ai:'ai',telegram:'telegram',riseup:'expenses'});
 assert.deepEqual(CONNECTIONS.filter(c=>c.adultsOnly).map(c=>c.id).sort(),['google-calendar','riseup']);
 assert.equal(by.account.manage,'person');assert.equal(by.ai.manage,'household');
});

test('concept A: To start has AI, Telegram and Family; optional ones are never in it; no WhatsApp',()=>{
 assert.deepEqual(CONNECTION_GROUPS.map(g=>g.id),['start','more','about']);
 const ids=group=>CONNECTIONS.filter(c=>c.group===group&&!EXTRA_CONNECTIONS.includes(c)).map(c=>c.id);// core rows; extensions come after them
 assert.deepEqual(ids('start'),['ai','telegram','family']);
 assert.deepEqual(ids('more'),['maps','google-calendar','riseup']);
 assert.deepEqual(ids('about'),['account','storage']);
 for(const c of CONNECTIONS){if(c.group==='start')assert.ok(!c.optional,c.id);if(c.group==='more')assert.ok(c.optional,c.id+' is optional')}
 assert.ok(!CONNECTION_IDS.includes('whatsapp'));
 assert.equal(connectionProblem({...CONNECTIONS.find(c=>c.id==='maps'),id:'x',group:'start'},CONNECTIONS),'an optional connection is never counted, so it cannot be in "start"; use "more".');
 // The AI guide opens with "a subscription is not a connection code"; plain words, the technical term only where copied.
 const ai=CONNECTIONS.find(c=>c.id==='ai').guide;
 assert.match(ai.warning.title.he,/מנוי ChatGPT Plus או Claude Pro הוא לא קוד חיבור/);assert.match(ai.warning.title.en,/not a connection code/);
 assert.ok(ai.need.some(([,t])=>t.he==='קוד חיבור (API key)'));
 for(const c of CONNECTIONS)for(const g of [c.guide,c.personal].filter(Boolean))for(const step of g.steps)assert.doesNotMatch(step[0].he,/מפתח API|טוקן|אסימון/,c.id+': plain words in step titles');
 // Every guide in "start" and "more" places its own form (with its check before saving) in one of its steps.
 for(const c of CONNECTIONS.filter(c=>c.group!=='about'&&c.id!=='family'))assert.ok(c.guide.steps.some(s=>s.slice(2).some(x=>x.card===c.id)),c.id+' guide places its own form');
 const tg=CONNECTIONS.find(c=>c.id==='telegram');assert.ok(both(tg.personal)&&tg.personal.steps.length===3&&both(tg.guide.then[0]));
});

test('first-run setup keeps its guides, now read from the registry',()=>{
 for(const id of ['hosting','family','ai','telegram','riseup','maps'])assert.ok(SETUP_GUIDES[id]?.steps.length,id);
 assert.equal(SETUP_GUIDES.hosting,CONNECTIONS.find(c=>c.id==='storage').guide);
 assert.equal(SETUP_GUIDES.family,CONNECTIONS.find(c=>c.id==='family').guide);
 assert.deepEqual(SETUP_GUIDES,connectionGuides());
 for(const [id,g] of Object.entries(SETUP_GUIDES))for(const step of g.steps)for(const x of step.slice(2))if(x.card)assert.ok(CONNECTION_IDS.includes(x.card),id+' opens unknown card '+x.card);
});

test('every core connection has a live status and a panel in the client',()=>{
 const hub=src('app/src/connections-hub.jsx'),block=hub.match(/const CONNECTION_LIVE=\{\n([\s\S]*?)\n\};/)?.[1];
 assert.ok(block,'CONNECTION_LIVE map in connections-hub.jsx');
 const entries=Object.fromEntries([...block.matchAll(/^ '?([a-z-]+)'?:\{status:([\s\S]*?)(?=^ '?[a-z-]+'?:\{status:|(?![\s\S]))/gm)].map(m=>[m[1],m[2]]));
 for(const id of CORE){assert.ok(entries[id],id+' has no status in CONNECTION_LIVE');assert.match(entries[id],/\n  panel:/,id+' has no panel')}
 assert.deepEqual(Object.keys(entries).sort(),[...CORE].sort(),'every client entry is a registry connection');
 // Cards come from the registry; extension panels come from the local panel file; feature and adults-only rules apply.
 assert.match(hub,/const allCards=CONNECTIONS\.filter\(c=>!c\.adultsOnly\|\|adult\)\.flatMap\(c=>\{const live=liveFor\(c\.id\);if\(!live\)return \[\];/);
 assert.match(hub,/const cards=allCards\.filter\(c=>!c\.feature\|\|a\.features\?\.on\(c\.feature\)!==false\),inGroup=/);
 assert.match(hub,/CONNECTION_LIVE\[id\]\|\|.*EXTRA_CONNECTION_PANELS\.find\(p=>p\?\.id===id&&p\.Panel\)/);
 assert.match(hub,/CONNECTION_GROUPS\.find\(g=>g\.id===id\)/);
 // The bar counts only "To start"; every AI setting (usage & credit, recommendations, what AI may read) lives only in
 // בית AI › Settings (one place, 2026-11-11); the AI window and Settings link there.
 assert.match(hub,/ready=start\.filter\(c=>c\.state==='on'\)\.length/);
 assert.doesNotMatch(hub,/<AIUsageSection |BayitAISettings/);
 const aiHub=src('app/src/bayit-ai-hub.jsx');assert.match(aiHub,/<AIUsageSection /);assert.match(aiHub,/<BayitAISettings a=\{a\}\/>/);assert.match(aiHub,/<BayitAINotify a=\{a\}\/>/);
 assert.doesNotMatch(src('app/src/App.jsx'),/<BayitAISettings |<BayitAINotify |<BayitAIButtonSettings /);
 assert.match(src('app/src/ai.jsx'),/a\.go\('ai\/settings'\)/);
 assert.match(src('app/src/extensions/connection-panels.jsx'),EXTRA_CONNECTIONS.length?/^export const EXTRA_CONNECTION_PANELS=\[[\w$,]*\];$/m:/export const EXTRA_CONNECTION_PANELS=\[\];/);
});

test('the local connection file ships empty, and an extra entry is picked up and checked',async()=>{
 if(JSON.parse(src('shared/extensions/installed.json')).length===0)assert.deepEqual(EXTRA_CONNECTIONS,[]);// a copy with extensions has its own
 const scratch=mkdtempSync(join(tmpdir(),'bayit-connections-'));
 try{
  const copy=(n,code)=>{const dir=join(scratch,'copy-'+n);cpSync(join(root,'shared'),join(dir,'shared'),{recursive:true});writeFileSync(join(dir,'shared/extensions/connections.mjs'),code);return import(pathToFileURL(join(dir,'shared/connections.mjs')).href)};
  const extra={id:'signal',group:'more',icon:'ChatCircleDots',tone:'lilac',optional:true,manage:'household',feature:'telegram',
   name:{en:'Signal',he:'Signal'},description:{en:'Fictional test channel.',he:'ערוץ בדיקה בדיוני.'},
   guide:{icon:'ChatCircleDots',en:'Signal',he:'Signal',why:{en:'Test.',he:'בדיקה.'},steps:[[{en:'Open the card',he:'פתחו את הכרטיס'},{en:'Paste the test value.',he:'הדביקו את ערך הבדיקה.'},{card:'signal',en:'Open',he:'פתיחה'}]]}};
  const m=await copy(1,'export const EXTRA_CONNECTIONS=['+JSON.stringify(extra)+'];\n');
  assert.deepEqual(m.CONNECTION_IDS,[...CONNECTION_IDS.filter(id=>!EXTRA_CONNECTIONS.some(c=>c.id===id)),'signal']);
  assert.equal(m.connectionGuides().signal.en,'Signal','its guide reaches first-run setup');
  const bad={...extra,id:'nohebrew',description:{en:'Only English'}};
  await assert.rejects(copy(2,'export const EXTRA_CONNECTIONS=['+JSON.stringify(bad)+'];\n'),/English and Hebrew/);
  await assert.rejects(copy(3,'export const EXTRA_CONNECTIONS=['+JSON.stringify({...extra,id:'ai'})+'];\n'),/already registered/);
  await assert.rejects(copy(4,'export const EXTRA_CONNECTIONS=['+JSON.stringify({...extra,feature:'no-such-feature'})+'];\n'),/features\.mjs/);
 }finally{rmSync(scratch,{recursive:true,force:true})}
});

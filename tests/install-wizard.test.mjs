// Install wizard, concept A (user decision 2026-11-11; docs/install-wizard-design.md, AGENTS.md). The wizard is client
// flow over existing endpoints: no server file changed. These tests pin what keeps existing installations unchanged,
// what keeps it honest, and the one stored marker (preferences.familyProfile.checklist), which goes through the same
// shared state code on both hosts (app/cloud/state.mjs runs in the Cloudflare worker and the Node/Docker host).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankState,applyChanges} from '../app/cloud/state.mjs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const MOM='11111111-1111-4111-8111-111111111111',DAD='22222222-2222-4222-8222-222222222222';
function home(){const s=blankState('h1','Levi',{id:MOM,name:'Mom',he:'Mom',role:'parent',color:'blue'});s.members.push({id:DAD,name:'Dad',he:'Dad',role:'adult',color:'green'});return s}

test('the checklist marker is a parent-only household setting, stored as sent, next to the setup answers',()=>{
 const value={answers:{who:'kids'},completedAt:'2026-11-11T10:00:00.000Z',checklist:{since:'2026-11-11T10:00:00.000Z'}};
 assert.deepEqual(applyChanges(home(),[{collection:'preferences',id:'familyProfile',value}],MOM,'parent').preferences.familyProfile,value);
 assert.throws(()=>applyChanges(home(),[{collection:'preferences',id:'familyProfile',value}],DAD,'adult'),/parent/);
 const dismissed={...value,checklist:{...value.checklist,dismissedAt:'2026-11-12T08:00:00.000Z'}};
 assert.deepEqual(applyChanges(home(),[{collection:'preferences',id:'familyProfile',value:dismissed}],MOM,'parent').preferences.familyProfile.checklist,dismissed.checklist);
 assert.throws(()=>applyChanges(home(),[{collection:'preferences',id:'familyProfile',value:{...value,answers:{who:'aliens'}}}],MOM,'parent'),/setup answers/,'answers stay validated');
});

test('no server file was changed for the wizard: the server still marks only new households as pending',()=>{
 assert.match(src('app/cloud/worker.mjs'),/state\.preferences\.familyProfile=\{answers:\{\},pending:true\}/);
 for(const f of ['app/cloud/worker.mjs','app/cloud/passkeys.mjs','app/cloud/state.mjs','app/host/node-server.mjs','shared/family-setup.mjs'])assert.doesNotMatch(src(f),/checklist|install wizard/i,f);
});

test('households set up before never see the wizard: every entry point needs a new household or its marker',()=>{
 const gate=src('app/src/family-setup.jsx'),card=src('app/src/setup-checklist.jsx');
 // The overlay's wizard stages run only for a new (pending) household, or from the Today card of a household that has the marker.
 assert.match(gate,/resume=\/\[\?&\]setup=start\/\.test\(a\.route\)&&!!a\.data\.preferences\.familyProfile\?\.checklist/);
 assert.match(gate,/wizard=\{!asked&&\(pending\|\|kept\|\|resume\)\}/);
 assert.match(gate,/useEffect\(\(\)=>\{if\(pending\)setKept\(true\)\},\[pending\]\)/);
 // Settings › Features › run setup again keeps the old connect stage.
 assert.match(gate,/\}else if\(stage==='connect'\)\{\n  content=<SetupConnect/);
 // The Today card: cloud, a parent, the marker, not dismissed; hidden until every status is known, and when all are ready.
 assert.match(card,/show=!!a\.cloud&&parent&&!!mark&&!mark\.dismissedAt/);
 assert.match(card,/if\(rows\.some\(r=>r\.s\.state==='wait'\)\|\|invites===null\)return null/);
 assert.match(card,/if\(ready===rows\.length\)return null/);
 // Nothing is fetched for a household without the marker.
 assert.match(card,/useInvitations\(a,show\)/);
 // The connections hub is unchanged unless the wizard asks: only the start section, family first, its own window.
 const hub=src('app/src/connections-hub.jsx');
 assert.match(hub,/function ConnectionsHubContent\(\{app:a,ui,storage,initialOpen='',wizard=null\}\)/);
 assert.match(hub,/const start=wizard\?\[\.\.\.inGroup\('start'\)\]\.sort\(.*\):inGroup\('start'\),more=wizard\?\[\]:inGroup\('more'\)/);
 assert.match(hub,/\{!wizard&&!!about\.length&&<FormSection/);
});

test('first open: only while the setup code is open without Google, and every check is a real probe',()=>{
 const entry=src('app/src/passkey-entry.jsx'),open=src('app/src/setup-first-open.jsx');
 assert.match(entry,/else if\(setup&&!methods\.some\(m=>m\.id==='google'\)\)screen=<FirstOpen T=\{T\}\/>;/);
 assert.match(entry,/const setup=config\?\.registration\?\.setup==='code';/);
 // A fresh request from this page; the database check is the server's own (installation.ready); the browser check is the browser's.
 assert.match(open,/fetch\('\/api\/config',\{cache:'no-store'/);
 assert.match(open,/config\?\.installation\?\.ready===true\?'ok'/);
 assert.match(open,/const support=passkeySupport\(\)/);
 // Nothing reads as passed before its probe ran, and setup can't start until all three passed.
 assert.match(open,/state==='wait'\?T\('Checking…','בודקים…'\)/);
 assert.match(open,/ready=all\.every\(x=>x==='ok'\)/);
 assert.match(open,/else if\(ready\)after=/);
 // The Deploy-button wording waits for the single Worker (5.2): no button path is described as existing.
 assert.doesNotMatch(open+entry,/Deploy to Cloudflare|Variables and Secrets|BAYIT_INSTALL|setupHost==='button'/);
});

test('family members: the existing invitation call, unchanged fields; no link or code is kept anywhere',()=>{
 const people=src('app/src/setup-people.jsx');
 assert.match(people,/post\('\/api\/family\/invitations',\{householdId:a\.data\.householdId,role:card\.role,expiresInDays:7\}\)/);
 assert.match(people,/if\(!await identity\.guard\('family'\)\)return;/,'the 30-minute "it\'s you" check stays in front of invitations');
 assert.match(people,/if\(url\.origin!==location\.origin\)throw/);
 for(const f of ['setup-people.jsx','setup-checklist.jsx','setup-first-open.jsx']){const s=src('app/src/'+f);
  assert.doesNotMatch(s,/localStorage|sessionStorage|indexedDB/,f+' keeps nothing in browser storage');
  assert.doesNotMatch(s,/history\.(push|replace)State/,f+' puts nothing in the address bar')}
 // Only names typed in the window are remembered for the Done screen, never links.
 assert.match(people,/invitedThisVisit\.push\(card\.name\.trim\(\)\)/);
 // On a loopback address phones can't open links, so the window offers the address guide instead of inviting.
 assert.match(people,/if\(loopback\(\)\)return <ConnectionDialog/);
});

test('the sign-in screen keeps its last links above the drawing (live report, item 7)',()=>{
 const css=src('app/src/passkeys.css');
 assert.match(css,/\.bayit-entry-content:has\(>\.pk-foot\)\{padding-bottom:max\(230px,30vh\)\}/);
 assert.match(css,/@media\(max-width:600px\)\{\.bayit-entry-content:has\(>\.pk-foot\)\{padding-bottom:max\(270px,34vh\)\}\}/);
});

test('the wizard checklist uses the concept\'s words: AI helper and Telegram are optional, with time and cost; the live screen keeps its own',()=>{
 const card=src('app/src/setup-checklist.jsx'),hub=src('app/src/connections-hub.jsx');
 for(const t of ['לא חובה · עוד לא מחובר','Optional · not connected','בערך 10 דקות · משלמים לספק לפי שימוש','About 10 minutes · you pay the provider per use','בערך 5 דקות · חינם','About 5 minutes · free','אפשר להתחיל מכל שורה','start with any row','מי גר איתכם? כל אחד מקבל קישור משלו ונכנס עם מפתח גישה משלו.'])assert.ok(card.includes(t),t);
 assert.match(card,/status:\{family:context=>familyWizardStatus\(context,invites\),ai:aiWizardStatus,telegram:telegramWizardStatus\},progress:wizardProgress\(T,listOf\)/);
 // Without the wizard the hub keeps its own progress line and statuses.
 assert.match(hub,/wizard\?\.progress\?wizard\.progress\(\{ready,total:start\.length,left:start\.filter\(c=>c\.state!=='on'\)\.map\(c=>c\.name\)\}\):<>\{T\('Ready: '\+ready\+' of '\+start\.length,'מוכן '\+ready\+' מתוך '\+start\.length\)\}/);
 assert.match(hub,/s=\(wizard\?\.status\?\.\[c\.id\]\|\|live\.status\)\(context\)/);
 assert.ok(!hub.includes('לא חובה'),'the live screen never says optional on To start rows');
});

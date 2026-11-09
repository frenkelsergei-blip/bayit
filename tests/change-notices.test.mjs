// "Changes to things assigned to me" (user request 2026-11-08): recording on the household server, access, grouping
// and wording. Fictional household; no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankState,applyChanges,visibleState} from '../app/cloud/state.mjs';
import {changeBursts,readyChangeBursts,describeChange,CHANGE_QUIET_MS} from '../shared/change-notices.mjs';
import {changeUpdates} from '../app/cloud/reminders.mjs';

const members=[{id:'mom',name:'Maya',he:'מאיה',role:'parent'},{id:'dad',name:'Dan',he:'דן',role:'parent'},{id:'kid',name:'Noa',he:'נועה',role:'child'}];
function home(){
 const s=blankState('home','Fictional household',members[0]);s.members=structuredClone(members);
 for(const m of members)s.profiles[m.id]={name:m.name,he:m.he,locale:m.id==='dad'?'en':'he'};
 const r=(id,x)=>({id,title:id,he:id,ownerId:'mom',visibility:'family',allowedIds:[],repeat:'once',...x});
 s.events=[r('cut',{title:'Haircut',he:'תספורת',date:'2026-11-08',time:'16:40',memberIds:['mom','dad','kid']}),r('secret',{title:'Secret',ownerId:'dad',visibility:'private',date:'2026-11-09',time:'10:00',memberIds:['dad']})];
 s.tasks=[r('bins',{title:'Bins',he:'פחים',date:'2026-11-08',time:'19:00',memberId:'dad',memberIds:['dad']})];
 return s;
}
const edit=(s,collection,id,patch)=>({collection,id,value:{...s[collection].find(r=>r.id===id),...patch}});
const names=id=>members.find(m=>m.id===id)?.name;

test('the server records a notice for each assignee who could see the item, never for the change itself only',()=>{
 let s=home();
 s=applyChanges(s,[edit(s,'events','cut',{date:'2026-11-12'})],'mom','parent');
 const n=s.changeNotices;assert.deepEqual(n.map(x=>[x.recipientId,x.type,!!x.self]).sort(),[['dad','changed',false],['kid','changed',false],['mom','changed',true]]);
 assert.equal(n[0].before.date,'2026-11-08');assert.equal(n[0].after.date,'2026-11-12');assert.equal(n[0].actorId,'mom');
 s=applyChanges(s,[{collection:'events',id:'cut',delete:true}],'mom','parent');
 assert.deepEqual(s.changeNotices.filter(x=>x.type==='deleted').map(x=>x.recipientId).sort(),['dad','kid','mom']);
});

test('only date, time, place, name and assignment changes count; completing a task does not',()=>{
 let s=home();
 s=applyChanges(s,[edit(s,'events','cut',{note:'bring the voucher',durationMinutes:30})],'mom','parent');assert.equal((s.changeNotices||[]).length,0);
 const done=edit(s,'tasks','bins',{});done.value.completions={'2026-11-08':{state:'done',time:'18:00',actorId:'dad'}};
 s=applyChanges(s,[done],'mom','parent');assert.equal((s.changeNotices||[]).length,0,'a completion is not a change to tell about');
 s=applyChanges(s,[edit(s,'events','cut',{location:'Grandma'})],'mom','parent');assert.deepEqual(s.changeNotices.filter(x=>!x.self).map(x=>x.recipientId).sort(),['dad','kid']);
 assert.equal(s.changeNotices[0].after.place,'Grandma');
});

test('a person removed from an item is told "removed"; private items tell no one else; notices are read only by their recipient',()=>{
 let s=home();
 s=applyChanges(s,[edit(s,'events','cut',{memberIds:['mom','kid']})],'mom','parent');
 assert.deepEqual(s.changeNotices.filter(x=>x.recipientId==='dad').map(x=>x.type),['removed']);assert.equal(s.changeNotices.find(x=>x.recipientId==='dad').after,null,'no new details for someone removed');
 s=applyChanges(s,[edit(s,'events','secret',{date:'2026-11-10'})],'dad','parent');
 assert.ok(!s.changeNotices.some(x=>x.itemId==='secret'&&x.recipientId==='mom'),'Dan’s private event tells no one else');
 assert.deepEqual(visibleState(s,'dad').changeNotices.map(x=>x.recipientId),['dad','dad']);
 assert.ok(visibleState(s,'kid').changeNotices.every(x=>x.recipientId==='kid'));
 assert.throws(()=>applyChanges(s,[{collection:'changeNotices',id:'x',value:{}}],'kid','child'),/Unsupported/,'clients cannot write notices');
});

test('quick successive edits are one message, sent after 2 quiet minutes; a move and a move back is no message',()=>{
 const at=(m)=>new Date(Date.UTC(2026,10,8,10,m)).toISOString(),n=(id,m,before,after,type='changed')=>({id,at:at(m),recipientId:'dad',actorId:'mom',collection:'events',itemId:'cut',type,before:{title:'Haircut',date:'2026-11-08',time:before},after:type==='changed'?{title:'Haircut',date:'2026-11-08',time:after}:null});
 const list=[n('a',0,'16:40','17:00'),n('b',1,'17:00','17:30')],t=m=>Date.parse(at(m));
 assert.equal(readyChangeBursts(list,'dad',{now:t(2)}).length,0,'still editing');
 const [burst]=readyChangeBursts(list,'dad',{now:t(3)});assert.equal(burst.key,'change:b');assert.equal(burst.before.time,'16:40');assert.equal(burst.after.time,'17:30');
 assert.equal(changeBursts([n('a',0,'16:40','17:00'),n('b',1,'17:00','16:40')],'dad',{now:t(10)}).length,0);
 assert.equal(changeBursts([n('a',0,'16:40','17:00'),n('c',5,'17:00','18:00')],'dad',{now:t(10)}).length,2,'a later change is its own message');
 assert.equal(readyChangeBursts(list,'dad',{now:t(1)+3*86400000+CHANGE_QUIET_MS}).length,0,'not news after 3 days');
 const [gone]=readyChangeBursts([n('a',0,'16:40','17:00'),n('d',1,'','','deleted')],'dad',{now:t(5)});assert.equal(gone.type,'deleted');assert.equal(gone.before.time,'16:40');
});

test('wording in English and Hebrew',()=>{
 const b=(type,before,after)=>({type,actorIds:['mom'],before:{title:'Haircut',he:'תספורת',kind:'event',...before},after:after&&{title:'Haircut',he:'תספורת',kind:'event',...after}});
 assert.deepEqual(describeChange(b('deleted',{date:'2026-11-08',time:'16:40'}),'en',names),{icon:'🗑️',headline:'Deleted by Maya',title:'Haircut',lines:['Was Sun 8 Nov 16:40']});
 assert.deepEqual(describeChange(b('changed',{date:'2026-11-08',time:'16:40'},{date:'2026-11-12',time:'16:40'}),'en',names),{icon:'✏️',headline:'Moved by Maya',title:'Haircut',lines:['Thu 12 Nov 16:40 (was Sun 8 Nov 16:40)']});
 const he=describeChange(b('changed',{date:'2026-11-08',time:'16:40'},{date:'2026-11-12',time:'16:40'}),'he',id=>members.find(m=>m.id===id).he);
 assert.equal(he.headline,'הועבר על ידי מאיה');assert.equal(he.title,'תספורת');assert.match(he.lines[0],/^יום ה׳, 12 בנוב׳ ב־16:40 \(היה יום א׳, 8 בנוב׳ ב־16:40\)$/);
 assert.equal(describeChange(b('removed',{date:'2026-11-08',time:'16:40'}),'he',id=>'מאיה').headline,'הוסרתם · על ידי מאיה');
 const renamed=describeChange(b('changed',{date:'2026-11-08',time:'16:40',place:''},{title:'Haircut at Lior',date:'2026-11-08',time:'16:40',place:'Lior’s'}),'en',names);
 assert.equal(renamed.headline,'Changed by Maya');assert.deepEqual(renamed.lines,['New name · was Haircut','Place: Lior’s']);
});

test('opt-out, quiet hours (held, then sent) and the person’s own changes',()=>{
 const notice={id:'a',at:new Date(Date.now()-5*60000).toISOString(),recipientId:'dad',actorId:'mom',collection:'events',itemId:'cut',type:'deleted',before:{title:'Haircut',date:'2026-11-08',time:'16:40'},after:null};
 const visible=(prefs,extra=[])=>({profiles:{dad:{notificationPrefs:{quietStart:'22:00',quietEnd:'07:00',...prefs}}},events:[],tasks:[],changeNotices:[notice,...extra]});
 assert.equal(changeUpdates(visible({}),'dad',{time:'12:00'}).messages.length,1);
 assert.equal(changeUpdates(visible({}),'dad',{time:'23:00'}).messages.length,0,'held during quiet hours');
 assert.equal(changeUpdates(visible({}),'dad',{time:'07:00'}).messages.length,1,'sent when quiet hours end');
 assert.equal(changeUpdates(visible({itemChanges:false}),'dad',{time:'12:00'}).messages.length,0,'switched off');
 assert.equal(changeUpdates(visible({itemChanges:false}),'dad',{time:'12:00'}).corrections.length,1,'stale reminders are still corrected');
 const own={...notice,id:'b',recipientId:'dad',actorId:'dad',itemId:'bins',collection:'tasks',self:true};
 const u=changeUpdates(visible({},[own]),'dad',{time:'12:00'});assert.deepEqual(u.messages.map(b=>b.itemId),['cut']);assert.deepEqual(u.corrections.map(b=>b.itemId).sort(),['bins','cut']);
});

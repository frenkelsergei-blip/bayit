import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ISSUERS,issuerOf,sourceOf,issuerKey,issuerOptions,issuerLabel,matchesIssuers,paymentSources,sourceGroups,matchesSources,ownerOfRow,sourceName,monthlyBySource,inferSources,ownerFromLabel,memberNames} from '../shared/payment-sources.mjs';

// Fictional rows only. RiseUp: account = opaque code, cardIssuer = institution id (or, before 0018, the nickname).
const rise=(cardIssuer,kind='card',account='a1b2c3',extra={})=>({source:'riseup',kind,account,cardIssuer,memberId:'daniel',...extra});
const pdf=(source,account,kind,extra={})=>({source,account,kind,...extra});

test('issuers are recognised from RiseUp ids, Hebrew and English names, and the old Leumi Card name',()=>{
 assert.equal(issuerOf('max'),'max');assert.equal(issuerOf('Leumi Card'),'max');assert.equal(issuerOf('לאומי קארד'),'max');
 assert.equal(issuerOf('leumiBank'),'leumi');assert.equal(issuerOf('בנק לאומי'),'leumi');assert.equal(issuerOf('poalim'),'hapoalim');
 assert.equal(issuerOf('isracard'),'isracard');assert.equal(issuerOf('Visa Cal'),'cal');assert.equal(issuerOf('ויזה כאל'),'cal');
 assert.equal(issuerOf('amex'),'amex');assert.equal(issuerOf('מזרחי טפחות'),'mizrahi');
 assert.equal(issuerOf('beinleumi'),'fibi');assert.equal(issuerOf('הבינלאומי'),'fibi');assert.equal(issuerOf('First International'),'fibi');
 // "cal"/"max" inside another word is not an issuer.
 assert.equal(issuerOf('Local market'),null);assert.equal(issuerOf('Maxwell Ltd'),null);assert.equal(issuerOf('Chase Sapphire'),null);
});

test('every issuer has a kind, names in both languages and a mark',()=>{
 for(const i of ISSUERS){assert.ok(['card','bank'].includes(i.kind),i.id);assert.ok(i.en&&i.he&&i.mark&&/^#[0-9A-F]{6}$/i.test(i.bg),i.id)}
 assert.equal(new Set(ISSUERS.map(i=>i.id)).size,ISSUERS.length);
});

test('raw sources: stable keys per import path, never the RiseUp code as digits',()=>{
 const p=sourceOf(pdf('max','4821','card'));assert.deepEqual([p.key,p.kind,p.issuer,p.last4,p.via],['max:4821','card','max','4821','statement']);
 assert.equal(sourceOf(pdf('leumi','0457','card_payment',{cardIssuer:'max'})).key,'leumi:0457');
 const r=sourceOf(rise('max'));assert.equal(r.key,'riseup:a1b2c3');assert.equal(r.last4,null);assert.equal(r.issuer,'max');assert.equal(r.label,null);
 // After migration 0018 the institution and the nickname are separate; before it the nickname replaced the institution.
 const after=sourceOf(rise('max','card','a1b2c3',{accountLabel:'הכרטיס של הילה'}));assert.equal(after.issuer,'max');assert.equal(after.label,'הכרטיס של הילה');assert.equal(after.key,'riseup:a1b2c3');
 const before=sourceOf(rise('הכרטיס של הילה'));assert.equal(before.issuer,null);assert.equal(before.label,'הכרטיס של הילה');assert.equal(before.key,'riseup:a1b2c3');
 assert.equal(sourceOf(rise('מקס של הילה 4821')).last4,'4821');
 assert.equal(sourceOf({source:'manual',memberId:'hila'}).key,'manual:hila');
 assert.equal(sourceOf({source:'manual',memberId:'hila',paymentSource:'max:4821'}).key,'max:4821');
});

test('a RiseUp card and its PDF statement become one card once the ending is known',()=>{
 const rows=[rise('max','card','a1b2c3'),rise('max','card','a1b2c3'),pdf('max','4821','card',{memberId:'hila'}),rise('isracard','card','d4e5f6')];
 let idx=paymentSources(rows);assert.equal(idx.list.length,3);
 idx=paymentSources(rows,[{key:'riseup:a1b2c3',last4:'4821'}]);
 assert.equal(idx.list.length,2);const max=idx.byKey.get('max:4821');assert.deepEqual(max.keys.sort(),['max:4821','riseup:a1b2c3']);assert.equal(max.count,3);
 assert.deepEqual(max.via.sort(),['riseup','statement']);
 // The statement's "Whose card?" beats the RiseUp connector as the default owner.
 assert.equal(max.ownerId,'hila');assert.equal(max.unassigned,false);
 assert.equal(idx.keyOf(rows[0]),'max:4821');assert.equal(idx.keyOf(rows[3]),'riseup:d4e5f6');
 // A nickname with four digits merges by itself.
 assert.equal(paymentSources([rise('max','card','zz',{accountLabel:'Max 4821'}),pdf('max','4821','card')]).list.length,1);
});

test('owners: banks are shared by default, RiseUp cards are unassigned (never the connector) until someone chooses, saved choices win',()=>{
 const rows=[rise('leumiBank','bank','77aa11'),rise('max','card','a1'),pdf('discount','2290','bank',{memberId:'daniel'}),{source:'manual',memberId:'hila'}];
 let idx=paymentSources(rows);
 assert.equal(idx.byKey.get('riseup:77aa11').shared,true);assert.equal(idx.byKey.get('riseup:77aa11').ownerId,null);
 assert.equal(idx.byKey.get('riseup:a1').ownerId,null,'the person who connected RiseUp is not the cardholder');assert.equal(idx.byKey.get('riseup:a1').unassigned,true);
 assert.equal(idx.byKey.get('manual:hila').ownerId,'hila');
 idx=paymentSources(rows,[{key:'riseup:a1',ownerId:'hila'},{key:'discount:2290',ownerId:'daniel',shared:false},{key:'riseup:77aa11',shared:true}]);
 assert.equal(idx.byKey.get('riseup:a1').ownerId,'hila');assert.equal(idx.byKey.get('riseup:a1').unassigned,false);
 assert.equal(idx.byKey.get('discount:2290').shared,false);assert.equal(idx.byKey.get('discount:2290').ownerId,'daniel');
 // A card marked shared belongs to nobody in particular.
 idx=paymentSources(rows,[{key:'riseup:a1',shared:true},{key:'discount:2290',ownerId:'daniel'}]);assert.equal(idx.byKey.get('riseup:a1').ownerId,null);
 const groups=sourceGroups(idx,['daniel','hila']);
 assert.deepEqual(groups.map(g=>[g.id,g.sources.map(s=>s.key)]),[['daniel',['discount:2290']],['hila',['manual:hila']],['shared',['riseup:a1','riseup:77aa11']]]);
 assert.equal(ownerOfRow(rows[0],idx),null);assert.equal(ownerOfRow(rows[2],idx),'daniel');
 // Nobody chose: the RiseUp card sits under Unassigned and its rows belong to nobody yet.
 const plain=paymentSources(rows),g2=sourceGroups(plain,['daniel','hila']);
 assert.deepEqual(g2.map(g=>g.id),['hila','shared','unassigned']);assert.deepEqual(g2.at(-1).sources.map(s=>s.key),['riseup:a1']);
 assert.equal(ownerOfRow(rows[1],plain),null);
});

test('the source filter is OR within the choice and empty means every row (regression: Max missed RiseUp rows)',()=>{
 const rows=[rise('max','card','a1'),rise('max','card','a1'),pdf('max','4821','card'),rise('isracard','card','b2'),pdf('leumi','0457','bank'),{source:'manual',memberId:'hila'}];
 const old=rows.filter(t=>t.source==='max').length,now=rows.filter(t=>matchesIssuers(t,['max'])).length;
 assert.equal(old,1);assert.equal(now,3);
 const idx=paymentSources(rows,[{key:'riseup:a1',last4:'4821'}]);
 assert.equal(rows.filter(t=>matchesSources(t,idx,['max:4821'])).length,3);
 assert.equal(rows.filter(t=>matchesSources(t,idx,['max:4821','leumi:0457'])).length,4);
 assert.equal(rows.filter(t=>matchesSources(t,idx,[])).length,rows.length);
 assert.deepEqual(issuerOptions(rows,'en').map(o=>[o.id,o.count]),[['isracard',1],['max',3],['leumi',1],['manual',1]]);
});

test('an unknown institution (abroad, a wallet, a free nickname) becomes its own neutral source',()=>{
 const rows=[rise('Chase Sapphire','card','zz9'),rise('max','card','m1'),pdf('leumi','0457','bank'),{source:'manual',memberId:'daniel'},rise('Revolut','card','rv')];
 const idx=paymentSources(rows),chase=idx.byKey.get('riseup:zz9');
 assert.equal(chase.issuer,null);assert.equal(chase.label,'Chase Sapphire');assert.equal(sourceName(chase,'en'),'Chase Sapphire');
 assert.equal(sourceName(idx.byKey.get('leumi:0457'),'he'),'בנק לאומי');assert.equal(sourceName({kind:'bank'},'en'),'Bank account');
 assert.equal(issuerKey(rows[0]),'other:chase sapphire');assert.equal(issuerLabel('leumi','he'),'בנק לאומי');
 assert.deepEqual(issuerOptions(rows,'en').map(o=>o.id),['max','leumi','other:chase sapphire','other:revolut','manual']);
});

test('a recorded entry paid with a card or account joins that source without changing its kind',()=>{
 const rows=[pdf('leumi','0457','bank'),{source:'manual',memberId:'hila',payment:'leumi:0457'},{source:'manual',memberId:'hila',payment:'Cash'},rise('max','card','a1')];
 const idx=paymentSources(rows,[{key:'riseup:a1',last4:'4821'}]);
 assert.equal(idx.byKey.get('leumi:0457').kind,'bank');assert.equal(idx.byKey.get('leumi:0457').count,2);
 assert.equal(idx.keyOf(rows[2]),'manual:hila','free text is not a source key');
 assert.equal(paymentSources([...rows,{source:'manual',memberId:'hila',payment:'max:4821'}],[{key:'riseup:a1',last4:'4821'}]).byKey.get('max:4821').count,2);
});

test('rows of a statement card without its number keep their own person',()=>{
 const rows=[pdf('max','',  'card',{memberId:'hila'}),pdf('max','','card'),pdf('max','','card',{memberId:'daniel'})],idx=paymentSources(rows);
 assert.equal(idx.list.length,1);assert.equal(idx.list[0].ownerId,null);
 assert.deepEqual(rows.map(t=>ownerOfRow(t,idx)),['hila',null,'daniel']);
});

test('monthly spending per source follows the merged card',()=>{
 const rows=[{...rise('max','card','a1'),month:'2026-10',spent:1000},{...pdf('max','4821','card'),month:'2026-10',spent:500},{...pdf('max','4821','card'),month:'2026-11',spent:300},{...pdf('leumi','0457','bank'),month:'2026-09',spent:999}];
 const idx=paymentSources(rows,[{key:'riseup:a1',last4:'4821'}]),m=monthlyBySource(rows,idx,['2026-10','2026-11']);
 assert.deepEqual(m.get('max:4821'),[1500,300]);assert.equal(m.has('leumi:0457'),false);
});

// ---- Round 2 (2026-11-10): RiseUp cards are matched to statement cards and nicknames, never to the connector.
const members=memberNames([{id:'sergei',name:'Sergei',he:'סרגיי',role:'parent'},{id:'shani',name:'Shani',he:'שני',role:'parent'},{id:'kid',name:'Noa',he:'נועה',role:'child'}]);
const buy=(date,amount,extra)=>({date,amount,...extra});
test('a RiseUp card takes the ending and owner of the statement card with the same purchases',()=>{
 const r=extra=>({source:'riseup',kind:'card',account:'h1',cardIssuer:'max',memberId:'sergei',...extra});
 const st=extra=>({source:'max',kind:'card',account:'4821',memberId:'shani',...extra});
 const rows=[r(buy('2026-10-03',-41200)),r(buy('2026-10-09',-12900)),r(buy('2026-10-21',-5000)),st(buy('2026-10-03',-41200)),st(buy('2026-10-09',-12900)),st(buy('2026-10-15',-990))];
 assert.deepEqual(inferSources(rows,members),[{key:'riseup:h1',last4:'4821',ownerId:'shani',reason:'statement',matches:2}]);
 const idx=paymentSources(rows,[],{members}),card=idx.byKey.get('max:4821');
 assert.ok(card,'merged into the statement card');assert.deepEqual(card.keys.sort(),['max:4821','riseup:h1']);
 assert.equal(card.ownerId,'shani');assert.equal(card.unassigned,false);assert.equal(card.inferred.last4,'statement');
 assert.equal(ownerOfRow(rows[0],idx),'shani','a RiseUp purchase now belongs to the cardholder, not to who connected RiseUp');
 // A family choice beats the inference.
 assert.equal(paymentSources(rows,[{key:'riseup:h1',ownerId:'sergei'}],{members}).byKey.get('max:4821').ownerId,'sergei');
});
test('statement matching needs two purchases and a clear winner, and never crosses issuers',()=>{
 const r=(acc,iss,...b)=>b.map(x=>({source:'riseup',kind:'card',account:acc,cardIssuer:iss,...x}));
 const st=(acc,who,...b)=>b.map(x=>({source:'max',kind:'card',account:acc,memberId:who,...x}));
 const one=[...r('h1','max',buy('2026-10-03',-100)),...st('1111','shani',buy('2026-10-03',-100))];
 assert.deepEqual(inferSources(one),[],'one shared purchase is not enough');
 const tie=[...r('h1','max',buy('2026-10-03',-100),buy('2026-10-04',-200)),...st('1111','shani',buy('2026-10-03',-100),buy('2026-10-04',-200)),...st('2222','sergei',buy('2026-10-03',-100),buy('2026-10-04',-200))];
 assert.deepEqual(inferSources(tie),[],'two equally good statement cards: no guess');
 const cross=[...r('h1','isracard',buy('2026-10-03',-100),buy('2026-10-04',-200)),...st('1111','shani',buy('2026-10-03',-100),buy('2026-10-04',-200))];
 assert.deepEqual(inferSources(cross),[],'an Isracard account is never matched to a Max statement');
 // Two RiseUp accounts cannot both claim one statement card: the better match wins.
 const both=[...r('h1','max',buy('2026-10-03',-100),buy('2026-10-04',-200),buy('2026-10-05',-300)),...r('h2','max',buy('2026-10-03',-100),buy('2026-10-04',-200)),...st('1111','shani',buy('2026-10-03',-100),buy('2026-10-04',-200),buy('2026-10-05',-300))];
 assert.deepEqual(inferSources(both).map(x=>x.key),['riseup:h1']);
});
test('a nickname gives the ending (four digits) and the owner (a member’s name), and nothing else is invented',()=>{
 assert.equal(ownerFromLabel('הכרטיס של שני',members),'shani');assert.equal(ownerFromLabel("Shani's Max",members),'shani');
 assert.equal(ownerFromLabel('לשני',members),'shani','a one-letter Hebrew prefix');assert.equal(ownerFromLabel('Max 4821',members),null);
 assert.equal(ownerFromLabel('נועה',members),null,'children never own cards');assert.equal(ownerFromLabel('שני וסרגיי',members),null,'two names: no guess');
 const rows=[{source:'riseup',kind:'card',account:'n1',cardIssuer:'max',accountLabel:'מקס של שני 7310',memberId:'sergei'},{source:'riseup',kind:'card',account:'n2',cardIssuer:'isracard',accountLabel:'כרטיס הבית',memberId:'sergei'},{source:'riseup',kind:'card',account:'n3',cardIssuer:'cal',memberId:'sergei'}];
 const idx=paymentSources(rows,[],{members});
 const a=idx.byKey.get('max:7310');assert.equal(a.ownerId,'shani');assert.equal(a.inferred.owner,'nickname');
 const b=idx.byKey.get('riseup:n2'),c=idx.byKey.get('riseup:n3');
 for(const x of [b,c]){assert.equal(x.last4,null,'no digits are made up');assert.equal(x.ownerId,null);assert.equal(x.unassigned,true)}
 assert.deepEqual(sourceGroups(idx,['sergei','shani']).map(g=>[g.id,g.sources.length]),[['shani',1],['unassigned',2]]);
});
test('the server may send inferences from rows the client does not have (statement rows set aside)',()=>{
 const rows=[{source:'riseup',kind:'card',account:'h9',cardIssuer:'max',memberId:'sergei',date:'2026-10-03',amount:-100}];
 const idx=paymentSources(rows,[],{inferred:[{key:'riseup:h9',last4:'4821',ownerId:'shani',reason:'statement',matches:3}]});
 const s=idx.byKey.get('max:4821');assert.equal(s.ownerId,'shani');assert.equal(s.last4,'4821');assert.equal(s.inferred.last4,'statement');
});

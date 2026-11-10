import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnswer,inlineRuns,stripEmoji,answerDirection} from '../shared/answer-format.mjs';

test('the user’s example becomes a lead paragraph and a real list',()=>{
 const b=parseAnswer('Today (Tuesday, 10 November 2026) there are no calendar events. Open tasks:\n- 07:05 done: מי מלח באף לאור\n- 18:00 open, high priority: להגיש פיזיותרפיה');
 assert.deepEqual(b.map(x=>x.type),['p','ul']);assert.equal(b[1].items.length,2);assert.equal(b[1].items[1][0].text,'18:00 open, high priority: להגיש פיזיותרפיה');
});

test('sections: bold title lines, headings, separators, numbered lists and paragraphs',()=>{
 const b=parseAnswer('**היום**\n- 18:00 · **להגיש פיזיותרפיה** · שני\n\n### Anytime\n1. Call the plumber\n2) Book the car\n---\nThat is all.');
 assert.deepEqual(b.map(x=>x.type),['h','ul','h','ol','hr','p']);
 assert.equal(b[0].runs[0].text,'היום');
 assert.deepEqual(b[1].items[0],[{text:'18:00 · ',bold:false},{text:'להגיש פיזיותרפיה',bold:true},{text:' · שני',bold:false}]);
 assert.equal(b[3].items.length,2);
});

test('emoji never reach the app; stray markers are cleaned; nothing is HTML',()=>{
 assert.equal(stripEmoji('✅ Today 🎉 done 👍🏽'),' Today done ');
 const b=parseAnswer('📅 **Plan** 🙂\n- <b>not html</b> *tea*');
 assert.equal(b[0].type,'h');assert.equal(b[0].runs[0].text,'Plan');
 assert.equal(b[1].items[0][0].text,'<b>not html</b> tea');
 assert.deepEqual(inlineRuns('**unclosed'),[{text:'unclosed',bold:false}]);
});

test('lines of one paragraph are joined; blank lines split paragraphs',()=>{
 const b=parseAnswer('First line\nsame paragraph\n\nSecond paragraph');
 assert.equal(b.length,2);assert.equal(b[0].runs[0].text,'First line same paragraph');
});

test('one direction for the whole answer, from its language',()=>{
 assert.equal(answerDirection('✅ היום יש 4 משימות\n- 18:00 · Cancel subscription'),'rtl');
 assert.equal(answerDirection('18:00 Today: מי מלח'),'ltr');
});

test('sections get a kind from their title, a count, and lines split into time, title and person',async()=>{
 const {answerSections,splitItem,sectionKind}=await import('../shared/answer-format.mjs');
 const {lead,sections}=answerSections(parseAnswer('Today there are 4 open tasks\n\n**היום**\n- 18:00 · **להגיש פיזיותרפיה** · שני\n- 18:00 · **Cancel subscription** · Sergei\n\n**בלי תאריך**\n- **להתקשר ליונתן** · שני\n\n**Done**\n- 07:05 · מי מלח באף לאור'));
 assert.equal(lead.length,1);assert.deepEqual(sections.map(s=>[s.kind,s.count]),[['today',2],['anytime',1],['done',1]]);
 const item=splitItem(sections[0].blocks[0].items[0],['שני','Sergei']);
 assert.equal(item.time,'18:00');assert.equal(item.person,'שני');assert.deepEqual(item.runs,[{text:'להגיש פיזיותרפיה',bold:true}]);
 const done=splitItem(sections[2].blocks[0].items[0],['שני']);assert.equal(done.time,'07:05');assert.equal(done.person,null);assert.equal(done.runs[0].text,'מי מלח באף לאור');
 assert.equal(sectionKind('Shopping list'),'shopping');assert.equal(sectionKind('משהו אחר'),'other');
});

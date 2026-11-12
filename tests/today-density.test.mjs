// Today's Cards | List switch (owner's choice 2026-11-12, direction A): the stored preference and both modes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=f=>readFileSync(new URL('../app/src/'+f,import.meta.url),'utf8');
// density.jsx's helpers are plain JavaScript between the imports and the JSX components; load just those.
const helpers=src('density.jsx').split('const prefsOf=')[1].split('// Small "Cards | List" switch')[0];
const {densityPageOf,densityOf,setPageDensity,setDefaultDensity}=await import('data:text/javascript,'+encodeURIComponent('const prefsOf='+helpers));

const household=()=>({preferences:{appearanceByUser:{}}});
const app=(data,user)=>({user,data,update:fn=>fn(data)});

test('Today is its own page for Cards | List',()=>{
 assert.equal(densityPageOf('today'),'today');
 assert.equal(densityPageOf(''),'today');
 assert.equal(densityPageOf('today?customize=1'),'today');
});

test('nobody who never chose sees List: Cards is the default for parents and children',()=>{
 const d=household();
 for(const who of ['daniel','itai'])assert.equal(densityOf(d,who,'today'),'comfortable');
});

test('choosing List on Today is stored for that person and that page only',()=>{
 const d=household();
 setPageDensity(app(d,'daniel'),'today','compact');
 assert.deepEqual(d.preferences.appearanceByUser.daniel.densityByPage,{today:'compact'});
 assert.equal(densityOf(d,'daniel','today'),'compact');
 assert.equal(densityOf(d,'daniel','tasks'),'comfortable','other pages keep their own choice');
 assert.equal(densityOf(d,'hila','today'),'comfortable','another parent is not affected');
 setPageDensity(app(d,'daniel'),'today','comfortable');
 assert.equal(densityOf(d,'daniel','today'),'comfortable','and back to Cards');
});

test('a child can choose too, and it is the child’s own choice',()=>{
 const d=household();
 setPageDensity(app(d,'itai'),'today','compact');
 assert.equal(densityOf(d,'itai','today'),'compact');
 assert.equal(densityOf(d,'daniel','today'),'comfortable');
});

test('List chosen in Settings › Lists also makes Today a list, until Today’s own switch says otherwise',()=>{
 const d=household();
 setDefaultDensity(app(d,'hila'),'compact');
 assert.equal(densityOf(d,'hila','today'),'compact');
 setPageDensity(app(d,'hila'),'today','comfortable');
 assert.equal(densityOf(d,'hila','today'),'comfortable');
 setDefaultDensity(app(d,'hila'),'compact');
 assert.equal(densityOf(d,'hila','today'),'compact','choosing in Settings again resets the page choices, as on every page');
});

test('the header shows Cards | List on Today',()=>{
 const list=src('App.jsx').match(/\[([^\]]*'calendar','tasks','shopping'[^\]]*)\]\.includes\(a\.route/);
 assert.ok(list,'the header route list is where it was');
 assert.match(list[1],/'today'/);
});

test('both modes: Cards tightens Today, List rows are one line, the Ask Bayit AI card is untouched, nothing is hidden',()=>{
 assert.match(src('App.jsx'),/import '\.\/today-density\.css';/);
 const css=src('today-density.css').replace(/\/\*[\s\S]*?\*\//g,'');
 const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,sel,body])=>({sel:sel.trim(),body})).filter(r=>!r.sel.startsWith('@media'));
 assert.ok(rules.length>40);
 for(const r of rules){
  for(const s of r.sel.split(/,(?![^(]*\))/))assert.match(s.trim(),/^html:root(\[data-density=compact\])? \.view-today/,'every rule is scoped to Today: '+s);
  assert.doesNotMatch(r.sel,/today-assistant/,'the Ask Bayit AI card stays as it is (owner, 2026-11-12)');
 }
 const list=rules.filter(r=>r.sel.includes('[data-density=compact]')),cards=rules.filter(r=>!r.sel.includes('[data-density=compact]'));
 assert.ok(list.length>20&&cards.length>20,'both modes have their rules');
 const rowish=/agenda-row|today-task-row|widget-item|widget-note|prio-widget-row|household-home-widget li|today-kids|widget-more|widget-empty \.button/;
 for(const r of rules.filter(r=>/display:none/.test(r.body)))assert.doesNotMatch(r.sel.replace(/\.agenda-row p|household-home-widget li button>svg:last-child|bai-row \.(today-task-meta|bai-meta)/g,''),rowish,'no row, link or button is hidden: '+r.sel);
 assert.match(css,/min-height:44px/,'List rows keep the 44px tap height');
});

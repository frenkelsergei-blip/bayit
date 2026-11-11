// Tests for the "lending" feature module (fixture). Runs the core conformance suite on it, then its own behaviour.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runModuleConformance,household,sampleRecord,PEOPLE} from './feature-module-conformance.mjs';
import {applyChanges,visibleState} from '../app/cloud/state.mjs';
import {moduleById} from '../shared/feature-modules.mjs';
import {recordList} from '../shared/record-paths.mjs';

runModuleConformance('lending');

test('lending: children read family records but cannot add or change them',()=>{
 const m=moduleById('lending');let s=household(m);
 s=applyChanges(s,[{collection:'ext:lending/items',id:'drill',value:sampleRecord(m,'items',{id:'drill'})}],PEOPLE.parent,'parent');
 assert.deepEqual(visibleState(s,PEOPLE.child).extensions.lending.items.map(r=>r.id),['drill']);
 assert.throws(()=>applyChanges(s,[{collection:'ext:lending/items',id:'ball',value:sampleRecord(m,'items',{id:'ball',owner:PEOPLE.child})}],PEOPLE.child,'child'),/parent manages/);
 assert.equal(recordList(s,'ext:lending/items').length,1);
});

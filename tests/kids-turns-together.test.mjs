// Turns vs Together (user report 2026-11-11): only routines that take turns belong on the Turns screen.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routineTurnMode,routineTakesTurns} from '../shared/kids-context.mjs';

test('a routine saved as Together never takes turns',()=>{
 assert.equal(routineTurnMode({routine:true,turnOrder:'none'}),'none');
 assert.equal(routineTakesTurns({routine:true,turnOrder:'none'}),false);
});
test('alternate and fixed take turns; nothing saved means alternate, as before',()=>{
 assert.equal(routineTurnMode({routine:true,turnOrder:'fixed'}),'fixed');
 assert.equal(routineTurnMode({routine:true,turnOrder:'alternate'}),'alternate');
 assert.equal(routineTurnMode({routine:true}),'alternate');
 assert.equal(routineTakesTurns({routine:true,turnOrder:'fixed'}),true);
 assert.equal(routineTakesTurns({routine:true}),true);
});
test('only routines can take turns',()=>{
 assert.equal(routineTakesTurns({title:'Pack bag',turnOrder:'alternate'}),false);
 assert.equal(routineTakesTurns(null),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionRoot,resetSectionScroll} from '../shared/section-navigation.mjs';
test('inner sections retain scroll while module and editor navigation reset it',()=>{
 for(const [from,to] of [['kids','kids/hero'],['kids/hero','kids/parents'],['statistics','statistics/shopping'],['statistics/shopping','statistics/household'],['household/meals','household/expenses'],['calendar?view=month','calendar?view=week']])assert.equal(resetSectionScroll(from,to),false,from+' → '+to);
 for(const [from,to] of [['kids','shopping'],['kids','kids/new'],['kids/edit?id=1','kids'],['tasks','tasks/edit?x']])assert.equal(resetSectionScroll(from,to),true,from+' → '+to);
 assert.equal(sectionRoot('#statistics/shopping?range=7'),'statistics');
});

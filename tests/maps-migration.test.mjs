import test from 'node:test';import assert from 'node:assert/strict';
import {handleMapsAPI} from '../app/cloud/maps.mjs';
import {blankState,applyChanges} from '../app/cloud/state.mjs';
test('a pending Maps migration produces a controlled service error while manual event locations work',async()=>{
 const member={id:'mom',name:'Mom',role:'parent'},state=blankState('h','Home',member),home={id:'h',membership:{member_id:'mom',role:'parent'},state};
 await assert.rejects(handleMapsAPI(new Request('https://bayit.invalid/api/maps/status'),{DB:{prepare(){throw Error('D1_ERROR: no such table: maps_connections')}}},home,'/api/maps/status'),e=>e.status===503&&e.code==='MAPS_SETUP_PENDING'&&!e.message.includes('D1_ERROR'));
 const value={id:'manual-place',ownerId:'mom',visibility:'private',allowedIds:[],title:'Manual location',date:'2026-11-06',time:'18:00',durationMinutes:60,memberIds:['mom'],location:{label:'Library',address:'Manual address'}};
 const next=applyChanges(state,[{collection:'events',id:value.id,value}],'mom','parent');assert.equal(next.events[0].location.label,'Library');
});

import {canSee} from '../app/src/data.js';
export function canEditContent(record,actorId,members=[],kind='event'){
 if(!record||!canSee(record,actorId))return false;if(record.ownerId===actorId)return true;if(record.visibility==='private')return false;
 if(record.editPolicy==='viewers')return true;if(record.editPolicy==='selected')return (record.editorIds||[]).includes(actorId);if(record.editPolicy==='owner')return false;
 return kind==='event'&&members.find(m=>m.id===actorId)?.role==='parent';
}
export function validateEditAccess(record,memberIds){
 if(record.editPolicy===undefined)return;
 if(!['owner','viewers','selected'].includes(record.editPolicy))throw Error('Choose valid edit permissions.');
 const ids=record.editorIds||[];if(!Array.isArray(ids)||ids.some(id=>!memberIds.has(id)))throw Error('Choose valid editors.');
 if(record.visibility==='private'&&(record.editPolicy!=='owner'||ids.length))throw Error('Private records can only be edited by their owner.');
 if(record.editPolicy==='selected'&&(!ids.length||record.visibility==='selected'&&ids.some(id=>id!==record.ownerId&&!record.allowedIds.includes(id))))throw Error('Editors must also be allowed to view the record.');
}

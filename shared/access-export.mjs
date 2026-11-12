export const exportCollections=['tasks','events','notes','shopping','history','purchases','documents','contacts','shoppingLists','taskLists','meals','expenses','pantry','bills','places','insurances','shoppingMarks','favourites','receipts'];
export function accessibleExport(data,actor,visible){
 const result={format:'bayit-accessible-records',version:4,exportedAt:new Date().toISOString(),householdId:data.householdId,householdName:data.preferences?.householdName,memberId:actor,profile:data.profiles?.[actor],members:data.members,preferences:{appearance:data.preferences?.appearanceByUser?.[actor],today:data.preferences?.todayByUser?.[actor]},files:{included:false,note:'File metadata only. Binary attachments and external finance connections are not included.'},restoreSupported:false};
 for(const key of exportCollections)result[key]=key==='insurances'&&data.members?.find(m=>m.id===actor)?.role==='child'?[]:visible(data[key]||[]);
 // Feature modules (v1): the member's own copy of each installed module, built by the server for this member.
 if(data.extensions&&typeof data.extensions==='object')result.extensions=Object.fromEntries(Object.entries(data.extensions).map(([id,slice])=>[id,Object.fromEntries(Object.entries(slice||{}).map(([c,list])=>[c,Array.isArray(list)?visible(list):[]]))]));
 return result;
}

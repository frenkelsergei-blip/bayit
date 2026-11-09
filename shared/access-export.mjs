export const exportCollections=['tasks','events','notes','shopping','history','purchases','documents','contacts','shoppingLists','taskLists','meals','expenses','pantry','bills','places','insurances'];
export function accessibleExport(data,actor,visible){
 const result={format:'bayit-accessible-records',version:4,exportedAt:new Date().toISOString(),householdId:data.householdId,householdName:data.preferences?.householdName,memberId:actor,profile:data.profiles?.[actor],members:data.members,preferences:{appearance:data.preferences?.appearanceByUser?.[actor],today:data.preferences?.todayByUser?.[actor]},files:{included:false,note:'File metadata only. Binary attachments and external finance connections are not included.'},restoreSupported:false};
 for(const key of exportCollections)result[key]=key==='insurances'&&data.members?.find(m=>m.id===actor)?.role==='child'?[]:visible(data[key]||[]);
 return result;
}

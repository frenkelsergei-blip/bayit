let householdId='';
export const configureCloudTransport=id=>{householdId=id||''};
export const cloudHeaders=()=>householdId?{'X-Bayit-Household':householdId}:{};
export const cloudHousehold=()=>householdId;

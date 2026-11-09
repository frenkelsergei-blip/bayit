import {canAccessList,taskFitsList,applyListAudience} from '../../shared/task-lists.mjs';
export const GENERAL_TASK_LIST_ID='general';
export const generalTaskList={id:GENERAL_TASK_LIST_ID,name:'General',he:'כללי',icon:'bayit-activities-notebook',virtual:true};
export function taskListChoices(data,user,record){
 const owner=record?.ownerId||user;
 return (data.taskLists||[]).filter(list=>canAccessList(list,user)&&canAccessList(list,owner)&&(!record?.shoppingListId||taskFitsList(record,list)));
}
export const taskListSharing=(ownerId,list)=>applyListAudience({ownerId},list);

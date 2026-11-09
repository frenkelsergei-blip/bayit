import {FieldTitle} from './field-title';
import {ListChecks as FtList} from '@phosphor-icons/react';
import React from 'react';
import {LockSimple,UsersThree} from '@phosphor-icons/react';
import {Select} from './Select';
import {listAudience} from '../../shared/task-lists.mjs';
import './task-list-choice.css';
import './record-audience.css';

export function TaskListField({a,lists,value,onChange}){
 return <div className="task-list-choice"><label><FieldTitle icon={FtList}>{a.T('Task list','רשימת משימות')}</FieldTitle><Select aria-label={a.T('Task list','רשימת משימות')} value={value} onChange={e=>onChange(e.target.value)}><option value="">{a.T('General (default)','כללי (ברירת מחדל)')}</option>{lists.map(list=><option key={list.id} value={list.id}>{a.lang==='he'?list.he||list.name:list.name} · {list.visibility==='family'?a.T('Family','כל המשפחה'):list.visibility==='private'?a.T('Private','פרטי'):a.T('Selected people','אנשים שנבחרו')}</option>)}</Select></label><small>{value?a.T('The task uses this list’s sharing.','המשימה משתמשת בשיתוף של הרשימה הזאת.'):a.T('Everyday tasks without a dedicated list stay in General. Choose who can see this task below.','משימות ללא רשימה ייעודית נשארות בכללי. בהמשך בוחרים מי יכול לראות את המשימה.')}</small></div>;
}
// assignees: a task in a list keeps the list's audience, so someone assigned who cannot see the list is named here
// (the server refuses that save with the same words; assignment and visibility model, 2026-11-08).
export function TaskListSharing({a,list,assignees=[]}){
 const audience=listAudience(list),names=audience==='family'?a.T('Everyone in this household','כל בני הבית'):[...audience].map(a.name).join(', '),outside=audience==='family'?[]:assignees.filter(id=>!audience.has(id)).map(a.name).join(', ');
 return <section className="task-list-sharing"><h3>{list.visibility==='private'?<LockSimple size={24}/>:<UsersThree size={24}/>} {a.T('Privacy & permissions','פרטיות והרשאות')}</h3><p>{a.T('Shared like ','השיתוף זהה לרשימת ')}<strong>{a.lang==='he'?list.he||list.name:list.name}</strong></p><p>{names}</p>{outside&&<p className="access-audience-note task-list-outside" role="alert"><UsersThree size={17} aria-hidden="true"/><span>{a.T(outside+' can’t see this list. Share the list with them first, or choose another list.',outside+' לא רואים את הרשימה הזאת. שתפו איתם את הרשימה קודם, או בחרו רשימה אחרת.')}</span></p>}</section>;
}

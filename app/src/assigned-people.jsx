import React from 'react';
import {PersonChip} from './person-chip';
import {AvatarStack} from './avatar-stack';
import './assigned-people.css';

// Read-only assignment summaries. Selection controls still use individual chips.
// Callers supply the record's existing people; assignment never grants access.
export function AssignedPeople({ids=[],Avatar,name=id=>id,member=()=>({}),size=32,max=3,label,showNames=false,facesOnly=false,onOpen,className=''}){
 const people=[...new Set((Array.isArray(ids)?ids:[]).filter(Boolean))];if(!people.length)return null;
 /* facesOnly: list rows show only the round photo(s) at the row end; names stay in the accessible label (user decision 2026-11-08). */if(people.length===1&&!facesOnly)return <PersonChip who={people[0]} name={name(people[0])} Avatar={Avatar} tone={member(people[0])?.color||'lilac'} size={size}/>;
 const Tag=onOpen?'button':'span',names=people.map(name).join(', ');
 return <Tag className={'assigned-people'+(onOpen?' assigned-people-link':'')+(className?' '+className:'')} title={names} {...(onOpen?{type:'button','aria-label':(label?label+': ':'')+names,onClick:e=>{e.stopPropagation();onOpen()}}:{})}>
  <span className="assigned-people-faces" aria-hidden={showNames||!!onOpen||undefined}><AvatarStack ids={people} Avatar={Avatar} name={name} size={size} max={max} label={label}/></span>
  {showNames&&<span className="assigned-people-names">{people.map((id,i)=><React.Fragment key={id}>{i>0&&', '}<bdi>{name(id)}</bdi></React.Fragment>)}</span>}
 </Tag>;
}

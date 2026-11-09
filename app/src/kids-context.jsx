import React from 'react';
import {PersonChip} from './person-chip';
import './kids-context.css';

export function KidsContextBar({a,children,child,Avatar,disabled=false}){
 if(!children.length)return null;
 return <div className="kids-context-picker"><span>{a.T('Choose a child','בחירת ילד')}</span><div className="member-chips kids-context-choices" role="radiogroup" aria-label={a.T('Choose a child','בחירת ילד')}>
  {children.map(m=><PersonChip key={m.id} role="radio" who={m.id} name={a.name(m.id)} Avatar={Avatar} tone={m.color} selected={child===m.id} disabled={disabled} onClick={()=>a.setSelectedChild(m.id)}/>)}
 </div></div>;
}
export function KidsActivityHeader({title,subtitle,action}){
 return <header className="kids-activity-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action&&<div className="kids-activity-actions">{action}</div>}</header>;
}

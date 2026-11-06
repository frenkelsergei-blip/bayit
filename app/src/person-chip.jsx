import React from 'react';
import {Check} from '@phosphor-icons/react';
import './person-chip.css';

// One avatar/name pill for assignment, sharing, people filters and profile selection.
// Preserve the existing Calendar pill and its protruding circular portrait in every consumer.
export function PersonChip({who,name,Avatar,selected=false,onClick,tone='lilac',className='',size=44,role,disabled=false,...props}){
 const Tag=onClick?'button':'span',interactive=!!onClick;
 return <Tag {...props} {...(interactive?{type:'button',onClick,disabled,role,'aria-label':name,...(role==='radio'?{'aria-checked':selected}:{'aria-pressed':selected})}:{})} className={'person-chip calendar-person '+tone+(selected?' chosen':'')+(className?' '+className:'')} style={{'--chip-avatar':size+'px'}} title={name}><Avatar decorative who={who} size={size}/><span className="person-chip-name" dir="auto">{name}</span>{selected&&<span className="person-chip-check" aria-hidden="true"><Check size={12} weight="bold"/></span>}</Tag>;
}

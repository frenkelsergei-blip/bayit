// Overlapping avatars (like GitHub contributors): up to `max` faces with a white ring, then a "+N" bubble.
// Hover/long-press shows the names; screen readers get one label.
import React from 'react';
export function AvatarStack({ids=[],Avatar,name=id=>id,size=30,max=4,label,className=''}){
 const list=Array.from(new Set(ids.filter(Boolean)));if(!list.length)return null;
 const shown=list.slice(0,max),extra=list.length-shown.length,names=list.map(name).join(', ');
 return <span className={'avatar-stack '+className} style={{'--stack-size':size+'px'}} title={names} role="img" aria-label={(label?label+': ':'')+names}>
  {shown.map((id,i)=><span className="avatar-stack-item" key={id} style={{zIndex:shown.length-i}} aria-hidden="true"><Avatar who={id} size={size}/></span>)}
  {extra>0&&<span className="avatar-stack-more" aria-hidden="true">+{extra}</span>}
 </span>;
}

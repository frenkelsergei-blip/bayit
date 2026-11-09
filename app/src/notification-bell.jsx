import React,{useId} from 'react';
import {BellFx} from './motion-fx';

// The visible badge is capped; keep that label available to voice control and
// expose the exact unread count separately to assistive technology.
export function NotificationBell({T,unread=0,onClick,className='',size=27}){
 const description=useId(),capped=unread>9;
 return <button type="button" className={className||undefined} aria-label={T('Notifications','התראות')+' · '+(capped?'9+':unread)} aria-describedby={capped?description:undefined} onClick={onClick}><BellFx unread={unread} size={size}/>{capped&&<span hidden style={{display:'none'}} id={description}>{T(unread+' unread notifications',unread+' התראות שלא נקראו')}</span>}</button>;
}

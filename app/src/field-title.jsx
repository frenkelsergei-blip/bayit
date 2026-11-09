// One anatomy for every field title in a form: a real Phosphor icon, then the title.
// The icon matches the same field's row in the read-only details panels.
import React from 'react';
export function FieldTitle({icon:Icon,children,id,className=''}){
 return <span className={'field-title '+className} id={id}>{Icon&&<Icon size={22} weight="regular" aria-hidden="true" focusable="false"/>}<span>{children}</span></span>;
}

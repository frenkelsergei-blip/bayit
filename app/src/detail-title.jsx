// Detail headings (task, event, journal): the real yellow underline sits under the final word only
// (or the last two words when the final one is very short), so a wrapped title never gets a smeared bar.
import React from 'react';
export function DetailTitle({text}){
 const words=String(text||'').trim().split(/\s+/),tail=words.length>1&&words.at(-1).length<=3?words.splice(-2).join(' '):words.pop(),prefix=words.join(' ');
 return <h2><span className="detail-title">{prefix}{prefix?' ':''}<span className="detail-title-tail">{tail}<img src="/assets/generated/title-underline-clean.png" alt=""/></span></span></h2>;
}
